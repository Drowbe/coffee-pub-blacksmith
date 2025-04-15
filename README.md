# Coffee Pub Blacksmith

![Foundry v12](https://img.shields.io/badge/foundry-v12-green)
![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-blacksmith)
![MIT License](https://img.shields.io/badge/license-MIT-blue)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-blacksmith/release.yml)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-blacksmith/total)

## Disclaimer

This is a personal project created for my FoundryVTT games to introduce various quality-of-life features and functions. 

If you stumble upon this repository and find it useful, feel free to try it out! However, please note that this project is developed for personal use, and I make no guarantees regarding stability, compatibility, or ongoing support.

**Use at your own risk.** I am not responsible for any issues, data loss, or unexpected behavior resulting from using this project.

A comprehensive combat enhancement module for FoundryVTT that provides detailed combat statistics, performance tracking, timing tools, and injury mechanics to enrich your tabletop experience.

The Blacksmith Module serves as the foundational framework for the entire Coffee Pub module series, providing essential services and shared functionality that all other modules depend upon. While powerful as a standalone module with features like enhanced combat statistics, customizable UI elements, and comprehensive token management, its true potential is realized when integrated with the complete Coffee Pub suite, where it orchestrates seamless communication and synchronization between all modules.

## Features

### Combat Statistics
- **Round-by-Round Tracking**: 
  - Active combat time tracking (excluding paused time)
  - Planning phase duration tracking
  - Turn-by-turn timing statistics
  - Combat performance metrics
- **Notable Moments**: Tracks critical hits, fumbles, and other significant events
- **MVP System**: Identifies outstanding player performances with detailed scoring
- **Party Performance**: Comprehensive breakdown of party-wide combat effectiveness

### Skill Check System
- **Party-Wide Rolls**:
  - Quick skill check dialog for group rolls
  - Support for contested rolls between groups
  - Customizable DC display and success/failure indicators
  - Group success tracking for multiple participants
- **Enhanced Roll Information**:
  - Detailed roll results with formula display
  - Skill descriptions and rule references
  - Quick roll context menu for common checks
  - Visual success/failure indicators
- **Contest System**:
  - Group vs group contest support
  - Stalemate detection and display
  - Party-wide roll success tracking
  - Visual contest result indicators

### Movement Controls
- **Movement Modes**:
  - Normal movement
  - No movement
  - Combat movement
  - Follow movement
  - Conga line movement
- **Control Features**:
  - Movement configuration dialog
  - Visual indicators for current mode
  - GM-only movement mode control
  - Persistent movement settings
  - Quick access movement controls

### Chat Card System
- **Enhanced Layout**:
  - Better visual hierarchy for roll results
  - Improved success/failure indicators
  - Detailed roll information tooltips
  - Group vs group contest visualization
  - Customizable card spacing and margins
- **Information Display**:
  - Clear skill check results
  - Contest outcome visualization
  - Party-wide success tracking
  - Enhanced tooltips and details

### Player Statistics
- **Individual Performance Tracking**: 
  - Attack success rates and accuracy percentages
  - Damage dealt and received tracking
  - Healing performed and received
  - Turn timing statistics with pause/resume support
- **Combat Session Stats**: Detailed tracking of player achievements within each combat
- **Turn Management**: Enhanced turn tracking with accurate timing

### Network Statistics
- **Latency Display**: 
  - Real-time latency monitoring for all players
  - Color-coded indicators (good/medium/poor)
  - Configurable check frequency
  - Automatic local GM detection

### Combat Management
- **Combat Timer**: 
  - Accurate turn duration tracking with pause/resume functionality
  - Automatic active time calculation (excluding paused time)
  - Visual progress indicators
  - Configurable notifications
  - Auto-start on token movement, targeting, and attack/damage rolls
  - Robust round change detection to prevent timer issues
- **Planning Timer**: 
  - Dedicated planning phase timing tool
  - Pause/resume support
  - Integration with combat stats
  - Seamless transition to combat timer
- **Turn Management**: Enhanced turn tracking and notification system
- **Enhanced Combat Tracker**:
  - Drag and drop initiative ordering
  - Health bars for combatants
  - Optional portrait display
  - "Set as current combatant" button
  - Improved round transition handling

### UI Enhancements
- **Combat Dashboard**: 
  - Real-time combat statistics display
  - Round summary with timing breakdowns
  - Party performance metrics
  - Notable moments showcase
- **Timer Integration**: 
  - Visual progress bars for turn tracking
  - Time remaining indicators
  - Status notifications
- **Theme Support**:
  - Multiple visual themes for UI elements
  - Drives theme selectiosn for all other Coffee Pub modules

### AI-Powered Content and Rules System
- **Multi-Workspace Interface**: 
  - Regent: AI chatbot for quick rule lookups and clarifications
  - Lookup: AI-assisted rules interpretation and contextual references
  - Character: Smart character development and backstory generation
  - Assistant: Advanced AI tools for real-time game assistance
  - Narrative: AI-driven story creation and scene development
  - Encounter: Intelligent encounter design and balancing

- **The Regent AI Assistant**:
  - Real-time rule clarifications and interpretations
  - Player-accessible AI chat interface
  - GM oversight of all player queries
  - Contextual understanding of game state
  - Integration with game system rules
  - Customizable AI behavior and responses
  - Quick access through toolbar button
  - Optional macro trigger support

- **Content Generation**: 
  - Contextual rule lookups and interpretations
  - Dynamic narrative and scene generation
  - Intelligent encounter building suggestions
  - NPC personality and behavior generation
  - Automated story hooks and plot development
- **Dynamic Contextual Roll Lookup System**:
  - Context-aware skill check suggestions
  - Smart dice roll recommendations
- **Smart Journal Integration**:
  - AI-enhanced journal entry creation
  - Smart image and scene suggestions
  - Contextual geography and location development
  - Dynamic narrative rewards calculation
- **AI-Powered Encounter Building**:
  - Intelligent monster selection and balancing
  - Smart party composition analysis
  - Context-aware NPC integration
  - Dynamic CR calculations
  - AI-assisted encounter worksheet system

### Quality of Life Improvements
- **Journal Enhancements**: 
  - Double-click to edit journal entries
  - Customizable journal behaviors
  - Smart folder organization
- **Scene Management**:
  - Enhanced scene navigation
  - Custom mouse behaviors (Left-click: View, Double-click: Activate)
  - Configurable scene indicators
  - Flexible title formatting and layout
- **Chat Improvements**:
  - Customizable chat spacing and margins
  - Enhanced card layouts
  - Configurable message styling
  - Roll table icon customization
- **Token Management**:
  - Smart token renaming
  - Customizable nameplate styling
  - Token ignore lists
  - Fuzzy matching for token names
- **Theme System**:
  - Multiple visual themes
  - Customizable UI elements
  - Dynamic theme switching
  - Persistent theme settings

## Installation

1. Inside Foundry VTT, use the following manifest URL:
   ```
   https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json
   ```
2. Enable the module in your game world's module settings

## Configuration

### Required Modules
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib): Required for client synchronization and communication

### Recommended Coffee Pub Modules
Each module in the Coffee Pub collection enhances different aspects of your game:

- [Coffee Pub Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph): Library and reference management
- [Coffee Pub Crier](https://github.com/Drowbe/coffee-pub-crier): Enhanced announcements and notifications
- [Coffee Pub Scribe](https://github.com/Drowbe/coffee-pub-scribe): Advanced journaling and note-taking
- [Coffee Pub Squire](https://github.com/Drowbe/coffee-pub-squire): Character sheet as a sidebar tray
- [Coffee Pub Monarch](https://github.com/Drowbe/coffee-pub-monarch): Module collection management
- Other modules coming soon!

The Blacksmith module serves as the foundation for all Coffee Pub modules, providing shared services and functionality that other modules build upon.

### Module Settings
Access the module settings through the Module Settings menu in Foundry VTT:

#### General Settings
- Dashboard visibility on game load
- Toolbar configuration options
- Module integration preferences
- Latency display toggle (enabled by default)
- Latency check frequency (5s to 5min, default 30s)

#### Theme Configuration
- Multiple visual theme selection
- Theme defaults for all Coffee Pub modules
- Custom theme enabling/disabling
- Background image customization

#### Chat Settings
- Chat message spacing and gap adjustments (-20px to 60px)
- Card margin customization (top, bottom, left, right)
- Roll table icon visibility
- Object link styling preferences

#### Journal Settings
- Double-click to edit functionality
- Journal behavior customization
- Default folder configurations

#### Scene Settings
- Scene navigation behaviors
- Title alignment and formatting
- Font size adjustments
- Custom padding configurations
- Scene indicator visibility

#### Token Settings
- Token naming format options
- Random name table integration
- Token ignore list management
- Nameplate customization:
  - Font size (5px to 70px)
  - Font family selection
  - Color customization
  - Outline size and color

#### Window Settings
- Titlebar text size (0px to 25px)
- Icon size adjustments
- Element spacing configuration
- Window layout preferences

#### AI Assistant Settings
- OpenAI API configuration
- Model selection and temperature
- Context length customization
- Game system optimization
- Custom prompt configuration
- Default macro triggers

## Usage

### Combat Statistics
- Statistics are automatically tracked during combat
- Active time tracking accounts for paused periods
- View round summaries and notable moments after each round
- Export or review combat statistics as needed

### Combat Tools
- Use the combat timer to manage turn durations
  - Timer automatically starts when a player moves their token, targets an enemy, or makes an attack/damage roll
  - Robust round change detection prevents timer issues during transitions
- Implement the planning timer for strategic phases
- Pause/resume functionality for accurate timing
- Access quick combat management tools through the toolbar

### Enhanced Combat Tracker
- Drag and drop combatants to reorder initiative
- View health bars directly in the combat tracker
- Toggle portrait display for better visual identification
- Use the "Set as current combatant" button to manually control turn order
- Improved round transition handling for smoother gameplay

## Compatibility

- Foundry VTT Version: v12
- System Compatibility: DnD 5e (primary), other systems may have limited functionality
- Module Conflicts: None known

## Support

If you encounter any issues or have suggestions, please file them in the [Issues](https://github.com/Drowbe/coffee-pub-blacksmith/issues) section of this repository.

## License

This work is licensed under the included LICENSE file.

## Credits

Part of the Coffee Pub module collection

