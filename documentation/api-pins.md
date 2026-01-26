# Canvas Pins API Documentation

> **Status**: Phases 1–3 complete. Pins render using pure DOM approach (no PIXI), support Font Awesome icons and image URLs, support multiple shapes (circle, square, none), and dispatch hover/click/double-click/right-click/middle-click/drag events. Context menu registration system allows modules to add custom menu items. Pin animation system (`ping()`) with 11 animation types (including 'ping' combo) and sound support. Automatic visibility filtering based on ownership permissions. Phase 4–5 (docs, tests) remain.

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
  image: '<i class="fa-solid fa-star"></i>',  // optional; Font Awesome HTML, Font Awesome class string, or image URL
  shape: 'circle',  // optional; 'circle' (default), 'square', or 'none' (icon only)
  dropShadow: true,  // optional; adds subtle drop shadow (default: true)
  textLayout: 'under',  // optional; 'under' (text below icon, default) or 'around' (text centered over icon)
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
- Ownership should be supplied by the calling module per its needs; Blacksmith enforces and validates it.
- **Visibility Filtering**: Pins are automatically filtered during rendering based on ownership. Only pins the current user has permission to view (LIMITED level or higher) are displayed on the canvas.

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
- [x] API: CRUD, `on()`, `registerContextMenuItem()`, `unregisterContextMenuItem()`, `reload()`, `isAvailable()`, `isReady()`, `whenReady()`; `pinsAllowPlayerWrites` setting
- [x] Pin storage in scene flags; migration and validation on load
- [x] Shape support: circle (default), square (rounded corners), none (icon only)
- [x] Color support: hex, rgb, rgba, hsl, hsla, named colors
- [x] Image support: Font Awesome HTML, Font Awesome class strings, image URLs, `<img>` tags
- [x] CSS configuration: Image size ratio, border radius, all styling in `pins.css`
- [x] Phase 4.1: API usage patterns documented; availability checks (`isAvailable` / `isReady` / `whenReady`) implemented
- [ ] Full automated tests and remaining Phase 4–5 items (see `plans-pins.md`)
