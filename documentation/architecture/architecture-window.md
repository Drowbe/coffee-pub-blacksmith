# Application V2 Window System — Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes the Application V2 window system: the zone contract, the window registry, the base class, and how it fits with Blacksmith's toolbar/menubar and its own windows. For the public API other modules use to register and open windows, see **[api-window.md](../api/api-window.md)**. For implementation guidance and copy-paste examples, see **documentation/applicationv2-window/**.

---

## 1. Overview

Blacksmith's own windows use Foundry Application V2 (v13+), and Blacksmith provides a window API so other modules can open consistent, well-behaved windows that follow the same layout contract. The design mirrors the toolbar API: modules register window types with Blacksmith; Blacksmith provides the contract (zones, behaviour) and shared infrastructure (base class, scroll/delegation helpers). Consumers keep full control of what goes in the header and body; Blacksmith does not inject content into their templates.

Design principles:

- **Zone contract** — five zones (title bar, option bar, header, body, action bar); only body is required. The optional zones let minimal windows (e.g. Macros, Dice Tray) and full windows (e.g. Quick Encounter, Request a Roll) both fit.
- **Registration** — `registerWindow(windowId, descriptor)` and `openWindow(windowId, options)` so toolbars, macros, and other modules can open windows by id without knowing the implementing class.
- **Consumer-owned content** — the module that registers a window owns the Application V2 class, Handlebars template, `getData`, and actions.

---

## 2. Zone contract

All windows that follow the Blacksmith contract use up to five zones. The canonical diagram is **documentation/applicationv2-window/blacksmith-windows-zones.webp**; real-world variability (which zones appear in which windows) is in **documentation/applicationv2-window/window-samples.png**.

| Zone | Required? | Description |
|------|-----------|-------------|
| **Title bar** | Yes (Foundry) | Foundry chrome: window title, minimize/maximize/close. Not part of the consumer's template. |
| **Option bar** | Optional | Filters, toggles, or global options (e.g. "REFRESH CACHE", "TOKENS"/"PORTRAITS", "OmniRoll", "Show DC"). |
| **Header** | Optional | Icon, title block (title + subtitle), optional "header-right" (toggles, values, settings). Omit entirely for minimal windows (e.g. Macros, Dice Tray). |
| **Body** | Yes | Scrollable main area. Consumers inject their content here. Many layouts: forms, lists, grids, rich text, multi-column, keypads. |
| **Action bar** | Optional | Fixed at bottom; left = secondary, right = primary. Omit for display-only or toolbar-style windows. |

Implementation details (template structure, CSS, delegation, scroll save/restore) are in **documentation/applicationv2-window/guidance-applicationv2.md**.

---

## 2a. Application V2 behaviour: body injection and scripts

These points affect how consumers implement interactive body content (worksheets, buttons, drop zones).

- **Injected body HTML does not run `<script>`.** When the body part is rendered from Handlebars, Foundry injects the resulting HTML into the DOM, but injected `<script>` tags are not executed. Any logic in a `<script>` block inside a Handlebars partial (worksheet helpers, `toggleSection`, `incrementLevelCount`) never runs. Buttons using inline `onclick="someFunction()"` fail unless `someFunction` is already on `window` (e.g. from a module script that runs at load).
- **Use document-level delegation for body controls.** Do not rely on `activateListeners(html)` receiving the part's root, or on attaching listeners to body children in a single pass. Application V2 may call `activateListeners` with a wrapper that does not contain the body part, or the body may be injected asynchronously. Attach one document-level (or stable-wrapper) listener that checks `event.target` is inside your app (via `_getRoot().contains(event.target)` or a known wrapper id) and routes by `data-action` or `event.target.closest(selector)`. Body buttons, drop zones, and other controls then work regardless of when the part is injected.
- **Two patterns for legacy inline onclick:** (1) migrate to `data-action` and document-level delegation (recommended); or (2) keep inline onclick by moving the handler implementations into a module script loaded in `esmodules`, assigning them to `window` at load (`window.toggleSection = ...`), and optionally exposing app methods on `window` via a ref (`window.addTokensToContainer = () => MyWindow._ref?.addTokensToContainer(...)`).

---

## 3. Components

### 3.1 Window registry

- **Location:** `scripts/api-windows.js`.
- **Exposed on `module.api`** (`blacksmith.js:1222-1226`): `registerWindow` (`api-windows.js:15`), `unregisterWindow` (`:27`), `openWindow` (`:36`), `getRegisteredWindows` (`:45`), `isWindowRegistered` (`:53`).
- **Descriptor:** a way to open the window — `open: (options) => ApplicationInstance`, or a WindowClass. Optional: default `title`, `position`, `moduleId` for debugging.
- **In real use:** `window-pin-layers.js:1983` registers `blacksmith-pin-layers`; `api-pins.js:582` opens it via `api.openWindow(...)`. There is a live producer and a live consumer.
- **Lifecycle:** registration happens in a consumer's `ready` or `init` hook.

There is no module-unload cleanup hook. `unloadModule` is a dead name (see [api-hookmanager.md](../api/api-hookmanager.md)) — nothing fires it, so a cleanup listener there never runs. Foundry reloads the world when a module is enabled or disabled, so teardown happens anyway; call `unregisterWindow` from your own lifecycle if you need it.

### 3.2 Base class

- **`BlacksmithWindowBaseV2`** (`scripts/window-base.js:13`) encapsulates the Application V2 patterns so each window does not reimplement them: `_getRoot()`, scroll save/restore across `render()`, document-level delegation for `data-action`, and a central window ref so static actions do not need a per-app module-level ref.
- **Every window class in `scripts/` extends it.**
- **Consumer responsibility:** extend the base, supply template path, `getData`, and action handlers; the template follows the zone contract (include only the zones the window needs).

### 3.3 Migration status

The Application V2 migration is complete — `grep -rE 'extends (Application|FormApplication)\b' scripts/` returns zero results, and every window extends `BlacksmithWindowBaseV2`. Registering a window with the registry is the optional part: a window can be registered (e.g. `registerWindow('request-roll', { open: (opts) => new SkillCheckDialog(opts) })`) so `openWindow('request-roll')` works, or a toolbar tool can instantiate the class directly.

---

## 4. Relationship to other systems

### 4.1 Toolbar and menubar

- **Toolbar:** tools register via `registerToolbarTool(toolId, toolData)`; an `onClick` can open a window directly (`new MyWindow().render(true)`) or via `openWindow('my-window-id')` when the window is registered. Registration is separate: one module can register the toolbar tool and the same or another module the window type.
- **Menubar:** menubar tools open windows via `openWindow(windowId)` the same way.

### 4.2 API exposure

- **`module.api`** (in `blacksmith.js`) exposes `registerWindow`, `unregisterWindow`, `openWindow`, `getRegisteredWindows`, and `isWindowRegistered`.
- **`api/blacksmith-api.js`** is the external bridge, providing timing-safe access to `module.api` for other modules.

### 4.3 Documentation and assets

- **documentation/applicationv2-window/** — guidance, zone contract, example template and script, zone diagram (`blacksmith-windows-zones.webp`), and window samples (`window-samples.png`). The single place for how to build and register an Application V2 window.

---

## 5. File and reference summary

| Item | Purpose |
|------|---------|
| **documentation/applicationv2-window/guidance-applicationv2.md** | Implementation guidance: HandlebarsApplicationMixin(ApplicationV2), PARTS, getData, delegation, scroll, zone structure. |
| **documentation/applicationv2-window/blacksmith-windows-zones.webp** | Canonical zone layout diagram. |
| **documentation/applicationv2-window/window-samples.png** | Real windows showing optional zones and body layout variety. |
| **documentation/applicationv2-window/example-window.hbs** | Example template with all five zones (consumer omits what they do not need). |
| **documentation/applicationv2-window/example-window.js** | Example Application V2 class (delegation, scroll save/restore, static actions). |
| **templates/window-template.hbs** | Canonical core template for the zone contract; uses `blacksmith-window-v2-*` classes. New windows copy from here or the doc example. |
| **documentation/applicationv2-window/README.md** | Quick start for the example. |
| **documentation/api/api-window.md** | Public API for registering and opening windows. |
