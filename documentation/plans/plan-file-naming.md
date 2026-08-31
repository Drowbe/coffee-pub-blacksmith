# Plan: File Naming

**Status: Planned.** Nothing renamed yet under this plan. It exists to be dismantled: the settled
convention goes to `documentation/designsystem/design-patterns.md` and to `CLAUDE.md`, the work goes to
`TODO.md`, and the history goes to `CHANGELOG.md`.

Written 2026-08-15, prompted by a real question nobody could answer from the filename: does
`journal-pins` inject a toolbar into a journal, or is it something else?

## The problem, stated precisely

It is not that the convention is bad. It is that **the convention is only enforced in `scripts/`, and
only mostly there.**

`CLAUDE.md` documents a ROLE-FIRST scheme -- `api-`, `manager-`, `window-`, `ui-`, `utility-`, `timer-`,
`stats-`, `registry-`, `widget-` -- and 80 per cent of `scripts/` follows it. What is left is the
problem, and one feature shows every failure mode at once:

| File | What is wrong |
|---|---|
| `manager-pins.js` | nothing -- this is the shape |
| `pins-renderer.js` | feature-first, and no role exists for "subsystem internal" |
| `pins-schema.js` | same |
| `pin-permission-icons.js` | feature-first, SINGULAR, no role |
| `ui-journal-pins.js` | correct: `ui-` already means "injects into Foundry's UI" |
| `styles/pins.css` | bare |
| `styles/journal-pins.css` | feature-first |
| `styles/sidebar-pin.css` | SINGULAR |
| `styles/window-pin-config.css` | role-first, singular |

Five naming schemes and an unsettled plural, for one feature.

**The specific complaint has a precise cause.** `ui-journal-pins.js` DOES say it injects into journals,
because `ui-` means that. `styles/journal-pins.css` does not, because **`styles/` has almost no role
vocabulary at all**: 28 of 58 stylesheets are role-prefixed (`window-`, `cards-`), and the other 30 are
named for a feature. That split is the ambiguity, not any individual name.

## Decisions

**Decision 1: role-first, always. `<role>-<feature>[-<detail>]`.** Already documented, already dominant.
The scheme is not the problem and is not being redesigned.

**Decision 2: the role vocabulary gains one entry, because its absence is what caused the drift.**
`pins-renderer` and `pins-schema` are not a manager, a window, an API or a UI injection. They are
internals of a subsystem, and there was no prefix for that, so they invented one. They become
`manager-pins-renderer.js` and `manager-pins-schema.js`: a subsystem internal is named for the manager
that owns it. No new prefix -- a new prefix is another thing to remember, and ownership is the more
useful fact anyway.

**Decision 3: plural follows the feature, decided once per feature and never per file.** Pins are
plural. `pin-permission-icons.js` becomes `manager-pins-permission-icons.js`.

**Decision 4: `styles/` gets the same role vocabulary as `scripts/`, but NOT YET.** A stylesheet should
say what it dresses -- `ui-journal-pins.css` beside `ui-journal-pins.js`. This is the change that
actually answers the question that prompted the plan, and it is also the largest: about 30 files, each
with an `@import` and an unknown number of doc references. Deferred to whenever those files are being
touched anyway. Renaming 30 stylesheets in one pass churns history for a purely navigational payoff.

**Decision 5: a rename is never worth doing on its own for a file with many references.** Four renames
on 2026-08-15 touched four scripts, an `@import` and three documents. The cost is in the references, not
the rename, and it is paid again by every reader of `git log`.

## The work

Ordered by value per unit of churn.

1. **The inversions.** Unambiguous, cheap, and each is one file plus its importers.
   - `xp-manager.js` -> `manager-xp.js`. Backwards against 32 files that get it right.
   - `sidebar-combat.js` -> `ui-sidebar-combat.js`. It injects a tab into Foundry's sidebar.
   - `canvas-layer.js` -> `manager-canvas-layer.js`. A `BlacksmithLayer` registered on the canvas.
   - `theme-request-roll.js` -> `utility-theme-request-roll.js`. Resolves theme asset paths.
   - `prompt-builder-actors.js` -> `utility-prompt-builder-actors.js`.
   - `asset-loader.js`, `asset-lookup.js` -> `utility-asset-loader.js`, `utility-asset-lookup.js`.
   - `compendium-types.js` -> `utility-compendium-types.js`. A constant table.

2. **The pins family**, per decisions 2 and 3.
   - `pins-renderer.js` -> `manager-pins-renderer.js`
   - `pins-schema.js` -> `manager-pins-schema.js`
   - `pin-permission-icons.js` -> `manager-pins-permission-icons.js`

3. **Leave alone, deliberately:**
   - `blacksmith.js`, `const.js`, `settings.js` -- entry point and two singletons. A prefix would say
     less than the bare name does.
   - `token-movement.js` -- see below; it is being removed, not renamed.
   - Everything in `styles/` -- decision 4.

## Not in scope

The `cpb-` class prefix still in `styles/sidebar-combat.css` and `styles/sidebar-pin.css`. That is a
CLASS naming question, not a file naming one, and it touches markup as well as CSS.

## How it will be verified

Renames are `git mv`, so history follows. After each: `node --check` every file that imported the old
name, load Foundry, and confirm the console is clean. A missed import is a hard failure at load rather
than something subtle, which is what makes this category of change safe to do in bulk.
