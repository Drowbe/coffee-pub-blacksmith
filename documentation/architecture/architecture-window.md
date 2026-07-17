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

## 2a. Application V2 behavior: body injection and scripts

These points affect how consumers implement interactive body content (e.g. worksheets, buttons, drop zones).

- **Injected body HTML does not run `<script>`.** When the body part is rendered from Handlebars, Foundry injects the resulting HTML into the DOM. Injected `<script>` tags are **not** executed. Therefore any logic defined in a `<script>` block inside a Handlebars partial (e.g. worksheet helpers, `toggleSection`, `incrementLevelCount`) will never run. Buttons that use inline `onclick="someFunction()"` will fail unless `someFunction` is already on `window` (e.g. from a module script that runs at load).
- **Use document-level delegation for body controls.** Do not rely on `activateListeners(html)` receiving the part’s root or on attaching listeners to body children in a single pass. Application V2 may call `activateListeners` with a wrapper that does not contain the body part, or the body may be injected asynchronously. Attach **one** document-level (or stable-wrapper) listener that checks `event.target` is inside your app (e.g. via `_getRoot().contains(event.target)` or a known wrapper id) and routes by `data-action` or `event.target.closest(selector)`. That way body buttons, drop zones, and other controls work regardless of when the part is injected.
- **Two patterns for legacy inline onclick:** (1) **Migrate** to `data-action` and document-level delegation (recommended). (2) **Keep inline onclick** by moving the handler implementations into a module script loaded in `esmodules`, assigning them to `window` at load (e.g. `window.toggleSection = ...`), and optionally exposing app methods on `window` via a ref (e.g. `window.addTokensToContainer = () => MyWindow._ref?.addTokensToContainer(...)`).

---

## 3. Components

> **Corrected 2026-07-17.** This section previously read "Components (Planned)" and described the registry, the base class, and the migration as future work. **All three shipped.** The failure mode here is the inverse of the usual one: not a plan overselling itself, but a *built and actively used system underselling itself as planned*. A contributor reading the old text could reasonably have built `api-windows.js` a second time.

### 3.1 Window Registry — **BUILT**

- **Location:** `scripts/api-windows.js`.
- **Role:** Stores window descriptors keyed by `windowId`. Exposed on `module.api` at `blacksmith.js:1222-1226`: `registerWindow` (`api-windows.js:15`), `unregisterWindow` (`:27`), `openWindow` (`:36`), `getRegisteredWindows` (`:45`), `isWindowRegistered` (`:53`). The last two were listed as "optional" and are also built.
- **Descriptor:** a way to open the window — `open: (options) => ApplicationInstance`, or a WindowClass. Optional: default `title`, `position`, `moduleId` for debugging.
- **In real use:** `window-pin-layers.js:1983` registers `blacksmith-pin-layers`; `api-pins.js:582` opens it via `api.openWindow(...)`. There is a live producer and a live consumer — this is not theoretical.
- **Lifecycle:** registration happens in a consumer's `ready` or `init` hook.

> **Cleanup caveat.** This section used to say "unregister on `unloadModule` for cleanup." **`unloadModule` is a dead hook** — it appears zero times in Foundry v13 and nothing (Foundry, Blacksmith, or any module) ever fires it, so that cleanup never ran. Foundry has no runtime module-unload event; disabling a module reloads the world and tears everything down anyway. Call `unregisterWindow` from your own lifecycle if you need it at all. See `api-hookmanager.md` and `documentation/TODO.md`.

### 3.2 Base Class — **BUILT, and universal in practice**

- **Location:** `BlacksmithWindowBaseV2` in `scripts/window-base.js:13`.
- **Role:** encapsulates the Application V2 patterns so each window doesn't reimplement them: `_getRoot()`, scroll save/restore across `render()`, document-level delegation for `data-action`, and a central window ref so static actions don't need a module-level ref per app.
- **Not optional in practice.** This was described as an "Optional Base Class / Mixin". **Every window class in `scripts/` extends it.**
- **Consumer responsibility:** extend the base, supply template path, `getData`, and action handlers. The template must follow the zone contract (include only the zones the window needs).

### 3.3 Existing Windows and Migration — **COMPLETE**

- **Current state:** the Application V2 migration is **done**. `grep -rE 'extends (Application|FormApplication)\b' scripts/` returns **zero results** — no legacy `Application` / `FormApplication` window remains in the codebase.
- This section previously claimed SkillCheckDialog, JournalToolsWindow, and PinConfigWindow "still use legacy `Application` / `FormApplication`". All three extend `BlacksmithWindowBaseV2` (`window-skillcheck.js:11`, `manager-journal-tools.js:2369`, `window-pin-configuration.js:22`), as does every other window. It also pointed at an "earlier Application V2 review" for the full list; **no such document exists in this repo** — that reference is removed rather than repaired.
- **Registering a window is now the optional part**, not the migration: a window can be registered with the registry (e.g. `registerWindow('request-roll', { open: (opts) => new SkillCheckDialog(opts) })`) so `openWindow('request-roll')` works. Toolbar tools may call `openWindow(id)` or instantiate the class directly.

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
| **templates/window-template.hbs** | **Canonical core template** — maintained reference for the Application V2 zone contract. Uses blacksmith-window-v2-* classes. New windows extending BlacksmithWindowBaseV2 copy from here or the doc example. |
| **documentation/applicationv2-window/README.md** | Quick start for the example. |
| **documentation/architecture/architecture-window.md** | This document — internal architecture. |
| **documentation/api/api-window.md** | Public API for registering and opening windows. |

---

## 6. Implementation Order (Suggested)

1. **Window registry** — Implement `registerWindow`, `unregisterWindow`, `openWindow` (and optionally query helpers). Attach to `module.api` and document in api-window.md.
2. **Optional base class** — Implement a thin base (or mixin) that provides `_getRoot()`, scroll save/restore, delegation wiring, and central ref; document in guidance and api-window.
3. **Migrate one existing window** — Convert one Blacksmith window to Application V2 using the guidance and base class; register it and open it via `openWindow` from a toolbar or macro as a smoke test.
4. **Iterate** — Migrate remaining windows as needed; ensure Regent and other consumers can register and open their windows via the API.

---

*This document describes the planned Application V2 window system architecture. For the public API contract, see **api-window.md**. For step-by-step implementation guidance, see **documentation/applicationv2-window/guidance-applicationv2.md**.*
