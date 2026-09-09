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

## Settled on v14.367 — the Scene Config tab injector passed live

Removed from this file because they are proven, recorded here only so nobody re-runs them. Measured
2026-09-09 on Foundry 14.367 / dnd5e 5.3.3 with Blacksmith 14.1.0, against a real `SceneConfig`.

The sheet **was** restructured — v14 reports `basics / grid / levels / visibility / environment / misc /
footer`, so `lighting` and `ambience` are gone. The injector anchors on generic selectors, and both
anchors survived: `nav.sheet-tabs` matches (`class="sheet-tabs tabs top-tabs"`) and `footer.form-footer`
matches. It injects correctly:

- **Exactly one nav entry and one panel**, on first render, after a forced `render()`, and after switching
  tabs away and back. No duplication — so v14's async `_insertElement` does not defeat the guard.
- **The nav entry is an `<a>`, matching core's own `<a>` entries.** Note this contradicts the old
  `useButton` worry recorded here: v14's Scene Config nav children are `A`, not `BUTTON`, and our entry is
  built as the same element core uses. Nothing to change.
- **Clicking it activates the panel** — `tabGroups` becomes `{"sheet":"coffee-pub-blacksmith-geography"}`,
  the panel takes `.active`, and it is visible.
- **The save round-trips.** Toggling the Time of Day checkbox and submitting persisted
  `flags.coffee-pub-blacksmith.darknessFollowsClock` to the document; the value was restored afterwards, so
  the test scene is unchanged.

Artificer injects a tab into the same sheet and the two coexist — 8 nav entries, one each.

---

## Still owed: the injector in a POPPED-OUT Scene Config

The one item that could not be driven from a script, and the highest-risk of the three, because the
injector builds nodes with `document.createElement` against the **host** document while a detached window
is a different `document`. An element created in one document and inserted into another is the classic
failure, and nothing above exercises it.

**`detachWindow()` cannot be tested from a script.** Calling it left `app.element` null with no second page
appearing among the CDP targets — consistent with the browser blocking a `window.open` that has no user
activation behind it. This needs a human clicking the pop-out control; it is the same class of gap as
drag-and-drop into a popped-out window.

By hand:

1. Open any Scene Config, pop it out into its own window.
2. Confirm the Geography tab still appears **exactly once**, and that clicking it still shows the panel.
3. Toggle Time of Day and save from the popped-out window; confirm the flag persists.
4. Re-attach the window and confirm there is still exactly one tab.

Failure looks like: the tab missing entirely, appearing twice after re-attaching, or present but with an
empty panel.

---

## Not done, deliberately

`module.json` still reads `verified: "13"`. Bumping it is the author's call after his own pass over the
whole module — this file covers the darkness feature and the tab injector, not the other fourteen
subsystems.
