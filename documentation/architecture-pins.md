# Canvas Pins Architecture

## Overview

The Canvas Pins system provides a configurable, interactive pin system for the FoundryVTT canvas. Pins are visual markers that can be placed on scenes, configured with various properties, and respond to user interactions. The system is designed to be consumed by other modules (such as Coffee Pub Squire) while being managed by Blacksmith.

**Target Version**: FoundryVTT v13+ only, with Application V2 API support required.

**Implementation status**: Phases 1–3 and Phase 2.2–2.3 are implemented. Pins render using pure DOM approach (no PIXI) on a fixed overlay, support multiple shapes (circle, square, none), Font Awesome icons and image URLs, CSS-based styling with configurable variables, support CRUD and event handlers (hover, click, double-click, right-click, middle-click, drag), drag-and-drop placement via `dropCanvasData`, drag-to-move for existing pins, and a right-click context menu with registration system for modules. See `plans-pins.md` for details.

## Core Requirements

### Storage
- Pins must be stored in the scene they are placed on (using scene flags)
- Each pin should have a unique identifier within the scene (UUID-based, not timestamp)
- Pin data should persist across scene loads and module reloads
- Include data migration system for pin format changes
- Validate loaded pin data structure on scene load
- Include a pin data schema version for safe upgrades

### Configuration
Pins support the following configurable properties:
- **Size**: Configurable size/dimensions (default 32×32)
- **Style**: Visual styling (fill, stroke, strokeWidth, alpha) - supports hex, rgb, rgba, hsl, hsla, named colors
- **Shape**: Pin shape - 'circle' (default), 'square' (rounded corners), or 'none' (icon only, no background)
- **Text**: Optional text label (stored; rendering planned)
- **Image**: Font Awesome HTML (e.g. `<i class="fa-solid fa-star"></i>`), Font Awesome class string (e.g. `'fa-solid fa-star'`), or image URL (e.g. `'icons/svg/star.svg'` or `<img src="path/to/image.webp">`)

### Interactivity
Pins support the following interactions:
- **Droppable**: Implemented via `dropCanvasData` hook (drop `type: 'blacksmith-pin'` data on canvas)
- **Draggable**: Implemented (left-click + drag to move; 5px threshold distinguishes from click)
- **Deletable**: Via API or context menu (right-click → Delete Pin)
- **Updateable**: Via API; context menu supports custom items via registration system
- **Hover / Click / Double-Click / Drag**: Implemented (hoverIn, hoverOut, click, doubleClick, rightClick, middleClick, dragStart, dragMove, dragEnd; modifiers passed to handlers)
- **Context Menu**: Right-click shows menu with registered items (modules can register custom items) plus default items (Delete Pin, Properties)

### Event Handling
Pins support the following events, with callbacks passed back to the caller:
- **Hover**: Mouse enter/leave events (hoverIn, hoverOut)
- **Left Click**: Single left mouse button click
- **Double-Click**: Double left mouse button click (300ms window)
- **Right Click**: Context menu / right mouse button click (shows menu with registered + default items)
- **Middle Click**: Middle mouse button click
- **Modifier-Click**: All click events include modifier keys (Ctrl, Alt, Shift, Meta)
- **Drag**: Drag start/move/end (opt-in for modules that need `dragEvents: true`)

The event system should work similarly to:
- **HookManager**: Register callbacks that get invoked when events occur
- **Menubar**: Event delegation pattern where registered handlers are called

### Rendering
- Pins render using **pure DOM approach** (no PIXI) - HTML divs positioned over the canvas
- Pins are in a fixed overlay container (`#blacksmith-pins-overlay`) with `z-index: 2000`
- Pins support multiple shapes: `circle` (default, 50% border-radius), `square` (rounded corners via CSS variable), or `none` (icon only, no background)
- Icons support Font Awesome (HTML or class strings) and image URLs (including `<img>` tags)
- All styling is CSS-based (`styles/pins.css`) with configurable variables (icon size ratio, border radius)
- Pins fade in smoothly on creation (0.2s transition)
- Pins hide during pan/zoom for performance, then update positions after canvas settles
- The layer auto-activates when loading scenes that contain pins, so pins are visible after refresh
- Pins are visible to all users with view permission; create/update/delete respect ownership and `pinsAllowPlayerWrites`
- Pins update in real-time when modified via the API

## Architecture Patterns

### Event Callback Pattern
Similar to HookManager and Menubar, pins support:
1. Registration of event handlers per pin or globally (via `pinsAPI.on()`)
2. Event delegation from DOM event listeners on pin elements
3. Callback invocation with structured event data (type, pin, sceneId, userId, modifiers, originalEvent)
4. Error handling for callback failures (isolated per handler, doesn't break other handlers)
5. Easy unregistration via return handle or AbortSignal
6. Context menu item registration (modules can add custom menu items via `pinsAPI.registerContextMenuItem()`)

### Data Structure
Pins should be stored in scene flags (not embedded documents):
- Each pin needs: `id` (UUID), `x`, `y`, `size`, `style`, `text`, `image`, `config`, `moduleId`, `version`, `ownership`
- Store only essential data - event handlers registered separately (not stored in scene data)
- Pin configuration should be serializable and validated
- Use proper hit area calculation that includes all visible elements (base, text, labels)

**Recommended minimal schema**:
```json
{
  "id": "uuid",
  "x": 0,
  "y": 0,
  "size": { "w": 32, "h": 32 },
  "style": { "fill": "#000000", "stroke": "#ffffff", "strokeWidth": 2, "alpha": 1 },
  "shape": "circle",
  "text": "Optional label",
  "image": "Optional Font Awesome HTML, class string, or image URL",
  "config": {},
  "moduleId": "consumer-module-id",
  "ownership": { "default": 0, "users": { "USER_ID": 3 } },
  "version": 1
}
```

### Validation and Migration
- Validate pins on load; drop or repair invalid entries
- Keep a migration map keyed by `version`
- Log migration errors with actionable messages
- Never fail scene load due to a bad pin entry

**Migration Strategy**:
- Migration map structure: `Map<version, migrationFunction>`
- Runs on scene load before pin validation
- Migrates pins in-place, updates `version` field
- Migration functions receive pin data and return migrated pin data
- Logs migration actions for debugging (which pins migrated, from what version to what version)
- If migration fails for a pin, drop the pin and log error (never fail scene load)
- Current schema version should be defined as a constant (e.g., `PIN_SCHEMA_VERSION = 1`)

### Rendering System
- Pins render using **pure DOM approach** - HTML divs in a fixed overlay container
- Overlay container (`#blacksmith-pins-overlay`) is `position: fixed`, covers full viewport, `z-index: 2000`
- Each pin is a DOM div with CSS styling (circle/square/none shape, colors, transitions)
- Icons are HTML elements (Font Awesome via innerHTML, images via backgroundImage)
- Pins use scene coordinates converted to screen pixels; zoom/pan supported via coordinate conversion
- System initialized on `canvasReady`; pins loaded via `canvasReady` and `updateScene` hooks
- Pins cleared when scenes change
- Layer auto-activates when loading scenes that have pins (for compatibility, though pins don't use the layer)

### Permissions Model
- Default to GM-only create/update/delete
- Allow read-only access for non-GM users
- Use Foundry ownership semantics (`CONST.DOCUMENT_OWNERSHIP_LEVELS`) for pin visibility/editability
- `ownership.default` and per-user overrides govern who can view or edit
- GM always has full access
- Enforce permissions in both UI interactions and API calls

### Default Values
When creating pins, the following defaults apply if properties are not provided:
- **`size`**: `{w: 32, h: 32}` - Standard 32x32 pixel pin
- **`style`**: `{fill: "#000000", stroke: "#ffffff", strokeWidth: 2, alpha: 1}` - Black fill, white stroke (supports RGBA, HSL, etc.)
- **`shape`**: `'circle'` - Circular pin (50% border-radius)
- **`version`**: `1` - Current schema version (uses `PIN_SCHEMA_VERSION` constant)
- **`ownership`**: `{default: 0}` - No ownership (GM-only by default)
- **`text`**: `undefined` - No text label
- **`image`**: `undefined` - No icon (circle only). When provided, supports Font Awesome HTML, Font Awesome class strings, or image URLs.
- **`config`**: `{}` - Empty config object

These defaults are applied during pin creation/validation, not stored in scene flags (to minimize data size). Image property supports multiple formats: Font Awesome HTML (`<i class="fa-solid fa-star"></i>`), Font Awesome class strings (`'fa-solid fa-star'`), image URLs (`'icons/svg/star.svg'`), or `<img>` tags (`<img src="path/to/image.webp">`).

## API Design Principles

1. **Module Consumer Pattern**: Other modules register pins and event handlers
2. **Event Forwarding**: Events bubble from canvas -> pin system -> registered callbacks
3. **Permission Awareness**: Respect FoundryVTT permissions for create/update/delete
4. **Performance**: Efficient rendering and event handling for many pins
5. **Extensibility**: Easy to add new pin types, styles, or event types

## Lessons Learned from Squire Implementation

### What Worked Well
- **Scene flags for storage**: Reliable and persists properly
- **PIXI.Container organization**: Good structure for managing multiple pins
- **State-based appearance**: Automatic visual updates based on state changes
- **Drop canvas data hook**: Clean integration with Foundry's drag-and-drop system

### What to Do Differently

#### 1. Container Management
- **Issue**: Duplicated creation across multiple hooks
- **Solution**: Single centralized initialization in `canvasReady` hook only
- **Solution**: Proper cleanup when scenes change

#### 2. Pin Appearance Updates
- **Issue**: Removes all children and recreates graphics on every update (inefficient)
- **Solution**: Update existing PIXI.Graphics objects, only recreate when structure fundamentally changes
- **Solution**: Batch multiple pin updates together

#### 3. Event Cleanup
- **Issue**: Manual cleanup of global event listeners (`document.addEventListener`) must be tracked
- **Solution**: Use `AbortController` for event listeners (v13+ feature)
- **Solution**: Automatic cleanup on pin destruction

#### 4. Hit Area Calculation
- **Issue**: Hit area only covers inner shape, not title text
- **Solution**: Calculate proper hit area that includes all visible elements (base shape + text bounds)

#### 5. State Parsing
- **Issue**: Regex parsing of HTML content is fragile
- **Solution**: Use DOM parser consistently for any content parsing
- **Solution**: Cache parsed results to avoid redundant parsing

#### 6. Debouncing
- **Issue**: No debouncing for rapid state changes or journal updates
- **Solution**: Add debouncing for update operations
- **Solution**: Batch multiple updates when possible

#### 7. Error Handling
- **Issue**: Try-catch blocks with silent failures
- **Solution**: Proper error logging with user notifications for critical failures

#### 8. Data Validation
- **Issue**: No validation of saved pin data structure
- **Solution**: Validate pin data on load, handle missing/invalid data gracefully
- **Solution**: Migration system for pin data format changes

#### 9. Config Management
- **Issue**: Config cache never invalidated, no validation
- **Solution**: Add config validation and cache invalidation
- **Solution**: Support hot-reload for testing

#### 10. Modern APIs (v13+ Only)
- Use Application V2 API for any dialogs/forms
- Use modern event handling patterns (AbortController)
- Leverage latest FoundryVTT canvas APIs

## Integration Points

- **Scene Data**: Pins stored in `scene.flags['coffee-pub-blacksmith'].pins[]` (MODULE.ID from `const.js`). Each scene has its own pins array.
- **Canvas Layer**: `blacksmith-utilities-layer`; `PinRenderer` manages a PIXI.Container; `PinGraphics` per pin.
- **Event System**: PIXI pointer events on each pin; `PinManager._invokeHandlers()` dispatches to registered handlers. AbortSignal supported for cleanup.
- **API Exposure**:
  - **`scripts/pins-schema.js`**: Data model, validation, migration
  - **`scripts/manager-pins.js`**: CRUD, permissions, event handler registration, context menu item registration
  - **`scripts/pins-renderer.js`**: Pure DOM pin rendering, Font Awesome/icons/images, context menu rendering
  - **`scripts/api-pins.js`**: Public `PinsAPI` (create, update, delete, get, list, on, registerContextMenuItem, unregisterContextMenuItem, reload)
  - **`scripts/blacksmith.js`**: `module.api.pins = PinsAPI`; `canvasReady` / `updateScene` hooks for pin loading
  - **`styles/pins.css`**: All pin styling with CSS variables for configuration
- **Context Menu**: Custom HTML right-click menu with registration system. Modules can register custom items; default items (Delete Pin, Properties) always shown. Menu items filtered by `moduleId` and `visible` function.

## Remaining Work

See **`plans-pins.md`** for the full checklist. Outstanding items include:

- **Phase 3.3**: Context menu registration system implemented; optional use of Foundry context menu system remains.
- **Phase 4–5**: Documentation updates, automated tests.
