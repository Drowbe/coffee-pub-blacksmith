# Dialog API

**Audience:** module authors who need a confirmation, a choice, or a short prompt, and Blacksmith contributors.

Four helpers over Foundry's `DialogV2` with one dismissal contract, shared styling, and consistent promise results. Internal design notes live in the header comment of `scripts/api-dialog.js`.

Access it at `game.modules.get('coffee-pub-blacksmith').api.dialog`.

## The dismissal contract

Every helper resolves on dismissal. None rejects.

| Dismissal | Resolves |
|---|---|
| Escape | `closeValue` |
| Title-bar close button | `closeValue` |
| Explicit Cancel button | `cancelValue` |

`confirm` does not distinguish close from cancel: both resolve `closeValue`, which defaults to `false`.

A helper rejects only when a consumer callback throws in a way it cannot present, or on a framework error. Passing no buttons to `wait`, or no choices to `choose`, throws.

This contract is the reason to use these helpers instead of `DialogV2` directly: the raw statics reject when the dialog is dismissed unless `rejectClose: false` is passed.

## Content

Every helper takes `content` as `string | HTMLElement | Promise<string | HTMLElement>`.

A string is passed to DialogV2, which sanitizes it with `foundry.utils.cleanHTML`. An `HTMLElement` is passed as a node, so its identity and any listeners attached to it survive and nothing is sanitized away — use this when content must stay literal rather than be parsed as markup, as `utility-common.js:808` does for a copyable snippet. A node that is not a `div` is wrapped in one, because that is the type DialogV2 accepts.

Render your own Handlebars first and pass the result. These helpers do not load templates.

Do not wrap content in a `<form>`. DialogV2 already renders one around it, and `getValue` receives that form.

## `confirm(options)`

Resolves `boolean`.

```javascript
const confirmed = await blacksmith.dialog.confirm({
    title: 'Delete Pin',
    content: '<p>Delete <strong>Old Well</strong>? This cannot be undone.</p>',
    confirmLabel: 'Delete Pin',
    confirmIcon: 'fa-solid fa-trash',
    destructive: true
});
```

| Option | Default | Behavior |
|---|---|---|
| `title` | `''` | Frame title. |
| `content` | `''` | See Content. |
| `confirmLabel` / `confirmIcon` | Foundry's Yes | Confirm button. |
| `cancelLabel` / `cancelIcon` | Foundry's No | Cancel button. |
| `destructive` | `false` | Critical styling on the confirm button. |
| `defaultAction` | `'cancel'` | Which button is focused: `'cancel'` or `'confirm'`. |
| `closeValue` | `false` | Resolved on any dismissal. |
| `modal` | `true` | |
| `classes` | `[]` | Extra classes on the dialog root. |
| `position` | Foundry default | |

## `choose(options)`

One choice from several. Resolves `{ action, value, result }` where `value` is the chosen `id`.

```javascript
const outcome = await blacksmith.dialog.choose({
    title: 'Delete Pins',
    content: '<p>Choose which pins to delete.</p>',
    choices: [
        { id: 'scene', label: 'Current Scene', icon: 'fa-solid fa-map' },
        { id: 'all', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true }
    ],
    closeValue: null
});
if (outcome.action === 'submit') applyScope(outcome.value);
```

Each choice accepts `{ id, label, icon, description, disabled, destructive, default, callback }`. `description` renders as the button's tooltip. `callback` receives the choice `id`; its return value becomes `result`.

`showCancel` (default `true`) adds a Cancel button resolving `{ action: 'cancel', value: cancelValue }`.

## `prompt(options)`

Collect and validate one value. Resolves `{ action, value, result }`.

**A rejected value reopens the dialog.** DialogV2 has no supported way to stay open once a button is clicked, so validation is a reopen loop rather than an in-place error. The message is prepended to the content on the next attempt.

To preserve what the user typed across a reopen, pass `content` as a function. It receives `{ value, error, attempt }` — `value` is the previous input, `null` on the first attempt. The message banner is rendered by the helper either way; the function only needs to pre-fill.

```javascript
const outcome = await blacksmith.dialog.prompt({
    title: 'New Profile',
    content: ({ value }) => `
        <div class="blacksmith-field">
            <span class="blacksmith-field-label">Profile name</span>
            <input type="text" name="profile" class="blacksmith-input" value="${value ?? ''}">
        </div>`,
    submitLabel: 'Save',
    focusSelector: '[name="profile"]',
    getValue: root => root.elements.profile.value.trim(),
    validate: value => value ? null : 'Enter a profile name.',
    cancelValue: '',
    closeValue: ''
});
```

| Option | Behavior |
|---|---|
| `getValue(root)` | Collects the value. `root` is the submit button's owning form, so `root.elements.foo.value` works. Called once per attempt. |
| `validate(value)` | Return a string to reject: the dialog reopens carrying that message. Return `null` to accept. |
| `onSubmit(value)` | Optional async work. Throwing reopens the dialog with the error message. Its return value becomes `result`. |
| `submitLabel` / `submitIcon` | Defaults `OK` and a check icon. |
| `focusSelector` | Focused on each render. |
| `maxAttempts` | Reopen ceiling, default `10`, so a validator that can never pass cannot loop forever. On exhaustion the result is `action: 'close'` and the last message goes to `ui.notifications`. |

## `wait(options)`

Custom buttons with the same dismissal contract. Use it when the other three do not fit.

```javascript
const outcome = await blacksmith.dialog.wait({
    title: 'Token move request',
    content: '<p>Allow this move?</p>',
    buttons: [
        { action: 'no', label: 'No', icon: 'fa-solid fa-xmark' },
        { action: 'yes', label: 'Allow', icon: 'fa-solid fa-check', default: true, callback: async () => approve() }
    ],
    closeValue: null
});
```

Each button accepts `{ action, label, icon, default, destructive, disabled, callback }`. `callback` receives the dialog's form element and its return value becomes `result`. `value` in the result is the button's `action`. An action named `cancel` resolves `action: 'cancel'`.

Consumer callbacks in `choose` and `wait` run **after** the dialog has closed — the form element is captured beforehand and handed to you, so read what you need from it rather than expecting a live dialog. This is deliberate: it keeps the helpers independent of whether DialogV2 awaits a button callback.

Unlike `prompt`, `wait` does not loop: a throwing callback rejects, because only `prompt` owns a validation cycle.

## Behavior shared by all helpers

- Every helper routes through `DialogV2.wait()` with `rejectClose: false`, so dismissal resolves rather than throwing.
- Enter submits the default button, including from inside a text input — DialogV2 renders a real form.
- Validation messages render in a `blacksmith-dialog-error` banner at the top of the content.
- Styling comes from `styles/dialog.css` and the shared `blacksmith-window-btn-*` classes; dialogs carry the `blacksmith-dialog` class, plus `blacksmith-dialog-destructive` when a destructive action is present. Button classes, tooltips, and disabled state are applied from the `render` callback, because `class` and `disabled` are not DialogV2 button fields.
- A dialog closes as soon as a button is activated. Anything that needs to survive a failed operation and stay on screen wants a window, not a dialog.

## Result vocabulary

`choose`, `prompt`, and `wait` resolve the same shape. `api.dialog.ACTIONS` exposes the three action strings.

```javascript
{ action: 'submit', value, result }
{ action: 'cancel', value: cancelValue, result: undefined }
{ action: 'close',  value: closeValue,  result: undefined }
```
