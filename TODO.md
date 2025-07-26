# TODO - Memory Leaks and Performance Issues

## CRITICAL ISSUES (High Severity)

### 1. Global Variable Accumulation
- **Issue**: `tokenCount` Map is never cleared and grows indefinitely
- **Location**: Line 350: `let tokenCount = new Map();`
- **Impact**: Memory leak that grows with each token creation
- **Status**: ✅ COMPLETED
- **Plan**: Replaced Map with real-time token counting
- **Notes**: Fixed in both blacksmith.js and canvas-tools.js

### 2. Duplicate Token Naming Hooks
- **Issue**: Token naming logic duplicated in both blacksmith.js and canvas-tools.js
- **Locations**: Lines 381 (blacksmith.js) and 59 (canvas-tools.js)
- **Impact**: Duplicate hooks causing potential race conditions and performance issues
- **Status**: ✅ COMPLETED
- **Plan**: Removed duplicate hook from blacksmith.js, kept only in CanvasTools
- **Notes**: Eliminated duplicate token naming functionality

### 3. Icon Path Cache Never Cleared
- **Issue**: `iconPaths` cache (line 1750) is never cleared
- **Impact**: Memory leak, especially with large icon directories
- **Status**: ✅ COMPLETED
- **Plan**: Added 5-minute time-based cache expiration
- **Notes**: Cache expires after 5 minutes to balance performance and memory usage

## HIGH SEVERITY ISSUES

### 4. Excessive Console Logging
- **Issue**: `postConsoleAndNotification` called frequently with debug info
- **Locations**: Throughout the file (50+ instances)
- **Impact**: Performance degradation, especially in production
- **Status**: 🟡 TODO
- **Plan**: Add debug level controls and reduce logging in production
- **Notes**: Need to maintain debug capability while reducing overhead

### 5. Inefficient DOM Queries
- **Issue**: `document.querySelector(':root')` called repeatedly
- **Locations**: Lines 1050, 1070, 1100, 1130, 1160
- **Impact**: Unnecessary DOM traversal
- **Status**: 🟡 TODO
- **Plan**: Cache the root element reference
- **Notes**: Simple fix with minimal risk

### 6. File System Operations in Loops
- **Issue**: `FilePicker.browse()` called in loops without caching
- **Location**: Lines 450-480 (renderNoteConfig)
- **Impact**: Performance bottleneck with large file systems
- **Status**: 🟡 TODO
- **Plan**: Cache file listings or implement lazy loading
- **Notes**: Consider caching with invalidation on file system changes

## MEDIUM SEVERITY ISSUES

### 7. Template Compilation on Every Call
- **Issue**: `Handlebars.compile()` called repeatedly
- **Locations**: Lines 650, 1000, 1200
- **Impact**: CPU overhead for template compilation
- **Status**: 🟢 TODO
- **Plan**: Cache compiled templates
- **Notes**: Low risk, high performance gain

### 8. Inefficient Array Operations
- **Issue**: `Object.values(ui.windows).filter()` called frequently
- **Location**: Line 130
- **Impact**: Performance impact with many open windows
- **Status**: 🟢 TODO
- **Plan**: Cache window references or use more efficient lookups
- **Notes**: Consider using Map or Set for faster lookups

### 9. Redundant Settings Retrieval
- **Issue**: Same settings retrieved multiple times
- **Locations**: Throughout the file
- **Impact**: Unnecessary function calls
- **Status**: 🟢 TODO
- **Plan**: Cache settings values
- **Notes**: Simple optimization with minimal risk

## LOW SEVERITY ISSUES

### 10. Global Variables Without Cleanup
- **Issue**: Global flags like `ctrlKeyActiveDuringRender` never reset
- **Location**: Lines 420-430
- **Impact**: Minor memory leak
- **Status**: 🟢 TODO
- **Plan**: Add cleanup handlers
- **Notes**: Very low priority

### 11. Event Listener Accumulation
- **Issue**: Event listeners added without removal
- **Location**: Line 500 (journal double-click)
- **Impact**: Potential memory leaks
- **Status**: 🟢 TODO
- **Plan**: Add proper cleanup
- **Notes**: Need to ensure cleanup doesn't break functionality

## IMPLEMENTATION PHASES

### Phase 1: Critical Fixes (Immediate Priority)
- [x] Fix tokenCount Map cleanup
- [x] Remove duplicate token naming hooks
- [x] Add icon path cache invalidation
- [ ] Implement debug level controls

### Phase 2: Performance Optimizations (Short-term)
- [ ] Cache DOM queries and settings
- [ ] Implement template caching
- [ ] Optimize file system operations
- [ ] Reduce console logging in production

### Phase 3: Memory Management (Medium-term)
- [ ] Add proper cleanup handlers
- [ ] Implement event listener cleanup
- [ ] Add memory monitoring
- [ ] Optimize array operations

## TESTING CHECKLIST

### Before Implementation
- [ ] Document current memory usage baseline
- [ ] Test with large numbers of tokens
- [ ] Test with many open windows
- [ ] Test with large file systems
- [ ] Verify all existing features work

### After Implementation
- [ ] Monitor memory usage improvements
- [ ] Test all existing functionality
- [ ] Performance testing with large datasets
- [ ] Verify no new bugs introduced
- [ ] Test backward compatibility

## NOTES

### Implementation Strategy
- **Non-breaking approach**: Add new cleanup functions without removing existing code
- **Gradual migration**: Implement caching alongside existing code
- **Feature flags**: Add settings to enable/disable optimizations
- **Backward compatibility**: Ensure all existing functionality remains intact

### Risk Assessment
- **High Risk**: Hook consolidation (could break initialization order)
- **Medium Risk**: Cache implementations (could introduce stale data issues)
- **Low Risk**: DOM query caching, settings caching

### Success Criteria
- [ ] Memory usage remains stable over time
- [ ] No performance degradation
- [ ] All existing features continue to work
- [ ] Improved performance metrics
- [ ] No new bugs introduced

---

**Last Updated**: [Current Date]
**Next Review**: [Date + 1 week] 