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
| 3 | High | Token movement state | Active |
| 4 | High | Token image search | Active |
| 5 | Medium | Menubar rerenders | Active |
| 6 | Medium | Image cache footprint | Active |

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

Document any additional findings in this file, then link back to them from `TODO.md`.

