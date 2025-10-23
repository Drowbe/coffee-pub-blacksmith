# TODO - Active Issues and Future Tasks

## ACTIVE ISSUES

### MEDIUM PRIORITY ISSUES

### Combat Tracker - Roll Player Character Initiative Not Working
- **Issue**: "Roll Player Character Initiative" button doesn't roll initiative for player characters
- **Status**: PENDING - Needs investigation
- **Priority**: MEDIUM - Affects combat workflow
- **Expected Behavior**: Should roll initiative for all player characters when clicked
- **Actual Behavior**: Nothing happens when button is clicked
- **Location**: Likely in `scripts/combat-tracker.js` or `scripts/combat-tools.js`
- **Investigation Needed**:
  - Find the button click handler for "Roll Player Character Initiative"
  - Check if the function is being called
  - Verify the logic for identifying player characters
  - Verify the initiative roll is being triggered correctly


### Combat Stats - Review and Refactor
- **Issue**: Combat stats system needs review and potential refactoring
- **Status**: PENDING - Needs investigation and planning
- **Priority**: MEDIUM - Code quality and maintainability
- **Current State**: Combat stats functionality exists but may need cleanup/optimization
- **Location**: `scripts/stats-combat.js`, potentially `scripts/stats-player.js`
- **Investigation Needed**:
  - Review current combat stats implementation
  - Identify what stats are being tracked and how
  - Check for unused code or duplicate logic
  - Verify stats are being stored/retrieved correctly
  - Check for performance issues
  - Review UI/UX for displaying stats
- **Potential Issues to Look For**:
  - Redundant or unused stat tracking
  - Inefficient data storage
  - Missing or incomplete stat categories
  - Poor separation of concerns
  - Memory leaks or performance bottlenecks
  - Unclear or confusing UI
- **Refactoring Goals**:
  - Clean, maintainable code
  - Efficient stat tracking and storage
  - Clear separation between tracking logic and display logic
  - Good performance even with many combats
  - Useful and actionable stats for GMs/players
- **Notes**: This is a code quality task - review first, then create specific refactoring plan

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

### Auto-Roll Injury Based on Rules
- **Issue**: Automatically roll for injuries when certain conditions are met
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Quality of life improvement for injury system
- **Description**: Automatically trigger injury rolls based on configurable rules/conditions
- **Requirements**:
  1. **Trigger Conditions**:
     - HP drops below threshold (e.g., 0 HP, negative HP, below 50%)
     - Critical hit received
     - Massive damage (e.g., single hit > half max HP)
     - Failed death saving throw
     - Specific damage types (fire, necrotic, etc.)
     - Fall damage above threshold
     - Custom conditions (via settings)
  2. **Injury Table Integration**:
     - Use existing injury compendium/tables
     - Support multiple injury severity levels (minor, major, critical)
     - Roll on appropriate table based on trigger condition
     - Apply injury to actor automatically
  3. **Rule Configuration**:
     - Enable/disable auto-roll globally
     - Configure which conditions trigger injury rolls
     - Set thresholds (HP %, damage amount, etc.)
     - Choose which injury tables to use
     - Option to prompt GM for confirmation vs auto-apply
  4. **Player/NPC Distinction**:
     - Apply to PCs only, NPCs only, or both
     - Different rules for each (e.g., PCs get injuries, NPCs don't)
     - Configurable per actor type
  5. **Notifications & UI**:
     - Chat message when injury is rolled
     - Show injury description/effects
     - Optional sound effect
     - Visual indicator on token (icon, overlay, etc.)
  6. **Settings**:
     - Toggle to enable/disable auto-injury system
     - Configure trigger conditions and thresholds
     - Choose injury tables per severity level
     - Apply to PCs/NPCs/both
     - Confirmation mode (auto vs prompt)
- **Location**: `scripts/token-image-utilities.js` or new `scripts/injury-manager.js`
- **Related Files**: 
  - `packs/blacksmith-injuries` (injury compendium)
  - Hook into `updateActor` for HP changes
  - Hook into combat damage for critical hits
- **Technical Considerations**:
  - Monitor `updateActor` hook for HP/death save changes
  - Calculate damage taken (compare old HP to new HP)
  - Detect critical hits and damage types
  - Roll on RollTable and parse results
  - Apply injury effects to actor
  - Handle edge cases (temp HP, healing, resistance/immunity)
- **Injury Rules to Support**:
  - D&D 5e variant rules (DMG p.272 - Lingering Injuries)
  - Critical hit injuries
  - Massive damage injuries
  - Death save failure injuries
  - Custom homebrew rules
- **Benefits**: 
  - Automated injury tracking
  - Consistent application of injury rules
  - Adds consequences to combat damage
  - Enhances gritty/realistic campaigns
- **Challenges**: 
  - Determining appropriate injury severity
  - Balancing automation vs GM control
  - Handling multiple simultaneous triggers
  - Preventing injury spam
  - Managing injury effects/conditions in Foundry
- **Integration with Existing Features**:
  - Works with dead token replacement
  - Works with death save overlay
  - Could trigger special token changes for severely injured characters
- **Notes**: Should be fully opt-in with clear warnings about game balance impact. GMs should have full control over when/how injuries are applied.

### Token Movement Sounds
- **Issue**: Add audio feedback when tokens are moved on the canvas
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Nice-to-have feature for immersion
- **Description**: Play contextual sounds when tokens move (footsteps, flying, swimming, etc.)
- **Requirements**:
  1. **Sound Selection**:
     - Default movement sound (footsteps, generic movement)
     - Contextual sounds based on token type or terrain
     - Potentially different sounds for: walking, running, flying, swimming, sneaking
     - User-configurable sound library
  2. **Trigger Logic**:
     - Detect token movement via `updateToken` hook
     - Calculate distance moved to determine if sound should play
     - Respect minimum movement threshold (avoid sounds for tiny adjustments)
     - Consider movement speed (walk vs run vs teleport)
  3. **Sound Management**:
     - Volume control (separate from Foundry's ambient sound volume)
     - Enable/disable toggle
     - Per-token sound override (dragon has wing flaps, ghost is silent, etc.)
     - Prevent sound spam (cooldown between plays)
  4. **Settings**:
     - Toggle to enable/disable movement sounds
     - Volume slider
     - Minimum movement distance threshold
     - Sound selection per movement type
     - Per-token sound overrides
- **Location**: `scripts/token-movement.js` or `scripts/token-handler.js`
- **Technical Considerations**:
  - Use Foundry's `AudioHelper.play()` for sound playback
  - Manage sound instances to prevent overlapping/spam
  - Consider performance with many simultaneous movements
  - Handle muted/GM-only movements appropriately
- **Sound Resources Needed**:
  - Footsteps (various surfaces: stone, wood, grass, water)
  - Flying (wing flaps, magical hover)
  - Swimming/water movement
  - Sneaking/quiet movement
  - Teleportation/magical movement
- **Benefits**: Enhanced immersion, better audio feedback, more tactile feel to token movement
- **Challenges**: 
  - Finding/creating appropriate sound assets
  - Balancing sound frequency (avoiding annoyance)
  - Performance with many tokens moving simultaneously
  - Handling edge cases (token dragged vs programmatically moved)
- **Notes**: Should be subtle and non-intrusive by default. Consider limiting to GM-controlled tokens only as an option.

### No Initiative Mode
- **Issue**: Alternative combat mode where GM manually controls turn order instead of initiative rolls
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Quality of life improvement for narrative-focused games
- **Description**: A theater-of-the-mind friendly combat mode that removes initiative rolling
- **Requirements**:
  1. **Auto-Group Combatants**:
     - Players grouped first (in party order or alphabetical)
     - Monsters/NPCs grouped second (in alphabetical order or GM-defined order)
     - Initiative values auto-assigned to maintain group order (e.g., Players: 20-19-18..., NPCs: 10-9-8...)
  2. **Manual Turn Control**:
     - GM uses existing "Set As Current Combatant" button to advance turns
     - No automatic turn advancement based on initiative
     - GM decides who acts next within each group
  3. **Turn Tracking Visual**:
     - Need visual indicator to show which combatants have already acted this round
     - Could use: token overlay, combat tracker icon, dimming/graying, checkmark, etc.
     - Should reset when round advances
  4. **Settings**:
     - Toggle to enable/disable "No Initiative Mode"
     - Option to choose grouping method (party order, alphabetical, custom)
     - Option to choose turn indicator style
- **Location**: `scripts/combat-tracker.js`, `scripts/combat-tools.js`
- **Benefits**: Faster combat setup, more narrative control, better for new players unfamiliar with initiative
- **Challenges**: 
  - Finding good visual indicator for "has acted" that doesn't conflict with other UI elements
  - Ensuring compatibility with existing combat features (timers, turn indicator rings, etc.)
  - Deciding how to handle turn advancement (auto-advance vs manual only)
- **Notes**: This would be a significant UX change requiring careful design and testing

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
