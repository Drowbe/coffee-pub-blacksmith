# XP Distribution System Architecture

**Audience:** Contributors to the Blacksmith codebase.

## Overview

The XP Distribution system is a dual-mode experience point allocation tool for FoundryVTT that supports both monster-based XP (Experience Points mode) and manual milestone XP (Milestones mode). The system can operate in combat mode (when combat is active) or non-combat mode (when opened from the menubar).

## Core Components

### 1. XpManager Class (`scripts/xp-manager.js`)

The main static class that handles XP distribution logic and provides the public API.

#### Key Static Methods:
- `openXpDistributionWindow()` - Entry point for opening the XP distribution window
- `getCombatMonsters(combat)` - Retrieves monsters from active combat
- `getCanvasMonsters()` - Retrieves all NPC tokens from the current scene
- `loadPartyMembers()` - Loads player character data
- `getMonsterBaseXp(monster)` - Calculates base XP from monster CR
- `getResolutionMultipliers()` - Returns XP multipliers for each resolution type
- `applyXpToPlayersFromData(xpData)` - Applies calculated XP to player actors
- `postXpResults(xpData, results)` - Posts XP distribution results to chat

### 2. XpDistributionWindow Class (`scripts/xp-manager.js`)

The FormApplication window that provides the user interface for XP distribution.

#### Key Instance Methods:
- `updateXpCalculations()` - Core calculation engine
- `_updateXpDisplay()` - Updates UI display elements
- `_updateXpDataPlayers()` - Updates player data and displays
- `_onMonsterResolutionIconClick()` - Handles monster resolution changes
- `_onModeToggleChange()` - Handles Experience Points/Milestones toggle
- `_onApplyXp()` - Handles XP distribution to players

## Data Structures

### xpData Object
```javascript
{
    modeExperiencePoints: boolean,    // Experience Points mode enabled
    modeMilestone: boolean,          // Milestones mode enabled
    milestoneXp: number,             // Manual milestone XP amount
    milestoneData: {                 // Milestone form data
        category: string,
        title: string,
        description: string,
        xpAmount: string
    },
    monsters: [                      // Array of monster data
        {
            id: string,              // Actor ID
            actorId: string,          // Actor ID (duplicate for template)
            name: string,             // Monster name
            img: string,              // Monster image
            cr: number,               // Challenge Rating
            baseXp: number,           // Base XP from CR
            resolutionType: string,   // DEFEATED, NEGOTIATED, etc.
            multiplier: number,       // XP multiplier (0.0-1.5)
            finalXp: number,          // Calculated final XP
            isIncluded: boolean       // Include in calculations
        }
    ],
    players: [                       // Array of player data
        {
            actorId: string,          // Actor ID
            name: string,             // Player name
            img: string,              // Player portrait
            level: number,            // Character level
            currentXp: number,        // Current XP
            finalXp: number          // Final XP after distribution
        }
    ],
    partySize: number,               // Number of players
    partyMultiplier: number,         // Party size multiplier
    totalXp: number,                 // Total monster XP
    adjustedTotalXp: number,         // Total XP after party multiplier
    combinedXp: number,              // Monster XP + Milestone XP
    xpPerPlayer: number              // XP per player
}
```

## System Flow

### 1. Initial Load Flow
```
openXpDistributionWindow()
├── Check for active combat
├── Load party members (loadPartyMembers)
├── Load monsters:
│   ├── Combat mode: getCombatMonsters() + detectMonsterResolution()
│   └── Non-combat mode: getCanvasMonsters() (all REMOVED)
├── Create xpData object with default values
├── Create XpDistributionWindow instance
├── Constructor calls updateXpCalculations()
└── Render window
```

### 2. Monster Resolution Change Flow
```
User clicks resolution icon
├── _onMonsterResolutionIconClick()
├── Update monster data:
│   ├── resolutionType = newResolution
│   ├── multiplier = getResolutionMultipliers()[resolution]
│   └── finalXp = Math.floor(baseXp * multiplier)
├── Update visual icons (active/dimmed classes)
├── Call _updateXpDisplay()
└── Call _updateXpDataPlayers()
```

### 3. XP Calculation Flow
```
_updateXpDisplay()
├── Call updateXpCalculations()
├── Recalculate totals:
│   ├── totalXp = sum of monster.finalXp
│   └── adjustedTotalXp = totalXp * partyMultiplier
├── Update summary display elements
└── Update monster row displays

updateXpCalculations()
├── Calculate monsterBucket = modeExperiencePoints ? adjustedTotalXp : 0
├── Calculate milestoneBucket = modeMilestone ? milestoneXp : 0
├── combinedXp = monsterBucket + milestoneBucket
└── xpPerPlayer = combinedXp / partySize
```

### 4. Player Data Update Flow
```
_updateXpDataPlayers()
├── For each player:
│   ├── Get inclusion status from UI
│   ├── Get adjustment value from input
│   ├── Get adjustment sign (+/-)
│   ├── Calculate finalXp = xpPerPlayer + signedAdjustment
│   └── Update player.finalXp
└── Update player row displays
```

### 5. XP Distribution Flow
```
User clicks "Distribute XP"
├── _onApplyXp()
├── Collect milestone data (_collectMilestoneData)
├── Call applyXpToPlayersFromData(xpData)
├── Update player actors with new XP
├── Generate results array with level-up info
├── Call postXpResults(xpData, results)
└── Post chat message with distribution results
```

## Resolution Types and Multipliers

### Monster Resolution Types:
- **DEFEATED**: 1.00x XP (Combat Victory)
- **NEGOTIATED**: 1.50x XP (Diplomatic Success)
- **CAPTURED**: 1.20x XP (Tactical Success)
- **ESCAPED**: 0.60x XP (Monster Retreated)
- **IGNORED**: 0.20x XP (Avoided Entirely)
- **REMOVED**: 0.00x XP (Excluded Entirely)

### Party Size Multipliers (D&D 5e Standard):
- 1 player: 1.0x
- 2 players: 1.5x
- 3 players: 2.0x
- 4 players: 2.5x
- 5 players: 2.0x
- 6 players: 1.5x
- 7 players: 1.25x
- 8 players: 1.0x

## CR to XP Conversion

The system uses a decimal-based CR to XP conversion table:

```javascript
CR_TO_XP = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
    5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
    13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000,
    29: 135000, 30: 155000
}
```

## Mode Behavior

### Combat Mode (hasCombat = true)
- **Default**: Experience Points ON, Milestones OFF
- **Monsters**: Loaded from combat with auto-detected resolutions
- **Data Source**: Combat tracker

### Non-Combat Mode (hasCombat = false)
- **Default**: Experience Points OFF, Milestones ON
- **Monsters**: Loaded from canvas, all set to REMOVED initially
- **Data Source**: Scene tokens

## UI Components

### Templates
- `templates/window-xp.hbs` - Main XP distribution window
- `templates/cards-xp.hbs` - Chat message template for XP results

### CSS Classes
- `.xp-distribution.foundry-style-window` - Main window container
- `.xp-header-sticky` - Sticky header section
- `.xp-body-scroll` - Scrollable middle section
- `.xp-footer` - Sticky footer with action buttons
- `.xp-section` - Content sections (monsters, players, milestones)
- `.hidden` - Hidden sections (display: none !important)

## Known Issues

### Critical Bug: Circular Dependency in XP Calculations
**Location**: `updateXpCalculations()` method
**Problem**: The method uses `this.xpData.adjustedTotalXp` which is calculated AFTER `updateXpCalculations()` is called in `_updateXpDisplay()`.

**Current Flow (Broken)**:
```
_updateXpDisplay()
├── updateXpCalculations() ← Uses stale adjustedTotalXp
├── Calculate adjustedTotalXp ← Too late!
└── Update display
```

**Impact**: 
- Monster resolution changes don't update totals immediately
- Inconsistent state between individual monster XP and global totals
- UI shows stale data until another action triggers recalculation

**Solution**: `updateXpCalculations()` should calculate monster bucket from current monster data, not from stale `adjustedTotalXp`.

## Event Handlers

### Mode Toggles
- `_onModeToggleChange()` - Handles Experience Points/Milestones toggle changes
- Shows/hides relevant sections
- Calls `updateXpCalculations()`

### Monster Interactions
- `_onMonsterResolutionIconClick()` - Handles resolution icon clicks
- Updates monster data and calls recalculation methods

### Player Interactions
- `_onPlayerInclusionClick()` - Handles player inclusion/exclusion
- `_onPlayerAdjustmentChange()` - Handles XP adjustment input
- `_onPlayerAdjustmentSignClick()` - Handles +/- adjustment buttons

### Milestone Interactions
- `_onMilestoneXpChange()` - Handles milestone XP input
- `_onMilestoneDataChange()` - Handles milestone form changes
- `_collectMilestoneData()` - Collects milestone form data

## Integration Points

### FoundryVTT API
- `game.actors` - Actor data access
- `game.combat` - Combat state
- `game.scenes.active` - Scene data
- `FormApplication` - Window base class
- `ChatMessage` - Chat posting
- `renderTemplate` - Template rendering

### Module Integration
- Menubar API - XP Distribution button
- HookManager - Combat end hooks
- postConsoleAndNotification - Logging system
