# Blacksmith Menubar API Documentation

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

```javascript
// Register a custom tool
const success = blacksmith.registerMenubarTool('my-custom-tool', {
    icon: "fa-solid fa-dice-d20",
    name: "my-custom-tool",
    title: "My Custom Tool",
    zone: "left",              // Optional: left, middle, right (default: left)
    order: 5,                  // Optional: order within zone (lower numbers appear first)
    moduleId: "my-module",     // Optional: your module ID
    gmOnly: false,             // Optional: whether tool is GM-only
    leaderOnly: false,         // Optional: whether tool is leader-only
    visible: true,             // Optional: whether tool is visible (can be function)
    onClick: () => {
        // Your tool logic here
        console.log("My custom tool clicked!");
    }
});

if (success) {
    console.log("Tool registered successfully!");
} else {
    console.log("Failed to register tool");
}
```

## API Reference

### Notification System

Notifications appear in a dedicated notification area within the middle zone of the menubar. They are separate from the zone-based tool system and do not require zone specification.

**Visual Layout:**
```
[LEFT ZONE TOOLS] [MIDDLE ZONE TOOLS] [NOTIFICATION AREA] [RIGHT ZONE TOOLS]
```

#### `addNotification(text, icon, duration, moduleId)`
Add a notification to the menubar.

**Parameters:**
- `text` (string): The notification text to display
- `icon` (string, optional): FontAwesome icon class (default: "fas fa-info-circle")
- `duration` (number, optional): Duration in seconds, 0 = until manually removed (default: 5)
- `moduleId` (string, optional): The module ID adding the notification (default: "blacksmith-core")

**Returns:** `string` - The notification ID for later removal

**Note:** Notifications do not use zones. They appear in a dedicated notification area within the middle zone of the menubar, separate from the zone-based tool system.

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
```

#### `updateNotification(notificationId, updates)`
Update an existing notification.

**Parameters:**
- `notificationId` (string): The notification ID to update
- `updates` (Object): Object containing fields to update
  - `text` (string, optional): New notification text
  - `icon` (string, optional): New FontAwesome icon class
  - `duration` (number, optional): New duration in seconds (0 = persistent)

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
- `title` (string, required): Tooltip text displayed on hover
- `onClick` (Function, required): Function to execute when tool is clicked
- `zone` (string, optional): Zone placement - "left", "middle", "right" (default: "left")
- `order` (number, optional): Order within zone (default: 999)
- `moduleId` (string, optional): Module identifier (default: "unknown")
- `gmOnly` (boolean, optional): Whether tool is GM-only (default: false)
- `leaderOnly` (boolean, optional): Whether tool is leader-only (default: false)
- `visible` (boolean|Function, optional): Whether tool is visible (default: true)

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

Gets all tools organized by their zones.

**Returns:** `Object` - Object with zone arrays containing visible tools
```javascript
{
    left: [/* array of left zone tools */],
    middle: [/* array of middle zone tools */],
    right: [/* array of right zone tools */]
}
```

## Menubar Zones

The menubar system organizes tools into three predefined zones:

### Zone Layout:
- **`left`** - Action tools (movement, interface, voting, skill checks)
- **`middle`** - General tools and utilities
- **`right`** - Informational tools (leader display, timer)

### Zone Guidelines:
- **`left`**: Primary action tools that users interact with frequently
- **`middle`**: Secondary tools and utilities
- **`right`**: Read-only information displays and status indicators

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
    zone: "left",
    order: 20,
    moduleId: "my-module",
    visible: () => {
        // Only show if certain conditions are met
        return game.user.isGM || game.settings.get('my-module', 'enableFeature');
    },
    onClick: () => {
        // Tool logic
    }
});
```

## Ordering Guidelines

Tools within each zone are ordered by their `order` property:

- **Lower numbers appear first** within each zone
- **Recommended ranges**:
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

// Register cleanup when module is disabled
Hooks.once('disableModule', (moduleId) => {
    if (moduleId === 'my-module') {
        myModuleInstance.cleanup();
    }
});
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

```javascript
// Register a simple utility tool (left zone)
blacksmith.registerMenubarTool('my-utility', {
    icon: "fa-solid fa-calculator",
    name: "my-utility",
    title: "My Utility Tool",
    zone: "left",
    order: 10,
    moduleId: "my-module",
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
    zone: "middle",
    order: 5,
    moduleId: "my-module",
    gmOnly: true,
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
    zone: "left",
    order: 1,
    moduleId: "my-module",
    leaderOnly: true,
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
    zone: "right",
    order: 10,
    moduleId: "my-module",
    onClick: () => {
        // Display status information
        ui.notifications.info("Status: All systems operational");
    }
});
```

### Module Cleanup

```javascript
// Unregister all tools when module is disabled
Hooks.once('disableModule', (moduleId) => {
    if (moduleId === 'my-module') {
        const tools = blacksmith.getMenubarToolsByModule('my-module');
        tools.forEach(tool => {
            blacksmith.unregisterMenubarTool(tool.toolId);
        });
    }
});
```

## Error Handling

The API includes robust error handling:

- **Invalid tool data**: Returns `false` and logs error
- **Duplicate tool IDs**: Returns `false` (tools must be unique)
- **Missing required properties**: Returns `false` and logs error
- **API not available**: Check for API availability before use

## ⚠️ Critical: Function Dependencies and Scope

### **The Problem: Module Scope Isolation**

When you register a tool with the menubar, the `onClick` function gets executed in the **Blacksmith menubar's context**, not your module's context. This means your function loses access to your module's imports and variables.

### **❌ Common Error Pattern:**

```javascript
// In your-module.js
import { MyManager } from './manager-my.js';

const myFunction = () => {
    MyManager.doSomething(); // ❌ ReferenceError: MyManager is not defined
};

// Register with menubar
blacksmith.registerMenubarTool('my-tool', {
    onClick: myFunction // ❌ Function loses access to MyManager
});
```

**Error:** `ReferenceError: MyManager is not defined`

### **✅ Solution: Self-Contained Functions**

Make your `onClick` functions completely self-contained by importing all dependencies:

```javascript
// In your-module.js
import { MyManager } from './manager-my.js';

// ✅ Self-contained function with all dependencies
const myFunction = () => {
    try {
        if (!MyManager) {
            throw new Error('MyManager not available');
        }
        MyManager.doSomething();
    } catch (error) {
        console.error('My Module | Error in tool:', error);
    }
};

// Register with menubar
blacksmith.registerMenubarTool('my-tool', {
    onClick: myFunction // ✅ Function has access to all its dependencies
});
```

### **Alternative Solutions:**

#### **1. Bound Context Functions**
```javascript
// Bind the function to maintain its original context
blacksmith.registerMenubarTool('my-tool', {
    onClick: myFunction.bind(this) // Maintains original context
});
```

#### **2. Module API Access**
```javascript
// Access your module's API instead of direct imports
const myFunction = () => {
    const myAPI = game.modules.get('my-module')?.api;
    myAPI.MyManager?.doSomething();
};
```

#### **3. Wrapper Function**
```javascript
// Create a wrapper that handles the context
const createMyHandler = () => {
    return () => {
        // This closure maintains access to your module's scope
        MyManager.doSomething();
    };
};

blacksmith.registerMenubarTool('my-tool', {
    onClick: createMyHandler()
});
```

### **🎯 Recommended Approach:**

**Use self-contained functions** (Solution 1) because they:
- Are explicit about dependencies
- Work regardless of execution context
- Are easier to debug
- Are more reusable

### **📋 Checklist for onClick Functions:**

- [ ] All required imports are included in the same file
- [ ] Function is self-contained (no external dependencies)
- [ ] Error handling is included
- [ ] Function works when called from any context
- [ ] All variables and functions are properly scoped

## Best Practices

1. **Self-Contained Functions**: Make onClick functions completely self-contained with all dependencies imported
2. **Unique Tool IDs**: Use descriptive, unique tool identifiers
3. **Proper Zone Selection**: Choose the most appropriate zone for your tool
4. **Consistent Ordering**: Use consistent order values within your module
5. **Module Cleanup**: Unregister tools when your module is disabled
6. **Error Handling**: Always check return values and handle errors gracefully
7. **API Availability**: Check if the API is available before using it
8. **Scope Awareness**: Understand that onClick functions execute in Blacksmith's context, not your module's context

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

### Tool Click Errors (ReferenceError)
- **Error**: `ReferenceError: SomeClass is not defined`
- **Cause**: onClick function loses access to module's imports when executed
- **Solution**: Make onClick function self-contained with all dependencies imported
- **Check**: Ensure all required classes/functions are imported in the same file as the onClick function

### Tool Not Clickable
- Verify `onClick` function is provided and valid
- Check for JavaScript errors in onClick function
- Ensure tool is not disabled by visibility logic

## Support

For issues or questions about the Blacksmith Menubar API:

1. Check this documentation first
2. Review console logs for error messages
3. Test with a simple tool registration
4. Contact the Blacksmith development team

## Secondary Bar API

The menubar supports **secondary bars** - additional toolbars that appear below the main menubar, similar to tabs. Only one secondary bar can be open at a time. When you open a new secondary bar, the existing one automatically closes.

**Important:** **Always use the default tool system** unless your use case absolutely requires a custom template. The default tool system is simpler, faster to implement, timing-safe, and sufficient for most toolbars. Only use custom templates for complex UIs that cannot be achieved with simple button-based tools.

**Common Use Cases:**
- Combat tracker (built-in, uses custom template for complex portraits/health rings)
- Drawing tools (Cartographer, uses default tool system)
- Specialized toolbars for specific activities

### Secondary Bar Behavior

- **Tab-like behavior**: Only one secondary bar can be open at a time
- **Automatic switching**: Opening a new secondary bar closes the currently open one
- **Persistence modes**: `'manual'` (user closes) or `'auto'` (auto-closes after delay)
- **Height customization**: Each bar type can have its own height

### Registering a Secondary Bar Type

Before you can open a secondary bar, you must register its type. The system supports two approaches:

1. **Default Tool System** (recommended - use this unless custom template is absolutely necessary) - Register individual tools/items
2. **Custom Template** (only when default system cannot meet your needs) - Provide a custom Handlebars template

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
const success = blacksmith.registerSecondaryBarType('cartographer', {
    height: 60,                    // Height in pixels
    persistence: 'manual',         // 'manual' or 'auto'
    autoCloseDelay: 10000          // Auto-close delay in ms (if persistence is 'auto')
    // No templatePath = uses default tool system
});

// Option 2: Register a bar type with a custom template (for complex UIs)
const success = blacksmith.registerSecondaryBarType('combat', {
    height: 60,
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
  - `height` (number, optional): Height in pixels (default: 50)
  - `persistence` (string, optional): `'manual'` or `'auto'` (default: `'manual'`)
  - `autoCloseDelay` (number, optional): Auto-close delay in milliseconds (default: 10000)
  - `templatePath` (string, optional): Path to custom Handlebars template partial. If not provided, uses the default tool system.

**Returns:** `Promise<boolean>` - Success status (async method)

**Note:** This method is async because it loads custom templates. Use `await` or `.then()` when using custom templates.

### Opening a Secondary Bar

```javascript
// Open your secondary bar
const success = blacksmith.openSecondaryBar('cartographer', {
    data: {
        // Your custom data to pass to the template
        tools: ['pencil', 'eraser', 'line'],
        activeTool: 'pencil'
    },
    height: 60,                    // Optional: override registered height
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
  - `height` (number, optional): Override the registered height
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

### Registering Secondary Bar Items (Default Tool System)

For simple toolbars, use the default tool registration system. This avoids needing to create custom templates:

```javascript
// Register items for a secondary bar (default tool system)
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',
    label: 'Pencil',
    tooltip: 'Draw with pencil tool',
    active: false,                    // Optional: whether item is active/selected
    order: 10,                        // Optional: sort order
    onClick: (event) => {
        // Handle click
        console.log('Pencil tool clicked');
    }
});

blacksmith.registerSecondaryBarItem('cartographer', 'eraser-tool', {
    icon: 'fa-solid fa-eraser',
    label: 'Eraser',
    tooltip: 'Erase drawings',
    order: 20,
    onClick: (event) => {
        console.log('Eraser tool clicked');
    }
});
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID to register the item to
- `itemId` (string, required): Unique identifier for the item
- `itemData` (Object, required): Item configuration
  - `icon` (string, required): FontAwesome icon class (e.g., `'fa-solid fa-pencil'`, `'fas fa-eraser'`)
  - `label` (string, optional): Text label displayed next to the icon. If omitted, only the icon is shown.
  - `tooltip` (string, optional): Tooltip text on hover. If omitted, uses `label` as tooltip.
  - `active` (boolean, optional): Whether item is active/selected. Adds `active` CSS class when `true` (default: `false`)
  - `order` (number, optional): Sort order for displaying items (lower numbers appear first). Items without `order` appear after items with `order`, sorted alphabetically by `itemId`.
  - `buttonColor` (string, optional): Background color for the button. Can be any valid CSS color (e.g., `'rgba(100, 150, 200, 0.3)'`, `'#64aaff'`, `'blue'`). If omitted, uses the default from `--blacksmith-menubar-secondary-buttoncolor`.
  - `borderColor` (string, optional): Border color for the button. Can be any valid CSS color. If omitted, uses the default from `--blacksmith-menubar-secondary-bordercolor`.
  - `onClick` (Function, required): Click handler function `(event) => {}`. Receives the click event as parameter.
  - Additional properties: Any other properties are preserved and passed through, but not used by the default template.

**Returns:** `boolean` - Success status

**Example:**
```javascript
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',          // Required: FontAwesome icon
    label: 'Pencil',                      // Optional: Text label
    tooltip: 'Draw with pencil tool',     // Optional: Custom tooltip
    active: false,                        // Optional: Active state
    order: 10,                           // Optional: Display order
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

### Unregistering Secondary Bar Items

```javascript
// Remove an item from a secondary bar
blacksmith.unregisterSecondaryBarItem('cartographer', 'pencil-tool');
```

**Parameters:**
- `barTypeId` (string, required): The bar type ID
- `itemId` (string, required): The item ID to remove

**Returns:** `boolean` - Success status

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
- `--blacksmith-menubar-secondary-height` - Secondary bar height
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
    height: 80,
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

#### Example 1: Simple Toolbar (Default Tool System)

```javascript
Hooks.once('ready', async () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    if (!blacksmith) {
        console.error('Blacksmith API not available');
        return;
    }
    
    // 1. Register the bar type (no templatePath = uses default tool system)
    await blacksmith.registerSecondaryBarType('cartographer', {
        height: 60,
        persistence: 'manual',
        autoCloseDelay: 10000
    });
    
    // 2. Register tools/items for the bar
    blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
        icon: 'fa-solid fa-pencil',
        label: 'Pencil',
        tooltip: 'Draw with pencil',
        order: 10,
        onClick: () => {
            console.log('Pencil tool activated');
            // Update active state
            blacksmith.updateSecondaryBar({
                activeTool: 'pencil'
            });
        }
    });
    
    blacksmith.registerSecondaryBarItem('cartographer', 'eraser-tool', {
        icon: 'fa-solid fa-eraser',
        label: 'Eraser',
        tooltip: 'Erase drawings',
        order: 20,
        onClick: () => {
            console.log('Eraser tool activated');
        }
    });
    
    // 3. Register a menubar tool to toggle the secondary bar
    blacksmith.registerMenubarTool('cartographer-toggle', {
        icon: 'fa-solid fa-map',
        name: 'cartographer-toggle',
        title: 'Toggle Cartographer Tools',
        zone: 'left',
        order: 20,
        moduleId: 'coffee-pub-cartographer',
        onClick: () => {
            blacksmith.toggleSecondaryBar('cartographer');
        }
    });
});
```

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
| **Recommended** | ✅ **Use this by default** | ❌ Only when absolutely necessary |
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
   - ✅ **Default tool system**: Use for all simple toolbars (drawing tools, filters, toggles, etc.)
   - ❌ **Custom templates**: Only use for complex UIs that cannot be achieved with buttons (portraits, health rings, complex nested layouts)
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

## Version History

- **v13.0.0+**: Hybrid Secondary Bar System
  - Added default tool system (`registerSecondaryBarItem`, `unregisterSecondaryBarItem`, `getSecondaryBarItems`)
  - Added `templatePath` parameter to `registerSecondaryBarType` for custom templates
  - Timing-safe registration: items can be registered before bar types
  - Automatic template handling for both default and custom templates
  - Backward compatible with existing combat bar implementation

- **v12.1.8**: Secondary Bar API
  - Added `registerSecondaryBarType()` method
  - Added `openSecondaryBar()`, `closeSecondaryBar()`, `toggleSecondaryBar()` methods
  - Added `updateSecondaryBar()` method for real-time updates
  - Tab-like behavior: only one secondary bar open at a time
  - Automatic switching between secondary bars
  - Persistence modes (manual/auto) with auto-close support

- **v12.1.7**: Enhanced notification system
  - Added `updateNotification()` method for real-time notification updates
  - Added `getNotificationIdsByModule()` helper for module notification tracking
  - Improved timeout management to prevent memory leaks
  - Enhanced notification lifecycle management
  - Added comprehensive notification management examples

- **v12.1.6**: Initial menubar API release
  - Basic tool registration/unregistration
  - Zone-based organization (left, middle, right)
  - Three-tier visibility system (GM, Leader, Player)
  - Dynamic visibility support
  - Tool ordering and organization
  - Basic notification system

---

**Last Updated**: Current session - Secondary Bar API with tab-like switching  
**Status**: Production ready with comprehensive integration support  
**Next Milestone**: Enhanced menubar features and ecosystem integration
