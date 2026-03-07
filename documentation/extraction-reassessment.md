# Extraction Reassessment: Core Engine + Optional Modules

**Context:** Blacksmith becomes a core engine (APIs + focused QoL). Optional features move to separate modules that **consume** Blacksmith’s existing APIs (menubar, toolbar, secondary bar, sockets, chatCards themes, hooks, utils). Registration and init move into the new modules (same pattern as Herald). No code changed in this doc—assessment only.

**Planned splits:**
- **Timers + Stats** → one module (together).
- **Encounter** → XP, rolls, combat tracker / combat bar tools (single module); optionally keep in core.
- **Image / tokens** → Image replacement, dead tokens, etc. (single module).
- **Blacksmith** → Keeps all core reusable APIs + a curated set of QoL enhancements.

---

## API docs: fit for external ownership

Existing docs already support “feature lives in another module, registers via API”:

- **registering-with-blacksmith.md** – Get API at `ready`, register menubar tools, secondary bar, pins, sockets; cleanup on unload. Herald and Squire follow this.
- **api-menubar.md** – `registerMenubarTool`, secondary bar (`registerSecondaryBarType`, `registerSecondaryBarItem`, `registerSecondaryBarTool`, `openSecondaryBar`, etc.), visibility override. No requirement that tools be implemented inside Blacksmith.
- **api-toolbar.md** – `registerToolbarTool`, zones, visibility. Same idea.
- **api-chatcards.md** – Theme-only today (getThemes, getThemeClassName, etc.). Cards are “consumer renders template + ChatMessage.create” using the shared HTML/CSS contract and theme classes. A new module can own its card templates and still use `blacksmith.api.chatCards` for theme lookup; no need for a full create/update/delete API for extraction.
- **api-sockets.md** – `sockets.register()`, `sockets.emit()`. New modules register their own handlers.
- **api-core.md** – utils, playSound, etc. Consumed by any module.

So “it’s woven into core” is not a blocker: the new module gets the API in `Hooks.once('ready', ...)` and does its own init and registration. Blacksmith simply **stops** initializing that feature and **stops** registering those tools; the new module does both.

---

## 1. Timers + Stats (single module)

**Scope to move:**  
`timer-combat.js`, `timer-planning.js`, `timer-round.js`, `stats-combat.js`, `stats-player.js`, `api-stats.js`, `window-stats-party.js`, `window-stats-player.js`, all stats card templates and `cards-stats.css`, timer templates/styles, settings keys and lang for timers and stats, socket handlers for timer sync (`combatTimerAdjusted`, `planningTimerAdjusted`, `timerCleanup`).

**What stays in Blacksmith:**  
HookManager, SocketManager, api-menubar (generic secondary bar and menubar), api-core (getSettingSafely, playSound, etc.). Blacksmith **removes** imports and calls to CombatTimer, PlanningTimer, RoundTimer, CombatStats, CPBPlayerStats, and **removes** registration of timer/stats menubar tools (and any party-bar stats tools). Stats/timer tools are registered by the new module via `registerMenubarTool` / secondary bar API.

**Pattern:**  
New module entry (e.g. `ready`): `blacksmith = game.modules.get('coffee-pub-blacksmith')?.api`; then `CombatStats.initialize()`, `CombatTimer.initialize()`, `PlanningTimer.initialize()`, `RoundTimer.initialize()`; register timer/stats menubar tools and party-bar items via `blacksmith.registerMenubarTool`, `blacksmith.registerSecondaryBarItem`, etc.; register socket handlers via `blacksmith.sockets.register()`. Same as Herald.

**Dependencies to resolve:**  
- Timers/stats use `utility-message-resolution.js` and `utility-midi-resolution.js` (attack/damage resolution for stats). Either move those into the Timers+Stats module or expose a small “attack/damage event” API from Blacksmith used by the module. Latter keeps resolution in core if other systems need it.
- Chat cards: stats cards use the shared `.blacksmith-card` contract and theme classes. New module keeps its own card templates and uses `blacksmith.api.chatCards.getThemeClassName()` (and shared layout/themes in Blacksmith). Optionally move `cards-stats.css` into the module and load it there so stats-specific styling lives with the feature.

**Level of effort: High (tractable)**  
- One new module manifest, move ~10+ files, move settings/lang, cut/paste menubar and party-bar registration from api-menubar into the new module, move socket registration from manager-sockets into the new module (or register via `blacksmith.sockets` from the new module).
- Main risk: ensuring all hook/socket usage is correctly moved and no leftover references in Blacksmith.

**Recommendation: Recommended**  
- Fits the “core engine + optional module” goal.  
- Timers and stats stay together; coupling is internal to the new module.  
- Pattern is proven (Herald). Effort is high but bounded.

---

## 2. Encounter (XP + rolls + combat tracker / combat bar)

**Scope to move:**  
XpManager, manager-rolls.js, window-skillcheck.js, roll config/cinema windows, schema-rolls, dictionary (skill/ability/save/tool descriptions), **CombatTracker** and **combat bar** (secondary bar type `combat`, its template, data prep, and event handlers), openRequestRollDialog, BLACKSMITH.rolls.execute, skill-check chat hook and handleSkillRollUpdate routing, combat-bar socket/cinema handlers, XP UI and party bar XP tools.

**What stays in Blacksmith:**  
Menubar and secondary bar as **generic** infrastructure. No combat bar type, no combat-tracker/combat-window/create-combat tools, no roll execution or request-roll dialog, no XP. Chat card theme API and contract stay so Encounter can still render skill-check and other cards using the same themes.

**Main difficulty: combat bar is inside api-menubar.js**  
Today the combat bar is a custom secondary bar implemented inside MenuBar: CombatTracker import, `openCombatBar` / `closeCombatBar` / `updateCombatBar`, combatant list template, initiative roll and other event handlers, and the menubar tools `combat-tracker`, `combat-window`, `create-combat`. To extract Encounter:

- **Option A:** Encounter module owns CombatTracker and all combat-bar logic. It registers the combat bar via `blacksmith.registerSecondaryBarType('combat', { templatePath: 'modules/coffee-pub-encounter/...' })` and uses `blacksmith.openSecondaryBar('combat', { data })` / `updateSecondaryBar(data)` with data it prepares. Event handling (e.g. roll initiative) must move into Encounter (e.g. handlers attached when the bar is opened, or Encounter-provided callbacks). So a large block of api-menubar.js (combat bar + CombatTracker) moves to Encounter; api-menubar becomes “generic” secondary bar only.
- **Option B:** Keep combat bar and combat tracker in Blacksmith so Encounter only owns XP, rolls, and request-roll dialog; combat bar stays “in core.” That reduces Encounter scope and avoids the big api-menubar refactor but keeps encounter-related UI in core.

**Level of effort: Very high**  
- Moving rolls, skill-check dialog, XP, and related sockets/hooks is already substantial.  
- Moving the combat bar and CombatTracker out of api-menubar is a major refactor: split generic secondary bar from combat-specific code, move templates and handlers to Encounter, and have Encounter drive combat bar data and events via the public secondary bar API.

**Recommendation: Feasible, but highest effort; optional to keep in core**  
- If the goal is a minimal core, Encounter extraction is doable with Option A and a clear boundary: Encounter owns combat bar content and behavior; Blacksmith only provides the bar chrome and API.  
- If you “toy with keeping this in core,” keeping **Encounter (XP + rolls + combat tracker/combat bar) in Blacksmith** is a reasonable choice: it avoids the largest refactor and keeps “encounter flow” in one place. You can still extract Timers+Stats and Image/tokens to shrink core and prove the pattern; Encounter can be a later phase.

---

## 3. Image replacement + dead tokens (single module)

**Scope to move:**  
manager-image-cache.js, manager-image-matching.js, token-image-replacement.js, token-image-utilities.js (including dead-token/loot conversion if it lives there), window-token-replacement (templates/styles), image replacement settings and lang, toolbar/menubar registration for “image replacement” and any dead-token tools. Optionally move `imageReplacement` API surface to the new module if other modules need to register context menu items on image tiles; otherwise the new module just owns the logic and uses Blacksmith’s toolbar/menubar APIs to add its buttons.

**What stays in Blacksmith:**  
api-core, HookManager, settings helpers used by other features. Blacksmith **removes** ImageCacheManager init, TokenImageUtilities init, and any menubar/toolbar registration for image replacement; the new module does that in its `ready` hook via `registerMenubarTool` / `registerToolbarTool`. Path helpers (`getTokenImagePaths`, `getPortraitImagePaths`) either move with the module or stay in Blacksmith as a small shared helper used by the new module (e.g. if other systems ever need them).

**Pattern:**  
New module: get API at `ready`, run ImageCacheManager.initialize() (and related init), register its tools with menubar/toolbar, register any hooks/sockets it needs. No circular dependency; image replacement does not need to be called from Blacksmith core.

**Level of effort: High (straightforward)**  
- Many settings and files, but boundary is clear.  
- Combat-tools or other Blacksmith UI that currently open “token image replacement” would either call into the new module’s API (e.g. “open image replacement window”) or that button moves to the new module’s toolbar/menubar registration.

**Recommendation: Recommended**  
- Clean separation; no tight coupling to other optional features.  
- Good candidate to do alongside or right after Timers+Stats to prove the “slim core + optional module” approach.

---

## 4. Blacksmith core after extractions

**Remains in core (engine + QoL):**  
- All public APIs: menubar, toolbar, pins, sockets, chatCards (themes + HTML/CSS contract), hooks, utils, window API, canvas layer, etc.  
- Bootstrap, module registration, loading progress, settings that are global (e.g. debug).  
- Shared infra: HookManager, SocketManager, api-core, const, compendium helpers.  
- QoL set you choose to keep: e.g. voting, latency checker, sidebar pin/style, navigation, journal tools, clarity/quickview, or similar—no need to list every one here; the principle is “reusable APIs + a focused set of enhancements that don’t belong in a feature module.”

**Removed from core (moved to optional modules):**  
- Timers + Stats → Timers+Stats module.  
- Image replacement + dead tokens → Image/tokens module.  
- Encounter (XP, rolls, combat tracker/combat bar) → Encounter module **or** kept in core by choice.

**API surface:**  
- No need to remove APIs that optional modules use (e.g. secondary bar, registerMenubarTool). Those stay and are consumed by Encounter, Timers+Stats, Herald, etc.  
- Optionally, `openRequestRollDialog` and `BLACKSMITH.rolls.execute` could become a thin passthrough to the Encounter module when present (e.g. `game.modules.get('coffee-pub-encounter')?.api?.openRequestRollDialog`), so core doesn’t depend on rolls code; that’s a design choice once Encounter exists.

---

## Summary table (reassessment)

| Extraction | Effort | Recommendation | Notes |
|------------|--------|----------------|-------|
| **Timers + Stats** | High (tractable) | **Recommended** | Same pattern as Herald; move init + tool registration to new module; resolve message/midi resolution ownership. |
| **Encounter** (XP, rolls, combat bar) | Very high | **Feasible; optional to keep in core** | Biggest lift is moving combat bar + CombatTracker out of api-menubar; keeping Encounter in core is reasonable. |
| **Image replacement + dead tokens** | High (straightforward) | **Recommended** | Clear boundary; no circular deps; good second extraction. |
| **Blacksmith core** | — | **Keep APIs + chosen QoL** | Becomes engine; optional modules consume APIs and own their registration. |

**Suggested order:**  
1) **Timers + Stats** (proves pattern, high value).  
2) **Image/tokens** (clear win, similar pattern).  
3) **Encounter** (only if you want it out of core; otherwise leave in Blacksmith).

No code was changed; this is an assessment only.
