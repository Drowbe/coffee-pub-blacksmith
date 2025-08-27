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
    static hooks = new Map(); // hookName -> { hookId, callbacks: [], registeredAt, priority, description }
    
         /**
      * Register a hook with a callback
      * @param {Object} options - Hook registration options
      * @param {string} options.name - FoundryVTT hook name
      * @param {string} options.description - Optional description for debugging
      * @param {number} options.priority - Priority level (1-5, default: 3)
      * @param {Function} options.callback - Your callback function
      * @returns {string} Hook ID for cleanup
      */
           static registerHook({ name, description = '', priority = 3, callback }) {
         // Register with FoundryVTT
         const hookId = Hooks.on(name, callback);
         
         // Store for management
         this.hooks.set(name, { 
             callback, 
             hookId, 
             description,
             priority,
             registeredAt: Date.now()
         });
         
         getBlacksmith()?.utils.postConsoleAndNotification(
             MODULE.NAME,
             `Hook registered: ${name}`,
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
         // Parse callbackId format: "hookName_index" or just "hookName"
         const [hookName, indexStr] = callbackId.includes('_') ? 
             callbackId.split('_') : [callbackId, '0'];
         const index = parseInt(indexStr) || 0;
         
         const hook = this.hooks.get(hookName);
         if (!hook || !hook.callbacks[index]) return false;
         
         // Remove the specific callback
         hook.callbacks.splice(index, 1);
         
         // If no more callbacks, remove the entire hook
         if (hook.callbacks.length === 0) {
             Hooks.off(hookName, hook.hookId);
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
                 { remainingCallbacks: hook.callbacks.length },
                 true,
                 false
             );
         }
         
         return true;
     }
    
        /**
     * Clean up all hooks
     */
     static cleanup() {
         this.hooks.forEach((hook, name) => {
             // Remove the FoundryVTT hook using the stored hookId
             if (hook.hookId) {
                 Hooks.off(name, hook.hookId);
             }
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
```

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

### **Solution: Multiple Callbacks Per Hook**
```javascript
static registerHook({ name, description = '', callback }) {
    // Check if this hook already exists
    if (this.hooks.has(name)) {
        // Add callback to existing hook
        const hook = this.hooks.get(name);
        hook.callbacks.push({ callback, description, registeredAt: Date.now() });
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Callback added to existing hook: ${name}`,
            { totalCallbacks: hook.callbacks.length },
            true,
            false
        );
        
        return `${name}_${hook.callbacks.length}`;
    }
    
    // Create new hook with multiple callback support
    const hookId = Hooks.on(name, (...args) => {
        // Execute all callbacks
        this.hooks.get(name).callbacks.forEach(cb => {
            try {
                cb.callback(...args);
            } catch (error) {
                console.error(`Hook callback error in ${name}:`, error);
            }
        });
    });
    
    this.hooks.set(name, { 
        hookId, 
        callbacks: [{ callback, description, registeredAt: Date.now() }],
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
