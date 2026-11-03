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
12. Request a Roll, the other roll types. Try Saving Throw with `dex`, Ability with `str` and Dice with `2d6+4`; clear the DC. Expected: a request of that kind each time; with no DC the card has no target.
13. Request a Roll, no double posting. Walk in with the GM and two players connected. Expected: still one card.
14. Show Callout. Add **CP Blacksmith: Show Callout** to a region with a title, subtitle, text and the default icon. Walk a token in. Expected: a box opens beside the region with those parts, and no buttons. Walk out. Expected: it closes. A second client sees a box only for tokens it moved.
15. Show Callout anchors to a region. Make the region large, and one near the screen edge. Expected: the box sits beside the region's bounds, stays put while you pan and zoom, and flips to stay on screen. Leave the title empty. Expected: it shows the region's name.
16. Show Callout edges. Delete a token while it is inside the region. Expected: the box closes, or if not, say so; this is what `tokenExit` is expected to cover. Switch scenes with it open. Expected: it is gone.
17. Both on one region. Add both behaviours to one region and walk in. Expected: the box opens and the roll request posts.
18. Labels. Open both behaviours' sheets. Expected: every field has a label and a hint, and the legend reads `CP Blacksmith: <name>`.

