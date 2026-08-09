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

| Surface | Purpose | Minimises correctly |
|---------|---------|---------------------|
| **Registry** (`registerWindow`, `openWindow`, `unregisterWindow`, …) | Register an **id** and an **opener** so toolbars, macros, and other modules can open your window **without importing your class**. | n/a — the registry does not own presentation |
| **Standard base** (`BlacksmithWindowBaseV2`, or `getWindowBaseV2()`) | **Subclass** Blacksmith's full Application V2 base for editors, forms, and other windows that use the five-zone template. | Yes — `windowSizeConstraints` are published as custom properties and zeroed while minimised |
| **Tool base** (`BlacksmithToolWindowBaseV2`, or `getToolWindowBaseV2()`) | **Subclass** the compact Application V2 presentation for lightweight, persistent canvas tools and palettes. | Yes — same mechanism, inherited from the standard base |

- Use the **registry** when something else (Blacksmith toolbar, another module, a macro) should call `openWindow('your-id')`.
- Use **`api.BlacksmithWindowBaseV2`** for standard windows and **`api.BlacksmithToolWindowBaseV2`** for compact tools. **Do not** deep-link Blacksmith script files from another module's manifest — use **`module.api`**; file paths are not the stable contract.

**Availability timing**

- **Both base classes, getters, and style constants** — `BlacksmithWindowBaseV2`, `BlacksmithToolWindowBaseV2`, `getWindowBaseV2()`, `getToolWindowBaseV2()`, `windowStyles`, `toolTitlebars`, and `toolThemes` are patched on `module.api` **as soon as Blacksmith's module script has finished loading** (before `init` / `ready`), as long as your module loads **after** `coffee-pub-blacksmith` in the manifest (or depends on it). Use this when you resolve a base class at **module top level**.
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

The base supplies the complete shared visual shell even when the consumer returns an empty body: parchment surface, gold border, matching controls, and compact window shadow. No additional parchment class is required. Consumers own only their body content and may override these public custom properties when a deliberate tool-specific variation is required:

| Property | Purpose |
|----------|---------|
| `--blacksmith-tool-background` | Shared frame, title-bar, and empty-body surface. May be a color or gradient. |
| `--blacksmith-tool-border` | Outer frame border. |
| `--blacksmith-tool-divider` | Title/toolbar/footer dividers. |
| `--blacksmith-tool-text` | Default body and control text. |
| `--blacksmith-tool-accent` | Title text and primary frame accent. |
| `--blacksmith-tool-field-background` | Surface of inputs, selects, and textareas. |
| `--blacksmith-tool-field-border` | Field border. |
| `--blacksmith-tool-field-text` | Field text. |
| `--blacksmith-tool-field-placeholder` | Placeholder text. |
| `--blacksmith-tool-field-focus-border` / `--blacksmith-tool-field-focus-ring` | Focus outline and glow. |
| `--blacksmith-tool-field-option-background` / `--blacksmith-tool-field-option-text` | `<option>` rows in an open dropdown. |
| `--blacksmith-tool-surface-raised` | Decorative raised area — group headings, banded rows. May be translucent. |
| `--blacksmith-tool-surface-sunken` | Recessed area — list wells, inset panels. |
| `--blacksmith-tool-surface-hover` | Row and item hover. |
| `--blacksmith-tool-surface-selected` | Selected row or item. |
| `--blacksmith-tool-text-muted` | Secondary text — captions, badges, status lines. |
| `--blacksmith-tool-scrim` | Backing that must stay legible over arbitrary content. Use for sticky elements. |

### Content surfaces: use these instead of picking a colour

The frame variables describe the shell. These describe what you put **inside** it. Reach for them for rows, headings, hover, and selection rather than choosing a colour: any literal you pick is correct in one theme and wrong in the other two, which is how a Tool window ends up looking right in Light and broken in Glass.

Two distinctions worth getting right:

- **`surface-raised` vs `scrim`.** `raised` is decorative and may be translucent. `scrim` guarantees legibility over whatever is behind it. The two are near-identical under Light and Dark and differ sharply under Glass, which is the case they exist for.
  For a **sticky** element, reach for `raised` plus `backdrop-filter: blur(6px)` rather than `scrim`. Both mask the content scrolling underneath, but scrim under Glass is nearly opaque and reads as a hole punched through the frost — heavier than the window's own title bar. A blur smears what passes beneath instead of hiding it, which is all a heading needs, and under Light and Dark `raised` is already opaque so the blur costs nothing. Save `scrim` for something that must stay readable over genuinely arbitrary content, like a full-width overlay.
- **`text-muted` rather than `opacity`.** Dimming with `opacity` fades a whole element including its background and borders, and compounds when nested. `text-muted` is tuned per theme and touches only the colour.

Blacksmith's own `styles/window-compendium-search.css` is the reference: it contains **no colour literals at all** — every surface, tone, and field comes from this family, and the window follows Light, Dark, and Glass with no theme-specific rules of its own.

These are **component properties of the Tool shell, not design tokens.** Global tokens live in `styles/vars.css`, are documented in `design-system/design-tokens.md`, and are enforced by `tools/check-design-tokens.mjs`; they carry one fixed value each and so cannot express something that changes per theme. Do not add theme-varying values to `vars.css`.

### Form fields follow the theme automatically

A Tool window repaints `input`, `select`, and `textarea` inside it from the `--blacksmith-tool-field-*` family, covering both bare elements and the shared `blacksmith-input` / `blacksmith-select` / `blacksmith-textarea` classes. A consumer writes an ordinary field and it follows the user's Light, Dark, or Glass choice with no theme-aware code.

This exists because the shared form-control classes in `styles/window-form-controls.css` are built for Blacksmith's dark standard windows and hard-code a `#222` surface, which renders as a black box on a parchment or frosted shell. Do not work around that by hard-coding a field color in your own stylesheet — override the variables above, scoped to your application class, if you need a deliberate variation.

Two things a consumer still owns:

- **An open `<select>` dropdown is an OS popup**, not part of the page. It inherits nothing from the window, which is why it has its own `option` pair. Those must stay opaque; a translucent value renders as the browser default.
- **A sticky element inside your body needs its own opaque surface.** Under Glass, `--blacksmith-tool-background` is deliberately near-transparent, so a sticky header painted with it lets scrolled content read straight through. Give it a solid background under `.blacksmith-window-tool-theme-glass`.

Scope any override to the consumer's own application class. Do not copy Blacksmith's combatant-card CSS:

```css
.application.blacksmith-window-tool.my-module-tool-window {
    --blacksmith-tool-background: #111;
    --blacksmith-tool-text: #eee;
}
```

### Ephemeral tools: no registration required

Nothing in either base assumes a Tool window is registered or persistent. There is no menubar coupling, no
singleton enforcement, no static instance tracking, and no fixed `id` in `DEFAULT_OPTIONS`. Constructing and
rendering directly is the supported path, and it is how Blacksmith opens its own Send Toast window
(`api-menubar.js`):

```javascript
await new MyTransferTool({ id: `my-transfer-${foundry.utils.randomID()}` }).render({ force: true });
```

Register a window only when *something else* — a toolbar tool, a macro, another module — needs to open it by
id. A tool that only ever opens from an in-flow action gains nothing from registration.

Four things matter for a tool that is ephemeral or can have several instances open at once:

- **Give each instance a distinct `id`.** Two Application V2 instances sharing an id collide in the DOM.
- **Set `rememberPosition: false`.** `windowPositionKey` defaults to the class name, so sibling instances
  share one key and overwrite each other's saved position — the second opens on top of the first. This does
  not cost theme persistence: the theme and title-bar keys are gated by their own `rememberToolTheme` /
  `rememberTitlebarMode` flags, so a user's Glass choice still persists.
- **Options are frozen.** Use `setToolTheme()` / `setToolTitlebarMode()`; never assign `this.options.toolTheme`.
- **Watch the growth axis.** `height: 'auto'` with `resizable: false` is the Tool default; the body scrolls
  and the base clamps to `maxHeight: calc(100vh - 16px)`. If your content is a list that can get long, check
  it at realistic sizes.

`ACTION_HANDLERS` is safe for multi-instance tools as long as handlers read the instance from their third
argument — see "`ACTION_HANDLERS` and the instance argument" below.

### Title-bar modes

Tool windows support two chrome modes through the top-level `toolTitlebar` option:

| Value | Constant | Behavior |
|-------|----------|----------|
| `"full"` | `api.toolTitlebars.FULL` | Default. The full parchment title bar shows the title, direct tool actions, a Blacksmith context-menu launcher, and Close. Existing consumers remain in this mode. |
| `"micro"` | `api.toolTitlebars.MICRO` | A 14px parchment drag rail. The title and the consumer's own header actions are hidden; the **menu dot and Close remain**. Both sit muted until you hover the rail, which brings them to full strength, and hovering one takes that glyph alone to the interactive colour — no background plate at that size. Right-clicking anywhere on the rail opens the same context menu. |

The menu is rendered at the document level by Blacksmith's shared `UIContextMenu`, not inside the Application frame, so it remains usable even when the tool window is very small. It contains the consumer's `getToolHeaderActions()`, inherited Application V2 header controls, Minimize/Restore (when enabled), Reset Position, and Close. Active actions receive a checkmark in their menu label.

Both modes also include a mode-switch entry: **Use Micro Title Bar** in Full mode and **Use Full Title Bar** in Micro mode. The user's selection is remembered per tool using the same stable identity as position persistence, so reopening that tool restores the chosen mode.

### Tool themes

Tool windows support `"light"` (the default parchment presentation), `"dark"` (the established Blacksmith dark-window family), and `"glass"` (a translucent, lightly frosted floating-tool shell). The shared context menu exposes all three under **Theme** and remembers the user's selection independently for each tool. Glass makes the shared shell translucent while leaving consumer-owned content free to remain opaque for readability. Consumer content should inherit the exposed Tool variables rather than hard-coding a conflicting surface.

Consumers may set the initial theme with `toolTheme`, read `app.toolTheme`, or change it at runtime with:

```javascript
await app.setToolTheme(api.toolThemes.GLASS);
```

As with title-bar mode, finalized Application V2 options are immutable; do not assign to `app.options.toolTheme`.

Every render also receives `toolTheme` (`"light"`, `"dark"`, or `"glass"`), `toolThemeIsDark`, and `toolThemeIsGlass` in its Handlebars context. For JavaScript-driven presentation, a consumer may override the post-change lifecycle callback:

```javascript
async onToolThemeChanged(theme, previousTheme) {
    await super.onToolThemeChanged(theme, previousTheme);
    // Update canvas, chart, or third-party UI that cannot inherit CSS variables.
}
```

Blacksmith then broadcasts:

```javascript
Hooks.on('blacksmith.toolWindowThemeChanged', (app, theme, previousTheme) => {
    // Observe theme changes across Tool Window consumers.
});
```

The callback and hook fire after the shared frame state and requested rerender have completed. They fire only for an actual runtime change, not when the saved initial theme is restored during construction. CSS-driven content normally needs neither: it should inherit `--blacksmith-tool-*`, or select the frame's `data-tool-theme` / `.blacksmith-window-tool-theme-light|dark|glass` state.

```javascript
static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
    {
        id: 'my-module-micro-tool',
        toolTitlebar: 'micro',
        position: { width: 340, height: 'auto' },
        window: { title: 'My Tool', resizable: false, minimizable: true }
    }
);
```

`"full"` is the fallback for an omitted or unknown value. Foundry freezes finalized Application V2 options, so consumers must use `setToolTitlebarMode()` for runtime changes rather than assigning `this.options.toolTitlebar`.

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

`api.windowStyles` exposes the stable identifiers `STANDARD` (`"standard"`) and `TOOL` (`"tool"`) for consumers that store or exchange a style choice. `api.toolTitlebars` exposes `FULL` (`"full"`) and `MICRO` (`"micro"`), while `api.toolThemes` exposes `LIGHT` (`"light"`), `DARK` (`"dark"`), and `GLASS` (`"glass"`). The registry remains presentation-agnostic: any style, Tool title-bar mode, and Tool theme can be registered and opened through `registerWindow` / `openWindow`.

Consumers may control mode switching and persistence with:

| Option | Default | Purpose |
|--------|---------|---------|
| `allowTitlebarModeToggle` | `true` | Include the Full/Micro switch in the controls menu. Set `false` to lock the configured mode and ignore saved user choices. |
| `rememberTitlebarMode` | `true` | Persist the user's selected mode in local storage. |
| `toolTitlebarPreferenceKey` | derived | Optional stable storage key. By default it is derived from `windowPositionKey` or the window class. |
| `toolTheme` | `"light"` | Initial shared Tool-shell theme: `"light"`, `"dark"`, or `"glass"`. |
| `allowToolThemeToggle` | `true` | Include the Light/Dark/Glass chooser in the shared context menu. Set `false` to lock the configured theme and ignore saved user choices. |
| `rememberToolTheme` | `true` | Persist the user's selected theme in local storage. |
| `toolThemePreferenceKey` | derived | Optional stable theme-storage key. By default it is derived from `windowPositionKey` or the window class. |

The public `setToolTitlebarMode(mode, options?)` method switches modes programmatically. It accepts `{ persist = true, render = true }`.

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
  - Applied as **CSS custom properties** (`--blacksmith-window-min-width` and siblings) on the application element, which also receives a `blacksmith-window` class — not as inline `min-width` / `min-height`. This is what lets minimising work: Foundry collapses a window with an inline `max-height`, and CSS resolves min-height over max-height, so an inline minimum would pin the frame open and render a title bar above an empty rectangle. In the cascade, `.blacksmith-window.minimized` and `.blacksmith-window.minimizing` zero the minima with ordinary specificity.
  - Consequently you do **not** need `!important` overrides in a consumer stylesheet to make a constrained window minimise, and you should not add the `blacksmith-window` class through `DEFAULT_OPTIONS.classes` — `mergeObject` overwrites arrays rather than concatenating, so classes declared on a base are dropped by any subclass that declares its own.

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
3. **Choose the right contract** — Use the standard five-zone base for forms/editors and `BlacksmithToolWindowBaseV2` for persistent canvas utilities. Tool consumers choose Full or Micro chrome without rebuilding the frame.
4. **Own your content** — Your template/`getData` owns the standard window's content; Tool consumers provide `bodyContent` and optional toolbar/footer content while Blacksmith owns the shared frame.
5. **Application V2 only** — Build your window with `HandlebarsApplicationMixin(ApplicationV2)` and the patterns in the guidance doc (delegation, scroll save/restore, unique instance id).

### `ACTION_HANDLERS` and the instance argument

Set `static ACTION_HANDLERS = { actionName: handler }` on your window class and mark up controls with `data-action="actionName"`. The base binds one click listener **per instance** on the window frame and invokes:

```javascript
static ACTION_HANDLERS = {
    save: (event, target, win) => win.save(),
    // `this` is the instance too, so a regular function works as well:
    cancel(event, target) { return this.close(); }
};
```

**Always use the instance argument (or `this`).** Do not resolve the instance from a shared reference — a class static, a module-level `let`, or `MyWindow._ref`. Those are wrong whenever two instances of the class are open at once: they point at whichever rendered last, so a click in one window acts on the other.

`MyWindow._ref` still exists and still tracks the most recently rendered instance, but only so unmigrated consumers keep working. It is deprecated; migrate to the third argument.

### Application V2: Body injection and scripts

- **Scripts in body/partials do not run.** When Application V2 injects the body part (e.g. from Handlebars), it does **not** execute `<script>` tags inside the injected HTML. Any logic you put in a `<script>` block in a partial will never run. Do not rely on inline `onclick="someFunction()"` unless that function is already defined on `window` by a **module script that runs at load** (e.g. a separate `.js` file in your module's `esmodules` that assigns `window.someFunction = ...`). Prefer `data-action` with `ACTION_HANDLERS` so handlers are attached in JS and work regardless of when the body is injected.
- **Body controls (buttons, drop zones)** — Use `ACTION_HANDLERS`, or bind on `this.element` in `_onRender`. Do not query the body in `activateListeners(html)`: Application V2 may call it with a wrapper that does not contain the body part, or the body may be injected later. `this.element` is the frame, created before parts render and retained across part re-renders, so a listener there catches late-injected content — which is why per-instance binding is sufficient and document-level delegation is not needed.
- **Legacy inline onclick** — If you have many existing inline `onclick` handlers (e.g. a complex worksheet), you can either: (1) **Migrate** to `data-action` and document-level delegation (recommended long term), or (2) **Keep inline onclick** by moving the handler implementations into a module script that runs at load and assigns them to `window`, so the same attribute strings resolve when the body is injected. With option 2, a module script registers the globals at load and each global delegates to the app instance via a ref.

---

## Troubleshooting

- **`registerWindow` / `openWindow` undefined** — Window API not loaded yet. Wait for `ready` and check `game.modules.get('coffee-pub-blacksmith')?.api?.registerWindow`.
- **Window doesn't open** — Ensure the window type is registered before calling `openWindow`. Check that `descriptor.open` returns or resolves to the Application instance if you need a reference.
- **Layout or behavior issues** — Follow **documentation/applicationv2-window/guidance-applicationv2.md** (delegation, scroll save/restore, `_getRoot()`, safe merge of `DEFAULT_OPTIONS`).
- **Buttons or controls in the body do nothing** — Application V2 may not run `<script>` inside injected body HTML, and `activateListeners(html)` may not receive the body part. Use `data-action` with `ACTION_HANDLERS` (see "Application V2: Body injection and scripts" under Best Practices) or bind on `this.element` in `_onRender`.
- **A control acts on the wrong window** — two instances of the class are open and the handler is resolving the instance from a shared reference instead of its third argument. See "`ACTION_HANDLERS` and the instance argument".
- **`Cannot assign to read only property 'toolTitlebar'`** — Foundry freezes finalized Application V2 options. Do not mutate `this.options.toolTitlebar`; call `await app.setToolTitlebarMode('full' | 'micro')`.

---

## Windows Blacksmith registers

Three tool windows ship with Blacksmith and are openable by id from any module or macro.

| Window | Id |
|---|---|
| Dice Tray | `blacksmith-dice-tray` |
| Macros | `blacksmith-macros` |
| Health | `blacksmith-health` |

`blacksmith-health` accepts an option:

```javascript
// Show these tokens without changing what the GM has selected.
blacksmith.openWindow('blacksmith-health', { tokens });
```

Without it the window follows the canvas selection on its own, so a caller that wants the selection shown
should simply select the tokens.

### Window ids another module may provide

Blacksmith looks for one window it does not register itself:

| Id | Effect when registered |
|---|---|
| `blacksmith-status-effects` | The Health window shows a conditions button on each row, opening this window with `{ actor, actorUuid }`. |

The id names a capability rather than a module, the same way menubar intents do. When nobody registers it
the button does not render, which is the correct behaviour for an optional integration.

## Version History

- **Implemented** — Window registry (`api-windows.js`), standard template/base (`window-template.hbs`, `window-base.js`), and Tool template/base (`window-tool-template.hbs`, `window-tool-base.js`).
- **Public API** — Both base classes/getters, `windowStyles`, `toolTitlebars`, and `toolThemes` are exposed on `module.api` so consumers never import Blacksmith implementation scripts directly.
- **Tool chrome** — Full and Micro title bars, native menu actions, mode switching, per-tool preference persistence, position reset, and frozen-options-safe runtime state were live-verified on the combatant card on 2026-07-28.
- **Canonical file** — `scripts/window-base.js`. The old `window-base-v2.js` re-export shim has been removed; use `module.api`, not a file path.

---

*For internal architecture and implementation details, see **documentation/architecture/architecture-window.md**. For step-by-step window implementation, see **documentation/applicationv2-window/guidance-applicationv2.md**.*
