# Canvas Pins Architecture

## Overview

The Canvas Pins system provides a configurable, interactive pin system for the FoundryVTT canvas. Pins are visual markers that can be placed on scenes, configured with various properties, and respond to user interactions. The system is designed to be consumed by other modules (such as Coffee Pub Squire) while being managed by Blacksmith.

**Target Version**: FoundryVTT v13+ only, with Application V2 API support required.

**Implementation status**: Phases 1–3 are implemented. Pins render on the Blacksmith layer with Font Awesome icons, support CRUD and event handlers (hover, click, right-click, middle-click), and a right-click context menu. Drag-and-drop placement and drag-to-move are not yet implemented. See `plans-pins.md` for details.

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
- **Style**: Visual styling (fill, stroke, strokeWidth, alpha)
- **Text**: Optional text label (stored; rendering planned)
- **Image**: Font Awesome HTML only (e.g. `<i class="fa-solid fa-star"></i>`). Legacy image paths are mapped to a default star icon.

### Interactivity
Pins support the following interactions:
- **Droppable**: Not yet implemented (drag-and-drop from a source)
- **Draggable**: Not yet implemented (drag to move)
- **Deletable**: Via API or context menu (right-click → Delete)
- **Updateable**: Via API; context menu Edit/Properties placeholders
- **Hover / Click**: Implemented (hoverIn, hoverOut, click, rightClick, middleClick; modifiers passed to handlers)

### Event Handling
Pins must support the following events, with callbacks passed back to the caller:
- **Hover**: Mouse enter/leave events
- **Left Click**: Standard left mouse button click
- **Right Click**: Context menu / right mouse button click
- **Middle Click**: Middle mouse button click
- **Modifier-Click**: Click with keyboard modifiers (Ctrl, Alt, Shift, Meta)
- **Drag**: Drag start/move/end (opt-in for modules that need it)

The event system should work similarly to:
- **HookManager**: Register callbacks that get invoked when events occur
- **Menubar**: Event delegation pattern where registered handlers are called

### Rendering
- Pins render on the **Blacksmith Layer** (`blacksmith-utilities-layer`)
- The layer auto-activates when loading scenes that contain pins, so pins are visible after refresh
- Pins are visible to all users with view permission; create/update/delete respect ownership and `pinsAllowPlayerWrites`
- Pins update in real-time when modified via the API

## Architecture Patterns

### Event Callback Pattern
Similar to HookManager and Menubar, pins should support:
1. Registration of event handlers per pin or globally
2. Event delegation from the canvas layer
3. Callback invocation with event data and pin context
4. Error handling for callback failures
5. Easy unregistration via return handle or AbortSignal

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
  "style": { "fill": "#000000", "stroke": "#ffffff", "strokeWidth": 2 },
  "text": "Optional label",
  "image": "Optional path",
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

### Layer Integration
- Pins render on `BlacksmithLayer` (extends `foundry.canvas.layers.CanvasLayer`)
- A PIXI.Container within the layer holds all pins (`pins-renderer.js`)
- Container has `sortableChildren = true`, `eventMode = 'static'`
- Pins use scene coordinates; zoom/pan supported via canvas transform
- Container initialized in layer `_draw()`; pins loaded via `canvasReady` and `updateScene` hooks
- Container cleared when scenes change and when layer deactivates
- Layer auto-activates when loading scenes that have pins

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
- **`style`**: `{fill: "#000000", stroke: "#ffffff", strokeWidth: 2, alpha: 1}` - Black fill, white stroke
- **`version`**: `1` - Current schema version (should use `PIN_SCHEMA_VERSION` constant)
- **`ownership`**: `{default: 0}` - No ownership (GM-only by default)
- **`text`**: `undefined` - No text label
- **`image`**: `undefined` - No icon (circle only). When provided, use Font Awesome HTML only.
- **`config`**: `{}` - Empty config object

These defaults are applied during pin creation/validation, not stored in scene flags (to minimize data size). Icons use Font Awesome only; legacy image paths (e.g. `icons/svg/star.svg`) are converted to a default star icon at render time.

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
  - **`scripts/manager-pins.js`**: CRUD, permissions, event handler registration
  - **`scripts/pins-renderer.js`**: Pin graphics, Font Awesome icons, context menu
  - **`scripts/api-pins.js`**: Public `PinsAPI` (create, update, delete, get, list, on, reload)
  - **`scripts/blacksmith.js`**: `module.api.pins = PinsAPI`; `canvasReady` / `updateScene` hooks for pin loading
- **Context Menu**: Custom HTML right-click menu (Edit, Delete, Properties). Application V2 could be used for Edit/Properties dialogs later.

## Remaining Work

See **`plans-pins.md`** for the full checklist. Outstanding items include:

- **Phase 2.2**: Render pin `text` label; hit area including text bounds.
- **Phase 2.3**: Drag-and-drop placement (`dropCanvasData`); drag to move existing pins.
- **Phase 3.3**: Custom context menu items from callbacks; optional use of Foundry context menu.
- **Phase 4–5**: Documentation (usage examples, event patterns), API availability checks, automated tests.
