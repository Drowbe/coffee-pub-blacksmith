# Coffee Pub Blacksmith

A Foundry VTT module that serves as the central hub for all Coffee Pub modules, providing core functionality, shared utilities, and managing inter-module communication. This module provides enhanced tools for Game Masters, including encounter management, token deployment, journal organization, and a comprehensive API for other modules.

## Features

### Core Module Hub
Coffee Pub Blacksmith serves as the central hub for all Coffee Pub modules, providing:
- **Shared Utilities**: Common functions for logging, time formatting, sound management, and more
- **Safe Settings Access**: Robust settings handling that prevents startup crashes
- **Module Management**: Centralized registration and feature system for dependent modules
- **Inter-Module Communication**: Event system for real-time updates and coordination
- **Statistics API**: Access to player and combat statistics
- **Image Guessing**: Advanced item image selection system

### Module Architecture
The module has been completely reorganized with a consistent naming convention:
- **`manager-*`** → Core management systems (libwrapper, sockets, hooks, rolls, utilities, canvas, modules, toolbar)
- **`api-*`** → External APIs (common, stats)  
- **`window-*`** → UI windows (gmtools, skillcheck, query)
- **`timer-*`** → Timer systems (combat, planning, round)
- **`stats-*`** → Statistics systems (combat, player)

### Performance Optimizations
- **Eliminated Race Conditions**: Only 4 essential entry points loaded by FoundryVTT initially
- **Sequential Loading**: Core files load in proper order to prevent dependency conflicts
- **Import Chain Management**: ES6 imports handle dependencies automatically
- **Improved Stability**: Module loads more reliably across different systems

### Encounter Toolbar
The encounter toolbar provides powerful tools for managing encounters directly from journal entries:

- **Token Deployment:** Deploy monsters from encounter data with multiple positioning patterns
- **Combat Integration:** Automatically create combat encounters with deployed tokens
- **CR Calculation:** Real-time Party CR and Monster CR calculation from canvas tokens
- **Content Scanning:** Automatically detect encounter data from journal content in multiple formats

#### Content Scanning Formats
The encounter toolbar can detect encounter data from journal content in these formats:

**JSON Format:**
```json
{
  "encounter": {
    "monsters": [
      "Death Knight",
      "Helmed Horror",
      "Goblin"
    ],
    "difficulty": "medium"
  }
}
```

**Markdown Format:**
```markdown
## Encounter: Goblin Ambush
**Difficulty:** Medium
**Monsters:**
- Death Knight
- Helmed Horror
- Goblin
```

**Plain Text Format:**
```
ENCOUNTER: Goblin Ambush
Difficulty: Medium
Monsters: Death Knight, Helmed Horror, Goblin
```

### Deployment Patterns
Multiple deployment patterns for flexible token placement:

- **Circle Formation:** Tokens placed in a circle around the deployment point
- **Scatter Positioning:** Tokens scattered with random variation to prevent overlaps
- **Grid Positioning:** Tokens placed in a proper square grid formation
- **Sequential Positioning:** Place tokens one at a time with user guidance
- **Line Formation:** Default fallback pattern for backward compatibility

### Settings
- **Enable Encounter Toolbar:** Toggle the encounter toolbar functionality
- **Enable Content Scanning:** Enable automatic detection of encounter data from journal content
- **Deployment Pattern:** Choose the default deployment pattern for tokens
- **Deployment Hidden:** Control whether deployed tokens are hidden by default
- **Encounter Folder:** Specify a folder for deployed actors (optional)

## Installation

1. Download the module files
2. Place them in your Foundry VTT modules directory
3. Enable the module in your world settings
4. Configure the settings as needed

### Dependencies
- **Foundry VTT**: Version 12+ (with v13 readiness)
- **Required Libraries**:
  - `socketlib` - For inter-client communication
  - `lib-wrapper` - For FoundryVTT system modifications

### For Other Module Developers
If you're developing a module that depends on Coffee Pub Blacksmith, see the [API Documentation](BLACKSMITH-API.md) for integration details.

## Usage

### Creating Encounters
1. Create a journal entry with encounter data using one of the supported formats
2. The encounter toolbar will automatically appear if encounter data is detected
3. Use the toolbar buttons to deploy monsters and create combat encounters

### Content Scanning
The module will automatically scan journal content for encounter data when:
- Structured data attributes are not found
- Content scanning is enabled in settings
- The journal entry contains recognizable encounter formats

This makes it easy for GMs to modify encounters by simply editing the journal text without needing to use specific HTML formatting.

## Support

For issues, feature requests, or questions, please refer to the module documentation or contact the development team.

## Documentation

- **[API Documentation](BLACKSMITH-API.md)** - Complete API reference for module developers
- **[Architecture Documentation](BLACKSMITH-ARCHITECTURE.md)** - Technical architecture and design decisions
- **[Migration Guide](BLACKSMITH-API.md#migration-guide)** - Guide for migrating existing modules to use Blacksmith

## Contributing

Coffee Pub Blacksmith is part of the Coffee Pub ecosystem. If you're developing a module that could benefit from shared utilities or inter-module communication, consider integrating with Blacksmith using the provided API.

