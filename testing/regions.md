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
