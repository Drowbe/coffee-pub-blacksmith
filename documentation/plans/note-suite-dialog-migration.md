# Note to the Suite: Migrate Legacy Dialogs to `api.dialog`

**From:** Coffee Pub Blacksmith
**Target:** Monarch, Squire, Curator, Bibliosoph, Artificer, Regent, Scribe
**Status:** Ready to send once a Blacksmith release containing `api.dialog` is published. Squire is already
engaged; Monarch is the module most affected and has not been contacted.

## Why you are getting this

Blacksmith now exposes `api.dialog` — four helpers over Foundry's `DialogV2` with one dismissal contract,
shared styling, and consistent promise results. If your module still uses Foundry's Application V1 `Dialog`,
migrate to `api.dialog` rather than porting to raw `DialogV2` independently, or the work gets redone.

Counted across the suite on 2026-07-30:

| Module | `DialogV2` | legacy `Dialog` |
|---|---|---|
| Squire | 0 | 22 |
| Monarch | 0 | 12 |
| Curator | 2 | 3 |
| Bibliosoph | 2 | 2 |
| Artificer | 1 | 2 |
| Regent | 0 | 2 |
| Scribe | 0 | 1 |
| Blacksmith | 20 | 0 |

Application V1 is deprecated in v13, and finishing the V2 migration for remaining dialogs is already named as
a v14 forcing function in Blacksmith's `plans/migration-v14.md`. So this is not only consistency work.

## What you get

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

const ok = await blacksmith.dialog.confirm({
    title: 'Delete Note',
    content: '<p>Delete this note?</p>',
    confirmLabel: 'Delete',
    confirmIcon: 'fa-solid fa-trash',
    destructive: true
});
```

`confirm`, `choose`, `prompt`, `wait`. `confirm` resolves a boolean; the others resolve
`{ action: 'submit' | 'cancel' | 'close', value, result }`.

**The contract worth migrating for: user dismissal never rejects.** Escape and the title-bar close resolve
`closeValue`, an explicit Cancel resolves `cancelValue`. Raw `DialogV2` statics reject when dismissed unless
`rejectClose: false` is passed, and that is the detail call sites get wrong.

`api-dialog.md` is the authoritative contract. Read it before porting; do not build from an earlier proposal.

## Three things a dialog cannot do

Verified against the v13 API docs, and stated here because all three were requested during design:

1. **Validation that keeps the dialog open.** DialogV2 has no supported way to stay open once a button is
   clicked. `prompt` therefore reopens with the message; pass `content` as a function
   `({ value, error, attempt }) => html` to preserve what the user typed.
2. **Buttons disabled while an async callback runs / duplicate submission prevented.** Not applicable — the
   dialog closes on activation. Consumer callbacks in `choose` and `wait` run after close and receive the
   form element captured beforehand.
3. **A failed operation leaving the dialog open with an error.** A dialog cannot.

The rule of thumb: **anything that must survive a failed operation and stay on screen wants a window, not a
dialog.** Blacksmith exposes `BlacksmithWindowBaseV2` for editors and forms and
`BlacksmithToolWindowBaseV2` for compact canvas utilities — see `api-window.md`.

## Not every dialog should become an `api.dialog` call

Some of your 22 or 12 are workflows that should be removed or unified instead of ported one-for-one. Squire's
breakdown is a good model: simple confirmations and choices to `api.dialog`; repeated quantity/recipient
flows into one reusable tool window; JSON imports onto Blacksmith's importer (`window-json-import.js`,
`registry-json-import-*.js`); duplicate export paths deleted; journal selection into one picker. Count what
genuinely remains before estimating.

## Shipping order

There is no version gate: your `requires` entry for Blacksmith carries a manifest URL and no
`compatibility.minimum`, and nothing version-checks the API at runtime. `api.version` is a hardcoded string
unrelated to `module.json` and must not be used for this.

So guard your call sites, and add a real floor if you depend on the API:

```javascript
if (!blacksmith?.dialog) { /* fall back, or warn */ }
```

```json
{ "id": "coffee-pub-blacksmith", "type": "module",
  "compatibility": { "minimum": "13.12.2" },
  "manifest": "..." }
```

Blacksmith's release only has to go out before or alongside yours — not before you start. For local
development both modules are in the same `Data/modules/`, so the API is live after a reload with no release
involved.

## Also worth knowing while you are in that code

`render` and `close` are **`DialogV2WaitOptions`** — options of the static `wait()` / `confirm()` / `prompt()`
methods, not constructor options. `new DialogV2({ render })` silently ignores the callback. If you pass
`render` to a directly constructed dialog anywhere, that code has never run. Blacksmith had exactly this bug
in `window-vote-config.js`.
