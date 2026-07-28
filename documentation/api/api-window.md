# Blacksmith Window API Documentation

**Audience:** Developers integrating with Blacksmith and opening or registering Application V2–style windows.

This document describes the **Window API**: how to build standard editor windows or lightweight tool windows, register a window type with Blacksmith, and open it by id. It follows the same registration pattern as the Toolbar API: you register a **window type** (id + descriptor); Blacksmith routes "open this window" to your opener. **You keep full control** of content; Blacksmith provides the presentation contract and shared Application V2 behavior.

**Status:** The Window API is exposed on `game.modules.get('coffee-pub-blacksmith').api`. Use this document as the contract for integration.

**Related docs:**
- **documentation/architecture/architecture-window.md** — Internal architecture (zone contract, registry, base class).
- **documentation/applicationv2-window/guidance-applicationv2.md** — How to build an Application V2 window (Handlebars, PARTS, delegation, scroll).
- **documentation/applicationv2-window/README.md** and **example-window.hbs** / **example-window.js** — Copy-paste example.

---

## Overview

The Window API allows external modules to:

1. **Register** a window type with a unique id and a descriptor (how to open the window).
2. **Open** that window by id via Blacksmith (`openWindow(windowId, options)`), so toolbars, macros, and other modules can open your window without importing your class.
3. **Unregister** the window type when the module is disabled (cleanup).

You implement the window itself (Application V2 class, template, `getData`, actions) and decide which **zones** to use (option bar, header, body, action bar). Blacksmith does not inject content into your template; it only provides the **zone contract** and, when implemented, optional shared behavior (e.g. base class, scroll/delegation helpers).

---

## Window registry vs public base class

These are **two different** supported surfaces on `game.modules.get('coffee-pub-blacksmith').api`:

| Surface | Purpose |
|---------|---------|
| **Registry** (`registerWindow`, `openWindow`, `unregisterWindow`, …) | Register an **id** and an **opener** so toolbars, macros, and other modules can open your window **without importing your class**. |
| **Standard base** (`BlacksmithWindowBaseV2`, or `getWindowBaseV2()`) | **Subclass** Blacksmith's full Application V2 base for editors, forms, and other windows that use the five-zone template. |
| **Tool base** (`BlacksmithToolWindowBaseV2`, or `getToolWindowBaseV2()`) | **Subclass** the compact Application V2 presentation for lightweight, persistent canvas tools and palettes. |

- Use the **registry** when something else (Blacksmith toolbar, another module, a macro) should call `openWindow('your-id')`.
- Use **`api.BlacksmithWindowBaseV2`** for standard windows and **`api.BlacksmithToolWindowBaseV2`** for compact tools. **Do not** deep-link Blacksmith script files from another module's manifest — use **`module.api`**; file paths are not the stable contract.

**Availability timing**

- **Both base classes and getters** — `BlacksmithWindowBaseV2`, `BlacksmithToolWindowBaseV2`, `getWindowBaseV2()`, `getToolWindowBaseV2()`, and `windowStyles` are patched on `module.api` **as soon as Blacksmith's module script has finished loading** (before `init` / `ready`), as long as your module loads **after** `coffee-pub-blacksmith` in the manifest (or depends on it). Use this when you resolve a base class at **module top level**.
- **Window registry** (`registerWindow`, `openWindow`, …) — Placeholders are cleared when the **api-windows** dynamic import completes during Blacksmith's **`init`** (after `await addToolbarButton()`). Prefer calling **`registerWindow`** / **`openWindow`** from **`ready`** or after **`await BlacksmithAPI.waitForReady()`** so the rest of the stack is consistent.
- **Most other `module.api` members** — The **public shell** (`registerModule`, `utils`, `HookManager`, menubar bindings, etc.) is assigned **synchronously at the start of Blacksmith's `init`** (before any `await` there). **Asset-backed** fields (`assetLookup`, merged `BLACKSMITH` constants) finish during Blacksmith's **`ready`**; use **`BlacksmithAPI.waitForReady()`** if you need that data. See **documentation/architecture/architecture-blacksmith.md** §3.2–3.3.

---

## Zone Contract (Summary)

Windows that follow the Blacksmith contract use up to **five zones**. Only **Body** is required; the rest are optional.

| Zone | Required? | Description |
|------|-----------|-------------|
| **Title bar** | Yes (Foundry) | Foundry chrome; not in your template. |
| **Option bar** | Optional | Filters, toggles, global options (e.g. REFRESH CACHE, TOKENS/PORTRAITS). |
| **Header** | Optional | Icon, title, subtitle, header-right. Omit for minimal windows. |
| **Tools** | Optional | Bar below header: single content area for search, filters, progress bars, etc. |
| **Body** | Yes | Scrollable area; **you inject your content here** (forms, lists, grids, etc.). |
| **Action bar** | Optional | Bottom bar: secondary left, primary right. |

See **documentation/applicationv2-window/blacksmith-windows-zones.webp** for the layout diagram and **window-samples.png** for real-window variability.

---

## Lightweight tool/palette style

Use `BlacksmithToolWindowBaseV2` for small utilities that should remain open over the canvas: dice trays, health controls, macro palettes, trackers, and similar tools. It uses Foundry's native Application V2 frame, so dragging, focus/z-order, minimizing, closing, and window lifecycle remain standard. It deliberately omits the full editor header and five-zone layout.

The tool template accepts:

| Key | Type | Description |
|-----|------|-------------|
| **appId** | string | Application instance id. |
| **bodyContent** | string (HTML) | Main tool content. |
| **toolBarLeft** / **toolBarRight** | string (HTML) | Optional compact toolbar content. |
| **showToolBar** | boolean | Override automatic toolbar visibility. |
| **toolFooterLeft** / **toolFooterRight** | string (HTML) | Optional compact footer content. |
| **showToolFooter** | boolean | Override automatic footer visibility. |

Subclass `getToolHeaderActions()` to add direct icon controls beside Foundry's native title controls. Each entry accepts `{ id, icon, label, active, disabled, onClick }`. `label` may be a localization key. Blacksmith renders it as `data-tooltip` and an accessible label.

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const ToolBase = api.BlacksmithToolWindowBaseV2;

class MyCanvasTool extends ToolBase {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'my-module-canvas-tool',
            position: { width: 340, height: 'auto' },
            window: { title: 'My Tool', resizable: false }
        }
    );

    getToolHeaderActions() {
        return [{
            id: 'follow',
            icon: 'fa-solid fa-crosshairs',
            label: 'Follow selection',
            active: this.followSelection,
            onClick: () => {
                this.followSelection = !this.followSelection;
                return this.render(false);
            }
        }];
    }

    async getData() {
        return {
            appId: this.id,
            toolBarLeft: '<strong>TOOLS</strong>',
            bodyContent: '<div>Persistent canvas utility content</div>'
        };
    }
}
```

Tool windows remember their last position per user by default. Set `rememberPosition: false` for transient instances, or set `windowPositionKey` when several instances should share one saved position. The same options also work on the standard base.

`api.windowStyles` exposes the stable identifiers `STANDARD` (`"standard"`) and `TOOL` (`"tool"`) for consumers that store or exchange a style choice. The registry remains presentation-agnostic: either style can be registered and opened through `registerWindow` / `openWindow`.

---

## Template data contract (core template)

When you use Blacksmith's core template (`templates/window-template.hbs`) and extend `BlacksmithWindowBaseV2`, your `getData()` return value can include the following. All are optional unless noted. HTML slots are rendered as HTML (use triple-brace in Handlebars if you author your own template).

| Key | Type | Description |
|-----|------|-------------|
| **appId** | string | **Required.** Application instance id (e.g. `this.id`). Used as the root element `id`. |
| **showOptionBar** | boolean | Show the option bar. Default `true` if omitted. |
| **showHeader** | boolean | Show the header. Default `true` if omitted. |
| **showTools** | boolean | Show the tools bar (below header). Default `true` if omitted. |
| **showActionBar** | boolean | Show the action bar. Default `true` if omitted. |
| **optionBarLeft** | string (HTML) | Option bar left zone (filters, toggles). |
| **optionBarRight** | string (HTML) | Option bar right zone. |
| **headerIcon** | string | Font Awesome class for the header icon (e.g. `'fa-solid fa-hammer'`). If omitted, default hammer icon is used. |
| **windowTitle** | string | Main title in the header. |
| **subtitle** | string | Subtitle line below the title. |
| **headerRight** | string (HTML) | Header right zone (buttons, dropdowns, labels). |
| **toolsContent** | string (HTML) | Tools bar content (search, filters, progress bars, etc.). Single area; module controls layout. |
| **bodyContent** | string (HTML) | Main scrollable body content. |
| **actionBarLeft** | string (HTML) | Action bar left (secondary buttons, status text). Use class `blacksmith-window-btn-secondary` and `data-action="name"` for buttons that trigger `ACTION_HANDLERS`. |
| **actionBarRight** | string (HTML) | Action bar right (primary buttons). Use `blacksmith-window-btn-primary` for primary style. For destructive actions use `blacksmith-window-btn-critical`. |

The base class sets `showOptionBar`, `showHeader`, `showTools`, and `showActionBar` to `true` when not provided, so all zones are visible by default. Return `showOptionBar: false` (or `showHeader` / `showTools` / `showActionBar`) to hide a zone.

---

## Window options (resizable, min/max size)

When extending `BlacksmithWindowBaseV2`, set **`DEFAULT_OPTIONS`** (or pass options at construction) so the window frame behaves as needed:

- **`window.resizable`** (boolean) — Whether the window can be resized by the user. Default is up to the module.
- **`window.minimizable`** (boolean) — Whether the window can be minimized.
- **`position.width`** / **`position.height`** — Initial size (numbers or `"auto"` per Foundry). Do **not** add `minWidth`/`maxWidth`/`minHeight`/`maxHeight` to `position` — Foundry's position object is not extensible.
- **`windowSizeConstraints`** (object, optional) — Min/max size applied by the base class to the window element after render: `{ minWidth, minHeight, maxWidth, maxHeight }` (numbers in pixels). Omit to leave unconstrained.

Example (in your window class):

```javascript
static get DEFAULT_OPTIONS() {
  return foundry.utils.mergeObject(
    foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
    {
      position: { width: 800, height: 600 },
      window: { title: 'My Window', resizable: true, minimizable: true },
      windowSizeConstraints: { minWidth: 500, maxWidth: 1400 }
    }
  );
}
```

---

## Getting Started

### 1. Build Your Window (Application V2)

Follow **documentation/applicationv2-window/guidance-applicationv2.md** to create an Application V2 window: `HandlebarsApplicationMixin(ApplicationV2)`, PARTS, `getData`, document-level delegation, scroll save/restore. Use **example-window.hbs** and **example-window.js** as a starting point; include only the zones you need (option bar, header, body, action bar).

### 2. Access the API

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

if (blacksmith?.registerWindow) {
    // Window registry is available
} else {
    Hooks.once('ready', () => {
        // Registry attaches during Blacksmith ready
    });
}
// `blacksmith?.BlacksmithWindowBaseV2` may already exist at module load (see "Availability timing" above).
```

### 3. Register Your Window

```javascript
// When your module is ready (e.g. in ready hook)
blacksmith.registerWindow('my-module-window', {
    open: async (options = {}) => {          // `async` — the body awaits a dynamic import
        const { MyModuleWindow } = await import('/modules/my-module/scripts/my-window.js');
        const win = new MyModuleWindow(options);
        return win.render(true);
    },
    title: 'My Window',   // optional: default window title
    moduleId: 'my-module' // optional: for debugging
});
```

### 4. Open Your Window

From a toolbar tool, macro, or another module:

```javascript
blacksmith.openWindow('my-module-window', { /* optional options */ });
```

### 5. Cleanup

There is no per-module teardown step. Foundry has no module-unload event — `unloadModule` is never fired by Foundry or Blacksmith — and disabling a module reloads the world, which tears everything down anyway. Your registered window types simply go away with the reload. Call `unregisterWindow(id)` only if you need to remove a window type at runtime. See `api-hookmanager.md` for the full explanation of the missing unload event.

---

## API Reference

The following methods are the planned surface. Signatures and behavior are the contract for implementation.

### Window Registration

#### `registerWindow(windowId, descriptor)`

Registers a window type with Blacksmith. Only one window per `windowId`; re-registering overwrites.

**Parameters:**

- `windowId` (string): Unique identifier for the window type (e.g. `'my-module-window'`).
- `descriptor` (Object): Descriptor object.

**Returns:** `boolean` — Success status.

**Descriptor properties:**

- `open` (Function, required): `(options?: Object) => Promise<Application | void> | Application | void`. Called when the window should be opened. Typically instantiates your Application V2 class and calls `render(true)`. May be async.
- `title` (string, optional): Default window title (e.g. for Foundry's title bar).
- `moduleId` (string, optional): Module id that owns this window (for debugging and cleanup).

**Example:**

```javascript
blacksmith.registerWindow('my-module-query', {
    open: async (options) => {
        const { MyQueryWindow } = await import('/modules/my-module-id/scripts/window-query.js');
        const w = new MyQueryWindow(options);
        return w.render(true);
    },
    title: 'My Query Window',
    moduleId: 'my-module-id'
});
```

---

#### `unregisterWindow(windowId)`

Removes a window type from the registry.

**Parameters:**

- `windowId` (string): The id passed to `registerWindow`.

**Returns:** `boolean` — Success status (e.g. `true` if a registration was removed).

---

### Opening Windows

#### `openWindow(windowId, options?)`

Opens the window registered under `windowId`. The registered `open` function is called with `options`.

**Parameters:**

- `windowId` (string): Id of a registered window type.
- `options` (Object, optional): Passed through to the descriptor's `open` function. Use for window-specific options (e.g. initial data, size).

**Returns:** `Promise<Application | void> | Application | void` — Whatever the registered `open` returns (typically the rendered Application).

**Example:**

```javascript
// From a toolbar tool
blacksmith.registerToolbarTool('my-module-query', {
    icon: 'fa-solid fa-crystal-ball',
    title: 'My Query Window',
    onClick: () => blacksmith.openWindow('my-module-query')
});
```

---

### Querying (Optional)

The following may be exposed for debugging and cleanup:

- **`getRegisteredWindows()`** — Returns a `Map` of registered window ids to descriptors.
- **`isWindowRegistered(windowId)`** — Returns `boolean`.

Both are exposed on `module.api`.

---

## Integration with Toolbar and Menubar

- **Toolbar:** Register a tool with `onClick: () => blacksmith.openWindow('your-window-id')`. Your module registers both the toolbar tool and the window type (e.g. in `ready`).
- **Menubar:** Same pattern: a menubar action can call `openWindow('your-window-id')`.
- **Macros:** A macro can call `game.modules.get('coffee-pub-blacksmith').api.openWindow('your-window-id')` so users can open your window by id without scripting your class.

---

## Best Practices

1. **Unique window ids** — Use a prefix (e.g. module id) to avoid collisions: `'my-module-settings'`, `'my-module-query'`.
2. **No manual teardown needed** — Foundry has no module-unload event, and disabling a module reloads the world; your registered window types are cleared automatically. Use `unregisterWindow(id)` only to remove a window type at runtime.
3. **Zone contract** — Follow the five-zone contract (option bar, header, body, action bar optional; body required) so windows look consistent and any future shared behavior (e.g. base class) applies. See **guidance-applicationv2.md** and the example template.
4. **Own your content** — Your template and `getData` define header and body; Blacksmith does not inject content into your window.
5. **Application V2 only** — Build your window with `HandlebarsApplicationMixin(ApplicationV2)` and the patterns in the guidance doc (delegation, scroll save/restore, unique instance id).

### Application V2: Body injection and scripts

- **Scripts in body/partials do not run.** When Application V2 injects the body part (e.g. from Handlebars), it does **not** execute `<script>` tags inside the injected HTML. Any logic you put in a `<script>` block in a partial will never run. Do not rely on inline `onclick="someFunction()"` unless that function is already defined on `window` by a **module script that runs at load** (e.g. a separate `.js` file in your module's `esmodules` that assigns `window.someFunction = ...`). Prefer **document-level delegation** and `data-action` so handlers are attached in JS and work regardless of when the body is injected.
- **Body controls (buttons, drop zones)** — If your body contains buttons, drop zones, or other interactive elements, attach their behavior via **document-level** (or stable-wrapper) delegation (e.g. in `_attachDelegationOnce()`), not by querying the body in `activateListeners(html)`. Application V2 may call `activateListeners` with a wrapper element that does not contain the body part, or the body may be injected later; delegation on `document` (with a check that the event target is inside your app root or a known wrapper) ensures clicks are handled regardless.
- **Legacy inline onclick** — If you have many existing inline `onclick` handlers (e.g. a complex worksheet), you can either: (1) **Migrate** to `data-action` and document-level delegation (recommended long term), or (2) **Keep inline onclick** by moving the handler implementations into a module script that runs at load and assigns them to `window`, so the same attribute strings resolve when the body is injected. With option 2, a module script registers the globals at load and each global delegates to the app instance via a ref.

---

## Troubleshooting

- **`registerWindow` / `openWindow` undefined** — Window API not loaded yet. Wait for `ready` and check `game.modules.get('coffee-pub-blacksmith')?.api?.registerWindow`.
- **Window doesn't open** — Ensure the window type is registered before calling `openWindow`. Check that `descriptor.open` returns or resolves to the Application instance if you need a reference.
- **Layout or behavior issues** — Follow **documentation/applicationv2-window/guidance-applicationv2.md** (delegation, scroll save/restore, `_getRoot()`, safe merge of `DEFAULT_OPTIONS`).
- **Buttons or controls in the body do nothing** — Application V2 may not run `<script>` inside injected body HTML, and `activateListeners(html)` may not receive the body part. Use document-level delegation for body controls (see "Application V2: Body injection and scripts" under Best Practices) or ensure handlers are on `window` from a module that loads before the window opens.

---

## Version History

- **Implemented** — Window API (`api-windows.js`), core template (`window-template.hbs`), base class (`window-base.js`). Template data contract documented above.
- **Public API** — `BlacksmithWindowBaseV2` and `getWindowBaseV2()` exposed on `module.api` so consumers do not import Blacksmith base scripts directly.
- **Canonical file** — `scripts/window-base.js`. The old `window-base-v2.js` re-export shim has been removed; use `module.api`, not a file path.

---

*For internal architecture and implementation details, see **documentation/architecture/architecture-window.md**. For step-by-step window implementation, see **documentation/applicationv2-window/guidance-applicationv2.md**.*
