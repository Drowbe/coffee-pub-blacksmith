# Coffee Pub Blacksmith

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-blacksmith)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-blacksmith/release.yml?event=push)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-blacksmith/total)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

> **v12 notice:** Version 12.1.23 is the final build compatible with FoundryVTT v12. All subsequent releases target v13+.

## Overview

Blacksmith is the foundational framework for the entire Coffee Pub module series. It provides the shared design system, window base classes, APIs, and cross-client communication layer that all other Coffee Pub modules depend on. It is also a capable standalone module with GM tools, combat statistics, and UI customization features.

## Disclaimer

This is a personal project built for my own FoundryVTT games. If you find it useful, feel free to use it — but it comes with no guarantees of stability, compatibility, or support. **Use at your own risk.**

## Features

### GM Tools
- **CSS Editor**: Live custom CSS editor with CodeMirror 6 syntax highlighting, line numbers, and search/replace (Ctrl+F / Ctrl+H)
- **Voting System**: Create and broadcast votes to players with real-time results
- **Pin Layers**: Manage canvas pin visibility by layer with per-layer eye toggles

### Combat & Statistics
- **Combat Timers**: Synchronized turn countdowns across all clients, with pause/resume and auto-start on movement or attacks
- **Planning Timer**: Dedicated pre-combat timing tool
- **Party Statistics**: Detailed combat history, leaderboards, and per-player performance tracking
- **Player Statistics**: Individual breakdown of hits, misses, damage, healing, kills, crits, and MVP scores
- **Enhanced Combat Tracker**: Drag-and-drop initiative, health bars, portrait display

### UI & Theming
- **Design System**: Shared CSS tokens, component library, and window base classes used across all Coffee Pub modules
- **Theme Support**: Multiple visual themes with persistent settings; drives theme selection for all Coffee Pub modules
- **Chat Cards**: Enhanced roll result layout with improved success/failure indicators and tooltips

### Movement Controls
- **Movement Modes**: Normal, No movement, Combat, Follow, and Conga line modes
- **GM Controls**: Visual mode indicators, persistent settings, quick-access toolbar buttons

### Quality of Life
- **Token Management**: Smart renaming, customizable nameplates, fuzzy name matching
- **Scene Management**: Custom mouse behaviors, configurable scene indicators
- **Network Stats**: Real-time latency display with color-coded indicators for all players

### Developer API
- **Module Registration**: Standardized integration point for other Coffee Pub modules
- **Socket Layer**: Cross-client messaging via SocketLib with native fallback
- **Statistics API**: Public interface for reading and writing combat stats
- **Window Base (V2)**: `BlacksmithWindowBaseV2` — ApplicationV2-based window class used by all windows in the suite

## Requirements

- **FoundryVTT**: v13+
- **Game System**: D&D 5e (fully supported)
- **[socketlib](https://github.com/manuelVo/foundryvtt-socketlib)**: Required for cross-client sync

## Installation

1. Install **socketlib** first:
   - Foundry Admin → Install Module → paste manifest URL:
   `https://github.com/farling42/foundryvtt-socketlib/releases/latest/download/module.json`

2. Install **Coffee Pub Blacksmith**:
   - Foundry Admin → Install Module → paste manifest URL:
   `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`

3. Enable both modules in your world.

## Coffee Pub Module Suite

Blacksmith is the foundation for all modules in the suite:

| Module | Description |
|---|---|
| [Artificer](https://github.com/Drowbe/coffee-pub-artificer) | Item and content creation tools |
| [Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph) | Library and reference management |
| [Cartographer](https://github.com/Drowbe/coffee-pub-cartographer) | Drawing and map tools |
| [Crier](https://github.com/Drowbe/coffee-pub-crier) | Enhanced announcements and notifications |
| [Herald](https://github.com/Drowbe/coffee-pub-herald) | Streaming and broadcast view |
| [Monarch](https://github.com/Drowbe/coffee-pub-monarch) | Module collection management |
| [Regent](https://github.com/Drowbe/coffee-pub-regent) | AI assistant and rules lookup |
| [Scribe](https://github.com/Drowbe/coffee-pub-scribe) | Advanced journaling and note-taking |
| [Squire](https://github.com/Drowbe/coffee-pub-squire) | Character sheet sidebar tray |

## Development Setup

Requires [Node.js LTS](https://nodejs.org). After cloning:

```bash
npm install
npm run build:cm6
```

`npm run build:cm6` bundles the CodeMirror 6 CSS editor into `scripts/vendor/codemirror.mjs`. This file is committed to the repo — end users do not need Node. Only contributors modifying the editor dependencies need to rebuild it.

## Support

File bugs and feature requests in [Issues](https://github.com/Drowbe/coffee-pub-blacksmith/issues).

## License

Licensed under the included LICENSE file.
