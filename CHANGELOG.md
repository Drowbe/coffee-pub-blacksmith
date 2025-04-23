# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



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


