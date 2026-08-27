# Plan: the canvas surfaces

**Status: Planned -- nothing implemented.** Live scaffolding, opened 2026-08-27 while establishing why a
player's "T" could fail to target a token. Blacksmith owns two surfaces a module can draw on, one of them
has a live tenant in another module, and neither is documented anywhere.

**On completion:** the two-surface model and the lifecycle contract become
`documentation/architecture/architecture-canvas-surfaces.md`, the registration calls become
`documentation/api/api-canvas-surfaces.md`, the work items become `TODO.md` entries, shipped history goes to
`CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The finding

Found while establishing why "T" could fail to target. **Not the cause of that bug** -- see the targeting
entry above.

**The intent** (author, 2026-08-27): one Blacksmith-owned canvas surface for things that belong to the
scene but are not a token, a wall or a tile, so a module can draw without fighting core's layers or another
module's.

**It is doing that job today.** `BlacksmithLayer` (`manager-canvas-layer.js`) is exposed as
`module.api.getCanvasLayer()` (`blacksmith.js:879`), Cartographer fetches it once at startup
(`coffee-pub-cartographer/scripts/cartographer.js:151`) and `addChild`s its freehand strokes, symbols and
previews onto it throughout `manager-drawing.js`. The layer is not empty and never was -- **Blacksmith just
is not the one using it.** Which is the consumer-zero inversion this repo keeps finding: the only tenant of
our surface is a sibling, so every gap in it was theirs to work around and ours not to notice.

**A plain `CanvasLayer` is the right base class, and the whiteboard is why.** Cartographer draws while a
hotkey is held, taking the pointer position directly -- it never asks Foundry to hit-test a stroke. Input
that arrives through a keybinding needs no `InteractionLayer`, no control group, and no active layer, which
is exactly why it works while the GM is still selecting tokens. Core's Drawings layer is the opposite model
-- pick the tool, then place objects -- and it is a GM authoring experience, not a live-play one. That is a
better whiteboard for this table and it should not be rebuilt on core's.

So the earlier reading of this entry was wrong on its central point: **there is no `InteractionLayer` case
among the known candidates.** Every scene-space tenant raised so far is either driven by a keybinding or
never touched at all.

### There are two surfaces, and one question sorts them

Does it live in **scene** coordinates or **screen** coordinates.

| Surface | What it is | Tenants |
|---|---|---|
| **Scene-space** | `BlacksmithLayer`, a plain `CanvasLayer` in the `interface` group. Pans and zooms with the map. No hit-testing: input arrives by keybinding, or not at all | Cartographer's whiteboard (live); Herald's viewport box; Scribe's map-anchored narrative imagery |
| **Screen-space** | The DOM overlay over `#board` (`manager-pins-renderer.js:79-96`). Fixed size at any zoom, HTML and the design system | Pins and Artificer's gathering markers (live); Cartographer's minimap; broadcast-style stat overlays; full-screen narrative moments |

The minimap sorts by the author's own description: a fixed corner that cares about the viewport's x and y
and not its zoom is, by definition, not in the scene. Its contents may well be rendered with PIXI into an
element; its placement is DOM.

Herald's viewport box is scene-space and never touched -- a rectangle derived from another client's
viewport (x, y and zoom) and drawn on the GM's canvas, where it must pan and zoom with the GM's view to
mean anything. `eventMode = 'none'` and nothing else. It is the cheapest possible second tenant.

### What is actually missing is a contract, not just a document

`getCanvasLayer()` hands a consumer the raw PIXI container and says nothing. Every tenant therefore invents
its own z-ordering, its own cleanup, and its own answer to when the layer is safe to touch -- and two
tenants have no way not to collide. Three things the contract has to state, each of which is a real trap
rather than a formality:

1. **Children are destroyed on every canvas draw.** `CanvasLayer#_tearDown` runs
   `this.removeChildren().forEach(c => c.destroy({children: true}))`
   (`client/canvas/layers/base/canvas-layer.mjs:152-154`) and `draw()` calls it before every `_draw()`
   (`:108-116`). So a scene change silently destroys every tenant's graphics. A consumer that fetched the
   layer once and assumed its children persist is holding a live reference to an emptied container.
2. **`drawBlacksmithLayer` is the re-attach signal.** `CanvasLayer#draw` fires `draw${hookName}` after
   `_draw()` (`:113`). That is the race-free moment to re-add; `canvasReady` is not, and neither is a
   timeout.
3. **Each tenant should get its own named container**, created and owned by us, with a declared z-order --
   not `addChild` straight onto the layer. That is what makes two tenants possible at all, and it is the
   difference between an API and an accessor.

The fog behaviour belongs in the same document. The `interface` group is a sibling of `visibility` under
`rendered` (`config.mjs:596-626`), so nothing on this layer is masked by the vision system -- which is why
core's notes and drawings show through fog. Anything that must respect sight tests it itself, the way
`Note#isVisible` does: a permission check, then
`canvas.visibility.testVisibility(point, {tolerance})` (`client/canvas/placeables/note.mjs:85-92`).

### Pins stay DOM, and that is not a consolation prize

The requirement that settles it (author, 2026-08-27): a pin must be usable *while the GM is working with
tokens*, never behind a trip to the Coffee Pub toolbar. DOM satisfies that with no mechanism.

PIXI is not ruled out by that -- core keeps door controls clickable on the Tokens layer by having
`ControlsLayer` override `_deactivate()` to set `interactiveChildren = true`
(`client/canvas/layers/controls.mjs:222-224`) -- but nothing pins need is on the other side of the move.
PIXI would buy scene-scaled size, z-order among canvas content, and no `canvasPan` bookkeeping; it would
cost HTML text, tooltips, the design system, hand-built hit-testing and accessibility, and the hover card
and context menu are DOM either way (`UIContextMenu`). Fog is not on the list, per the paragraph above.

**Pin visibility today is permission-only** -- `blacksmithVisibility`, `blacksmithAccess`, ownership -- with
no sight test anywhere in the renderer, so a player-visible pin shows through unexplored map. If that is
wrong, copy `Note#isVisible` into the update that already runs on every pan. A decision about pins, not
about surfaces.

### What to do

1. **Write the architecture doc.** The two-surface split, the three contract points, the fog behaviour of
   the `interface` group, and why the whiteboard needs no `InteractionLayer`. All of it was recovered by
   reading Cartographer and core, which is precisely the cost this doc exists to stop paying.
2. **Turn `getCanvasLayer()` into an API**: a named container per tenant, declared z-order, and a documented
   re-attach signal. Cartographer migrates from `addChild` on the bare layer to its own container. Publish
   as `documentation/api/api-canvas-layer.md`.
3. **Give the DOM overlay the same treatment** -- a name and a registration path -- so pins stop being the
   only thing that knows how to reach it, and the minimap has somewhere to land.
4. **Herald's box is the acceptance test.** A second tenant is what proves the container split works;
   one tenant cannot.
5. **Remove `layer: "blacksmith-utilities-layer"`** from the control group (`manager-toolbar.js:1071`).
   Nothing on the layer is interactive, so it is not a mode, and the property is what makes core's control
   model disagree with ours.

Four things are wrong today:

1. **`_draw()` initialises the pin renderer** (`manager-canvas-layer.js:11-15`) -- a screen-space concern
   living inside the scene-space layer, for a system that does not use the layer. It belongs to whatever
   owns the DOM overlay.
2. **`activate()` and `deactivate()` wear the names of a lifecycle they are not part of** (`:17`, `:41`).
   Core never calls them, since the control group's `onChange` is empty
   (`manager-toolbar.js:1076-1079`). Worse than dead: `deactivate()` clears *pins* and leaves
   Cartographer's drawings, so if anything ever did call it the result would be arbitrary.
3. **`CanvasLayer` has no `active`**, so every `!layer.active` guard is a no-op: `blacksmith.js:892`,
   `blacksmith.js:940` and `api-pins.js:715` re-activate on every call, and `api-pins.js` reports
   `layerActive: false` unconditionally.
4. **`activateBlacksmithLayer()` (`manager-toolbar.js:1431`) is dead** -- defined, never called.
