# ApplicationV2 Traps

**Audience:** anyone in the suite writing or debugging a window.

Foundry v13 ApplicationV2 behaviours that are correct, documented nowhere obvious, and produce
symptoms that point at the wrong thing. Each entry below cost a real session.

The common thread: **none of these look like what they are.** A listener bug presents as a dialog
bug, a scroll bug presents as a rendering bug, and dead-looking code turns out to be live. Recognising
the symptom is most of the fix.

---

## 1. A redraw replaces the contents, not the element

**`this.element` survives a re-render. Everything inside it does not.**

So anything bound to the root in `_onRender` accumulates one copy per render, while anything bound to
inner markup goes away with the node it was on.

**The symptom is not "an event fires twice".** In the case that found this, a delete confirmation
appeared to pop up twice, and it was actually two handlers, the second offering to delete the entry
the first had just re-selected onto. It reads as a broken dialog. Three sites in Squire had it.

Bind to inner markup and there is nothing to guard. Where you must delegate from the root, **guard on
the ELEMENT, not a boolean**:

```js
if (this._delegationBoundTo === root) return;
this._delegationBoundTo = root;
root.addEventListener('click', handler, true);
```

A boolean is correct right up until the frame is genuinely replaced, and then it never rebinds. That
fails in the direction that looks like "the buttons stopped working", which is a worse symptom than
the one it was guarding against. Storing the flag on the node itself (`root.dataset.somethingBound`)
works equally well and rebinds for free, because a replaced element arrives without the attribute.

---

## 2. Scroll restoration is a bag, and it happens after layout

`BlacksmithWindowBaseV2.render` saves scroll offsets, renders, and restores them inside
`requestAnimationFrame`. Two things follow.

**The base handles ONE element** -- the template body. A second scroller nested inside it is invisible
to that selector. Add yours by overriding and extending the bag:

```js
_saveScrollPositions() {
    const saved = super._saveScrollPositions?.() ?? {};
    return { ...saved, rail: this.element?.querySelector('.my-rail')?.scrollTop ?? 0 };
}
```

`super` ignores keys it did not write, so several scrollers cost one override and no coordination.

**Do not restore scroll yourself in `_onRender`.** The base restores after layout; a synchronous write
in `_onRender` happens before it and is one reflow away from being silently discarded. A window that
did this worked by luck for weeks.

---

## 3. Grepping a method name does not find calls on `this`

`_saveScrollPositions` and `_restoreScrollPositions` look dead. They are called from `render()` as
`this._saveScrollPositions()`, and the subclass versions are polymorphic overrides reached through
that call.

A session read them as vestigial, wrote a workaround beside the API instead of into it, and proposed
deleting them.

**Before deleting anything that looks unused, search for the bare method name without a receiver**, and
check the base class. This is worse in a class hierarchy than in plain modules, because the caller and
the definition are in different files by design.

---

## 4. A stack line number that does not match the current source means the runtime is stale

Foundry does not hot-reload module scripts. A session read post-fix source against a pre-fix runtime,
concluded the fix had regressed, and wrote a detailed and entirely wrong analysis.

**The tell is cheap and worth taking every time**: if the stack says `window-build.js:222` and the
current file has that call at 239, the browser is running yesterday's code. An F5 clears it; no Setup
round trip is needed unless `module.json` changed.

Also worth knowing: Foundry's "Detected N packages" line lists **everything in the load graph**, not
everything in the stack. Read the frames, not the badge.
