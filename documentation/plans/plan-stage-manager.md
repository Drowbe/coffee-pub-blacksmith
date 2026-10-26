# Plan: the Stage Manager, one place to see and move a split party

**Status: In progress -- slice 1 built, not yet seen in a running world.** Live scaffolding, opened 2026-10-26 from
a conversation with the author about running a table where players are on different scenes. Slice 1 (the panel,
drag to move, the stored map and the re-apply on load) is in `scripts/manager-stage.js` and
`scripts/window-stage.js`; slice 2 (say to this stage, Away and Do Not Disturb, the hold scene) is not started.

**On completion:** the panel and its settings go to `documentation/architecture/architecture-stage-manager.md`,
the public calls (if any) to `documentation/api/`, the work items become `TODO.md` entries, shipped history goes
to `CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The problem

When the party splits, the GM's loop is: in chat with the party, one player goes to a new scene, switch to the
scenes tab, click the scene, switch back to chat, deal with that player, switch to the scenes tab, click the
other scene, deal with the other players. Foundry gives no single place that shows who is on which scene, and no
quick way to talk to the people on one scene.

## What Foundry already has (read in the v14 client, 2026-10-26)

- `Scene#pullUsers(users, viewOptions)` is GM-only and takes a list of users, so one player can be sent to a
  scene without moving the others. Each target client then runs `scene.view()` (`scenes.mjs` `#pullToScene`).
- A scene has two states: active (what players land on at login) and viewed (what one client is looking at). A
  GM can view and edit any scene without activating it, and players stay where they are.
- `Scene#activate({ pullUsers })` activates a scene and optionally pulls everyone.

## What is missing

- One view of who is where.
- Moving a person between scenes in one step, not through the scenes tab.
- Talking to the people on one scene without leaving the panel.
- Any memory of the arrangement: a pulled view is not a saved state, and a player who reloads lands on the
  active scene (the author's experience).

## The idea

A **Stage Manager**: a Tool window (and a menubar entry) that lists the scenes in play as **stages**.

- Each stage is a card (`blacksmith-tool-card`) holding the players on it as chips (`blacksmith-tool-chip`),
  and a "say to this stage" box that whispers to exactly those players.
- Dragging a player chip to another stage pulls them there. Clicking a stage moves the GM's own view.
- A stored map of player to scene, re-applied when a player connects or reloads.
- A **status** per player, Away or Do Not Disturb, shown on their chip. Do Not Disturb stops pulls and pop-ups for
  that player and tells the GM why.
- The earlier "hold scene" idea is one stage: park everyone on a lobby scene while the GM prepares, with a button
  to send everyone back to the active scene.

## Open questions, in the order they block the work

1. **Scene visibility. Answered 2026-10-26, yes, in the author's world.** A player client held the data for a
   scene that was neither active nor in the navigation bar, and in fact held every scene in the world (about
   sixty). So a pull is not blocked by missing data here. That is one world and one player: whether it comes from
   this world's default scene permission, or from Foundry sending players the whole scene library, is not known,
   and a world with a stricter default would need the manager to grant a minimum permission. A side effect worth
   knowing: a player can read every scene's name from the console, including ones not yet revealed.
2. **Does a view survive a reload. Answered 2026-10-26 from the author's own experience: no.** A player pulled to
   a scene who reloads lands on the active scene. So the stored player-to-scene map and a re-pull when the
   player connects are required, not optional.
3. **Combat. Answered 2026-10-26 from the author's experience: they run side by side.** Each scene can have its
   own combat running at once, and one scene can hold two. So the panel should show each stage's combat state
   (none, one, several). The consequence to audit is Blacksmith's own combat tooling: anything that reads
   `game.combat` sees the combat of the scene the GM is viewing, so with a split party the combat on the other
   stage is invisible to timers, statistics, the combat bar and the defeated handling unless they are written to
   cope. That audit is a separate piece of work and is not part of the first slice.
4. **What stays global.** Audio playlists, chat, the world clock and pause are not per scene. The panel should say
   so rather than imply otherwise.
5. **Where it lives. Decided 2026-10-26: Blacksmith.** The author called it core: it is coordination across the
   whole table, like the time modes (`manager-time-modes.js`), and a satellite cannot see everyone's location.
6. **First version. Decided 2026-10-26.** The panel, drag to move, and the stored player-to-scene map with a
   re-pull when a player connects. Chat per stage, Away and Do Not Disturb, and the hold scene follow in a second
   slice. The combat audit above is separate and is not part of either slice.

## Not decided

The window shape, whether stages are every scene or a chosen set, what Away does beyond showing a chip, and
whether a player can request a move. Raise them when the open questions above are answered.
