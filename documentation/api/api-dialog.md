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

A string is passed to DialogV2, which sanitizes it with `foundry.utils.cleanHTML`. An `HTMLElement` is not sanitized: DialogV2 reads its `innerHTML` and keeps that markup as it stands (`foundry.mjs:57177`). Pass a node when the content must survive literally rather than be cleaned, as `utility-common.js:808` does for a copyable snippet.

Any node you pass is moved into a fresh wrapper `div`. DialogV2 rejects a content element that carries **any** attributes, so a `<div class="my-thing">` handed over directly would throw. Wrapping means you can put whatever attributes you like on your own element, because they end up as markup inside the wrapper rather than attributes on it.

Passing a node does not preserve the node. DialogV2 serializes it and builds the dialog from that markup, so the element you handed over is never inserted, and anything bound to it beforehand is bound to something the user never sees. The failure is silent - the markup renders and inputs still report values, so a control bound early looks alive while reporting only its initial state. Bind after the dialog renders instead: `controls` for anything with an `attach` method, `onRender` for everything else.

Render your own Handlebars first and pass the result. These helpers do not load templates.

Do not wrap content in a `<form>`. DialogV2 already renders one around it, and `getValue` receives that form.

## Controls

`choose`, `prompt`, and `wait` take `controls`: one controller, or an array of them, bound to the dialog root after every render. Anything exposing `attach(root)` qualifies, which includes `api.entityList` and `api.quantitySplit`.

```javascript
const quantity = blacksmith.quantitySplit.create({ max: stack });

const { action, value } = await blacksmith.dialog.prompt({
    title: 'How many?',
    content: quantity.html,
    controls: quantity,
    getValue: () => quantity.getValue()
});
```

This is the only way such a control works inside a dialog, for the reason under Content.

`prompt` re-attaches on every attempt, since a rejected value reopens the dialog as fresh markup. Attaching twice is safe: `attach` releases its previous binding first.

Controls are not destroyed when the dialog closes, so a button callback can still read a value out of one after the fact.

Read them with `readFrom(element)` rather than `getValue()` / `getSelection()`. Those depend on binding having succeeded and report the control's initial value when it has not, which is a plausible answer rather than an obviously wrong one. A control that binds nothing now logs a warning naming its `inputName`, so the case is at least visible; reading from the DOM makes it harmless.

`onRender(element, dialog)` runs after every render and covers anything `controls` does not - it receives the dialog's root element.

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
| `modal` | `destructive` | Modal only when `destructive` is true. See Modality. |
| `classes` | `[]` | Extra classes on the dialog root. |
| `position` | Foundry default | Pass `width` to size the dialog yourself. Doing so opts out of the width cap -- see Width. |

## Width

**A dialog you do not size is capped; a dialog you do size is left alone.**

ApplicationV2 defaults to `width: "auto"`, and an auto-width frame sizes to its content. For a
paragraph of prose that means the viewport: a two-sentence question rendered as a single 1240px line,
which reads as a broken dialog rather than a wide one. Every helper here therefore adds
`blacksmith-dialog-autowidth` when the caller named no width, and `styles/dialog.css` caps that class at
`--blacksmith-dialog-max-width` (560px), or the viewport when the viewport is narrower.

The cap is class-gated rather than applied to every Blacksmith dialog because a numeric width is written
as an inline `style.width`, which `max-width` would override -- a blanket cap would silently shrink the
dialogs that had deliberately asked to be wide. **If you want a wider dialog, pass
`position: { width: 800 }`** and the cap does not apply to you.

Content wider than the measure -- a table, a `<pre>` -- scrolls inside the dialog rather than pushing the
frame back out.

## Modality

**Dialogs are not modal by default.** `confirm` is the single exception: it defaults to
`modal: destructive`, so a destructive confirmation is modal and an ordinary one is not.

A modal dialog calls `<dialog>.showModal()`, which places it in the browser's top layer behind an inert
backdrop, and every element behind it stops receiving events. That is correct for a question that must be
answered before anything else happens. It is wrong for a value prompt raised from a window that is already
open, because the window that asked is part of what gets frozen - a quantity slider should not freeze the
loot window it belongs to.

Pass `modal: true` when the question genuinely must block everything. Every function accepts it.

Two things follow for consumers. A prompt raised from inside your own window should keep the default, so the
window stays usable behind it. And a confirmation that deletes something should pass `destructive: true`,
which both styles the button and makes the dialog modal - two things you want together, from one flag.

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

## `pickActor(options)`

```js
const uuid = await blacksmith.dialog.pickActor({
  title: 'Who is buying?',
  actors: game.actors.filter(a => a.hasPlayerOwner)
});
if (uuid) { /* ... */ }
```

| Option | Meaning |
|---|---|
| `title` | Dialog title. Defaults to `Choose an Actor`. |
| `actors` | Actors, or `{ uuid, name, img }` descriptors. Entries without a `uuid` are dropped. |
| `confirmLabel` / `confirmIcon` | The submit button. Default `Select` and a check. |
| `emptyMessage` | Shown instead of a list when `actors` is empty; resolves `null`. |
| `autoPickSingle` | Resolve immediately when there is exactly one actor, with no dialog. Default `false`. |
| `modal`, `classes` | As elsewhere. |

**Returns a UUID string, or `null`** on cancel, close, or an empty list. A UUID rather than an Actor so the
result is serialisable and cannot go stale across the await -- resolve it with `fromUuid` when you need the
document.

Built on `api.entityList` in single mode, so rows carry portraits. `choose` cannot: it renders each option as
a DialogV2 button and passes `icon` through as a CSS class, so a portrait is not expressible there.

`autoPickSingle` is off by default deliberately. Only the caller knows whether the pick is a formality or a
decision, and skipping a confirmation the caller asked for is a surprise.

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

Each button accepts `{ action, label, icon, default, destructive, disabled, callback }`. `callback` receives the dialog's form element and its return value becomes `result`. An action named `cancel` resolves `action: 'cancel'`.

> **Read the clicked button off `value`, not `action`.** The result's `action` is one of the three
> vocabulary strings below — for any button that is not the `cancel` one it is `'submit'`, whatever you
> named the button. The button's own `action` lands in `value`.
>
> ```javascript
> const { action, value } = await blacksmith.dialog.wait({ buttons: [{action: 'yes', ...}, {action: 'no', ...}] });
> if (action !== blacksmith.dialog.ACTIONS.SUBMIT) return;   // dismissed
> if (value === 'yes') { /* ... */ }                          // NOT `action === 'yes'`
> ```
>
> Testing `action === 'yes'` is false on a Yes and silently does nothing — the dialog opens, the user
> answers, and no branch runs. It cost a full round of live testing on the darkness prompt in 13.23.0.

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
