# Blacksmith Module — Overall Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes the high-level architecture of the **Coffee Pub Blacksmith** FoundryVTT module: entry points, bootstrap flow, key subsystems, API surface, and how they fit together. For deeper dives into specific areas, see the referenced architecture documents.

**Documentation conventions:** **API docs** (`api-*.md`) are for **developers who want to leverage what Blacksmith exposes**—method signatures, access patterns, and integration from other modules. **Architecture docs** (`architecture-*.md`, including this one) are for **contributors to the Blacksmith codebase**—how systems are built, where code lives, and how pieces interact. The API docs are the authoritative reference for the public surface; treat them as the most accurate for what is exposed.

---

## 1. Overview

**Blacksmith** is a FoundryVTT module that provides quality-of-life and aesthetic improvements for D&D 5e (5.5+) on **FoundryVTT v13+**. It acts as a central hub for the Coffee Pub module ecosystem: shared infrastructure (hooks, sockets, module registration), UI (menubar, toolbars, windows, pins, chat cards), and feature systems (combat timers, stats, rolls, broadcast, image replacement, etc.).

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
  - `socket: true`, `library: true`; compendium packs (user manual, treatments, tables, injuries).

- **`scripts/blacksmith.js`** is the main bootstrap: it imports managers, APIs, windows, timers, and sidebars, then registers Foundry hooks and exposes `module.api`.

- **`api/blacksmith-api.js`** is the **external API bridge**: timing-safe access to Blacksmith for other modules (e.g. `BlacksmithAPI.get()`, `BlacksmithAPI.getSockets()`). It runs its own readiness logic and assigns globals (`window.BlacksmithAPI`, `window.BlacksmithUtils`, etc.) when ready.

### 2.2 Constants and Identity

- **`scripts/const.js`**
  - **`MODULE`**: `ID`, `NAME`, `TITLE`, `VERSION`, `APIVERSION`, etc. (derived from `module.json`).
  - **`BLACKSMITH`**: app-wide constants (templates, roll API placeholder `BLACKSMITH.rolls.execute`, debug flag, etc.). Updated at runtime via `BLACKSMITH.updateValue()` which fires `Hooks.callAll("blacksmithUpdated", this)`.

---

## 3. Bootstrap and Lifecycle

### 3.1 Hook Phases

1. **`setup`**  
   - Loading progress phase 3 (“Setting up game data…”).

2. **`init`** (in `blacksmith.js`)
   - Loading progress phase 1 (“Loading modules…”).
   - **ModuleManager**, **UtilsManager** initialized first.
   - **HookManager** used to register hooks (e.g. `renderChatMessageHTML`, `renderApplication`, `closeApplication`, `settingChange`).
   - **MenuBar**, **CombatTimer**, **PlanningTimer**, **RoundTimer**, **CombatTracker**, **VoteManager**, **BroadcastManager** initialized.
   - **QuickViewUtility** (dynamic import), **addToolbarButton()**, then dynamic imports to expose **toolbar API** and **menubar API** onto `module.api`.
   - **hookCanvas()** registered (canvasInit, canvasReady, updateScene, dropCanvasData for layer and pins).
   - **SocketManager** initialized via dynamic import (deferred to avoid SocketLib timing issues).
   - **`module.api`** is assigned (see below). Toolbar/menubar/socket APIs are attached either inline or in the same init via dynamic imports.

3. **`ready`**
   - Loading progress phase 5 (“Finalizing…”).
   - **registerSettings()** first, then **HookManager.initialize()**, **registerBlacksmithUpdatedHook()**, **registerWindowQueryPartials()**.
   - After settings verification: **CombatStats**, **CPBPlayerStats**, **XpManager**, **WrapperManager**, **NavigationManager**, **LatencyChecker**, **CanvasTools**, **PinManager**, **ImageCacheManager** (GM only), **TokenImageUtilities**, **JournalTools**, **EncounterToolbar**, **SidebarPin**, **SidebarStyle**.
   - **BLACKSMITH.rolls.execute** set from **manager-rolls.js** (`executeRoll`).
   - **initializeSettingsDependentFeatures()**, **initializeSceneInteractions()**, then loading progress hidden.

4. **`canvasReady`**
   - Loading progress phase 4 (“Preparing canvas…”).
   - In **hookCanvas()**: **BlacksmithLayer** is stored and exposed as `module.api.CanvasLayer` and `module.api.getCanvasLayer()`; **PinRenderer** loads pins for the current scene.

### 3.2 API Exposure (`module.api`)

`game.modules.get('coffee-pub-blacksmith').api` is set during `init` and then augmented by dynamic imports. It includes:

| Surface | Description |
|--------|-------------|
| **ModuleManager** | Register/detect Coffee Pub modules and features. |
| **registerModule**, **isModuleActive**, **getModuleFeatures** | Module registration helpers. |
| **utils** | UtilsManager.getUtils() — shared helpers. |
| **version**, **BLACKSMITH** | API version and shared constants. |
| **stats** | StatsAPI. |
| **HookManager** | Central hook registration. |
| **ConstantsGenerator**, **assetLookup** | Constants and asset lookup. |
| **Toolbar API** | registerToolbarTool, unregisterToolbarTool, getRegisteredTools, etc. (set after manager-toolbar load). |
| **Menubar API** | registerMenubarTool, notifications, secondary bar, combat bar, etc. (set after api-menubar load). |
| **sockets** | SocketManager facade: waitForReady, register, emit (set after SocketManager init). |
| **CanvasLayer**, **getCanvasLayer** | Set on canvasReady. |
| **pins** | PinsAPI (public pins API). |
| **chatCards** | ChatCardsAPI. |

The **BlacksmithAPI** class in `api/blacksmith-api.js` provides a timing-safe way for other modules to access this surface (e.g. `BlacksmithAPI.get()`, `BlacksmithAPI.getSockets()`, `BlacksmithAPI.getCanvasLayer()`).

---

## 4. Key Subsystems (Managers and APIs)

### 4.1 Infrastructure

- **HookManager** (`manager-hooks.js`) — Central registration for Foundry hooks; priority and context; used throughout blacksmith.js and other scripts.
- **SocketManager** (`manager-sockets.js`) — SocketLib with native fallback; `waitForReady()`, `register()`, `emit()`; used for cross-client and GM–client messaging. See **documentation/architecture-socketmanager.md**.
- **ModuleManager** (`manager-modules.js`) — Registration and activation of “Coffee Pub” modules and their features.
- **UtilsManager** (`manager-utilities.js`) — Wraps shared utilities (from api-core and elsewhere) for consistent access.
- **LoadingProgressManager** (`manager-loading-progress.js`) — Loading progress phases and messages during bootstrap.

### 4.2 UI and Canvas

- **MenuBar** (`api-menubar.js`) — Global menubar: tools, notifications, secondary bar, combat bar. External modules register tools via `module.api.registerMenubarTool` etc. See **documentation/api-menubar.md**.
- **Toolbar** (`manager-toolbar.js`) — Encounter toolbar tools; `registerToolbarTool`, etc. See **documentation/architecture-toolbarmanager.md**, **documentation/api-toolbar.md**.
- **BlacksmithLayer** (`canvas-layer.js`) — Custom canvas layer (`blacksmith-utilities-layer`) for pins and other canvas UI.
- **CanvasTools** (`manager-canvas.js`) — Canvas-related helpers. See **documentation/api-canvas.md**.
- **Pins** — **PinManager** (`manager-pins.js`) and **PinRenderer** (`pins-renderer.js`) handle lifecycle and DOM rendering; **pins-schema.js** for validation/defaults; **PinsAPI** (`api-pins.js`) is the public API; **PinConfigWindow** (`window-pin-config.js`) for config UI. See **documentation/architecture-pins.md**, **documentation/api-pins.md**.

### 4.3 Feature Domains

- **Broadcast** — **BroadcastManager** (`manager-broadcast.js`): view sync and broadcast modes (e.g. map view). See **documentation/architecture-broadcast.md**.
- **Rolls** — **manager-rolls.js**: 4-function roll system; `executeRoll` exposed as `BLACKSMITH.rolls.execute`; used by skill check dialog and socket handlers. See **documentation/architecture-rolls.md**.
- **Stats** — **CombatStats** (`stats-combat.js`), **CPBPlayerStats** (`stats-player.js`), **StatsAPI** (`api-stats.js`). See **documentation/architecture-stats.md**, **documentation/api-stats.md**.
- **Timers** — **CombatTimer** (`timer-combat.js`), **PlanningTimer** (`timer-planning.js`), **RoundTimer** (`timer-round.js`).
- **Chat cards** — **ChatCardsAPI** (`api-chat-cards.js`): themes and rendering contract. See **documentation/architecture-chatcards.md**, **documentation/api-chatcards.md**.
- **Token/portrait image replacement** — **ImageCacheManager** (`manager-image-cache.js`), **TokenImageUtilities**, **TokenImageReplacementWindow**, etc. See **documentation/architecture-imagereplacement.md**.
- **XP** — **XpManager** (`xp-manager.js`). See **documentation/architecture-xp.md**.
- **Voting** — **VoteManager** (`vote-manager.js`), **VoteConfig**.
- **Combat** — **CombatTracker** (`combat-tracker.js`), **sidebar-combat.js**, **combat-tools.js**.
- **Journal** — **JournalTools** (`journal-tools.js`), **JournalToolsWindow**.
- **Encounter** — **EncounterToolbar** (`encounter-toolbar.js`).

### 4.4 Supporting

- **WrapperManager** (`manager-libwrapper.js`) — libWrapper integration.
- **NavigationManager** (`manager-navigation.js`) — Scene navigation and scene icon updates.
- **LatencyChecker** (`latency-checker.js`) — Latency display.
- **SidebarPin** (`sidebar-pin.js`), **SidebarStyle** (`sidebar-style.js`) — Sidebar behavior and styling.
- **CompendiumManager** (`manager-compendiums.js`) — Compendium usage and ordering (e.g. for image replacement).
- **ConstantsGenerator** (`constants-generator.js`), **AssetLookup** (`asset-lookup.js`) — Constants and asset taxonomy (sounds, images, etc.).
- **OpenAI/Regent:** AI tools (Consult the Regent, worksheets, OpenAI integration) are provided by the optional module **coffee-pub-regent**. See that module’s documentation (e.g. `coffee-pub-regent/documentation/api-openai.md`).
- **Settings** (`settings.js`) — All module settings; **registerSettings()** called in ready; **getCachedSetting** and settings cache in blacksmith.js.

---

## 5. Windows and Applications

- **BlacksmithWindowQuery** (`window-query.js`) — Generic query/assistant window; partials registered via **window-query-registration.js**.
- **PinConfigWindow** (`window-pin-config.js`) — Pin configuration (Application).
- **SkillCheckDialog** (`window-skillcheck.js`) — Skill check dialog; uses manager-rolls for orchestration and delivery.
- **CSSEditor** (`window-gmtools.js`) — GM custom CSS.
- **StatsWindow** (`window-stats-party.js`), **PlayerStatsWindow** (`window-stats-player.js`).
- **TokenImageReplacementWindow** (`token-image-replacement.js`), **MovementConfig** (`token-movement.js`), **VoteConfig** (`vote-config.js`).

All use Application V2 patterns per project rules.

---

## 6. Data and Resources

- **Templates** — Handlebars under `templates/` (e.g. `window-query.hbs`, `vote-card.hbs`, timer and stats templates). **getCachedTemplate()** in blacksmith.js caches compiled templates with TTL.
- **Packs** — User manual, treatments, blacksmith-tables, blacksmith-injuries (see `module.json`).
- **Resources** — `resources/assets.js`, `dictionary.js`, `monster-mapping.json`, `schema-rolls.json`, `taxonomy.json` used by asset lookup, rolls, and related systems.
- **Lang** — `lang/en.json` for localization.

---

## 7. Styles

**`styles/default.css`** is the single entry; it imports (in order):

- Shared: common, settings, loading-progress.
- Overrides: overrides-foundry, overrides-modules.
- Windows: window-common, window-gmtools, window-query, window-skillcheck, token-movement, window-xp, window-stats, window-roll-*, window-token-replacement, window-pin-config.
- Tabs: tabs-scenes.
- Toolbars: toolbars, toolbar-zones, toolbar-encounter, journal-tools.
- Cards: cards-layout-legacy, cards-themes-legacy, cards-layout, cards-themes, cards-xp, cards-stats, cards-skill-check.
- Menubar, context menus, pins, links-themes.
- Timers, vote, latency, combat-tools, panel-assistant, utility-quickview, sidebar-*, broadcast.

Theming is CSS-variable based; chat card theming is documented in **documentation/architecture-chatcards.md**.

---

## 8. Data Flow and Integration Patterns

- **Hooks** — Foundry hooks drive most behavior. HookManager registers them with priorities and contexts; many subsystems (pins, canvas layer, scene updates, settings cache, chat message clicks) are wired in blacksmith.js or in their own files via HookManager.
- **Settings** — `game.settings.get/set(MODULE.ID, key)`. Settings cache in blacksmith.js with TTL; cleared on `settingChange` for the module. **registerSettings()** runs in ready.
- **Sockets** — External modules use `module.api.sockets` (or BlacksmithAPI.getSockets()) to register handlers and emit events; SocketManager routes to SocketLib or native sockets.
- **Pins** — Stored in scene flags (placed) and world setting (unplaced). PinManager CRUD and permissions; PinRenderer renders on BlacksmithLayer; canvasReady and updateScene trigger load. See **documentation/architecture-pins.md**.
- **Rolls** — Skill checks and other flows use **manager-rolls.js** (orchestrateRoll, processRoll, deliverRollResults, executeRoll); cinema overlay updates are triggered via sockets. See **documentation/architecture-rolls.md**.

---

## 9. External API Usage

Other modules should:

1. Depend on `coffee-pub-blacksmith` and optionally `api/blacksmith-api.js` for timing-safe access.
2. Use **BlacksmithAPI.get()** (or **BlacksmithAPI.waitForReady()**) before using any API.
3. Register as a Coffee Pub module via **module.api.registerModule()** if integrating with ModuleManager.
4. Use **module.api** (or BlacksmithAPI helpers) for: hooks, utils, stats, toolbar, menubar, sockets, pins, chat cards, canvas layer, etc., as documented in the respective api-* and architecture-* docs.

Debug helpers on `window` (e.g. **BlacksmithAPIDetails**, **BlacksmithAPIHooks**) are available for development.

---

## 10. References to Detailed Architecture Docs

| Topic | Document |
|-------|----------|
| Pins (storage, renderer, schema, API) | **architecture-pins.md** |
| Token/portrait image replacement | **architecture-imagereplacement.md** |
| SocketManager (SocketLib, API, migration) | **architecture-socketmanager.md** |
| Chat cards (themes, layout, migration) | **architecture-chatcards.md** |
| Roll system (4-function, execute, cinema) | **architecture-rolls.md** |
| Stats (combat, player, API) | **architecture-stats.md** |
| Toolbar manager | **architecture-toolbarmanager.md** |
| Broadcast mode | **architecture-broadcast.md** |
| XP system | **architecture-xp.md** |
| HookManager | **architecture-hookmanager.md** |
| Core utilities | **architecture-core.md** |
| API references (pins, menubar, toolbar, stats, etc.) | **api-*.md** |

---

## 11. Migration Plan: God Module Cleanup and Target Architecture

This section captures the planned evolution of Blacksmith from its current "god module" bootstrap file toward a clearer core + services architecture. It is forward-looking; the rest of this document describes the **current** architecture.

### 11.1 Current State / God Module Indicators

**blacksmith.js** today acts as a central bootstrap with many responsibilities:

- **Size and imports**: Large file (1800+ lines), 30+ imports from managers, APIs, windows, timers, sidebars.
- **Responsibilities**: Module/Utils/Hook initialization; system init (timers, combat, vote, broadcast); canvas (hookCanvas, toolbar); SocketManager; `module.api` exposure; caches (templates, settings, DOM).
- **Mixed concerns**: Infrastructure, business logic, UI wiring, and caching in one place.

The **current** bootstrap flow, API surface, and subsystems are documented in sections 2–4 and 8 above. Manager files (`manager-*.js`), hook patterns (HookManager), and module dependencies are in place; the migration plan aims to reduce the weight of blacksmith.js and clarify what stays in "core" vs. extractable services.

### 11.2 Endstate Vision: Blacksmith as Coffee Pub Ecosystem Core

Blacksmith is intended to remain the **central hub** for Coffee Pub modules, providing:

- **Module registration & management** — Register, activate, deactivate modules.
- **Inter-module communication** — Coordinate between Coffee Pub modules (e.g. sockets, hooks).
- **Shared infrastructure** — Common tools, variables, and managers (HookManager, SocketManager, ModuleManager, etc.).
- **Hook coordination** — Prevent conflicts (e.g. no duplicate hooks on tokens).
- **Universal debugging** — Shared `postConsoleAndNotification` and related helpers.
- **Shared variables** — Common `COFFEEPUB` / BLACKSMITH-style variables.
- **Premium vs. free management** — Module licensing and feature control (future).
- **Theme & settings management** — Universal theming and configuration.
- **Toolbar / menubar management** — Centralized toolbars and menubar for all modules.

### 11.3 Module Extraction Strategy

**Planned extraction to separate modules (future):**

- **service-regent.js** → `coffee-pub-regent` (AI tools)
- **service-combat.js** → `coffee-pub-combat` (Combat tools)
- **service-rolling.js** → `coffee-pub-rolling` (Rolling tools)
- **service-encounters.js** → `coffee-pub-encounters` (Encounter tools)
- **service-journal.js** → `coffee-pub-journal` (Journal tools)

**Planned to stay in Blacksmith core:**

- **manager-hooks.js** — Hook coordination (shared infrastructure)
- **manager-sockets.js** — Inter-module communication (shared infrastructure)
- **manager-modules.js** — Module management (core)
- **manager-themes.js** — Theme management (core) — to be clarified/created as needed

### 11.4 Target Architecture

**Flat structure (confirmed):**

```
scripts/
├── manager-*.js       # Shared infrastructure (hooks, sockets, modules)
├── service-*.js       # Feature-specific services (combat, rolling, tokens)
├── window-*.js        # UI components
├── timer-*.js         # Timer functionality
├── stats-*.js         # Statistics functionality
└── [existing files]   # Keep current working structure
```

**Naming conventions:**

- **manager-*.js** — Things that "manage" (hooks, sockets, modules).
- **service-*.js** — Feature-specific business logic (extractable to separate modules later).
- **window-*.js** — UI components.
- **timer-*.js** / **stats-*.js** — Timer and statistics functionality.

**Service scope guidelines:**

- Target roughly 200–500 lines per service.
- Single responsibility; maintainable and testable.
- Designed so services can be extracted to separate modules later.

### 11.5 Migration Phases

1. **Phase 1: Current state analysis** — Analyze blacksmith.js, document architecture, identify working vs. broken areas, map dependencies (this document and related architecture docs support that).
2. **Phase 2: Complete existing work** — Fix rolls system and hooks migration; ensure all current functionality works before structural refactors.
3. **Phase 3: Service architecture** — Introduce service classes, move business logic into services, have HookManager route to services, keep flat structure.
4. **Phase 4: Module extraction** — Extract services to separate modules (regent, combat, rolling, encounters, journal); implement/refine module registration, inter-module communication, and shared infrastructure coordination.

### 11.6 Key Questions and Next Steps

- **blacksmith.js**: What can be extracted to services? What must stay in core?
- **Current work**: What's blocking rolls and hooks? What dependencies are missing?
- **Architecture**: Which units stay as managers vs. become services? How should HookManager route to services?

**Immediate priorities:** Complete existing work (rolls, hooks) and stabilize functionality before executing god-module refactoring or extraction.

---

*This document summarizes the Blacksmith module’s overall architecture as of the current codebase. For implementation details and API contracts, use the linked documentation.*
