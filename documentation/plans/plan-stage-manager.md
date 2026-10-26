# Plan: the Stage Manager, one place to see and move a split party

**Status: Planned -- nothing implemented.** Live scaffolding, opened 2026-10-26 from a conversation with the
author about running a table where players are on different scenes. Nothing is decided beyond the problem and
the building blocks; the open questions below settle before any code.

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
- Any memory of the arrangement: a pulled view is not a saved state, so I expect a reload puts a player back on
  the active scene. Unverified.

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

1. **Scene visibility.** Does a player client hold the scene data for a scene that is not active and not in the
   navigation bar? `#pullToScene` does nothing if `game.scenes.get(id)` is empty. If players lack the data, the
   manager has to grant a minimum permission or set the navigation flag, which is a visible side effect.
2. **Does a view survive a reload.** If not, the stored map and a re-pull on `userConnected` are required, not
   optional.
3. **Combat.** Combats belong to a scene. Two groups on two scenes may both want a combat. What does the tracker
   and Blacksmith's combat tooling do then?
4. **What stays global.** Audio playlists, chat, the world clock and pause are not per scene. The panel should say
   so rather than imply otherwise.
5. **Where it lives.** It is coordination across the whole table, like the time modes (`manager-time-modes.js`), so
   Blacksmith is the likely home. The author's rule is that features are being pulled out of Blacksmith, so this
   needs a deliberate yes.
6. **First version.** The smallest useful slice is probably the panel plus drag to move plus the stored map. Chat
   per stage, statuses and the hold scene follow.

## Not decided

The window shape, whether stages are every scene or a chosen set, what Away does beyond showing a chip, and
whether a player can request a move. Raise them when the open questions above are answered.
