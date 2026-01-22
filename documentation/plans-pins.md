# Canvas Pins Implementation Plan

**Target**: FoundryVTT v13+ only with Application V2 API support

## Phase 1: Core Infrastructure

### 1.1 Pin Data Model
- [x] Define pin data structure (id, x, y, size, style, text, image, config, moduleId, version, ownership) — `pins-schema.js` with PinData typedef
- [x] Use scene flags for storage (`scene.flags['coffee-pub-blacksmith'].pins[]`; MODULE.ID) — implemented in `manager-pins.js`
- [x] Create pin schema/validation with data migration support — `pins-schema.js` with `validatePinData()`, `migrateAndValidatePin()`, `migrateAndValidatePins()`
- [x] Implement UUID-based pin IDs (not timestamp-based to avoid collisions) — consumers provide UUID via `crypto.randomUUID()`
- [x] Define `PIN_SCHEMA_VERSION` constant and add migration map (`Map<version, migrationFn>`) — `PIN_SCHEMA_VERSION = 1`, `MIGRATION_MAP` ready
- [x] Run migrations on scene load **before** validation; log migration actions — `migrateAndValidatePins()` runs migrations then validates
- [x] Validate and repair/drop invalid pin entries on load (never fail scene load) — invalid pins dropped, errors logged, scene load never fails
- [x] Apply default values per architecture (size, style, version, ownership) when creating/validating — `applyDefaults()` in `pins-schema.js`

### 1.2 Pin Manager Class
- [x] Create `PinManager` class to handle pin lifecycle — `manager-pins.js`
- [x] Implement pin CRUD operations (create, read, update, delete) — `create()`, `update()`, `delete()`, `get()`, `list()`
- [x] Add scene change handling (load pins when scene changes) — `_getScenePins()` reads from flags, migrates/validates
- [ ] Clear container contents on scene change (not just reload) — Phase 2 (container not created yet)
- [x] Implement permission checks (GM-only for create/update/delete by default, per architecture) — `_canCreate()`, `_canEdit()`, `_canView()`
- [x] Support ownership-based visibility/editability using Foundry ownership levels — uses `CONST.DOCUMENT_OWNERSHIP_LEVELS`
- [x] Add configuration flag to allow or disallow player writes — `pinsAllowPlayerWrites` setting in `settings.js`
- [x] Add orphaned pin cleanup (handle deleted references) — invalid pins dropped during migration/validation
- [x] Add API guards for missing canvas/scene — `_getScene()` throws if scene not found

### 1.3 Event Handler Registration
- [ ] Design event handler registration API (similar to HookManager/Menubar)
- [ ] Support per-pin and global event handlers
- [ ] Implement event callback invocation system with proper error handling
- [ ] Use AbortController for automatic event cleanup (v13+ feature)
- [ ] Add error logging and user notifications for callback failures
- [ ] Ensure handlers can be removed via returned disposer or AbortSignal

## Phase 2: Rendering System

### 2.1 Blacksmith Layer Integration
- [ ] Create PIXI.Container within BlacksmithLayer for pins
- [ ] Set container properties: `sortableChildren = true`, `eventMode = 'static'`
- [ ] Single initialization point in `canvasReady` hook (avoid duplication)
- [ ] Implement pin drawing/rendering logic
- [ ] Handle layer activation/deactivation
- [ ] Clear container on scene change
- [ ] Support canvas zoom and pan

### 2.2 Pin Visual Representation
- [ ] Render pin base (size, style) using PIXI.Graphics
- [ ] Render pin image/icon if provided
- [ ] Render pin text label if provided
- [ ] **IMPORTANT**: Update existing graphics objects instead of recreating (performance)
- [ ] Only recreate graphics when structure fundamentally changes
- [ ] Implement hover/selection visual feedback
- [ ] Calculate proper hit area that includes all visible elements (base + text bounds)

### 2.3 Canvas Interaction
- [ ] Implement drag-and-drop for pin placement (using `dropCanvasData` hook)
- [ ] Implement drag for moving existing pins
- [ ] Use AbortController for drag event listeners (proper cleanup)
- [ ] Add clear visual feedback during drag operations
- [ ] Handle canvas coordinate transformations
- [ ] Prevent Foundry selection box during drag operations

## Phase 3: Event System

### 3.1 Mouse Event Handling
- [ ] Implement hover detection (mouse enter/leave) → `hoverIn` / `hoverOut`
- [ ] Implement left click, right click, middle click → `click` / `rightClick` / `middleClick`
- [ ] Detect keyboard modifiers (Ctrl, Alt, Shift, Meta) and pass in `PinEvent.modifiers`
- [ ] Support modifier-click semantics per architecture (modifier state available to handlers)

### 3.2 Event Delegation
- [ ] Set up event listeners on canvas layer using PIXI event system
- [ ] Use AbortController for automatic event cleanup
- [ ] Implement hit testing (determine which pin was clicked)
- [ ] Hit area must include all visible elements (not just base shape)
- [ ] Route events to appropriate registered handlers
- [ ] Pass event data and pin context to callbacks
- [ ] Add debouncing for rapid state changes

### 3.3 Context Menu
- [ ] Create context menu for right-click on pins (using Application V2)
- [ ] Add "Edit", "Delete", "Properties" options
- [ ] Support custom context menu items from callbacks
- [ ] Use FoundryVTT's context menu system (v13+)

## Phase 4: API and Integration

### 4.1 Blacksmith API Integration
- [x] Create `api-pins.js` wrapper class (`PinsAPI`) following `api-stats.js` pattern
- [x] Expose pins API as `blacksmith.pins` (create, update, delete, get, list) per api-pins.md
- [x] Wire `PinsAPI` in `blacksmith.js` (`module.api.pins = PinsAPI`)
- [x] API guards for missing canvas/scene — `_getScene()` in `manager-pins.js` handles this
- [ ] Ensure API available after `canvasReady` (guards for missing canvas/scene) - Phase 2 (for rendering)
- [ ] Document API usage patterns
- [ ] Add API availability checks

### 4.2 Pin Configuration API
- [x] Implement `create` / `update` / `delete` / `get` / `list` in `api-pins.js` (wraps `PinManager` methods)
- [ ] Implement `on()` method in `api-pins.js` (event handler registration - Phase 1.3)
- [ ] API for updating pin properties (with debouncing support) - Phase 2
- [ ] API for registering event handlers (disposer + `signal` option; AbortController support) - Phase 1.3
- [x] API for querying pins (by scene, by id, by moduleId, etc.) - `list()` with filters
- [x] Validate pin `config` field - handled in `pins-schema.js`
- [ ] Support config cache invalidation if we add external config (e.g. JSON) - future
- [ ] Implement `PinEvent` payload and document error semantics (per api-pins.md) - Phase 1.3

### 4.3 Module Consumer Support
- [ ] Create example usage patterns
- [ ] Support module-specific pin types/styles
- [ ] Handle module unload cleanup
- [ ] Provide migration path for existing pin implementations

## Phase 5: Testing and Documentation

### 5.1 Testing
- [ ] Test pin creation/update/delete and API return types (create/update → PinData; delete → void)
- [ ] Test `get()` returns `null` when pin not found (no throw); `update`/`delete` throw when not found
- [ ] Test API throws on invalid data, missing scene, permission denied (per api-pins.md)
- [ ] Test all event types (hoverIn/Out, click, rightClick, middleClick, modifiers; dragStart/Move/End with opt-in)
- [ ] Test scene change handling and container cleanup
- [ ] Test permission scenarios (GM vs player; ownership; config flag for player writes)
- [ ] Test with multiple consumers (multiple modules)
- [ ] Test orphaned pin cleanup
- [ ] Test data migration scenarios (version map, run before validation, never fail scene load)
- [ ] Test event cleanup (disposer, AbortSignal; no memory leaks)
- [ ] Test hit area accuracy (including text bounds)
- [ ] Test performance with many pins (100+)
- [ ] Test drag operations with rapid movements

### 5.2 Documentation
- [ ] Update `api-pins.md` with complete API reference
- [ ] Create usage examples
- [ ] Document event handler patterns
- [ ] Document pin configuration options
- [ ] Document permission behavior and error handling

## Key Implementation Notes (from Squire Lessons Learned)

### Performance Optimizations
- **Update graphics, don't recreate**: Modify existing PIXI.Graphics objects instead of removing/recreating
- **Batch updates**: Group multiple pin updates together
- **Debounce rapid changes**: Add debouncing for state synchronization
- **Cache parsed content**: Cache any parsed content (like HTML/DOM parsing)

### Event Handling
- **AbortController**: Use AbortController for all event listeners (v13+ feature) for automatic cleanup
- **Proper hit areas**: Calculate hit areas that include all visible elements, not just base shape

### Data Management
- **UUID-based IDs**: Use proper UUIDs, not timestamps (avoid collisions)
- **Validate on load**: Always validate pin data structure when loading from scene flags
- **Migration system**: Include data migration for pin format changes
- **Orphaned cleanup**: Handle cleanup of pins referencing deleted entities

### Code Organization
- **Single initialization**: One place to create container (canvasReady hook)
- **Proper cleanup**: Clear container contents on scene changes
- **Error handling**: Proper logging and user notifications for failures

### v13+ Specific
- **Application V2**: Use Application V2 API for any dialogs/forms
- **eventMode**: Use `eventMode = 'static'` for PIXI containers
- **Modern patterns**: Leverage latest FoundryVTT APIs and patterns

## Future Considerations

- Pin grouping/categories
- Pin visibility filters
- Pin animation/effects
- Pin templates/presets
- Pin import/export
- Pin search/filtering
- Pin linking (connect pins with lines)
- Pin layers/z-ordering
