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

## Testing

### Quick Console Test

Open your browser console (F12 → Console tab) and run these commands:

```javascript
// Test 1: Check if layer is available (must run after canvasReady)
canvas['blacksmith-utilities-layer']

// Test 2: Check via API
BlacksmithAPI.getCanvasLayer()

// Test 3: Check global access
window.BlacksmithCanvasLayer
```

### Complete Test Suite

Copy this entire test block into your browser console after the canvas is ready:

```javascript
// ========== BEGIN: CANVAS LAYER API TESTING ==========
// Run this in browser console after canvas is ready
// Filter console for "CANVAS TEST" to see results

(async function testCanvasLayerAPI() {
    console.log('CANVAS TEST | ===================================================');
    console.log('CANVAS TEST | ====  CANVAS LAYER API TESTING                 ====');
    console.log('CANVAS TEST | ===================================================');
    console.log('CANVAS TEST | ');
    
    try {
        // Test 1: Direct Canvas Access
        console.log('CANVAS TEST | ==== TEST 1: Direct Canvas Access ====');
        const directLayer = canvas['blacksmith-utilities-layer'];
        if (directLayer) {
            console.log('✅ CANVAS TEST | Direct access: Layer found', directLayer);
        } else {
            console.log('❌ CANVAS TEST | Direct access: Layer not found');
        }
        
        // Test 2: API Bridge Access
        console.log('CANVAS TEST | ==== TEST 2: API Bridge Access ====');
        const apiLayer = await BlacksmithAPI.getCanvasLayer();
        if (apiLayer) {
            console.log('✅ CANVAS TEST | API access: Layer found', apiLayer);
        } else {
            console.log('❌ CANVAS TEST | API access: Layer not found');
        }
        
        // Test 3: Direct API Access
        console.log('CANVAS TEST | ==== TEST 3: Direct API Access ====');
        const blacksmith = await BlacksmithAPI.get();
        const apiDirectLayer = blacksmith.CanvasLayer;
        if (apiDirectLayer) {
            console.log('✅ CANVAS TEST | Direct API: Layer found', apiDirectLayer);
        } else {
            console.log('❌ CANVAS TEST | Direct API: Layer not found');
        }
        
        // Test 4: Global Access
        console.log('CANVAS TEST | ==== TEST 4: Global Access ====');
        if (window.BlacksmithCanvasLayer) {
            console.log('✅ CANVAS TEST | Global access: Layer found', window.BlacksmithCanvasLayer);
        } else {
            console.log('⚠️ CANVAS TEST | Global access: Not available (may not be set until canvasReady)');
        }
        
        // Test 5: Layer Properties
        console.log('CANVAS TEST | ==== TEST 5: Layer Properties ====');
        if (apiLayer) {
            console.log('CANVAS TEST | Layer class:', apiLayer.constructor.name);
            console.log('CANVAS TEST | Has activate method:', typeof apiLayer.activate === 'function');
            console.log('CANVAS TEST | Has deactivate method:', typeof apiLayer.deactivate === 'function');
            console.log('CANVAS TEST | Layer object:', apiLayer);
        }
        
        // Test 6: Layer Activation (if available)
        console.log('CANVAS TEST | ==== TEST 6: Layer Activation ====');
        if (apiLayer && typeof apiLayer.activate === 'function') {
            try {
                apiLayer.activate();
                console.log('✅ CANVAS TEST | Layer activated successfully');
            } catch (error) {
                console.log('⚠️ CANVAS TEST | Layer activation error (may be normal):', error.message);
            }
        }
        
        // Test 7: Create Test Drawing (requires GM permissions)
        console.log('CANVAS TEST | ==== TEST 7: Create Test Drawing ====');
        if (game.user.isGM && canvas.scene) {
            try {
                const testDrawing = await canvas.scene.createEmbeddedDocuments("Drawing", [{
                    type: "r", // rectangle
                    x: 100,
                    y: 100,
                    width: 50,
                    height: 50,
                    strokeWidth: 2,
                    strokeColor: 0xFF0000,
                    flags: {
                        "test-module": {
                            temporary: true,
                            layerManaged: true
                        }
                    }
                }]);
                console.log('✅ CANVAS TEST | Test drawing created:', testDrawing[0]);
                console.log('CANVAS TEST | Drawing ID:', testDrawing[0].id);
                
                // Clean up test drawing
                setTimeout(() => {
                    testDrawing[0].delete();
                    console.log('CANVAS TEST | Test drawing cleaned up');
                }, 5000);
            } catch (error) {
                console.log('⚠️ CANVAS TEST | Test drawing creation failed:', error.message);
            }
        } else {
            console.log('ℹ️ CANVAS TEST | Skipping drawing test (requires GM permissions)');
        }
        
        console.log('CANVAS TEST | ');
        console.log('CANVAS TEST | ==== TEST COMPLETE ====');
        console.log('CANVAS TEST | Review results above');
        console.log('CANVAS TEST | ===================================================');
        
    } catch (error) {
        console.error('CANVAS TEST | ❌ Error during testing:', error);
        console.error('CANVAS TEST | Stack:', error.stack);
    }
})();
// ========== END: CANVAS LAYER API TESTING ==========
```

### Module Integration Test

Add this to your module to test Canvas Layer integration:

```javascript
// Add to your module's ready hook
Hooks.once('canvasReady', async () => {
    console.log('MODULE TEST | Testing Canvas Layer integration...');
    
    try {
        // Test API access
        const layer = await BlacksmithAPI.getCanvasLayer();
        if (!layer) {
            console.error('MODULE TEST | ❌ Canvas Layer not available');
            return;
        }
        
        console.log('MODULE TEST | ✅ Canvas Layer available:', layer);
        
        // Test layer methods
        if (typeof layer.activate === 'function') {
            console.log('MODULE TEST | ✅ Layer has activate method');
        }
        
        if (typeof layer.deactivate === 'function') {
            console.log('MODULE TEST | ✅ Layer has deactivate method');
        }
        
        console.log('MODULE TEST | ✅ All Canvas Layer tests passed');
        
    } catch (error) {
        console.error('MODULE TEST | ❌ Canvas Layer test failed:', error);
    }
});
```

### Console Commands

Run these in the browser console:

```javascript
// Quick availability check
BlacksmithAPI.getCanvasLayer().then(layer => {
    console.log('Layer available:', !!layer);
    if (layer) console.log('Layer:', layer);
});

// Check via direct access
console.log('Direct access:', canvas['blacksmith-utilities-layer']);

// Check module API
const api = game.modules.get('coffee-pub-blacksmith')?.api;
console.log('API CanvasLayer:', api?.CanvasLayer);
console.log('API getCanvasLayer:', api?.getCanvasLayer);
```

### Test Checklist

Use this checklist to verify your Canvas Layer integration:

- [ ] Canvas Layer is accessible after `canvasReady` hook
- [ ] `BlacksmithAPI.getCanvasLayer()` returns layer object
- [ ] Direct canvas access works: `canvas['blacksmith-utilities-layer']`
- [ ] Layer has standard methods: `activate()`, `deactivate()`
- [ ] Can create temporary drawings with flags
- [ ] Layer persists across scene changes
- [ ] No console errors during initialization
- [ ] No console errors during layer access

### Common Issues

**Layer returns `null`:**
- Ensure you're testing after `canvasReady` hook fires
- Check that Blacksmith module is enabled
- Verify canvas has initialized

**Layer methods not available:**
- Check that layer is fully initialized (wait a tick after `canvasReady`)
- Verify layer extends `foundry.canvas.layers.CanvasLayer`

**Test drawing not appearing:**
- Check GM permissions
- Verify scene is active
- Check drawing flags are set correctly

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

