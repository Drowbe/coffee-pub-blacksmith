# Performance & Memory Diagnostics

Current performance baseline and action plan after recent subsystem removals (OpenAI/Regent split from core, Broadcast/Herald removal, Curator/Image-replacement removal).

---

## Current Status

- **Status**: ACTIVE (fresh baseline review complete; targeted fixes pending)
- **Owner**: Systems/Performance
- **Last Updated**: 2026-03-02 (stack #7 pass 1; stack #6 native socket teardown: see §6–§7)
- **Key Observation**: We are **not** currently reproducing the old browser-tab runaway memory growth/crash pattern.

## Scope Notes

- This document intentionally removes legacy findings tied to removed subsystems.
- Keep this file focused on **current** code paths only.
- Uppercase canonical: `documentation/PERFORMANCE.md` — keep synchronized or merge into one file.
- **Checklist (ranks 1–3)**: `documentation/PERFORMANCE-journal-lifecycle-checklist.md` — step-by-step tasks and consolidation plan.

## Current Findings (Stack Ranked)

| Rank | Severity | Area | Status |
| --- | --- | --- | --- |
| 1 | High | Encounter toolbar global observer/polling lifecycle | Teardown: `EncounterToolbar.dispose()`, `closeGame` (`blacksmith.js`); optional observer/poll reduction still open |
| 2 | High | Journal page pins observer/polling lifecycle | Teardown: `JournalPagePins.dispose()`, `closeGame`; optional `renderApplication` trim still open |
| 3 | High | Duplicate journal monitoring pipelines (duplicate work) | Active |
| 4 | Medium | Menubar full rerenders on frequent update paths | Active |
| 5 | Medium | Timer loops doing global DOM queries/rerenders | Active |
| 6 | Medium | Socket native fallback listener lifecycle | Native inbound teardown done (see §6) |
| 7 | Low | Legacy/no-op hooks and stale cleanup candidates | Pass 1 done (see §7) |

## Detailed Findings

1. **Encounter toolbar global observer / polling**
   - **Files**: `scripts/encounter-toolbar.js`
   - **Evidence**: `MutationObserver`, `setInterval(..., 500)`, document capture-phase click.
   - **Mitigation (done)**: `EncounterToolbar.dispose()` disconnects observer, clears interval, removes listener, removes HookManager callbacks; `Hooks.once('closeGame', …)` in `blacksmith.js` invokes it. `init()` is idempotent.
   - **Remaining (optional)**: Reduce scope or remove fallback observer/poll if v13 hooks cover all cases.

2. **Journal page pins observer + interval**
   - **Files**: `scripts/journal-page-pins.js`
   - **Evidence**: `setInterval(..., 2000)`, `MutationObserver`, direct `Hooks.on` + HookManager.
   - **Mitigation (done)**: `JournalPagePins.dispose()` clears interval, disconnects observer, `Hooks.off` + `HookManager.removeCallback`; same `closeGame` path. `init()` is idempotent.
   - **Remaining (optional)**: Drop redundant `renderApplication` listener after testing; add `PinManager` handler unregister if API appears.

3. **Duplicate journal instrumentation stacks**
   - **Files**: `scripts/journal-page-pins.js`, `scripts/blacksmith.js`
   - **Evidence**: Previously multiple features each had their own MutationObserver + interval fallbacks for journal UI updates.
   - **Mitigation (pass C, done)**: Added shared `scripts/journal-dom-watchdog.js` and rewired `blacksmith.js` (double-click editing), `encounter-toolbar.js`, and `journal-page-pins.js` to consume the shared sheet/page events. This removes the per-feature journal DOM observer/interval pipelines.
   - **Remaining**: Optional follow-up: further reduce duplicate *hook* work (e.g. relying on HookManager only in cases where Foundry hooks fire reliably).

4. **Menubar rerender path is still broad**
   - **Files**: `scripts/api-menubar.js`
   - **Evidence**: Full container remove/rebuild path remains reachable from frequent update flows.
   - **Risk**: Extra DOM churn and event rebind overhead under combat-heavy updates.

5. **Timer UI updates query broadly and trigger extra renders**
   - **Files**: `scripts/timer-round.js`, `scripts/timer-planning.js`
   - **Evidence**: Global selectors in interval ticks and explicit combat render calls in planning flow.
   - **Risk**: Unnecessary per-tick DOM/query cost, especially during long combats.

6. **Socket fallback lifecycle cleanup gap**
   - **Files**: `scripts/manager-sockets.js`
   - **Evidence (historical)**: Native fallback registered `game.socket.on` without removing prior listeners on the module channel.
   - **Risk**: Duplicate handlers on re-init/fallback transitions.
   - **Mitigation (done)**: `_initializeNativeSockets` calls `_teardownNativeSocketListener()` (`game.socket.off(moduleChannel)`) before `on`, and replaces `_nativeHandlers` with a fresh `Map` so registrations are not stacked.
   - **Remaining (optional)**: Explicit teardown on world unload / `closeGame` if long-lived sessions without full reload ever show duplicate behavior again.

7. **Legacy/unused cleanup opportunities**
   - **Files**: `scripts/blacksmith.js`, `scripts/settings.js`, `styles/window-template.css`, `scripts/window-base-v2.js`
   - **Evidence (historical)**:
     - No-op `renderApplication`/`closeApplication` hooks remain.
     - Duplicate `movementType` setting registration exists.
     - Regent-specific CSS selector residue and stale selector branches were reported.
   - **Risk**: Maintenance noise and avoidable runtime overhead.
   - **Pass 1 (done)**:
     - Removed empty `renderApplication` / `closeApplication` HookManager registrations (no runtime behavior; fewer hook invocations per frame).
     - Removed duplicate `movementType` world setting registration; single hidden default remains `normal-movement` (matches code fallbacks).
     - Removed dead scroll-save branch for non-existent `.blacksmith-window-template-details-content` in `window-base-v2.js` (body scroll only).
   - **Remaining**: Regent-related CSS in `window-template.css` (keep if `coffee-pub-regent` still embeds `#coffee-pub-regent-wrapper`); optional comment-only cleanup.

## What We Removed From This Doc

These historical sections were intentionally removed because the related subsystem is no longer part of current scope:
- Image replacement cache/search leak analysis tied to removed curator/image-replacement runtime.
- Old runaway-memory narrative as a current critical incident.
- Legacy stack-rank items that referenced removed files/flows.

## Plan (Next Review Cycle)

1. **Lifecycle hardening pass (High, short)**
   - ~~Add explicit `dispose()` teardown for observer/timer/listener-heavy managers~~ **Done:** `EncounterToolbar.dispose()`, `JournalPagePins.dispose()`, `closeGame` in `blacksmith.js` (see `PERFORMANCE-journal-lifecycle-checklist.md`).
   - ~~native socket fallback listener cleanup~~ **Done:** inbound `game.socket.off` before native re-register (`manager-sockets.js`).

2. **Journal monitoring consolidation (High, short)**
   - Choose one canonical monitoring pipeline (manager-owned), remove duplicate watcher path, and keep hook coverage minimal.

3. **Low-risk performance wins (Medium, short)**
   - Reduce timer global queries via cached nodes + cache refresh on render events.
   - Gate menubar full rerender behind dirty checks; keep partial/timer-only updates lightweight.

4. **Legacy cleanup sweep (Low, short)**
   - ~~Remove no-op hooks and duplicate setting registration.~~ **Done in pass 1 (13.5.8).**
   - Remove stale selectors/comments tied to removed subsystems (optional follow-up).

5. **Validation pass**
   - Re-run a 90–180 minute GM session and compare:
     - DOM nodes/documents trend
     - event listener counts (where measurable)
     - combat responsiveness
   - If stable, downgrade this investigation from ACTIVE to MONITORING.

