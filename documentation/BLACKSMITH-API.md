# BLACKSMITH API DOCUMENTATION

## **Overview**
Coffee Pub Blacksmith provides a comprehensive API for other FoundryVTT modules to integrate with our features. This documentation covers how to consume our API, what's available, and examples of integration.

## **Quick Start**

### **Option 1: Drop-in Bridge File (RECOMMENDED)**
```javascript
import { BlacksmithAPI } from 'coffee-pub-blacksmith/scripts/blacksmith-api.js';

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

### **Option 2: Direct Module API Access**
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
    name: 'hookName',
    description: 'Human-readable description',
    context: 'context-name',
    priority: 3, // 1-5, default: 3
    callback: (args) => { /* your logic */ },
    options: { once: true, throttleMs: 50, debounceMs: 300 },
    key: 'uniqueKey' // Optional dedupe
});

// Remove a specific callback
const removed = hookManager.removeCallback(callbackId);

// Cleanup by context
hookManager.disposeByContext('context-name');

// Get statistics and debugging info
hookManager.showHooks();
hookManager.showHookDetails();
hookManager.getStats();
```

**Usage Examples**:
```javascript
// Combat-related hooks
const combatHookId = blacksmithHookManager.registerHook({
    name: 'updateCombat',
    description: 'My module: Track combat changes',
    context: 'my-combat-tracker',
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
    context: 'my-chat-enhancer',
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
    context: 'my-welcome',
    priority: 5, // Lowest priority
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        console.log(`Welcome back, ${user.name}!`);
    }
});
```

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

### **Utils - Utility Functions**
**Purpose**: Access to Blacksmith's utility functions for common operations

**Available Utilities**:
```javascript
// Console logging with debug support
utils.postConsoleAndNotification(
    'My Module',           // Module name
    'Message content',      // Main message
    { data: 'extra' },     // Additional data
    true,                   // Show in console
    false                   // Show notification
);

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
    { hookId, hookName: 'updateActor' },
    true,
    false
);

// Play sounds for user feedback
blacksmithUtils.playSound('success.mp3');

// Access Blacksmith constants
if (blacksmithUtils.COFFEEPUB.VERSION >= '12.0.0') {
    console.log('Using FoundryVTT 12+ features');
}
```

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
            context: 'my-module',
            priority: 3,
            callback: (actor, changes) => {
                // My logic here
                blacksmith.utils.postConsoleAndNotification('My Module', 'Actor updated!', {}, true, false);
            }
        });
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```

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
const hookManager = await BlacksmithAPI.getHookManager(); // Might conflict with existing hookManager
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

## **Version Compatibility**

### **FoundryVTT Version Support**
- **FoundryVTT 12.x**: ✅ **FULLY SUPPORTED**
- **FoundryVTT 13.x**: ✅ **READY FOR COMPATIBILITY**

### **API Versioning**
```javascript
// Check Blacksmith version
const version = BlacksmithAPI.getVersion();
console.log('Blacksmith version:', version);

// Version-specific features
if (version >= '12.0.0') {
    // Use FoundryVTT 12+ features
}
```

## **Support and Community**

### **Getting Help**
- **Documentation**: This file and related architecture docs
- **Console Commands**: Use `blacksmithHooks()` and `blacksmithHookDetails()`
- **Error Logging**: Check browser console for detailed error messages

### **Contributing**
- **Report Issues**: Document any problems you encounter
- **Feature Requests**: Suggest improvements to the API
- **Examples**: Share your integration patterns with the community

---

**Last Updated**: Current session - API fully functional and documented
**Status**: Production ready with comprehensive integration support
**Next Milestone**: Enhanced API features and ecosystem integration
