# Scene Config API

**Audience:** Developers adding a tab to Foundry's Scene Configuration sheet from a Coffee Pub module.

Covers the registration surface for Scene Config tabs and the constraints a tab's render callback
must satisfy. Implementation lives in `scripts/manager-scene-config.js`.

---

## Overview

Foundry's Scene Configuration sheet is an ApplicationV2. Injecting a tab into it correctly is harder
than it looks, and the failure modes are silent: a duplicated panel on every render, or a tab that
disappears between reloads. This API owns that handling so each module does not re-derive it.

Register a tab and Blacksmith injects it on every Scene Config render, removing any stale copy first.

```js
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

blacksmith.registerSceneConfigTab('my-module-terrain', {
    label: 'Terrain',
    icon: 'fa-solid fa-mountain-sun',
    moduleId: 'my-module',
    render: (scene) => `
        <div class="form-group">
            <label>Elevation</label>
            <input type="number" name="flags.my-module.terrain.elevation"
                   value="${scene.getFlag('my-module', 'terrain')?.elevation ?? 0}" />
        </div>`
});
```

## Methods

| Method | Returns | Purpose |
|---|---|---|
| `registerSceneConfigTab(tabId, tabData)` | `boolean` | Register a tab. |
| `unregisterSceneConfigTab(tabId)` | `boolean` | Remove a tab. `false` if it was not registered. |
| `getRegisteredSceneConfigTabs()` | `Map` | Copy of the registry. |
| `isSceneConfigTabRegistered(tabId)` | `boolean` | Whether an id is taken. |

These are assigned during Blacksmith's module load rather than filled in later, so they are callable
from a consumer's `init`.

### `tabData`

| Key | Required | Notes |
|---|---|---|
| `label` | yes | Tab text. Set as `textContent`, so it is never parsed as markup. |
| `render` | yes | `(scene, app) => string`. Must be synchronous. |
| `icon` | no | Font Awesome classes, e.g. `'fa-solid fa-mountain-sun'`. Classes only, not markup. |
| `moduleId` | no | Owning module id. Defaults to Blacksmith's own id. |

`tabId` becomes the `data-tab` attribute, so prefix it with your module id to avoid collisions.

The tab button is built to match `templates/generic/tab-navigation.hbs`, so it lays out like a core tab:
the icon above the label, with the label in its own `<span>`.

Give the tab an `icon` and keep the `label` to a single short word. Tabs share the strip's width, so a
longer label wraps inside its own line box — and with no icon above it, the first line sits on the icon
row and the tab reads as misaligned against every core tab beside it. Every core tab is one word with an
icon; matching that is what makes yours look native.

## Saving

There is no `save` callback, and none is needed. Foundry's own Scene Config form submission writes
any input named `flags.<moduleId>.<path>` onto the scene document, so naming your inputs correctly is
the whole of persistence:

```html
<input type="checkbox" name="flags.my-module.terrain.rocky" />
```

Your tab's inputs are part of the sheet's form whether or not the tab is the visible one, so any save
submits them — including a save made from a core tab by someone who never opened yours.

### Checkbox groups submit a null per unchecked box, not an empty array

Several checkboxes sharing one `name` are the natural way to express a multi-select, and they do not
behave the way either obvious guess suggests. `form.elements.namedItem(name)` returns a `RadioNodeList`,
so `FormDataExtended` maps over every element
(`client/applications/ux/form-data-extended.mjs:178-181`), and a checkbox carrying a `value` attribute
yields `field.checked ? field.value : null` (`:191-196`). Twelve boxes with none ticked therefore submit
an array of twelve `null`s — the key is present, and the value is neither `[]` nor absent.

That matters because `null` does not survive a round trip as nothing. `String(null)` is `"null"`, which
is truthy, so the common normalizer shape `list.map(String).filter(Boolean)` turns the array into the
literal string `"null"` repeated once per box — data that looks populated and matches nothing. Filter for
the values you expect rather than for truthiness:

```js
const selected = (Array.isArray(raw) ? raw : []).filter(v => typeof v === 'string' && VOCABULARY.includes(v));
```

## The render callback must be synchronous

`render` runs inside a render hook. Foundry v13 replaces every template part on each render pass
(`HandlebarsApplicationMixin#_replaceHTML` calls `priorElement.replaceWith`), so an `await` inside the
callback lets a later pass detach the nav and body nodes captured beforehand. The tab then lands on
orphaned DOM and is absent, with nothing thrown and nothing logged.

Cache anything the callback needs — settings, compendium lookups, derived lists — before the sheet
opens, and read from that cache inside `render`.

A callback that throws, or returns anything other than a string, is skipped with a console message.
Other modules' tabs on the same sheet are unaffected.

## Registration rules

A registration is rejected, returning `false` with a console message, when `tabId` is not a non-empty
string, `tabData` is not an object, `render` is not a function, or `label` is not a non-empty string.

An id already registered by a *different* module is refused rather than overwritten — a silent
overwrite would make the first module's tab vanish while its own registration call still reported
success. Re-registering your own tab is allowed, and replaces your previous entry.
