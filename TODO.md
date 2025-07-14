# Memory Leaks and Performance Issues - TODO

## Critical Memory Leaks

### 1. **Uncleared Intervals (HIGH PRIORITY)**
Multiple `setInterval` calls without proper cleanup:

#### Chat Panel (`scripts/chat-panel.js`)
- **Lines 481, 485**: Two `setInterval` calls in `startTimerUpdates()` method
- **Issue**: No cleanup mechanism when chat panel is destroyed or module is disabled
- **Impact**: Continues running indefinitely, causing memory leaks and performance degradation

#### Round Timer (`scripts/round-timer.js`)
- **Line 68**: `setInterval` in `initialize()` method
- **Issue**: No cleanup when combat ends or module is disabled
- **Impact**: Timer continues running even when not needed

#### Planning Timer (`scripts/planning-timer.js`)
- **Lines 304, 374, 474**: Multiple `setInterval` calls in different methods
- **Issue**: Intervals are cleared and recreated but no global cleanup
- **Impact**: Potential for multiple overlapping intervals

#### Combat Timer (`scripts/combat-timer.js`)
- **Lines 336, 508, 600**: Multiple `setInterval` calls
- **Issue**: Similar to planning timer - intervals cleared but no global cleanup
- **Impact**: Memory leaks from uncleared intervals

#### Latency Checker (`scripts/latency-checker.js`)
- **Line 84**: `setInterval` in `startPeriodicCheck()`
- **Issue**: No cleanup when module is disabled
- **Impact**: Continues checking latency indefinitely

### 2. **Unremoved Event Listeners (HIGH PRIORITY)**

#### Window Query (`scripts/window-query.js`)
- **Lines 61, 268**: Multiple `addEventListener` calls for `DOMContentLoaded`
- **Lines 75, 90, 94**: Event listeners added but never removed
- **Lines 688-697, 930-939**: Drag and drop event listeners
- **Issue**: Event listeners persist after window is closed
- **Impact**: Memory leaks and potential duplicate event handling

#### Round Timer (`scripts/round-timer.js`)
- **Lines 32, 45, 58, 62**: `window.addEventListener` for focus/blur events
- **Issue**: No cleanup when module is disabled
- **Impact**: Event listeners remain active

#### CSS Editor (`scripts/css-editor.js`)
- **Lines 94, 230, 234, 263**: Multiple event listeners
- **Issue**: No cleanup mechanism
- **Impact**: Memory leaks from persistent listeners

#### Combat Tools (`scripts/combat-tools.js`)
- **Lines 61-95**: Multiple drag and drop event listeners
- **Issue**: No cleanup when combat tracker is re-rendered
- **Impact**: Duplicate event listeners on each render

### 3. **Uncleared Foundry Hooks (MEDIUM PRIORITY)**

#### Multiple Files
- **Issue**: Many `Hooks.on()` calls without corresponding `Hooks.off()`
- **Files affected**: `xp-manager.js`, `vote-manager.js`, `toolbar.js`, `player-stats.js`, `movement.js`, `combat-tracker.js`, `combat-timer.js`, `combat-stats.js`, `chat-panel.js`, `canvas-tools.js`, `blacksmith.js`
- **Impact**: Hooks continue to fire even when not needed

#### Specific Examples:
- `player-stats.js` lines 77-83: Multiple combat hooks without cleanup
- `movement.js` lines 415, 529, 1181, 1235: Token and combat hooks
- `combat-tracker.js` lines 35-256: Multiple combat-related hooks
- `blacksmith.js` lines 168-1858: Extensive hook usage without cleanup

### 4. **DOM Element Accumulation (MEDIUM PRIORITY)**

#### CSS Editor (`scripts/css-editor.js`)
- **Lines 195-203**: Creates style elements but only removes them in specific cases
- **Issue**: Style elements may accumulate if editor is closed improperly
- **Impact**: DOM pollution and memory leaks

#### Latency Checker (`scripts/latency-checker.js`)
- **Lines 190-192**: Creates latency spans but cleanup is incomplete
- **Issue**: May leave orphaned elements in player list
- **Impact**: DOM element accumulation

#### Skill Check Dialog (`scripts/skill-check-dialog.js`)
- **Line 1566**: Uses `setTimeout` to remove overlay but no fallback
- **Issue**: If timeout fails, overlay remains in DOM
- **Impact**: Orphaned DOM elements

### 5. **Map/Set Memory Accumulation (LOW PRIORITY)**

#### Multiple Files
- **Issue**: Maps and Sets are created but never cleared
- **Files affected**: `window-query.js`, `skill-check-dialog.js`, `player-stats.js`, `movement.js`, `latency-checker.js`, `combat-stats.js`, `chat-panel.js`, `canvas-tools.js`, `blacksmith.js`

#### Specific Examples:
- `movement.js` line 16: `tokenFollowers` Map never cleared
- `player-stats.js` line 9: `pendingAttacks` Map accumulates data
- `latency-checker.js` line 7: `latencyData` Map grows indefinitely
- `combat-stats.js` lines 88-89: Turn timing Maps accumulate

## Performance Issues

### 1. **Excessive DOM Queries (MEDIUM PRIORITY)**

#### Window Query (`scripts/window-query.js`)
- **Lines 350-370**: Multiple `document.querySelector` calls in loops
- **Issue**: Inefficient DOM traversal
- **Impact**: Slower performance with large DOM trees

#### Multiple Files
- **Issue**: Repeated `html.find()` calls without caching
- **Impact**: Unnecessary DOM queries

### 2. **Frequent Re-renders (MEDIUM PRIORITY)**

#### Planning Timer (`scripts/planning-timer.js`)
- **Lines 176, 188**: `ui.combat.render(true)` called with setTimeout
- **Issue**: Unnecessary re-renders
- **Impact**: Performance degradation

#### Multiple Files
- **Issue**: `render(true)` calls without checking if needed
- **Impact**: Excessive UI updates

### 3. **Inefficient Data Structures (LOW PRIORITY)**

#### Movement (`scripts/movement.js`)
- **Line 18**: `occupiedGridPositions` Set uses string keys
- **Issue**: String operations are slower than numeric keys
- **Impact**: Minor performance impact

## Recommended Solutions

### 1. **Implement Cleanup Methods**
- Add `destroy()` or `cleanup()` methods to all classes
- Clear intervals, remove event listeners, and unregister hooks
- Call cleanup when modules are disabled or windows are closed

### 2. **Use WeakMap/WeakSet**
- Replace Maps/Sets that hold DOM references with WeakMap/WeakSet
- Allows garbage collection when DOM elements are removed

### 3. **Cache DOM Queries**
- Store frequently accessed DOM elements in variables
- Avoid repeated `querySelector` calls in loops

### 4. **Implement Proper Hook Management**
- Store hook IDs and remove them in cleanup
- Use `Hooks.off()` for all `Hooks.on()` calls

### 5. **Add Error Handling**
- Wrap setTimeout/setInterval calls in try-catch
- Ensure cleanup happens even if errors occur

### 6. **Optimize Re-renders**
- Check if re-render is actually needed before calling `render(true)`
- Use more granular updates instead of full re-renders

## Priority Order
1. **HIGH**: Fix uncleared intervals and event listeners
2. **MEDIUM**: Clean up Foundry hooks and DOM accumulation
3. **LOW**: Optimize performance issues

## Testing Strategy
- Monitor memory usage in browser dev tools
- Test module enable/disable cycles
- Verify cleanup on window close
- Check for memory leaks in long-running sessions 