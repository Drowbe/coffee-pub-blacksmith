# HookManager Migration Guide

## **Overview**

This document outlines the migration strategy from direct FoundryVTT hook usage to the centralized HookManager system. The goal is to transform Blacksmith into a "Module Ecosystem Core" that manages all hooks for all Coffee Pub modules.

## **Why Migrate?**

### **The Problem: Hook Conflicts**
```javascript
// BEFORE: Direct hook usage causes conflicts
// Module A
Hooks.on('updateActor', (actor, changes) => {
    // Health panel logic
});

// Module B  
Hooks.on('updateActor', (actor, changes) => {
    // Combat stats logic
}); // OVERWRITES Module A's hook!
```

### **The Solution: Centralized Management**
```javascript
// AFTER: Safe, conflict-free registration
// Module A
HookManager.registerHook({
    name: 'updateActor',
    description: 'Health panel updates',
    callback: (actor, changes) => { /* health logic */ }
});

// Module B
HookManager.registerHook({
    name: 'updateActor', 
    description: 'Combat stats updates',
    callback: (actor, changes) => { /* combat logic */ }
}); // BOTH WORK! No conflicts!
```

## **Migration Benefits**

### **For Blacksmith (Core)**
- **Central control** over all hooks across the ecosystem
- **Visibility** into what each module is doing
- **Unified debugging** and monitoring capabilities
- **Performance optimization** across all modules
- **Cleaner module lifecycle management**

### **For Other Coffee Pub Modules**
- **No hook conflicts** with other modules
- **Automatic cleanup** when modules disable
- **Shared infrastructure** (sockets, logging, etc.)
- **Easier debugging** through centralized management
- **Consistent behavior** across the ecosystem

### **For End Users**
- **Better performance** (no duplicate hooks)
- **Cleaner module interactions**
- **Easier troubleshooting** (one place to look)
- **Consistent behavior** across all Coffee Pub modules

## **Architecture Vision**

```
┌─────────────────────────────────────────────────────────────┐
│                    COFFEE PUB ECOSYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   REGENT    │  │   SQUIRE    │  │   KNIGHT    │        │
│  │ (AI Tools)  │  │(Combat)     │  │(Rolling)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │               │               │                  │
│         └───────────────┼───────────────┘                  │
│                         │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                BLACKSMITH (CORE)                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │   │
│  │  │HookManager  │ │SocketManager│ │ModuleManager│  │   │
│  │  │             │ │             │ │             │  │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                  │
│                         ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                FOUNDRYVTT                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │   │
│  │  │   Hooks     │ │   Socket    │ │   Canvas    │  │   │
│  │  │             │ │             │ │             │  │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## **Implementation Phases**

### **Phase 1: HookManager Implementation** ✅ **COMPLETE**
- [x] Design and document HookManager
- [x] Implement core functionality
- [x] Add advanced features (priority, dedupe, context, performance)
- [x] Integrate into blacksmith.js initialization
- [x] Test foundation (console commands working, 0 hooks registered)

### **Phase 2: Hook Migration** 🚧 **IN PROGRESS**
- [ ] Migrate all existing hooks to HookManager
- [ ] Test each migration for functionality
- [ ] Validate priority system works
- [ ] Ensure no functionality is lost
- [ ] Test in Blacksmith

### **Phase 2: Blacksmith Integration**
- [ ] Integrate HookManager into Blacksmith
- [ ] Expose through `module.api`
- [ ] Migrate existing Blacksmith hooks
- [ ] Test and validate

### **Phase 3: Module Migration**
- [ ] Update other Coffee Pub modules to use HookManager
- [ ] Remove direct hook registrations
- [ ] Test inter-module compatibility
- [ ] Performance validation

### **Phase 4: Ecosystem Expansion**
- [ ] Extract modules that can now safely share hooks
- [ ] Add new shared services
- [ ] Optimize cross-module performance
- [ ] Documentation and training

## **Migration Steps for Individual Modules**

### **Step 1: Import HookManager**
```javascript
// OLD: Direct hook usage
import { Hooks } from 'foundry.js';

// NEW: Use Blacksmith's HookManager
import { HookManager } from 'coffee-pub-blacksmith';
```

### **Step 2: Replace Hook Registrations**
```javascript
// OLD: Direct registration
Hooks.on('updateActor', (actor, changes) => {
    // Your logic here
});

// NEW: Safe registration through HookManager
HookManager.registerHook({
    name: 'updateActor',
    description: 'Your module: Update something',
    priority: 3, // 1-5, default: 3
    callback: (actor, changes) => {
        // Your logic here
    }
});
```

### **Step 3: Handle Cleanup**
```javascript
// OLD: Manual cleanup (often forgotten)
Hooks.off('updateActor', yourCallback);

// NEW: Automatic cleanup
// HookManager automatically handles cleanup when modules disable
// Or use context-based cleanup for specific scenarios
HookManager.registerHook({
    name: 'updateToken',
    context: `token:${token.id}`,
    callback: (token, changes) => { /* logic */ }
});

// Later cleanup
HookManager.disposeByContext(`token:${token.id}`);
```

## **Advanced Migration Patterns**

### **Performance Optimization**
```javascript
// For noisy hooks like updateToken
HookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
    }
});
```

### **Dedupe Protection**
```javascript
// Prevents duplicate registrations during re-renders
HookManager.registerHook({
    name: 'updateActor',
    key: `hp:${actor.id}`, // Unique identifier
    callback: (actor, changes) => { /* logic */ }
});
```

### **Priority Management**
```javascript
// Critical system hooks
HookManager.registerHook({
    name: 'closeGame',
    priority: 1, // Runs first
    callback: () => { /* critical cleanup */ }
});

// Normal functionality
HookManager.registerHook({
    name: 'updateActor',
    priority: 3, // Default priority
    callback: (actor, changes) => { /* normal logic */ }
});

// Cosmetic features
HookManager.registerHook({
    name: 'renderChatMessage',
    priority: 5, // Runs last
    callback: (message, html) => { /* UI enhancements */ }
});
```

## **Testing Migration**

### **Before Migration**
```javascript
// Test current functionality
console.log('Current hooks:', Hooks.all.get('updateActor'));
```

### **After Migration**
```javascript
// Verify HookManager registration
HookManager.showHooks();
HookManager.showHookDetails();

// Test functionality
// Should work exactly the same, but now conflict-free
```

### **Validation Checklist**
- [ ] All existing functionality still works
- [ ] No console errors about hook conflicts
- [ ] Performance is maintained or improved
- [ ] Cleanup works properly when module disables
- [ ] Multiple modules can use same hooks without conflicts

## **Troubleshooting Migration**

### **Common Issues**

#### **"HookManager is not defined"**
```javascript
// Ensure Blacksmith is loaded first
// Check module dependencies in module.json
```

#### **"Callback not executing"**
```javascript
// Verify hook name matches exactly
// Check priority settings
// Ensure callback function is valid
```

#### **"Performance degradation"**
```javascript
// Use throttle/debounce for noisy hooks
// Review priority settings
// Check for unnecessary re-registrations
```

### **Debug Commands**
```javascript
// Show all registered hooks
HookManager.showHooks();

// Show detailed information
HookManager.showHookDetails();

// Get statistics
const stats = HookManager.getStats();
console.log(stats);

// Check specific hook
const exists = HookManager.hasHook('updateActor');
console.log('Hook exists:', exists);
```

## **Best Practices**

### **Hook Naming**
- Use descriptive names that indicate purpose
- Follow FoundryVTT naming conventions
- Include module prefix if needed

### **Priority Guidelines**
- **Priority 1**: System-critical (cleanup, initialization)
- **Priority 2**: Core functionality (data validation, core features)
- **Priority 3**: Normal operations (most hooks)
- **Priority 4**: UI updates, nice-to-have features
- **Priority 5**: Cosmetic, debug, final touches

### **Context Usage**
- Use contexts for related hooks (e.g., all hooks for a specific token)
- Clean up contexts when no longer needed
- Avoid overly broad contexts

### **Performance Considerations**
- Use `throttleMs` for frequently firing hooks
- Use `debounceMs` for user input hooks
- Avoid expensive operations in high-priority hooks

## **Future Enhancements**

### **Planned Features**
- Hook categorization system
- Performance monitoring and analytics
- Advanced debugging tools
- Hook dependency management

### **Integration Opportunities**
- Socket management integration
- Module lifecycle management
- Performance optimization across modules
- Unified error handling and logging

## **Migration Progress Tracking**

### **BATCH 1: COMBAT TRACKER (Critical Conflicts)** 🚨
**Priority: IMMEDIATE - Fix these first to resolve major conflicts**

1. **`renderCombatTracker`** - **HIGHEST PRIORITY** 🚧 **READY TO MIGRATE**
   - **Files**: `combat-tools.js`, `combat-tracker.js` (2x), `timer-round.js`, `timer-planning.js`, `timer-combat.js`
   - **Conflict Level**: CRITICAL (5+ registrations overwriting each other)
   - **Impact**: Combat tracker enhancements completely broken
   - **Status**: Ready to migrate as test case
   - **Migration Plan**: Consolidate into single HookManager hook with priority ordering

2. **`updateCombat`** - **HIGHEST PRIORITY** ⏳ **PENDING**
   - **Files**: `combat-tracker.js` (2x), `timer-combat.js`, `timer-planning.js`, `stats-combat.js`
   - **Conflict Level**: CRITICAL (5+ registrations)
   - **Impact**: Combat updates inconsistent, timer conflicts
   - **Status**: Waiting for first migration test

3. **`updateCombatant`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `combat-tracker.js`
   - **Conflict Level**: MEDIUM (single registration, but core functionality)
   - **Impact**: Combatant updates may be broken
   - **Status**: Waiting for first migration test

4. **`createCombat`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `combat-tracker.js`
   - **Conflict Level**: MEDIUM (single registration)
   - **Impact**: Combat creation flow
   - **Status**: Waiting for first migration test

5. **`deleteCombat`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `combat-tracker.js`, `xp-manager.js`, `stats-combat.js`
   - **Conflict Level**: MEDIUM (3 registrations)
   - **Impact**: Combat cleanup, XP tracking
   - **Status**: Waiting for first migration test

### **BATCH 2: INITIALIZATION & CANVAS (System Setup)** 🟠
**Priority: HIGH - Fix initialization order and canvas conflicts**

6. **`ready`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `combat-tools.js`, `combat-tracker.js`, `chat-panel.js`, `timer-round.js`, `timer-planning.js`, `timer-combat.js`, `token-image-replacement.js`, `manager-canvas.js`
   - **Conflict Level**: HIGH (8+ registrations)
   - **Impact**: Initialization order issues, race conditions
   - **Status**: Waiting for first migration test

7. **`canvasReady`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `blacksmith.js` (2x)
   - **Conflict Level**: MEDIUM (2 registrations)
   - **Impact**: Canvas setup conflicts
   - **Status**: Waiting for first migration test

8. **`updateToken`** - **HIGH PRIORITY** ⏳ **PENDING**
   - **Files**: `manager-canvas.js`, `blacksmith.js`, `timer-combat.js`, `encounter-toolbar.js`
   - **Conflict Level**: HIGH (4 registrations)
   - **Impact**: Token updates inconsistent
   - **Status**: Waiting for first migration test

### **BATCH 3: UI RENDERING (Visual Conflicts)** 🟡
**Priority: MEDIUM - Fix UI rendering conflicts**

9. **`renderChatMessage`** - **MEDIUM PRIORITY** ⏳ **PENDING**
    - **Files**: `blacksmith.js` (2x), `stats-combat.js`
    - **Conflict Level**: MEDIUM (3 registrations)
    - **Impact**: Chat message enhancements
    - **Status**: Waiting for first migration test

10. **`renderJournalSheet`** - **MEDIUM PRIORITY** ⏳ **PENDING**
    - **Files**: `journal-tools.js`, `encounter-toolbar.js`
    - **Conflict Level**: MEDIUM (2 registrations)
    - **Impact**: Journal functionality
    - **Status**: Waiting for first migration test

### **BATCH 4: GAME MECHANICS (Functional Conflicts)** ⚔️
**Priority: MEDIUM - Fix game system conflicts**

11. **`updateActor`** - **MEDIUM PRIORITY** ⏳ **PENDING**
    - **Files**: `manager-canvas.js`, `stats-combat.js`
    - **Conflict Level**: MEDIUM (2 registrations)
    - **Impact**: Actor updates
    - **Status**: Waiting for first migration test

12. **`dnd5e.rollAttack`** - **MEDIUM PRIORITY** ⏳ **PENDING**
    - **Files**: `timer-combat.js`, `stats-combat.js`, `stats-player.js`
    - **Conflict Level**: MEDIUM (3 registrations)
    - **Impact**: Attack roll handling
    - **Status**: Waiting for first migration test

### **BATCH 5: UTILITY & CLEANUP (Low Priority)** 🟢
**Priority: LOW - Clean up remaining hooks**

13. **`settingChange`** - **LOW PRIORITY** ⏳ **PENDING**
    - **Files**: `blacksmith.js`, `journal-tools.js`, `encounter-toolbar.js`
    - **Conflict Level**: MEDIUM (3 registrations)
    - **Impact**: Settings management
    - **Status**: Waiting for first migration test

## **Migration Success Metrics**

### **BATCH 1 Success Criteria:**
- [ ] Combat tracker enhancements work consistently
- [ ] No more hook conflicts for combat-related events
- [ ] Priority system properly orders hook execution
- [ ] All existing functionality preserved

### **Overall Success Criteria:**
- [ ] All hooks migrated to HookManager
- [ ] No functionality lost during migration
- [ ] Performance improved (no duplicate hooks)
- [ ] Debugging easier (centralized hook management)
- [ ] Ready for ecosystem integration

## **Next Steps**

1. **✅ Complete** - HookManager foundation is working
2. **🚧 In Progress** - Migrate first `renderCombatTracker` hook as test case
3. **⏳ Pending** - Validate migration approach works
4. **⏳ Pending** - Continue with BATCH 1 migration
5. **⏳ Pending** - Move to subsequent batches

## **Conclusion**

The HookManager migration transforms Blacksmith from a standalone module into a **Module Ecosystem Core** that enables all Coffee Pub modules to work together seamlessly. This approach:

- **Eliminates hook conflicts** between modules
- **Provides centralized management** and debugging
- **Enables performance optimization** across the ecosystem
- **Creates a foundation** for future module development
- **Improves user experience** through consistent behavior

By following this migration guide, modules can safely transition to the new system while maintaining all existing functionality and gaining new capabilities for future development.

---

**Next Steps**: Complete Phase 1 implementation, then begin Blacksmith integration in Phase 2.
