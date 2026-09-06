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

Different subject, same failure class.

**Run with Midi-QOL Integration ON, 2026-09-05.** A combat was fought, an NPC killed, a new round begun,
and **the dead combatant did not take a turn** -- which is the whole reason this work exists, confirmed
in the configuration that caused the original incident. One `dnd5edead0000000 already exists` error
appeared; that is the known status-effect race, addressed below, and it did not prevent the mark.

The items left are the ones that run needs to be repeated to measure, since they need numbers watched
rather than a symptom observed.

- [ ] **One attack, one set of NUMBERS.** Midi ON, in combat. Make one attack that hits, then read
      attempts, hits and crits on the statistics card. Each must rise by exactly **one**, not two. Both
      the core chat lane and the MIDI lane now process the attack; `CombatStats._alreadyProcessed` is
      what stops the second one recording, pairing them on the `workflowId` both events carry.

      **This is NOT covered by "crits worked with midi on" (author, 2026-09-06).** That confirmed
      crit DETECTION -- the classifier reaching the right verdict through the MIDI lane, which is the
      unification of the two classifiers and is genuinely proven. It says nothing about how many times
      the verdict was RECORDED, and double-counting is the whole risk here. A crit counted twice looks
      exactly like a crit counted once at the moment it fires; the difference is only visible in the
      running totals.

- [ ] **An attack still counts when the MIDI lane says nothing.** Midi ON, in combat, but make an
      attack midi does not produce a workflow for. It must still be counted -- that is the whole point
      of the change, and the failure it prevents is the silent one.

- [ ] **A player's own attack counts once.** Midi ON. A player rolls an attack from their own sheet.
      Exactly one attempt. This is the path that made the `_onAttackRoll` yield worth keeping: its
      socket payload carries no identity the MIDI lane shares, so nothing can dedupe it and it must
      not be forwarded twice.

- [ ] **No red toast when something dies.** Midi ON. Kill an NPC and watch the notification area, not
      just the console. There must be no `The _id [dnd5edead0000000] already exists` error.

      That toast appeared at the author's table on 2026-09-05 and is the reason
      `DefeatedManager._syncStatusEffect` now waits 150ms and re-reads the actor before applying the
      status: whoever else is applying it has landed by then, and we do nothing. **Verify the mark still
      happens** -- the token gets its skull and the combatant is skipped -- since the fix trades
      immediacy for quiet and the overlay is the half that waits. If the toast still appears, the delay
      is too short rather than wrong.

- [ ] **Copied monsters are named individually in the statistics.** Put four copy-pasted tokens of one
      monster on the canvas -- rename them if they do not auto-name -- and have them attack and be
      attacked. Every hit line, the biggest hit and the MVP entry must name the TOKEN ("Patch", "Tusk")
      and not the prototype four times over ("Bandit").

      This is the fix for what was reported as "damage is applying to all copies" on 2026-09-06. It was
      not: damage was measured and stays isolated. The statistics named every copy by the base actor,
      so damage spread across a group read as damage landing repeatedly on one of them. Attacker names
      come from the new `attackEvent.attackerTokenId`, target names from the token document.

      Same setup as Squire's token-switching test, which passed live on 2026-09-06 -- so if four copies
      are already on the canvas for that, this costs one extra glance at the statistics card.

- [ ] **Damage is unchanged.** Midi ON. Damage totals, biggest hit and the onHit/unlinked buckets must
      read exactly as before this change. The damage half still yields deliberately, so this is
      confirming no accidental effect, not testing new behaviour.

## Not owed here

The macro itself. `utilities/apply-test-effect.js` is a fixture, not a subject -- if it misbehaves, fix
it and re-run the item, rather than recording anything about it in this file.
