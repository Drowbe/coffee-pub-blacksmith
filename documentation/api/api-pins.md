# Canvas Pins API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

> **Remaining work** (tests, deeper profile/search UX, and follow-on phases) is tracked in `architecture-pins.md`, `TODO.md`, and `plan-pins.md`.
>
> **Feature summary:**
> - **Rendering**: Pure DOM overlay (no PIXI). Shapes: `circle`, `square`, `none`. Icons: Font Awesome class strings or image URLs. Text labels with 7 layout modes and 4 display modes.
> - **Placement model**: Pins exist in two stores — *placed* (on a scene, stored in scene flags) or *unplaced* (data-only, stored in a world setting). Create without `sceneId`/x/y to keep unplaced; use `place()` / `unplace()` to move between stores.
> - **Classification**: Coarse `type` (displayed as "Category") + fine-grained `tags[]`. The old `group` field is removed (v4 schema auto-migrates existing values into tags).
> - **Events**: `hover`, `click`, `doubleClick`, `rightClick`, `middleClick`, `drag*` — scoped by `pinId`, `moduleId`, or `sceneId`. Cleaned up via disposer or `AbortSignal`.
> - **Animations**: `ping()` with 11 types, broadcast support, loop control. Optional per-pin event animations (hover, click, double-click, add, delete) with sound.
> - **Visibility**: Ownership-based rendering filter + per-user client-side filters (`setGlobalVisibility`, `setModuleVisibility`, `setTagVisibility`) + named profiles (including built-in **All Pins** / **No Pins**). `config.blacksmithVisibility` (`'visible'` / `'hidden'` / `'owner'`) controls map visibility for non-GMs independently of ownership; GMs still see hidden pins with an affordance.
> - **Taxonomy**: Built-in `pin-taxonomy.json` (v3 format). Modules register taxonomy via `registerPinTaxonomy()`. Read back with `getModuleTaxonomy(moduleId)` (all types) or `getPinTaxonomy(moduleId, type)` (one type). World-level tag registry tracks every tag ever used.
> - **GM tools**: Bulk delete (`deleteAll`, `deleteAllByType`), GM proxy (`requestGM`), ownership resolver hook, reconciliation helper, **Manage Pins** window (`openLayers()`) with taxonomy visibility, browse/tag management, custom tag administration, and saved profiles.
> - **Configure Pin window**: Full visual editor — Design, Text, Animations, Source, Permissions (ownership + Player Visibility + Allow Duplicates), Classification. "Update All [type] Pins" with tag-scoped filter. "Default for [type]" with per-section checkboxes.

## Overview

The Canvas Pins API provides a system for creating, managing, and interacting with configurable pins. Pins exist in two stores:

- **Placed** — on a scene, stored in scene flags, rendered on the canvas. A placed pin has `sceneId`, `x`, and `y`.
- **Unplaced** — data-only, stored in a world setting, not visible on any canvas. An unplaced pin has no `sceneId` or coordinates.

Use whichever model fits your module's workflow. Map-centric modules (waypoints, encounter markers) typically create pins directly on the scene. Compendium-style modules (journals, quests, NPCs) often create pins unplaced and let the GM drag them onto the current scene via the Layers window — or your module can call `place()` programmatically.

### Placement API

- **Create placed**: Pass `sceneId`, `x`, and `y` in `pinData`.
- **Create unplaced**: Omit `sceneId`, `x`, and `y`. The pin is stored in the world setting.
- **Place an unplaced pin**: `place(pinId, { sceneId, x, y })` moves it onto a scene.
- **Unplace a pin**: `unplace(pinId)` removes it from the canvas but keeps its data.
- **Lookup by ID**: `get(pinId)` and `exists(pinId)` without `sceneId` search the unplaced store first, then all scenes — you can resolve a pin without knowing its placement state.
- **List unplaced only**: `list({ unplacedOnly: true })` returns only unplaced pins. Combine with `moduleId` or `type` as needed.
- **Delete**: `delete(pinId)` works for both stores. Without `sceneId`, the API searches unplaced then all scenes.

## Implementation Structure

The pins API follows Blacksmith's standard pattern:
- **`scripts/pins-schema.js`** - Data model, validation, migration (Phase 1.1)
- **`scripts/manager-pins.js`** - Internal manager with CRUD, permissions, event handler registration, and context menu item registration (Phase 1.2, 1.3)
- **`scripts/pins-renderer.js`** - Pure DOM pin rendering (circle/square/none + Font Awesome icons or image URLs), DOM events, context menu (Phase 2, 3)
- **`scripts/api-pins.js`** - Public API wrapper (`PinsAPI`) exposing CRUD, `place()`, `unplace()`, `on()`, `registerContextMenuItem()`, `registerPinType()`, taxonomy helpers (`loadBuiltinTaxonomy()`, `registerPinTaxonomy()`, `getPinTaxonomy()`, `getPinTaxonomyChoices()`, `getModuleTaxonomy()`), `getPinTypeLabel()`, `reload()`, `refreshPin()`, `deleteAll()`, `deleteAllByType()`, `createAsGM()`, `updateAsGM()`, `deleteAsGM()`, `requestGM()`, `reconcile()`, `openLayers()`, visibility filters (`setGlobalVisibility`, `setModuleVisibility`, `setTagVisibility`), named profile helpers (`listVisibilityProfiles()`, `saveVisibilityProfile()`, `applyVisibilityProfile()`, `deleteVisibilityProfile()`, `getActiveVisibilityProfileName()`), `getSceneFilterSummary()`, tag registry helpers (`getTagRegistry()`, `addTagToRegistry()`, `stripTagFromScene()`, `stripTagFromAllScenes()`, `deleteTagGlobally()`, `renameTagGlobally()`, `seedTagRegistryIfEmpty()`), `isAvailable()`, `isReady()`, `whenReady()`. **Note**: `setGroupVisibility`/`getGroupVisibility` removed — groups have been replaced by tags.
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
7. **Register pin types with friendly names**: If your module uses multiple pin types (e.g. sticky-notes vs pins), call `pins.registerPinType(moduleId, type, friendlyName)` so context menus, tools, and other UI show the name you provide (e.g. "Squire Sticky Notes") instead of inferring a label. See [Registering pin types (friendly names)](#registering-pin-types-friendly-names).
8. **Use `tags[]` for user-facing classification**: Keep `type` coarse/technical (it's your module's category key), and use `tags[]` for fine-grained filterable labels. Groups have been removed — any group values on old pins are automatically migrated into tags on schema upgrade.

#### Registering pin types (friendly names)

Modules that create pins should pass three things so we don't assume labels anywhere in the pins system:

1. **Module id** – your module id (e.g. `'squire'`).
2. **Pin type** – internal key (e.g. `'sticky-notes'`, `'pins'`). Stored on each pin as `pin.type`; used for filtering and grouping.
3. **Friendly name** – display string (e.g. `"Sticky Notes"` or `"Squire Sticky Notes"`). This is what appears in context menus, tools, and any other pins UI.

Register the friendly name when your module initializes:

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (pins?.isAvailable()) {
  pins.registerPinType('squire', 'sticky-notes', 'Squire Sticky Notes');
  pins.registerPinType('squire', 'pins', 'Squire Pins');
}
```

Anywhere the pins system needs to show a label for a (moduleId, type) pair, it uses `pins.getPinTypeLabel(moduleId, type)`. If you didn't register a friendly name, the system does not assume one—callers may fall back to the raw type or an empty string.

#### Example: create unplaced pin, then optionally place (recommended pattern)

```javascript
Hooks.once('init', async () => {
  const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pins?.isAvailable()) return;

  // Create unplaced pin (no sceneId, x, or y) — normal case
  const pin = await pins.create({
    id: crypto.randomUUID(),
    moduleId: 'my-module',
    type: 'note',
    text: 'Test pin',
    image: '<i class="fa-solid fa-star"></i>'
  });

  // Optionally place on current scene when canvas is ready
  await pins.whenReady();
  if (canvas?.scene) {
    const dims = canvas.dimensions ?? {};
    const cx = (dims.width ?? 2000) / 2;
    const cy = (dims.height ?? 2000) / 2;
    await pins.place(pin.id, { sceneId: canvas.scene.id, x: cx, y: cy });
    // reload() not needed — place() updates the renderer automatically on the active scene
  }
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

  // List placed pins on active scene, or unplaced only
  const list = pins.list({ moduleId: MODULE_ID });
  const unplaced = pins.list({ unplacedOnly: true, moduleId: MODULE_ID });
  console.log('My pins on scene:', list.length, 'unplaced:', unplaced.length);

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

`x`, `y`, and `sceneId` are optional. Omit them for unplaced pins.

```typescript
interface PinData {
  id: string; // UUID
  x?: number;   // Omit for unplaced pins
  y?: number;   // Omit for unplaced pins
  sceneId?: string;  // Not persisted on stored pins; use findScene() to resolve placement (used only in placement patches)
  size?: { w: number; h: number };
  style?: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number; iconColor?: string }; // Supports hex, rgb, rgba, hsl, hsla, named colors. iconColor applies to Font Awesome icons (default '#ffffff').
  text?: string; // Text label content
  image?: string;  // Font Awesome HTML (e.g. '<i class="fa-solid fa-star"></i>'), Font Awesome class string (e.g. 'fa-solid fa-star'), or image URL (e.g. 'icons/svg/star.svg' or '<img src="path/to/image.webp">')
  iconText?: string; // Text to display in pin center instead of icon/image; inherits icon styling (iconColor, scaling). Takes precedence over image when set.
  shape?: 'circle' | 'square' | 'none'; // Pin shape: 'circle' (default), 'square' (rounded corners), or 'none' (icon only, no background)
  dropShadow?: boolean; // Whether to show drop shadow (default: true) - controlled via CSS variable --blacksmith-pin-drop-shadow
  textLayout?: 'under' | 'over' | 'above' | 'right' | 'left' | 'arc-above' | 'arc-below'; // Text layout: 'under' (below), 'over' (centered over), 'above' (above pin), 'right' (right of pin, left-aligned), 'left' (left of pin, right-aligned), 'arc-above' (curved above pin), 'arc-below' (curved below pin). Legacy 'around' is accepted and treated as 'arc-below'.
  textDisplay?: 'always' | 'hover' | 'never' | 'gm'; // Text display mode: 'always' (default), 'hover' (show on hover), 'never', or 'gm' (GM only)
  textColor?: string; // Text color (default: '#ffffff') - supports hex, rgb, rgba, hsl, hsla, named colors
  textSize?: number; // Text size in pixels (default: 12)
  textMaxLength?: number; // Maximum text length before ellipsis (default: 0 = no limit)
  textMaxWidth?: number; // Max characters per line before wrap (default: 0 = single line); break at word boundary. For arc layouts, used as a character-based or pixel-based line budget that scales with arc radius (outer arcs fit more text).
  textScaleWithPin?: boolean; // Whether text scales with pin size based on zoom (default: true). If false, text stays fixed size.
  type?: string; // Pin category key (e.g., 'note', 'quest', 'location', 'npc'). Defaults to 'default'. Used for coarse filtering and organization. Displayed in the Pins window as "Category".
  tags?: string[]; // User-facing classification tags. Supports registered and freeform values; normalized to lowercase kebab-case. Use tags for all fine-grained filtering — the old `group` field was removed (v4 schema auto-migrates group values into tags).
  allowDuplicatePins?: boolean; // If true, the same source (e.g. one journal page) may have multiple pins on the map; if false (default), one pin per source (creating replaces existing). Configurable in Configure Pin > Permissions.
  imageFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down' | 'zoom'; // Controls how image URLs are sized inside the pin element (default: 'cover'). 'cover' fills the pin dimensions, cropping if needed. 'contain' letterboxes to preserve aspect ratio. 'none' renders at natural size. 'zoom' uses imageZoom to scale beyond cover. Ignored for Font Awesome icons.
  imageZoom?: number; // Scale multiplier when imageFit is 'zoom' (default: 1, clamped 1–2). 1 = same as cover, 1.5 = 50% zoom in. Ignored for other imageFit values.
  config?: {
    blacksmithVisibility?: 'visible' | 'hidden' | 'owner'; // Map visibility for non-GMs: 'visible' (default), 'hidden' (players do not see the pin on the map), or 'owner' (only users who can edit the pin see it on the map). GM-only field. Separate from ownership. Editable in Configure Pin > Permissions or per-pin in Browse view.
    [key: string]: unknown;
  };
  moduleId: string; // consumer module id
  ownership?: { default: number; users?: Record<string, number> };
  eventAnimations?: {
    hover?: { animation?: string | null; sound?: string | null };
    click?: { animation?: string | null; sound?: string | null };
    doubleClick?: { animation?: string | null; sound?: string | null };
    add?: { animation?: string | null; sound?: string | null };
    delete?: { animation?: string | null; sound?: string | null };
  }; // Optional: play animation (and optional sound) on hover enter, click, double-click, when added to canvas, or before delete. See Event animations.
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

### Event animations

Pins can be configured to play an **animation** and optional **sound** when the user hovers (enter), clicks, double-clicks, or when the pin is deleted. Right-click is reserved for the context menu and does not trigger an event animation.

- **Storage**: Optional `eventAnimations` on pin data with keys `hover`, `click`, `doubleClick`, `add`, `delete`. Each value is `{ animation: string | null, sound: string | null }`. Omit or set to `null` for no animation/sound (default).
- **Interaction animations** (hover, click, double-click): Same set as `pins.ping()` — `ping`, `pulse`, `ripple`, `flash`, `glow`, `bounce`, `scale-small`, `scale-medium`, `scale-large`, `rotate`, `shake`. On hover enter the animation runs once (ease-out when pointer leaves). On click or double-click the animation runs once after the handler.
- **Delete animation**: Only `fade`, `dissolve`, or `scale-small`. When the pin is deleted (via context menu or API), if the pin is on the current scene and has a delete animation set, that animation runs (with optional sound), then the pin is removed from the canvas and data.
- **Sound**: Optional. Use a Blacksmith sound name (e.g. `interface-ping-01`) or a full path. Default is none. Applied per event (each of hover, click, double-click, add, delete can have its own sound or none).
- **Configuration**: The Configure Pin window includes an **Event Animations** section where users choose animation and sound for each of Hover, Click, Double-click, and Delete. Updates are applied via `pins.update(pinId, { eventAnimations: { ... } })`. Sound options are dropdowns populated from `pins.getSoundOptions()` (Blacksmith’s sound list).

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
// Create unplaced (normal case); optionally place when scene is ready
const pin = await pins.create({ id: crypto.randomUUID(), moduleId: 'my-module' });
if (canvas?.scene) {
  await pins.place(pin.id, { sceneId: canvas.scene.id, x: 1000, y: 800 });
  // reload() not needed — place() updates the renderer automatically on the active scene
}
```

### `pins.getSoundOptions()`
Returns the list of sounds for use in dropdowns (e.g. pin event animation sounds). Uses Blacksmith's sound asset list: "None" plus all sounds sorted by name.

**Returns**: `{ value: string, label: string }[]` — Array of options; `value: ''` is None, otherwise full path (e.g. `modules/coffee-pub-blacksmith/sounds/interface-ping-01.mp3`). Use in Configure Pin or custom UI when you need a sound selector.

```javascript
const options = game.modules.get('coffee-pub-blacksmith')?.api?.pins?.getSoundOptions() ?? [];
// options === [{ value: '', label: 'None' }, { value: 'modules/.../arrow.mp3', label: 'General: Arrow' }, ...]
```

### `pins.exists(pinId, options?)`
Check if a pin exists (unplaced or on a scene). When `sceneId` is omitted, the API checks the unplaced store first, then all scenes.

**Returns**: `boolean` - True if pin exists, false otherwise

```javascript
// Check if pin exists before creating (searches unplaced then all scenes)
if (!pins.exists('my-pin-id')) {
    await pins.create({
        id: 'my-pin-id',
        moduleId: 'my-module'
        // no x, y, sceneId → unplaced
    });
} else {
    console.log('Pin already exists, updating instead');
    await pins.update('my-pin-id', { text: 'Updated' });
}

// Create unplaced (primary pattern): no sceneId, x, or y
await pins.create({
    id: crypto.randomUUID(),
    moduleId: 'my-module',
    type: 'note',
    text: 'Important Note',
    image: '<i class="fa-solid fa-sticky-note"></i>'
});

// Check on a specific scene only
const existsOnOtherScene = pins.exists('my-pin-id', { sceneId: 'other-scene-id' });
```

**Options**:
- `sceneId` (string, optional): if provided, only that scene is checked; if omitted, lookup is unplaced then all scenes

**Throws**: 
- No errors thrown; returns `false` if scene not found when `sceneId` is provided

### `pins.create(pinData, options?)`
Create a pin. **Normal case: create unplaced** by omitting `sceneId`, `x`, and `y`. Optionally place at creation by passing `options.sceneId` and `x`/`y` in `pinData`.

**Returns**: `Promise<PinData>` - The created pin data with defaults applied

**Before creating**: Use `pins.exists(pinId)` to check if a pin with that ID already exists (searches unplaced then all scenes). If it does, use `pins.update()` instead, or generate a new unique ID (e.g., `crypto.randomUUID()`).

```javascript
// Primary pattern: create unplaced (no sceneId, x, or y)
const pin = await pinsAPI.create({
  id: crypto.randomUUID(),
  text: 'Forge',
  moduleId: 'my-module',
  type: 'note',  // optional; pin type/category (e.g., 'note', 'quest', 'location', 'npc'). Defaults to 'default' if not specified
  image: '<i class="fa-solid fa-star"></i>',  // optional; Font Awesome HTML, Font Awesome class string, or image URL
  shape: 'circle',  // optional; 'circle' (default), 'square', or 'none' (icon only)
  dropShadow: true,  // optional; adds subtle drop shadow (default: true)
  textLayout: 'under',  // optional; 'under' | 'over' | 'above' | 'right' | 'left' | 'arc-above' | 'arc-below'
  textDisplay: 'always',  // optional; 'always' (default), 'hover', 'never', or 'gm' (GM only)
  textColor: '#ffffff',  // optional; text color (default: '#ffffff')
  textSize: 12,  // optional; text size in pixels (default: 12)
  textMaxLength: 0,  // optional; max length before ellipsis (default: 0 = no limit)
  textMaxWidth: 0,  // optional; max chars per line before wrap, break at word (default: 0 = single line)
  size: { w: 48, h: 48 },  // optional; defaults to { w: 32, h: 32 }
  style: {  // optional; defaults shown (supports hex, rgb, rgba, hsl, hsla, named colors)
    fill: '#000000',  // or 'rgba(0, 0, 0, 0.5)' for transparency
    stroke: '#ffffff',  // or 'rgba(255, 255, 255, 0.8)'
    strokeWidth: 2,
    alpha: 1,  // Overall opacity (multiplies with RGBA alpha if color has alpha)
    iconColor: '#ffffff'  // Color of Font Awesome icon (ignored for image URLs)
  }
});
// Pin is unplaced. Call pins.place(pin.id, { sceneId, x, y }) when you want it on a scene.

// Create and place in one step (optional)
const placedPin = await pinsAPI.create({
  id: crypto.randomUUID(),
  x: 1200,
  y: 900,
  text: 'Forge',
  moduleId: 'my-module',
  type: 'note',
  image: '<i class="fa-solid fa-star"></i>'
}, { sceneId: canvas.scene?.id });
// reload() not needed — create() with sceneId updates the renderer automatically
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

// Pin with custom icon color (Font Awesome icons only; image URLs are not tinted)
const goldIconPin = await pinsAPI.create({
  id: 'gold-icon-pin',
  x: 1250,
  y: 1000,
  moduleId: 'my-module',
  image: '<i class="fa-solid fa-star"></i>',
  style: { iconColor: '#ffd700' }  // Gold icon; fill/stroke/alpha use defaults
});

// Pin with text as center content (instead of icon/image) - inherits icon styling
const textCenterPin = await pinsAPI.create({
  id: 'text-center-pin',
  x: 1275,
  y: 1000,
  moduleId: 'my-module',
  iconText: '1',  // Display "1" in pin center; uses iconColor, scales like icon
  style: { iconColor: '#ffffff' }  // Text color
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
  textMaxWidth: 20,  // Wrap at 20 characters per line (break at word)
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

// Pin with text curved in an arc below the pin (multi-line arcs supported; textMaxWidth controls wrapping)
const arcBelowPin = await pinsAPI.create({
  id: 'arc-below-pin',
  x: 1500,
  y: 1000,
  moduleId: 'my-module',
  text: 'WRAP YOUR TEXT IN AN ARC',
  textLayout: 'arc-below',  // Text curved below pin edge (use 'arc-above' for above)
  textDisplay: 'always',
  textColor: '#ffffff',
  textSize: 12,
  textMaxWidth: 20,  // optional; wrap into multiple arcs (line budget scales with radius)
  textScaleWithPin: true,  // Arc text always scales with pin
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
- `sceneId` (string, optional): if provided with x/y in pinData, the pin is placed on this scene at creation; if omitted (and no x/y), the pin is created unplaced
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin data is invalid
- `Error` if scene not found (when placing via `options.sceneId`)
- `Error` if permission denied
- `Error` if a pin with the same `id` already exists (unplaced or on a scene)

**Duplicate ID handling**: If you're not sure whether a pin ID exists, check first:
```javascript
// Option 1: Check before creating (recommended) — exists() searches unplaced then all scenes
if (!pins.exists('my-pin-id')) {
    await pins.create({ id: 'my-pin-id', moduleId: 'my-module' });  // unplaced
} else {
    // Pin exists - update it instead
    await pins.update('my-pin-id', { text: 'Updated' });
}

// Option 2: Use a unique ID (recommended for new pins)
await pins.create({ 
    id: crypto.randomUUID(),  // Always unique
    moduleId: 'my-module' 
});  // unplaced

// Option 3: Try/catch if you want to handle the error
try {
    await pins.create({ id: 'my-pin-id', moduleId: 'my-module' });
} catch (err) {
    if (err.message.includes('already exists')) {
        await pins.update('my-pin-id', { text: 'Updated' });
    } else {
        throw err;
    }
}
```

### `pins.update(pinId, patch, options?)`
Update properties for an existing pin (placed or unplaced). When `sceneId` is omitted, lookup is unplaced then all scenes. Automatically detects and handles icon/image type changes (e.g., switching from Font Awesome icon to image URL, or vice versa) by rebuilding the icon element when needed.

**Returns**: `Promise<PinData | null>` - The updated pin data, or `null` if pin not found

**Placement via patch**: To place an unplaced pin, include `{ sceneId, x, y }` in `patch`. To unplace a pin (remove from canvas but keep data), pass `patch.unplace === true`.

```javascript
// Update text
const updatedPin = await pinsAPI.update(pin.id, { text: 'Hot Forge' });

// Place an unplaced pin via update
await pinsAPI.update(pin.id, { sceneId: canvas.scene.id, x: 1200, y: 900 });
// reload() not needed — update() handles renderer automatically on the active scene

// Unplace a pin (remove from canvas, keep data)
await pinsAPI.update(pin.id, { unplace: true });

// Switch from icon to image (automatically handled)
await pinsAPI.update(pin.id, { 
    image: '<img src="icons/svg/treasure.svg">' 
});

// Switch from image to icon (automatically handled)
await pinsAPI.update(pin.id, { 
    image: '<i class="fa-solid fa-star"></i>' 
});

// Update icon color (Font Awesome icons only)
await pinsAPI.update(pin.id, { style: { iconColor: '#ffd700' } });
```

**Options**:
- `sceneId` (string, optional): target scene when you know where the pin is; if omitted, lookup is unplaced then all scenes
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if patch data is invalid
- `Error` if scene not found (when sceneId provided and scene doesn't exist)

**Note**: Returns `null` (instead of throwing) if pin not found anywhere (unplaced or on any scene), allowing calling modules to handle missing pins gracefully.

**Non-GM callers**: Placed pins are stored in scene flags; unplaced pins are stored in the world setting `pinsUnplaced`. Only GMs can write scene documents or world settings. When a non-GM with edit permission calls `update()`, Blacksmith routes the write through `requestGM` (action `'update'` for placed pins, `'updateUnplaced'` for unplaced pins) so the GM client performs the write. No world or scene setting write is attempted on the player client. A GM must be online for the update to succeed.

**Icon/Image Type Changes**: When updating the `image` property to change from an icon to an image (or vice versa), the renderer automatically detects the type change and rebuilds the icon element. No manual refresh or reload is needed.

### `pins.delete(pinId, options?)`
Delete a pin (placed or unplaced). When `sceneId` is omitted, the API searches the unplaced store first, then all scenes. Works for both unplaced and placed pins.

**Returns**: `Promise<void>`

```javascript
// Delete by ID — finds pin whether unplaced or on any scene
await pinsAPI.delete(pin.id);

// Delete from specific scene (when you know where it is)
await pinsAPI.delete(pin.id, { sceneId: 'some-scene-id' });
```

**Options**:
- `sceneId` (string, optional): if provided, only that scene is searched; if omitted, search is unplaced then all scenes
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found (unplaced or on any scene)
- `Error` if scene not found (when sceneId provided)
- `Error` if permission denied

### `pins.place(pinId, placement)`
Place an unplaced pin on a scene at the given coordinates. The pin must currently be unplaced. When placing onto the currently active scene, the renderer updates automatically — `pins.reload()` is **not** required. `reload()` is only needed if the Blacksmith layer container hasn't been initialized yet (i.e., the layer was never activated since page load).

**Returns**: `Promise<PinData | null>` - The updated pin data (with `sceneId`, `x`, `y` set), or `null` if the pin was not found or was not unplaced

**Parameters**:
- `pinId` (string, required): Pin ID to place
- `placement` (object, required): `{ sceneId: string, x: number, y: number }`

```javascript
// Create unplaced, then place when user chooses a scene/position
const pin = await pins.create({
  id: crypto.randomUUID(),
  moduleId: 'my-module',
  type: 'note',
  text: 'Quest Goal',
  image: '<i class="fa-solid fa-flag"></i>'
});
await pins.place(pin.id, { sceneId: canvas.scene.id, x: 1200, y: 900 });
// reload() not needed — the renderer updates automatically on the active scene
```

**Throws**: 
- `Error` if pin not found or pin is already placed
- `Error` if scene not found
- `Error` if permission denied

### `pins.unplace(pinId)`
Remove a pin from the canvas but keep its data. The pin becomes unplaced (no `sceneId`, and typically no `x`/`y`). The pin must currently be on a scene.

**Returns**: `Promise<PinData | null>` - The pin data after unplacing (no longer on a scene), or `null` if the pin was not found or was not placed

```javascript
// Unplace a pin (e.g. user removes it from map but keeps the note/quest)
const unplaced = await pins.unplace(pinId);
if (unplaced) {
  console.log('Pin is now unplaced, data preserved');
}
```

**Throws**: 
- `Error` if pin not found or pin is already unplaced
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
- `action` (string, required): Action type - `'create'`, `'update'`, `'updateUnplaced'`, `'place'`, `'unplace'`, or `'delete'`
- `params` (object, required): Action parameters
  - `sceneId` (string, optional): Target scene (required for 'create', 'update', 'delete')
  - `pinId` (string, optional): Pin ID (required for 'update', 'updateUnplaced', 'place', 'unplace', and 'delete')
  - `payload` (object, optional): Pin data (required for 'create')
  - `patch` (object, optional): Update patch (required for 'update' and 'updateUnplaced')
  - `placement` (object, optional): Placement payload (required for 'place')
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
- Requires SocketLib `executeAsGM()` support; otherwise `requestGM()` throws

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

**Important — reconcile does not persist**: `setPinId` and `setSceneId` mutate the items in the array you pass in, but do not write anything back to Foundry flags or any external store. After calling `reconcile()`, you must persist any changes yourself (e.g., `scene.setFlag(moduleId, 'nodes', items)`). If you skip this step, orphaned references reappear on the next page reload.

**Intended pattern**: Call `reconcile()` at scene-load / sync time (e.g., inside `canvasReady`, `syncScenePins`, or `populateGatheringSpotsForScene`) to repair stale references before iterating your data. For real-time cleanup when a pin is deleted mid-session, listen to the deletion hooks instead (see [Deletion hooks](#deletion-hooks-blacksmithpinsdeleted-etc) below).

---

### Pin configuration window – contracts and behavior

The following clarifies payload shapes, storage contracts, and integration points so modules can integrate without guessing. See `pins.configure()` for the API entry point.

#### 1. `onSelect` payload (exact shape)

The callback receives a **stable** object. This is the current contract (matches the window’s internal config):

```ts
// Exact shape passed to onSelect(config)
{
  icon:       { type: 'fa' | 'img'; value: string };
  pinSize:    { w: number; h: number };
  pinShape:   'circle' | 'square' | 'none';
  pinStyle:   { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number; iconColor?: string };
  pinDropShadow: boolean;
  pinTextConfig: {
    textLayout:   'under' | 'over' | 'above' | 'right' | 'left' | 'arc-above' | 'arc-below';
    textDisplay:  'always' | 'hover' | 'never' | 'gm';
    textColor:    string;
    textSize:     number;
    textMaxLength: number;
    textMaxWidth: number;   // max chars per line; 0 = single line; break at word
    textScaleWithPin: boolean;
  };
}
```

- **`icon`**: Internal format. For persistence or API calls, normalize as below.
- **`pinTextConfig`**: Does not include `text`/content; the window does not edit pin text content. Use `pins.update(pinId, { text: '...' }, opts)` separately if needed.

#### 2. Image/icon normalization

The window uses an internal `{ type, value }` format. For storage or passing into `pins.update()` / `pins.create()`:

- **Font Awesome**  
  - **Normalized string format (recommended for storage)**: FA class string, e.g. `'fa-solid fa-star'`.  
  - **Accepted by pin `image`**: That same class string, or HTML `<i class="fa-solid fa-star"></i>`.
- **Image**  
  - **Normalized**: Image URL string (e.g. `'https://…'` or a path like `'path/to/image.webp'`).  
  - **Accepted by pin `image`**: That URL string (or an `<img src="…">` string if you prefer; the renderer supports both).

Recommendation: store **FA as class string** and **images as URL string** so all modules and the API stay consistent.

#### 3. Default storage schema (“Default for [type]”)

The **”Default for [type]”** toggle (renamed from “Use as Default” in v13.6.3) saves selected sections of the current pin design so that **new pins of that module and pin type** use them when nothing else is set. Storage is **per module + pin type**:

- **Where it’s stored**: Blacksmith’s client setting `clientPinDefaultDesigns`, keyed by **`moduleId|type`** (e.g. `coffee-pub-blacksmith|journal-pin`, `coffee-pub-blacksmith|encounter`). So one module can have different defaults for “Journal Page”, “Encounter”, “Map Annotation”, etc. Each player has their own (client scope). If the pin has no type, `default` is used (e.g. `my-module|default`).
- **When it applies**: When a module creates a new pin, it calls **`pins.getDefaultPinDesign(moduleId, type)`**. If that returns a saved default for that (module, type) pair, the module merges it into the new pin’s data.
- **What’s saved**: Only the sections the user checks when “Default for [type]” is active. Available sections: Design (size, shape, style, drop shadow), Text (layout, display, color, size, max length/width, scale), Animations (eventAnimations), Source (image/icon), Classification (type, tags), Permissions (ownership, blacksmithVisibility, allowDuplicatePins). If no section checkboxes are rendered (backward compat), all design fields are saved.
- **What’s excluded**: Ownership and event animations are excluded unless the Permissions / Animations section is explicitly checked.

When “Default for [type]” is toggled on, the window uses the pin’s **moduleId** and **type** (from the pin being edited) and writes only the checked sections to `clientPinDefaultDesigns` under the key **`moduleId|type`** (or `moduleId|default` if type is missing):

```ts
{
  size:           { w: number; h: number };
  lockProportions: boolean;
  shape:          'circle' | 'square' | 'none';
  style:          { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number; iconColor?: string };
  dropShadow:     boolean;
  textLayout:     'under' | 'over' | 'above' | 'right' | 'left' | 'arc-above' | 'arc-below';
  textDisplay:    'always' | 'hover' | 'never' | 'gm';
  textColor:      string;
  textSize:       number;
  textMaxLength:  number;
  textMaxWidth:   number;
  textScaleWithPin: boolean;
  allowDuplicatePins?: boolean; // When true, same source (e.g. journal page) can have multiple pins on the map
}
```

When creating new pins, call **`pins.getDefaultPinDesign(moduleId, type)`** to get the current user’s saved default for that (module, type) (or `null`). Merge that with any other defaults and pass the result into `pins.create()` (using the same property names as in [PinData](#pin-data-schema)). Pass the **pin type** (e.g. `'journal-pin'`, `'encounter'`) so each type has its own default.

#### 4. Pin type handling

- **Current**: The config window does not show or edit pin `type`. The pin keeps its existing type on save.
- **Planned**: Options such as `pinType` (fixed type), `allowTypeEdit` (show type control), and `typeChoices` (labels or list) are under consideration for a future release.

#### 5. Icon library and image options

- **Default**: Icon categories come from Blacksmith’s `resources/pin-icons.json`.
- **Browse**: The window includes a built-in **FilePicker** “Browse” control for image selection.
- **Planned**: Override/defaults for icon categories (e.g. `iconCategories`) and toggles like `allowImageUrl` / `allowFilePicker` may be added as options.

#### 6. Permission gating

- **Current**: Only users who can **edit** the pin (ownership-based) can open the config window. There is no separate `permission` option.
- **Planned**: A `permission` option (e.g. `'gm' | 'owner' | 'any'`) is under consideration.

#### 7. Ownership preservation

`pins.update(pinId, patch, opts)` only changes flags that you pass in `patch`. It does **not** clear or change `ownership` unless `patch.ownership` is included. So saving from the config window does not alter visibility/ownership unless a future version explicitly sends ownership in the update.

#### 8. Styling hooks (stable selectors)

For theming or layout overrides, use these roots so they remain valid across updates:

- **Window shell**: `div#blacksmith-pin-config` — the Application root id.
- **Content**: `div#blacksmith-pin-config .window-content` — Foundry window content wrapper.
- **Form**: `.blacksmith-pin-config` — root class of the inner form (flex column, etc.).

Custom CSS should scope under `#blacksmith-pin-config` or `.blacksmith-pin-config` to avoid affecting other Blacksmith UI.

---

### `pins.configure(pinId, options?)`
Open the pin configuration window for a pin. This provides a user-friendly interface to edit all pin properties. For payload shape, default storage schema, and behavior, see [Pin configuration window – contracts and behavior](#pin-configuration-window--contracts-and-behavior) above.

**Returns**: `Promise<Application>` - The opened window instance

```javascript
// Open configuration window for a pin
const window = await pinsAPI.configure(pinId);

// Open configuration window for a pin on a specific scene
await pinsAPI.configure(pinId, { sceneId: 'some-scene-id' });

// Open with callback to receive configuration data (exact shape documented above)
await pinsAPI.configure(pinId, {
    sceneId: 'some-scene-id',
    onSelect: (config) => {
        // config.icon, config.pinSize, config.pinShape, config.pinStyle,
        // config.pinDropShadow, config.pinTextConfig — all stable
        const faClass = config.icon?.type === 'fa' ? config.icon.value : null;
        const imageUrl = config.icon?.type === 'img' ? config.icon.value : null;
        // Persist faClass or imageUrl per your module
    }
});

```

**Parameters**:
- `pinId` (string, required): Pin ID to configure
- `options` (object, optional): Options
  - `sceneId` (string, optional): Scene ID (defaults to active scene)
  - `onSelect` (Function, optional): Callback when configuration is saved. Receives the [exact payload](#1-onselect-payload-exact-shape) (`icon`, `pinSize`, `pinShape`, `pinStyle`, `pinDropShadow`, `pinTextConfig`).

  **Planned** (not yet in this release): `pinType`, `allowTypeEdit`, `typeChoices`, `iconCategories`, `permission`, `allowImageUrl`, `allowFilePicker` — see [Pin configuration window – contracts and behavior](#pin-configuration-window--contracts-and-behavior) for current vs planned behavior.

**Throws**: 
- `Error` if pin not found
- `Error` if user doesn’t have permission to edit the pin
- `Error` if Pins API not available

**Behavior**:
- Opens an Application V2 window with a form for editing pin properties.
- Only users who can **edit** the pin (ownership-based) can open the window.
- The window includes: **Appearance** (shape, size, fill, stroke, stroke width, icon color, opacity, drop shadow); **Icon/Image** (Font Awesome library + image URL with built-in FilePicker “Browse”); **Text** (layout, display mode, color, size, max characters, chars per line, scale-with-pin); **Event Animations** (hover, click, double-click, add to canvas, delete — each with optional animation and sound). Pin **type** is not currently editable in the window; **ownership** is not changed by the save.
- The window header shows **”[Category]: [Pin Title]”** (e.g. “Journal Pin: The Rusty Anchor”) using `pins.getPinTypeLabel(pin.moduleId, pin.type)`. The header includes a **”Default for [type]”** toggle (renamed from “Default” in v13.6.3); when enabled, each section shows an additional checkbox so the user can choose which sections (Design, Text, Animations, Source, Classification, Permissions) are saved as the client default for that type.
- **Permissions section** (v13.6.3+): Contains ownership dropdown, **Player Visibility** dropdown (`config.blacksmithVisibility`: `'visible'` / `'hidden'` / `'owner'` — owner-only on map for non-GMs), and **”Allow Duplicates of this Pin on the Canvas”** toggle (moved from header). Player Visibility is separate from ownership — a pin can be player-observable but hidden from the map (`'hidden'`) so the GM can reveal it later; `'owner'` limits map visibility to users who can edit the pin.
- **Action bar left** (v13.6.3): **”Update All [type] Pins”** toggle (moved from header). When enabled, each section header shows a checkbox; on save, only checked sections are bulk-applied to matching pins with a confirmation dialog. The Permissions section includes ownership, player visibility, and allow-duplicates when checked. A **”Filter by tag:”** chip row appears below the toggle showing every tag used across all same-type pins on the scene; the current pin's own tags are pre-selected. Selecting chips (multiselect, OR logic) narrows the update target — type is always the first gate, tags narrow within it. An empty tag selection (all chips deselected) is not possible on initial open since the pin's tags are pre-seeded; if all chips are manually deselected the update applies to all pins of that type.
- On submit, the pin is updated via `pins.update()` (ownership is preserved). If “Default for [type]” is toggled on, only the checked sections are written to `clientPinDefaultDesigns` under the key **`moduleId|type`** (from the pin being edited). If no section checkboxes are checked, a warning is shown. If `onSelect` was passed, it is called with the [exact payload](#1-onselect-payload-exact-shape).
- The window is also available from the pin’s right-click context menu (“Configure Pin”).

**Styling**: Use the [stable selectors](#8-styling-hooks-stable-selectors) `div#blacksmith-pin-config`, `.blacksmith-pin-config`, and `div#blacksmith-pin-config .window-content` for theming.

### `pins.getDefaultPinDesign(moduleId, type?)`
Get the current user’s default pin design for a **module and pin type** (saved via Configure Pin “Use as Default”). Stored in client scope so each player can have their own default. The key is **`moduleId|type`**, so the same module can have different defaults per type (e.g. Journal Page vs Encounter vs Map Annotation).

**Returns**: `Object | null` — Default design object (size, shape, style, dropShadow, textLayout, textDisplay, textColor, textSize, textMaxLength, textMaxWidth, textScaleWithPin, lockProportions, **allowDuplicatePins**) or `null` if none saved for that (moduleId, type).

**Parameters**:
- `moduleId` (string): Module ID (e.g. `'coffee-pub-blacksmith'`).
- `type` (string, optional): Pin type (e.g. `'journal-pin'`, `'encounter'`, `'default'`). Omit or pass `'default'` for a generic default for that module. If a design was previously saved under the legacy key (moduleId only), it is still returned when no design exists for `moduleId|type`.

```javascript
// Journal page pins: default for this module + type
const defaultDesign = pinsAPI.getDefaultPinDesign('coffee-pub-blacksmith', 'journal-pin');
await pinsAPI.create({ id: crypto.randomUUID(), moduleId: 'coffee-pub-blacksmith', type: 'journal-pin', ...defaultDesign, text: label, config: { ... } });

// Encounter pins: separate default for same module
const encounterDefault = pinsAPI.getDefaultPinDesign('coffee-pub-blacksmith', 'encounter');

// Generic default (type omitted or 'default')
const defaultDesign = pinsAPI.getDefaultPinDesign('my-module');
await pinsAPI.create({ id: crypto.randomUUID(), moduleId: 'my-module', ...defaultDesign, text: 'New pin' });
```

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
Get a single pin by id. When `sceneId` is omitted, lookup checks the unplaced store first, then all scenes. Use this when you have a pin ID (e.g. from a note or quest) and may not know whether it is placed.

**Returns**: `PinData | null` - Pin data if found, `null` if not found

```javascript
// Resolve by ID — works for unplaced or placed
const pin = pinsAPI.get(pinId);
if (pin) {
  console.log('Found pin:', pin.text);
  if (pin.sceneId) console.log('Placed on scene:', pin.sceneId);
}

// Can also use pins.exists() to just check existence
if (pins.exists('my-pin-id')) {
    console.log('Pin exists');
}
```

**Options**:
- `sceneId` (string, optional): if provided, only that scene is checked; if omitted, lookup is unplaced then all scenes

**Throws**: 
- `Error` if scene not found (when sceneId provided)

### `pins.list(options?)`
List pins with filters. Use `unplacedOnly: true` to list only unplaced pins (no `sceneId` required). Without `unplacedOnly`, `sceneId` defaults to the active scene and only placed pins on that scene are returned.

**Returns**: `PinData[]` - Array of pin data matching filters

```javascript
// List unplaced pins only (no sceneId needed)
const unplaced = pinsAPI.list({ unplacedOnly: true });
const myUnplaced = pinsAPI.list({ unplacedOnly: true, moduleId: 'my-module' });

// List placed pins on active scene
const pins = pinsAPI.list({ moduleId: 'my-module' });
console.log(`Found ${pins.length} pins`);

// List placed pins on a specific scene
const scenePins = pinsAPI.list({ sceneId: 'some-scene-id', type: 'note' });

// List pins including those hidden by the current user's layer/tag profile (GM tools, audits)
const allForScene = pinsAPI.list({ sceneId: canvas.scene.id, includeHiddenByFilter: true });

// Filter by tag on a scene
const tagged = pinsAPI.list({ sceneId: canvas.scene.id, tag: 'quest' });
```

**Options**:
- `unplacedOnly` (boolean, optional): if `true`, return only unplaced pins; `sceneId` is ignored
- `sceneId` (string, optional): when listing placed pins, target scene; defaults to active scene when `unplacedOnly` is not set
- `moduleId` (string, optional): filter by consumer module
- `type` (string, optional): filter by pin type (e.g., 'note', 'quest', 'default')
- `tag` (string, optional): filter to pins whose normalized tags include this tag
- `includeHiddenByFilter` (boolean, optional): if `true`, include pins that are currently hidden by the client visibility profile / taxonomy filters (default is `false`; omit or `false` for “what the user sees on the map”)

**Throws**: 
- `Error` if scene not found (when sceneId required and invalid)

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

### `pins.registerContextMenuItem(itemId, itemData)`
Register a custom context menu item for pins. The item appears above the separator, before built-in options (Ping Pin, Delete Pin, etc.). Returns a disposer function; call it to unregister.

**Returns**: `() => void` - Disposer function to unregister the item

```javascript
const unregister = pins.registerContextMenuItem('my-module-bring-here', {
  name: 'Bring Players Here',
  icon: '<i class="fa-solid fa-users"></i>',
  onClick: async (pinData) => {
    await pins.panTo(pinData.id, { broadcast: true, ping: { animation: 'ping', loops: 1 } });
  },
  moduleId: 'my-module',
  order: 100,
  visible: true
});

// later
unregister();
```

**Parameters**:
- `itemId` (string, required): Unique identifier for the menu item (e.g. module-prefixed: `'my-module-action-name'`).
- `itemData` (object, required): Menu item configuration
  - `name` (string, required): Display name in the menu
  - `icon` (string, optional): Font Awesome icon HTML or class string (default: `'<i class="fa-solid fa-circle"></i>'`)
  - `onClick` (Function, required): Callback invoked when the item is clicked. Receives `(pinData)`.
  - `moduleId` (string, optional): If set, item is only shown for pins whose `moduleId` matches
  - `gmOnly` (boolean, optional): If `true`, item is only shown to GMs
  - `order` (number, optional): Sort order in menu; lower values appear higher (default: `999`)
  - `visible` (boolean | Function, optional): If `true`, item is shown (default). If `false`, hidden. If a function `(pinData, userId) => boolean`, run for each pin to decide visibility.

**Throws**: 
- `Error` if `itemId` is missing or not a non-empty string
- `Error` if `itemData` is missing or not an object
- `Error` if `itemData.name` is missing or not a string
- `Error` if `itemData.onClick` is not a function

### `pins.registerPinType(moduleId, type, friendlyName)`
Register a friendly name for a pin type so context menus, tools, and other pins UI show the name you provide instead of inferring a label. Call from your module at init/ready.

- `moduleId` (string, required): Your module id.
- `type` (string, required): Pin type key (e.g. `'sticky-notes'`, `'pins'`). Must match the `type` you set on pins.
- `friendlyName` (string, required): Display name (e.g. `"Sticky Notes"`, `"Squire Sticky Notes"`).

Registrations are in-memory and cleared when your module unloads.

### `pins.getPinTypeLabel(moduleId, type)`
Get the registered friendly name for a (moduleId, type) pair. Returns empty string if none was registered.

- `moduleId` (string, required)
- `type` (string, optional): Pin type; defaults to `'default'` if omitted.
- **Returns**: `string`

### `pins.unregisterContextMenuItem(itemId)`
Unregister a context menu item previously added with `registerContextMenuItem()`.

**Returns**: `boolean` - `true` if an item with that `itemId` was removed, `false` otherwise

```javascript
pins.unregisterContextMenuItem('my-module-bring-here');
```

**Parameters**:
- `itemId` (string, required): The same id passed to `registerContextMenuItem()`

### Visibility Filters (per-user)

These are **client-side visibility filters**. They do **not** change pin ownership and do **not** mutate pin data. Use these when a user wants to hide all pins from a module (or all pins entirely) without recalculating ownership or reloading pins.

#### `pins.setGlobalVisibility(visible)`
Hide or show all pins for the current user.

```javascript
await pins.setGlobalVisibility(false); // Hide all pins
await pins.setGlobalVisibility(true);  // Show all pins
```

#### `pins.getGlobalVisibility()`
Returns `true` if pins are visible for the current user, `false` if hidden.

```javascript
const visible = pins.getGlobalVisibility();
```

#### `pins.setModuleVisibility(moduleId, visible)`
Hide or show pins for a specific module for the current user.

```javascript
await pins.setModuleVisibility('coffee-pub-squire', false); // Hide Squire pins
await pins.setModuleVisibility('coffee-pub-squire', true);  // Show Squire pins
```

#### `pins.getModuleVisibility(moduleId)`
Returns `true` if the module's pins are visible for the current user.

```javascript
const visible = pins.getModuleVisibility('coffee-pub-squire');
```

#### `pins.setTagVisibility(tag, visible)`
Sets the client-side “hidden tag” filter for `tag` (normalized the same way as pin tags). When `visible` is `false`, pins that are affected by that global tag filter are hidden from the overlay for this user; `true` clears the filter for that tag. Also syncs `game.modules.get('coffee-pub-blacksmith').api.tags.setVisibility` when the Tags API is available.

```javascript
await pins.setTagVisibility('quest', false);
await pins.setTagVisibility('quest', true);
```

#### `pins.getTagVisibility(tag)`
Returns `true` if that tag is **not** in the hidden-tags set for the current user.

```javascript
const on = pins.getTagVisibility('quest');
```

### Named visibility profiles

Saved profiles capture the current **client** hide state: global hide-all, hidden modules, hidden pin types/categories, hidden global tags, and hidden type-scoped tags. They do **not** include per-pin `config.blacksmithVisibility` or ownership.

Built-in profiles **`All Pins`** and **`No Pins`** appear in the UI like custom names; they cannot be overwritten or deleted via the API. Reserved **custom** profile names (case-insensitive) **All Pins** and **No Pins** are rejected when saving.

- **`pins.listVisibilityProfiles()`** — `{ name, state }[]` sorted by name. `state` is a deep clone suitable for inspection.
- **`pins.saveVisibilityProfile(name)`** — Persists the current filter state under `name` and sets it active. Throws if the name is reserved or invalid.
- **`pins.applyVisibilityProfile(name, options?)`** — Applies a saved or built-in profile. **`options.sceneId`** (optional): when applying a custom profile, pass the scene whose pin population should be used for repair logic (e.g. clearing hide-all when the profile still shows pins on that scene). Defaults to the active canvas scene.
- **`pins.deleteVisibilityProfile(name)`** — Removes a saved profile. Built-in names are not stored and are not deleted here.
- **`pins.getActiveVisibilityProfileName()`** — Returns the active profile key, or `''` if the user is in ad-hoc “custom / current view” mode.

```javascript
await pins.applyVisibilityProfile('Combat', { sceneId: canvas.scene.id });
const active = pins.getActiveVisibilityProfileName();
```

Category / type-level filters toggled from **Manage Pin Layers** are stored in the same client settings as these profiles; use the window or future PinManager hooks—there is no separate `setTypeVisibility` on `PinsAPI` today.

### Tag Registry (GM-only write)

The **world-level tag registry** is the sorted, deduplicated list of known pin tag strings (canonical **`tagRegistry`** via the Tags API when enabled, with a legacy fallback to `pinTagRegistry` during migration). It is seeded on `ready` from the built-in taxonomy, auto-populated when pins change, and can include registry-only entries. Players can read it; only GMs can write.

The registry is used to populate tag suggestion chips in the Configure Pin window and the Manage Custom Pin Tags window, so GMs see all tags that exist even if no pin currently uses them.

> **`getPinTaxonomy` vs `getPinTaxonomyChoices`** — critical distinction for UI:
>
> - **`getPinTaxonomy(moduleId, type)`** — returns only the tags registered for that specific pin type. Use this for type-scoped tag chip pickers (journal toolbar, Configure Pin tag row) so the user only sees relevant tags.
> - **`getPinTaxonomyChoices(moduleId, type)`** — merges the registered tags with every tag in the global registry (i.e. every tag ever used across all modules). Use this for global autocomplete inputs where showing all known tags is helpful. **Do not** use it to populate a chip picker scoped to a specific type — it will show unrelated tags from other modules.
>
> Rule of thumb: **`getPinTaxonomy` for type-scoped pickers; `getPinTaxonomyChoices` for global autocomplete.**

#### `pins.getModuleTaxonomy(moduleId)`
Returns **all registered taxonomy entries** for a module in one call — every pin type registered via the built-in JSON, an override JSON, or `registerPinTaxonomy()`. Merges all three sources the same way `getPinTaxonomy` does for each individual type.

**Returns**: `Record<string, { label: string, tags: string[] }>` — plain object keyed by type. Empty object if the module has no registered taxonomy.

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
const taxonomy = pins.getModuleTaxonomy('coffee-pub-artificer');
// → {
//     'habitat-location': { label: 'Habitat Location', tags: ['mountain', 'arctic', ...] },
//     'component-location': { label: 'Component Location', tags: ['creature', 'gem', ...] },
//     'skill-location': { label: 'Skill', tags: ['herbalism', 'alchemy', ...] }
//   }

// Iterate all types for a module:
for (const [type, entry] of Object.entries(taxonomy)) {
    console.log(entry.label, entry.tags);
}

// Get a specific type's tags from the result:
const habitatTags = taxonomy['habitat-location']?.tags ?? [];
```

Use `getModuleTaxonomy` when you need all types for a module at once (e.g., building a full type+tag selector UI). Use `getPinTaxonomy(moduleId, type)` when you only need one specific type.

#### `pins.getTagRegistry()`
Returns a **copy** of the current world tag registry as `string[]`.

```javascript
const tags = pins.getTagRegistry();
// → ['encounter', 'location', 'npc', 'quest', ...]
```

#### `pins.addTagToRegistry(tagKey)` *(GM only)*
Adds `tagKey` to the world registry without assigning it to any pins. Use this when a tag should be available in pin tag pickers before it has usage.

```javascript
await pins.addTagToRegistry('gathering-spot');
```

#### `pins.stripTagFromScene(tagKey, sceneId)` *(GM only)*
Removes `tagKey` from every pin on one scene while keeping the tag in the world registry.

```javascript
const removed = await pins.stripTagFromScene('gathering-spot', canvas.scene.id);
```

#### `pins.stripTagFromAllScenes(tagKey)` *(GM only)*
Removes `tagKey` from pins across all scenes while keeping the tag in the world registry.

```javascript
const removed = await pins.stripTagFromAllScenes('gathering-spot');
```

#### `pins.deleteTagGlobally(tagKey)` *(GM only)*
Removes `tagKey` from the world registry **and** scrubs it from every pin on every scene, and from all saved visibility profile snapshots.

```javascript
await pins.deleteTagGlobally('old-tag');
```

#### `pins.renameTagGlobally(oldKey, newKey)` *(GM only)*
Renames `oldKey` → `newKey` in the world registry, on every pin on every scene, and in all saved visibility profile snapshots.

```javascript
await pins.renameTagGlobally('dungeon', 'dungeon-entrance');
```

#### `pins.seedTagRegistryIfEmpty()`
Merges taxonomy tags into the world registry unconditionally, then scans all scenes for pin tags (only when the registry was previously empty). Called automatically on `ready`; expose here for modules that need to trigger a re-seed after registering new taxonomy.

```javascript
await pins.seedTagRegistryIfEmpty();
```

### GM canvas access indicator (GMs only)

GMs may see **at most one** small Font Awesome icon in the **upper-right** of a pin (`span.blacksmith-pin-gm-indicator`). **Players never see these icons.**

**Which icon (access only):** When **Access: None (GM only)** (`ownership.default` is `NONE`), GMs see `PIN_ACCESS_ICONS.none` (`fa-solid fa-user-shield`) on the pin. **Player Visibility** (`visible` / `hidden` / `owner`) does **not** change this glyph — visibility is conveyed separately (e.g. reduced opacity when hidden from players). Additional access presets on the canvas may be added later; they are not mixed with visibility icons.

The glyph color follows the pin **stroke** (`--pin-stroke-color`); if stroke is unset or blank, **`#ffffff`** is used (`_resolvePinStrokeColor` in `pins-renderer.js`). It also uses a **drop shadow** on the icon — no separate filled background.

The glyph is positioned **outside** the pin’s padding box. **`--pin-stroke-px`** is the **scaled border width in px** from layout (**`0px`** when `data-shape="none"`). **`--gm-fs`** is the icon em size (`0.165 × pin width`). Outward offset is **`--pin-stroke-px + --gm-fs × M`**, where **`M`** depends on shape: **`data-shape="circle"`** uses **`--blacksmith-pin-gm-indicator-em-out-circle`** (default `0.52`); **square**, **none**, and other values use **`--blacksmith-pin-gm-indicator-em-out-square`** (`1`).

For access levels other than GM-only, when **Visibility** is **Not visible** (`blacksmithVisibility: hidden`), GMs still see the pin at **reduced opacity**; no corner icon is used for “hidden” alone.

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

**Returns**: When `untilStopped` is `true`, a Promise that resolves with `{ stop: () => void, promise: Promise<void> }`. Otherwise `Promise<void>` (resolves when the animation completes).

```javascript
// Ping animation (recommended for navigation - combo with sound)
await pins.ping(pinId, { animation: 'ping', loops: 1 });

// Pulse animation (2 loops)
await pins.ping(pinId, { animation: 'pulse', loops: 2 });

// Play animation until you call stop (e.g. while a quest is active)
const controller = await pins.ping(pinId, { animation: 'pulse', untilStopped: true });
// ... later when quest completes or user dismisses:
controller.stop();
await controller.promise; // optional: wait until animation has fully stopped
```

```javascript
// Multi-step sequence (like built-in 'ping'): run several animations in order
await pins.ping(pinId, { animation: ['scale-large', 'ripple'], loops: 1 });
// Custom combo: rotate, then pulse, then ripple (run sequence twice)
await pins.ping(pinId, { animation: ['rotate', 'pulse', 'ripple'], loops: 2 });
```

```javascript
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
- `animation` (string | string[], **required**): Animation type, or **array of types** to run in sequence (each step runs once per loop). Single string is equivalent to a one-item array.
  - `'ping'`: **Combo** - scale-large then ripple (same as `['scale-large', 'ripple']`; default sound applied when used alone)
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
- `loops` (number, optional): Number of times to loop the animation or sequence (default: 1). Ignored when `untilStopped` is true.
- `untilStopped` (boolean, optional): If `true`, the animation loops until the caller calls `stop()` on the returned controller. Returns a Promise that resolves with `{ stop: () => void, promise: Promise<void> }`. Sound plays once at start. `broadcast` is not used.
- `broadcast` (boolean, optional): If `true`, show animation to all users who can see the pin (default: `false`). Uses Blacksmith socket system. Only users with view permissions for the pin will see the animation. Not used when `untilStopped` is true.
- `sound` (string, optional): Sound to play once. When `untilStopped` is true, plays once at start. Can be:
  - Blacksmith sound name: `'interface-ping-01'` (auto-resolves to `modules/coffee-pub-blacksmith/sounds/interface-ping-01.mp3`)
  - Full path: `'modules/my-module/sounds/ping.mp3'`
  - URL: `'https://example.com/sound.mp3'`

**Notes**:
- **Sequence**: Pass an array (e.g. `['rotate', 'pulse', 'ripple']`) to run multiple animations in order; `loops` repeats the whole sequence.
- The `'ping'` animation automatically includes the default sound (`'interface-ping-01'`) unless a custom `sound` is provided
- Sounds play once regardless of loops (or once at start when `untilStopped` is true)
- With `untilStopped: true`, call `controller.stop()` when the calling module wants the animation to end; optionally `await controller.promise` to wait until the animation has fully stopped and the pin is back to its normal state
- Broadcast respects pin visibility: only users who can view the pin (based on `ownership` property) will see the animation
- Broadcasting requires the Blacksmith socket system to be initialized
- The sender of a broadcast also sees the animation locally
- Animations are defined in `styles/pins.css` with CSS keyframes
- Ripple creates a temporary DOM element that is removed after animation completes

### `pins.reload(options?)`
Reload pins from scene flags and re-render on the canvas.

**When you need it**: `create()` and `place()` automatically update the renderer when the target is the currently active scene and the Blacksmith layer container is already initialized. `reload()` is needed when: (1) the layer container doesn’t exist yet (layer never activated since page load — call `whenReady()` first to avoid this), or (2) pins exist in scene flags but don’t appear after a scene change or page refresh.

**When you don’t need it**: Normal `create()`, `place()`, `update()`, and `delete()` calls on the active scene handle their own rendering. Don’t add `reload()` after every pin operation as a precaution — it’s a full re-render of all pins and has a cost.

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

### `pins.refreshPin(pinId, options?)`
Forces a rebuild of a single pin’s rendered icon from current data. Use when `update()` did not fully refresh visuals.

**Returns**: `Promise<boolean>` — `true` if the pin existed and was refreshed.

**Options**: Optional `{ sceneId }` — same as `pins.get()` when you know which scene holds the pin.

### `pins.getSceneFilterSummary(sceneId?, options?)`
Returns aggregate counts for **Manage Pins**–style summaries: totals plus grouped counts by module, type, and tag on the given scene.

**Parameters**:
- `sceneId` (string, optional): defaults to `canvas.scene.id` when omitted.
- `options.includeHiddenByFilter` (boolean, optional): when `true`, counts include pins hidden by the current user’s taxonomy/profile filters (same idea as `list({ includeHiddenByFilter: true })`).

**Returns**: `{ total: number, modules: Array<{ key: string, count: number, pins: string[] }>, types: Array<...>, tags: Array<...> }` — each grouping sorted by `key`. Type keys are `moduleId|visibilityType` as used internally for filters.

### `pins.openLayers(options?)`
Opens the **Manage Pins** window (Application V2): **Manage Pin Layers** tab for taxonomy and visibility profiles, **Manage Pin Tags** tab for browse/bulk tag tools. Equivalent to `game.modules.get('coffee-pub-blacksmith').api.openWindow('blacksmith-pin-layers', options)` when that bridge exists.

**Returns**: `Promise<Application | void>`

## Permissions and Errors

### Permissions
- **Creation** is gated by the world setting `pinsAllowPlayerWrites`: only GMs can create pins unless that setting is enabled. **Edit, Configure Pin, and Delete** are based on ownership only: any user with OWNER (or higher) on a pin can edit/configure/delete that pin regardless of `pinsAllowPlayerWrites`. GMs can always do everything.
- `ownership` uses Foundry ownership levels (`CONST.DOCUMENT_OWNERSHIP_LEVELS`); GM always has full access.
- Ownership can be explicitly provided in pin data, or resolved automatically using the ownership resolver hook.
- **Visibility Filtering**: Pins are filtered by **ownership** first (LIMITED or higher to see a pin at all). **Client** taxonomy and profile filters then control which of those pins appear on the overlay; `list({ includeHiddenByFilter: true })` and `getSceneFilterSummary(..., { includeHiddenByFilter: true })` include pins hidden only by those filters.
- **Configure Pin**: The Configure Pin window and context menu item are shown only to users who can edit the pin (GM or ownership level ≥ OWNER). No separate gate from `pinsAllowPlayerWrites` for opening the window.

### Ownership Resolver Hook

The pins API supports an ownership resolver hook that allows modules to **centralize ownership logic** in one place. Use this when ownership should be derived from module-specific data (e.g., note visibility, quest state, or player-facing toggles). This is the **recommended** way to keep ownership consistent across create/update calls.

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
- **OWNER (3)**: User can see and edit the pin (Configure Pin, update, delete). Edit/configure/delete for pins you own do **not** require `pinsAllowPlayerWrites`; that setting only gates **creation** of new pins by non-GMs.

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
    'user-abc-123': 3              // This user can edit (OWNER can always configure/update/delete)
  }
});
```

### Hooks fired by the Pins API

The pins system fires the following hooks so other modules can sync their data (e.g. note flags, UI) when pins change. Use `Hooks.on()` (not `Hooks.call`); these are invoked with `Hooks.callAll()`.

#### Single-pin hooks

**`blacksmith.pins.created`**  
Fired when a pin is created: after `pins.create()` returns successfully. Payload includes `placement: 'unplaced' | 'placed'` and, when placed, `sceneId`.

**Payload**:
```js
{ pinId: string, moduleId: string, placement: 'unplaced' | 'placed', pin: PinData [, sceneId: string ] }
```
- `pinId`: Pin ID that was created
- `moduleId`: Pin's `moduleId`
- `placement`: `'unplaced'` if the pin has no scene, or `'placed'` if it was created on a scene
- `pin`: The full pin data after creation
- `sceneId`: Present only when `placement === 'placed'`; scene where the pin was placed

**`blacksmith.pins.placed`**  
Fired when an unplaced pin is placed on a scene: after `pins.place()` or `pins.update()` with `{ sceneId, x, y }` returns successfully.

**Payload**:
```js
{ pinId: string, sceneId: string, moduleId: string, type?: string, pin: PinData }
```
- `pinId`: Pin ID that was placed
- `sceneId`: Scene where the pin was placed
- `moduleId`: Pin's `moduleId`
- `type`: Pin's `type` (e.g. `'note'`, `'quest'`, `'default'`)
- `pin`: The full pin data after placement

**`blacksmith.pins.unplaced`**  
Fired when a placed pin is removed from the canvas but its data is kept: after `pins.unplace()` or `pins.update(..., { unplace: true })` returns successfully.

**Payload**:
```js
{ pinId: string, sceneId: string, moduleId: string, type?: string, pin: PinData }
```
- `pinId`: Pin ID that was unplaced
- `sceneId`: Scene the pin was removed from
- `moduleId`: Pin's `moduleId`
- `type`: Pin's `type` (e.g. `'note'`, `'quest'`, `'default'`)
- `pin`: The full pin data after unplacing (no longer on a scene)

**`blacksmith.pins.updated`**  
Fired when a pin is updated: after `pins.update()` returns successfully, and when the core **Configure Pin** window saves (it calls `pins.update()`). Use this to keep module data in sync (e.g. journal note flags, notes panel UI) without registering a duplicate “Configure Pin” menu item.

**Payload**:
```js
{ pinId: string, sceneId: string | null, moduleId: string, type?: string, patch: object, pin: PinData }
```
- `pinId`: Pin ID that was updated
- `sceneId`: Scene where the pin lives, or `null` if the pin is unplaced
- `moduleId`: Pin’s `moduleId`
- `type`: Pin’s `type` (e.g. `'note'`, `'quest'`, `'default'`)
- `patch`: The update patch passed to `pins.update()`
- `pin`: The full pin data after the update

```javascript
Hooks.on('blacksmith.pins.updated', async ({ pinId, moduleId, pin, patch }) => {
  if (moduleId !== 'coffee-pub-squire') return;
  const noteUuid = pin?.config?.noteUuid;
  if (!noteUuid) return;

  const page = await fromUuid(noteUuid);
  if (!page) return;

  // Sync note flags from updated pin
  await page.setFlag('coffee-pub-squire', 'notePinSize', pin?.size);
  await page.setFlag('coffee-pub-squire', 'notePinShape', pin?.shape);
  // ... other flags ...

  game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance?.notesPanel?._refreshData?.();
});
```

**`blacksmith.pins.deleted`**  
Fired when a single pin is deleted: after `pins.delete()` returns successfully. Use this to clear module data tied to the pin (e.g. clear `pinId` / `sceneId` from a note, refresh UI). Fired for both API-driven deletes and the core **Delete Pin** context menu (right-click on canvas or Manage Pins single-delete). Works for both placed and unplaced pins.

> **This hook does NOT fire for bulk deletions.** If a user deletes via `deleteAll()` or `deleteAllByType()` (including Manage Pins bulk-delete-by-type), `blacksmith.pins.deleted` is not called per pin — only `blacksmith.pins.deletedAll` or `blacksmith.pins.deletedAllByType` fires. To handle all deletion paths, listen to all three hooks. Because the bulk hooks do not carry per-pin IDs, the recommended pattern is to call `pins.reconcile()` inside the bulk-delete handlers to identify and clear orphaned references.

**Payload**:
```js
{ pinId: string, sceneId: string | null, moduleId?: string, type?: string, pin?: PinData, config?: object }
```
- `pinId`: Pin ID that was deleted
- `sceneId`: Scene where the pin lived, or `null` if the pin was unplaced
- `moduleId`: Pin’s `moduleId` (if any)
- `type`: Pin’s `type` (if any)
- `pin`: Full pin data **before** deletion (useful for looking up linked documents)
- `config`: Pin’s `config` object (e.g. `noteUuid` for Squire) for clearing links

```javascript
Hooks.on('blacksmith.pins.deleted', async ({ pinId, moduleId, config }) => {
  if (moduleId !== 'coffee-pub-squire') return;
  const noteUuid = config?.noteUuid;
  if (!noteUuid) return;

  const page = await fromUuid(noteUuid);
  if (!page) return;

  await page.setFlag('coffee-pub-squire', 'pinId', null);
  await page.setFlag('coffee-pub-squire', 'sceneId', null);
  // ... refresh notes UI ...
});
```

#### Bulk-delete hooks

**`blacksmith.pins.deletedAll`**  
Fired when `pins.deleteAll()` completes successfully.

**Payload**:
```js
{ sceneId: string, moduleId?: string, count: number }
```
- `sceneId`: Scene where pins were deleted
- `moduleId`: Value of the `moduleId` filter passed to `deleteAll()`, or `undefined` if all pins were deleted
- `count`: Number of pins deleted

```javascript
Hooks.on('blacksmith.pins.deletedAll', ({ sceneId, moduleId, count }) => {
  if (moduleId === 'my-module') {
    console.log(`Deleted ${count} pins on scene ${sceneId}`);
    // e.g. clear note flags, refresh UI
  }
});
```

**`blacksmith.pins.deletedAllByType`**  
Fired when `pins.deleteAllByType(type, options)` completes successfully.

**Payload**:
```js
{ sceneId: string, type: string, moduleId?: string, count: number }
```
- `sceneId`: Scene where pins were deleted
- `type`: Pin type that was deleted (e.g. `'note'`, `'quest'`)
- `moduleId`: Value of the `moduleId` filter passed to `deleteAllByType()`, or `undefined`
- `count`: Number of pins deleted

```javascript
Hooks.on('blacksmith.pins.deletedAllByType', ({ sceneId, type, moduleId, count }) => {
  if (type === 'quest' && moduleId === 'my-module') {
    console.log(`Deleted ${count} quest pins on scene ${sceneId}`);
  }
});
```

**Full-coverage pattern — handling all deletion paths**

Because `blacksmith.pins.deleted` only fires for single-pin deletes, modules that track per-item pin references need to handle all three hooks. The bulk hooks don't include per-pin IDs, so the correct approach is to run a `reconcile()` pass after a bulk delete fires, then persist the result.

```javascript
const MODULE_ID = 'my-module';

// Single-pin delete — pinId is available directly
Hooks.on('blacksmith.pins.deleted', async ({ pinId, moduleId }) => {
  if (moduleId !== MODULE_ID) return;
  const scene = game.scenes.get(canvas.scene?.id);
  const nodes = scene?.getFlag(MODULE_ID, 'nodes') ?? [];
  const updated = nodes.map(n => n.pinId === pinId ? { ...n, pinId: null } : n);
  await scene.setFlag(MODULE_ID, 'nodes', updated);
});

// Bulk deletes — no per-pin IDs, so reconcile instead
async function reconcileAndPersist(sceneId) {
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
  const nodes = foundry.utils.deepClone(scene.getFlag(MODULE_ID, 'nodes') ?? []);
  const results = await game.modules.get('coffee-pub-blacksmith')?.api?.pins?.reconcile({
    sceneId,
    moduleId: MODULE_ID,
    items: nodes,
    getPinId: (n) => n.pinId ?? null,
    setPinId: (n, id) => { n.pinId = id; },
  });
  if (results?.unlinked > 0) {
    await scene.setFlag(MODULE_ID, 'nodes', nodes);
  }
}

Hooks.on('blacksmith.pins.deletedAll', ({ sceneId, moduleId }) => {
  if (moduleId === MODULE_ID) reconcileAndPersist(sceneId);
});

Hooks.on('blacksmith.pins.deletedAllByType', ({ sceneId, moduleId }) => {
  if (moduleId === MODULE_ID) reconcileAndPersist(sceneId);
});
```

### Context Menu

Pins have a right-click context menu with the following options:

**Available to All Users:**
- **Ping Pin**: Animates the pin to draw attention (combo animation: scale-large + ripple with sound)
- **Bring Players Here**: Pans all connected users who can see the pin to its location (optionally with ping)

**Available to Users with Edit Permissions:**
- **Configure Pin**: Opens the Configure Pin window for visual and layout settings
- **Delete Pin**: Deletes the individual pin
- **Player Visibility**: Cycles or sets the pin’s map visibility (`config.blacksmithVisibility`: `visible` → `hidden` → `owner` → `visible` in browse tools where applicable). Renamed from "Visibility" in v13.6.3.

**GM-Only Options** (appear below a separator):
- Bulk delete operations live in the **Manage Pins** window action bar. The context menu no longer shows "Delete All Pins" or "Delete All [Type] Pins".

**Module-Registered Items:**
- Modules can register custom context menu items using `pins.registerContextMenuItem()`. These appear above the separator, before the built-in options. See [`pins.registerContextMenuItem()`](#pinsregistercontextmenuitemitemid-itemdata) and [`pins.unregisterContextMenuItem()`](#pinsunregistercontextmenuitemitemid) for the full API.

**Note**: GM bulk delete operations (**Delete All**, **Delete All** by type filter) are available in the **Manage Pins** window action bar with confirmation dialogs. The "Delete All of Type" action only appears if there are pins of that type on the scene.

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
  /* Icon size relative to pin size (default: 0.60 = 60% of pin diameter) */
  --blacksmith-pin-icon-size-ratio: 0.60;
  
  /* "Around" text size relative to pin size (default: 0.24 = 24% of pin diameter) */
  --blacksmith-pin-around-text-size-ratio: 0.24;
  
  /* Border radius for square pins (default: 15%) */
  --blacksmith-pin-square-border-radius: 15%;
  
  /* Drop shadow for pins (default: 0 0px 5px rgba(0, 0, 0, 0.9)) */
  --blacksmith-pin-drop-shadow: drop-shadow(0 0px 5px rgba(0, 0, 0, 0.9));
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
  style: { fill?, stroke?, strokeWidth?, alpha?, iconColor? },  // Optional: style overrides (iconColor = Font Awesome icon color)
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
- Starts after moving 10 pixels (distinguishes drag from click)
- Shows visual feedback (alpha 0.7, elevated z-index)
- Updates pin position in real-time
- Saves final position on drag end
- Fires `dragStart`, `dragMove`, and `dragEnd` events (requires `dragEvents: true` in handler options)
