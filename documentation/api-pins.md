# Canvas Pins API Documentation

> **Status**: Phases 1–3 complete. Pins render using pure DOM approach (no PIXI), support Font Awesome icons and image URLs, support multiple shapes (circle, square, none), and dispatch hover/click/double-click/right-click/middle-click/drag events. Context menu registration system allows modules to add custom menu items. Pin animation system (`ping()`) with 11 animation types (including 'ping' combo) and sound support, with broadcast capability. Automatic visibility filtering based on ownership permissions. Text display system with multiple layouts (under, over, around), display modes (always, hover, never, gm), and scaling options. Border and text scaling with zoom. Icon/image type changes (icon ↔ image swaps) are automatically detected and handled during `update()`. Pin type system with default 'default' type for categorization and filtering. GM bulk delete controls (`deleteAll()`, `deleteAllByType()`) available via API and context menu with `moduleId` filtering. GM proxy methods (`createAsGM()`, `updateAsGM()`, `deleteAsGM()`, `requestGM()`) for permission escalation. Ownership resolver hook (`blacksmith.pins.resolveOwnership`) for custom ownership mapping. Reconciliation helper (`reconcile()`) for repairing module-tracked pin links. Helper methods: `exists()`, `panTo()`, `findScene()`, `refreshPin()`. Phase 4–5 (docs, tests) remain.

## Overview

The Canvas Pins API provides a system for creating, managing, and interacting with configurable pins on the FoundryVTT canvas. Pins are visual markers that can be placed on scenes and respond to various user interactions.

## Implementation Structure

The pins API follows Blacksmith's standard pattern:
- **`scripts/pins-schema.js`** - Data model, validation, migration (Phase 1.1)
- **`scripts/manager-pins.js`** - Internal manager with CRUD, permissions, event handler registration, and context menu item registration (Phase 1.2, 1.3)
- **`scripts/pins-renderer.js`** - Pure DOM pin rendering (circle/square/none + Font Awesome icons or image URLs), DOM events, context menu (Phase 2, 3)
- **`scripts/api-pins.js`** - Public API wrapper (`PinsAPI`) exposing CRUD, `on()`, `registerContextMenuItem()`, `reload()`, `refreshPin()`, `deleteAll()`, `deleteAllByType()`, `createAsGM()`, `updateAsGM()`, `deleteAsGM()`, `requestGM()`, `reconcile()`, `isAvailable()`, `isReady()`, `whenReady()`
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

The pin data structure includes all configurable properties for a pin:

```typescript
interface PinData {
  id: string; // UUID
  x: number;
  y: number;
  size?: { w: number; h: number };
  style?: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number }; // Supports hex, rgb, rgba, hsl, hsla, named colors
  text?: string; // Text label content
  image?: string;  // Font Awesome HTML (e.g. '<i class="fa-solid fa-star"></i>'), Font Awesome class string (e.g. 'fa-solid fa-star'), or image URL (e.g. 'icons/svg/star.svg' or '<img src="path/to/image.webp">')
  shape?: 'circle' | 'square' | 'none'; // Pin shape: 'circle' (default), 'square' (rounded corners), or 'none' (icon only, no background)
  dropShadow?: boolean; // Whether to show drop shadow (default: true) - controlled via CSS variable --blacksmith-pin-drop-shadow
  textLayout?: 'under' | 'over' | 'around'; // Text layout: 'under' (text below pin), 'over' (text centered over pin), or 'around' (text curved around pin edge)
  textDisplay?: 'always' | 'hover' | 'never' | 'gm'; // Text display mode: 'always' (default), 'hover' (show on hover), 'never', or 'gm' (GM only)
  textColor?: string; // Text color (default: '#ffffff') - supports hex, rgb, rgba, hsl, hsla, named colors
  textSize?: number; // Text size in pixels (default: 12)
  textMaxLength?: number; // Maximum text length before ellipsis (default: 0 = no limit)
  textScaleWithPin?: boolean; // Whether text scales with pin size based on zoom (default: true). If false, text stays fixed size.
  type?: string; // Pin type/category (e.g., 'note', 'quest', 'location', 'npc'). Defaults to 'default' if not specified. Used for filtering and organization.
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

### `pins.exists(pinId, options?)`
Check if a pin exists on a scene. Useful before attempting to create a pin to avoid duplicate ID errors.

**Returns**: `boolean` - True if pin exists, false otherwise

```javascript
// Check if pin exists before creating
if (!pins.exists('my-pin-id')) {
    await pins.create({
        id: 'my-pin-id',
        moduleId: 'my-module',
        x: 1000,
        y: 1000
    });
} else {
    console.log('Pin already exists, updating instead');
    await pins.update('my-pin-id', { x: 1000, y: 1000 });
}

// Check on a specific scene
const existsOnOtherScene = pins.exists('my-pin-id', { sceneId: 'other-scene-id' });
```

**Options**:
- `sceneId` (string, optional): scene to check; defaults to active scene

**Throws**: 
- No errors thrown; returns `false` if scene not found

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
  type: 'note',  // optional; pin type/category (e.g., 'note', 'quest', 'location', 'npc'). Defaults to 'default' if not specified
  image: '<i class="fa-solid fa-star"></i>',  // optional; Font Awesome HTML, Font Awesome class string, or image URL
  shape: 'circle',  // optional; 'circle' (default), 'square', or 'none' (icon only)
  dropShadow: true,  // optional; adds subtle drop shadow (default: true)
  textLayout: 'under',  // optional; 'under' (text below pin), 'over' (text centered over pin), or 'around' (text curved around pin edge)
  textDisplay: 'always',  // optional; 'always' (default), 'hover', 'never', or 'gm' (GM only)
  textColor: '#ffffff',  // optional; text color (default: '#ffffff')
  textSize: 12,  // optional; text size in pixels (default: 12)
  textMaxLength: 0,  // optional; max length before ellipsis (default: 0 = no limit)
  size: { w: 48, h: 48 },  // optional; defaults to { w: 32, h: 32 }
  style: {  // optional; defaults shown (supports hex, rgb, rgba, hsl, hsla, named colors)
    fill: '#000000',  // or 'rgba(0, 0, 0, 0.5)' for transparency
    stroke: '#ffffff',  // or 'rgba(255, 255, 255, 0.8)'
    strokeWidth: 2,
    alpha: 1  // Overall opacity (multiplies with RGBA alpha if color has alpha)
  }
});
```

```javascript
// Create pin without drop shadow
const flatPin = await pinsAPI.create({
  id: crypto.randomUUID(),
  x: 1200,
  y: 900,
  moduleId: 'my-module',
  dropShadow: false  // Disable drop shadow
});

// Different pin shapes
// Circle pin (default)
const circlePin = await pinsAPI.create({
  id: 'circle-pin',
  x: 1000,
  y: 1000,
  moduleId: 'my-module',
  shape: 'circle',  // Round background
  image: '<i class="fa-solid fa-location-dot"></i>'
});

// Square pin with rounded corners
const squarePin = await pinsAPI.create({
  id: 'square-pin',
  x: 1100,
  y: 1000,
  moduleId: 'my-module',
  shape: 'square',  // Square with rounded corners
  image: '<i class="fa-solid fa-flag"></i>'
});

// Icon-only pin (no background shape)
const iconPin = await pinsAPI.create({
  id: 'icon-pin',
  x: 1200,
  y: 1000,
  moduleId: 'my-module',
  shape: 'none',  // Icon only, no background circle/square
  image: '<i class="fa-solid fa-star"></i>'
});

// Pin with text display options
const textPin = await pinsAPI.create({
  id: 'text-pin',
  x: 1300,
  y: 1000,
  moduleId: 'my-module',
  text: 'Secret Location',
  textLayout: 'under',  // Text below pin
  textDisplay: 'hover',  // Show text only on hover
  textColor: '#ffff00',  // Yellow text
  textSize: 14,  // Larger text
  textMaxLength: 15,  // Truncate after 15 characters
  textScaleWithPin: true,  // Text scales with zoom
  image: '<i class="fa-solid fa-location-dot"></i>'
});

// Pin with text over icon
const overTextPin = await pinsAPI.create({
  id: 'over-text-pin',
  x: 1400,
  y: 1000,
  moduleId: 'my-module',
  text: 'Return Here',
  textLayout: 'over',  // Text centered over pin
  textDisplay: 'always',
  textColor: '#ffffff',
  textSize: 14,
  textScaleWithPin: false,  // Fixed size text
  image: '<i class="fa-solid fa-map"></i>'
});

// Pin with text curved around edge
const aroundTextPin = await pinsAPI.create({
  id: 'around-text-pin',
  x: 1500,
  y: 1000,
  moduleId: 'my-module',
  text: 'WRAP YOUR TEXT AROUND A CIRCLE',
  textLayout: 'around',  // Text curved around pin edge
  textDisplay: 'always',
  textColor: '#ffffff',
  textSize: 12,
  textScaleWithPin: true,  // Text scales with zoom
  image: '<i class="fa-solid fa-location-dot"></i>'
});

// GM-only text pin
const gmTextPin = await pinsAPI.create({
  id: 'gm-text-pin',
  x: 1600,
  y: 1000,
  moduleId: 'my-module',
  text: 'GM Notes: Hidden treasure here',
  textDisplay: 'gm',  // Only GM can see this text
  textLayout: 'over',  // Text centered over pin
  image: '<i class="fa-solid fa-map"></i>'
});

// Pin with type for categorization
const notePin = await pinsAPI.create({
  id: 'note-pin-1',
  x: 1200,
  y: 800,
  moduleId: 'my-module',
  type: 'note',  // Categorize as 'note' type
  text: 'Important Note',
  image: '<i class="fa-solid fa-sticky-note"></i>'
});

const questPin = await pinsAPI.create({
  id: 'quest-pin-1',
  x: 1400,
  y: 900,
  moduleId: 'my-module',
  type: 'quest',  // Categorize as 'quest' type
  text: 'Main Quest',
  image: '<i class="fa-solid fa-flag"></i>'
});

// Pin without type (defaults to 'default')
const defaultPin = await pinsAPI.create({
  id: 'default-pin-1',
  x: 1000,
  y: 700,
  moduleId: 'my-module',
  // type not specified - will default to 'default'
  text: 'Default Pin',
  image: '<i class="fa-solid fa-star"></i>'
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
Update properties for an existing pin. Automatically detects and handles icon/image type changes (e.g., switching from Font Awesome icon to image URL, or vice versa) by rebuilding the icon element when needed.

**Returns**: `Promise<PinData | null>` - The updated pin data, or `null` if pin not found

```javascript
// Update text
const updatedPin = await pinsAPI.update(pin.id, { text: 'Hot Forge' });

// Switch from icon to image (automatically handled)
await pinsAPI.update(pin.id, { 
    image: '<img src="icons/svg/treasure.svg">' 
});

// Switch from image to icon (automatically handled)
await pinsAPI.update(pin.id, { 
    image: '<i class="fa-solid fa-star"></i>' 
});
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene. If pin not found on specified scene, automatically searches other scenes.
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if patch data is invalid
- `Error` if scene not found (when sceneId provided and scene doesn't exist)

**Note**: Returns `null` (instead of throwing) if pin not found anywhere, allowing calling modules to handle missing pins gracefully.

**Icon/Image Type Changes**: When updating the `image` property to change from an icon to an image (or vice versa), the renderer automatically detects the type change and rebuilds the icon element. No manual refresh or reload is needed.

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

### `pins.deleteAll(options?)`
Delete all pins from a scene (GM only). Useful for cleaning up scenes or resetting pin data.

**Returns**: `Promise<number>` - Number of pins deleted

```javascript
// Delete all pins on current scene
const count = await pinsAPI.deleteAll();
console.log(`Deleted ${count} pins`);

// Delete all pins on specific scene
await pinsAPI.deleteAll({ sceneId: 'some-scene-id' });
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `moduleId` (string, optional): filter by module ID (e.g., delete all pins for a specific module)
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if user is not a GM
- `Error` if scene not found

**Note**: This action is destructive and cannot be undone. Consider using `pins.deleteAllByType()` for more selective deletion.

```javascript
// Delete all pins on current scene
const count = await pinsAPI.deleteAll();

// Delete all pins for a specific module
await pinsAPI.deleteAll({ moduleId: 'coffee-pub-squire' });

// Delete all pins for a module on a specific scene
await pinsAPI.deleteAll({ sceneId: 'some-scene-id', moduleId: 'my-module' });
```

### `pins.deleteAllByType(type, options?)`
Delete all pins of a specific type from a scene (GM only). Useful for cleaning up specific pin categories (e.g., all 'note' pins, all 'quest' pins).

**Returns**: `Promise<number>` - Number of pins deleted

```javascript
// Delete all 'note' pins
const count = await pinsAPI.deleteAllByType('note');
console.log(`Deleted ${count} note pins`);

// Delete all 'quest' pins on specific scene
await pinsAPI.deleteAllByType('quest', { sceneId: 'some-scene-id' });

// Delete all pins with default type
await pinsAPI.deleteAllByType('default');
```

**Parameters**:
- `type` (string, required): Pin type to delete (e.g., 'note', 'quest', 'default')

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `moduleId` (string, optional): filter by module ID (e.g., delete all 'note' pins for a specific module)
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if user is not a GM
- `Error` if type is not a non-empty string
- `Error` if scene not found

**Note**: Pins without a type are treated as type 'default'. This action is destructive and cannot be undone.

```javascript
// Delete all 'note' pins
const count = await pinsAPI.deleteAllByType('note');

// Delete all 'quest' pins for a specific module
await pinsAPI.deleteAllByType('quest', { moduleId: 'coffee-pub-squire' });

// Delete all 'default' pins for a module on a specific scene
await pinsAPI.deleteAllByType('default', { sceneId: 'some-scene-id', moduleId: 'my-module' });
```

### `pins.createAsGM(sceneId, pinData, options?)`
Create a pin as GM, bypassing permission checks. Only GMs can call this method directly.

**Returns**: `Promise<PinData>` - Created pin data

```javascript
// GM creates a pin directly
const pin = await pinsAPI.createAsGM(sceneId, {
  id: crypto.randomUUID(),
  x: 1200,
  y: 900,
  moduleId: 'my-module',
  type: 'note'
});
```

**Parameters**:
- `sceneId` (string, required): Target scene ID
- `pinData` (object, required): Pin data (same as `create()`)
- `options` (object, optional): Additional options (same as `create()`)

**Throws**: 
- `Error` if user is not a GM
- `Error` if pin data is invalid
- `Error` if scene not found

**Note**: This method is primarily used internally by `requestGM()`. For non-GM users, use `requestGM('create', ...)` instead.

### `pins.updateAsGM(sceneId, pinId, patch, options?)`
Update a pin as GM, bypassing permission checks. Only GMs can call this method directly.

**Returns**: `Promise<PinData | null>` - Updated pin data or null if not found

```javascript
// GM updates a pin directly
const updated = await pinsAPI.updateAsGM(sceneId, pinId, { text: 'Updated text' });
```

**Parameters**:
- `sceneId` (string, required): Target scene ID
- `pinId` (string, required): Pin ID to update
- `patch` (object, required): Update patch (same as `update()`)
- `options` (object, optional): Additional options (same as `update()`)

**Throws**: 
- `Error` if user is not a GM
- `Error` if patch data is invalid
- `Error` if scene not found

**Note**: This method is primarily used internally by `requestGM()`. For non-GM users, use `requestGM('update', ...)` instead.

### `pins.deleteAsGM(sceneId, pinId, options?)`
Delete a pin as GM, bypassing permission checks. Only GMs can call this method directly.

**Returns**: `Promise<void>`

```javascript
// GM deletes a pin directly
await pinsAPI.deleteAsGM(sceneId, pinId);
```

**Parameters**:
- `sceneId` (string, required): Target scene ID
- `pinId` (string, required): Pin ID to delete
- `options` (object, optional): Additional options (same as `delete()`)

**Throws**: 
- `Error` if user is not a GM
- `Error` if pin not found
- `Error` if scene not found

**Note**: This method is primarily used internally by `requestGM()`. For non-GM users, use `requestGM('delete', ...)` instead.

### `pins.requestGM(action, params)`
Request a GM to perform a pin action (for non-GM users). Uses socket system to forward request to GM. If the caller is already a GM, executes directly without socket overhead.

**Returns**: `Promise<PinData | number | void>` - Result depends on action type

```javascript
// Non-GM requests pin creation
const pin = await pinsAPI.requestGM('create', {
  sceneId: canvas.scene.id,
  payload: {
    id: crypto.randomUUID(),
    x: 1200,
    y: 900,
    moduleId: 'my-module',
    type: 'note'
  }
});

// Non-GM requests pin update
await pinsAPI.requestGM('update', {
  sceneId: canvas.scene.id,
  pinId: 'pin-id',
  patch: { text: 'Updated text' }
});

// Non-GM requests pin deletion
await pinsAPI.requestGM('delete', {
  sceneId: canvas.scene.id,
  pinId: 'pin-id'
});
```

**Parameters**:
- `action` (string, required): Action type - `'create'`, `'update'`, or `'delete'`
- `params` (object, required): Action parameters
  - `sceneId` (string, required): Target scene
  - `pinId` (string, optional): Pin ID (required for 'update' and 'delete')
  - `payload` (object, optional): Pin data (required for 'create')
  - `patch` (object, optional): Update patch (required for 'update')
  - `options` (object, optional): Additional options

**Throws**: 
- `Error` if no GM is online
- `Error` if socket system not available
- `Error` if action parameters are invalid
- `Error` if GM execution fails

**Behavior**:
- If caller is already GM, executes directly (no socket call)
- If caller is not GM, forwards request to GM via socket
- Requires at least one active GM to be online
- Uses SocketLib's `executeAsGM()` if available, otherwise falls back to broadcast pattern

**Use Case**: Allows players to request pin actions that require GM permissions, enabling modules to implement player-initiated pin operations that are executed by GMs.

### `pins.reconcile(options)`
Reconcile module-tracked pin IDs with actual pins on canvas. Helps modules repair broken links between their data and pins.

**Returns**: `Promise<{ linked: number; unlinked: number; repaired: number; errors: string[] }>`

```javascript
// Reconcile note flags with pins
const results = await pinsAPI.reconcile({
  sceneId: canvas.scene.id,
  moduleId: 'coffee-pub-squire',
  items: journalEntries, // Array of journal entries that track pin IDs
  getPinId: (entry) => entry.flags?.['coffee-pub-squire']?.pinId || null,
  setPinId: (entry, pinId) => {
    if (!entry.flags) entry.flags = {};
    if (!entry.flags['coffee-pub-squire']) entry.flags['coffee-pub-squire'] = {};
    entry.flags['coffee-pub-squire'].pinId = pinId;
  },
  setSceneId: (entry, sceneId) => {
    if (!entry.flags) entry.flags = {};
    if (!entry.flags['coffee-pub-squire']) entry.flags['coffee-pub-squire'] = {};
    entry.flags['coffee-pub-squire'].sceneId = sceneId;
  }
});

console.log(`Linked: ${results.linked}, Unlinked: ${results.unlinked}, Repaired: ${results.repaired}`);
if (results.errors.length > 0) {
  console.warn('Reconciliation errors:', results.errors);
}
```

**Parameters**:
- `options` (object, required): Reconciliation options
  - `sceneId` (string | string[], optional): Scene ID(s) to reconcile (defaults to active scene)
  - `moduleId` (string, required): Module ID to filter pins
  - `items` (Array, required): Array of items that track pin IDs
  - `getPinId` (Function, required): Function to get pinId from item: `(item) => string | null`
  - `setPinId` (Function, required): Function to set pinId on item: `(item, pinId) => void`
  - `setSceneId` (Function, optional): Function to set sceneId on item: `(item, sceneId) => void`
  - `setPosition` (Function, optional): Function to set position on item: `(item, x, y) => void`

**Returns**:
- `linked` (number): Number of items successfully linked to existing pins
- `unlinked` (number): Number of items that had pin IDs but pins no longer exist (unlinked)
- `repaired` (number): Number of items that had incorrect sceneId or position (repaired)
- `errors` (string[]): Array of error messages encountered during reconciliation

**Throws**: 
- `Error` if moduleId is missing or invalid
- `Error` if items is not an array
- `Error` if getPinId or setPinId are not functions
- `Error` if no scene ID provided and no active scene

**Behavior**:
- For each item, checks if the tracked pin ID exists on the canvas
- If pin doesn't exist, clears the pin ID from the item (unlinks)
- If pin exists, ensures item is properly linked
- Optionally repairs sceneId and position if those functions are provided
- Logs orphaned pins (pins that exist but aren't tracked by any item) for GM awareness

**Use Case**: When modules store pin IDs in their own data structures (e.g., journal entry flags), this method helps repair broken links when pins are deleted or moved between scenes.

### `pins.configure(pinId, options?)`
Open the pin configuration window for a pin. This provides a user-friendly interface to edit all pin properties.

**Returns**: `Promise<Application>` - The opened window instance

```javascript
// Open configuration window for a pin
const window = await pinsAPI.configure(pinId);

// Open configuration window for a pin on a specific scene
await pinsAPI.configure(pinId, { sceneId: 'some-scene-id' });

// Open with callback to receive configuration data
await pinsAPI.configure(pinId, {
    sceneId: 'some-scene-id',
    onSelect: (configData) => {
        console.log('Pin configured:', configData);
        // Use the configuration data in your module
    }
});

// Open with "Use as Default" toggle enabled
await pinsAPI.configure(pinId, {
    moduleId: 'my-module',
    defaultSettingKey: 'defaultPinDesign',
    useAsDefault: true
});
```

**Parameters**:
- `pinId` (string, required): Pin ID to configure
- `options` (object, optional): Options
  - `sceneId` (string, optional): Scene ID (defaults to active scene)
  - `onSelect` (Function, optional): Callback function called when configuration is saved. Receives the configuration data object as parameter.
  - `useAsDefault` (boolean, optional): Show "Use as Default" toggle in the window header (default: `false`)
  - `defaultSettingKey` (string, optional): Module setting key where default configuration will be saved when "Use as Default" is enabled
  - `moduleId` (string, optional): Calling module ID (required if `useAsDefault` is `true`)

**Throws**: 
- `Error` if pin not found
- `Error` if user doesn't have permission to edit the pin
- `Error` if Pins API not available

**Behavior**:
- Opens an Application V2 window with a form for editing pin properties
- Only users who can edit the pin (based on ownership) can open the configuration window
- The window includes fields for:
  - **Appearance**: Shape, size, colors (fill, stroke), stroke width, opacity, drop shadow
  - **Icon/Image**: Font Awesome icon or image URL (toggle between icon library and image URL)
  - **Text**: Content, layout (under/over/around), display mode (always/hover/never/gm), color, size, max length, scaling
  - **Metadata**: Pin type/category
  - **Ownership** (GM only): Default ownership level and user-specific ownership levels
- Changes are saved via `pins.update()` when the form is submitted
- If `onSelect` callback is provided, it is called with the configuration data after saving
- If `useAsDefault` is enabled and `defaultSettingKey` and `moduleId` are provided, the configuration can be saved as a module default setting
- The window is also accessible via the right-click context menu ("Configure Pin")

**Note**: The configuration window is automatically added to the pin context menu for users who can edit the pin. The window uses the same styling and structure as other Blacksmith windows (targets `div#blacksmith-pin-config` and `.window-content`).

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

// Can also use pins.exists() to just check existence
if (pins.exists('my-pin-id')) {
    console.log('Pin exists');
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
- `type` (string, optional): filter by pin type (e.g., 'note', 'quest', 'default')

**Throws**: 
- `Error` if scene not found

```javascript
// List all pins
const allPins = pinsAPI.list();

// List pins by module
const myPins = pinsAPI.list({ moduleId: 'my-module' });

// List pins by type
const notePins = pinsAPI.list({ type: 'note' });

// List pins by module and type
const questPins = pinsAPI.list({ moduleId: 'coffee-pub-squire', type: 'quest' });
```

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
Pan the canvas to center on a pin's location. Useful for navigating to pins from other UI elements (e.g., clicking a note in a journal to pan to its associated pin). Optionally ping the pin after panning to draw attention.

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

// Pan and ping with default animation (scale-large + ripple combo)
await pins.panTo(pinId, { ping: true });

// Pan and ping with custom animation (blacksmith sound)
await pins.panTo(pinId, { 
    ping: { 
        animation: 'ripple', 
        loops: 3,
        sound: 'interface-notification-01'
    } 
});

// Or with custom sound from your module
await pins.panTo(pinId, { 
    ping: { 
        animation: 'ripple', 
        loops: 3,
        sound: 'modules/my-module/sounds/ping.mp3'
    } 
});

// Bring all players to this pin (broadcast) with ping
await pins.panTo(pinId, { 
    broadcast: true,
    ping: { animation: 'ping', loops: 1 }
});
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `broadcast` (boolean, optional): If `true`, pan all connected users to the pin (default: `false`). Only users who can see the pin (based on `ownership`) will be panned. The sender is also panned.
- `ping` (boolean|object, optional): ping the pin after panning
  - If `true`: uses default 'ping' animation (combo: scale-large with sound, then ripple)
  - If object: passes options to `ping()` method (see below)

**Throws**: 
- No errors thrown; returns `false` if pin not found or canvas not ready

### `pins.ping(pinId, options)`
Ping (animate) a pin to draw attention to it. Useful for highlighting pins, showing navigation targets, or responding to game events.

**Returns**: `Promise<void>`

```javascript
// Ping animation (recommended for navigation - combo with sound)
await pins.ping(pinId, { animation: 'ping', loops: 1 });

// Pulse animation (2 loops)
await pins.ping(pinId, { animation: 'pulse', loops: 2 });

// Ripple animation with sound (blacksmith sound name)
await pins.ping(pinId, { 
    animation: 'ripple', 
    loops: 1,
    sound: 'interface-ping-01'
});

// Or with full path
await pins.ping(pinId, { 
    animation: 'ripple', 
    loops: 1,
    sound: 'modules/my-module/sounds/alert.mp3'
});

// Scale animation
await pins.ping(pinId, { animation: 'scale-large', loops: 3 });

// Broadcast to all users (not yet implemented - logs warning)
await pins.ping(pinId, { 
    animation: 'glow', 
    loops: 1,
    broadcast: true 
});
```

**Options** (all required except as noted):
- `animation` (string, **required**): Animation type
  - `'ping'`: **Combo animation** - scale-large with sound + ripple (recommended for navigation and attention)
  - `'pulse'`: Pulsing border
  - `'ripple'`: Expanding circle emanating from pin
  - `'flash'`: Opacity flash
  - `'glow'`: Glowing border effect
  - `'bounce'`: Vertical bounce
  - `'scale-small'`: Subtle grow/shrink (1x → 1.15x → 1x)
  - `'scale-medium'`: Moderate grow/shrink (1x → 1.35x → 1x)
  - `'scale-large'`: Dramatic grow/shrink (1x → 1.6x → 1x)
  - `'rotate'`: 360-degree rotation
  - `'shake'`: Horizontal jiggle
- `loops` (number, optional): Number of times to loop animation (default: 1)
- `broadcast` (boolean, optional): If `true`, show animation to all users who can see the pin (default: `false`). Uses Blacksmith socket system. Only users with view permissions for the pin will see the animation.
- `sound` (string, optional): Sound to play once. Can be:
  - Blacksmith sound name: `'interface-ping-01'` (auto-resolves to `modules/coffee-pub-blacksmith/sounds/interface-ping-01.mp3`)
  - Full path: `'modules/my-module/sounds/ping.mp3'`
  - URL: `'https://example.com/sound.mp3'`

**Notes**:
- The `'ping'` animation automatically includes the default sound (`'interface-ping-01'`) unless a custom `sound` is provided
- Sounds play once regardless of loops
- Broadcast respects pin visibility: only users who can view the pin (based on `ownership` property) will see the animation
- Broadcasting requires the Blacksmith socket system to be initialized
- The sender of a broadcast also sees the animation locally
- Animations are defined in `styles/pins.css` with CSS keyframes
- Ripple creates a temporary DOM element that is removed after animation completes

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
- Ownership can be explicitly provided in pin data, or resolved automatically using the ownership resolver hook.
- **Visibility Filtering**: Pins are automatically filtered during rendering based on ownership. Only pins the current user has permission to view (LIMITED level or higher) are displayed on the canvas.

### Ownership Resolver Hook

The pins API supports an ownership resolver hook that allows modules to customize how pin ownership is determined when creating or updating pins. This is useful when ownership should be derived from module-specific data (e.g., note visibility, quest state, etc.).

**Hook Name**: `blacksmith.pins.resolveOwnership`

**Hook Signature**: 
```javascript
Hooks.on('blacksmith.pins.resolveOwnership', (context) => {
  // Return ownership object or null/undefined to use default
  return { default: 1, users: { 'user-id': 2 } };
});
```

**Context Object**:
```javascript
{
  moduleId: string,      // Module creating/updating the pin
  userId: string,        // User performing the action
  sceneId: string,       // Scene ID
  metadata: object       // Additional metadata from pin.config
}
```

**Return Value**:
- Return an ownership object: `{ default: number, users?: Record<string, number> }` - This ownership will be used
- Return `null` or `undefined` - Default ownership will be used (GM-only: `{ default: 0 }`)

**Example Usage**:
```javascript
// Register ownership resolver for your module
Hooks.on('blacksmith.pins.resolveOwnership', (context) => {
  // Only resolve for your module
  if (context.moduleId !== 'coffee-pub-squire') {
    return null; // Use default
  }
  
  // Get note visibility from metadata
  const noteVisibility = context.metadata?.noteVisibility || 'gm-only';
  
  // Map note visibility to pin ownership
  switch (noteVisibility) {
    case 'visible':
      return { default: 2 }; // OBSERVER - all users can see
    case 'limited':
      return { default: 1 }; // LIMITED - all users can see
    case 'gm-only':
    default:
      return { default: 0 }; // NONE - GM only
  }
});
```

**When the Hook is Called**:
- During `pins.create()` - If ownership is not explicitly provided in pinData
- During `pins.update()` - If ownership is being updated in the patch

**Priority**:
1. Explicit ownership in pinData/patch (highest priority)
2. Ownership resolver hook result
3. Default ownership: `{ default: 0 }` (GM-only)

#### Ownership Levels
- **NONE (0)**: User cannot see the pin (GM-only)
- **LIMITED (1)**: User can see the pin
- **OBSERVER (2)**: User can see the pin (standard visibility)
- **OWNER (3)**: User can see and edit the pin (if `pinsAllowPlayerWrites` is enabled)

#### Ownership Examples

**GM-Only Pin** (hidden from all players):
```javascript
await pins.create({
  id: 'secret-pin',
  x: 1000,
  y: 1500,
  moduleId: 'my-module',
  ownership: { default: 0 }  // NONE - only GMs can see
});
```

**Visible to Everyone**:
```javascript
await pins.create({
  id: 'quest-marker',
  x: 1000,
  y: 1500,
  moduleId: 'my-module',
  ownership: { default: 2 }  // OBSERVER - all users can see
});
```

**Visible to Specific User Only**:
```javascript
await pins.create({
  id: 'player-note',
  x: 1000,
  y: 1500,
  moduleId: 'my-module',
  ownership: { 
    default: 0,                    // NONE - hidden by default
    'user-abc-123': 2              // This specific user can see it
  }
});
```

**Visible to All, Editable by One Player**:
```javascript
await pins.create({
  id: 'shared-marker',
  x: 1000,
  y: 1500,
  moduleId: 'my-module',
  ownership: { 
    default: 2,                    // OBSERVER - everyone can see
    'user-abc-123': 3              // This user can edit (if pinsAllowPlayerWrites enabled)
  }
});
```

### Context Menu

Pins have a right-click context menu with the following options:

**Available to All Users:**
- **Ping Pin**: Animates the pin to draw attention (combo animation: scale-large + ripple with sound)

**Available to Users with Edit Permissions:**
- **Delete Pin**: Deletes the individual pin

**GM-Only Options** (appear below a separator):
- **Delete All "[type]" Pins**: Deletes all pins of the same type as the clicked pin (e.g., "Delete All 'note' Pins"). Shows a confirmation dialog.
- **Delete All Pins**: Deletes all pins on the current scene. Shows a confirmation dialog.

**Module-Registered Items:**
- Modules can register custom context menu items using `pins.registerContextMenuItem()`. These appear above the separator, before the built-in options.

**Note**: GM bulk delete operations require confirmation via dialog to prevent accidental deletion. The "Delete All of Type" option only appears if there are pins of that type on the scene.

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

## CSS Customization

Pin appearance can be customized globally via CSS variables in `styles/pins.css`:

```css
:root {
  /* Icon size relative to pin size (default: 0.90 = 90% of pin diameter) */
  --blacksmith-pin-icon-size-ratio: 0.90;
  
  /* Border radius for square pins (default: 15%) */
  --blacksmith-pin-square-border-radius: 15%;
  
  /* Drop shadow for pins (default: subtle shadow for depth) */
  --blacksmith-pin-drop-shadow: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
```

**Customization Examples**:

```css
/* Stronger shadow */
:root {
  --blacksmith-pin-drop-shadow: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
}

/* No shadow globally (overrides dropShadow: true) */
:root {
  --blacksmith-pin-drop-shadow: none;
}

/* Larger icons */
:root {
  --blacksmith-pin-icon-size-ratio: 0.95;
}
```

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
- [x] Context menu (Phase 3.3): Default items (Ping Pin, Delete), context menu item registration system for modules
- [x] API: CRUD, `on()`, `registerContextMenuItem()`, `unregisterContextMenuItem()`, `reload()`, `refreshPin()`, `deleteAll()`, `deleteAllByType()`, `createAsGM()`, `updateAsGM()`, `deleteAsGM()`, `requestGM()`, `reconcile()`, `isAvailable()`, `isReady()`, `whenReady()`; `pinsAllowPlayerWrites` setting
- [x] Pin type system: Optional `type` field (defaults to 'default') for categorization and filtering; type-based filtering in `list()` method
- [x] GM bulk delete controls: Context menu items for "Delete All Pins" and "Delete All Pins of Type X" (GM only, with confirmation dialogs); supports `moduleId` filtering
- [x] GM proxy methods: `createAsGM()`, `updateAsGM()`, `deleteAsGM()` for direct GM execution; `requestGM()` for non-GM users to request GM actions via socket
- [x] Ownership resolver hook: `blacksmith.pins.resolveOwnership` hook for custom ownership mapping based on module-specific context
- [x] Reconciliation helper: `reconcile()` method for repairing broken links between module-tracked items and pins on canvas
- [x] Pin storage in scene flags; migration and validation on load
- [x] Shape support: circle (default), square (rounded corners), none (icon only)
- [x] Color support: hex, rgb, rgba, hsl, hsla, named colors
- [x] Image support: Font Awesome HTML, Font Awesome class strings, image URLs, `<img>` tags
- [x] CSS configuration: Image size ratio, border radius, all styling in `pins.css`
- [x] Phase 4.1: API usage patterns documented; availability checks (`isAvailable` / `isReady` / `whenReady`) implemented
- [ ] Full automated tests and remaining Phase 4–5 items (see `plans-pins.md`)
