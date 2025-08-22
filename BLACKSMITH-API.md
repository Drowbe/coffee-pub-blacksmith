# Coffee Pub Blacksmith API Documentation

## Overview
Coffee Pub Blacksmith serves as the central hub for all Coffee Pub modules, providing core functionality and managing inter-module communication. This document outlines the API available to other Coffee Pub modules and how to integrate with Blacksmith.

## Table of Contents
- [Getting Started](#getting-started)
- [API Methods](#api-methods)
  - [Module Management](#module-management)
  - [Global Utilities](#global-utilities)
  - [Feature Types](#feature-types)
  - [BLACKSMITH Global Object](#blacksmith-global-object)
- [Events](#events)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Version Compatibility](#version-compatibility)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Stats API](#stats-api)
- [Enhanced Image Guessing](#enhanced-image-guessing)

## Getting Started {#getting-started}

### Accessing the API
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (!blacksmith) {
    console.error("YOURMODULE | Required dependency 'coffee-pub-blacksmith' not found!");
    return;
}
```

### Module Registration
Each Coffee Pub module must register with Blacksmith to participate in the ecosystem:

```javascript
// In your module's initialization
Hooks.once('init', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;

    blacksmith.registerModule('your-module-id', {
        name: 'YOUR_MODULE_NAME',
        version: '1.0.0',
        features: [
            {
                type: 'chatPanelIcon',
                data: {
                    icon: 'fas fa-your-icon',
                    tooltip: 'Your Tool Tooltip',
                    onClick: () => {
                        // Your click handler
                    }
                }
            }
            // Add more features as needed
        ]
    });
});
```

## API Methods {#api-methods}

### Module Management {#module-management}
- `registerModule(moduleId, config)`: Register your module with Blacksmith
- `isModuleActive(moduleId)`: Check if a specific Coffee Pub module is active
- `getModuleFeatures(moduleId)`: Get all features registered by a specific module

### Global Utilities {#global-utilities}
Blacksmith provides a set of shared utility functions that all Coffee Pub modules can use:

#### Console and Notifications
```javascript
// Basic usage
blacksmith.utils.postConsoleAndNotification("BLACKSMITH", "Required message");

// With all parameters
blacksmith.utils.postConsoleAndNotification(
    strModuleTitle = "BLACKSMITH", // Module title for styling (optional)
    message,                        // The message to display (mandatory)
    result = "",                    // Optional data to show in console
    blnDebug = false,              // Is this a debug message (defaults to false)
    blnNotification = false         // Show as UI notification
);
```

#### Utility Functions
```javascript
// Time and formatting
blacksmith.utils.formatTime(ms, format = "colon");
blacksmith.utils.generateFormattedDate(format);

// String manipulation
blacksmith.utils.trimString(str, maxLength);
blacksmith.utils.toSentenceCase(str);

// Game entity helpers
blacksmith.utils.getActorId(actorName);
blacksmith.utils.getTokenImage(tokenDoc);
blacksmith.utils.getPortraitImage(actor);

// Sound management
blacksmith.utils.playSound(sound, volume = 0.7, loop = false, broadcast = true);
```

#### Safe Settings Access
Blacksmith provides robust, timing-safe functions for accessing FoundryVTT settings that prevent startup crashes:

```javascript
// Safe settings getter - won't crash if settings aren't registered yet
const value = blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);

// Safe settings setter - won't crash if settings aren't registered yet
const success = blacksmith.utils.setSettingSafely(moduleId, settingKey, value);

// Cached settings getter with expiration
const cachedValue = blacksmith.utils.getCachedSetting(settingKey, defaultValue);
```

**Why Use Safe Settings Access?**
- **Prevents startup crashes** from "not a registered game setting" errors
- **Handles timing issues** between hooks and settings registration
- **Provides graceful fallbacks** to default values
- **Built-in retry logic** for edge cases
- **Consistent error handling** across all modules

**Example Usage:**
```javascript
// OLD (risky - can crash during startup)
const autoRoll = game.settings.get('my-module', 'autoRoll');

// NEW (safe - won't crash, provides fallback)
const autoRoll = blacksmith.utils.getSettingSafely('my-module', 'autoRoll', false);

// Safe settings setter
const success = blacksmith.utils.setSettingSafely('my-module', 'autoRoll', true);
if (success) {
    console.log('Setting updated successfully');
} else {
    console.warn('Setting not yet registered, update skipped');
}
```

**Perfect for Module Initialization:**
```javascript
Hooks.once('ready', async () => {
    try {
        // Safe settings access - won't crash if settings aren't ready
        const featureEnabled = blacksmith.utils.getSettingSafely('my-module', 'featureEnabled', false);
        const soundEnabled = blacksmith.utils.getSettingSafely('my-module', 'soundEnabled', true);
        
        if (featureEnabled) {
            initializeFeature();
        }
        
        if (soundEnabled) {
            setupSoundEffects();
        }
        
    } catch (error) {
        console.error('Module initialization failed:', error);
    }
});
```

### Using Global Utilities
In your module, access these utilities through the Blacksmith API:

```javascript
// Example: Using postConsoleAndNotification
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith) {
    blacksmith.utils.postConsoleAndNotification(
        "YOURMODULE",
        "Initializing",
        "",
        true,
        false
    );
}
```

### Dependency Benefits
Since **Blacksmith is a dependency** on all Coffee Pub modules, these safe settings functions are **automatically available** to all of them without additional imports:

```javascript
// In any Coffee Pub module (no import needed!)
Hooks.once('ready', async () => {
    // Safe settings access - automatically available through dependency!
    const featureEnabled = window.getSettingSafely('my-module', 'featureEnabled', false);
    const soundEnabled = window.getSettingSafely('my-module', 'soundEnabled', true);
    
    if (featureEnabled) {
        initializeFeature();
    }
    
    if (soundEnabled) {
        setupSoundEffects();
    }
});
```

**Why This Matters:**
- **No startup crashes** across your entire module ecosystem
- **Consistent behavior** - all modules use the same robust settings handling
- **Easier maintenance** - fix settings issues in one place (Blacksmith)
- **Professional quality** - users get a consistent, crash-free experience
- **Automatic availability** - functions load with every dependent module

### BLACKSMITH Global Object {#blacksmith-global-object}
The BLACKSMITH object is accessible through the API, providing access to various shared resources and settings. This object is populated during the module initialization and updated through the hook system.

```javascript
// Access the BLACKSMITH object
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const blacksmithObj = blacksmith.BLACKSMITH;

// Access choice arrays (populated during settings registration)
const themeChoices = blacksmithObj.arrThemeChoices;           // Available card themes
const soundChoices = blacksmithObj.arrSoundChoices;           // Available sound files
const tableChoices = blacksmithObj.arrTableChoices;           // Available roll tables
const compendiumChoices = blacksmithObj.arrCompendiumChoices; // Available compendiums
const macroChoices = blacksmithObj.arrMacroChoices;           // Available macros
const backgroundImageChoices = blacksmithObj.arrBackgroundImageChoices; // Available background images
const iconChoices = blacksmithObj.arrIconChoices;             // Available icons
const nameChoices = blacksmithObj.arrNameChoices;             // Available nameplate options

// Access default settings
const defaultCardTheme = blacksmithObj.strDefaultCardTheme;   // Default card theme
const defaultSoundFile = blacksmithObj.strDEFAULTSOUNDFILE;   // Default sound file
const defaultSoundVolume = blacksmithObj.strDEFAULTSOUNDVOLUME; // Default sound volume

// Access volume presets
const loudVolume = blacksmithObj.SOUNDVOLUMELOUD;     // "0.8"
const normalVolume = blacksmithObj.SOUNDVOLUMENORMAL; // "0.5"
const softVolume = blacksmithObj.SOUNDVOLUMESOFT;    // "0.3"

// Access predefined sounds
const errorSound = blacksmithObj.SOUNDERROR01;
const notificationSound = blacksmithObj.SOUNDNOTIFICATION01;
const buttonSound = blacksmithObj.SOUNDBUTTON01;
```

Example usage in your module:
```javascript
Hooks.once('init', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;

    // Register your module
    blacksmith.registerModule('your-module-id', {
        name: 'YOUR_MODULE',
        version: '1.0.0',
        features: [{
            type: 'chatPanelIcon',
            data: {
                icon: 'fas fa-dice',
                tooltip: 'Roll Dice',
                onClick: () => {
                    // Play a sound using BLACKSMITH's predefined sounds
                    blacksmith.utils.playSound(
                        blacksmith.BLACKSMITH.SOUNDBUTTON01,
                        blacksmith.BLACKSMITH.SOUNDVOLUMENORMAL
                    );
                }
            }
        }]
    });

    // Use theme choices in your module's settings
    game.settings.register('your-module-id', 'theme', {
        name: 'Theme',
        hint: 'Select a theme for your module',
        scope: 'world',
        config: true,
        type: String,
        choices: blacksmith.BLACKSMITH.arrThemeChoices,
        default: 'default'
    });
});

## Feature Types {#feature-types}

### Chat Panel Icons
Add icons to the chat panel toolbar:
```javascript
{
    type: 'chatPanelIcon',
    data: {
        icon: 'fas fa-icon-name',    // FontAwesome icon class
        tooltip: 'Tool Tip Text',    // Hover text
        onClick: () => {}            // Click handler
    }
}
```

**Available Feature Types:**
- **`chatPanelIcon`**: Adds icons to the chat panel toolbar
- **More types coming soon** as the API expands
```

## Events {#events}
Blacksmith emits several events that your module can listen to:

```javascript
// When Blacksmith's socket is ready
Hooks.on('blacksmith.socketReady', () => {
    // Socket is ready for communication
});

// When the BLACKSMITH object has been updated with new data
Hooks.on('blacksmithUpdated', (newBlacksmith) => {
    // Handle updates to shared variables
    console.log('Theme choices updated:', newBlacksmith.arrThemeChoices);
    console.log('Sound choices updated:', newBlacksmith.arrSoundChoices);
    console.log('Table choices updated:', newBlacksmith.arrTableChoices);
});
```

### BLACKSMITH Object Update Hook {#blacksmith-update-hook}
The `blacksmithUpdated` hook is triggered whenever the BLACKSMITH object is updated with new data. This happens during:

1. **Settings Registration**: When choice arrays are populated
2. **Module Initialization**: When default values are set
3. **Runtime Updates**: When settings change

**Important**: Always use the `newBlacksmith` parameter from the hook callback, as it contains the most up-to-date data:

```javascript
Hooks.on('blacksmithUpdated', (newBlacksmith) => {
    // CORRECT: Use the updated object
    const currentThemes = newBlacksmith.arrThemeChoices;
    
    // INCORRECT: Don't reference the global BLACKSMITH object directly
    // const oldThemes = game.modules.get('coffee-pub-blacksmith')?.api?.BLACKSMITH.arrThemeChoices;
});
```

## Examples {#examples}

### Complete Module Registration
```javascript
Hooks.once('init', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;

    blacksmith.registerModule('your-module-id', {
        name: 'YOUR_MODULE',
        version: '1.0.0',
        features: [{
            type: 'chatPanelIcon',
            data: {
                icon: 'fas fa-dice',
                tooltip: 'Roll Dice',
                onClick: () => {
                    // Your dice rolling logic
                }
            }
        }]
    });
});
```

## Best Practices {#best-practices}
1. Always check if Blacksmith is available before using its API
2. Register your module during the 'init' hook
3. Use the provided event system for inter-module communication
4. Follow the naming conventions for module IDs and titles
5. When using BLACKSMITH object properties, check if they exist before using them

### Initialization Timing {#initialization-timing}
**Important**: The BLACKSMITH object and its choice arrays are populated during the `ready` phase, not during `init`. To ensure you have access to the latest data:

```javascript
// CORRECT: Wait for the ready phase and use the hook system
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;

    // Register for updates to get the latest data
    Hooks.on('blacksmithUpdated', (newBlacksmith) => {
        // Now you have access to populated choice arrays
        const themes = newBlacksmith.arrThemeChoices;
        const sounds = newBlacksmith.arrSoundChoices;
        
        // Use the data to populate your module's settings
        updateModuleSettings(themes, sounds);
    });
});

// INCORRECT: Trying to access choice arrays during init
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;
    
    // This will likely be empty or undefined
    const themes = blacksmith.BLACKSMITH.arrThemeChoices; // Empty during init
});
```

### Accessing Choice Arrays {#accessing-choice-arrays}
The choice arrays are automatically populated and updated by Blacksmith. You can access them through:

1. **Direct API Access** (after ready phase):
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const themes = blacksmith.BLACKSMITH.arrThemeChoices;
```

2. **Hook-based Updates** (recommended):
```javascript
Hooks.on('blacksmithUpdated', (newBlacksmith) => {
    // Always get the latest data
    const currentThemes = newBlacksmith.arrThemeChoices;
});
```

## Version Compatibility {#version-compatibility}
- Foundry VTT: v12 (with v13 readiness)
- Required Libraries:
  - socketlib
  - libWrapper

## Error Handling {#error-handling}
The API includes built-in error handling, but you should still implement your own error handling:

```javascript
try {
    const result = await blacksmith.registerModule(/* ... */);
    if (!result) {
        // Handle registration failure
    }
} catch (error) {
    console.error("YOUR_MODULE | Error registering with Blacksmith:", error);
}
```

## Testing {#testing}
You can test the Blacksmith API integration directly in your browser's console:

```javascript
// Basic API availability test
const api = game.modules.get('coffee-pub-blacksmith')?.api;
console.log(api); // Should show all available API methods

// Test utility functions
const utils = api?.utils;
utils?.postConsoleAndNotification("TEST", "Test Message", "", true, false);
utils?.formatTime(3600000); // Should show "01:00:00"

// Test ModuleManager
console.log(api?.ModuleManager?.registeredModules);
console.log(api?.version); // Should show current API version
```

**Common Issues:**
- If `api` is undefined, ensure Blacksmith is installed and active
- If `utils` methods return undefined, check if UtilsManager is initialized
- If ModuleManager shows empty Maps, verify modules are registered during initialization

### Stats API {#stats-api}
The Stats API provides access to both player and combat statistics tracked by Blacksmith. This API allows other modules to retrieve and analyze player performance, combat data, and notable moments.

#### Accessing the Stats API
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.stats) {
    // Stats API is available
}
```

#### Player Statistics
Access individual player statistics:

```javascript
// Get complete stats for a player
const playerStats = await blacksmith.stats.player.getStats(actorId);

// Get lifetime statistics
const lifetimeStats = await blacksmith.stats.player.getLifetimeStats(actorId);

// Get current session statistics
const sessionStats = blacksmith.stats.player.getSessionStats(actorId);

// Get specific stat categories
const attackStats = await blacksmith.stats.player.getStatCategory(actorId, 'attacks');
const healingStats = await blacksmith.stats.player.getStatCategory(actorId, 'healing');
const turnStats = await blacksmith.stats.player.getStatCategory(actorId, 'turnStats');
```

#### Combat Statistics
Monitor and analyze combat data:

```javascript
// Get current combat statistics
const currentCombat = blacksmith.stats.combat.getCurrentStats();

// Get stats for a specific participant
const participantStats = blacksmith.stats.combat.getParticipantStats(participantId);

// Get notable moments from current combat
const notableMoments = blacksmith.stats.combat.getNotableMoments();

// Get round summary
const currentRoundSummary = blacksmith.stats.combat.getRoundSummary();
const specificRoundSummary = blacksmith.stats.combat.getRoundSummary(3); // Get round 3 summary
```

#### Real-time Combat Updates
Subscribe to combat stat updates:

```javascript
// Subscribe to updates
const subscriptionId = blacksmith.stats.combat.subscribeToUpdates((stats) => {
    console.log('Combat stats updated:', stats);
});

// Unsubscribe when done
blacksmith.stats.combat.unsubscribeFromUpdates(subscriptionId);
```

#### Utility Functions
Helper functions for working with stats:

```javascript
// Format time values
const formattedTime = blacksmith.stats.utils.formatTime(3600000); // "1:00:00"

// Check if an actor is a player character
const isPC = blacksmith.stats.utils.isPlayerCharacter(actorId);
```

### Example Integration

Here's a complete example of integrating the Stats API into your module:

```javascript
Hooks.once('init', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;

    // Register your module
    blacksmith.registerModule('your-module-id', {
        name: 'YOUR_MODULE',
        version: '1.0.0',
        features: [{
            type: 'chatPanelIcon',
            data: {
                icon: 'fas fa-chart-line',
                tooltip: 'Combat Analysis',
                onClick: async () => {
                    // Example: Display combat statistics
                    const currentStats = blacksmith.stats.combat.getCurrentStats();
                    const notableMoments = blacksmith.stats.combat.getNotableMoments();
                    
                    // Subscribe to updates
                    const subId = blacksmith.stats.combat.subscribeToUpdates((stats) => {
                        // Update your UI with new stats
                        updateCombatDisplay(stats);
                    });
                    
                    // Get player-specific stats
                    const player = game.user.character;
                    if (player) {
                        const playerStats = await blacksmith.stats.player.getStats(player.id);
                        displayPlayerStats(playerStats);
                    }
                }
            }
        }]
    });
});

// Example function to update UI
function updateCombatDisplay(stats) {
    // Update your module's UI with the new stats
    console.log('Combat stats updated:', stats);
}

// Example function to display player stats
function displayPlayerStats(stats) {
    // Display the player's statistics in your module's UI
    console.log('Player stats:', stats);
}
```

### Integration Best Practices

**Data Access Patterns:**
- Always use `await` with async methods
- Check for null/undefined returns
- Handle errors appropriately
- Cache results when appropriate
- Unsubscribe from updates when no longer needed
- Clean up subscriptions on module disable/unload

## Enhanced Image Guessing {#enhanced-image-guessing}

The Blacksmith module includes an advanced image guessing system that automatically selects appropriate images for imported items.

### API Usage

```javascript
// Test image guessing for a specific item
await testImageGuessing("Ancient Ring", "A mysterious ring with arcane symbols");

// Get all available synonyms
const synonyms = await getAvailableSynonyms();
```

### Settings

- **Enhanced Image Guessing**: Enable/disable the advanced synonym mapping
- **Image Guessing Debug Mode**: Show detailed console logs about image selection process

### Synonym Categories

The system includes mappings for weapons, equipment, commodities, containers, consumables, and sundries. You can customize the mapping by modifying `resources/item-mapping.json`.

## Recent Improvements and Fixes {#recent-improvements}

### Global Variable Sharing System {#global-variable-sharing}
The global variable sharing system has been significantly improved to ensure reliable data access across all Coffee Pub modules:

**What Was Fixed:**
- **Timing Issues**: Settings registration now happens during the proper Foundry VTT lifecycle phase
- **Choice Array Population**: All choice arrays (themes, sounds, tables, etc.) are now properly populated before settings registration
- **Hook System**: The `blacksmithUpdated` hook now reliably provides updated data to dependent modules
- **API Consistency**: All modules now receive the same data through the standardized API

**How It Works Now:**
1. **Settings Registration**: Happens during the `ready` phase when Foundry is ready
2. **Choice Array Building**: All choice arrays are populated before settings registration
3. **Hook Updates**: Dependent modules receive updates through the `blacksmithUpdated` hook
4. **Data Consistency**: All modules access the same, up-to-date data

**Benefits:**
- **No More Empty Dropdowns**: All settings now properly display their available choices
- **Reliable Data Sharing**: Other modules consistently receive populated choice arrays
- **Proper Timing**: No more race conditions between settings registration and data population
- **Maintainable Code**: Cleaner, more predictable initialization flow

## Summary

This API provides a comprehensive foundation for Coffee Pub modules to integrate with Blacksmith's core functionality. Key benefits include:

- **Safe Settings Access**: Prevents startup crashes with robust settings handling
- **Shared Utilities**: Common functions available to all dependent modules
- **Module Management**: Centralized registration and feature system
- **Event System**: Inter-module communication and updates
- **Stats API**: Access to player and combat statistics
- **Image Guessing**: Advanced item image selection
- **Reliable Data Sharing**: Consistent access to choice arrays and shared variables

For questions or contributions, refer to the main README.md or create an issue in the repository.