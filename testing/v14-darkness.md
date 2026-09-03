# Testing: does the darkness driver survive Foundry v14? (owed, 2026-09-03)

**Audience:** us.

Scope: the core couplings behind `scripts/manager-darkness.js`, `scripts/ui-scene-geography.js` and
`scripts/manager-scene-config.js`. Transitional — see the testing rules in `CLAUDE.md`.
**Remove an item when it passes rather than ticking it, and delete this file when it is empty.**

Results go to the relevant `CHANGELOG.md` entry, not back into this file.

---

## Settled on v14.364 — the schema probe passed on a live test server

Removed from this file because they are proven, recorded here only so nobody re-runs them:
`environment.darknessLock` is unchanged (**not** the `darknessLevelLock` that Foundry's own API docs claim
for *both* generations — the typedef is wrong in v13 and v14 alike, so **do not settle a schema field name
from foundryvtt.com/api**); the `animateDarkness` update option is still read on update;
`canvas.effects.animateDarkness` is still a function; the lock still strips `darknessLevel` pre-update; and
`Level` carries **no environment**, so Scene Levels does not supersede scene-wide darkness.

The line numbers in `manager-darkness.js` and `architecture-worldclock.md` are now stamped `v13.351`. The
claims were re-verified; the pointers were not, and have certainly moved.

---

## Still owed: the Scene Config tab injector on v14

Nothing here is about darkness — the driver is clear. It is about `manager-scene-config.js`, which the
Geography tab (and its Time of Day checkbox) rides on.

**The sheet was restructured.** v13 parts were `tabs / basics / grid / lighting / ambience / footer`.
v14.364 reports `tabs / basics / grid / levels / visibility / environment / misc / footer`: `lighting` and
`ambience` are gone, `environment` replaces them, and `levels`, `visibility` and `misc` are new. The
injector anchors on generic selectors rather than tab ids, and `tabs` and `footer` both survive — so it
*should* be fine. It has never been rendered against this sheet.

### Probe: open any Scene Config on v14, then run this

```js
const app = [...foundry.applications.instances.values()].find(a => a.constructor.name === 'SceneConfig');
const root = app?.element;
const nav = root?.querySelector('.sheet-tabs[data-group], .tabs[data-group], .sheet-tabs, .tabs, nav.tabs');
console.log('SceneConfig found:', !!root);
console.log('nav selector matches:', !!nav, nav?.className);
console.log('nav children are:', nav?.firstElementChild?.tagName);
console.log('footer.form-footer matches:', !!root?.querySelector('footer.form-footer'));
console.log('tab panels:', [...(root?.querySelectorAll('.tab[data-tab]') ?? [])].map(e => e.dataset.tab).join(', '));
console.log('OUR TAB PRESENT:', !!root?.querySelector('[data-tab="coffee-pub-blacksmith-geography"]'));
console.log('our panel present:', !!root?.querySelector('.tab[data-tab="coffee-pub-blacksmith-geography"]'));
console.log('Time of Day box:', !!root?.querySelector('[name="flags.coffee-pub-blacksmith.darknessFollowsClock"]'));
console.log('tabGroups:', JSON.stringify(app?.tabGroups));
```

`OUR TAB PRESENT: false` with `nav selector matches: true` means the anchors are fine and the injection
logic is not; `nav selector matches: false` means the selector list in `SceneConfigManager.injectTabs`
needs a v14 entry. `nav children are:` decides `useButton` — if it is no longer `BUTTON`, the nav entry is
built as the wrong element and will not be styled or clickable as a tab.

### Then, by hand

1. **Save the sheet.** Confirm the Geography values and the Time of Day box round-trip. v14 deprecates the
   `-=` / `==` update operators for `DataFieldOperator` values; nothing here uses them, but flag writes go
   through the same submit path.
2. **Pop the Scene Config out into its own window** — new in v14. The injector builds nodes with
   `document.createElement` against the *host* document and uses `CSS.escape`; a detached window is a
   different `document`, and an element created in one and inserted into another is the classic failure.
   Confirm the tab still appears, and that switching to it still shows the panel.
3. **Check the tab does not duplicate.** ApplicationV2's `_insertElement` is async in v14, which changes
   render-pass timing — exactly what the "both halves present means this pass is done" guard depends on.
   Switch tabs back and forth and re-render the sheet; there must be exactly one Geography tab and one
   panel.

---

## Not done, deliberately

`module.json` still reads `verified: "13"`. Bumping it is the author's call after his own pass over the
whole module — this file covers the darkness feature and the tab injector, not the other fourteen
subsystems.
