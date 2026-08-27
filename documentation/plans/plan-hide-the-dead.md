# Plan: Hide Dead and Skip Dead

**Status: Planned -- the list half is partly built, the canvas half is not started.** Live scaffolding,
moved out of `TODO.md` 2026-08-27 because the mechanism was settled by argument and the reasoning is what
stops it being re-proposed: dim rather than hide, two rejected alternatives with their reasons, and a
verified finding that the dead do not block movement in dnd5e.

**On completion:** the mechanism folds into `documentation/architecture/architecture-combat.md` or the
combat bar's architecture doc, the work items become `TODO.md` entries, shipped history goes to
`CHANGELOG.md`, and this file is deleted. It is not an archive.

Note (2026-08-27): part of the premise has changed under it. Blacksmith now marks an NPC combatant defeated
when its hit points reach zero (`scripts/manager-defeated.js`), so "what counts as dead" has one answer in
the code where this plan assumed two. Re-read the "What counts as dead" section against that before
building.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The feature
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-menubar.js`, `scripts/combat-tracker.js`, `scripts/manager-combatbar.js`
- **Two halves.** The **list** half is settings `menubarHideDead`, `menubarSkipDead`, `combatTrackerHideDead` with filtering logic — dead combatants stop cluttering the menubar and tracker, and turn order skips them. The **canvas** half is a toggle on the encounter bar that hides the dead tokens on the map itself. Same trigger, different mechanism; do them as one change so one notion of "dead" serves both.

- **Canvas half — requirements (author, 2026-08-02/03)**:
  - Survives reload.
  - Combatants stay in the encounter, so end-of-combat XP still counts them. Hiding is never removing.
  - **Manual, not automatic**: a button on the encounter bar (`manager-combatbar.js`). Nothing hides a token on its own.
  - One press toggles all dead tokens' visibility, for the GM *and* the players alike.
  - Hidden tokens must not be clickable or selectable.
  - **Scoped per scene**, and **combat ending auto-shows them** — the corpses have to come back so they can be looted or cleared away.

- **Why it exists (author, 2026-08-03)**: not tidiness. Corpses swallow clicks and targeting meant for the living, and a client feels slower with ~20 dead tokens on the canvas. Path blocking was originally listed too and has since been ruled out — see below — so the case now rests on interaction, plus a performance claim that is still unmeasured.

- **Mechanism (author, 2026-08-03): dim, do not hide.** A scene flag is the toggle; each client derives the effect from it — for every dead NPC token, drop `mesh.alpha` and set `interactive = false`, re-applied on `canvasReady` and whenever combat or the flag changes.

  Dimming rather than hiding is the better call for three reasons. It **keeps the corpse as information** — where the body fell matters for looting and for the narrative. It **treats the GM and players identically by construction**, which was the requirement every hiding approach struggled with. And because the effect is client-side and *re-derived* from the flag rather than stored, it mutates no token document: nothing to restore, no position loss, no interference with tokens the GM had already concealed.

  So the toggle is "the dead stop getting in the way", not "the dead disappear".

  Rejected, with reasons, so they are not re-proposed:
  - **Token `hidden` flag** — shows at half alpha to the GM by design, so it never satisfies "both GM and players", and it collides with tokens the GM had deliberately concealed; untoggling would reveal them.
  - **Move to an off-map grave zone** — destroys the position, which is the thing worth keeping. Restoring means stashing coordinates and hoping nothing interrupts the round trip, and moving tokens revalidates collision and drags any light source along, so a pile of corpses off the map edge can change what the living can see.

  Honest limitation either way: the token is still present for targeting macros and AoE template maths. Dimmed, not absent — which is correct, since it is still in the encounter.

- **What counts as dead (author, 2026-08-03)**: the combatant `defeated` flag **or** HP <= 0 — either alone qualifies — **and only for NPCs**. A player token is never hidden, whatever its state. A downed PC is dying, not dead: the party has to see where they fell to reach them, and hiding a body the party is trying to revive would be actively harmful. Use `!actor.hasPlayerOwner` for the NPC test, which is the same predicate the party-stats code uses, and read it from `token.actor` so unlinked tokens resolve their synthetic actor rather than the prototype.
  - Consequence worth being deliberate about: a player-owned companion, familiar, or summon is an NPC by intuition but player-owned by ownership, so this rule leaves dead ones on the map. That is the safe default — never hiding something a player has a stake in — but if a table finds dead summons cluttering, the fix is a narrower NPC test, not an exception carved into the toggle.
  - **Guard the HP read.** A combatant's actor may have no `system.attributes.hp` at all — a dnd5e `group` actor can sit on the canvas and join combat, and Foundry does not prevent it (see `architecture-encounter.md`). It also passes `!actor.hasPlayerOwner`, so it classifies as an NPC and reaches the dead test. No hit points means not dead, and an unguarded read here throws inside a canvas hook.
- **State**: a scene flag, cleared on combat end. A scene flag is world data, so updating it propagates to every client on its own — no socket, and the players' canvases follow the GM's button press for free. `deleteCombat` / combat end clears it, which is what makes the corpses reappear for looting.

- **Dimming solves the interaction half and does nothing for the performance half.** Worth stating plainly, because with path blocking ruled out the interaction half is now most of the case for the feature. `interactive = false` genuinely fixes it — a dead pile stops swallowing clicks and targets meant for the living. But a dimmed token still renders, and alpha blending is marginally *more* work than opaque, so if the twenty-corpse slowdown is real and caused by rendering, this will not touch it.

  **Measure before treating that as unfinished business.** Twenty tokens is not many; Foundry handles hundreds. A client that drags at twenty dead NPCs is more likely paying for their token effects, health bars, auras, or a module doing per-token work than for the sprites. `enablePerformanceMonitor` is already in the module: get a number with the corpses present, delete them, get another, and let the gap say whether rendering is implicated at all. If it is, a second "fully hide" mode can be added later on the same flag — but do not build it speculatively.

- **The three collision complaints, and which the mechanism actually closes (author, 2026-08-03: "blocking their path, getting targeted, clicked on")**:
  - **Clicked on** — closed by `interactive = false`. The corpse stops swallowing clicks meant for the living token beneath it.
  - **Getting targeted** — closed for click and hover targeting by the same flag. *Not* closed for macros or AoE templates that enumerate tokens in an area; those read documents, not interactivity. Probably fine, since a dimmed corpse is still in the encounter, but it is the one gap.
  - **Blocking their path** — **the ruleset does this, not Foundry, and it already exempts the dead.** Verified against v13 core and dnd5e 5.2.5:
    - Core constrains movement by **walls and movement cost only** — `Token#constrainMovementPath(waypoints, {ignoreWalls, ignoreCost})` (`client/canvas/placeables/token.mjs:2689`), and `checkCollision(type: "move")` polls the wall polygon backend (`:2545`). Core tokens never block each other. The GM toggle in the token tools ("Unconstrained Movement", ghost icon) sets exactly `{ignoreWalls, ignoreCost}` (`:4434`) — walls and cost, not tokens.
    - dnd5e adds the token blocking, in `TokenLayer5e.isOccupiedGridSpaceBlocking()`. It blocks only when the occupier is a **creature**, only when **dispositions differ** (allies never block), and **not at all** when the occupier carries a status in `CONFIG.DND5E.neverBlockStatuses` — which is populated from any status effect declaring `neverBlockMovement: true`, namely **`incapacitated`, `dead`, and `ethereal`**.

    **Confirmed by the author 2026-08-03: the dead do not block, the living do.** So path blocking is not a corpse problem and this feature does not need to solve it — living creatures blocking each other is dnd5e enforcing the rule correctly. **Do not design around it.**

- **Remaining open questions**:
  1. How dim is dim? Enough to read as "out of play" without losing where the body is. One value, not a setting, unless play proves otherwise.
  2. Per scene is settled. Whether an already-dimmed pile should re-dim if combat restarts on the same scene is not.
- **How to verify**: kill an NPC mid-combat and press the button. It dims on the GM's *and* a player's client, at the same alpha, and cannot be clicked or box-selected on either — try clicking a living token standing under the corpse and confirm the living one is selected. Reload both clients: still dimmed. End combat: it returns to full alpha and normal selection on its own, and XP still counts it. Press the button again with combat over and confirm nothing breaks.
  Then the case the NPC rule exists for: drop a **PC** to 0 HP, press the button, and confirm the PC stays at full alpha and fully selectable — and that marking that PC `defeated` does not dim it either.
  Finally, confirm nothing was mutated: after a full toggle cycle, a dead NPC that the GM had separately marked `hidden` is still `hidden`, and no token has moved.
- **Related**: the blood-splatter item above notes its dead-state treatment ties into this — settle this first so both use one definition of dead.
