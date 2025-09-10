# SocketManager Migration Plan

## **Overview**
This document outlines the plan to clean up the SocketManager from its current "god module" architecture and properly expose it through the Blacksmith API. This is a **Phase 2** effort that will happen after the core API (HookManager, ModuleManager, Utils) is fully functional and tested.

## **Current Status: PHASE 1 - Core API (IN PROGRESS)**

### **What We're Doing Now:**
- ✅ **HookManager migration** - COMPLETE (68 hooks migrated)
- ✅ **Module API exposure** - COMPLETE (HookManager exposed through module.api)
- ✅ **Bridge file creation** - COMPLETE (blacksmith-api.js for external modules)
- 🚧 **API documentation** - IN PROGRESS (BLACKSMITH-API.md updated)
- ❌ **SocketManager cleanup** - NOT STARTED (Phase 2)

### **Phase 1 Priority:**
**Get the core API working and documented before touching SocketManager.**

## **Phase 2: SocketManager Cleanup and Exposure**

### **Current Problem: SocketManager IS a God Module**
```javascript
// Current SocketManager imports (BAD - creates tight coupling)
import { CombatTimer } from './timer-combat.js';
import { PlanningTimer } from './timer-planning.js';
import { ChatPanel } from './chat-panel.js';
import { VoteManager } from './vote-manager.js';
import { CSSEditor } from './window-gmtools.js';
import { LatencyChecker } from './latency-checker.js';
```

**This violates separation of concerns:**
- SocketManager should **provide socket services** to other systems
- SocketManager should **NOT import** other systems
- Other systems should **import SocketManager**, not the other way around

### **Target Architecture: Clean Service Pattern**
```
Other Systems → SocketManager → Transport Layer
     ↓              ↓              ↓
CombatTimer    (uses)         SocketLib
PlanningTimer  (uses)         Native FoundryVTT
ChatPanel      (uses)         Local Mode
VoteManager    (uses)
```

## **Migration Steps (Phase 2)**

### **Step 1: Remove God Module Dependencies**
```javascript
// REMOVE these imports from SocketManager
// import { CombatTimer } from './timer-combat.js';
// import { PlanningTimer } from './timer-planning.js';
// import { ChatPanel } from './chat-panel.js';
// import { VoteManager } from './vote-manager.js';
// import { CSSEditor } from './window-gmtools.js';
// import { LatencyChecker } from './latency-checker.js';

// KEEP only essential imports
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
```

### **Step 2: Refactor to Event-Driven Architecture**
```javascript
// Instead of direct imports, use event system
class SocketManager {
    static initialize() {
        // Set up socket infrastructure
        this._setupSocketInfrastructure();
        
        // Listen for events from other systems
        Hooks.on('blacksmith.socket.ready', this._onSocketReady.bind(this));
        Hooks.on('blacksmith.socket.error', this._onSocketError.bind(this));
    }
    
    // Other systems emit events, SocketManager listens
    static _onSocketReady(data) {
        // Handle socket ready event
    }
    
    static _onSocketError(error) {
        // Handle socket error event
    }
}
```

### **Step 3: Expose Through module.api**
```javascript
// In blacksmith.js, add SocketManager to module.api
module.api = {
    // ... existing APIs ...
    HookManager,
    // ✅ NEW: Add SocketManager
    SocketManager
};
```

### **Step 4: Add Bridge Methods to blacksmith-api.js**
```javascript
// In blacksmith-api.js, add socket access methods
export class BlacksmithAPI {
    // ... existing methods ...
    
    /**
     * Get SocketManager instance (waits for Blacksmith to be ready)
     * @returns {Promise<Object>} SocketManager instance
     */
    static async getSocketManager() {
        const api = await this.waitForReady();
        return api.SocketManager;
    }
    
    /**
     * Get socket utilities for cross-client communication
     * @returns {Promise<Object>} Socket utilities
     */
    static async getSocketUtils() {
        const api = await this.waitForReady();
        return {
            socketManager: api.SocketManager,
            emit: (event, data, options) => api.SocketManager.emit(event, data, options),
            on: (event, handler) => api.SocketManager.on(event, handler),
            off: (event, handler) => api.SocketManager.off(event, handler)
        };
    }
}
```

### **Step 5: Update Other Systems to Use SocketManager**
```javascript
// In timer-combat.js, timer-planning.js, etc.
// Instead of SocketManager importing them, they use SocketManager

// BEFORE (in SocketManager):
// import { CombatTimer } from './timer-combat.js';

// AFTER (in timer-combat.js):
const blacksmithSocket = await BlacksmithAPI.getSocketManager();
blacksmithSocket.emit('combat:timer-update', { timer: 'combat', value: 300 });
```

## **Benefits of Clean Architecture**

### **✅ Separation of Concerns**
- **SocketManager** = Socket infrastructure only
- **Other systems** = Business logic + socket usage
- **No circular dependencies**

### **✅ Easier Testing**
- **SocketManager** can be tested in isolation
- **Other systems** can mock socket behavior
- **Clear boundaries** for unit tests

### **✅ Better Maintainability**
- **Changes to timers** don't affect socket code
- **Changes to sockets** don't affect timer code
- **Single responsibility** principle followed

### **✅ Proper API Exposure**
- **Other modules** can use socket features
- **Clean interfaces** without internal dependencies
- **Professional API** design

## **Implementation Timeline**

### **Phase 1: Core API (CURRENT)**
- [x] HookManager migration
- [x] Module API exposure
- [x] Bridge file creation
- [ ] API documentation completion
- [ ] Core API testing and validation

### **Phase 2: SocketManager Cleanup (FUTURE)**
- [ ] Remove god module dependencies
- [ ] Refactor to event-driven architecture
- [ ] Expose through module.api
- [ ] Add bridge methods
- [ ] Update other systems
- [ ] Test socket functionality
- [ ] Update documentation

## **Risk Assessment**

### **Low Risk:**
- **Core API changes** - isolated to API exposure
- **Documentation updates** - no functional changes

### **Medium Risk:**
- **SocketManager refactoring** - changes internal architecture
- **Event system changes** - affects how systems communicate

### **High Risk:**
- **Breaking existing socket functionality** - could affect real-time features
- **Performance impact** - event system vs direct calls

## **Testing Strategy**

### **Phase 1 Testing:**
- **Core API functionality** - HookManager, ModuleManager, Utils
- **Bridge file access** - external module simulation
- **Documentation accuracy** - examples and usage patterns

### **Phase 2 Testing:**
- **Socket functionality** - cross-client communication
- **Event system** - proper event emission and handling
- **Performance** - no degradation in socket performance
- **Integration** - all systems still work together

## **Success Criteria**

### **Phase 1 Success:**
- [ ] All 68 hooks migrated to HookManager
- [ ] HookManager exposed through module.api
- [ ] Bridge file working for external modules
- [ ] API documentation complete and accurate
- [ ] No functionality broken

### **Phase 2 Success:**
- [ ] SocketManager has no god module dependencies
- [ ] Event-driven architecture working
- [ ] SocketManager exposed through module.api
- [ ] Bridge methods for socket access working
- [ ] All existing socket functionality preserved
- [ ] Performance maintained or improved

## **Next Steps**

### **Immediate (Phase 1):**
1. **Complete API documentation** - finish BLACKSMITH-API.md
2. **Test core API** - verify HookManager, ModuleManager, Utils work
3. **Validate bridge file** - test external module access
4. **Phase 1 completion** - core API fully functional

### **Future (Phase 2):**
1. **Plan SocketManager refactoring** - detailed design
2. **Implement cleanup** - remove dependencies, add events
3. **Expose through API** - add to module.api and bridge
4. **Test and validate** - ensure no regressions
5. **Update documentation** - add socket API examples

---

**Phase 1 Priority: Get the core API working and documented.**
**Phase 2 Priority: Clean up SocketManager and expose socket functionality.**

**This plan captures the vision while keeping SocketManager as a future concern.**
