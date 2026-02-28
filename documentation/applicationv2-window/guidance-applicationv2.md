# Application V2 Window Guidance (Foundry VTT v13+)

This document describes how to build Application V2 windows that modules (e.g. Blacksmith consumers) can use or replicate. It is based on the Artificer Skills Window pattern and the **Blacksmith window zone contract**. The goal is a reusable window API pattern and a plug-in example framework that supports a wide variety of window layouts.

**Audience:** Module authors (e.g. Blacksmith) implementing a window API for other modules to open consistent, well-behaved windows.

**Reference assets:**
- **blacksmith-windows-zones.webp** — Canonical diagram of the five zones (title bar, option bar, header, body, action bar).
- **window-samples.png** — Examples of real windows showing which zones are used in different cases (option bar and header optional; action bar optional; body content highly variable).

---

## 0. Blacksmith Window Zone Contract

Windows that follow the Blacksmith contract use up to **five zones**. Consumers choose which zones to include; only **Body** is always present. All zones below the title bar live inside your template’s single root element.

| Zone | Required? | Description |
|------|-----------|-------------|
| **Title bar** | Yes (Foundry) | Foundry chrome: window title, minimize/maximize/close. Not part of your template. |
| **Option bar** | Optional | A bar for filters, toggles, or global options (e.g. “Faster Filter”, “REFRESH CACHE”, “TOKENS”/“PORTRAITS”). May or may not show. |
| **Header** | Optional | Icon, title block (title + subtitle), and optional “header-right” (toggles, values, settings). Omit entirely for minimal windows (e.g. Macros, Dice Tray). |
| **Body** | Yes | Scrollable main area. **Consumers inject their content here.** Many layouts are supported: forms, lists, grids, rich text, multi-column (e.g. crafting), keypads, etc. |
| **Action bar** | Optional | Fixed at bottom. Left = secondary actions (Cancel, Reset, etc.), right = primary action (Save, Apply, Craft, etc.). Omit for display-only or toolbar-style windows. |

See **window-samples.png** for the range of combinations (windows with/without option bar, with/without header, with/without action bar, and very different body content).

---

## 1. How to Create a Window

### 1.1 Class Setup

Use **HandlebarsApplicationMixin(ApplicationV2)** so the window renders a Handlebars template and receives context from `getData`:

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MyModuleWindow extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'my-module-window',
            classes: ['my-window', 'my-module-window'],
            position: { width: 900, height: 600 },
            window: { title: 'My Window', resizable: true, minimizable: true },
            actions: {
                primaryAction: MyModuleWindow._actionPrimary,
                secondaryAction: MyModuleWindow._actionSecondary
            }
        }
    );

    static PARTS = {
        body: {
            template: 'modules/my-module/templates/my-window.hbs'
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${this.constructor.DEFAULT_OPTIONS.id}-${foundry.utils.randomID().slice(0, 8)}`;
        super(opts);
    }
}
```

**Critical:** Do **not** mutate the parent’s defaults. Always merge into a **copy**:

```js
foundry.utils.mergeObject(foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}), { ... })
```

Passing `super.DEFAULT_OPTIONS` as the first argument to `mergeObject` mutates the shared Application V2 base and can break other apps (e.g. changelog, Flush Chat Log).

### 1.2 Providing Data to the Template

Application V2 with HandlebarsApplicationMixin uses `_prepareContext` to build the data object passed to the template. Override `_prepareContext` and call `getData`:

```js
async _prepareContext(options = {}) {
    const base = await super._prepareContext?.(options) ?? {};
    return foundry.utils.mergeObject(base, await this.getData(options));
}

async getData(options = {}) {
    return {
        appId: this.id,
        windowTitle: 'My Window',
        // ... any data your template needs
    };
}
```

The template receives a single context object; use `{{appId}}`, `{{windowTitle}}`, etc.

### 1.3 Template Structure (Zone Contract)

Use a single root element with a stable class (and ideally `id="{{appId}}"`) so the app can find its DOM after render. Include only the zones your window needs:

- **Option bar** (optional) — Row of filters, toggles, or buttons that apply to the whole window (e.g. “REFRESH CACHE”, “TOKENS”/“PORTRAITS”, “OmniRoll”, “Show DC”).
- **Header** (optional) — Flex row: icon, title block (title + subtitle), optional “header-right” (toggles, values, settings). Omit the entire header for minimal windows (e.g. Macros, Dice Tray).
- **Body** — Scrollable main area. **You control what goes here.** Support many layouts: forms, lists, grids, rich text, multi-column, keypads, etc. This is the zone you inject your content into.
- **Action bar** (optional) — Fixed at bottom: secondary button(s) left, primary button(s) right. Omit for display-only or toolbar-style windows.

Example skeleton with all zones (omit the sections you don’t need):

```html
<div class="my-window-root" id="{{appId}}">
    {{!-- Optional: option bar --}}
    <div class="my-window-option-bar">
        <!-- filters, toggles, e.g. REFRESH CACHE, TOKENS/PORTRAITS -->
    </div>
    {{!-- Optional: header --}}
    <header class="my-window-header">
        <div class="my-window-header-content">
            <div class="my-window-header-icon"><i class="fa-solid fa-icon"></i></div>
            <div class="my-window-header-title-block">
                <div class="my-window-header-title">{{windowTitle}}</div>
                <div class="my-window-header-subtitle">{{subtitle}}</div>
            </div>
            <div class="my-window-header-right">
                <!-- toggles, points, etc. -->
            </div>
        </div>
    </header>
    <div class="my-window-body">
        <!-- scrollable content: inject your layout here -->
    </div>
    {{!-- Optional: action bar --}}
    <section class="my-window-buttons">
        <div class="my-window-action-bar">
            <div class="my-window-action-left"></div>
            <div class="my-window-action-right">
                <button type="button" class="my-window-btn-primary" data-action="primaryAction">Apply</button>
            </div>
        </div>
    </section>
</div>
```

Use **one root class** (e.g. `my-window-root`) so both `getElementById(this.id)` and `querySelector('.my-window-root')` can resolve the app root when the part is rendered (see §3.1).

### 1.4 Actions

Register actions in `DEFAULT_OPTIONS.actions` as static methods. Use `data-action="actionName"` in the template. Application V2 will invoke the static method; the method must resolve the **current window instance** (e.g. from a module-level ref set when the window is open) and call instance logic or `this.render()`.

Pattern used in Skills window:

- Module-level ref: `let _currentWindowRef = null;`
- In delegation (see §2.2), set `_currentWindowRef = this` when attaching.
- Static action: `static _actionPrimary(event, target) { const w = _currentWindowRef; if (!w) return; ... w.render(); }`

---

## 2. Best Practices

### 2.1 Unique ID per Instance

Give each window instance a unique `id` so multiple windows of the same type don’t collide and so the DOM can be found via `getElementById(this.id)`:

```js
opts.id = opts.id ?? `${BASE_ID}-${foundry.utils.randomID().slice(0, 8)}`;
```

### 2.2 Event Delegation (Required for PARTS)

Application V2 may render the body **part** in a way that does not call `activateListeners` with the part’s HTML, or the part may be replaced on re-render. So **do not rely on attaching listeners inside `activateListeners(html)` to part content**.

Use **document-level delegation**:

1. Attach **one** listener to `document` (or a stable container) in a method that runs once (e.g. `_attachDelegationOnce()`).
2. In the handler, check `event.target` (or `event.target.closest(selector)`) is inside your window root.
3. Use `data-action` and optional `data-*` attributes to decide which action to run.
4. Call static action methods with `(event, target)` so they can read `target.dataset`.

Attach delegation in both `_onFirstRender` and `activateListeners` so it’s set whether or not the part triggers `activateListeners`:

```js
_attachDelegationOnce() {
    if (_delegationAttached) return;
    _delegationAttached = true;
    _currentWindowRef = this;

    document.addEventListener('click', (e) => {
        const w = _currentWindowRef;
        if (!w) return;
        const root = w._getRoot();
        if (!root?.contains?.(e.target)) return;

        const btn = e.target?.closest?.('[data-action="primaryAction"]');
        if (btn) {
            e.preventDefault?.();
            MyModuleWindow._actionPrimary(e, btn);
            return;
        }
    });
}

async _onFirstRender(_context, options) {
    await super._onFirstRender?.(_context, options);
    this._attachDelegationOnce();
}

activateListeners(html) {
    super.activateListeners(html);
    this._attachDelegationOnce();
}
```

Use **capture** or **stopPropagation** only when you must avoid double handling (e.g. with Application V2’s own action handling).

### 2.3 Finding the Root After Render

The part is rendered into Application V2’s DOM; `this.element` might be the wrapper, not the part. Provide a helper that tries both ID and a stable class:

```js
_getRoot() {
    const byId = document.getElementById(this.id);
    if (byId) return byId;
    return document.querySelector('.my-window-root') ?? this.element ?? null;
}
```

Use `_getRoot()` in delegation and when saving/restoring scroll (see §2.4).

### 2.4 Preserving Scroll on Re-render

Re-rendering replaces the part HTML and resets scroll. If the window has scrollable regions (e.g. a details pane), save scroll positions before `super.render()` and restore after the DOM is updated:

```js
_saveScrollPositions() {
    const root = this._getRoot();
    const body = root?.querySelector?.('.my-window-body');
    const windowContent = this.element?.closest?.('.window-content');
    return {
        body: body ? body.scrollTop : 0,
        windowContent: windowContent ? windowContent.scrollTop : 0
    };
}

_restoreScrollPositions(saved) {
    if (!saved) return;
    const root = this._getRoot();
    const body = root?.querySelector?.('.my-window-body');
    const windowContent = this.element?.closest?.('.window-content');
    if (body && saved.body) body.scrollTop = saved.body;
    if (windowContent && saved.windowContent) windowContent.scrollTop = saved.windowContent;
}

async render(force = false) {
    const scrolls = this._saveScrollPositions();
    const result = await super.render(force);
    requestAnimationFrame(() => this._restoreScrollPositions(scrolls));
    return result;
}
```

### 2.5 Re-attaching Listeners After Render

If you have controls that are re-created on each render (e.g. a checkbox that toggles a setting), attach their listener **after** each render, not only once. Do it in the same `requestAnimationFrame` as scroll restore so the new DOM is in place.

### 2.6 Buttons: type and data-action

- Use `type="button"` for all buttons that are not submitting a form. That avoids accidental form submit and page refresh.
- Use `data-action="actionName"` so your delegation can route to the right static action.

---

## 3. Common Issues and How to Overcome Them

### 3.1 “My listeners never run” / “activateListeners gets wrong html”

Application V2 may inject the body **part** in a container and call `activateListeners` with the wrapper element, not the part’s root. So element-based listeners (e.g. `html.querySelector('[data-action="save"]').addEventListener(...)`) may attach to the wrong node or the part may be replaced later.

**Fix:** Use document-level (or window-root) delegation and `data-action` as above. Don’t depend on `html` in `activateListeners` being the part root.

### 3.2 “getElementById(this.id) returns null”

The part might be rendered in a way that the root node doesn’t get the application’s `id`. Ensure your template root has `id="{{appId}}"` if you pass `appId: this.id` in `getData`, **or** use a unique class (e.g. `my-window-root`) and fall back to `querySelector('.my-window-root')` in `_getRoot()`. Note: if multiple windows of the same type are open, a single class would need to be combined with a parent check; unique ID on the root is preferable.

### 3.3 “Scroll jumps to top when I click something”

Re-render replaces the part HTML, so scroll positions reset. **Fix:** Implement scroll save/restore in `render()` as in §2.4.

### 3.4 “mergeObject changed every Application V2 window”

You merged into `super.DEFAULT_OPTIONS` and mutated the shared base. **Fix:** Always merge into a copy: `foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}, { ... })`.

### 3.5 “Static action can’t access the window instance”

Static methods don’t have `this` bound to the instance. Use a module-level reference set when the window is open (e.g. `_currentWindowRef = this` in `_attachDelegationOnce`) and read it in the static action.

---

## 4. What We’ve Learned

- **Delegation is mandatory** for reliable click handling with Application V2 PARTS; don’t rely on `activateListeners(html)` receiving the part root.
- **One root element with a stable class (and ideally unique id)** makes it possible to find the window’s DOM consistently across renders and across different Foundry versions.
- **Scroll save/restore** is necessary for any window with scrollable content that re-renders on interaction.
- **Unique instance IDs** prevent collisions when the same window class is opened more than once (or when the same template is used by different modules).
- **HandlebarsApplicationMixin** gives a clean separation: template owns layout, `getData()` owns data; no need to build HTML in JS for the main structure.

---

## 5. What We’d Do Different

- **Centralize the “window ref” pattern:** If Blacksmith provides a window API, it could own the ref (e.g. “current window opened via API”) so every consumer doesn’t need a global `_currentWindowRef`.
- **Standardize root id in template:** Always pass `appId: this.id` and use `<div class="my-window-root" id="{{appId}}">` in the template so `getElementById(this.id)` always finds the root. We did this in Skills; making it a requirement would simplify `_getRoot()`.
- **Optional base class:** A thin “WindowWithHeaderAndActions” base class could encapsulate PARTS template path, optional zones (option bar, header, action bar), body as the injectable area, `_getRoot()`, scroll save/restore, and delegation wiring so each module only supplies `getData`, actions, and optional CSS.

---

## 6. Example: Minimal Window Framework

Below is a **minimal plug-in window** that includes all five zones from the contract (option bar, header, body, action bar) so you can copy and remove the zones you don’t need. Replace placeholders with your module id, template path, and styles.

**Copyable files** are in `documentation/applicationv2-window/` (example-window.hbs, example-window.js, README.md).

**Zone diagram:** See **blacksmith-windows-zones.webp** for the canonical layout. **window-samples.png** shows real windows and which zones they use (option bar and header optional; action bar optional; body content varies widely).

### 6.1 Template

```handlebars
{{!-- Minimal Application V2 window - all zones (option bar, header, body, action bar). Omit zones you don't need. --}}
<div class="example-window-root" id="{{appId}}">
    {{!-- Optional: option bar (filters, toggles) --}}
    <div class="example-window-option-bar">
        {{!-- e.g. REFRESH CACHE, TOKENS / PORTRAITS, OmniRoll, Show DC --}}
    </div>

    {{!-- Optional: header (icon, title, subtitle, header-right) --}}
    <header class="example-window-header">
        <div class="example-window-header-content">
            <div class="example-window-header-icon">
                <i class="fa-solid fa-window-maximize"></i>
            </div>
            <div class="example-window-header-title-block">
                <div class="example-window-header-title">{{windowTitle}}</div>
                <div class="example-window-header-subtitle">{{subtitle}}</div>
            </div>
            <div class="example-window-header-right">
                {{!-- Add toggles, values, settings --}}
            </div>
        </div>
    </header>

    <div class="example-window-body">
        {{!-- Body: inject your content and layout here (forms, lists, grids, etc.) --}}
        <div class="example-window-main">
            <p class="example-window-placeholder">Content goes here.</p>
        </div>
        <aside class="example-window-details">
            <section class="example-window-details-section">
                <h3 class="example-window-details-title">Details</h3>
                <div class="example-window-details-content">
                    <p class="example-window-placeholder">Details go here.</p>
                </div>
            </section>
        </aside>
    </div>

    {{!-- Optional: action bar (secondary left, primary right) --}}
    <section class="example-window-buttons">
        <div class="example-window-action-bar">
            <div class="example-window-action-left"></div>
            <div class="example-window-action-right">
                <button type="button" class="example-window-btn-secondary" data-action="reset">Reset</button>
                <button type="button" class="example-window-btn-primary" data-action="apply">Apply</button>
            </div>
        </div>
    </section>
</div>
```

### 6.2 Script: `scripts/example-module-window.js` (or copy from `documentation/example-applicationv2-window/example-window.js`)

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EXAMPLE_APP_ID = 'example-module-window';
let _exampleWindowRef = null;
let _exampleDelegationAttached = false;

export class ExampleModuleWindow extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: EXAMPLE_APP_ID,
            classes: ['example-module-window'],
            position: { width: 900, height: 600 },
            window: { title: 'Example Window', resizable: true, minimizable: true },
            actions: {
                reset: ExampleModuleWindow._actionReset,
                apply: ExampleModuleWindow._actionApply
            }
        }
    );

    static PARTS = {
        body: {
            template: 'modules/your-module-id/templates/example-module-window.hbs'
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${EXAMPLE_APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        super(opts);
    }

    _getRoot() {
        const byId = document.getElementById(this.id);
        if (byId) return byId;
        return document.querySelector('.example-window-root') ?? this.element ?? null;
    }

    async _prepareContext(options = {}) {
        const base = await super._prepareContext?.(options) ?? {};
        return foundry.utils.mergeObject(base, await this.getData(options));
    }

    async getData(options = {}) {
        return {
            appId: this.id,
            windowTitle: 'Example Window',
            subtitle: 'Subtitle or context'
        };
    }

    _saveScrollPositions() {
        const root = this._getRoot();
        const body = root?.querySelector?.('.example-window-body');
        const details = root?.querySelector?.('.example-window-details-content');
        return {
            body: body ? body.scrollTop : 0,
            details: details ? details.scrollTop : 0
        };
    }

    _restoreScrollPositions(saved) {
        if (!saved) return;
        const root = this._getRoot();
        const body = root?.querySelector?.('.example-window-body');
        const details = root?.querySelector?.('.example-window-details-content');
        if (body && saved.body) body.scrollTop = saved.body;
        if (details && saved.details) details.scrollTop = saved.details;
    }

    async render(force = false) {
        const scrolls = this._saveScrollPositions();
        const result = await super.render(force);
        requestAnimationFrame(() => this._restoreScrollPositions(scrolls));
        return result;
    }

    _attachDelegationOnce() {
        _exampleWindowRef = this;
        if (_exampleDelegationAttached) return;
        _exampleDelegationAttached = true;

        document.addEventListener('click', (e) => {
            const w = _exampleWindowRef;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;

            const resetBtn = e.target?.closest?.('[data-action="reset"]');
            if (resetBtn) {
                e.preventDefault?.();
                ExampleModuleWindow._actionReset(e, resetBtn);
                return;
            }
            const applyBtn = e.target?.closest?.('[data-action="apply"]');
            if (applyBtn) {
                e.preventDefault?.();
                ExampleModuleWindow._actionApply(e, applyBtn);
                return;
            }
        });
    }

    static _actionReset(event, target) {
        const w = _exampleWindowRef;
        if (!w) return;
        event?.preventDefault?.();
        w.render();
    }

    static _actionApply(event, target) {
        const w = _exampleWindowRef;
        if (!w) return;
        event?.preventDefault?.();
        w.render();
    }

    async _onFirstRender(_context, options) {
        await super._onFirstRender?.(_context, options);
        this._attachDelegationOnce();
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._attachDelegationOnce();
    }
}
```

### 6.3 CSS Hints

- Root: `display: flex; flex-direction: column; min-height: …; overflow: hidden`.
- Option bar (if used): `flex-shrink: 0`.
- Header (if used): `flex-shrink: 0`; body: `flex: 1; overflow: auto`.
- Body is the main scrollable area; you control layout inside it (single column, two-column, grid, etc.).
- Action bar (if used): `flex-shrink: 0` at the bottom.

Reference `styles/window-skills.css` in this repository for a full layout. See **window-samples.png** for the variety of zone combinations and body layouts.

---

## 7. Summary

| Topic | Recommendation |
|-------|----------------|
| Zones | Title bar (Foundry) → **Option bar** (optional) → **Header** (optional) → **Body** (required, injectable) → **Action bar** (optional). See blacksmith-windows-zones.webp and window-samples.png. |
| Base class | `HandlebarsApplicationMixin(ApplicationV2)` |
| Defaults | Always merge into a **copy** of `super.DEFAULT_OPTIONS` |
| Data | `_prepareContext` → `getData()`; template receives one context object |
| Layout | Single root with only the zones you need; body is where you inject your content and support many layouts |
| Click handling | Document-level delegation; `data-action`; static actions + module-level window ref |
| Root lookup | `getElementById(this.id)` with fallback to `querySelector('.my-window-root')` |
| Scroll | Save before `super.render()`, restore in `requestAnimationFrame` after |
| Instance ID | Unique per open: `id-${randomID().slice(0,8)}` |

Using this pattern, a window API can expose a consistent way for modules to open windows that behave correctly with Application V2 and stay maintainable.
