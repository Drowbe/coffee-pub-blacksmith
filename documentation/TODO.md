# TODO - Active Work and Future Ideas

**Master list:** This file contains all todos referenced in architecture and API documentation. **Process:** When a task is completed, add it to **`CHANGELOG.md`**, then remove it from this file and from any completed-task language in API/architecture docs.

**Scope:** Blacksmith-only work. Cross-module cleanup that spans the Coffee Pub suite (doc/pack/table ownership, module extraction) lives in **`documentation/TODO-GLOBAL.md`**.

## Wiki sync mechanism (blocked)
- **Owner:** Claude (assigned 2026-07-17). The wiki is a pure mirror of `documentation/`; Claude syncs it after each BUILD commit — see the workflow and Git rules in `CLAUDE.md`.
- **Blocker:** the wiki bare repo (`…coffee-pub-blacksmith.wiki.git`) will not check out on Windows — the page `Architecture:-Core` has a `:` in its filename, illegal in NTFS, so `git clone` of the wiki fails on this machine.
- **How to verify (once solved):** the wiki renders the current `documentation/` docs, and re-running the sync on an unchanged tree is a no-op.
- **Options to work out:** sparse/partial checkout excluding colon-named pages; a filename mapping layer (`:` ↔ safe char); or generating/pushing wiki blobs without a working-tree checkout. Also decide whether the colon-named page should just be renamed at the source so the mirror is clean.

## Item import expansion

- **Phase 1 — native Items and inline NPC content (implemented; pending live verification)**: Item Directory accepts lossless native Foundry Item JSON; NPC `items`/`spells`/`features` arrays mix compendium-name references with inline native definitions (and existing Blacksmith-flat physical items); unresolved references surface visibly. See `plans/plan-item-import-expansion.md`.
- **Feature and Spell profiles (implemented; pending live verification)**: both are selectable Item Import types with friendly prompt schemas, validation, dnd5e conversion, modern activities, fixtures, and inline NPC reuse.
- **Activity targeting/effects (implemented; pending live verification)**: friendly activities support duration, range, individual/area targeting, measured-template prompts, and linked Active Effects/statuses; multi-behavior features use multiple activities while cosmetic branches remain prose.
- **Full Prompt / JSON Template delivery (implemented; pending live verification)**: Item Import's Copy and Save As actions share an Output selector; JSON-only output is valid prose-free starter JSON for every Item profile and includes Artificer flags when checked.
- **Optional Midi-QOL activity import support (later)**: extend the friendly Feature/Spell activity schema with an explicitly optional Midi-QOL integration block (starting with `midiProperties.magicEffect`, and auditing the remaining activity automation fields). Core dnd5e imports must remain valid and unchanged when Midi-QOL is absent; only emit Midi-QOL data when the JSON explicitly requests it, preserve it through native Foundry Item passthrough, and verify behavior both with and without Midi-QOL installed before shipping.
- **Passive equipped effects for physical Items (Phase 1 implemented; later phases)**: Equipment now accepts friendly transfer effects limited to reminder text and standard statuses, activated while equipped or while equipped-and-attuned; non-empty Active Effect changes are deliberately rejected. Later: define and whitelist safe core dnd5e change keys, stacking behavior, and evaluate other physical Item profiles plus optional DAE/Midi-QOL integration. Native Item effects remain the lossless escape hatch.
- **Actor package/bundle import (later design)**: explore one AI/hand-authored JSON package that creates an Actor and all of its custom Items, Features, and Spells in one transaction. Preserve the current lightweight compendium-reference and inline-embedded Item paths, but add explicit per-entry destinations (`embed only`, world Item Directory, or a GM-selected writable compendium), UUID/name deduplication, conflict choices (reuse/update/create copy), dependency ordering, preflight validation/preview, and rollback so a partial failure cannot leave orphaned Items or a half-built Actor. Never write to a compendium implicitly.
- **How to verify (live)**: Item Directory → for every type, Copy and Save As both Full Prompt and JSON Template, parse each JSON-only result, and repeat with Artificer checked; import the Feature, area-save, and Spell fixtures; confirm the area-save activity shows Self / 15-foot circle / creature / 1 minute and links its Charmed effect, then activate from an Actor, fail a save, and apply the effect; Actor Directory → import an NPC containing an official string reference, the same inline friendly feature/spell, and one deliberately missing reference → the first three embed and work, and the missing name is reported visibly.
- **Shared validation/results (implemented; pending live verification)**: Import JSON now offers read-only Validate, keeps the window open after validation/import, reports each entry independently, links created documents, preserves JSON for editing, copies entry issues or the full report, retries only failed entries, and resets through Import Another. Verify one valid fixture, malformed JSON, a mixed valid/invalid two-entry batch, Open/Open All, Edit and Retry, Retry Failed without duplicate creation, and importer switching after results.
- **Later phases**: harden existing physical-item converters; evaluate advancement-bearing and remaining dnd5e Item types individually.

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

Consumer-facing defects — the ones other modules will hit — live in **`known-issues.md`**, each with a symptom, a workaround, and a fix pointer. This section holds only what is *not* consumer-facing: open design decisions and internal code-quality work.

Pattern worth internalising from the 2026-07-16 API audit: **every defect it found was an API Blacksmith does not call on itself.** The menubar API works because Blacksmith self-registers its own menubar tools. It does not self-register through `registerToolbarTool`, never called `registerModule`, never checked `removeHook`'s return, and never used `BLACKSMITH.rolls.execute` — and all four were silently broken. If an API isn't dogfooded, nothing tests it.

### `registerToolbarTool` / `unregisterToolbarTool` — empty `catch` blocks swallow errors
- Both `registerTool` and `unregisterToolbarTool` have empty `catch` blocks that silently swallow errors.
- **Priority**: Low.

## ARCHITECTURE DOCS — audit results (2026-07-17)

All 13 audited against source. **Two are fiction, three are shipped-work-described-as-plans, and the pattern is consistent enough to name.**

> **The finding that explains almost all of it:** the house rule *"a doc that copies code drifts; a doc that points at code doesn't"* held as a **natural experiment**. In `architecture-blacksmith.md`, everything that *points* (file inventory 45/46 correct, the style list exactly right, the §9A trap list 7/9, all cross-links) survived intact. Everything that *narrates or copies* (§3.1's hand-maintained call sequence, §2.1's transcribed esmodules array) rotted. Same doc, same author, same age — the only variable was pointer vs copy.

### `architecture-rolls.md` — ASCII diagrams and API Reference still encode the wrong flow
- The trim and the correction block shipped (see `CHANGELOG.md`, architecture-docs audit). Remaining: the ASCII diagrams and the API Reference section still encode the old 4-function/public-internal model. The real flow is 3-function (`requestRoll()` is commented-out legacy), `orchestrateRoll` throws without an existing message id rather than creating cards, and the socket direction is inverted (roller→GM). Rewriting the diagrams needs a session with the code.

### ⛔ `architecture-socketmanager.md` — 81% fiction, BORN fiction. REWRITE NEEDED — #1 POST-RESET EFFORT
- **Priority (author, 2026-07-17): #1 after the wiki reset**, ahead of the design-system effort — sockets and hooks are the two most critical systems. (The hook-system doc, `architecture-hookmanager.md`, was already rewritten from source this session; sockets is the remaining critical one.) Excluded from the first wiki publish; rewrite from `manager-sockets.js` preserving the god-module analysis.
- **67 of 83 symbols phantom.** Proven never-real by `git log -S`: `_handleIncomingMessage`, `performanceMetrics`, `_initializeLocal`, `_detectSocketLib` have **only ever existed in this doc file, in any commit**. Added whole 2025-08-28, when `manager-sockets.js` already looked as it does now. Never described this codebase.
- Invented: a third "Local Mode" transport, batching, reconnection/backoff, replay-attack validation, latency metrics, a config system, four debug globals.
- **Most dangerous:** it invents a security model. Reality is `_isLocalRecipient()` (`:125`) filtering **on receipt** — both transports broadcast to every client. Source: *"emit() must never carry secrets"* (`:306`).
- **Header added; body left for diffing.** Do NOT delete: the socket layer has no other contributor doc, and the **"Migration Plan" section is real** — the god-module problem (SocketManager imports 6 UI subsystems at `:14-19`) is live and correct. Its status is stale (`module.api` exposure shipped at `blacksmith.js:1298`).

### `architecture-blacksmith.md` — KEEP, fix §3.1 (the map a new contributor reads first)
- **§9A is right and §3.1 is wrong — the doc contradicts itself and the correct half loses.** §3.1 claims `hookCanvas()` registers canvasInit/canvasReady/updateScene/dropCanvasData. It registers **no hooks** (`:821-837` only injects the layer class); those live in `initializeSceneInteractions()` (`:617`, called during `ready`) and three are gated on `enableSceneClickBehaviors`. §9A says so correctly.
- **§3.1 lists lifecycle phases in the wrong order** (`setup → init → ready → canvasReady`; Foundry runs `init → setup → canvasReady → ready`). Its own phase *numbers* are right — only the list order is wrong. Worst possible place for it.
- §3.1 also self-contradicts §4.3 on `BLACKSMITH.rolls.execute` (§4.3 correctly says removed), and names phantoms `ConstantsGenerator`, `registerWindowQueryPartials`, `executeRoll`, `_setupDomObserver`.
- §9A's `removeCallback` "trap" is now **stale — we fixed that code today**. Delete it.
- §2.1 drift: esmodules omits 2 files (9, not 7); ships **two** style entries, not one.
- §11 (~89 lines) is a migration plan — honestly fenced, but belongs in this file.
- **Verified excellent and worth protecting:** file inventory 45/46, style list exact (48 imports, names and order), §9A Quick View line-for-line, §4.3 roll exports exact, §9B.2 dead-code table (its `_setupActivePageChecker` row looks like a false positive but is **transitively dead** — the doc is right).
- **Live bug it predicted:** §7 warns "a new stylesheet is silently unstyled unless added to `default.css`". `styles/journal-toolbars.css` and `styles/widget-tags.css` are on disk, imported by nothing. `widget-tags.css` matters — `TagWidget.registerPartial()` is live at `blacksmith.js:543`.

### `architecture-toolbarmanager.md` — 20 phantoms; ~60% is a superseded plan
- 8 phantom API names (`registerBlacksmithTool`, `BlacksmithToolbarManager`, `TokenControlToolbarManager`, …) presented as the design to implement; that design was abandoned for what shipped. It **documents and disclaims the same phantom class** 160 lines apart.
- Says **"9 default tools"** — actual is **5**. Third wrong count in this file's history; note line 14 already warns readers not to trust its lists, then line 150 supplies one.
- Copied `request-roll` block says `zone: 'rolls'`; actual is `gmtools`. Tool Data Structure omits `onCoffeePub`/`onFoundry`/`toggle` (load-bearing). Claims `icon`/`title` required; both default — only `onClick` is (now validated).
- 3 wrong file paths, 1 fictional CSS selector.
- **Doc arguably right vs code:** its "Tool Visibility System" implies parity, but `getFoundryToolbarTools()` ignores `tool.visible` while `getVisibleTools()` honors it. Fix belongs in code.

### `architecture-tags.md` — MAJOR-REWRITE, but **fix the code split first**
- Root cause: the system was renamed **Flags → Tags**; the code finished, the doc didn't. Its title says Tags, its body says flags — so it names 5 phantom files (`widget-flags.js` → real `widget-tags.js`, etc.) and a phantom `api.flags` namespace.
- **Do not rewrite it yet.** The doc's JSON section is *correct* for the shipped `tag-taxonomy.json` (which really does use `flags`). Rewriting to `tags` while the JSON ships `flags` just moves the lie. Fix the three-shape split first (see the Tags entry below), then document one schema.
- Also: four-tier classification is fiction (code has `taxonomy`|`global` only); `TagWidget.prepareData` is documented positional but takes an **object**; `activate()` omitted (widget renders inert without it); context key documented `.quests`, shipped JSON has `.quest`.

### `architecture-stats.md` — MAJOR-REWRITE (~66% is a decision memo)
- **Its central storage claim is inverted.** It says "**NO PERSISTENCE** — all combat data is lost" and recommends *against* storing summaries. The code stores every one, deliberately unbounded, in the `combatHistory` world setting (`stats-combat.js:1090`, `settings.js:2141`). Option C was chosen and shipped; the doc still presents it as an open question.
- It proposes "keep last 10-20, prune oldest" — **the pruning lie in proposal form.** Delete it or it regenerates.
- §2 misattributes an entire subsystem: claims `stats-player.js` owns `combat.setFlag('combatStats')`. That file has **zero** combat setFlag/getFlag/unsetFlag; its only flag is `actor.setFlag('playerStats')`. 8 phantoms.
- Asserts clean ownership of the `stats` flag; reality is the known three-way collision — and **worse than recorded**: `timer-round.js:233` also writes *wholesale*, clobbering `currentStats` in the other direction.
- Never mentions that **all writes are GM-gated** — a real gap. Keep the data-flow diagram (L726-752, verifies almost perfectly); add the `combatHistory` write.

### `architecture-xp.md` — KEEP-WITH-FIXES (weakest of the "real" docs)
- Resolution multipliers wrong on **4 of 6**, and wrong in *mechanism*: they're GM-configurable settings (`xpMultiplierDefeated` etc.), not the fixed constants the doc lists.
- Calls `XpDistributionWindow` a `FormApplication`; it extends `BlacksmithWindowBaseV2` (`xp-manager.js:806`).
- Its "Known Issues" section describes a circular-dependency bug **that is already fixed** — the code at `:878` implements the exact proposed fix. Delete.
- Possible latent code bug: two entry points produce different monster shapes (`openXpDistributionWindow` → raw Combatants; `calculateXpData` → the documented shape). The doc may be describing correct *intent*.

### `architecture-pins.md` — KEEP-WITH-FIXES (the recent rewrite mostly holds)
- Verified strong: schema v7, all 6 migration rows exact, all 9 schema defaults byte-exact, permissions model exact, all 5 lifecycle hooks.
- **"No canvas layer is used for pins" is false** — `canvas-layer.js` defines `BlacksmithLayer`, registered at `blacksmith.js:830`, and it is a pin lifecycle entry point (`_draw()` → `PinRenderer.initialize()`, `activate()` → `loadScenePins`). Absent from Components entirely.
- **`pinTagRegistry` is filed under "client settings"; it is `scope: 'world'`** (`settings.js:3451`) — and this contradicts the doc's own three-concerns spine, since it's shared vocabulary, not view state. Highest-value fix.
- Shape list omits `rectangle` — note it matches the **buggy** `update()` whitelist rather than the design. Don't "correct" the doc to the bug.
- `_getPinLocation` → real name `_findPinLocation`. Event list omits 7 of 16. Filter-change mechanism misdescribed (it's `applyVisibilityFilters()`, not a reload).

### `architecture-token-naming.md` — REAL. The model doc.
- Promoted from a plan **properly**: describes built behavior, and its "Do not enumerate the keys" callout applies the house rule correctly *and is self-aware about the prior failure* ("The plan this doc replaced hardcoded '18 keys'; the file had 20" — the file has 20).
- One phantom: `flag-taxonomy.json` → real `tag-taxonomy.json`.
- Its §3 pseudocode **drops rung 2** of the cascade and contradicts its own §2 — the copy-drifts rule biting an otherwise good doc. Replace the block with a pointer to `utility-token-naming.js:231`.

### Audit coverage gaps — what was NOT checked (2026-07-17)
Recorded so a future pass doesn't mistake silence for a clean bill of health.
- **`api-pins.md`** (~100 symbols checked, largest doc): NOT verified — `reconcile()` internals; the five GM tag mutators' bodies (so doc claims about scrubbing saved visibility-profile snapshots are **unverified**); `seedTagRegistryIfEmpty` semantics; arc-text layout / `textMaxWidth`; `imageFit`/`imageZoom`; the v4→v7 schema migration chain; most `window-pin-layers.js` UI claims. Given the reserved-profile-name finding, **the profile/UI-layer claims are the least trustworthy area**.
- **`architecture-*.md`**: 10 docs, still substantially unverified. `architecture-socketmanager.md` is known fiction (30/30 symbols phantom). `architecture-hookmanager.md` needs ~900 of 1411 lines cut.
- **Fence checker**: `scratchpad/check-fences.ps1` syntax-checks all 378 JS fences across the API docs (tries whole-module, function-body, class-body, and object-literal readings before reporting). ~29 remaining hits are pseudo-code fragments, not defects. Worth keeping if you want it in the repo.

### Curator ships its own fork of HookManager
- **Issue**: `coffee-pub-curator/scripts/manager-hooks.js` is a 520-line copy of Blacksmith's `HookManager` — identical static surface, all 18 methods, none added — and Curator never touches `module.api.HookManager`. Blacksmith exposes HookManager precisely so nobody does this. The fork inherited the `removeHook` return bug (fixed in Blacksmith 13.9.x, still present in the copy).
- **Status**: PENDING — Curator's call, not Blacksmith's. Tracked here because it defeats the hub pattern.
- **Location**: `coffee-pub-curator/scripts/manager-hooks.js`

### Chat Card API (first-class posting + docs)
- **Issue**: Theme helpers exist (`module.api.chatCards` → `scripts/api-chat-cards.js`: `getThemes`, `getThemeClassName`, etc.), but there is no first-class API for **posting** themed chat cards. Every coffee-pub module (Squire, Minstrel, Curator, etc.) has built its own card templating system, each reusing Blacksmith's CSS but independently constructing HTML and calling `ChatMessage.create()` directly. This is the same problem that was solved for windows with `BlacksmithWindowBaseV2` — duplicate templating logic scattered across modules means bugs get fixed in some but not others and styling drifts.
- **Status**: PENDING – not current priority; tackle after bugs/performance
- **Contract decision**: Add `chatCards.post(content, options)` / `chatCards.postAnnouncement(content, options)` helpers that wrap `ChatMessage.create` + canonical Blacksmith card HTML, so modules call one API and get a correctly-structured themed card without knowing the HTML internals. Mirror the window API normalization pattern.
- **Location**: `scripts/api-chat-cards.js`, `scripts/blacksmith.js` (`module.api.chatCards`); consumers to migrate: all coffee-pub-* modules that post chat cards
- **Priority**: High – same class of problem as window normalization; do after current bug/performance pass

## ENHANCEMENTS

### High Priority

#### Journal Tools entity replacement should resolve through `api.compendiums`
- **Context (author, 2026-07-18)**: the Compendiums API now handles exactly what Journal Tools does by hand — plain text in, formatted compendium/world link out (`resolve`/`resolveMany`, canonical name-to-UUID). `manager-journal-tools.js` predates it and drives `compendiumManager` + the per-type setting names directly.
- **Need**: route the entity-replacement lookups through `api.compendiums` so both features share one resolver (and its index caching). Fold into the Journal Tools de-clunk refactor (see TECHNICAL DEBT) rather than as a standalone change — the scan/collect/apply extraction is the right moment.
- **Priority**: Low-Medium — consolidation, not a bug; the current path works.

#### Request Roll cannot be fully disabled
- **Found**: 2026-07-18 (author, during toolbar-visibility testing).
- **Issue**: `requestRollShowInFoundryToolbar` only hides the Foundry-toolbar button; there is no master off-switch for the Request Roll feature. Harder than it looks: the menubar/CoffeePub toolbar surfaces it too, and **other modules can invoke it via the API** (`SkillCheckDialog` / request-roll surface), so a true disable needs a decision about what a consumer API call does when the feature is "off" (throw? no-op with log? still work headlessly?).
- **Need**: design the gate first (load gate vs UI-only vs API-refusal — see the §8 load-gate model), then implement across the button surfaces + API entry points.
- **Priority**: Low-Medium — polish, but the current toggle implies more off than it delivers.

#### Audit `requiresReload` flags now that setting-change handlers are live
- **Found during the settingChange verification (2026-07-18)**: many settings carry `requiresReload: true` from the era when the change handlers were dead and reload was the *only* way changes applied. Now both mechanisms fire on Save: e.g. scene-title styles apply instantly and then Foundry redundantly prompts for a reload; `menubarCombatSize` half-applies live (CSS var) and needs the reload to settle the rest of the bar layout.
- **Need**: per-setting decision — where the live handler fully applies the change, drop `requiresReload` so Save is clean; where it can't, keep it. Do this with the settings sheet open and a checklist, not as a blanket sed. **Data from the 2026-07-18 test round**: confirmed DROP candidates — scene-title styles, `sidebarPinUI`, `sidebarStyleUI`, `sidebarManualRollsEnabled` (all applied fully live, prompt was redundant); confirmed KEEP — `sidebarCombatChatEnabled` (tab injection needs the reload), `requestRollShowInFoundryToolbar` (scene-controls button only clears on reload); RECHECK — `menubarCombatSize` (half-applies live; if the bar renders correctly after reload, keep the flag or fix the live path).
- **How to verify**: for each flag dropped — change the setting, Save → change fully applies with **no reload prompt**; for each kept — the prompt still appears and reload applies it.
- **Priority**: Medium — pure UX polish, but the redundant prompts now actively misrepresent which settings need a reload.
- **Leftover found during the audit**: `manager-toolbar.js` watches `tokenImageReplacementShowInFoundryToolbar` / `...CoffeePubToolbar`, which are **registered nowhere** — those branches can never fire. Decide: register the settings or delete the branches (small item).
- **Doc follow-up**: the ⚠️ block in `architecture-blacksmith.md` §9B.2 describes the dead registrations — once verification passes, it should be rewritten to describe the helper (documentation agent).

#### Design system: audit, split, and make it the source of truth for component docs — TOP PRIORITY after the wiki reset
- **Why it matters**: cross-module design continuity is "better but lacking." `design-system/design-system.md` (1,219 lines) is the coherent-design reference, but it is unaudited — §15 admits its own drift (mixed `cpb-`/`blacksmith-` prefixes, hardcoded colors vs. tokens) — and it does not yet drive the per-component docs, which each restate design details that have diverged.
- **Scope**:
  1. **Audit against the CSS/code** — verify every documented token name, class, and component actually exists in `styles/*`. This doc has never been checked; treat nothing in it as true until verified.
  2. **Split per the five kinds** — *definition → architecture* (token architecture §1, file org §2, naming conventions §11, known inconsistencies §15 → mostly TODO tech-debt); *consumption → api/consumer reference* (tokens §3, palette §4, typography §5, spacing/radius/z-index/animations §6–9, component library §10, how-to-extend §12, patterns §13–14, cheatsheet §16).
  3. **Make it upstream of the component docs** — chat cards, windows, pins, menubar, timers. Those architecture/api docs should point at and conform to the design system, not restate divergent design details. This is the continuity fix.
- **Relationship**: the "Card CSS migration to theme system" item below is a facet of this — fold it in when this starts.
- **Window-template gap found 2026-07-19**: `.blacksmith-window-template-body` ships with **no padding**, so every window re-invents the gutter (`notes-gm.css` 12px; `window-json-import.css` 0 + internal panel padding; `window-toast-send.css` 12px). When the design-system pass touches windows, decide a default body gutter in `window-template.css` and strip the per-window overrides (watch for double-padding in windows that pad internally). Same pass should reconcile field-label styling: the shared `blacksmith-field-label` (small uppercase) vs the importer's own bolder sentence-case labels — one canonical label style in the shared kit.
- **Blocked on**: the wiki reset finishing (this is the #1 effort after).
- **How to verify**: every token/class named in the split docs resolves to a real definition in `styles/*`; no design detail is stated divergently between the design-system docs and a component doc; a sibling can style a card/window from the consumer reference and match Blacksmith.
- **Priority**: Highest post-reset.

#### Card CSS migration to theme system
- **Issue**: Card-type CSS files (`cards-xp.css`, `cards-skill-check.css`, `cards-stats.css`) still use hardcoded colors; they should use the CSS variable theme system for consistency and themeability.
- **Status**: PENDING
- **Location**: `styles/cards-xp.css`, `styles/cards-skill-check.css`, `styles/cards-stats.css`; new variables go in `styles/cards-common-layout.css` (`:root`) and `styles/cards-common-themes.css` (per theme). The as-built theme system is described in `documentation/architecture/architecture-chatcards.md`.
- **Need**: Grep each card-type file for hardcoded `color`/`background`/`border-color` values and replace with `var(--blacksmith-card-*)`, reusing existing theme variables where the meaning matches and adding XP/skill-check/stats-specific or semantic (success/failure/warning) variables — all `--blacksmith-card-` prefixed — where none fit. Decide per semantic color whether it is theme-dependent (add to each theme) or fixed (keep hardcoded, document). Keep layout/spacing in the layout file, colors in the variable blocks. Test every card type under all themes.
- **Priority**: High – Improves theme consistency and maintainability

### Medium Priority

#### Player-facing toast system (phased: local primitive → multi-action → cross-client)
- **Status**: Phase 1 IMPLEMENTED — pending live verification (see "How to verify"). Phases 2–3 pending.
- **Shipped 2026-07-19 (pending live verification — steps in `CHANGELOG.md`)**: `style` (semantic set, whitelisted → CSS classes; token mapping deferred to the design-system effort) and `size: 'large'` on `show()`; `duration: 0` toasts now exempt from stack-cap eviction (persistent means persistent); internal targeted relay `sendToastToUsers(config, userIds)` (receipt-side `_recipients` filter — still NOT the public Phase 3 surface); and the GM **Send Toast** party-bar tool (`window-toast-send.js`) sending large styled toasts to selected players with a small GM confirmation. Plan scaffold: `documentation/plans/plan-toast-styles-gm-send.md` — dismantle after live verification.
- **Shipped (Phase 1)**: `api.toast` — `show({ title, subtitle, icon, image, duration, onClick, onDismiss, stackKey, moduleId })`, `remove`, `clearByModule`, `getActive`. Local per-client primitive, `scripts/api-toast.js` + `styles/toast.css`; docs at `documentation/api/api-toast.md` and `documentation/architecture/architecture-toast.md`; leader-change dogfood toast wired into the `partyLeader` settingChange callback in `api-menubar.js` (runs alongside the chat cards). Full detail in `CHANGELOG.md` 13.9.3.
- **Phase 2 — actions beyond the body click**: optional `actions: [{ label, onClick }]` button row for multi-choice toasts ("roll for crit" / "read message" / "acknowledge"). Phase 1's single body-click API must not change shape when this lands — actions are additive. Note the architecture constraint: toasts are immutable DOM (no `update()`), so an action row is part of the built element, not patched in later.
- **Phase 3 — cross-client delivery (gated on the socket rewrite, #1)**: `api.toast.send({ recipients, ... })` riding `api.sockets`; GM or a module pushes, targeted clients render via the Phase 1 primitive. Respect the socket privacy rule — targeting is receipt-side; never send secrets in the payload.
- **Consumer migration (after Phase 1 verifies)**: Bibliosoph swaps `_showSplash` (`manager-conversations.js` :1252) for `api.toast.show()` — its splash policy (per-kind settings, mention-always, auto-open fallback) stays Bibliosoph-side. Goes in `TODO-GLOBAL.md` / Bibliosoph's own TODO, not here.
- **Notification channel settings (the migration mechanism — shipped for leader + movement)**: the **Notifications** settings section (`settings.js`, `WORKFLOW_GROUPS.NOTIFICATIONS`) holds one world-scoped choice per migrated feature — toast / chat / both / none via `NOTIFICATION_CHANNEL_CHOICES`, **default `toast`** unless a feature deliberately chooses otherwise. `notifyLeaderChange` and `notifyMovementChange` are live: toast gated receipt-side in the feature's `updateSetting` hook, chat card gated GM-side at its `ChatMessage.create` site. Every future migration adds its `notifyX` setting to this section and gates both ends the same way. Pending live verification (see CHANGELOG 13.9.3 entry for the matrix).
- **Timer notifications: MIGRATED (pending live verification)** — `notifySessionTimer` / `notifyPlanningTimer` / `notifyCombatTimer` channels route all three timers' announcements via the shared `routeTimerNotification()` (`timer-notifications.js`) and the internal `broadcastToast()` socket relay (see `architecture-toast.md`); redundant `ui.notifications` banners removed (combat auto-advance banner deliberately kept — nothing else carries it). Per-kind toggles stay in each timer's own settings section. Full detail + verify matrix in `CHANGELOG.md` 13.9.3.
- **Chat-noise reduction — remaining candidates** (2026-07-17 survey of all `ChatMessage.create` sites):
  - *Needs targeting (Phase 3) or piggybacks on chat today*: **hurry-up nudges** (`timer-combat.js` :470, `manager-combatbar.js` :1380) — the chat message IS the transport and the target is one player; **vote open/result announcements** (`manager-vote.js` :795 is the interactive vote card itself — stays until Phase 2 actions; only the result *announcement* is toast material).
  - *Stays in chat (record value — do not migrate)*: combat stats/MVP round summaries (`stats-combat.js`), XP distribution (`xp-manager.js`), roll results (`manager-rolls.js`, `window-skillcheck.js`), reputation cards (`manager-reputation.js`), marching-order/conga table (`token-movement.js` :1420), the Manual Rolls GM audit whisper (`ui-sidebar-style.js` :553 — arguably a GM-only toast later, but it is an audit trail).
  - NOT yet — the leader toast currently runs alongside the cards; each migration is its own change with its own verification.
- **Future-proofing ideas (captured, not committed)**: priority/queue ordering when stacked; themes via the design-system tokens; Phase 3 ack-back ("player clicked acknowledge" reported to the GM).
- **Toast templates (later)**: add a Save as New workflow to the GM Send Toast window so a configured toast can be named and reused. Define template ownership, rename/delete behavior, and whether templates are client- or world-scoped before implementation; title and message may be template content even though they are deliberately excluded from ordinary last-used preferences.
- **How to verify (Phase 1)**: console `api.toast.show({ title: "Hi" })` → toast appears top-center, fades out after 8s; with `onClick` → pointer cursor + hover, click plays the button sound, runs the handler, removes it without firing `onDismiss`; timeout and the × fire `onDismiss`; two toasts with the same `stackKey` → the second replaces the first; different keys stack (cap 5, oldest evicted); `image:` shows a round avatar. Leader dogfood: change leader with two clients open → leader's client shows "You are now the party leader", the other shows the actor's name; chat cards still post; re-picking a leader rapidly replaces the toast rather than stacking.
- **Priority**: Medium (feature). Phase 2 is unblocked; Phase 3 is gated on the socket system.

#### Scene "burden" calculator — developer tool for scene performance cost
- **Issue**: no way to quantify how expensive a scene is before players hit it. The costly scenes are the counter-intuitive ones — wide-open maps with few walls mean huge unoccluded areas, so light, sound, and vision polygons cover far more space and every token-vision refresh does more work. A "burden" score would let us test scenes against calibrated benchmarks and eventually warn in real time that a level is "too much".
- **Status**: PENDING — needs a plan (feature; phased below)
- **Location**: new dev tool; nearest pattern is `scripts/utility-performance.js` (perf monitor — dynamically imported, surfaced via the menubar hamburger, gated behind its enable setting). Same load-gate treatment applies.
- **Phases**:
  1. **Calculator** — on demand, score the current scene from its document + canvas state: dimensions/grid area, wall count *and* open-space ratio (walls actually *reduce* vision cost by occluding), light sources (count, radius, animated?), ambient sounds, tokens with vision enabled, tiles/drawings, fog exploration size. Output a breakdown, not just one number, so we can see *which* axis is heavy. Surface via the perf-monitor menu or a console-callable API first — UI polish later.
  2. **Calibrate** — run it across known-good and known-bad scenes (and the burden-of-knowledge campaign's real scenes are ideal test data — read-only, never edit) alongside observed FPS/refresh timings to weight the axes into meaningful thresholds. Until this phase, the score is a raw metric, not a verdict.
  3. **Real-time advisory** — once calibrated, evaluate on `canvasReady` (and optionally on wall/light/token changes, debounced) and warn the GM when a scene crosses the "too much" threshold. GM-only, low-noise (once per scene load, not per change).
- **Design questions for the plan**: static document analysis vs. live measurement (e.g. timing an actual `canvas.perception` refresh) — probably both, since phase 2 needs the live numbers to calibrate the static score; where the score lives (pure function in the utility vs. exposed on `module.api` for siblings like Cartographer, which builds scenes and would want this).
- **How to verify**: run the calculator on a trivially small scene and a large open scene → scores differ in the expected direction with a sensible breakdown; toggling a big light or vision on a token changes the relevant axis; disabled setting → nothing loads (dynamic import not fetched).
- **Priority**: Medium

#### Token "blood" HP indicator animation
- **Issue**: no at-a-glance visual of token health on the canvas. Idea: a "blood" treatment on the token that scales with missing HP — e.g. a blood-splatter overlay that intensifies as HP drops (thresholds like bloodied/critical), optionally with a brief animation on damage taken.
- **Ownership open (author, 2026-07-18)**: may live in Blacksmith or in a sibling module — injuries/crit/fumble handling already lives elsewhere, and blood is thematically adjacent. Decide in the plan. Either way Blacksmith's role is the *event surface* (the rolls-classification hooks above plus HP-change events); if the visual ships in a sibling, this item reduces to "expose what it needs" and the feature entry moves to that module's TODO / `TODO-GLOBAL.md`.
- **Status**: PENDING — needs a plan first (feature, so per the workflow it gets a `documentation/plans/` entry before code: **ownership**, visual approach, thresholds, settings, GM/player visibility).
- **Location**: new code; nearest existing pattern is `scripts/manager-token-indicators.js` (per-token overlay driven by actor state). Hook shape: `updateActor`/`updateToken` HP diffs via `HookManager`, gated behind an enable setting (see the load-gate model, `architecture-blacksmith.md` §8).
- **Design questions for the plan**: overlay art (tinted PIXI filter vs. sprite/texture splatter vs. DOM like pins)? thresholds (continuous 0-100% vs. bloodied/critical steps)? does it respect HP visibility rules for players, or GM-only? does dead get its own state (ties into the "Hide Dead" menubar item below)? performance in token-dense scenes (§9B rules apply — no per-frame work, update only on HP change).
- **How to verify**: damage a token past each threshold → visual updates on all clients; heal → it recedes; no per-frame cost when idle (check with the perf monitor); disabled setting → no hooks registered.
- **Priority**: Medium

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

#### Roll outcome classification API (hit/miss/crit/fumble/criteria) — UNIFY the four existing implementations
- **Issue**: consumers (and Blacksmith itself) have no API to ask what a roll *meant* — hit, miss, crit, fumble, success vs DC, or arbitrary criteria. **The knowledge already exists, computed independently in four places** (survey 2026-07-18):
  1. `manager-rolls.js` (~:381-433 and again ~:1487) — advantage/disadvantage-aware active-d20 extraction, used only to pick crit/fumble *sounds* and cinema overlay classes. The cinema overlay's success/failure class is `roll.total >= 10` with its own `// TODO: get actual DC from context` (`:1562`) — a hardcoded DC.
  2. `blacksmith.js` ~:2370-2440 (GM-side skill-check update handler) — the most complete logic: per-actor crit/fumble via `detectD20Roll`, success = `total >= flags.dc`, **group success** (majority rule), and **contested roll** winners/ties. Buried in a socket callback in the god-module; results live only in chat-card flags.
  3. `utility-message-resolution.js` (~:269-283) — **attack hit/miss per target vs AC** from chat messages → `hitTargets`/`missTargets`/`unknownTargets`.
  4. `utility-midi-resolution.js` — `getCritFumbleFromWorkflow` normalizes crit/fumble from MIDI-QOL workflows (flags → roll flags → d20 inspection); consumed by `stats-combat.js`/`stats-player.js` for MVP scoring.
- **Status**: PENDING — this is a *consolidation*, not new functionality. Investigate first; the four sites have subtly different semantics (crit = nat 20 vs. dnd5e crit-range config; hit vs AC vs. success vs DC vs. majority-group) that a unified contract has to name explicitly rather than paper over.
- **Location**: the four sites above; new surface on `module.api.rolls` (see "Rolls API as first-class surface" below — these are the same effort's two halves).
- **Contract decision (author, 2026-07-18): this is a SUBSCRIPTION surface, not just a pull API.** Sibling modules must be able to *subscribe* to roll outcomes — injuries and crit/fumble handling live in another module, and "blood" may too. Blacksmith classifies and broadcasts; siblings react. So the design is two layers:
  - **Events** (the primary surface): fire a hook per resolved roll — e.g. `Hooks.callAll('blacksmith.rolls.resolved', outcome)` — carrying the classified outcome object (who rolled, roll type, d20, total, isCrit, isFumble, success/DC, per-target hit/miss when it's an attack). Follow the pins precedent (`blacksmith.pins.*` hooks). Decide which of the four detection sites is the authoritative firing point per roll type, and make sure each outcome fires **exactly once** (site 2 recalculates the whole group on every member's roll — naive wiring would re-fire earlier members).
  - **Pull helper** (secondary): `rolls.classify(rollOrMessage, { dc, targetAC })` for consumers holding a roll/message, sharing the same internals.
- **Need**:
  - Decide inputs (Foundry `Roll` vs `ChatMessage` vs Blacksmith result object) and whether crit/fumble reads dnd5e's crit-range config or stays raw nat-20/nat-1 (sites 1-2 assume raw; site 4 already trusts system flags when present).
  - Decide event scope: which clients see the hook (all? GM-only for hidden rolls?) — respect roll visibility (blind/private GM rolls must not broadcast outcomes to players).
  - Migrate the four sites onto the shared internals one at a time, each with its own verification (dogfooding — see the CRITICAL BUGS preamble). Fixing the cinema overlay's hardcoded DC 10 falls out of site 1.
  - Downstream consumers are **external by design**: the injury/crit/fumble module subscribes for its triggers (the "Auto-Roll Injury" backlog item likely moves out of Blacksmith entirely — see BACKLOG note), and any sibling reacting to roll outcomes. Document the event contract in a future `api-rolls.md`; cross-module consumer wiring goes in `TODO-GLOBAL.md` when it starts.
- **How to verify**: console-classify normal/advantage/disadvantage/nat-20/nat-1 rolls against a known DC; crit/fumble sounds unchanged; group and contested skill-check cards unchanged; MVP crit/fumble counts unchanged across a test combat.
- **Priority**: Medium

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

### Journal Tools — de-clunk refactor (now CORRECTNESS, not just clunk — see 2026-07-18 review)
- **Issue**: `JournalToolsWindow` is ApplicationV2 (extends `BlacksmithWindowBaseV2`) but opts out of V2 idioms: `ACTION_HANDLERS = null` with hand-wired `_attachLocalListeners()` (silent no-attach on selector miss), runtime partial `fetch()`+`registerPartial()`, `setTimeout` timing hacks (200ms render wait, 0ms reflow poke, 10ms throttles), manual DOM state mutation, `isProcessing`/`shouldStop` flags instead of `AbortController`, and 600/287/180-line mega-methods.
- **Note (2026-07-19)**: the tool was never fully unreachable — the Foundry-toolbar button opens the same window, so the linking path has been **in production use** throughout. That urgency drove the defusal below. The defusal fixes are **shipped but not live-verified** — the author deliberately deferred testing to the rebuild regroup (planned within days of 2026-07-19); verify steps are in `CHANGELOG.md` if needed sooner.
- **Direction (author, 2026-07-19): the rebuild's real frame is "automated cleanup of Foundry artifacts"** — there is a large unmet need for automating world hygiene (broken/stale links, plain-text references that should be documents, and similar artifacts), and Journal Tools' entity linking + search/replace are the seed of that tool, not the whole of it. Scope the rebuild plan with that framing in mind rather than as a 1:1 rewrite of the current window.
- **Code review findings (2026-07-18) — the entity-linking core has real correctness bugs, not just style debt.** Findings 1–3 ✅ FIXED 2026-07-19 (see `CHANGELOG.md`: descending-offset processing + overlap-skip guard; world fallback rewired to the requested type with collection-derived labeling). Findings 4–10 stand for the rebuild:
  1. ✅ **Stale-offset replacement (was CRITICAL)**: scanners record offsets against the *original* page content while the loop mutates `pageContent` per replacement. Fixed by sorting merged entities by descending offset and skipping entities overlapping an already-replaced range.
  2. ✅ **World fallback searched the wrong collection** (`foundEntityType`, always null, instead of `entityType`) — items fell back to searching actors.
  3. ✅ `worldEntity.type === 'Item'` was never true (subtype, not documentName) — world finds were always labeled actor.
  4. **First-occurrence bugs**: bullet entities use `content.indexOf(line)` (duplicate lines resolve to the first); html-list plain-text replacement uses `liContent.replace(entity.name, newLink)` (first occurrence anywhere in the li; `$` in names would inject regex-replacement patterns).
  5. The existing-link li path replaces **all** UUID-pattern matches in the li with the same new link (`:1952-1953` global regex) — an li with two links gets both overwritten.
  6. **Scanning is keyword-luck, not contract**: section gating uses `includes()` on heading keyword lists against *every line* (prose containing "monster" flips the section state, and the state never turns off at an unrelated heading); `_isHeading` treats any Title-Case line as a heading; plain-text acceptance is "2–100 chars, doesn't end in a period"; type disambiguation is a 240-line context-bias heuristic (`_determineEntityTypeFromContext`). What gets linked depends on wording and ordering — this is the "does it do what we want" problem.
  7. Dedupe is by lowercase name only, page-wide, across types.
  8. **No preview and no undo for entity linking** — pages are updated immediately (`page.update` per page); the search-replace half *does* have report-first, the linking half doesn't.
  9. `_renderSearchResults` interpolates document names and matched content into `innerHTML` unescaped — journal content IS html, so OLD/NEW cells render markup instead of displaying it (and can execute it). The escaping concern previously flagged is confirmed real.
  10. Resolution duplicates the Compendiums API across three near-identical ~100-line methods (see the `api.compendiums` item above).
- **Status**: PLANNED — assessment done; phased plan in `documentation/plans/plan-journal-tools-refactor.md`. **The review upgrades Phase 2 from "extract for testability" to "rebuild the linking core"**: parse page HTML with `DOMParser` instead of regex over serialized strings; collect candidates from the DOM; resolve via `api.compendiums.resolveMany`; apply as DOM mutations; show a preview table before writing. Escape all interpolated content in results rendering (finding 9) — small and worth doing ahead of the full refactor.
- **Location**: `scripts/manager-journal-tools.js` (~3,480 lines), `templates/journal-tools-window.hbs` (+ partials).
- **Priority**: Medium-High (was Medium) — the tool writes corrupted or wrong links under real conditions.

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
- **Ownership note (2026-07-18)**: injuries/crit/fumble handling belongs to a sibling module, not Blacksmith. This item is here only until the rolls-classification event surface ships (see ENHANCEMENTS); then it becomes that module's feature, subscribing to `blacksmith.rolls.*` hooks, and this entry moves to `TODO-GLOBAL.md` / the owning module.

### Multiple Image Directories for Token Image Replacement
- Allow users to configure multiple image directories with priority order (deferred until a dedicated image pipeline is back in scope for Blacksmith or a companion module)

### No Initiative Mode
- Alternative combat mode where GM manually controls turn order instead of initiative rolls

### Export Compendium as HTML
- Export compendium contents as formatted HTML document for sharing, printing, or archiving

### CODEX-AI Integration
- Integrate CODEX system with AI API for cost-efficient context management, replace conversation history with relevant CODEX entries (likely **outside core Blacksmith** – e.g. Regent or a dedicated AI module; clarify product ownership before implementation)
