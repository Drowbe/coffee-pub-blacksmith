# Coffee Pub Blacksmith API Documentation

## Overview
Coffee Pub Blacksmith serves as the central hub for all Coffee Pub modules, providing core functionality and managing inter-module communication. This document outlines the API available to other Coffee Pub modules and how to integrate with Blacksmith.

## Table of Contents
- [Getting Started](#getting-started)
- [API Availability and Timing](#api-availability)
  - [Safe API Usage Patterns](#safe-usage-patterns)
  - [Common Crashes and Fixes](#common-crashes)
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

## Migration Guide

### For Existing Modules
**If you're migrating an existing module to use Blacksmith, follow this step-by-step process:**

#### Step 1: Add Module Registration
```javascript
// Add this to your existing init hook
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.registerModule) {
        blacksmith.registerModule('your-module-id', {
            name: 'YOUR_MODULE_NAME',
            version: '1.0.0'
        });
    }
});
```

#### Step 2: Replace Direct Settings Access
```javascript
// OLD: Direct settings access (can crash)
const value = game.settings.get('my-module', 'setting');

// NEW: Safe settings access
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const value = blacksmith?.utils?.getSettingSafely('my-module', 'setting', 'default') ?? 'default';
```

#### Step 3: Replace Console Logging
```javascript
// OLD: Basic console logging
console.log('Module initialized');

// NEW: Styled logging with Blacksmith
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    blacksmith.utils.postConsoleAndNotification('MODULE', 'Module initialized');
}
```

#### Step 4: Add Choice Array Support
```javascript
// OLD: Hardcoded choices
game.settings.register('my-module', 'theme', {
    type: String,
    choices: { 'default': 'Default', 'dark': 'Dark' },
    default: 'default'
});

// NEW: Dynamic choices from Blacksmith
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.BLACKSMITH?.arrThemeChoices) {
        game.settings.register('my-module', 'theme', {
            type: String,
            choices: blacksmith.BLACKSMITH.arrThemeChoices,
            default: blacksmith.BLACKSMITH.strDefaultCardTheme
        });
    }
});
```

#### Step 5: Test Your Integration
```javascript
// Add this testing function to your module
function testMigration() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error('❌ Blacksmith not found');
        return false;
    }
    
    if (!blacksmith.utils?.getSettingSafely) {
        console.error('❌ Blacksmith API not ready');
        return false;
    }
    
    console.log('✅ Migration successful!');
    return true;
}

// Test during development
if (game.user.isGM) {
    Hooks.once('ready', () => {
        setTimeout(testMigration, 2000);
    });
}
```

### Migration Checklist
- [ ] Module registered with Blacksmith
- [ ] Direct settings access replaced with getSettingSafely
- [ ] Console logging replaced with postConsoleAndNotification
- [ ] Hardcoded choices replaced with dynamic choice arrays
- [ ] blacksmithUpdated hook implemented for real-time updates
- [ ] Integration tested and working
- [ ] No console errors during startup

## Getting Started

### Quick Start Template
**Copy-paste this into your module's main file:**

```javascript
// REQUIRED: Module registration and basic setup
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.registerModule) {
        console.error("Required dependency 'coffee-pub-blacksmith' not found!");
        return;
    }
    
    blacksmith.registerModule('your-module-id', {
        name: 'YOUR_MODULE_NAME',
        version: '1.0.0'
    });
});

// REQUIRED: Access Blacksmith API and initialize your module
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils?.getSettingSafely) {
        console.error("Blacksmith API not ready!");
        return;
    }
    // Your initialization code here
});
```

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

## API Availability and Timing

**CRITICAL**: The Blacksmith API is not immediately available when your module loads. You must check availability before using any functions to prevent crashes.

### When the API is Available:
- ✅ During the `ready` hook
- ✅ After the `blacksmithUpdated` hook fires
- ✅ When `blacksmith?.utils?.getSettingSafely` returns a function

### When the API is NOT Available:
- ❌ During the `init` hook
- ❌ During the `setupGame` hook  
- ❌ Before Blacksmith has finished initializing

### Safe API Usage Patterns

**ALWAYS check availability before using the API:**

```javascript
// SAFE PATTERN - Use this
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils?.getSettingSafely) {
    // API is ready - safe to use
    const value = blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);
} else {
    // API not ready - use fallback
    const value = defaultValue;
}
```

**NEVER do this (will crash):**
```javascript
// UNSAFE - Will crash if API not ready
const value = blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);
```

### Common Migration Patterns
**OLD WAY → NEW WAY:**
```javascript
// OLD WAY → NEW WAY
// console.log → blacksmith.utils.postConsoleAndNotification
// game.settings.get → blacksmith.utils.getSettingSafely
// game.settings.set → blacksmith.utils.setSettingSafely
// COFFEEPUB.arr* → blacksmith.BLACKSMITH.arr*Choices
```

### Common Crashes and Fixes

**Error: `blacksmith.utils.getSettingSafely is not a function`**

**Cause:** Trying to use the API before it's initialized
**Fix:** Add null checks and use proper hook timing

**Error: `Cannot read property 'utils' of undefined`**

**Cause:** Blacksmith module not found or not loaded
**Fix:** Check if Blacksmith is installed and active

**Error: `TypeError: undefined. blacksmith.utils.getSettingSafely is not a function`**

**Cause:** Accessing the API during the wrong Foundry lifecycle phase
**Fix:** Use the `ready` hook instead of `setupGame` or `init` for API access

### Timing Cheat Sheet
```javascript
// ❌ DON'T: Use 'init' for data access
// ✅ DO: Use 'ready' for data access
// ✅ DO: Use 'blacksmithUpdated' hook for real-time updates
// ✅ DO: Add 1-second delay for notifications: setTimeout(() => {}, 1000)
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
// Basic usage
blacksmith.utils.postConsoleAndNotification("BLACKSMITH", "Required message");

// With all parameters
blacksmith.utils.postConsoleAndNotification(
    strModuleName = "BLACKSMITH", // Module name for styling (optional)
    message,                      // The message to display (mandatory)
    result = "",                  // data/object to show in console (optional)
    blnDebug = false,            // true for debug, false for system (defaults to false)
    blnNotification = false       // Show as UI notification
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

// Safe settings access
blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);
blacksmith.utils.setSettingSafely(moduleId, settingKey, value);
```

**Complete List of Available Utils:**
- `postConsoleAndNotification()` - Console logging and notifications
- `formatTime()` - Time formatting utilities
- `generateFormattedDate()` - Date formatting
- `trimString()` - String truncation
- `toSentenceCase()` - Text case conversion
- `getActorId()` - Get actor ID by name
- `getTokenImage()` - Get token image
- `getPortraitImage()` - Get actor portrait
- `playSound()` - Sound playback
- `getSettingSafely()` - Safe settings access ✅
- `setSettingSafely()` - Safe settings modification ✅

#### Safe Settings Access
Blacksmith provides robust, timing-safe functions for accessing FoundryVTT settings that prevent startup crashes:

```javascript
// Safe settings getter - won't crash if settings aren't registered yet
const value = blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);

// Safe settings setter - won't crash if settings aren't registered yet
const success = blacksmith.utils.setSettingSafely(moduleId, settingKey, value);
```

**✅ FULLY FUNCTIONAL**: These functions are properly exposed through the API and ready for use.

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
Since **Blacksmith is a dependency** on all Coffee Pub modules, these safe settings functions are **automatically available** to all of them through the Blacksmith API:

```javascript
// In any Coffee Pub module - access through the Blacksmith API
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;
    
    // Safe settings access through the Blacksmith API
    const featureEnabled = blacksmith.utils.getSettingSafely('my-module', 'featureEnabled', false);
    const soundEnabled = blacksmith.utils.getSettingSafely('my-module', 'soundEnabled', true);
    
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

### BLACKSMITH Global Object
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

## Feature Types

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

## Events
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

### BLACKSMITH Object Update Hook
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

## Examples

### Complete Working Module Example
**Real working code you can copy and modify:**

```javascript
// MODULE CONSTANTS - Always use this pattern
export const MODULE = {
    ID: 'your-module-id',
    NAME: 'YOUR_MODULE_NAME',
    TITLE: 'Your Module Title',
    AUTHOR: 'Your Name'
};

// MODULE REGISTRATION - During init hook
Hooks.once('init', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.registerModule) {
        console.error(`${MODULE.NAME} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }

    blacksmith.registerModule(MODULE.ID, {
        name: MODULE.NAME,
        version: '1.0.0',
        features: [{
            type: 'chatPanelIcon',
            data: {
                icon: 'fas fa-dice',
                tooltip: 'Roll Dice',
                onClick: () => {
                    // Your dice rolling logic
                    blacksmith.utils.playSound(
                        blacksmith.BLACKSMITH.SOUNDBUTTON01,
                        blacksmith.BLACKSMITH.SOUNDVOLUMENORMAL
                    );
                }
            }
        }]
    });
});

// MODULE INITIALIZATION - During ready hook
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils?.getSettingSafely) {
        console.error(`${MODULE.NAME} | Blacksmith API not ready!`);
        return;
    }

    // Register settings with choice arrays
    game.settings.register(MODULE.ID, 'theme', {
        name: 'Card Theme',
        hint: 'Select a theme for your module',
        scope: 'world',
        config: true,
        type: String,
        choices: blacksmith.BLACKSMITH.arrThemeChoices,
        default: blacksmith.BLACKSMITH.strDefaultCardTheme
    });

    // Listen for Blacksmith updates
    Hooks.on('blacksmithUpdated', (newBlacksmith) => {
        // Update your settings with new choices
        updateModuleSettings(newBlacksmith);
    });

    // Initialize your module
    initializeModule();
});

// HELPER FUNCTIONS
function updateModuleSettings(newBlacksmith) {
    // Update your settings with new choice arrays
    const themeSetting = game.settings.get(MODULE.ID, 'theme');
    if (!newBlacksmith.arrThemeChoices.includes(themeSetting)) {
        // Reset to default if current choice is no longer valid
        game.settings.set(MODULE.ID, 'theme', newBlacksmith.strDefaultCardTheme);
    }
}

function initializeModule() {
    // Your module initialization code
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    // Safe settings access
    const theme = blacksmith.utils.getSettingSafely(MODULE.ID, 'theme', 'default');
    const soundEnabled = blacksmith.utils.getSettingSafely(MODULE.ID, 'soundEnabled', true);
    
    // Log initialization
    blacksmith.utils.postConsoleAndNotification(
        MODULE.NAME,
        `Initialized with theme: ${theme}`,
        '',
        true,
        false
    );
}
```

### Before/After Code Comparison
**OLD WAY (risky, can crash):**
```javascript
// ❌ OLD - Can crash during startup
Hooks.once('init', async () => {
    // Direct settings access - can crash
    const theme = game.settings.get('my-module', 'theme');
    
    // Direct logging - no styling
    console.log('Module initialized');
    
    // No error handling
    const blacksmith = game.modules.get('coffee-pub-blacksmith').api;
    blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');
});
```

**NEW WAY (safe, robust):**
```javascript
// ✅ NEW - Safe and robust
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.registerModule) {
        console.error('Required dependency not found!');
        return;
    }
    
    blacksmith.registerModule('my-module', {
        name: 'MY_MODULE',
        version: '1.0.0'
    });
});

Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils?.getSettingSafely) {
        console.error('Blacksmith API not ready!');
        return;
    }
    
    // Safe settings access
    const theme = blacksmith.utils.getSettingSafely('my-module', 'theme', 'default');
    
    // Styled logging
    blacksmith.utils.postConsoleAndNotification('MY_MODULE', 'Module initialized');
});
```

## Best Practices

### 1. Always Check API Availability
**Never assume the API is ready - always check first:**

```javascript
// ✅ GOOD - Always check availability
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (!blacksmith?.utils?.getSettingSafely) {
    console.error('Blacksmith API not ready!');
    return;
}

// ❌ BAD - Assumes API is ready
const blacksmith = game.modules.get('coffee-pub-blacksmith').api;
blacksmith.utils.getSettingSafely('module', 'setting', 'default'); // CRASH!
```

### 2. Use Proper Hook Timing
**Follow the FoundryVTT lifecycle correctly:**

```javascript
// ✅ CORRECT - Register during init
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.registerModule) {
        blacksmith.registerModule('my-module', { name: 'MY_MODULE', version: '1.0.0' });
    }
});

// ✅ CORRECT - Access data during ready
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.utils?.getSettingSafely) {
        // Safe to access settings and utilities
    }
});

// ❌ WRONG - Accessing data during init
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const value = blacksmith.utils.getSettingSafely('module', 'setting', 'default'); // CRASH!
});
```

### 3. Use Standardized Module Constants
**Always use this pattern for consistent module identification:**

```javascript
// ✅ GOOD - Standardized constants
export const MODULE = {
    ID: 'your-module-id',
    NAME: 'YOUR_MODULE_NAME',
    TITLE: 'Your Module Title',
    AUTHOR: 'Your Name'
};

// Use throughout your module
blacksmith.registerModule(MODULE.ID, { name: MODULE.NAME, version: '1.0.0' });
blacksmith.utils.getSettingSafely(MODULE.ID, 'setting', 'default');
blacksmith.utils.postConsoleAndNotification(MODULE.NAME, 'Message');
```

### 4. Handle Fallbacks Gracefully
**Always provide fallbacks for critical functionality:**

```javascript
// ✅ GOOD - Graceful fallbacks
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils?.getSettingSafely) {
    const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');
} else {
    // Fallback to direct settings access
    const value = game.settings.get('my-module', 'setting') ?? 'default';
    console.warn('Using fallback settings access - Blacksmith not available');
}
```

### 5. Use Helper Functions for Repeated API Calls
**Create helper functions to reduce code duplication:**

```javascript
// ✅ GOOD - Helper functions
function getBlacksmithAPI() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

function isBlacksmithReady() {
    const blacksmith = getBlacksmithAPI();
    return blacksmith?.utils?.getSettingSafely;
}

function safeGetSetting(moduleId, settingKey, defaultValue) {
    const blacksmith = getBlacksmithAPI();
    if (blacksmith?.utils?.getSettingSafely) {
        return blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue);
    }
    return defaultValue;
}

// Usage
if (isBlacksmithReady()) {
    const theme = safeGetSetting(MODULE.ID, 'theme', 'default');
}
```

### 6. Test Thoroughly Before Deploying
**Always test your integration in a development environment:**

```javascript
// Add this to your module for testing
function testBlacksmithIntegration() {
    const blacksmith = getBlacksmithAPI();
    if (!blacksmith) {
        console.error('❌ Blacksmith not found');
        return false;
    }
    
    if (!isBlacksmithReady()) {
        console.error('❌ Blacksmith API not ready');
        return false;
    }
    
    // Test key functions
    try {
        const testValue = safeGetSetting('test', 'test', 'fallback');
        console.log('✅ Settings access working');
        
        blacksmith.utils.postConsoleAndNotification('TEST', 'Integration test successful');
        console.log('✅ Logging working');
        
        return true;
    } catch (error) {
        console.error('❌ Integration test failed:', error);
        return false;
    }
}

// Call during development
if (game.user.isGM) {
    Hooks.once('ready', () => {
        setTimeout(() => testBlacksmithIntegration(), 2000);
    });
}
```

### 7. Listen for Blacksmith Updates
**Always listen for the blacksmithUpdated hook for real-time data:**

```javascript
// ✅ GOOD - Listen for updates
Hooks.once('ready', async () => {
    const blacksmith = getBlacksmithAPI();
    if (!isBlacksmithReady()) return;
    
    // Listen for updates
    Hooks.on('blacksmithUpdated', (newBlacksmith) => {
        // Update your module with new data
        updateModuleWithNewData(newBlacksmith);
    });
});

function updateModuleWithNewData(newBlacksmith) {
    // Update your settings with new choice arrays
    const themes = newBlacksmith.arrThemeChoices;
    const sounds = newBlacksmith.arrSoundChoices;
    
    // Update your module accordingly
    updateThemeChoices(themes);
    updateSoundChoices(sounds);
}
```

### 8. Handle Errors Appropriately
**Implement proper error handling for all API calls:**

```javascript
// ✅ GOOD - Proper error handling
try {
    const blacksmith = getBlacksmithAPI();
    if (!blacksmith) {
        throw new Error('Blacksmith module not found');
    }
    
    if (!isBlacksmithReady()) {
        throw new Error('Blacksmith API not ready');
    }
    
    const value = safeGetSetting(MODULE.ID, 'setting', 'default');
    console.log('Setting value:', value);
    
} catch (error) {
    console.error('Blacksmith integration error:', error);
    // Handle the error gracefully - maybe disable features or show user message
}
```

## Quick Reference Card

### Essential Functions
```javascript
// Module registration
blacksmith.registerModule(moduleId, config)

// Safe settings access
blacksmith.utils.getSettingSafely(moduleId, settingKey, defaultValue)
blacksmith.utils.setSettingSafely(moduleId, settingKey, value)

// Logging and notifications
blacksmith.utils.postConsoleAndNotification(moduleName, message, data, debug, notification)

// Sound management
blacksmith.utils.playSound(sound, volume, loop, broadcast)
```

### Hook Timing Guidelines
```javascript
// 'init' hook: Module registration only
// 'ready' hook: Access to populated data, settings registration
// 'blacksmithUpdated' hook: Real-time data updates
```

### Common Patterns
```javascript
// Settings with choice arrays
game.settings.register(moduleId, 'setting', {
    type: String,
    choices: blacksmith.BLACKSMITH.arrThemeChoices,
    default: blacksmith.BLACKSMITH.strDefaultCardTheme
});

// Safe API access
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils?.getSettingSafely) {
    // Safe to use API
}
```

### Troubleshooting Quick Fixes
- **API not ready**: Use 'ready' hook, not 'init'
- **Function not found**: Check if Blacksmith is installed and active
- **Empty choice arrays**: Use 'blacksmithUpdated' hook
- **Notification flashing**: Add setTimeout delay
- **Settings not accessible**: Check module ID and timing
- **Module not registering**: Ensure complete config object

### Standardized Module Constants
Blacksmith and other Coffee Pub modules depend on consistent module identification. Use this pattern:

```javascript
export const MODULE = {
    ID: 'your-module-id',
    NAME: 'YOUR_MODULE_NAME',
    TITLE: 'Your Module Title',
    AUTHOR: 'Your Name'
};
```

**Why This Matters:**
- **Blacksmith uses these constants** for module registration and management
- **Consistent naming** across all Coffee Pub modules
- **Easy to update** if module details change
- **Prevents typos** in module IDs and names

### Initialization Timing
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

### Accessing Choice Arrays
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

## Testing
You can test the Blacksmith API integration directly in your browser's console:

### Console Testing Commands
**Copy-paste these to test your integration:**

```javascript
// Test 1: Basic API Availability
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
console.log('✅ API Available:', !!blacksmith);
console.log('✅ Utils Available:', !!blacksmith?.utils);
console.log('✅ getSettingSafely:', typeof blacksmith?.utils?.getSettingSafely);
console.log('✅ BLACKSMITH Object:', !!blacksmith?.BLACKSMITH);
console.log('✅ ModuleManager:', !!blacksmith?.ModuleManager);
```

```javascript
// Test 2: Test Utility Functions
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    // Test postConsoleAndNotification
    blacksmith.utils.postConsoleAndNotification("TEST", "Testing Blacksmith Integration", "", true, false);
    console.log('✅ postConsoleAndNotification working');
    
    // Test formatTime
    const formatted = blacksmith.utils.formatTime(3600000); // Should show "01:00:00"
    console.log('✅ formatTime working:', formatted);
} else {
    console.log('❌ Utils not available');
}
```

```javascript
// Test 3: Test Safe Settings Access
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    const testValue = blacksmith.utils.getSettingSafely('coffee-pub-blacksmith', 'defaultCardTheme', 'fallback');
    console.log('✅ getSettingSafely working, value:', testValue);
} else {
    console.log('❌ Utils not available');
}
```

```javascript
// Test 4: Test BLACKSMITH Object Access
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.BLACKSMITH) {
    console.log('✅ BLACKSMITH object available');
    console.log('Theme choices:', blacksmith.BLACKSMITH.arrThemeChoices);
    console.log('Sound choices:', blacksmith.BLACKSMITH.arrSoundChoices);
} else {
    console.log('❌ BLACKSMITH object not available');
}
```

```javascript
// Test 5: One-Liner Quick Test
// Copy and paste this entire block
(() => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return console.log('❌ Blacksmith not found');
    
    console.log('✅ Blacksmith API found');
    console.log('✅ Utils available:', !!blacksmith.utils);
    console.log('✅ BLACKSMITH object:', !!blacksmith.BLACKSMITH);
    console.log('✅ ModuleManager:', !!blacksmith.ModuleManager);
    
    // Test a utility function
    if (blacksmith.utils?.postConsoleAndNotification) {
        blacksmith.utils.postConsoleAndNotification("TEST", "Integration Test Successful!", "", true, false);
        console.log('✅ All systems working!');
    }
})();
```

### Integration Validation Checklist
**Use this checklist to verify your integration:**

- [ ] Module registered successfully with Blacksmith
- [ ] Settings accessible via getSettingSafely
- [ ] Choice arrays populated (themes, sounds, tables, etc.)
- [ ] Logging working with postConsoleAndNotification
- [ ] No console errors during startup
- [ ] BLACKSMITH object accessible
- [ ] blacksmithUpdated hook working
- [ ] Settings registration working with choice arrays

### Basic API Availability Test
```javascript
// Check if Blacksmith API is available
const api = game.modules.get('coffee-pub-blacksmith')?.api;
console.log('Blacksmith API:', api); // Should show all available API methods
```

### Test Utility Functions
```javascript
// Test the postConsoleAndNotification function
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    blacksmith.utils.postConsoleAndNotification("TEST", "Testing Blacksmith Integration", "", true, false);
    console.log('✅ postConsoleAndNotification working');
} else {
    console.log('❌ Utils not available');
}

// Test formatTime function
if (blacksmith?.utils?.formatTime) {
    const formatted = blacksmith.utils.formatTime(3600000); // Should show "01:00:00"
    console.log('✅ formatTime working:', formatted);
}
```

### Test Safe Settings Access
```javascript
// Test getSettingSafely function
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.utils) {
    const testValue = blacksmith.utils.getSettingSafely('coffee-pub-blacksmith', 'defaultCardTheme', 'fallback');
    console.log('✅ getSettingSafely working, value:', testValue);
} else {
    console.log('❌ Utils not available');
}
```

### Test BLACKSMITH Object Access
```javascript
// Check if BLACKSMITH object is populated
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.BLACKSMITH) {
    console.log('✅ BLACKSMITH object available');
    console.log('Theme choices:', blacksmith.BLACKSMITH.arrThemeChoices);
    console.log('Sound choices:', blacksmith.BLACKSMITH.arrSoundChoices);
} else {
    console.log('❌ BLACKSMITH object not available');
}
```

### Test Module Registration
```javascript
// Check if your module is registered
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.ModuleManager) {
    console.log('✅ ModuleManager available');
    console.log('Registered modules:', blacksmith.ModuleManager.registeredModules);
} else {
    console.log('❌ ModuleManager not available');
}
```

### One-Liner Quick Test
```javascript
// Quick comprehensive test - copy and paste this entire block
(() => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return console.log('❌ Blacksmith not found');
    
    console.log('✅ Blacksmith API found');
    console.log('✅ Utils available:', !!blacksmith.utils);
    console.log('✅ BLACKSMITH object:', !!blacksmith.BLACKSMITH);
    console.log('✅ ModuleManager:', !!blacksmith.ModuleManager);
    
    // Test a utility function
    if (blacksmith.utils?.postConsoleAndNotification) {
        blacksmith.utils.postConsoleAndNotification("TEST", "Integration Test Successful!", "", true, false);
        console.log('✅ All systems working!');
    }
})();
```

**What to Look For:**
- **✅ Success**: You should see styled console messages and no errors
- **❌ Errors**: Check if Blacksmith is installed, active, and loaded
- **Empty objects**: Choice arrays might be empty if accessed too early (use the `blacksmithUpdated` hook instead)

**Common Issues:**
- If `api` is undefined, ensure Blacksmith is installed and active
- If `utils` methods return undefined, check if UtilsManager is initialized
- If ModuleManager shows empty Maps, verify modules are registered during initialization
- If choice arrays are empty, you may be testing too early in the Foundry lifecycle

## Common Issues and Troubleshooting

### Issue: "API not ready" errors
**Symptoms:** `blacksmith.utils.getSettingSafely is not a function`
**Cause:** Trying to use the API before it's initialized
**Solution:** Use the `ready` hook instead of `init` for data access

```javascript
// ❌ WRONG - Will crash
Hooks.once('init', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default'); // CRASH!
});

// ✅ CORRECT - Safe access
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.utils?.getSettingSafely) {
        const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');
    }
});
```

### Issue: "Function not found" errors
**Symptoms:** `Cannot read property 'utils' of undefined`
**Cause:** Blacksmith module not found or not loaded
**Solution:** Check if Blacksmith is installed and active

```javascript
// ❌ WRONG - No error handling
const blacksmith = game.modules.get('coffee-pub-blacksmith').api; // CRASH if not found!

// ✅ CORRECT - Safe access with fallback
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (!blacksmith) {
    console.error('Blacksmith not found - please install and activate it');
    return;
}
```

### Issue: Empty choice arrays
**Symptoms:** Dropdown menus show no options
**Cause:** Accessing choice arrays too early in the lifecycle
**Solution:** Use the `blacksmithUpdated` hook for real-time updates

```javascript
// ❌ WRONG - Arrays might be empty
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const themes = blacksmith.BLACKSMITH.arrThemeChoices; // Might be empty
});

// ✅ CORRECT - Listen for updates
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    // Listen for updates
    Hooks.on('blacksmithUpdated', (newBlacksmith) => {
        const themes = newBlacksmith.arrThemeChoices; // Always populated
        updateThemeChoices(themes);
    });
});
```

### Issue: Notification flashing
**Symptoms:** Notifications appear and disappear too quickly
**Cause:** Notifications sent before UI is ready
**Solution:** Add a small delay for notifications

```javascript
// ❌ WRONG - Notification might flash
blacksmith.utils.postConsoleAndNotification("MODULE", "Message", "", false, true);

// ✅ CORRECT - Add delay for notifications
setTimeout(() => {
    blacksmith.utils.postConsoleAndNotification("MODULE", "Message", "", false, true);
}, 1000);
```

### Issue: Settings not accessible
**Symptoms:** `getSettingSafely` returns undefined or throws errors
**Cause:** Settings not registered yet or wrong module ID
**Solution:** Ensure proper timing and module ID

```javascript
// ❌ WRONG - Wrong module ID
const value = blacksmith.utils.getSettingSafely('wrong-id', 'setting', 'default');

// ✅ CORRECT - Use your actual module ID
const value = blacksmith.utils.getSettingSafely('your-actual-module-id', 'setting', 'default');
```

### Issue: Module not registering
**Symptoms:** Module doesn't appear in Blacksmith's registered modules
**Cause:** Registration during wrong hook or missing required fields
**Solution:** Register during `init` hook with required fields

```javascript
// ❌ WRONG - Missing required fields
blacksmith.registerModule('my-module'); // Missing config object

// ✅ CORRECT - Complete registration
blacksmith.registerModule('my-module', {
    name: 'MY_MODULE',
    version: '1.0.0'
});
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

### Integration Best Practices

**Data Access Patterns:**
- Always use `await` with async methods
- Check for null/undefined returns
- Handle errors appropriately
- Cache results when appropriate
- Unsubscribe from updates when no longer needed
- Clean up subscriptions on module disable/unload

## Enhanced Image Guessing

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

## Recent Improvements and Fixes



### Global Variable Sharing System
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

## AI-Friendly Integration Prompts

### For CursorAI and Similar AI Coding Assistants

Copy and paste the following prompt into your AI coding assistant to get help integrating with Coffee Pub Blacksmith:

```
I need to integrate my FoundryVTT module with Coffee Pub Blacksmith. 

Coffee Pub Blacksmith is a central hub module that provides shared utilities, safe settings access, and inter-module communication for the Coffee Pub ecosystem. It's designed for FoundryVTT v12+ and provides a robust API for other modules to use.

Key features I need to understand:
- Safe settings access that prevents startup crashes
- Shared utility functions (logging, time formatting, sound management, etc.)
- Global variable sharing through the BLACKSMITH object
- Hook system for inter-module communication
- Module registration system

The full API documentation is available at: https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API

Please help me:
1. Set up the basic module registration with Blacksmith
2. Implement safe settings access using Blacksmith's utilities
3. Access shared choice arrays (themes, sounds, tables, etc.) through the BLACKSMITH object
4. Set up proper hook listeners for the 'blacksmithUpdated' event
5. Follow the initialization timing best practices (use 'ready' phase, not 'init' for accessing data)

My module ID is: [YOUR_MODULE_ID]
My module name is: [YOUR_MODULE_NAME]

IMPORTANT: Please follow the exact patterns from the documentation:
- Use the Quick Start Template structure
- Implement proper error handling and availability checks
- Use the standardized MODULE constants pattern
- Include the blacksmithUpdated hook for real-time updates
- Provide working code examples that I can copy-paste directly

Please provide complete, working code examples that I can directly implement.
```

### For General AI Coding Assistance

```
I'm developing a FoundryVTT module that needs to integrate with Coffee Pub Blacksmith. 

Blacksmith provides:
- Safe settings access functions (getSettingSafely, setSettingSafely)
- Shared utility functions for logging, time formatting, and sound management
- A global BLACKSMITH object with choice arrays for themes, sounds, tables, etc.
- Hook system for inter-module communication
- Module registration and management

The complete API documentation is at: https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API

I need help implementing:
1. Module registration during the 'init' hook
2. Accessing shared data during the 'ready' hook
3. Using the 'blacksmithUpdated' hook for real-time updates
4. Implementing safe settings access
5. Accessing choice arrays for dropdown menus

IMPORTANT: Please follow the exact patterns from the documentation:
- Use the Quick Start Template structure
- Implement proper error handling and availability checks
- Use the standardized MODULE constants pattern
- Include the blacksmithUpdated hook for real-time updates
- Provide working code examples that I can copy-paste directly

Please provide working code examples and explain the FoundryVTT lifecycle timing considerations.
```

### Quick Reference for AI Assistants

**Essential Integration Points:**
- Register module during 'init' hook
- Access BLACKSMITH object during 'ready' hook
- Listen to 'blacksmithUpdated' hook for data updates
- Use getSettingSafely() for safe settings access
- Access choice arrays via blacksmith.BLACKSMITH.arr[Type]Choices

**FoundryVTT Lifecycle:**
- 'init': Module registration, basic setup
- 'ready': Access to populated data, settings registration
- 'blacksmithUpdated': Real-time data updates

**Key Functions:**
- blacksmith.registerModule()
- blacksmith.utils.getSettingSafely()
- blacksmith.utils.postConsoleAndNotification()
- Hooks.on('blacksmithUpdated', callback)

**Critical Patterns to Follow:**
- Always check API availability before use
- Use standardized MODULE constants
- Implement proper error handling
- Use setTimeout for notifications
- Test integration with provided console commands

**Full Documentation:** https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API