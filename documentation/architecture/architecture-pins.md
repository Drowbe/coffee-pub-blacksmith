# Canvas Pins Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes how the Canvas Pins system is built and how its parts interact. It is an architecture reference, not an API reference (see `api-pins.md` for the public API).

## Overview

The Canvas Pins system provides configurable, interactive markers on the FoundryVTT canvas. Pins can be **placed** on a scene (visible on the canvas) or **unplaced** (data only; typical for notes, quests, etc.). The system is consumed by other modules (e.g. Coffee Pub Squire) and managed by Blacksmith.

**Target**: FoundryVTT v13+ only. Application V2 is used for the pin configuration window.

**Implementation**: Pins render as **pure DOM** (no PIXI graphics) in a fixed overlay. Storage is split: placed pins in scene flags, unplaced pins in a world setting. CRUD, permissions, classification, view state, events, and context menu registration are centralized in PinManager; rendering and coordinate conversion live in the pins renderer.

**Read [Design rationale](#design-rationale) first.** The system has three deliberately separate concerns —
**permission** (may you see it), **classification** (what kind of thing is it), and **view state** (do you
want to see it right now). Most pin bugs come from conflating two of them.

---

## Storage

### Placed pins

- **Where**: `scene.flags[MODULE.ID].pins` (array of pin objects).
- **When**: Pins stored in a scene flag array with `x` and `y` are “placed” and appear on the canvas for that scene. Storage is container-based; API reads may enrich returned objects with `sceneId`.
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
- **Taxonomy registry**: Owns the type/tag vocabulary (see [Classification](#classification-types-tags-and-taxonomy)).
- **Filter state**: Owns per-user view state and named profiles (see [View state](#view-state-filters-and-profiles)).

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
- **Migration**: Migration map keyed by version; runs on scene/unplaced read before validation. GMs persist upgraded pins to scene flags or the unplaced world setting when stored data is behind schema (once per scene/unplaced per session). On failure for a pin, drop that pin and log.

### API layer (`scripts/api-pins.js`)

- **Responsibility**: Public interface for other modules. Thin wrapper over PinManager and the windows.
- **Surface**: CRUD (`create`, `update`, `delete`, `get`, `list`), placement (`place`, `unplace`), events (`on`), context menu (`registerContextMenuItem` / `unregisterContextMenuItem`), UI (`configure`, `openLayers`), classification (`registerPinType`, `registerPinTaxonomy`, `getModuleTaxonomy`, `getPinTaxonomyChoices`), view state (module visibility, filter profiles, `getSceneFilterSummary`), and `reload`.
- **`api-pins.md` is the authoritative contract** and is accurate — prefer it over this list, which only exists to show the shape.

### Pin configuration window (`scripts/window-pin-configuration.js`)

- **Responsibility**: Application V2 window for editing all pin properties.
- **Entry**: `pinsAPI.configure(pinId, options)` → `PinConfigWindow.open(pinId, options)`.
- **Resolve pin**: `getData()` calls `PinManager.get(this.pinId, ...)` — unplaced store checked first when `sceneId` is omitted.
- **Permission**: `PinManager._canEdit(pin, userId)` in `getData()`; window refuses to open without edit permission.
- **Sections**: Permissions, Classification, Pin Design, Text Format, Event Animations, Pin Source.
- **Save**: Builds a full patch and calls `pinsAPI.update(this.pinId, patch, { sceneId })`. GM-only fields (tags, pin editing, pin visibility, allow duplicates) are applied separately.
- **Pin visibility** (`config.blacksmithVisibility`): `'visible'` | `'hidden'` in Permissions (GM only). Hidden = marker not drawn for other players; GM and pin owner always see the pin.
- **Pin editing** (`config.blacksmithAccess`): `'gm'` | `'private'` | `'public'` — who may edit the pin record; maps to `ownership.default`.
- **Allow Duplicates**: Moved from header toggle into the Permissions section body.
- **Update All mode** (`_updateAllMode`): Toggle in action bar left (“Update All [type] Pins”). When enabled, each section header shows a checkbox; on save, only checked sections are bulk-applied to same-type peer pins after confirmation. Permissions section includes pin editing, pin visibility, and allow-duplicates when checked.
- **Use as Default mode** (`_defaultMode`): “Default for [type]” toggle in the window header. When enabled, each section header shows a separate checkbox; on save, only checked sections are written to `clientPinDefaultDesigns` (client-scope setting keyed `moduleId|type`). Warns if no sections selected.
- **Icon label**: `formatIconLabel(iconClass)` extracts the icon name from a FA class string (e.g. `fa-solid fa-skull` → `skull`), skipping style prefix classes (`fa-solid`, `fa-regular`, etc.).
- **Class**: `PinConfigWindow`; static `open(pinId, options)`. Constructor params: `pinId`, `options.sceneId`, `options.onSelect`, `options.moduleId`.
- **Files**: `scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`, `styles/window-pin-config.css`.

### Pin Layers window (`scripts/window-pin-layers.js`)

- **Responsibility**: The user-facing view-state UI — what *this* user currently wants to see. It never edits pins.
- **Class**: `PinLayersWindow extends BlacksmithWindowBaseV2`.
- **Surface**: Per type/tag show-hide, a hide-all toggle, search, per-scene counts via `PinManager.getSceneFilterSummary(sceneId)`, and named profiles.
- **Hidden pins remain addressable**: list/search paths take `includeHiddenByFilter` so the window can show and act on pins that the active filter is hiding. A filtered-out pin is not gone — see the three-concerns table below.

### Journal page pins (`scripts/ui-journal-pins.js`)

- **Responsibility**: Surfaces pins inside journal sheets. Uses **`JournalDomWatchdog`** (`manager-journal-dom.js`) for DOM observation and **HookManager only** for journal render hooks — see `architecture-blacksmith.md` §9B.1. Do not add a per-feature body `MutationObserver` here.

---

## Classification: types, tags, and taxonomy

Two axes, deliberately (see [Design rationale](#deliberate-choices)):

- **`type`** — coarse and technical, set by the creating module (e.g. `quest-pin`, `journal-pin`).
- **`tags[]`** — open-ended and user-facing. Free-form strings *and* registered vocabulary both allowed.

The **taxonomy** is the registered vocabulary: per-type labels and suggested tags, plus a set of global tags
that apply everywhere. It is merged from **three tiers**, later winning, in `getPinTaxonomy()`:

| Tier | Source |
|---|---|
| **builtin** | `resources/pin-taxonomy.json`, loaded by `ensureBuiltinTaxonomyLoaded()` |
| **override** | a GM-supplied JSON at the `pinTaxonomyOverrideJson` setting path (skipped if it points at the builtin) |
| **runtime** | `registerPinTaxonomy(moduleId, type, taxonomy)` — how consuming modules contribute |

`getPinTaxonomy(moduleId, type)` returns the merged entry; `getPinTaxonomyChoices()` unions its tags with the
global tags. Taxonomy is **advisory** — it drives labels and suggestions, not validation. An unregistered tag
on a pin is legal.

---

## View state: filters and profiles

**Per-user, never persisted to the pin.** This is a preference, not a permission — a filtered-out pin is
still there, still visible to everyone else, and still editable.

Backed by client settings on `PinManager`: `pinsHiddenTypeTags`, `pinsHideAll`, `pinsFilterProfiles`,
`pinsActiveFilterProfile`, plus `pinTagRegistry`.

- `_isHiddenByFilter(pin)` is the single predicate the renderer consults.
- Named profiles: `listVisibilityProfiles()`, `getVisibilityProfile(name)`, `getActiveFilterProfileName()`,
  `visibilityStateMatchesProfile()`, plus system profiles (`isSystemVisibilityProfileName`).
- `getSceneFilterSummary(sceneId, options)` backs the Layers window's counts.
- `_matchesListFilters(pin, options)` powers filtered list queries.

---

## Rendering pipeline

1. **Scene load / change**: `canvasReady` or `updateScene` → renderer schedules load → `PinManager.list({ sceneId: canvas.scene.id })` → only placed pins for that scene.
2. **Pin list**: PinManager returns array from `scene.flags[MODULE.ID].pins`.
3. **Pre-filter — before any DOM is created** (`pins-renderer.js`):
   ```js
   const visiblePins = pins.filter((pin) =>
       this._canUserSeePin(pin, userId, PinManager) && !PinManager._isHiddenByFilter(pin));
   ```
   **Both gates run up front, not per-frame and not after render.** `_canUserSeePin` is the *permission*
   gate (ownership + `blacksmithVisibility`); `_isHiddenByFilter` is the *view-state* gate. A pin failing
   either never becomes a DOM node. This is the system's main performance lever — see
   [Design rationale](#deliberate-choices).
4. **DOM**: For each surviving pin, PinDOMElement creates or updates a div (position, size, shape, icon, text from pin data). Coordinates converted from scene to screen; overlay is fixed, so pins are positioned in screen space.
5. **Pan / zoom / resize**: Throttled update runs `_sceneToScreen` for each pin and updates div position/size. Pins can be hidden during pan/zoom for performance, then shown again after.

Changing filter state re-runs the load path — that is what makes a filter change add or remove DOM nodes.

No canvas “layer” is used for pins; the overlay is a sibling of the canvas app element in the DOM.

---

## Event flow

1. **DOM**: PinDOMElement attaches listeners to each pin div (click, contextmenu, pointer move, drag, etc.).
2. **Delegation**: On interaction, the renderer resolves `pinId` and `pinData` and calls `PinManager._invokeHandlers(eventType, pin, sceneId, …)` with structured payload (e.g. modifiers, originalEvent).
3. **Handlers**: PinManager looks up registered handlers for that event type (and optional pinId/moduleId/sceneId) and invokes each. Errors are isolated so one failing handler does not break others. AbortSignal and drag opt-in are respected.

---

## Permissions model

- **Foundry ownership** (`ownership.default` / `users`): Gates `_canView` (level > NONE) and `_canEdit` (level ≥ OWNER for non-GMs). GM sees all.
- **Pin visibility** (`config.blacksmithVisibility`): `'visible'` or `'hidden'` — whether others see the marker on the map (hidden = not drawn). GM-only in UI.
- **Pin editing** (`config.blacksmithAccess`): Who may edit the pin shell; independent of what the module does on click.
- **Module behavior**: Click/double-click and document edit rights are **not** implied by pin editing or pin visibility.
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
- **tags**: `[]`
- **text**: undefined
- **image**: undefined (or Font Awesome class string / image URL)
- **config**: `{}`

Image supports Font Awesome class strings and image URLs (no HTML in stored value). Full schema and validation rules are in `pins-schema.js`.

### Migrations

`PIN_SCHEMA_VERSION` is currently **7**. Migrations are keyed by version and run on read, before validation.
Read them in `pins-schema.js` rather than trusting this list to stay current — but the shape of the history
matters, because two of them are why the model looks the way it does:

| → | What it did |
|---|---|
| v2 | added `type`, defaulting to `'default'` |
| v3 | added `group` and `tags` |
| **v4** | **removed `group`**, promoting non-empty values into `tags` |
| v5 | renamed type `journal-page` → `journal-pin` |
| v6 | decoupled legacy access presets from visibility |
| **v7** | **dropped `owner` visibility**, mapping it to `visible` |

v3 introducing `group` and v4 deleting it is the whole argument for the two-axis model. v7 is why no
consumer writes `'owner'` anymore.

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
| Classification vocabulary | `resources/pin-taxonomy.json` + `pinTaxonomyOverrideJson` setting + `registerPinTaxonomy()` |
| View state         | Client settings `pinsHiddenTypeTags`, `pinsHideAll`, `pinsFilterProfiles`, `pinsActiveFilterProfile`, `pinTagRegistry` |
| Render pre-filter  | `pins-renderer.js` — `_canUserSeePin()` && `!PinManager._isHiddenByFilter()` before DOM creation |
| Public API         | `api-pins.js` → `game.modules.get('coffee-pub-blacksmith')?.api?.pins` |
| Config UI          | `window-pin-configuration.js` (PinConfigWindow); opened via `pinsAPI.configure()`; context menu “Configure Pin” in `pins-renderer.js` |
| Layers / filter UI | `window-pin-layers.js` (PinLayersWindow); counts via `getSceneFilterSummary()` |
| Journal pins       | `ui-journal-pins.js` — via `JournalDomWatchdog`, HookManager-only |
| Hooks              | `blacksmith.js`: canvasReady / updateScene trigger pin load; dropCanvasData for dropping pins onto canvas |

---

## Design rationale

### What works well

- Scene flags for placed pins: reliable and persistent.
- State-driven appearance: visuals update from pin data.
- Drop canvas data hook: clean integration with Foundry drag-and-drop.

### Three separable concerns

The design spine. These are **independent axes** and conflating them is the main way pin work goes wrong:

| Concern | Question it answers | Mechanism |
|---|---|---|
| **Permission** | *May* this user see or edit the pin? | Hard gate — `blacksmithAccess` / `blacksmithVisibility`, ownership |
| **Classification** | *What kind of thing* is this pin? | `type` (coarse, technical) + `tags[]` (user-facing, open-ended) |
| **View state** | Does this user *want* to see it right now? | Per-user filters + named profiles; never persists to the pin |

Permission is a gate; view state is a preference. A filtered-out pin is not a hidden pin. Never express a
permission decision as a filter, or vice versa.

### Deliberate choices

- **No PIXI for pin graphics**: Pins are DOM elements in a fixed overlay; only coordinate conversion uses the canvas/PIXI stack.
- **Single init**: Pin overlay and hooks initialized once (e.g. on first use); no duplicate creation across hooks.
- **Unplaced vs placed**: Explicit two-store model (world setting vs scene flags) so most pins can stay unplaced and only some are placed.
- **Event cleanup**: Handlers can be unregistered via AbortSignal or explicit API.
- **Validation and migration**: Schema version and migration map; invalid pins dropped without failing scene load.
- **Context menu**: Registration API so modules add items without editing core renderer code.
- **`type` + `tags[]`, not `type` + `group` + `tags[]`.** The model originally had a third `group` field.
  Schema **v4 removed it** and promoted its values into `tags` (`pins-schema.js` — the v3→v4 migration
  deletes `group`). Two axes were enough: one coarse and technical (`type`), one open-ended and user-facing
  (`tags`). A middle tier was a third thing to name, keep consistent, and explain. **Don't reintroduce it.**
- **Pre-filter over viewport culling.** The renderer excludes pins by permission and active filter
  **before DOM creation**, rather than culling off-screen pins. The suspected pressure points are DOM node
  count, per-pin coordinate work on pan/zoom, icon rendering, and event overhead — not raw memory.
  Pre-filtering attacks node count directly and is far simpler than a viewport system. Culling was
  deliberately deferred, and **should not be built without a measurement first**.

---

## Remaining work

See **`documentation/TODO.md`**. Architecture drives API development; pins-specific todos live there.
