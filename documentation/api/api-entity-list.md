# Entity List API

**Audience:** module authors who need the user to pick one or several actors, users, tokens, or party members.

A shared single- or multi-select entity list you embed in your own window or dialog. Internal design notes live in the header comment of `scripts/api-entity-list.js`.

Access it at `game.modules.get('coffee-pub-blacksmith').api.entityList`.

## What it is and is not

It renders rows and reports which are selected. It opens and closes nothing, submits no form, touches no socket, mutates no document, changes no ownership, and sends no notification. Eligibility, permission checks, and whatever the selection means are the host's.

Because it is embedded, it has no submit, cancel, or close, and therefore no `{ action: ... }` result. That vocabulary belongs to whatever owns the open/close lifecycle — `api.dialog` or your window. See `api-dialog.md`.

Rows are native `radio` (single) or `checkbox` (multi) inputs. Keyboard navigation, focus rings, group semantics, and screen-reader announcement come from the platform, and a multi-select list can be read with plain form APIs — which lets a host keep an existing form contract unchanged.

## Building one

`create(config)` returns a controller. Put its `html` into your markup, then call `attach(root)` once that markup is in the document.

```javascript
const list = blacksmith.entityList.create({
    entities: eligibleActors,
    mode: 'single',
    inputName: 'my-module-recipient',
    selected: currentId,
    onSelectionChange: ({ selected }) => updatePrimaryButton(selected.length > 0)
});

// in getData / content
bodyContent = `<div class="blacksmith-field">${list.html}</div>`;

// after render
list.attach(root);

// later
const [chosen] = list.getSelection();
```

| Config | Default | Behavior |
|---|---|---|
| `entities` | `[]` | Descriptors, see below. |
| `mode` | `'single'` | `'single'` or `'multi'`. `MODES.SINGLE` / `MODES.MULTI` are exposed. |
| `inputName` | `'blacksmith-entity'` | The inputs' `name`. Set it to preserve an existing form contract. |
| `selected` | `[]` | Pre-selected id or ids. Disabled entities are ignored; single mode keeps the first. |
| `itemClass` | `''` | Extra class on every row, for host skinning. |
| `listClass` | `''` | Extra class on the container. |
| `emptyMessage` | `'No entries available.'` | Shown when nothing renders. |
| `filter` | none | `(entity) => boolean`, applied before render. A throwing filter drops the row and logs. |
| `onSelectionChange` | none | `({ selected, changed, sourceEvent }) => void` |

## Entity descriptor

```javascript
{
    id,               // required
    uuid,             // optional, emitted as data-entity-uuid
    name,
    img,              // defaults to icons/svg/mystery-man.svg
    type,             // optional secondary line
    disabled,
    disabledReason,   // shown as a visible line and a tooltip
    badges,           // [{ label, variant }] or plain strings
    metadata,         // opaque, carried through untouched
    className         // extra class on this row only
}
```

Unrecognized keys are preserved: `getSelection()` returns your original objects, not copies, so you can carry a payload through.

## Controller

| Member | Behavior |
|---|---|
| `html` | Markup to inject. A getter — reflects the current selection each time it is read. |
| `attach(root)` | Wire change events. `root` is any ancestor of the markup. Releases a previous binding first, so it is safe to call on every render. Returns the controller; read `attached` for whether it worked. |
| `attached` | `true` once `attach` has found rows to read, `false` once it has not, `null` before either. |
| `readFrom(root)` | Selected entities read out of the DOM. Correct whether or not binding succeeded. |
| `readIdsFrom(root)` | The same, ids only. |
| `getSelection()` | Selected entities, as the descriptors you passed in. Depends on `attach` having bound a root. |
| `getSelectedIds()` | Selected ids only. Same dependency as `getSelection()`. |
| `setSelection(ids)` | Set the selection. Disabled entities are ignored; single mode keeps the first. |
| `destroy()` | Release the change listener. Idempotent. Call it from your window's `_onClose`. |
| `entities` | The entities actually rendered, after `filter`. |
| `mode`, `inputName` | As resolved. |

A disabled entity can never be selected, including through `selected` or `setSelection` — otherwise a host could read back a selection the user cannot clear.

## Reading the selection: prefer readFrom

`getSelection()` reads the rendered inputs once `attach` has bound a root. Without one it returns the selection the list was **created** with, which is indistinguishable from the user having chosen it. That is the trap: a host that never attached, or whose attach silently found nothing, gets back what it passed in and cannot tell.

`readFrom(root)` takes the root explicitly and reads the DOM, so it is right either way, and it never substitutes the initial selection - a container with no rows reports nothing selected, which is the truth.

```javascript
const [chosen] = list.readFrom(root);
```

Use `readFrom` at submit time. `getSelection()` remains correct and convenient inside an `onSelectionChange` handler or anywhere the list is known to be bound, and `attached` lets you check rather than assume.

Reading and binding are separate concerns and only binding can fail. `attach` exists for live behavior; reading the DOM does not need it.

`getSelectedIds()` carries exactly the same dependency as `getSelection()` - it is that read with a map over it. Reaching for ids rather than descriptors opts out of nothing.

### What a failed bind costs depends on what you passed as `selected`

The same defect produces two different failures, and which one you get is decided by your own config rather than by anything visible at the call site:

- **A list created with a selection lies.** `getSelection()` hands that selection back, and it is indistinguishable from the user having chosen it. A picker seeded with the current character returns the current character - so a user switches to someone else and is handed back the one they started on.
- **A list created empty goes quiet.** It returns nothing selected, so the operation simply does not happen.

Only the first is dangerous, and it is the one that seeding a picker with a sensible default produces. Reading through `readFrom(root)` removes both. When `attach` has been tried and failed, these getters log once naming which of the two applies.

## Providers

Convenience adapters that only shape data. None of them filter by permission; that is the host's job.

| Provider | Notes |
|---|---|
| `providers.fromUsers({ includeGM, activeOnly, disableOffline })` | Defaults: GMs excluded, offline users kept but disabled with an "Offline" reason and an `offline` row class. |
| `providers.fromActors({ type, playerOwnedOnly })` | Defaults to player-owned `character` actors. |
| `providers.fromTokens()` | Tokens on the current scene. |

```javascript
const list = blacksmith.entityList.create({
    entities: blacksmith.entityList.providers.fromUsers({ activeOnly: true }),
    mode: 'multi'
});
```

## Styling

Baseline rules are in `styles/entity-list.css` on `blacksmith-entity-list`, `blacksmith-entity`, and the `blacksmith-entity-*` parts. Selection styling follows `:has(input:checked)` rather than a JS-applied class, so it cannot drift from the inputs.

Surfaces read `--blacksmith-tool-*` with fallbacks, so a list hosted in a Light, Dark, or Glass Tool window inherits that shell instead of punching an opaque panel through it. Pass `itemClass` / `listClass` and skin on top for anything host-specific.
