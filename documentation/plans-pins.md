# Canvas Pins Implementation Plan

**Target**: FoundryVTT v13+ only with Application V2 API support

**Last updated**: Post–Phase 4 implementation with Phase 5.2 (documentation) complete. Phases 1–4 complete; Phase 5.1 (automated tests) remains. Pure DOM rendering, shape support, context menu registration, RGBA colors, enhanced image support, CSS-based styling, pin animations, and drop shadows all implemented. Pan/zoom performance optimized (removed hide/show logic).

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|--------|
| **1** | Complete | Data model, manager, CRUD, permissions, event handler registration |
| **2.1–2.2** | Complete | Pure DOM rendering (circle/square/none shapes), Font Awesome/icons/images, CSS-based styling, fade-in animations, performance optimizations |
| **2.3** | Complete | Drag-and-drop placement (dropCanvasData), drag to move, visual feedback, AbortController cleanup |
| **3.1–3.2** | Complete | Hover/click/double-click events, modifiers, DOM listeners, context menu |
| **3.3** | Complete | Context menu registration system; default items (Delete, Properties); modules can register custom items |
| **4** | Complete | API complete + `reload()` + availability checks + context menu registration; shape, color, image support |
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

### 2.1 Rendering System Integration
- [x] Create DOM overlay container for pins — `PinDOMElement.initialize()` creates `#blacksmith-pins-overlay`
- [x] Set container properties: `position: fixed`, `z-index: 2000`, `pointer-events: none` — in `pins.css`
- [x] Single initialization point — `PinRenderer.initialize()` calls `PinDOMElement.initialize()`; pins loaded via `canvasReady` and `updateScene` hooks
- [x] Implement pin DOM rendering logic — `PinDOMElement` class in `pins-renderer.js`
- [x] Handle scene loading — `_scheduleSceneLoad()` ensures pins load on scene activation
- [x] Clear pins on scene change — `loadScenePins` calls `clear()` before loading
- [x] Support canvas zoom and pan — pins use scene coordinates converted to screen pixels; hide during pan/zoom for performance

### 2.2 Pin Visual Representation
- [x] Render pin base (size, style, shape) using pure DOM — circle/square/none with CSS styling
- [x] Render pin image/icon if provided — Font Awesome (HTML or class strings) and image URLs (including `<img>` tags)
- [x] Render pin text label if provided — Planned for future (text rendering not yet implemented)
- [x] Pure DOM approach — No PIXI, all HTML divs with CSS
- [x] CSS-based styling — All styles in `pins.css` with configurable variables
- [x] Shape support — circle (default), square (rounded corners), none (icon only)
- [x] Fade-in animations — Smooth 0.2s fade-in on creation
- [x] Performance optimization — Hide pins during pan/zoom, update after canvas settles
- [x] Implement hover/selection visual feedback — CSS `:hover` scale transform (1.1)

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
- [x] Set up event listeners on pin DOM elements using DOM event system — `_setupEventListeners()` in `PinDOMElement`
- [x] Use AbortController for automatic event cleanup — Phase 1.3; handlers support `signal`
- [x] Implement hit testing (determine which pin was clicked) — per-pin DOM element, pointer-events
- [x] Double-click detection — 300ms window, prevents false clicks/double-clicks during drag
- [x] Route events to appropriate registered handlers — `_invokeHandlers()` called from DOM event handlers
- [x] Pass event data and pin context to callbacks — `PinEvent` structure with pin, sceneId, userId, modifiers, originalEvent (DOM MouseEvent)
- [x] Performance optimization — Hide pins during pan/zoom, debounced position updates after canvas settles

### 3.3 Context Menu
- [x] Create context menu for right-click on pins — custom HTML menu in `_showContextMenu` / `_renderContextMenu`
- [x] Add default items ("Delete Pin", "Properties") — permission-aware; Delete calls API
- [x] Context menu item registration system — `registerContextMenuItem()` / `unregisterContextMenuItem()` in API
- [x] Filter menu items by moduleId and visible function — modules can scope items to their pins
- [x] Sort menu items by order property — lower numbers appear first
- [ ] Use FoundryVTT's context menu system (v13+) — currently custom HTML implementation

---

## Phase 4: API and Integration

### 4.1 Blacksmith API Integration
- [x] Create `api-pins.js` wrapper class (`PinsAPI`) following `api-stats.js` pattern
- [x] Expose pins API as `blacksmith.pins` (create, update, delete, get, list, on, reload, isAvailable, isReady, whenReady)
- [x] Wire `PinsAPI` in `blacksmith.js` (`module.api.pins = PinsAPI`)
- [x] API guards for missing canvas/scene — `_getScene()` throws
- [x] Pins load after canvas ready — `canvasReady` and `updateScene` hooks; layer auto-activates when scene has pins
- [x] Document API usage patterns — `api-pins.md` expanded with Usage Patterns, cross-module examples, create/list/events/reload/cleanup
- [x] Add API availability checks — `isAvailable()`, `isReady()`, `whenReady()` in `api-pins.js`; documented in `api-pins.md`

### 4.2 Pin Configuration API
- [x] Implement `create` / `update` / `delete` / `get` / `list` in `api-pins.js`
- [x] Implement `on()` method — event handler registration with disposer and `signal`; supports double-click event
- [x] Implement `registerContextMenuItem()` / `unregisterContextMenuItem()` — context menu item registration system
- [x] Implement `reload()` method — reload pins from scene flags; optional layer init/activation
- [x] Shape support — `shape` property: 'circle' (default), 'square', 'none' (icon only)
- [x] Color support — RGBA, HSL, named colors in addition to hex
- [x] Image support — Font Awesome HTML, Font Awesome class strings, image URLs, `<img>` tags
- [x] API for querying pins (scene, id, moduleId) — `list()` filters
- [x] Validate pin `config` field — `pins-schema.js`
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
- [ ] Test all event types (hoverIn/Out, click, doubleClick, rightClick, middleClick, modifiers)
- [ ] Test scene change handling and container cleanup
- [ ] Test permission scenarios (GM vs player; `pinsAllowPlayerWrites`)
- [ ] Test with multiple consumers (multiple modules)
- [ ] Test performance with many pins (100+)
- [ ] Test drag operations (dragStart, dragMove, dragEnd events, position persistence)

### 5.2 Documentation
- [x] `api-pins.md` — API reference, data types, permissions, errors, usage patterns
- [x] Usage examples section (create, list, events, reload, cleanup) — documented in `api-pins.md`
- [x] Event handler patterns and `AbortSignal` usage — documented in `api-pins.md`
- [x] Pin configuration options (size, style, shape, image formats) — documented in `api-pins.md` and `architecture-pins.md`
- [x] Permission behavior and `pinsAllowPlayerWrites` — documented in `api-pins.md`
- [x] Context menu registration system — documented in `api-pins.md`
- [x] Shape examples — All three shapes (`'circle'`, `'square'`, `'none'`) documented with code examples
- [x] Animation system — `ping()` method with 11 animation types documented, including 'ping' combo animation
- [x] Sound support — Blacksmith sound names and full paths documented with examples
- [x] Drop shadow property — `dropShadow` property and CSS variable documented
- [x] CSS customization — CSS variables section with examples
- [x] Ownership examples — Four concrete examples showing different ownership patterns

---

## Key Implementation Notes (from Squire Lessons Learned)

### Performance Optimizations
- **Pure DOM rendering**: Pins are HTML divs with CSS styling, no PIXI overhead
- **Pan/zoom optimization**: Pins remain visible during pan/zoom with real-time position updates (removed hide/show logic for better UX)
- **CSS-based styling**: All styles in `pins.css` with CSS variables for easy configuration
- **Dynamic icon measurement**: Font Awesome icons are measured after rendering for accurate centering (handles non-square icons)
- **Pin animations**: 11 animation types using CSS keyframes for smooth, performant animations

### Event Handling
- **AbortController**: Handler registration supports `signal`; all event listeners use AbortController pattern
- **DOM event system**: Direct DOM event listeners on pin elements (mousedown, mouseenter, mouseleave, etc.)
- **Double-click detection**: 300ms window with proper drag detection to prevent false clicks/double-clicks
- **Context menu registration**: Modules can register custom menu items with filtering and sorting

### Data Management
- **UUID-based IDs**: Used throughout
- **Validate on load**: `migrateAndValidatePins()` on scene load
- **Migration system**: `PIN_SCHEMA_VERSION`, `MIGRATION_MAP`
- **Orphaned cleanup**: Invalid pins dropped during migration/validation
- **Shape support**: `shape` property with 'circle'`, `'square'`, `'none'` options
- **Enhanced color support**: RGBA, HSL, HSLA, named colors in addition to hex
- **Enhanced image support**: Font Awesome HTML, class strings, image URLs, `<img>` tags

### Code Organization
- **Single initialization**: DOM overlay container created in `PinDOMElement.initialize()`; pins loaded via `canvasReady` / `updateScene`
- **Proper cleanup**: `clear()` on scene change; `cleanup()` on module unload
- **Error handling**: `postConsoleAndNotification` for pin/icon errors; all messages prefixed `BLACKSMITH | PINS`
- **CSS separation**: All static styles in `styles/pins.css` with CSS variables at top

### v13+ Specific
- **Application V2**: Context menu is custom HTML; Edit/Properties could use Application V2 later
- **Pure DOM approach**: No PIXI dependency for pin rendering; uses HTML/CSS for better layering and styling
- **Multiple image formats**: Font Awesome (HTML or class strings) and image URLs (including `<img>` tags)

---

## Recent Additions (Post-Phase 4)

- [x] Drop shadow property with CSS variable control
- [x] Pan/zoom optimization (removed hide/show logic)
- [x] 'Ping' combo animation type
- [x] Broadcast support for pin animations (socket-based, permission-filtered)
- [x] Enhanced documentation with shape examples and ownership patterns

## Future Considerations

- Pin grouping/categories
- Pin visibility filters
- Pin templates/presets
- Pin import/export
- Pin search/filtering
- Pin linking (connect pins with lines)
- Pin layers/z-ordering
