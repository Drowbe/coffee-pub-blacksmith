# Application V2 Window System — Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes the Application V2 window system: the zone contract, the window registry, the base class, and how it fits with Blacksmith's toolbar/menubar and its own windows. For the public API other modules use to register and open windows, see **[api-window.md](../api/api-window.md)**.

---

## 1. Overview

Blacksmith's own windows use Foundry Application V2 (v13+), and Blacksmith provides a window API so other modules can open consistent, well-behaved windows. The design mirrors the toolbar API: modules register window types with Blacksmith; Blacksmith provides three presentation contracts and shared infrastructure. Consumers keep full control of their content.

Design principles:

- **Standard contract** — five zones (title bar, option bar, header, body, action bar) for forms, editors, and larger workflows.
- **Tool contract** — a compact native title bar plus optional toolbar, body, and footer for persistent canvas utilities and palettes.
- **Fullscreen contract** — a frameless, viewport-covering, blocking surface for handouts, cutscenes, and reveals.
- **Registration** — `registerWindow(windowId, descriptor)` and `openWindow(windowId, options)` so toolbars, macros, and other modules can open windows by id without knowing the implementing class.
- **Consumer-owned content** — the module that registers a window owns the Application V2 class, Handlebars template, `getData`, and actions.

---

## 2. Zone contract

All windows that follow the Blacksmith contract use up to six zones. The canonical markup is `templates/window-template.hbs`, where each zone is a `blacksmith-window-template-*` class; which zones a given window uses varies widely.

| Zone | Required? | Description |
|------|-----------|-------------|
| **Title bar** | Yes (Foundry) | Foundry chrome: window title, minimize/maximize/close. Not part of the consumer's template. |
| **Option bar** | Optional | Filters, toggles, or global options (e.g. "REFRESH CACHE", "TOKENS"/"PORTRAITS", "OmniRoll", "Show DC"). |
| **Header** | Optional | Icon, title block (title + subtitle), optional "header-right" (toggles, values, settings). Omit entirely for minimal windows (e.g. Macros, Dice Tray). |
| **Tools** | Optional | Bar below the header: a single content area for search, filters, or progress. |
| **Body** | Yes | Scrollable main area. Consumers inject their content here. Many layouts: forms, lists, grids, rich text, multi-column, keypads. |
| **Action bar** | Optional | Fixed at bottom; left = secondary, right = primary. Omit for display-only or toolbar-style windows. |

Implementation details -- template structure, CSS, delegation, and scroll save/restore -- are in `api/api-window.md`, which carries the contract.

---

## 2a. Application V2 behaviour: body injection and scripts

These points affect how consumers implement interactive body content (worksheets, buttons, drop zones).

- **Injected body HTML does not run `<script>`.** When the body part is rendered from Handlebars, Foundry injects the resulting HTML into the DOM, but injected `<script>` tags are not executed. Any logic in a `<script>` block inside a Handlebars partial (worksheet helpers, `toggleSection`, `incrementLevelCount`) never runs. Buttons using inline `onclick="someFunction()"` fail unless `someFunction` is already on `window` (e.g. from a module script that runs at load).
- **Use document-level delegation for body controls.** Do not rely on `activateListeners(html)` receiving the part's root, or on attaching listeners to body children in a single pass. Application V2 may call `activateListeners` with a wrapper that does not contain the body part, or the body may be injected asynchronously. Attach one document-level (or stable-wrapper) listener that checks `event.target` is inside your app (via `_getRoot().contains(event.target)` or a known wrapper id) and routes by `data-action` or `event.target.closest(selector)`. Body buttons, drop zones, and other controls then work regardless of when the part is injected.
- **Two patterns for legacy inline onclick:** (1) migrate to `data-action` and document-level delegation (recommended); or (2) keep inline onclick by moving the handler implementations into a module script loaded in `esmodules`, assigning them to `window` at load (`window.toggleSection = ...`), and optionally exposing app methods on `window` via a ref (`window.addTokensToContainer = () => MyWindow._ref?.addTokensToContainer(...)`).

---

## 2b. Single-instance windows

A window that declares a fixed `DEFAULT_OPTIONS.id` and is opened by more than one route needs a guard, or a
second open leaves the first orphaned in the DOM sharing an id with its replacement -- and overwrites it in
`foundry.applications.instances`, so the first can never be found or closed again.

**The guard is a static on the class, assigned before the first `await`, cleared in `_onClose`:**

```js
static activeWindow = null;

static async open() {
    if (MyWindow.activeWindow) {
        MyWindow.activeWindow.bringToFront?.();
        return MyWindow.activeWindow;
    }
    const win = new MyWindow();
    MyWindow.activeWindow = win;   // before the await, not after
    await win.render(true);
    return win;
}

_onClose(options) {
    if (MyWindow.activeWindow === this) MyWindow.activeWindow = null;
    return super._onClose?.(options);
}
```

**Do not guard with `foundry.applications.instances.get(id)` instead.** It reads as the tidier answer, since
the id is already that map's key and there is no second thing to keep in step. But the map is written five
awaits into `_doRender`, after `_prepareContext`, both pre-render events, `_renderFrame`, and `_renderHTML`
have all resolved (`client/applications/api/application.mjs:511`). For the whole of a first render the
window is invisible to that lookup, so two opens in quick succession -- a double-click, or a macro loop --
both miss and both construct. Only a synchronous assignment closes it.

What happens *after* the existing instance is found is per-window and varies on purpose: raise only,
re-render, or re-target to new arguments. That is the body of the pattern, not a second pattern.

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

- **`BlacksmithWindowBaseV2`** (`scripts/window-base.js:13`) encapsulates the Application V2 patterns so each window does not reimplement them: `_getRoot()`, scroll save/restore across `render()`, document-level delegation for `data-action`, and a central window ref so static actions do not need a per-app module-level ref. Its close lifecycle clears that static ref when it points at the closing instance and cancels pending position persistence, so the permanent delegated listener never retains a closed window or its DOM.
- **`BlacksmithToolWindowBaseV2`** (`scripts/window-tool-base.js`) extends the same lifecycle with compact defaults, a dedicated tool template, shared Light parchment, Dark standard-window, and translucent Glass visual shells, optional inline native-title actions, tool-body scroll preservation, and position persistence. Frame styling belongs to the API; consumers style only their body content unless intentionally overriding the exposed Tool custom properties. `toolTitlebar` selects the full title bar or a micro native drag rail; `toolTheme` selects the Light, Dark, or Glass shell. Glass uses translucent fallbacks plus `backdrop-filter` where supported, keeps the Micro drag rail discoverable on hover/focus, and deliberately leaves consumer content opacity under consumer control. Both choices use mutable runtime state rather than Foundry's frozen options and persist independently per tool. Theme state is propagated through CSS variables/classes/data, template context, the overridable `onToolThemeChanged()` lifecycle, and the `blacksmith.toolWindowThemeChanged` hook. Both title bars launch Blacksmith's shared, document-level `UIContextMenu` instead of Foundry's frame-owned controls dropdown, preventing menus from being clipped by compact tool geometry. The menu switches title-bar mode and theme unless the consumer locks or disables their preference storage.
- Tool consumers override `getToolHeaderActions()` for compact title controls and return `bodyContent` plus optional `toolBarLeft` / `toolBarRight` and `toolFooterLeft` / `toolFooterRight`.
- The combatant pop-out card dogfoods the tool base; its Follow Combat control is a tool header action rather than custom draggable DOM.
- Full/Micro switching, controls-menu actions, persisted mode preference, and the frozen-options-safe runtime state were live-verified through that combatant consumer on 2026-07-28.
- **Consumer responsibility:** extend the base, supply template path, `getData`, and action handlers; the template follows the zone contract (include only the zones the window needs).
- **`BlacksmithFullscreenWindowBaseV2`** (`scripts/window-fullscreen-base.js`) extends the same lifecycle with a frameless, unpositioned, viewport-covering presentation. See section 3.2a.

**Zone defaults are a class property.** `BlacksmithWindowBaseV2.ZONE_DEFAULTS` (`window-base.js`) supplies the `show*` flags `getData()` did not, and `_prepareContext` reads it off `this.constructor`. It is a property rather than four literals in that method because a subclass whose template has no option bar cannot otherwise change the default: by the time it sees the merged context the parent has already filled every key, and nothing distinguishes a consumer's `true` from the parent's. The fullscreen base narrows it; the standard and tool bases inherit it unchanged.

### 3.2a Fullscreen base

`scripts/window-fullscreen-base.js`, `templates/window-fullscreen-template.hbs`, `styles/window-fullscreen.css`. It is a `BlacksmithWindowBaseV2` subclass, exactly as the tool base is, so `ACTION_HANDLERS` delegation, scroll save/restore, and the registry all apply unchanged.

**It renders frameless and unpositioned** — `window: { frame: false, positioned: false }` — and four consequences of that follow from Foundry's own code (`client/applications/api/application.mjs`, verified against the installed v13):

- `_renderFrame` returns a bare `div` carrying only the id and classes, and `#content === #element` (`:492`). The application element is the surface; there is no `.window-content` wrapper.
- Foundry skips its own `application` class for a frameless app (`:407`), so `blacksmith-window-fullscreen` is the only hook the stylesheet has. The base adds it in `_onFirstRender` as well as through `DEFAULT_OPTIONS.classes`, because `mergeObject` overwrites arrays and any subclass declaring its own `classes` would otherwise drop it — the same trap `_applyWindowSizeConstraints` documents for its own marker class.
- `bringToFront()` early-returns without a frame (`:1088`), so no inline `z-index` is ever written and CSS decides the stacking with no `!important`. The pinned value is `calc(var(--z-index-tooltip) - 10)`: above every window (`_maxZ` starts at `--z-index-window: 100` and increments once per focus) and below tooltips and notifications.
- `setPosition()` early-returns when `positioned` is false (`:893`), so no inline geometry competes with the stylesheet.

**Escape is handled here and swallowed.** The same early-return that keeps the element clean also means the window never becomes `ui.activeWindow`, so Foundry's dismiss chain cannot reach it. The base installs a capture-phase `keydown` on `document` in `_onFirstRender` and removes it in `_onClose` — the one listener that does not die with the element. Swallowing the keypress is correct precisely because the surface is modal: letting it through would dismiss something the viewer cannot see.

**`close()` forces `animate: false`.** Foundry's closing animation stamps the measured width and height onto the element as inline position and then collapses it with `max-height: 0` (`:826-836`). On a `position: fixed; inset: 0` surface that is a snap to nothing, and the inline geometry is exactly what `positioned: false` exists to prevent. The fade the window does want runs in `_preClose`, which removes the open-state class and waits out `fullscreenTransitionMs`.

**Dismissal is separated from closing.** Escape, the close control, and a backdrop click all call the overridable `onDismiss(reason)`; everything else -- timers, sockets, consumer code -- calls `close()`. The split exists because on-the-way-out behaviour is almost always about the viewer having asked: the cinematic broadcasts a close when a GM dismisses it, and must not when the same window closes because the rolls finished, which every client reaches independently.

**One at a time, shared across subclasses.** A single static holds the open window, unlike the tool base's per-subclass registry. `_preFirstRender` closes whatever was open before claiming the slot. Two viewport-covering surfaces stacked is not a layout — the second hides the first completely.

**The backdrop image is its own element.** Opacity applied to the surface would fade the content with it, so the image layer sits behind the panel while the colour wash sits on the surface. That is the only way to express a translucent image over a colour.

**Layouts are a closed set of four** (`centered`, `bar`, `split`, `full`), reaching the template as `data-layout` and implemented purely in CSS. Not a layout engine, deliberately: features are moving out of this module, not accumulating in it.

**Consumer zero** is Request a Roll's Cinematic mode (`CinematicOverlay` in `scripts/window-skillcheck.js`), which uses the `bar` layout. It keeps the id `cpb-cinematic-overlay` and its band markup because `manager-rolls.js` reaches into that DOM by selector to reveal results, append the group banner, and end the sequence. The band is consumer content; only the shell is the base's.

---

### 3.2b The stage chain

`styles/window-fullscreen.css` plus `_indexStagedItems` / `_applyFullscreenAnimation` in the base. Two chains -- entrance and exit -- each running its stages in order, the exit reversed.

**Only durations are authored; every delay is a `calc()` of the stage before it,** and the two totals fall out of the same arithmetic. Hand-summed delays are right the day they are written and drift on the first change, and the drift shows as a gap or an overlap that reads as a rendering bug rather than a stale number.

**The totals are registered with `@property { syntax: "<time>" }`, and that is load-bearing.** An unregistered custom property has no computed value, so `getPropertyValue` hands back the specified token stream -- the literal text of the `calc()` -- and every parse of it is `NaN`. The base reads both totals back, so without registration the entrance timer fires immediately and the exit ignores its own chain. See `_readCssMs`.

**Order in `_onRender` is load-bearing for the same reason.** `_indexStagedItems` publishes `--fs-stage-item-count`, which the entrance total is a calc over; reading the total first computes it as if there were no items. Too short a total lands `data-fs-entered` -- which sets `animation: none` on every staged element -- while later items are still travelling, so the first item animates and the rest snap into place.

**Consumers mark, they do not describe.** `data-fs-stage="content"` / `"items"` on a consumer's own DOM is the whole contract; the active preset supplies the keyframes. `data-fs-from` names the edge an item enters through and does two jobs: it signs the travel distance, so one keyframe set serves every direction, and it groups items for numbering. Groups are numbered independently, so opposing sides arrive in step, and each group fills **away from its entry edge**, so an arrival stops short of the items already placed rather than flying over them.

**A staged element must rest in its final, visible state**, and anything ambient must live on an inner element or pseudo-element. Both follow from the same fact: a stage owns its element's `transform` and has its `animation` cleared once the entrance ends.

---

### 3.3 Migration status

The Application V2 migration is complete — `grep -rE 'extends (Application|FormApplication)\b' scripts/` returns zero results, and every window extends `BlacksmithWindowBaseV2`. Registering a window with the registry is the optional part: a window can be registered (e.g. `registerWindow('request-roll', { open: (opts) => new SkillCheckDialog(opts) })`) so `openWindow('request-roll')` works, or a toolbar tool can instantiate the class directly.

---

## 4. Relationship to other systems

### 4.1 Toolbar and menubar

- **Toolbar:** tools register via `registerToolbarTool(toolId, toolData)`; an `onClick` can open a window directly (`new MyWindow().render(true)`) or via `openWindow('my-window-id')` when the window is registered. Registration is separate: one module can register the toolbar tool and the same or another module the window type.
- **Menubar:** menubar tools open windows via `openWindow(windowId)` the same way.

### 4.2 API exposure

- **`module.api`** (in `blacksmith.js`) exposes the registry, all three base classes and their getters, `windowStyles` (`STANDARD` / `TOOL` / `FULLSCREEN`), `toolTitlebars` (`FULL` / `MICRO`), `toolThemes`, `fullscreenLayouts`, and `fullscreenFits`. The style identifiers live in `scripts/window-styles.js` rather than inside one of the presentations, since each base needs the whole set.
- **`api/blacksmith-api.js`** is the external bridge, providing timing-safe access to `module.api` for other modules.

### 4.3 Documentation and assets


---

## 5. File and reference summary

| Item | Purpose |
|------|---------|
| `coffee-pub-prototype` | Carries a working example window -- template and Application V2 class with delegation, scroll save/restore, and static actions -- as loadable code rather than a copy-paste block. |
| **templates/window-template.hbs** | Canonical core template for the zone contract; uses `blacksmith-window-template-*` classes. New windows copy from here. |
| **scripts/window-tool-base.js** | Compact tool/palette Application V2 base and stable style identifiers. |
| **templates/window-tool-template.hbs** | Lightweight tool template: optional toolbar, body, optional footer. |
| **styles/window-tool.css** | Compact native-frame and tool-layout presentation. |
| **scripts/window-styles.js** | The stable window-style identifiers, shared by all three bases. |
| **scripts/window-fullscreen-base.js** | Frameless viewport-covering base: singleton, Escape, backdrop, layouts. |
| **templates/window-fullscreen-template.hbs** | Fullscreen template: backdrop layer, close control, header, tools, body, action bar. |
| **styles/window-fullscreen.css** | Fullscreen shell and the four layouts. |
| **documentation/api/api-window.md** | Public API for registering and opening windows. |
