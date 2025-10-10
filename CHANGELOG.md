# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [12.1.13] - 2025-01-19

### Added
- **Server-Side Cache Storage:** Implemented game.settings-based cache storage for hosted environments
  - Cache now saves to server-side game.settings instead of browser localStorage
  - Persists across browser refreshes and different client connections
  - Compatible with Molten Hosting and other remote FoundryVTT servers
  - Shared cache across all GMs and players in the world
  - Maintains all existing compression and streaming benefits

- **Enhanced Cache Persistence:** Added robust server-side cache management
  - Incremental saves during scan process to preserve progress
  - Final save with complete fingerprint for validation
  - Automatic fallback and validation for cache integrity
  - Console commands updated to show server-side cache status

### Fixed
- **Molten Hosting Cache Loss:** Resolved critical issue where cache was lost on browser refresh
  - localStorage was browser-specific and not persisting on remote servers
  - Cache now stored in world database via game.settings
  - Survives server restarts and browser session changes
  - Works seamlessly across different devices and browsers

- **Cross-Client Cache Sharing:** Fixed issue where cache was isolated per browser session
  - All players and GMs now share the same cached token data
  - No need to rescan when switching devices or browsers
  - Consistent token replacement experience for all users

### Changed
- **Cache Storage Location:** Migrated from localStorage to game.settings
  - Primary storage now in server database (persistent across sessions)
  - Maintains backward compatibility with existing cache format
  - All console commands updated to reflect server-side storage
  - Cache size and compression benefits retained

- **Cache Loading Logic:** Updated to prioritize server-side cache over localStorage
  - Loads from game.settings first, falls back to localStorage if needed
  - Validates cache integrity and version compatibility
  - Clear messaging about cache source (server vs. browser)

## [12.1.12] - Cache Compression

### Added
- **Streaming Cache Compression:** Implemented memory-efficient cache compression system to solve localStorage quota issues
  - Builds compressed cache data without creating full JSON objects in memory
  - Reduces cache size by 40-60% through property name shortening and whitespace removal
  - Handles large token collections (10,000+ files) without quota exceeded errors
  - Backward compatible with existing cache format

- **Enhanced Console Commands:** Added comprehensive cache debugging tools
  - `coffeePubCache.info()` - Display cache statistics (files, folders, creature types, scan status)
  - `coffeePubCache.size()` - Show compressed vs uncompressed cache size with compression ratio
  - `coffeePubCache.version()` - Display cache version and basic information
  - `coffeePubCache.clear()` - Clear cache from localStorage
  - `coffeePubCache.quota()` - Test localStorage quota availability

- **Cache Size Display:** Added cache storage size to UI status display
  - Shows actual localStorage footprint alongside file count and age
  - Updates dynamically when cache changes
  - Format: "1969 files, 0.8 hours old, 0.53MB"

### Fixed
- **localStorage Quota Exceeded:** Resolved critical issue where large token collections (8.64MB+) failed to save
  - Streaming compression prevents memory issues during cache building
  - No longer hits browser localStorage limits (typically 5-10MB)
  - Cache now saves successfully for collections with 10,000+ files

- **Cache Save Reliability:** Improved cache persistence during long scans
  - Streaming compression reduces save failures
  - Better error handling for storage quota issues
  - Fallback mechanisms if compression fails

### Changed
- **Cache Storage Format:** Optimized internal cache structure for better compression
  - Shortened property names (e.g., "fullPath" → "fp", "fileName" → "fn")
  - Removed unnecessary whitespace from JSON structure
  - Maintains full backward compatibility with existing caches

- **Save Progress Messages:** Updated cache save notifications to show actual compressed size
  - Clear indication of storage footprint: "Cache saved: 0.53MB (1969 files)"
  - Removed misleading compression ratio estimates
  - More accurate reporting of actual storage usage


## [12.1.11] - Token Image Replacement Enhancements

### Added
- **3-State Tag Filter Toggle:** Enhanced tag sorting with three modes:
  - Count mode: Sort tags by frequency (default)
  - Alpha mode: Sort tags alphabetically
  - Hidden mode: Completely hide tag container
  - Visual feedback with distinct icons for each mode (fa-filter, fa-filter-list, fa-filter-circle-xmark)
  - Persistent mode selection across sessions

- **Ignored Words Filter:** Added powerful file exclusion system with wildcard support:
  - Completely excludes matching files from cache scanning
  - Supports multiple wildcard patterns: exact match, starts with (*word), ends with (word*), contains (*word*)
  - File extension filtering (e.g., *.png, *.jpg)
  - Tracks and reports ignored file count in scan completion messages
  - Significantly reduces cache size for large token collections

### Fixed
- **Automatic Cache Updates:** Fixed automatic update system to use incremental scans instead of full scans when changes are detected
  - Automatic updates now properly call `_doIncrementalUpdate()` instead of `_scanFolderStructure()`
  - Much faster update performance when "Automatically Update Image Cache" is enabled
  - Preserves existing cache data during automatic updates

- **Folder Count Display:** Fixed completion message to show accurate number of scanned folders
  - Added `totalFoldersScanned` property to track actual non-ignored directory count
  - Completion messages now display correct folder count instead of only folders containing files

### Changed
- **Debug Logging Cleanup:** Converted internal progress and processing messages to debug-only mode
  - Reduced console noise during normal operation
  - Critical errors and user-facing messages remain visible
  - Improved debugging experience with properly flagged messages



## [12.1.10] - Character Import System and Enhanced Cache Size Monitoring

### Added
- **Character Import System:** Added comprehensive character import system with advanced properties:
  - Character type configuration (npc, player, monster)
  - Currency configuration with type and amount
  - Feature configuration with name and description
  - Spell configuration with name and description

### Added
- **Enhanced Cache Size Monitoring:** Added automatic size monitoring with warnings when cache approaches localStorage limits (8MB threshold)
  - Automatic fallback logic: File → localStorage quick cache → old localStorage format → rebuild
  - Cache directory auto-creation and management
  - Seamless migration from old localStorage-only format to hybrid system

### Fixed
- **CRITICAL: Token Image Cache System:** Fixed multiple critical bugs causing cache data loss and scan failures:
  - Error handling now saves partial cache with proper fingerprint even when scans fail
  - Incremental updates properly handle null/invalid fingerprints instead of infinite rescan loops
  - Finally block ensures cache status updates and UI renders correctly after errors
  - Enhanced fingerprint validation detects and handles `null`, `'error'`, and `'no-path'` states gracefully
  - Added comprehensive error logging with stack traces, cache diagnostics, and storage quota details
  - Cache now persists reliably even when scan errors occur, preventing loss of incremental progress
  - Enhanced localStorage cache with size monitoring and quota exceeded protection
  - Cache survives browser cache clearing and module updates

## [12.1.9] - Menu Bar System and Enhanced Consumable Item Import System

### Added
- **Menu Bar System:** Introduced a comprehensive menu bar for quick access to module features:
  - Current combatant display with portrait, name, HP, and conditions
  - Party leader display with initiative and status
  - Quick access buttons for frequently used tools
  - Configurable visibility and position settings
  - Real-time updates during combat
- **Simplified Item Import Options:** Streamlined item import dropdown to two clean options: "Loot" and "Consumables"
- **Enhanced Consumable Item Support:** Added comprehensive consumable item import with advanced properties:
  - Consumable type configuration (ammunition, food, poison, potion, rod, scroll, trinket, wand)
  - Magical property detection and attunement requirements
  - Usage tracking with spent/max uses and auto-destroy behavior
  - Recovery system with configurable periods (Long Rest, Short Rest, Day, etc.)
- **Activity System Integration:** Implemented full activity support for consumable items:
  - Multiple activities per item (Heal, Attack, Cast, Check, Damage, etc.)
  - Activity-specific effect configuration with dice formulas
  - Chat flavor text for activity descriptions
  - Proper FoundryVTT activity data structure with unique IDs
- **RollTable Import Utility:** Added comprehensive rolltable import system with multiple result types:
  - Text results with descriptions and weights
  - Document results linking to world actors/items with automatic matching
  - Compendium results with collection references
  - Support for "Draw with Replacement" and "Display Roll Formula" settings
- **Dynamic Prompt Generation:** Enhanced prompt templates with placeholder replacement:
  - Campaign name and rulebooks integration across all prompts
  - Dynamic actor lists for "Document: Actor" rolltables
  - Dynamic item lists for "Document: Item" rolltables
  - Automatic placeholder substitution during template copying

### Fixed
- **Consumable Property Mapping:** Fixed magical property detection using correct FoundryVTT field names (`properties.mgc`)
- **Activity Effect Configuration:** Resolved healing effect field mapping to use proper HTML field names:
  - `healing.number` for dice count
  - `healing.denomination` for die type (converted from "d8" to "8")
  - `healing.bonus` for bonus values
  - `healing.types` for effect type selection
- **Recovery System Validation:** Fixed recovery formula validation errors by using numeric values instead of text descriptions
- **RollTable Document Type Assignment:** Corrected document type assignment for rolltable results using proper field names (`documentCollection`)
- **Activity ID Generation:** Fixed activity ID format to meet FoundryVTT's 16-character alphanumeric requirements

### Changed
- **Unified Prompt Structure:** Consolidated item prompts to include both JSON and image generation instructions in single files
- **Enhanced Field Support:** Expanded consumable item fields to support all FoundryVTT consumable properties:
  - `consumableType`, `consumptionMagical`, `magicalAttunementRequired`
  - `limitedUsesSpent`, `limitedUsesMax`, `destroyOnEmpty`
  - `recoveryPeriod`, `recoveryAmount` (auto-calculated)
- **Improved Error Handling:** Enhanced validation and error handling throughout the import system
- **Scalable Activity Architecture:** Designed activity system to support multiple activity types with proper effect configuration

### Technical Details
- Updated `parseFlatItemToFoundry()` function with comprehensive consumable item support
- Implemented `parseTableToFoundry()` function for rolltable data conversion
- Added helper functions for world actor/item list generation
- Enhanced placeholder replacement system with `getTablePromptWithDefaults()`
- Fixed FoundryVTT data structure compliance for all imported item types



## [12.1.8] - Beginning of migration to version 13

### New
- **Modified Compatability**: Mod now on track to support FoundryVTT version 13

## [12.1.7] - XP Distribution System Complete Overhaul

### Added
- **Dual-Mode XP System:** Implemented independent Experience Points and Milestones modes
  - Experience Points mode: Monster-based XP calculation with resolution types
  - Milestones mode: Manual XP input with category, title, and description fields
  - Both modes can be active simultaneously with combined XP totals
  - Toggle controls for each mode with proper UI visibility management
- **Menubar Integration:** Added XP Distribution tool to GM Tools section of menubar
  - Accessible via "GM Tools" → "XP Distribution" button
  - Works independently of combat tracker - no active combat required
  - Integrates with existing menubar API and tool registration system
  - Maintains consistent UI/UX with other menubar tools
- **Non-Combat XP Distribution:** Added XP distribution window accessible from GM Tools menubar
  - Works without active combat by loading all canvas monsters
  - Defaults to "Removed" status for all monsters in non-combat mode
  - Maintains full monster data for dynamic resolution changes
  - Defaults to Milestones mode ON, Experience Points mode OFF when no combat active
- **Enhanced Monster Resolution System:** Expanded resolution types with proper multipliers
  - Defeated (1.00x), Escaped (0.60x), Captured (1.20x), Negotiated (1.50x), Ignored (0.20x), Removed (0.00x)
  - Visual resolution icons with tooltips and multiplier display
  - Real-time XP calculation updates as resolutions change
- **Player Adjustment Controls:** Added intuitive plus/minus buttons for individual player XP adjustments
  - Visual +/- buttons replace confusing input-only system
  - Error trapping prevents negative XP (rounds to 0)
  - Maintains existing player inclusion/exclusion functionality
- **Sticky Footer Layout:** Implemented proper flexbox layout for XP distribution window
  - Sticky header, scrollable middle content, sticky footer
  - Action buttons always visible at bottom regardless of window size
  - Responsive design that works at any window height

### Fixed
- **XP Calculation Discrepancies:** Resolved circular dependency bug in XP calculations
  - Fixed stale data issues where monster resolution changes didn't update totals
  - Unified player data loading between combat and non-combat modes
  - Ensured consistent XP calculations across all entry points
- **Character HP Corruption:** Fixed critical bug causing character death after XP distribution
  - Removed problematic `diff: false` and `recursive: false` flags from actor updates
  - Prevented infinite reactivity loops in FoundryVTT's actor update system
  - Characters now maintain proper HP values after XP distribution and browser refresh
- **Player Level Display:** Fixed missing player levels in combat mode
  - Unified player data structure between combat and non-combat entry points
  - Ensured consistent level information display across all modes
- **Monster Base XP Calculation:** Fixed CR-to-XP conversion for fractional challenge ratings
  - Converted CR table to use decimal keys (0.5, 1.5, etc.) instead of string keys
  - Added proper CR conversion helper for accurate XP calculations
  - Fixed "CR 0.5 monsters showing 0 XP" issue
- **Chat Card Display Logic:** Enhanced XP distribution results chat card
  - Filters out "REMOVED" monsters from display
  - Conditionally shows Experience Points and Milestones sections based on enabled modes
  - Fixed "LEVEL UP!" display for players with negative `nextLevelXp`
  - Shows total XP and XP to next level instead of just XP gained
- **Milestone Data Persistence:** Fixed milestone form data not appearing in chat card
  - Properly collects category, title, and description from form inputs
  - Uses direct jQuery `.val()` access instead of FormData (no form tag in template)
  - Ensures milestone data is captured before XP distribution

### Improved
- **UI/UX Consistency:** Standardized styling and layout across XP distribution interface
  - Consistent label styling with `class="label"` for all form elements
  - Side-by-side layout for milestone Experience Points input and Category select
  - Proper spacing and alignment for all form elements
  - Unified CSS targeting with data attributes instead of class-based selectors
- **Error Handling:** Enhanced robustness throughout XP distribution system
  - Added comprehensive error trapping for negative XP values
  - Improved actor update error handling with proper try-catch blocks
  - Added validation for player data before processing
  - Graceful handling of missing or invalid actor references
- **Performance Optimization:** Streamlined XP calculation and update processes
  - Removed unnecessary re-rendering on mode toggle changes
  - Implemented efficient jQuery show/hide instead of full template re-rendering
  - Optimized event handling to prevent duplicate calculations
  - Reduced console logging overhead in production

### Technical Improvements
- **Code Architecture:** Refactored XP distribution system for maintainability
  - Centralized XP calculation logic in `updateXpCalculations()` method
  - Unified player data loading with `loadPartyMembers()` static method
  - Separated concerns between data collection, calculation, and display
  - Improved method organization and reduced code duplication
- **Data Structure Consistency:** Standardized XP data object structure
  - Consistent player data format across combat and non-combat modes
  - Proper initialization of milestone data structure
  - Unified monster data format with all required fields
  - Eliminated data structure mismatches between different entry points



## [12.1.6] - Token Image Replacement System Enhancements

### Added
- **Favorites System:** Added comprehensive favorites functionality for token images
  - New "Favorites" filter tab in the category filters (left of "Selected")
  - Right-click any image thumbnail to favorite/unfavorite it
  - Favorites are stored persistently in the image cache metadata
  - Favorites filter shows only favorited images plus original/current image cards when token is selected
- **Visual Favorites Indicators:** Added heart icon badges for favorited images
  - Red heart icon appears in top-left corner of favorited image thumbnails
  - Clean design without background circle, matching other UI favorites styling
  - Heart icon has dark shadow for visibility against light backgrounds

### Fixed
- **Cache Completion Notifications:** Fixed multiple issues with cache scanning completion
  - "Delay Cache" button now properly changes back to "Scan for Images" when scan completes
  - In-window notification now shows completion status instead of scanning status
  - Added detailed completion data showing files found, folders scanned, and scan duration
  - Fixed incremental scans not completing gracefully in the UI
- **Progress Bar Issues:** Fixed "Phase 5 of 6" progress bar anomaly for large directories
  - Removed phantom 6th step that was causing progress bar to get stuck
  - Added progress validation to ensure completion state is properly triggered
  - Added timeout protection (3 hours) for long-running scans to prevent indefinite hanging
- **Player Character Support:** Fixed window dimming issue when selecting player characters
  - Added proper error handling to hide search spinner overlay on token selection errors
  - Enhanced token data extraction to handle player character data structure
  - Added type checking for potentially undefined properties before calling string methods
  - Player characters now default to 'humanoid' creature type, use race/ancestry for subtype, class for background, and 'medium' size
- **Original Image Preservation:** Fixed original image storage when applying images from the window
  - Original token image is now saved before applying new image (only if original doesn't already exist)
  - Maintains consistency with drop-to-apply behavior
  - Ensures original image can always be restored

### Improved
- **Cache Management:** Enhanced cache scanning with better error handling and completion detection
  - Added completion state tracking with `justCompleted` and `completionData` fields
  - Improved UI state management to prevent race conditions between scanning and completion
  - Added safety mechanisms for long-running operations
- **Token Data Extraction:** Improved robustness of token data parsing
  - Added comprehensive type checking for all string operations
  - Better handling of different actor data structures (NPCs vs Player Characters)
  - More reliable search term generation for better image matching
- **Favorites Integration:** Seamlessly integrated favorites with existing tag system
  - Favorites use the existing metadata tag system for consistency
  - Favorites filter works like other category filters (not as a hack)
  - Original and current image cards always show when token is selected, regardless of filter

### Technical Details
- Updated `scripts/token-image-replacement.js` with comprehensive favorites functionality
- Enhanced `templates/window-token-replacement.hbs` with favorites filter button
- Updated `styles/window-token-replacement.css` with clean favorites styling
- Fixed case sensitivity issues in cache file lookups (files stored with lowercase keys)
- Improved error handling and debugging throughout the image replacement system


## [12.1.5] - Token Movement System Enhancements

### Fixed
- **Token Movement Locking:** Fixed critical issue where players could still move tokens even when movement was set to "locked" mode
- **HookManager Return Value Handling:** Modified HookManager to properly handle return values from `preUpdateToken` hooks, allowing movement restrictions to actually block token updates
- **Movement Restriction Enforcement:** Players now receive warning messages AND movement is properly blocked when in "no-movement" mode

### Technical Details
- Updated `scripts/manager-hooks.js` to capture and respect return values from `preUpdateToken` hook callbacks
- When any `preUpdateToken` callback returns `false`, the entire hook chain now returns `false` to block the action
- This ensures FoundryVTT properly respects movement restriction settings

### TODO
- **HookManager Priority System:** Consider implementing proper priority-based execution order for hook callbacks (currently hooks run in registration order, not priority order)
- **Comprehensive Hook Testing:** Test all hook types to ensure the return value handling doesn't break other functionality


## [12.1.4] - Token Image Replacement System Enhancements

### Added
- **Original Image Tracking:** Tokens now store their original image when first dropped, allowing users to revert to the initial image
- **Original Image Card:** Added "Original Image" card as the first result in the Token Image Replacement window with purple styling
- **Double-Middle-Click Support:** Double-middle-click on any token to instantly open the Token Image Replacement window with that token selected
- **Update Dropped Tokens Setting:** New world setting to control whether tokens are automatically updated when dropped on the canvas
- **Fuzzy Search Toggle:** New toggle for manual search box input - when enabled, searches for individual words independently
- **Threshold Display Enhancement:** Moved threshold percentage from slider to label for better readability (e.g., "Matching Threshold 32%")
- **Current Image Tag:** Added "CURRENT IMAGE" tag to clearly identify the currently selected token's image

### Fixed
- **Duplicate Object Key:** Removed duplicate "kobold" entry from monster-mapping.json that was causing JSON parsing errors
- **Selected Token Card Visibility:** Fixed issue where selected token card would disappear when relevance score was below threshold
- **Current Image Tag Display:** Fixed "CURRENT IMAGE" tag not appearing consistently for selected tokens
- **Scoring Algorithm:** Improved relevance scoring calculation for more accurate image matching (Brown Bear now scores 55%+ instead of 15%)
- **Results Blanking:** Fixed window results being cleared after applying an image to a token - now properly refreshes
- **Fuzzy Search Scope:** Corrected fuzzy search to only apply to manual search box input, not automatic token matching
- **Original Image Persistence:** Fixed original image data to be stored in token flags for persistence across sessions
- **Memory Leaks:** Fixed potential memory leaks with proper event listener cleanup and HookManager usage
- **TypeError in Token Context:** Fixed TypeError when metadata fields are not strings in `_calculateTokenContextBonus`

### Changed
- **Image Application Flow:** After applying an image, the window now closes for a cleaner user experience
- **Token Selection Detection:** Added global token selection hook to detect token changes system-wide
- **Scoring System:** Restored user-configurable weights for more accurate and customizable scoring
- **Debug Logging:** Removed excessive debug logging that was slowing down search performance
- **Window Refresh Logic:** Simplified window refresh to use the same code path as the toolbar button

### Technical Details
- Implemented `_storeOriginalImage()` and `_getOriginalImage()` methods using token flags for persistence
- Added `_addMiddleClickHandler()` with proper cleanup via `_removeMiddleClickHandler()`
- Enhanced `_sortResults()` to prioritize original images first, then current images
- Updated `_applyImageToToken()` to close window after successful image application
- Fixed `_getTagsForMatch()` to handle original images without metadata
- Improved `_calculateRelevanceScore()` with better maxPossibleScore calculation
- Added proper memory management with HookManager integration



## [12.1.3] - NEW Token Image Replacement System

### Added
- **Token Image Replacement System:** Complete token image replacement functionality with automatic matching and manual selection
- **Dual Use Case Support:** Separate logic for automatic replacement (best match) vs manual selection (all matches)
- **Token Image Replacement Window:** Dedicated UI window for GMs to manually select token images from available alternatives
- **Cache Management System:** Comprehensive image caching with incremental updates, pause/resume, and storage persistence
- **CoffeePub Toolbar Integration:** Added Token Image Replacement button to CoffeePub toolbar for easy access
- **Progress Tracking:** Real-time progress bars showing scan status with detailed folder and file information
- **Smart Cache Updates:** Incremental update system that only rescans when folder structure changes
- **Confirmation Dialogs:** User-friendly dialogs for scan type selection (Incremental Update vs Full Rescan vs Cancel)
- **Token Selection Detection:** Automatic detection of currently selected tokens when window opens
- **Multiple Match Display:** Shows up to 11 alternative images plus current image (12 total) in thumbnail grid
- **Current Image Highlighting:** Green checkmark and border to identify the currently assigned token image

### Fixed
- **Cache Age Calculation:** Fixed incorrect cache age display (was showing 488,232 hours instead of reasonable values)
- **Cache Persistence:** Resolved cache being cleared on every client reload
- **SUPPORTED_FORMATS Context:** Fixed undefined errors in folder fingerprinting and file processing
- **Search Threshold:** Lowered matching threshold from 0.5 to 0.3 for better match detection
- **Multiple Match Display:** Fixed window showing only 1 match instead of all available alternatives
- **Infinite Render Loop:** Prevented Foundry crashes caused by render loop issues
- **Automatic Scanning Bypass:** Fixed scans starting even when auto-update setting was disabled
- **FilePicker Scope:** Corrected FilePicker.browse calls to use 'data' instead of 'public' scope
- **Incremental Cache Processing:** Ensured files are added to cache immediately during scanning
- **Token Selection Hook:** Fixed token selection not working when window opens with token selected

### Changed
- **Cache Management:** Replaced confusing cache settings with single "Automatically update image cache" checkbox
- **Dialog Buttons:** Updated scan confirmation dialog with proper button labels (Incremental Update, Full Rescan, Cancel)
- **Search Algorithm:** Enhanced matching algorithm to find multiple alternatives for manual selection
- **Progress Display:** Improved progress bar text with detailed folder paths and file counts
- **Cache Storage:** Implemented incremental saves during long scans to prevent data loss
- **Error Handling:** Enhanced error handling with detailed logging and user notifications

### Technical Details
- Implemented `TokenImageReplacement` class with comprehensive cache management
- Added `TokenImageReplacementWindow` for manual token image selection
- Created `_doIncrementalUpdate()` method for efficient cache updates
- Enhanced `_findMatches()` method to display all alternatives for manual selection
- Fixed `_saveCacheToStorage()` to handle incremental saves properly
- Updated `_generateFolderFingerprint()` to use correct FilePicker scope
- Implemented proper hook registration/unregistration for token selection
- Added comprehensive debugging and logging throughout the system

## [12.1.2] - NEW Toolbar Manager

### Added
- **Dynamic Toolbar System:** Implemented comprehensive toolbar management system with dynamic tool registration and zone-based organization
- **Zone System:** Added 6 predefined zones (general, rolls, communication, utilities, leadertools, gmtools) for logical tool grouping and visual organization
- **Three-Tier Visibility System:** Implemented GM/Leader/Player visibility controls with proper permission checking
- **Token Toolbar Integration:** Added Request Roll tool to Foundry's default token control toolbar alongside existing tools
- **Toolbar Settings:** Added client-side settings for toolbar dividers and labels with proper scope management
- **Leader System Integration:** Integrated party leader detection with toolbar visibility and vote system
- **CSS Zone Styling:** Added `toolbar-zones.css` with zone-specific background colors and visual dividers
- **Toolbar Refresh Logic:** Implemented automatic toolbar refresh when party leader changes or settings update
- **External Module API:** Exposed comprehensive toolbar API for external modules to register custom tools
- **Utility Function Exposure:** Added 11 utility functions to API (getActorId, getTokenImage, getPortraitImage, getTokenId, trimString, toSentenceCase, objectToString, stringToObject, convertSecondsToRounds, convertSecondsToString, clamp)
- **OpenAI API Separation:** Refactored OpenAI functionality into dedicated `api-openai.js` with improved error handling and validation
- **Model Support Update:** Added support for latest OpenAI models (GPT-5, GPT-4o, GPT-4o-mini, O1 models) with updated pricing calculations
- **Session Memory System:** Implemented persistent conversation memory with session-based context management for AI interactions
- **Persistent Storage:** Added localStorage-based memory persistence that survives page refreshes and FoundryVTT restarts
- **OpenAI Projects Support:** Added optional OpenAI Projects integration for better cost tracking and team management
- **API Documentation:** Created complete API documentation with examples for all exposed functions

### Changed
- **Consolidated Architecture:** Merged separate `BlacksmithToolbarManager` class into `manager-toolbar.js` for simplified management
- **Tool Registration:** Migrated from hardcoded tool arrays to dynamic `Map`-based registration system
- **Vote System Integration:** Updated vote manager to use consistent leader detection logic across all systems
- **Leader Detection:** Improved party leader detection with timing safeguards and setting availability checks
- **Toolbar Hooks:** Enhanced `getSceneControlButtons` hook to support both Blacksmith and Foundry toolbars

### Fixed
- **Visibility Logic Bug:** Fixed `else if` structure in token toolbar visibility checking to prevent overrides
- **Leader Timing Issues:** Resolved party leader detection timing problems during initial load
- **Vote Permissions:** Fixed vote system to allow leaders to start regular votes (not leader votes)
- **Toolbar Refresh:** Added delayed refresh mechanism to ensure settings are loaded before toolbar rendering
- **Duplicate Prevention:** Added checks to prevent duplicate tools in token toolbar
- **Setting Registration:** Fixed toolbar settings registration timing and scope issues

### Technical Details
- **Tool Data Structure:** Enhanced tool objects with `zone`, `order`, `gmOnly`, `leaderOnly` properties
- **Hook Management:** Added `settingChange` hook for automatic toolbar refresh on leader changes
- **Error Handling:** Improved error handling for missing settings and invalid tool registrations
- **Performance:** Optimized tool lookup and rendering with efficient Map-based storage
- **Documentation:** Updated `architecture-toolbarmanager.md` with complete implementation details


## [12.1.1] - BREAKING PATCH

### Fixed
- **Missing Files:** forgot to add some files to the release.

## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Module-Specific Release Naming:** Updated release workflow to create `coffee-pub-blacksmith.zip` instead of generic `module.zip` for better module identification and management.
- **Unified Header System:** Created `partial-unified-header.hbs` template for consistent header styling across skill check dialog and roll window
- **Actor Portrait Support:** Added actor portrait display in roll window header next to actor name
- **Real-Time Formula Updates:** Added live formula updates when situational bonus or custom modifier changes, with blue text highlighting modifications
- **Roll Mode Visibility System:** Implemented comprehensive roll mode handling (Public, Private GM, Blind GM, Self Roll) with proper visibility controls in chat cards
- **Ownership-Based Controls:** Added ownership checks for roll buttons, disabling non-owner interactions with visual feedback
- **Chat Scrolling:** Added automatic chat scrolling to bottom when roll results are updated
- **Roll Request Sound:** Added sound notification when roll requests are posted to chat
- **Schema-Driven Roll Architecture:** Designed complete D&D 5e roll rules system with:
  - `dnd5e-roll-rules.js` - Pure JavaScript export of D&D 5e mechanics schema
  - `rules-service.js` - Singleton service for rule management, feature detection, and caching
  - `resolve-check-pipeline.js` - Ability check resolution with JOAT, Remarkable Athlete, and Reliable Talent
  - `resolve-save-pipeline.js` - Saving throw resolution with exhaustion, conditions, and cover
  - `resolve-attack-pipeline.js` - Attack roll and damage resolution with critical hits and fumbles
- **Comprehensive Documentation:** Updated `ARCHITECTURE-ROLLS.md` with complete schema-driven system design and implementation details

### Changed
- **Download URL Pattern:** Changed download URL from version-specific (`v12.1.0/module.zip`) to latest release pattern (`latest/coffee-pub-blacksmith.zip`), eliminating the need for manual URL updates before each release.
- **Release Workflow:** Updated GitHub Actions workflow to use module-specific zip naming and file references.
- **Roll Window Integration:** Updated roll window to use unified header template and pass actor portrait data
- **Formula Display Logic:** Enhanced formula display to show ability-specific modifiers instead of hardcoded "dex"
- **Custom Modifier Processing:** Improved custom modifier parsing to handle multiple values and prevent double plus signs
- **Roll Title Handling:** Fixed roll title passing from skill check dialog to roll window and chat cards
- **Template Structure:** Updated skill check and roll window templates to use consistent header layout and styling
- **Roll Calculation Accuracy:** Enhanced roll calculations to ensure 100% accuracy between displayed formula and actual roll execution

### Fixed
- **Manual Release Process:** Eliminated the requirement to manually update the download URL in `module.json` before each release. The `latest` tag now automatically redirects to the most recent release.
- **Hardcoded Ability References:** Fixed formula display to use dynamic ability keys instead of hardcoded "dex"
- **Custom Modifier Parsing:** Fixed double plus signs in custom modifier tooltips and formula display
- **Proficiency Calculation:** Fixed ability rolls to properly include proficiency bonus when character is proficient
- **Roll Title Consistency:** Fixed roll title display across skill check dialog, roll window, and chat cards
- **Chat Card Ownership:** Fixed ownership-based button functionality in chat cards
- **Template Rendering:** Fixed partial template loading errors and missing data passing
- **Math Accuracy:** Fixed roll calculation discrepancies between displayed formula and actual roll execution
- **Group Roll Logic:** Fixed group roll evaluation to properly honor the Group DC toggle setting
- **Roll Mode Processing:** Fixed roll mode selection to be properly passed through to roll execution

### Technical Details
- Implemented component-based roll evaluation system for accurate D&D 5e rule compliance
- Added feature detection from actor items and active effects for proficiency resolution
- Created caching system for rules and feature indexes to improve performance
- Enhanced error handling and validation throughout the roll system
- Improved socket communication for roll mode visibility and ownership controls
- Added comprehensive logging and debugging capabilities for roll system troubleshooting

## [12.0.23] - Suppress Combat Deployment from Players

### Fixed
- **Player Deployment Panel Access:** Fixed issue where the deployment panel (CODEX) was visible to players in journal entries. The entire deployment interface is now restricted to GMs only.
- **Deployment Panel Security:** Wrapped the complete deployment section in GM permission checks, preventing players from seeing:
  - DEPLOY section with deployment pattern and visibility settings
  - "Nothing to Deploy" messages
  - Deployment action buttons and monster/NPC icons
  - Deployment controls and settings
- **Canvas Information Visibility:** Maintained visibility of canvas information (Party CR, Monster CR, encounter difficulty) for all users while restricting deployment functionality to GMs only.

### Changed
- **Template Structure:** Restructured `encounter-toolbar.hbs` template to wrap the entire deployment interface in `{{#if isGM}}` conditional blocks.
- **Permission Enforcement:** Consolidated individual GM permission checks into comprehensive section-level protection for better security and maintainability.

## [12.0.22] - Quick Fix

### Fixed
- **Manifest:** Corrected the manifest download.

## [12.0.21] - Token Grid Positioning Fix

### Fixed
- **Token Grid Positioning:** Fixed token deployment to properly snap to grid square positions instead of grid intersections. All deployment patterns (line, circle, scatter, grid, sequential) now correctly place tokens within grid squares using the proper FoundryVTT coordinate system.

### Changed
- **Skill Roll Routing (DnD5e 4.4.4):** Updated skill check execution to use the DnD5e Actions API first (`game.dnd5e.actions.rollSkill`), with safe fallbacks to `rollSkillV2` and `doRollSkill`, and legacy `rollSkill` only as a last resort. This ensures v2 paths are used on 4.4.4 and prepares for removal of deprecated hooks in 5.0.

### Compatibility
- **Deprecation Warning Mitigation:** On DnD5e 4.4.4, skill checks now route through the v2 API to avoid triggering the deprecated `dnd5e.rollSkill` hook warning.

## [12.0.20] - Encounter Toolbar and Token Deployment

### NOTE: Bumped the version to 12 to align with the Foundry version.

### Added
- **Encounter Folder Support:** Added support for placing deployed actors in a configurable folder. When the `encounterFolder` setting is specified, actors are automatically placed in that folder. If the folder doesn't exist, it's created automatically. If the setting is empty, actors are placed in the root directory.
- **Enhanced Token Deployment Patterns:** Implemented multiple deployment patterns for encounter tokens:
  - **Circle Formation:** Tokens are placed in a circle around the deployment point
  - **Scatter Positioning:** Tokens are scattered in a spiral pattern to prevent overlaps with random variation
  - **Grid Positioning:** Tokens are placed in a proper square grid formation using scene grid size
  - **Sequential Positioning:** Tokens are placed one at a time with user guidance via tooltip
  - **Line Formation:** Default fallback pattern for backward compatibility
- **Unlinked Token Creation:** Deployed tokens are now created as unlinked copies instead of linked tokens, providing better flexibility for individual token management.
- **Lock Rotation Support:** Deployed tokens now honor the GM's default token rotation settings from Foundry core settings.
- **CR Badge System:** Added Party CR and Monster CR badges to the encounter toolbar:
  - **Party CR:** Calculates weighted party level using tiered formula (levels 1-4: 0.25x, 5-10: 0.5x, 11-16: 0.75x, 17-20: 1x)
  - **Monster CR:** Shows total CR of monsters currently deployed on the canvas
  - **Difficulty Badge:** Displays encounter difficulty with proper color coding
- **Encounter Template Import:** Added "Encounter" option to the JSON import dropdown, allowing users to copy encounter templates from `prompt-encounter.txt` for easy encounter creation.
- **Content Scanning:** Enhanced encounter detection to scan journal content for encounter data in JSON, markdown, and plain text formats when structured data attributes are not found.
- **Foundry UUID Support:** Updated content scanning to properly parse Foundry's @UUID[...]{...} format for monster references in journal entries.
- **Monster Name Resolution:** Added support for monster names in templates (e.g., "Death Knight", "Helmed Horror") with automatic lookup in available compendiums during deployment.
- **Pattern-Based Detection:** Completely redesigned encounter detection to use robust pattern matching instead of section-based parsing. Now detects @UUID patterns anywhere on the page, validates Actor types, and supports quantity indicators (x3, (3), etc.).
- **Journal Type Identification:** Maintains support for `data-journal-type="encounter"` as a quick identifier while ignoring deprecated `data-encounter-monsters` and `data-encounter-difficulty` attributes in favor of content scanning.
- **Monster Portraits:** Added monster portraits to the encounter toolbar instead of generic dragon icons, showing actual monster images with proper CR values.
- **Enhanced Retry Mechanism:** Improved content scanning reliability with multiple retry attempts (500ms, 1000ms, 2000ms) to handle timing issues when journal content loads after toolbar initialization.
- **Real-Time CR Updates:** Added real-time CR calculation updates when tokens are created, updated, or deleted on the canvas. CR badges now update automatically without requiring journal refresh.
- **Individual Token Deployment:** Added ability to deploy individual monsters and NPCs by clicking on their icons in the toolbar. Supports both single deployment and CTRL-click for multiple placement.
- **Multi-Placement Support:** Implemented CTRL key functionality for placing multiple instances of single tokens. Hold CTRL while clicking to place multiple copies, release CTRL to finish.
- **Invisible Token Deployment:** Added ALT key functionality to deploy tokens as invisible. Hold ALT while deploying to create hidden tokens for surprise encounters.
- **Token Visibility Toggle:** Added "Reveal Monsters" button to make hidden hostile NPC tokens visible on the canvas.
- **NPC and Monster Separation:** Separated NPCs and monsters into distinct sections in the toolbar display, with proper classification based on compendium source and disposition.
- **Deployment Cancellation:** Added right-click to cancel deployment during placement, with proper cleanup of event handlers and tooltips.
- **Partial Deployment Handling:** Added dialog prompt when combat creation is cancelled mid-deployment, allowing users to choose whether to create combat with partially deployed tokens.

### Fixed
- **Token Display Name Settings:** Fixed deployed tokens to honor the GM's core token display settings instead of prototype token settings. Tokens now properly use the GM's default name display mode (e.g., "anyone on hover" vs "never").
- **Actor Prototype Token Updates:** Fixed actor prototype tokens to be updated with GM's default settings when created from compendiums, ensuring subsequent drags from the actor tab also honor GM defaults.
- **Scatter Pattern Overlaps:** Fixed scatter deployment pattern to prevent token overlaps by using a spiral-based distribution with adequate spacing.
- **Grid Formation Issues:** Fixed grid deployment pattern to create proper square formations instead of single lines, using actual scene grid size for positioning.
- **Memory Leaks:** Fixed memory leaks in event handlers and socket communications to improve performance and prevent memory accumulation over time.
- **Debug Logging:** Optimized debug logging to reduce console noise and improve performance by using proper logging levels and conditional debugging.
- **Combat Token Addition:** Fixed issue where deployed tokens were not being added to combat encounters. Now properly tracks deployed tokens and adds them to existing or new combat encounters.
- **Double Deployment Issue:** Fixed issue where clicking "create-combat" button would deploy tokens twice. Consolidated deployment logic into single function used by both buttons.
- **Spell DC Deprecation Warning:** Updated CR calculation to use new DnD5e 4.3+ spell DC property path (`attributes.spell.dc`) with backward compatibility.
- **Encounter Template Placeholders:** Fixed encounter template copying to replace placeholders with settings values (campaign name, party details, etc.) like narratives do.
- **Encounter Settings:** Added new encounter default settings for folder and card image configuration.
- **Compendium Search Expansion:** Updated compendium search functions to support up to 8 monster and item compendiums (increased from 5).
- **Difficulty Badge Alignment:** Fixed "MEDIUM" difficulty badge to be left-aligned with the title instead of centered.
- **Party CR and Monster CR Display:** Ensured Party CR and Monster CR are always calculated and displayed, even when no explicit encounter data is found in the journal.
- **Permission Errors:** Fixed permission errors when players try to use features that require token updates (deployment, combat creation, token conversion, movement, token renaming). Added proper GM-only permission checks.
- **Multiple Journal Windows:** Fixed issue where having multiple journal windows open would cause multiple deployments and combat creations when clicking buttons. Event listeners are now properly scoped to individual toolbars.
- **Broken Monster Links:** Added logic to skip broken monster links (e.g., `class="content-link broken"`) during encounter detection.
- **CR Values Display:** Fixed CR values to display correct values instead of all 0s by implementing robust CR extraction from multiple actor system paths.
- **CR Badge Icon Removal:** Fixed issue where CR badge icons were being removed when updating CR values. Now preserves icons during updates.
- **ESC Key Cancellation:** Fixed ESC key functionality to properly cancel deployment without causing errors. Replaced with right-click cancellation for better user experience.
- **Sequential Deployment Cancellation:** Fixed error when cancelling sequential deployment that would cause "Cannot read properties of null" error. Added proper null checks for cancelled deployments.
- **Token Linking Honor:** Fixed hardcoded `actorLink = false` to honor the original actor's prototype token linked setting during deployment.
- **NPC Deployment Issues:** Fixed NPCs not being deployed and appearing in monster sections. Added proper NPC/monster classification and separate deployment handling.
- **Index Mismatch Errors:** Fixed issue where clicking on one monster icon would deploy a different monster due to DOM index mismatches. Now uses UUID-based identification.
- **UUID Validation:** Fixed UUID validation to properly handle world actors (non-compendium actors) during deployment.

### Changed
- **Deployment Pattern Setting:** Added `encounterToolbarDeploymentPattern` setting with options for circle, line, scatter, grid, and sequential positioning.
- **Deployment Hidden Setting:** Added `encounterToolbarDeploymentHidden` setting to control whether deployed tokens are hidden by default.
- **Real-Time Update Setting:** Added `enableEncounterToolbarRealTimeUpdates` setting to control whether CR badges update automatically when tokens change on the canvas.
- **Improved Token Positioning:** All deployment patterns now properly snap to the scene grid and use appropriate spacing based on grid size.
- **Enhanced Error Handling:** Added comprehensive error handling for folder creation and actor placement operations.
- **Toolbar Layout:** Redesigned encounter toolbar with title above buttons and badges, improved badge positioning and styling. Moved difficulty badge to canvas section for better organization.
- **Combat Creation Flow:** Updated "create-combat" button to deploy tokens first, then create combat with those tokens, ensuring proper token tracking.
- **Event Listener Scoping:** Updated event listeners to be properly scoped to individual toolbar containers, preventing cross-contamination between multiple journal windows.
- **Permission-Based UI:** Updated toolbar template to only show deployment and combat buttons for GMs, while still displaying monster icons and CR information to all users.
- **Deployment Controls:** Updated deployment controls to support CTRL for multiple placement and ALT for invisible deployment. Tooltips now show key combinations for user guidance.
- **Cancellation Method:** Changed deployment cancellation from ESC key to right-click to prevent interference with other open windows and dialogs.

### Technical Details
- Implemented proper merging of GM's `defaultToken` settings with actor prototype tokens using `foundry.utils.mergeObject`
- Added grid-aware positioning using `canvas.scene.grid.size` for accurate token placement
- Enhanced spiral-based scatter algorithm with random variation for natural-looking distributions
- Improved folder management with automatic creation and error recovery
- Added weighted party CR calculation using tiered level brackets for realistic encounter scaling
- Implemented canvas-based monster CR calculation for real-time encounter difficulty assessment
- Added permission checks to all token update operations: `_deployMonsters()`, `_createCombatWithTokens()`, `_createCombat()`, `_convertTokenToLoot()`, `_onCreateToken()`, `processNextFollower()`, `moveAllTokensOneStep()`
- Implemented proper event listener scoping using `toolbar.find()` instead of `$(document).find()` to prevent multiple journal window conflicts
- Added robust CR extraction from multiple actor system paths: `actor.system.details.cr.value`, `actor.system.details.cr`, `actor.system.cr`
- Enhanced content scanning with multiple fallback selectors and document-wide search for better reliability
- Implemented real-time CR updates using FoundryVTT hooks: `createToken`, `updateToken`, `deleteToken`, `settingChange`
- Added debouncing mechanism for CR updates to prevent performance issues during rapid token changes
- Implemented NPC/monster classification using heuristic-based logic (compendium source and disposition)
- Enhanced token deployment with key state detection (CTRL, ALT) and proper event handling for multiple placement modes
- Added UUID-based token identification to prevent DOM index mismatches during individual deployment
- Implemented proper token linking honor by preserving original actor's `prototypeToken.actorLink` setting

## [1.0.19] - Item Import and UI Improvements

### Added
- **Item Image Terms Array:** Added `itemImageTerms` array to item JSON for explicit control over image matching during imports, allowing precise synonym specification for image selection.
- **API Exposure:** Exposed `arrCOMPENDIUMCHOICES` in the Blacksmith API for other modules to access available compendium choices.

### Fixed
- **Item Import Logic:** Fixed image guessing logic to properly prioritize exact and partial synonym matches in item names first, then in descriptions, followed by loot type, filename, and fallback options.
- **Compendium Links:** Fixed compendium links during import to use UUIDs instead of simple references, ensuring links remain valid after import.
- **UI Underline Effects:** Removed underline effects and associated code from UI elements, relying on mouse pointer changes as sufficient visual cues.

### Changed
- **Image Matching Priority:** Improved item image matching to check `itemImageTerms` array first, then follow a clear hierarchy: item name exact/partial matches → description matches → loot type → filename → fallback options.

## [1.0.18] - Multiple Token Bug Fix

### Fixed
- **Token Name Display:** Skill check dialog and chat cards now use the token's name (e.g., "Sinolax (Troll)") instead of the actor's name (e.g., "Troll") for all contestant and result displays, making it easier to distinguish between multiple tokens of the same actor.
- **Multiple Token Roll Support:** Chat card roll buttons now correctly support rolling for multiple tokens of the same actor by matching both tokenId and actorId, ensuring each token instance is handled independently.
- **Improved User Clarity:** All skill check UI and chat card displays now reflect the actual token name, improving clarity for GMs and players when multiple similar tokens are present.
- **Token ID System:** Completely refactored skill check system to use token IDs instead of actor IDs for unique identification
- **Chat Card Roll Buttons:** Updated chat card roll buttons to work with individual token instances
- **Permission Handling:** Fixed permission checks to allow GMs to roll for any token while maintaining proper ownership checks for players
- **Actor Lookup:** Improved actor lookup logic with better error handling and debugging for token-to-actor resolution

### Changed
- **Data Structure:** Updated skill check message data to store both token ID (for unique identification) and actor ID (for roll operations)
- **Template Attributes:** Changed data attributes from `data-actor-id` to `data-token-id` for clarity
- **Socket Communication:** Updated socket handlers to work with token IDs for proper multi-token support

### Technical Details
- Changed `getData()` method to use `t.id` (token ID) instead of `t.actor.id` (actor ID)
- Updated all JavaScript methods to handle token ID to actor ID resolution
- Fixed chat card template to store both token and actor IDs
- Improved error handling for cases where tokens or actors might not be found

## [1.0.17] - Experience Points

### Added
- **XP Distribution Chat Card:** Introduced a new, visually distinct chat card to display XP distribution results, separate from the main XP window.
- **Dedicated CSS for XP Card:** Created a new stylesheet (`cards-xp.css`) and namespaced all classes to ensure consistent styling and prevent conflicts.

### Changed
- **XP Chat Card Layout:** Completely redesigned the chat card for improved clarity and aesthetics:
  - The **XP Summary** section now uses a clean, two-column layout.
  - The **Player Results** section has been updated to feature the character portrait, name, and new total XP on the left, with the XP gained aligned to the right.
  - The **Monster Resolutions** section now aligns all monster names and icons for a tidier list, with XP values aligned to the right.
- **Improved Data Formatting:** XP multipliers are now consistently formatted to two decimal places (e.g., 1.00) on all displays.

### Removed
- **Removed CR from Chat Card:** The monster Challenge Rating is no longer displayed on the XP chat card to reduce clutter.
- **Removed Legend from Chat Card:** The resolution types legend was removed from the chat card for a more streamlined look.

## [1.0.16] - Compendiums

### Added
- **Enhanced Compendium Mapping System**
  - Added support for up to 5 monster lookup compendiums (replacing the old primary/secondary system)
  - Added support for up to 5 item lookup compendiums
  - Added "Search World Items First" setting to prioritize world items over compendium items
  - Added automatic item linking in narrative JSON imports (similar to monster linking)
  - Added fuzzy matching for item names with exact match priority

### Changed
- **Improved Compendium Labels**
  - Updated compendium dropdown labels to show source and name (e.g., "Dungeons & Dragons 5th Edition: Actors")
  - Enhanced clarity when multiple compendiums share the same name
- **Enhanced Item Linking**
  - Items in rewards and other narrative fields are now automatically linked to compendium entries
  - Item linking follows the same priority system as monster linking (world first, then compendiums 1-5)
  - Improved item name matching with exact match priority over partial matches

### Fixed
- Removed legacy monster compendium primary/secondary settings
- Cleaned up unlinked item/monster display by removing "(Link Manually)" suffix
- Fixed item name matching to handle variations like "Bedroll (used for sleeping)" matching "Bedroll"

### Removed
- Removed old `monsterCompendiumPrimary` and `monsterCompendiumSecondary` settings
- Removed legacy compendium lookup code

## [1.0.15] - Optimizations

### Fixed
- Group roll summary (success/failure) now displays correctly after all players or the GM have rolled, regardless of who initiates the roll.
- Fixed issue where GM-initiated rolls did not update the chat card for all users.
- Prevented ReferenceError when requesting rolls (no roll performed yet).
- Fixed error when roll is not defined in the roll handler.
- Improved error handling and guard clauses to prevent undefined roll errors in all roll scenarios.

### Changed
- Updated all skill roll logic to use `rollSkillV2` if available, with fallback to `rollSkill` for backward compatibility with older DnD5e versions.
- Added robust compatibility checks for DnD5e 4.1+ and future 4.5+ removal of deprecated methods.
- Refactored socket and chat update logic for unified handling of both player and GM rolls.
- Improved code clarity and maintainability in skill check dialog and group roll logic.

### Compatibility
- Fully compatible with DnD5e 4.1+ and future-proofed for 4.5+ removal of deprecated APIs.
- No longer triggers deprecation warnings for skill rolls.

## [1.0.14] - 2025-04-28 - Excluded Users and Character Leadership

### Added
- Implemented character-based leadership system
- Added character name display in leader selection
- Updated movement system to follow character tokens
- Added player name display alongside character names

### Fixed
- Fixed excluded users appearing in leader selection dialog
- Fixed excluded users appearing in character vote options when using "Current Players" source
- Improved consistency of user exclusion across all voting and leader selection interfaces

### Changed
- Refactored skill check dialog and skill selection logic for improved reliability and maintainability
- Updated skill check integration to support direct result passing and input field updates
- Improved UI hiding logic for skill check and movement panels to reduce clutter when not in use
- Refactored and improved code for token following and conga line movement, ensuring smoother and more consistent pathing

## [1.0.13] - 2025-04-22 - Movement AND CLEANUP

### Added
- **Enhanced Movement System**
  - Added proper path management for conga line movement
  - Added token spacing configuration
  - Added status tracking for tokens (Normal, Blocked, Too Far)
  - Added visual indicators for token status in marching order
  - Added automatic exclusion of blocked or too-far tokens from movement

### Changed
- **Movement Improvements**
  - Improved path following behavior for tokens
  - Enhanced marching order calculation
  - Optimized path trimming logic
  - Better handling of token spacing in formation

### Fixed
- Fixed tokens stacking on top of each other during movement
- Fixed marching order recalculation issues
- Fixed path following to maintain proper spacing
- Fixed tokens skipping path points during movement
- Fixed blocked and too-far tokens attempting to join formation
- Fixed conga line movement bugs causing tokens to stack or lose formation
- Fixed follow mode issues where tokens would not properly follow the leader or would desync
- Fixed skill check dialog not updating input fields after roll
- Fixed UI elements not hiding correctly when toggled or when not relevant to the current mode

## [1.0.12] - 2025-03-25 - Rolls and Movement Controls

### Added
- **Skill Check System**
  - New skill check dialog for quick party-wide rolls
  - Support for contested rolls between groups
  - Customizable DC display and success/failure indicators
  - Quick roll context menu for common skill checks
  - Detailed roll results with formula display
  - Group success tracking for multiple participants
  - Skill descriptions and rule references

- **Movement Controls**
  - New movement configuration dialog
  - Multiple movement modes:
    - Normal movement
    - No movement
    - Combat movement
    - Follow movement
    - Conga line movement
  - Visual indicators for current movement mode
  - GM-only movement mode control
  - Persistent movement settings

- **Chat Card Improvements**
  - Enhanced skill check card layout
  - Better visual hierarchy for roll results
  - Improved success/failure indicators
  - Detailed roll information tooltips
  - Group vs group contest visualization
  - Stalemate detection and display
  - Party-wide roll success tracking

- **UI Enhancements**
  - New movement control icon in menubar
  - Quick access to skill check dialog
  - Improved chat card spacing and margins
  - Better visual feedback for roll results
  - Enhanced tooltips and information display
  - Streamlined interface for GM controls

### Changed
- Updated menubar layout to accommodate new features
- Improved error handling for settings access
- Enhanced leader selection interface
- Better synchronization of movement states
- Optimized performance for multiple simultaneous rolls

### Fixed
- Settings access error handling
- Leader selection synchronization
- Movement state persistence
- Chat card rendering issues
- Roll result calculation accuracy

## [1.0.11] - 2025-03-25 - GM Tools added

### Added
- CSS Editor for GMs to customize Foundry's appearance
  - Accessible via toolbar button
  - Live preview of CSS changes
  - Dark/Light mode toggle for editor
  - Smart indentation support
  - Copy, clear, and refresh buttons
  - Quick access to World Config and Settings
  - Smooth transition effects option
  - Changes sync to all connected clients
  - Dark themed window with light/dark editor modes
  - Proper handling of NPC type selection in Assistant panel
- Added refresh browser button to GM toolbar for quick page reloads
- Added visual character selection for skill check rolls
  - Card-based interface showing character portraits and details
  - Shows character level, class, and current HP
  - Visual selection state with hover effects
  - Only shows characters present on the canvas
  - Matches the visual style of other character cards in the system

### Fixed
- Fixed NPC type selection in Assistant panel to properly identify friendly NPCs
- Fixed CSS Editor window styling and content overflow issues
- Fixed minimum width handling in CSS Editor window
- Fixed dice roll button placement in global skill check rolls section
- Fixed drop zone styling and text in Assistant panel
- Fixed skill check roll dialog to use proper character selection UI

### Changed
- Moved dice roll functionality from Assistant criteria to global skill check rolls
- Improved drop zone UI with clearer instructions and visual feedback
- Enhanced skill check character selection with visual card-based interface
- Streamlined character selection process for skill checks

## [1.0.10] - 2025-03-25 - AI Tools

### Added
- Added character guidance into the AI tools
- Added Skillcheck lookups for monsters, items etc.  based on the selected character

### Fixed
- Fixed weapon display in character panel to properly show equipped weapons
- Simplified weapon display layout for better readability
- Fixed weapon data access in template to correctly show weapon properties
- Restored AI prompt functionality that was accidentally broken in previous update

### Changed
- Streamlined weapon display to show name and info next to image
- Simplified text colors to use default panel text colors
- Improved weapon information layout for better clarity

## [1.0.9] - Combat Tracker Enhancements

### Added
- Added visual feedback animation when dropping combatants in the initiative order
- Added improved drag and drop functionality in combat tracker
- Added visual indicators for drop zones between combatants
- Added "Roll Remaining" button to roll initiative for combatants without initiative
- Added option to automatically set first combatant when all initiatives are rolled
- Added automatic initiative rolling options:
  - Auto-roll for NPCs/monsters when added to combat
  - Auto-roll for player characters (configurable per user)
  - Auto-roll for remaining NPCs at round start

### Changed
- Enhanced cursor feedback during drag operations
- Improved spacing and visual feedback during drag and drop operations
- Updated drop target styling for better visibility
- Refactored combat tracker code for better maintainability and performance
- Enhanced initiative handling with more configuration options
- Improved mid-combat combatant addition with multiple initiative modes:
  - Auto-roll initiative
  - Set to act next
  - Add to end of round

### Fixed
- Fixed cursor styles not updating during drag operations
- Fixed initiative handling when adding new combatants mid-combat

## [1.0.8] - Encounter Toolbar

### Added
- Added Encounter Toolbar for journal entries with encounter metadata
- Added monster deployment functionality with multiple formation patterns (circle, line, random)
- Added combat creation and initiative rolling directly from journal entries
- Added encounter difficulty visualization in toolbar
- Added settings to control encounter toolbar behavior:
  - Enable/disable encounter toolbar
  - Auto-create combat after monster deployment
  - Configure monster deployment pattern

### Changed
- Improved metadata handling in journal entries
- Updated journal rendering hook to detect encounter journal entries

## [1.0.7] - Combat Timer Improvements

### Added
- Added token targeting detection to automatically start the combat timer
- Added more robust round change detection using a custom tracking variable
- Added detailed logging for better debugging of timer behavior
- Added drag and drop functionality for initiative in the combat tracker
- Added health bars to combat tracker tokens
- Added option to show portraits in combat tracker
- Added "Set as current combatant" button to combat tracker

### Changed
- Improved the interaction between Combat Timer and Planning Timer
  - Replaced direct API access with Hook-based communication
  - Simplified code structure for better maintainability
- Enhanced round change detection to prevent timer issues during round transitions
- Updated token movement detection for better compatibility with Foundry VTT v12

### Fixed
- Fixed issue with combat timer continuing to run during round changes
- Fixed multiple timer activations when round changes occur
- Fixed planning timer cleanup when transitioning between rounds
- Fixed round timer to pause when the session is not running

## [1.0.6] - Chat Message Improvements

### Added
- Added new settings for chat message control
  - Toggle for GM-only timer notifications
  - Configurable message visibility options
- Enhanced chat message handling for timers and notifications

### Changed
- Updated chat message system to respect GM-only settings
- Improved message handling for better user experience
- Fixed JSON formatting issues in chat responses

## [1.0.5] - Network Monitoring and Settings

### Added
- Added real-time latency monitoring system
  - Color-coded latency display next to player names
  - Configurable latency check frequency (5s to 5min)
  - Enable/disable latency display option
  - Automatic local GM detection for accurate readings
- Added new settings for latency monitoring
  - Toggle for enabling/disabling latency display
  - Slider for adjusting check frequency

### Changed
- Updated settings organization for better clarity
- Improved latency threshold values for more accurate status indication
- Enhanced socket message handling for better network communication

### Removed
- Removed the redundant dashboard now that we have the Squire module 

## [1.0.4] - Vote System and UI Improvements

### Added
- Added clickable vote tool area in menubar
- Added improved styling for vote section to match other UI elements

### Changed
- Updated vote tool UI to be more consistent with other elements
- Improved vote label alignment and styling
- Enhanced hover effects for vote controls

## [1.0.3] - UI Improvements and Bug Fixes

### Added
- Added quality of life aesthetic improvements
- Enhanced UI elements for better user experience

### Changed
- Updated module version to 1.0.3
- Improved overall visual consistency

## [1.0.2] - Cleanup and Refactor

### Added
- Added a new class for generating MVP descriptions based on combat stats.
- Added a new class for generating combat history.
- Added session timer date tracking to persist timer state between sessions
- Added ability to set current timer duration as the new default
- Added seconds display to session timer
- Added proper permission checks for vote initiation by party leader
- Added visual feedback for completed votes with checkmark icon

### Changed
- Moved MVPTemplates from mvp-templates.js into assets.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into stats-combat.js
- Consolidated combat-related functionality into fewer files for better maintainability
- Modified session timer to use the default time when loading on a new day
- Updated timer dialog to include option for saving current duration as default
- Updated vote system to properly handle leader permissions
- Improved vote UI with better status indicators and button states

### Removed
- Removed unused debug.js file
- Removed mvp-templates.js after moving its contents
- Removed mvp-description-generator.js after moving its contents

## [1.0.1] - It's All About Timers

### Added
- Automated release workflow using GitHub Actions
  - Automatic ZIP file creation for releases
  - Automated release creation on new version tags
  - Release notes generation

### Fixed
- Fixed timer expiration messages being sent repeatedly
- Fixed "time is running out" warning messages being sent multiple times
- Fixed planning timer synchronization between GM and players
- Fixed timer cleanup and fadeout behavior for non-GM users
- Fixed permission issues with chat messages for non-GM users
- Improved timer state management and UI updates

### Changed
- Refactored timer code to use socketlib for better client synchronization
- Updated planning timer to match combat timer's behavior
- Improved timer expiration handling for consistency across all timer types

## [1.0.0] - 2025-01-22 - Initial Release

### Added
- Combat Statistics System
  - Core combat statistics tracking
  - Round-by-round tracking with summary display
  - MVP system with card-based stat display
  - Notable moments tracking with party focus
  - Party breakdown with individual performance stats
  - Combat session stats with accuracy tracking
  - Combat statistics chat output
- Combat Management
  - Combat timer with pause/resume functionality
  - Planning timer with strategic phase support
  - Turn tracking system with accurate timing
- UI Enhancements
  - Combat dashboard with real-time statistics
  - Visual progress indicators and timers
  - Multiple visual themes
  - Player portraits with rank overlays
  - Icons for critical hits and fumbles
  - Consistent header styling
- Full documentation and README
- FoundryVTT v12 compatibility

### Changed
- Updated Notable Moments section title to "Notable Party Moments"
- Ensured chat messages come from GM instead of selected token

### Fixed
- Fixed MVP player name formatting
- Adjusted fumble icon color for better visibility


