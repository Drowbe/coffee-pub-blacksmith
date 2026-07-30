# Note to Regent: Delete the Forked Window Base

**From:** Coffee Pub Blacksmith
**Target:** `coffee-pub-regent/scripts/regent-window-base-v2.js`
**Status:** Ready to send. Blacksmith's fix is implemented and awaiting live verification.

## The short version

Regent carries its own copy of Blacksmith's Application V2 window base, and that copy contains a bug
Blacksmith has now fixed. Because it is a fork rather than a subclass, the fix does not reach Regent.

## What we found

`regent-window-base-v2.js:11` declares:

```javascript
export class RegentWindowBaseV2 extends HandlebarsApplicationMixin(ApplicationV2)
```

It is an independent 110-line reimplementation, not a subclass of Blacksmith's base, and it duplicates
`_getRoot()`, `static _ref`, `static _delegationAttached`, `_attachDelegationOnce()`, and the same
`document.addEventListener('click', ...)` block at `:83`.

## The bug in that code

`ACTION_HANDLERS` entries are invoked as `fn(event, target)` and never receive the window instance. Dispatch
therefore trusts `static _ref`, which every render overwrites with the most recently rendered instance. With
two instances of one window class open at once, a `data-action` click in **either** window is handled against
whichever rendered last. Closing the newer one nulls `_ref` and leaves the older window's buttons dead until
it re-renders.

`window-query.js:455` also sets `BlacksmithWindowQuery._ref = this` by hand, which is the same singleton
pattern and has the same failure mode.

There is a second, quieter fault: the per-class `document` listener is never removed, so it leaks one
permanent listener per window class per session.

Whether Regent can currently open two instances of one window class was not verified from here. If every
Regent window is effectively a singleton today, this is latent rather than live — but it is one
`randomID()`-per-instance change away from being live, and it fails silently when it does.

## What Blacksmith changed

`BlacksmithWindowBaseV2._attachDelegationOnce()` now binds **one listener per instance on the window frame**
instead of one per class on `document`, and invokes handlers as:

```javascript
fn.call(instance, event, target, instance)
```

So a handler reads the instance from its third argument (or `this`) and is correct with any number of
instances open. `static _delegationAttached` is gone. `static _ref` is retained only as a deprecated
compatibility shim for unmigrated consumers.

Binding on the frame rather than `document` is safe for the reason the document listener existed in the first
place: `this.element` is the frame, created before parts render and retained across part re-renders, so a
listener there still catches late-injected body content.

## What we would like Regent to do

**Preferred: delete the fork and subclass Blacksmith's base.**

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const Base = blacksmith.BlacksmithWindowBaseV2;   // or blacksmith.getWindowBaseV2()

export class RegentWindowBaseV2 extends Base { /* Regent-specific bits only */ }
```

Both base classes are exposed on `module.api` as soon as Blacksmith's module script has loaded — before
`init` and `ready` — provided Regent loads after `coffee-pub-blacksmith` in its manifest or declares it as a
dependency. Do not deep-link Blacksmith script files from Regent's manifest; `module.api` is the stable
contract, file paths are not. See `api-window.md`, "Availability timing".

Then migrate the handler bodies:

```javascript
// before
save: () => BlacksmithWindowQuery._ref?.save(),
// after
save: (event, target, win) => win.save(),
```

If the fork must stay for reasons we cannot see from here, apply the same two changes to it — per-instance
binding on `this.element`, and pass the instance to handlers — and drop the `_ref` reads in
`window-query.js`.

Note the class name: `BlacksmithWindowQuery` in Regent's own file is misleading now that the query tool lives
in Regent. Worth renaming while you are in there.

## Precedent

This is the same pattern as Curator shipping its own fork of HookManager, already tracked in Blacksmith's
`TODO-GLOBAL.md`. Forks of hub internals stop receiving hub fixes, and the divergence is invisible until
something breaks in production.

## Reference

- `api-window.md` — "`ACTION_HANDLERS` and the instance argument", and the base-class availability rules.
- `known-issues.md` under Windows — the consumer-side residue after the base fix.
