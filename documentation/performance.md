# Performance & Memory Diagnostics

Centralized notes for long-running performance and memory investigations. Use this file to capture reproduction steps, instrumentation plans, current findings, and next actions so the main `TODO.md` can stay concise.

---

## Memory Leak Investigation (CRITICAL)

- **Status**: PENDING
- **Owner**: Systems/Performance
- **Last Updated**: 2025-11-14

### Summary
- Browser tab grows from ~900 MB heap → 9.5 GB total during 3‑hour sessions, eventually crashing.
- Heap usage is stable; growth is in non-heap allocations (DOM, textures, audio, timer handles).
- Issue reproduces during normal gameplay with menubar, timers, token automation enabled.

### Reproduction & Instrumentation
1. Follow `documentation/testing.md` “Memory Diagnostic Playbook” for snapshots and timelines.
2. Track `PIXI.BaseTextureCache`, `canvas.stage.children`, and HookManager stats every 10 min.
3. Toggle subsystems (menubar, token indicators, timers, token movement) to isolate curves.
4. Capture at least three heap snapshots (baseline, mid-session, pre-crash) and diff by constructors.

### Current Findings (Stack Ranked)
| Rank | Severity | Area | Status |
| --- | --- | --- | --- |
| 1 | Critical | Hook cleanup | ✅ Completed – `HookManager.unregisterHook` implemented and all call sites updated. |
| 2 | High | Target hiding loop | ✅ Completed – replaced continuous RAF loop with event-driven hiding. |
| 3 | High | Token movement state | ✅ Completed – state resets on scene/mode changes and hooks clean up properly. |
| 4 | High | Token image search/filtering | ✅ Completed – cache indexes + lightweight result caching prevent 17k-entry clones. |
| 5 | High | Token image replacement window | ✅ Completed – teardown now removes DOM, listeners, and timers between opens. |
| 6 | Medium | Menubar rerenders | Active |
| 7 | Medium | Image cache footprint | Active |

4. **Token image search/filtering churn**
   - **Status**: ✅ Completed.
   - **Files**: `scripts/manager-image-cache.js`, `scripts/token-image-replacement.js`.
   - **Evidence**: Previous code cloned `ImageCacheManager.cache.files` (17k entries) per keystroke and cached deep copies of match arrays for five minutes, visible in heap snapshots as large `Array` diffs and cached match objects.
   - **Fix**: Added `categoryIndex`/`tagIndex` Maps during cache build, updated filtering/search routines to operate on ID lists, and changed `_cacheSearchResults` to store lightweight references only. Search now allocates O(resultCount) per query and releases arrays once pagination updates.

5. **Token image replacement window leaks DOM between opens**
   - **Status**: ✅ Completed.
   - **Files**: `scripts/token-image-replacement.js` (`_updateResults`, `_teardownWindowResources`, `close`).
   - **Evidence**:
     - Performance recording showed Documents climbing from 33 → 915 and Nodes from 72k → 254k after opening/replacing images several times.
     - Heap snapshots comparing “baseline” vs “post-window” contained thousands of `Detached HTMLDivElement` entries rooted in `.tir-thumbnail-item` trees.
   - **Root Cause**: `close()` only cleared arrays and removed a few listeners; the rendered DOM stayed attached to `document.body`, `<img>` elements kept `src` references (decoded textures), and tracked timeouts/hooks were left pending.
   - **Fix**: Introduced `_teardownWindowResources()` to clear delegated events, cancel tracked timeouts, wipe `this._activeImageElements`, remove the window root, and reset caches. `_updateResults()` now tracks `<img>` nodes so the next render can null their `src`. `close()` unregisters the `controlToken` hook via `HookManager.unregisterHook` and calls the teardown, ensuring each open/close cycle releases DOM/texture memory.

6. **Menubar re-renders too frequently**
   - **Files**: `scripts/api-menubar.js`.
   - **Evidence**: Hook registrations for `updateCombat`, `createCombatant`, `updateCombatant`, `deleteCombatant`, `renderApplication`, `closeApplication`, `updateActor`, `updateToken`, etc., most of which call `MenuBar.renderMenubar(true)` directly.
   - **Impact**: Any combat/timer/tokenevent rebuilds the entire menubar template, tears down event handlers, and recreates DOM nodes; detached nodes accumulate if cleanup fails. Adds CPU spikes during combat and increases GC pressure.
   - **Actionable Notes**: Introduce state diffing or throttling (e.g., `requestAnimationFrame` debouncing) and update only the relevant DOM fragments (timer text, leader badge, etc.).

7. **Image cache retains entire asset library in memory**
   - **Files**: `scripts/manager-image-cache.js`.
   - **Evidence**: `ImageCacheManager.cache` holds Maps for `files`, `folders`, `creatureTypes`, plus progress metadata. No eviction or unload. Scans only mutate the in-memory object; even after closing the feature the cache persists until page refresh.
   - **Impact**: 17k+ entries (names, tags, folder paths, metadata) plus progress strings consume hundreds of MB. Combined with search allocations, this explains non-heap growth despite stable JS heap.
   - **Actionable Notes**: Persist processed metadata to settings/storage to reload on demand, add a “flush cache” control, or load subsets lazily (e.g., per top-level folder). Track cache size and warn when above threshold.

Document any additional findings in this file, then link back to them from `TODO.md`.

