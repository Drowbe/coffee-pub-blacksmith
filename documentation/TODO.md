# TODO - Active Work and Future Ideas

**Master list:** This file contains all todos referenced in architecture and API documentation. **Process:** When a task is completed, add it to **`CHANGELOG.md`**, then remove it from this file and from any completed-task language in API/architecture docs.

**Scope:** Blacksmith-only work. Cross-module cleanup that spans the Coffee Pub suite (doc/pack/table ownership, module extraction) lives in **`documentation/TODO-GLOBAL.md`**.

## Performance & memory

Open items only. Completed work lives in `CHANGELOG.md`; the *design* that came out of this work (shared
journal watchdog, menubar fingerprint, timer DOM caching, dead observer paths) is documented in
**`architecture/architecture-blacksmith.md` §9B**.

**Status:** not reproducing the old runaway tab-memory pattern. Remaining session cost drivers are menubar
churn and Quick View token hooks. Last validated 2026-03-28 — **stale, needs a re-run (see below).**

| Priority | Item | Files | Notes |
| --- | --- | --- | --- |
| Medium | **`QuickViewUtility` hook lifecycle** | `utility-quickview.js` | `initialize()` calls `Hooks.on` ×5 (`canvasReady` ×2, `createToken`, `updateToken`, `controlToken`) with **no stored hook IDs and no `Hooks.off`**. Handlers would stack if it ever ran twice. Also: `updateToken` while clarity mode is active forces `_hideAllTokens` + `_showAllTokens` — noisy in token-heavy scenes. Fix: store IDs, guard with `_initialized`, tear down on `closeGame`. |
| Medium | **Pin DOM cleanup not wired to world exit** | `pins-renderer.js`, `manager-pins.js` | `PinRenderer.cleanup()` is never called from `PinManager.cleanup()` or the `closeGame` path. Low risk for a single session (init is idempotent) but inconsistent with the journal `dispose` story; wire for parity and hot reload. |
| Low | **Remove dead observer paths** | `ui-journal-encounter.js`, `ui-journal-pins.js` | `_setupGlobalObserver` / `_setupActivePageChecker` / `_setupPageNavigationListener` and `_setupDomObserver` are uncalled legacy. Delete or gate behind a debug flag so they can't be accidentally re-enabled. |
| Low | **Audit for redundant direct `Hooks.on`** | suite-wide | Phase D: find features still calling `Hooks.on` directly where HookManager already wraps the same hook name. |
| Low | **Menubar: dynamic tool title changes** | `api-menubar.js` | A tool's **title** changing without a zone/active/visibility change may not refresh until something else invalidates the structure fingerprint. |
| Low | **Journal double-click observer retention** | `blacksmith.js` | `_onRenderJournalDoubleClick` may attach a per-sheet `MutationObserver` (`editModeObserver`) that lives until edit mode activates. If the sheet is closed in view mode first, confirm it's disconnected — otherwise a retained observer + DOM ref per opened journal. |
| Low | **Socket fallback teardown** | `manager-sockets.js` | Optional explicit teardown on `closeGame`. Verify no edge case leaves `_fallbackTimer` running when SocketLib never connects. |
| Low | **High-volume sidebar hook** | `sidebar-combat.js` | `Hooks.on('renderApplication')` fires on every sidebar render; the filter is cheap but call volume is high. |
| — | **Re-run the validation pass** | — | 90–180 minute GM session; compare DOM node trend, listener counts, combat responsiveness. **How to measure: `architecture/architecture-blacksmith.md` §9B.4.** If stable, downgrade status to MONITORING. |

## Settings & feature gating

The **load gate vs on/off** model is documented in `architecture/architecture-blacksmith.md` §8. Quick View,
the performance monitor, latency, and pins menubar are done — see `CHANGELOG.md`. Open:

| Priority | Item | Status | Notes |
| --- | --- | --- | --- |
| High | **Round timer** — register hooks + `setInterval(1000)` only when the feature is enabled | Not started | Same pattern as combat timer. `RoundTimer.initialize()` always registers hooks, `setInterval(1000)`, and focus/blur; `showRoundTimer` only affects the template, not registration. Note: `Hooks.once('ready', ...)` fires before settings are registered — gate must use `getSettingSafely` with fallback `true`, placed inside the ready callback only. |
| Medium | **Planning timer** — defer `HookManager` registration until enabled | Not started | All hooks register in `initialize()`; `planningTimerEnabled` is checked *inside* the handlers, so the dispatch cost remains. Gating requires deferring hook registration itself, not just the ready-phase state init. The planning timer registers during `init`, before settings exist. Non-trivial — do not attempt without full understanding of init/ready ordering. |
| Medium | **Combat / player stats** — optional dynamic import when tracking off | Not started | `CombatStats.initialize()` / `CPBPlayerStats.initialize()` already return before `_registerHooks()` when disabled, but `stats-combat.js` stays in the bundle via static imports (`blacksmith.js`, timers). Dynamic import would shrink the cold path. |
| Low | **Combat timer** — optional dynamic import | Not started | Already correctly gated (`combatTimerEnabled` false → `initialize()` returns before registering hooks). Only the static import remains. |

## CRITICAL BUGS

### Chat Card API (first-class posting + docs)
- **Issue**: Theme helpers exist (`module.api.chatCards` → `scripts/api-chat-cards.js`: `getThemes`, `getThemeClassName`, etc.), but there is no first-class API for **posting** themed chat cards. Every coffee-pub module (Squire, Minstrel, Curator, etc.) has built its own card templating system, each reusing Blacksmith's CSS but independently constructing HTML and calling `ChatMessage.create()` directly. This is the same problem that was solved for windows with `BlacksmithWindowBaseV2` — duplicate templating logic scattered across modules means bugs get fixed in some but not others and styling drifts.
- **Status**: PENDING – not current priority; tackle after bugs/performance
- **Contract decision**: Add `chatCards.post(content, options)` / `chatCards.postAnnouncement(content, options)` helpers that wrap `ChatMessage.create` + canonical Blacksmith card HTML, so modules call one API and get a correctly-structured themed card without knowing the HTML internals. Mirror the window API normalization pattern.
- **Location**: `scripts/api-chat-cards.js`, `scripts/blacksmith.js` (`module.api.chatCards`); consumers to migrate: all coffee-pub-* modules that post chat cards
- **Priority**: High – same class of problem as window normalization; do after current bug/performance pass

## ENHANCEMENTS

### High Priority

#### Card CSS migration to theme system
- **Issue**: Card-type CSS files (`cards-xp.css`, `cards-skill-check.css`, `cards-stats.css`) still use hardcoded colors; they should use the CSS variable theme system for consistency and themeability.
- **Status**: PENDING – Checklist and strategy documented
- **Location**: `documentation/architecture/architecture-chatcards.md` → "Migration (internal)" → "Card CSS migration checklist (detailed)"; `styles/cards-xp.css`, `styles/cards-skill-check.css`, `styles/cards-stats.css`
- **Need**: Replace hardcoded colors with `var(--blacksmith-card-*)`; add XP/skill-check/stats-specific or semantic variables where needed; define new variables in `cards-common-layout.css` / `cards-common-themes.css`; test all card types with all themes.
- **Priority**: High – Improves theme consistency and maintainability

### Medium Priority

#### Creature-type / subtype token naming — polish
- **Status**: Data, resolver, wiring, and per-key settings are **shipped**. Design is documented in `documentation/architecture/architecture-token-naming.md`.
- **Remaining**:
  1. **Verify in Foundry** — per-key dropdowns appear; type/subtype tokens resolve to the right table; unset entries cascade to the global table.
  2. **Refresh the key/alias index on table create/delete.** The index is built once at load. New *tables* resolve live (the resolver re-checks `game.tables.getName`), but new *keys* need a reload.
  3. **Grow alias coverage** — expands with real-world use; not blocking.
  4. **Later:** allow the table source to be a **compendium** of RollTables. No cascade change, but switch to UUID refs there (cross-pack refs need them).
- **Priority**: Medium

#### GM Notes — expand beyond items
- **Issue**: GM Notes v1 (shipped 13.8.0) covers dnd5e item sheets only. The data API (`api.gmNotes`) and editor window (`GMNotesWindow`) are document-agnostic, so other document types can reuse them with only a thin per-sheet read card (or a header-control trigger).
- **Status**: IMPLEMENTED (Items) — read card + `BlacksmithWindowBaseV2` editor window + optional `itemGMNotes` import support. See `documentation/api/api-gmnotes.md` and CHANGELOG 13.8.0.
- **Location**: `scripts/manager-gmnotes.js`, `scripts/api-gmnotes.js`, `scripts/window-gmnotes.js`, `scripts/ui-gmnotes-sheet.js`, `scripts/parsers/parse-item.js`, `prompts/prompt-item-core.txt`, `styles/notes-gm.css`.
- **Remaining**: (1) Actor read card (`renderActorSheet5e`, biography tab) reusing `GMNotesWindow`. (2) Journal support. (3) Header-control trigger via the AppV2 header-controls hook, to eventually drop sheet-body injection entirely. (4) Actor import support — mirror the item `itemGMNotes` field into the actor parser/prompt. (5) `gm:` search integration once a Blacksmith search panel exists (the plain-text mirror is already stored for this). (6) Optional: truly-private storage (GM-only Journal) if secrecy beyond UI-gating is ever required (current storage is document flags, intentionally UI-gated only).
- **Priority**: Medium

#### Roll system: Query window integration (architecture-rolls Phase 1.3)
- **Issue**: Query window does not use `orchestrateRoll()`; needs to use unified 4-function flow for cross-client sync.
- **Status**: PENDING
- **Location**: `documentation/architecture/architecture-rolls.md`, `scripts/window-query.js`
- **Need**: Modify `window-query.js` to use `orchestrateRoll()`; replace direct `SkillCheckDialog` creation; test cross-client sync. Then Phase 2–4 (architecture unification, validation, production readiness) per architecture-rolls.md.

#### Roll system: System selection respect
- **Issue**: `processRoll()` does not respect `diceRollToolSystem`; hardcoded to Blacksmith roll path.
- **Status**: PENDING
- **Location**: `scripts/manager-rolls.js`, `documentation/architecture/architecture-rolls.md`
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
  - `_mirrorFlagsForPin()` called at all 5 write sites in `manager-pins.js`
  - `_clearFlagsForPin()` called at both delete sites
- **Remaining (pins storage migration)**:
  1. `manager-pins.js` `deleteTagGlobally` / `renameTagGlobally` — also update `flagAssignments` for pin context
  2. `api-pins.js` tag methods — wrap to delegate to FlagsAPI (keep existing signatures)
  3. After one release: drop `pin.tags[]` from schema; read only from `flagAssignments`
  4. Migrate `pinTagRegistry` world setting → `flagRegistry` (shim already seeds on first run)
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
- **Location**: `documentation/architecture/architecture-toolbarmanager.md`, `scripts/manager-toolbar.js`
- **Need**: Test tool registration/unregistration; verify compatibility with existing modules; **Foundry v13+ only** (per project target); validate API stability.

#### Embedded other-module variables (Squire / panel-notes)
- **Issue**: Blacksmith code embeds constants that belong to other modules (e.g. Squire), creating tight coupling and fragility if those modules change IDs or naming.
- **Status**: PENDING – Investigate
- **Location**: `_Migration/panel-notes.js` (e.g. lines 40–45: `NOTE_PIN_ICON`, `NOTE_PIN_CURSOR_CLASS` / `squire-notes-pin-placement`, `NOTE_PIN_TYPE` / `coffee-pub-squire-sticky-notes`).
- **Need**: Understand why these are hardcoded in Blacksmith; consider moving to Squire, consuming via a Squire/Blacksmith API, or documenting the coupling and any migration path.

#### Pins: Full automated tests
- **Issue**: Pins API and rendering are in place; automated tests remain. (Note: the repo has no test framework at all — see CLAUDE.md.)
- **Status**: PENDING
- **Location**: `scripts/manager-pins.js`, `scripts/pins-renderer.js`

#### Pins: architecture doc is stale vs. the shipped layers/filter system
- **Issue**: `architecture/architecture-pins.md` predates the pin layers work and would lead a reader to think none of it exists. Missing: `window-pin-layers.js` and `ui-journal-pins.js` in Components; the permission + filter pre-pass in the Rendering pipeline section (`pins-renderer.js:2135`); tags/taxonomy registry plus `resources/pin-taxonomy.json` and the `pinTaxonomyOverrideJson` override loading (`manager-pins.js:297-319`); named filter profiles (`manager-pins.js:1135-1206`); `tags: []` in the defaults list (`pins-schema.js:197`).
- **Status**: PENDING
- **Priority**: Medium — `api-pins.md` is accurate, so this is contributor-facing drift only.

#### Pins: measure render/load pressure on dense scenes
- **Issue**: Classification-based pre-filtering shipped (`pins-renderer.js:2135`), but the performance hypothesis behind it was never measured. Suspected pressure points: pin DOM node count, per-pin `_sceneToScreen` work on pan/zoom, icon rendering, event overhead. Establish a baseline on a many-pin scene **before** deciding whether viewport culling is warranted — culling was deliberately deferred (see `architecture-pins.md` → Design rationale).
- **Status**: PENDING
- **Priority**: Low — no reported symptom. Do not build culling without a measurement.

#### Hide Dead and Skip Dead Options for Menubar and Combat Tracker
- **Issue**: Need options to hide and skip dead combatants in menubar and combat tracker
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-menubar.js`, `scripts/combat-tracker.js`
- **Need**: Settings for `menubarHideDead`, `menubarSkipDead`, `combatTrackerHideDead` with filtering logic

#### Query Tool Review and Improvements
- **Issue**: Query tool needs comprehensive review and fixes for functionality and UX
- **Status**: PENDING - Needs review and implementation
- **Location**: `scripts/window-query.js`
- **Need**: Verify all tabs work, review/fix drop functionality design, fix JSON generation

#### Expand Rulebook Selection Phase 2
- **Issue**: Phase 1 now uses `Number of Rulebooks`, rulebook compendium dropdowns, and `Custom Rulebooks`; phase 2 may still want curated/common-book shortcuts
- **Status**: PENDING
- **Location**: `scripts/settings.js`, `scripts/manager-campaign.js`
- **Need**: Decide whether to add common-rulebook presets/checkboxes on top of the current compendium-driven model

#### Combat Stats - Review and Refactor
- **Issue**: Combat stats system needs review and potential refactoring
- **Status**: PENDING - Needs investigation and planning
- **Location**: `scripts/stats-combat.js`, potentially `scripts/stats-player.js`
- **Need**: Review implementation, identify unused code/duplicates, check performance, review UI/UX

### Low Priority

#### Party Stats Export — fragile blob download + no UI entry point
- **Issue**: Two problems. (1) The combat/player stats export uses a hand-rolled blob+anchor download that calls `URL.revokeObjectURL(url)` synchronously right after `anchor.click()`. The click is async, so the object URL can be revoked before the download starts — in Foundry's Electron shell this surfaces as the "Get an app to open this 'blob' link" dialog (same bug that was just fixed in `window-json-import.js`). (2) There appears to be no reachable UI control that actually invokes this export — the handler may be orphaned.
- **Status**: PENDING — investigate reachability, then fix the download
- **Location**: `scripts/window-stats-party.js` (export handler ~lines 478–497, `anchor.download` / `URL.revokeObjectURL`)
- **Need**:
  - Confirm whether/how the export is invokable from the UI; if orphaned, either wire up a button or remove the dead handler.
  - Replace the blob+anchor pattern with `foundry.utils.saveDataToFile(jsonString, 'application/json', filename)` (the canonical v13 helper; sets `dataset.downloadurl` and defers the revoke). Mirrors the fix in `window-json-import.js` `_downloadTextFile`.
- **Priority**: Low — pre-existing; impact limited if the export isn't currently reachable

#### Actor import — currency `value: 0` is silently skipped
- **Issue**: `setActorCurrency` guards with `if (!currency?.type || !currency?.value) continue;`, so a legitimate `{ "type": "gp", "value": 0 }` entry is treated as absent and never written. You cannot explicitly zero a denomination on import. Same `undefined`-vs-falsy class of bug as the `toSentenceCase` crash fixed in 13.8.4 — a falsy check standing in for a presence check.
- **Status**: PENDING — pre-existing; surfaced while building the Compendiums API (13.8.4), intentionally left out of scope
- **Location**: `scripts/manager-compendiums.js` (`setActorCurrency`, the `!currency?.value` guard)
- **Need**: Guard on presence rather than truthiness (`currency.value == null`), and coerce to Number so `"0"` and `0` behave the same. Confirm no caller relies on 0 meaning "leave untouched".
- **Priority**: Low — 0 is the default for every denomination, so the visible impact is limited to explicitly zeroing a value the actor doesn't have anyway

#### Encounter journal — monster list resolved twice per import
- **Issue**: Importing a `journaltype: "encounter"` JSON resolves every name in `prepencounter` **twice**. Console shows one `createJournalEntry` call but two complete passes of `Resolved Actor ...` lines for the same list. `importJournalEntries` calls `createJournalEntry` once per entry, and there is exactly one `formatMonsterList` call (`utility-common.js:174`), so something in the encounter path evaluates the list a second time — not yet identified.
- **Status**: PENDING — pre-existing (not introduced by the 13.8.4 resolver work; call-site count is unchanged). Now largely masked: pack indexes are cached after the first pass, so the second pass no longer re-hits `getIndex()`.
- **Location**: `scripts/utility-common.js` (`createJournalEntry` encounter path, `formatMonsterList` line ~174, `createHTMLList`), `scripts/registry-json-import-journals.js` (`importJournalEntries`)
- **Need**: Breakpoint `createHTMLList` during an encounter import to find the second caller; likely a duplicated page/template build. Remove the redundant pass.
- **Priority**: Low — cosmetic since the index cache absorbs the cost; worth resolving so the debug log isn't misleading

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

### Journal Tools — de-clunk refactor
- **Issue**: `JournalToolsWindow` is ApplicationV2 (extends `BlacksmithWindowBaseV2`) but opts out of V2 idioms: `ACTION_HANDLERS = null` with hand-wired `_attachLocalListeners()` (silent no-attach on selector miss), runtime partial `fetch()`+`registerPartial()`, `setTimeout` timing hacks (200ms render wait, 0ms reflow poke, 10ms throttles), manual DOM state mutation, `isProcessing`/`shouldStop` flags instead of `AbortController`, and 600/287/180-line mega-methods.
- **Status**: PLANNED — assessment done; phased plan in `documentation/plans/plan-journal-tools-refactor.md`.
- **Location**: `scripts/manager-journal-tools.js` (3569 lines), `templates/journal-tools-window.hbs` (+ partials).
- **Need**: Phase 1 (no behavior change) — `data-action`/`ACTION_HANDLERS`, `loadTemplates()` for partials, remove `setTimeout` hacks, add `_onClose` teardown. Phase 2 — extract scan/collect/apply into a testable core module, `AbortController` cancellation. Verify `_renderSearchResults` escaping (XSS) first.
- **Priority**: Medium

### jQuery Detection Pattern is Technical Debt
- **Status**: TECHNICAL DEBT – cleanup target now that **v13+ is the supported platform**
- **Priority**: MEDIUM – Reduce over time as call sites are proven native-DOM-only
- **Location**: Multiple files using jQuery detection pattern

In FoundryVTT v13, jQuery is removed from the core UI stack. `html` parameters should be native DOM elements. The jQuery detection pattern is defensive for legacy callers; prefer fixing at the source.

**Action Item:** Audit all jQuery detection patterns and remove those where the source is guaranteed to be native DOM (e.g., `querySelector()` results).

**Migration Task:**
- [ ] Identify which detections are unnecessary (source is guaranteed native DOM) - **IN PROGRESS** - Testing required
- [ ] Remove unnecessary jQuery detection code - **PENDING** - Awaiting test results
- [ ] Create test cases to verify native DOM is always passed - **PENDING** - See audit report testing plan

**Audit Status:** Initial audit complete. Found 74 instances across 5 categories. Key finding: Inconsistency in `activateListeners(html)` and `this.element` handling suggests some detections may be unnecessary. See `documentation/jquery-detection-audit.md` for full report.

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
