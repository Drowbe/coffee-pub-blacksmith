# CSS Traps

**Audience:** anyone in the suite debugging a stylesheet that "isn't loading".

Two failure modes that every module in the suite is equally exposed to, because every module loads its
CSS the same way: `module.json` declares one root stylesheet, and everything else reaches the browser
through an `@import` chain from it.

The common thread with the ApplicationV2 traps is the same: **every diagnostic reports success while
the screen does not change.** Both entries below cost a real session, and the first one produces false
alarms rather than false negatives — it will tell you a working stylesheet is missing.

---

## 1. `document.styleSheets` does not contain `@import`ed files

This is the one-liner everyone reaches for first, and it is wrong:

```js
// WRONG -- returns 0 for a stylesheet that is fully loaded and applying
[...document.styleSheets].map(s => s.href).filter(h => h && /mymodule/.test(h))
```

`document.styleSheets` holds only the **top-level** sheets: `<link>` elements and `<style>` blocks. A
file pulled in by `@import` is **not** an entry there. It hangs off the importing sheet as a
`CSSImportRule`, and the imported sheet is at `rule.styleSheet`.

Because the whole suite loads CSS through a `default.css` import chain, that filter reports **all
fifteen modules as missing their stylesheets**, whether or not anything is actually wrong. Regent hit
this 2026-09-09 debugging a panel that turned out to be styled correctly the entire time.

Walk the tree instead:

```js
const walk = (sheet, path = []) => {
    let rules;
    try { rules = [...sheet.cssRules]; } catch { return; }   // cross-origin sheet
    const here = path.concat(sheet.href ?? '<inline>');
    for (const rule of rules) {
        if (rule instanceof CSSImportRule) {
            if (rule.styleSheet) walk(rule.styleSheet, here);
            else console.warn('FAILED TO LOAD:', rule.href, 'imported by', here.at(-1));
        }
    }
};
[...document.styleSheets].forEach(s => walk(s));
```

**`rule.styleSheet === null` on a `CSSImportRule` is the real "this file did not load" signal.** An
empty href filter is not evidence of anything.

To answer "did my rule reach the cascade", search the walked tree for the selector rather than
checking for the file — a rule present in the CSSOM with the values you authored settles it:

```js
const collect = (sheet, acc = []) => {
    let rules;
    try { rules = [...sheet.cssRules]; } catch { return acc; }
    for (const rule of rules) {
        if (rule instanceof CSSImportRule && rule.styleSheet) collect(rule.styleSheet, acc);
        else if (rule.selectorText?.includes('my-class')) acc.push([rule.selectorText, rule.style.cssText]);
    }
    return acc;
};
```

Related: `node tools/check-styles-loaded.mjs` catches the static half of this offline — a file on disk
that no `@import` reaches, and an `@import` naming a file that does not exist. It cannot tell you
whether a rule applied at runtime, which is what the walk above is for.

## 2. Black on black: the rule applies and nothing changes

A low-alpha dark overlay on an already-dark parent is **arithmetically invisible**, and every
diagnostic you have will report success:

- `getComputedStyle` returns the authored value
- the rule is present in the CSSOM
- nothing overrides it
- the screen does not change

`rgba(0, 0, 0, 0.1)` composited over `rgb(0, 0, 0)` is `rgb(0, 0, 0)`. A `border-radius` on an
invisible fill shows nothing either. The instinct on seeing no change is to make the tint *stronger* in
the same direction, which cannot work: **nothing darkens black.**

Foundry's own chrome is dark, and suite windows are darker still, so this is the common case rather
than the odd one. For a raised panel on a dark ground, use a low-alpha **white** overlay, or a border,
or an inset shadow. Regent's Character worksheet hit this 2026-09-09 with eleven fills at once; all
eleven were correct CSS, and flipping them to white at their original alphas fixed every one.

**The generalisable check: before concluding a rule did not land, read the computed backgrounds of the
ancestor chain, not just the element.**

```js
let node = document.querySelector('.my-panel');
while (node && node !== document.body) {
    console.log(node.id || node.className, getComputedStyle(node).backgroundColor);
    node = node.parentElement;
}
```

One caveat on evidence, worth stating because it applies to both entries: computed styles resolve
whether or not an element is painted. An element inside a hidden panel reports its full cascade while
measuring `0x0` with a null `offsetParent`. That is still authoritative about the cascade — but it is
not the same as having seen the thing on screen, and it is worth saying which kind of evidence you
have when you report a result.
