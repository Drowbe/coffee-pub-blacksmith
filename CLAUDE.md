# Coffee Pub Blacksmith

Foundry VTT module (`coffee-pub-blacksmith`), and the **API hub** of the Coffee Pub suite — it declares
`"library": true` and the other modules consume it. Changing its public surface breaks siblings, so treat
the API as a contract, not internal code.

D&D 5e / Foundry v13 (`minimum: 13`, `verified: 13`, `maximum: 14`). Requires `socketlib` and `lib-wrapper`.

## Suite context

Sibling modules live next to this one in `Data/modules/` and are wired in as readable directories:
artificer, bibliosoph, cartographer, crier, curator, herald, minstrel, monarch, regent, scribe, squire, vault.
All are public repos under `github.com/Drowbe`.

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
- **Each module bundles its own compendiums.** Don't rely on cross-module content cohesion.

## No build, no tests

This is a plain no-build Foundry module — Foundry loads the ES modules directly. There is nothing to compile
and **no test suite, linter, or formatter**. Don't go looking for one, and don't add a build step casually.

The single exception: `npm run build:cm6` bundles CodeMirror 6 via `build-codemirror.mjs`. Its output
`scripts/vendor/codemirror.mjs` is **committed**, and CI does not rebuild it — if you change the editor
vendor entry, rebuild and commit the bundle yourself.

`utilities/` and `test-data/` are manual console scripts and fixtures, not an automated suite.
CI (`.github/workflows/release.yml`) only zips and releases on `v*` tags; it runs no checks.

## Documentation — there are only five kinds

This repo has repeatedly accumulated plans, migration guides, inventories, and "lessons learned" that
nobody deletes. **Everything that isn't one of these five is noise.** Don't create a sixth kind, and don't
add to a category by inventing a parallel file.

| Kind | Where | Audience | Rule |
|---|---|---|---|
| **Overview** | `README.md` (users), Home (devs) | README: someone deciding whether to *use* the module. Overview: a developer building *against* it. | Neither mentions architecture or internals. |
| **TODO** | `documentation/TODO.md` | us | **Single source of truth for what we will do.** When it's done, it is **deleted** from here and lives only in `CHANGELOG.md`. Never keep a done item "for reference". |
| **CHANGELOG** | `CHANGELOG.md` | everyone | What we did and fixed. Keep-a-Changelog + SemVer; long prose entries citing file paths. Match the existing style. |
| **Architecture** | `documentation/architecture/` | us, and the other Coffee Pub modules | How the module is built and why. **This is the anti-crawl artifact** — the place for things you can only learn by reading code. `architecture-blacksmith.md` is the map. |
| **API** | `documentation/api/` | anyone leveraging Blacksmith — mostly the other Coffee Pub modules, and Blacksmith itself | The public surface. Authoritative. Update it when you change the surface. |

Cross-module work spanning the suite goes in `documentation/TODO-GLOBAL.md`, not `TODO.md`.

**Migration guides and inventories are not a category.** If such a doc has content worth keeping, fold it
into **architecture** and delete the original. If a "migration" is complete, it's history — it belongs in
`CHANGELOG.md`, not in a guide named after a version that shipped two releases ago.

### Plans are scaffolding, not documents

`documentation/plans/` is the one exception, and it is **transitional by definition**. A plan exists to be
dismantled into the five kinds above: work → `TODO.md`, design → architecture, surface → API, history →
`CHANGELOG.md`. It exists until it doesn't. Three rules keep scaffolding from becoming ruins:

1. **A plan must declare its status** at the top (Planned / In progress / Implemented (phase N) / Complete).
   Without it nobody can tell live scaffolding from debris without reading the whole thing.
2. **A plan is never a source of truth.** The moment another doc cites a plan as canonical, the plan has
   overstayed — move that content to its real home.
3. **Complete means delete.** Not archive, not "keep for reference". Distribute the content, then remove the
   file. Anything already landed in a TODO or an architecture doc must be *removed from the plan*.

Prefer these docs over re-deriving from source. Point at them; don't duplicate them. **If a doc contradicts
the code, trust the code — then fix the doc.**

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

**Settings** — `scripts/settings.js` (~259 `game.settings.register` calls, no `registerMenu`). Assign a
`group: WORKFLOW_GROUPS.*`. Names/hints are localization keys in `lang/en.json`.

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
`.claude/settings.json` should stay empty, since permissions there would apply to anyone who clones the repo.

Do not commit or push unless asked. The author reviews diffs in Cursor and commits himself.
