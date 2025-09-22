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

## Version History

- **v12.1.6**: Initial menubar API release
  - Basic tool registration/unregistration
  - Zone-based organization (left, middle, right)
  - Three-tier visibility system (GM, Leader, Player)
  - Dynamic visibility support
  - Tool ordering and organization

---

**Last Updated**: Current session - API fully functional and documented  
**Status**: Production ready with comprehensive integration support  
**Next Milestone**: Enhanced menubar features and ecosystem integration
