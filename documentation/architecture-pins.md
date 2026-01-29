# Canvas Pins Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes how the Canvas Pins system is built and how its parts interact. It is an architecture reference, not an API reference (see `api-pins.md` for the public API).

## Overview

The Canvas Pins system provides configurable, interactive markers on the FoundryVTT canvas. Pins can be **placed** on a scene (visible on the canvas) or **unplaced** (data only; typical for notes, quests, etc.). The system is consumed by other modules (e.g. Coffee Pub Squire) and managed by Blacksmith.

**Target**: FoundryVTT v13+ only. Application V2 is used for the pin configuration window.

**Implementation**: Pins render as **pure DOM** (no PIXI graphics) in a fixed overlay. Storage is split: placed pins in scene flags, unplaced pins in a world setting. CRUD, permissions, events, and context menu registration are centralized in PinManager; rendering and coordinate conversion live in the pins renderer.

---

## Storage

### Placed pins

- **Where**: `scene.flags[MODULE.ID].pins` (array of pin objects).
- **When**: Pins that have `sceneId`, `x`, and `y` are “placed” and appear on the canvas for that scene.
- **Shape**: Each pin has `id`, `x`, `y`, `size`, `style`, `shape`, `text`, `image`, `config`, `moduleId`, `ownership`, `version`, etc. See `pins-schema.js` and the schema section below.

### Unplaced pins

- **Where**: World setting `pinsUnplaced` (object with a `pins` array). Same pin shape as placed pins but without `sceneId`/`x`/`y` (or omitted for unplaced).
- **When**: Created via the API without `sceneId`/`x`/`y`; moved here when unplaced from a scene. Not rendered on the canvas; used for notes, quests, etc.
- **Resolve order**: When looking up a pin by id without `sceneId`, the system checks the unplaced store first, then any scene.

### Data flow

- **Create (unplaced)**: `create(data)` with no `sceneId`/`x`/`y` → append to `pinsUnplaced.pins`, fire `blacksmith.pins.created` with `placement: 'unplaced'`.
- **Create (placed)**: `create(data)` with `sceneId`, `x`, `y` → append to `scene.flags[MODULE.ID].pins`, fire `blacksmith.pins.created` with `placement: 'placed'`.
- **Place**: `place(pinId, { sceneId, x, y })` → remove from unplaced, add to scene flags, fire `blacksmith.pins.placed`.
- **Unplace**: `unplace(pinId)` → remove from scene flags, add to unplaced, fire `blacksmith.pins.unplaced`.
- **Update**: `update(pinId, patch, opts)` works for both placed and unplaced; can include `sceneId`, `x`, `y` to place an unplaced pin.
- **Delete**: Removes from either store; fire `blacksmith.pins.deleted`.

Only GMs can write scene flags and the world setting. Non-GM users with edit permission use a GM proxy (socket/requestGM) so the GM client performs the write.

---

## Components

### PinManager (`scripts/manager-pins.js`)

- **Responsibility**: Single source of truth for pin data, permissions, and event routing.
- **CRUD**: Create, update, delete, get, list. Resolves pin location (unplaced vs scene) via `_getPinLocation(pinId)`.
- **Place / unplace**: Moves pins between unplaced store and scene flags.
- **Permissions**: `_canEdit(pin, userId)` uses ownership (and optional hook `blacksmith.pins.resolveOwnership`). Create is gated by world setting `pinsAllowPlayerWrites`; edit/configure/delete by ownership; GM always full access.
- **Events**: Registers handlers via `pins.on(eventType, handler, options)`. Valid types: `hoverIn`, `hoverOut`, `click`, `doubleClick`, `rightClick`, `middleClick`, `dragStart`, `dragMove`, `dragEnd`. Options can scope by `pinId`, `moduleId`, `sceneId` and support `AbortSignal` and `dragEvents`.
- **Context menu**: `registerContextMenuItem(id, item)` / `unregisterContextMenuItem(id)`. Modules add custom items; default items (e.g. Delete Pin, Configure Pin) are always shown when applicable. Items filtered by `moduleId` and `visible` function.
- **Schema**: Uses `pins-schema.js` for defaults, validation, and migration before persisting.

### Pins renderer (`scripts/pins-renderer.js`)

- **Responsibility**: Visual representation and input handling only. No ownership of pin data.
- **PinDOMElement**: Static class that owns the **DOM overlay** (`#blacksmith-pins-overlay`) and one **DOM element per pin** (div with class `blacksmith-pin`). No PIXI graphics for pins; styling is CSS (`styles/pins.css`). Shapes: `circle`, `square`, `none` (icon only). Icons: Font Awesome (class string or HTML) or image URL.
- **Coordinate conversion**: Scene coordinates → screen pixels via `_sceneToScreen(sceneX, sceneY)` using `canvas.stage.toGlobal()` (reuses a PIXI.Point for performance). Positions updated on canvas pan, zoom, and resize (throttled).
- **Lifecycle**: Initialized on first use. On `canvasReady` and `updateScene`, loads pins for the current scene via `PinManager.list({ sceneId })` and calls `PinRenderer.loadScenePins(sceneId, pins)`. Clearing the overlay when the scene has no pins. Only **placed** pins for the active scene are rendered; unplaced pins are never drawn.
- **PinRenderer**: Same file; orchestrates loading/clearing and delegates DOM creation/update to PinDOMElement. Context menu is custom HTML; “Configure Pin” calls `pinsAPI.configure(pinId, { sceneId })`.

### Pins schema (`scripts/pins-schema.js`)

- **Responsibility**: Pin data shape, defaults, validation, and migration.
- **Version**: `PIN_SCHEMA_VERSION`; each pin has a `version` field.
- **Defaults**: Applied on create/validation (e.g. size, style, shape, ownership). Not necessarily stored to keep payloads small.
- **Validation**: `validatePinData(pin, opts)` — e.g. `allowUnplaced` omits x/y requirement. Invalid pins are dropped or repaired on load; scene load never fails due to a bad pin.
- **Migration**: Migration map keyed by version; runs on scene load before validation. Migrates in place and logs; on failure for a pin, drop that pin and log.

### API layer (`scripts/api-pins.js`)

- **Responsibility**: Public interface for other modules. Thin wrapper over PinManager and PinConfigWindow.
- **Methods**: create, update, delete, get, list, place, unplace, on, registerContextMenuItem, unregisterContextMenuItem, configure, reload. See `api-pins.md` for contracts.

### Pin configuration window (`scripts/window-pin-config.js`)

- **Responsibility**: Application V2 window for editing pin properties (size, shape, style, icon, text, etc.).
- **Entry**: `pinsAPI.configure(pinId, options)` (exposed in `api-pins.js`; loads `PinConfigWindow` and calls `PinConfigWindow.open(pinId, options)`).
- **Resolve pin**: `getData()` calls `PinManager.get(this.pinId, this.sceneId !== undefined ? { sceneId: this.sceneId } : {})` — no default `sceneId` so unplaced store is checked first when omitted.
- **Permission**: `PinManager._canEdit(pin, userId)` in `getData()`; window does not open without edit permission (API also enforces on update).
- **Save**: On submit, window builds a patch (size, shape, style, dropShadow, image, textLayout, textDisplay, textColor, textSize, textMaxLength, textScaleWithPin) and calls `pinsAPI.update(this.pinId, patch, { sceneId: this.sceneId })`.
- **Context menu**: “Configure Pin” in `pins-renderer.js` is shown only when the user can edit; it calls `pinsAPI.configure(pinId, { sceneId: canvas?.scene?.id })` (or without `sceneId` for unplaced).
- **Class**: Exported as `PinConfigWindow`; static `open(pinId, options)`; constructor accepts `pinId` and `options` (e.g. `sceneId`, `onSelect`, `useAsDefault`, `moduleId`).
- **Files**: `scripts/window-pin-config.js`, `templates/window-pin-config.hbs`, `styles/window-pin-config.css`. Application id `blacksmith-pin-config`; root form class `blacksmith-pin-config`. Stable selectors for theming: `#blacksmith-pin-config`, `.blacksmith-pin-config`, `.window-content` (see `api-pins.md` for contracts).
- **Ownership**: Ownership editor is not in the current window; permissions are enforced by the API. Full payload shape, default schema, and config-window contracts are in `api-pins.md`.

**Config window checklist (current state):** Window extends Application V2; exports `PinConfigWindow`; static `open(pinId, options)`; `getData()` uses `PinManager.get()` with optional `sceneId` (omit for unplaced); permission check in `getData()` via `_canEdit()`; form submission calls `pinsAPI.update()`; template covers size, shape, style, icon color, text config; context menu and `pins.configure()` wired. Ownership editor not in window (optional future).

**Testing:** Right-click pin → “Configure Pin” opens only if user can edit; save updates pin on canvas or unplaced list; `pinsAPI.configure(pinId)` with no `sceneId` works for unplaced pins; non-editing user gets permission error or no open.

---

## Rendering pipeline

1. **Scene load / change**: `canvasReady` or `updateScene` → renderer schedules load → `PinManager.list({ sceneId: canvas.scene.id })` → only placed pins for that scene.
2. **Pin list**: PinManager returns array from `scene.flags[MODULE.ID].pins`.
3. **DOM**: For each pin, PinDOMElement creates or updates a div (position, size, shape, icon, text from pin data). Coordinates converted from scene to screen; overlay is fixed, so pins are positioned in screen space.
4. **Pan / zoom / resize**: Throttled update runs `_sceneToScreen` for each pin and updates div position/size. Pins can be hidden during pan/zoom for performance, then shown again after.

No canvas “layer” is used for pins; the overlay is a sibling of the canvas app element in the DOM.

---

## Event flow

1. **DOM**: PinDOMElement attaches listeners to each pin div (click, contextmenu, pointer move, drag, etc.).
2. **Delegation**: On interaction, the renderer resolves `pinId` and `pinData` and calls `PinManager._invokeHandlers(eventType, pin, sceneId, …)` with structured payload (e.g. modifiers, originalEvent).
3. **Handlers**: PinManager looks up registered handlers for that event type (and optional pinId/moduleId/sceneId) and invokes each. Errors are isolated so one failing handler does not break others. AbortSignal and drag opt-in are respected.

---

## Permissions model

- **Visibility**: Who can see a pin is determined by ownership (default + per-user overrides). GM sees all.
- **Create**: Allowed only if `pinsAllowPlayerWrites` is true or user is GM.
- **Edit / Configure / Delete**: Any user with OWNER (or higher) on the pin can edit, configure, or delete that pin, regardless of `pinsAllowPlayerWrites`. GM can always do everything.
- **Write path**: Scene flags and world setting `pinsUnplaced` are written only by the GM client; non-GM editors go through requestGM/socket so the GM performs the write.

---

## Default values and schema (reference)

Applied during create/validation when not provided:

- **size**: `{ w: 32, h: 32 }`
- **style**: `{ fill: "#000000", stroke: "#ffffff", strokeWidth: 2, alpha: 1, iconColor: "#ffffff" }`
- **shape**: `'circle'`
- **version**: `PIN_SCHEMA_VERSION`
- **ownership**: `{ default: 0 }`
- **text**: undefined
- **image**: undefined (or Font Awesome class string / image URL)
- **config**: `{}`

Image supports Font Awesome class strings and image URLs (no HTML in stored value). Full schema and validation rules are in `pins-schema.js`.

---

## Integration points (summary)

| Concern            | Location / mechanism |
|--------------------|----------------------|
| Placed pin storage | `scene.flags[MODULE.ID].pins` (array) |
| Unplaced pin storage | World setting `pinsUnplaced` (object with `pins` array) |
| Rendering          | DOM overlay `#blacksmith-pins-overlay`; PinDOMElement per pin; `styles/pins.css` |
| Coordinate conversion | `PinDOMElement._sceneToScreen()` using canvas.stage.toGlobal (PIXI.Point reused) |
| CRUD & permissions | PinManager (`manager-pins.js`) |
| Schema & migration | `pins-schema.js` |
| Public API         | `api-pins.js` → `game.modules.get('coffee-pub-blacksmith')?.api?.pins` |
| Config UI          | `window-pin-config.js` (PinConfigWindow); opened via `pinsAPI.configure()`; context menu “Configure Pin” in `pins-renderer.js` |
| Hooks              | `blacksmith.js`: canvasReady / updateScene trigger pin load; dropCanvasData for dropping pins onto canvas |

---

## Lessons learned (from Squire implementation)

### What worked well

- Scene flags for placed pins: reliable and persistent.
- State-driven appearance: visuals update from pin data.
- Drop canvas data hook: clean integration with Foundry drag-and-drop.

### What we do differently

- **No PIXI for pin graphics**: Pins are DOM elements in a fixed overlay; only coordinate conversion uses the canvas/PIXI stack.
- **Single init**: Pin overlay and hooks initialized once (e.g. on first use); no duplicate creation across hooks.
- **Unplaced vs placed**: Explicit two-store model (world setting vs scene flags) so most pins can stay unplaced and only some are placed.
- **Event cleanup**: Handlers can be unregistered via AbortSignal or explicit API.
- **Validation and migration**: Schema version and migration map; invalid pins dropped without failing scene load.
- **Context menu**: Registration API so modules add items without editing core renderer code.

---

## Remaining work

See **`plans-pins.md`** for the full checklist. Examples: optional use of Foundry’s context menu system, documentation and test updates.
