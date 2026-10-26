# Stage Manager Architecture

**Audience:** Contributors to the Blacksmith codebase. There is no public API yet; the panel and the setting are the whole surface.

The Stage Manager is a GM Tool window that lists the scenes in use as cards, each holding the people on it as chips. Dragging a chip onto another card sends that player there, and the arrangement is remembered. `scripts/manager-stage.js` is the data and the actions, `scripts/window-stage.js` is the panel, `styles/window-stage.css` holds the little layout that is its own, and the controls are the shared `blacksmith-tool-*` set.

## Three facts from Foundry that shape it

- **Where a person is comes from Foundry.** Every client keeps `user.viewedScene` for every user, kept current by the `userActivity` socket event. The panel reads it and tracks no locations of its own. A person who is not connected is shown on the scene they are held on, if any.
- **A pull is not remembered.** `Scene#pullUsers(users)` makes a player's client view a scene, but a player who reloads lands on the active scene. So what the GM decided is stored and re-applied.
- **The player applies it.** A non-GM client reads the stored assignment on its first `canvasReady` after load and views that scene itself (`StageManager.applyOwnAssignment`, after a short delay so the first draw has settled). It needs no GM connected and cannot race the player's own canvas load, because only that client knows when it is ready. It runs once per load, not on every draw, so a scene the GM pulled a player to with core's own tools is not undone.

## State

One world setting, `stageState`, registered hidden in `settings.js`: `{ assignments: { userId: sceneId }, extras: [sceneId] }`. `assignments` is who is held where. `extras` are scenes the GM added to the panel by hand, for a stage nobody is on yet. `normalizeState` drops junk and duplicates on every read. World scope so every client can read its own assignment at load; only a GM writes it.

Assigning a player to the active scene clears the hold, since the active scene is where everyone lands anyway.

## Actions

`moveUser` stores the assignment and pulls the player now if they are connected. A GM cannot be assigned; a GM moves themselves with `viewStage`. `releaseUser` forgets a hold and leaves the player where they are. `returnEveryone` clears every hold and pulls every connected player to the active scene. `addStage` and `removeStage` edit `extras`. All are GM-only and throw otherwise.

Activating a different scene moves everyone as Foundry does and leaves the holds in place; the held players go back to their held scene the next time they load.

## The panel

`StageManager.stages()` is the view model: the active scene, the scene the GM is viewing, every scene someone is on, every held scene and every hand-added scene, each with its people, whether it is active, how many combats are started on it, and whether it was added by hand. The active scene sorts first.

Each stage is a static `blacksmith-tool-card` whose body is a `blacksmith-tool-dropzone`. A chip is a draggable `blacksmith-tool-chip`; GMs and the GM's own chip are not draggable. Native HTML drag and drop: `dragover` toggles `is-over`, `drop` calls `moveUser`. A held person's chip carries a pin icon and a remove button that releases the hold. A person who is not connected is dashed and dimmed.

The window re-renders when Foundry does something that changes who is where: `renderSceneNavigation` (which core fires when anyone changes scene), `userConnected`, scene and combat create, update and delete, and a change to `stageState`. A redraw is skipped while a chip is being dragged, since it would drop the chip the GM is holding. Hooks are registered through `HookManager` under one context and disposed on close.

## What it does not do

Audio, chat, the world clock and pause are global, and the panel says so. Combat is per scene, but Blacksmith's combat tooling (statistics, the turn and planning timers, the movement-mode switch) still assumes one combat at a time, so a split party running two fights at once is not yet safe. The panel's combat badge only counts started combats on each scene.
