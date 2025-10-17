# TODO - Active Issues and Future Tasks

## MEDIUM/LOW PRIORITY ISSUES

### Death Token System Enhancements
- **Issue**: Current death token system needs improvements for player characters and death saving throws
- **Status**: PENDING
- **Priority**: MEDIUM - Enhances gameplay experience for player death mechanics
- **Required Features**:
  1. **Player Death Token Logic**:
     - Player tokens should NOT get the "death" token change at less than 0 HP unless they have failed all three death saving throws
     - Current behavior applies death token immediately at 0 HP, which is incorrect for PCs
  2. **Secondary Death Token for Players/Friendly NPCs**:
     - Need a second "death" token specifically for players and friendly NPCs
     - Should be visually distinct from hostile NPC death tokens
     - Applied when player is unconscious (0 HP) but not yet dead (< 3 failed death saves)
  3. **Death Saving Throw Overlay**:
     - Introduce a visual overlay to display death saving throw status
     - Should show success/failure marks (similar to D&D Beyond's UI)
     - Update in real-time as death saves are rolled
     - Position overlay on/near the token for easy visibility
- **Location**: `scripts/token-image-utilities.js` (dead token management methods)
- **Related Files**: 
  - `scripts/token-image-utilities.js` - Core death token logic
  - `images/tokens/death/` - Death token images
  - Potentially needs new CSS/templates for overlay
- **Notes**: This is a key feature for D&D 5e gameplay, ensuring proper death mechanics for player characters

## DEFERRED TASKS

### Performance - Large Cache Memory & Parallelization
- **Issue**: Additional performance optimizations available but not critical
- **Status**: DEFERRED - Current performance is acceptable
- **Low Priority Items**:
  - **Large Cache Memory Usage** (`manager-image-cache.js`) - 17,562+ files stored in memory (architectural decision, working as designed)
  - **Sequential Token Matching** (`manager-image-matching.js`) - Could be parallelized (would add complexity for minimal gain at current scale)
- **Trigger for Revisiting**: If users report memory issues with very large collections (50,000+ files) or if matching performance becomes a bottleneck

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
