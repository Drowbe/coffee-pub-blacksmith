# Quantity Split API

**Audience:** module authors splitting a stack — how many to give, how many to keep.

A Give/Keep control built around a range input, for embedding in your own window or dialog. Internal design notes live in the header comment of `scripts/api-quantity-split.js`.

Access it at `game.modules.get('coffee-pub-blacksmith').api.quantitySplit`.

## What it is and is not

It renders the split and reports the number. It owns no submit, cancel, or close, no socket, no document mutation, and no opinion about what the number means. Bounds, labels, domain validation, and the operation itself are the host's.

**Keep is always `max - value`.** The control does not model a separate Keep input, because the two halves of a split are one number.

## Building one

`create(config)` returns a controller. Put its `html` into your markup, then call `attach(root)` once that markup is in the document — the same shape as `api.entityList`, so a window using both wires them the same way.

```javascript
const qty = blacksmith.quantitySplit.create({
    max: item.system.quantity,
    value: 1,
    inputName: 'transfer-quantity',
    onChange: ({ value, keep }) => updateSummary(value, keep)
});

// in getData / dialog content
bodyContent = `<div class="blacksmith-field">${qty.html}</div>`;

// after render
qty.attach(root);

// on submit
const giving = qty.getValue();
```

| Config | Default | Behavior |
|---|---|---|
| `max` | required | Stack size. Coerced to an integer, floored at `min`. |
| `min` | `1` | Smallest transferable amount. |
| `value` | `min` | Initial Give amount, clamped into range. |
| `inputName` | `'blacksmith-quantity'` | Input `name` and `id`. Set it to keep a form contract, or to host two controls in one form. |
| `giveLabel` / `keepLabel` / `amountLabel` | `Give` / `Keep` / `Transfer Amount` | Captions, and the accessible name of the slider. |
| `onChange` | none | `({ value, keep, min, max, sourceEvent }) => void`. **User changes only** — not on `attach` or `setValue`. |

## Controller

| Member | Behavior |
|---|---|
| `html` | Markup to inject. A getter — reflects the current value each time it is read. |
| `attach(root)` | Wire the input. `root` is any ancestor of the markup. Releases a previous binding first, so it is safe to call on every render, and it re-syncs the DOM to the controller's value. Returns the controller; read `attached` for whether it worked. |
| `attached` | `true` once `attach` has found its input, `false` once it has failed to, `null` before either. |
| `readFrom(root)` | The Give amount read out of the DOM. Correct whether or not binding succeeded. |
| `readKeepFrom(root)` | The Keep amount from the DOM. The counterpart to `readFrom`. |
| `getValue()` | The Give amount as the controller understands it. Depends on `attach` having bound the input. |
| `getKeep()` | The Keep amount. Same dependency as `getValue()`. |
| `setValue(n)` | Set Give, clamped into range. Does not fire `onChange`. |
| `destroy()` | Release the input listener. Idempotent. Call it from your window's `_onClose`. |
| `min`, `max`, `inputName` | As resolved. |

Both read paths return an integer within `[min, max]`, whatever a host passes or a user does, so neither needs defensive clamping.

## Reading the value: prefer readFrom

`getValue()` returns listener-maintained state, so it is only the user's answer if `attach` bound the input. An unbound control reports the value it was created with — a plausible number rather than an obviously wrong one, which is why this failure went unnoticed in two consuming modules until one of them measured it.

`readFrom(root)` reads the input out of the DOM, so it is right either way. Reading and binding are separate concerns and only binding can fail: `attach` exists for live behavior — moving captions, `onChange` — while `readFrom` answers "what does the control say right now", which the DOM can always answer.

```javascript
const giving = qty.readFrom(root);
```

Use `readFrom` at submit time. `getValue()` remains correct and convenient inside an `onChange` handler or anywhere you already know the control is bound, and `attached` lets you check rather than assume.

`getKeep()` carries the same dependency, being derived from the same state, and `readKeepFrom(root)` is its DOM counterpart. Prefer it to `max - readFrom(root)` by hand, which is where the clamp goes wrong.

An unbound control always reports the value it was created with, so unlike the entity list there is no version of this that merely goes quiet - it is always a plausible wrong number. When `attach` has been tried and failed, these getters log once.

The damage scales with how sensible your `value` is, which is the wrong way round. `value: max` is a reasonable default for a Take dialog, and it is also the worst thing to return unasked: an unbound read reports the whole stack, so "take 1 of 20" takes all twenty with nothing to show for it. `value: min` fails harmlessly by comparison. Do not respond by picking a worse default - use `readFrom(root)` and keep the sensible one.

The rendered input is a plain `<input type="range">` carrying `inputName`, so a host already collecting a whole form at once can also read it directly, which is what `readFrom` does internally:

```javascript
Number(root.elements['transfer-quantity'].value)
```

## Accessibility

The slider carries `amountLabel` as its accessible name and an `aria-valuetext` of the form `Give 3, Keep 4`, so assistive technology announces the split rather than a bare number. Both outputs are associated with the input through `for`. Keyboard interaction is the platform's — arrows, Home, End, Page Up/Down — because this is a real range input rather than a custom widget.

## Styling

Rules live in `styles/window-form-controls.css` on `blacksmith-quantity-split` and its `-value` / `-caption` parts. Surfaces read `--blacksmith-tool-*` with fallbacks, so a control hosted in a Light, Dark, or Glass Tool window inherits that shell instead of painting its own.

## Provenance

The interaction and styling were contributed by Squire rather than reconstructed from a description, so the existing Give/Keep experience is preserved exactly. Blacksmith owns the naming, the markup contract, the CSS, and the controller.
