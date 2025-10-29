# TODO - Active Issues and Future Tasks

## ACTIVE ISSUES

### MEDIUM PRIORITY ISSUES

### Wire up enableMenubar Setting
- **Issue**: enableMenubar setting needs to be properly connected to functionality
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Setting exists but may not be properly wired to menubar functionality
- **Location**: `scripts/settings.js` (enableMenubar setting), `scripts/api-menubar.js` (menubar functionality)
- **Tasks Needed**:
  - Search for old references to "blacksmith chat panel" that the menubar replaced
  - Ensure enableMenubar setting properly controls menubar visibility
  - Verify excludedUsersMenubar setting hides menubar for excluded users
  - Test that setting changes take effect (requiresReload: true is set)
  - Update any documentation that references the old chat panel
- **Related Settings**:
  - `enableMenubar` - Main toggle for menubar functionality
  - `excludedUsersMenubar` - List of users who should not see the menubar
- **Notes**: This is part of the settings refactoring - ensure the migrated settings actually work

### Wire up excludedUsersMenubar Setting
- **Issue**: excludedUsersMenubar setting needs to be properly connected to hide menubar for excluded users
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Setting exists but may not be properly filtering menubar visibility
- **Location**: `scripts/settings.js` (excludedUsersMenubar setting), `scripts/api-menubar.js` (menubar functionality)
- **Tasks Needed**:
  - Ensure excludedUsersMenubar setting properly hides menubar for users in the exclusion list
  - Verify the setting is parsed correctly (comma-separated userIDs)
  - Test that excluded users don't see the menubar panel
  - Test that non-excluded users still see the menubar
  - Verify the setting works in combination with enableMenubar
- **Related Settings**:
  - `excludedUsersMenubar` - Comma-separated list of userIDs to exclude from menubar
  - `enableMenubar` - Main toggle for menubar functionality
- **Notes**: This ensures proper user-level control over menubar visibility

### Verify Auto Add XP is Wired
- **Issue**: Auto Add XP functionality needs to be verified as properly connected
- **Status**: PENDING - Needs verification
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Setting exists but needs verification that it actually works
- **Location**: `scripts/settings.js` (autoDistributeXp setting), XP distribution functionality
- **Tasks Needed**:
  - Verify autoDistributeXp setting properly controls automatic XP distribution
  - Test that XP is automatically distributed when the setting is enabled
  - Test that XP distribution is manual when the setting is disabled
  - Verify the setting works in combination with other XP settings
  - Check that the setting affects the correct XP distribution triggers
- **Related Settings**:
  - `autoDistributeXp` - Auto-distribute XP toggle
  - `enableXpDistribution` - Main XP distribution toggle
  - `shareXpResults` - Share XP results setting
- **Notes**: This is part of the settings refactoring - ensure migrated XP settings actually work

### Verify Artificial Intelligence Settings are Wired
- **Issue**: Artificial Intelligence functionality needs to be verified as properly connected
- **Status**: PENDING - Needs verification
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: AI settings exist but need verification that they actually control AI functionality
- **Location**: `scripts/settings.js` (AI settings), `scripts/api-openai.js` (AI functionality)
- **Tasks Needed**:
  - Verify AI settings properly enable/disable AI functionality
  - Test that AI features are disabled when settings are turned off
  - Test that AI features work when settings are enabled
  - Verify API key validation and error handling
  - Check that AI settings affect the correct AI features
  - Test OpenAI integration with various settings combinations
- **Related Settings**:
  - `openAIMacro` - OpenAI macro toggle
  - `openAIAPIKey` - OpenAI API key setting
  - `openAIProjectId` - OpenAI project ID
  - `openAIModel` - OpenAI model selection
  - `openAIGameSystems` - Game systems selection
  - `openAIPrompt` - Custom prompt setting
  - `openAIContextLength` - Context length setting
  - `openAITemperature` - Temperature setting
- **Notes**: This is part of the settings refactoring - ensure migrated AI settings actually work

### Add Enable Setting for Nameplate Styling
- **Issue**: Nameplate styling settings should operate independently from nameplate content/formatting
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Nameplate styling is always applied regardless of tokenNameFormat setting
- **Location**: `scripts/settings.js` (new setting), `scripts/manager-canvas.js` (styling logic)
- **Tasks Needed**:
  - Add new setting `enableNameplateStyling` (Boolean, default: true)
  - Modify `_updateSingleTokenNameplate()` to check this setting before applying styling
  - Ensure nameplate styling operates independently from `tokenNameFormat` setting
  - Test that styling can be disabled while keeping nameplate content
  - Test that styling can be enabled while disabling nameplate content
  - Update localization for new setting
- **Related Settings**:
  - `enableNameplateStyling` - New setting to enable/disable nameplate styling
  - `nameplateFontFamily` - Font family for nameplates
  - `nameplateFontSize` - Font size for nameplates
  - `nameplateColor` - Text color for nameplates
  - `nameplateOutlineSize` - Outline size for nameplates
  - `nameplateOutlineColor` - Outline color for nameplates
  - `tokenNameFormat` - Controls nameplate content/formatting (independent)
- **Notes**: This allows users to control nameplate styling separately from nameplate content

### Migrate defaultRulebooks Setting to Checkboxes and Custom Box
- **Issue**: defaultRulebooks setting should use checkboxes for common rulebooks and a custom text box for additional ones
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Currently uses a single String input field for all rulebooks
- **Location**: `scripts/settings.js` (defaultRulebooks setting), UI components
- **Tasks Needed**:
  - Create checkbox settings for common rulebooks (PHB, DMG, MM, XGtE, TCoE, etc.)
  - Add custom text box setting for additional/third-party rulebooks
  - Update the setting logic to combine checkbox selections with custom text
  - Ensure backward compatibility with existing string-based setting
  - Test that the combined rulebook list works correctly
  - Update localization for new checkbox settings
  - Consider migration path for existing users
- **Related Settings**:
  - `defaultRulebooks` - Current string-based setting (to be replaced)
  - `rulebookPHB` - Player's Handbook checkbox (new)
  - `rulebookDMG` - Dungeon Master's Guide checkbox (new)
  - `rulebookMM` - Monster Manual checkbox (new)
  - `rulebookXGtE` - Xanathar's Guide checkbox (new)
  - `rulebookTCoE` - Tasha's Cauldron checkbox (new)
  - `rulebookCustom` - Custom rulebooks text box (new)
- **Notes**: This provides better UX for selecting common rulebooks while maintaining flexibility for custom ones

### Filter Compendiums by Type
- **Issue**: Compendium search settings should allow filtering by compendium type (Actor, Item, Feature, Spell, etc.)
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Compendium settings are organized by type but may not have proper filtering
- **Location**: `scripts/settings.js` (compendium settings), compendium search functionality
- **Tasks Needed**:
  - Review current compendium settings organization
  - Add filtering logic to separate compendiums by type
  - Ensure Actor compendiums only show Actor compendiums
  - Ensure Item compendiums only show Item compendiums
  - Ensure Feature compendiums only show Feature compendiums
  - Ensure Spell compendiums only show Spell compendiums
  - Test that filtering works correctly for each type
  - Update UI to show only relevant compendiums per type
  - Consider adding "All Types" option for mixed compendiums
- **Related Settings**:
  - `monsterCompendium1-8` - Monster/Actor compendiums (8 settings)
  - `itemCompendium1-8` - Item compendiums (8 settings)
  - `featureCompendium1-8` - Feature compendiums (8 settings)
  - `spellCompendium1-8` - Spell compendiums (8 settings)
  - `searchWorldMonstersFirst` - Search world monsters first
  - `searchWorldItemsFirst` - Search world items first
  - `searchWorldFeaturesFirst` - Search world features first
- **Notes**: This ensures users only see relevant compendiums for each type, improving UX and reducing confusion

### Refactor Compendium Settings into Reusable Function
- **Issue**: Compendium settings have repeated code patterns that could be consolidated
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Code quality and maintainability
- **Current State**: Each compendium type (Actor, Item, Feature, Spell) has identical loop structures
- **Location**: `scripts/settings.js` (compendium registration loops)
- **Tasks Needed**:
  - Create reusable function `registerCompendiumSettings(type, numCompendiums, group)`
  - Replace repeated loops with function calls
  - Ensure function handles different compendium types correctly
  - Test that all compendium settings still work after refactoring
  - Consider adding type-specific customization options
  - Update any related logic that depends on the current structure
- **Current Pattern**:
  ```javascript
  for (let i = 1; i <= numCompendiums; i++) {
      game.settings.register(MODULE.ID, `{type}Compendium${i}`, {
          name: `{Type}: Priority ${i}`,
          hint: null,
          scope: "world",
          config: true,
          requiresReload: false,
          default: "none",
          choices: BLACKSMITH.arrCompendiumChoices
      });
  }
  ```
- **Proposed Function**:
  ```javascript
  function registerCompendiumSettings(type, displayName, numCompendiums, group) {
      for (let i = 1; i <= numCompendiums; i++) {
          game.settings.register(MODULE.ID, `${type}Compendium${i}`, {
              name: `${displayName}: Priority ${i}`,
              hint: null,
              scope: "world",
              config: true,
              requiresReload: false,
              default: "none",
              choices: BLACKSMITH.arrCompendiumChoices,
              group: group
          });
      }
  }
  ```
- **Related Settings**:
  - `monsterCompendium1-8` - Actor compendiums (8 settings)
  - `itemCompendium1-8` - Item compendiums (8 settings)
  - `featureCompendium1-8` - Feature compendiums (8 settings)
  - `spellCompendium1-8` - Spell compendiums (8 settings)
- **Notes**: This reduces code duplication and makes adding new compendium types easier

### Enhance Compendium Choices with Type Filtering
- **Issue**: Compendium choices should be filtered by type and made available to other modules
- **Status**: PENDING - Needs implementation
- **Priority**: MEDIUM - Settings refactoring completion
- **Current State**: Single `arrCompendiumChoices` array contains all compendiums regardless of type
- **Location**: `scripts/settings.js` (`getCompendiumChoices()` function)
- **Tasks Needed**:
  - Modify `getCompendiumChoices()` to include type information in compendium data
  - Create filtered arrays for each compendium type (Actor, Item, JournalEntry, Scene, etc.)
  - Expose filtered arrays to other modules via `BLACKSMITH.updateValue()`
  - Update compendium settings to use type-specific filtered arrays
  - Test that other modules can access both full and filtered arrays
  - Ensure backward compatibility with existing `arrCompendiumChoices`
- **Proposed Enhancement**:
  ```javascript
  function getCompendiumChoices() {
      // ... existing code ...
      
      // Store full data with type information
      BLACKSMITH.updateValue('arrCompendiumChoicesData', choicesArray);
      
      // Store main choices (backward compatible)
      BLACKSMITH.updateValue('arrCompendiumChoices', choices);
      
      // Create and store filtered arrays for each type
      const types = [...new Set(choicesArray.map(c => c.type))];
      types.forEach(type => {
          const filteredChoices = choicesArray
              .filter(compendium => compendium.type === type)
              .reduce((choices, compendium) => {
                  choices[compendium.id] = compendium.label;
                  return choices;
              }, {"none": "-- None --"});
          
          BLACKSMITH.updateValue(`arrCompendiumChoices${type}`, filteredChoices);
      });
  }
  ```
- **Available Arrays for Other Modules**:
  - `BLACKSMITH.arrCompendiumChoices` - Full array (backward compatible)
  - `BLACKSMITH.arrCompendiumChoicesActor` - Actor compendiums only
  - `BLACKSMITH.arrCompendiumChoicesAdventure` - Adventure compendiums only
  - `BLACKSMITH.arrCompendiumChoicesCardStack` - Card Stack compendiums only
  - `BLACKSMITH.arrCompendiumChoicesItem` - Item compendiums only
  - `BLACKSMITH.arrCompendiumChoicesJournalEntry` - Journal Entry compendiums only
  - `BLACKSMITH.arrCompendiumChoicesMacro` - Macro compendiums only
  - `BLACKSMITH.arrCompendiumChoicesPlaylist` - Playlist compendiums only
  - `BLACKSMITH.arrCompendiumChoicesRollTable` - Rollable Table compendiums only
  - `BLACKSMITH.arrCompendiumChoicesScene` - Scene compendiums only
- **Settings Updates**:
  - `monsterCompendium1-8` → `choices: BLACKSMITH.arrCompendiumChoicesActor`
  - `itemCompendium1-8` → `choices: BLACKSMITH.arrCompendiumChoicesItem`
  - `featureCompendium1-8` → `choices: BLACKSMITH.arrCompendiumChoicesJournalEntry`
  - `spellCompendium1-8` → `choices: BLACKSMITH.arrCompendiumChoicesItem` (or appropriate type)
- **Notes**: This provides better UX by showing only relevant compendiums per type while maintaining backward compatibility

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

### Token Movement Measurement
- **Issue**: Add functionality to measure and track token movement distances
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Quality of life improvement for movement tracking
- **Description**: Track and display movement distances for tokens, useful for movement-based abilities, spell ranges, and tactical positioning
- **Requirements**:
  1. **Movement Tracking**:
     - Track total distance moved per turn/round
     - Track distance moved since last action
     - Track cumulative movement for complex movement abilities
     - Display movement stats in token tooltip or sidebar
  2. **Movement Display**:
     - Show current movement distance in feet/grid units
     - Color-code based on movement speed (green = normal, yellow = half speed, red = over speed)
     - Optional movement trail visualization
     - Movement history for the current turn
  3. **Integration with Abilities**:
     - Track movement for dash actions
     - Monitor movement for opportunity attacks
     - Calculate remaining movement for complex abilities
     - Integration with movement-based spells/abilities
  4. **Settings**:
     - Toggle to enable/disable movement measurement
     - Choose display method (tooltip, sidebar, chat message)
     - Configure movement speed thresholds
     - Enable/disable movement trail visualization
- **Location**: `scripts/token-movement.js` or new `scripts/movement-tracker.js`
- **Technical Considerations**:
  - Use existing movement hooks to track position changes
  - Calculate distances using grid size and movement rules
  - Store movement data per token per turn/round
  - Handle diagonal movement rules (optional)
- **Benefits**: Better tactical awareness, easier movement tracking, enhanced combat experience
- **Challenges**: 
  - Determining appropriate display methods
  - Handling complex movement scenarios
  - Performance with many tokens
  - Integration with existing movement features
- **Notes**: Should be subtle and non-intrusive, complementing existing movement sound features

### Multiple Image Directories for Token Image Replacement
- **Issue**: Token image replacement currently uses a single image directory
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Quality of life improvement for image management
- **Description**: Allow users to configure multiple image directories for token image replacement, enabling organization of images across different folders
- **Requirements**:
  1. **Multiple Directory Support**:
     - Add settings to configure multiple image directories
     - Allow users to specify priority order for directories
     - Support both absolute and relative paths
  2. **Search Behavior**:
     - Search through directories in priority order
     - First match found takes precedence
     - Cache results to avoid repeated searches
  3. **Directory Management**:
     - Add/remove directories dynamically
     - Reorder directories to change priority
     - Validate directory paths exist
  4. **Settings**:
     - Toggle to enable/disable multiple directories
     - Configure directory list
     - Set priority order
     - Option to search all directories or stop at first match
- **Location**: `scripts/token-image-replacement.js`, `scripts/settings.js`
- **Benefits**: Better image organization, support for modular image collections, easier management of large image libraries
- **Challenges**: Managing search performance across multiple directories, cache invalidation when directories change
- **Notes**: Should maintain backward compatibility with single directory setup

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

### Export Compendium as HTML
- **Issue**: Add functionality to export a compendium as an HTML document
- **Status**: FUTURE ENHANCEMENT - Design phase
- **Priority**: LOW - Quality of life improvement for content sharing
- **Description**: Allow users to export compendium contents (items, actors, journal entries, etc.) as a formatted HTML document for sharing, printing, or archiving
- **Requirements**:
  1. **Export Options**:
     - Export entire compendium or selected entries
     - Choose which compendiums to export
     - Filter by entry type (Actor, Item, JournalEntry, etc.)
     - Include/exclude specific fields (images, descriptions, stats, etc.)
  2. **HTML Formatting**:
     - Clean, readable HTML structure
     - Proper formatting for different entry types
     - Include images with proper paths or embedded data
     - Styled tables for stats/data
     - Organized sections and headings
  3. **Export Functionality**:
     - Generate HTML from compendium data
     - Save HTML file for download
     - Option to copy HTML to clipboard
     - Include metadata (compendium name, export date, etc.)
  4. **Settings**:
     - Toggle to enable/disable export feature
     - Configure default export options
     - Choose export template/style
- **Location**: New file `scripts/compendium-exporter.js` or add to `scripts/journal-tools.js`
- **Technical Considerations**:
  - Access compendium data via Foundry API
  - Convert Foundry document structure to HTML
  - Handle embedded media (images, audio)
  - Generate valid, readable HTML
  - Consider file size for large compendiums
- **Benefits**: Easy content sharing, backup/archival, printing capabilities, cross-platform compatibility
- **Challenges**:
  - Converting Foundry-specific formats to HTML
  - Handling embedded media paths
  - Performance with large compendiums
  - Maintaining formatting and styling
- **Notes**: Should generate clean, standards-compliant HTML that can be viewed in any browser

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
