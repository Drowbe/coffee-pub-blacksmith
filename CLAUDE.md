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
- `coffee-pub-campaigns` and `burden-of-knowledge` are **backups**, not live code. Never edit them.

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

## Where the docs already are

Prefer these over re-deriving from source. Point at them; don't duplicate them.

- `documentation/api/` — **authoritative public API reference** (16 files: `api-core.md`, `api-pins.md`,
  `api-menubar.md`, `api-hookmanager.md`, …). Update these when you change the surface.
- `documentation/architecture/` — contributor-facing internals (`architecture-blacksmith.md` is the map).
- `documentation/guides/guide-registering-with-blacksmith.md` — how siblings integrate. **See the warning below.**
- `documentation/TODO.md` — Blacksmith's task list. Process: when a task is done, add it to `CHANGELOG.md`,
  then remove it from TODO.
- `documentation/TODO-GLOBAL.md` — **cross-module** cleanup spanning the suite (doc/pack/table ownership,
  extracting features out of Blacksmith). Read this before touching docs, packs, or compendiums: it carries
  the ground rules and several unresolved findings. Suite-wide work goes here, not in `TODO.md`.
- `CHANGELOG.md` — Keep-a-Changelog + SemVer, long prose entries that cite file paths. Match that style.

`architecture-blacksmith.md` §4.3/§5/§7 and its doc links were corrected against the filesystem. The rest of
that document has **not** been audited — if a claim there contradicts the code, trust the code.

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

## Init flow — the fragile part

Entry point is `scripts/blacksmith.js` (2690 lines, self-described god module in
`architecture-blacksmith.md` §11.1).

1. **Module eval** — `api.BlacksmithWindowBaseV2` is exposed before any hook, because Regent resolves a
   superclass at load time.
2. **`init`** — `module.api` is assigned **synchronously, before any `await`** (`blacksmith.js:891`) so
   consumers' `ready` hooks never see a null api. ~20 keys are deliberately `null` placeholders (toolbar,
   window, sockets, CanvasLayer), filled later by dynamic import.
3. **`ready`** — order is load-bearing and commented as such: `primeCoreChoiceCaches()` before any await →
   assets loaded → `registerSettings()` (dropdowns read assetLookup, so assets must exist first) →
   `MenuBar.runReadySetup()` → **`BlacksmithAPI.markReadyForConsumers()`** (`blacksmith.js:445`) → the rest.

**Settings are registered in `ready`, not `init`.** Anything running in `init` must use
`getSettingSafely`/`setSettingSafely` (`scripts/api-core.js`).

Every early-return path in `ready` must call `LoadingProgressManager.forceHide()` — miss one and the UI
stalls forever at "Finalizing…".

## Gotchas

- **`api.version` is `MODULE.APIVERSION` (`"13.0.0"`), not `module.json`'s version.** Different things.
- **`window.COFFEEPUB` is not a config object.** It holds *generated asset constants* only
  (`asset-lookup.js:79`). The exported `COFFEEPUB` (`api-core.js:111`) is a different thing again, with just
  `blnDebugOn` and `strDEFAULTCARDTHEME`. Don't assume a key exists on it — `ModuleManager` used to read a
  `COFFEEPUB.MODULES` that never existed, which silently broke `registerModule()` for every sibling module.
- **The `features` half of `ModuleManager` is vestigial.** All nine sibling callers pass only
  `{name, version}`; no module declares a feature. So `getFeaturesByType('menubarIcon')`
  (`api-menubar.js:185`) returns `[]` in practice. Menubar/toolbar contributions go through
  `registerMenubarTool` / `registerToolbarTool` instead. The mechanism works if you pass `features` — it's
  just unused.
- **Menubar API is bound in three places** (`blacksmith.js:333`, `:987`, `:1238`) and then **re-bound** at
  `:449-456` after `CombatBarManager.initialize()` replaces MenuBar statics. Edit one site and they diverge.
- **`HookManager` silently remaps `renderChatMessage` → `renderChatMessageHTML`** (`manager-hooks.js:40-49`).
- **`scripts/const.js` does a top-level `await fetch(module.json)`** — the whole module graph waits on it.
- **`HookManager.removeCallback` parses the hook name out of the callback id** via `split('_')[0]`
  (`manager-hooks.js:194`). A hook name containing `_` would break it.
- **`canvasReady` layer/pin setup is nested inside `if (blnCustomClicks)`** (`blacksmith.js:633`), gated on
  the `enableSceneClickBehaviors` setting. `BlacksmithAPI.getCanvasLayer()` has a raw-canvas fallback, which
  suggests the API path is known to be unreliable.
- **Running Foundry dirties the working tree.** This repo lives inside a live `Data/modules/` install, so
  LevelDB rewrites `packs/*/CURRENT` and rotates `MANIFEST-*` on every run. `LOCK`/`LOG`/`LOG.old` and
  `lost/` are now gitignored, but CURRENT and MANIFEST **cannot** be — a pack won't open without them.
- **Packs are all-or-nothing.** `CURRENT` names the `MANIFEST-*` that must accompany it. Committing a
  modified `CURRENT` without its new `MANIFEST` ships a pack that won't open. **Never blind-`git add .`
  here** — stage `packs/` deliberately, as a whole directory, or not at all.
- The repo also sits on a Google Drive path, so `_gsdata_/` artifacts appear.

## Known pack oddities (unresolved)

- **`packs/treatments` is empty** — declared in `module.json` as an Item pack, but has zero `.ldb` data at
  HEAD and on disk. It ships with no content.
- **`packs/injuries` is undeclared legacy.** Committed 2025-04-05, never touched since, absent from
  `module.json`, referenced by no code. Superseded by `packs/blacksmith-injuries` (added 2026-04-22). It
  may still hold ~6 injuries not present in the new pack (Impaled Appendage, Pummeling Painscape, Stabbed
  Flesh, Thump and Tumble, Necrotic, Piercing) — unverified, so it has not been deleted. Compare the two in
  Foundry before removing.
- Every pack has a `lost/` directory (LevelDB repair detritus), which means these packs have had corruption
  events. 72 orphaned `lost/MANIFEST-*` files were committed and have now been untracked.

## Git

**This repo is public.** Never commit machine-specific paths, local absolute paths, or personal config.
Personal Claude Code settings belong in `.claude/settings.local.json` (gitignored) — the committed
`.claude/settings.json` should stay empty, since permissions there would apply to anyone who clones the repo.

Do not commit or push unless asked. The author reviews diffs in Cursor and commits himself.
