# TODO - Active Issues and Future Tasks

## MEDIUM/LOW PRIORITY ISSUES

### Memory Leaks and Performance Optimizations
- **Issue**: Codebase scan revealed several memory leaks and performance optimization opportunities
- **Status**: PENDING
- **Priority**: MEDIUM - System is stable but optimizations would improve performance
- **Findings**:

  **🚨 CRITICAL MEMORY LEAKS:**
  - **MenuBar Timer Intervals** (`api-menubar.js`) - `setInterval` calls without cleanup mechanism
  - **PlanningTimer Intervals** (`timer-planning.js`) - Multiple intervals may persist across reloads
  - **CombatTimer Multiple Intervals** (`timer-combat.js`) - Potential for overlapping intervals
  - **RoundTimer UpdateInterval** (`timer-round.js`) - Interval persists after timer stops
  - **LatencyChecker Interval** (`latency-checker.js`) - Background interval continues running

  **⚡ PERFORMANCE OPTIMIZATIONS:**
  - **Settings Retrieved Multiple Times** (`manager-image-matching.js`) - Settings called 7x per loop instead of cached
  - **Large Cache Memory Usage** (`manager-image-cache.js`) - 17,562+ files stored in memory
  - **Sequential Token Matching** (`manager-image-matching.js`) - Could be parallelized

  **✅ EXCELLENT PRACTICES FOUND:**
  - **TokenImageReplacementWindow** - Exemplary cleanup in `close()` method
  - **TokenImageUtilities** - Comprehensive cleanup in `cleanupTurnIndicator()`
  - **Search Result Caching** - Proper LRU cache with TTL expiration

- **Plan**: 
  - Add cleanup mechanisms for timer intervals
  - Cache settings retrieval in matching loops
  - Consider memory optimization for large caches
  - Implement proper interval cleanup on module unload
- **Notes**: Overall codebase is in good condition - most systems have proper cleanup

## DEFERRED TASKS

### Search Performance - Phase 2/3 Optimizations
- **Issue**: Additional performance optimizations available if Phase 1 improvements prove insufficient
- **Status**: DEFERRED - Phase 1 optimizations (caching, tag pre-computation) resolved lag issues
- **Reason for Deferral**: User testing confirms Phase 1 improvements are sufficient ("seems to have made lag better")
- **Available if needed**:
  
  **Phase 2: Medium-Risk Performance Gains**
  - Streaming/incremental results (40-60% perceived speedup)
  - Score caching with TTL (30-50% speedup on similar searches)
  - Parallelize score calculations (25-40% speedup)
  
  **Phase 3: High-Risk Architectural Changes**
  - Index-based search (70-90% speedup for text searches)
  - Pre-computed similarity scores (50-70% speedup for token matching)

- **Trigger for Revisiting**: If users report lag returns with larger datasets (20,000+ files) or different usage patterns

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
