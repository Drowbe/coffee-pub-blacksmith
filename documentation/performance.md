# Performance & Memory Diagnostics

Single source of truth for performance, lifecycle, and journal/encounter monitoring. Update this file (and **`CHANGELOG.md`** when closing items) instead of spinning off parallel checklists.

---

## Current Status

- **Status**: ACTIVE (code review 2026-03-28; duplicate-hook and watchdog retention issues identified)
- **Owner**: Systems/Performance
- **Last Updated**: 2026-03-28 (merged journal lifecycle checklist; grep-based code review)
- **Key observation**: We are **not** currently reproducing the old browser-tab runaway memory growth/crash pattern. Session slowdown may still come from **duplicate hook work**, **unpruned watchdog state**, and **per-tick global DOM queries**.

## Scope Notes

- This document intentionally removes legacy findings tied to removed subsystems.
- Keep this file focused on **current** code paths only.
- Uppercase canonical: `documentation/PERFORMANCE.md`.

## Current Findings (Stack Ranked)

| Rank | Severity | Area | Status |
| --- | --- | --- | --- |
| 1 | High | Encounter toolbar lifecycle (`dispose` + `closeGame`) | Done; legacy global observer path in file is **uncalled** (see §Journal checklist rank 1) |
| 2 | High | Journal page pins lifecycle (`dispose` + `closeGame`) | Done; **duplicate hook registration** still causes double pin-bar work per render (see finding §8) |
| 3 | High | Duplicate journal monitoring pipelines | Shared `JournalDomWatchdog` done; **Hooks.on + HookManager** overlap remains for pins |
| 4 | Medium | Menubar full rerenders on frequent update paths | Active |
| 5 | Medium | Timer loops doing global DOM queries/rerenders | Active (`timer-round.js`, `timer-planning.js`, menubar timer interval) |
| 6 | Medium | Socket native fallback listener lifecycle | Native inbound teardown done (see §6) |
| 7 | Low | Legacy/no-op hooks and stale cleanup candidates | Pass 1 done (see §7) |
| 8 | High | **`JournalPagePins` double-registers journal render hooks** | Active — same bound callback via direct `Hooks.on` and `HookManager.registerHook` (`ui-journal-pins.js`) |
| 9 | Medium | **`JournalDomWatchdog._knownSheets` never prunes** detached sheet roots | Active — closed journals may stay referenced in the `Set`, hurting GC over long sessions (`manager-journal-dom.js`) |
| 10 | Medium | **`QuickViewUtility.initialize`** — multiple `Hooks.on` without stored IDs / teardown | Risk on hot reload if `initialize` runs twice; constant session cost from token hooks (`utility-quickview.js`) |
| 11 | Low | **`PinRenderer.cleanup` / `PinDOMElement.cleanup`** not wired to `closeGame` | `PinManager.cleanup` on `unloadModule` does not call `PinRenderer.cleanup()` — gap for disable/hot-reload hygiene (`pins-renderer.js`, `manager-pins.js`) |

## Detailed Findings

1. **Encounter toolbar global observer / polling**
   - **Files**: `scripts/ui-journal-encounter.js`
   - **Evidence (historical)**: `_setupGlobalObserver` still contains `MutationObserver`, `setInterval(..., 500)`, document capture-phase click — but **`init()` does not call `_setupGlobalObserver()`** (dead path). Live path uses **`JournalDomWatchdog`** + HookManager hooks.
   - **Mitigation (done)**: `EncounterToolbar.dispose()` clears legacy fields if ever used, unregisters watchdog handlers, removes HookManager callbacks; `Hooks.once('closeGame', …)` in `blacksmith.js` invokes it. `init()` is idempotent.
   - **Remaining**: Remove dead `_setupGlobalObserver` / `_setupActivePageChecker` / `_setupPageNavigationListener` code, or gate behind a debug flag, to avoid future accidental re-enable.

2. **Journal page pins observer + interval**
   - **Files**: `scripts/ui-journal-pins.js`
   - **Evidence**: `_setupDomObserver()` defines a body `MutationObserver` but **nothing calls it** (dead path). Live updates use **`JournalDomWatchdog`** + hooks. `dispose()` still clears `_domObserver` / `_intervalId` defensively.
   - **Mitigation (done)**: `JournalPagePins.dispose()` clears interval/observer, `Hooks.off` + `HookManager.removeCallback`; same `closeGame` path.
   - **Remaining (critical perf)**: **Remove duplicate registration** — see §8. Optionally drop redundant **`renderApplication`** direct `Hooks.on` after tests (see checklist rank 2).

3. **Duplicate journal instrumentation stacks**
   - **Files**: `scripts/ui-journal-pins.js`, `scripts/blacksmith.js`, `scripts/manager-journal-dom.js`
   - **Evidence**: Shared watchdog consolidates DOM observation. **Pins still register the same render callbacks twice** (§8). Blacksmith journal double-click uses HookManager + `JournalDomWatchdog` only (no second body observer).
   - **Mitigation (pass C, done)**: `JournalDomWatchdog` rewired encounter, pins, and blacksmith double-click off duplicate per-feature body observers.
   - **Remaining**: Prefer **one** registration path for pins (HookManager-only or direct `Hooks.on`, not both). Phase D: unify hooks where redundant.

4. **Menubar rerender path is still broad**
   - **Files**: `scripts/api-menubar.js`
   - **Evidence**: Full container remove/rebuild path remains reachable from frequent update flows; `_timerDisplayInterval` runs `updateTimerDisplay()` every 1s.
   - **Risk**: Extra DOM churn and event rebind overhead under combat-heavy updates.

5. **Timer UI updates query broadly and trigger extra renders**
   - **Files**: `scripts/timer-round.js`, `scripts/timer-planning.js`
   - **Evidence**: `document.querySelectorAll` for `.round-timer-container .combat-time-round`, `.combat-endcap-left .combat-time-round`, etc., on a **1s interval** while combat is active.
   - **Risk**: Unnecessary per-tick DOM/query cost during long combats.

6. **Socket fallback lifecycle cleanup gap**
   - **Files**: `scripts/manager-sockets.js`
   - **Evidence (historical)**: Native fallback registered `game.socket.on` without removing prior listeners on the module channel.
   - **Mitigation (done)**: `_initializeNativeSockets` calls `_teardownNativeSocketListener()` (`game.socket.off(moduleChannel)`) before `on`, and replaces `_nativeHandlers` with a fresh `Map`.
   - **Remaining (optional)**: Explicit teardown on world unload / `closeGame` if long-lived sessions without full reload ever show duplicate behavior again. **`_fallbackTimer`** `setInterval` stops when SocketLib connects or max attempts reached — verify no edge case leaves it running.

7. **Legacy/unused cleanup opportunities**
   - **Files**: `scripts/blacksmith.js`, `scripts/settings.js`, `styles/window-template.css`, `scripts/window-base.js`
   - **Pass 1 (done)**: Removed empty HookManager registrations, duplicate `movementType` setting, dead scroll-save branch.
   - **Remaining**: Regent-related CSS (optional). **Journal double-click**: `_onRenderJournalDoubleClick` may attach a **per-sheet `MutationObserver` (`editModeObserver`)** until edit mode activates; if the user closes the sheet in view mode first, confirm whether the observer is disconnected (possible retained observer + DOM reference per opened journal).

8. **Journal page pins — duplicate `renderJournalSheet` / `renderJournalPageSheet` handlers (new, 2026-03-28)**
   - **Files**: `scripts/ui-journal-pins.js` (`_registerHooks`)
   - **Evidence**: The same `_boundRenderSheet` is registered with **`Hooks.on('renderJournalSheet', …)`** and **`Hooks.on('renderJournalPageSheet', …)`** *and* again via **`HookManager.registerHook`** for both hook names. `HookManager` already installs a single Foundry hook runner per name; the direct `Hooks.on` calls add **additional** invocations. Net effect: **pin injection / bar logic can run twice per journal render**, scaling with how often journals open or re-render — a strong candidate for **session-long CPU creep** when journals are used heavily.
   - **Mitigation**: Drop the direct `Hooks.on` pair (or drop HookManager entries for these two hooks only) so each hook name invokes the pin callback **once**. Keep `renderApplication` only if still required after that change.

9. **`JournalDomWatchdog` — `_knownSheets` retention (new, 2026-03-28)**
   - **Files**: `scripts/manager-journal-dom.js`
   - **Evidence**: The interval fallback iterates `_knownSheets` and skips nodes not in `document.body`, but **does not remove** detached sheet elements from the `Set`. Each opened journal root can stay referenced for the rest of the session.
   - **Risk**: Prevents GC of large sheet subtrees after close; `Set` grows with unique sheet elements over a long night of play.
   - **Mitigation**: On each tick (or on `childList` mutations), **`delete` entries that fail `document.body.contains(sheet)`** (and optionally clear related `WeakMap` entries — WeakMap drops automatically when key is GC-eligible; the **Set** is what holds the key alive).

10. **`QuickViewUtility` hooks (new, 2026-03-28)**
   - **Files**: `scripts/utility-quickview.js`
   - **Evidence**: `initialize()` calls `Hooks.on` five times (`canvasReady` ×2, `createToken`, `updateToken`, `controlToken`) with **no stored hook IDs** and **no `Hooks.off`** on world exit.
   - **Risk**: If `initialize()` were ever invoked more than once, handlers would stack. Even once, **`updateToken` while clarity mode is active** forces `_hideAllTokens` + `_showAllTokens` — noisy during token-heavy scenes.
   - **Mitigation**: Store hook IDs; guard `initialize` with `_initialized`; optionally register `Hooks.once('closeGame', …)` to `Hooks.off` (or tear down overlays).

11. **Pin DOM layer cleanup not wired to world exit (new, 2026-03-28)**
   - **Files**: `scripts/pins-renderer.js`, `scripts/manager-pins.js`
   - **Evidence**: `PinDOMElement.cleanup()` removes hooks, resize listener, and overlay; **`PinRenderer.cleanup()` is not called** from `PinManager.cleanup()` or `blacksmith.js` `closeGame`. Only **module unload** path registers `PinManager.cleanup` (and that cleanup does **not** import `PinRenderer.cleanup`).
   - **Risk**: Lower for a single world session (initialize is idempotent), but inconsistent lifecycle story vs journal `dispose`; worth wiring for parity and hot reload.

12. **Other global hooks (session lifetime)**
   - **Files**: `scripts/sidebar-combat.js` — `Hooks.on('renderApplication', …)` fires for every sidebar render; filter is cheap but high **call volume**. `scripts/pins-renderer.js` — `PinDOMElement` registers `canvasPan`, `updateScene`, `canvasReady` (cleaned up only if `PinDOMElement.cleanup()` runs).

## Journal & encounter lifecycle checklist

Actionable steps aligned with ranks 1–3 above. When an item moves to done, update the stack table and **`CHANGELOG.md`**.

### Rank 1 — Encounter toolbar (`scripts/ui-journal-encounter.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 1.1 | **Track long-lived handles** | **`init()` uses `JournalDomWatchdog` only** for journal sheet/page events. `_setupGlobalObserver` (body `MutationObserver`, 500ms interval, capture click) exists in the file but is **not invoked** by `init()` — treat as legacy/dead unless reconnected. |
| 1.2 | **Teardown** | `EncounterToolbar.dispose()` unregisters watchdog handlers and removes token/hooks; clears `_globalObserver` / interval / capture listener if present. |
| 1.3 | **HookManager IDs** | Store IDs from `registerHook` (journal sheet / page sheet / `updateJournalEntryPage` / `settingChange`); `removeCallback` in `dispose`. Token CR hooks use `_tokenHookIds` — cleared in `dispose`. |
| 1.4 | **Idempotent `init`** | Guard so hot reload / double init does not stack observers or intervals. |
| 1.5 | **World exit** | `Hooks.once('closeGame', …)` calls `dispose()` (see `blacksmith.js`). |
| 1.6 | **Optional** | Delete dead `_setupGlobalObserver` stack after sanity check, or document why it must stay. |

### Rank 2 — Journal page pins (`scripts/ui-journal-pins.js`; shim `scripts/journal-page-pins.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 2.1 | **Track handles** | **`_afterReady` uses `JournalDomWatchdog`**. `_setupDomObserver()` is **uncalled** (dead); `dispose` still disconnects `_domObserver` if set. |
| 2.2 | **Teardown** | `JournalPagePins.dispose()` unregisters watchdog handlers and removes HookManager/direct hook handlers. |
| 2.3 | **HookManager** | Store `registerHook` IDs for `renderJournalSheet` + `renderJournalPageSheet`; `removeCallback` in `dispose`. **Also remove duplicate direct `Hooks.on` for those two hooks** (see §8). |
| 2.4 | **Idempotent `init`** | Single registration path; `dispose` clears `_initialized` (full re-init after dispose in-session is not supported because of `Hooks.once('ready', …)` — reload world or F5). |
| 2.5 | **Optional** | Drop redundant **`renderApplication`** listener if HookManager + sheet hooks cover all journal apps in your test matrix. |
| 2.6 | **Future** | If **`PinManager.registerHandler`** gains an unregister API, remove the journal-page `doubleClick` handler in `dispose` for symmetry. |

### Rank 3 — Duplicate journal monitoring (`scripts/blacksmith.js` + encounter + pins)

| Source | What it does |
| --- | --- |
| **EncounterToolbar** | HookManager render hooks + **`JournalDomWatchdog`** (no second body observer from `init()`). |
| **JournalPagePins** | HookManager + **direct `Hooks.on`** + watchdog — **double fire on render hooks** until §8 fixed. |
| **Blacksmith (double-click)** | HookManager + **`JournalDomWatchdog`** (no duplicate body observer). |

#### Consolidation plan (phased)

| Phase | Action |
| --- | --- |
| **A — Document** | This section + §3 / §8 describe overlap (single file). |
| **B — Remove debug** | Remove any stray `console.log` on `renderJournalSheet` in `blacksmith.js` when no longer needed. |
| **C — Shared observer** | **Done:** `scripts/manager-journal-dom.js` + rewires in `blacksmith.js`, `ui-journal-encounter.js`, `ui-journal-pins.js`. |
| **D — Unify hooks** | **Pins:** one registration path per hook name. Prefer HookManager-only for consistency with encounter toolbar. |

### Verification (after changes)

1. Open journal (v13 sheet), switch pages — encounter toolbar + pin bar still appear when expected.  
2. Toggle journal edit/view — no duplicate toolbars; CPU stable over 10+ minutes with journals closed.  
3. Return to setup / reload — no duplicate intervals after re-entering world (best-effort with `closeGame` teardown).  
4. (Dev) Hot reload module — no second 500 ms / 1 s journal timer (idempotent `init` + single hook path).

### Related files

- `scripts/manager-journal-dom.js` — shared journal sheet/page DOM observer + 1s interval fallback  
- `scripts/ui-journal-encounter.js` — `init` / `dispose`; watchdog handlers  
- `scripts/ui-journal-pins.js` — `_afterReady` watchdog; **`_registerHooks` duplicate registration (fix §8)**  
- `scripts/blacksmith.js` — journal double-click + `closeGame` dispose for encounter + pins  

## What We Removed From This Doc

These historical sections were intentionally removed because the related subsystem is no longer part of current scope:

- Image replacement cache/search leak analysis tied to removed curator/image-replacement runtime.
- Old runaway-memory narrative as a current critical incident.
- Legacy stack-rank items that referenced removed files/flows.

## Plan (Next Review Cycle)

1. **Fix duplicate journal pin hooks (High, short)** — Remove redundant `Hooks.on` or redundant `HookManager.registerHook` entries in `ui-journal-pins.js` (§8). Re-test journal open/page switch/pin bar.

2. **Watchdog sheet pruning (Medium, short)** — In `manager-journal-dom.js`, remove detached sheet nodes from `_knownSheets` (§9).

3. **Lifecycle hardening pass** — ~~`dispose()` for observer/timer-heavy managers~~ **Done.** ~~Native socket inbound `off` before `on`~~ **Done.**

4. **Quick View / pin overlay parity (Medium, optional)** — Store hook IDs for `QuickViewUtility`; consider `closeGame` → `PinRenderer.cleanup()` for symmetry (§10–§11).

5. **Low-risk performance wins (Medium, short)** — Reduce timer global queries via cached nodes + cache refresh on render events. Gate menubar full rerender behind dirty checks.

6. **Dead code removal (Low)** — Encounter `_setupGlobalObserver` stack; pins `_setupDomObserver` if permanently unused.

7. **Validation pass** — Re-run a 90–180 minute GM session and compare DOM node trend, listener counts, combat responsiveness. If stable, downgrade status from ACTIVE to MONITORING.
