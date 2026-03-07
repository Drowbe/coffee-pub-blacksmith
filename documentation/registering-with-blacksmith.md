# Registering with the Blacksmith API

This short guide explains how your module can integrate with **Coffee Pub Blacksmith** so it can use the Pins API, menubar tools, sockets, and other features. Squire uses this same pattern.

## 1. Declare the dependency

In your `module.json`, list Blacksmith as a dependency (or relationship) so Foundry loads it first:

```json
"relationships": {
  "requires": [
    { "id": "coffee-pub-blacksmith", "type": "module" }
  ]
}
```

Or use `includes` if Blacksmith is optional.

## 2. Get the API

You can access the API in two ways:

**Direct (sync, after Foundry is ready):**

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (!blacksmith) return; // Blacksmith not installed or not ready
```

**Bridge (async, waits for Blacksmith to be ready):**

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

const blacksmith = await BlacksmithAPI.get();
if (!blacksmith) return;
```

Use the direct form in `Hooks.once('ready', ...)` when you know Foundry (and thus Blacksmith) are already loaded. Use the bridge in `init` or when you need to wait for Blacksmith before running code.

## 3. Register in the `ready` hook

Run your registration once Foundry is ready so the API is available:

```javascript
Hooks.once('ready', async function () {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.warn('My Module | Blacksmith not found; skipping API registration.');
        return;
    }

    // Register pin types (if you use the Pins API)
    const pins = blacksmith.pins;
    if (pins?.isAvailable()) {
        pins.registerPinType('my-module-id', 'my-pin-type', 'My Pin Label');
    }

    // Register a menubar tool
    const success = blacksmith.registerMenubarTool('my-module-my-tool', {
        icon: 'fa-solid fa-star',
        name: 'my-module-my-tool',
        tooltip: 'My Tool',
        onClick: () => { /* open your UI */ },
        zone: 'left',
        group: 'general',
        moduleId: 'my-module-id',
        gmOnly: false,
        visible: true,
        // ... other options per Blacksmith menubar API
    });
});
```

## 4. Use sub-APIs

The same `blacksmith` object exposes:

| Property   | Use |
|-----------|-----|
| `blacksmith.pins` | Canvas pins: create, place, register pin types, context menu, etc. |
| `blacksmith.registerMenubarTool(id, options)` | Add a button to the Blacksmith menubar. |
| `blacksmith.registerSecondaryBarType(typeId, config)` | Define a secondary bar type (height, persistence, groups). Call first. |
| `blacksmith.registerSecondaryBarItem(barTypeId, itemId, itemData)` | Add a button/control to a secondary bar (icon, onClick, group, order). |
| `blacksmith.registerSecondaryBarTool(barTypeId, toolId)` | Optional. Link a menubar tool to a bar so the menubar syncs the tool's active state when the bar opens/closes. |
| `blacksmith.openSecondaryBar(typeId)` / `closeSecondaryBar()` / `toggleSecondaryBar(typeId)` | Show, hide, or toggle a secondary bar (e.g. from a menubar tool's onClick). |
| `blacksmith.updateSecondaryBarItemActive(barTypeId, itemId, active)` | Set which item is "active" on the bar (e.g. for radio-style mode buttons). |
| `blacksmith.unregisterSecondaryBarItem(barTypeId, itemId)` | Remove an item from a bar. |
| `blacksmith.sockets` | Register socket handlers for GM/player messaging. |
| `blacksmith.utils` | Notifications, sounds, and other helpers. |
| `blacksmith.chatCards` | Chat card rendering and helpers. |

Always guard with `if (!blacksmith)` or `if (!blacksmith.pins?.isAvailable())` (or equivalent) so your module degrades gracefully when Blacksmith is missing or not ready.

## 5. Pin types (recommended if you create pins)

If your module creates pins, register a friendly name for each pin type so context menus and tools show a clear label:

```javascript
pins.registerPinType('my-module-id', 'note', 'My Notes');
pins.registerPinType('my-module-id', 'quest', 'My Quests');
```

Create pins with the same `moduleId` and `type` so filtering and “Delete all [type] pins” work correctly.

## 6. Cleanup on unload

If you register context menu items, event handlers, or socket handlers, unregister or disconnect them in `Hooks.on('unloadModule', (id) => { ... })` when `id === 'my-module-id'` so nothing keeps a reference after your module is unloaded.

---

**Reference:** Blacksmith API details live in the [Blacksmith wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki). For a full working example, see how **Coffee Pub Squire** registers pin types and menubar tools in `scripts/squire.js` (`Hooks.once('ready', ...)`).
