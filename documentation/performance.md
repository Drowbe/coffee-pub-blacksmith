# Performance & Memory Diagnostics

Current performance baseline and action plan after recent subsystem removals (OpenAI/Regent split from core, Broadcast/Herald removal, Curator/Image-replacement removal).

---

## Current Status

- **Status**: ACTIVE (fresh baseline review complete; targeted fixes pending)
- **Owner**: Systems/Performance
- **Last Updated**: 2026-03-02 (stack rank #7 pass 1: see Detailed Findings §7)
- **Key Observation**: We are **not** currently reproducing the old browser-tab runaway memory growth/crash pattern.

## Scope Notes

- This document intentionally removes legacy findings tied to removed subsystems.
- Keep this file focused on **current** code paths only.
- Related duplicate file exists at `documentation/performance.md`; keep these synchronized or consolidate to one canonical file.

## Current Findings (Stack Ranked)

| Rank | Severity | Area | Status |
| --- | --- | --- | --- |
| 1 | High | Encounter toolbar global observer/polling lifecycle | Active |
| 2 | High | Journal page pins observer/polling lifecycle | Active |
| 3 | High | Duplicate journal monitoring pipelines (duplicate work) | Active |
| 4 | Medium | Menubar full rerenders on frequent update paths | Active |
| 5 | Medium | Timer loops doing global DOM queries/rerenders | Active |
| 6 | Medium | Socket native fallback listener lifecycle | Active |
| 7 | Low | Legacy/no-op hooks and stale cleanup candidates | Pass 1 done (see §7) |

## Detailed Findings

1. **Encounter toolbar installs long-lived global work with no teardown path**
   - **Files**: `scripts/encounter-toolbar.js`
   - **Evidence**: Uses `MutationObserver`, `setInterval(..., 500)`, and document-level click listener; no explicit disconnect/clear/remove path found in current flow.
   - **Risk**: Session-long CPU churn, duplicate callbacks on lifecycle edge cases, potential retained references.

2. **Journal page pins keeps observer + interval alive**
   - **Files**: `scripts/journal-page-pins.js`
   - **Evidence**: `setInterval(..., 2000)` and `MutationObserver` started from ready path; no explicit global dispose in current flow.
   - **Risk**: Background scan overhead and retained references across long sessions/hot reload scenarios.

3. **Duplicate journal instrumentation stacks**
   - **Files**: `scripts/journal-page-pins.js`, `scripts/blacksmith.js`
   - **Evidence**: Both register broad journal render/application monitoring; overlapping observers/hooks appear to do similar work.
   - **Risk**: Duplicate processing, extra DOM scans, harder debugging when UI hooks fire multiple times.

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
   - **Evidence**: Native fallback registers socket listener; explicit `off` cleanup path is not clearly present.
   - **Risk**: Duplicate handlers on re-init/fallback transitions.

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
   - Add explicit `dispose()` teardown for observer/timer/listener-heavy managers:
     - `encounter-toolbar`
     - `journal-page-pins`
     - native socket fallback listener cleanup

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

