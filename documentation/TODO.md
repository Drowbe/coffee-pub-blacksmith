# TODO - Active Issues and Future Tasks

## HIGH PRIORITY ISSUES

### Image Replacement - Progress Bars Not Updating
- **Issue**: Progress bars in token image replacement window are not updating during operations
- **Impact**: Users cannot see progress of scanning, searching, or other operations
- **Status**: TODO
- **Date Found**: January 16, 2025
- **Plan**: 
  - Investigate progress bar update mechanisms
  - Fix progress bar rendering during long operations
  - Ensure progress bars show accurate completion status
- **Notes**: May be related to UI rendering or progress calculation logic

### Optimize and Speed Up Narrowing Code
- **Issue**: Noticeable lag when searching/filtering images
- **Location**: `scripts/token-image-replacement.js`, `scripts/manager-image-matching.js`
- **Impact**: Performance degradation during image search and matching
- **Status**: TODO
- **Date Found**: January 15, 2025
- **Plan**:
  - Implement better debouncing for search input
  - Add caching for filtered results
  - Consider lazy loading of results
  - Optimize background processing for heavy operations
- **Notes**: Related to comprehensive search and filtering logic

## MEDIUM/LOW PRIORITY ISSUES

### Settings Retrieval Not Cached
- **Issue**: `_getTurnIndicatorSettings()` and `_getTargetedIndicatorSettings()` called multiple times per update
- **Location**: `scripts/token-image-utilities.js` lines 59-87 & 89-117
- **Impact**: 10+ `getSettingSafely()` calls per indicator update (minor performance cost)
- **Status**: MINOR - LOW PRIORITY
- **Plan**: 
  - Cache settings object in static variable
  - Invalidate cache on settings change
  - Reuse cached settings for position updates
- **Risk**: VERY LOW - Simple caching with invalidation
- **Notes**: Low priority, optimize only if other issues are resolved

### Code Duplication - Position Calculations
- **Issue**: Token center calculations duplicated in turn and targeted indicator position updates
- **Location**: `scripts/token-image-utilities.js` lines 1009-1021 & 1253-1263
- **Impact**: Code duplication, slightly harder to maintain
- **Status**: TODO - LOW PRIORITY
- **Plan**: Extract to helper function `_calculateTokenCenter(token, changes)`
- **Risk**: VERY LOW - Simple refactor
- **Notes**: Nice-to-have, not urgent

### Token Facing Direction
- **Issue**: Add token facing direction based on movement
- **Status**: PENDING
- **Plan**: 
  - Detect when a token moves
  - Calculate the direction of movement (from old position to new position)
  - Rotate the token to face that direction
  - Make it configurable (per-token or per-scene settings)
  - Add optional facing indicators
- **Notes**: Enhancement that would make token movement feel more natural and immersive

## DEFERRED TASKS

### OpenAI API Not Exposed to External Modules
- **Issue**: OpenAI functions exist in `api-core.js` but are NOT exposed via `module.api`
- **Location**: `scripts/api-core.js` (getOpenAIReplyAsHtml, getOpenAIReplyAsJson, getOpenAIReplyAsText)
- **Impact**: **BREAKS ENTIRE DESIGN** - External modules cannot use shared OpenAI integration
- **Status**: DEFERRED - Not currently blocking any active development
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

## FUTURE PHASES

### CODEX-AI Integration
- [ ] **FUTURE**: Integrate CODEX system with AI API for cost-efficient context management
- [ ] **FUTURE**: Design CODEX API methods for querying journal entries and building AI context
- [ ] **FUTURE**: Create context builder that replaces conversation history with relevant CODEX entries
- [ ] **FUTURE**: Implement smart querying system (tags, categories, text search) for CODEX entries
- [ ] **FUTURE**: Add automatic fact extraction from AI responses to grow CODEX knowledge base
- [ ] **FUTURE**: Create new AI methods that use CODEX context instead of conversation history
- [ ] **FUTURE**: Optimize CODEX querying and context building for performance with large knowledge bases
- [ ] **FUTURE**: Document CODEX API integration and usage patterns for external modules
- **Status**: TODO - Major feature for future development
- **Impact**: **REVOLUTIONARY** - Transform AI from chat bot to knowledgeable campaign advisor
- **Benefits**: Cost efficiency, better context, persistent world knowledge, smart learning

### Memory Management
- [ ] Add proper cleanup handlers
- [ ] Implement event listener cleanup
- [ ] Add memory monitoring
- [ ] Cache settings values (redundant settings retrieval)

## ARCHITECTURAL CONCERNS

### Socketmanager Becoming Monolithic
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Proposed Solution**:
  - Socketmanager should ONLY manage socket registration/cleanup (like hookmanager)
