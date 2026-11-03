# Testing: regions

**Audience:** us.

Scope: `api.regions.registerBehavior` (`scripts/api-regions.js`). Nothing here has run in Foundry. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

A behaviour can only be registered during `init`, so the live test is a module that does it: Merchant's Open Merchant, once it registers through this API.

1. The legend. On a scene, draw a Region, add the Open Merchant behaviour and open it. Expected: the legend round its fields reads `CP Merchant: Open Merchant`, and the region's Behaviors list shows the same name.
2. The fields. Choose it. Expected: the Merchant and Once fields show their labels and hints, not blank labels.
3. Walk in. Give the behaviour a linked merchant, then move a token into the region as a player. Expected: the shop opens for that player only; no other client opens a window.
4. Walk in as the GM. Expected: it opens for the GM, as a GM visiting a shop.
5. Nothing breaks. Drag a token around the scene with the behaviour present, and reload with the region on the scene. Expected: no error and no stalled drag.
6. Late registration. In the console: `game.modules.get('coffee-pub-blacksmith').api.regions.registerBehavior({ moduleId: 'coffee-pub-merchant', name: 'late', label: 'Late', fields: () => ({}) })`. Expected: an `Error` saying it was registered after init, and nothing added to the Type list.
7. Bad spec. The same call with `name: 'Bad Name'`. Expected: a `TypeError` about lower camel case. In a test module's `init`, a good spec with `events: { nope() {} }`. Expected: a `TypeError` naming the event and listing the real ones.
8. Missing declaration. In a test module, register a behaviour whose `module.json` has no `documentTypes` entry. Expected: a console warning naming the module and the line to add.
10. Request a Roll. Draw a region, add **CP Blacksmith: Request a Roll** (Skill, Perception, DC 12, Only once on), and walk a player-owned token into it. Expected: one roll request for that token appears in chat, headed with the region's name, and no second card. The behaviour then shows as disabled in the region.
11. Request a Roll, who. Turn Only once off and Triggered by to *A token a player owns*. Walk an NPC token in. Expected: nothing. Set it to *Any token* and repeat. Expected: a request for the NPC.
12. Request a Roll, the roll dropdown. Open the Roll dropdown. Expected: groups in alphabetical order (Ability Check, Dice, Quick Roll, Saving Throw, Skill), each alphabetical inside (Death among the saves). Try `Save: Dexterity`, `Ability: Strength`, and Dice formula with `2d6+4` in the Dice formula field; clear the DC. Expected: a request of that kind each time; with no DC the card has no target. Dice formula with the field empty: nothing is posted.
13b. Request a Roll, a Quick Roll. Pick one of your Quick Rolls that has a DC (and one marked cinematic), leave the DC field empty and walk a player token in. Expected: the roll, DC and title of the Quick Roll, for that token only; the cinematic plays if the Quick Roll is cinematic. Set the DC field. Expected: it wins. A contested Quick Roll is not in the list. Delete the Quick Roll and walk in again. Expected: a warning, no request, and no error on reload.
13a. Request a Roll, cinematic. Turn Cinematic on and walk a player token in. Expected: the full-screen cinematic plays for the table, as the Cinematic switch does in Request a Roll; off, it posts to chat only.
13. Request a Roll, no double posting. Walk in with the GM and two players connected. Expected: still one card.
14. Show Callout. Add **CP Blacksmith: Show Callout** to a region with a title, subtitle, text and the default icon. Walk a token in. Expected: a box opens beside the region with those parts, and no buttons. Walk out. Expected: it closes. A second client sees a box only for tokens it moved.
15. Show Callout anchors to a region. Make the region large, and one near the screen edge. Expected: the box sits beside the region's bounds, stays put while you pan and zoom, and flips to stay on screen. Leave the title empty. Expected: it shows the region's name.
16. Show Callout edges. Delete a token while it is inside the region. Expected: the box closes, or if not, say so; this is what `tokenExit` is expected to cover. Switch scenes with it open. Expected: it is gone.
17. Both on one region. Add both behaviours to one region and walk in. Expected: the box opens and the roll request posts.
18. Labels. Open both behaviours' sheets. Expected: every field has a label and a hint, and the legend reads `CP Blacksmith: <name>`.
19. Play Sound, the table. Add **CP Blacksmith: Play Sound** to a region with a sound and Heard by *Everyone at the table*. Walk a player token in with the GM and a player connected. Expected: both hear it once, at the chosen volume.
20. Play Sound, the mover. Set Heard by to *Only the player who walked in*. Expected: only that player hears it. With Only once on, the behaviour then shows as disabled. An NPC walking in with Triggered by *A token a player owns* makes no sound.
21. Toggle Tile Visibility. Place a hidden tile, add **CP Blacksmith: Toggle Tile Visibility** to a region, drag the tile onto the Tile field, choose *Show it*, and walk a player token in. Expected: the tile appears for the players. Try *Hide it* and *Flip it*, and Only once. Delete the tile and walk in again. Expected: a warning and no error.
22. Declarations. After restarting Foundry, open Create Behavior. Expected: `CP Blacksmith: Play Sound` and `CP Blacksmith: Toggle Tile Visibility` in the list, and both sheets show a label and a hint on every field.
23. Reset button. Open a region's sheet, Behaviors tab, as the GM. Expected: a rotate-left button beside the plus, with a tooltip. Open it as a player with observer rights. Expected: no button.
24. Reset after Only once. On a region with Request a Roll (Only once on) and Toggle Tile (Show it, Only once on), walk a player token in. Expected: both go disabled and the tile appears. Click Reset. Expected: both switch back on, the tile is hidden again, and a message says two behaviors were switched on and one put back. Walk in again. Expected: they fire again.
25. Reset leaves a hand-disabled behavior alone. Disable a behavior with the toggle, add another that fires once and let it fire, then Reset. Expected: the one that fired is back on, the hand-disabled one is still off.
26. Reset with nothing to do. Click Reset on a region where nothing has fired. Expected: a message that there is nothing to reset, and no change.
27. Reset a flipped tile. Use Toggle Tile with *Flip it* and walk in three times, then Reset. Expected: the tile is back as it was before the first walk-in, not just flipped once more.
