# Blacksmith Canvas Layer API Documentation

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
const layer = blacksmith.CanvasLayer; // Available after canvasReady
```

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

```javascript
if (window.BlacksmithCanvasLayer) {
    const layer = window.BlacksmithCanvasLayer;
    // Use the layer
}
```

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

- **[Cartographer Module Guide](./cartographer.md)** - Complete guide for drawing on BlacksmithLayer
- **[Canvas Layer Implementation](../scripts/canvas-layer.js)** - Internal layer implementation
- **[Blacksmith API Core](./api-core.md)** - Main API documentation

## Support

For issues or questions:
- Check the [Cartographer Module Guide](./cartographer.md) for detailed examples
- Review the [Blacksmith API Core](./api-core.md) documentation
- Check browser console for error messages
- Report issues on GitHub

---

**Last Updated**: v13.0.0  
**Status**: Production ready  
**Available**: After `canvasReady` hook fires

