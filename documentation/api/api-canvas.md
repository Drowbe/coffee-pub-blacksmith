# Blacksmith Canvas Layer API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

## Overview

The Blacksmith Canvas Layer API provides access to the `BlacksmithLayer`, a custom canvas layer that enables centralized canvas management for Coffee Pub modules. This layer is ideal for temporary drawings, UI overlays, and coordinated canvas interactions.

## Getting Started

### 1. Access the API

```javascript
// Import the Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// After canvas is ready
Hooks.once('canvasReady', async () => {
    const blacksmithLayer = await BlacksmithAPI.getCanvasLayer();
    if (blacksmithLayer) {
        // Layer is ready to use
    }
});
```

### 2. Check Availability

```javascript
// Check if layer is available
const layer = await BlacksmithAPI.getCanvasLayer();
if (!layer) {
    console.warn('BlacksmithLayer not available yet - ensure canvas is ready');
    return;
}
```

## API Reference

### Canvas Layer Access

#### `BlacksmithAPI.getCanvasLayer()`

Returns the BlacksmithLayer instance if available.

**Returns**: `Promise<Object|null>` - BlacksmithLayer instance or null if not ready

**Example**:
```javascript
const layer = await BlacksmithAPI.getCanvasLayer();
if (layer) {
    layer.activate();
}
```

#### Direct API Access

```javascript
const blacksmith = await BlacksmithAPI.get();
const layer = blacksmith.CanvasLayer; // null on initial load — prefer getCanvasLayer(), see below
```

Prefer `BlacksmithAPI.getCanvasLayer()`. `blacksmith.CanvasLayer` is unreliable:

- It is `null` on the initial canvas draw, and only becomes populated after a scene switch.
- It is gated on the `enableSceneClickBehaviors` setting (default on); with that setting off, `blacksmith.CanvasLayer` stays `null` even across scene switches.
- `window.BlacksmithCanvasLayer` is effectively never set — a sync step assigns it only while `blacksmith.CanvasLayer` is still `null`, and nothing re-syncs it.

`BlacksmithAPI.getCanvasLayer()` works in every case: it returns `api.getCanvasLayer()` when present, and otherwise reads the layer straight off the canvas (`canvas['blacksmith-utilities-layer']`), which is registered unconditionally at `init`.

#### Direct Canvas Access

```javascript
Hooks.once('canvasReady', () => {
    const layer = canvas['blacksmith-utilities-layer'];
    if (layer) {
        // Use the layer
    }
});
```

#### Global Access (after canvasReady)

`window.BlacksmithCanvasLayer` is effectively never set (see above), so this block is a silent no-op. Use `BlacksmithAPI.getCanvasLayer()` or read `canvas['blacksmith-utilities-layer']` directly.

```javascript
if (window.BlacksmithCanvasLayer) {
    const layer = window.BlacksmithCanvasLayer;
    // Use the layer
}
```

## Area pick (`api.canvas`)

`api.canvas.pickArea(options)` lets the user drag a box on the canvas and resolves with the documents inside it, across every layer in one pick. Foundry's own marquee only selects on the active layer. The pick does not change the current selection or the active layer, Esc cancels, and right-drag pan and wheel zoom keep working while it is open.

```javascript
const canvasApi = game.modules.get('coffee-pub-blacksmith')?.api?.canvas;

const picked = await canvasApi.pickArea({
    types: ['Tile', 'AmbientLight', 'Wall'],
    containment: 'centre',
    prompt: 'Drag a box around the group'
});

if (!picked) return;                       // cancelled
const { rect, documents } = picked;        // rect: { x, y, width, height } in scene coordinates
```

| Option | Default | Meaning |
|---|---|---|
| `types` | all of `canvas.pickTypes` | Document names to include: `Tile`, `Drawing`, `AmbientLight`, `AmbientSound`, `Wall`, `Note`, `Token`, `Region`. An unknown name throws a `TypeError` |
| `containment` | `'centre'` | How a document must relate to the box: `'centre'`, `'inside'` or `'intersects'` |
| `levels` | `'current'` | `'current'` keeps documents on the level being viewed; `'all'` ignores levels |
| `prompt` | a localized "Drag a box to pick. Esc to cancel." | The hint shown at the top of the screen while picking |
| `signal` | none | An `AbortSignal`; aborting cancels the pick |

**Returns** `Promise<{ rect, documents } | null>`. `null` means the pick was cancelled: Esc, an abort, a scene change, or another `pickArea` call replacing this one. `rect` is normalized, so `width` and `height` are never negative. `documents` are the live Document instances, grouped by type in the order of `canvas.pickTypes`.

**Containment.** A wall is a segment: `'centre'` is its midpoint, `'inside'` needs both endpoints in the box, `'intersects'` is any contact. Every other type uses the bounds Foundry reports for it: `'centre'` is the centre point, `'inside'` needs the whole bounds in the box, `'intersects'` is any overlap. A light or sound reports its radius as its bounds, so `'centre'` (its origin) is the rule that means "the light I can see the source of". Rotation is as Foundry reports it.

**Levels.** In Foundry v14 a wall, tile, light, sound, note, drawing or region carries a set of levels, and an empty set means every level. A token carries one level. With `levels: 'current'` a document is kept when its set is empty or contains the level being viewed. On a world with no levels this keeps everything.

**Regions.** A region is tested by the bounding box of its shapes, not the exact shape, so an L-shaped or circular region can be returned for a box that only touches the empty corner of its bounds. Regions are GM-owned, so only a GM gets them back.

**Who gets what.** Only documents the current user owns are returned, so a player picking over a scene gets their own tokens and nothing else. A GM gets everything in the box.

**Behaviour to know about.**

- A click without a drag is ignored and the pick stays open; only a drag of a few pixels or more completes it.
- One pick is open at a time. Calling `pickArea` while one is open cancels the open one, whose promise resolves `null`.
- The box is kept in scene coordinates, so panning during a drag keeps it on the same part of the map.
- It rejects with an `Error` when there is no active scene, and throws a `TypeError` for invalid options.
- `canvas.cancelPick()` cancels the open pick from outside, and `canvas.pickTypes`, `canvas.pickContainment` and `canvas.pickLevels` list the accepted values.

## Layer Properties

The BlacksmithLayer extends `foundry.canvas.layers.CanvasLayer` and provides:

- **Standard Canvas Layer Methods**: `activate()`, `deactivate()`, `_draw()`
- **Centralized Management**: Single layer for all Coffee Pub canvas interactions
- **Event Coordination**: Shared event handling for canvas operations
- **UI Overlay Support**: Custom rendering capabilities

## Use Cases

### 1. Temporary Drawing Management

Perfect for modules like Cartographer that need to create temporary player drawings:

```javascript
// Access the layer
const layer = await BlacksmithAPI.getCanvasLayer();

// Create temporary drawings with flags
const drawings = await canvas.scene.createEmbeddedDocuments("Drawing", [{
    type: "f", // freehand
    author: game.user.id,
    x: startX,
    y: startY,
    points: [[x1, y1], [x2, y2], ...],
    strokeWidth: brushSize,
    strokeColor: brushColor,
    flags: {
        "your-module-id": {
            temporary: true,
            layerManaged: true,
            playerDrawn: true,
            expiresAt: Date.now() + (timeout * 1000)
        }
    }
}]);

const drawing = drawings[0];
```

### 2. UI Overlays

Use BlacksmithLayer for drawing-related UI elements:

```javascript
const layer = await BlacksmithAPI.getCanvasLayer();
// Layer extends foundry.canvas.layers.CanvasLayer
// Override _draw() method for custom rendering
```

### 3. Drawing Cleanup

Coordinate cleanup of temporary canvas elements:

```javascript
Hooks.on("updateScene", async () => {
    const layer = await BlacksmithAPI.getCanvasLayer();
    if (layer) {
        // Cleanup temporary elements
        clearTemporaryDrawings();
    }
});

function clearTemporaryDrawings() {
    const temporaryDrawings = canvas.drawings.placeables.filter(d => 
        d.flags?.['your-module-id']?.temporary === true
    );
    
    temporaryDrawings.forEach(drawing => {
        drawing.delete();
    });
}
```

## Availability

### Timing

- **Initialization**: BlacksmithLayer is created during Blacksmith initialization
- **Availability**: Layer is available **after** `canvasReady` hook fires
- **Persistence**: Layer persists across scene changes
- **Group**: Part of Foundry's "interface" layer group

### Checking Availability

```javascript
// Wait for canvas to be ready
Hooks.once('canvasReady', async () => {
    const layer = await BlacksmithAPI.getCanvasLayer();
    if (layer) {
        // Safe to use layer
        console.log('BlacksmithLayer is ready');
    } else {
        console.warn('BlacksmithLayer not available');
    }
});
```

## Examples

### Complete Example: Temporary Drawing Module

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('canvasReady', async () => {
    const layer = await BlacksmithAPI.getCanvasLayer();
    if (!layer) {
        console.error('BlacksmithLayer not available');
        return;
    }
    
    // Setup cleanup on scene change
    Hooks.on("updateScene", () => {
        clearTemporaryDrawings();
    });
});

function clearTemporaryDrawings() {
    const temporaryDrawings = canvas.drawings.placeables.filter(d => 
        d.flags?.[MODULE.ID]?.temporary === true
    );
    
    temporaryDrawings.forEach(drawing => {
        drawing.delete();
    });
}

async function createTemporaryDrawing(startX, startY, points, brushSize, brushColor) {
    const drawings = await canvas.scene.createEmbeddedDocuments("Drawing", [{
        type: "f", // freehand
        author: game.user.id,
        x: startX,
        y: startY,
        points: points,
        strokeWidth: brushSize,
        strokeColor: brushColor,
        flags: {
            [MODULE.ID]: {
                temporary: true,
                layerManaged: true,
                playerDrawn: true,
                expiresAt: Date.now() + (3600 * 1000) // 1 hour
            }
        }
    }]);
    
    return drawings[0];
}
```

## Best Practices

1. **Check Availability**: Always verify layer exists before use
   ```javascript
   const layer = await BlacksmithAPI.getCanvasLayer();
   if (!layer) return;
   ```

2. **Wait for canvasReady**: Layer is only available after canvas initialization
   ```javascript
   Hooks.once('canvasReady', async () => {
       // Safe to access layer here
   });
   ```

3. **Use Flags**: Mark temporary drawings with flags for easy identification
   ```javascript
   flags: {
       [MODULE.ID]: {
           temporary: true,
           layerManaged: true
       }
   }
   ```

4. **Coordinate Cleanup**: Use layer for centralized cleanup management
   ```javascript
   Hooks.on("updateScene", clearTemporaryDrawings);
   ```

5. **Respect Other Modules**: Coordinate with other modules using the layer
   ```javascript
   // Check for conflicts with other modules
   const existingDrawings = canvas.drawings.placeables.filter(d => 
       d.flags?.['other-module-id']?.temporary
   );
   ```

6. **Error Handling**: Always handle cases where layer might not be available
   ```javascript
   try {
       const layer = await BlacksmithAPI.getCanvasLayer();
       if (!layer) {
           console.warn('Layer not available, using fallback');
           // Fallback implementation
       }
   } catch (error) {
       console.error('Error accessing BlacksmithLayer:', error);
   }
   ```

## Troubleshooting

### Layer Not Available

**Problem**: `getCanvasLayer()` returns `null`

**Solutions**:
- Ensure you're accessing after `canvasReady` hook fires
- Check that Blacksmith module is enabled
- Verify canvas has initialized properly

```javascript
Hooks.once('canvasReady', async () => {
    // Wait a tick to ensure layer is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    const layer = await BlacksmithAPI.getCanvasLayer();
});
```

### Drawings Persisting When They Shouldn't

**Problem**: Temporary drawings persist after cleanup

**Solutions**:
- Verify `flags[MODULE.ID].temporary === true`
- Check cleanup hooks are registered correctly
- Ensure drawings are deleted, not just hidden

```javascript
// Verify flag structure
console.log(drawing.flags?.[MODULE.ID]?.temporary); // Should be true

// Ensure proper deletion
await drawing.delete(); // Not just drawing.visible = false
```

### Permission Issues

**Problem**: Drawings not appearing or being removed

**Solutions**:
- Check user permissions
- Verify module settings
- Ensure proper scene ownership

## Related Documentation

- **[Core API](api-core.md)** - Blacksmith's shared utilities and constants
- Canvas layer implementation: `scripts/canvas-layer.js`

## Quick check

After `canvasReady`, in the browser console:

```javascript
canvas['blacksmith-utilities-layer']       // direct access
await BlacksmithAPI.getCanvasLayer()        // via the bridge (recommended)
```

Both return the `BlacksmithLayer` instance once the canvas is ready. If they return `null`, confirm the canvas has initialized and Blacksmith is enabled.
