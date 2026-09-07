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

**One attack, one set of numbers: PASSED 2026-09-06**, with Midi-QOL Integration ON and measured with
`utilities/stats-snapshot.js` rather than read off a card. One swing that hit produced
`attempts +1, hits +1, hitRecords +1, damageDealt +9`, and the log shows both lanes running with only
one recording: a single `OffenseCount +1 (chat)`, and `MIDI hitsChecked resolved` present but not
counted.

**It failed the first time and that is the useful half.** The same test on the first run gave +2 on all
three. `CombatStats._alreadyProcessed` paired the lanes on `event.messageId`, a field neither event
carries -- both call it `attackMsgId` -- so the guard fell through to `workflowId`, which the lanes
format differently (`ChatMessage.<id>` against the raw flag). `_countSuccessfulOffense` had the same
defect keyed on the correlation key, whose namespaces also never collide. **Nothing threw, the numbers
simply doubled**, which is exactly why this is measured with a macro and not by looking.

**Damage, one attack one target: PASSED 2026-09-06.** A 13-damage roll produced `damageDealt +13` with
both lanes visibly running -- `Damage Resolved: damageTotal: 13` from the core lane and `MIDI damage
processed: amount: 13` from the other -- and only one recording.

**It also failed first, and the second failure was underneath the first.** The initial run gave +24 for
a roll of 12. The two lanes decorate the target differently, the core lane producing the ACTOR uuid
(`Scene.<s>.Token.<t>.Actor.<a>`) and the MIDI lane the TOKEN uuid, so the scopes never matched. Under
that, the core lane was not producing a token uuid at all -- it kept one only when `fromUuid` returned a
TokenDocument, and dnd5e writes actor uuids into `flags.dnd5e.targets` -- so it fell back to
`targetActorIds`, the BASE actor id, which is both unpairable and shared by every copy of a monster.

**Three times in one session two lanes described one thing with differently-decorated identities**:
message id, workflow id, target uuid. Any identity that crosses the lanes is normalised before
comparison, never after.

**Several attacks from one activity: PASSED 2026-09-06**, and reconciled against the chat cards rather
than against the code. Scorching Ray at two targets produced `attempts +2, hits +2, hitRecords +2,
damageDealt +12`. The cards show two separate messages -- attack 19 for 7 damage, attack 13 for 5 -- and
each target's hit points moved by its own ray's amount. Seven and five is twelve. Every recorded number
maps to something visible on screen, which is the standard worth holding for a statistics change.

**TWO THINGS IT DID NOT TEST**, recorded because at first glance it appeared to test both.

**It did not test over-collapsing.** Two attacks sharing ONE chat message would be swallowed by the
per-message guard, and that failure loses real data while no total ever looks wrong -- the harder of the
two to notice. The rays carried distinct message ids, so the guard was never put in that position. dnd5e
posts one card per activity use, which makes the case hard to reach and correspondingly hard to spot if
it ever arrives. Not currently reproducible; noted so nobody reads the Scorching Ray result as covering
it.

**It did not test one attack roll against two targets.** Midi does this when several tokens are targeted
and one d20 is checked against each AC, and it is the case the per-target damage scope was written for.
Each ray rolls separately, so this is untouched. Worth a single weapon swing at two targeted tokens if
the opportunity arises; not worth engineering, since the scope is proven for one target and for several
messages and the untested case sits between two that pass.

The items left need numbers watched rather than a symptom observed.

- [ ] **A player's lifetime damage rises once.** Midi ON, a player character attacking. Read Total
      Damage in the player statistics before and after one swing. The combat totals are proven; the
      player lane logged its intended update twice in the 2026-09-06 run with identical before-values,
      which reads as one application but is not conclusive from a log alone.

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

## Not owed here

The macro itself. `utilities/apply-test-effect.js` is a fixture, not a subject -- if it misbehaves, fix
it and re-run the item, rather than recording anything about it in this file.
