# Testing: canvas pick area

**Audience:** us.

Scope: `api.canvas.pickArea` (`scripts/manager-canvas-pick.js`), which has shipped in code and has not been run on a canvas. The containment rules were checked in isolation; the pointer handling, the selection and layer guarantees, and the v14 level filtering need a running world. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

Run these in the browser console as a GM on a scene with a few tiles, lights, walls, notes and tokens on different layers. Each starts with:

```javascript
const canvasApi = game.modules.get('coffee-pub-blacksmith').api.canvas;
```

1. Layer independence. Make the Tokens layer active and select one token. Run `await canvasApi.pickArea()` and drag a box over tiles, lights and walls. Expected: the hint shows while picking; the result's `documents` includes tiles, lights, and walls from other layers; the Tokens layer is still active and the same token is still selected.
2. Cancel. Run it and press Esc. Expected: the box and hint disappear and the promise resolves `null`. Then start another and abort with `const c = new AbortController(); canvasApi.pickArea({ signal: c.signal }); c.abort()`; expected: resolves `null`.
3. Click is not a pick. Run it, click once without moving, then drag. Expected: the click does nothing and the pick stays open; the drag completes it.
4. Pan and zoom. Run it, start a drag, then use the wheel to zoom and right-drag to pan before releasing. Expected: both work, and the box stays on the same part of the map.
5. Containment. On a scene with a wall that crosses the box edge, run it with each of `'centre'`, `'inside'` and `'intersects'`. Expected: the wall appears in the result for `'intersects'` only when it touches the box, for `'centre'` only when its midpoint is inside, and for `'inside'` only when both ends are inside.
6. Types filter. Run `canvasApi.pickArea({ types: ['Tile'] })` over a mixed area. Expected: only tiles. Run with `types: ['Banana']`; expected: a `TypeError` naming the valid types.
7. Levels (v14 scene with at least two levels). Put a tile on level A only and one on level B only. View level A and pick over both with the default, then with `levels: 'all'`. Expected: the default returns only the level A tile and any tile with no levels set; `'all'` returns both.
8. Replacement. Run `const first = canvasApi.pickArea(); canvasApi.pickArea();` Expected: `first` resolves `null` and only one box and hint exist.
9. Scene change. Start a pick and switch scenes. Expected: the pick ends, resolves `null`, and nothing is left on screen.
10. Player client. As a player who owns one token, pick over a box containing that token and others. Expected: only the owned token comes back.
11. Clean exit. After each case above, confirm the canvas cursor is back to normal and selecting a token still works by clicking it.
