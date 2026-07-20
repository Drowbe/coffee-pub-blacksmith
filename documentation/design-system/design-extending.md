# Extending Blacksmith from Another Module

**For authors of sibling modules.** How to reach the Blacksmith API safely, style against its design
system, and add your own tools to its surfaces.

Token values are on the Design tokens page; component classes are on the Design components page. The
per-feature API pages (`api-menubar`, `api-window`, `api-toast` and the rest) are authoritative for
individual method contracts -- this page covers the entry points and the patterns that span them.

## Reaching the API

Blacksmith assembles `module.api` during its own startup, so a bare
`game.modules.get('coffee-pub-blacksmith')?.api` read carries no readiness guarantee -- whether the
methods you want are attached depends on hook ordering between your module and Blacksmith. The bridge at
`api/blacksmith-api.js` exists to remove that race:

```js
import { BlacksmithAPI } from '../../coffee-pub-blacksmith/api/blacksmith-api.js';

const api = await BlacksmithAPI.get();          // resolves once the API is fully assembled
```

`BlacksmithAPI.waitForReady()` (`api/blacksmith-api.js:52`) is the same guarantee without the return
value, for code that only needs to sequence itself after Blacksmith.

Register your module so Blacksmith knows about it, and gate optional integrations on presence rather than
assuming it:

```js
api.registerModule(moduleId, { name, version, features });
if (api.isModuleActive('coffee-pub-blacksmith')) { /* optional integration */ }
```

`registerModule`, `isModuleActive`, and `getModuleFeatures` are at `scripts/blacksmith.js:880-882`.

## What the API exposes

`module.api` carries both namespaced sub-APIs and a flat set of registration methods
(`scripts/blacksmith.js:878-1000`).

| Namespace | Covers |
|---|---|
| `pins` | Canvas pins |
| `tags` | Tag registry and taxonomy |
| `gmNotes` | GM notes |
| `chatCards` | Chat card construction and sending |
| `toast` | Transient client notifications |
| `campaign` | Campaign data |
| `compendiums` | Compendium access |
| `stats` | Combat and player statistics |
| `sockets` | Cross-client messaging |
| `utils` | Shared utilities |

Flat registration methods cover toolbar tools, menubar tools, windows, notifications, secondary bars, and
the combat bar. Constants are at `api.BLACKSMITH` (`scripts/blacksmith.js:887`) and the API version at
`api.version` (`:886`). The internal `MODULE` object in `scripts/const.js` is not exposed -- it is for
intra-module imports only.

## Styling against the design system

Blacksmith loads `styles/vars.css` on `:root`, so every design token is global once Blacksmith is active.
Child modules need no import and no build step. Card tokens are likewise global, declared in a `:root`
block at `styles/cards-common-layout.css:19`.

```css
.my-module-panel {
    padding: var(--blacksmith-space-lg, 12px);
    background: var(--blacksmith-surface-dark-1, #222222);
    border-radius: var(--blacksmith-radius-md, 4px);
}
```

Supply fallbacks for anything that must survive Blacksmith being disabled. To retheme Blacksmith
components rendered inside your own UI, override a token on your root element -- the change cascades:

```css
#coffee-pub-mymodule { --blacksmith-color-brand-accent: #4a7a2a; }
```

Custom properties are inherited, so this override applies to that element and its descendants only.
Blacksmith components elsewhere in the document keep the `:root` value, and other modules are unaffected.

The corollary is the thing to watch: **an override only reaches components that render inside your
element.** Several Blacksmith surfaces do not. Toasts and the canvas pin overlay attach to `document.body`
(`scripts/api-toast.js:218`, `scripts/pins-renderer.js:93`), chat cards render into Foundry's chat log, and
the menubar is fixed at the top of the interface. A scoped override has no effect on any of those -- it
will look like nothing happened.

To restyle those, either target the component's own classes in your stylesheet, or set the token on
`:root` -- but a `:root` override is global, changing that token for Blacksmith and every other coffee-pub
module at once. Prefer scoping unless a suite-wide change is what you intend.

### A custom card theme

Themes are color-only. Declare a `.blacksmith-card.theme-[name]` block and set the card tokens; structure,
spacing, and radius come from the shared layout stylesheet. The nine shipped themes at
`styles/cards-common-themes.css:11-154` are the working reference for which tokens a complete theme sets.

Then render a card with your theme class and Blacksmith's regions:

```html
<div class="blacksmith-card theme-mymodule">
    <div class="card-header">Title</div>
    <div class="section-content">Body</div>
</div>
```

Theme matching is generic (`styles/cards-common-layout.css:63`), so any `theme-*` class participates.

## Adding a menubar tool

```js
api.registerMenubarTool('my-module-tool', {
    icon: 'fa-solid fa-dice-d20',       // required
    name: 'my-tool',                     // required, internal identifier
    onClick: () => { /* ... */ },        // required
    title: 'Roll Something',             // optional label, defaults to name
    zone: 'left',                        // optional, defaults to 'left'
    group: 'my-group',                   // optional
    order: 10,                           // optional
    contextMenuItems: []                 // optional
});
```

Two positional arguments -- a tool id and a data object. The three required fields are validated at
`scripts/api-menubar.js:776`, and registration returns a boolean rather than throwing. Full contract in
`api-menubar`. The paired `unregisterMenubarTool`, `getRegisteredMenubarTools`, `getMenubarToolsByModule`,
`getMenubarToolsByZone`, and `isMenubarToolRegistered` are on the same flat surface.

## Building a window

Take the base class from the API rather than deep-linking the file, so your module does not break when
Blacksmith moves it:

```js
const api = await BlacksmithAPI.get();
const Base = api.BlacksmithWindowBaseV2;      // also api.getWindowBaseV2()
```

Subclasses use the ApplicationV2 shape -- `static DEFAULT_OPTIONS` and `static PARTS`. All 14 window
classes in the module follow this; `scripts/window-gmtools.js:9-24` is the reference implementation.

```js
class MyWindow extends Base {
    static ROOT_CLASS = 'my-module-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        id: 'my-window',
        position: { width: 600, height: 400 },
        window: { title: 'My Window', resizable: true }
    });

    static PARTS = { body: { template: 'modules/my-module/templates/my-window.hbs' } };

    static ACTION_HANDLERS = { doThing: (event, target, app) => { /* ... */ } };

    getData() { return { /* template context */ }; }
}
```

`width`, `height` and the rest of the geometry go under `position`; `title`, `resizable` and `minimizable`
go under `window`. The base calls `getData()` from `_prepareContext` (`scripts/window-base.js:33-35`), and
`static ROOT_CLASS` / `static ACTION_HANDLERS` are the subclass hooks (`scripts/window-base.js:15, 18`).
Windows that need size clamping declare `windowSizeConstraints` (`scripts/window-gmtools.js:16`).

## Settings

Read and write settings through the safe wrappers rather than `game.settings` directly -- they tolerate a
missing setting or module instead of throwing:

```js
const value = api.utils.getSettingSafely(moduleId, settingKey, defaultValue);
await api.utils.setSettingSafely(moduleId, settingKey, value);
```

Defined at `scripts/api-core.js:26` and `:42`.

## Hooks

Blacksmith registers the large majority of its own hooks through `HookManager`
(`scripts/blacksmith.js:888`), which tracks registrations so they can be cleaned up by owner. Prefer it
over bare `Hooks.on` for anything with a lifecycle:

```js
api.HookManager.registerHook({ name: 'updateActor', description: '...', context: 'my-module', callback });
```

Contract and cleanup semantics are in `api-hookmanager` and `architecture-hookmanager`.

## Logging

`postConsoleAndNotification` is the module-wide logger (`scripts/api-core.js:1205`):

```js
postConsoleAndNotification(moduleName, message, result, blnDebug, blnNotification);
```

`blnDebug` routes the line through the debug gate, so debug output is suppressed unless debugging is on;
`blnNotification` also surfaces it to the user as a Foundry notification.

## Chat cards

Blacksmith's cards are Handlebars templates rendered into chat messages. The card root and its theme class
come from the pattern at `templates/cards-common.hbs:38-40`; conditional regions key off context flags
(`:2, 6, 17, 28`).

Two mechanics worth knowing when building card templates:

- **Partials** are registered with `Handlebars.registerPartial` under an explicit alias, not by path --
  the shared header is registered as `partial-unified-header` at `scripts/blacksmith.js:841-844`. Use
  `foundry.applications.handlebars.loadTemplates` for template preloading; the bare `renderTemplate` and
  `loadTemplates` globals are deprecated in v13, and every call site in this module uses the namespaced
  form.
- **Hiding the Foundry message header** is done by emitting the `coffeepub-hide-header` marker in the
  template's first line and wrapping it in `<span style="visibility: hidden">`. The marker is consumed in
  JavaScript (`scripts/blacksmith.js:2025-2042`, `scripts/manager-libwrapper.js:102`), not by a
  stylesheet.
