# Plan: delivery as a first-class dimension of offense

**Status: Planned.** Nothing implemented. Written 2026-08-04.

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

**Delivery is decided from the activity, not from the item.** A spell may have an attack (Fire
Bolt), a save (Fireball), or neither (Magic Missile), and item type says nothing about which. The
signal is `activity.attack` / `activity.hasSave` on the workflow, which is what midi itself branches
on above.

**midi is the supported path.** `workflow.failedSaves`, `workflow.saves`, and the save DC are all
present on the workflow at `hitsChecked` time.

**Core dnd5e without midi is out of scope for phase 1**, and deliberately so. Save results arrive as
separate chat messages with no reliable correlation back to the damage — the same problem that made
the attack correlation cache necessary, and harder, because a save message identifies a target and
a DC but not the effect that forced it. A non-midi table gets `delivery: 'unknown'` and the current
behaviour, which is honest, rather than a guess that silently corrupts the same statistic this plan
exists to fix. Say so in the architecture doc.

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

## Open question to settle before phase 3

Whether "saves forced" should count targets or castings. Five goblins in a Fireball is one casting
and five saves; a hit-rate-shaped statistic wants the target count, while "how often did your spells
matter" wants the casting count. Decide before building the readout, because the two produce
different numbers from the same fight and there is no converting one into the other afterwards.
