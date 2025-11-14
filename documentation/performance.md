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
| Rank | Severity | Area | Description |
| --- | --- | --- | --- |
| 1 | Critical | Hook cleanup | `HookManager.unregisterHook` is called in multiple modules but not implemented; cleanup paths throw before removing callbacks, so hooks, timers, PIXI graphics, and RAF loops accumulate every reload. |
| 2 | High | Target hiding loop | `_onCanvasReadyForHiding` starts a `requestAnimationFrame` loop that hides targets every frame (all tokens, 60 fps). Because cleanup never runs (see above), the loop and its captured references persist indefinitely, driving CPU and preventing GC. |
| 3 | High | Token movement state | `token-movement.js` registers global `preUpdateToken`/`updateToken` hooks and stores large Maps/Sets (`leaderMovementPath`, `tokenFollowers`, etc.) without teardown. Tokens from prior scenes stay referenced, retaining textures and audio buffers. |
| 4 | High | Token image search | `_getFilteredFiles` clones the entire 17k-entry cache on every search/filter, and `_cacheSearchResults` keeps deep copies of result arrays (up to 50 cached entries). Searching or scrolling allocates tens of thousands of objects and keeps them alive for 5+ minutes. |
| 5 | Medium | Menubar rerenders | Numerous hooks (`updateCombat`, `updateToken`, `renderApplication`, etc.) call `MenuBar.renderMenubar(true)` each time. Every HP change or tracker toggle rebuilds the entire menubar DOM, creating detached nodes and reloading templates. |
| 6 | Medium | Image cache footprint | `ImageCacheManager.cache` holds metadata for every discovered asset with no eviction/unload path. 17k+ entries (names, tags, folder paths) remain in memory even when the feature is idle, consuming hundreds of MB. |

#### Finding Details

1. **Hook cleanup not implemented**
   - **Files**: `scripts/manager-hooks.js`, `scripts/manager-canvas.js`, `scripts/token-image-utilities.js`, `scripts/manager-navigation.js`, others.
   - **Evidence**: Callers invoke `HookManager.unregisterHook(...)` in cleanup paths, but `manager-hooks.js` only exports `registerHook`, `removeHook`, and `removeCallback`. The missing method throws, so teardown logic never unregisters callbacks or clears requestAnimationFrame handles. Example:
     - `scripts/manager-canvas.js` → `CanvasTools.cleanup()` (lines ~606–634).
     - `scripts/token-image-utilities.js` → `cleanupTurnIndicator()` (lines ~1470–1507).
   - **Impact**: Every reload duplicates hooks, timers, PIXI graphics, and RAF loops; memory and CPU usage grow across play sessions.
   - **Actionable Notes**: Implement `HookManager.unregisterHook(name, callbackId?)` or switch callers to `removeCallback` / `disposeByContext`. Audit modules for manual hook storage once the helper exists.

2. **Target-hiding RAF loop runs indefinitely**
   - **Files**: `scripts/token-image-utilities.js` (`_onCanvasReadyForHiding`, `_hideTargetsAnimationId`).
   - **Evidence**: `requestAnimationFrame` loop hides target indicators every frame (`TokenImageUtilities._hideAllTargetIndicators()` iterates every token). Cleanup attempts to `cancelAnimationFrame`, but because of the missing hook cleanup, it is never reached after reloads.
   - **Impact**: Continuous 60 fps loop touches every token, pinning token objects, graphics, and textures; increases CPU/GPU usage and prevents GC of detached tokens.
   - **Actionable Notes**: Replace loop with hook-driven toggles (run only when `targetToken` events fire) or gate by setting. Ensure cleanup is called on `canvasTearDown`.

3. **Token movement subsystem retains state**
   - **Files**: `scripts/token-movement.js`.
   - **Evidence**: Global Maps/Sets (`leaderMovementPath`, `tokenFollowers`, `occupiedGridPositions`, `tokenOriginalPositions`) plus hook registrations at module scope (`preUpdateToken`, `updateToken`). No teardown or scene scoping exists.
   - **Impact**: Tokens from previous scenes remain referenced, keeping actor/token data, sounds, and textures alive. Hooks keep firing even when movement automation disabled, adding GC pressure.
   - **Actionable Notes**: Add lifecycle hooks (`Hooks.on('canvasTearDown')`) to clear Maps/Sets, reset leader IDs, and remove hook callbacks via `disposeByContext`. Only enable hooks when the related movement mode is active.

4. **Token image search clones 17k-entry cache per keystroke**
   - **Files**: `scripts/token-image-replacement.js` (`_getFilteredFiles`, `_applyTagFilters`, `_cacheSearchResults`).
   - **Evidence**:
     - `_getFilteredFiles` → `const allFiles = Array.from(ImageCacheManager.cache.files.values());` for every filter/search, then `filter` repeatedly.
     - `_cacheSearchResults` deep-clones `results` arrays (`results: [...results]`) and stores up to 50 entries for 5-minute TTL.
   - **Impact**: Each search allocates tens of thousands of objects. Cached arrays retain references for at least 5 minutes, matching the observed non-heap growth.
   - **Actionable Notes**: Pre-index cache by category/tag once during scan, filter via iterators, and store only lightweight references (paths/IDs) in the search cache. Consider capping cache by total bytes.

5. **Menubar re-renders too frequently**
   - **Files**: `scripts/api-menubar.js`.
   - **Evidence**: Hook registrations for `updateCombat`, `createCombatant`, `updateCombatant`, `deleteCombatant`, `renderApplication`, `closeApplication`, `updateActor`, `updateToken`, etc., most of which call `MenuBar.renderMenubar(true)` directly.
   - **Impact**: Any combat/timer/tokenevent rebuilds the entire menubar template, tears down event handlers, and recreates DOM nodes; detached nodes accumulate if cleanup fails. Adds CPU spikes during combat and increases GC pressure.
   - **Actionable Notes**: Introduce state diffing or throttling (e.g., `requestAnimationFrame` debouncing) and update only the relevant DOM fragments (timer text, leader badge, etc.).

6. **Image cache retains entire asset library in memory**
   - **Files**: `scripts/manager-image-cache.js`.
   - **Evidence**: `ImageCacheManager.cache` holds Maps for `files`, `folders`, `creatureTypes`, plus progress metadata. No eviction or unload. Scans only mutate the in-memory object; even after closing the feature the cache persists until page refresh.
   - **Impact**: 17k+ entries (names, tags, folder paths, metadata) plus progress strings consume hundreds of MB. Combined with search allocations, this explains non-heap growth despite stable JS heap.
   - **Actionable Notes**: Persist processed metadata to settings/storage to reload on demand, add a “flush cache” control, or load subsets lazily (e.g., per top-level folder). Track cache size and warn when above threshold.

### Next Actions
1. **Fix hook cleanup**: add `HookManager.unregisterHook` or switch callers to `removeCallback` / `disposeByContext` so teardown actually runs.
2. **Gate/remove target-hiding RAF loop**: run only when needed, or replace with hook-driven toggles.
3. **Add teardown for token movement system**: clear Maps/Sets and unregister hooks on `canvasTearDown` or setting change.
4. **Optimize image search/filtering**: introduce indexes or streams to avoid cloning the entire cache; cap search result cache by total memory, not entry count.
5. **Throttle menubar renders**: batch hook responses and update only the DOM fragments that changed.
6. **Provide cache offloading**: persist processed metadata to disk or add a “flush cache” button to reclaim memory mid-session.

Document any additional findings in this file, then link back to them from `TODO.md`.

