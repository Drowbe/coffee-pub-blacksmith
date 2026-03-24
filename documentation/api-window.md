# Blacksmith Window API Documentation

**Audience:** Developers integrating with Blacksmith and opening or registering Application V2–style windows.

This document describes the **Window API**: how to register a window type with Blacksmith and how to open a window by id. It follows the same registration pattern as the Toolbar API: you register a **window type** (id + descriptor); Blacksmith routes “open this window” to your opener. **You keep full control** of header and body content; Blacksmith provides the zone contract and optional base behavior.

**Status:** The Window API is exposed on `game.modules.get('coffee-pub-blacksmith').api`. Use this document as the contract for integration.

**Related docs:**
- **documentation/architecture-window.md** — Internal architecture (zone contract, registry, base class).
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
| **Base class** (`BlacksmithWindowBaseV2`, or `getWindowBaseV2()`) | **Subclass** Blacksmith’s Application V2 base when you build a window that uses the zone template and shared behavior (scroll save/restore, optional `data-action` delegation, window size constraints). |

- Use the **registry** when something else (Blacksmith toolbar, another module, a macro) should call `openWindow('your-id')`.
- Use **`api.BlacksmithWindowBaseV2`** (recommended) or **`api.getWindowBaseV2()`** when your module defines `class MyWindow extends BlacksmithWindowBaseV2`. **Do not** deep-link `scripts/window-base-v2.js` from another module’s manifest — that path is not a stable public contract; the API is.

**Availability timing**

- **`BlacksmithWindowBaseV2` / `getWindowBaseV2()`** — Set on `module.api` **as soon as Blacksmith’s module script has finished loading** (before `init` / `ready`), as long as your module loads **after** `coffee-pub-blacksmith` in the manifest (or depends on it). Use this when you resolve a base class at **module top level** (e.g. `class X extends resolveBase()`).
- **Window registry** (`registerWindow`, `openWindow`, …) — Populated during Blacksmith’s **`ready`** handling; use after `ready` (or `Hooks.once('ready', …)`).
- Most other **`module.api`** members — Still filled in **`ready`** as today.

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

## Template data contract (core template)

When you use Blacksmith’s core template (`templates/window-template.hbs`) and extend `BlacksmithWindowBaseV2`, your `getData()` return value can include the following. All are optional unless noted. HTML slots are rendered as HTML (use triple-brace in Handlebars if you author your own template).

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
| **actionBarLeft** | string (HTML) | Action bar left (secondary buttons, status text). Use class `blacksmith-window-template-btn-secondary` and `data-action="name"` for buttons that trigger `ACTION_HANDLERS`. |
| **actionBarRight** | string (HTML) | Action bar right (primary buttons). Use `blacksmith-window-template-btn-primary` for primary style. |

The base class sets `showOptionBar`, `showHeader`, `showTools`, and `showActionBar` to `true` when not provided, so all zones are visible by default. Return `showOptionBar: false` (or `showHeader` / `showTools` / `showActionBar`) to hide a zone.

---

## Window options (resizable, min/max size)

When extending `BlacksmithWindowBaseV2`, set **`DEFAULT_OPTIONS`** (or pass options at construction) so the window frame behaves as needed:

- **`window.resizable`** (boolean) — Whether the window can be resized by the user. Default is up to the module (e.g. `true` for Regent).
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
// `blacksmith?.BlacksmithWindowBaseV2` may already exist at module load (see “Availability timing” above).
```

### 3. Register Your Window

```javascript
// When your module is ready (e.g. in ready hook)
blacksmith.registerWindow('my-module-window', {
    open: (options = {}) => {
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

### 5. Unregister on Disable

```javascript
Hooks.once('disableModule', (moduleId) => {
    if (moduleId === 'my-module' && blacksmith?.unregisterWindow) {
        blacksmith.unregisterWindow('my-module-window');
    }
});
```

---

## API Reference

The following methods are the planned surface. Signatures and behavior are the contract for implementation.

### Window Registration

#### `registerWindow(windowId, descriptor)`

Registers a window type with Blacksmith. Only one window per `windowId`; re-registering overwrites.

**Parameters:**

- `windowId` (string): Unique identifier for the window type (e.g. `'regent'`, `'my-module-window'`).
- `descriptor` (Object): Descriptor object.

**Returns:** `boolean` — Success status.

**Descriptor properties:**

- `open` (Function, required): `(options?: Object) => Promise<Application | void> | Application | void`. Called when the window should be opened. Typically instantiates your Application V2 class and calls `render(true)`. May be async.
- `title` (string, optional): Default window title (e.g. for Foundry’s title bar).
- `moduleId` (string, optional): Module id that owns this window (for debugging and cleanup).

**Example:**

```javascript
blacksmith.registerWindow('consult-regent', {
    open: async (options) => {
        const { BlacksmithWindowQuery } = await import('/modules/coffee-pub-regent/scripts/window-query.js');
        const w = new BlacksmithWindowQuery(options);
        return w.render(true);
    },
    title: 'Consult the Regent',
    moduleId: 'coffee-pub-regent'
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
- `options` (Object, optional): Passed through to the descriptor’s `open` function. Use for window-specific options (e.g. initial data, size).

**Returns:** `Promise<Application | void> | Application | void` — Whatever the registered `open` returns (typically the rendered Application).

**Example:**

```javascript
// From a toolbar tool
blacksmith.api.registerToolbarTool('regent', {
    icon: 'fa-solid fa-crystal-ball',
    title: 'Consult the Regent',
    onClick: () => blacksmith.api.openWindow('consult-regent')
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

1. **Unique window ids** — Use a prefix (e.g. module id) to avoid collisions: `'my-module-settings'`, `'regent'`.
2. **Unregister on disable** — In `disableModule`, call `unregisterWindow` for every window id your module registered.
3. **Zone contract** — Follow the five-zone contract (option bar, header, body, action bar optional; body required) so windows look consistent and any future shared behavior (e.g. base class) applies. See **guidance-applicationv2.md** and the example template.
4. **Own your content** — Your template and `getData` define header and body; Blacksmith does not inject content into your window.
5. **Application V2 only** — Build your window with `HandlebarsApplicationMixin(ApplicationV2)` and the patterns in the guidance doc (delegation, scroll save/restore, unique instance id).

### Application V2: Body injection and scripts

- **Scripts in body/partials do not run.** When Application V2 injects the body part (e.g. from Handlebars), it does **not** execute `<script>` tags inside the injected HTML. Any logic you put in a `<script>` block in a partial will never run. Do not rely on inline `onclick="someFunction()"` unless that function is already defined on `window` by a **module script that runs at load** (e.g. a separate `.js` file in your module’s `esmodules` that assigns `window.someFunction = ...`). Prefer **document-level delegation** and `data-action` so handlers are attached in JS and work regardless of when the body is injected.
- **Body controls (buttons, drop zones)** — If your body contains buttons, drop zones, or other interactive elements, attach their behavior via **document-level** (or stable-wrapper) delegation (e.g. in `_attachDelegationOnce()`), not by querying the body in `activateListeners(html)`. Application V2 may call `activateListeners` with a wrapper element that does not contain the body part, or the body may be injected later; delegation on `document` (with a check that the event target is inside your app root or a known wrapper) ensures clicks are handled regardless.
- **Legacy inline onclick** — If you have many existing inline `onclick` handlers (e.g. a complex worksheet), you can either: (1) **Migrate** to `data-action` and document-level delegation (recommended long term), or (2) **Keep inline onclick** by moving the handler implementations into a module script that runs at load and assigns them to `window`, so the same attribute strings resolve when the body is injected. Option 2 is used by the Regent encounter worksheet (`regent-encounter-worksheet.js` registers globals on `window`; `window.addTokensToContainer` delegates to the app instance via a ref).

---

## Troubleshooting

- **`registerWindow` / `openWindow` undefined** — Window API not loaded yet. Wait for `ready` and check `game.modules.get('coffee-pub-blacksmith')?.api?.registerWindow`.
- **Window doesn’t open** — Ensure the window type is registered before calling `openWindow`. Check that `descriptor.open` returns or resolves to the Application instance if you need a reference.
- **Layout or behavior issues** — Follow **documentation/applicationv2-window/guidance-applicationv2.md** (delegation, scroll save/restore, `_getRoot()`, safe merge of `DEFAULT_OPTIONS`).
- **Buttons or controls in the body do nothing** — Application V2 may not run `<script>` inside injected body HTML, and `activateListeners(html)` may not receive the body part. Use document-level delegation for body controls (see “Application V2: Body injection and scripts” under Best Practices) or ensure handlers are on `window` from a module that loads before the window opens.

---

## Version History

- **Implemented** — Window API (`api-windows.js`), core template (`window-template.hbs`), base class (`window-base-v2.js`). Template data contract documented above.
- **Public API** — `BlacksmithWindowBaseV2` and `getWindowBaseV2()` exposed on `module.api` so consumers do not import `scripts/window-base-v2.js` directly.

---

*For internal architecture and implementation details, see **documentation/architecture-window.md**. For step-by-step window implementation, see **documentation/applicationv2-window/guidance-applicationv2.md**.*
