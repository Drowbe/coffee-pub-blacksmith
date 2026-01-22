# Canvas Pins Architecture

## Overview

The Canvas Pins system provides a configurable, interactive pin system for the FoundryVTT canvas. Pins are visual markers that can be placed on scenes, configured with various properties, and respond to user interactions. The system is designed to be consumed by other modules (such as Coffee Pub Squire) while being managed by Blacksmith.

**Target Version**: FoundryVTT v13+ only, with Application V2 API support required.

## Core Requirements

### Storage
- Pins must be stored in the scene they are placed on (using scene flags)
- Each pin should have a unique identifier within the scene (UUID-based, not timestamp)
- Pin data should persist across scene loads and module reloads
- Include data migration system for pin format changes
- Validate loaded pin data structure on scene load
- Include a pin data schema version for safe upgrades

### Configuration
Pins must support the following configurable properties:
- **Size**: Configurable size/dimensions
- **Style**: Visual styling options (colors, borders, effects)
- **Text**: Optional text label/description
- **Image**: Optional image/icon to display

### Interactivity
Pins must support the following interactions:
- **Droppable**: Can be placed on the canvas (drag-and-drop from a source)
- **Draggable**: Can be moved around the canvas after placement
- **Deletable**: Can be removed from the canvas
- **Updateable**: Properties can be modified after creation

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
- Pins must render on the **Blacksmith Layer** (`blacksmith-utilities-layer`)
- Pins should be visible to all users (with appropriate permission checks)
- Pins should update in real-time when modified

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
- Use a PIXI.Container within the layer to hold all pins
- Container should have `sortableChildren = true` for z-ordering
- Container should have `eventMode = 'static'` (v13+ requirement)
- Use FoundryVTT's canvas coordinate system
- Single initialization point (in `canvasReady` hook)
- Clear container contents when scenes change
- Handle layer activation/deactivation properly
- Support zoom and pan operations

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
- **`image`**: `undefined` - No image/icon
- **`config`**: `{}` - Empty config object

These defaults should be applied during pin creation/validation, not stored in scene flags (to minimize data size).

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

- **Scene Data**: Store pins in scene flags (format: `scene.flags['coffee-pub-blacksmith'].pins[]`)
  - MODULE.ID = `'coffee-pub-blacksmith'` (from `scripts/const.js`)
  - Pins stored as array of PinData objects
  - Each scene maintains its own pins array
- **Canvas Layer**: Render on `blacksmith-utilities-layer` using PIXI.Container
- **Event System**: Use FoundryVTT's interaction system (mouse events, keyboard modifiers) with proper cleanup
- **API Exposure**: Expose pin management through Blacksmith API
  - **`scripts/pins-schema.js`**: Data model, validation, migration (internal)
  - **`scripts/manager-pins.js`**: Internal manager with CRUD and permissions
  - **`scripts/api-pins.js`**: Public API wrapper (`PinsAPI` class) following `api-stats.js` pattern
  - **`scripts/blacksmith.js`**: Exposes `module.api.pins = PinsAPI` for external consumption
- **Application V2**: Use FoundryVTT v13+ Application V2 API for any UI components
