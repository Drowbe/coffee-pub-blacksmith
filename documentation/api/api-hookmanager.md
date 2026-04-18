# **Blacksmith Hook Manager API**

> **For External Module Developers**
> 
> This document covers the **Hook Manager** API for registering and managing FoundryVTT hooks through Coffee Pub Blacksmith. For general integration setup, see `api-core.md`.

**Audience:** Developers integrating with Blacksmith and using the Hook Manager for event handling.

## **Overview**

The Hook Manager provides centralized hook management with:

- **Priority-based execution** (1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest)
- **Context-based cleanup** for batch operations
- **Throttle/debounce support** for performance optimization
- **Dedupe protection** to prevent duplicate registrations
- **Automatic cleanup** for "once" hooks

## **Access**

```javascript
// Direct access - no await needed once Blacksmith is ready
const hookManager = BlacksmithHookManager;
BlacksmithHookManager.registerHook(...)
```

---

# **Core API**

## **Register a Hook**

```javascript
const callbackId = BlacksmithHookManager.registerHook({
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

## **Parameter Order (Recommended)**

For readability and consistency, use this order:

1. `name` (required)
2. `description` (optional)
3. `context` (optional)
4. `priority` (optional)
5. `key` (optional)
6. `options` (optional)
7. `callback` (required) - **ALWAYS LAST for readability**

## **What We Support**

- **Required**: `name`, `callback`
- **Optional**: `description`, `priority`, `options`, `key`, `context`
- **Options**: `once`, `throttleMs`, `debounceMs`
- **Performance**: Throttling and debouncing work as documented
- **Cleanup**: `once: true` auto-removes hooks after first execution
- **Dedupe**: `key` prevents duplicate registrations
- **Batch cleanup**: `context` enables group removal

## **Other Methods**

```javascript
// Remove a specific callback
const removed = BlacksmithHookManager.removeCallback(callbackId);

// Cleanup by context
BlacksmithHookManager.disposeByContext('context-name');

// Get statistics and debugging info
BlacksmithHookManager.showHooks();
BlacksmithHookManager.showHookDetails();
BlacksmithHookManager.getStats();
```

---

# **Working Examples**

## **Basic Hook Registration**

```javascript
const hookId = BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module',
    priority: 3,
    callback: (actor, changes) => {
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Hook with All Parameters**

```javascript
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
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Combat Tracking Hook**

```javascript
const combatHookId = BlacksmithHookManager.registerHook({
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
```

## **UI Enhancement Hook**

```javascript
const uiHookId = BlacksmithHookManager.registerHook({
    name: 'renderChatMessage',
    description: 'My module: Enhance chat messages',
    context: 'my-chat-enhancer',
    priority: 4, // Low priority - UI updates
    callback: (message, html, data) => {
        html.find('.message-content').addClass('my-enhanced-style');
    }
});
```

## **One-time Hook with Auto-cleanup**

```javascript
const welcomeHookId = BlacksmithHookManager.registerHook({
    name: 'userLogin',
    description: 'My module: Welcome message',
    context: 'my-welcome',
    priority: 5,
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
        console.log('Searching for:', input);
    }
});
```

---

# **Priority Guidelines**

| Priority | Level | Use For |
|----------|-------|---------|
| 1 | CRITICAL | System cleanup, critical features, must-run-first operations |
| 2 | HIGH | Core functionality, data validation, early processing |
| 3 | NORMAL | Most hooks, standard functionality (default) |
| 4 | LOW | Nice-to-have features, UI updates |
| 5 | LOWEST | Cosmetic features, debug hooks |

```javascript
// Priority 1 - System integrity
BlacksmithHookManager.registerHook({ name: 'closeGame', priority: 1, ... });

// Priority 2 - Core features
BlacksmithHookManager.registerHook({ name: 'updateActor', priority: 2, ... });

// Priority 3 - Standard (default)
BlacksmithHookManager.registerHook({ name: 'renderChatMessage', priority: 3, ... });

// Priority 4 - UI enhancements
BlacksmithHookManager.registerHook({ name: 'renderApplication', priority: 4, ... });

// Priority 5 - Debug/cosmetic
BlacksmithHookManager.registerHook({ name: 'renderPlayerList', priority: 5, ... });
```

---

# **Performance Options**

## **Throttling**

Limit execution frequency for noisy hooks:

```javascript
BlacksmithHookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => { /* ... */ }
});
```

## **Debouncing**

Wait for activity to settle before running:

```javascript
BlacksmithHookManager.registerHook({
    name: 'searchInput',
    options: { debounceMs: 300 }, // Wait 300ms after last call
    callback: (input) => { /* ... */ }
});
```

## **One-time Hooks**

Auto-remove after first execution:

```javascript
BlacksmithHookManager.registerHook({
    name: 'userLogin',
    options: { once: true },
    callback: (user) => { /* ... */ }
});
```

---

# **Console Commands**

Use these to debug and inspect hook registrations:

```javascript
// Show hook summary (count, names)
BlacksmithAPIHooks()

// Detailed hook information by priority
BlacksmithAPIHookDetails()

// Raw hook statistics
BlacksmithAPIHookStats()

// Expanded details with full formatting
BlacksmithAPIHookExpandedDetails()
```

| Command | Returns | Description |
|---------|---------|-------------|
| `BlacksmithAPIHooks()` | Object | Hook count, names, and summary data |
| `BlacksmithAPIHookDetails()` | Object | Hooks organized by priority levels |
| `BlacksmithAPIHookStats()` | Object | Statistical breakdown by priority/context |
| `BlacksmithAPIHookExpandedDetails()` | Console Output | Detailed hook information with full formatting |

---

# **Best Practices**

## **1. Use Direct Global Access**

```javascript
// GOOD: Use global objects directly
BlacksmithHookManager.registerHook(...)

// ALTERNATIVE: Store reference if preferred
const hookManager = BlacksmithHookManager;
```

## **2. Always Use Contexts**

```javascript
// GOOD: Descriptive context for cleanup
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module-actor-tracking',
    callback: () => { /* ... */ }
});

// BAD: No context makes cleanup difficult
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    callback: () => { /* ... */ }
});
```

## **3. Provide Clear Descriptions**

```javascript
// GOOD: Clear, descriptive
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My Module: Track actor HP changes for health panel updates',
    callback: () => { /* ... */ }
});

// BAD: Vague
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'Updates stuff',
    callback: () => { /* ... */ }
});
```

## **4. Use Appropriate Priorities**

- Use priority 3 (NORMAL) for most hooks
- Only use 1 or 2 for critical/core functionality
- Use 4 or 5 for cosmetic/debug features

## **5. Clean Up When Done**

```javascript
const myHookIds = [];

myHookIds.push(BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module',
    callback: () => { /* ... */ }
}));

// Clean up when module disables
Hooks.once('closeGame', () => {
    myHookIds.forEach(id => BlacksmithHookManager.removeCallback(id));
});
```

---

# **Debugging and Troubleshooting**

## **Common Issues**

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

// Verify hook name is correct (FoundryVTT hook names are case-sensitive)
```

**Issue: Performance problems**
```javascript
// Use throttling for noisy hooks
BlacksmithHookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 100 },
    callback: () => { /* ... */ }
});

// Use debouncing for user input
BlacksmithHookManager.registerHook({
    name: 'searchInput', 
    options: { debounceMs: 500 },
    callback: () => { /* ... */ }
});
```

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
        callback: (actor, changes) => { /* ... */ }
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

---

# **API Test Example**

From the integration test suite in `api-core.md`:

```javascript
const hookName = 'createActor';
const hookContext = 'my-module-id';

const hookResult = BlacksmithHookManager.registerHook({
    name: hookName,
    description: 'API Test Hook',
    context: hookContext,
    priority: 50,
    key: `${hookContext}-${hookName}`,
    options: {},
    callback: async (actor) => {
        BlacksmithUtils.postConsoleAndNotification(
            'my-module-id', 
            'Hook triggered!', 
            { actorId: actor.id, name: actor.name }, 
            false, 
            false
        );
    }
});

console.log('Hook registration result:', hookResult);
```

---

# **Related Documentation**

- **[API Core](api-core.md)** - General integration setup, module registration, and other APIs
- **[Architecture Hook Manager](architecture-hookmanager.md)** - Internal architecture (for Blacksmith developers)
