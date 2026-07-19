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

- **MenuBar** (`api-menubar.js`) — Global menubar: tools, notifications, secondary bar, combat bar. External modules register tools via `module.api.registerMenubarTool` etc. See **documentation/api/api-menubar.md**.
- **Toolbar** (`manager-toolbar.js`) — Encounter toolbar tools; `registerToolbarTool`, etc. See **documentation/architecture/architecture-toolbarmanager.md**, **documentation/api/api-toolbar.md**.
- **BlacksmithLayer** (`canvas-layer.js`) — Custom canvas layer (`blacksmith-utilities-layer`) for pins and other canvas UI.
- **CanvasTools** (`manager-canvas.js`) — Canvas-related helpers. See **documentation/api/api-canvas.md**.
- **Pins** — **PinManager** (`manager-pins.js`) and **PinRenderer** (`pins-renderer.js`) handle lifecycle and DOM rendering; **pins-schema.js** for validation/defaults; **PinsAPI** (`api-pins.js`) is the public API; **PinConfigWindow** (`window-pin-configuration.js`) for config UI. See **documentation/architecture/architecture-pins.md**, **documentation/api/api-pins.md**.

### 4.3 Feature Domains

- **Rolls** — **manager-rolls.js**: exports `orchestrateRoll`, `processRoll`, `deliverRollResults`, `updateCinemaOverlay`; used by the skill check dialog and socket handlers. **There is no public roll API** — `BLACKSMITH.rolls.execute` was removed in 13.9.x after being `undefined` since 2025-08-26 (it imported an `executeRoll` export that no longer existed; nothing consumed it). See **architecture-rolls.md**.
- **Stats** — **CombatStats** (`stats-combat.js`), **CPBPlayerStats** (`stats-player.js`), **StatsAPI** (`api-stats.js`). See **documentation/architecture/architecture-stats.md**, **documentation/api/api-stats.md**.
- **Timers** — **CombatTimer** (`timer-combat.js`), **PlanningTimer** (`timer-planning.js`), **RoundTimer** (`timer-round.js`).
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

- **Application V2 window system** — Zone contract (title bar, option bar, header, body, action bar), window registry (`registerWindow` / `openWindow`), and optional base class for consistent windows. See **documentation/architecture/architecture-window.md** and **documentation/api/api-window.md**. Implementation guidance and examples: **documentation/applicationv2-window/guidance-applicationv2.md**, **documentation/applicationv2-window/README.md**.
- **PinConfigWindow** (`window-pin-configuration.js`) — Pin configuration (Application).
- **SkillCheckDialog** (`window-skillcheck.js`) — Skill check dialog; uses manager-rolls for orchestration and delivery.
- **CSSEditor** (`window-gmtools.js`) — GM custom CSS.
- **StatsWindow** (`window-stats-party.js`), **PlayerStatsWindow** (`window-stats-player.js`).
- **MovementConfig** (`token-movement.js`), **VoteConfig** (`window-vote-config.js`).

All new windows should use Application V2 patterns per project rules; existing windows are being migrated (see architecture-window.md).

---

## 6. Data and Resources

- **Templates** — Handlebars under `templates/` (e.g. `window-query.hbs`, `vote-card.hbs`, timer and stats templates). **getCachedTemplate()** in blacksmith.js caches compiled templates with TTL.
- **Packs** — None. Blacksmith ships no compendiums. Users point at their own via the compendium settings (`settings.js` builds choices from `game.packs.values()`; `manager-compendiums.js` resolves the selection).
- **Resources** — `resources/asset-defaults/*.json` (asset manifests), `dictionary.js`, `monster-mapping.json`, `schema-rolls.json`, `taxonomy.json` used by asset lookup, rolls, and related systems.
- **Lang** — `lang/en.json` for localization.

---

## 7. Styles

**`styles/default.css`** is the single entry; it `@import`s all 48 other stylesheets (in order):

- **Design tokens (first):** vars.
- **Shared:** common, settings, loading-progress.
- **Overrides:** overrides-foundry, overrides-modules.
- **Windows:** window-common, window-gmtools, window-skillcheck, token-movement, window-xp, window-stats, window-roll-normal, window-roll-cinematic, window-pin-config, window-pin-layers, window-template, window-json-import, window-form-controls, window-tabs, window-list, window-panels.
- **Tabs:** tabs-scenes.
- **Toolbars:** toolbars, toolbar-zones, toolbar-encounter, journal-tools, journal-pins.
- **Cards:** cards-common-layout, cards-common-themes, cards-xp, cards-stats, cards-skill-check.
- **Menubar:** menubar, menubar-combatbar.
- **Context menus:** menu-context-global.
- **Pins:** pins. **Links:** links-themes.
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
  - The fingerprint must include `_secondaryBarLiveContentSignature()` and `secondaryBarActiveStates`.
    Without them, `updateSecondaryBarItemInfo` / `updateSecondaryBar` hit the skip path and leave secondary
    bar DOM stale. **If you add live secondary-bar state, add it to the fingerprint.**
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

## 10. References to Detailed Architecture Docs

| Topic | Document |
|-------|----------|
| Pins (storage, renderer, schema, API) | **architecture-pins.md** |
| SocketManager (SocketLib, API, migration) | **architecture-socketmanager.md** |
| Chat cards (themes, layout, migration) | **architecture-chatcards.md** |
| Roll system (4-function, execute, cinema) | **architecture-rolls.md** |
| Stats (combat, player, API) | **architecture-stats.md** |
| Toolbar manager | **architecture-toolbarmanager.md** |
| Token naming (type/subtype cascade, taxonomy) | **architecture-token-naming.md** |
| XP system | **architecture-xp.md** |
| HookManager | **architecture-hookmanager.md** |
| API references (pins, menubar, toolbar, stats, etc.) | **api-*.md** |

