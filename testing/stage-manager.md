# Testing: Stage Manager

**Audience:** us.

Scope: the panel, drag to move, the stored map and the re-apply on load (`scripts/manager-stage.js`, `scripts/window-stage.js`). The state rules are covered by the Stage Manager suite in the test harness; everything here needs a GM client and at least one player client on a second browser or profile. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

1. Open it. As the GM click the Stage Manager menubar icon (the masks). Expected: a window titled Stage Manager with a card for the active scene, badged Active, and one for the scene you are viewing if different; every connected player appears as a chip on the scene they are looking at; GMs have a crown.
2. Live location. A player opens a different scene from their own scene navigation (if they can) or you pull them with core's tools. Expected: within a moment their chip is on the other card, without reloading the panel.
3. Drag to move. Drag a player's chip onto another scene's card. Expected: the card highlights while the chip is over it, the player's view changes to that scene, and the chip now sits on that card with a pin icon (held).
4. A hold survives a reload. With a player held on a scene that is not active, have them reload (F5). Expected: they load into the held scene, not the active one.
5. A hold survives you being away. Close the GM client, have the held player reload. Expected: still the held scene; no GM is needed.
6. Release. Click the x on a held chip. Expected: the pin goes; the player stays where they are for now; after they reload they land on the active scene.
7. Moving to the active scene. Drag a held player onto the active scene's card. Expected: they move there and are no longer marked held.
8. Offline player. Disconnect a held player. Expected: their chip stays on the held scene, dashed and dimmed; reconnect and they load into it.
9. Add a stage. Choose a scene in the toolbar's Add a stage list and press Add. Expected: it gets a card ("Nobody here. Drop a player to send them."); drop a player on it to send them; the x on an empty hand-added card takes it off.
10. Return Everyone. With two players held on two scenes, press Return Everyone and confirm. Expected: every hold is cleared and every connected player is pulled to the active scene.
11. Core pull is not undone. Pull a held player to another scene with Foundry's own Pull to Scene. Expected: they go there and are not yanked back until they reload.
12. Combat badge. Start a combat on a stage. Expected: its card shows a badge with the count; end it and the badge goes.
13. GM only. As a player, the menubar icon is absent; `StageWindow.open()` from the console warns and does nothing.
14. Active scene change. Activate a different scene while players are held. Expected: players move as Foundry normally does; the holds stay listed; held players return to their held scene on their next reload.
