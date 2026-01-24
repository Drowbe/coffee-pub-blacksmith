# Canvas Pins API Documentation

> **Status**: Phases 1–3 complete. Pins render using pure DOM approach (no PIXI), support Font Awesome icons and image URLs, support multiple shapes (circle, square, none), and dispatch hover/click/double-click/right-click/middle-click/drag events. Context menu registration system allows modules to add custom menu items. Phase 4–5 (docs, tests) remain.

## Overview

The Canvas Pins API provides a system for creating, managing, and interacting with configurable pins on the FoundryVTT canvas. Pins are visual markers that can be placed on scenes and respond to various user interactions.

## Implementation Structure

The pins API follows Blacksmith's standard pattern:
- **`scripts/pins-schema.js`** - Data model, validation, migration (Phase 1.1)
- **`scripts/manager-pins.js`** - Internal manager with CRUD, permissions, event handler registration, and context menu item registration (Phase 1.2, 1.3)
- **`scripts/pins-renderer.js`** - Pure DOM pin rendering (circle/square/none + Font Awesome icons or image URLs), DOM events, context menu (Phase 2, 3)
- **`scripts/api-pins.js`** - Public API wrapper (`PinsAPI`) exposing CRUD, `on()`, `registerContextMenuItem()`, `reload()`, `isAvailable()`, `isReady()`, `whenReady()`
- **`scripts/blacksmith.js`** - Exposes `module.api.pins = PinsAPI`; hooks for `canvasReady` / `updateScene` pin loading
- **`styles/pins.css`** - All pin styling (CSS variables for configuration)

## Getting Started

### Accessing the API

```javascript
// Via game.modules (no imports – use in browser console or other modules)
const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;

// Or via Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
const blacksmith = await BlacksmithAPI.get();
const pinsAPI = blacksmith?.pins;
```

### API Availability Checks

Use these **before** calling create/update/delete/reload from another module or before canvas is ready:

| Method | Returns | Use when |
|--------|---------|----------|
| `pins.isAvailable()` | `boolean` | Guard: is Blacksmith loaded and pins API exposed? |
| `pins.isReady()` | `boolean` | Guard: API available, canvas ready, and a scene active? |
| `pins.whenReady()` | `Promise<void>` | Wait: resolves when canvas is ready and a scene is active (or immediately if already). Use in `init` before creating pins. |

- **`isAvailable()`**: Check that `game.modules.get('coffee-pub-blacksmith')?.api?.pins` exists. Use before any API use from another module.
- **`isReady()`**: `isAvailable()` plus `canvas?.ready` and `canvas?.scene`. Use as a sync guard before create/reload when you know canvas may not be ready yet.
- **`whenReady()`**: Returns a Promise that resolves when the canvas is ready and a scene is active. If already ready, resolves immediately. Use when your module runs at `init` or `ready` and you need to create pins—avoids creating before the layer/renderer exist.

- If pins exist in scene flags but don’t appear, activate the Blacksmith layer (scene controls) or call `pins.reload()`; the layer auto-activates when loading scenes with pins.

### Testing Pins

Blacksmith does **not** create a default or test pin. To exercise the pins API:

1. **Another module** – Use `whenReady()` (or a `canvasReady` hook), then create a pin. See [Usage patterns](#usage-patterns) below.
2. **Browser console** – Use `game.modules.get('coffee-pub-blacksmith')?.api?.pins`, then `create()` and `reload()` if needed. See `utilities/test-pins-debug.js` and `utilities/test-pins-rendering.js`.
3. **Drop on canvas** – Implement a draggable UI element that drops `{ type: 'blacksmith-pin', moduleId: 'your-module', ... }`; the `dropCanvasData` handler creates the pin.

### Usage Patterns

#### Using the API from another module

1. **Get the API** (no imports): `const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;`
2. **Check availability**: `if (!pins?.isAvailable()) return;`
3. **Wait for canvas** (if using pins at init/ready): `await pins.whenReady();` then create/list/reload.
4. **Create pins** with `moduleId: 'your-module-id'` so you can filter and manage them.
5. **Register handlers** with `pins.on(...)`. Use `{ moduleId: 'your-module' }` to scope events, and `signal` or the returned disposer for cleanup.
6. **Cleanup on unload**: Call your disposers or `controller.abort()` in your module's `Hooks.on('unloadModule', ...)` when your module ID unloads.

#### Example: create a pin from another module (init)

```javascript
Hooks.once('init', async () => {
  const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pins?.isAvailable()) return;

  await pins.whenReady();
  if (!canvas?.scene) return;

  const dims = canvas.dimensions ?? {};
  const cx = (dims.width ?? 2000) / 2;
  const cy = (dims.height ?? 2000) / 2;

  await pins.create({
    id: crypto.randomUUID(),
    x: cx, y: cy,
    moduleId: 'my-module',
    text: 'Test pin',
    image: '<i class="fa-solid fa-star"></i>'
  });
  await pins.reload();
});
```

#### Example: list and event handlers with cleanup

```javascript
const MODULE_ID = 'my-module';

let offClick = null;
const controller = new AbortController();

Hooks.once('canvasReady', () => {
  const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pins?.isReady()) return;

  const list = pins.list({ moduleId: MODULE_ID });
  console.log('My pins:', list.length);

  offClick = pins.on('click', (evt) => {
    console.log('Clicked:', evt.pin.id, evt.modifiers);
  }, { moduleId: MODULE_ID, signal: controller.signal });
});

Hooks.on('unloadModule', (id) => {
  if (id !== MODULE_ID) return;
  controller.abort();
  offClick?.();
});
```

#### Example: sync guard before reload

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (pins?.isReady()) {
  const r = await pins.reload();
  console.log('Reloaded', r.reloaded, 'pins');
} else {
  console.warn('Pins not ready (no canvas/scene)');
}
```

## Data Types

### PinData

```typescript
interface PinData {
  id: string; // UUID
  x: number;
  y: number;
  size?: { w: number; h: number };
  style?: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number }; // Supports hex, rgb, rgba, hsl, hsla, named colors
  text?: string;
  image?: string;  // Font Awesome HTML (e.g. '<i class="fa-solid fa-star"></i>'), Font Awesome class string (e.g. 'fa-solid fa-star'), or image URL (e.g. 'icons/svg/star.svg' or '<img src="path/to/image.webp">')
  shape?: 'circle' | 'square' | 'none'; // Pin shape: 'circle' (default), 'square' (rounded corners), or 'none' (icon only, no background)
  config?: Record<string, unknown>;
  moduleId: string; // consumer module id
  ownership?: { default: number; users?: Record<string, number> };
  version?: number; // schema version
}
```

### PinEvent

```typescript
interface PinEvent {
  type: 'hoverIn' | 'hoverOut' | 'click' | 'doubleClick' | 'rightClick' | 'middleClick' | 'dragStart' | 'dragMove' | 'dragEnd';
  pin: PinData;
  sceneId: string;
  userId: string;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  originalEvent: MouseEvent; // DOM MouseEvent (pure DOM approach)
}
```

## API Reference

### `pins.isAvailable()`
Check whether the pins API is available (Blacksmith loaded, API exposed).

**Returns**: `boolean`

Use before any API use from another module. Safe to call before `canvasReady`.

### `pins.isReady()`
Check whether the API is ready for create/list/reload: API available, canvas ready, and a scene active.

**Returns**: `boolean`

Use as a sync guard before create/update/delete/reload when you know canvas may not be ready yet.

### `pins.whenReady()`
Promise that resolves when the canvas is ready and a scene is active. If already ready, resolves immediately.

**Returns**: `Promise<void>`

Use when your module runs at `init` or `ready` and you need to create pins—avoids creating before the layer/renderer exist.

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (!pins?.isAvailable()) return;
await pins.whenReady();
await pins.create({ id: crypto.randomUUID(), x: 1000, y: 800, moduleId: 'my-module' });
await pins.reload();
```

### `pins.create(pinData, options?)`
Create a pin on the active scene.

**Returns**: `Promise<PinData>` - The created pin data with defaults applied

```javascript
const pin = await pinsAPI.create({
  id: crypto.randomUUID(),
  x: 1200,
  y: 900,
  text: 'Forge',
  moduleId: 'my-module',
  image: '<i class="fa-solid fa-star"></i>',  // optional; Font Awesome HTML, Font Awesome class string, or image URL
  shape: 'circle',  // optional; 'circle' (default), 'square', or 'none' (icon only)
  size: { w: 48, h: 48 },  // optional; defaults to { w: 32, h: 32 }
  style: {  // optional; defaults shown (supports hex, rgb, rgba, hsl, hsla, named colors)
    fill: '#000000',  // or 'rgba(0, 0, 0, 0.5)' for transparency
    stroke: '#ffffff',  // or 'rgba(255, 255, 255, 0.8)'
    strokeWidth: 2,
    alpha: 1  // Overall opacity (multiplies with RGBA alpha if color has alpha)
  }
});
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin data is invalid
- `Error` if scene not found
- `Error` if permission denied

### `pins.update(pinId, patch, options?)`
Update properties for an existing pin.

**Returns**: `Promise<PinData>` - The updated pin data

```javascript
const updatedPin = await pinsAPI.update(pin.id, { text: 'Hot Forge' });
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found
- `Error` if patch data is invalid
- `Error` if scene not found
- `Error` if permission denied

### `pins.delete(pinId, options?)`
Delete a pin from a scene. If no `sceneId` is provided, automatically searches all scenes to find the pin.

**Returns**: `Promise<void>`

```javascript
// Delete from current scene
await pinsAPI.delete(pin.id);

// Delete from specific scene
await pinsAPI.delete(pin.id, { sceneId: 'some-scene-id' });

// Delete without knowing which scene (searches all scenes)
await pinsAPI.delete(pin.id); // Finds and deletes from any scene
```

**Options**:
- `sceneId` (string, optional): target scene; if not provided, searches all scenes to find the pin
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found in any scene
- `Error` if scene not found (when sceneId provided)
- `Error` if permission denied

### `pins.findScene(pinId)`
Find which scene contains a pin with the given ID. Useful for cross-scene operations.

**Returns**: `string | null` - The scene ID containing the pin, or `null` if not found

```javascript
// Find which scene has this pin
const sceneId = pinsAPI.findScene(pinId);
if (sceneId) {
    console.log(`Pin is on scene: ${sceneId}`);
    // Can now delete, update, or pan to it
    await pinsAPI.delete(pinId, { sceneId });
}
```

### `pins.get(pinId, options?)`
Get a single pin by id.

**Returns**: `PinData | null` - Pin data if found, `null` if not found

```javascript
const pin = pinsAPI.get(pin.id);
if (pin) {
  console.log('Found pin:', pin.text);
}
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene

**Throws**: 
- `Error` if scene not found

### `pins.list(options?)`
List pins with filters.

**Returns**: `PinData[]` - Array of pin data matching filters

```javascript
const pins = pinsAPI.list({ moduleId: 'my-module' });
console.log(`Found ${pins.length} pins`);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `moduleId` (string, optional): filter by consumer module

**Throws**: 
- `Error` if scene not found

### `pins.on(eventType, handler, options?)`
Register an event handler. Returns a disposer function. Events are dispatched when users interact with pins (hover, click, double-click, right-click, middle-click, drag, etc.).

**Returns**: `() => void` - Disposer function to unregister the handler

```javascript
const off = pinsAPI.on('click', (evt) => {
  console.log(evt.pin.id, evt.modifiers.shift);
}, { moduleId: 'my-module' });

// later
off();

// Or use AbortSignal for automatic cleanup
const controller = new AbortController();
pinsAPI.on('click', handler, { signal: controller.signal });
// Later: controller.abort() automatically removes the handler
```

**Event Types**:
- `'hoverIn'` - Mouse enters pin
- `'hoverOut'` - Mouse leaves pin
- `'click'` - Single left mouse button click (or left click that didn't drag)
- `'doubleClick'` - Double left mouse button click (within 300ms window)
- `'rightClick'` - Right mouse button click (also shows context menu)
- `'middleClick'` - Middle mouse button click
- `'dragStart'` - Drag operation starts (requires `dragEvents: true`)
- `'dragMove'` - Drag operation continues (requires `dragEvents: true`)
- `'dragEnd'` - Drag operation ends (requires `dragEvents: true`)

**Options**:
- `pinId` (string, optional): handle events for a specific pin only
- `moduleId` (string, optional): handle events for pins created by this module
- `sceneId` (string, optional): scope to a specific scene
- `signal` (AbortSignal, optional): auto-remove handler on abort
- `dragEvents` (boolean, optional): opt in to `dragStart`/`dragMove`/`dragEnd` if you need them

**Throws**: 
- `Error` if eventType is invalid
- `Error` if handler is not a function

### `pins.panTo(pinId, options?)`
Pan the canvas to center on a pin's location. Useful for navigating to pins from other UI elements (e.g., clicking a note in a journal to pan to its associated pin).

**Returns**: `Promise<boolean>` - Returns `true` if pan was successful, `false` if pin not found or canvas not ready

```javascript
// Pan to a pin when clicking on a note
const pinId = noteData.flags['coffee-pub-squire']?.pinId;
if (pinId) {
    const success = await pins.panTo(pinId);
    if (success) {
        console.log('Panned to pin');
    }
}
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene

**Throws**: 
- No errors thrown; returns `false` if pin not found or canvas not ready

### `pins.reload(options?)`
Reload pins from scene flags and re-render on the canvas. Use when pins exist in data but don’t appear (e.g. after refresh or scene change). Calls via API only; no dynamic imports.

**Returns**: `Promise<{ reloaded: number; containerReady: boolean; pinsInData: number; layerActive: boolean }>`

```javascript
const result = await pins.reload();
// result.reloaded: number of pins now in container
// result.containerReady: whether renderer container existed
// result.pinsInData: pins in scene flags
// result.layerActive: whether Blacksmith layer is active
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene

**Throws**: `Error` if no scene (e.g. canvas not ready).

## Permissions and Errors

### Permissions
- Create/update/delete default to GM-only unless the PinManager configuration allows otherwise.
- `ownership` uses Foundry ownership levels (`CONST.DOCUMENT_OWNERSHIP_LEVELS`); GM always has full access.
- Ownership should be supplied by the calling module per its needs; Blacksmith enforces and validates it.

### Error Handling
- API calls validate input and throw on invalid data or missing scene.
- Scene load must never fail due to malformed pin data; invalid pins are dropped or repaired.
- All errors are thrown as `Error` objects with descriptive messages.
- Common error scenarios:
  - **Pin not found**: When `get()`, `update()`, or `delete()` is called with non-existent pin ID
  - **Permission denied**: When user lacks required permissions for operation
  - **Invalid data**: When pin data doesn't match schema or validation rules
  - **Scene not found**: When specified scene ID doesn't exist
  - **Invalid event type**: When registering handler with unsupported event type

## Drag and Drop

### Creating Pins via Drop

Pins can be created by dropping data onto the canvas using FoundryVTT's `dropCanvasData` hook. The pin system listens for drops with `type: 'blacksmith-pin'`.

**Data Format**:
```javascript
{
  type: 'blacksmith-pin',
  pinId: string,              // Optional: UUID; auto-generated if omitted
  x: number,                  // Scene X coordinate (from drop event)
  y: number,                  // Scene Y coordinate (from drop event)
  moduleId: string,           // Required: consumer module ID
  text: string,               // Optional: pin label
  image: string,              // Optional: Font Awesome HTML (defaults to star)
  size: { w: number, h: number }, // Optional: defaults to 32x32
  style: { ... },             // Optional: style overrides
  config: object,             // Optional: module-specific config
  ownership: { ... }          // Optional: ownership settings
}
```

**Example**: Create a draggable pin element in your module's UI:
```javascript
// In your module's HTML/Application
element.setAttribute('draggable', 'true');
element.addEventListener('dragstart', (e) => {
  const data = {
    type: 'blacksmith-pin',
    moduleId: 'my-module',
    text: 'Quest Location',
    image: '<i class="fa-solid fa-map-pin"></i>'
  };
  e.dataTransfer.setData('text/plain', JSON.stringify(data));
});
```

When dropped on the canvas, the pin will be created at the drop location. The `x` and `y` coordinates are automatically provided by FoundryVTT's drop event.

### Dragging Existing Pins

Pins can be moved by left-clicking and dragging. Only users with edit permissions can drag pins. The drag operation:
- Starts after moving 5 pixels (distinguishes drag from click)
- Shows visual feedback (alpha 0.7, elevated z-index)
- Updates pin position in real-time
- Saves final position on drag end
- Fires `dragStart`, `dragMove`, and `dragEnd` events (requires `dragEvents: true` in handler options)

## Implementation Status

- [x] Core infrastructure (Phase 1.1, 1.2, 1.3)
- [x] Rendering (Phase 2.1, 2.2): Pure DOM approach (no PIXI), circle/square/none shapes, Font Awesome icons and image URLs, CSS-based styling, fade-in animations
- [x] Drag-and-drop (Phase 2.3): dropCanvasData for creation, drag-to-move, visual feedback, AbortController cleanup
- [x] Event system (Phase 3.1, 3.2): hover/click/double-click/right-click/middle-click, modifiers, DOM event listeners, handler dispatch
- [x] Context menu (Phase 3.3): Default items (Delete), context menu item registration system for modules
- [x] API: CRUD, `on()`, `registerContextMenuItem()`, `unregisterContextMenuItem()`, `reload()`, `isAvailable()`, `isReady()`, `whenReady()`; `pinsAllowPlayerWrites` setting
- [x] Pin storage in scene flags; migration and validation on load
- [x] Shape support: circle (default), square (rounded corners), none (icon only)
- [x] Color support: hex, rgb, rgba, hsl, hsla, named colors
- [x] Image support: Font Awesome HTML, Font Awesome class strings, image URLs, `<img>` tags
- [x] CSS configuration: Image size ratio, border radius, all styling in `pins.css`
- [x] Phase 4.1: API usage patterns documented; availability checks (`isAvailable` / `isReady` / `whenReady`) implemented
- [ ] Full automated tests and remaining Phase 4–5 items (see `plans-pins.md`)
