# Plan: invert the module integrations

**Status: In progress -- opened 2026-09-03, step 1 starting.** Live scaffolding.

Blacksmith's three module integrations -- midi-qol, Times Up, Dice So Nice -- are built as a switch
between two implementations rather than as an extra signal on one. This plan inverts that. The target
is not "less midi"; it is that **midi becomes uninteresting**: one lane, one correlation key, one
classifier, and foreign hooks reduced to an optional input that could be deleted without anything
noticing.

**On completion:** the integration contract folds into
`documentation/architecture/architecture-rolls.md` and `architecture-stats.md`, the work items become
`TODO.md` entries, shipped history goes to `CHANGELOG.md`, and this file is deleted. It is not an
archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

**Related:** `plan-statistics-integrity.md` already recorded the symptom from the other end -- "several
statistics are written only by midi-qol handlers, so two tables get different numbers from the same
fight." That finding and this plan are the same defect seen from the data side and the control side.
Whichever closes second should absorb the other's remaining content rather than leaving two plans.

---

## The finding that forced this

On 2026-09-02 a table played nineteen rounds of a forty-four-combatant fight with the dead still taking
turns. `DefeatedManager` had returned early out of its own job because midi-qol *looked* configured to do
it; midi then didn't, because its write goes through `game.combat` and that combat's `active` flag had
been cleared. Nobody marked anything.

**The author's Midi-QOL Integration setting was switched OFF the entire time.** `DefeatedManager` never
consulted it -- it read `game.modules.get('midi-qol')?.active` and then midi's own `ConfigSettings`. The
author had explicitly told Blacksmith not to use midi and Blacksmith handed midi the job anyway.

That is the whole plan in one paragraph: the setting is not the control it appears to be, and the
architecture underneath it is a choice between implementations.

---

## The three categories

The author's framing, adopted as the plan's vocabulary:

| | Meaning | Verdict |
|---|---|---|
| **A** | Leverage the module, if installed, where it adds an enhancement | Correct. The target state. |
| **B** | Leverage the module INSTEAD of ours | **The defect.** Our lane stops; if theirs doesn't run, nothing does. |
| **C** | Use the module to define our data | **The root.** Their identifiers and shapes become ours. |

Audit as of 2026-09-03: 368 lines across 9 files.

**Category B -- 6 sites where our own lane stops:**

    manager-roll-outcomes.js:70    core chat lane returns when the message has midi flags
    stats-sources.js:301           skips cpbTrackDamage entirely
    stats-sources.js:364           returns
    stats-sources.js:825           returns
    stats-player.js:1174           returns
    stats-player.js:1279           branches on it
    api-effects.js                 `yieldDeletion` -- hands effect expiry to Times Up

(The nine other `isMidiIntegrationEnabled()` guards are handler-side and legitimate: they gate the
*extra* lane, not ours.)

**Category C -- the correlation key.** `utility-message-resolution.js:363` and `:530`:

    const key = workflowId ? `midi:${workflowId}` : makeKey(getKeyParts(message));

Our data's identity is midi's identity, with our own scheme as the fallback. Everything downstream --
dedupe, pending-crit maps, socket forwards -- is keyed on that.

**Category C -- the second classifier.** `getCritFumbleFromWorkflow` in `utility-midi-resolution.js`
holds crit logic that stops at natural 20, while `classifyCritFumble` reads the threshold the roll
actually declared. Two answers to "was that a critical", and 2026-09-03 fixed only one.

---

## Why this is safe to do now

**Midi integration is already off in the author's world**, so the six Category B yields are not currently
firing and the core lanes are already the ones running. This is not migrating a live behaviour; it is
deleting paths that are dormant, then re-enabling a much smaller surface. The statistics were never at
risk from the yields themselves.

The hazard is the opposite one: **with both lanes live, cross-lane dedupe must actually work.** The two
trackers key on different prefixes (`rolls:chat:<messageId>` vs `rolls:midi:<workflowKey>`), which never
collide, so removing the yields without fixing the key would double-count every attack. **Steps 1 and 2
are therefore one unit and must not ship apart.**

---

## Steps

- [x] **2. Make the correlation key ours.** DONE 2026-09-03. `makeKey` no longer short-circuits to
      `midi:<workflowId>`; the identity is always attacker/item/activity/targets from `flags.dnd5e`.
      The workflow id stays on the event as an alias.

      **What this exposed, and the lesson for the rest of the steps.** `stats-combat.js:1560` decided
      whether an attack came from the midi lane by SNIFFING THE KEY -- `key.startsWith("midi:")` -- and
      used that to skip crit counting because `RollComplete` counts it. Changing the key made that test
      permanently false, and crits would have been double-counted with integration on. Nothing would
      have thrown. It now asks `attackEvent.workflowId` directly. **Assume more of these exist:
      anywhere the shape of a value carried type information, the sweep can break it silently.**

- [ ] **1. Delete the six Category B yields.** Our lane always runs and is always the source.

      - [x] `manager-roll-outcomes.js:70` -- the rolls lane. DONE 2026-09-03, with the dedupe it
            needed: `_emitAttackOnce` now checks and marks EVERY identity an attack has (chat message,
            midi workflow, our own key) in one tracker, so either lane may arrive first and consumers
            still see exactly one event. The two old trackers keyed in namespaces that could never
            collide, which is why the lanes had to take turns in the first place.
      - [ ] `stats-sources.js:301`, `:364`, `:825` and `stats-player.js:1174`, `:1279` -- the
            statistics lanes. **Not started, deliberately.** Twelve dedupe sites across two trackers
            with no single recording chokepoint: each handler records directly, so this is a
            restructure rather than a guard. Double-counting here writes into persisted campaign
            statistics, where the damage is silent and cumulative. Do this one with a live test
            available, not blind.

- [ ] **3. One crit classifier.** Extract `classifyCritFumble` and its d20 helpers into a leaf module
      both `utility-roll-classification.js` and `utility-midi-resolution.js` can import -- the current
      cycle (classification already imports resolution) is what blocks it. `getCritFumbleFromWorkflow`
      keeps only what is genuinely workflow-shaped: reading midi's own `isCritical`/`isFumble` flags as
      an *additional* signal, never as its own d20 reasoning.

- [ ] **4. Times Up, same inversion.** `api-effects.js` yields effect deletion when Times Up is
      installed. Same shape, same risk: if Times Up doesn't expire it, nobody does. Our sweep should
      always run and be idempotent, with the "already gone" rejection swallowed the way
      `DefeatedManager._syncStatusEffect` now does.

- [ ] **5. Settings copy -- FOR THE AUTHOR, NOT FOR CLAUDE.** The three hints in `lang/en.json` teach the
      wrong model in the author's own product voice: "**use its workflows** for attack, damage, and crit
      detection" and "**let it own** effect expiry". Both describe Category B. Once the code is additive
      the words are wrong as well as harmful. **Claude does not rewrite these** -- `en.json` labels and
      hints are the author's product copy. Propose wording, let the author choose.

- [ ] **6. Write the contract into architecture.** The A/B/C distinction and the "never yield your own
      job" rule belong in `architecture-rolls.md` and `architecture-stats.md`, not only in Ground Rule 8,
      because the next person to add an integration will be reading architecture. Then delete this plan.

---

## The invariant to preserve

**Blacksmith's lane always runs. A foreign module can only add to what we already know, never replace
it, and never be the reason we did nothing.** If that holds, the integration settings become preferences
rather than safety valves, and no future session can reintroduce this by reaching for the obvious shape
-- which is exactly what happened on 2026-09-03, hours after the incident was diagnosed, by someone who
had the evidence in front of them.
