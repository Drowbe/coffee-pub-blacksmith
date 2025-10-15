# TODO - Memory Leaks and Performance Issues

## CRITICAL ISSUES (High Severity)

### 🚨 PLANNING TIMER UNDEFINED ERROR (Found: January 15, 2025)
- **Issue**: `timer-planning.js:127` throws "Cannot read properties of undefined (reading 'isActive')"
- **Location**: `scripts/timer-planning.js` line 127 in `timerCleanup` function
- **Impact**: Breaks planning timer cleanup, potentially causing cascading errors
- **Status**: 🚨 CRITICAL - ERROR IN PRODUCTION
- **Error Stack**:
  ```
  timer-planning.js:127 Uncaught (in promise) TypeError: undefined. Cannot read properties of undefined (reading 'isActive')
  [Detected 2 packages: coffee-pub-blacksmith(12.1.15), socketlib(v1.1.3)]
      at Object.timerCleanup (timer-planning.js:127:28)
      at SocketlibSocket._handleRequest (socketlib.js:254:9)
      at SocketlibSocket._onSocketReceived (socketlib.js:212:9)
  ```
- **Root Cause**: TBD - likely accessing undefined object in cleanup
- **Plan**: Add safety checks for undefined objects before accessing properties
- **Notes**: Related to socketlib communication, may be a race condition

### 1. 🚨 HOOKMANAGER RETURN VALUE HANDLING (BLOCKING)
- **Issue**: HookManager ignores return values from hook callbacks, breaking movement restrictions
- **Location**: `scripts/manager-hooks.js` lines 58-67 in hookRunner function
- **Impact**: **BREAKS TOKEN MOVEMENT LOCKING** - Players can move tokens even when set to "locked" mode
- **Status**: 🚨 CRITICAL - BLOCKING CORE FUNCTIONALITY
- **Root Cause**: HookManager executes callbacks but ignores return values, so `preUpdateToken` hooks that return `false` to block actions are ineffective
- **Technical Details**: 
  - Movement restriction hook (priority 2) returns `false` for "no-movement" mode
  - Canvas tools hook (priority 3) returns `true` or undefined
  - HookManager ignores the `false` and uses the last callback's result
  - This allows movement despite restrictions
- **Plan**: Modify HookManager to collect and respect return values from `preUpdateToken` hooks
- **Risk**: MODERATE to HIGH - Core infrastructure change that could affect other hook functionality
- **Dependencies**: Must be fixed before movement restrictions work properly
- **Example of the problem**:
  ```javascript
  // Current broken behavior:
  for (const cb of list) {
      cb.callback(...args);  // ← Ignores return value!
  }
  
  // Should be:
  for (const cb of list) {
      const result = cb.callback(...args);
      if (result === false) return false;  // Block if any callback returns false
  }
  ```

### 2. 🚨 OPENAI API NOT EXPOSED TO EXTERNAL MODULES (BLOCKING)
- **Issue**: OpenAI functions exist in `api-core.js` but are NOT exposed via `module.api`
- **Location**: `scripts/api-core.js` (getOpenAIReplyAsHtml, getOpenAIReplyAsJson, getOpenAIReplyAsText)
- **Impact**: **BREAKS ENTIRE DESIGN** - External modules cannot use shared OpenAI integration
- **Status**: 🚨 CRITICAL - BLOCKING EXTERNAL MODULE INTEGRATION
- **Plan**: Add OpenAI functions to `UtilsManager.getUtils()` and expose via `module.api.utils`
- **Notes**: This was supposed to be a core feature - all Coffee Pub modules should share OpenAI integration
- **Dependencies**: Must be fixed before external modules can properly integrate
- **Example of what should work**:
  ```javascript
  // External modules should be able to do this:
  const response = await BlacksmithUtils.getOpenAIReplyAsHtml("Generate a monster description");
  const jsonResponse = await BlacksmithUtils.getOpenAIReplyAsJson("Create a loot table");
  const textResponse = await BlacksmithUtils.getOpenAIReplyAsText("Write a quest hook");
  ```

### 2. Global Variable Accumulation
- **Issue**: `tokenCount` Map is never cleared and grows indefinitely
- **Location**: Line 350: `let tokenCount = new Map();`
- **Impact**: Memory leak that grows with each token creation
- **Status**: ✅ COMPLETED
- **Plan**: Replaced Map with real-time token counting
- **Notes**: Fixed in both blacksmith.js and manager-canvas.js

### 2. Duplicate Token Naming Hooks
- **Issue**: Token naming logic duplicated in both blacksmith.js and manager-canvas.js
- **Locations**: Lines 381 (blacksmith.js) and 59 (manager-canvas.js)
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

### 4. Excessive Console Logging ✅ COMPLETED
- **Issue**: ~150+ console messages bypass `postConsoleAndNotification` system
- **Locations**: Throughout multiple files (window-skillcheck.js, window-query.js, xp-manager.js, etc.)
- **Impact**: Inconsistent logging, performance impact when debug is ON
- **Status**: ✅ COMPLETED
- **Plan**: Converted debug messages to use `postConsoleAndNotification` with `blnDebug = true`
- **Notes**: Unified logging system, better performance when debug is OFF, consistent debug control

### 5. Inefficient DOM Queries
- **Issue**: `document.querySelector(':root')` called repeatedly
- **Locations**: Lines 1050, 1070, 1100, 1130, 1160
- **Impact**: Unnecessary DOM traversal
- **Status**: ✅ COMPLETED
- **Plan**: Cache the root element reference
- **Notes**: Simple fix with minimal risk

### 6. File System Operations in Loops
- **Issue**: `FilePicker.browse()` called in loops without caching
- **Location**: Lines 450-480 (renderNoteConfig)
- **Impact**: Performance bottleneck with large file systems
- **Status**: ✅ COMPLETED
- **Plan**: Cache file listings or implement lazy loading
- **Notes**: Consider caching with invalidation on file system changes

## TOKEN IMAGE REPLACEMENT ISSUES

### 1. 🏷️ Complete Tag Optimizations (High Priority)
- **Issue**: Tag system was broken in live production, needs fixes
- **Location**: `scripts/token-image-replacement.js` - `_getTagsForMatch()`, `_getTagsForFile()`, `_getAggregatedTags()`
- **Impact**: Tags not showing correctly when filter buttons clicked, especially with token selected
- **Status**: 🟡 IN PROGRESS
- **Date Found**: January 15, 2025
- **Plan**: 
  - Fix broken live tag code
  - Nail down "selected" tag experience
  - Ensure tags show for creature types, folder paths, and metadata
- **Notes**: Currently working better than before but needs refinement

### 2. ⚡ Optimize and Speed Up Narrowing Code (Medium Priority)
- **Issue**: Noticeable lag when searching/filtering images
- **Location**: `scripts/token-image-replacement.js`, `scripts/manager-image-matching.js`
- **Impact**: Performance degradation during image search and matching
- **Status**: 🟢 TODO
- **Date Found**: January 15, 2025
- **Plan**:
  - Implement better debouncing for search input
  - Add caching for filtered results
  - Consider lazy loading of results
  - Optimize background processing for heavy operations
- **Notes**: Related to comprehensive search and filtering logic

### 3. 🎯 Dead Token Functionality (Completed)
- **Issue**: Dead token image replacement needed refactoring
- **Location**: Moved from `scripts/token-image-replacement.js` to `scripts/token-image-utilities.js`
- **Impact**: Better code organization and separation of concerns
- **Status**: ✅ COMPLETED
- **Date Completed**: January 15, 2025
- **Plan**: ✅ Created dedicated `token-image-utilities.js` for token enhancements
- **Notes**: Prepared for future token enhancement features

### 4. 🎮 Turn Indicator System (Completed)
- **Issue**: Added visual indicator for current turn in combat
- **Location**: `scripts/token-image-utilities.js`
- **Impact**: Better visual feedback during combat
- **Status**: ✅ COMPLETED
- **Date Completed**: January 15, 2025
- **Features**:
  - Customizable ring styles (Solid, Dashed, Spikes)
  - Multiple animations (Pulse, Rotate, Fixed)
  - Full color and size control
  - PIXI Graphics rendering (not DOM SVG)
  - Moves with token during movement
  - Fade in/out on movement
  - Automatic cleanup on turn change
- **Notes**: Successfully implemented with PIXI rendering system and full theming support

### 5. 🎯 Targeted Indicators (Future Enhancement)
- **Issue**: Need visual indicators showing which tokens are being targeted
- **Location**: `scripts/token-image-utilities.js` (to be added)
- **Impact**: Improved clarity during combat for targeting and attacks
- **Status**: 🟢 TODO
- **Date Requested**: January 15, 2025
- **Proposed Features**:
  - Visual line or arrow from attacker to target(s)
  - Different styles for different target types (hostile, friendly, etc.)
  - Highlight targeted tokens with color/ring
  - Option to show targeting reticle on target
  - Clear targeting indicators when attack completes
  - Support for multiple targets (AoE, multi-attack)
- **Notes**: Should complement turn indicator system, different visual style to avoid confusion

## MEDIUM SEVERITY ISSUES

### 7. Template Compilation on Every Call
- **Issue**: `Handlebars.compile()` called repeatedly
- **Locations**: Lines 650, 1000, 1200
- **Impact**: CPU overhead for template compilation
- **Status**: ✅ COMPLETED
- **Plan**: Cache compiled templates
- **Notes**: Low risk, high performance gain

### 8. Inefficient Array Operations
- **Issue**: `Object.values(ui.windows).filter()` called frequently
- **Location**: Line 130
- **Impact**: Performance impact with many open windows
- **Status**: ✅ COMPLETED
- **Plan**: Cache window references or use more efficient lookups
- **Notes**: Consider using Map or Set for faster lookups

### 9. Redundant Settings Retrieval
- **Issue**: Same settings retrieved multiple times
- **Locations**: Throughout the file
- **Impact**: Unnecessary function calls
- **Status**: ✅ COMPLETED
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

### 12. Encounter Toolbar Not Visible ✅ COMPLETED
- **Issue**: Encounter toolbar code exists but is not visible in UI
- **Location**: `scripts/encounter-toolbar.js`

### 13. CombatStats Initialization Race Condition ✅ COMPLETED
- **Issue**: PlanningTimer tries to access CombatStats.currentStats before it's fully initialized
- **Location**: `scripts/planning-timer.js` line 444 calls `CombatStats.recordPlanningStart()`
- **Impact**: "Cannot set properties of undefined" error when reloading module during combat
- **Status**: ✅ COMPLETED
- **Plan**: Ensure CombatStats is fully initialized before PlanningTimer tries to use it
- **Notes**: Race condition between CombatStats.initialize() and PlanningTimer.initialize() during module reload
- **Solution**: Added safety checks in startTimer(), timerCleanup(), cleanupTimer(), and initialize() methods to defer operations until CombatStats.currentStats is available

### 14. DnD5e rollSkill Deprecation Warning ✅ COMPLETED
- **Issue**: Using deprecated `actor.rollSkill(value, rollOptions)` method signature from DnD5e < 4.1
- **Location**: `scripts/window-skillcheck.js` line 1617 in fallback code
- **Impact**: Deprecation warnings in console, future compatibility issues with DnD5e 5.0
- **Status**: ✅ COMPLETED
- **Plan**: Use DnD5e's built-in "skip-dialog" methods that bypass configuration windows
- **Notes**: Implemented `actor.rollSkill({ skill: value })`, `actor.rollAbilityCheck({ ability: value })`, and `actor.rollSavingThrow({ ability: value })` - these are modern equivalents to "fast-forward" rolls with no dialogs
- **Status**: ✅ COMPLETED
- **Plan**: Implemented persistent toolbar that always shows, with "no encounter" message when metadata is missing
- **Notes**: Toolbar now appears consistently across all journal entries, ready for future quick encounter creation feature
- **Impact**: Missing functionality for encounter management
- **Status**: 🟡 TODO
- **Plan**: Investigate why toolbar doesn't appear
- **Notes**: 
  - Toolbar is enabled by default in settings
  - Requires journal entries with `data-journal-metadata` and `journal-type="encounter"`
  - Template file exists at `templates/encounter-toolbar.hbs`
  - Hook is registered in `blacksmith.js` line 324
  - May need to check if journal entries have proper metadata format

## IMPLEMENTATION PHASES

### Phase 1: Critical Fixes (Immediate Priority) ✅ COMPLETED
- [x] Fix tokenCount Map cleanup
- [x] Remove duplicate token naming hooks
- [x] Add icon path cache invalidation
- [x] Reduce excessive console logging

### Phase 2: Performance Optimizations (Short-term) ✅ COMPLETED
- [x] Cache DOM queries (root element caching)
- [x] Implement template caching (Handlebars compilation)
- [x] Optimize file system operations (note config icons)
- [x] Reduce console logging in production
- [x] Optimize array operations (window registry)

### Phase 3: Hook Management Consolidation (Medium-term) ✅ COMPLETED
- [x] Create centralized HookManager system
- [x] Migrate global hooks (closeGame, disableModule, canvasReady, createToken)
- [x] Migrate settings hooks (settingChange)
- [x] Migrate window lifecycle hooks (renderApplication, closeApplication)
- [x] Migrate chat message hooks (renderChatMessage)
- [x] Migrate token hooks (updateToken)
- [x] Migrate note config hooks (renderNoteConfig)
- [x] Migrate canvas hooks (canvasInit, canvasReady, updateScene)
- [x] Migrate combat hooks with FULL functionality:
  - [x] updateCombatant (initiative logic)
  - [x] createCombat (auto-open tracker)
  - [x] updateCombat (round changes, player initiative)
  - [x] renderCombatTracker (health rings, portraits, drag & drop, dead state)
  - [x] combatStart (combat beginning logic)
  - [x] endCombat (combat ending cleanup)
  - [x] deleteCombat (combat deletion cleanup)
- [x] **ARCHITECTURAL REFACTOR**: Separate business logic from hook management
- [x] **ARCHITECTURAL REFACTOR**: Create service classes for each functional area
- [x] **ARCHITECTURAL REFACTOR**: HookManager should delegate, not execute

### Phase 4: ✅ OPENAI API REFACTORING (COMPLETED)
- [x] **COMPLETED**: Refactored OpenAI functionality into dedicated `api-openai.js`
- [x] **COMPLETED**: Added support for latest OpenAI models (GPT-5, GPT-4o, GPT-4o-mini, O1 models)
- [x] **COMPLETED**: Implemented session-based memory system with persistent storage
- [x] **COMPLETED**: Added OpenAI Projects support for cost tracking and team management
- [x] **COMPLETED**: Created comprehensive size management and cleanup tools
- [x] **COMPLETED**: Exposed OpenAI API via `module.api.openai` for external modules
- [x] **COMPLETED**: Updated pricing calculations for current model rates
- [x] **COMPLETED**: Added memory statistics, export, and optimization features
- **Status**: ✅ COMPLETED - OpenAI API is now fully functional and exposed
- **Impact**: **FIXES EXTERNAL MODULE INTEGRATION** - External modules can now use OpenAI functionality
- **New Features**: Session memory, model support, project integration, size management

### Phase 4.5: ✅ MISSING API FUNCTIONS FIXED (COMPLETED)
- [x] **COMPLETED**: Added missing functions to `UtilsManager.getUtils()`
- [x] **COMPLETED**: Exposed `getTokenId`, `objectToString`, `stringToObject`, `convertSecondsToRounds`, `rollCoffeePubDice`, `resetModuleSettings`
- [x] **COMPLETED**: Added static methods to UtilsManager class
- **Status**: ✅ COMPLETED - Scribe and other modules can now access all needed functions
- **Impact**: **FIXES EXTERNAL MODULE INTEGRATION** - Coffee Pub modules can now function properly
- **Notes**: All functions now available via `BlacksmithUtils.functionName()` or `BlacksmithUtils.functionName()`

### Phase 5: CODEX-AI Integration (Future) 🟢 TODO
- [ ] **FUTURE**: Integrate CODEX system with AI API for cost-efficient context management
- [ ] **FUTURE**: Design CODEX API methods for querying journal entries and building AI context
- [ ] **FUTURE**: Create context builder that replaces conversation history with relevant CODEX entries
- [ ] **FUTURE**: Implement smart querying system (tags, categories, text search) for CODEX entries
- [ ] **FUTURE**: Add automatic fact extraction from AI responses to grow CODEX knowledge base
- [ ] **FUTURE**: Create new AI methods that use CODEX context instead of conversation history
- [ ] **FUTURE**: Optimize CODEX querying and context building for performance with large knowledge bases
- [ ] **FUTURE**: Document CODEX API integration and usage patterns for external modules
- **Status**: 🟢 TODO - Major feature for future development
- **Impact**: **REVOLUTIONARY** - Transform AI from chat bot to knowledgeable campaign advisor
- **Benefits**: Cost efficiency, better context, persistent world knowledge, smart learning

### Phase 6: Memory Management (Long-term) 🟢 TODO
- [ ] Add proper cleanup handlers
- [ ] Implement event listener cleanup
- [ ] Add memory monitoring
- [ ] Cache settings values (redundant settings retrieval)

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

## ARCHITECTURAL CONCERNS

### 1. Socketmanager Becoming Monolithic ⚠️ HIGH PRIORITY
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Proposed Solution**:
  - Socketmanager should ONLY manage socket registration/cleanup (like hookmanager)

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

**Last Updated**: January 15, 2025
**Next Review**: January 22, 2025

## RECENT MAJOR ACCOMPLISHMENTS

### Token Image Utilities & Turn Indicator (January 2025)
- ✅ **Created dedicated token utilities module** - Separated dead token and turn indicator functionality
- ✅ **Implemented turn indicator system** - Green pulsing ring shows current combat turn
- ✅ **PIXI Graphics rendering** - Proper canvas integration without breaking renderer
- ✅ **Position tracking** - Turn indicator follows token movement in real-time
- ✅ **Code organization** - Moved dead token logic to `token-image-utilities.js`
- ✅ **Prepared for expansion** - Ready to add more token enhancement features

### Key Benefits Achieved
- **Better UX**: Visual feedback for whose turn it is in combat
- **Code Quality**: Cleaner separation of concerns between UI and utilities
- **Performance**: Efficient PIXI rendering with smooth animations
- **Maintainability**: Dedicated file for token enhancements makes future work easier

### OpenAI API Refactoring (December 2024)
- ✅ **Separated OpenAI functionality** into dedicated `api-openai.js` module
- ✅ **Added latest model support** including GPT-5, GPT-4o, GPT-4o-mini, O1 models
- ✅ **Implemented session memory system** with persistent localStorage storage
- ✅ **Added OpenAI Projects integration** for better cost tracking and team management
- ✅ **Created comprehensive size management** with cleanup and optimization tools
- ✅ **Exposed full API** via `module.api.openai` for external module integration
- ✅ **Updated pricing calculations** to current December 2024 rates
- ✅ **Added memory statistics and export** features for monitoring and backup

### Key Benefits Achieved
- **Cost Efficiency**: Session memory reduces token usage compared to full conversation history
- **Model Flexibility**: Support for latest OpenAI models with updated pricing
- **Project Management**: Better cost tracking and team collaboration
- **Memory Persistence**: Conversations survive page refreshes and FoundryVTT restarts
- **Size Management**: Automatic cleanup and optimization prevent storage bloat
- **External Integration**: Other Coffee Pub modules can now use shared OpenAI functionality 
