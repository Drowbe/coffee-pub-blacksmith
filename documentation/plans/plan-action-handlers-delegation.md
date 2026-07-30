# Plan: Fix `ACTION_HANDLERS` Delegation (Multi-Instance Dispatch)

**Status: Planned. Nothing implemented.**

`BlacksmithWindowBaseV2` dispatches `data-action` clicks to the wrong window when two instances of one
class are open. The defect is recorded for consumers in `known-issues.md` (Windows); this plan is the fix,
the migration, and the cross-module fallout.

Suite-wide notification and per-module ownership live in `TODO-GLOBAL.md` — this file covers Blacksmith's
own change.

## Root cause: the handler signature, not the static ref

`ACTION_HANDLERS` entries are invoked as `fn(event, target)` (`window-base.js:146`). **The instance is never
passed.** So every consumer has to invent its own instance lookup, and every invention so far is a singleton:

| Consumer | Invention |
|---|---|
| `window-toast-send.js:97`, `window-json-import.js:33` | `ClassName._ref` (the base's static) |
| `window-pin-layers.js:15` | module-level `let _bulkPinTagsWindowRef` |
| Minstrel | `MinstrelWindow._withWindow(cb)` |
| Bibliosoph | `MessagesWindow.current` |
| Squire codex | static methods reading `CodexWindow._ref` |
| Regent | a fork of the whole base, `_ref` included |

Six spellings of one workaround. That is the signal: **removing the static `_ref` fixes dispatch but not the
consumers** — each handler body still resolves a singleton and still gets the wrong instance. The contract
has to change, not just the plumbing.

Two mechanical faults follow from the same code:

1. `static _ref` is overwritten with `this` on every render (`:127`) and dispatch trusts it (`:135`), so the
   last-rendered instance receives every click. `_onClose` nulls it only when it points at the closing
   instance (`:163`), so closing the newer window leaves the older one's buttons dead until it re-renders.
2. The per-class `document` listener is added (`:133`) and **never removed** — one permanent listener per
   window class per session. `BlacksmithToolWindowBaseV2` inherits both (`window-tool-base.js:27`).

## Current real usage is small

Only **5 classes** set a non-null `ACTION_HANDLERS`: `window-json-import.js` (1), `window-pin-layers.js` (3),
`window-toast-send.js` (1) — 13 handler entries total. **11 classes set it to `null`** and bind their own
listeners; `window-pin-configuration.js:41` even carries the comment "No ACTION_HANDLERS — all listeners
attached directly in `_attachLocalListeners`". The shared mechanism is already the minority path, which is
why the migration is cheap.

## The fix: bind per instance, pass the instance

Rewrite `_attachDelegationOnce()` to bind on `this.element` with an instance-level guard, and delete
`static _ref` / `static _delegationAttached`:

```js
_attachDelegationOnce() {
    if (this._delegationBound) return;
    const handlers = this.constructor.ACTION_HANDLERS;
    if (!handlers || typeof handlers !== 'object') return;
    const root = this.element;
    if (!root) return;
    this._delegationBound = true;
    root.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-action]');
        if (!btn || !root.contains(btn)) return;
        const fn = handlers[btn.dataset.action];
        if (typeof fn !== 'function') return;
        e.preventDefault?.();
        fn.call(this, e, btn, this);
    }, true);
}
```

The instance is passed **both** as `this` and as a third argument, so the existing arrow-function handler
style migrates with a one-line edit instead of being rewritten as `function`:

```js
// before
'toast-send': () => ToastSendWindow._ref?._send(),
// after
'toast-send': (e, t, win) => win._send(),
```

`_onFirstRender` already calls `_attachDelegationOnce()` (`:153`) and `this.element` exists by then, so the
call sites do not move. The instance guard covers the second call from `activateListeners` (`:169`).

### Why per-instance rather than a document listener plus an instance registry

`api-window.md:425-426` justifies document-level delegation on the grounds that Application V2 injects body
parts late and `activateListeners` may not receive the body part. That is true but does not require
*document* level: `this.element` is the **frame**, created by `_renderFrame` before parts render and
retained across part re-renders, so a listener on it catches late-injected body content. Binding there also
disposes with the element, which removes the leak in fault 2.

The alternative — keep one document listener and resolve the instance per click via
`foundry.applications.instances.get(frame.id)` (available in v13; already used at
`manager-journal-tools.js:74`) — works, but needs an `app.constructor.ACTION_HANDLERS === handlers` guard so
a parent and child class with different handler maps do not both fire. More moving parts, no benefit.

### Back-compat

Keep assigning `Ctor._ref = this` for one release, marked deprecated. Unmigrated consumers then behave
exactly as they do today — still singleton-bound, but nothing newly broken — so sibling migrations need not
land with this change. Remove the assignment once the siblings have migrated.

## Blacksmith migration

- Rewrite `_attachDelegationOnce()`; delete `static _ref` and `static _delegationAttached` (keep the `_ref`
  write per Back-compat).
- Migrate 13 handler entries across `window-json-import.js`, `window-pin-layers.js` (3 classes),
  `window-toast-send.js` to the passed instance.
- `window-pin-layers.js` additionally drops its three module-level refs (`:14-16`) if nothing else reads
  them.
- `window-toast-send.js:111` sets `ToastSendWindow._ref = this` in its own constructor; remove once its
  handlers take the instance.
- Update `api-window.md`: the `ACTION_HANDLERS` mention at `:236`, and the Application V2 delegation guidance
  at `:425-426`, which currently prescribes the document-level pattern this plan replaces.

## Verification

No test framework; every check is live. **The critical case has no existing coverage** — nothing in
Blacksmith opens two instances of one window class, which is exactly why this shipped broken.

| Check | How |
|---|---|
| Two instances dispatch independently | Construct two `JsonImportWindow` instances with explicit distinct `id` options, open both, and confirm each window's buttons act on **its own** content. Repeat after closing the newer one — the older window's buttons must still work (today they go dead). |
| No regression in normal single-instance use | Exercise every migrated action: the importer's tab/copy/save/select/validate/import path, all three pin-layers windows, and the toast-send window's send/cancel/browse/clear/icon/template/preview actions. |
| Late-injected body content still handled | Confirm actions in body parts that render after the frame still fire — that is the property the document-level listener existed for. |
| Listener does not leak | Open and close a window with handlers ten times; confirm no accumulating click listeners on `document` and that the window still responds. |
| Tool base inherits the fix | Repeat the two-instance check on a Tool-base subclass, since `BlacksmithToolWindowBaseV2` shares the mechanism and Squire's transfer tool will be the first real multi-instance Tool consumer. |

## Sequencing

This is **not** a prerequisite for `api.dialog`, and `api.dialog` has a far wider audience (see the suite
dialog migration in `TODO-GLOBAL.md`). Ship `api.dialog` first. This fix must land before Squire's transfer
tool, because that tool is the first deliberate multi-instance consumer in the suite.

## Cross-module fallout

Summarized here, owned in `TODO-GLOBAL.md`:

- **Regent** forked the base rather than subclassing it (`regent-window-base-v2.js:11`, an independent
  `HandlebarsApplicationMixin(ApplicationV2)` subclass carrying its own copy of the broken delegation). A
  Blacksmith fix does not reach it.
- **Squire** has a live multi-instance consumer and needs the migration, not just the base fix.
- **Minstrel** uses the pattern; multi-instance exposure unconfirmed.
- **Curator** has no `ACTION_HANDLERS` but hand-rolls the same singleton for its own listeners.
- **Bibliosoph** is a deliberate singleton and is safe as written.
