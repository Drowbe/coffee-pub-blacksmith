# TODO - Active Work and Future Ideas

**Master list:** This file contains all todos referenced in architecture and API documentation. **Process:** When a task is completed, add it to **`CHANGELOG.md`**, then remove it from this file and from any completed-task language in API/architecture docs.

**Scope:** Blacksmith-only work. Cross-module cleanup that spans the Coffee Pub suite (doc/pack/table ownership, module extraction) lives in **`documentation/TODO-GLOBAL.md`**.

## Pins

- **Single-click selects a pin (selection state + keyboard actions)**: clicking a pin should put it in a selected state with a visible ring so keyboard actions can operate on it — first milestone: Delete/Backspace removes the selected pin via `PinManager.delete` with a permission check. Currently a single click only invokes registered `click` handlers (`pins-renderer.js:994` editable path, `pins-renderer.js:743` non-editable path); there is no selection concept. Design validated; no performance concern — pins are a pure DOM overlay, so one delegated `pointerdown` listener on `#blacksmith-pins-overlay` plus a `document` `keydown` handler suffices. Implementation: track the selected pin id in the renderer (`PinDOMElement._selectedPinId`); apply an `is-selected` class styled in `styles/pins.css`; `pointerdown` on a pin element selects, on the overlay container deselects; `keydown` Delete/Backspace deletes (scoped so it does not fire while typing in inputs), Escape deselects; expose `pins.getSelectedPin()` / `selectPin()` / `deselectPin()` on the public API and fire `blacksmith.pins.selected` / `blacksmith.pins.deselected` hooks so other modules can react. Verify live: click a pin and see the ring; press Delete and confirm the pin is removed (with its delete animation if configured); click empty canvas or Escape deselects; Delete does nothing when no pin is selected and does not fire while typing in a text field.
- **Double-click sometimes lands in drag mode instead of firing**: for editable pins, mousedown enters the drag system and any movement beyond `DRAG_THRESHOLD` (10px screen space, `pins-renderer.js:856`) makes the release count as a drag (`pins-renderer.js:943`), so a slightly jittery double-click gets swallowed as a tiny drag and the second click never reaches the double-click counter (`pins-renderer.js:1004`). Candidate fixes: track movement per press instead of cumulatively, treat a second press arriving within the 300ms click window as a double-click before the drag decision, or require both distance and a minimum hold time before committing to drag. Verify live: rapidly double-click an editable pin ~20 times with normal hand jitter and confirm the double-click action fires every time and the pin does not shift position; confirm a real drag (press, move, release) still moves the pin and a deliberate slow click still fires the single-click action.

## Item import expansion

- **Live-verify the shipped 13.10.0 batch**: native Item/inline NPC ingestion, Feature/Spell profiles, activity targeting/effects, Full Prompt / JSON Template delivery, Equipment passive effects Phase 1, and the shared Validate/results flow are implemented and recorded in `CHANGELOG.md` [13.10.0], each entry carrying its own live-verification steps; run them in a live world. For the shared validation flow: verify one valid fixture, malformed JSON, a mixed valid/invalid two-entry batch, Open/Open All, Edit and Retry, Retry Failed without duplicate creation, and importer switching after results.
- **Optional Midi-QOL activity import support (later)**: extend the friendly Feature/Spell activity schema with an explicitly optional Midi-QOL integration block (starting with `midiProperties.magicEffect`, and auditing the remaining activity automation fields). Core dnd5e imports must remain valid and unchanged when Midi-QOL is absent; only emit Midi-QOL data when the JSON explicitly requests it, preserve it through native Foundry Item passthrough, and verify behavior both with and without Midi-QOL installed before shipping.
- **Passive equipped effects for physical Items — later phases**: Phase 1 (friendly transfer effects limited to reminder text and standard statuses, `changes: []` enforced) shipped in 13.10.0. Later: define and whitelist safe core dnd5e change keys, stacking behavior, and evaluate other physical Item profiles plus optional DAE/Midi-QOL integration. Native Item effects remain the lossless escape hatch.
- **Actor package/bundle import (later design)**: explore one AI/hand-authored JSON package that creates an Actor and all of its custom Items, Features, and Spells in one transaction. Preserve the current lightweight compendium-reference and inline-embedded Item paths, but add explicit per-entry destinations (`embed only`, world Item Directory, or a GM-selected writable compendium), UUID/name deduplication, conflict choices (reuse/update/create copy), dependency ordering, preflight validation/preview, and rollback so a partial failure cannot leave orphaned Items or a half-built Actor. Never write to a compendium implicitly.
- **Later phases**: harden existing physical-item converters; evaluate advancement-bearing and remaining dnd5e Item types individually.

## Performance & memory

Open items only. Completed work lives in `CHANGELOG.md`; the *design* that came out of this work (shared
journal watchdog, menubar fingerprint, timer DOM caching, dead observer paths) is documented in
**`architecture/architecture-blacksmith.md` §9B**.

**Status:** not reproducing the old runaway tab-memory pattern. Remaining session cost drivers are menubar
churn and Quick View token hooks. Last validated 2026-03-28 — **stale, needs a re-run (see below).**

| Priority | Item | Files | Notes |
| --- | --- | --- | --- |
| Low | **Remove dead observer paths** | `ui-journal-encounter.js` | `_setupGlobalObserver` (and the `_setupActivePageChecker` / `_setupPageNavigationListener` it drives) is defined but never called. Delete or gate behind a debug flag so it can't be accidentally re-enabled. |
| Low | **Audit for redundant direct `Hooks.on`** | suite-wide | Phase D: find features still calling `Hooks.on` directly where HookManager already wraps the same hook name. |
| Low | **Menubar: dynamic tool title changes** | `api-menubar.js` | A tool's **title** changing without a zone/active/visibility change may not refresh until something else invalidates the structure fingerprint. |
| Low | **Journal double-click observer retention** | `blacksmith.js` | `_onRenderJournalDoubleClick` may attach a per-sheet `MutationObserver` (`editModeObserver`) that lives until edit mode activates. If the sheet is closed in view mode first, confirm it's disconnected — otherwise a retained observer + DOM ref per opened journal. |
| Low | **Socket fallback teardown** | `manager-sockets.js` | Verify no edge case leaves `_fallbackTimer` running when SocketLib never connects. (No `closeGame` wiring — that hook does not exist; see the dead-listener removal in `CHANGELOG.md` 13.10.0.) |
| Low | **High-volume sidebar hook** | `sidebar-combat.js` | `Hooks.on('renderApplication')` fires on every sidebar render; the filter is cheap but call volume is high. |
| — | **Re-run the validation pass** | — | 90–180 minute GM session; compare DOM node trend, listener counts, combat responsiveness. **How to measure: `architecture/architecture-blacksmith.md` §9B.4.** If stable, downgrade status to MONITORING. |

## Settings & feature gating

The **load gate vs on/off** model is documented in `architecture/architecture-blacksmith.md` §8. Quick View,
the performance monitor, latency, pins menubar, and hook gating for all three timers are done — see
`CHANGELOG.md`. Open:

| Priority | Item | Status | Notes |
| --- | --- | --- | --- |
| Medium | **Combat / player stats** — optional dynamic import when tracking off | Not started | `CombatStats.initialize()` / `CPBPlayerStats.initialize()` already return before `_registerHooks()` when disabled, but `stats-combat.js` stays in the bundle via static imports (`blacksmith.js`, timers). Dynamic import would shrink the cold path. |
| Low | **Combat timer** — optional dynamic import | Not started | Already correctly gated (`combatTimerEnabled` false → `initialize()` returns before registering hooks). Only the static import remains. |

## CRITICAL BUGS

Consumer-facing defects — the ones other modules will hit — live in **`known-issues.md`**, each with a symptom, a workaround, and a fix pointer. This section holds only what is *not* consumer-facing: open design decisions and internal code-quality work.

Pattern worth internalising from the 2026-07-16 API audit: **every defect it found was an API Blacksmith does not call on itself.** The menubar API works because Blacksmith self-registers its own menubar tools. It does not self-register through `registerToolbarTool`, never called `registerModule`, never checked `removeHook`'s return, and never used `BLACKSMITH.rolls.execute` — and all four were silently broken. If an API isn't dogfooded, nothing tests it.

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
- **Live bug it predicted:** §7 warns "a new stylesheet is silently unstyled unless added to `default.css`". `styles/widget-tags.css` is on disk, imported by nothing — it matters because `TagWidget.registerPartial()` is live at `blacksmith.js:543`. (A second instance, `journal-toolbars.css`, was genuinely dead and has since been deleted.)

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
- **Doc follow-up**: the ⚠️ block in `architecture-blacksmith.md` §9B.2 describes the dead registrations — once verification passes, it should be rewritten to describe the helper (documentation agent).

#### Design system: make it upstream of the component docs
- **Why it matters**: cross-module design continuity is "better but lacking." The design-system docs are now audited and published, but they do not yet *drive* the per-component docs, which each restate design details that have diverged.
- **Done 2026-07-20 — audit and split.** The 1,564-line `design-system.md` was verified against `styles/` (54 files, 16.5k lines), `templates/`, and `scripts/`, then replaced by four published pages: `design-tokens` (all 63 `vars.css` tokens), `design-components`, `design-patterns`, `design-extending`. The audit found the doc described the pre-`vars.css` world — 19 hexes in the palette section had tokens the doc never named — and that **every wrong claim sat inside a pasted markup block while the class names and file pointers were nearly all correct**, which is why the new pages name classes and cite `file:line` instead of pasting HTML. Consumer-facing errors that would have produced non-working sibling-module code: a fabricated `api.menubar.addButton()` (real: `registerMenubarTool(toolId, toolData)`), an ApplicationV1 window example (`static get defaultOptions` — zero occurrences in the repo; all 14 real windows use `static DEFAULT_OPTIONS` + `static PARTS`), and a debug-logging pattern with zero call sites (real: `postConsoleAndNotification`, 955 calls). Defects found in passing went to `known-issues.md`; tech debt is in the two entries above. `tools/check-design-tokens.mjs` now fails the build if any documented token value drifts from `vars.css`.
- **Remaining scope — the continuity fix**: make the design-system pages upstream of the component docs (chat cards, windows, pins, menubar, timers). Those `api-*`/`architecture-*` pages should point at and conform to the design system rather than restating design details. Start by grepping the published component docs for class names and token names that also appear in `design-components`/`design-tokens`, and replace the restatement with a pointer.
- **Relationship**: the "Card CSS migration to theme system" item below is a facet of this — fold it in when this starts.
- **Window-template gap found 2026-07-19**: `.blacksmith-window-template-body` ships with **no padding**, so every window re-invents the gutter (`notes-gm.css` 12px; `window-json-import.css` 0 + internal panel padding; `window-toast-send.css` 12px). When the design-system pass touches windows, decide a default body gutter in `window-template.css` and strip the per-window overrides (watch for double-padding in windows that pad internally). Same pass should reconcile field-label styling: the shared `blacksmith-field-label` (small uppercase) vs the importer's own bolder sentence-case labels — one canonical label style in the shared kit.
- **Blocked on**: nothing — the wiki reset is complete.
- **How to verify**: every token/class named in the split docs resolves to a real definition in `styles/*`; no design detail is stated divergently between the design-system docs and a component doc; a sibling can style a card/window from the consumer reference and match Blacksmith.
- **Priority**: Highest post-reset.

#### CSS tech debt surfaced by the design-system audit (2026-07-20)
These were section 15 ("Known Inconsistencies") of `design-system.md`. That section was future-work commentary living inside a spec, so it moved here; each claim below was re-verified against the CSS on 2026-07-20, and the counts are current as of that date.

- **Adopt the tokens that already exist.** `styles/vars.css` defines 63 tokens, and **21 of them are referenced by no CSS in the module** — the entire `--blacksmith-status-*` family (5), the entire `--blacksmith-interactive-*` family (3), all three `--blacksmith-shadow-*`, and most surfaces. Meanwhile **124 raw hex literals across `styles/` are byte-identical to a token that already exists**: `#594a3c` x48 (`--blacksmith-color-brand`), `#c15701` x15 (`-brand-accent`), `#8d8061` x13 (`-brand-muted`, otherwise unused), `#8b0000` x7 (`--blacksmith-status-danger`), `#bdbdae` x6 (`--blacksmith-text-light`), `#0e0c0c` x5, `#ada39d` x5, `#4b4b4b` x4, `#f6f1ed` x3, `#629602` x3, `#313030` x2, `#e4ddd9` x2, `#d63737` x2, plus `#222222` x9. Repo-wide the CSS holds 649 raw hex literals against 609 `var()` references. This is a mechanical find-and-replace per literal, not a design decision — the token and its value already agree. **This supersedes the old "hardcoded colors should become variables" framing: the variables exist, the CSS just does not use them.**
- **Legacy Hungarian-notation tokens.** 9 remain, all in `styles/common.css:8-16` (`--intChatSpacing`, `--strHideRollTableIcon`, `--strSceneTextAlign`, `--strScenePadding{Left,Right,Top,Bottom}`, `--strSceneFontSize`). Migrate to `--blacksmith-[component]-[property]` when those features are next touched. Note these are written by the scene-title/chat settings handlers, so renaming them means updating the JS that sets them.
- **Duplicate rules in `window-common.css`.** `div#coffee-pub-blacksmith .window-content` is declared 3 times, and `styles/window-common.css:70` still carries `/* -------- THINGS BELOW HAVE NOT BEEN ORGANIZED ----------- */`. Consolidate to one rule per selector per file.
- **`cpb-` vs `blacksmith-` prefix split.** Both are in heavy live use: 141 distinct `.cpb-*` classes vs 345 distinct `.blacksmith-*`. This is too large to rename wholesale and is not worth churning; the standing rule is new components use `blacksmith-`, and `cpb-` is left to the legacy chat-card selectors. Worth a decision only if the card system is ever rebuilt.
- **`.bh-` namespace is unused.** Referenced nowhere in `styles/`, `templates/`, or `scripts/`. The reservation was dropped from the design docs; either adopt it deliberately or leave it dead.
- **Typography is partly tokenized.** `vars.css` now defines `--blacksmith-font-size-{xs,sm,base,md,lg,xl}` and `--blacksmith-font-weight-{light,normal,bold,black}`, so the old "not tokenized at all" claim is obsolete. Card-context sizes are still literal `em` values in the card CSS; fold that into the card-theme migration below rather than doing it standalone.
- **How to verify**: after the token-adoption pass, no hex literal in `styles/` matches a value defined in `vars.css` (the audit script in the design-system effort checks this mechanically), and the rendered UI is pixel-identical — these substitutions are value-preserving by construction.
- **Priority**: Medium. None of this is user-visible; it is what makes the design system actually govern the CSS instead of merely describing it.

#### Dead CSS found during the design-system audit (2026-07-20)
- **`styles/widget-tags.css` (154 lines) is unlanded, not dead** — do not delete it. It appears in neither `styles/default.css`'s import list nor `module.json`'s `styles` array, so none of its rules apply. 14 of its 15 `bsw-*` classes are emitted by `templates/partials/tag-widget.hbs`, and `scripts/widget-tags.js` (imported at `scripts/blacksmith.js:88`) registers that template as the `blacksmith-tag-widget` partial. What is missing is the last step: **no template invokes the partial**, and the stylesheet is not imported. The tag widget is therefore a complete, inert feature — nothing renders it, so nothing is visibly broken today. Landing it means adding the `@import` to `default.css` and a `{{> blacksmith-tag-widget}}` call site. Deleting the CSS instead would destroy the styling for a feature that is one call site from working.
- **`--blacksmith-variant-timeline-*` duplicates `--blacksmith-variant-info-*`.** Both pairs are `rgba(47, 68, 106, ...)` (`styles/vars.css:112-113` and `:124-125`), so the two variants render indistinguishably despite being presented as distinct. Decide: give `timeline` its own hue, or drop it and alias consumers to `info`. This is a design call, not a cleanup — the published token page currently states the duplication as fact.
- **Priority**: Low.

#### `applicationv2-window/` — decide its disposition
- **Issue**: `documentation/applicationv2-window/guidance-applicationv2.md` (539 lines) has never been audited and is **not published to the wiki**, yet three published pages point at it by repo path — `api-window.md`, `architecture-window.md`, and `architecture-blacksmith.md`. Those render as plain text on the wiki (the sync downgrades unpublished targets), so nothing is broken, but a wiki reader is sent off-wiki to the repo to find how to build an Application V2 window.
- **Options**: (a) audit, scrub to the formatting standard, and publish it as its own page; or (b) fold it into the design-system split as originally planned, since window guidance is design-system material. Either way `applicationv2-window/README.md` (27 lines, quick start for the example) gets deleted and the `.webp`/`.png`/example files stay as repo assets.
- **If it publishes**, revisit the wording of those three references so they name a wiki page rather than a repo path.
- **Priority**: Medium — fold it into the design-system effort rather than doing it standalone.

#### Publish the importer docs once the import work is verified
- **Issue**: `api/api-importer.md` (474 lines) and `architecture/architecture-importer.md` (311 lines) are the only two `api-*`/`architecture-*` docs not on the wiki. They were written ahead of the functionality, so they are held under the rule that a doc describes what exists.
- **Gate**: the JSON-import work lands and passes live testing. Then audit both against the finished code, scrub to the formatting standard, and add them to `PUBLISH` in `tools/wiki-sync.mjs`.
- **Priority**: Medium — this closes the documentation set with nothing held back.

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
- **Toast publish targeting — game vs /stream view (shipped 2026-07-23 — pending live verification)**: Foundry's chat-only `/stream` page (the OBS capture surface) loads modules like the tabletop, so toasts were rendering over the chat capture with nobody behind the view to dismiss them. `show()` now takes `publish: 'game' | 'stream' | 'both'` (default `'game'`, invalid values fall back to it) and renders only when `game.view` matches — receipt-side, so it covers every delivery path, and `publish` rides the cross-client relays as plain data. The stream surface is view-addressed: the `showToast` handler (`manager-sockets.js`) renders stream-targeted payloads on any `/stream` client regardless of `_recipients`, and the excluded-users gate does not apply on the stream view (a stream publish is deliberate; exclusion protects the tabletop). The Send Toast window grew a Target section (`toast-publish` select: Game / Stream / Both, persisted in preferences), placed after the Template section (form order: Recipients, Template, Target, Message, Appearance); the target is part of the template bundle — saving a template captures it, applying one stamps it (pre-target templates stamp Game), and changing it while a built-in is selected forks to Custom. Stream dims the Recipients section and sends via `broadcastToast` with no user recipients, and the GM confirmation toast names "Stream" as a recipient when targeted. **How to verify**: open `/stream` in a browser alongside a `/game` client; with Target = Game, send a party toast and fire a timer announcement on the Toast channel → both appear on `/game`, nothing on `/stream` (debug mode logs the suppression there); Target = Stream → Recipients dims, send works with nothing checked, the toast appears only on `/stream` (even when the logged-in account is on the Excluded Users list) and the GM confirmation says "Stream"; Target = Both → selected players' `/game` clients and the `/stream` page both show it; on the stream client's console `api.toast.show({ title: "Hi", publish: 'stream' })` renders and the same call on `/game` does not; chat messages still appear on `/stream` unchanged; reopen the window → the Target choice is remembered. Templates: save a template with Target = Stream, switch to Information (Target snaps to Game), re-select the saved template → Target snaps back to Stream and Recipients dims; changing Target while a built-in is selected flips the selector to Custom.
- **Send Toast templates are full snapshots; built-ins renamed "(adhoc)" (shipped 2026-07-23 — pending live verification)**: saving a template now always captures every field — title, message, appearance, target — and applying one stamps them all; the "Include title and message" checkbox is removed (`window-toast-send.js`). The built-ins are renamed Information (adhoc) / Announcement (adhoc) / Important (adhoc): fixed designs that deliberately carry no text, so selecting one clears the title and message for fresh typing. Old saved preferences pointing at "Information" fall back to the renamed default; templates saved under the old opt-in keep working (those without text stamp empty wording like the built-ins). Recipients remain the one thing never saved — situational, and Quick Toast always sends party-wide (author decision 2026-07-23). **How to verify**: select an adhoc template with text typed in the fields → title and message clear; save a template with text, type over it, re-select it → the saved wording comes back; a pre-existing template saved without text still applies its look and clears the wording; the include-text checkbox is gone; reopening the window with a remembered user template restores its wording.
- **Quick Toast menubar item (shipped 2026-07-23 — pending live verification)**: a GM-only party-menubar item (`quick-toast`, order 7, `api-menubar.js`) opens a `UIContextMenu` of saved Send Toast templates that have a title (the only fireable kind, since `show()` requires one; the adhoc built-ins carry no text and never appear); clicking one fires it as stored via `quickSendToastTemplate()` (`window-toast-send.js`): party-wide recipients (online non-GM minus Excluded Users) on the template's own publish target, stream targets broadcast, same GM confirmation toast as the window (titled with the template name). Empty state explains how to create one; the last menu entry opens the full Send Toast window, as does the no-coordinates fallback (overflow path). **How to verify**: as GM with a player online, save a template with a title; click Quick Toast in the party menubar → the template is listed (with a "(stream)" suffix if targeted), clicking it shows the toast on the player's client and the "Toast sent: «name»" confirmation on the GM's; a titleless pre-snapshot template does not appear; with no titled templates the menu shows the explanatory disabled row; "Open Send Toast" opens the window; a stream-targeted template fires with no players selected and renders on `/stream` only.
- **Toast content animations (shipped 2026-07-23 — pending live verification)**: `show()` takes `animation: 'pop' | 'reveal' | 'pulse' | 'slam' | 'shake'` — billboard-only (ignored without a `size`; stacked toasts always render still), pure CSS keyframes on the content children (`styles/toast.css`), entrance-run-once except the `pulse` breathe (meant for persistent billboards), behind `prefers-reduced-motion`. `slam` (stamp-in with an impact jolt) and `shake` (decaying rattle) are the gratuitous pair. Exposed in the Send Toast window's Appearance section with a "sized toasts only" note under the selector; part of the template bundle (saved, stamped on apply, diverges built-ins to Custom) and of the send payload. **How to verify**: console `api.toast.show({ title: "Hi", size: 'medium', animation: 'pop' })` → content bounces in; `'reveal'` staggers icon/title/subtitle; `'pulse'` with `duration: 0` breathes until closed; `'slam'` smashes in oversized and jolts on landing; `'shake'` rattles side to side and settles; the same calls without `size` render a normal still toast; with OS reduced-motion enabled, content appears instantly; in the Send Toast window pick an animation + a size and send → recipients see it, template save/re-apply round-trips it, and choosing an animation on a built-in flips the selector to Custom.
- **Toast Excluded Users (shipped 2026-07-22 — pending live verification)**: world setting `toastExcludedUsers` (Notifications > Toasts, comma-separated Foundry user names, case-insensitive) suppresses all toasts on listed users' clients — for accounts that cannot click a toast closed, e.g. a camera/stream login. Enforced receipt-side in `show()` (`isToastExcludedUser()`, `api-toast.js`) so it covers every delivery path — on the tabletop view only; the `/stream` view is exempt so a deliberate stream-targeted toast still renders there (see the publish-targeting item above). The Send Toast window also drops excluded users from its recipient list and "Entire Party" resolution (`window-toast-send.js`), which previously resolved to every online non-GM user at send time and swept in observer accounts. **How to verify**: add the camera account's user name to Excluded Users; GM sends with Entire Party checked → all players get the toast except the excluded account, which also no longer appears in the recipient list; a timer announcement on the Toast channel → same suppression; on the excluded client, console `api.toast.show({ title: "Hi" })` returns null and renders nothing (debug mode logs the suppression); clear the setting → toasts reach the account again without a reload.
- **Chat-noise reduction — remaining candidates** (2026-07-17 survey of all `ChatMessage.create` sites):
  - *Needs targeting or piggybacks on chat today*: **vote open/result announcements** (`manager-vote.js` :795 is the interactive vote card itself — stays until Phase 2 actions; only the result *announcement* is toast material). (Hurry-up nudges migrated 2026-07-24 — see the shipped bullet above.)
  - *Stays in chat (record value — do not migrate)*: combat stats/MVP round summaries (`stats-combat.js`), XP distribution (`xp-manager.js`), roll results (`manager-rolls.js`, `window-skillcheck.js`), reputation cards (`manager-reputation.js`), marching-order/conga table (`token-movement.js` :1420), the Manual Rolls GM audit whisper (`ui-sidebar-style.js` :553 — arguably a GM-only toast later, but it is an audit trail).
  - NOT yet — the leader toast currently runs alongside the cards; each migration is its own change with its own verification.
- **Hurry Up nudge migrated to toasts with Direct/Blast scopes (shipped 2026-07-24 — pending live verification)**: new `notifyHurryUp` channel setting (Notifications > Combat Timer, toast/chat/both/none, **default both**); the shared `sendHurryUpNudge(targetName, targetActor, scope)` in `timer-notifications.js` replaces the duplicated banter arrays and chat/sound code at both trigger sites. The toast half is a small `shake` billboard (10s, rabbit icon): scope 'direct' sends it via `sendToastToUsers` only to the active non-GM owners of the slow combatant's actor with a local "Nudge sent" confirmation for the sender, falling back to the chat card when no owner is online; scope 'blast' broadcasts it to every client for the public-razzing effect (sender sees it too, no confirmation). The combat bar portrait menu offers both — Hurry Up (Direct) and Hurry Up (Blast) — while the combat tracker's timer overlay always blasts, matching its pre-toast public-chat behavior. The toast wears the slow combatant's face (`getPortraitImage`, rabbit icon fallback); the chat card keeps the rabbit in its header. Chat mode is the public `card-hurry-up.hbs` banter with the table-wide sound; 'both' sends the toast silent (the chat broadcast already covers everyone). Settings live in their own Notifications > Hurry Up section: `notifyHurryUp` plus `hurryUpSound`, the latter moved from the combat timer section (same key — stored values carry over). **How to verify**: GM + the slow player + a third player online; on default (both), Hurry Up (Direct) from the GM's combat bar — slow player gets billboard + card + one sound, third player gets card only, GM sees confirmation; Hurry Up (Blast) — billboard on every client including the GM's, plus the card; the tracker timer overlay (visible on a non-active player's client while the combat timer runs) blasts the same way; set toast — Direct shows the billboard only to the slow player with the sound riding it, no card; chat — card only; none — nothing; Direct on an unowned NPC in toast mode falls back to the card.
- **Turn notification with the combatant's portrait (ON HOLD 2026-07-24 — author decision)**: do not build yet — the author suspects turn announcements belong in a sibling module, not Blacksmith; revisit ownership before any work. The endorsed part of the idea: timer messages (turn warning/expired) carrying the face of whoever is holding things up, for context — when this is picked up, the mechanics are the toast `image` slot (round avatar, wins over `icon`), `getPortraitImage` in `api-core.js`, and threading the image through the timer payload into `timerToastContent()` (`timer-notifications.js`). The hurry-up nudge toast already demonstrates the pattern.
- **New toast option adoption — candidates (2026-07-23, post-13.11 build)**: the publish/animation/billboard options shipped; these are the wiring candidates, each its own change with its own verification when picked up. Billboard + animation moments: **vote result announcement** (`manager-vote.js` — result only; the interactive card stays until Phase 2 actions) as a small billboard with `pop`; **XP distribution award** (`xp-manager.js`) as a medium billboard with `pop` alongside the chat record; **combat round MVP headline** (`stats-combat.js`) as a billboard with `slam` while the full summary stays in chat; **timer expirations** ("time's up" moments in `timer-notifications.js` routing) upgraded from plain toast to small billboard with `pop`. Stream (`publish: 'both'`) moments for spectator/recording value: round MVP, XP awards, vote results, and session start/break/end billboards (a persistent `pulse` "Back in a few" board is the break-screen case). Sibling-side (not this repo): crit/fumble slam/shake wiring belongs to the rolls consumer module once the `blacksmith.rolls.*` consolidation lands, and Bibliosoph's splash migration can adopt animations when it swaps to `api.toast` (both tracked in `TODO-GLOBAL.md` / sibling TODOs).
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

#### Token blood — remaining work
The Health Indicators system (Blood Damage pools, Blood Hit bursts with damage/attack triggers and sound, cleanup timer, visibility gating, Remove/Restore All Blood toolbar buttons) shipped in `CHANGELOG.md` [13.11.0]; each entry there carries its own live-verification steps. Open:
- **Finish the live-verification pass**: core flows (pools per tier, bursts on both triggers, attack-mode fix, player-client rendering) were exercised during development on 2026-07-22; still unverified: GM Only visibility on a player client, the Blood Cleanup slider, Remove/Restore All Blood across two clients, the hit sound, unlinked NPCs at every tier, and the perf-monitor idle check. Steps are in the [13.11.0] entries. When this passes, dismantle `documentation/plans/plan-token-blood.md` per the plans rule.
- **Optional authored splatter art**: replace or augment the procedural texture with bundled webp splatter assets — a drop-in swap at the texture-build step in `manager-token-indicators.js`; tiers, seeding, placement, and visibility all stay as-is.
- **Rewire the combat bar and party bar onto `utility-health.js`** so the HP-percent math has one home (both currently compute it independently; the helper's 'hurt' tier maps to their "healthy" bucket — see the helper's JSDoc).

Next round (author, 2026-07-22). Note the shared design question for the first and last items: today all blood is *derived* from HP and redrawn from scratch — nothing is stored. Hand-drawn blood and trails left behind by movement are real data that must live somewhere (scene flags, most likely) with their own cleanup story, which is a genuine design shift, not another tier row:
- **Draw blood on the canvas**: a GM paint tool to stamp splatter directly on the ground (click or click-drag), independent of any token's HP. Decide persistence (scene-flag storage vs session-only), whether Remove All Blood clears it, and whether it reuses the procedural drawer at a chosen size.
- **Burst style options**: alternative hit-burst treatments beyond blood — old-school comic "POW"/"BAM"-style graphics and other animation styles — selectable via a burst-style setting alongside the existing trigger/sound settings. The burst pipeline (spawn, animate, destroy) is style-agnostic; only the texture generator varies.
- **Blood color by creature type**: for Blood Damage pools, map dnd5e creature type to blood color (e.g. undead ichor, construct oil, ooze slime) with a sensible default for the rest. Decide where the mapping lives (constants vs setting vs taxonomy JSON) and whether Blood Hit bursts follow the same color.
- **Gore level setting**: one global intensity dial scaling pool sizes, splat counts, and opacity across all tiers (subtle table → full Tarantino), multiplying the existing `_BLOOD_TIERS` values rather than adding new tiers.
- **Blood trails on movement**: optionally leave some blood behind when a wounded token moves — droplets along the drag path, heavier at worse tiers. Interacts with the persistence question above and with Blood Cleanup (trails likely want their own, shorter lifetime).
- **Investigation (2026-07-22) — most of the plumbing already exists; LOE ~1 focused day for v1 plus art**:
  - `scripts/manager-token-indicators.js` already runs per-token PIXI overlays on `canvas.interface` (turn indicator, targeted rings, portrait stacks via `PIXI.Sprite.from`) with movement tracking, delete cleanup, `canvasReady` refresh, and HookManager wiring. Blood is one more indicator type in that framework, not a new system.
  - HP % and the exact severity steps are already computed in `manager-combatbar.js:536-566` (healthy >=75 / injured >=50 / bloodied >=25 / critical), with a cross-system HP path watch list at `:652-663`; the party bar computes health independently again. First step: extract a shared `getHealthPercent(actor)` + severity helper so blood is the third consumer, not the third copy.
  - Quick View's hatch (`utility-quickview.js:542-568`) proves the token-conforming overlay pattern (scaled to `token.w/h`, rotation-aware, non-interactive); `images/overlays/overlay-pattern-*.webp` establishes the bundled overlay-texture pattern.
  - Genuinely new: 3-4 alpha webp splatter textures (or one greyscale splatter tinted/scaled per tier); an `updateActor` hook alongside the existing `updateToken` one (linked actors vs unlinked-token actor deltas both need live testing); an enable setting plus a visibility-scope setting (everyone / GM-only / own-tokens-plus-GM — blood on canvas broadcasts enemy HP state to players, the one real design decision). Phase 2: damage-taken flash reusing the manager's existing PIXI animation pattern. No sockets — each client derives the overlay from actor data it already has; no per-frame work, so §9B-clean by construction.
- **Ownership (resolved by the investigation): Blacksmith.** This is canvas indicator UX driven by HP data, both of which live here; it does not need the rolls-classification event surface (it reacts to HP deltas, not crits). Injury *mechanics* stay in the sibling module.
- **Status**: PENDING — needs a plan first (feature, so per the workflow it gets a `documentation/plans/` entry before code: visual approach, thresholds, settings, dead-state treatment — ties into the "Hide Dead" menubar item below).
- **How to verify**: damage a linked and an unlinked token past each threshold → splatter tier updates on all clients; heal → it recedes; visibility-scope setting hides it from players when set; no per-frame cost when idle (check with the perf monitor); disabled setting → no hooks registered.
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
