# Coffee Pub Blacksmith API Documentation

## Overview
Coffee Pub Blacksmith serves as the central hub for all Coffee Pub modules, providing core functionality and managing inter-module communication. This document outlines the API available to other Coffee Pub modules and how to integrate with Blacksmith.

## Getting Started

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

## API Methods

### Module Management
- `registerModule(moduleId, config)`: Register your module with Blacksmith
- `isModuleActive(moduleId)`: Check if a specific Coffee Pub module is active
- `getModuleFeatures(moduleId)`: Get all features registered by a specific module

### Global Utilities
Blacksmith provides a set of shared utility functions that all Coffee Pub modules can use:

#### Console and Notifications
```javascript
// Instead of using console.log or ui.notifications directly
blacksmith.utils.postConsoleAndNotification(
    message,           // The message to display (mandatory)
    result = "",       // Optional data to show in console
    blnDivider = false,// Show divider in console
    blnDebug = true,   // Is this a debug message
    blnNotification = false, // Show as UI notification
    strModuleTitle = "BLACKSMITH" // Optional module title for styling
);

// Example usage:
blacksmith.utils.postConsoleAndNotification(
    "Initializing module",     // Required message
    { version: "1.0.0" },      // Optional result data
    false,                     // No divider
    true,                      // Debug mode
    false,                     // No notification
    "BIBLIOSOPH"              // Custom module title
);

// Minimal usage (using defaults):
blacksmith.utils.postConsoleAndNotification("Required message");
```

#### Time and Formatting
```javascript
// Format time values
blacksmith.utils.formatTime(ms, format = "colon");

// Generate formatted dates
blacksmith.utils.generateFormattedDate(format);
```

#### String Manipulation
```javascript
// Trim strings to length with ellipsis
blacksmith.utils.trimString(str, maxLength);

// Convert to sentence case
blacksmith.utils.toSentenceCase(str);
```

#### Game Entity Helpers
```javascript
// Get actor ID from name
blacksmith.utils.getActorId(actorName);

// Get token image
blacksmith.utils.getTokenImage(tokenDoc);

// Get portrait image
blacksmith.utils.getPortraitImage(actor);
```

#### Sound Management
```javascript
// Play sounds with volume control
blacksmith.utils.playSound(sound, volume = 0.7, loop = false, broadcast = true);
```

### Using Global Utilities
In your module, access these utilities through the Blacksmith API:

```javascript
// Example: Using postConsoleAndNotification
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith) {
    blacksmith.utils.postConsoleAndNotification(
        "YOURMODULE | Initializing",
        "",
        false,
        true,
        false
    );
}
```

### Feature Types

#### Chat Panel Icons
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

### BLACKSMITH Global Object
The BLACKSMITH object is now accessible through the API, providing access to various shared resources and settings:

```javascript
// Access the BLACKSMITH object
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const blacksmithObj = blacksmith.BLACKSMITH;

// Access theme choices
const themeChoices = blacksmithObj.arrThemeChoices;

// Access sound choices
const soundChoices = blacksmithObj.arrSoundChoices;

// Access default sound settings
const defaultSoundFile = blacksmithObj.strDEFAULTSOUNDFILE;
const defaultSoundVolume = blacksmithObj.strDEFAULTSOUNDVOLUME;

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
```

## Events
Blacksmith emits several events that your module can listen to:

```javascript
// When Blacksmith's socket is ready
Hooks.on('blacksmith.socketReady', () => {
    // Socket is ready for communication
});

// When a module variable has been updated
Hooks.on('blacksmithUpdated', (blacksmith) => {
    // Handle updates
});
```

## Examples

### Adding a Chat Panel Icon
```javascript
const feature = {
    type: 'chatPanelIcon',
    data: {
        icon: 'fas fa-dice',
        tooltip: 'Roll Dice',
        onClick: () => {
            // Your dice rolling logic
        }
    }
};

blacksmith.registerModule('your-module-id', {
    name: 'YOUR_MODULE',
    version: '1.0.0',
    features: [feature]
});
```

## Best Practices
1. Always check if Blacksmith is available before using its API
2. Register your module during the 'init' hook
3. Use the provided event system for inter-module communication
4. Follow the naming conventions for module IDs and titles
5. When using BLACKSMITH object properties, check if they exist before using them

## Version Compatibility
- Foundry VTT: v12 (with v13 readiness)
- Required Libraries:
  - socketlib
  - libWrapper

## Error Handling
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

## Testing in Console
You can test the Blacksmith API integration directly in your browser's console. Each command below can be run independently:

```javascript
// 1. Basic API availability test
const api = game.modules.get('coffee-pub-blacksmith')?.api;
console.log(api); // Should show all available API methods

// 2. Test ModuleManager directly
console.log(api?.ModuleManager?.registeredModules);
console.log(api?.ModuleManager?.features);
console.log(api?.ModuleManager?.isModuleActive('coffee-pub-bibliosoph'));

// 3. Test utility functions
// First, store utils reference
const utils = api?.utils;

// Console and notifications
utils?.postConsoleAndNotification("Test Message", "", false, true, false);

// Time formatting (returns formatted string)
utils?.formatTime(3600000); // Should show "01:00:00"

// String manipulation
utils?.toSentenceCase("test string"); // Should show "Test string"

// 4. Test version
console.log(api?.version); // Should show current API version

// 5. View chat panel icons in DOM
document.querySelector('.blacksmith-chat-panel .toolbar-icons')?.children;
```

Expected Output:
```javascript
// API check:
{
    ModuleManager: {...},
    registerModule: [Function],
    isModuleActive: [Function],
    getModuleFeatures: [Function],
    utils: {...},
    version: "1.0.0"
}

// ModuleManager.registeredModules:
Map(n) {
    'coffee-pub-blacksmith' => {...},
    'coffee-pub-bibliosoph' => {...},
    // etc...
}

// Utils tests:
"Test Message" // In console and notification
"01:00:00"    // formatTime result
"Test string" // toSentenceCase result

// Version:
"1.0.0"

// Chat panel icons:
HTMLCollection(n) [i.fas.fa-icon-name, ...]
```

Common Issues:
1. If `api` is undefined, ensure Blacksmith is installed and active
2. If `utils` methods return undefined, check if UtilsManager is initialized
3. If ModuleManager shows empty Maps, verify modules are registered during initialization
4. If chat panel icons are not visible, check if features are properly registered

For more complex testing, you can store the API reference in a variable:
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    // Now you can chain multiple tests
    blacksmith.utils.postConsoleAndNotification("Multiple tests starting...");
    console.log('API Version:', blacksmith.version);
    console.log('Registered Modules:', blacksmith.ModuleManager.registeredModules);
    // etc...
} 
```

### Stats API
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

### AI-Friendly Integration Guide

For AI assistants integrating with the Stats API:

1. **Initial Setup**:
   ```javascript
   // Check for Blacksmith and Stats API availability
   const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
   if (!blacksmith?.stats) {
       console.error("Stats API not available");
       return;
   }
   ```

2. **Data Access Patterns**:
   - Always use `await` with async methods
   - Check for null/undefined returns
   - Handle errors appropriately
   ```javascript
   try {
       const stats = await blacksmith.stats.player.getStats(actorId);
       if (!stats) {
           console.warn("No stats available for actor");
           return;
       }
       // Process stats
   } catch (error) {
       console.error("Error accessing stats:", error);
   }
   ```

3. **Best Practices**:
   - Cache results when appropriate
   - Unsubscribe from updates when no longer needed
   - Use utility functions for consistent formatting
   - Validate actor IDs before querying

4. **Performance Considerations**:
   - Batch stat requests when possible
   - Limit update subscription frequency
   - Clean up subscriptions on module disable/unload

This documentation should help both human developers and AI assistants effectively integrate with the Blacksmith Stats API.