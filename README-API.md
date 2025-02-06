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
    message,      // The message to display
    result,       // Optional data to show in console
    blnDivider,   // Show divider in console
    blnDebug,     // Is this a debug message
    blnNotification // Show as UI notification
);
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