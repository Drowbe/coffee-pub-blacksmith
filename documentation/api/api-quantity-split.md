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
| `attach(root)` | Wire the input. `root` is any ancestor of the markup. Releases a previous binding first, so it is safe to call on every render, and it re-syncs the DOM to the controller's value. |
| `getValue()` | The Give amount. |
| `getKeep()` | The Keep amount. |
| `setValue(n)` | Set Give, clamped into range. Does not fire `onChange`. |
| `destroy()` | Release the input listener. Idempotent. Call it from your window's `_onClose`. |
| `min`, `max`, `inputName` | As resolved. |

The value is always an integer within `[min, max]`, whatever a host passes or a user does — reading `getValue()` needs no defensive clamping.

## Reading it without the controller

The rendered input is a plain `<input type="range">` carrying `inputName`, so a host that prefers form APIs can read it directly:

```javascript
Number(root.elements['transfer-quantity'].value)
```

`getValue()` is preferable — it is integer-clamped and does not depend on the DOM still being present — but the form path exists for hosts already collecting a whole form at once.

## Accessibility

The slider carries `amountLabel` as its accessible name and an `aria-valuetext` of the form `Give 3, Keep 4`, so assistive technology announces the split rather than a bare number. Both outputs are associated with the input through `for`. Keyboard interaction is the platform's — arrows, Home, End, Page Up/Down — because this is a real range input rather than a custom widget.

## Styling

Rules live in `styles/window-form-controls.css` on `blacksmith-quantity-split` and its `-value` / `-caption` parts. Surfaces read `--blacksmith-tool-*` with fallbacks, so a control hosted in a Light, Dark, or Glass Tool window inherits that shell instead of painting its own.

## Provenance

The interaction and styling were contributed by Squire rather than reconstructed from a description, so the existing Give/Keep experience is preserved exactly. Blacksmith owns the naming, the markup contract, the CSS, and the controller.
