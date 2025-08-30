# **Blacksmith External API Documentation**

> **For External Module Developers Only**
> 
> This document covers how **other FoundryVTT modules** can integrate with Coffee Pub Blacksmith. 
> 
> **If you're developing Blacksmith itself**, see `BLACKSMITH-ARCHITECTURE.md` for internal architecture details.

## **⚠️ Breaking Change Notice**

**Version 12.2.0+**: The API has been simplified to use global objects instead of async methods.

**Old way (broken):**
```javascript
const hookManager = await BlacksmithAPI.getHookManager();
const utils = await BlacksmithAPI.getUtils();
```

**New way (working):**
```javascript
const hookManager = BlacksmithHookManager;
const utils = BlacksmithUtils;
```

**Migration**: Update your code to use the global objects directly - no more `await` needed!

## **What This API Provides**

Coffee Pub Blacksmith offers a clean, reliable integration path for external modules through our **global object system**. This approach:

- ✅ **Handles timing issues automatically** - No more race conditions
- ✅ **Provides consistent interface** - Same API regardless of when you call it  
- ✅ **Manages availability checks** - Automatically waits for Blacksmith to be ready
- ✅ **Offers debugging tools** - Console commands to verify integration
- ✅ **Simple direct access** - No async/await complexity

## **Integration Philosophy**

We believe external modules should have a **simple, predictable interface** that doesn't break when Blacksmith's internal structure changes. The global object system provides this stability with direct access to all features.

## **Internal vs External APIs - What's the Difference?**

### **🔧 Internal API (for Blacksmith developers)**
- **Location**: `BLACKSMITH-ARCHITECTURE.md`
- **Access**: Direct manager access (e.g., `HookManager.registerHook()`)
- **Use case**: When developing Blacksmith itself
- **Example**: `scripts/blacksmith.js` uses internal APIs

### **🌐 External API (for other modules)**
- **Location**: This document (`BLACKSMITH-API.md`)
- **Access**: Global objects (e.g., `BlacksmithHookManager`, `BlacksmithUtils`)
- **Use case**: When your module wants to integrate with Blacksmith
- **Example**: Other Coffee Pub modules use external APIs

### **Why Two APIs?**
- **Internal**: Direct access for performance and flexibility
- **External**: Stable interface that won't break when internal structure changes
- **Bridge**: Handles timing issues and provides consistent experience

# **Quick Start - External Module Integration**

## **Step 1: Add Blacksmith as a Library Dependency**
Add Blacksmith to your module's `module.json` dependencies to get access to the API library:

```json
{
  "name": "your-module",
  "requires": [
    {
      "id": "coffee-pub-blacksmith",
      "type": "library",
      "manifest": "https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json"
    }
  ]
}
```

**What this means**: Once added as a library dependency, the API becomes available as global objects - no imports needed!

## **Step 2: Register Your Module (Required)**

**What to Replace:**
- `YOUR_MODULE_ID` → Your module's ID from `module.json` (e.g., "my-awesome-module")
- `YOUR_SHORT_NAME` → A short, readable name for logs (e.g., "MODULENAME" instead of "My Awesome Module Title")
- `YOUR_MODULE_VERSION` → Your module's version from `module.json` (e.g., "1.0.0")

**Why This Matters:**
- **Module ID**: Must match your `module.json` exactly
- **Short Name**: Makes console logs easier to read and filter
- **Version**: Helps with compatibility and debugging

```javascript
// === BEGIN: BLACKSMITH API REGISTRATION ===
// Blacksmoth API is available as global objects
// Register your module with Blacksmith
Hooks.once('init', async () => {
    try {
        // Get the module manager
        const moduleManager = BlacksmithModuleManager;
        // Register your module
        moduleManager.registerModule('YOUR_MODULE_ID', {
            name: 'YOUR_SHORT_NAME',
            version: 'YOUR_MODULE_VERSION'
        });
        // Log success
        console.log('✅ Module registered with Blacksmith successfully');
    } catch (error) {
        console.error('❌ Failed to register with Blacksmith:', error);
    }
});
// === END: BLACKSMITH API REGISTRATION ===
```

**Why register?**: This tells Blacksmith about your module and enables inter-module features.

## **Step 3: Test Your Integration**
Use these console commands to verify everything is working:

```javascript
// Check if Blacksmith API is ready
BlacksmithAPIStatus()

// Verify your module is registered
BlacksmithAPICheck()
```

## **Step 4: Start Using the API**
Now you can access Blacksmith's features directly:

```javascript
// Direct access - no await needed!
BlacksmithHookManager.registerHook(...)
BlacksmithUtils.postConsoleAndNotification(...)
BlacksmithModuleManager.registerModule(...)
``` 



***





# **Console Commands - Complete Reference**

> **Open your browser console (F12 → Console tab) to use these commands**

These console commands help you debug and monitor your Blacksmith integration. They're the **easiest way to verify everything is working**.

**💡 Copy-Paste Friendly**: Each group is in a single text box with comments. Copy the entire group to get the context, or run multiple commands at once!

## **🔍 Quick Status Checks**

```javascript
// Check if Blacksmith API is ready
BlacksmithAPIStatus()

// Verify your module registration
BlacksmithAPICheck()

// Get API version
BlacksmithAPIVersion()
```
**Quick Status Commands** - Use these to verify your integration is working.

## **📊 Detailed Information**

```javascript
// Get comprehensive debug information
BlacksmithAPIDetails()

// Show all registered modules
BlacksmithAPIModules()

// Display available features
BlacksmithAPIFeatures()
```
**Detailed Info Commands** - Use these for debugging and system overview.

## **⚙️ Hook Management (Advanced)**

```javascript
// Show hook summary
BlacksmithAPIHooks()

// Detailed hook information
BlacksmithAPIHookDetails()

// Hook statistics
BlacksmithAPIHookStats()
```
**Hook Management Commands** - Use these for debugging hook registrations and performance.

## **🔧 Utilities & Settings**

```javascript
// Show available utility functions
BlacksmithAPIUtils()

// Display Blacksmith settings
BlacksmithAPISettings()

// Show constants and themes
BlacksmithAPIConstants()

// Debug readiness issues
BlacksmithAPIManualReady()
```
**Utility Commands** - Use these to explore available functions and settings.

## **📋 Complete Command Reference**

For detailed information about what each command returns and displays:

| Command | Returns | Console Output |
|---------|---------|----------------|
| `BlacksmithAPIStatus()` | `true`/`false` | Ready/not ready status with details |
| `BlacksmithAPICheck()` | Object | Module count and registration list |
| `BlacksmithAPIVersion()` | String | Current API version (e.g., "12.2.0") |
| `BlacksmithAPIDetails()` | Object | Full debug status and system overview |
| `BlacksmithAPIModules()` | Object | All registered modules with details |
| `BlacksmithAPIFeatures()` | Object | Features grouped by source module |
| `BlacksmithAPIHooks()` | Object | Hook count, names, and summary data |
| `BlacksmithAPIHookDetails()` | Object | Hooks organized by priority levels |
| `BlacksmithAPIHookStats()` | Object | Statistical breakdown by priority/context |
| `BlacksmithAPIUtils()` | Object | Complete list of utility functions |
| `BlacksmithAPISettings()` | Object | All current configuration values |
| `BlacksmithAPIConstants()` | Object | Constants, themes, and sounds |
| `BlacksmithAPIManualReady()` | `true`/`false` | Manual readiness check for debugging |

## **✅ What You Should See:**

**If everything is working:**
```
✅ BlacksmithAPIStatus() → Shows "✅ READY" status
✅ BlacksmithAPICheck() → Shows your module in the list
✅ All commands return useful information
```

**If something is wrong:**
```
❌ "BlacksmithAPIStatus is not a function" → API not loaded
❌ "❌ NOT READY" status → Wait for Blacksmith to initialize
❌ Error messages → Check console for specific issues
```

**💡 Pro Tip**: Start with `BlacksmithAPIStatus()` - it's the quickest way to verify your integration is working!

---

# **AI Prompts & Integration Notes**

## **🤖 For AI Assistants**

If you're using AI to help with Blacksmith integration, here are the key points:

### **What to Tell AI:**
- "Use the BlacksmithAPI bridge for external module integration"
- "All methods return Promises that wait for Blacksmith to be ready"
- "Import from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`"
- "Use global objects like `BlacksmithHookManager` for direct access"

### **What NOT to Tell AI:**
- "Access HookManager directly" (this is internal API)
- "Use game.modules.get() directly" (use the bridge instead)
- "Import from scripts/manager-hooks.js" (this is internal)

### **Example AI Prompt:**
```
Help me integrate my FoundryVTT module with Coffee Pub Blacksmith using their external API. 
I need to register hooks and access their HookManager. Use the BlacksmithAPI bridge approach.
```

## **📝 Integration Checklist**

Before asking for help, verify:
- [ ] Blacksmith module is installed and active
- [ ] You're using the external API (BlacksmithAPI bridge)
- [ ] You've registered your module with Blacksmith
- [ ] You're handling async/await properly


***



# **Working Examples - External API Usage**

> **All examples use the BlacksmithAPI bridge for external modules**

**📋 Parameter Order**: All examples follow the recommended order: `name`, `description`, `context`, `priority`, `key`, `options`, `callback` (callback always last for readability).

**📋 API Usage**: All BlacksmithAPI methods return Promises that automatically wait for Blacksmith to be ready. Use `await` or `.then()` to handle the asynchronous nature.

## **Basic Hook Registration**
```javascript
// Direct access - no await needed!
const hookId = BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module',
    priority: 3,
    callback: (actor, changes) => {
        // My logic here
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Hook with All Parameters (Recommended Order)**
```javascript
// Example showing the recommended parameter order
const fullHookId = BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module',
    priority: 3,
    key: 'unique-actor-tracker', // Prevents duplicate registrations
    options: { 
        once: false,           // Don't auto-cleanup
        throttleMs: 100        // Max once per 100ms
    },
    callback: (actor, changes) => {
        // My logic here
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Combat Tracking Hook**
```javascript
// Combat-related hooks
const combatHookId = BlacksmithHookManager.registerHook({
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
```

## **UI Enhancement Hook**
```javascript
// UI enhancement hooks
const uiHookId = BlacksmithHookManager.registerHook({
    name: 'renderChatMessage',
    description: 'My module: Enhance chat messages',
    context: 'my-chat-enhancer', // For batch cleanup
    priority: 4, // Low priority - UI updates
    callback: (message, html, data) => {
        // Modify the HTML before display
        html.find('.message-content').addClass('my-enhanced-style');
    }
});
```

## **One-time Hook with Auto-cleanup**
```javascript
// One-time hooks with auto-cleanup
const welcomeHookId = BlacksmithHookManager.registerHook({
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

## **Performance-Optimized Hooks**
```javascript
// Throttle noisy hooks (e.g., updateToken)
const throttledHookId = BlacksmithHookManager.registerHook({
    name: 'updateToken',
    description: 'My module: Throttled token updates',
    context: 'my-token-tracker',
    priority: 4,
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
        console.log('Token updated:', token.name);
    }
});

// Debounce for final state (e.g., search input)
const debouncedHookId = BlacksmithHookManager.registerHook({
    name: 'searchInput',
    description: 'My module: Debounced search',
    context: 'my-search',
    priority: 4,
    options: { debounceMs: 300 }, // Wait 300ms after last input
    callback: (input) => {
        // Only runs after user stops typing
        console.log('Searching for:', input);
    }
});
```

## **Complete Module Initialization**
```javascript
// In your module's main file
import { BlacksmithAPI } from 'coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    try {
        // Register with Blacksmith
        BlacksmithModuleManager.registerModule('my-awesome-module', {
            name: 'My Awesome Module',
            version: '1.0.0',
            features: [
                { type: 'actor-tracking', data: { description: 'Tracks actor changes' } },
                { type: 'combat-enhancement', data: { description: 'Improves combat experience' } }
            ]
        });
        
        // Set up hooks
        const hookId = BlacksmithHookManager.registerHook({
            name: 'updateActor',
            description: 'My module: Track actor changes',
            context: 'my-awesome-module', // For batch cleanup
            priority: 3,
            callback: (actor, changes) => {
                // My logic here
                BlacksmithUtils.postConsoleAndNotification(
                    'my-awesome-module', 
                    'Actor updated!', 
                    { actorId: actor.id, changes }, 
                    false, 
                    false
                );
            }
        });
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```


***



# **Available APIs**

**📋 API Order**: APIs are ordered by most commonly used first - HookManager (core functionality), Utils (everyday helpers), ModuleManager (setup), and Stats API (advanced features).

## **HookManager - Centralized Hook Management**
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
    context: 'context-name',             // Optional: Batch cleanup identifier
    priority: 3,                         // Optional: 1-5, default: 3
    key: 'uniqueKey',                    // Optional: Dedupe protection
    options: {                            // Optional: Performance options
        once: true,                       // Auto-cleanup after first execution
        throttleMs: 50,                   // Max once per 50ms
        debounceMs: 300                   // Wait 300ms after last call
    },
    callback: (args) => { /* logic */ }   // Required: Your callback function - ALWAYS LAST
});
```

**IMPORTANT: Parameter Order**
The HookManager uses destructured parameters, so the order doesn't matter as long as you use the correct property names. However, for **readability and consistency**, we strongly recommend this order:
1. `name` (required)
2. `description` (optional)
3. `context` (optional)
4. `priority` (optional)
5. `key` (optional)
6. `options` (optional)
7. `callback` (required) - **ALWAYS LAST for readability**

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

**📚 See the Working Examples section above for complete hook registration examples with different use cases and performance optimizations.**


***



## **Utils - Utility Functions**
**Purpose**: Access to Blacksmith's utility functions for common operations

**Note**: For access to Blacksmith's global constants and choice arrays (themes, sounds, tables, etc.), use the global constants object:
```javascript
const themeChoices = BlacksmithConstants.arrThemeChoices;
const soundChoices = BlacksmithConstants.arrSoundChoices;
const tableChoices = BlacksmithConstants.arrTableChoices;
```

**Available Utilities**:
```javascript
// Console logging with debug support
utils.postConsoleAndNotification(
    'my-module-id',        // Module ID (string)
    'Message content',      // Main message
    result,                 // Result object (optional)
    false,                  // Debug flag (true = debug, false = system)
    false                   // Show notification (true = show, false = console only)
);

// Sound playback
utils.playSound('notification.mp3');

// Settings management
const setting = utils.getSettingSafely('my-module-id', 'setting-key', 'default');
utils.setSettingSafely('my-module-id', 'setting-key', 'newValue');

// Time and formatting utilities
const formattedTime = utils.formatTime(ms, 'colon');
const formattedDate = utils.generateFormattedDate('YYYY-MM-DD');
```

**Usage Examples**:
```javascript
// Log important events
BlacksmithUtils.postConsoleAndNotification(
    'my-awesome-module',
    'Hook registered successfully',
    { hookId, hookName: 'updateActor' }, // result object
    false, // System message (not debug)
    false  // No notification
);

// Play sounds for user feedback
BlacksmithUtils.playSound('success.mp3');

// Access Blacksmith version and constants
console.log('Blacksmith version:', BlacksmithAPI.version);
console.log('Available themes:', BlacksmithConstants.arrThemeChoices);
```


***



## **ModuleManager - Module Registration System**
**Purpose**: Register your module with Blacksmith and check feature availability

**Key Methods**:
```javascript
// Register your module with Blacksmith
moduleManager.registerModule('your-module-id', {
    name: 'Your Module Name',
    version: '1.0.0',
    features: [
        { type: 'combat-tracking', data: { description: 'Tracks combat statistics' } },
        { type: 'ui-enhancements', data: { description: 'Provides UI improvements' } }
    ]
});

// Check if a module is active
const isActive = moduleManager.isModuleActive('your-module-id');

// Get features for a specific module
const features = moduleManager.getModuleFeatures('your-module-id');
```

**Usage Examples**:
```javascript
// Register your module
BlacksmithModuleManager.registerModule('my-awesome-module', {
    name: 'My Awesome Module',
    version: '1.0.0',
    features: [
        { type: 'combat-tracking', data: { description: 'Tracks combat statistics' } },
        { type: 'statistics', data: { description: 'Provides player analytics' } },
        { type: 'ui-enhancements', data: { description: 'Improves user interface' } }
    ]
});

// Check if Blacksmith is available
if (BlacksmithModuleManager.isModuleActive('coffee-pub-blacksmith')) {
    console.log('Blacksmith is active and ready!');
}

// Get your module's features
const myFeatures = BlacksmithModuleManager.getModuleFeatures('my-awesome-module');
console.log('My module features:', myFeatures);
```




## **Stats API - Statistics and Analytics**
**Purpose**: Access to Blacksmith's statistics and tracking systems

**Key Methods**:
```javascript
// Get combat statistics
const combatStats = stats.combat.getCurrentStats();

// Get player statistics
const playerStats = await stats.player.getStats(actorId);

// Get specific stat categories
const attackStats = await stats.player.getStatCategory(actorId, 'attacks');
const roundSummary = stats.combat.getRoundSummary();
```

**Usage Examples**:
```javascript
// Get combat statistics
const combatStats = BlacksmithStats.combat.getCurrentStats();
console.log('Current combat stats:', combatStats);

// Get player statistics for a specific actor
const playerStats = await BlacksmithStats.player.getStats(actorId);
console.log('Player stats:', playerStats);

// Get specific stat categories
const attackStats = await BlacksmithStats.player.getStatCategory(actorId, 'attacks');
const healingStats = await BlacksmithStats.player.getStatCategory(actorId, 'healing');
```


***



# **Integration Patterns**

**📚 Note**: For complete, working examples of these patterns, see the **Working Examples** section above.

## **Module Initialization Pattern**
```javascript
// In your module's main file
import { BlacksmithAPI } from 'coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    try {
        // Register with Blacksmith
        BlacksmithModuleManager.registerModule('my-module', {
            name: 'My Module',
            version: '1.0.0',
            features: [
                { type: 'actor-tracking', data: { description: 'Tracks actor changes' } }
            ]
        });
        
        // Set up hooks
        const hookId = BlacksmithHookManager.registerHook({
            name: 'updateActor',
            description: 'My module: Track actor changes',
            context: 'my-module', // For batch cleanup
            priority: 3,
            callback: (actor, changes) => {
                // My logic here
                BlacksmithUtils.postConsoleAndNotification('my-module', 'Actor updated!', { actorId: actor.id, changes }, false, false);
            }
        });
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```


***



## **Feature Detection Pattern**
```javascript
// Check what features are available
if (BlacksmithHookManager) {
    console.log('HookManager available');
}

if (BlacksmithModuleManager) {
    console.log('ModuleManager available');
}

if (BlacksmithUtils) {
    console.log('Utilities available');
}

// Check if Blacksmith is ready
if (BlacksmithAPI.isReady) {
    console.log('Blacksmith is ready');
}
```


***



## **Error Handling Pattern**
```javascript
try {
    if (!BlacksmithHookManager) {
        throw new Error('HookManager not available');
    }
    
    const hookId = BlacksmithHookManager.registerHook({
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

# **Performance Considerations**

## **Hook Priority Guidelines**
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

## **Performance Optimization Options**
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






# **Debugging and Troubleshooting**

## **Console Commands**
Blacksmith provides console commands for debugging hook registrations:

```javascript
// Show all registered hooks
BlacksmithAPIHooks();

// Show detailed hook information with priority grouping
BlacksmithAPIHookDetails();

// Get raw hook statistics
BlacksmithAPIHookStats();
```

## **Common Issues and Solutions**

**Issue: "HookManager is not defined"**
```javascript
// Solution: Use global objects directly
BlacksmithHookManager.registerHook(...)
```

**Issue: Hook not executing**
```javascript
// Check if hook is registered
const stats = BlacksmithHookManager.getStats();
console.log('Registered hooks:', stats.hooks);

// Verify hook name is correct
// FoundryVTT hook names are case-sensitive
```

**Issue: Performance problems**
```javascript
// Use throttling for noisy hooks
BlacksmithHookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 100 }, // Reduce frequency
    // ...
});

// Use debouncing for user input
BlacksmithHookManager.registerHook({
    name: 'searchInput', 
    options: { debounceMs: 500 }, // Wait longer
    // ...
});
```

# **Best Practices**

## **1. Use Direct Global Access (RECOMMENDED)**
```javascript
// GOOD: Use global objects directly
BlacksmithHookManager.registerHook(...)
BlacksmithUtils.postConsoleAndNotification(...)
BlacksmithModuleManager.registerModule(...)

// ALTERNATIVE: Store references if you prefer
const hookManager = BlacksmithHookManager;
const utils = BlacksmithUtils;
```

**Why direct access is better:**
- **No extra variables** cluttering your scope
- **Always clear** where the API comes from
- **Consistent pattern** - same approach everywhere
- **Simpler code** - one less step

## **2. Always Use Contexts**
```javascript
// GOOD: Descriptive context for cleanup
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module-actor-tracking',
    // ...
});

// BAD: No context makes cleanup difficult
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    // Missing context
    // ...
});
```

## **3. Provide Clear Descriptions**
```javascript
// GOOD: Clear, descriptive hook description
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My Module: Track actor HP changes for health panel updates',
    // ...
});

// BAD: Vague description makes debugging hard
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'Updates stuff',
    // ...
});
```

## **3. Use Appropriate Priorities**
```javascript
// Use priority 3 (NORMAL) for most hooks
// Only use 1 or 2 for critical/core functionality
// Use 4 or 5 for cosmetic/debug features
```

## **4. Handle Errors Gracefully**
```javascript
// Always check if APIs are available
if (!BlacksmithAPI.isReady()) {
    console.warn('Blacksmith not ready, using fallback');
    // Fallback logic
    return;
}
```

## **5. Clean Up When Done**
```javascript
// Store hook IDs for cleanup
const myHookIds = [];

myHookIds.push(BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module',
    // ...
}));

// Clean up when module disables
Hooks.once('closeGame', () => {
    myHookIds.forEach(id => BlacksmithHookManager.removeCallback(id));
});
```

# **Testing**

## **Console Testing Commands**

Blacksmith provides console commands for testing and debugging:

```javascript
// Show all registered hooks
BlacksmithAPIHooks();

// Show detailed hook information with priority grouping
BlacksmithAPIHookDetails();

// Get raw hook statistics
BlacksmithAPIHookStats();
```

## **Integration Validation Checklist**

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

## **Basic API Availability Test**

```javascript
function testBasicAPI() {
    if (!BlacksmithUtils) {
        console.error('❌ Blacksmith Utils not available');
        return false;
    }
    
    if (!BlacksmithHookManager) {
        console.error('❌ HookManager not available');
        return false;
    }
    
    if (!BlacksmithModuleManager) {
        console.error('❌ ModuleManager not available');
        return false;
    }
    
    console.log('✅ Basic API test passed');
    return true;
}
```

## **Test Utility Functions**

```javascript
async function testUtilityFunctions() {
    if (!BlacksmithUtils) return false;
    
    try {
        // Test settings access
        const testValue = BlacksmithUtils.getSettingSafely('test-module', 'test-setting', 'default');
        console.log('✅ Settings access working:', testValue);
        
        // Test logging
        BlacksmithUtils.postConsoleAndNotification('test-module', 'Utility test', { testType: 'utility' }, false, false);
        console.log('✅ Logging working');
        
        // Test sound (if available)
        if (BlacksmithUtils.playSound) {
            BlacksmithUtils.playSound('notification.mp3');
            console.log('✅ Sound playback working');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Utility test failed:', error);
        return false;
    }
}
```

## **Test Safe Settings Access**

```javascript
async function testSettingsAccess() {
    if (!BlacksmithUtils) return false;
    
    try {
        // Test safe get
        const value = BlacksmithUtils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Safe get working:', value);
        
        // Test safe set
        BlacksmithUtils.setSettingSafely('my-module', 'test-setting', 'test-value');
        console.log('✅ Safe set working');
        
        // Verify the set worked
        const newValue = BlacksmithUtils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Setting verification working:', newValue);
        
        return true;
    } catch (error) {
        console.error('❌ Settings test failed:', error);
        return false;
    }
}
```

## **Test BLACKSMITH Object Access**

```javascript
async function testBLACKSMITHObject() {
    if (!BlacksmithConstants) return false;
    
    try {
        // Test choice arrays
        if (BlacksmithConstants.arrThemeChoices) {
            console.log('✅ Theme choices available:', BlacksmithConstants.arrThemeChoices.length);
        }
        
        if (BlacksmithConstants.arrSoundChoices) {
            console.log('✅ Sound choices available:', BlacksmithConstants.arrSoundChoices.length);
        }
        
        if (BlacksmithConstants.arrTableChoices) {
            console.log('✅ Table choices available:', BlacksmithConstants.arrTableChoices.length);
        }
        
        // Test default values
        if (BlacksmithConstants.strDefaultCardTheme) {
            console.log('✅ Default theme available:', BlacksmithConstants.strDefaultCardTheme);
        }
        
        return true;
    } catch (error) {
        console.error('❌ BLACKSMITH object test failed:', error);
        return false;
    }
}
```

## **Test Module Registration**

```javascript
async function testModuleRegistration() {
    if (!BlacksmithModuleManager) return false;
    
    try {
        // Test registration
        BlacksmithModuleManager.registerModule('test-module', {
            name: 'Test Module',
            version: '1.0.0',
            features: ['testing']
        });
        console.log('✅ Module registration working');
        
        // Test feature checking
        if (BlacksmithModuleManager.getModuleFeatures) {
            const features = BlacksmithModuleManager.getModuleFeatures('test-module');
            console.log('✅ Feature checking working:', features);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Module registration test failed:', error);
        return false;
    }
}
```

## **One-Liner Quick Test**

```javascript
// Quick test: Check if Blacksmith is available and ready
(() => {
    const status = {
        utils: !!BlacksmithUtils,
        hooks: !!BlacksmithHookManager,
        moduleManager: !!BlacksmithModuleManager,
        constants: !!BlacksmithConstants
    };
    console.log('Blacksmith Status:', status);
    return Object.values(status).every(Boolean);
})();
```

## **Common Issues and Troubleshooting**

## **Issue: "API not ready" errors**

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
    BlacksmithUtils.getSettingSafely('setting', 'default'); // May crash!
});

// GOOD: Check availability first
Hooks.once('ready', () => {
    if (BlacksmithUtils) {
        BlacksmithUtils.getSettingSafely('setting', 'default');
    }
});
```

## **Issue: "Function not found" errors**

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
const value = BlacksmithUtils.getSettingSafely('setting', 'default');

// GOOD: Check existence first
if (BlacksmithUtils) {
    const value = BlacksmithUtils.getSettingSafely('setting', 'default');
} else {
    // Fallback behavior
    const value = game.settings.get('my-module', 'setting') ?? 'default';
}
```

## **Issue: Empty choice arrays**

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

## **Issue: Settings not accessible**

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

## **Issue: Module not registering**

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

# **AI-Friendly Integration Prompts**

## **For CursorAI and Similar AI Coding Assistants**

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

IMPORTANT: Use the correct import path: 'coffee-pub-blacksmith/api/blacksmith-api.js'

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

## **For General AI Coding Assistance**

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

## **Quick Reference for AI Assistants**

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

* blacksmith.ModuleManager.registerModule()
* blacksmith.utils.getSettingSafely()
* blacksmith.utils.postConsoleAndNotification()
* Hooks.on('blacksmithUpdated', callback)

**Import Path:**
* 'coffee-pub-blacksmith/api/blacksmith-api.js'

**Critical Patterns to Follow:**

* Always check API availability before use
* Use standardized MODULE constants
* Implement proper error handling
* Use setTimeout for notifications
* Test integration with provided console commands

**Full Documentation:** <https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API>

# **Version Compatibility**

## **FoundryVTT Version Support**

- **FoundryVTT 12.x**: ✅ **FULLY SUPPORTED**
- **FoundryVTT 13.x**: ✅ **READY FOR COMPATIBILITY**

## **API Versioning**

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

## **Backward Compatibility**

Blacksmith maintains backward compatibility within major versions. When breaking changes are necessary, they will be:

1. **Announced in advance** through documentation updates
2. **Deprecated gradually** with migration guides
3. **Versioned appropriately** to prevent conflicts
4. **Documented clearly** with examples

# **Error Handling**

## **Comprehensive Error Handling Pattern**

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

## **Error Recovery Strategies**

1. **Graceful Degradation**: Provide fallback behavior when Blacksmith unavailable
2. **Retry Logic**: Attempt operations multiple times with delays
3. **User Notification**: Inform users when features are unavailable
4. **Logging**: Record errors for debugging and support

# **Support and Community**

## **Getting Help**

- **Documentation**: This file and related architecture docs
- **Console Commands**: Use `BlacksmithAPIHooks()` and `BlacksmithAPIHookDetails()`
- **Error Logging**: Check browser console for detailed error messages
- **GitHub Issues**: Report problems and request features

## **Contributing**

- **Report Issues**: Document any problems you encounter
- **Feature Requests**: Suggest improvements to the API
- **Examples**: Share your integration patterns with the community
- **Documentation**: Help improve this documentation

---

# **Summary of Key Integration Points**

## **✅ What Works:**
- **Import Path**: `'coffee-pub-blacksmith/api/blacksmith-api.js'`
- **Bridge File**: `BlacksmithAPI` class provides clean access
- **HookManager**: Full hook management with priority and cleanup
- **ModuleManager**: Module registration with feature tracking
- **Utils**: Safe settings access, logging, sound, formatting
- **Stats API**: Combat and player statistics access
- **BLACKSMITH Object**: Global constants and choice arrays

## **⚠️ Common Mistakes to Avoid:**
- **Wrong Import Path**: Don't use `/scripts/` - use `/api/`
- **Missing Module ID**: Always provide module ID for settings access
- **Incorrect Parameter Order**: Check parameter documentation carefully
- **Missing await**: Most API calls are async and require await

## **🔧 Integration Checklist:**
- [ ] Use correct import path: `/api/blacksmith-api.js`
- [ ] Wait for Blacksmith to be ready with `BlacksmithAPI.waitForReady()`
- [ ] Prepend "blacksmith" to variable names to avoid conflicts
- [ ] Always provide context for hook cleanup
- [ ] Use proper error handling and availability checks
- [ ] Test integration with provided console commands

---

**Last Updated**: Current session - API fully functional and documented  
**Status**: Production ready with comprehensive integration support  
**Next Milestone**: Enhanced API features and ecosystem integration

