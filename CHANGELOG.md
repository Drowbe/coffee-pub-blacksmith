# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
  - New movement control icon in chat panel
  - Quick access to skill check dialog
  - Improved chat card spacing and margins
  - Better visual feedback for roll results
  - Enhanced tooltips and information display
  - Streamlined interface for GM controls

### Changed
- Updated chat panel layout to accommodate new features
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
- Added clickable vote tool area in chat panel
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
- Moved MVPTemplates from mvp-templates.js into data-collections.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into combat-stats.js
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


