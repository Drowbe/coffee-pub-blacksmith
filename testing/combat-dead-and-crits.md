# Testing: verification owed for the dead-combatant and crit work (2026-09-02/03)

**Audience:** us.

Scope: everything staged during the dead-combatants-take-turns session. Transitional -- see the testing
rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this file when it
is empty.** A checklist of ticked boxes cannot be told apart from one nobody ran.

Results go to the relevant `CHANGELOG.md` entry, not back into this file.

---

## Status: NONE of this has been exercised. Be precise about that.

The live incident that started this work -- a nineteen-round, forty-four-combatant fight where the dead
kept taking turns and Crier announced nothing -- **was resolved by a state change, not by any code here.**
Setting `active: true` back on the Combat document brought Crier's cards back on unpatched production code,
with none of these changes loaded. The Crier session confirmed that isolation on 2026-09-03.

So the honest claim is *"we found what broke it and stopped it recurring"*, not *"we fixed it"*. Every item
below is hardening against a recurrence and **not one line of it has run in a world.**

One part of the original symptom is NOT explained by the state change and does still need this code: a
player-owned NPC at zero hit points. Restoring `active` lets midi-qol resume writing `defeated` for the
creatures it damages, but midi applies *unconscious* rather than dead to anything player-owned, and nothing
retroactively marks a corpse that died while the flag was clear. The reconcile sweep and the unconditional
writes are what close those, and they are unproven.

---

## The cheap reproduction (use this, not the live world)

Proposed by the Crier session and adopted: **a small combat with `active: false` and a couple of turn
advances reproduces the whole class**, without dragging a nineteen-round world state around. Do not copy
production session data into dev to test this.

Setup, once, for most of what follows:

1. New scene, new combat, four combatants: two plain NPCs, one NPC owned by a player (a summon), one PC.
2. Roll initiative for all four and start the combat.
3. `game.combats.get(<id>).update({ active: false })` in the console.

---

## Owed

- [ ] **The reconcile sweep marks combatants that were already dead.** With the combat set up as above,
      set both plain NPCs and the player-owned NPC to 0 hit points, then reload. Expect
      `Defeated: Reconciled existing combatants` in the console with a count, and all three marked --
      **the player-owned one especially**, since that is the case midi never marks and no GM presses the
      skull for. The PC must NOT be marked.

- [ ] **A death mid-combat marks without a reload.** Same setup, damage one NPC to zero during play.
      Expect the field and the overlay both, and `Defeated: <name> marked at 0 hit points` with the
      `field:`/`status:` detail line.

- [ ] **Healing above zero unmarks only our own mark.** Heal a Blacksmith-marked NPC above zero: the mark
      comes off. Mark a second NPC with the tracker's skull by hand at full health, then heal it: it stays
      marked. This is the `autoDefeated` flag doing its job.

- [ ] **No unsuppressable duplicate-id line where it can be avoided.** Kill an NPC with midi-qol active and
      watch the console. One `The _id [dnd5edead...] already exists` line is ACCEPTED and not a failure --
      see the header of `manager-defeated.js`. What would be a failure is an uncaught rejection out of
      `_deleteDocuments`, which is what the delete guard is for: heal a marked NPC on two connected clients
      at once and expect no `ActiveEffect <id> does not exist!`.

- [ ] **`canStillFight` no longer resurrects a GM-marked corpse.** With `active: false` still set, mark an
      NPC defeated with the tracker skull, then use the combat bar's add-combatants action. The marked NPC
      must NOT be offered or added. This failed before the consolidation and is the sixth thing the null
      broke.

- [ ] **The bar and the tracker agree.** With three dead of four, confirm the combat bar's skulls and the
      Graveyard list name exactly the combatants the tracker skips. Any disagreement here is the whole bug
      class returning.

- [ ] **"Create Combat" does not fork a fight.** With `active: false` set on a combat that owns the current
      scene, press the menubar's create-combat action. It must ADD to the existing combat, not create a
      second one. Check `game.combats.contents.length` before and after.

- [ ] **Combat statistics survive a reload with `active: false`.** Accumulate some damage and kills, set
      `active: false`, reload, then close the tab. Reopen and confirm the combat's statistics are intact
      rather than reset to defaults. Expect `Combat Stats | Refused to flush unstamped memory over a
      stamped combat flag` in the console if the guard fires. **This is the one item where a failure loses
      real data, so do it in a scratch world.**

- [ ] **An async hook rejection names itself.** Register a throwing async callback through `HookManager` and
      confirm the console reports `Hook callback error in <hook> (async, <context>)` rather than a bare
      uncaught rejection, and that other callbacks on the same hook still run.

- [ ] **Criticals honour a widened range.** Give a character an Improved Critical style 19-20 threshold and
      roll a 19 on an attack. Expect a critical in the roll card, the cinema overlay, the combat statistics,
      and the `blacksmith.rolls.*` payload (`isCritical: true`, `critMode: 'system'`). Then roll a 19 on a
      plain skill check with no threshold and expect NOT a critical (`critMode: 'natural'`). The second half
      matters as much as the first -- it is what proves the serialized-roll path reads a real threshold
      rather than inventing one.

- [ ] **Crits still fire through a socket.** A player rolls the widened-threshold attack on their own
      client. The GM client must report the same verdict -- this is the serialized path, and it is the one
      most likely to silently fall back to nat-20-only.

---

## Not owed here

Turn advancement itself. Whether Blacksmith syncs core's `skipDefeated` from its own setting or skips in
its own `nextTurn` wrapper is undecided by the author as of 2026-09-03, so there is nothing to verify yet.
The Crier session confirmed Crier derives no "next" of its own -- it announces `combat.combatant`, whatever
core hands it -- so whichever route is taken, the cards follow automatically and need no separate test.
