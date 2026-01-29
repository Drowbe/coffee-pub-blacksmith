# HookManager - Correct Implementation Approach

**Audience:** Contributors to the Blacksmith codebase.

## **The Right Way: Simple Orchestration Layer**

The HookManager should act as an **orchestration layer** where you just register a hook and a callback. It should be simple, not complex.

## **How It Should Work (Your Flow)**

```
FoundryVTT Event → HookManager → Your Callback → Your Logic
     ↓              ↓              ↓              ↓
Actor Updated → Hook Fired → Your Function → Update Health Panel
```

## **Core Principles**

### **Parameter Order (CRITICAL)**
```javascript
HookManager.registerHook({
    name: 'hookName',           // 1. FoundryVTT hook name
    description: 'Description',  // 2. Human-readable description
    context: 'context-name',     // 3. String for batch cleanup
    priority: 3,                // 4. Execution priority (1-5)
    callback: (args) => {       // 5. Your function to execute
        // Your logic here
    }
});
```

**⚠️ WARNING: Parameter order is strict and must be exact!**

### **When NOT to Use HookManager**

**Avoid using HookManager for these FoundryVTT lifecycle hooks:**
- `Hooks.once('init', ...)` - Module initialization
- `Hooks.once('ready', ...)` - Module ready state
- `Hooks.once('setup', ...)` - Game setup

**Why?**
- These are one-time events that don't need priority management
- They're too critical to risk HookManager abstraction
- They're already working perfectly with FoundryVTT's native system
- HookManager is designed for recurring hooks that need ongoing management

**Use HookManager for:**
- Recurring hooks (`renderChatMessage`, `updateCombat`, etc.)
- Hooks that need priority ordering
- Hooks that need context-based cleanup
- Custom application hooks

### **Priority System (1-5)**
```javascript
priority: 1,  // CRITICAL - runs first (system cleanup, critical features)
priority: 2,  // HIGH - runs early (core functionality, data validation)
priority: 3,  // NORMAL - default (most hooks, standard features)
priority: 4,  // LOW - runs later (nice-to-have features, UI updates)
priority: 5,  // LOWEST - runs last (cosmetic features, debug hooks)
```

**Execution Order:**
- **Priority 1 hooks execute first** (critical system operations)
- **Priority 2 hooks execute second** (core functionality)
- **Priority 3 hooks execute third** (normal operations)
- **Priority 4 hooks execute fourth** (low-priority features)
- **Priority 5 hooks execute last** (cosmetic/debug features)

**Within the same priority level**, hooks execute in the order they were registered.

### **1. Simple Registration**
```javascript
// This is what you want - simple and clean
HookManager.registerHook({
    name: 'updateActor',
    description: 'Updates health panel when actor HP changes',
    context: 'health-panel',
    priority: 3, // 1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest
    callback: (actor, changes) => {
        // Your logic here - update health panel, etc.
        if (changes.system?.attributes?.hp) {
            PanelManager.instance?.healthPanel?.update();
        }
    }
});
```

**Parameter Order (REQUIRED):**
1. `name` - FoundryVTT hook name
2. `description` - Human-readable description for debugging
3. `context` - String for batch cleanup and organization
4. `priority` - Execution priority (1-5)
5. `callback` - Your function to execute

### **2. Automatic Data Passing**
- **FoundryVTT automatically provides the data** when hooks fire
- **You don't need to ask for this data** - it's automatic
- **No complex routing or abstraction layers needed**

### **3. Clean Separation of Concerns**
- **HookManager**: Just registers and manages hooks
- **Your Code**: Contains all the actual logic
- **No business logic in the HookManager**

## **What HookManager Should Do**

### **✅ Good: Simple Orchestration**
- Register hooks with callbacks
- Provide cleanup when module disables
- Organize hooks for visibility/debugging
- Handle hook lifecycle management

### **❌ Bad: Complex Routing**
- Don't route events between panels
- Don't embed business logic
- Don't create multiple abstraction layers
- Don't overcomplicate what should be simple

## **Example Implementation**

```javascript
/**
 * HookManager - Simple Orchestration Layer
 * Registers hooks and provides cleanup - no business logic
 */
export class HookManager {
    static hooks = new Map(); // hookName -> { hookId, callbacks: [], registeredAt }
    static contexts = new Map(); // context -> Set(callbackId)
    
    /**
     * Generate unique callback ID
     */
    static _makeCallbackId(name) {
        return `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    
    /**
     * Register a hook with a callback
     * @param {Object} options - Hook registration options
     * @param {string} options.name - FoundryVTT hook name
     * @param {string} options.description - Human-readable description for debugging
     * @param {string} options.context - String for batch cleanup and organization
     * @param {number} options.priority - Priority level (1-5, default: 3)
     * @param {Function} options.callback - Your callback function
     * @param {Object} options.options - Additional options (e.g., { once: true, throttleMs: 50 })
     * @param {string} options.key - Optional dedupe key to prevent duplicate registrations
     * @returns {string} callbackId for cleanup
     */
    static registerHook({ name, description = '', context, priority = 3, callback, options = {}, key }) {
        if (typeof callback !== 'function') {
            throw new Error(`HookManager: callback must be a function for ${name}`);
        }
        
        // Check for dedupe if key provided
        if (key && this.hooks.has(name)) {
            const existing = this.hooks.get(name).callbacks.find(cb => cb.key === key);
            if (existing) return existing.callbackId;
        }
        
        // Create wrapper once per hook name
        if (!this.hooks.has(name)) {
            const hookRunner = (...args) => {
                const entry = this.hooks.get(name);
                if (!entry) return;
                
                // Create stable copy and sort once
                const list = entry.callbacks.slice().sort((a, b) => 
                    a.priority - b.priority || a.registeredAt - b.registeredAt
                );
                
                // Collect callbacks to remove (don't mutate during iteration)
                const toRemove = [];
                
                for (const cb of list) {
                    try {
                        cb.callback(...args);
                        if (cb.options?.once) {
                            toRemove.push(cb.callbackId);
                        }
                    } catch (error) {
                        console.error(`Hook callback error in ${name}:`, error);
                    }
                }
                
                // Cleanup "once" hooks after iteration
                for (const id of toRemove) {
                    this.removeCallback(id);
                }
            };
            
            const hookId = Hooks.on(name, hookRunner);
            this.hooks.set(name, { hookId, callbacks: [], registeredAt: Date.now() });
        }
        
        const entry = this.hooks.get(name);
        const callbackId = this._makeCallbackId(name);
        
        // Apply throttle/debounce if specified
        let finalCallback = callback;
        if (options.throttleMs) {
            finalCallback = this._throttle(callback, options.throttleMs);
        } else if (options.debounceMs) {
            finalCallback = this._debounce(callback, options.debounceMs);
        }
        
        const callbackRecord = {
            callbackId,
            callback: finalCallback,
            description,
            priority,
            registeredAt: Date.now(),
            options,
            key
        };
        
        entry.callbacks.push(callbackRecord);
        
        // Sort by priority, then by registration time for stability
        entry.callbacks.sort((a, b) => a.priority - b.priority || a.registeredAt - b.registeredAt);
        
        // Store context for batch cleanup
        if (context) {
            if (!this.contexts.has(context)) {
                this.contexts.set(context, new Set());
            }
            this.contexts.get(context).add(callbackId);
        }
        
        // Logging hook registration
        postConsoleAndNotification(
            MODULE.NAME,
            `Hook registered: ${name}`,
            { description, priority, totalCallbacks: entry.callbacks.length },
            true,
            false
        );
        
        return callbackId;
    }
    
    /**
     * Remove a specific hook
     * @param {string} hookName - Hook to remove
     * @returns {boolean} Success status
     */
    static removeHook(hookName) {
        const hook = this.hooks.get(hookName);
        if (!hook) return false;
        
        // Remove all callbacks from contexts
        hook.callbacks.forEach(cb => {
            this._removeFromContexts(cb.callbackId);
        });
        
        Hooks.off(hookName, hook.hookId);
        this.hooks.delete(hookName);
        
        postConsoleAndNotification(
            MODULE.NAME,
            `Hook removed: ${hookName}`,
            { totalHooks: this.hooks.size },
            true,
            false
        );
        
        return true;
    }

    /**
     * Remove a specific callback by its ID
     * @param {string} callbackId - The callback ID returned from registerHook
     * @returns {boolean} Success status
     */
    static removeCallback(callbackId) {
        const hookName = callbackId.split('_')[0];
        const entry = this.hooks.get(hookName);
        if (!entry) return false;
        
        const idx = entry.callbacks.findIndex(cb => cb.callbackId === callbackId);
        if (idx === -1) return false;
        
        // Remove from contexts
        this._removeFromContexts(callbackId);
        
        // Remove the callback
        entry.callbacks.splice(idx, 1);
        
        // If no more callbacks, remove the entire hook
        if (entry.callbacks.length === 0) {
            Hooks.off(hookName, entry.hookId);
            this.hooks.delete(hookName);
            
            postConsoleAndNotification(
                MODULE.NAME,
                `Hook completely removed: ${hookName}`,
                { totalHooks: this.hooks.size },
                true,
                false
            );
        } else {
            postConsoleAndNotification(
                MODULE.NAME,
                `Callback removed from hook: ${hookName}`,
                { remainingCallbacks: entry.callbacks.length },
                true,
                false
            );
        }
        
        return true;
    }
    
    /**
     * Remove all callbacks for a specific context
     * @param {string} context - Context to cleanup
     */
    static disposeByContext(context) {
        const set = this.contexts.get(context);
        if (!set) return;
        
        for (const id of Array.from(set)) {
            this.removeCallback(id);
        }
        this.contexts.delete(context);
    }
    
    /**
     * Clean up all hooks
     */
    static cleanup() {
        this.hooks.forEach((hook, name) => {
            if (hook.hookId) {
                Hooks.off(name, hook.hookId);
            }
        });
        
        const totalCleaned = this.hooks.size;
        this.hooks.clear();
        this.contexts.clear();
        
        postConsoleAndNotification(
            MODULE.NAME,
            'All hooks cleaned up',
            { totalCleaned },
            false,
            false
        );
    }
    
    /**
     * Get hook statistics
     * @returns {Object} Hook statistics
     */
    static getStats() {
        return {
            totalHooks: this.hooks.size,
            totalContexts: this.contexts.size,
            hooks: Array.from(this.hooks.entries()).map(([name, hook]) => ({
                name,
                totalCallbacks: hook.callbacks.length,
                registeredAt: new Date(hook.registeredAt).toISOString()
            }))
        };
    }
    
    /**
     * Check if a hook is registered
     * @param {string} hookName - Hook to check
     * @returns {boolean} Is registered
     */
    static hasHook(hookName) {
        return this.hooks.has(hookName);
    }
    
    /**
     * Show detailed hook information with priority grouping
     */
    static showHookDetails() {
        const stats = this.getStats();
        console.group('COFFEE PUB • BLACKSMITH | HOOK MANAGER DETAILS');
        console.log('==========================================================');
        console.log(`Total Hooks: ${stats.totalHooks} | Active: ${stats.totalHooks} | Inactive: 0`);
        console.log('==========================================================');
        
        // Group by priority
        const byPriority = new Map();
        for (const [name, hook] of this.hooks.entries()) {
            hook.callbacks.forEach(cb => {
                if (!byPriority.has(cb.priority)) {
                    byPriority.set(cb.priority, []);
                }
                byPriority.get(cb.priority).push({ name, ...cb });
            });
        }
        
        // Display by priority (1-5)
        for (let priority = 1; priority <= 5; priority++) {
            const hooks = byPriority.get(priority);
            if (!hooks || hooks.length === 0) continue;
            
            const priorityName = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'LOWEST'][priority - 1];
            console.log(`\n${priorityName} PRIORITY (${priority})`);
            console.log('==================================================');
            
            hooks.forEach(({ name, description, callbackId, registeredAt }) => {
                const time = new Date(registeredAt).toLocaleTimeString();
                console.log(`ACTIVE ${name}`);
                console.log(`   ID: ${callbackId} | Priority: ${priority} | Categories: [general]`);
                console.log(`   Registered: ${time}`);
                console.log(`   Description: ${description || 'No description'}`);
            });
        }
        
        console.groupEnd();
    }
    
    /**
     * Show simple hook summary
     */
    static showHooks() {
        const stats = this.getStats();
        console.log(`COFFEE PUB • BLACKSMITH | Total Hooks: ${stats.totalHooks}`);
        console.log('Hook Names:', Array.from(this.hooks.keys()).join(', '));
    }
    
    /**
     * Get hooks by priority level
     */
    static getHooksByPriority(priority) {
        const result = [];
        for (const [name, hook] of this.hooks.entries()) {
            const callbacks = hook.callbacks.filter(cb => cb.priority === priority);
            if (callbacks.length > 0) {
                result.push({ name, callbacks });
            }
        }
        return result;
    }
    
    /**
     * Get hooks by category (placeholder for future categorization)
     */
    static getHooksByCategory(category) {
        // For now, return all hooks since we don't have category system yet
        const result = [];
        for (const [name, hook] of this.hooks.entries()) {
            result.push({ name, callbacks: hook.callbacks });
        }
        return result;
    }
    
    /**
     * Throttle utility function
     */
    static _throttle(fn, ms) {
        let last = 0;
        return (...args) => {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                fn(...args);
            }
        };
    }
    
    /**
     * Debounce utility function
     */
    static _debounce(fn, ms) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    }
    
    /**
     * Remove callback from all contexts
     */
    static _removeFromContexts(callbackId) {
        for (const [context, set] of this.contexts.entries()) {
            if (set.has(callbackId)) {
                set.delete(callbackId);
                if (set.size === 0) {
                    this.contexts.delete(context);
                }
                break;
            }
        }
    }
    
    /**
     * Initialize HookManager with lifecycle hooks and console commands
     */
    static initialize() {
        // Set up lifecycle hooks
        Hooks.once('closeGame', () => {
            this.cleanup();
        });
        
        // Add console commands for debugging
        window.blacksmithHooks = () => this.showHooks();
        window.blacksmithHookDetails = () => this.showHookDetails();
        window.blacksmithHookStats = () => this.getStats();
        
        // Log initialization
        postConsoleAndNotification(
            MODULE.NAME,
            "Hook Manager | Initialization",
            "Initialized with console commands: blacksmithHooks(), blacksmithHookDetails(), blacksmithHookStats()",
            true,
            false
        );
    }
}
```

## **How to Use It (Simple)**

```javascript
// In your main code, register hooks with your logic
HookManager.registerHook({
    name: 'updateActor',
    description: 'Updates health panel when actor HP changes',
    context: 'health-panel',
    priority: 3, // Normal priority (default)
    callback: (actor, changes) => {
        // Your logic here - update health panel, etc.
        if (changes.system?.attributes?.hp) {
            PanelManager.instance?.healthPanel?.update();
        }
    }
});

HookManager.registerHook({
    name: 'updateToken',
    description: 'Handles token position updates',
    context: 'token-position',
    priority: 2, // High priority - runs early
    callback: (token, changes) => {
        // Your logic here
        if (changes.x || changes.y) {
            // Handle position changes
        }
    }
});

// Critical system hooks get priority 1
HookManager.registerHook({
    name: 'closeGame',
    description: 'Critical cleanup when game closes',
    context: 'system-cleanup',
    priority: 1, // Critical - runs first
    callback: () => {
        // Critical cleanup logic
    }
});

// Temporary hooks with auto-cleanup
HookManager.registerHook({
    name: 'userLogin',
    description: 'One-time welcome message',
    context: 'user-welcome',
    priority: 4, // Low priority
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        console.log(`Welcome back, ${user.name}!`);
    }
});

// Advanced features: dedupe, context, and performance
HookManager.registerHook({
    name: 'updateToken',
    description: 'Update token visuals with dedupe protection',
    priority: 2, // High priority
    key: `token:${token.id}`, // Prevents duplicate registrations
    context: `token:${token.id}`, // For batch cleanup
    options: { throttleMs: 50 }, // Performance optimization
    callback: (token, changes) => {
        // Handle token updates efficiently
        if (changes.x || changes.y) {
            // Update position-dependent visuals
        }
    }
});
```

## **Real-World Migration Examples**

### **Example 1: Combat Tracker Hook Migration**
```javascript
// BEFORE: Direct Hooks.on registration
Hooks.on('renderCombatTracker', (app, html, data) => {
    // 100+ lines of combat tracker enhancement logic
    // Health rings, portraits, drag & drop functionality
});

// AFTER: HookManager registration
const hookId = HookManager.registerHook({
    name: 'renderCombatTracker',
    description: 'Adds health rings, portraits, drag & drop to combat tracker',
    priority: 3, // Normal priority - UI enhancements
    callback: (app, html, data) => {
        // 100+ lines of combat tracker enhancement logic
        // Health rings, portraits, drag & drop functionality
        // EXACTLY THE SAME LOGIC - just wrapped in HookManager
    },
    context: 'combat-tools' // For cleanup
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderCombatTracker", "combat-tools", true, false);
```

### **Example 2: Combat Update Hook Migration**
```javascript
// BEFORE: Direct Hooks.on registration
Hooks.on('updateCombat', (combat, changed) => {
    // Combat round change logic
    if (changed.round !== undefined) {
        // Handle round changes
    }
});

// AFTER: HookManager registration
const hookId = HookManager.registerHook({
    name: 'updateCombat',
    description: 'Combat Tracker: Handle round changes and initiative checking',
    priority: 2, // High priority - core combat functionality
    callback: (combat, changed) => {
        // Combat round change logic
        if (changed.round !== undefined) {
            // Handle round changes
        }
        // EXACTLY THE SAME LOGIC - just wrapped in HookManager
    },
    context: 'combat-tracker-round-change'
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "combat-tracker-round-change", true, false);
```

### **Example 3: Timer Hook Migration**
```javascript
// BEFORE: Direct Hooks.on registration
Hooks.on('updateCombat', this._onUpdateCombat.bind(this));

// AFTER: HookManager registration
const hookId = HookManager.registerHook({
    name: 'updateCombat',
    description: 'Round Timer: Reset round timer stats on round changes',
    priority: 3, // Normal priority - timer management
    callback: this._onUpdateCombat.bind(this),
    context: 'timer-round'
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "timer-round", true, false);
```

### **Example 4: Statistics Hook Migration**
```javascript
// BEFORE: Direct Hooks.on registration
Hooks.on('updateCombat', this._onUpdateCombat.bind(this));

// AFTER: HookManager registration
const hookId = HookManager.registerHook({
    name: 'updateCombat',
    description: 'Combat Stats: Record combat data for analytics',
    priority: 3, // Normal priority - statistics collection
    callback: this._onUpdateCombat.bind(this),
    context: 'stats-combat'
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "stats-combat", true, false);
```

## **Migration Benefits Demonstrated**

### **1. Hook Conflict Resolution**
```javascript
// BEFORE: Multiple files registering the same hook
// combat-tools.js
Hooks.on('renderCombatTracker', ...); // UI enhancements

// combat-tracker.js  
Hooks.on('renderCombatTracker', ...); // Core functionality

// timer-planning.js
Hooks.on('renderCombatTracker', ...); // Timer display

// Result: Last one wins, others are overwritten!

// AFTER: HookManager handles multiple callbacks
// All three hooks now work together with proper priority ordering
HookManager.registerHook({ name: 'renderCombatTracker', priority: 3, ... }); // UI
HookManager.registerHook({ name: 'renderCombatTracker', priority: 2, ... }); // Core  
HookManager.registerHook({ name: 'renderCombatTracker', priority: 4, ... }); // Timer
```

### **2. Centralized Hook Management**
```javascript
// Console commands provide visibility into all hooks
blacksmithHooks()           // Quick overview
blacksmithHookDetails()     // Full breakdown with priority grouping
blacksmithHookStats()       // Raw data for debugging

// Example output:
// HIGH PRIORITY (2)
// ==================================================
// ACTIVE updateCombat
//    ID: updateCombat_1756398880835_8g44mkg | Priority: 2 | Categories: [general]
//    Registered: 9:34:40 AM
//    Description: Combat Tracker: Handle round changes and initiative checking
```

### **3. Context-Based Cleanup**
```javascript
// Each hook gets a context for batch cleanup
HookManager.registerHook({
    name: 'updateCombat',
    context: 'combat-tracker-round-change',
    // ... other options
});

// Later, cleanup all combat tracker hooks
HookManager.disposeByContext('combat-tracker-round-change');
```

## **Advanced Features**

### **1. Dedupe Protection**
```javascript
// Prevents duplicate registrations during re-renders
HookManager.registerHook({
    name: 'updateActor',
    key: `hp:${actor.id}`, // Unique identifier
    callback: (actor, changes) => {
        // This will only register once per actor
    }
});
```

### **2. Context-Based Cleanup**
```javascript
// Register with context for batch cleanup
HookManager.registerHook({
    name: 'updateToken',
    context: `token:${token.id}`,
    callback: (token, changes) => {
        // Handle token updates
    }
});

// Later, cleanup all hooks for a specific token
HookManager.disposeByContext(`token:${token.id}`);
```

### **3. Performance Optimization**
```javascript
// Throttle noisy hooks (e.g., updateToken)
HookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
    }
});

// Debounce for final state (e.g., search input)
HookManager.registerHook({
    name: 'searchInput',
    options: { debounceMs: 300 }, // Wait 300ms after last input
    callback: (input) => {
        // Only runs after user stops typing
    }
});
```

## **"Once" Semantics for Auto-Cleanup**

The HookManager supports automatic cleanup for temporary hooks using the `{ once: true }` option:

```javascript
// This hook will automatically remove itself after the first execution
HookManager.registerHook({
    name: 'userLogin',
    description: 'One-time welcome message',
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        console.log(`Welcome back, ${user.name}!`);
        // Hook automatically removes itself after this runs
    }
});
```

**Benefits of "Once" Hooks:**
- **Automatic cleanup** - no need to manually remove temporary hooks
- **Memory efficient** - prevents accumulation of unused hooks
- **Perfect for events** that should only happen once (welcome messages, initialization, etc.)
- **Cleaner code** - no manual cleanup required

## **API Reference**

### **Core Methods**
```javascript
// Register a hook
const callbackId = HookManager.registerHook({
    name: 'hookName',
    description: 'Optional description',
    priority: 3, // 1-5, default: 3
    callback: (arg1, arg2) => { /* your logic */ },
    options: { once: true, throttleMs: 50, debounceMs: 300 },
    key: 'uniqueKey', // Optional dedupe
    context: 'contextName' // Optional batch cleanup
});

// Remove a specific callback
const removed = HookManager.removeCallback(callbackId); // Returns boolean

// Remove an entire hook and all its callbacks
const removed = HookManager.removeHook('hookName'); // Returns boolean

// Cleanup by context
HookManager.disposeByContext('contextName'); // Returns void

// Cleanup everything
HookManager.cleanup(); // Returns void

// Check if hook exists
const exists = HookManager.hasHook('hookName'); // Returns boolean

// Get statistics
const stats = HookManager.getStats(); // Returns object
```

### **Return Types**
- `registerHook(...) -> callbackId: string`
- `removeCallback(callbackId) -> boolean`
- `removeHook(hookName) -> boolean`
- `disposeByContext(context) -> void`
- `cleanup() -> void`
- `hasHook(hookName) -> boolean`
- `getStats() -> { totalHooks, totalContexts, hooks: [...] }`

## **Enhanced Console Commands**

```javascript
// Show detailed hook information with priority grouping
HookManager.showHookDetails();

// Show simple hook summary
HookManager.showHooks();

// Filter hooks by priority
const criticalHooks = HookManager.getHooksByPriority(1);
const normalHooks = HookManager.getHooksByPriority(3);

// Filter hooks by category
const combatHooks = HookManager.getHooksByCategory('combat');
const canvasHooks = HookManager.getHooksByCategory('canvas');

// Get basic statistics
const stats = HookManager.getHookStats();
```

## **Why This Approach is Right**

1. **Simple** - Easy to understand and debug
2. **Efficient** - No unnecessary function calls or routing
3. **Maintainable** - Logic stays in the right place
4. **FoundryVTT Native** - Works with the system, not against it
5. **Easy to Grep** - Named parameters make searching and debugging easier
6. **Self-Documenting** - Clear what each parameter does without remembering order
7. **Extensible** - Easy to add new options without breaking existing code

## **The Problem with Complex Approaches**

Complex HookManagers with routing layers:
- Add unnecessary complexity
- Create more points of failure
- Make debugging harder
- Don't solve real problems
- Violate the principle of "keep it simple"

## **Migration Success Stories**

### **Hook Conflict Resolution**
- **Before**: 5+ `renderCombatTracker` hooks overwriting each other
- **After**: All hooks work together with proper priority ordering
- **Result**: Combat tracker enhancements now function correctly

### **Centralized Visibility**
- **Before**: No way to see what hooks were registered or their status
- **After**: Console commands show all hooks with descriptions and priorities
- **Result**: Easy debugging and monitoring of hook system

### **Cleanup Management**
- **Before**: Hooks could accumulate and cause memory leaks
- **After**: Context-based cleanup and automatic lifecycle management
- **Result**: Better performance and resource management

## **Bottom Line**

The HookManager should be a **simple orchestration layer** that:
- Registers your callbacks
- Lets FoundryVTT handle the data passing
- Keeps your logic in your code
- Provides clean organization and cleanup

**Keep it simple. Don't overcomplicate.**

---

## **FoundryVTT Hook Signatures**

**Important**: Your callbacks receive the **native FoundryVTT arguments** which vary by hook type:

```javascript
// updateActor: (actor, changes, options, userId)
HookManager.registerHook({
    name: 'updateActor',
    callback: (actor, changes, options, userId) => {
        // DnD5e: changes.system?.attributes?.hp
        // Other systems may have different structures
    }
});

// updateToken: (token, changes, options, userId) 
HookManager.registerHook({
    name: 'updateToken',
    callback: (token, changes, options, userId) => {
        // changes.x, changes.y for position
        // changes.scale for size
    }
});

// renderChatMessage: (message, html, data)
HookManager.registerHook({
    name: 'renderChatMessage',
    callback: (message, html, data) => {
        // Modify the HTML before display
    }
});
```

**Always check the FoundryVTT documentation** for the specific hook you're using to ensure correct parameter handling.

---

## **CRITICAL DESIGN ISSUES IDENTIFIED**

### **Problem 1: Multiple Systems Need Same Hook**
```javascript
// This will FAIL - can't register same hook twice!
HookManager.registerHook({
    name: 'updateActor',
    description: 'Updates health panel when actor HP changes',
    callback: (actor, changes) => {
        // Health Panel needs this
        if (changes.system?.attributes?.hp) {
            PanelManager.instance?.healthPanel?.update();
        }
    }
});

HookManager.registerHook({
    name: 'updateActor',
    description: 'Updates combat stats when actor HP changes',
    callback: (actor, changes) => {
        // Stats Tracker also needs this
        if (changes.system?.attributes?.hp) {
            StatsManager.instance?.updateCombatStats(actor);
        }
    }
});
```

**Current Design Limitation: Only one callback per hook name**

### **Problem 2: Module Conflicts**
```javascript
// Module A registers updateToken
HookManager.registerHook({
    name: 'updateToken',
    description: 'Module A token handler',
    callback: (token, changes) => {
        // Module A's logic
    }
});

// Module B registers updateToken  
HookManager.registerHook({
    name: 'updateToken',
    description: 'Module B token handler',
    callback: (token, changes) => {
        // Module B's logic
    }
});
```

**Module B will OVERWRITE Module A's hook!**

---

## **REQUIRED DESIGN CHANGES**

### **Solution: Multiple Callbacks Per Hook with Priority**
```javascript
static registerHook({ name, description = '', context, priority = 3, callback, options = {} }) {
    // Check if this hook already exists
    if (this.hooks.has(name)) {
        // Add callback to existing hook
        const hook = this.hooks.get(name);
        hook.callbacks.push({ 
            callback, 
            description, 
            priority, 
            registeredAt: Date.now(),
            options 
        });
        
        // Sort callbacks by priority (1 = highest, 5 = lowest)
        hook.callbacks.sort((a, b) => a.priority - b.priority);
        
        return `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Create new hook with multiple callback support
    const hookId = Hooks.on(name, (...args) => {
        // Execute all callbacks in priority order
        this.hooks.get(name).callbacks
            .sort((a, b) => a.priority - b.priority)
            .forEach(cb => {
                try {
                    cb.callback(...args);
                    
                    // Auto-cleanup for once hooks
                    if (cb.options?.once) {
                        this.removeCallback(cb.callbackId);
                    }
                } catch (error) {
                    console.error(`Hook callback error in ${name}:`, error);
                }
            });
    });
    
    this.hooks.set(name, { 
        hookId, 
        callbacks: [{ 
            callback, 
            description, 
            priority, 
            registeredAt: Date.now(),
            options 
        }],
        registeredAt: Date.now()
    });
    
    return hookId;
}
```

### **Updated Data Structure**
```javascript
static hooks = new Map(); // hookName -> { hookId, callbacks: [], registeredAt, priority, description }
```

### **Unique ID Generation**
```javascript
// Each callback gets a globally unique ID for precise removal
return `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
// Result: "updateActor_1703123456789_a1b2c3d4e"

// Benefits:
// - Globally unique (no collision possibility)
// - Sortable (timestamp allows chronological ordering)
// - Debuggable (you can see when it was created)
// - Human readable (still easy to identify)
// - Supports priority and options for advanced features
```

---

## **DESIGN PRINCIPLES UPDATED**

1. **Simple orchestration layer** ✅
2. **No business logic in HookManager** ✅  
3. **Clean separation of concerns** ✅
4. **Automatic data passing** ✅
5. **Proper cleanup and management** ✅
6. **Multiple callbacks per hook** ✅ (NEW)
7. **Conflict resolution** ✅ (NEW)
8. **Error handling in callbacks** ✅ (NEW)

---

## **IMPLEMENTATION PRIORITY**

1. **Fix multiple callback support** (CRITICAL)
2. **Add error handling** (HIGH)
3. **Implement callback removal by ID** (MEDIUM)
4. **Add execution order control** (LOW)

**Keep the simple philosophy, fix the multiple callback limitation.**

---

## **🤖 AI IMPLEMENTATION GUIDE**

### **For Future AI Assistants Implementing HookManager Migration**

**CRITICAL: This is a production system. Make focused, tested changes only.**

---

## **IMPLEMENTATION APPROACH**

### **1. Migration Philosophy**
- **Change NO code** until you understand the current state
- **Make ONE change at a time** - test before proceeding
- **Roll back immediately** if anything breaks
- **NO large consolidations** - prefer incremental approach
- **NO documentation updates** until after successful testing

### **2. Required Investigation Steps**
```javascript
// ALWAYS start with these console commands to understand current state
blacksmithHooks()           // Quick overview
blacksmithHookDetails()     // Full breakdown with priority grouping  
blacksmithHookStats()       // Raw data for debugging
```

### **3. Migration Process**
1. **Identify target hook** - Find a direct `Hooks.on()` registration
2. **Add HookManager import** - `import { HookManager } from './manager-hooks.js';`
3. **Replace registration** - Convert `Hooks.on()` to `HookManager.registerHook()`
4. **Add logging** - `postConsoleAndNotification(MODULE.NAME, "Hook Manager | hookName", "context", true, false);`
5. **Test immediately** - Verify functionality works
6. **Move to next hook** - Only after successful testing

---

## **MIGRATION TEMPLATE**

### **Before (Direct Hook Registration)**
```javascript
// OLD: Direct Hooks.on registration
Hooks.on('hookName', (arg1, arg2) => {
    // Existing logic - DO NOT CHANGE THIS CODE
    // Just wrap it in HookManager
});
```

### **After (HookManager Registration)**
```javascript
// NEW: HookManager registration
import { HookManager } from './manager-hooks.js';

const hookId = HookManager.registerHook({
    name: 'hookName',
    description: 'Brief description of what this hook does',
    context: 'descriptive-context-name', // For cleanup
    priority: 3, // 1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest
    callback: (arg1, arg2) => {
        // EXACTLY THE SAME LOGIC - unchanged
        // Existing logic - DO NOT CHANGE THIS CODE
        // Just wrap it in HookManager
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | hookName", "descriptive-context-name", true, false);
```

**⚠️ CRITICAL: Parameter Order Must Be Exact**
1. `name`
2. `description` 
3. `context`
4. `priority`
5. `callback`

---

## **PRIORITY GUIDELINES**

### **Priority 1 (CRITICAL)**
- System cleanup, critical features
- Must run first before anything else

### **Priority 2 (HIGH)**  
- Core functionality, data validation
- Runs early in the process

### **Priority 3 (NORMAL)**
- Most hooks, standard features
- Default priority for most use cases

### **Priority 4 (LOW)**
- Nice-to-have features, UI updates
- Runs later in the process

### **Priority 5 (LOWEST)**
- Cosmetic features, debug hooks
- Runs last

---

## **CONTEXT NAMING CONVENTIONS**

### **Use Descriptive Context Names**
```javascript
// GOOD: Clear, descriptive contexts
context: 'combat-tracker-round-change'
context: 'timer-round'
context: 'stats-combat'
context: 'combat-tools'

// BAD: Vague contexts
context: 'hook1'
context: 'temp'
context: 'stuff'
```

### **Context Examples by Module**
```javascript
// Combat-related hooks
context: 'combat-tracker-round-change'
context: 'combat-tracker-player-initiative'
context: 'combat-tools'

// Timer-related hooks
context: 'timer-round'
context: 'timer-planning'
context: 'timer-combat'

// Statistics hooks
context: 'stats-combat'
context: 'stats-player'
```

---

## **TESTING CHECKLIST**

### **After Each Migration**
1. **Console output** - Verify hook registration message appears
2. **Functionality test** - Trigger the hook and verify it works
3. **HookManager status** - Run `blacksmithHookDetails()` to see new hook
4. **No errors** - Check console for any error messages
5. **Rollback plan** - Keep backup of original code until testing complete

### **Common Test Scenarios**
```javascript
// For renderCombatTracker hooks
// - Open combat tracker
// - Verify visual enhancements appear (health rings, portraits, etc.)
// - Check console for hook registration message

// For updateCombat hooks  
// - Start/advance combat
// - Verify expected behavior occurs
// - Check console for hook registration message

// For updateActor hooks
// - Modify an actor's HP or other attributes
// - Verify expected behavior occurs
// - Check console for hook registration message
```

---

## **ERROR PREVENTION**

### **Common Mistakes to Avoid**
1. **Changing business logic** - Only wrap existing code, don't modify it
2. **Missing imports** - Always add `import { HookManager } from './manager-hooks.js';`
3. **Wrong priority** - Use 3 for normal hooks unless you have a specific reason
4. **Missing logging** - Always add the postConsoleAndNotification call
5. **Vague contexts** - Use descriptive context names for cleanup

### **Import Pattern**
```javascript
// CORRECT: Add import at top of file
import { HookManager } from './manager-hooks.js';

// INCORRECT: Missing import
// This will cause "HookManager is not defined" error
```

### **Logging Pattern**
```javascript
// CORRECT: Log after registration
const hookId = HookManager.registerHook({...});
postConsoleAndNotification(MODULE.NAME, "Hook Manager | hookName", "context", true, false);

// INCORRECT: Missing logging
// This makes debugging harder
```

---

## **ROLLBACK PROCEDURE**

### **If Something Breaks**
1. **Immediately stop** - Don't make more changes
2. **Restore original code** - Use the backup you kept
3. **Test functionality** - Verify it works again
4. **Analyze the problem** - What went wrong?
5. **Fix the issue** - Make a smaller, more focused change
6. **Test again** - Before proceeding

### **Backup Strategy**
```javascript
// BEFORE making changes, create a backup
// Either:
// 1. Copy the original Hooks.on line to a comment
// 2. Keep a backup file
// 3. Use git to track changes

// Example backup in comment:
// BACKUP: Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
const hookId = HookManager.registerHook({...});
```

---

## **MIGRATION ORDER RECOMMENDATION**

### **Start with Simple Hooks**
1. **Statistics hooks** - Usually simple, low-risk
2. **Timer hooks** - Moderate complexity, good for learning
3. **Combat tracker hooks** - More complex, save for later
4. **UI enhancement hooks** - Most complex, test thoroughly

### **Hook Complexity Guide**
```javascript
// SIMPLE: Direct method calls
Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
// → Easy to migrate, low risk

// MODERATE: Inline logic with some complexity
Hooks.on('updateCombat', (combat, changed) => {
    if (changed.round !== undefined) {
        // Some logic here
    }
});
// → Moderate complexity, test carefully

// COMPLEX: Large inline functions (100+ lines)
Hooks.on('renderCombatTracker', (app, html, data) => {
    // 100+ lines of complex logic
});
// → High complexity, test thoroughly, consider breaking into smaller functions
```

---

## **SUCCESS INDICATORS**

### **What Success Looks Like**
1. **Hook registration message** appears in console
2. **Functionality works** exactly as before
3. **HookManager shows new hook** in `blacksmithHookDetails()`
4. **No console errors** related to the migration
5. **Performance maintained** - no noticeable slowdown

### **Console Output Example**
```javascript
// Successful migration shows:
COFFEE PUB • BLACKSMITH: Hook Manager | updateCombat stats-combat

// And in blacksmithHookDetails():
NORMAL PRIORITY (3)
==================================================
ACTIVE updateCombat
   ID: updateCombat_1756402883904_t4rk1ne | Priority: 3 | Categories: [general]
   Registered: 10:41:23 AM
   Description: Combat Stats: Record combat data for analytics
```

---

## **FINAL REMINDERS**

### **Core Principles**
- **ONE change at a time**
- **Test after each change**
- **Keep backups**
- **Roll back if broken**
- **Don't optimize or clean up** unless specifically requested
- **Focus on migration only**

### **Success Metrics**
- All hooks migrated to HookManager
- No functionality broken
- Console shows all hooks registered
- HookManager provides visibility and control
- System performance maintained or improved

### **When to Stop**
- All direct `Hooks.on()` registrations migrated
- All functionality working correctly
- HookManager providing value (visibility, cleanup, etc.)
- No critical errors or performance issues

---

**Remember: This is a production system. Make focused, tested changes only. When in doubt, make a smaller change and test it thoroughly before proceeding.**
