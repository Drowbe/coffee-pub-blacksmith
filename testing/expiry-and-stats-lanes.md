# Testing: verification owed for effect expiry and the statistics lanes (2026-09-04/05)

**Audience:** us.

Scope: what is still owed on `EffectsAPI.sweepExpired` now that Blacksmith expires effects itself in
every configuration. Transitional -- see the testing rules in `CLAUDE.md`. **Remove an item when it
passes rather than ticking it, and delete this file when it is empty.** A checklist of ticked boxes
cannot be told apart from one nobody ran.

Results go to the relevant `CHANGELOG.md` entry, not back into this file.

**Setup:** `utilities/apply-test-effect.js`, pasted into a script macro. Select a token, run, pick a
duration. It writes one duration field and nulls the other, stamps `startRound`/`startTurn` so the
remainder can actually tick, and logs what `api.effects.getRemaining()` reports as `{value, unit}` --
which is the answer several of these items are asking for.

---

## Passed, and what that did and did not cover

**Both tick sources work with Times Up disabled** -- confirmed by the author 2026-09-05.

`EffectsAPI.initialize` watches `updateWorldTime` and `updateCombat` as separate listeners, because a
seconds duration moves with the world clock and a rounds duration moves with the combat tracker, and
neither advances the other. They share no path but `sweepExpired`, so each needed proving:

| Source | Result |
|---|---|
| `updateCombat` | A two-round effect reported the correct remainder on each round and was removed after the second. |
| `updateWorldTime` | A 20-second effect out of combat expired when the clock advanced 21 seconds. |

That is the case the whole change turns on: Blacksmith no longer waits for another module to sweep, on
either clock.

Everything remaining needs Times Up *enabled*, which is the configuration where two sweepers exist at
once -- plus the by-hand variant of the world-clock case. Foundry v14 removes the Times Up question
permanently, since it ships no v14 version, so those items have a natural end date; they are live for as
long as the author supports v13.

---

## Owed

- [ ] **Out of combat, world clock moved BY HAND.** Times Up disabled, no combat. Apply the 20 seconds
      preset with "advance the world clock" UNTICKED, then move the world clock yourself -- the clock
      widget, or `game.time.advance(60)` in the console -- and confirm the effect goes.

      The macro-driven version of this passed on 2026-09-05 and is deleted. This is what it did not
      cover: the macro advances the clock in the same call stack that created the effect, moments after
      creating it. A GM nudging the clock ten minutes later is a different sequence -- the hook fires
      into a settled world rather than one mid-write -- and it is the one that actually happens at a
      table.

- [ ] **Exactly one deletion when both are sweeping.** Times Up ENABLED, v13. Apply a 2-round effect,
      advance past it. The effect must disappear exactly once. A `The _id ... already exists` or
      "already gone" line in the console is EXPECTED and is not a failure -- `deleteExpired` re-checks
      the collection and swallows that specific rejection deliberately. What would be a failure is two
      `blacksmith.effects.expired` events for one effect: hook that event and count.

- [ ] **A converted duration still reports in seconds.** Times Up ENABLED, in combat. Apply the
      **20 seconds** preset -- short enough that Times Up rewrites it into rounds and nulls
      `duration.seconds`. `getRemaining()` must come back with `unit: 'seconds'`, not `'rounds'`. The
      macro logs this at creation, so it can be read immediately.

- [ ] **The legacy read is not gated on the module.** Continues from the item above and is the one that
      matters for the v14 upgrade. With that converted effect on the token, **disable Times Up without
      reloading**, then read `getRemaining()` again. It must still report `unit: 'seconds'`. Before the
      2026-09-04 ungating it reported rounds here, which is what a v14 world would have done forever
      with every effect converted under v13.

- [ ] **The control does not convert.** Times Up ENABLED, in combat. Apply the **600 seconds** preset,
      which is above Times Up's short-duration threshold. It must stay a seconds duration, carry no
      `flags.times-up.durationSeconds`, and report `unit: 'seconds'` by the ordinary path rather than
      the recovery one. This is what tells a genuine pass on the item above from one that would report
      seconds regardless.

- [ ] **The inert setting really is inert.** Toggle `enableTimesUpIntegration` either way and confirm
      expiry is unchanged. It gates nothing now; this is confirming that before the author decides
      whether to delete the registration.

---

## Combat statistics: the attack lane stopped yielding (2026-09-05)

Different subject, same failure class, and it needs a live world with **Midi-QOL Integration ON** --
which is the configuration none of it has ever been run in.

- [ ] **One attack, one set of numbers.** Midi ON, in combat. Make one attack that hits. Confirm
      attempts, hits and crits each rise by exactly **one**, not two. Both the core chat lane and the
      MIDI lane now process the attack; `CombatStats._alreadyProcessed` is what stops the second one
      recording, pairing them on the `workflowId` both events carry.

- [ ] **An attack still counts when the MIDI lane says nothing.** Midi ON, in combat, but make an
      attack midi does not produce a workflow for. It must still be counted -- that is the whole point
      of the change, and the failure it prevents is the silent one.

- [ ] **A player's own attack counts once.** Midi ON. A player rolls an attack from their own sheet.
      Exactly one attempt. This is the path that made the `_onAttackRoll` yield worth keeping: its
      socket payload carries no identity the MIDI lane shares, so nothing can dedupe it and it must
      not be forwarded twice.

- [ ] **Damage is unchanged.** Midi ON. Damage totals, biggest hit and the onHit/unlinked buckets must
      read exactly as before this change. The damage half still yields deliberately, so this is
      confirming no accidental effect, not testing new behaviour.

## Not owed here

The macro itself. `utilities/apply-test-effect.js` is a fixture, not a subject -- if it misbehaves, fix
it and re-run the item, rather than recording anything about it in this file.
