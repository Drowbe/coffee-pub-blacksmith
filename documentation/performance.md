# Performance & Memory Diagnostics

Single source of truth for performance, lifecycle, and journal/encounter monitoring. Update this file (and **`CHANGELOG.md`** when closing items) instead of spinning off parallel checklists.

---

## Current Status

- **Status**: ACTIVE (pins hooks + watchdog prune fixed 2026-03-28; other items still tracked)
- **Owner**: Systems/Performance
- **Last Updated**: 2026-03-28 (rank 5: cached timer DOM for round / planning / combat tracker timers)
- **Client validation**: In-world smoke test after these changes — journal page pins, page switching, and encounter toolbar reported **OK** (no duplicate pin bar / obvious regression).
- **Key observation**: We are **not** currently reproducing the old browser-tab runaway memory growth/crash pattern. Remaining session cost drivers include **menubar churn** and **Quick View token hooks** (see stack table); combat tracker timer DOM is **cached** (rank 5 mitigated).

## Monitoring memory in the client (Chrome / Edge)

Useful for the **90–180 minute validation pass** in the plan below.

1. **Performance monitor** — DevTools (**F12**) → **⋮** → **More tools** → **Performance monitor**. Enable **JS heap size** and **DOM Nodes**; watch for a sustained upward trend vs normal GC noise.
2. **Heap snapshots** — DevTools → **Memory** → **Heap snapshot** → baseline, then stress (e.g. open/close journals many times), then second snapshot → **Comparison** view for retained growth.
3. **Tab memory** — **Shift+Esc** → browser **Task Manager** → Foundry tab **Memory** column over time.

After a stress segment, closing journals should allow **DOM nodes** to drop somewhat; flatlines at a new high warrant a heap comparison snapshot.

## Scope Notes

- This document intentionally removes legacy findings tied to removed subsystems.
- Keep this file focused on **current** code paths only.
- Uppercase canonical: `documentation/PERFORMANCE.md`.

## Current Findings (Stack Ranked)

**Status values:** **Done** / **Mitigated** / **Active** (quick scan the Status column; detail is in Notes).

| Rank | Severity | Area | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | High | Encounter toolbar lifecycle (`dispose` + `closeGame`) | Done | Legacy `_setupGlobalObserver` uncalled; see journal checklist rank 1 |
| 2 | High | Journal page pins lifecycle (`dispose` + `closeGame`) | Done | HookManager-only: `renderJournalSheet`, `renderJournalPageSheet`, `renderApplication` — `ui-journal-pins.js` |
| 3 | High | Duplicate journal monitoring pipelines | Done | Shared `JournalDomWatchdog`; pins use HookManager-only for journal render hooks |
| 4 | Medium | Menubar full rerenders on frequent update paths | Mitigated | Structure fingerprint skips DOM tear/rebuild when unchanged; `updateLeaderDisplay` full render only when leader-only visibility flips (`api-menubar.js`) |
| 5 | Medium | Timer loops: global DOM queries / rerenders | Mitigated | Round / planning / combat tracker: cached element lists, refresh on `renderCombatTracker` or stale refs; menubar session timer remains label-only refresh (`api-menubar.js`) |
| 6 | Medium | Socket native fallback listener lifecycle | Done | Inbound `game.socket.off` before `on`; see §6 |
| 7 | Low | Legacy / no-op hooks, stale cleanup | Done | Pass 1; see §7 |
| 8 | High | Journal pins duplicate render hooks | Mitigated | 2026-03-28: removed duplicate `Hooks.on`; `renderApplication` via HookManager |
| 9 | Medium | `JournalDomWatchdog._knownSheets` retention | Mitigated | 2026-03-28: `_pruneDetachedSheets()` each interval — `manager-journal-dom.js` |
| 10 | Medium | `QuickViewUtility.initialize` hook lifecycle | Active | No stored hook IDs; token hook cost — `utility-quickview.js` |
| 11 | Low | Pin DOM cleanup vs world exit | Active | `PinRenderer.cleanup` not on `closeGame` / `PinManager.cleanup` — see §11 |

## Detailed Findings

1. **Encounter toolbar global observer / polling**
   - **Files**: `scripts/ui-journal-encounter.js`
   - **Evidence (historical)**: `_setupGlobalObserver` still contains `MutationObserver`, `setInterval(..., 500)`, document capture-phase click — but **`init()` does not call `_setupGlobalObserver()`** (dead path). Live path uses **`JournalDomWatchdog`** + HookManager hooks.
   - **Mitigation (done)**: `EncounterToolbar.dispose()` clears legacy fields if ever used, unregisters watchdog handlers, removes HookManager callbacks; `Hooks.once('closeGame', …)` in `blacksmith.js` invokes it. `init()` is idempotent.
   - **Remaining**: Remove dead `_setupGlobalObserver` / `_setupActivePageChecker` / `_setupPageNavigationListener` code, or gate behind a debug flag, to avoid future accidental re-enable.

2. **Journal page pins observer + interval**
   - **Files**: `scripts/ui-journal-pins.js`
   - **Evidence**: `_setupDomObserver()` defines a body `MutationObserver` but **nothing calls it** (dead path). Live updates use **`JournalDomWatchdog`** + hooks. `dispose()` still clears `_domObserver` / `_intervalId` defensively.
   - **Mitigation (done)**: `JournalPagePins.dispose()` clears interval/observer + **HookManager.removeCallback** only (no duplicate `Hooks.on`); same `closeGame` path.
   - **Remaining**: Optional: drop **`renderApplication`** HookManager callback if sheet hooks prove sufficient in your matrix (checklist rank 2.5).

3. **Duplicate journal instrumentation stacks**
   - **Files**: `scripts/ui-journal-pins.js`, `scripts/blacksmith.js`, `scripts/manager-journal-dom.js`
   - **Evidence**: Shared watchdog consolidates DOM observation. **Pins use HookManager-only** for journal render hooks (§8 mitigated). Blacksmith journal double-click uses HookManager + `JournalDomWatchdog` only (no second body observer).
   - **Mitigation (pass C, done)**: `JournalDomWatchdog` rewired encounter, pins, and blacksmith double-click off duplicate per-feature body observers.
   - **Remaining**: Phase D — audit other features for redundant direct `Hooks.on` where HookManager already wraps the same hook name.

4. **Menubar rerender path is still broad**
   - **Files**: `scripts/api-menubar.js`
   - **Evidence (mitigated 2026-03-28)**: `renderMenubar` compares `_computeMenubarStructureFingerprint(templateData)` to `_menubarStructureFingerprint`; if equal and primary container exists, **`_applyMenubarLightweightRefresh`** updates leader/movement/timer/memory labels only (no `remove`/`insertAdjacentHTML`). **`updateLeaderDisplay`** calls full `renderMenubar(true)` only when **`_lastMenubarIsLeader`** changes (leader-only tools strip). Session timer still uses **`updateTimerDisplay`** (1s) without full menubar rebuild.
   - **Remaining**: Dynamic tool **title** changes without zone/active/visibility change may not refresh until something else invalidates the fingerprint; toggle/register paths still force rebuild when signature changes.
   - **Fix (2026-03-28 follow-up)**: Fingerprint now includes **`_secondaryBarLiveContentSignature()`** — serialized `secondaryBarInfoUpdates` for the open bar (party health, reputation, encounter info items) plus **`JSON.stringify(secondaryBar.data)`** for **custom** secondary bars (Minstrel, Herald, combat). Without this, `updateSecondaryBarItemInfo` / `updateSecondaryBar` called `renderMenubar(true)` but the skip path left secondary DOM stale.
   - **Fix (second follow-up)**: Same signature includes **`secondaryBarActiveStates`** (switch / “select one” groups) and **non-switch toggleable** button `active` bits so selected styling updates after clicks.

5. **Timer UI updates query broadly and trigger extra renders**
   - **Files**: `scripts/timer-round.js`, `scripts/timer-planning.js`, `scripts/timer-combat.js`
   - **Evidence (historical)**: `document.querySelectorAll` on a **1s interval** (round timer) and on every `updateUI` / `syncState` for planning and combat timers.
   - **Mitigation (2026-03-28)**: **Round timer** — cache four node lists; **refresh** when any cached node disconnects or after **`renderCombatTracker`** injects markup. **Planning / combat timers** — cache bar/text/progress arrays; **refresh** when stale, when cache is empty while the timer should be visible, or after **`renderCombatTracker`** (combat timer explicitly refreshes before `updateUI`). **Remaining**: menubar session timer tick (unchanged; not full menubar rebuild).

6. **Socket fallback lifecycle cleanup gap**
   - **Files**: `scripts/manager-sockets.js`
   - **Evidence (historical)**: Native fallback registered `game.socket.on` without removing prior listeners on the module channel.
   - **Mitigation (done)**: `_initializeNativeSockets` calls `_teardownNativeSocketListener()` (`game.socket.off(moduleChannel)`) before `on`, and replaces `_nativeHandlers` with a fresh `Map`.
   - **Remaining (optional)**: Explicit teardown on world unload / `closeGame` if long-lived sessions without full reload ever show duplicate behavior again. **`_fallbackTimer`** `setInterval` stops when SocketLib connects or max attempts reached — verify no edge case leaves it running.

7. **Legacy/unused cleanup opportunities**
   - **Files**: `scripts/blacksmith.js`, `scripts/settings.js`, `styles/window-template.css`, `scripts/window-base.js`
   - **Pass 1 (done)**: Removed empty HookManager registrations, duplicate `movementType` setting, dead scroll-save branch.
   - **Remaining**: Regent-related CSS (optional). **Journal double-click**: `_onRenderJournalDoubleClick` may attach a **per-sheet `MutationObserver` (`editModeObserver`)** until edit mode activates; if the user closes the sheet in view mode first, confirm whether the observer is disconnected (possible retained observer + DOM reference per opened journal).

8. **Journal page pins — duplicate `renderJournalSheet` / `renderJournalPageSheet` handlers**
   - **Files**: `scripts/ui-journal-pins.js` (`_registerHooks`)
   - **Evidence (fixed 2026-03-28)**: Previously the same `_boundRenderSheet` was registered with both **`Hooks.on`** and **`HookManager.registerHook`**, doubling pin work per render.
   - **Mitigation (done)**: **HookManager only** for `renderJournalSheet`, `renderJournalPageSheet`, and **`renderApplication`** (journal filter inside callback). `dispose` removes all three via `HookManager.removeCallback`.

9. **`JournalDomWatchdog` — `_knownSheets` retention**
   - **Files**: `scripts/manager-journal-dom.js`
   - **Evidence (fixed 2026-03-28)**: Interval skipped detached sheets but never removed them from `_knownSheets`.
   - **Mitigation (done)**: **`_pruneDetachedSheets()`** runs at the start of each 1s interval tick; removes detached roots from the `Set` and **`WeakMap.delete(sheet)`** for tracked page ids.

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
| 2.2 | **Teardown** | `JournalPagePins.dispose()` unregisters watchdog handlers and **`HookManager.removeCallback`** for all registered hook IDs (no direct `Hooks.on` for journal renders). |
| 2.3 | **HookManager** | Store IDs for `renderJournalSheet`, `renderJournalPageSheet`, and filtered **`renderApplication`**; `removeCallback` in `dispose`. |
| 2.4 | **Idempotent `init`** | Single registration path; `dispose` clears `_initialized` (full re-init after dispose in-session is not supported because of `Hooks.once('ready', …)` — reload world or F5). |
| 2.5 | **Optional** | Drop redundant **`renderApplication`** listener if HookManager + sheet hooks cover all journal apps in your test matrix. |
| 2.6 | **Future** | If **`PinManager.registerHandler`** gains an unregister API, remove the journal-page `doubleClick` handler in `dispose` for symmetry. |

### Rank 3 — Duplicate journal monitoring (`scripts/blacksmith.js` + encounter + pins)

| Source | What it does |
| --- | --- |
| **EncounterToolbar** | HookManager render hooks + **`JournalDomWatchdog`** (no second body observer from `init()`). |
| **JournalPagePins** | **HookManager-only** journal render hooks + **`JournalDomWatchdog`**. |
| **Blacksmith (double-click)** | HookManager + **`JournalDomWatchdog`** (no duplicate body observer). |

#### Consolidation plan (phased)

| Phase | Action |
| --- | --- |
| **A — Document** | This section + §3 / §8 describe overlap (single file). |
| **B — Remove debug** | Remove any stray `console.log` on `renderJournalSheet` in `blacksmith.js` when no longer needed. |
| **C — Shared observer** | **Done:** `scripts/manager-journal-dom.js` + rewires in `blacksmith.js`, `ui-journal-encounter.js`, `ui-journal-pins.js`. |
| **D — Unify hooks** | **Pins:** HookManager-only for `renderJournalSheet` / `renderJournalPageSheet` / `renderApplication` (**done** 2026-03-28). |

### Verification (after changes)

1. Open journal (v13 sheet), switch pages — encounter toolbar + pin bar still appear when expected.  
2. Toggle journal edit/view — no duplicate toolbars; CPU stable over 10+ minutes with journals closed.  
3. Return to setup / reload — no duplicate intervals after re-entering world (best-effort with `closeGame` teardown).  
4. (Dev) Hot reload module — no second 500 ms / 1 s journal timer (idempotent `init` + single hook path).

### Related files

- `scripts/manager-journal-dom.js` — shared journal sheet/page DOM observer + 1s interval fallback  
- `scripts/ui-journal-encounter.js` — `init` / `dispose`; watchdog handlers  
- `scripts/ui-journal-pins.js` — `_afterReady` watchdog; `_registerHooks` uses HookManager only for journal render hooks  
- `scripts/blacksmith.js` — journal double-click + `closeGame` dispose for encounter + pins  

## What We Removed From This Doc

These historical sections were intentionally removed because the related subsystem is no longer part of current scope:

- Image replacement cache/search leak analysis tied to removed curator/image-replacement runtime.
- Old runaway-memory narrative as a current critical incident.
- Legacy stack-rank items that referenced removed files/flows.

## Plan (Next Review Cycle)

1. ~~**Duplicate journal pin hooks**~~ **Done (2026-03-28)** — HookManager-only in `ui-journal-pins.js`.

2. ~~**Watchdog `_knownSheets` prune**~~ **Done (2026-03-28)** — `_pruneDetachedSheets()` in `manager-journal-dom.js`.

3. **Lifecycle hardening pass** — ~~`dispose()` for observer/timer-heavy managers~~ **Done.** ~~Native socket inbound `off` before `on`~~ **Done.**

4. **Quick View / pin overlay parity (Medium, optional)** — Store hook IDs for `QuickViewUtility`; consider `closeGame` → `PinRenderer.cleanup()` for symmetry (§10–§11).

5. **Low-risk performance wins (Medium, short)** — Reduce timer global queries via cached nodes + cache refresh on render events. ~~Gate menubar full rerender~~ **Menubar fingerprint + leader dirty check done (2026-03-28).**

6. **Dead code removal (Low)** — Encounter `_setupGlobalObserver` stack; pins `_setupDomObserver` if permanently unused.

7. **Validation pass** — Re-run a 90–180 minute GM session and compare DOM node trend, listener counts, combat responsiveness. If stable, downgrade status from ACTIVE to MONITORING.
