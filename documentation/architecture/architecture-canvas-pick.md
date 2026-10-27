# Canvas Pick Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public API, see `../api/api-canvas.md`.

`api.canvas.pickArea` lets a user drag a box and returns the scene documents inside it, across every layer, without touching the selection or the active layer. `scripts/manager-canvas-pick.js` holds the behaviour, `scripts/api-canvas.js` is the thin public object, and `styles/canvas-pick.css` draws the box and the hint.

## Why the pick takes the pointer itself

Foundry's marquee is a feature of the active layer: it selects that layer's placeables and changes what is controlled. A cross-layer pick that must leave selection alone cannot be built on it. So the pick never asks the canvas to do anything. It listens on `window` in the capture phase, ahead of anything Foundry registered, and handles a left press whose target is the canvas element (`canvas.app.view`) itself.

That one choice produces the three properties the feature needs:

- **Selection and active layer are untouched**, because `stopPropagation` on the capture-phase press means the canvas never receives the gesture.
- **Pan and zoom still work**, because only the left button is taken. Right-drag and the wheel pass through.
- **Everything above the canvas keeps working**, because a press whose target is not the canvas element (the sidebar, a window, a pin) is ignored.

The pointer move and release are also captured, but only once a press has started; until then nothing is intercepted, so hover and tooltips behave normally.

## Why the box is DOM and not PIXI

The box and hint are two `position: fixed` elements with `pointer-events: none`, appended to `document.body` and removed when the pick ends. They sit at `--z-index-ui`, above the canvas and pins and below windows. The box is a transient screen overlay, not something drawn on the map, so it has no reason to live in scene space. Drawing it in PIXI would need a layer and a lifecycle (children are destroyed on every canvas draw) for something that exists for a few seconds.

The two corners are stored in scene coordinates and converted back to the screen on every move and every `canvasPan`, so panning mid-drag keeps the box on the same part of the map.

## Selecting documents

`collectDocuments` walks the requested types, takes each layer by `canvas.getLayerByEmbeddedName(type)`, and tests `layer.placeables`. It reads placeables and never activates or draws a layer, which is what makes it layer-independent. Geometry comes from Foundry: `placeable.bounds` and `placeable.center`, with walls tested from `document.c` because a wall is a segment and its bounds are not a fair stand-in. `placeableMatches` is exported so the rules can be exercised without a canvas.

Level handling reads the document, not the placeable. A document whose schema has `levels` (regions included) is kept when the set is empty or contains `canvas.level.id`; one whose schema has `level` (a token) is kept when it equals it. If there is no `canvas.level` (Foundry v13, or a blank canvas) everything is kept.

Only documents where `isOwner` is true are returned. A GM owns everything; a player gets their own tokens. This is a permission decision, not a visibility one: a GM-hidden object is returned to the GM because the GM can act on it.

## Lifecycle

One pick at a time, held in a private static. `finish` is the only exit: it removes the four window listeners, the `canvasPan` and `canvasTearDown` hooks, the abort listener, restores the canvas cursor, removes the two elements, clears the active slot and resolves. Every way out routes through it: a completed drag resolves with a result, and Esc, an `AbortSignal`, a scene change and a second `pickArea` call all resolve `null`.

The hooks are registered with `Hooks.on` directly and removed in `finish`, not through `HookManager`, because they live for one pick. A registration that must be torn down on the same call stack that created it gains nothing from a registry.

## Checking it

The containment rules are pure functions and were exercised in isolation with a table of walls and boxes. The pointer handling is the part only a running canvas proves; the steps are in `testing/canvas-pick-area.md`.
