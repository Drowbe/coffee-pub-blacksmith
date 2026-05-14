# TODO - Active Work and Future Ideas

**Master list:** This file contains all todos referenced in architecture and API documentation. **Process:** When a task is completed, add it to **`CHANGELOG.md`**, then remove it from this file and from any completed-task language in API/architecture docs.

## Performance & memory (stack rank)

Mirrors **`documentation/PERFORMANCE.md`** — active investigation items; update both when status changes.

| Rank | Severity | Area | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | High | Encounter toolbar global observer/polling lifecycle | Done | `dispose` + `closeGame`; full checklist in `PERFORMANCE.md` |
| 2 | High | Journal page pins observer/polling lifecycle | Done | Duplicate `Hooks.on` removed (HookManager-only); see `PERFORMANCE.md` |
| 3 | High | Duplicate journal monitoring pipelines | Done | Phase C: shared `JournalDomWatchdog` |
| 4 | Medium | Menubar full rerenders on frequent update paths | Mitigated | Fingerprint + leader-only full render; see `PERFORMANCE.md` §4 |
| 5 | Medium | Timer loops: global DOM queries/rerenders | Mitigated | Cached DOM in `timer-round.js`, `timer-planning.js`, `timer-combat.js`; see `PERFORMANCE.md` §5 |
| 6 | Medium | Socket native fallback listener lifecycle | Done | See `PERFORMANCE.md` §6 |
| 7 | Low | Legacy/no-op hooks and stale cleanup | Done | Pass 1; see `PERFORMANCE.md` §7 |

## Settings & feature gating

Canonical tracking table, load-gate vs on/off notes, and file references: **`documentation/plan-settings.md`**.

| Priority | Item | Status | Notes |
| --- | --- | --- | --- |
| High | **Round timer** — register hooks + `setInterval(1000)` only when the feature is enabled | Not started | Same pattern as combat timer; see `plan-settings.md` #6 and `PERFORMANCE.md` (round timer registration row) |
| Medium | **Planning timer** — defer `HookManager` registration until enabled, or keep early-return | Not started | `plan-settings.md` #7 |
| Medium | **Combat / player stats** — optional dynamic import when tracking off | Not started | `plan-settings.md` #8–9; shrinks cold path |
| Low | **Menubar toggles** — `menubarShowSettings` / `menubarShowRefresh` exist in settings but tools use `visible: false` without reading them | Not started | Wire `visible` + `onChange` → `MenuBar.renderMenubar` (same pattern as former pins toggle) |

**Done (recorded in `CHANGELOG.md` / `plan-settings.md`):** Developer Tools **→ System** layout; performance monitor + latency settings hierarchy; **Pins** hamburger-only + **Layout → Pins**; latency **ping/pong/latencyUpdate** handlers always registered (processing gated on `enableLatency`).

## CRITICAL BUGS

### Post-rename compatibility shims — verify consumers, then remove (#1)
- **Issue**: After script renames, **thin shims** remain so stale URLs do not 404: `scripts/common.js` → `utility-common.js`, `scripts/journal-page-pins.js` → `ui-journal-pins.js`, `scripts/window-base-v2.js` → `window-base.js`. Blacksmith’s **canonical** imports are already correct; passing in-game tests does **not** prove nothing external still hits the old paths.
- **Status**: PENDING — keep shims until verified.
- **Need**:
  1. **Search** other modules you ship or depend on (and any published `module.json` / dynamic `import()` strings) for: `coffee-pub-blacksmith/scripts/common.js`, `journal-page-pins.js`, `window-base-v2.js` (and path fragments that imply those files).
  2. **Update** any consumer still pointing at shim URLs to canonical files or, for the window base, to **`module.api.BlacksmithWindowBaseV2`** / **`getWindowBaseV2()`** per `documentation/api-window.md`.
  3. **Remove shims** in a dedicated release after search is clean (or after one release cycle of overlap); reload worlds and confirm **no 404** in the network tab for those script URLs.
- **Priority**: CRITICAL — required to close rename technical debt and confirm the ecosystem is not relying on legacy paths.

### Application V1 deprecation (CSSEditor / FormApplication)
- **Issue**: Core logs compatibility warning: *The V1 Application framework is deprecated; use Application V2 (`foundry.applications.api.ApplicationV2`).* Backwards-compatible support will be removed in Foundry v16.
- **Stack trace (example)**: `new FormApplication` → `new CSSEditor` (`window-gmtools.js`) → `blacksmith.js` (init path).
- **Status**: PENDING – Migrate to Application V2.
- **Location**: `scripts/window-gmtools.js` (`CSSEditor` extends `FormApplication`), callers in `scripts/blacksmith.js` and any other references.
- **Need**:
  - Replace `CSSEditor` with an `ApplicationV2` + `HandlebarsApplicationMixin` (or equivalent) implementation per project rules (Foundry v13+).
  - Follow `documentation/applicationv2-window/guidance-applicationv2.md` and `documentation/api-window.md`.
  - Remove V1 `Application` / `FormApplication` usage for this window; audit other Blacksmith windows still on V1 for the same migration.
- **Priority**: CRITICAL – Required before v16 removes V1 support.

### Chat Card API (first-class CRUD + docs)
- **Issue**: Theme helpers exist (`module.api.chatCards` → `scripts/api-chat-cards.js`: `getThemes`, `getThemeClassName`, etc.), but there is no first-class API for **creating/updating/deleting** chat messages/cards the way pins expose CRUD.
- **Status**: PENDING – narrow the gap vs pins/chat integration expectations
- **Location**: `scripts/api-chat-cards.js`, `scripts/blacksmith.js` (`module.api.chatCards`), consumers in roll/skill-check flows
- **Need**:
  - Decide contract: `chatCards.createMessage` / `updateMessage` / helpers that wrap `ChatMessage.create` + Blacksmith card HTML, or document “use Foundry chat + these theme helpers only.”
  - Document in `documentation/guides/` or `api-chat-cards` wiki once contract is fixed
- **Priority**: CRITICAL – if external modules must post themed cards programmatically

### Memory Leak Investigation
- **Issue**: Historical tab runaway (non-heap growth / crash) was tracked; **current builds are not reproducing** the old browser-tab growth pattern.
- **Status**: ACTIVE (fresh baseline) — see `documentation/PERFORMANCE.md` for current stack rank, findings, and plan (lifecycle teardown for observers/timers, journal monitor consolidation, menubar/timer hotspots, legacy cleanup).
- **Next Step**: Execute plan in `documentation/PERFORMANCE.md` § “Plan (Next Review Cycle)”; align with **`documentation/plan-settings.md`** for timer gating (#6–7); re-profile after targeted fixes; downgrade to MONITORING if stable.
- **Location**: `documentation/PERFORMANCE.md` (canonical).

## MEDIUM BUGS

### Timed sound (duration) when broadcast does not stop for other players
- **Issue**: When `playSound(sound, volume, loop, true, duration)` is called with broadcast and a duration, the sound is supposed to loop for N seconds then stop on all clients. Currently it does not stop for other players—only the initiating client stops after the duration.
- **Status**: PENDING
- **Location**: `scripts/api-core.js` (playSound, playSoundLocalWithDuration), `scripts/manager-sockets.js` (playSoundWithDuration handler)
- **Need**: Ensure each client that receives the `playSoundWithDuration` socket event both plays the sound locally and stops it after `duration` seconds (e.g. verify handler is invoked on all clients, that each client gets the same payload, and that the returned Sound from `AudioHelper.play` is the one being stopped in the setTimeout). If SocketLib’s `executeForAll` does not run on the initiating client, consider having the initiator also call `playSoundLocalWithDuration` locally so all clients behave the same.

### Movement sound start/stop (loop and stop when token stops)
- **Issue**: Walking/movement sound was implemented to start when a token moves and stop when movement ends (loop while moving, stop when idle). The start/stop events are broken and the sound never stops. Workaround in place: movement sound now plays once per movement update (no loop, no watcher).
- **Status**: PENDING – Workaround: play once per move in `handleMovementSounds`; proper fix not yet done.
- **Location**: `scripts/token-movement.js` – `handleMovementSounds`, `ensureMovementSoundWatcher`, `clearMovementSoundWatcher`, `stopMovementSoundForToken`, `movementSoundByTokenId`, `movementSoundStopTimers`
- **Need**: Fix the logic so that (1) sound starts/loops when token moves, (2) sound stops when token has not moved for the configured interval. Ensure stop timers and watcher correctly stop the sound on all clients; investigate why the current implementation never stops (e.g. watcher not firing, stop not broadcast, key mismatch).

### Verify Loot Token Restoration
- **Issue**: Ensure tokens converted to loot piles reliably restore their original images after revival
- **Status**: PENDING – needs validation pass
- **Location**: `scripts/manager-canvas.js` (`CanvasTools` token conversion / dead-to-loot paths); related helpers may live in `scripts/api-tokens.js` – confirm when testing
- **Need**: Regression testing across scenarios (various token types, scene reloads, Item Piles enabled/disabled). Reconcile any world settings names with current `settings.js` (older names like `tokenConvertDeadToLoot` may have changed).


## ENHANCEMENTS

### High Priority

#### Card CSS migration to theme system
- **Issue**: Card-type CSS files (`cards-xp.css`, `cards-skill-check.css`, `cards-stats.css`) still use hardcoded colors; they should use the CSS variable theme system for consistency and themeability.
- **Status**: PENDING – Checklist and strategy documented
- **Location**: `documentation/architecture-chatcards.md` → “Migration (internal)” → “Card CSS migration checklist (detailed)”; `styles/cards-xp.css`, `styles/cards-skill-check.css`, `styles/cards-stats.css`
- **Need**: Replace hardcoded colors with `var(--blacksmith-card-*)`; add XP/skill-check/stats-specific or semantic variables where needed; define new variables in `cards-common-layout.css` / `cards-common-themes.css`; test all card types with all themes.
- **Priority**: High – Improves theme consistency and maintainability

### Medium Priority

#### Roll system: Query window integration (architecture-rolls Phase 1.3)
- **Issue**: Query window does not use `orchestrateRoll()`; needs to use unified 4-function flow for cross-client sync.
- **Status**: PENDING
- **Location**: `documentation/architecture-rolls.md`, `scripts/window-query.js`
- **Need**: Modify `window-query.js` to use `orchestrateRoll()`; replace direct `SkillCheckDialog` creation; test cross-client sync. Then Phase 2–4 (architecture unification, validation, production readiness) per architecture-rolls.md.

#### Roll system: System selection respect
- **Issue**: `processRoll()` does not respect `diceRollToolSystem`; hardcoded to Blacksmith roll path.
- **Status**: PENDING
- **Location**: `scripts/manager-rolls.js`, `documentation/architecture-rolls.md`
- **Need**: `processRoll()` respects `diceRollToolSystem`; implement Foundry roll path when selected; document in api-rolls when that doc exists.

#### Rolls API as first-class surface
- **Issue**: Rolls may still be exposed via nested `BLACKSMITH` helpers; there is no dedicated `module.api.rolls` namespace and no `documentation/api-rolls.md` yet.
- **Status**: PENDING – Future enhancement
- **Location**: `scripts/blacksmith.js` (module.api assignment); add `documentation/api-rolls.md` when stable
- **Need**: Expose a first-class rolls surface (e.g. `module.api.rolls = { execute: ... }`); document for developers leveraging the roll system.
- **Priority**: Medium – Improves discoverability and consistency with pins/chatCards/stats APIs

#### Unified Flags system (cross-feature)
- **Status**: IN PROGRESS – infrastructure complete; journal pins wired; pins storage migration pending.
- **Architecture doc**: `documentation/architecture/architecture-flags.md`
- **API doc**: `documentation/api/api-flags.md`
- **Completed**:
  - Architecture and API docs written (all design decisions resolved)
  - `scripts/manager-flags.js` (FlagManager), `scripts/api-flags.js` (FlagsAPI), `scripts/widget-flags.js` (FlagWidget)
  - `resources/flag-taxonomy.json` — unified taxonomy for all coffee-pub contexts
  - 5 settings registered: `flagAssignments`, `flagRegistry`, `flagVisibility`, `flagTaxonomyOverrideJson`, `flagsMigrationComplete`
  - `game.modules.get('coffee-pub-blacksmith').api.flags` live on init
  - One-time migration shim: seeds `flagRegistry` from `pinTagRegistry` on first GM load
  - Journal pins taxonomy/registry lookups redirected to FlagsAPI (`ui-journal-pins.js`, `window-pin-configuration.js`) — **verified working**
- **Remaining (pins storage migration)**:
  1. `manager-pins.js` `deleteTagGlobally` / `renameTagGlobally` — also update `flagAssignments` for pin context
  2. `api-pins.js` tag methods — wrap to delegate to FlagsAPI (keep existing signatures)
  3. ~~On pin create/update: mirror `pin.tags[]` into `flagAssignments` via `flags.setFlags()`~~ **DONE** — `_mirrorFlagsForPin()` called at all 5 write sites in `manager-pins.js`
  4. ~~On pin delete: call `flags.deleteRecordFlags()` to clean up assignments~~ **DONE** — `_clearFlagsForPin()` called at both delete sites
  5. After one release: drop `pin.tags[]` from schema; read only from `flagAssignments`
  6. Migrate `pinTagRegistry` world setting → `flagRegistry` (shim already seeds on first run)
- **Priority**: Medium – Core system working; remaining work is pins storage migration

#### Menubar API: Move party tool code out of api-menubar.js
- **Issue**: Party bar registration, party tools (Deployment Pattern, Deploy Party, Vote, Statistics, Experience, Clear Party), party health progressbar, and party-bar refresh logic live in `api-menubar.js`, making that file a mix of API and experience code.
- **Status**: PENDING
- **Location**: `scripts/api-menubar.js` (party tool registration, `_registerPartyTools`, `_refreshPartyBarInfo`, canvasReady hook for party bar), move to a dedicated module (e.g. `scripts/manager-party-bar.js` or similar).
- **Need**: Move all party-specific registration and refresh logic into a manager that uses the public menubar API (`registerMenubarTool`, `registerSecondaryBarItem`, `updateSecondaryBarItemInfo`, etc.). Keep `api-menubar.js` pure API only (registration surface, render, click/context handlers, no built-in party/encounter/combat content). Invoke the party-bar manager from `blacksmith.js` or a central init path after MenuBar is ready.
- **Priority**: Medium – Keeps api-menubar.js pure and aligns with reputation/combat bar pattern (managers own experience, API owns surface).

#### Toolbar Phase 4: Testing & Validation (architecture-toolbarmanager)
- **Issue**: Toolbar Phases 1–3 are done; Phase 4 (testing and validation) remains.
- **Status**: PENDING
- **Location**: `documentation/architecture-toolbarmanager.md`, `scripts/manager-toolbar.js`
- **Need**: Test tool registration/unregistration; verify compatibility with existing modules; **Foundry v13+ only** (per project target); validate API stability.

#### Embedded other-module variables (Squire / panel-notes)
- **Issue**: Blacksmith code embeds constants that belong to other modules (e.g. Squire), creating tight coupling and fragility if those modules change IDs or naming.
- **Status**: PENDING – Investigate
- **Location**: `_Migration/panel-notes.js` (e.g. lines 40–45: `NOTE_PIN_ICON`, `NOTE_PIN_CURSOR_CLASS` / `squire-notes-pin-placement`, `NOTE_PIN_TYPE` / `coffee-pub-squire-sticky-notes`).
- **Need**: Understand why these are hardcoded in Blacksmith; consider moving to Squire, consuming via a Squire/Blacksmith API, or documenting the coupling and any migration path.

#### Pins: Full automated tests and Phase 4–5 (architecture-pins)
- **Issue**: Pins API and rendering are in place; full automated tests and Phase 4–5 (documentation, validation) remain.
- **Status**: PENDING
- **Location**: `documentation/architecture-pins.md`, `scripts/manager-pins.js`, `scripts/pins-renderer.js`
- **Need**: Full automated tests; complete Phase 4–5 documentation and validation items. TODO.md is the master list; remove items when completed and added to CHANGELOG.

#### Pin Text Display System
- **Issue**: Pin text property exists but is not displayed. Need to implement text display system similar to Foundry's note/token text.
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/pins-schema.js`, `scripts/pins-renderer.js`, `styles/pins.css`
- **Need**: 
  - **Text Layout Options:**
    - Text under icon (default/standard)
    - Text around icon (wrapping around circular/square pin)
  - **Text Display Options:**
    - Text always on
    - Text on hover
    - Never show text
    - Only GM sees text
  - **Text Format Options:**
    - Color (configurable)
    - Size (configurable)
    - Length before ellipsis (truncation with "...")
    - Drop shadow (honor pin's `dropShadow` setting)
  - Add text display properties to `PinData` schema
  - Render text element in pin DOM structure
  - CSS styling for text positioning and formatting
  - Permission checks for GM-only text visibility

#### Configure Pin
- **Issue**: Add pin configuration functionality accessible both programmatically (via API) and via right-click context menu
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-pins.js`, `scripts/pins-renderer.js` (context menu)
- **Need**: 
  - API method: `pins.configure(pinId, options?)` - Opens configuration dialog for a pin
  - Context menu item: "Configure Pin" - Opens configuration dialog from right-click menu
  - Configuration dialog should allow editing all pin properties (text, image, shape, style, size, ownership, text display options, etc.)
  - Should respect permissions (only users who can edit the pin can configure it)

#### Hide Dead and Skip Dead Options for Menubar and Combat Tracker
- **Issue**: Need options to hide and skip dead combatants in menubar and combat tracker
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-menubar.js`, `scripts/combat-tracker.js`
- **Need**: Settings for `menubarHideDead`, `menubarSkipDead`, `combatTrackerHideDead` with filtering logic

#### Hide Initiative Roll Chat Cards
- **Issue**: Initiative roll chat cards clutter the chat log
- **Status**: PENDING - Needs implementation
- **Location**: Initiative roll handling (combat-tracker.js or combat-tools.js)
- **Need**: Setting to hide initiative roll cards (for all users or players only), while maintaining functionality

#### Query Tool Review and Improvements
- **Issue**: Query tool needs comprehensive review and fixes for functionality and UX
- **Status**: PENDING - Needs review and implementation
- **Location**: `scripts/window-query.js`
- **Need**: Verify all tabs work, review/fix drop functionality design, fix JSON generation

#### Expand Rulebook Selection Phase 2
- **Issue**: phase 1 now uses `Number of Rulebooks`, rulebook compendium dropdowns, and `Custom Rulebooks`; phase 2 may still want curated/common-book shortcuts
- **Status**: PENDING
- **Location**: `scripts/settings.js`, `scripts/manager-campaign.js`
- **Need**: Decide whether to add common-rulebook presets/checkboxes on top of the current compendium-driven model

#### Refactor Compendium Settings into Reusable Function
- **Issue**: Compendium settings have repeated code patterns that could be consolidated
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/settings.js`
- **Need**: Create `registerCompendiumSettings(type, displayName, numCompendiums, group)` function to replace repeated loops

#### Combat Stats - Review and Refactor
- **Issue**: Combat stats system needs review and potential refactoring
- **Status**: PENDING - Needs investigation and planning
- **Location**: `scripts/stats-combat.js`, potentially `scripts/stats-player.js`
- **Need**: Review implementation, identify unused code/duplicates, check performance, review UI/UX

#### Clarity / Quickview (GM-only vision aid)
- **Issue**: GM-only local brightness filter and token vision override feature needs verification and finalization
- **Status**: IN PROGRESS
- **Location**: `scripts/utility-quickview.js`
- **Remaining**: Verify player client sees no change, decide overlay behavior, confirm fog opacity, lifecycle sanity checks, remove debug logging, add changelog entry

### Low Priority

#### Configure Pin — Section Checkbox Label Size Inheritance Bug
- **Issue**: The "Update All" / "Default" checkbox labels in section headers render too small. `font-size` overrides in `.blacksmith-pin-config-section-check-label` (including absolute `px` values) have no visible effect, suggesting the label text is controlled by an ancestor rule or Foundry's CSS reset that overrides the element styles.
- **Status**: PENDING — `font-size: 11px`, `text-transform: none`, and `line-height: 1.4` are set on the label but not applying. Needs investigation into Foundry's CSS cascade for Application V2 windows.
- **Location**: `styles/window-pin-config.css` (`.blacksmith-pin-config-section-check-label`), `templates/window-pin-config.hbs`

#### Pins: Selection state + keyboard actions
- **Issue**: No concept of a "selected" pin — clicking fires the click event but nothing persists. Desired: click selects a pin (visual ring), selection clears on click-elsewhere or Escape, keyboard actions operate on the selected pin (Delete key → delete with permission check).
- **Status**: PENDING — design validated; no performance concern (pins are a pure DOM overlay, so a single `pointerdown` delegated listener on `#blacksmith-pins-overlay` + a `document` `keydown` handler is sufficient)
- **Location**: `scripts/pins-renderer.js` (selection state, CSS class, deselect-on-outside-click), `scripts/manager-pins.js` (keyboard delete), `scripts/api-pins.js` (expose `getSelectedPin()`, `selectPin()`, `deselectPin()`)
- **Need**:
  - Track selected pin ID in renderer (`PinDOMElement._selectedPinId`)
  - Apply `is-selected` CSS class to selected pin element; define ring/outline style in `styles/pins.css`
  - `pointerdown` on `#blacksmith-pins-overlay`: if target is a pin element, select it; if target is the container itself, deselect
  - `document` `keydown`: Delete/Backspace → delete selected pin (respecting permissions); Escape → deselect
  - Expose `pins.getSelectedPin()`, `pins.selectPin(pinId)`, `pins.deselectPin()` on the public API
  - Fire `blacksmith.pins.selected` / `blacksmith.pins.deselected` hooks so other modules can react
  - First keyboard action milestone: Delete key deletes the selected pin
- **Priority**: Low — good UX foundation for future keyboard-driven pin management

#### Migrate Combat Hooks to lib-wrapper
- **Issue**: Using Foundry hooks for Combat methods that should be wrapped with lib-wrapper instead
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/stats-combat.js`, `scripts/combat-tracker.js`, `scripts/timer-combat.js`, `scripts/manager-libwrapper.js`
- **Need**: Replace `combatStart`, `updateCombat`, `endCombat`, `deleteCombat` hooks with lib-wrapper wrappers for Combat prototype methods


## TECHNICAL DEBT

### jQuery Detection Pattern is Technical Debt
- **Status**: TECHNICAL DEBT – cleanup target now that **v13+ is the supported platform**
- **Priority**: MEDIUM – Reduce over time as call sites are proven native-DOM-only
- **Location**: Multiple files using jQuery detection pattern

**Why This Pattern is Problematic**

In FoundryVTT v13, jQuery is removed from the core UI stack. `html` parameters should be native DOM elements.

The jQuery detection pattern is defensive for legacy callers; prefer fixing at the source.

**What We Should Do Instead**

**Long-term:**
- Ensure call sites pass native DOM elements consistently
- Remove jQuery detection where the source is guaranteed native DOM
- TypeScript or explicit checks at call sites can enforce this

**Short-term:**
- Keep only where a hook still occasionally passes jQuery-shaped objects
- Track which methods use this pattern and why

**The Real Question**

**Where is `html` coming from that might be a jQuery object?**
- If it's from FoundryVTT's Application classes: they should return native DOM in v13, so the check isn't needed
- If it's from our code: fix the call sites to pass native DOM
- If it's unknown: keep the check temporarily, but track and fix the sources

**Bottom Line**

Keep jQuery detection during migration, but treat it as technical debt. Once all call sites are confirmed to pass native DOM elements (especially when elements come from `querySelector()` which always returns native DOM), remove the detection code.

**Action Item:** After migration, audit all jQuery detection patterns and remove those where the source is guaranteed to be native DOM (e.g., `querySelector()` results).

**Migration Task:**
- [ ] Identify which detections are unnecessary (source is guaranteed native DOM) - **IN PROGRESS** - Testing required
- [ ] Remove unnecessary jQuery detection code - **PENDING** - Awaiting test results
- [ ] Create test cases to verify native DOM is always passed - **PENDING** - See audit report testing plan

**Audit Status:** Initial audit complete. Found 74 instances across 5 categories. Key finding: Inconsistency in `activateListeners(html)` and `this.element` handling suggests some detections may be unnecessary. Testing plan created to verify necessity. See `documentation/jquery-detection-audit.md` for full report.

### Socketmanager Becoming Monolithic
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Status**: PENDING - Needs refactoring
- **Proposed Solution**: Socketmanager should ONLY manage socket registration/cleanup (like hookmanager), business logic should be moved elsewhere


## DEFERRED

## BACKLOG

### Targeted By
- Add some way to see who is targeting things

### Token Outfits
- Allow for token outfits - extend token/artwork workflows (historically tied to image replacement; **revisit if/when** a supported image pipeline exists in core or a companion module)

### Rest and Recovery
- Allow for long and short rests with configurable food/water consumption and spell slot recovery

### Auto-Roll Injury Based on Rules
- Automatically trigger injury rolls based on configurable rules/conditions (HP thresholds, critical hits, massive damage, etc.)

### Multiple Image Directories for Token Image Replacement
- Allow users to configure multiple image directories with priority order (deferred until a dedicated image pipeline is back in scope for Blacksmith or a companion module)

### No Initiative Mode
- Alternative combat mode where GM manually controls turn order instead of initiative rolls

### Export Compendium as HTML
- Export compendium contents as formatted HTML document for sharing, printing, or archiving

### CODEX-AI Integration
- Integrate CODEX system with AI API for cost-efficient context management, replace conversation history with relevant CODEX entries (likely **outside core Blacksmith** – e.g. Regent or a dedicated AI module; clarify product ownership before implementation)
