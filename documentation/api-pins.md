# Canvas Pins API Documentation

> **Status**: Phases 1–3 complete. Pins render on the Blacksmith layer, support Font Awesome icons, and dispatch hover/click/context-menu events. Phase 2.3 (drag-and-drop) and Phase 4–5 (docs, tests) remain.

## Overview

The Canvas Pins API provides a system for creating, managing, and interacting with configurable pins on the FoundryVTT canvas. Pins are visual markers that can be placed on scenes and respond to various user interactions.

## Implementation Structure

The pins API follows Blacksmith's standard pattern:
- **`scripts/pins-schema.js`** - Data model, validation, migration (Phase 1.1)
- **`scripts/manager-pins.js`** - Internal manager with CRUD, permissions, and event handler registration (Phase 1.2, 1.3)
- **`scripts/pins-renderer.js`** - Pin graphics (circle + Font Awesome icon), PIXI events, context menu (Phase 2, 3)
- **`scripts/api-pins.js`** - Public API wrapper (`PinsAPI`) exposing CRUD, `on()`, and `reload()`
- **`scripts/blacksmith.js`** - Exposes `module.api.pins = PinsAPI`; hooks for `canvasReady` / `updateScene` pin loading

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

### Checking Availability

- Pins API is available after Blacksmith initializes (`module.api.pins`).
- Pin **rendering** requires canvas and an active scene. Use `canvasReady` (or ensure canvas is ready) before creating pins or calling `reload()`.
- If pins exist in scene flags but don’t appear, activate the Blacksmith layer (scene controls) or call `pinsAPI.reload()`; the layer auto-activates when loading scenes with pins.

### Testing Pins

Blacksmith does **not** create a default or test pin. To exercise the pins API:

1. **Another module** – Register a `canvasReady` hook, then create a pin via the API once the canvas is ready. This avoids timing issues (e.g. creating before the layer/renderer exist).
2. **Browser console** – Use `game.modules.get('coffee-pub-blacksmith')?.api?.pins` and call `create()`, then `reload()` if the pin doesn't appear. See `utilities/test-pins-debug.js` and `utilities/test-pins-rendering.js` for patterns.
3. **Drop on canvas** – Implement a draggable UI element that drops `{ type: 'blacksmith-pin', moduleId: 'your-module', ... }` onto the canvas; the `dropCanvasData` handler creates the pin.

Example: a consumer module creating a test pin on `canvasReady`:

```javascript
Hooks.once('canvasReady', async () => {
  const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pinsAPI || !canvas?.scene) return;
  const dims = canvas.dimensions ?? {};
  const cx = (dims.width ?? 2000) / 2;
  const cy = (dims.height ?? 2000) / 2;
  await pinsAPI.create({
    id: crypto.randomUUID(),
    x: cx, y: cy,
    moduleId: 'my-module',
    text: 'Test pin',
    image: '<i class="fa-solid fa-star"></i>'
  });
  await pinsAPI.reload();
});
```

## Data Types

### PinData

```typescript
interface PinData {
  id: string; // UUID
  x: number;
  y: number;
  size?: { w: number; h: number };
  style?: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number };
  text?: string;
  image?: string;  // Font Awesome HTML only, e.g. '<i class="fa-solid fa-star"></i>'; legacy paths → default star
  config?: Record<string, unknown>;
  moduleId: string; // consumer module id
  ownership?: { default: number; users?: Record<string, number> };
  version?: number; // schema version
}
```

### PinEvent

```typescript
interface PinEvent {
  type: 'hoverIn' | 'hoverOut' | 'click' | 'rightClick' | 'middleClick' | 'dragStart' | 'dragMove' | 'dragEnd';
  pin: PinData;
  sceneId: string;
  userId: string;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  originalEvent: PIXI.FederatedPointerEvent;
}
```

## API Reference

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
  image: '<i class="fa-solid fa-star"></i>'  // optional; Font Awesome only
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
Delete a pin from a scene.

**Returns**: `Promise<void>`

```javascript
await pinsAPI.delete(pin.id);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found
- `Error` if scene not found
- `Error` if permission denied

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
Register an event handler. Returns a disposer function. Events are dispatched when users interact with pins (hover, click, right-click, etc.).

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
- `'click'` - Left mouse button click
- `'rightClick'` - Right mouse button click
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

### `pins.reload(options?)`
Reload pins from scene flags and re-render on the canvas. Use when pins exist in data but don’t appear (e.g. after refresh or scene change). Calls via API only; no dynamic imports.

**Returns**: `Promise<{ reloaded: number; containerReady: boolean; pinsInData: number; layerActive: boolean }>`

```javascript
const result = await pinsAPI.reload();
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
- [x] Rendering (Phase 2.1, 2.2): container, circle + Font Awesome icon + text label, layer integration, hover feedback, hit area
- [x] Drag-and-drop (Phase 2.3): dropCanvasData for creation, drag-to-move, visual feedback, AbortController cleanup
- [x] Event system (Phase 3.1, 3.2): hover/click/right-click/middle-click, modifiers, PIXI listeners, handler dispatch
- [x] Context menu (Phase 3.3): Edit, Delete, Properties (custom HTML); custom items and Foundry menu not done
- [x] API: CRUD, `on()`, `reload()`; `pinsAllowPlayerWrites` setting
- [x] Pin storage in scene flags; migration and validation on load
- [ ] Full usage examples, automated tests, and remaining Phase 4–5 items (see `plans-pins.md`)
