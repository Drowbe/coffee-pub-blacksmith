# Blacksmith Module — Overall Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes the high-level architecture of the **Coffee Pub Blacksmith** FoundryVTT module: entry points, bootstrap flow, key subsystems, API surface, and how they fit together. For deeper dives into specific areas, see the referenced architecture documents.

**Documentation conventions:** **API docs** (`api-*.md`) are for **developers who want to leverage what Blacksmith exposes**—method signatures, access patterns, and integration from other modules. **Architecture docs** (`architecture-*.md`, including this one) are for **contributors to the Blacksmith codebase**—how systems are built, where code lives, and how pieces interact. The API docs are the authoritative reference for the public surface; treat them as the most accurate for what is exposed.

---

## 1. Overview

**Blacksmith** is a FoundryVTT module that provides quality-of-life and aesthetic improvements for D&D 5e (5.5+) on **FoundryVTT v13+**. It acts as a central hub for the Coffee Pub module ecosystem: shared infrastructure (hooks, sockets, module registration), UI (menubar, toolbars, windows, pins, chat cards), and feature systems (combat timers, stats, rolls, etc.). Features that are not listed here are not Blacksmith's — the hub deliberately stays lean, and optional modules build on its public API to provide their own.

**Platform constraints:**

- **FoundryVTT**: v13 and newer only; Application V2; Canvas follows v13 Canvas API.
- **Game system**: D&D 5e 5.5+.
- **Required modules**: `socketlib`, `lib-wrapper`.

**Design principles:**

- **Separation of concerns**: Managers for infrastructure and feature domains; API layers for external consumers.
- **Consistent naming**: `manager-*.js` (infrastructure/coordination), `api-*.js` (public API), `window-*.js` (UI), `timer-*.js`, `stats-*.js`, etc.
- **Lazy/dynamic imports** where appropriate to keep init fast and avoid circular dependencies (e.g. SocketManager, toolbar/menubar API, pins, rolls).

---

## 2. Module Structure and Entry Points

### 2.1 Manifest and Load Order

- **`module.json`**
  - `esmodules` load order: `const.js` → `api-core.js` → `settings.js` → `manager-compendiums.js` → **`blacksmith.js`** → `sidebar-combat.js` → **`api/blacksmith-api.js`**.
  - Single style entry: `styles/default.css` (which `@import`s all other CSS).
  - `socket: true`, `library: true`. **No `packs`** — Blacksmith bundles no compendiums; users select their own in settings.

- **`scripts/blacksmith.js`** is the main bootstrap: it imports managers, APIs, windows, timers, and sidebars, then registers Foundry hooks and exposes `module.api`.

- **`api/blacksmith-api.js`** is the **external API bridge**: timing-safe access to Blacksmith for other modules (e.g. `BlacksmithAPI.get()`, `BlacksmithAPI.getSockets()`). It runs its own readiness logic and assigns globals (`window.BlacksmithAPI`, `window.BlacksmithUtils`, etc.) when ready.

### 2.2 Constants and Identity

- **`scripts/const.js`**
  - **`MODULE`**: `ID`, `NAME`, `TITLE`, `VERSION`, `APIVERSION`, etc. (derived from `module.json`).
  - **`BLACKSMITH`**: app-wide constants (templates, debug flag, etc.). Updated at runtime via `BLACKSMITH.updateValue()` which fires `Hooks.callAll("blacksmithUpdated", this)`.

---

## 3. Bootstrap and Lifecycle

### 3.1 Hook Phases

Foundry runs these in the order below — `init`, `setup`, `canvasReady`, then `ready`. The loading-progress phase numbers follow that sequence.

1. **`init`** (in `blacksmith.js`)
   - Loading progress phase 1 ("Loading modules…").
   - **ModuleManager**, **UtilsManager**, **CampaignManager** initialized first.
   - **`module.api` is assigned synchronously** (full public surface: `registerModule`, `utils`, `HookManager`, `version`, `BLACKSMITH`, menubar bindings, etc.) **before any `await` in this hook**. This prevents other modules' **`ready`** handlers from seeing `game.modules.get('coffee-pub-blacksmith').api === null` while Blacksmith's async `init` is suspended.
   - **HookManager** used to register hooks (e.g. `renderChatMessageHTML`).
   - **CombatTimer**, **PlanningTimer**, **RoundTimer**, **CombatTracker**, **VoteManager** initialized.
   - **QuickViewUtility** (dynamic import), **`await addToolbarButton()`**, then dynamic imports to **augment** **toolbar** / **window** / **menubar** slots on `module.api` where those were placeholders.
   - **hookCanvas()** runs: it injects **BlacksmithLayer** into `CONFIG.Canvas.layers`. It registers **no hooks** — the canvas hooks are registered later, by `initializeSceneInteractions()` during `ready`.
   - **SocketManager** via dynamic import; **`module.api.sockets`** populated when the socket facade is built.
   - **MenuBar** usage: class is imported at bootstrap; **MenuBar.initialize()** / full menubar **ready** setup run in Blacksmith's **`ready`** hook (see below).

2. **`setup`**
   - Loading progress phase 3 ("Setting up game data…").

3. **`canvasReady`**
   - Loading progress phase 4 ("Preparing canvas…").
   - **BlacksmithLayer** is stored and exposed as `module.api.CanvasLayer` and `module.api.getCanvasLayer()`; **PinRenderer** loads pins for the current scene.
   - Ordering consequence worth knowing: `canvasReady` fires **before** `ready`, so anything Blacksmith registers during `ready` is too late for the first canvas draw. That is why `module.api.CanvasLayer` is `null` on the initial load — see `../api/api-canvas.md`.

4. **`ready`**
   - **Early `ready`**: Load default asset JSON (`loadDefaultAssetBundlesFromJson`), **`initializeAssetLookupInstance`**, **`registerSettings()`**, **`MenuBar.runReadySetup()`**, optional merged overrides, **`refreshAssetDerivedChoices()`**, then **`BlacksmithAPI.markReadyForConsumers()`** (resolves **`BlacksmithAPI.waitForReady()`** and syncs `window.Blacksmith*` globals).
   - Loading progress phase 5 ("Finalizing…") and the rest of Blacksmith **ready**: **HookManager.initialize()**, **registerBlacksmithUpdatedHook()**, combat/stats/wrappers/navigation/etc., **`initializeSettingsDependentFeatures()`**, then **`initializeSceneInteractions()`** — which registers the canvas hooks (`canvasInit`, `canvasReady`, `updateScene`, `dropCanvasData`), three of them gated on the `enableSceneClickBehaviors` setting. Loading progress is then hidden.
   - **Every exit from early `ready` must call `markReadyForConsumers()`, including the failing ones.** `BlacksmithAPI.waitForReady()` returns a promise that is only ever resolved and never rejected, so an exit that skips it leaves every consuming module awaiting `getHookManager()` or `getSockets()` hanging forever — with nothing logged on their side, since nothing rejected. A sibling whose feature sits behind that await presents as a feature that silently stopped existing, which is far harder to diagnose than a degraded API. All five exits go through the single `bailOutOfReady(stage, error)` helper for this reason; the `BlacksmithAPI` import is deliberately hoisted above the first exit so that they can.

### 3.2 API Exposure (`module.api`)

`game.modules.get('coffee-pub-blacksmith').api` is **created at the start of Blacksmith's `init`** (before any `await` in that hook) and **augmented** later (dynamic imports in `init`, socket facade, canvas layer on `canvasReady`, etc.).

| Surface | Description |
|--------|-------------|
| **ModuleManager** | Register/detect Coffee Pub modules and features. |
| **registerModule**, **isModuleActive**, **getModuleFeatures** | Module registration helpers. |
| **utils** | UtilsManager.getUtils() — shared helpers. |
| **version**, **BLACKSMITH** | API version and shared constants object (same reference as internal `BLACKSMITH`; runtime merges from AssetLookup land during **`ready`**). |
| **stats** | StatsAPI. |
| **HookManager** | Central hook registration. |
| **assetLookup** | `null` until **`initializeAssetLookupInstance`** runs in **`ready`**, then **`module.api.assetLookup`** is updated to the live instance. |
| **Toolbar API** | Placeholders cleared when **manager-toolbar** loads (`init`, after `await addToolbarButton`). |
| **Window API** | Placeholders cleared when **api-windows** loads (`init`). See **documentation/api/api-window.md**. |
| **Menubar API** | Bound at **`init`** (early assign); may be rebound when dynamic **api-menubar** import completes. |
| **sockets** | SocketManager facade: waitForReady, register, emit (attached when SocketManager wiring runs in **`init`**). |
| **CanvasLayer**, **getCanvasLayer** | Set on canvasReady. |
| **pins** | PinsAPI (public pins API). |
| **chatCards** | ChatCardsAPI. |

The **BlacksmithAPI** class in `api/blacksmith-api.js` resolves **`waitForReady()`** / **`get()`** after **`markReadyForConsumers()`** (post–asset merge and cache refresh in **`ready`**), which is the right gate for code that needs **full asset-backed constants** and stable globals. **`module.api`** is non-null earlier for **`registerModule`** and utils without waiting.

### 3.3 Two phases for external modules

| Phase | When | What you can rely on |
|--------|------|----------------------|
| **API shell** | After Blacksmith's **`init`** has run the synchronous **`module.api` assign** (before its first **`await`**) | **`registerModule`**, **`utils`**, **`HookManager`**, **`version`**, object refs like **`api.BLACKSMITH`** (may not yet include JSON-derived keys). **`assetLookup`** may still be **`null`** until **`ready`**. |
| **Data / caches ready** | After Blacksmith's **`ready`** path has loaded assets, merged overrides, refreshed choice caches, and called **`markReadyForConsumers()`** | **`BlacksmithAPI.waitForReady()`** resolves; **`assetLookup`**, merged **`BLACKSMITH`** keys, and **`window.BlacksmithConstants`** reflect loaded data. |

If your integration only needs registration and utilities, using **`Hooks.once('ready', …)`** with **`game.modules.get('coffee-pub-blacksmith').api`** is enough. If you need **sound/theme/asset lists** or **`assetLookup`**, use **`await BlacksmithAPI.waitForReady()`** (or defer reads until after it).

---

## 4. Key Subsystems (Managers and APIs)

### 4.1 Infrastructure

- **HookManager** (`manager-hooks.js`) — Central registration for Foundry hooks; priority and context; used throughout blacksmith.js and other scripts.
- **SocketManager** (`manager-sockets.js`) — SocketLib with native fallback; `waitForReady()`, `register()`, `emit()`; used for cross-client and GM–client messaging. See **documentation/architecture/architecture-socketmanager.md**.
- **ModuleManager** (`manager-modules.js`) — Registration and activation of "Coffee Pub" modules and their features.
- **UtilsManager** (`manager-utilities.js`) — Wraps shared utilities (from api-core and elsewhere) for consistent access.
- **LoadingProgressManager** (`manager-loading-progress.js`) — Loading progress phases and messages during bootstrap.

### 4.2 UI and Canvas

- **MenuBar** (`api-menubar.js`) — Global menubar: tools, notifications, secondary bar, combat bar. External modules register tools via `module.api.registerMenubarTool` etc. Bar height is a master scale factor rather than a dimension, which is why sizing is a preset; see **documentation/architecture/architecture-menubar.md** and **documentation/api/api-menubar.md**.
- **Combat bar** (`manager-combatbar.js`) — The always-present combat secondary bar: two rows, hybrid custom-template-plus-registered-items rendering, readouts, and the portrait strip. See **documentation/architecture/architecture-encounter.md**.
- **World clock** (`manager-worldclock.js`) — The in-world time readout, first in the menubar's right zone, with GM step controls and a draggable sky track. Reads Foundry's own calendar (`game.time.calendar`) and adds none of its own; the day's length comes from the calendar, never a hardcoded 86400. Self-contained across four files with a two-call seam to the menubar. See **documentation/architecture/architecture-worldclock.md**.
- **Toolbar** (`manager-toolbar.js`) — Encounter toolbar tools; `registerToolbarTool`, etc. See **documentation/architecture/architecture-toolbarmanager.md**, **documentation/api/api-toolbar.md**.
- **BlacksmithLayer** (`canvas-layer.js`) — Custom canvas layer (`blacksmith-utilities-layer`) for pins and other canvas UI.
- **CanvasTools** (`manager-canvas.js`) — Canvas-related helpers. See **documentation/api/api-canvas.md**.
- **Pins** — **PinManager** (`manager-pins.js`) and **PinRenderer** (`pins-renderer.js`) handle lifecycle and DOM rendering; **pins-schema.js** for validation/defaults; **PinsAPI** (`api-pins.js`) is the public API; **PinConfigWindow** (`window-pin-configuration.js`) for config UI. See **documentation/architecture/architecture-pins.md**, **documentation/api/api-pins.md**.

### 4.3 Feature Domains

- **Rolls** — **manager-rolls.js**: internal orchestration (`orchestrateRoll`, `processRoll`, `deliverRollResults`). **Public:** `openRequestRollDialog` on `module.api` and **`module.api.rolls`** (`api-rolls.js`) for outcome classification and hooks. Legacy `BLACKSMITH.rolls.execute` was removed in 13.9.x. See **architecture-rolls.md**, **api-rolls.md**, **plan-rolls-classification.md**.
- **Active Effects** — **api-effects.js**: read-only filtering, dnd5e condition normalization, permission-safe display data, and a classifier registry shared by sibling modules. Blacksmith's combat hover card consumes the same public `module.api.effects` contract. See **architecture-effects.md** and **api-effects.md**.
- **Stats** — **CombatStats** (`stats-combat.js`), **CPBPlayerStats** (`stats-player.js`), **StatsAPI** (`api-stats.js`). See **documentation/architecture/architecture-stats.md**, **documentation/api/api-stats.md**.
- **Timers** — **CombatTimer** (`timer-combat.js`), **PlanningTimer** (`timer-planning.js`), **RoundTimer** (`timer-round.js`). Countdown timers expose `getDisplayState()` as the one display contract and their own visibility gate; `state.isActive` is not that gate. See **documentation/architecture/architecture-timers.md**.
- **Chat cards** — **ChatCardsAPI** (`api-chat-cards.js`): themes and rendering contract. See **documentation/architecture/architecture-chatcards.md**, **documentation/api/api-chatcards.md**.
- **XP** — **XpManager** (`xp-manager.js`). See **documentation/architecture/architecture-xp.md**.
- **Voting** — **VoteManager** (`manager-vote.js`), **VoteConfig** (`window-vote-config.js`).
- **Combat** — **CombatTracker** (`ui-combat-tracker.js`), **sidebar-combat.js**, **ui-combat-tools.js**.
- **Journal** — **JournalTools** (`manager-journal-tools.js`), **JournalToolsWindow**.
- **Encounter** — **EncounterToolbar** (`ui-journal-encounter.js`).

### 4.4 Supporting

- **WrapperManager** (`manager-libwrapper.js`) — libWrapper integration.
- **NavigationManager** (`manager-navigation.js`) — Scene navigation and scene icon updates.
- **LatencyChecker** (`manager-latency-checker.js`) — Latency display.
- **SidebarPin** (`ui-sidebar-pin.js`), **SidebarStyle** (`ui-sidebar-style.js`) — Sidebar behavior and styling.
- **CompendiumManager** (`manager-compendiums.js`) — Compendium usage and ordering.
- **ConstantsGenerator** (`constants-generator.js`), **AssetLookup** (`asset-lookup.js`) — Constants and asset taxonomy (sounds, images, etc.).
- **Settings** (`settings.js`) — All module settings; **registerSettings()** called in ready; **getCachedSetting** and settings cache in blacksmith.js.

---

## 5. Windows and Applications

- **Application V2 window system** — Zone contract (title bar, option bar, header, body, action bar), window registry (`registerWindow` / `openWindow`), and optional base class for consistent windows. See **documentation/architecture/architecture-window.md** and **documentation/api/api-window.md**. Implementation guidance: **documentation/applicationv2-window/guidance-applicationv2.md**. A working example window lives in the `coffee-pub-prototype` module.
- **PinConfigWindow** (`window-pin-configuration.js`) — Pin configuration (Application).
- **SkillCheckDialog** (`window-skillcheck.js`) — Skill check dialog; uses manager-rolls for orchestration and delivery.
- **CSSEditor** (`window-gmtools.js`) — GM custom CSS.
- **StatsWindow** (`window-stats-party.js`), **PlayerStatsWindow** (`window-stats-player.js`).
- **VoteConfig** (`window-vote-config.js`). MovementConfig was removed 2026-08-15: the menubar tool already offered every movement type and the spacing control, from the same list, so the window was a second door to one room.

All new windows should use Application V2 patterns per project rules; existing windows are being migrated (see architecture-window.md).

---

## 6. Data and Resources

- **Templates** — Handlebars under `templates/` (e.g. `vote-card.hbs`, timer and stats templates). **getCachedTemplate()** in blacksmith.js caches compiled templates with TTL. (Query Tool templates live in Regent, not here.)
- **Packs** — None. Blacksmith ships no compendiums. Users point at their own via the compendium settings (`settings.js` builds choices from `game.packs.values()`; `manager-compendiums.js` resolves the selection).
- **Resources** — `resources/asset-defaults/*.json` (asset manifests), `dictionary.js`, `monster-mapping.json`, `schema-rolls.json`, `taxonomy.json` used by asset lookup, rolls, and related systems.
- **Lang** — `lang/en.json` for localization.

---

## 7. Styles

**`styles/default.css`** is the single entry; it `@import`s all 48 other stylesheets (in order):

- **Design tokens (first):** vars.
- **Shared:** common, settings, loading-progress.
- **Windows:** window-common, window-gmtools, window-skillcheck, window-vote, window-xp, window-stats, window-roll-normal, window-roll-cinematic, window-pin-config, window-pin-layers, window-template, window-json-import, window-form-controls, window-tabs, window-list, window-panels.
- **Tabs:** tabs-scenes.
- **Toolbars:** toolbars, toolbar-zones, toolbar-encounter, journal-tools, journal-pins.
- **Cards:** cards-common-layout, cards-common-themes, cards-parts.
- **Menubar:** menubar, menubar-combatbar.
- **Context menus:** menu-context-global.
- **Pins:** pins.
- **Timers:** timer-combat, timer-planning, timer-round.
- **Other:** vote, latency, combat-tools, utility-quickview, sidebar-pin, sidebar-style, sidebar-combat.

A new stylesheet is **silently unstyled** unless it is added to `default.css`.

Theming is CSS-variable based; chat card theming is documented in **documentation/architecture/architecture-chatcards.md**.

---

## 8. Data Flow and Integration Patterns

- **Hooks** — Foundry hooks drive most behavior. HookManager registers them with priorities and contexts; many subsystems (pins, canvas layer, scene updates, settings cache, chat message clicks) are wired in blacksmith.js or in their own files via HookManager.
- **Settings** — `game.settings.get/set(MODULE.ID, key)`. Settings cache in blacksmith.js with TTL; cleared on `settingChange` for the module. **registerSettings()** runs in ready.
- **Feature gating — two levels.** Be explicit about which one a setting is:

  | Level | Meaning |
  |---|---|
  | **Enable (load gate)** | The feature **does not load**: no hooks, wrappers, or menubar registration. Ideally a dynamic `import()` only when on. |
  | **On/Off** | The feature loads; the setting only toggles runtime behavior. |

  A load gate is the only one that removes cost. An "enable" setting that still registers hooks and
  early-returns inside the handler is an On/Off in disguise — it keeps the dispatch cost. Example of the
  real thing: Quick View (`blacksmith.js` — `getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)`
  guards the dynamic import). Gating work that runs in `init` is harder than it looks, because settings
  aren't registered until `ready` — see §3 and `getSettingSafely`.
- **Sockets** — External modules use `module.api.sockets` (or BlacksmithAPI.getSockets()) to register handlers and emit events; SocketManager routes to SocketLib or native sockets.
- **Pins** — Stored in scene flags (placed) and world setting (unplaced). PinManager CRUD and permissions; PinRenderer renders on BlacksmithLayer; canvasReady and updateScene trigger load. See **documentation/architecture/architecture-pins.md**.
- **Rolls** — Skill checks and other flows use **manager-rolls.js** (orchestrateRoll, processRoll, deliverRollResults, executeRoll); cinema overlay updates are triggered via sockets. See **documentation/architecture/architecture-rolls.md**.
- **JSON Item ingestion** — `registry-json-import-items.js` sends every Item Directory entry through `parseFlatItemToFoundry()`. That parser has two deliberately distinct paths: Blacksmith's friendly flat schema is converted field-by-field (dedicated modern converters exist for Feature and Spell; the older physical-item branches remain), while native Foundry Item data (`name` + `type` + `system`) is cloned and only root identity/placement metadata is removed. Feature/Spell activities share an explicit builder for the supported dnd5e activity models (`attack`, `damage`, `heal`, `save`, `utility`) and reject every other label; it also owns activity-level duration/range/target overrides, measured-template data, uses, and Active Effect creation/linking. An `appliedEffects` entry becomes both an Item Active Effect document and an activity reference to the same generated ID—never create one without the other. Friendly values are normalized through enumerated maps, never label lowercasing. Actor import temporarily removes `items`/`spells`/`features` before Actor creation; `CompendiumManager.addItemsToActor()` then resolves string or lightweight-object references through configured sources and parses inline definitions through the same Item parser before embedding them. Do not collapse these paths: native data remains the lossless escape hatch for dnd5e types the friendly converter does not model.
- **Prompt delivery capabilities** — JSON import kinds always provide `onBuildPrompt`; they may additionally provide `onBuildJsonTemplate`. `JsonImportWindow` shows the Full Prompt / JSON Template selector only for kinds with the second capability, and routes both Copy and Save As through the selected builder. Item Import's JSON-only builder constructs valid objects directly rather than scraping a JSON-looking block out of prose prompts; this keeps hand-authoring output syntactically valid and lets options such as Artificer flags participate structurally.

---

## 9. External API Usage

Other modules should:

1. Depend on `coffee-pub-blacksmith` and optionally `api/blacksmith-api.js` for timing-safe access.
2. Use **BlacksmithAPI.waitForReady()** (or **get()**) when you need **asset-backed data** or globals that are synced in **`markReadyForConsumers()`**. For **registerModule** / **utils** only, **`module.api`** in **`ready`** is sufficient once Blacksmith's **`init`** has passed the synchronous API assign.
3. Register as a Coffee Pub module via **module.api.registerModule()** if integrating with ModuleManager.
4. Use **module.api** (or BlacksmithAPI helpers) for: hooks, utils, stats, toolbar, menubar, sockets, pins, chat cards, canvas layer, etc., as documented in the respective api-* and architecture-* docs.

Debug helpers on `window` (e.g. **BlacksmithAPIDetails**, **BlacksmithAPIHooks**) are available for development.

---

## 9A. Traps

Things that cost someone an hour of grep to discover. Written down so nobody pays twice.

- **`api.version` is `MODULE.APIVERSION`** (`const.js` — currently `"13.0.0"`), **not** `module.json`'s
  version. They are unrelated and drift on purpose.
- **`window.COFFEEPUB` is not a config object.** It holds *generated asset constants* only, assigned in
  `asset-lookup.js`. The exported `COFFEEPUB` in `api-core.js` is a **different object** with just
  `blnDebugOn` and `strDEFAULTCARDTHEME`. Don't assume a key exists on either.
  - This bit us: `ModuleManager` read a `COFFEEPUB.MODULES` that nothing ever assigned, so
    `registerModule()` returned `false` for every sibling module — silently, because the error was
    debug-gated. Fixed by detecting from `game.modules` directly.
- **The `features` half of `ModuleManager` is vestigial.** Every caller passes only `{name, version}`, so
  `getFeaturesByType('menubarIcon')` (`api-menubar.js`) always returns `[]`. Tool contributions go through
  `registerMenubarTool` / `registerToolbarTool`. The mechanism works if you pass `features` — it's just unused.
- **The menubar API is bound in three places** in `blacksmith.js` (init assign, start of `ready`, and after
  the dynamic `api-menubar` import), then **re-bound again** after `CombatBarManager.initialize()` replaces
  MenuBar statics. Change one site and they silently diverge.
- **`HookManager` remaps `renderChatMessage` → `renderChatMessageHTML`** (warns once per session).
- **`module.api` cannot supply a class a consumer `extends`.** `extends` is evaluated when the consuming
  module's script is evaluated, and `game` does not exist then — a top-level `game.modules.get(...)` throws,
  and ESM caches the failed evaluation, so the throw disables that module for the whole session rather than
  being retried. Base classes are therefore re-exported from `api/blacksmith-api.js`, which is a real ES
  module and resolves at evaluation time. Three consumers each worked around this privately before it was
  fixed (Squire dynamically imports at point of use; Curator imports `scripts/` paths directly; Merchant
  followed the doc and broke a live world). **Anything a consumer needs at evaluation time must come from a
  module they can import, not from `module.api`.**
- **`scripts/const.js` does a top-level `await fetch(module.json)`.** The entire module graph waits on it.
- **`canvasReady` layer/pin setup is nested inside `if (blnCustomClicks)`**, i.e. gated on the
  `enableSceneClickBehaviors` setting. `BlacksmithAPI.getCanvasLayer()` carries a raw-canvas fallback,
  which suggests the API path is known to be unreliable.
- **Blacksmith does not consume its own public API** — internal code imports managers directly, which is
  correct for plumbing. But note the pattern: the **menubar** API is exercised every launch because
  Blacksmith registers its own tools through `registerMenubarTool`, and it works. `registerToolbarTool` and
  `registerModule` are *not* self-used — and `registerModule` was broken for a year without anyone noticing.
  **If an API isn't used by Blacksmith itself, nothing tests it.**
- **Quick View's brightness is a GM-local darkness-level override**, not a shader tweak
  (`utility-quickview.js`). Three v11-era levers turned out to be silent no-ops on v13 and were removed:
  the `gmVision` illumination uniform (zero occurrences in core v13.351 — it was a Perfect Vision-ism),
  `canvas.fog.layer` (v13 has `canvas.fog.sprite`), and `canvas.sight` (gone). The working mechanism
  injects a scaled `environment.darknessLevel` via the `configureCanvasEnvironment` hook so every core
  re-initialization (scene darkness edits, `animateDarkness` ticks, canvas draws) keeps the override.
  Two gotchas if you touch it: **core's `EnvironmentCanvasGroup#initialize` writes the effective level
  back onto the scene document in memory**, so the true value must be held in `_sceneDarknessBaseline`
  (restored on deactivate and on scene switch) — never read "the scene's darkness" live while active;
  and `initialize()` triggers a vision refresh that fires `sightRefresh`, which calls
  `_applyLightingBoost` again — the no-change guard on `canvas.environment.darknessLevel` is what
  prevents an infinite loop.

---

## 9B. Performance-Critical Design

Non-obvious design decisions that came out of a memory/performance investigation. **Read this before
"optimising" or "fixing" any of it — several of these look like bugs and are not.**

### 9B.1 One shared journal DOM observer

**`JournalDomWatchdog` (`manager-journal-dom.js`) is the single journal sheet/page DOM observer**, with a
1s interval fallback. `EncounterToolbar`, `JournalPagePins`, and the `blacksmith.js` journal double-click
all route through it. This replaced three per-feature body `MutationObserver`s that duplicated each other's
work on every render.

**Do not add a per-feature body `MutationObserver`.** Use the watchdog.

It prunes detached sheets each tick via `_pruneDetachedSheets()` — without that, `_knownSheets` retained
every journal ever opened.

### 9B.2 Dead code that looks live

These exist in the source and are **never called**. They are legacy, not wiring you can trust or need to fix:

| Symbol | File | Reality |
|---|---|---|
| `_setupGlobalObserver` | `ui-journal-encounter.js` | Contains a body `MutationObserver`, a `setInterval(500)`, and a capture-phase click handler. **`init()` never calls it.** |
| `_setupActivePageChecker`, `_setupPageNavigationListener` | `ui-journal-encounter.js` | Same — dead. |
| `_setupDomObserver` | `ui-journal-pins.js` | Defines a body `MutationObserver`. **Nothing calls it.** `dispose()` still clears it defensively. |
| `EncounterToolbar.dispose()`, `JournalPagePins.dispose()` | `ui-journal-encounter.js`, `ui-journal-pins.js` | Real teardown methods with **no caller**. They were only ever invoked from a `closeGame` listener, and `closeGame` is not a Foundry hook — the listeners were removed once that was confirmed. Kept deliberately: they are correct implementations waiting for a real teardown trigger, so wire them up rather than rewriting if one ever exists. |

**There is no `settingChange` hook in Foundry.** Core fires `clientSettingChanged` for client-scoped
settings on the changing client, and the standard `updateSetting` / `createSetting` *document* hooks on
all clients for world-scoped settings. `HookManager` does not remap `settingChange`, so registering it
never fires.

Register setting-change callbacks through **`HookManager.registerSettingChangeCallback({ description,
context, priority, key?, callback })`**, which subscribes to `updateSetting`, `createSetting`, and
`clientSettingChanged` and normalizes all three to one `(namespace, key, value)` shape. Prefer it over
picking a hook by hand. If you do wire one directly, choose by scope: world → `updateSetting` +
`createSetting` (fires everywhere); client → `clientSettingChanged` (local client only).

One gotcha when reading the value: the client Setting document **casts `value` to the registered type**
on initialize. For a `type: Object` setting the value is already the parsed object, and only
`_source.value` holds the raw JSON string — do not `JSON.parse` it blindly.

### 9B.3 Render paths that deliberately skip work

- **Menubar fingerprinting** — `renderMenubar` compares `_computeMenubarStructureFingerprint(templateData)`
  against `_menubarStructureFingerprint`. If unchanged, it calls **`_applyMenubarLightweightRefresh`**
  (updates leader/movement/timer labels only) instead of tearing down and re-inserting the DOM.
  `updateLeaderDisplay` forces a full render **only** when leader-only visibility flips.
  - **Everything the template draws must be in the fingerprint.** The lightweight path touches the
    leader, movement, timer and vote nodes and nothing else, so any other visible change needs a
    rebuild to reach the screen. A field left out does not fail loudly: the registration succeeds,
    the state is correct in `toolbarIcons`, the render is called, and the DOM simply keeps what it
    had. That is the whole failure mode, and it has shipped twice — `title`, where a tool switching
    modes showed a stale label, and `icon`/`iconColor`, where a tool reporting its state by icon
    (a recording dot, a pause bar) could never change appearance at all, because the icon is
    normally the *only* thing such a tool changes.
  - `_toolbarIconsLayoutSignature()` covers, per tool: resolved visibility (including `gmOnly` and
    `leaderOnly`), zone, group, resolved active state, order, resolved title, icon, and iconColor.
    `title`, `visible` and `active` may be functions and are called; `icon` and `iconColor` are
    strings, matching what the template and the API contract say.
  - **Still uncovered, and drawn by `menubar.hbs`:** `name` (the button's class and `data-tool`),
    `tooltip`, `toggleable`, `buttonNormalTint`, `buttonSelectedTint`, `groupOrder`. Each carries
    the same latent bug. They were left out deliberately rather than swept in: `tooltip` may be a
    function, and one returning live text — a countdown, a count of something — would make every
    render a full rebuild, which is the cost the fingerprint exists to avoid. Adding any of them
    wants that question answered first, per field.
  - The fingerprint must include `_secondaryBarLiveContentSignature()` and `secondaryBarActiveStates`.
    Without them, `updateSecondaryBarItemInfo` / `updateSecondaryBar` hit the skip path and leave secondary
    bar DOM stale. **If you add live secondary-bar state, add it to the fingerprint.**
  - There is no general update-in-place for a registered tool: changing one is unregister plus
    register, which is why a fingerprint gap is invisible to the caller — both calls return success.
    An `updateMenubarTool(toolId, updates)` in the shape of `updateSecondaryBarItemInfo` would give
    the change a single owner and one place to force the rebuild; it does not exist yet.
- **Timer DOM caching** — round / planning / combat timers cache their node lists rather than calling
  `document.querySelectorAll` on every tick. Caches refresh when a cached node disconnects, or after
  `renderCombatTracker` injects markup. The menubar session timer is label-only by design.
- **Socket native fallback** — `_initializeNativeSockets` calls `game.socket.off(moduleChannel)` before
  `on`, so re-init cannot stack inbound listeners.

### 9B.4 How to validate a performance change

The pass these findings came from, worth repeating rather than reinventing:

1. **Performance monitor** — DevTools (F12) → ⋮ → More tools → Performance monitor. Enable **JS heap size**
   and **DOM Nodes**; look for sustained upward trend vs. normal GC sawtooth.
2. **Heap snapshots** — DevTools → Memory → Heap snapshot. Baseline, stress (open/close journals many
   times), second snapshot, then the **Comparison** view for retained growth.
3. **Tab memory** — Shift+Esc → browser Task Manager → Foundry tab's Memory column over time.

After a stress segment, closing journals should let **DOM nodes** drop. A flatline at a new high is the
signal to take a comparison snapshot. A real validation pass is a 90–180 minute GM session.

---

## 9C. A refusal beats a plausible default

A design rule for anything on `module.api`, written down because four separate defects across
`api.inventory`, `api.entityList`, `api.quantitySplit` and `api.dialog` turned out to be the same defect,
and because three of the four were found by a consuming module rather than by us.

**When a value cannot be determined, refuse. Do not substitute one that looks reasonable.** A wrong answer
that looks wrong gets fixed the day it ships. A wrong answer that looks plausible is indistinguishable from
a right one at every call site, so nothing throws, no log line appears, and the only way it surfaces is a
person eventually noticing that the numbers are off.

The four, compressed to the shape they share rather than what each one was:

| Where | The plausible substitute | What it looked like |
|---|---|---|
| `_buildPayload` | the source item's `system.container` | items arriving into a container the recipient does not have |
| `_resolveQuantity` | the source document's own quantity as a ceiling | a grant refusing 18 of 20 restock rolls |
| `resolveContent` | a doc claiming a passed node keeps its listeners | controls that render, respond, and report nothing the user did |
| `readSelection` / `getValue` | the caller's own seed, returned as the user's answer | a picker handing back the character it was opened on |

None of these threw. Each produced a value of the right type, in the right range, that a caller could act on.

### The seed a careful consumer picks is the one that does most damage

The sharpest form of this, and the one worth guarding against specifically. When a control cannot report
what the user chose, it reports what it was created with — so the severity of the failure is set by the
caller's default rather than by anything at the failure site.

A careful consumer picks a *sensible* default, and sensible almost always means the maximum or the current
value. Those are exactly the values that do most damage when returned unasked. Curator's loot window created
a quantity control with `value: max`, so an unbound read returned the whole stack: "take 1 of 20" took all
twenty, silently, in a looting window. The seed was the right choice. It is the reason the failure was
severe rather than harmless.

So the consumer who thought hardest about defaults gets the worst outcome, which is backwards, and it is why
this cannot be left to consumer discipline. The API has to refuse.

### What this means in practice

- **A getter that depends on state something else established must be able to say it has none.** Both
  controls expose `attached` and a `readFrom(root)` that goes to the DOM, because reading and binding are
  separate concerns and only binding can fail.
- **Where a fallback genuinely is correct, make it detectable.** The unbound reads still return the initial
  value — a host may legitimately want it before render — but they log once when read *after a bind that was
  attempted and failed*, which is the case that cannot be legitimate.
- **Prefer a refusal code to a silent clamp or a substituted value.** `api.inventory` returns
  `{ ok: false, code }` rather than moving what it can; `CONTAINER_NOT_FOUND` exists because falling back to
  the root inventory would have put stock somewhere the result did not mention.
- **A doc that recommends the broken path is worse than one that omits it.** `api-quantity-split.md` advised
  `getValue()` over reading the DOM, and Curator's workaround comment quotes that sentence back verbatim.
  The doc did not fail to prevent the bug; it caused it.

### Corollary: the migration is invisible from the side doing the fixing

Raised by a consuming module, and it pairs with the rule rather than qualifying it. Both defects in this
class that needed a migration had one that could not be seen from here.

A call option fixes what arrives from now on. Nothing fixes what already arrived. `omitFlags` stops a
source-scoped flag riding along, and says nothing about the rows already carrying it in somebody's world -
where they will go on blocking merges, because the arrival no longer matches them. Containment was the same:
the fix corrected new arrivals and left the orphaned rows orphaned.

The reason it is invisible from here is that our own registries describe *our* writes. A consumer's
transient-flag declaration covers what that consumer stamps from now on; neither side's bookkeeping knows
what is sitting in a world that has been running for a year.

So a fix in this class needs two mechanisms and will feel like it needs one. Ask what the already-affected
rows do after the fix ships, and expect the answer to be "nothing, silently" unless something is built for
them. In practice that has meant pairing the call option with an `ignoreFlags` entry, or leaving a
consumer-side guard in place after the primitive lands - see `api/api-inventory.md`.

### Corollary: an API Blacksmith does not use itself has no test

Stated in 9A about `registerModule`, and these four are the same finding from the other side. All of them
sat in code paths only consumers exercised. When a surface is built for siblings rather than for us, the
absence of a plausible default is the only thing standing between a defect and a year of silence.

---

## 10. References to Detailed Architecture Docs

| Topic | Document |
|-------|----------|
| Pins (storage, renderer, schema, API) | **architecture-pins.md** |
| SocketManager (SocketLib, API, migration) | **architecture-socketmanager.md** |
| Chat cards (themes, layout, migration) | **architecture-chatcards.md** |
| Active Effects normalization and classifier registry | **architecture-effects.md** |
| Roll system (4-function, execute, cinema) | **architecture-rolls.md** |
| Stats (combat, player, API) | **architecture-stats.md** |
| Toolbar manager | **architecture-toolbarmanager.md** |
| Token naming (type/subtype cascade, taxonomy) | **architecture-token-naming.md** |
| XP system | **architecture-xp.md** |
| HookManager | **architecture-hookmanager.md** |
| API references (pins, menubar, toolbar, stats, etc.) | **api-*.md** |
