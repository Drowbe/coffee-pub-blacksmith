# Plan: delivery as a first-class dimension of offense

**Status: Implemented (phase 1).** Phases 2-4 not started. Written 2026-08-04.

This plan is scaffolding. When it is implemented, its content is distributed — behaviour to
`architecture-stats.md`, any public surface to `api-stats.md`, history to `CHANGELOG.md`, remaining
work to `TODO.md` — and this file is deleted.

## The problem, stated precisely

The statistics model treats **the attack roll as the unit of offense**. Every offensive number is
derived from `hitTargets` and `missTargets` on an attack event. That is a correct model for a
creature that swings a weapon and an incorrect one for a creature that casts a save spell, and the
failure is not that casters are missing from the numbers. It is that they are counted as flawless.

### The mechanism

midi's `Workflow.WorkflowState_WaitForAttackRoll` does this for any activity with no attack:

```js
if (!this.activity.attack) {
    this.hitTargets = new Set(this.targets);
    this.hitTargetsEC = new Set();
```

For a save-based activity, **`hitTargets` means "was targeted", not "was hit"**. Blacksmith reads it
as the latter. `buildAttackEventFromWorkflow` (`utility-midi-resolution.js:285`) copies it verbatim
and computes `missTargets` as "all targets minus hit targets", which for a save spell is always
empty. `CombatStats._processResolvedAttack` then records one hit per target and zero misses.

**A Fireball on five goblins records five hits and no misses even if all five succeed their saves.**
Hit rate is `hits / (hits + misses)`, so every save spell cast pulls the caster — and the party
average — toward 100%. The more a caster plays to their class, the more they inflate the statistic.

### What is NOT wrong, and was assumed to be

Save-based damage **is** already eligible for damage moments. Because `hitTargets` is non-empty,
`hadHit` is true, the damage buckets as `onHit`, and a Fireball can already take the biggest-hit
record. An earlier reading of this code claimed the opposite; it was wrong, and the plan is not
justified by it. Verify before repeating that claim.

### The fix already exists upstream

midi computes the correct set. In the same file:

```js
this.failedSaves = new Set(this.hitTargets);
```

seeded to every target and then reduced as saves succeed. `workflow.failedSaves` is the set that
actually means "the damage landed as intended". Nothing in Blacksmith reads it.

## The shape

Two orthogonal fields, not a fifth bucket.

| Field | Question it answers | Values |
|---|---|---|
| `delivery` (new) | How was this delivered? | `attack`, `save`, `auto`, `unknown` |
| `bucket` (existing) | Did it land? | `onHit`, `other`, `heal`, `unlinked` |

**Why not a `save` bucket.** `bucket` answers one question — did it land — and a save answers that
same question with a different mechanism (failed save = landed, successful save = resisted). Making
`save` a peer of `onHit` conflates mechanism with outcome, and the next requirement is immediately a
`saveFailedOnHit` combination. Keeping them orthogonal means every existing `bucket` consumer keeps
working untouched, which is the property that makes this landable in stages.

**The rule that falls out:** landed-ness is read from the delivery-appropriate set.

- `delivery: 'attack'` -> landed = `hitTargets`
- `delivery: 'save'` -> landed = `failedSaves`
- `delivery: 'auto'` -> landed = all targets (Magic Missile does not miss)

Moment eligibility becomes "landed by a known mechanism" rather than "hitTargets is non-empty",
which is the same rule stated correctly rather than a new rule.

## Detection

**THIS IS NOT A midi FEATURE.** midi is not a dependency — `module.json` requires only socketlib and
lib-wrapper — so anything that works only with midi installed is a feature half the tables do not
have. The first draft of this plan got that wrong and scoped phase 1 to midi with core dnd5e as a
degraded fallback. Corrected 2026-08-04.

The correction turns on separating two questions that had been treated as one:

| Question | Where the answer lives | Without midi |
|---|---|---|
| How was this delivered? | the **dnd5e activity** | fully available |
| Which targets did it land on? | attack roll, or **save outcomes** | attack: yes. save: not known |

**Delivery is a dnd5e question and is answered in system-native code.** `resolveDelivery(activity)`
lives in `utility-message-resolution.js`, reads a dnd5e activity, and is called by both lanes — the
midi lane hands it `workflow.activity`, the chat lane hands it `flags.dnd5e.activity` off the chat
card. It prefers the structural `attack` / `hasSave` fields when given a live Activity and falls
back to `activity.type`, which is what survives onto a message. Putting this in the midi utility
would have made delivery a midi feature by accident.

**Decided from the activity, never the item.** A spell may have an attack (Fire Bolt), a save
(Fireball), or neither (Magic Missile); `item.type === 'spell'` distinguishes none of them.

**Only the save OUTCOME needs midi**, and where it is unavailable the answer is null, never zero.
`resolveLandedTargets` returns `null` for a save delivery with no known save results. "We do not
know" and "nothing landed" are different claims, and conflating them would silently zero a caster's
contribution on a non-midi table — the exact dishonesty this plan exists to remove. A consumer must
treat null as unknown; phase 2 has to state what it does with it.

**Import direction matters here.** `utility-message-resolution.js` imports `getWorkflowId` from
`utility-midi-resolution.js`, and the midi module's header promises it imports nothing back. So the
shared logic lives in the message module, and the midi module reports raw workflow data
(`failedSaves`, `savedTargets`) for the shared code to interpret. An earlier attempt put
`resolveDelivery` in the midi module and imported it the other way, which closed that cycle.

## Phase 2 is blocked, and the blocker is bigger than this plan

A 2026-08-04 audit found the statistics system is midi-first in several load-bearing places, listed
in `TODO.md`. The relevant one: `successfulOffenseCount` — the MVP's largest scoring term — is
written **only** by midi handlers, so on a non-midi table it is zero for everyone and the offense
component of every MVP score vanishes.

Phase 2 recounts hits from `landedTargets`, and phase 4 gates that same counter on a landed
delivery. Both change midi tables' numbers while non-midi tables keep current behaviour, which
**widens** the split. Doing this plan first would make the system more midi-dependent, not less.

Land the core-lane parity items first. Then phase 2 is a correction applied to one shared path
rather than to the midi one.

## Phases

Each phase is independently landable and independently verifiable.

**Phase 1 — carry delivery.** Add `delivery` to the attack event in
`buildAttackEventFromWorkflow`, derived from the activity. Add `landedTargets` alongside
`hitTargets`, populated from `failedSaves` when delivery is `save`. Change nothing that reads them
yet. *Verify:* cast an attack spell, a save spell and Magic Missile with debug logging on; confirm
each reports the expected `delivery` and a `landedTargets` set that matches what happened at the
table.

**Phase 2 — correct the accuracy statistics.** `_processResolvedAttack` counts hits and misses from
`landedTargets` and its complement rather than from `hitTargets`. This is the phase that changes
existing numbers: a save-heavy caster's hit rate will drop, and that is the bug being fixed.
*Verify:* Fireball five targets, have some succeed; confirm hits and misses reflect the saves rather
than the target count, and that a weapon attack's numbers are unchanged.

**Phase 3 — the caster's statistics.** Saves forced, save DC, and failure rate — the caster's
equivalent of hit rate, and the number that was genuinely absent rather than wrong. New fields on
participant stats, and a readout on the encounter bar once there is something to show.
*Verify:* the new figures against a hand-counted round.

**Phase 4 — MVP fairness.** `successfulOffenseCount` currently increments whenever `hitTargets` is
non-empty, which for a save spell is unconditional. It should increment on a landed delivery.
*Verify:* a caster whose spell is entirely resisted does not score an offense count for it.

## What this does not do

- It does not change what counts toward damage totals. Totals already include every bucket, and
  spell damage has always counted. That part of the model was right.
- It does not add a `delivery` dimension to healing. Healing has no landed-ness question.
- It does not touch the non-midi path beyond labelling it `unknown`.

## Settled: "saves forced" counts CASTINGS, not targets

Decided 2026-08-04. The statistic being built is **"how often did your spells matter"**, so one
Fireball on five goblins is **one** forced save, and it mattered if *any* target failed.

This is not the hit-rate shape and should not be made to look like one. Counting targets would make
a caster's number scale with how many enemies happened to be standing together, which measures the
encounter's geometry rather than the caster. A wizard who catches six goblins in a corridor is not
six times as effective as one who catches a single boss.

The consequence for phase 3: the denominator is castings of save activities, the numerator is
castings where at least one target failed, and a per-target breakdown belongs in the tooltip if
anywhere. Do not aggregate the two into one figure.

## The core lane has its own version of this gap, and it is not midi's fault

`stats-sources.js` defers any attack card whose `attackTotal` is not a number, waiting for the roll
to arrive on a later update. A save or auto activity has no attack roll and never will, so the card
is deferred **forever**: it is never cached, and its damage takes the `unlinked` path.

That happens on every table. A midi table only escapes it when the workflow lane caches the event
first — which is precisely the kind of "works differently depending on what you installed" split
this plan exists to end. Phase 2 must fix the core lane, not merely read a different set in the midi
one.

Phase 1 does not change the gate, because caching those deliveries moves their damage out of
`unlinked` and changes recorded numbers. It only labels the deferral: the log now distinguishes
"no roll yet" from "no roll is coming", with `awaitingRoll: false` marking the cards that will never
resolve through this lane.

## Open question still to settle before phase 2

Whether `hitsChecked` fires at all for a save-only activity, which decides what phase 2 is fixing:

- **If it fires**, an attack event is cached with `hitTargets` = every target, hits and misses are
  recorded from it, and save spells inflate hit rate toward 100%. Phase 2 corrects the counts.
- **If it does not fire**, no attack event is cached, save damage takes the `unlinked` path -- totals
  only, no moments, no contribution to hit rate. Phase 2 is then about *linking* that damage at all,
  which is a larger change than recounting it.

Static reading of midi's bundle supports both: one `WorkflowState_WaitForAttackRoll` returns
`WaitForSaves` directly for a no-attack activity, skipping the `AttackRollComplete` state where
`hitsChecked` is called, while another branch sets `hitTargets` and continues. There are several
Workflow subclasses and the bundle is 1.7 MB; this is not settleable by reading.

**Phase 1's log settles it empirically.** Cast a save spell in a live combat with debug on and read
`hadCachedAttack` in the `MIDI postCheckSaves` line: `true` means the first case, `false` the second.
