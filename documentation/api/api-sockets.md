# Blacksmith Socket API Documentation

**For external module developers.** This document covers how other FoundryVTT modules can use Blacksmith's socket management system for cross-client communication.

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

## Overview

Blacksmith provides a unified socket management API that handles SocketLib integration, fallback to native Foundry sockets, and automatic initialization. This allows other modules to leverage Blacksmith's socket infrastructure without managing SocketLib setup themselves.

## What This API Provides

- **Automatic SocketLib integration** - handles SocketLib detection and registration.
- **Native fallback** - falls back to Foundry's native socket system when SocketLib isn't installed.
- **Timing-safe** - `waitForReady()` handles initialization timing.
- **One interface** - the same `register()` / `emit()` calls regardless of transport, with the two behavioral differences noted under those methods.

## Accessing the Socket API

### Method 1: Via BlacksmithAPI Bridge (Recommended)

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// Get the socket API
const blacksmith = await BlacksmithAPI.get();
const sockets = blacksmith.sockets;
```

Or, equivalently, the convenience method:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

const sockets = await BlacksmithAPI.getSockets();
```

### Method 2: Direct Module Access

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.sockets) {
    const sockets = blacksmith.sockets;
}
```

### Method 3: Global Blacksmith Object (if available)

```javascript
// Note: This is set asynchronously, may not be available immediately
if (window.Blacksmith?.socket) {
    const sockets = window.Blacksmith.socket;
}
```

## API Methods

### `sockets.waitForReady()`

Wait for the socket system to be ready before using it.

**Returns:** `Promise<boolean>` - Resolves to `true` when socket is ready

**Example:**
```javascript
await sockets.waitForReady();
console.log('Socket system is ready!');
```

**When to use:** Always call this before registering handlers or emitting messages if your code runs early in the module lifecycle.

---

### `sockets.register(eventName, handler)`

Register a socket event handler to receive messages from other clients.

**Parameters:**
- `eventName` (string, required): The event name to listen for
- `handler` (function, required): The callback function that receives `(data, userId)` when the event fires

**Returns:** `Promise<boolean>` — Resolves to `true` if registration succeeded.

**`register()` overwrites silently, and there is no unregister.** Registering an event name that is already registered replaces the previous handler and returns `true`, with nothing logged. There is no `unregister` method on `api.sockets`, so a handler can only be replaced, never removed.

Without SocketLib this is sharper than a collision between modules: the native fallback puts external handlers in the same map Blacksmith's own internals use (`ping`, `pong`, `updateCSS`, `syncTimerState`, `updateSkillRoll`, and others), so registering `'ping'` there silently destroys Blacksmith's latency checker. With SocketLib the namespaces are separate and this cannot happen.

Prefixing event names with your module id is therefore a requirement, not a style preference: use `'my-module.thing'`, never `'thing'`.

**Example:**
```javascript
// Wait for socket to be ready
await sockets.waitForReady();

// Register a handler
await sockets.register('myModule.customEvent', (data, userId) => {
    console.log(`Received data from user ${userId}:`, data);
    // Handle the socket message
});

// Or chain them
sockets.waitForReady().then(() => {
    return sockets.register('myModule.anotherEvent', (data) => {
        // Handle event
    });
});
```

**Best Practices:**
- Use module-specific event names (e.g., `'my-module.eventName'`) to avoid conflicts
- Always wait for socket to be ready before registering
- Register handlers in a `ready` hook or after confirming socket readiness

---

### `sockets.emit(eventName, data, options)`

Emit a socket message to other clients.

**Parameters:**
- `eventName` (string, required): The event name to emit
- `data` (any, required): The data to send (can be any serializable JavaScript object)
- `options` (object, optional): Delivery targeting options
  - `userId` (string, optional): Deliver to one specific user only. If it is your own user ID, your local handler fires. Rejection on a disconnected target is SocketLib-only — see below.
  - `recipients` (array, optional): Array of user IDs to deliver to. Disconnected users are silently skipped; if your own user ID is included, your local handler fires.

With no targeting options, the event is delivered to all other connected clients (never the sender).

**Returns:** `Promise<boolean>` — Resolves to `true` if emit succeeded.

**`emit` does not reject under the native fallback.** Rejection on a failed delivery is SocketLib-only:

- **With SocketLib**, `emit` routes to `executeAsUser`, which rejects for a user who is not connected.
- **Without SocketLib** (native fallback), `emit` calls `game.socket.emit(...)` and never inspects `game.users` — no connectivity check and no rejection. It returns nothing, and the wrapper turns that into a resolved `true`.

So on a world without SocketLib, `await sockets.emit('x', data, { userId: someOfflineUser })` resolves `true` and the message goes nowhere; a `try/catch` around it never fires. Do not treat a resolved `emit` as proof of delivery. If delivery matters, check `sockets.isUsingSocketLib()`, or have the receiver acknowledge explicitly.

**Privacy:** targeting controls which clients dispatch the event to their registered handlers — it is not wire-level privacy. Under both transports the payload is broadcast to every connected client and filtered on receipt, so anyone inspecting socket traffic can see it. Never send secrets through `sockets.emit()`.

**Example:**
```javascript
// Wait for socket to be ready
await sockets.waitForReady();

// Emit to all clients
await sockets.emit('myModule.customEvent', {
    message: 'Hello from my module!',
    timestamp: Date.now()
});

// Emit to specific user
await sockets.emit('myModule.customEvent', {
    message: 'Private message'
}, {
    userId: 'specific-user-id'
});

// Emit to multiple users
await sockets.emit('myModule.customEvent', {
    message: 'Group message'
}, {
    recipients: ['user1-id', 'user2-id']
});
```

---

### `sockets.isReady()`

Check if the socket system is currently ready.

**Returns:** `boolean` - `true` if ready, `false` otherwise

**Example:**
```javascript
if (sockets.isReady()) {
    // Socket is ready, safe to use
    await sockets.emit('myEvent', { data: 'test' });
} else {
    // Wait for ready first
    await sockets.waitForReady();
    await sockets.emit('myEvent', { data: 'test' });
}
```

---

### `sockets.isUsingSocketLib()`

Check which transport layer is being used.

**Returns:** `boolean` - `true` if using SocketLib, `false` if using native Foundry sockets

**Example:**
```javascript
const usingSocketLib = sockets.isUsingSocketLib();
console.log(`Using ${usingSocketLib ? 'SocketLib' : 'native Foundry sockets'}`);
```

**Note:** Most modules don't need to check this - the API abstracts away the transport layer differences.

---

### `sockets.getSocket()`

Get the underlying socket instance (advanced use only).

**Returns:** `Object|null` - The socket instance or `null` if not ready

**Warning:** Only use this if you need direct access to SocketLib methods. Prefer using the wrapper methods (`register`, `emit`) instead.

**Example:**
```javascript
const socket = sockets.getSocket();
if (socket && socket.executeForOthers) {
    socket.executeForOthers('event', data);
}
```

There is no `emitToOthers` on either wrapper — the real method is `executeForOthers`. A guard like `if (socket && socket.emitToOthers)` is a silent no-op that never warns.

The available methods depend on the transport, which is why `getSocket()` is a last resort:

| Method | SocketLib | Native fallback |
|---|---|---|
| `register`, `emit`, `executeForOthers` | Yes | Yes |
| `executeForAll`, `executeForEveryone`, `executeAsGM` | Yes | No — `undefined` |

Check `sockets.isUsingSocketLib()` before reaching for anything in the second row.

## Complete Example

Here's a complete example of a module using the Socket API:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    // Get Blacksmith API
    const blacksmith = await BlacksmithAPI.get();
    
    // Wait for socket system to be ready
    await blacksmith.sockets.waitForReady();
    
    // Register a handler for incoming messages
    await blacksmith.sockets.register('my-module.syncData', (data, userId) => {
        console.log(`Received sync from ${userId}:`, data);
        // Update local state based on received data
        updateLocalData(data);
    });
    
    // Emit a message when local data changes
    function onLocalDataChange(newData) {
        blacksmith.sockets.emit('my-module.syncData', {
            timestamp: Date.now(),
            data: newData
        });
    }
    
    // Example: Emit when a setting changes
    Hooks.on('updateSetting', (scope, key, value) => {
        if (key === 'my-module.someSetting') {
            onLocalDataChange({ setting: value });
        }
    });
});
```

## Event Naming Best Practices

1. **Use Module Prefixes**: Always prefix events with your module ID
   - Good: `'my-module.eventName'`
   - Avoid: `'eventName'` (might conflict with other modules)

2. **Use Descriptive Names**: Make event names clear and specific
   - Good: `'cartographer.drawingStarted'`
   - Avoid: `'cartographer.event1'`

3. **Follow Conventions**: Use dot notation for namespacing
   - Good: `'module.category.action'`
   - Example: `'my-module.sync.update'`

## Error Handling

The socket API methods return Promises that may reject if something goes wrong:

```javascript
try {
    await sockets.emit('myEvent', { data: 'test' });
} catch (error) {
    console.error('Failed to emit socket message:', error);
    // Handle error (e.g., show user notification, fallback behavior)
}
```

## Timing and Initialization

The socket system initializes automatically when Blacksmith loads. However, there may be a delay before it's ready:

1. **SocketLib Detection**: Blacksmith checks for SocketLib
2. **Fallback Check**: If SocketLib isn't found, it waits before falling back to native sockets
3. **Ready Hook**: Emits `blacksmith.socketReady` hook when ready

**Important**: The socket API (`module.api.sockets`) is initialized **asynchronously** after `module.api` is created. Use one of these patterns:

**Recommended Approach:**
```javascript
// Option 1: Use BlacksmithAPI.getSockets() (handles timing automatically)
Hooks.once('ready', async () => {
    const sockets = await BlacksmithAPI.getSockets();
    await sockets.waitForReady();
    // Now safe to use sockets
    await sockets.register('myModule.event', (data) => { ... });
});

// Option 2: Wait for Blacksmith API, then wait for sockets
Hooks.once('ready', async () => {
    const blacksmith = await BlacksmithAPI.get();
    // Note: blacksmith.sockets may be null initially - wait for it
    if (!blacksmith.sockets) {
        // Wait up to 2 seconds for socket API to be exposed
        let attempts = 0;
        while (!blacksmith.sockets && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
    }
    if (blacksmith.sockets) {
        await blacksmith.sockets.waitForReady();
        // Now safe to use sockets
    }
});

// Option 3: Listen for the ready hook
Hooks.once('blacksmith.socketReady', async () => {
    const sockets = await BlacksmithAPI.getSockets();
    // Socket is ready, safe to use
});

// Option 4: Direct module access with polling
Hooks.once('ready', async () => {
    const module = game.modules.get('coffee-pub-blacksmith');
    if (module?.api) {
        // Wait for socket API to be exposed
        while (!module.api.sockets) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        await module.api.sockets.waitForReady();
        // Now safe to use
    }
});
```

## SocketLib vs Native Fallback

Blacksmith automatically handles the transport layer:

- **SocketLib (Preferred)**: Used if SocketLib module is installed and active
  - Better performance
  - More features (targeted messaging, etc.)
  - Professional-grade reliability

- **Native Fallback**: Used if SocketLib isn't available
  - Built into FoundryVTT
  - Basic functionality (broadcast to all clients)
  - Still reliable for most use cases

**You don't need to worry about this** - the API abstracts it away. However, `sockets.isUsingSocketLib()` is available if you need to know which transport is active.

## Comparison with Direct SocketLib Usage

### Direct SocketLib (what you'd do without Blacksmith):
```javascript
// Manual SocketLib setup
const socket = socketlib.registerModule('my-module');
socket.register('event', handler);
socket.emit('event', data);
```

### Using Blacksmith Socket API:
```javascript
// Blacksmith handles setup
const sockets = (await BlacksmithAPI.get()).sockets;
await sockets.waitForReady();
await sockets.register('event', handler);
await sockets.emit('event', data);
```

**Benefits:**
- No need to detect/manage SocketLib yourself
- Automatic fallback if SocketLib isn't available
- Consistent API across Coffee Pub modules
- Less code to write and maintain

## Troubleshooting

### Socket Not Ready

**Problem:** `sockets.isReady()` returns `false` or methods throw errors

**Solution:** Always wait for ready before using:
```javascript
await sockets.waitForReady();
```

### Events Not Firing

**Problem:** Registered handlers aren't being called

**Possible Causes:**
1. Socket not ready when handler was registered
2. Event name mismatch between emit and register
3. Handler registration failed (check console for errors)

**Solution:**
```javascript
// Ensure socket is ready
await sockets.waitForReady();

// Register handler
await sockets.register('my-module.event', (data) => {
    console.log('Handler called!', data);
});

// Verify registration
console.log('Handler registered for my-module.event');
```

### Messages Not Received

**Problem:** `emit()` succeeds but other clients don't receive messages

**Possible Causes:**
1. Handler not registered on receiving clients
2. Network issues
3. Module not active on receiving clients

**Solution:**
- Verify handler is registered on all clients
- Check browser console for errors
- Ensure module is active for all users

## Related Documentation

- **SocketLib Documentation**: See [SocketLib documentation](https://github.com/manuelVo/foundryvtt-socketlib) for advanced features
- **Blacksmith Core API**: See `api-core.md` for general API access

## API Reference Summary

| Method | Returns | Description |
|--------|---------|-------------|
| `waitForReady()` | `Promise<boolean>` | Wait for socket system to be ready |
| `register(eventName, handler)` | `Promise<boolean>` | Register a socket event handler |
| `emit(eventName, data, options)` | `Promise<boolean>` | Emit a socket message |
| `isReady()` | `boolean` | Check if socket is ready |
| `isUsingSocketLib()` | `boolean` | Check which transport is used |
| `getSocket()` | `Object\|null` | Get underlying socket (advanced) |
