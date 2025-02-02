# Changelog

## [1.0.2] - Cleanup and Refactor

### Added
- Added a new class for generating MVP descriptions based on combat stats.
- Added a new class for generating combat history.

### Changed
- Moved MVPTemplates from mvp-templates.js into data-collections.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into combat-stats.js
- Consolidated combat-related functionality into fewer files for better maintainability

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
