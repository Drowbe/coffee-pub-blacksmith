# Blacksmith Menubar API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

## Overview

The Blacksmith Menubar API allows external modules to register custom tools with the Blacksmith menubar system. This provides a unified interface for adding functionality to the global menubar that appears above the FoundryVTT interface.

## Getting Started

### 1. Access the API

```javascript
// Get the Blacksmith module API
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Check if API is available
if (blacksmith?.registerMenubarTool) {
    // API is ready to use
} else {
    // Wait for API to load
    Hooks.once('ready', () => {
        // API should be available now
    });
}
```

### 2. Register a Tool

**Best Practice:** Always explicitly set all optional parameters for clarity and consistency. This makes your code more maintainable and follows the recommended approach.

```javascript
// Register a custom tool with all parameters explicitly set
const success = blacksmith.registerMenubarTool('my-custom-tool', {
    // Required parameters
    icon: "fa-solid fa-dice-d20",      // FontAwesome icon class
    name: "my-custom-tool",             // Tool name (used for data-tool attribute)
    onClick: () => {                    // Click handler function
        // Your tool logic here
        console.log("My custom tool clicked!");
    },
    
    // Optional parameters - recommended to set explicitly
    title: "My Custom Tool",            // Optional: Tooltip text and label (can be a function for dynamic content, defaults to name if omitted)
    tooltip: "My Custom Tool",          // Optional: explicit tooltip (defaults to title if omitted)
    zone: "left",                       // Optional: "left", "middle", "right" (default: "left")
    group: "general",                   // Optional: group name (default: "general")
    groupOrder: 999,                    // Optional: group order (default: 999, appears last)
    order: 5,                           // Optional: order within group (default: 999)
    moduleId: "my-module",              // Optional: module identifier (default: "unknown")
    gmOnly: false,                      // Optional: GM-only visibility (default: false)
    leaderOnly: false,                  // Optional: leader-only visibility (default: false)
    visible: true,                      // Optional: visibility (can be function) (default: true)
    toggleable: false,                  // Optional: toggleable behavior (default: false)
    active: false,                      // Optional: initial active state for toggleable tools (default: false)
    iconColor: null,                    // Optional: icon color - any valid CSS color (default: null)
    buttonNormalTint: null,             // Optional: normal button background color - any valid CSS color (default: null)
    buttonSelectedTint: null            // Optional: selected button background color - any valid CSS color (default: null)
});

if (success) {
    console.log("Tool registered successfully!");
} else {
    console.log("Failed to register tool");
}
```

**Note:** While many parameters are optional, explicitly setting them ensures your code is clear, maintainable, and follows best practices. The system will work with just the required parameters, but for production code, we recommend setting all optional parameters explicitly.

## API Reference

### Notification System

Notifications appear in a dedicated notification area within the middle zone of the menubar. They are separate from the zone-based tool system and do not require zone specification.

**Visual Layout:**
```
[LEFT ZONE TOOLS] [MIDDLE ZONE TOOLS] [NOTIFICATION AREA] [RIGHT ZONE TOOLS]
```

#### `addNotification(text, icon, duration, moduleId, options)`
Add a notification to the menubar.

**Parameters:**
- `text` (string): The notification text to display
- `icon` (string, optional): FontAwesome icon class (default: "fas fa-info-circle")
- `duration` (number, optional): Duration in seconds, 0 = until manually removed (default: 5)
- `moduleId` (string, optional): The module ID adding the notification (default: "blacksmith-core")
- `options` (Object, optional): Behavior options
  - `onClick` (Function, optional): Makes the notification clickable (pointer cursor + hover affordance). Called with the click event when the user clicks the notification body; the notification is then removed. `onDismiss` does **not** fire after `onClick`.
  - `onDismiss` (Function, optional): Called only when the notification goes away *without being acted on* — see the dismiss semantics table below.
  - `pulse` (boolean, optional): Animate the notification icon with an attention pulse — for "You have 5 unread messages"-style alerts.

**Returns:** `string` - The notification ID for later removal

**Note:** Notifications do not use zones. They appear in a dedicated notification area within the middle zone of the menubar, separate from the zone-based tool system.

**Note:** The notification strip is right-aligned and ordered: temporary notifications (`duration > 0`) sit to the left of persistent ones (`duration = 0`), and within each group the newest appears leftmost. Changing a notification's `duration` via `updateNotification` moves it between groups.

**Note:** Notifications are per-client and never cross the socket, which is why `onClick`/`onDismiss` can be plain function references.

**Dismiss semantics** — `onDismiss` fires only when the notification goes away *unacted-on*:

| Removal path | `onDismiss` fires? |
|---|---|
| Auto-timeout (`duration` elapses) | **Yes** |
| User clicks the × close button | **Yes** |
| User clicks the body (`onClick` ran) | No — the click already told you |
| Consumer calls `removeNotification(id)` | No — you initiated it |
| `clearNotificationsByModule` / `clearAllNotifications` | No — bulk teardown |

**Example:**
```javascript
// Add a temporary notification
const notificationId = game.modules.get('coffee-pub-blacksmith').api.addNotification(
    "New message received",
    "fas fa-envelope",
    5,
    "my-module"
);

// Add a persistent notification
const persistentId = game.modules.get('coffee-pub-blacksmith').api.addNotification(
    "Important system update available",
    "fas fa-exclamation-triangle",
    0, // 0 = until manually removed
    "my-module"
);

// Actionable notification: click opens the messages window, pulses for attention
// onClick runs in Blacksmith's context — keep it self-contained (same rule as tool onClick)
const unreadId = game.modules.get('coffee-pub-blacksmith').api.addNotification(
    "5 Unread Messages",
    "fas fa-envelope",
    30,
    "my-module",
    {
        onClick: () => openMessagesWindow(),
        onDismiss: () => console.log("Expired or closed without being read"),
        pulse: true
    }
);
```

#### `updateNotification(notificationId, updates)`
Update an existing notification.

**Parameters:**
- `notificationId` (string): The notification ID to update
- `updates` (Object): Object containing fields to update
  - `text` (string, optional): New notification text
  - `icon` (string, optional): New FontAwesome icon class
  - `duration` (number, optional): New duration in seconds (0 = persistent)
  - `onClick` (Function|null, optional): New click handler; pass `null` to strip it (the notification becomes display-only again)
  - `onDismiss` (Function|null, optional): New dismiss handler; pass `null` to strip it
  - `pulse` (boolean, optional): Toggle the attention pulse animation

**Returns:** `boolean` - True if notification was updated, false if not found

**Example:**
```javascript
// Update notification text and icon
blacksmith.updateNotification(notificationId, {
    text: "Processing complete!",
    icon: "fas fa-check-circle"
});

// Change notification to auto-remove after 3 seconds
blacksmith.updateNotification(notificationId, {
    duration: 3
});

// Make notification persistent again
blacksmith.updateNotification(notificationId, {
    duration: 0
});
```

#### `removeNotification(notificationId)`
Remove a specific notification from the menubar.

**Parameters:**
- `notificationId` (string): The notification ID to remove

**Returns:** `boolean` - True if notification was removed, false if not found

**Example:**
```javascript
game.modules.get('coffee-pub-blacksmith').api.removeNotification(notificationId);
```

#### `clearNotificationsByModule(moduleId)`
Remove all notifications from a specific module.

**Parameters:**
- `moduleId` (string): The module ID to clear notifications for

**Returns:** `number` - Number of notifications removed

**Example:**
```javascript
const removedCount = game.modules.get('coffee-pub-blacksmith').api.clearNotificationsByModule('my-module');
console.log(`Removed ${removedCount} notifications`);
```

#### `getActiveNotifications()`
Get all currently active notifications.

**Returns:** `Array` - Array of notification objects

**Example:**
```javascript
const notifications = game.modules.get('coffee-pub-blacksmith').api.getActiveNotifications();
console.log(`Currently ${notifications.length} active notifications`);
```

#### `clearAllNotifications()`
Clear all notifications from the menubar.

**Returns:** `number` - Number of notifications removed

**Example:**
```javascript
const removedCount = game.modules.get('coffee-pub-blacksmith').api.clearAllNotifications();
console.log(`Cleared ${removedCount} notifications`);
```

#### `getNotificationIdsByModule(moduleId)`
Get all notification IDs for a specific module.

**Parameters:**
- `moduleId` (string): The module ID to get notification IDs for

**Returns:** `Array` - Array of notification IDs

**Example:**
```javascript
const myNotificationIds = game.modules.get('coffee-pub-blacksmith').api.getNotificationIdsByModule('my-module');
console.log(`My module has ${myNotificationIds.length} active notifications`);
```

### Tool Registration

#### `registerMenubarTool(toolId, toolData)`

Registers a new tool with the Blacksmith menubar system.

**Parameters:**
- `toolId` (string): Unique identifier for the tool
- `toolData` (Object): Tool configuration object

**Returns:** `boolean` - Success status

**Tool Data Properties:**
- `icon` (string, required): FontAwesome icon class (e.g., "fa-solid fa-dice-d20")
- `name` (string, required): Tool name (used for data-tool attribute)
- `title` (string|Function, optional): Tooltip text and label displayed on hover. Can be a function that returns a string for dynamic tooltips. Defaults to `name` if omitted. Can be an empty string or null for icon-only buttons.
- `tooltip` (string|Function, optional): Alternative tooltip text. If provided, overrides `title` for tooltip display. Can be a function that returns a string for dynamic tooltips.
- `onClick` (Function, required): Function to execute when tool is clicked
- `zone` (string, optional): Zone placement - "left", "middle", "right" (default: "left")
- `group` (string, optional): Group name for organizing tools within a zone. Tools in the same group appear together. If not specified, defaults to "general". Groups are separated by visual dividers.
- `groupOrder` (number, optional): Order for the group within the zone. Lower numbers appear first. Blacksmith-defined groups take precedence over other modules. If not specified, defaults to 999 (appears last). Minimum value is 1.
- `order` (number, optional): Order within the group and module. Lower numbers appear first. Blacksmith tools take precedence over other modules within the same group. Default: 999.
- `moduleId` (string, optional): Module identifier (default: "unknown")
- `gmOnly` (boolean, optional): Whether tool is GM-only. Affects visibility only; tool is still added to the specified group. Default: false.
- `leaderOnly` (boolean, optional): Whether tool is leader-only. Affects visibility only; tool is still added to the specified group. Default: false.
- `visible` (boolean|Function, optional): Whether tool is visible. Can be a function that returns a boolean for dynamic visibility. Default: true.
- `toggleable` (boolean, optional): Whether tool can be toggled on/off (default: false)
- `active` (boolean, optional): Initial active state for toggleable tools (default: false)
- `iconColor` (string, optional): Icon color. Can be any valid CSS color (e.g., `'#ff0000'`, `'rgba(255, 0, 0, 0.8)'`, `'red'`). If omitted, uses default icon color. Unlike `title` and `visible`, `icon` and `iconColor` are strings only -- the template draws them straight -- so a tool that changes its appearance re-registers rather than supplying a function. See *Changing a registered tool* below.
- `buttonNormalTint` (string, optional): Background color for the button in normal state. Can be any valid CSS color (e.g., `'rgba(255, 107, 53, 0.2)'`, `'#ff6b35'`, `'red'`). If omitted, uses default button background color.
- `buttonSelectedTint` (string, optional): Background color for the button when active/selected (for toggleable tools). Can be any valid CSS color (e.g., `'rgba(255, 107, 53, 0.4)'`, `'#ff6b35'`, `'red'`). If omitted, uses default active button background color.
- `contextMenuItems` (Array | Function, optional): Right-click context menu. If provided, right-clicking the tool shows a menu instead of the browser default. Can be an array of `{ name, icon, description?, onClick, submenu? }`, or a function `(toolId, tool) => array` for dynamic items (e.g. list that depends on current state). Icon can be a Font Awesome class string (e.g. `'fa-solid fa-hand'`) or HTML (e.g. `'<i class="fa-solid fa-hand"></i>'`). `submenu` is an array of `{ name, icon, description?, onClick }` to render a flyout. Typical use: a tool that selects between several modes.

#### Changing a registered tool

There is no general update-in-place. `updateMenubarToolActive` below covers
`active` on a toggleable tool and nothing else; to change anything else --
icon, colour, title, order, visibility -- **unregister the tool and register it
again** with the new values.

```javascript
// A tool whose icon reports what its module is doing.
function refreshTool() {
    blacksmith.unregisterMenubarTool('my-module-recorder');
    blacksmith.registerMenubarTool('my-module-recorder', {
        ...base,
        icon: recording ? 'fa-solid fa-circle-dot' : 'fa-solid fa-map',
        iconColor: recording ? '#c9412d' : null
    });
}
```

Both calls re-render, and the render is debounced, so the pair costs one render
rather than two. Register only succeeds if the id is free, so the unregister is
not optional -- a re-register over a live id returns `false` and leaves the old
tool in place.

Whether the change actually reaches the screen depends on the menubar's
structure fingerprint (§9B.3 of `architecture-blacksmith.md`): a field the
fingerprint does not cover takes the lightweight refresh path, which updates
leader, movement, timer and vote nodes only, and the button keeps whatever it
was last drawn with.

Covered today: `visible` (with `gmOnly` / `leaderOnly`), `zone`, `group`,
`order`, `active`, `title`, `icon`, `iconColor`. **Not covered**, though the
template draws them: `name`, `tooltip`, `toggleable`, `buttonNormalTint`,
`buttonSelectedTint`, `groupOrder`. Re-registering a tool to change only one of
those will not repaint it. Change one of the covered fields alongside, or treat
them as fixed at registration.

**If you add a property that the template draws, add it to the fingerprint** --
this has been missed twice, once for `title` and once for `icon`, and both times
the symptom was a button that reported stale state indefinitely while the
registration itself was correct.

#### `updateMenubarToolActive(toolId, active)`

Updates the active state of a toggleable tool.

**Parameters:**
- `toolId` (string): Unique identifier for the tool
- `active` (boolean): The active state to set

**Returns:** `boolean` - Success status

**Note:** Only works for tools registered with `toggleable: true`.

**Example:**
```javascript
// Update a toggleable tool's active state programmatically
blacksmith.updateMenubarToolActive('my-toggle-tool', true);
```

#### `invokeMenubarTool(toolId, context?)`

Runs a registered tool's `onClick` from anywhere, without clicking its icon. Returns `false` if no such tool is registered. Registration already knows what a tool does; this makes that knowledge callable, so a second surface wanting the same behaviour does not reimplement it or reach into the owning module.

#### `invokeIntent(intent, context?)` / `hasIntentHandler(intent)`

An **intent** is a capability a tool claims, declared at registration:

```javascript
blacksmith.registerMenubarTool('my-module-vitals', {
    icon: 'fa-solid fa-heart',
    name: 'Vitals',
    onClick: () => VitalsPanel.open(),
    intents: ['party-health']
});
```

Any surface can then ask for the capability rather than for the module:

```javascript
if (blacksmith.hasIntentHandler('party-health')) {
    blacksmith.invokeIntent('party-health', { source: 'my-bar' });
}
```

This is how a Blacksmith surface integrates with a sibling without naming it. Blacksmith's combat bar opens a health panel when the party health bars are clicked, and it has no health panel of its own -- naming another module's tool id in the hub would be exactly the coupling the suite's module boundaries forbid. Whichever module claims the intent answers; if none does, `invokeIntent` returns `false`.

**Ask `hasIntentHandler` before offering the interaction**, not just before running it. A control that looks clickable and does nothing is the failure the readout styling rules exist to prevent, and an unclaimed intent is that failure in a different costume.

Registration order decides ties. Two modules claiming one intent is a configuration the user chose, not an error to resolve here.

Blacksmith's own Health tool claims `party-health`, so the combat bar's health bars are clickable without any sibling installed. A sibling claiming the same intent takes over only if it registers first.

#### `supersedes` -- replacing a tool that moved modules

A tool may declare the ids it replaces:

```javascript
blacksmith.registerMenubarTool('my-module-notes', {
    icon: 'fa-solid fa-note',
    name: 'Notes',
    onClick: () => NotesWindow.open(),
    supersedes: ['other-module-notes']
});
```

A listed id already registered is dropped; a listed id registering later is refused and its `registerMenubarTool` call returns `false`. Both halves exist because module load order is not something either module controls, so the outcome is the same whichever registers first.

This is for the window during which a tool has moved from one module to another and a user has updated one module but not the other -- without it they see two identical icons. It is not a priority system, and an entry should be removed once the release that dropped the old tool has shipped.

`unregisterMenubarTool` releases whatever claims a tool made, so removing the new owner lets the old id register again.

#### `unregisterMenubarTool(toolId)`

Removes a tool from the Blacksmith menubar system.

**Parameters:**
- `toolId` (string): Unique identifier for the tool

**Returns:** `boolean` - Success status

### Tool Querying

#### `getRegisteredMenubarTools()`

Gets all registered tools.

**Returns:** `Map` - Map of all registered tools (toolId -> toolData)

#### `getMenubarToolsByModule(moduleId)`

Gets all tools registered by a specific module.

**Parameters:**
- `moduleId` (string): Module identifier

**Returns:** `Array` - Array of tools registered by the module

#### `isMenubarToolRegistered(toolId)`

Checks if a tool is registered.

**Parameters:**
- `toolId` (string): Unique identifier for the tool

**Returns:** `boolean` - Whether the tool is registered

#### `getMenubarToolsByZone()`

Gets all tools organized by their zones, groups, and modules.

**Returns:** `Object` - Object with zones containing groups, which contain module arrays with tools
```javascript
{
    left: {
        "combat": [
            { moduleId: "blacksmith-core", tools: [/* tool objects */], isBlacksmith: true },
            { moduleId: "other-module", tools: [/* tool objects */], isBlacksmith: false }
        ],
        "general": [
            { moduleId: "blacksmith-core", tools: [/* tool objects */], isBlacksmith: true }
        ]
    },
    middle: {
        "utility": [
            { moduleId: "blacksmith-core", tools: [/* tool objects */], isBlacksmith: true }
        ],
        "general": [...]
    },
    right: {
        "general": [...]
    }
}
```

**Structure:**
- **Zone** (`left`, `middle`, `right`): Top-level organization
- **Group** (e.g., `"combat"`, `"utility"`, `"general"`): Groups within each zone, sorted by `groupOrder`
- **Module Array**: Array of objects, each containing:
  - `moduleId` (string): The module identifier
  - `tools` (Array): Array of tool objects for this module
  - `isBlacksmith` (boolean): Whether this module is Blacksmith
- Tools within each module are sorted by their `order` value
- Modules within a group are sorted with Blacksmith first, then by minimum tool `order` value

**Note:** Only visible tools are included in the returned structure. Tools filtered by `gmOnly`, `leaderOnly`, or `visible` are excluded.

## Menubar Control API

### `renderMenubar(immediate)`

Request a re-render of the menubar. Use this when your module's settings or state change and the menubar should reflect those changes (e.g. tool visibility, secondary bar state).

**Parameters:**
- `immediate` (boolean, optional): If `true`, re-render immediately. If `false` (default), debounces the render by ~50ms to batch rapid changes.

**Returns:** `Promise<void>`

**Example:**
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.renderMenubar) {
    blacksmith.renderMenubar(); // Debounced
    // or
    blacksmith.renderMenubar(true); // Immediate
}
```

### `registerMenubarVisibilityOverride(moduleId, callback)`

Register a callback that can hide the menubar for specific users — for example, when a module wants a designated user to see a clean, UI-free view.

**Parameters:**
- `moduleId` (string): Your module identifier (e.g. `'coffee-pub-herald'`)
- `callback` (function): Called with `(user)` and returns `{ hide: true }` to hide the menubar for that user, or `{ hide: false }` (or omit `hide`) to allow the menubar

**Example:**
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
blacksmith?.registerMenubarVisibilityOverride('my-module', (user) => {
    const shouldHide = /* your logic */;
    return { hide: shouldHide };
});
```

### `unregisterMenubarVisibilityOverride(moduleId)`

Unregister a visibility override (e.g. on module unload).

**Parameters:**
- `moduleId` (string): The same module ID used when registering

**Example:**
```javascript
blacksmith?.unregisterMenubarVisibilityOverride('my-module');
```

## Menubar Zones

The menubar system organizes tools into three predefined zones:

### Zone Layout:
- **`left`** - Action tools (movement, interface, voting, skill checks)
- **`middle`** - General tools and utilities (supports grouping with visual dividers)
- **`right`** - Informational tools (leader display, timer)

### Zone Guidelines:
- **`left`**: Primary action tools that users interact with frequently
- **`middle`**: Secondary tools and utilities (supports grouping system)
- **`right`**: Read-only information displays and status indicators

### Zone Organization:
- Tools within each zone can be organized into **groups** using the `group` parameter
- Groups are separated by visual dividers in the menubar
- The grouping system is most commonly used in the `middle` zone, but works in all zones
- Groups are sorted by `groupOrder`, with lower numbers appearing first

## Visibility System

The menubar uses a three-tier visibility system:

### User Types:
- **GM**: Sees all tools (including GM tools and leader tools)
- **LEADER**: Sees all tools except GM tools, plus leader tools
- **PLAYER**: Sees all tools except GM tools and leader tools

### Tool Properties:
- **`gmOnly: true`**: Only visible to Game Masters
- **`leaderOnly: true`**: Visible to party leaders and GMs
- **Default**: Visible to all users

### Dynamic Visibility:
```javascript
// Tool with dynamic visibility
blacksmith.registerMenubarTool('my-conditional-tool', {
    icon: "fa-solid fa-eye",
    name: "my-conditional-tool",
    title: "Conditional Tool",
    tooltip: "Conditional Tool",
    zone: "left",
    group: "general",
    groupOrder: 999,
    order: 20,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: false,
    visible: () => {
        // Only show if certain conditions are met
        return game.user.isGM || game.settings.get('my-module', 'enableFeature');
    },
    toggleable: false,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        // Tool logic
    }
});
```

## Grouping System

The menubar uses a **tiered grouping system** to organize tools logically:

### Organization Hierarchy

Tools are organized in the following hierarchy:
1. **Zone** (`left`, `middle`, `right`)
2. **Group** (e.g., `"combat"`, `"utility"`, `"party"`, `"general"`)
3. **Module** (tools from the same module are clustered together)
4. **Order** (within the module, by `order` value)

### Group Organization

- **Groups are separated by visual dividers** in the menubar
- **Groups are sorted by `groupOrder`** (lower numbers appear first)
- **Within a group**, tools are organized by module:
  - Blacksmith tools appear first (if any)
  - Other modules follow, sorted by the minimum `order` value of their tools
- **Within a module**, tools are sorted by `order` value

### Blacksmith-Defined Groups

Blacksmith defines the following groups with their order priorities:

- **`"combat"`** (order: 1) - Combat-related tools
- **`"utility"`** (order: 2) - Utility tools
- **`"party"`** (order: 3) - Party management tools
- **`"general"`** (order: 999) - Default group, always appears last

### Group Priority Rules

1. **Blacksmith groups take precedence**: If Blacksmith defines a group order, it overrides any other module's definition
2. **"general" group is always last**: The default group always has order 999 and appears after all other groups
3. **Dynamic groups**: Modules can create new groups by specifying a `group` name. If the group doesn't exist, it's created automatically
4. **Auto-assignment**: If a module specifies a `groupOrder` >= 999, it's automatically assigned to the first available slot below 999

### Visibility and Groups

- `gmOnly` and `leaderOnly` affect **visibility only** - tools are still added to their specified group
- Hidden tools don't affect group ordering or module clustering

## Ordering Guidelines

### Group Ordering

- **Lower `groupOrder` values appear first** within each zone
- **Recommended `groupOrder` ranges**:
  - `1-10`: Core/primary groups (combat, utility, party)
  - `11-50`: Secondary groups
  - `51-100`: Utility groups
  - `101-998`: Custom groups
  - `999`: Default "general" group (always last)

### Tool Ordering Within Groups

- **Lower `order` values appear first** within each module
- **Blacksmith tools take precedence** over other modules within the same group
- **Recommended `order` ranges**:
  - `1-10`: Core/primary tools
  - `11-50`: Secondary tools
  - `51-100`: Utility tools
  - `101+`: Optional/advanced tools

## Example Usage

### Notification Management

#### Complete Module Notification Management
```javascript
class MyModule {
    constructor() {
        this.notificationIds = new Set(); // Track our notification IDs
        this.moduleId = 'my-module';
        this.blacksmith = null;
    }

    async initialize() {
        // Wait for Blacksmith API to be ready
        this.blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (!this.blacksmith) {
            console.error('Blacksmith API not available');
            return;
        }
    }

    // Add a notification and track the ID
    addNotification(text, icon = "fas fa-info", duration = 5) {
        if (!this.blacksmith) return null;

        const notificationId = this.blacksmith.addNotification(text, icon, duration, this.moduleId);
        if (notificationId) {
            this.notificationIds.add(notificationId);
        }
        return notificationId;
    }

    // Update a specific notification
    updateNotification(notificationId, newText, newIcon) {
        if (!this.blacksmith) return false;

        return this.blacksmith.updateNotification(notificationId, {
            text: newText,
            icon: newIcon
        });
    }

    // Remove a specific notification
    removeNotification(notificationId) {
        if (!this.blacksmith) return false;

        const success = this.blacksmith.removeNotification(notificationId);
        if (success) {
            this.notificationIds.delete(notificationId);
        }
        return success;
    }

    // Clean up all our notifications when module is disabled
    cleanup() {
        if (this.blacksmith) {
            this.blacksmith.clearNotificationsByModule(this.moduleId);
            this.notificationIds.clear();
        }
    }

    // Get all our current notification IDs
    getMyNotificationIds() {
        if (!this.blacksmith) return [];
        return this.blacksmith.getNotificationIdsByModule(this.moduleId);
    }

    // Example: Show a progress notification that updates
    async showProgressNotification() {
        const notificationId = this.addNotification(
            "Starting process...", 
            "fas fa-spinner fa-spin", 
            0 // Persistent
        );

        // Simulate progress updates
        setTimeout(() => {
            this.updateNotification(notificationId, {
                text: "Processing... 50%",
                icon: "fas fa-spinner fa-spin"
            });
        }, 2000);

        setTimeout(() => {
            this.updateNotification(notificationId, {
                text: "Processing complete!",
                icon: "fas fa-check-circle",
                duration: 3 // Auto-remove after 3 seconds
            });
        }, 4000);
    }
}

// Foundry has no module-unload event, so there is no teardown hook to register.
// Call cleanup from your own lifecycle when you turn the feature off:
//   myModuleInstance.cleanup();
```

#### Simple Notification Examples
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Add a temporary notification
const tempId = blacksmith.addNotification(
    "Task completed!", 
    "fas fa-check", 
    5, 
    "my-module"
);

// Add a persistent notification
const persistentId = blacksmith.addNotification(
    "System is processing...", 
    "fas fa-spinner fa-spin", 
    0, // 0 = persistent
    "my-module"
);

// Update the persistent notification when done
blacksmith.updateNotification(persistentId, {
    text: "Processing complete!",
    icon: "fas fa-check-circle",
    duration: 3 // Now auto-remove after 3 seconds
});

// Or remove it manually
blacksmith.removeNotification(persistentId);
```

### Basic Tool Registration

**Best Practice:** Always explicitly set all optional parameters for clarity and consistency.

```javascript
// Register a simple utility tool (left zone)
blacksmith.registerMenubarTool('my-utility', {
    icon: "fa-solid fa-calculator",
    name: "my-utility",
    title: "My Utility Tool",
    tooltip: "My Utility Tool",  // Optional: explicit tooltip (defaults to title)
    zone: "left",
    group: "general",             // Optional: group name (default: "general")
    groupOrder: 999,              // Optional: group order (default: 999)
    order: 10,                     // Optional: order within group (default: 999)
    moduleId: "my-module",        // Optional: module identifier (default: "unknown")
    gmOnly: false,                // Optional: GM-only visibility (default: false)
    leaderOnly: false,            // Optional: leader-only visibility (default: false)
    visible: true,                // Optional: visibility (default: true)
    toggleable: false,            // Optional: toggleable behavior (default: false)
    active: false,                // Optional: initial active state (default: false)
    iconColor: null,              // Optional: icon color (default: null)
    buttonNormalTint: null,      // Optional: normal button background color (default: null)
    buttonSelectedTint: null,     // Optional: selected button background color (default: null)
    onClick: () => {
        // Your utility logic
        ui.notifications.info("Utility tool activated!");
    }
});
```

### GM-Only Tool

```javascript
// Register a GM-only admin tool
blacksmith.registerMenubarTool('my-admin-tool', {
    icon: "fa-solid fa-cog",
    name: "my-admin-tool",
    title: "Admin Tool",
    tooltip: "Admin Tool",
    zone: "middle",
    group: "general",
    groupOrder: 999,
    order: 5,
    moduleId: "my-module",
    gmOnly: true,                 // Only visible to GMs
    leaderOnly: false,
    visible: true,
    toggleable: false,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        // Admin functionality
        console.log("Admin tool used by GM");
    }
});
```

### Leader Tool

```javascript
// Register a leader-only tool
blacksmith.registerMenubarTool('my-leader-tool', {
    icon: "fa-solid fa-crown",
    name: "my-leader-tool",
    title: "Leader Tool",
    tooltip: "Leader Tool",
    zone: "left",
    group: "general",
    groupOrder: 999,
    order: 1,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: true,             // Visible to leaders and GMs
    visible: true,
    toggleable: false,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        // Leader functionality
        ui.notifications.info("Leader tool activated!");
    }
});
```

### Right Zone Information Tool

```javascript
// Register an informational tool for the right zone
blacksmith.registerMenubarTool('my-status-tool', {
    icon: "fa-solid fa-info-circle",
    name: "my-status-tool",
    title: "Status Information",
    tooltip: "Status Information",
    zone: "right",
    group: "general",
    groupOrder: 999,
    order: 10,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: false,
    visible: true,
    toggleable: false,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        // Display status information
        ui.notifications.info("Status: All systems operational");
    }
});
```

### Toggleable Tool

```javascript
// Register a toggleable tool that shows active/inactive state
blacksmith.registerMenubarTool('my-toggle-tool', {
    icon: "fa-solid fa-toggle-on",
    name: "my-toggle-tool",
    title: "Toggle Feature",
    tooltip: "Toggle Feature",
    zone: "left",
    group: "general",
    groupOrder: 999,
    order: 15,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: false,
    visible: true,
    toggleable: true,              // Enable toggleable behavior
    active: false,                 // Initial state
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        // The active state is automatically toggled by the system
        // Check the current state if needed
        const tool = blacksmith.getRegisteredMenubarTools().get('my-toggle-tool');
        if (tool.active) {
            console.log("Feature is now active");
        } else {
            console.log("Feature is now inactive");
        }
    }
});

// Update active state programmatically
blacksmith.updateMenubarToolActive('my-toggle-tool', true);
```

### Tool with Custom Colors

```javascript
// Register a tool with custom icon and button colors
blacksmith.registerMenubarTool('my-colored-tool', {
    icon: "fa-solid fa-palette",
    name: "my-colored-tool",
    title: "Colored Tool",
    tooltip: "Colored Tool",
    zone: "middle",
    group: "utility",
    groupOrder: 2,
    order: 10,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: false,
    visible: true,
    toggleable: false,
    active: false,
    iconColor: "#ff6b35",                              // Orange icon
    buttonNormalTint: "rgba(255, 107, 53, 0.2)",      // Light orange background
    buttonSelectedTint: "rgba(255, 107, 53, 0.4)",    // Darker orange when active
    onClick: () => {
        ui.notifications.info("Colored tool activated!");
    }
});
```

### Tool in Custom Group

```javascript
// Register a tool in a custom group (creates the group automatically)
blacksmith.registerMenubarTool('my-custom-tool', {
    icon: "fa-solid fa-star",
    name: "my-custom-tool",
    title: "Custom Group Tool",
    tooltip: "Custom Group Tool",
    zone: "middle",
    group: "my-custom-group",      // Creates new group automatically
    groupOrder: 50,                // Appears after utility (2) but before general (999)
    order: 1,
    moduleId: "my-module",
    gmOnly: false,
    leaderOnly: false,
    visible: true,
    toggleable: false,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        ui.notifications.info("Custom group tool activated!");
    }
});
```

### Module Cleanup

```javascript
// Foundry has no module-unload event, and disabling a module reloads the world, which clears
// registered tools anyway. Unregister only if you turn a feature off at runtime:
const tools = blacksmith.getMenubarToolsByModule('my-module');
tools.forEach(tool => blacksmith.unregisterMenubarTool(tool.toolId));
```

## Error Handling

The API includes robust error handling:

- **Invalid tool data**: Returns `false` and logs error
- **Duplicate tool IDs**: Returns `false` (tools must be unique)
- **Missing required properties**: Returns `false` and logs error
- **API not available**: Check for API availability before use

## `onClick` and `this`

Your `onClick` is stored and invoked as a plain function call (`tool.onClick(event)`). Two consequences:

- **Your closures work normally.** The function keeps its lexical scope, so module-level imports and
  variables captured at definition time are available when it runs. Blacksmith's own menubar tools rely
  on this — e.g. `onClick: () => new MovementConfig().render(true)`, closing over an import.
- **`this` is not bound.** Because the call is unbound, `this` inside a non-arrow `onClick` is
  `undefined`. If you need instance context, use an arrow function or bind it yourself:

```javascript
import { MyManager } from './manager-my.js';

blacksmith.registerMenubarTool('my-module-tool', {
    icon: 'fa-solid fa-star',
    name: 'my-module-tool',
    moduleId: 'my-module-id',
    onClick: () => MyManager.doSomething()   // arrow: closure intact, no `this` needed
});

// If you must use a method as the handler, bind it:
blacksmith.registerMenubarTool('my-module-other', {
    /* ... */
    onClick: this.handleClick.bind(this)
});
```

Errors thrown inside `onClick` are caught and logged by Blacksmith so one bad tool cannot break the
menubar — which also means a thrown error will not surface as an uncaught exception. Handle your own
failures if you need the user to see them.

## Best Practices

1. **Explicit Parameter Setting**: Always explicitly set all optional parameters when registering tools. This ensures clarity, consistency, and makes your code more maintainable:
   ```javascript
   // Good: Explicit parameters
   blacksmith.registerMenubarTool('my-tool', {
       icon: "fa-solid fa-icon",
       name: "my-tool",
       title: "My Tool",
       tooltip: "My Tool",
       zone: "left",
       group: "general",
       groupOrder: 999,
       order: 10,
       moduleId: "my-module",
       gmOnly: false,
       leaderOnly: false,
       visible: true,
       toggleable: false,
       active: false,
       iconColor: null,
       buttonNormalTint: null,
       buttonSelectedTint: null,
       onClick: () => {}
   });
   
   // Avoid: Relying on defaults (less clear)
   blacksmith.registerMenubarTool('my-tool', {
       icon: "fa-solid fa-icon",
       name: "my-tool",
       title: "My Tool",
       onClick: () => {}
   });
   ```

2. **Self-Contained Functions**: Make onClick functions completely self-contained with all dependencies imported

3. **Unique Tool IDs**: Use descriptive, unique tool identifiers

4. **Proper Zone Selection**: Choose the most appropriate zone for your tool:
   - `left`: Primary action tools
   - `middle`: General tools and utilities
   - `right`: Informational/read-only tools

5. **Group Organization**: Use appropriate groups to organize related tools:
   - Use existing Blacksmith groups (`"combat"`, `"utility"`, `"party"`) when appropriate
   - Create custom groups for module-specific tool collections
   - Use `groupOrder` to control group positioning

6. **Consistent Ordering**: Use consistent `order` values within your module:
   - Lower numbers appear first
   - Reserve ranges for different tool types

7. **Color Format Flexibility**: When using `iconColor`, `buttonNormalTint`, or `buttonSelectedTint`, you can use any valid CSS color format:
   - Hex: `'#ff6b35'`
   - RGB/RGBA: `'rgba(255, 107, 53, 0.2)'`
   - Named colors: `'red'`
   - HSL: `'hsl(15, 100%, 60%)'`

8. **Module Cleanup**: Unregister tools when your module is disabled

9. **Error Handling**: Always check return values and handle errors gracefully

10. **API Availability**: Check if the API is available before using it

11. **Scope Awareness**: Understand that onClick functions execute in Blacksmith's context, not your module's context

## Troubleshooting

### Tool Not Appearing
- Check if tool is registered: `blacksmith.isMenubarToolRegistered('tool-id')`
- Verify visibility settings (gmOnly, leaderOnly, visible function)
- Check console for error messages
- Ensure API is loaded: `blacksmith?.registerMenubarTool`

### API Not Available
- Use correct API path: `blacksmith.registerMenubarTool()` not `blacksmith.api.registerMenubarTool()`
- Wait for `ready` hook, not `blacksmithUpdated` hook
- Check if module is active: `game.modules.get('coffee-pub-blacksmith')?.active`

### Tool in Wrong Zone
- Verify `zone` property is set correctly
- Check zone spelling (must match "left", "middle", or "right" exactly)
- Default zone is "left" if not specified

### Tool Click Errors
- **`TypeError: Cannot read properties of undefined`** on `this` — your `onClick` is invoked unbound, so
  `this` is `undefined` in a non-arrow function. Use an arrow function or `.bind(this)`. See
  [`onClick` and `this`](#onclick-and-this).
- **Nothing happens on click** — errors thrown inside `onClick` are caught and logged by Blacksmith rather
  than surfacing as uncaught exceptions. Check the console for the logged error.
- **A different module's tool fires** — two tools registered with the same `name`. Dispatch keys on
  `toolId`; make sure yours is unique and prefixed with your module id.

### Tool Not Clickable
- Verify `onClick` function is provided and valid
- Check for JavaScript errors in onClick function
- Ensure tool is not disabled by visibility logic

## Secondary Bar API

The menubar supports **secondary bars** - additional toolbars that appear below the main menubar, similar to tabs. Only one secondary bar can be open at a time. When you open a new secondary bar, the existing one automatically closes.

**Secondary bar methods at a glance:**

| Method | Purpose |
|--------|---------|
| `registerSecondaryBarType(typeId, config)` | Define a bar type (size, persistence, groups). Call this first. |
| `getSecondaryBarHeight(typeId)` | The height in pixels a bar type renders at, including the house default. |
| `registerSecondaryBarItem(barTypeId, itemId, itemData)` | Add a button or info item to a bar (zone, group, icon/onClick or label/value). |
| `registerSecondaryBarTool(barTypeId, toolId)` | Optional. Link a menubar tool to this bar so the menubar syncs the tool's active state when the bar opens/closes. |
| `unregisterSecondaryBarItem(barTypeId, itemId)` | Remove an item from a bar. |
| `openSecondaryBar(typeId, options)` / `closeSecondaryBar()` / `toggleSecondaryBar(typeId, options)` | Show, hide, or toggle a secondary bar (e.g. from a menubar tool's onClick). |
| `updateSecondaryBarItemActive(barTypeId, itemId, active)` | Set which button is active on the bar (e.g. radio-style mode buttons). |
| `updateSecondaryBarItemInfo(barTypeId, itemId, updates)` | Update the value, label, or tooltip of an info item (for dynamic display without re-registering). |
| `getSecondaryBarItems(barTypeId)` | Get the list of items for a bar. |
| `updateSecondaryBar(data)` | Update data for an already-open bar (e.g. custom template content). |

**Important:** **Always use the default tool system** unless your use case absolutely requires a custom template. The default tool system is simpler, faster to implement, timing-safe, and sufficient for most toolbars. Only use custom templates for complex UIs that cannot be achieved with simple button-based tools.

**Common Use Cases:**
- Combat tracker (built-in, uses custom template for complex portraits/health rings)
- Drawing tools (Cartographer, uses default tool system)
- Specialized toolbars for specific activities

### Secondary Bar Behavior

- **Tab-like behavior**: Only one secondary bar can be open at a time
- **Automatic switching**: Opening a new secondary bar closes the currently open one
- **Persistence modes**: `'manual'` (user closes) or `'auto'` (auto-closes after delay)
- **Sizing**: a bar type asks for a size preset; a bar that asks for nothing gets the house default, which is the same height as the primary menubar

### Secondary Bar Sizing

A bar's height is a **master scale factor**, not just a dimension. Every font size, icon size, gap, and
padding inside the bar is derived from it, so raising the height to fit content also enlarges the type. Bars
that each picked their own number therefore do not read as one system, which is why sizing is expressed as a
preset rather than a pixel value. The mechanism is described in
`../architecture/architecture-menubar.md`.

`config.size` accepts:

| Preset | Height | Use |
|---|---|---|
| `'default'` | 30px, matching the primary menubar | Everything, unless there is a reason not to |
| `'large'` | 45px | Bars whose content genuinely needs the room |
| `'xlarge'` | 60px | Bars meant to be read at a distance, or holding portraits |

Omitting `size` gives `'default'`. An unrecognised preset name logs a warning and falls back to the default.

**There is no pixel option.** `config.height` is ignored and logs a warning saying so. A bespoke number sets
the bar's typography as well as its size and stops tracking the house default, and every module in the suite
took that option when it existed. If none of the presets fit, the answer is a new preset in Blacksmith --
a suite-wide decision -- not a local number.

A custom template (`templatePath`) does not change this. It controls the bar's markup; the bar still renders
inside the same element, still takes its height from the same variable, and still scales its type from it.

`openSecondaryBar(typeId, { height })` is a different thing and is not a way to pick a size: it re-opens a bar
at a height that bar recomputed for itself. The encounter bar uses it because it is two rows whose combined
height changes with combat state. A bar with one fixed appearance has no use for it.

**Group banners do not come out of the height.** A bar with `groupBannerEnabled: true` gets its banner space
added on top, so its buttons are the same size as an identically-sized bar without banners. Do not size a bar
up to make room for banners.

`getSecondaryBarHeight(typeId)` returns the height in pixels a given type renders at, resolving the type's
own CSS variable if it declares one and the house default otherwise.

### Default Bar Zones and Item Kinds

The **default tool system** (no custom template) supports:

- **Zones**: Each item can specify a zone: `'left'`, `'middle'`, or `'right'`. Items without a zone default to `'middle'`. The bar renders three regions: left-aligned, center, and right-aligned. This matches the main menubar's left/middle/right layout so you can build encounter-style bars (info on the sides, actions in the center) without a custom template.
- **Item kinds**:
  - **Button** (default): Clickable item with `icon` or `image` and `onClick`. Same as before.
  - **Info**: Display-only item with `label` and/or `value`. No `onClick`. Use `updateSecondaryBarItemInfo(barTypeId, itemId, { value, label })` to update the displayed text so the bar can show dynamic content (e.g. Party CR, Difficulty) without re-registering.

### Registering a Secondary Bar Type

Before you can open a secondary bar, you must register its type. The system supports three approaches:

1. **Default Tool System** (recommended - use this unless custom template is absolutely necessary) - Register individual tools/items
2. **Custom Template** (only when default system cannot meet your needs) - Provide a custom Handlebars template
3. **Hybrid** (`templatePath` plus `hybridItems: true`) - Your template draws the bar and also renders registered items

**Default and custom are mutually exclusive; hybrid combines them.** A bar with only `templatePath` replaces the entire bar and rejects `registerSecondaryBarItem` calls. Adding `hybridItems: true` makes the bar accept items, prepares the zones alongside the custom payload, and puts `zones`, `groupBannerEnabled`, and `groupBannerColor` on the object your template receives - so the template can render items by passing its own context to the shared partial:

```handlebars
{{> "menubar-secondary-default" this}}
```

Reach for hybrid when part of the bar cannot be expressed as items and the rest is better off as items - the combat bar's portrait strip needs custom markup, while its readouts are `info`, `progressbar`, and `balancebar` items.

**Choose the default tool system unless you need:**
- Complex nested HTML structures
- Custom graphics/SVG elements (like health rings)
- Dynamic data-driven layouts that buttons can't handle
- Highly specialized UI components

**Use default tool system for:**
- Simple button-based toolbars
- Drawing tools, filters, toggles
- Any toolbar that can be represented as a row of buttons/controls

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Option 1: Register a bar type using the default tool system (no template needed)
const success = await blacksmith.registerSecondaryBarType('cartographer', {
    size: 'default',               // 'default', 'large', or 'xlarge'
    persistence: 'manual',         // 'manual' or 'auto'
    autoCloseDelay: 10000,         // Auto-close delay in ms (if persistence is 'auto')
    groups: {                      // Optional: Group configuration
        'line-size': {
            mode: 'switch',        // 'switch' or 'default'
            order: 10
        },
        'colors': {
            mode: 'switch',
            order: 20
        },
        'tools': {
            mode: 'default',       // Default mode allows mixed behaviors
            order: 0
        }
    }
    // No templatePath = uses default tool system
});

// Option 2: Register a bar type with a custom template (for complex UIs)
const success = blacksmith.registerSecondaryBarType('combat', {
    size: 'xlarge',
    persistence: 'manual',
    templatePath: 'modules/my-module/templates/menubar-combat.hbs'  // Custom template path
});

if (success) {
    console.log("Secondary bar type registered!");
}
```

**Parameters:**
- `typeId` (string, required): Unique identifier for the bar type (e.g., 'cartographer', 'combat')
- `config` (Object, required): Configuration object
  - `size` (string, optional): Size preset - `'default'`, `'large'`, or `'xlarge'` (default: `'default'`). See Secondary Bar Sizing above. There is no pixel equivalent; `height` is ignored and warns.
  - `persistence` (string, optional): `'manual'` or `'auto'` (default: `'manual'`)
  - `autoCloseDelay` (number, optional): Auto-close delay in milliseconds (default: 10000)
  - `templatePath` (string, optional): Path to custom Handlebars template partial. If not provided, uses the default tool system.
  - `hybridItems` (boolean, optional): With `templatePath`, also accept registered items and prepare their zones (default: `false`). The template receives `zones`, `groupBannerEnabled`, and `groupBannerColor` on its context and renders them by passing that context to the `menubar-secondary-default` partial. Without this flag a custom-template bar rejects `registerSecondaryBarItem`. Ignored when there is no `templatePath`.
  - `groupBannerEnabled` (boolean, optional): Enable group banners above each button group (default: `false`). A banner captions a cluster of otherwise unlabelled buttons; leave it off for groups of readouts, which carry their own labels.
  - `groupBannerColor` (string, optional): Background color for group banners - any valid CSS color (default: `'rgba(62, 62, 163, 0.9)'`)
  - `groups` (Object, optional): Group configuration object. Maps group IDs to group configs:
    - `groupId` (string): Unique identifier for the group (e.g., 'line-size', 'colors')
    - `mode` (string, optional): Group behavior mode - `'default'` or `'switch'` (default: `'default'`)
      - `'default'`: Independent buttons (can have toggleable buttons)
      - `'switch'`: Only one button active at a time, one always active
    - `order` (number, optional): Display order for the group (lower numbers appear first, default: 999)

**Returns:** `Promise<boolean>` - Success status (async method)

**Note:** This method is async because it loads custom templates. Use `await` or `.then()` when using custom templates.

**Group Configuration:**
- Groups allow you to organize buttons into logical sections
- Multiple modules can contribute groups to the same bar type (groups are merged)
- Groups with different IDs will have dividers between them
- The `'default'` group always exists if no group is specified for an item
- Group modes determine how buttons within that group behave (see Secondary Bar Groups section below)

**Group Banners:**
- When `groupBannerEnabled` is `true`, a banner appears above each button group
- The banner displays the group ID as text (e.g., "modes", "tools", "colors")
- Banner height scales proportionally with the secondary bar height (20% of bar height, clamped 10-20px)
- Banner text is automatically scaled to match (10% of bar height, clamped 8-14px)
- Banner text color is always `rgba(255, 255, 255, 0.9)` for consistency
- Banners are additive: the banner and its gap are added to the bar's height rather than taken out of it, so buttons on a bannered bar are the same size as buttons on an identically-sized bar without banners. The extra space is included in `--blacksmith-menubar-total-height`, so the interface below the menubar moves down to match
- Use group banners to provide visual organization and labeling for button groups

### Opening a Secondary Bar

```javascript
// Open your secondary bar
const success = blacksmith.openSecondaryBar('cartographer', {
    data: {
        // Your custom data to pass to the template
        tools: ['pencil', 'eraser', 'line'],
        activeTool: 'pencil'
    },
    persistence: 'manual'          // Optional: override registered persistence
});

if (success) {
    console.log("Cartographer bar opened!");
}
```

**Parameters:**
- `typeId` (string, required): The registered bar type ID
- `options` (Object, optional): Options for the bar
  - `data` (Object, optional): Data to pass to the bar template
  - `height` (number, optional): Re-open at a height the bar recomputed for itself, for a bar whose height changes with its own state. Not a way to choose a size - see Secondary Bar Sizing.
  - `persistence` (string, optional): Override the registered persistence mode

**Returns:** `boolean` - Success status

**Note:** Opening a secondary bar automatically closes any currently open secondary bar.

### Closing a Secondary Bar

```javascript
// Close the currently open secondary bar
const success = blacksmith.closeSecondaryBar();

if (success) {
    console.log("Secondary bar closed!");
}
```

**Returns:** `boolean` - Success status

### Toggling a Secondary Bar

```javascript
// Toggle the cartographer bar (opens if closed, closes if open)
const success = blacksmith.toggleSecondaryBar('cartographer', {
    data: {
        tools: ['pencil', 'eraser'],
        activeTool: 'pencil'
    }
});
```

**Parameters:**
- `typeId` (string, required): The bar type to toggle
- `options` (Object, optional): Options for the bar (same as `openSecondaryBar`)

**Returns:** `boolean` - Success status

**Behavior:**
- If the bar is closed, it opens
- If the bar is open and matches the type, it closes
- If a different bar is open, it closes that bar and opens the requested one

### Updating a Secondary Bar

Update the data of an already-open secondary bar without closing/reopening:

```javascript
// Update the cartographer bar data
const success = blacksmith.updateSecondaryBar({
    activeTool: 'eraser',
    color: '#ff0000'
});
```

**Parameters:**
- `data` (Object, required): New data to merge with existing data

**Returns:** `boolean` - Success status

**Note:** This only works if a secondary bar is currently open.

### Secondary Bar Groups

Secondary bars support **groups** - logical collections of buttons that are visually separated by dividers. Groups support two behavior modes:

#### Group Modes

**`'default'` mode** (default):
- Buttons are independent
- Each button can be toggleable (use `toggleable: true` in item registration)
- Buttons can perform actions independently
- Use case: Tool buttons, action buttons, filters

**`'switch'` mode**:
- Radio-button behavior: only one button active at a time
- One button must always be active (first item becomes active by default)
- Clicking a button automatically deactivates others in the group
- Use case: Line size selection, color pickers, mode selection

#### Group Configuration

Groups are configured when registering the bar type:

```javascript
await blacksmith.registerSecondaryBarType('cartographer', {
    groups: {
        'tools': {
            mode: 'default',    // Independent buttons
            order: 0            // Display order (lower = first)
        },
        'line-size': {
            mode: 'switch',     // Radio-button behavior
            order: 10
        }
    },
    groupBannerEnabled: true,   // Enable group banners (optional)
    groupBannerColor: 'rgba(62, 62, 163, 0.9)'  // Banner background color (optional)
});
```

#### Assigning Items to Groups

When registering items, specify the `group` parameter:

```javascript
// Item in 'tools' group (default mode)
blacksmith.registerSecondaryBarItem('cartographer', 'pencil', {
    group: 'tools',
    toggleable: true,    // Can toggle on/off
    // ...
});

// Item in 'line-size' group (switch mode)
blacksmith.registerSecondaryBarItem('cartographer', 'small', {
    group: 'line-size',
    // toggleable not needed - switch mode handles it automatically
    // ...
});
```

#### Visual Layout

Groups are rendered with dividers between them:
```
[Group 1 Items] | [Group 2 Items] | [Group 3 Items]
```

Items within the same group appear together without dividers.

#### Multiple Module Support

Multiple modules can contribute groups to the same bar type. Groups are merged when the bar type is registered:

```javascript
// Module A registers the bar type with groups
await blacksmith.registerSecondaryBarType('cartographer', {
    groups: {
        'tools': { mode: 'default', order: 0 }
    }
});

// Module B can add more groups (merged, not replaced)
await blacksmith.registerSecondaryBarType('cartographer', {
    groups: {
        'colors': { mode: 'switch', order: 20 }  // Added to existing groups
    }
});
```

### Registering Secondary Bar Items (Default Tool System)

For simple toolbars, use the default tool registration system. This avoids needing to create custom templates. Items are also accepted by a custom-template bar registered with `hybridItems: true`; a custom-template bar without that flag rejects them.

```javascript
// Register items for a secondary bar (default tool system)
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',
    label: 'Pencil',
    tooltip: 'Draw with pencil tool',
    group: 'tools',                  // Optional: Group ID (default: 'default')
    toggleable: false,               // Optional: Whether item can be toggled (default: false)
    active: false,                   // Optional: whether item is active/selected
    order: 10,                       // Optional: sort order within group
    onClick: (event) => {
        // Handle click
        console.log('Pencil tool clicked');
    }
});

blacksmith.registerSecondaryBarItem('cartographer', 'small-line', {
    icon: 'fa-solid fa-minus',
    label: 'Small',
    group: 'line-size',              // Part of the 'line-size' switch group
    order: 10,
    onClick: (event) => {
        // In switch groups, clicking automatically activates this item and deactivates others
        console.log('Small line size selected');
    }
});

blacksmith.registerSecondaryBarItem('cartographer', 'medium-line', {
    icon: 'fa-solid fa-equals',
    label: 'Medium',
    group: 'line-size',
    order: 20,
    onClick: (event) => {
        console.log('Medium line size selected');
    }
});
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID to register the item to
- `itemId` (string, required): Unique identifier for the item
- `itemData` (Object, required): Item configuration
  - `kind` (string, optional): `'button'` (default), `'info'`, `'statchip'`, `'portraitstat'`, `'gaugechip'`, `'nameplate'`, `'progressbar'`, or `'balancebar'`. Buttons are clickable; every other kind is display-only and is updated with `updateSecondaryBarItemInfo`. A display-only item must carry at least one of `label`, `value`, `valueParts`, or `image`, or the registration is refused.
  - `zone` (string, optional): `'left'`, `'middle'`, or `'right'`. Default: `'middle'`. Only applies to the default tool system.
  - `icon` (string, required for buttons, optional for info): FontAwesome icon class (e.g., `'fa-solid fa-pencil'`, `'fas fa-eraser'`). Info items can use icon for consistent styling with buttons.
  - `label` (string, optional): Text label. For buttons, shown next to the icon. For info items, use with or without `value`.
  - `value` (string, optional): For info items only. Display value (e.g. "2", "Medium"). Can be updated later with `updateSecondaryBarItemInfo`.
  - `tooltip` (string, optional): Tooltip text on hover. If omitted, uses `label` as tooltip.
  - `group` (string, optional): Group ID to place the item in. If not specified, uses `'default'` group. Groups with different IDs will have dividers between them.
  - `toggleable` (boolean, optional): Whether item can be toggled on/off (buttons only; only applies to `'default'` mode groups). In `'switch'` mode groups, items are automatically managed.
  - `active` (boolean, optional): Whether button is active/selected. Adds `active` CSS class when `true`. For `'switch'` mode groups, the first button is automatically made active if none is active.
  - `order` (number, optional): Sort order for displaying items within the group (lower numbers appear first). Items without `order` appear after items with `order`, sorted alphabetically by `itemId`.
  - `iconColor` (string, optional): Icon color. Can be any valid CSS color (e.g., `'#ff0000'`, `'rgba(255, 0, 0, 0.8)'`, `'red'`). If omitted, uses default icon color. Applies to both buttons and info items.
  - `buttonColor` (string, optional): Background color for the item. Can be any valid CSS color. If omitted, uses the default from `--blacksmith-menubar-secondary-buttoncolor`. Applies to both buttons and info items.
  - `borderColor` (string, optional): Border color. Applies to both buttons and info items.
  - `onClick` (Function, required for buttons): Click handler function `(event) => {}`. Receives the click event as parameter. Omit for info items.
  - Additional properties: Any other properties are preserved and passed through, but not used by the default template.

**Info item example (display-only, e.g. encounter-style CR/difficulty):**
```javascript
blacksmith.registerSecondaryBarItem('my-encounter', 'party-cr', {
    kind: 'info',
    zone: 'left',
    icon: 'fas fa-helmet-battle',
    label: 'Party CR',
    value: '2',
    group: 'cr',
    order: 0
});
blacksmith.updateSecondaryBarItemInfo('my-encounter', 'party-cr', { value: '3' });  // update when assessment changes
```

An info item accepts `value`, `label`, `tooltip`, `borderColor`, `buttonColor`, and `iconColor` through
`updateSecondaryBarItemInfo`. `tooltip` is worth knowing about: a chip that shows a short figure usually
wants the explanation behind it to change with the figure, so the tooltip can carry the detail the chip has
no room for.

```javascript
blacksmith.updateSecondaryBarItemInfo('my-bar', 'biggest-hit', {
    label: 'Kar-ahn',
    value: '26',
    tooltip: 'Biggest hit this combat: Kar-ahn hit the Ogre for 26'
});
```

**Statchip item** (`kind: 'statchip'`): A value that carries a tone. Same content as `info` - `icon`, `label`, `value` - plus `tone`: `'neutral'` (default), `'good'`, `'bad'`, or `'record'`. The tone colours the value and its icon, and `record` adds a hairline under the value. It never applies a fill or a border box, because a readout that looks like a button offers an affordance it does not have. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { value, label, tone, tooltip })`.

Tone describes what a rise in the number means for the reader, not whether the number is large: damage dealt is `good` and damage taken is `bad` even though both go up as a fight goes on.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'damage-taken', {
    kind: 'statchip',
    zone: 'middle',
    icon: 'fa-solid fa-shield-halved',
    value: '0',
    tone: 'bad',
    tooltip: 'Party damage taken this combat',
    group: 'stats',
    order: 1
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'damage-taken', { value: '38' });
```

`shape` sets how the chip is drawn. Set it at registration; it is not read from an update.

| Shape | Renders |
|---|---|
| `'pill'` (default) | A name then a number - the label-then-value chip described above |
| `'badge'` | The value alone in a small square-cornered box; neither `label` nor `icon` is shown |
| `'split'` | Two values, each in its own field. The leading one goes in the `label` slot but is typeset as a value - full size, no small-caps - so the two read as equals and the darker field does the separating |

A badge states its own meaning nowhere on the bar, so its `tooltip` is the only place a reader can find out what the number is. Push the tooltip with the value rather than fixing it at registration, or the tooltip will name the readout while the badge shows a figure it does not mention.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'round-turn', {
    kind: 'statchip',
    shape: 'split',
    emphasis: 'feature',
    zone: 'left',
    label: '0',
    valueParts: ['0', { text: ' of ', muted: true }, '0'],
    tooltip: 'Round and turn',
    group: 'encounter',
    order: 0
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'round-turn', {
    label: '4',
    valueParts: ['2', { text: ' of ', muted: true }, '6'],
    tooltip: 'Round 4 - turn 2 of 6'
});
```

**Composite values (`valueParts`)**: any chip kind takes `valueParts` in place of `value` when its reading is made of more than one number. Two forms:

| Part | Means |
|---|---|
| `'4'` (plain string) | A value |
| `{ text: ' of ', muted: true }` | Scaffolding - a separator or a joining word, drawn quieter and lighter so it organises the numbers instead of competing with them |

A unit belongs to its number and is not scaffolding: `'2C'` is one reading, and muting the C makes it look like an annotation on a bare 2. A chip may carry a `label` and `valueParts` together - `split` relies on it - and both patch in place.

Push `valueParts` through `updateSecondaryBarItemInfo` the same way. **The number of parts is structure**, so keep it constant across updates - changing the count forces a full bar rebuild rather than an in-place patch.

```javascript
valueParts: ['6', { text: ' C ', muted: true }, '3', { text: ' F', muted: true }]
```

**Portraitstat item** (`kind: 'portraitstat'`): A standing that belongs to a person. Renders `image` as a round, ringed portrait with `value` beside it; `rank` (1, 2, 3, or 0 for unranked) colours the ring gold, silver, or bronze. Falls back to `icon` - or a generic figure - when there is nobody to show, at the same size, so a standing changing hands never shifts the chips either side of it. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { image, value, rank, tooltip })`.

Use it where the answer to the readout is *who*. A face is recognised instantly where a truncated first name is not, so the name belongs in the tooltip rather than the chip.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'top-mvp', {
    kind: 'portraitstat',
    zone: 'middle',
    rank: 1,
    icon: 'fa-solid fa-trophy',
    value: '',
    tooltip: 'Top MVP on record',
    group: 'stats',
    order: 2
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'top-mvp', {
    image: 'icons/portraits/kar-ahn.webp',
    tooltip: 'Top MVP on record: Kar-ahn'
});
```

**Gaugechip item** (`kind: 'gaugechip'`): A percentage as a horizontal meter plus its number. `percentProgress` (0-100) drives the fill; `value` is the text beside it, `gaugeColor` optionally overrides the fill colour. The meter is read before the digits are; the number stays because a meter this size cannot be read precisely. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, value, label, tooltip })`.

Push both `value` and `percentProgress` - the text is formatted for a reader and the fill needs a number, and deriving one from the other would re-parse a string that was built for display.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'hit-rate', {
    kind: 'gaugechip',
    zone: 'middle',
    value: '0%',
    percentProgress: 0,
    tooltip: 'Party hit rate this combat',
    group: 'stats',
    order: 3
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'hit-rate', { value: '62.5%', percentProgress: 62.5 });
```

**Nameplate item** (`kind: 'nameplate'`): A person and what they did, given room to say it. A large round portrait with a rank ring, `label` as the name on the first line and `value` as the standing beneath it. Both lines are always rendered - holding a non-breaking space when empty - so the plate keeps its height and its neighbours never shift as the standing changes hands. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { image, label, value, rank, tooltip })`.

Use it for the one readout meant to be looked at rather than glanced past, and give it a zone of its own: it is markedly wider than a chip, and in a shared zone it competes for width with readouts that get suppressed.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'mvp', {
    kind: 'nameplate',
    zone: 'left',
    rank: 1,
    icon: 'fa-solid fa-trophy',
    label: '',
    value: '',
    tooltip: 'Top MVP on record',
    group: 'mvp',
    order: 0
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'mvp', {
    image: 'icons/portraits/kar-ahn.webp',
    label: 'Kar-ahn',
    value: 'Top MVP · 128'
});
```

**Progressbar item** (`kind: 'progressbar'`): A horizontal progress bar (0–100%). Required: `width`, `borderColor`, `barColor`, `progressColor`, `percentProgress`. Optional: `title`, `icon`, `leftLabel`, `leftIcon`, `rightLabel`, `rightIcon`, `height`. Height defaults to 40% of secondary bar height if omitted. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, ... })`.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'hp-bar', {
    kind: 'progressbar',
    zone: 'middle',
    width: 200,
    height: 14,
    borderColor: 'rgba(0,0,0,0.5)',
    barColor: '#2d5016',
    progressColor: '#4a7c23',
    percentProgress: 100,
    leftLabel: '130',
    rightLabel: '130',
    group: 'stats',
    order: 0
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'hp-bar', { percentProgress: 65, leftLabel: '85', rightLabel: '130' });
```

**Balancebar item** (`kind: 'balancebar'`): A horizontal bar with origin at 0 in the middle; range -100 to +100. A **marker** (circle) is positioned at the current value: left of center for negative, right for positive. Required: `width`, `borderColor`, `barColorLeft`, `barColorRight`, `markerColor`. Optional: `percentProgress` (default 0), `title`, `icon`, `leftLabel`, `rightLabel` (inside the bar), `leftIcon` (outside the bar on the left), `rightIcon` (outside the bar on the right), `height`. Optional callbacks: `onClick(event)` for left-click; `contextMenuItems` (array or `(itemId, item) => array` of `{ name, icon, onClick }`) for right-click context menu. Update with `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, leftIcon, rightIcon, title, icon, barColorLeft, barColorRight, markerColor, borderColor })`.

```javascript
blacksmith.registerSecondaryBarItem('my-bar', 'approval', {
    kind: 'balancebar',
    zone: 'middle',
    width: 240,
    height: 14,
    borderColor: 'rgba(0,0,0,0.5)',
    barColorLeft: '#4a1c1c',
    barColorRight: '#1c4a1c',
    markerColor: '#7c2323',
    percentProgress: -25,
    leftLabel: 'Disapprove',
    rightLabel: 'Approve',
    group: 'stats',
    order: 0,
    contextMenuItems: [
        { name: 'Set to 0', icon: 'fas fa-minus', onClick: async () => { await blacksmith.setPartyReputation(0); } },
        { name: 'Set to 50', icon: 'fas fa-equals', onClick: async () => { await blacksmith.setPartyReputation(50); } }
    ]
});
blacksmith.updateSecondaryBarItemInfo('my-bar', 'approval', { percentProgress: 50, leftLabel: 'Disapprove', rightLabel: 'Approve' });
```

**Returns:** `boolean` - Success status

**Group Behavior:**
- Items are organized into groups specified by the `group` parameter
- Groups are separated by visual dividers
- Group behavior is controlled by the group's `mode` (set in `registerSecondaryBarType`):
  - **`'default'` mode**: Independent buttons. Each button can be toggleable or perform actions independently.
  - **`'switch'` mode**: Radio-button behavior. Only one button in the group can be active at a time, and one must always be active.

**Example:**
```javascript
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',          // Required: FontAwesome icon
    label: 'Pencil',                      // Optional: Text label
    tooltip: 'Draw with pencil tool',     // Optional: Custom tooltip
    active: false,                        // Optional: Active state
    order: 10,                           // Optional: Display order
    iconColor: '#3498db',                // Optional: Icon color
    buttonColor: 'rgba(100, 150, 200, 0.3)',  // Optional: Custom button background color
    borderColor: 'rgba(100, 150, 200, 0.5)',  // Optional: Custom border color
    onClick: (event) => {                // Required: Click handler
        console.log('Pencil tool clicked');
        // Update active state
        blacksmith.updateSecondaryBar({
            activeTool: 'pencil'
        });
    }
});
```

**Timing-Safe:** You can register items before the bar type is registered. Items will be queued and applied when the bar type is registered.

### Updating Secondary Bar Item Active State

```javascript
// Update an item's active state programmatically
blacksmith.updateSecondaryBarItemActive('cartographer', 'pencil-tool', true);
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID
- `itemId` (string, required): The item ID to update
- `active` (boolean, required): The active state to set

**Returns:** `boolean` - Success status

**Note:** 
- For `'switch'` mode groups, setting an item active will automatically deactivate other items in the same group.
- You cannot deactivate all items in a `'switch'` mode group (one must always be active).

**Example:**
```javascript
// Activate a tool in a switch group
blacksmith.updateSecondaryBarItemActive('cartographer', 'medium-line', true);
// This automatically deactivates 'small-line' and 'large-line' in the same group
```

### Updating Secondary Bar Info Items

Use this to update any display-only item without re-registering it: the value and label of an **info**, **statchip**, **portraitstat**, **gaugechip**, or **nameplate** item, the progress and labels of a **progressbar**, or the balance and labels of a **balancebar**. Typical for encounter-style bars (Party CR, Monster CR, Difficulty), HP/resource bars, or approval/balance bars.

```javascript
blacksmith.updateSecondaryBarItemInfo('my-encounter', 'party-cr', { value: '4' });
blacksmith.updateSecondaryBarItemInfo('my-encounter', 'difficulty', { value: 'Deadly', label: '', iconColor: '#a02020', borderColor: null });
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID
- `itemId` (string, required): The info item ID to update
- `updates` (Object, required): At least one of:
  - **Info items**: `value`, `label`, `borderColor`, `buttonColor`, `iconColor`
  - **Progressbar items**: `percentProgress` (number 0–100), `leftLabel`, `rightLabel`, `leftIcon`, `rightIcon`, `title`, `icon`, `barColor`, `progressColor`, `borderColor`
  - **Balancebar items**: `percentProgress` (number -100 to +100), `leftLabel`, `rightLabel`, `leftIcon`, `rightIcon`, `title`, `icon`, `barColorLeft`, `barColorRight`, `markerColor`, `borderColor`

**Returns:** `boolean` - Success status

If the bar is currently open, it re-renders so the new value/label is visible immediately.

### Reputation API (party bar)

Party reputation is stored in the **world setting** `blacksmithPartyData`, keyed by scene id. Each scene's data lives under `blacksmithPartyData.scenes[sceneId]` and includes `reputation` (and optionally `uuid`, `title` for display); reputation is a subset of this structure so other party data can be added later. Party reputation is shown in the party bar's **Reputation** balancebar (left zone). Right-click the bar to set the current scene's value, send a current-reputation card, or change reputation by ±1 or ±5 (each change posts a **New Reputation** card). Scale labels and descriptions come from `resources/reputation.json`. The following are exposed on `game.modules.get('coffee-pub-blacksmith').api`:

**getPartyReputation(scene?)**
- Returns the party reputation for a scene (-100 to +100). Omit `scene` to use the current canvas scene. Value is read from `game.settings.get(MODULE.ID, 'blacksmithPartyData').scenes[sceneId].reputation`.
- **Returns:** `number` (0 if no scene or no value stored).
- Reputation is per scene, and the default is the *reading client's* canvas scene. A window opened against a token must pass that token's scene explicitly — otherwise a GM viewing another map reads a different value than the players standing in the scene the window is about.

**setPartyReputation(value, scene?)**
- Sets the party reputation for a scene. GM only. Value is clamped to -100..+100. Updates `blacksmithPartyData.scenes[sceneId]` (reputation, and optionally uuid/title for the scene).
- **Returns:** `Promise<boolean>` — `true` if set, `false` if not GM or no scene.

**getReputationScaleEntry(value)**
- Returns the scale entry from `reputation.json` for a given value (label, description, effects). Useful for custom UI or macros.
- **Returns:** `Promise<{ key, label, min, max, description, effects? } | null>`.
- Asynchronous because the first call fetches the JSON; the parsed file is cached for the session after that. Resolve the band once per render rather than once per row when pricing or labelling a list.

**postCurrentReputationCard(api?)**
- Posts a **Current Reputation** chat card: scene name, current value, and scale label/description from the JSON. Uses the chat card theme API (default theme).
- **Returns:** `Promise<void>`.

**postNewReputationCard(change, previousValue, newValue, api?)**
- Posts a **New Reputation** chat card: scene name, change (e.g. +5, -1), previous → new value, and scale label/description. Call after updating reputation (e.g. from the context menu).
- **Returns:** `Promise<void>`.

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const current = api.getPartyReputation();
await api.setPartyReputation(50);
api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: 50 });
await api.postCurrentReputationCard();
const scale = await api.getReputationScaleEntry(50);
```

### Registering Secondary Bar Toggle Tool

If you create a main toolbar button to toggle your secondary bar, register it so the button's active state automatically syncs when the bar opens/closes:

```javascript
// 1. Register your secondary bar type
await blacksmith.registerSecondaryBarType('cartographer', {
    size: 'default',
    persistence: 'manual'
});

// 2. Register your toggle button
blacksmith.registerMenubarTool('cartographer-toggle', {
    icon: 'fa-solid fa-map',
    name: 'cartographer-toggle',
    title: 'Toggle Cartographer Tools',
    tooltip: 'Toggle Cartographer Tools',
    zone: 'left',
    group: 'general',
    groupOrder: 999,
    order: 20,
    moduleId: 'coffee-pub-cartographer',
    gmOnly: false,
    leaderOnly: false,
    visible: true,
    toggleable: true,  // Important: Make it toggleable for active state syncing
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null,
    onClick: () => {
        blacksmith.toggleSecondaryBar('cartographer');
    }
});

// 3. Register the mapping so button state syncs automatically
blacksmith.registerSecondaryBarTool('cartographer', 'cartographer-toggle');
```

**Parameters:**
- `barTypeId` (string, required): The secondary bar type ID
- `toolId` (string, required): The menubar tool ID that toggles this bar

**Returns:** No return value.

**Note:** 
- The tool must be registered with `toggleable: true` for the active state to work
- When a different secondary bar opens, your button will automatically deactivate
- When your secondary bar opens, your button will automatically activate
- When your secondary bar closes, your button will automatically deactivate

**Why use this?** Without registration, you'd need to manually sync button states in your `onClick` handler. With registration, Blacksmith handles it automatically when bars open/close/switching.

### Unregistering Secondary Bar Items

```javascript
// Remove an item from a secondary bar
blacksmith.unregisterSecondaryBarItem('cartographer', 'pencil-tool');
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID
- `itemId` (string, required): The item ID to remove

**Returns:** `boolean` - Success status

**Note:** If the removed item was active in a `'switch'` mode group, the first remaining item in that group will automatically become active.

### Getting Secondary Bar Items

```javascript
// Get all registered items for a bar type
const items = blacksmith.getSecondaryBarItems('cartographer');
// Returns: Array of item data objects
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID

**Returns:** `Array<Object>` - Array of registered item data objects

### Styling Secondary Bar Items

The default secondary bar items use CSS classes that you can override in your module's stylesheet:

**CSS Classes:**
- `.blacksmith-menubar-secondary .secondary-bar-item` - Base item button
- `.blacksmith-menubar-secondary .secondary-bar-item.active` - Active/selected item
- `.blacksmith-menubar-secondary .secondary-bar-item:hover` - Hover state
- `.blacksmith-menubar-secondary .secondary-bar-item:active` - Clicked/pressed state
- `.blacksmith-menubar-secondary .secondary-bar-item i` - Icon element
- `.blacksmith-menubar-secondary .secondary-bar-item-label` - Label text
- `.blacksmith-menubar-secondary .secondary-bar-toolbar` - Container for all items

**CSS Variables Available:**
- `--blacksmith-menubar-fontcolor` - Primary bar text color
- `--blacksmith-menubar-fontsize` - Primary bar font size
- `--blacksmith-menubar-iconsize` - Primary bar icon size
- `--blacksmith-menubar-secondary-height` - Secondary bar height, and the factor every size inside the bar scales from
- `--blacksmith-menubar-secondary-default-height` - The house default height a bar gets when it asks for no size
- `--blacksmith-menubar-secondary-banner-allowance` - Extra height a bar with group banners occupies, added on top of its height
- `--blacksmith-menubar-total-height` - Primary bar plus secondary bar plus the shadow offset and banner allowance; what the interface below the menubar is offset by
- `--blacksmith-menubar-secondary-fontcolor` - Secondary bar text color
- `--blacksmith-menubar-secondary-fontsize` - Secondary bar font size
- `--blacksmith-menubar-secondary-iconsize` - Secondary bar icon size
- `--blacksmith-menubar-secondary-buttoncolor` - Default button background color (used when `buttonColor` not specified)
- `--blacksmith-menubar-secondary-bordercolor` - Default border color (used when `borderColor` not specified)

**Custom Styling Example:**

You can customize styling in two ways:

1. **Per-item colors** (recommended for individual button styling):
```javascript
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',
    label: 'Pencil',
    buttonColor: 'rgba(100, 150, 200, 0.3)',  // Custom background
    borderColor: 'rgba(100, 150, 200, 0.5)',  // Custom border
    onClick: () => {}
});
```

2. **CSS overrides** (for global styling of all items in a bar type):
```css
/* In your module's CSS file */
.blacksmith-menubar-secondary[data-bar-type="cartographer"] .secondary-bar-item {
    background-color: rgba(100, 150, 200, 0.3);
    border-radius: 5px;
}

.blacksmith-menubar-secondary[data-bar-type="cartographer"] .secondary-bar-item.active {
    background-color: rgba(100, 150, 200, 0.6);
    box-shadow: 0 0 8px rgba(100, 150, 200, 0.4);
}
```

**Note:** 
- Per-item colors (via `buttonColor` and `borderColor` parameters) are applied as inline styles and take precedence over CSS rules
- CSS hover/active states will still apply on top of the inline styles
- Styles are defined in `styles/menubar.css` in the Blacksmith module. You can override them using more specific selectors in your module's CSS.

### Creating a Custom Secondary Bar Template

For complex UIs (like the combat bar with portraits and health rings), you can provide a custom Handlebars template:

1. **Create your template file:**
```
templates/partials/menubar-{your-type-id}.hbs
```

2. **Register the bar type with `templatePath`:**
```javascript
await blacksmith.registerSecondaryBarType('my-complex-bar', {
    size: 'xlarge',
    persistence: 'manual',
    templatePath: 'modules/my-module/templates/partials/menubar-my-complex-bar.hbs'
});
```

3. **Template Example:**
```handlebars
{{!-- templates/partials/menubar-my-complex-bar.hbs --}}
<div class="my-complex-toolbar">
    <div class="toolbar-header">
        <h3>{{title}}</h3>
    </div>
    <div class="toolbar-content">
        {{#each items}}
        <div class="complex-item">
            {{name}}: {{value}}
        </div>
        {{/each}}
    </div>
</div>
```

**Important:** 
- Custom templates receive `secondaryBar.data` as their context
- Templates are automatically registered as Handlebars partials: `menubar-{typeId}`
- You do NOT need to modify Blacksmith's main template - it handles custom templates automatically

### Complete Examples

#### Example 1: Simple Toolbar with Groups (Default Tool System)

```javascript
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    if (!blacksmith) {
        console.error('Blacksmith API not available');
        return;
    }
    
    // 1. Register the bar type with group configuration
    await blacksmith.registerSecondaryBarType('cartographer', {
        height: 60,
        persistence: 'manual',
        autoCloseDelay: 10000,
        groups: {
            'tools': {
                mode: 'default',      // Independent buttons
                order: 0
            },
            'line-size': {
                mode: 'switch',       // Only one active at a time
                order: 10
            },
            'colors': {
                mode: 'switch',       // Only one active at a time
                order: 20
            }
        }
    });
    
    // 2. Register tools in the 'tools' group (default mode - independent)
    blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
        icon: 'fa-solid fa-pencil',
        label: 'Pencil',
        group: 'tools',
        toggleable: true,             // Can be toggled on/off
        order: 10,
        onClick: () => {
            console.log('Pencil tool toggled');
        }
    });
    
    blacksmith.registerSecondaryBarItem('cartographer', 'eraser-tool', {
        icon: 'fa-solid fa-eraser',
        label: 'Eraser',
        group: 'tools',
        toggleable: true,
        order: 20,
        onClick: () => {
            console.log('Eraser tool toggled');
        }
    });
    
    // 3. Register line size options (switch group - only one active)
    blacksmith.registerSecondaryBarItem('cartographer', 'small-line', {
        icon: 'fa-solid fa-minus',
        label: 'Small',
        group: 'line-size',
        order: 10,
        onClick: () => {
            console.log('Small line size selected');
        }
    });
    
    blacksmith.registerSecondaryBarItem('cartographer', 'medium-line', {
        icon: 'fa-solid fa-equals',
        label: 'Medium',
        group: 'line-size',
        order: 20,
        onClick: () => {
            console.log('Medium line size selected');
        }
    });
    
    blacksmith.registerSecondaryBarItem('cartographer', 'large-line', {
        icon: 'fa-solid fa-grip-lines',
        label: 'Large',
        group: 'line-size',
        order: 30,
        onClick: () => {
            console.log('Large line size selected');
        }
    });
    
    // 4. Register color options (switch group)
    blacksmith.registerSecondaryBarItem('cartographer', 'color-red', {
        icon: 'fa-solid fa-circle',
        label: 'Red',
        group: 'colors',
        iconColor: '#ff0000',              // Red icon color
        buttonColor: 'rgba(255, 0, 0, 0.5)',
        order: 10,
        onClick: () => {
            console.log('Red color selected');
        }
    });
    
    blacksmith.registerSecondaryBarItem('cartographer', 'color-blue', {
        icon: 'fa-solid fa-circle',
        label: 'Blue',
        group: 'colors',
        iconColor: '#0000ff',              // Blue icon color
        buttonColor: 'rgba(0, 0, 255, 0.5)',
        order: 20,
        onClick: () => {
            console.log('Blue color selected');
        }
    });
    
    // 5. Register a menubar tool to toggle the secondary bar
    blacksmith.registerMenubarTool('cartographer-toggle', {
        icon: 'fa-solid fa-map',
        name: 'cartographer-toggle',
        title: 'Toggle Cartographer Tools',
        zone: 'left',
        order: 20,
        moduleId: 'coffee-pub-cartographer',
        toggleable: true,  // Enable toggleable to show active state
        onClick: () => {
            blacksmith.toggleSecondaryBar('cartographer');
        }
    });
    
    // 6. Register the tool-to-bar mapping for automatic button state syncing
    blacksmith.registerSecondaryBarTool('cartographer', 'cartographer-toggle');
});
```

This creates a toolbar with:
- **Tools group** (left): Pencil and Eraser (independent toggleable buttons)
- **Divider**
- **Line Size group** (middle): Small, Medium, Large (switch mode - only one active)
- **Divider**
- **Colors group** (right): Red, Blue (switch mode - only one active)

#### Example 2: Complex Toolbar (Custom Template)

```javascript
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    // Register with custom template
    await blacksmith.registerSecondaryBarType('my-complex-bar', {
        height: 80,
        persistence: 'manual',
        templatePath: 'modules/my-module/templates/partials/menubar-my-complex-bar.hbs'
    });
    
    // Open the bar with data for the template
    blacksmith.openSecondaryBar('my-complex-bar', {
        data: {
            title: 'Complex Toolbar',
            items: [
                { name: 'Item 1', value: 100 },
                { name: 'Item 2', value: 200 }
            ]
        }
    });
});
```

#### Example 3: Timing-Safe Registration (Items Before Bar Type)

```javascript
// Items can be registered before the bar type - they'll be queued and applied later
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    // Register items first (they'll be queued)
    blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
        icon: 'fa-solid fa-pencil',
        label: 'Pencil',
        onClick: () => console.log('Pencil')
    });
    
    // Register bar type later - items will be automatically applied
    await blacksmith.registerSecondaryBarType('cartographer', {
        height: 60,
        persistence: 'manual'
    });
    // Items are now active!
});
```

### Default Tool System vs. Custom Templates

| Feature | Default Tool System | Custom Template |
|---------|---------------------|-----------------|
| **Recommended** | **Use this by default** | Only when absolutely necessary |
| **Complexity** | Simple toolbars with buttons | Complex UIs (portraits, health rings, etc.) |
| **Setup** | Register items, no template needed | Create Handlebars template partial |
| **Flexibility** | Standardized button layout | Full control over HTML/CSS |
| **Use Case** | Drawing tools, simple controls | Combat bar, complex dashboards |
| **Template Path** | Not needed (omit `templatePath`) | Required (`templatePath` in config) |
| **Example** | Cartographer drawing tools | Combat tracker with portraits |
| **Maintenance** | Low - API handles everything | Higher - maintain template, ensure compatibility |

### Secondary Bar vs. Regular Tools

| Feature | Regular Tools | Secondary Bar |
|---------|--------------|---------------|
| **Location** | In main menubar (left/middle/right zones) | Below main menubar |
| **Space** | Limited (icon + label) | Full-width toolbar |
| **Multiple** | Many tools can be visible | Only one bar can be open |
| **Use Case** | Quick actions, status indicators | Complex toolbars, specialized interfaces |
| **Template** | Not needed | Optional (default tool system) or custom template |

### Best Practices

1. **Default to default tool system**: Always use the default tool system unless you absolutely need a custom template
2. **Register early**: Register your secondary bar type in a `ready` hook (async if using custom templates)
3. **Choose the right approach**: 
   - **Default tool system**: Use for all simple toolbars (drawing tools, filters, toggles, etc.)
   - **Custom templates**: Only use for complex UIs that cannot be achieved with buttons (portraits, health rings, complex nested layouts)
4. **Unique type IDs**: Use descriptive, unique type IDs (e.g., `'cartographer'`, not `'tools'`)
5. **Timing-safe registration**: Items can be registered before bar types - they'll be queued automatically
6. **Template organization**: If using custom templates, keep them simple and focused
7. **Data structure**: For custom templates, pass structured data for flexibility
8. **Cleanup**: Consider closing your bar and unregistering items when your module is disabled

### Troubleshooting

**Bar doesn't open:**
- Verify the bar type is registered: Check console for registration success
- Check if another bar is open (it should close automatically)
- Verify the template partial exists and is named correctly

**Template not rendering:**
- For custom templates: Ensure the template path is correct and the file exists
- Verify `templatePath` is provided in `registerSecondaryBarType` config
- For default tool system: Ensure items are registered with `registerSecondaryBarItem`
- Check that the bar type is registered before opening

**Bar closes unexpectedly:**
- Check the `persistence` setting (auto bars close after delay)
- Verify no other code is calling `closeSecondaryBar()`
