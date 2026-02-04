


# Coffee Pub Blacksmith

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-blacksmith)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-blacksmith/release.yml?event=push)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-blacksmith/total)
![Foundry v13](https://img.shields.io/badge/foundry-v13-yellow)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)



## IMPORTANT NOTICE

Blacksmith version 12.1.23 is the final build of BLACKSMITH that will be compatible with FoundryVTT v12. All future builds will be compatible with FoundryVTT v13 and later.

## Disclaimer

This is a personal project created for my FoundryVTT games to introduce various quality-of-life features and functions. 

If you stumble upon this repository and find it useful, feel free to try it out! However, please note that this project is developed for personal use, and I make no guarantees regarding stability, compatibility, or ongoing support.

**Use at your own risk.** I am not responsible for any issues, data loss, or unexpected behavior resulting from using this project.

A comprehensive combat enhancement module for FoundryVTT that provides detailed combat statistics, performance tracking, timing tools, and injury mechanics to enrich your tabletop experience.

The Blacksmith Module serves as the foundational framework for the entire Coffee Pub module series, providing essential services and shared functionality that all other modules depend upon. While powerful as a standalone module with features like enhanced combat statistics, customizable UI elements, and comprehensive token management, its true potential is realized when integrated with the complete Coffee Pub suite, where it orchestrates seamless communication and synchronization between all modules.


## **Key Features**

### **Real-Time Multiplayer Tools**
- **Combat Timers**: Synchronized countdowns across all clients
- **Planning Timers**: Session preparation timing for everyone
- **Voting System**: Instant results visible to all players
- **Cross-Client Sync**: Professional gaming experience

### **Advanced Canvas Management**
- **Custom Layers**: Blacksmith utilities layer
- **Canvas Tools**: Advanced manipulation and management
- **Layer Integration**: Seamless FoundryVTT integration

### **Module Integration System**
- **Centralized Registration**: Easy integration for other modules
- **Feature Management**: Comprehensive module coordination
- **API Access**: Public interfaces for external modules

### **Statistics and Analytics**
- **Combat Tracking**: Detailed encounter analysis
- **Player Performance**: Individual and group statistics
- **Data Export**: Comprehensive reporting capabilities


### **Movement Controls**
- **Movement Modes**: Normal movement, No movement, Combat movement, Follow movement, Conga line movement
- **Control Features**: Movement configuration dialog, Visual indicators for current mode, GM-only movement mode control, Persistent movement settings, Quick access movement controls

### **Chat Card System**
- **Enhanced Layout**: Better visual hierarchy for roll results, Improved success/failure indicators, Detailed roll information tooltips, Group vs group contest visualization, Customizable card spacing and margins
- **Information Display**: Clear skill check results, Contest outcome visualization, Party-wide success tracking, Enhanced tooltips and details

### Player Statistics
- **Individual Performance Tracking**: Attack success rates and accuracy percentages, Damage dealt and received tracking, Healing performed and received, Turn timing statistics with pause/resume support
- **Combat Session Stats**: Detailed tracking of player achievements within each combat
- **Turn Management**: Enhanced turn tracking with accurate timing

### Network Statistics
- **Latency Display**: Real-time latency monitoring for all players, Color-coded indicators (good/medium/poor), Configurable check frequency, Automatic local GM detection

### Combat Management
- **Combat Timer**: Accurate turn duration tracking with pause/resume functionality, Automatic active time calculation (excluding paused time), Visual progress indicators, Configurable notifications, Auto-start on token movement, targeting, and attack/damage rolls, Robust round change detection to prevent timer issues
- **Planning Timer**: Dedicated planning phase timing tool, Pause/resume support, Integration with combat stats, Seamless transition to combat timer
- **Turn Management**: Enhanced turn tracking and notification system
- **Enhanced Combat Tracker**: Drag and drop initiative ordering, Health bars for combatants, Optional portrait display, "Set as current combatant" button

### UI Enhancements
- **Combat Dashboard**: Real-time combat statistics display, Round summary with timing breakdowns, Party performance metrics, Notable moments showcase
- **Timer Integration**: Visual progress bars for turn tracking, Time remaining indicators, Status notifications
- **Theme Support**: Multiple visual themes for UI elements, Drives theme selectiosn for all other Coffee Pub modules

### AI-Powered Content and Rules System
- **Multi-Workspace Interface**: Regent: AI chatbot for quick rule lookups and clarifications, Lookup: AI-assisted rules interpretation and contextual references, Character: Smart character development and backstory generation, Assistant: Advanced AI tools for real-time game assistance, Narrative: AI-driven story creation and scene development, Encounter: Intelligent encounter design and balancing

- **The Regent AI Assistant**: Real-time rule clarifications and interpretations, Player-accessible AI chat interface, GM oversight of all player queries, Contextual understanding of game state, Integration with game system rules, Customizable AI behavior and responses, Quick access through toolbar button, Optional macro trigger support

- **Content Generation**: Contextual rule lookups and interpretations, Dynamic narrative and scene generation, Intelligent encounter building suggestions, NPC personality and behavior generation, Automated story hooks and plot development
- **Dynamic Contextual Roll Lookup System**: Context-aware skill check suggestions, Smart dice roll recommendations
- **Smart Journal Integration**: AI-enhanced journal entry creation, Smart image and scene suggestions, Contextual geography and location development, Dynamic narrative rewards calculation
- **AI-Powered Encounter Building**: Intelligent monster selection and balancing, Smart party composition analysis, Context-aware NPC integration, Dynamic CR calculations
  - AI-assisted encounter worksheet system

### Quality of Life Improvements
- **Journal Enhancements**: Double-click to edit journal entries, Customizable journal behaviors, Smart folder organization
- **Scene Management**: Enhanced scene navigation, Custom mouse behaviors (Left-click: View, Double-click: Activate) , Configurable scene indicators, Flexible title formatting and layout
- **Chat Improvements**: Customizable chat spacing and margins, Enhanced card layouts, Configurable message styling, Roll table icon customization
- **Token Management**: Smart token renaming, Customizable nameplate styling, Token ignore lists, Fuzzy matching for token names      
- **Theme System**: Multiple visual themes, Customizable UI elements, Dynamic theme switching, Persistent theme settings


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


## **Requirements**

- **FoundryVTT**: Version 12.x (verified compatible)
- **Game System**: D&D5e (fully supported)
- **SocketLib**: **REQUIRED** - now working perfectly
- **libWrapper**: Supported (optional)

## **Installation**

1. **Install SocketLib** (required dependency):
   - FoundryVTT Admin Panel → Install Module
   - Manifest URL: `https://github.com/farling42/foundryvtt-socketlib/releases/latest/download/module.json`

2. **Install Coffee Pub Blacksmith**:
   - FoundryVTT Admin Panel → Install Module
   - Manifest URL: `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`

3. **Enable Both Modules** in your world

## **Configuration**

### **Socket System**
- **Automatic**: SocketLib detection and integration
- **Fallback**: Native Foundry sockets if needed
- **Cross-Client**: All features sync automatically

### **Timer Settings**
- **Combat Timers**: Customizable countdown displays
- **Planning Timers**: Session preparation tools
- **Round Timers**: Tactical encounter timing

### **UI Customization**
- **Console Styling**: Multiple debug output styles
- **Chat Appearance**: Customizable message formatting
- **Window Themes**: Multiple visual themes available

## **API Documentation**

### **For Developers**
- **Module Registration**: Easy integration with Blacksmith
- **Utility Functions**: Access to common gaming utilities
- **Socket Communication**: Cross-client messaging system
- **Statistics API**: Performance tracking and analytics


## **Development Status**

### **Completed Features**
- ✅ **Socket System**: Production ready with SocketLib
- ✅ **Timer System**: All timer types fully functional
- ✅ **Voting System**: Real-time cross-client voting
- ✅ **Module Management**: Centralized system operational
- ✅ **Canvas Tools**: Advanced canvas manipulation
- ✅ **Statistics API**: Comprehensive tracking system

### **In Development**
- **Roll System**: Unified dice rolling architecture
- **Advanced Roll Types**: Skill, ability, save, tool checks
- **Window Modes**: Multiple UI presentation options
- **Cinema Mode**: Cinematic roll display system

### **Planned Features**
- **Roll Result Handling**: Comprehensive result processing


## **Known Issues**
- **BREAKING**: Currently in mid-reachitecture for all modules.

### **Resolved Issues**
- ✅ **Socket Communication**: SocketLib now working perfectly
- ✅ **Cross-Client Sync**: All features sync across clients
- ✅ **Module Loading**: Consistent and reliable loading
- ✅ **File Organization**: Clean and maintainable structure


## Support

If you encounter any issues or have suggestions, please file them in the [Issues](https://github.com/Drowbe/coffee-pub-blacksmith/issues) section of this repository.

## License

This work is licensed under the included LICENSE file.

## Credits

Part of the Coffee Pub module collection


---

**Last Updated**: Current session - Socket system fully functional
**Status**: Production ready with SocketLib integration
**Next Milestone**: Roll system development completion

---

*Coffee Pub Blacksmith - gaming tools for FoundryVTT*

