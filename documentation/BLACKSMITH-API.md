# BLACKSMITH API DOCUMENTATION

## **Overview**
Coffee Pub Blacksmith provides a comprehensive API for other FoundryVTT modules to integrate with our features. This documentation covers how to consume our API, what's available, and examples of integration.

## **Quick Start**

### **OPTION 1: Drop-in Bridge File (RECOMMENDED)**
```javascript
import { BlacksmithAPI } from 'coffee-pub-blacksmith/api/blacksmith-api.js';

// Get specific APIs directly (prepend "blacksmith" to avoid naming conflicts)
const blacksmithHookManager = await BlacksmithAPI.getHookManager();
const blacksmithUtils = await BlacksmithAPI.getUtils();
const blacksmithModuleManager = await BlacksmithAPI.getModuleManager();

// Start using Blacksmith features immediately
const hookId = blacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Update something',
    context: 'my-module',
    priority: 3,
    callback: (actor, changes) => {
        // My logic here
    }
});
```

### **OPTION 2: Direct Module API Access**
```javascript
// Access through FoundryVTT's module system
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

if (blacksmith?.HookManager) {
    const hookId = blacksmith.HookManager.registerHook({
        name: 'updateActor',
        description: 'My module: Update something',
        context: 'my-module',
        priority: 3,
        callback: (actor, changes) => {
            // My logic here
        }
    });
}
```

***

## **Available APIs**

### **HookManager - Centralized Hook Management**
**Purpose**: Register and manage FoundryVTT hooks with priority ordering and cleanup

**Key Features**:
- **Priority-based execution** (1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest)
- **Context-based cleanup** for batch operations
- **Throttle/debounce support** for performance optimization
- **Dedupe protection** to prevent duplicate registrations
- **Automatic cleanup** for "once" hooks

**Core Methods**:
```javascript
// Register a hook
const callbackId = hookManager.registerHook({
    name: 'hookName',                    // Required: FoundryVTT hook name
    description: 'Description',           // Optional: Human-readable description
    priority: 3,                         // Optional: 1-5, default: 3
    callback: (args) => { /* logic */ }, // Required: Your callback function
    options: {                            // Optional: Performance options
        once: true,                       // Auto-cleanup after first execution
        throttleMs: 50,                   // Max once per 50ms
        debounceMs: 300                   // Wait 300ms after last call
    },
    key: 'uniqueKey',                    // Optional: Dedupe protection
    context: 'context-name'              // Optional: Batch cleanup identifier
});
```

**IMPORTANT: Parameter Order**
The HookManager uses destructured parameters, so the order doesn't matter as long as you use the correct property names. However, for consistency, we recommend this order:
1. `name` (required)
2. `description` (optional)
3. `context` (optional)
4. `priority` (optional)
5. `options` (optional)
6. `key` (optional)
7. `callback` (required) - **Always last for readability**

**What We Actually Support:**
- **Required**: `name`, `callback`
- **Optional**: `description`, `priority`, `options`, `key`, `context`
- **Options**: `once`, `throttleMs`, `debounceMs`
- **Performance**: Throttling and debouncing work as documented
- **Cleanup**: `once: true` auto-removes hooks after first execution
- **Dedupe**: `key` prevents duplicate registrations
- **Batch cleanup**: `context` enables group removal

**Usage Examples**:

```javascript
// Remove a specific callback
const removed = hookManager.removeCallback(callbackId);

// Cleanup by context
hookManager.disposeByContext('context-name');

// Get statistics and debugging info
hookManager.showHooks();
hookManager.showHookDetails();
hookManager.getStats();
```


```javascript
// Combat-related hooks
const combatHookId = blacksmithHookManager.registerHook({
    name: 'updateCombat',
    description: 'My module: Track combat changes',
    context: 'my-combat-tracker', // For batch cleanup
    priority: 2, // High priority - core functionality
    callback: (combat, changed) => {
        if (changed.round !== undefined) {
            console.log(`Round changed to ${changed.round}`);
        }
    }
});

// UI enhancement hooks
const uiHookId = blacksmithHookManager.registerHook({
    name: 'renderChatMessage',
    description: 'My module: Enhance chat messages',
    context: 'my-chat-enhancer', // For batch cleanup
    priority: 4, // Low priority - UI updates
    callback: (message, html, data) => {
        // Modify the HTML before display
        html.find('.message-content').addClass('my-enhanced-style');
    }
});

// One-time hooks with auto-cleanup
const welcomeHookId = blacksmithHookManager.registerHook({
    name: 'userLogin',
    description: 'My module: Welcome message',
    context: 'my-welcome', // For batch cleanup
    priority: 5, // Lowest priority
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        console.log(`Welcome back, ${user.name}!`);
    }
});
```

***


### **ModuleManager - Module Registration System**
**Purpose**: Register your module with Blacksmith and check feature availability

**Key Methods**:
```javascript
// Register your module with Blacksmith
moduleManager.registerModule('your-module-id', ['feature1', 'feature2']);

// Check if a module is active
const isActive = moduleManager.isModuleActive('your-module-id');

// Get features for a specific module
const features = moduleManager.getModuleFeatures('your-module-id');
```

**Usage Examples**:
```javascript
// Register your module
blacksmithModuleManager.registerModule('my-awesome-module', [
    'combat-tracking',
    'statistics',
    'ui-enhancements'
]);

// Check if Blacksmith is available
if (blacksmithModuleManager.isModuleActive('coffee-pub-blacksmith')) {
    console.log('Blacksmith is active and ready!');
}

// Get your module's features
const myFeatures = blacksmithModuleManager.getModuleFeatures('my-awesome-module');
console.log('My module features:', myFeatures);
```

***

### **Utils - Utility Functions**
**Purpose**: Access to Blacksmith's utility functions for common operations

**Available Utilities**:
```javascript
// Console logging with debug support
utils.postConsoleAndNotification(
    'My Module',           // Module name, usually MODULE.NAME
    'Message content',      // Main message
    result,                 // result
    true,                   // true if this is Debug, false if it is a system message
    false                   // Show notification
);
```

**⚠️ Console Logging Parameters:**
- **Parameter 1**: Module name (usually `MODULE.NAME`)
- **Parameter 2**: Main message content
- **Parameter 3**: Result object (any data you want to log)
- **Parameter 4**: `true` = Debug message, `false` = System message
- **Parameter 5**: `true` = Show notification, `false` = Console only
- **Console output**: Always shown regardless of parameters

// Sound playback
utils.playSound('notification.mp3');

// Settings management
const setting = utils.getSettingSafely('mySetting', 'default');
utils.setSettingSafely('mySetting', 'newValue');

// Constants
console.log('Blacksmith version:', utils.COFFEEPUB.VERSION);
```

**Usage Examples**:
```javascript
// Log important events
blacksmithUtils.postConsoleAndNotification(
    'My Module',
    'Hook registered successfully',
    { hookId, hookName: 'updateActor' }, // result object
    false, // System message (not debug)
    false  // No notification
);

// Play sounds for user feedback
blacksmithUtils.playSound('success.mp3');

// Access Blacksmith constants
if (blacksmithUtils.COFFEEPUB.VERSION >= '12.0.0') {
    console.log('Using FoundryVTT 12+ features');
}
```

***


### **Stats API - Statistics and Analytics**
**Purpose**: Access to Blacksmith's statistics and tracking systems

**Key Methods**:
```javascript
// Get combat statistics
const combatStats = stats.getCombatStats();

// Get player statistics
const playerStats = stats.getPlayerStats();

// Record custom events
stats.recordEvent('my-module', 'custom-action', { data: 'value' });
```

**Usage Examples**:
```javascript
// Track custom module usage
blacksmithStats.recordEvent('my-module', 'feature-used', {
    feature: 'combat-tracking',
    timestamp: Date.now(),
    userId: game.user.id
});

// Get existing statistics
const allStats = blacksmithStats.getAllStats();
console.log('Available statistics:', allStats);
```

***

## **Integration Patterns**

### **Module Initialization Pattern**
```javascript
// In your module's main file
import { BlacksmithAPI } from 'coffee-pub-blacksmith/scripts/blacksmith-api.js';

Hooks.once('ready', async () => {
    try {
        // Wait for Blacksmith to be ready
        const blacksmith = await BlacksmithAPI.get();
        
        // Register with Blacksmith
        blacksmith.ModuleManager.registerModule('my-module', ['feature1', 'feature2']);
        
        // Set up hooks
const hookId = blacksmith.HookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module', // For batch cleanup
    priority: 3,
    callback: (actor, changes) => {
        // My logic here
        blacksmith.utils.postConsoleAndNotification('My Module', 'Actor updated!', { actorId: actor.id, changes }, false, false);
    }
});
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```

***

### **Feature Detection Pattern**
```javascript
// Check what features are available
const blacksmith = await BlacksmithAPI.get();

if (blacksmith.HookManager) {
    console.log('HookManager available');
}

if (blacksmith.ModuleManager) {
    console.log('ModuleManager available');
}

if (blacksmith.utils) {
    console.log('Utilities available');
}

// Check specific features
if (await BlacksmithAPI.hasFeature('HookManager')) {
    console.log('HookManager feature is available');
}
```

***

### **Error Handling Pattern**
```javascript
try {
    const hookManager = BlacksmithAPI.getHookManager();
    
    if (!hookManager) {
        throw new Error('HookManager not available');
    }
    
    const hookId = hookManager.registerHook({
        name: 'updateActor',
        description: 'My module: Actor update handler',
        context: 'my-module',
        priority: 3,
        callback: (actor, changes) => {
            // My logic here
        }
    });
    
    console.log('Hook registered successfully:', hookId);
    
} catch (error) {
    console.error('Failed to register hook:', error);
    
    // Fallback to direct FoundryVTT hooks
    Hooks.on('updateActor', (actor, changes) => {
        // My logic here
    });
}
```

## **Performance Considerations**

### **Hook Priority Guidelines**
```javascript
// Priority 1 (CRITICAL) - System cleanup, critical features
// Use for: Must-run-first operations, system integrity
hookManager.registerHook({
    name: 'closeGame',
    priority: 1,
    // ...
});

// Priority 2 (HIGH) - Core functionality, data validation  
// Use for: Core features, data integrity, early processing
hookManager.registerHook({
    name: 'updateActor',
    priority: 2,
    // ...
});

// Priority 3 (NORMAL) - Standard features
// Use for: Most hooks, standard functionality
hookManager.registerHook({
    name: 'renderChatMessage',
    priority: 3, // Default
    // ...
});

// Priority 4 (LOW) - Nice-to-have features, UI updates
// Use for: UI enhancements, cosmetic features
hookManager.registerHook({
    name: 'renderApplication',
    priority: 4,
    // ...
});

// Priority 5 (LOWEST) - Cosmetic features, debug hooks
// Use for: Debug logging, cosmetic updates
hookManager.registerHook({
    name: 'renderPlayerList',
    priority: 5,
    // ...
});
```

### **Performance Optimization Options**
```javascript
// Throttle noisy hooks (e.g., updateToken)
hookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
    }
});

// Debounce for final state (e.g., search input)
hookManager.registerHook({
    name: 'searchInput',
    options: { debounceMs: 300 }, // Wait 300ms after last input
    callback: (input) => {
        // Only runs after user stops typing
    }
});

// One-time hooks with auto-cleanup
hookManager.registerHook({
    name: 'userLogin',
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        // Hook automatically removes itself after this runs
    }
});
```

## **Debugging and Troubleshooting**

### **Console Commands**
Blacksmith provides console commands for debugging hook registrations:

```javascript
// Show all registered hooks
blacksmithHooks();

// Show detailed hook information with priority grouping
blacksmithHookDetails();

// Get raw hook statistics
blacksmithHookStats();
```

### **Common Issues and Solutions**

**Issue: "HookManager is not defined"**
```javascript
// Solution: Ensure proper import
import { BlacksmithAPI } from 'coffee-pub-blacksmith/scripts/blacksmith-api.js';

// Or use the bridge file approach
const hookManager = BlacksmithAPI.getHookManager();
```

**Issue: Hook not executing**
```javascript
// Check if hook is registered
const stats = hookManager.getStats();
console.log('Registered hooks:', stats.hooks);

// Verify hook name is correct
// FoundryVTT hook names are case-sensitive
```

**Issue: Performance problems**
```javascript
// Use throttling for noisy hooks
hookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 100 }, // Reduce frequency
    // ...
});

// Use debouncing for user input
hookManager.registerHook({
    name: 'searchInput', 
    options: { debounceMs: 500 }, // Wait longer
    // ...
});
```

## **Best Practices**

### **1. Use Descriptive Variable Names (IMPORTANT)**
```javascript
// GOOD: Prepend "blacksmith" to avoid naming conflicts
const blacksmithHookManager = await BlacksmithAPI.getHookManager();
const blacksmithUtils = await BlacksmithAPI.getUtils();
const blacksmithModuleManager = await BlacksmithAPI.getModuleManager();

// BAD: Generic names can conflict with existing variables
const utils = await BlacksmithAPI.getUtils();        // Might conflict with existing utils
const hook = await BlacksmithAPI.getHookManager(); // Might conflict with existing hookManager
```

**Why this matters:**
- **Prevents naming conflicts** with variables your module already has
- **Makes code more readable** - clear where APIs come from
- **Follows FoundryVTT best practices** for module integration
- **Easier debugging** - no confusion about variable sources

### **2. Always Use Contexts**
```javascript
// GOOD: Descriptive context for cleanup
hookManager.registerHook({
    name: 'updateActor',
    context: 'my-module-actor-tracking',
    // ...
});

// BAD: No context makes cleanup difficult
hookManager.registerHook({
    name: 'updateActor',
    // Missing context
    // ...
});
```

### **2. Provide Clear Descriptions**
```javascript
// GOOD: Clear, descriptive hook description
hookManager.registerHook({
    name: 'updateActor',
    description: 'My Module: Track actor HP changes for health panel updates',
    // ...
});

// BAD: Vague description makes debugging hard
hookManager.registerHook({
    name: 'updateActor',
    description: 'Updates stuff',
    // ...
});
```

### **3. Use Appropriate Priorities**
```javascript
// Use priority 3 (NORMAL) for most hooks
// Only use 1 or 2 for critical/core functionality
// Use 4 or 5 for cosmetic/debug features
```

### **4. Handle Errors Gracefully**
```javascript
// Always check if APIs are available
if (!BlacksmithAPI.isReady()) {
    console.warn('Blacksmith not ready, using fallback');
    // Fallback logic
    return;
}
```

### **5. Clean Up When Done**
```javascript
// Store hook IDs for cleanup
const myHookIds = [];

myHookIds.push(hookManager.registerHook({
    name: 'updateActor',
    context: 'my-module',
    // ...
}));

// Clean up when module disables
Hooks.once('closeGame', () => {
    myHookIds.forEach(id => hookManager.removeCallback(id));
});
```

## **Testing**

### **Console Testing Commands**

Blacksmith provides console commands for testing and debugging:

```javascript
// Show all registered hooks
blacksmithHooks();

// Show detailed hook information with priority grouping
blacksmithHookDetails();

// Get raw hook statistics
blacksmithHookStats();
```

### **Integration Validation Checklist**

Use this checklist to verify your integration:

- [ ] Module registers successfully with Blacksmith
- [ ] API availability checks work correctly
- [ ] Hook registration succeeds without errors
- [ ] Utility functions return expected results
- [ ] Settings access works safely
- [ ] Error handling provides appropriate fallbacks
- [ ] Cleanup functions work when module disables
- [ ] No console errors during startup
- [ ] No console errors during normal operation

### **Basic API Availability Test**

```javascript
function testBasicAPI() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    if (!blacksmith) {
        console.error('❌ Blacksmith module not found');
        return false;
    }
    
    if (!blacksmith.utils?.getSettingSafely) {
        console.error('❌ Blacksmith API not ready');
        return false;
    }
    
    if (!blacksmith.HookManager) {
        console.error('❌ HookManager not available');
        return false;
    }
    
    console.log('✅ Basic API test passed');
    return true;
}
```

### **Test Utility Functions**

```javascript
async function testUtilityFunctions() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils) return false;
    
    try {
        // Test settings access
        const testValue = blacksmith.utils.getSettingSafely('test', 'default');
        console.log('✅ Settings access working:', testValue);
        
        // Test logging
        blacksmith.utils.postConsoleAndNotification('Test', 'Utility test', { testType: 'utility' }, false, false);
        console.log('✅ Logging working');
        
        // Test sound (if available)
        if (blacksmith.utils.playSound) {
            blacksmith.utils.playSound('notification.mp3');
            console.log('✅ Sound playback working');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Utility test failed:', error);
        return false;
    }
}
```

### **Test Safe Settings Access**

```javascript
async function testSettingsAccess() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils) return false;
    
    try {
        // Test safe get
        const value = blacksmith.utils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Safe get working:', value);
        
        // Test safe set
        blacksmith.utils.setSettingSafely('my-module', 'test-setting', 'test-value');
        console.log('✅ Safe set working');
        
        // Verify the set worked
        const newValue = blacksmith.utils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Setting verification working:', newValue);
        
        return true;
    } catch (error) {
        console.error('❌ Settings test failed:', error);
        return false;
    }
}
```

### **Test BLACKSMITH Object Access**

```javascript
async function testBLACKSMITHObject() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.BLACKSMITH) return false;
    
    try {
        // Test choice arrays
        if (blacksmith.BLACKSMITH.arrThemeChoices) {
            console.log('✅ Theme choices available:', blacksmith.BLACKSMITH.arrThemeChoices.length);
        }
        
        if (blacksmith.BLACKSMITH.arrSoundChoices) {
            console.log('✅ Sound choices available:', blacksmith.BLACKSMITH.arrSoundChoices.length);
        }
        
        if (blacksmith.BLACKSMITH.arrTableChoices) {
            console.log('✅ Table choices available:', blacksmith.BLACKSMITH.arrTableChoices.length);
        }
        
        // Test default values
        if (blacksmith.BLACKSMITH.strDefaultCardTheme) {
            console.log('✅ Default theme available:', blacksmith.BLACKSMITH.strDefaultCardTheme);
        }
        
        return true;
    } catch (error) {
        console.error('❌ BLACKSMITH object test failed:', error);
        return false;
    }
}
```

### **Test Module Registration**

```javascript
async function testModuleRegistration() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.registerModule) return false;
    
    try {
        // Test registration
        blacksmith.registerModule('test-module', {
            name: 'Test Module',
            version: '1.0.0',
            features: ['testing']
        });
        console.log('✅ Module registration working');
        
        // Test feature checking
        if (blacksmith.getModuleFeatures) {
            const features = blacksmith.getModuleFeatures('test-module');
            console.log('✅ Feature checking working:', features);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Module registration test failed:', error);
        return false;
    }
}
```

### **One-Liner Quick Test**

```javascript
// Quick test: Check if Blacksmith is available and ready
(() => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const status = {
        module: !!blacksmith,
        api: !!(blacksmith?.utils?.getSettingSafely),
        hooks: !!(blacksmith?.HookManager),
        utils: !!(blacksmith?.utils)
    };
    console.log('Blacksmith Status:', status);
    return Object.values(status).every(Boolean);
})();
```

### **Common Issues and Troubleshooting**

#### **Issue: "API not ready" errors**

**Symptoms:**
- Console errors about functions not being available
- Module crashes during initialization
- Hooks not registering

**Solutions:**
1. **Use proper timing**: Wait for `ready` hook, not `init`
2. **Check availability**: Always verify API exists before use
3. **Add retry logic**: Use polling or event-based ready detection
4. **Check module order**: Ensure Blacksmith loads before your module

**Code Fix:**
```javascript
// BAD: Assumes API is ready
Hooks.once('init', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    blacksmith.utils.getSettingSafely('setting', 'default'); // May crash!
});

// GOOD: Check availability first
Hooks.once('ready', async () => {
    const blacksmith = await waitForBlacksmith();
    if (blacksmith?.utils?.getSettingSafely) {
        blacksmith.utils.getSettingSafely('setting', 'default');
    }
});
```

#### **Issue: "Function not found" errors**

**Symptoms:**
- `TypeError: blacksmith.utils.getSettingSafely is not a function`
- `Cannot read property 'registerHook' of undefined`

**Solutions:**
1. **Check API structure**: Verify the function exists before calling
2. **Use optional chaining**: `blacksmith?.utils?.getSettingSafely?.()`
3. **Add fallbacks**: Provide alternative behavior when functions unavailable
4. **Check version compatibility**: Ensure you're using the correct API version

**Code Fix:**
```javascript
// BAD: No existence check
const value = blacksmith.utils.getSettingSafely('setting', 'default');

// GOOD: Check existence first
if (blacksmith?.utils?.getSettingSafely) {
    const value = blacksmith.utils.getSettingSafely('setting', 'default');
} else {
    // Fallback behavior
    const value = game.settings.get('my-module', 'setting') ?? 'default';
}
```

#### **Issue: Empty choice arrays**

**Symptoms:**
- Dropdown menus show no options
- Settings registration fails
- Choice arrays are empty or undefined

**Solutions:**
1. **Wait for data**: Use `blacksmithUpdated` hook to detect when data is ready
2. **Check timing**: Ensure you're accessing data after Blacksmith is fully initialized
3. **Add fallbacks**: Provide default choices if arrays are empty
4. **Verify data source**: Check if Blacksmith has the expected data

**Code Fix:**
```javascript
// BAD: Access immediately (may be empty)
Hooks.once('ready', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const choices = blacksmith.BLACKSMITH.arrThemeChoices; // May be empty!
});

// GOOD: Wait for data to be ready
Hooks.on('blacksmithUpdated', (data) => {
    if (data.type === 'ready') {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        const choices = blacksmith.BLACKSMITH.arrThemeChoices; // Should be populated
    }
});
```

#### **Issue: Settings not accessible**

**Symptoms:**
- `"module.setting" is not a registered game setting`
- Settings registration fails
- Cannot access module settings

**Solutions:**
1. **Register settings first**: Ensure settings are registered before accessing
2. **Use safe access**: Use `getSettingSafely` instead of direct access
3. **Check module ID**: Verify the module ID matches exactly
4. **Add fallbacks**: Provide default values when settings unavailable

**Code Fix:**
```javascript
// BAD: Direct access without registration
const value = game.settings.get('my-module', 'setting');

// GOOD: Safe access with fallback
const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');

// BETTER: Register settings first, then access
Hooks.once('ready', () => {
    game.settings.register('my-module', 'setting', {
        type: String,
        default: 'default'
    });
    
    const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');
});
```

#### **Issue: Module not registering**

**Symptoms:**
- Module doesn't appear in Blacksmith's module list
- Registration function not found
- No confirmation of successful registration

**Solutions:**
1. **Check timing**: Register during `init` hook, not later
2. **Verify function**: Ensure `registerModule` exists before calling
3. **Check parameters**: Provide required name and version
4. **Add error handling**: Catch and log registration errors

**Code Fix:**
```javascript
// BAD: No error handling or availability check
Hooks.once('init', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    blacksmith.registerModule('my-module', {}); // May fail silently
});

// GOOD: Proper error handling and availability check
Hooks.once('init', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    if (blacksmith?.registerModule) {
        try {
            blacksmith.registerModule('my-module', {
                name: 'My Module',
                version: '1.0.0'
            });
            console.log('✅ Module registered successfully');
        } catch (error) {
            console.error('❌ Module registration failed:', error);
        }
    } else {
        console.warn('⚠️ Blacksmith registration not available');
    }
});
```

## **AI-Friendly Integration Prompts**

### **For CursorAI and Similar AI Coding Assistants**

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

The full API documentation is available at: https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API/

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

### **For General AI Coding Assistance**

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

### **Quick Reference for AI Assistants**

**Essential Integration Points:**

* Register module during 'init' hook
* Access BLACKSMITH object during 'ready' hook
* Listen to 'blacksmithUpdated' hook for data updates
* Use getSettingSafely() for safe settings access
* Access choice arrays via blacksmith.BLACKSMITH.arr\[Type\]Choices

**FoundryVTT Lifecycle:**

* 'init': Module registration, basic setup
* 'ready': Access to populated data, settings registration
* 'blacksmithUpdated': Real-time data updates

**Key Functions:**

* blacksmith.registerModule()
* blacksmith.utils.getSettingSafely()
* blacksmith.utils.postConsoleAndNotification()
* Hooks.on('blacksmithUpdated', callback)

**Critical Patterns to Follow:**

* Always check API availability before use
* Use standardized MODULE constants
* Implement proper error handling
* Use setTimeout for notifications
* Test integration with provided console commands

**Full Documentation:** <https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API>

## **Version Compatibility**

### **FoundryVTT Version Support**

- **FoundryVTT 12.x**: ✅ **FULLY SUPPORTED**
- **FoundryVTT 13.x**: ✅ **READY FOR COMPATIBILITY**

### **API Versioning**

```javascript
// Check Blacksmith version
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const version = blacksmith?.version || 'unknown';
console.log('Blacksmith version:', version);

// Version-specific features
if (version >= '12.0.0') {
    // Use FoundryVTT 12+ features
}
```

### **Backward Compatibility**

Blacksmith maintains backward compatibility within major versions. When breaking changes are necessary, they will be:

1. **Announced in advance** through documentation updates
2. **Deprecated gradually** with migration guides
3. **Versioned appropriately** to prevent conflicts
4. **Documented clearly** with examples

## **Error Handling**

### **Comprehensive Error Handling Pattern**

```javascript
class BlacksmithErrorHandler {
    static async safeOperation(operation, fallback = null) {
        try {
            const blacksmith = await this.getBlacksmith();
            return await operation(blacksmith);
        } catch (error) {
            console.error('Blacksmith operation failed:', error);
            return fallback;
        }
    }
    
    static async getBlacksmith() {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (!blacksmith?.utils?.getSettingSafely) {
            throw new Error('Blacksmith API not ready');
        }
        return blacksmith;
    }
}

// Usage
const result = await BlacksmithErrorHandler.safeOperation(
    async (blacksmith) => {
        return blacksmith.utils.getSettingSafely('setting', 'default');
    },
    'fallback-value'
);
```

### **Error Recovery Strategies**

1. **Graceful Degradation**: Provide fallback behavior when Blacksmith unavailable
2. **Retry Logic**: Attempt operations multiple times with delays
3. **User Notification**: Inform users when features are unavailable
4. **Logging**: Record errors for debugging and support

## **Support and Community**

### **Getting Help**

- **Documentation**: This file and related architecture docs
- **Console Commands**: Use `blacksmithHooks()` and `blacksmithHookDetails()`
- **Error Logging**: Check browser console for detailed error messages
- **GitHub Issues**: Report problems and request features

### **Contributing**

- **Report Issues**: Document any problems you encounter
- **Feature Requests**: Suggest improvements to the API
- **Examples**: Share your integration patterns with the community
- **Documentation**: Help improve this documentation

---

**Last Updated**: Current session - API fully functional and documented  
**Status**: Production ready with comprehensive integration support  
**Next Milestone**: Enhanced API features and ecosystem integration

