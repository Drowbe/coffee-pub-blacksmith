# Canvas Pins Implementation Plan

**Target**: FoundryVTT v13+ only with Application V2 API support

**Last updated**: Post–Phase 2.3 implementation. Phases 1–3 and Phase 2.2–2.3 complete; Phase 4–5 items (docs, tests) remain.

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|--------|
| **1** | Complete | Data model, manager, CRUD, permissions, event handler registration |
| **2.1–2.2** | Complete | Container, rendering (circle + Font Awesome icon + text label), layer integration, hover feedback, hit area including text |
| **2.3** | Complete | Drag-and-drop placement (dropCanvasData), drag to move, visual feedback, AbortController cleanup |
| **3.1–3.2** | Complete | Hover/click events, modifiers, PIXI listeners, context menu |
| **3.3** | Partial | Edit/Delete/Properties done; custom menu items, Foundry menu system not done |
| **4** | Partial | API complete + `reload()`; docs and availability checks incomplete |
| **5** | Not started | Formal testing, full API reference |

---

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
- [x] Clear container contents on scene change — `PinRenderer.clear()` in `loadScenePins` and layer `deactivate()`
- [x] Implement permission checks (GM-only for create/update/delete by default, per architecture) — `_canCreate()`, `_canEdit()`, `_canView()`
- [x] Support ownership-based visibility/editability using Foundry ownership levels — uses `CONST.DOCUMENT_OWNERSHIP_LEVELS`
- [x] Add configuration flag to allow or disallow player writes — `pinsAllowPlayerWrites` setting in `settings.js`
- [x] Add orphaned pin cleanup (handle deleted references) — invalid pins dropped during migration/validation
- [x] Add API guards for missing canvas/scene — `_getScene()` throws if scene not found

### 1.3 Event Handler Registration
- [x] Design event handler registration API (similar to HookManager/Menubar) — `registerHandler()` in `manager-pins.js`
- [x] Support per-pin and global event handlers — filtering via `pinId`, `moduleId`, `sceneId` options
- [x] Implement event callback invocation system with proper error handling — `_invokeHandlers()` with try-catch
- [x] Use AbortController for automatic event cleanup (v13+ feature) — `AbortSignal` support in `registerHandler()`
- [x] Add error logging and user notifications for callback failures — `postConsoleAndNotification` on handler errors
- [x] Ensure handlers can be removed via returned disposer or AbortSignal — disposer function + `signal` cleanup
- [x] Wire `on()` method in `api-pins.js` — calls `PinManager.registerHandler()`

---

## Phase 2: Rendering System

### 2.1 Blacksmith Layer Integration
- [x] Create PIXI.Container within BlacksmithLayer for pins — `PinRenderer.initialize(layer)` in `canvas-layer.js` `_draw()`
- [x] Set container properties: `sortableChildren = true`, `eventMode = 'static'` — in `pins-renderer.js`
- [x] Single initialization point — `_draw()` of BlacksmithLayer; pins loaded via `canvasReady` and `updateScene` hooks
- [x] Implement pin drawing/rendering logic — `PinGraphics` in `pins-renderer.js`
- [x] Handle layer activation/deactivation — `activate()` loads pins, `deactivate()` calls `PinRenderer.clear()`
- [x] Clear container on scene change — `loadScenePins` calls `clear()` before loading; `deactivate` clears
- [x] Support canvas zoom and pan — pins use scene coordinates; layer follows canvas transform

### 2.2 Pin Visual Representation
- [x] Render pin base (size, style) using PIXI.Graphics — circle with fill/stroke
- [x] Render pin image/icon if provided — Font Awesome only; legacy paths map to default `fa-solid fa-star`
- [x] Render pin text label if provided — `PIXI.Text` below circle, styled with stroke color
- [x] Update existing graphics objects instead of recreating (performance) — `PinGraphics.update()` updates circle in place
- [x] Only recreate graphics when structure fundamentally changes — rebuild when size/image/text changes
- [x] Implement hover/selection visual feedback — scale to 1.1 on hover
- [x] Calculate proper hit area that includes all visible elements (base + text bounds) — `_updateHitArea()` creates rectangle including circle and text

### 2.3 Canvas Interaction
- [x] Implement drag-and-drop for pin placement (using `dropCanvasData` hook) — handles `type: 'blacksmith-pin'` drops
- [x] Implement drag for moving existing pins — left-click + drag on editable pins; 5px threshold to distinguish from click
- [x] Use AbortController for drag event listeners (proper cleanup) — `_dragAbortController` cleans up on abort
- [x] Add clear visual feedback during drag operations — alpha 0.7, zIndex 1000 during drag
- [x] Handle canvas coordinate transformations — converts global screen coords to scene coords via `stage.toLocal()`
- [x] Prevent Foundry selection box during drag operations — sets `canvas.controls.activeControl = null`

---

## Phase 3: Event System

### 3.1 Mouse Event Handling
- [x] Implement hover detection (mouse enter/leave) → `hoverIn` / `hoverOut` — `PinGraphics` pointerenter/pointerleave
- [x] Implement left click, right click, middle click → `click` / `rightClick` / `middleClick` — `pointerdown` + button detection
- [x] Detect keyboard modifiers (Ctrl, Alt, Shift, Meta) and pass in `PinEvent.modifiers`
- [x] Support modifier-click semantics (modifier state available to handlers)

### 3.2 Event Delegation
- [x] Set up event listeners on pin graphics using PIXI event system — `_setupEventListeners()` in `PinGraphics`
- [x] Use AbortController for automatic event cleanup — Phase 1.3; handlers support `signal`
- [x] Implement hit testing (determine which pin was clicked) — per-pin hit area, `eventMode = 'static'`
- [x] Hit area for base shape — circle; text bounds not yet included (no text rendering)
- [x] Route events to appropriate registered handlers — `_invokeHandlers()` called from PinGraphics handlers
- [x] Pass event data and pin context to callbacks — `PinEvent` structure with pin, sceneId, userId, modifiers, originalEvent
- [ ] Add debouncing for rapid state changes

### 3.3 Context Menu
- [x] Create context menu for right-click on pins — custom HTML menu in `_showContextMenu` / `_renderContextMenu`
- [x] Add "Edit", "Delete", "Properties" options — permission-aware; Delete calls API
- [ ] Support custom context menu items from callbacks
- [ ] Use FoundryVTT's context menu system (v13+) — currently custom implementation

---

## Phase 4: API and Integration

### 4.1 Blacksmith API Integration
- [x] Create `api-pins.js` wrapper class (`PinsAPI`) following `api-stats.js` pattern
- [x] Expose pins API as `blacksmith.pins` (create, update, delete, get, list, on, reload)
- [x] Wire `PinsAPI` in `blacksmith.js` (`module.api.pins = PinsAPI`)
- [x] API guards for missing canvas/scene — `_getScene()` throws
- [x] Pins load after canvas ready — `canvasReady` and `updateScene` hooks; layer auto-activates when scene has pins
- [ ] Document API usage patterns — `api-pins.md` partial; expand with examples
- [ ] Add API availability checks (e.g. helper or guards pre–canvasReady)

### 4.2 Pin Configuration API
- [x] Implement `create` / `update` / `delete` / `get` / `list` in `api-pins.js`
- [x] Implement `on()` method — event handler registration with disposer and `signal`
- [x] Implement `reload()` method — reload pins from scene flags; optional layer init/activation
- [ ] API for updating pin properties with debouncing support
- [x] API for querying pins (scene, id, moduleId) — `list()` filters
- [x] Validate pin `config` field — `pins-schema.js`
- [ ] Support config cache invalidation if we add external config (e.g. JSON) — future
- [x] Implement `PinEvent` payload and document error semantics — passed to handlers; see `api-pins.md`

### 4.3 Module Consumer Support
- [x] Example usage — `utilities/test-pins-debug.js`, `test-pins-reload.js`; console examples in CHANGELOG
- [ ] Support module-specific pin types/styles — not yet
- [x] Handle module unload cleanup — `PinManager.cleanup()` / `clearHandlers()` on `unloadModule`
- [ ] Provide migration path for existing pin implementations (e.g. Squire)

---

## Phase 5: Testing and Documentation

### 5.1 Testing
- [x] Manual testing of create/update/delete, `get`/`list`, `reload`, events, context menu
- [ ] Automated tests for API contracts, permissions, migration
- [ ] Test all event types (hoverIn/Out, click, rightClick, middleClick, modifiers)
- [ ] Test scene change handling and container cleanup
- [ ] Test permission scenarios (GM vs player; `pinsAllowPlayerWrites`)
- [ ] Test with multiple consumers (multiple modules)
- [ ] Test performance with many pins (100+)
- [ ] Test drag operations (when implemented)

### 5.2 Documentation
- [x] `api-pins.md` — API reference, data types, permissions, errors
- [ ] Usage examples section (create, list, events, reload, cleanup)
- [ ] Event handler patterns and `AbortSignal` usage
- [ ] Pin configuration options (size, style, image as Font Awesome)
- [ ] Permission behavior and `pinsAllowPlayerWrites`

---

## Key Implementation Notes (from Squire Lessons Learned)

### Performance Optimizations
- **Update graphics, don't recreate**: `PinGraphics.update()` updates circle in place; rebuild only when size/image changes
- **Batch updates**: Not yet implemented
- **Debounce rapid changes**: Not yet implemented
- **Cache parsed content**: Font Awesome classes resolved per pin; could cache FA texture by class string

### Event Handling
- **AbortController**: Handler registration supports `signal`; drag listeners will use it when added
- **Proper hit areas**: Circle only today; extend to include text when labels are rendered

### Data Management
- **UUID-based IDs**: Used throughout
- **Validate on load**: `migrateAndValidatePins()` on scene load
- **Migration system**: `PIN_SCHEMA_VERSION`, `MIGRATION_MAP`
- **Orphaned cleanup**: Invalid pins dropped during migration/validation

### Code Organization
- **Single initialization**: Container created in `_draw()`; pins loaded via `canvasReady` / `updateScene`
- **Proper cleanup**: `clear()` on scene change and layer deactivate; `cleanup()` on module unload
- **Error handling**: `postConsoleAndNotification` for pin/icon errors; all messages prefixed `BLACKSMITH | PINS`

### v13+ Specific
- **Application V2**: Context menu is custom HTML; Edit/Properties could use Application V2 later
- **eventMode**: `eventMode = 'static'` on container and pin graphics
- **Font Awesome only**: Icons are Font Awesome HTML only; legacy image paths map to default star

---

## Future Considerations

- Pin grouping/categories
- Pin visibility filters
- Pin animation/effects
- Pin templates/presets
- Pin import/export
- Pin search/filtering
- Pin linking (connect pins with lines)
- Pin layers/z-ordering
