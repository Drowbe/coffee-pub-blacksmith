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
- **When**: Pins stored in a scene flag array with `x` and `y` are "placed" and appear on the canvas for that scene. Storage is container-based; API reads may enrich returned objects with `sceneId`.
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
- **CRUD**: Create, update, delete, get, list. Resolves pin location (unplaced vs scene) via `_findPinLocation(pinId)`.
- **Place / unplace**: Moves pins between unplaced store and scene flags.
- **Permissions**: `_canEdit(pin, userId)` uses ownership (and optional hook `blacksmith.pins.resolveOwnership`). Create is gated by world setting `pinsAllowPlayerWrites`; edit/configure/delete by ownership; GM always full access.
- **Events**: Registers handlers via `pins.on(eventType, handler, options)`. `VALID_EVENT_TYPES` (`manager-pins.js:118`) has sixteen: nine interaction events (`hoverIn`, `hoverOut`, `click`, `doubleClick`, `rightClick`, `middleClick`, `dragStart`, `dragMove`, `dragEnd`) and seven lifecycle events (`created`, `placed`, `unplaced`, `updated`, `deleted`, `deletedAll`, `deletedAllByType`). Options can scope by `pinId`, `moduleId`, `sceneId` and support `AbortSignal`; drag events require the `dragEvents` opt-in.
- **Context menu**: `registerContextMenuItem(id, item)` / `unregisterContextMenuItem(id)`. Modules add custom items; default items (e.g. Delete Pin, Configure Pin) are always shown when applicable. Items filtered by `moduleId` and `visible` function.
- **Schema**: Uses `pins-schema.js` for defaults, validation, and migration before persisting.
- **Taxonomy registry**: Owns the type/tag vocabulary (see [Classification](#classification-types-tags-and-taxonomy)).
- **Filter state**: Owns per-user view state and named profiles (see [View state](#view-state-filters-and-profiles)).

### Pins renderer (`scripts/pins-renderer.js`)

- **Responsibility**: Visual representation and input handling only. No ownership of pin data.
- **PinDOMElement**: Static class that owns the **DOM overlay** (`#blacksmith-pins-overlay`) and one **DOM element per pin** (div with class `blacksmith-pin`). No PIXI graphics for pins; styling is CSS (`styles/pins.css`). Shapes: `circle`, `square`, `rectangle`, `none` (icon only). `rectangle` is the image-only free-aspect shape (an image URL keeps its natural aspect with a rounded-corner border; a Font Awesome icon falls back to a forced square). Icons: Font Awesome (class string or HTML) or image URL.
- **Coordinate conversion**: Scene coordinates → screen pixels via `_sceneToScreen(sceneX, sceneY)` using `canvas.stage.toGlobal()` (reuses a PIXI.Point for performance). Positions updated on canvas pan, zoom, and resize (throttled).
- **Lifecycle**: Initialized on first use. On `canvasReady` and `updateScene`, loads pins for the current scene via `PinManager.list({ sceneId })` and calls `PinRenderer.loadScenePins(sceneId, pins)`. Clearing the overlay when the scene has no pins. Only **placed** pins for the active scene are rendered; unplaced pins are never drawn.
- **PinRenderer**: Same file; orchestrates loading/clearing and delegates DOM creation/update to PinDOMElement. Context menu is custom HTML; "Configure Pin" calls `pinsAPI.configure(pinId, { sceneId })`.

### Canvas layer (`scripts/canvas-layer.js`)

- **Responsibility**: `BlacksmithLayer` (extends `foundry.canvas.layers.CanvasLayer`) is injected into `CONFIG.Canvas.layers` at `blacksmith.js:824-831`. It is a pin lifecycle entry point, not a render surface: `_draw()` calls `PinRenderer.initialize()`, and `activate()` initializes the renderer and calls `PinRenderer.loadScenePins(sceneId, pins)`. Pin markers themselves render as DOM in the overlay (see the renderer above), not as PIXI on this layer.

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
- **Update All mode** (`_updateAllMode`): Toggle in action bar left ("Update All [type] Pins"). When enabled, each section header shows a checkbox; on save, only checked sections are bulk-applied to same-type peer pins after confirmation. Permissions section includes pin editing, pin visibility, and allow-duplicates when checked.
- **Use as Default mode** (`_defaultMode`): "Default for [type]" toggle in the window header. When enabled, each section header shows a separate checkbox; on save, only checked sections are written to `clientPinDefaultDesigns` (client-scope setting keyed `moduleId|type`). Warns if no sections selected.
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
`pinsActiveFilterProfile`.

`pinTagRegistry` is deliberately *not* in that list. It is a **world-scoped** setting (`settings.js:3405`) — shared tag vocabulary (classification), not per-user view state. Grouping it with the filters above conflates two of the three separable concerns; keep it separate.

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
5. **Pan / zoom / resize**: Throttled update runs `_sceneToScreen` for each pin and updates div position/size. Pins can be hidden during pan/zoom for performance, then shown again after. `:root` sizing variables are read through `PinDOMElement._rootVar(name)`, which caches them for one pass. Never call `getComputedStyle` inside this per-pin loop: each read after the previous pin's style writes forces a style recalc per pin per frame.

Changing filter state does not reload the scene. PinManager filter mutations call `PinRenderer.applyVisibilityFilters()` (`pins-renderer.js:2273`), which reconciles the existing DOM against the active filter — creating, removing, or showing/hiding pin nodes as needed — without re-running the `loadScenePins` path.

Pins render into a DOM overlay that is a sibling of the canvas app element, not as PIXI objects. A canvas layer does exist — `BlacksmithLayer` (see Components) — but it serves only as a pin lifecycle entry point; no pin graphics live on it.

---

## Event flow

1. **DOM**: PinDOMElement attaches listeners to each pin div (mouse down, hover, drag).
2. **Delegation**: On interaction, the renderer resolves `pinId` and `pinData` and calls `PinManager._invokeHandlers(eventType, pin, sceneId, …)` with structured payload (e.g. modifiers, originalEvent).
3. **Handlers**: PinManager looks up registered handlers for that event type (and optional pinId/moduleId/sceneId) and invokes each. Errors are isolated so one failing handler does not break others. AbortSignal and drag opt-in are respected.

### Mouse buttons

| Input | Result | Offered to modules |
|-------|--------|--------------------|
| Left press | Selects the pin (on press, so dragging an unselected pin selects it) | No |
| Second left click, same pin, within 300 ms | `doubleClick` | Yes |
| Right press | Context menu | `rightClick` |
| Middle press | | `middleClick` |

**There is no `click` event.** A single left-click is the pins tool's and cannot be mapped by a module; `VALID_EVENT_TYPES` omits it so `registerHandler('click')` throws rather than silently never firing. Double-click is detected as two clicks inside `DOUBLE_CLICK_MS` on the same pin (`PinDOMElement._registerClick`), not with a timer, so a single click acts immediately.

### Selection

State lives on `PinDOMElement` (`_selectedPinId`, `_selectedCanEdit`, `_lastDeleted`); the selected node carries `data-selected="true"`, styled in `pins.css`. One pin at a time. Nothing outside the renderer reads it, and it is not part of the public API.

- **Select**: `PinDOMElement.select(pinId, { canDelete })` on left press. `canEdit` is the same `_canEdit` test that gates the menu's Configure Pin and Delete Pin, resolved at press time because the key handler must answer synchronously.
- **Deselect**: `Escape`; a `pointerdown` anywhere outside `.blacksmith-pin` and the pin context menu; `removePin`; `clear` (scene change); overlay hidden.
- **Keys**: one capture-phase `keydown` listener on `document`, installed in `initialize` and removed in `cleanup`. Capture matters: Foundry's keyboard manager listens on `window` in the bubble phase, so a handled key stopped here never reaches core's Delete keybinding, which would otherwise also delete a controlled token. It ignores modified keys, auto-repeat, and any target inside `input, textarea, select, prose-mirror, [contenteditable]`.
- **Delete / Backspace** call `PinDOMElement._deletePin`, which the context menu's Delete Pin also calls -- one path, so the delete animation, permission check, GM relay and `deleted` event cannot drift apart.
- **Enter** calls `_configurePin`, which the menu's Configure Pin also calls. A focused button or link keeps its own Enter.
- **Ctrl/Cmd+Z** restores the last pin a GM deleted. `_deletePin` snapshots the pin (`PinManager.get`) before deleting and keeps one entry in `_lastDeleted`; `_undoDelete` calls `PinManager.create` with the original id, position and settings, then selects it. The entry expires after `UNDO_DELETE_MS` (60 s) and is dropped if the scene changed. Ctrl+Z is claimed **only while an entry is live**, so Foundry's own undo is untouched otherwise. GM only, because `create` is a GM write. Restoring fires `created`, not an "undeleted" event, so a satellite that tears down state on `deleted` sees a fresh pin.

- **Ctrl/Cmd+C** copies the selected pin into `PinDOMElement._clipboard` (data only, per session, lost on reload). A pin is copyable only if its type's taxonomy entry says `copyable: true` (default false, so undeclared means refused). The owner of a type is the only one who knows whether a second pin is safe: a note stores its pin's id, and a gather spot is reconciled against a target count. Blacksmith declares it for `journal-pin` and nothing else. Only an explicit boolean takes part in the taxonomy merge, so a user override that omits it does not undo the module's declaration. Anything refused warns "This pin cannot be copied." and empties the clipboard. A Ctrl+C with no pin selected also empties it, so the last copy wins and a stale pin cannot hijack Foundry's own paste of a token.
- **Ctrl/Cmd+V** creates a new pin (fresh id, everything else copied) under the mouse and selects it. Claimed only while the clipboard is filled and the pointer was last over the board or a pin. The position comes from a passive `pointermove` listener on `document` that records `clientX`/`clientY`, converted by `_clientToScene`; `canvas.mousePosition` is not used because the canvas gets no pointer events while the mouse is over a pin's DOM node. A user who may not create pins gets a warning.

### Pins made under a module that no longer owns them

A pin's `moduleId` is part of how everything finds it: Librarian lists pins by its own id, handlers filter on it, and the taxonomy and type labels are keyed by `moduleId|type`. A feature that moves between modules therefore strands the pins made before the move, which keep the old module's id and read as untracked and unlabelled. `PinManager.adoptPins` is the one place that rewrites it: it maps every scene's pin flag and the unplaced store, changing `moduleId` on the matching pins and nothing else, and fires `blacksmith.pins.adopted`. The module that now owns the feature calls it, with the types it is taking. Blacksmith deliberately keeps no vocabulary for a module that no longer makes pins: until the new owner has adopted them, those pins read as untracked, and after it they are the new owner's like any other.

### Broken links

A type declares `target` in its taxonomy entry (see `api-pins.md`). `PinManager.resolvePinTarget(pin)` returns `{ declared, uuid, doc, broken }`: the first listed config key holding a string is taken as a UUID and resolved with `fromUuid`, which tests existence and not permission. Three places use it:

- **The glyph.** `PinRenderer._applyTargetStatus`, called at the end of `_applyVisibilityForPin`, so every create and update is covered, sets or clears a broken-link glyph (`PinDOMElement._setBrokenIndicator`) and a tooltip on the pin. Only `_canEdit` users get it, which is the GM and the owners.
- **Re-checks.** `PinDOMElement.initialize` hooks `delete<Document>` for every world document type plus `JournalEntryPage`, except chat messages, and `PinRenderer.refreshTargetStatus` re-checks every drawn pin 150 ms after the last one. Creating a document does not trigger a re-check, so a restored document heals its pin on the next scene load.
- **Double-click.** `_registerClick` resolves the target before delivering `doubleClick`. A broken pin gets a warning and the event is withheld, which is part of the contract a satellite accepts by declaring `target`.

The taxonomy is loaded asynchronously, so `resolvePinTarget` awaits `ensureBuiltinTaxonomyLoaded` first; a pin drawn before the JSON arrives would otherwise read as having no target and never be re-checked.

Blacksmith declares `target` for `journal-pin` (`journalPageUuid`, `journalUuid`) and for `note` (`noteUuid`). Declaring `note` also gives Blacksmith's note pins a type label, which they lacked: the Configure Pin window header and its Update All toggle read blank for a type with no label. The window now falls back to the type key, title-cased, for any type that registers none.

### Relinking a broken pin

A type opts in with `relinkable: true` beside `target`. For the same reason as `copyable`, only the owner of a type knows what else is bound to the document a pin points at, so Blacksmith writes the one config key that held the dead UUID (`resolvePinTarget` returns it as `key`) and announces `relinked`, and the owner repairs the rest.

- **Search.** `PinManager.findRelinkCandidates` takes the kind of document from the dead UUID (`foundry.utils.parseUuid(uuid).type`). The pin keeps two clues, that kind and its own `text`, which is normally the document's name. **Compendiums are searched first, then the world**, because a world is rebuilt often and its documents get new ids while the compendiums they came from stay put. The compendium half goes through `api.compendiums.search` (Blacksmith as consumer zero), so the Compendium Mapping and its priority order apply, `allSources` adds the unmapped packs, and `includeWorld` stays off: the world half is ours, since it also has to find a page, which the Compendiums API does not index. A compendium holds journals and not their pages, so for a page the search opens up to six journals named alike and offers their pages (those named alike, or a journal's only page). The world half scores 100 for the same id, 80 for an exact name and 40 for a contained name.
- **Where to look.** The caller passes `sources` (`'compendiums'`, `'world'`, `'both'`), defaulting to the world settings `pinsRelinkSource`, `pinsRelinkAsk` and `pinsRelinkAllCompendiums` read by `getRelinkDefaults`. The dialog asks first (`api.dialog.choose`, the setting preselected) unless asking is off. A type with `relinkScope: 'world'` skips the question, is searched in the world only, and `relinkPin` refuses a document that has a `pack`: a satellite whose records are world documents has nothing to find in a compendium. Compendium results are not walked beyond the Compendiums API's own limits, and its first unscoped call indexes every pack, which is why that setting says so.
- **Write.** `PinManager.relinkPin` requires `relinkable`, a key to rewrite, a document that resolves, and the same document type as before, then calls `update` with the new config and fires `blacksmith.pins.relinked` and the registered `relinked` handlers. The old pin has no live document to compare against, so "same kind" is judged from the dead UUID.
- **Dialog.** `scripts/utility-pin-relink.js` is `api.dialog.prompt` with an `entityList` of candidates and a box that takes a dropped document or a pasted UUID. Nothing is preselected, so Enter cannot relink to a guess. A typed or dropped UUID wins over the list. A wrong kind or a missing document throws from `onSubmit`, which reopens the dialog with the message.
- **Entry points.** The **Relink** button in the Linked to row of Configure Pin, which swaps the row in place rather than re-rendering, since a re-render would discard unsaved edits; and **Relink Pin** in the right-click menu. Both are GM only and appear only for a broken pin of a `relinkable` type.
- **Repairing many.** `PinRelink.openBulk` is the same machinery over a scene, or over a selection: `PinManager.listBrokenPins(sceneId, { pinIds })` finds the broken pins of relinkable types and counts the ones that cannot be relinked; one question asks where to look (skipped when every pin is world only); `findRelinkCandidates` runs once per pin; and one dialog lists every pin with a dropdown of its matches, **Leave broken** by default. A match is preselected only when exactly one candidate has the same id or the same name, and nothing is written until Apply, so a preselection is a proposal. Apply calls `relinkPin` per pin with `interactive: false`, so no handler asks a question per pin, and `renameToMatch` from one checkbox stands in for the journal pin's rename question. Failures are collected and reported together, not thrown, since a throw reopens the dialog. The entry point is **Repair Links** in the action bar of the Manage Pin Links tab (GM). Scene only, because Manage Pins is per scene.
- **Journal pins.** Blacksmith is the first consumer. `_onJournalPinRelinked` in `ui-journal-pins.js` moves what a journal pin keeps about its document: `journalId` and `pageId` (or `journalId` and `journalUuid` for a whole-journal pin) in its config, and the `pinId` and `sceneId` flags on the new page or journal that the toolbar reads. A page that allows several pins carries no `pinId` flag, as at placement, and a page in a compendium is locked, so a pin pointed at one carries no flags. Note pins are not `relinkable`: a note keeps an anchor that names its pin, and Notes would have to move it.

### The Manage Pin Links tab

The third tab of the Manage Pins window lists every pin on the scene with what it points at. `PinLayersWindow._loadLinkRows` resolves each pin through `PinManager.resolvePinTarget`, in `getData`, so only this tab pays for the async lookups and the other two stay instant. Four statuses: **Linked** (the document resolves), **Broken** (it does not), **No link** (a type that records a target, on a pin that holds none) and **Not tracked** (a type that declares no `target`, so nothing can be said). Rows sort broken first, then linked, then the two quiet statuses, then by name; unlinked and untracked rows are dimmed, so the tab doubles as a map of which pin types take part. A linked row carries a `data-link` anchor, which Foundry opens in the client, with the document's kind and its compendium when it has one. A broken, relinkable row has a **Relink** button that runs the single-pin dialog; **Repair Links** in this tab's action bar runs the batch. The filter box is shared with the Manage Pin Tags tab and also matches the target's name; **Broken only** is local to this tab.

### Configure Pin tabs

The **Linked to** row is an anchor carrying `data-link` and `data-uuid`, which is Foundry's own content-link contract: core's body-level click handler resolves the UUID and opens the document in this client (a journal page opens its journal at that page). The window has no click handler of its own for it, and the anchor has no `href`, so there is nothing for the browser to navigate to.

Five tabs, built from the shared `.blacksmith-tabs` markup and the shared `selectTab` action (`data-action="selectTab" data-value`, `role="tab"`, the instance's `activeTab`), as `window-pin-layers.js` and `window-json-import.js` do. The one difference is deliberate: `_selectTab` shows and hides panes in place and does not re-render, because this window is a form and a re-render would discard what was typed on the other tabs. Every pane stays in the DOM, `data-active-tab` on the root decides which shows, and Save reads them all. The tabs are General (Linked to, Permissions), Tags, Image (Pin Source), Appearance (Pin Design, Text Format) and Animations. A player who owns a pin has no General or Tags tab, and `_resolveActiveTab` falls back to the first tab they can see.

To add a selected-state command, add a key branch in `_onDocumentKeyDown`. Claim the key (`preventDefault` and `stopPropagation`) only when you will act on it.

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
| Classification vocabulary | `resources/pin-taxonomy.json` + `pinTaxonomyOverrideJson` setting + `registerPinTaxonomy()`; tag registry in world setting `pinTagRegistry` |
| View state         | Client settings `pinsHiddenTypeTags`, `pinsHideAll`, `pinsFilterProfiles`, `pinsActiveFilterProfile` |
| Render pre-filter  | `pins-renderer.js` — `_canUserSeePin()` && `!PinManager._isHiddenByFilter()` before DOM creation |
| Public API         | `api-pins.js` → `game.modules.get('coffee-pub-blacksmith')?.api?.pins` |
| Config UI          | `window-pin-configuration.js` (PinConfigWindow); opened via `pinsAPI.configure()`; context menu "Configure Pin" in `pins-renderer.js` |
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

- **No PIXI for pin graphics**: Pins are DOM elements in a fixed overlay; the `BlacksmithLayer` canvas layer is only a lifecycle entry point, and only coordinate conversion uses the canvas/PIXI stack.
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

