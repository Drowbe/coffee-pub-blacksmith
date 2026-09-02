# Coffee Pub Blacksmith

Foundry VTT module (`coffee-pub-blacksmith`), and the **API hub** of the Coffee Pub suite — it declares
`"library": true` and the other modules consume it. Changing its public surface breaks siblings, so treat
the API as a contract, not internal code.

D&D 5e / Foundry v13 (`minimum: 13`, `verified: 13`, `maximum: 14`). Requires `socketlib` and `lib-wrapper`.

**Before starting: confirm the session's working directory is this module's folder.** The Claude app's
Code -> New session flow does not prompt for a folder, so a session can silently inherit an unrelated
project's directory — the only tell is a small badge next to the session name. Reaching this repo through
an additional working directory works fine, which is what makes the mismatch easy to miss: editing
succeeds, but the session reads and writes the *wrong project's* memory and scratchpad. This happened
across a full session on 2026-07-19/20. If the working directory is not this module, say so before doing
the work rather than after.

## Suite context

Sibling modules live next to this one in `Data/modules/` and are wired in as readable directories:
artificer, bibliosoph, cartographer, crier, curator, herald, librarian, merchant, minstrel, monarch, regent,
scribe, squire, vault. All are public repos under `github.com/Drowbe`.

- `coffee-pub-librarian` owns **codex, quests, and objectives** — they moved out of Squire in Librarian 13.0.0,
  and Librarian declares the `JournalEntryPage` subtype, so those entries are `coffee-pub-librarian.codex`.
  Squire keeps the character-facing panels. Notes are **Blacksmith's**, not either module's.

- `coffee-pub-lib` and `coffee-pub-bubo` exist on GitHub but are **retired** — ignore them.
- `coffee-pub-campaigns` is a **backup**, not live code. Never edit it.
- `burden-of-knowledge` is **live campaign data, not code, and not ours to touch.** The folder here is the
  author's actual campaign narrative (1.4 GB: 27 declared packs — scenes, actors, items, playlists, and
  199 roll tables). It is a real Foundry module that loads every launch. Never edit it, and don't treat it
  as a code dependency. Its GitHub repo is a stale backup of the same data (last pushed 2026-02, ~350
  uncommitted local changes since) — the author moves data over the network now, not via git.
  - Note: `bok-roll-tables` holds `Fumbles`, `Critical Carnage`, and the `Investigation:*` tables. Modules
    point at them through Blacksmith's compendium settings — the intended model. This is also why the old
    `blacksmith-tables` pack pointed into this module, and why shipping that pack was broken for everyone
    but the author.

**Direction of travel:** features are being pulled *out* of Blacksmith into their own modules to keep the
hub fast. Don't add feature code here that belongs in a sibling.

**Module boundaries (enforced):**

- **Blacksmith's docs describe Blacksmith only.** Do not document Curator's image replacement, Regent's AI,
  or Herald's broadcast here. Delete such references — don't "fix" them to point at the sibling's repo; a
  corrected cross-module link is still coupling. Showing how a consumer *calls* Blacksmith's API is fine —
  that documents our surface, not theirs.
  **This governs links pointing OUT of Blacksmith, and only those.** A satellite linking *into* our wiki is
  allowed — Blacksmith is its required dependency, so the coupling already exists. Do not extend this rule
  to a sibling's docs; that mistake has been made once. The three directions are stated in TODO-GLOBAL
  Ground Rule 2 and enforced by `siblingWikiUrl` in `tools/wiki-sync.mjs`.
- **Each module bundles its own compendiums.** Don't rely on cross-module content cohesion.

## No build, no tests

This is a plain no-build Foundry module — Foundry loads the ES modules directly. There is nothing to compile
and **no test suite, linter, or formatter**. Don't go looking for one, and don't add a build step casually.

The single exception: `npm run build:cm6` bundles CodeMirror 6 via `build-codemirror.mjs`. Its output
`scripts/vendor/codemirror.mjs` is **committed**, and CI does not rebuild it — if you change the editor
vendor entry, rebuild and commit the bundle yourself.

`testing/` holds everything that exists to check the module, and it runs **inside Foundry**, by a person, 
pasted into a script macro. It is not an automated suite and there is no runner.

| Path | What it is |
|---|---|
| `testing/test-harness.js` | The entry point. Paste into a script macro; it loads the suites and opens a tabbed dialog. See its own header. |
| `testing/harness-lib.js` | Shared helpers and the contract a suite must export. |
| `testing/suites/suite-*.js` | The suites themselves, loaded by the harness. |
| `testing/data/` | JSON fixtures fed to the importer by hand. Data, not code. |
| `testing/*.md` | Verification owed: what has shipped and is not yet proven, and how to prove it. Never published — see the testing-doc rules below. |

**Do not confuse `testing/` with the other four directories that look adjacent.** They differ by *who runs
them and where*:

| Path | Runs where | Runs when |
|---|---|---|
| `tools/*.mjs` | Node, on the command line | You run it, or the wiki Action does |
| `testing/` | Foundry, pasted into a macro | A person checking the module |
| `utilities/` | Foundry, pasted into a macro | A person performing a one-off action — repair, fetch, delete. Not checks. |
| `themes/` | Foundry, at runtime | **Shipped content.** `theme-requestroll.json` plus its images and sounds; `settings.js` points at it. Nothing to do with testing. |
| `packs/` | nowhere | Gitignored, untracked, and not ours — see Packs below. |
| `node_modules/` | Node | Gitignored. Only `npm run build:cm6` needs it. |

What *is* automated is a small set of **invariant checks** in `tools/`, each runnable standalone and each
exiting non-zero on a violation. They verify things a reader cannot reasonably hold in their head, not
behavior:

| Check | Guards |
|---|---|
| `node tools/check-design-tokens.mjs` | `styles/vars.css` and `designsystem/design-tokens.md` agree, both ways |
| `node tools/check-settings-headings.mjs` | no settings heading hides itself from players who can see settings under it |
| `node tools/check-card-contracts.mjs` | a consumer cannot inject presentation into a chat card: prose is escaped, and caller-supplied colour stays confined to data-visualisation parts |
| `node tools/check-card-text.mjs` | card copy conventions |
| `node tools/check-harness-paths.mjs` | the test harness will load: paths resolve, every suite on disk is registered, imports resolve, and `expect()` calls pass their label first |
| `node tools/check-styles-loaded.mjs` | every stylesheet is reachable from the load path, and every `@import` resolves — a CSS file nothing imports is silently dead |
| `node tools/check-worldclock.mjs` | the clock's cross-file couplings: sky variables, the stop table, class names, the partial name, and the two coordinate spaces |
| `node tools/check-quick-rolls.mjs` | the Quick Rolls library and everything hanging off it: the `data-*` contract between a row and its four readers, the built-in roll counts (a world seeds from them exactly once, so a lost default is lost silently and forever), the export/import round trip, which rolls resolve without a window and which two must refuse, the contested wiring in the silent path, the Roll Builder's Tool-window contract and its ban on colour literals, and the dice tool being the single menubar entry for rolling |
| `node tools/check-dice-builder.mjs` | Request a Roll's dice builder: compose and parse are inverses, term order is the order dice were set, the roll window describes the roll it will make, favourites play the way they were saved, and the controls the builder wires exist. Slices the real functions out of the source, so it cannot pass against a drifted copy |
| `node tools/check-rest-clients.mjs` | the rest flow across **two clients**: a player's rest reaches the GM, one card carries both phases, grouped rests move the clock once |
| `node tools/check-dnd5e-citations.mjs` | our `dnd5e.mjs:NNNN` pointers still refer to the dnd5e version they were verified against |
| `tools/check-declaration-mirrors-model.mjs` | a module's import declaration against the DataModel it describes: field sets pair both ways, no declared constraint stricter than the model's, every field carries guidance. A library rather than a runnable check -- the owning module calls it. Hosted here because it is generic and pairs with `api.importer.declarationFromModel` |
| `node tools/check-imports.mjs` | every named import -- static and lazy -- names an export the target really has. A lazy one that does not is `undefined` until called, so it throws in Foundry at construction and nowhere earlier; a static one fails the whole module load, in the graph fourteen siblings import. `node --check` cannot see either, because it parses without resolving |
| `node tools/check-docs-structure.mjs` | the documentation standard: folder layout, prefixes, the uniform header, the emoji ban, HOLD hygiene, and assets in both directions. Imports the publish rules from `wiki-sync.mjs` rather than restating them |
| `node tools/check-note-reminders.mjs` | the note reminders' two-clock table: every clock fully specified, flags distinct, both reachable from the API, both hooks carrying `clock`, the wall clock polled, and every dialog pane and row mark present |

Run the relevant one after touching what it guards. CI (`.github/workflows/release.yml`) only zips and
releases on `v*` tags; **it runs no checks**, so nothing runs these but you.

**Citing dnd5e: give the version, and expect the line to rot.** A `dnd5e.mjs:NNNN` pointer is only true of
one release. dnd5e 5.2.5 to 5.3.3 moved roughly four thousand lines and silently invalidated all 76 pointers
in this repo — nothing threw and no doc was edited. `check-dnd5e-citations.mjs` now catches the version
change, but it cannot tell you whether a relocated pointer is *right*. When it fires, re-verify the **claim**
and not just the location: a correctly-relocated pointer to changed behaviour is worse than a broken one,
because it looks right.

## Documentation

**The rules live in `documentation/global/global-documentation-standard.md`** -- folder layout, naming,
the document kinds, what publishes, the README product page, and the CHANGELOG, plan, TODO, and testing
rules. It is authoritative for the whole suite and supersedes anything this file used to say about
documentation. Read it before writing, moving, or deleting a document.

It also carries the change workflow: orient in the docs, reality-check against the code, plan anything
larger than a bug fix, break the work into TODO entries, make the change, verify it and state how,
update architecture and API in the same change, write the CHANGELOG entry, delete the finished TODOs.

What is specific to this repo:

- **The docs here are not trustworthy yet.** Where accuracy has been checked against code, most were
  substantially wrong -- one architecture doc had **zero** real symbols across 24 code blocks. See the
  verification table in `documentation/TODO-GLOBAL.md` for what has actually been checked. Verify before
  you rely on a doc claim, and fix it when you find it wrong.
- **`documentation/global/` is Blacksmith's alone.** It holds the suite-wide documents the satellites
  link to rather than copy, so editing one changes it for all fifteen modules at once.
- **`documentation/TODO-GLOBAL.md` lives here** because Blacksmith is the hub. Cross-module work goes
  there; this module's own work goes in `documentation/TODO.md`.
- **The author commits.** Claude stages reviewable changes and states how to test them; the author
  reviews the diff in Cursor, commits, bumps the version, and tags. See Git below.

## Conventions

**File naming** — `scripts/` is flat and prefix-organized. Follow the existing prefix:

| Prefix | Role |
|---|---|
| `api-*` | public API layers |
| `manager-*` | subsystem managers (static classes) |
| `window-*` | ApplicationV2 windows |
| `ui-*` | UI injection / sheets / sidebar |
| `utility-*`, `timer-*`, `stats-*`, `registry-*`, `pins-*`, `widget-*` | as named |

There are no `panel-*.js` files here — that's a Squire pattern.

**Style** — ES modules (`"type": "module"`), semicolons, 4-space indent, JSDoc on exported members.
The dominant unit is a **static-only class** (`class HookManager { static … }`); a few APIs are plain object
literals (`CampaignAPI`, `CompendiumsAPI`). Section banners (`// ===== SECTION =====`) and
`// --- BEGIN/END - HOOKMANAGER CALLBACK ---` markers wrap callback bodies.

**Logging** — use `postConsoleAndNotification(moduleName, message, result, blnDebug, blnNotification)`
from `scripts/api-core.js`. It **throws if `message` is falsy**. Debug output is gated by the
`globalDebugMode` setting.

**Hooks** — register through `HookManager.registerHook({name, description, priority, callback, context})`
(`scripts/manager-hooks.js`), not raw `Hooks.on`. Priority 1–5, 1 = critical. Use `context` so
`disposeByContext` can clean up.

**Settings** — `scripts/settings.js` (~286 `game.settings.register` calls, no `registerMenu`). Assign a
`group: WORKFLOW_GROUPS.*`. Names/hints are localization keys in `lang/en.json`.

Headings are ordinary String settings registered through `registerHeader(id, label, hint, level, group,
scope)`, so they obey Foundry's visibility rule like anything else: **only `world` is hidden from non-GM**
(`client/applications/settings/config.mjs:67`); `client` and `user` both render. So **a heading must be
`'user'` if any setting a player can see sits under it — the whole ancestor chain, not just the nearest
heading.** An H1 that stays `'world'` orphans every player-visible setting below it however correct the H2
between them is, and the player gets bare controls with no context: two "Enable" toggles from different
sections, indistinguishable. Conversely a heading whose subtree is entirely `world` should stay `world`, or
players see an empty heading. This is about heading scope only — a setting's own scope is a functional
decision about who owns the value and never changes to satisfy it.

`node tools/check-settings-headings.mjs` enforces this and exits non-zero on a violation. Run it after
touching settings. Note that `registerHeader`'s **level argument is authoritative for nesting, not the
H-number in the label key** — they disagree in places (`headingH3CampaignCommon` registers at level H2).

**Tooltips** — use **`data-tooltip`** and nothing else. Never a bare `title=`, and never both on
the same element: Foundry renders `data-tooltip` in its own styled tooltip while the browser renders
`title` natively, so an element carrying both shows two tooltips.

**CSS** — `styles/default.css` is the only real entry; ~50 other files are `@import`ed from it. **A new CSS
file without an `@import` is silently unstyled.**

## Before you crawl the code — read the architecture doc

The recurring failure mode in this repo is re-discovering by grep what a doc should have told you. If you
learn something non-obvious by reading code, **write it into the architecture doc** so the next person
doesn't pay for it again. That is what those docs are for.

`architecture/architecture-blacksmith.md` in particular:

- **§3** — bootstrap and lifecycle. The `init`/`ready` ordering is **load-bearing and fragile**:
  `module.api` is assigned synchronously before any `await`; settings register in `ready`, not `init` (so
  anything in `init` must use `getSettingSafely`); every early-return in `ready` must call
  `LoadingProgressManager.forceHide()` or the UI stalls at "Finalizing…".
- **§9B** — performance-critical design. Shared journal watchdog, menubar fingerprinting, timer DOM
  caching, and **dead observer paths that look live**. Read before "fixing" any of it.
- **§9A** — traps. `api.version` ≠ `module.json` version; `window.COFFEEPUB` isn't a config object; the
  menubar API is bound in three places; `HookManager` remaps `renderChatMessage`; and more.
- **§7** — the CSS `@import` chain.
- **§11** — the god-module cleanup plan. `blacksmith.js` is ~2,700 lines and self-described as such.

## Packs

**Blacksmith bundles no compendiums.** None are declared in `module.json`, none ship in the release zip,
and `packs/` is gitignored. A compendium is not part of a module — users select their own in settings
(`settings.js` builds the choices from `game.packs.values()`; `manager-compendiums.js` resolves them). If
you are tempted to add a `packs` array, that's a decision to re-litigate, not a routine change.

## Git

**This repo is public.** Never commit machine-specific paths, local absolute paths, or personal config.
Personal Claude Code settings belong in `.claude/settings.local.json` (gitignored) — the committed
`.claude/settings.json` grants nothing, since permissions there would apply to anyone who clones the repo.

**It holds `{}`, not `{"permissions": {"allow": []}}`.** Those are not the same thing. An explicit empty
allow-list at project scope reads as "this project permits nothing" and appears to override what the local
file grants, which is why this module prompted for every shell command while the ten siblings with no
project settings file at all did not. Changed 2026-08-15. If prompting returns, check this file first.

Do not commit or push to the main repo unless asked. The author reviews diffs in Cursor and commits himself —
this covers both the milestone check-ins and the final release commit in the workflow above. Claude stages
reviewable changes; the author commits.

**Never bump the version in `module.json`.** The version stays at the last shipped number for the whole of
development; the author bumps it himself when he decides a release is ready, after his own final tests.

**The `BUILD x.y.z` commit closes the release: the bump together with the final doc pass,
`CHANGELOG.md`, and the todo deletions.** One commit, so everything that makes a version *be* that
version lands at the same point in history:

```
BUILD 13.15.0                          <- module.json + CHANGELOG.md + TODO.md + TODO-GLOBAL.md
Refactor party membership logic and improve statistics handling
Fix summoned creature tracking and combat history storage
```

(Settled 2026-08-05 by the author. This had contradicted itself: the workflow's step 12 said bundled while
this section said `module.json` alone, so whichever a reader found first was wrong. **Do not change it
again without being asked directly** — it has moved more than once, and both shapes work; what does not
work is the two of them disagreeing.)

Claude writes the CHANGELOG entry and stages the final doc changes; the author makes the BUILD commit and
the tag. Because the version in `module.json` lags the work in progress, it is **not** a signal for which
CHANGELOG section to write into — see the CHANGELOG rule above.

**Releases are the author's.** Tagging (`v*` fires `.github/workflows/release.yml`), pushing the main repo,
and anything that publishes to GitHub are his. The workflow runs no lint, tests, or build — the tag is the
only gate.

**Nobody syncs the wiki by hand — the Action does it.** The GitHub wiki is a **pure mirror** of
`documentation/`; the author writes nothing wiki-specific, so it never leads, it only follows.
`.github/workflows/sync-wiki.yml` rebuilds and pushes the publish set on every push to `master` touching
`documentation/` or `tools/wiki-sync.mjs`, and what goes live is the `PUBLISH` list in `tools/wiki-sync.mjs`
— never what merely changed, so a commit touching a held doc cannot leak it. See workflow step 13.

The old warning here — that the wiki could not be cloned on Windows, because the page `Architecture:-Core`
has a `:` in its filename and NTFS forbids it — was true of a *local* clone and is irrelevant to how the
sync actually happens. The Action runs on `ubuntu-latest`, where that filename is legal. Verified
2026-08-05: six consecutive successful `Sync Wiki` runs, including the `BUILD 13.15.0` push. **Do not
attempt a local wiki clone on this machine; there is no reason to, and it will still fail.**
