# HookManager - Correct Implementation Approach

## **The Right Way: Simple Orchestration Layer**

The HookManager should act as an **orchestration layer** where you just register a hook and a callback. It should be simple, not complex.

## **How It Should Work (Your Flow)**

```
FoundryVTT Event → HookManager → Your Callback → Your Logic
     ↓              ↓              ↓              ↓
Actor Updated → Hook Fired → Your Function → Update Health Panel
```

## **Core Principles**

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
    priority: 3, // 1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest
    callback: (actor, changes) => {
        // Your logic here - update health panel, etc.
        if (changes.system?.attributes?.hp) {
            PanelManager.instance?.healthPanel?.update();
        }
    }
});
```

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
     * @param {string} options.description - Optional description for debugging
     * @param {number} options.priority - Priority level (1-5, default: 3)
     * @param {Function} options.callback - Your callback function
     * @param {Object} options.options - Additional options (e.g., { once: true, throttleMs: 50 })
     * @param {string} options.key - Optional dedupe key to prevent duplicate registrations
     * @param {string} options.context - Optional context for batch cleanup
     * @returns {string} callbackId for cleanup
     */
    static registerHook({ name, description = '', priority = 3, callback, options = {}, key, context }) {
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
        
        getBlacksmith()?.utils.postConsoleAndNotification(
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
        
        getBlacksmith()?.utils.postConsoleAndNotification(
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
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Hook completely removed: ${hookName}`,
                { totalHooks: this.hooks.size },
                true,
                false
            );
        } else {
            getBlacksmith()?.utils.postConsoleAndNotification(
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
        
        getBlacksmith()?.utils.postConsoleAndNotification(
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
}
```

## **How to Use It (Simple)**

```javascript
// In your main code, register hooks with your logic
HookManager.registerHook({
    name: 'updateActor',
    description: 'Updates health panel when actor HP changes',
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
    priority: 1, // Critical - runs first
    callback: () => {
        // Critical cleanup logic
    }
});

// Temporary hooks with auto-cleanup
HookManager.registerHook({
    name: 'userLogin',
    description: 'One-time welcome message',
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
static registerHook({ name, description = '', priority = 3, callback, options = {} }) {
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
