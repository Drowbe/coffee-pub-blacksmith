# Blacksmith Toolbar API Documentation

## Overview

The Blacksmith Toolbar API allows external modules to register custom tools with the Blacksmith toolbar system. This provides a unified interface for adding functionality to both the Blacksmith Utilities toolbar and FoundryVTT's token control toolbar.

## Getting Started

### 1. Access the API

```javascript
// Get the Blacksmith module API
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Check if API is available
if (blacksmith?.registerToolbarTool) {
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
const success = blacksmith.registerToolbarTool('my-custom-tool', {
    icon: "fa-solid fa-dice-d20",
    name: "my-custom-tool",
    title: "My Custom Tool",
    button: true,           // REQUIRED: Must be true for toolbar display
    visible: true,          // REQUIRED: Must be true for visibility
    zone: "rolls",          // Optional: general, rolls, communication, utilities, leadertools, gmtools
    order: 5,               // Optional: order within zone (lower numbers appear first)
    moduleId: "my-module",  // Optional: your module ID
    gmOnly: false,          // Optional: whether tool is GM-only
    leaderOnly: false,      // Optional: whether tool is leader-only
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

### Tool Registration

#### `registerToolbarTool(toolId, toolData)`

Registers a new tool with the Blacksmith toolbar system.

**Parameters:**
- `toolId` (string): Unique identifier for the tool
- `toolData` (Object): Tool configuration object

**Returns:** `boolean` - Success status

**Tool Data Properties:**
- `icon` (string, required): FontAwesome icon class (e.g., "fa-solid fa-dice-d20")
- `name` (string, required): Tool name (used for data-tool attribute)
- `title` (string, required): Tooltip text displayed on hover
- `onClick` (Function, required): Function to execute when tool is clicked
- `button` (boolean, required): Whether to show as button (MUST be true for toolbar display)
- `visible` (boolean|Function, required): Whether tool is visible (MUST be true for visibility)
- `zone` (string, optional): Zone for organization (default: "general")
- `order` (number, optional): Order within zone (default: 999)
- `moduleId` (string, optional): Module identifier (default: "blacksmith-core")
- `gmOnly` (boolean, optional): Whether tool is GM-only (default: false)
- `leaderOnly` (boolean, optional): Whether tool is leader-only (default: false)

#### `unregisterToolbarTool(toolId)`

Removes a tool from the Blacksmith toolbar system.

**Parameters:**
- `toolId` (string): Unique identifier for the tool

**Returns:** `boolean` - Success status

### Tool Querying

#### `getRegisteredTools()`

Gets all registered tools.

**Returns:** `Map` - Map of all registered tools (toolId -> toolData)

#### `getToolsByModule(moduleId)`

Gets all tools registered by a specific module.

**Parameters:**
- `moduleId` (string): Module identifier

**Returns:** `Array` - Array of tools registered by the module

#### `isToolRegistered(toolId)`

Checks if a tool is registered.

**Parameters:**
- `toolId` (string): Unique identifier for the tool

**Returns:** `boolean` - Whether the tool is registered

### Settings Management

#### `getToolbarSettings()`

Gets current toolbar settings.

**Returns:** `Object` - Current toolbar settings
```javascript
{
    showDividers: boolean,  // Whether to show toolbar dividers
    showLabels: boolean     // Whether to show toolbar labels
}
```

#### `setToolbarSettings(settings)`

Updates toolbar settings.

**Parameters:**
- `settings` (Object): Settings object
  - `showDividers` (boolean, optional): Whether to show toolbar dividers
  - `showLabels` (boolean, optional): Whether to show toolbar labels

## Tool Zones

The toolbar system organizes tools into predefined zones:

### Zone Order (appearance order):
1. **`general`** - Default zone for tools that don't fit other categories
2. **`rolls`** - Roll-related tools, dice rollers, random generators
3. **`communication`** - Chat, messaging, and communication tools
4. **`utilities`** - General utility tools, helpers, calculators
5. **`leadertools`** - Leadership and management tools
6. **`gmtools`** - GM-specific tools, admin functions, management tools

### Zone Guidelines:
- **`general`**: Default zone for tools that don't fit other categories
- **`rolls`**: Dice rollers, random generators, roll-related tools
- **`communication`**: Chat tools, messaging, communication features
- **`utilities`**: General helpers, calculators, utility functions
- **`leadertools`**: Party leadership tools, vote management
- **`gmtools`**: GM-only tools, admin functions, management tools

## Visibility System

The toolbar uses a three-tier visibility system:

### User Types:
- **GM**: Sees all tools (including GM tools and leader tools)
- **LEADER**: Sees all tools except GM tools, plus leader tools
- **PLAYER**: Sees all tools except GM tools and leader tools

### Tool Properties:
- **`gmOnly: true`**: Only visible to Game Masters
- **`leaderOnly: true`**: Visible to party leaders and GMs
- **Default**: Visible to all users

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
// Register a simple utility tool
blacksmith.registerToolbarTool('my-utility', {
    icon: "fa-solid fa-calculator",
    name: "my-utility",
    title: "My Utility Tool",
    button: true,           // REQUIRED for toolbar display
    visible: true,          // REQUIRED for visibility
    zone: "utilities",
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
blacksmith.registerToolbarTool('my-admin-tool', {
    icon: "fa-solid fa-cog",
    name: "my-admin-tool",
    title: "Admin Tool",
    button: true,           // REQUIRED for toolbar display
    visible: true,          // REQUIRED for visibility
    zone: "gmtools",
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
blacksmith.registerToolbarTool('my-leader-tool', {
    icon: "fa-solid fa-crown",
    name: "my-leader-tool",
    title: "Leader Tool",
    button: true,           // REQUIRED for toolbar display
    visible: true,          // REQUIRED for visibility
    zone: "leadertools",
    order: 1,
    moduleId: "my-module",
    leaderOnly: true,
    onClick: () => {
        // Leader functionality
        ui.notifications.info("Leader tool activated!");
    }
});
```

### Dynamic Visibility

```javascript
// Register a tool with dynamic visibility
blacksmith.api.registerToolbarTool('my-conditional-tool', {
    icon: "fa-solid fa-eye",
    name: "my-conditional-tool",
    title: "Conditional Tool",
    zone: "utilities",
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

### Module Cleanup

```javascript
// Unregister all tools when module is disabled
Hooks.once('disableModule', (moduleId) => {
    if (moduleId === 'my-module') {
        const tools = blacksmith.api.getToolsByModule('my-module');
        tools.forEach(tool => {
            blacksmith.api.unregisterToolbarTool(tool.name);
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

## Best Practices

1. **Unique Tool IDs**: Use descriptive, unique tool identifiers
2. **Proper Zone Selection**: Choose the most appropriate zone for your tool
3. **Consistent Ordering**: Use consistent order values within your module
4. **Module Cleanup**: Unregister tools when your module is disabled
5. **Error Handling**: Always check return values and handle errors gracefully
6. **API Availability**: Check if the API is available before using it

## Troubleshooting

### Tool Not Appearing
- Check if tool is registered: `blacksmith.isToolRegistered('tool-id')`
- Verify visibility settings (gmOnly, leaderOnly, visible function)
- **Ensure required properties are set**: `button: true` and `visible: true` are mandatory
- Check console for error messages
- Ensure API is loaded: `blacksmith?.registerToolbarTool`

### API Not Available
- **Use correct API path**: `blacksmith.registerToolbarTool()` not `blacksmith.api.registerToolbarTool()`
- Wait for `ready` hook, not `blacksmithUpdated` hook
- Check if module is active: `game.modules.get('coffee-pub-blacksmith')?.active`

### Tool in Wrong Zone
- Verify `zone` property is set correctly
- Check zone spelling (must match predefined zones exactly)
- Default zone is "general" if not specified

### Tool Not Clickable
- Verify `onClick` function is provided and valid
- Check for JavaScript errors in onClick function
- Ensure tool is not disabled by visibility logic

## Support

For issues or questions about the Blacksmith Toolbar API:

1. Check this documentation first
2. Review console logs for error messages
3. Test with a simple tool registration
4. Contact the Blacksmith development team

## Version History

- **v12.1.2**: Initial toolbar API release
  - Basic tool registration/unregistration
  - Zone-based organization
  - Three-tier visibility system
  - Settings management
