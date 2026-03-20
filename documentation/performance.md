# Performance & Memory Diagnostics

Centralized notes for long-running performance and memory investigations. Use this file to capture reproduction steps, instrumentation plans, current findings, and next actions so the main `TODO.md` can stay concise.

---

## Memory Leak Investigation (CRITICAL)

- **Status**: ACTIVE (high-risk items resolved; medium-risk validation in progress)
- **Owner**: Systems/Performance
- **Last Updated**: 2026-03-02

### Summary
- Browser tab grows from ~900 MB heap → 9.5 GB total during 3‑hour sessions, eventually crashing.
- Heap usage is stable; growth is in non-heap allocations (DOM, textures, audio, timer handles).
- Issue reproduces during normal gameplay with menubar, timers, token automation enabled.

### Reproduction & Instrumentation
1. Follow `documentation/testing.md` “Memory Diagnostic Playbook” for snapshots and timelines.
2. Track `PIXI.BaseTextureCache`, `canvas.stage.children`, and HookManager stats every 10 min.
3. Toggle subsystems (menubar, token indicators, timers, token movement) to isolate curves.
4. Capture at least three heap snapshots (baseline, mid-session, pre-crash) and diff by constructors.

### Acceptance Criteria (for closing this investigation)
- 3-hour GM session shows no runaway memory growth (no repeated upward staircase ending in tab instability/crash).
- Documents/Nodes trend stabilizes after repeated open/close cycles of heavy UIs (token image replacement, menubar-driven updates).
- No recurring detached DOM growth pattern across snapshot diffs.
- Combat remains responsive (no sustained UI stutter attributable to menubar full re-renders).

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

### Detailed Findings

**Items 1-3**: Critical and high-priority items resolved through infrastructure improvements (HookManager, event-driven patterns, state management). Documentation captured in table above.

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
   - **Status**: 🔄 Active (Medium Priority) – profiling gate before refactor
   - **Files**: `scripts/api-menubar.js`.
   - **Evidence**: Hooks (`updateCombat`, `createCombatant`, `updateCombatant`, `deleteCombatant`, `renderApplication`, `closeApplication`, `updateActor`, `updateToken`) → `updateCombatBar` → `updateSecondaryBar` → `renderMenubar(true)`. Combat bar updates trigger full menubar re-render (entire template, DOM teardown, handler reattach).
   - **Impact**: Full rebuild on each combat/HP/token event; detached nodes if cleanup fails; CPU spikes and GC pressure during combat.
   - **Mitigating factors**: 50ms debounce already in place; combat events typically a few per round, not continuous.
   - **Insight**: Benefit may not justify effort without evidence. Five other critical/high items are done; if memory/FPS are stable and no combat lag reported, this is lower priority.
   - **Approach options** (choose after validation):
     - **A) Stricter throttling** (~0.5–1 day): Increase debounce or use RAF for combat hooks. Low risk.
     - **B) Combat bar fragment update** (~2–3 days): `_renderCombatBarOnly(data)` that updates only the combat partial; stop calling `renderMenubar` from `updateSecondaryBar` when combat bar is open. Higher impact, more testing.
     - **C) Full fragment updates** (~3–4 days): Extend B to all secondary bars; `updateSecondaryBarItemInfo` triggers partial re-render for encounter bar.
     - **D) State diffing** (~1–2 weeks): Minimal DOM patching. Major refactor.
   - **Recommendation**: Profile during combat first. If menubar re-renders are not a hotspot → defer. If needed → start with A; only pursue B if profiling shows combat path as significant cost.

7. **Image cache retains entire asset library in memory**
   - **Status**: 🔄 Active (Medium Priority)
   - **Files**: `scripts/manager-image-cache.js`.
   - **Evidence**: `ImageCacheManager.cache` holds Maps for `files`, `folders`, `creatureTypes`, plus progress metadata. No eviction or unload. Scans only mutate the in-memory object; even after closing the feature the cache persists until page refresh.
   - **Impact**: 17k+ entries (names, tags, folder paths, metadata) plus progress strings consume hundreds of MB. Combined with search allocations, this explains non-heap growth despite stable JS heap.
   - **Actionable Notes**: Persist processed metadata to settings/storage to reload on demand, add a “flush cache” control, or load subsets lazily (e.g., per top-level folder). Track cache size and warn when above threshold.

### Current Execution Plan (short-term)
1. **Baseline pass (no code changes)**  
   Run one 90–180 minute session with current `13.5.x` build and collect timeline + snapshots. Confirm whether crash profile still reproduces.

2. **Menubar decision gate**  
   If profiling shows frequent full menubar rebuilds as a top CPU/GC contributor during combat, implement Option A (throttling) first; re-profile before considering Option B.

3. **Image cache safety controls**  
   Add a manual cache flush path and lightweight cache-size telemetry (counts + approximate memory estimate) before implementing larger lazy-load/persistence work.

4. **Report + decision**  
   Update this document with: reproduction result, before/after metrics, and go/no-go on deeper refactors.

Document any additional findings in this file, then link back to them from `TODO.md`.

