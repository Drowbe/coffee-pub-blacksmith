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

### **1. Simple Registration**
```javascript
// This is what you want - simple and clean
HookManager.registerHook('updateActor', (actor, changes) => {
    // Your logic here - update health panel, etc.
    if (changes.system?.attributes?.hp) {
        PanelManager.instance?.healthPanel?.update();
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
    static hooks = new Map(); // hookName -> { callback, hookId, description }
    
    /**
     * Register a hook with a callback
     * @param {string} hookName - FoundryVTT hook name
     * @param {Function} callback - Your callback function
     * @param {string} description - Optional description for debugging
     * @returns {string} Hook ID for cleanup
     */
    static registerHook(hookName, callback, description = '') {
        // Register with FoundryVTT
        const hookId = Hooks.on(hookName, callback);
        
        // Store for management
        this.hooks.set(hookName, { 
            callback, 
            hookId, 
            description,
            registeredAt: Date.now()
        });
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Hook registered: ${hookName}`,
            { description, totalHooks: this.hooks.size },
            true,
            false
        );
        
        return hookId;
    }
    
    /**
     * Remove a specific hook
     * @param {string} hookName - Hook to remove
     * @returns {boolean} Success status
     */
    static removeHook(hookName) {
        const hook = this.hooks.get(hookName);
        if (!hook) return false;
        
        Hooks.off(hookName, hook.callback);
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
     * Clean up all hooks
     */
    static cleanup() {
        this.hooks.forEach((hook, name) => {
            Hooks.off(name, hook.callback);
        });
        
        const totalCleaned = this.hooks.size;
        this.hooks.clear();
        
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
            hooks: Array.from(this.hooks.entries()).map(([name, hook]) => ({
                name,
                description: hook.description,
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
}
```

## **How to Use It (Simple)**

```javascript
// In your main code, register hooks with your logic
HookManager.registerHook('updateActor', (actor, changes) => {
    // Your logic here - update health panel, etc.
    if (changes.system?.attributes?.hp) {
        PanelManager.instance?.healthPanel?.update();
    }
}, 'Updates health panel when actor HP changes');

HookManager.registerHook('updateToken', (token, changes) => {
    // Your logic here
    if (changes.x || changes.y) {
        // Handle position changes
    }
}, 'Handles token position updates');
```

## **Why This Approach is Right**

1. **Simple** - Easy to understand and debug
2. **Efficient** - No unnecessary function calls or routing
3. **Maintainable** - Logic stays in the right place
4. **FoundryVTT Native** - Works with the system, not against it

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

## **🚨 CRITICAL DESIGN ISSUES IDENTIFIED**

### **Problem 1: Multiple Systems Need Same Hook**
```javascript
// This will FAIL - can't register same hook twice!
HookManager.registerHook('updateActor', (actor, changes) => {
    // Health Panel needs this
    if (changes.system?.attributes?.hp) {
        PanelManager.instance?.healthPanel?.update();
    }
}, 'Updates health panel when actor HP changes');

HookManager.registerHook('updateActor', (actor, changes) => {
    // Stats Tracker also needs this
    if (changes.system?.attributes?.hp) {
        StatsManager.instance?.updateCombatStats(actor);
    }
}, 'Updates combat stats when actor HP changes');
```

**❌ Current Design Limitation: Only one callback per hook name**

### **Problem 2: Module Conflicts**
```javascript
// Module A registers updateToken
HookManager.registerHook('updateToken', (token, changes) => {
    // Module A's logic
}, 'Module A token handler');

// Module B registers updateToken  
HookManager.registerHook('updateToken', (token, changes) => {
    // Module B's logic
}, 'Module B token handler');
```

**❌ Module B will OVERWRITE Module A's hook!**

---

## **💡 REQUIRED DESIGN CHANGES**

### **Solution: Multiple Callbacks Per Hook**
```javascript
static registerHook(hookName, callback, description = '') {
    // Check if this hook already exists
    if (this.hooks.has(hookName)) {
        // Add callback to existing hook
        const hook = this.hooks.get(hookName);
        hook.callbacks.push({ callback, description, registeredAt: Date.now() });
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Callback added to existing hook: ${hookName}`,
            { totalCallbacks: hook.callbacks.length },
            true,
            false
        );
        
        return `${hookName}_${hook.callbacks.length}`;
    }
    
    // Create new hook with multiple callback support
    const hookId = Hooks.on(hookName, (...args) => {
        // Execute all callbacks
        this.hooks.get(hookName).callbacks.forEach(cb => {
            try {
                cb.callback(...args);
            } catch (error) {
                console.error(`Hook callback error in ${hookName}:`, error);
            }
        });
    });
    
    this.hooks.set(hookName, { 
        hookId, 
        callbacks: [{ callback, description, registeredAt: Date.now() }],
        registeredAt: Date.now()
    });
    
    return hookId;
}
```

### **Updated Data Structure**
```javascript
static hooks = new Map(); // hookName -> { hookId, callbacks: [], registeredAt }
```

---

## **✅ DESIGN PRINCIPLES UPDATED**

1. **Simple orchestration layer** ✅
2. **No business logic in HookManager** ✅  
3. **Clean separation of concerns** ✅
4. **Automatic data passing** ✅
5. **Proper cleanup and management** ✅
6. **Multiple callbacks per hook** ✅ (NEW)
7. **Conflict resolution** ✅ (NEW)
8. **Error handling in callbacks** ✅ (NEW)

---

## **🎯 IMPLEMENTATION PRIORITY**

1. **Fix multiple callback support** (CRITICAL)
2. **Add error handling** (HIGH)
3. **Implement callback removal by ID** (MEDIUM)
4. **Add execution order control** (LOW)

**Keep the simple philosophy, fix the multiple callback limitation.**
