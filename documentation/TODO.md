# TODO - Active Issues and Future Tasks

## 🚨 CRITICAL ISSUES (High Priority)

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

## 🟡 HIGH PRIORITY ISSUES

### 2. 🏷️ Complete Tag Optimizations (High Priority)
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

### 3. ⚡ Optimize and Speed Up Narrowing Code (Medium Priority)
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

## 🟢 MEDIUM/LOW PRIORITY ISSUES

### 4. 🎯 Targeted Indicators (Future Enhancement)
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

### 5. 🟡 Settings Retrieval Not Cached (Minor)
- **Issue**: `_getTurnIndicatorSettings()` and `_getTargetedIndicatorSettings()` called multiple times per update
- **Location**: `scripts/token-image-utilities.js` lines 59-87 & 89-117
- **Impact**: 10+ `getSettingSafely()` calls per indicator update (minor performance cost)
- **Status**: 🟡 MINOR - LOW PRIORITY
- **Plan**: 
  - Cache settings object in static variable
  - Invalidate cache on settings change
  - Reuse cached settings for position updates
- **Risk**: VERY LOW - Simple caching with invalidation
- **Notes**: Low priority, optimize only if other issues are resolved

### 6. 🟢 Code Duplication - Position Calculations (Minor)
- **Issue**: Token center calculations duplicated in turn and targeted indicator position updates
- **Location**: `scripts/token-image-utilities.js` lines 1009-1021 & 1253-1263
- **Impact**: Code duplication, slightly harder to maintain
- **Status**: 🟢 TODO - LOW PRIORITY
- **Plan**: Extract to helper function `_calculateTokenCenter(token, changes)`
- **Risk**: VERY LOW - Simple refactor
- **Notes**: Nice-to-have, not urgent

### 7. 🎮 Token Facing Direction
- **Issue**: Add token facing direction based on movement
- **Status**: ⏳ PENDING
- **Plan**: 
  - Detect when a token moves
  - Calculate the direction of movement (from old position to new position)
  - Rotate the token to face that direction
  - Make it configurable (per-token or per-scene settings)
  - Add optional facing indicators
- **Notes**: Enhancement that would make token movement feel more natural and immersive

### 8. 🟢 Global Variables Without Cleanup
- **Issue**: Global flags like `ctrlKeyActiveDuringRender` never reset
- **Location**: Lines 420-430
- **Impact**: Minor memory leak
- **Status**: 🟢 TODO
- **Plan**: Add cleanup handlers
- **Notes**: Very low priority

### 9. 🟢 Event Listener Accumulation
- **Issue**: Event listeners added without removal
- **Location**: Line 500 (journal double-click)
- **Impact**: Potential memory leaks
- **Status**: 🟢 TODO
- **Plan**: Add proper cleanup
- **Notes**: Need to ensure cleanup doesn't break functionality

## 🟠 DEFERRED TASKS

### 10. 🚨 OpenAI API Not Exposed to External Modules (Deferred)
- **Issue**: OpenAI functions exist in `api-core.js` but are NOT exposed via `module.api`
- **Location**: `scripts/api-core.js` (getOpenAIReplyAsHtml, getOpenAIReplyAsJson, getOpenAIReplyAsText)
- **Impact**: **BREAKS ENTIRE DESIGN** - External modules cannot use shared OpenAI integration
- **Status**: 🟠 DEFERRED - Not currently blocking any active development
- **Original Priority**: CRITICAL - BLOCKING EXTERNAL MODULE INTEGRATION
- **Plan**: Add OpenAI functions to `UtilsManager.getUtils()` and expose via `module.api.utils`
- **Notes**: This was supposed to be a core feature - all Coffee Pub modules should share OpenAI integration
- **Dependencies**: Must be fixed before external modules can properly integrate
- **Deferred Reason**: No external modules currently need this functionality
- **Example of what should work**:
  ```javascript
  // External modules should be able to do this:
  const response = await BlacksmithUtils.getOpenAIReplyAsHtml("Generate a monster description");
  const jsonResponse = await BlacksmithUtils.getOpenAIReplyAsJson("Create a loot table");
  const textResponse = await BlacksmithUtils.getOpenAIReplyAsText("Write a quest hook");
  ```

## 🟢 FUTURE PHASES

### Phase 5: CODEX-AI Integration (Future)
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

### Phase 6: Memory Management (Long-term)
- [ ] Add proper cleanup handlers
- [ ] Implement event listener cleanup
- [ ] Add memory monitoring
- [ ] Cache settings values (redundant settings retrieval)

## ARCHITECTURAL CONCERNS

### 1. Socketmanager Becoming Monolithic ⚠️ HIGH PRIORITY
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Proposed Solution**:
  - Socketmanager should ONLY manage socket registration/cleanup (like hookmanager)

---

**Last Updated**: January 16, 2025
**Next Review**: January 23, 2025