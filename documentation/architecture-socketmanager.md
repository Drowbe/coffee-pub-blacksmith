# SocketManager - Internal Architecture

## **Overview**
This document details the internal architecture and implementation of Blacksmith's SocketManager system. This is for developers who want to understand how the socket system works internally, not for module consumers.

## **Core Architecture**

### **Design Philosophy**
The SocketManager is designed as a **facade pattern** that provides a unified interface for socket communication while automatically detecting and integrating with the best available transport layer.

### **Transport Layer Priority**
1. **SocketLib** (Primary) - Professional-grade socket communication
2. **Native FoundryVTT** (Fallback) - Built-in socket system
3. **Local Mode** (Development) - Single-client testing

## **Class Structure**

### **SocketManager Class**
**Location**: `scripts/manager-sockets.js`

**Core Responsibilities**:
- Transport layer detection and initialization
- Socket event registration and management
- Cross-client communication orchestration
- Fallback system management
- Performance monitoring and optimization

### **Internal Data Structures**
```javascript
class SocketManager {
    static instance = null;
    static transport = null; // 'socketlib', 'native', or 'local'
    static isReady = false;
    static eventHandlers = new Map(); // eventName -> Set(handlers)
    static pendingMessages = new Map(); // clientId -> Array(messages)
    static performanceMetrics = {
        messagesSent: 0,
        messagesReceived: 0,
        averageLatency: 0,
        lastUpdate: Date.now()
    };
}
```

## **Transport Layer Detection**

### **SocketLib Detection**
```javascript
static _detectSocketLib() {
    try {
        // Check if SocketLib is available and active
        if (game.modules.get('socketlib')?.active && 
            typeof socketlib !== 'undefined' && 
            socketlib.module) {
            
            this.transport = 'socketlib';
            this._initializeSocketLib();
            return true;
        }
    } catch (error) {
        console.warn('SocketLib detection failed:', error);
    }
    return false;
}
```

### **Native FoundryVTT Fallback**
```javascript
static _initializeNative() {
    this.transport = 'native';
    
    // Use FoundryVTT's built-in socket system
    this.socket = game.socket;
    
    // Set up event handlers for native system
    this.socket.on('module.coffee-pub-blacksmith', this._handleNativeMessage.bind(this));
    
    postConsoleAndNotification(
        MODULE.NAME,
        'SocketManager: Using native FoundryVTT sockets',
        'Fallback system active',
        true,
        false
    );
}
```

### **Local Mode for Development**
```javascript
static _initializeLocal() {
    this.transport = 'local';
    
    // Simulate socket behavior in single-client mode
    this._simulateCrossClient = true;
    
    postConsoleAndNotification(
        MODULE.NAME,
        'SocketManager: Local mode active',
        'Single-client development mode',
        true,
        false
    );
}
```

## **Event System Architecture**

### **Event Registration Pattern**
```javascript
static registerEvent(eventName, handler, options = {}) {
    if (!this.eventHandlers.has(eventName)) {
        this.eventHandlers.set(eventName, new Set());
    }
    
    const handlerSet = this.eventHandlers.get(eventName);
    const handlerId = this._generateHandlerId();
    
    const handlerRecord = {
        id: handlerId,
        handler,
        options,
        registeredAt: Date.now(),
        transport: this.transport
    };
    
    handlerSet.add(handlerRecord);
    
    // Register with transport layer
    this._registerWithTransport(eventName, handlerRecord);
    
    return handlerId;
}
```

### **Transport-Specific Registration**
```javascript
static _registerWithTransport(eventName, handlerRecord) {
    switch (this.transport) {
        case 'socketlib':
            this._registerSocketLib(eventName, handlerRecord);
            break;
            
        case 'native':
            this._registerNative(eventName, handlerRecord);
            break;
            
        case 'local':
            this._registerLocal(eventName, handlerRecord);
            break;
    }
}
```

## **Message Routing System**

### **Outgoing Message Flow**
```javascript
static emit(eventName, data, options = {}) {
    const message = {
        event: eventName,
        data,
        timestamp: Date.now(),
        source: game.user.id,
        target: options.target || 'all',
        priority: options.priority || 'normal'
    };
    
    // Route through appropriate transport
    switch (this.transport) {
        case 'socketlib':
            return this._emitSocketLib(message);
            
        case 'native':
            return this._emitNative(message);
            
        case 'local':
            return this._emitLocal(message);
    }
}
```

### **Incoming Message Flow**
```javascript
static _handleIncomingMessage(message) {
    const { event, data, timestamp, source } = message;
    
    // Update performance metrics
    this._updatePerformanceMetrics(message);
    
    // Find registered handlers for this event
    const handlers = this.eventHandlers.get(event);
    if (!handlers) {
        return; // No handlers registered
    }
    
    // Execute handlers in registration order
    for (const handlerRecord of handlers) {
        try {
            handlerRecord.handler(data, {
                source,
                timestamp,
                transport: this.transport,
                originalMessage: message
            });
        } catch (error) {
            console.error(`Socket event handler error for ${event}:`, error);
        }
    }
}
```

## **Performance Optimization**

### **Message Batching**
```javascript
static _batchMessages() {
    // Group messages by target client
    for (const [clientId, messages] of this.pendingMessages.entries()) {
        if (messages.length >= this.batchSize || 
            Date.now() - messages[0].timestamp > this.batchTimeout) {
            
            this._flushBatch(clientId, messages);
        }
    }
}

static _flushBatch(clientId, messages) {
    const batchMessage = {
        type: 'batch',
        messages,
        timestamp: Date.now()
    };
    
    this._sendToClient(clientId, batchMessage);
    this.pendingMessages.delete(clientId);
}
```

### **Latency Monitoring**
```javascript
static _updatePerformanceMetrics(message) {
    const now = Date.now();
    const latency = now - message.timestamp;
    
    this.performanceMetrics.messagesReceived++;
    this.performanceMetrics.averageLatency = 
        (this.performanceMetrics.averageLatency * (this.performanceMetrics.messagesReceived - 1) + latency) / 
        this.performanceMetrics.messagesReceived;
    
    this.performanceMetrics.lastUpdate = now;
    
    // Log high latency for debugging
    if (latency > 1000) { // 1 second threshold
        console.warn(`High socket latency detected: ${latency}ms for event ${message.event}`);
    }
}
```

## **Error Handling and Recovery**

### **Connection Failure Recovery**
```javascript
static _handleConnectionFailure(error) {
    console.error('Socket connection failure:', error);
    
    // Attempt to reconnect
    this._scheduleReconnection();
    
    // Notify event handlers
    this._notifyConnectionStatus('disconnected', error);
}

static _scheduleReconnection() {
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
        this._fallbackToLocalMode();
        return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectionAttempts), 30000);
    
    setTimeout(() => {
        this._attemptReconnection();
    }, delay);
    
    this.reconnectionAttempts++;
}
```

### **Transport Fallback Strategy**
```javascript
static _fallbackToLocalMode() {
    postConsoleAndNotification(
        MODULE.NAME,
        'SocketManager: Falling back to local mode',
        'Cross-client features disabled',
        false,
        true
    );
    
    // Switch to local mode
    this.transport = 'local';
    this._initializeLocal();
    
    // Notify all handlers of mode change
    this._notifyTransportChange('local');
}
```

## **Security and Validation**

### **Message Validation**
```javascript
static _validateMessage(message) {
    // Required fields
    if (!message.event || !message.data || !message.timestamp) {
        throw new Error('Invalid message format: missing required fields');
    }
    
    // Timestamp validation (prevent replay attacks)
    const now = Date.now();
    const messageAge = now - message.timestamp;
    
    if (messageAge > this.maxMessageAge) {
        throw new Error(`Message too old: ${messageAge}ms`);
    }
    
    // Source validation
    if (message.source && !this._isValidUser(message.source)) {
        throw new Error(`Invalid source user: ${message.source}`);
    }
    
    return true;
}
```

### **User Permission Checking**
```javascript
static _isValidUser(userId) {
    // Check if user exists and is active
    const user = game.users.get(userId);
    if (!user || !user.active) {
        return false;
    }
    
    // Check if user has permission to send messages
    if (!user.hasRole('PLAYER') && !user.hasRole('ASSISTANT') && !user.hasRole('GAMEMASTER')) {
        return false;
    }
    
    return true;
}
```

## **Debugging and Monitoring**

### **Console Commands**
```javascript
// Add debugging commands to window object
window.socketStatus = () => this._showStatus();
window.socketMetrics = () => this._showMetrics();
window.socketEvents = () => this._showEvents();
window.socketTest = () => this._runTestMessage();
```

### **Status Display**
```javascript
static _showStatus() {
    console.group('COFFEE PUB • BLACKSMITH | SOCKET MANAGER STATUS');
    console.log('==========================================================');
    console.log(`Transport: ${this.transport.toUpperCase()}`);
    console.log(`Status: ${this.isReady ? 'READY' : 'INITIALIZING'}`);
    console.log(`Active Events: ${this.eventHandlers.size}`);
    console.log(`Pending Messages: ${this._getTotalPendingMessages()}`);
    console.log('==========================================================');
    console.groupEnd();
}
```

### **Performance Metrics Display**
```javascript
static _showMetrics() {
    const metrics = this.performanceMetrics;
    console.group('COFFEE PUB • BLACKSMITH | SOCKET PERFORMANCE');
    console.log('==========================================================');
    console.log(`Messages Sent: ${metrics.messagesSent}`);
    console.log(`Messages Received: ${metrics.messagesReceived}`);
    console.log(`Average Latency: ${metrics.averageLatency.toFixed(2)}ms`);
    console.log(`Last Update: ${new Date(metrics.lastUpdate).toLocaleTimeString()}`);
    console.log('==========================================================');
    console.groupEnd();
}
```

## **Configuration and Settings**

### **Configurable Parameters**
```javascript
static config = {
    // Performance tuning
    batchSize: 10,              // Messages per batch
    batchTimeout: 100,          // Max wait time for batching (ms)
    maxMessageAge: 30000,       // Max message age (30 seconds)
    
    // Reconnection settings
    maxReconnectionAttempts: 5,
    initialReconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    
    // Transport preferences
    preferSocketLib: true,      // Prefer SocketLib over native
    fallbackToLocal: true,     // Allow local mode fallback
    
    // Debug settings
    enableDebugLogging: false,
    logAllMessages: false,
    performanceMonitoring: true
};
```

### **Runtime Configuration**
```javascript
static configure(newConfig) {
    // Validate configuration
    this._validateConfig(newConfig);
    
    // Apply new configuration
    Object.assign(this.config, newConfig);
    
    // Reinitialize if transport needs to change
    if (newConfig.preferSocketLib !== undefined) {
        this._reinitializeTransport();
    }
    
    postConsoleAndNotification(
        MODULE.NAME,
        'SocketManager: Configuration updated',
        newConfig,
        true,
        false
    );
}
```

## **Testing and Development**

### **Local Testing Mode**
```javascript
static enableLocalTesting() {
    this.config.preferSocketLib = false;
    this.config.fallbackToLocal = true;
    
    this._reinitializeTransport();
    
    postConsoleAndNotification(
        MODULE.NAME,
        'SocketManager: Local testing mode enabled',
        'Cross-client features simulated locally',
        true,
        false
    );
}
```

### **Message Simulation**
```javascript
static _simulateCrossClientMessage(eventName, data) {
    if (this.transport !== 'local') {
        console.warn('Cross-client simulation only available in local mode');
        return;
    }
    
    // Simulate message from another client
    const simulatedMessage = {
        event: eventName,
        data,
        timestamp: Date.now(),
        source: 'simulated-client',
        transport: 'local'
    };
    
    // Process as if it came from network
    this._handleIncomingMessage(simulatedMessage);
}
```

## **Integration Points**

### **HookManager Integration**
```javascript
// SocketManager registers hooks for socket events
static _registerSocketHooks() {
    // Hook into FoundryVTT socket events
    Hooks.on('socketlib.ready', () => {
        this._onSocketLibReady();
    });
    
    Hooks.on('socketlib.error', (error) => {
        this._onSocketLibError(error);
    });
}
```

### **Module System Integration**
```javascript
// Other modules can register socket event handlers
static registerModuleHandler(moduleId, eventName, handler) {
    const handlerId = this.registerEvent(eventName, handler, {
        moduleId,
        priority: 'normal'
    });
    
    // Track module handlers for cleanup
    if (!this.moduleHandlers.has(moduleId)) {
        this.moduleHandlers.set(moduleId, new Set());
    }
    this.moduleHandlers.get(moduleId).add(handlerId);
    
    return handlerId;
}
```

## **Future Enhancements**

### **Planned Features**
1. **Message Encryption** - End-to-end encryption for sensitive data
2. **Compression** - Message compression for large payloads
3. **Reliability** - Guaranteed message delivery with acknowledgments
4. **Scalability** - Support for large numbers of connected clients
5. **Analytics** - Detailed usage analytics and performance insights

### **Architecture Evolution**
- **Plugin System** - Allow modules to extend socket functionality
- **Protocol Versioning** - Support for multiple message protocol versions
- **Load Balancing** - Distribute socket load across multiple servers
- **Real-time Monitoring** - Live performance and health monitoring

---

## **Migration Plan: God Module Cleanup and API Exposure**

This section outlines the plan to clean up SocketManager from a "god module" architecture and expose it through the Blacksmith API. **Phase 2** work; execute after the core API (HookManager, ModuleManager, Utils) is fully functional and tested.

### **Current Status**

**Phase 1 – Core API (in progress or complete):**
- HookManager migration – complete (68 hooks migrated)
- Module API exposure – complete (HookManager exposed through `module.api`)
- Bridge file – complete (`blacksmith-api.js` for external modules)
- API documentation – in progress
- SocketManager cleanup – not started (Phase 2)

**Phase 1 priority:** Get the core API working and documented before changing SocketManager.

### **Phase 2: Problem and Target**

**Current problem – SocketManager as a god module:**  
SocketManager currently imports other systems (e.g. CombatTimer, PlanningTimer, MenuBar, VoteManager, CSSEditor, LatencyChecker). That violates separation of concerns: SocketManager should **provide socket services** to other systems and **not import** them; other systems should **import / use** SocketManager, not the other way around.

**Target architecture – clean service pattern:**
```
Other Systems → SocketManager → Transport Layer
     ↓              ↓              ↓
CombatTimer    (uses)         SocketLib
PlanningTimer  (uses)         Native FoundryVTT
MenuBar        (uses)         Local Mode
VoteManager    (uses)
```

### **Migration Steps (Phase 2)**

1. **Remove god module dependencies**  
   Remove imports of CombatTimer, PlanningTimer, MenuBar, VoteManager, CSSEditor, LatencyChecker from SocketManager. Keep only essential imports (e.g. `const.js`, `api-core.js`).

2. **Refactor to event-driven usage**  
   Other systems emit events or call SocketManager; SocketManager does not import those systems. SocketManager sets up socket infrastructure and listens for events (e.g. `blacksmith.socket.ready`, `blacksmith.socket.error`) as needed; business logic stays in the other systems, which use the socket API.

3. **Expose through module.api**  
   Add SocketManager to `module.api` in `blacksmith.js` so it is available as `game.modules.get('coffee-pub-blacksmith')?.api?.sockets` (or equivalent).

4. **Add bridge methods in blacksmith-api.js**  
   Expose socket access for external modules, e.g. `getSocketManager()` or `getSocketUtils()` that resolve the API and return the SocketManager instance or a thin wrapper (emit, on, off, etc.).

5. **Update other systems to use SocketManager**  
   Timers, MenuBar, VoteManager, etc. obtain the socket API (via `module.api` or bridge) and call `emit` / register handlers instead of being imported by SocketManager.

### **Benefits**

- **Separation of concerns:** SocketManager = socket infrastructure only; other systems = business logic + socket usage; no circular dependencies.
- **Easier testing:** SocketManager testable in isolation; other systems can mock socket behavior.
- **Maintainability:** Changes to timers do not affect socket code; changes to sockets do not affect timer code.
- **API exposure:** Other modules can use socket features via a clean, documented API.

### **Implementation Timeline**

**Phase 1 (current):** Core API – HookManager migration, module API exposure, bridge file, API documentation, core API testing.

**Phase 2 (future):** SocketManager cleanup – remove god module dependencies; refactor to event-driven usage; expose through `module.api`; add bridge methods; update other systems; test socket functionality; update documentation.

### **Risk Assessment**

- **Low:** Core API and documentation updates (no SocketManager behavior change).
- **Medium:** SocketManager refactor and event-driven changes (internal architecture).
- **High:** Breaking existing socket behavior or performance regressions; mitigate with tests and staged rollout.

### **Testing Strategy**

- **Phase 1:** Core API (HookManager, ModuleManager, Utils), bridge file access, documentation accuracy.
- **Phase 2:** Socket functionality, event emission/handling, performance, integration of all systems that use sockets.

### **Success Criteria**

- **Phase 1:** HookManager migrated and exposed, bridge working, API docs complete, no functionality broken.
- **Phase 2:** SocketManager has no god module dependencies; event-driven usage in place; SocketManager exposed via `module.api` and bridge; existing socket functionality preserved; performance maintained or improved.

### **Next Steps**

- **Phase 1:** Complete API documentation, test core API, validate bridge file, then treat Phase 1 complete.
- **Phase 2:** Detailed design for SocketManager refactor, implement cleanup and API exposure, test and validate, update documentation.

---

**Last Updated**: Current session - Socket system fully functional
**Status**: Production ready with comprehensive architecture
**Next Milestone**: Phase 1 API completion; Phase 2 SocketManager cleanup and API exposure
