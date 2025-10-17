# TODO - Active Issues and Future Tasks

## HIGH PRIORITY ISSUES

### Optimize and Speed Up Narrowing Code
- **Issue**: Noticeable lag when searching/filtering images with large datasets (11,606+ files)
- **Location**: `scripts/token-image-replacement.js`, `scripts/manager-image-matching.js`
- **Impact**: UI blocking, search delays, high CPU usage during search operations
- **Status**: TODO - HIGH PRIORITY
- **Root Causes Identified**:
  - No caching of search results or scores
  - Sequential processing of all files (not parallelized)
  - Redundant tag extraction on every filter operation
  - All results loaded into memory before pagination
  - No incremental/streaming result delivery

- **Incremental Optimization Plan** (attack one at a time):
  
  **Phase 1: Low-Risk Quick Wins** ⭐ START HERE
  - [ ] **Step 1.1**: Add search result cache (Map: searchTerm → results)
    - Cache results for identical search terms
    - Invalidate cache on category/tag filter changes
    - Risk: VERY LOW - Simple Map-based caching
    - Expected gain: 50-90% speedup for repeated searches
  
  - [ ] **Step 1.2**: Cache tag extraction results per file
    - Store tags in file metadata during cache build
    - Reuse cached tags instead of recalculating
    - Risk: VERY LOW - Tags already stored, just need to use them
    - Expected gain: 20-30% speedup on tag filtering
  
  - [ ] **Step 1.3**: Optimize browse mode (no scoring needed)
    - Skip relevance calculation when in browse mode
    - Already optimized, verify it's being used correctly
    - Risk: VERY LOW - Browse mode already exists
    - Expected gain: Instant results in browse mode
  
  **Phase 2: Medium-Risk Performance Gains**
  - [ ] **Step 2.1**: Implement streaming/incremental results
    - Process files in batches (e.g., 500 at a time)
    - Update UI progressively as batches complete
    - Risk: MEDIUM - Requires UI update logic changes
    - Expected gain: 40-60% perceived speedup (faster first results)
  
  - [ ] **Step 2.2**: Add score caching with TTL
    - Cache scores for file+searchTerm combinations
    - Use LRU cache with size limit (e.g., 1000 entries)
    - Risk: MEDIUM - Need proper cache invalidation
    - Expected gain: 30-50% speedup on similar searches
  
  - [ ] **Step 2.3**: Parallelize score calculations
    - Use Web Workers or chunked async processing
    - Process multiple files simultaneously
    - Risk: MEDIUM - Requires careful async handling
    - Expected gain: 25-40% speedup (depends on CPU cores)
  
  **Phase 3: High-Risk Architectural Changes** ⚠️ LAST RESORT
  - [ ] **Step 3.1**: Implement index-based search
    - Build inverted index (term → files) during cache build
    - Search index instead of iterating all files
    - Risk: HIGH - Major architectural change
    - Expected gain: 70-90% speedup for text searches
  
  - [ ] **Step 3.2**: Add pre-computed similarity scores
    - Calculate common token type matches during cache build
    - Store pre-computed scores for frequent patterns
    - Risk: HIGH - Increases cache size and complexity
    - Expected gain: 50-70% speedup for token matching

- **Testing Strategy for Each Step**:
  1. Create backup/branch before changes
  2. Add performance logging (console.time/timeEnd)
  3. Test with small dataset (100 files) first
  4. Test with full dataset (11,606 files)
  5. Verify no regression in match quality
  6. Verify no memory leaks (check after 50+ searches)
  7. Test all modes: browse, search, token, category filters
  8. Test edge cases: empty search, special characters, very long terms

- **Success Metrics**:
  - Search response time < 200ms (currently ~500-1000ms estimated)
  - No UI blocking during search
  - Memory usage stable after repeated searches
  - Match quality unchanged (same results as before)

- **Notes**: 
  - Current implementation handles 11,606 files but doesn't scale well
  - Focus on Phase 1 first - these are safe, high-impact optimizations
  - Only proceed to Phase 2/3 if Phase 1 gains aren't sufficient
  - Each step should be tested independently before moving to next

## MEDIUM/LOW PRIORITY ISSUES

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

## ARCHITECTURAL CONCERNS

### Socketmanager Becoming Monolithic
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Proposed Solution**:
  - Socketmanager should ONLY manage socket registration/cleanup (like hookmanager)
