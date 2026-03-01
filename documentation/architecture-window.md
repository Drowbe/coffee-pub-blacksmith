# Application V2 Window System — Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes the architecture of the **Application V2 window system**: the zone contract, window registry, optional base class, and how it fits with Blacksmith’s toolbar/menubar and existing windows. For the public API that external modules use to register and open windows, see **api-window.md**. For implementation guidance and copy-paste examples, see **documentation/applicationv2-window/guidance-applicationv2.md** and **documentation/applicationv2-window/README.md**.

---

## 1. Overview

Blacksmith is migrating its own windows to **Foundry Application V2** (v13+) and providing a **window API** so other modules (e.g. Coffee Pub Regent, Artificer) can open consistent, well-behaved windows that follow the same layout contract. The design mirrors the **toolbar API**: modules **register** window types with Blacksmith; Blacksmith provides the **contract** (zones, behavior) and optional shared infrastructure (base class, scroll/delegation helpers). **Consumers keep full control** of what goes in the header and body; Blacksmith does not inject content into their templates.

**Design principles:**

- **Zone contract** — Five zones (title bar, option bar, header, body, action bar); only body is required. Option bar, header, and action bar are optional so minimal windows (e.g. Macros, Dice Tray) and full windows (e.g. Quick Encounter, Request a Roll) both fit.
- **Registration** — Like the toolbar: `registerWindow(windowId, descriptor)` and `openWindow(windowId, options)` so toolbars, macros, and other modules can open windows by id without knowing the implementing class.
- **Consumer-owned content** — The module that registers a window owns the Application V2 class, Handlebars template, `getData`, and actions. Header and body content are defined by the consumer’s template and data.

---

## 2. Zone Contract

All windows that follow the Blacksmith contract use up to **five zones**. The canonical diagram is **documentation/applicationv2-window/blacksmith-windows-zones.webp**. Real-world variability (which zones appear in which windows) is illustrated in **documentation/applicationv2-window/window-samples.png**.

| Zone | Required? | Description |
|------|-----------|-------------|
| **Title bar** | Yes (Foundry) | Foundry chrome: window title, minimize/maximize/close. Not part of the consumer’s template. |
| **Option bar** | Optional | Filters, toggles, or global options (e.g. “REFRESH CACHE”, “TOKENS”/“PORTRAITS”, “OmniRoll”, “Show DC”). |
| **Header** | Optional | Icon, title block (title + subtitle), optional “header-right” (toggles, values, settings). Omit entirely for minimal windows (e.g. Macros, Dice Tray). |
| **Body** | Yes | Scrollable main area. **Consumers inject their content here.** Many layouts: forms, lists, grids, rich text, multi-column, keypads. |
| **Action bar** | Optional | Fixed at bottom; left = secondary, right = primary. Omit for display-only or toolbar-style windows. |

Implementation details (template structure, CSS, delegation, scroll save/restore) are in **documentation/applicationv2-window/guidance-applicationv2.md**.

---

## 3. Components (Planned)

### 3.1 Window Registry

- **Location (planned):** e.g. `scripts/api-windows.js` or a dedicated window-registry module used by `blacksmith.js`.
- **Role:** Store registered window descriptors keyed by `windowId`. Expose `registerWindow(windowId, descriptor)`, `unregisterWindow(windowId)`, and `openWindow(windowId, options)` on `module.api`.
- **Descriptor:** At minimum, a way to open the window (e.g. `open: (options) => ApplicationInstance`, or a WindowClass so Blacksmith can `new WindowClass(options)`). Optional: default `title`, `position`, `moduleId` for debugging.
- **Lifecycle:** Registration typically happens in a consumer’s `ready` or `init` hook; unregister on `disableModule` for cleanup.

### 3.2 Optional Base Class / Mixin

- **Role:** Encapsulate Application V2 patterns so each consumer doesn’t reimplement them: `_getRoot()`, scroll save/restore in `render()`, document-level delegation for `data-action`, and optionally a **central window ref** so static actions don’t require a module-level ref per app. The guidance doc (§5 “What We’d Do Different”) calls this a “WindowWithHeaderAndActions” base class.
- **Consumer responsibility:** Extend the base (or use the mixin), supply template path, `getData`, and action handlers. Template must follow the zone contract (include only the zones the window needs).

### 3.3 Existing Windows and Migration

- **Current state:** Blacksmith’s own windows (e.g. SkillCheckDialog, TokenImageReplacementWindow, JournalToolsWindow, PinConfigWindow) still use legacy `Application` / `FormApplication`. See the earlier “Application V2” review for the full list.
- **Migration path:** As each window is migrated to Application V2, it can optionally be registered with the window registry (e.g. `registerWindow('request-roll', { open: (opts) => new SkillCheckDialog(opts) })`) so `openWindow('request-roll')` is available. Toolbar tools that open windows can then call `openWindow(id)` or continue to instantiate the class directly.

---

## 4. Relationship to Other Systems

### 4.1 Toolbar and Menubar

- **Toolbar:** Tools register via `registerToolbarTool(toolId, toolData)`. `onClick` often opens a window. Today that is done by the consumer (e.g. `new MyWindow().render(true)`). With the window API, the tool can call `blacksmith.api.openWindow('my-window-id')` if the window was registered. Registration is separate: one module registers the toolbar tool, and the same or another module registers the window type.
- **Menubar:** Same idea: menubar tools can open windows via `openWindow(windowId)` once the window is registered.

### 4.2 API Exposure

- **`module.api`** (in `blacksmith.js`) will expose the window API when implemented: `registerWindow`, `unregisterWindow`, `openWindow`, and optionally `getRegisteredWindows` / `isWindowRegistered`.
- **api/blacksmith-api.js** — The external bridge can expose the same surface (e.g. `BlacksmithAPI.openWindow(id)`) for timing-safe access from other modules.

### 4.3 Documentation and Assets

- **documentation/applicationv2-window/** — Guidance, zone contract, example template and script, zone diagram (blacksmith-windows-zones.webp), and window samples (window-samples.png). This folder is the single place for “how to build and register an Application V2 window.”

---

## 5. File and Reference Summary

| Item | Purpose |
|------|---------|
| **documentation/applicationv2-window/guidance-applicationv2.md** | Implementation guidance: HandlebarsApplicationMixin(ApplicationV2), PARTS, getData, delegation, scroll, zone structure. |
| **documentation/applicationv2-window/blacksmith-windows-zones.webp** | Canonical zone layout diagram. |
| **documentation/applicationv2-window/window-samples.png** | Real windows showing optional zones and body layout variety. |
| **documentation/applicationv2-window/example-window.hbs** | Example template with all five zones (consumer omits what they don’t need). |
| **documentation/applicationv2-window/example-window.js** | Example Application V2 class (delegation, scroll save/restore, static actions). |
| **templates/window-template.hbs** | **Canonical core template** — maintained reference for the Application V2 zone contract. Uses blacksmith-window-v2-* classes; used by BlacksmithTestWindowV2. New windows copy from here or the doc example. |
| **documentation/applicationv2-window/README.md** | Quick start for the example. |
| **documentation/architecture-window.md** | This document — internal architecture. |
| **documentation/api-window.md** | Public API for registering and opening windows. |

---

## 6. Implementation Order (Suggested)

1. **Window registry** — Implement `registerWindow`, `unregisterWindow`, `openWindow` (and optionally query helpers). Attach to `module.api` and document in api-window.md.
2. **Optional base class** — Implement a thin base (or mixin) that provides `_getRoot()`, scroll save/restore, delegation wiring, and central ref; document in guidance and api-window.
3. **Migrate one existing window** — Convert one Blacksmith window to Application V2 using the guidance and base class; register it and open it via `openWindow` from a toolbar or macro as a smoke test.
4. **Iterate** — Migrate remaining windows as needed; ensure Regent and other consumers can register and open their windows via the API.

---

*This document describes the planned Application V2 window system architecture. For the public API contract, see **api-window.md**. For step-by-step implementation guidance, see **documentation/applicationv2-window/guidance-applicationv2.md**.*
