# Blacksmith Toolbar API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

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
// Register a custom tool (minimal example - many properties have defaults)
const success = blacksmith.registerToolbarTool('my-custom-tool', {
    icon: "fa-solid fa-dice-d20",  // Optional: defaults to "fa-solid fa-square-question"
    name: "my-custom-tool",         // Optional: defaults to toolId if not provided
    title: "My Custom Tool",        // Optional: defaults to name or toolId
    button: true,                   // Optional: defaults to true (v13 requirement)
    visible: true,                   // Optional: defaults to true
    zone: "rolls",                  // Optional: defaults to "general"
    order: 5,                       // Optional: defaults to 999
    moduleId: "my-module",          // Optional: defaults to "blacksmith-core"
    gmOnly: false,                  // Optional: defaults to false
    leaderOnly: false,               // Optional: defaults to false
    onCoffeePub: true,              // Optional: defaults to true (can be boolean or function)
    onFoundry: false,                // Optional: defaults to false (can be boolean or function)
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

**Note for FoundryVTT v13**: The `button` property defaults to `true` and is required for toolbar display. The `name` property defaults to `toolId` if not provided, which is especially important for external modules to ensure proper tool identification.

## API Reference

### Tool Registration

#### `registerToolbarTool(toolId, toolData)`

Registers a new tool with the Blacksmith toolbar system.

**Parameters:**
- `toolId` (string): Unique identifier for the tool
- `toolData` (Object): Tool configuration object

**Returns:** `boolean` - Success status

**Tool Data Properties:**
- `icon` (string, optional): FontAwesome icon class (e.g., "fa-solid fa-dice-d20"). Defaults to `"fa-solid fa-square-question"` if not provided.
- `name` (string, optional): Tool name (used for data-tool attribute). **Defaults to `toolId` if not provided** - this is especially important for external modules to ensure proper tool identification in FoundryVTT v13.
- `title` (string, optional): Tooltip text displayed on hover. Defaults to `toolData.name` or `toolId` if not provided.
- `onClick` (Function, required): Function to execute when tool is clicked
- `button` (boolean, optional): Whether to show as button. **Defaults to `true`** - FoundryVTT v13 requires `button: true` for toolbar display. Must be `true` for tools to appear in toolbars.
- `toggle` (boolean, optional): Automatically set to `false` for all tools. Not user-configurable.
- `visible` (boolean|Function, optional): Whether tool is visible. Defaults to `true` if not provided. Can be a function that returns a boolean for dynamic visibility.
- `zone` (string, optional): Zone for organization (default: "general")
- `order` (number, optional): Order within zone (default: 999)
- `moduleId` (string, optional): Module identifier (default: "blacksmith-core")
- `gmOnly` (boolean, optional): Whether tool is GM-only (default: false)
- `leaderOnly` (boolean, optional): Whether tool is leader-only (default: false)
- `onCoffeePub` (boolean|Function, optional): Whether to show in Blacksmith toolbar. Can be a boolean or a function that returns a boolean for dynamic visibility. Defaults to `true` for backward compatibility.
- `onFoundry` (boolean|Function, optional): Whether to show in FoundryVTT native toolbar. Can be a boolean or a function that returns a boolean for dynamic visibility. Defaults to `false`.

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
    displayStyle: string    // "none", "dividers", or "labels"
}
```

#### `setToolbarSettings(settings)`

Updates toolbar settings.

**Parameters:**
- `settings` (Object): Settings object
  - `displayStyle` (string, optional): "none", "dividers", or "labels"

## Toolbar Targeting

The Blacksmith toolbar system supports two different toolbar locations:

### Toolbar Types:
- **`onCoffeePub: true`**: Shows in the Blacksmith Utilities toolbar (custom toolbar)
- **`onFoundry: true`**: Shows in FoundryVTT's native token control toolbar

### Usage Examples:

```javascript
// Tool only in Blacksmith toolbar (default behavior)
blacksmith.registerToolbarTool('blacksmith-only', {
    // ... other properties
    onCoffeePub: true,
    onFoundry: false
});

// Tool only in FoundryVTT toolbar
blacksmith.registerToolbarTool('foundry-only', {
    // ... other properties
    onCoffeePub: false,
    onFoundry: true
});

// Tool in both toolbars
blacksmith.registerToolbarTool('both-toolbars', {
    // ... other properties
    onCoffeePub: true,
    onFoundry: true
});
```

### Default Behavior:
- **`onCoffeePub`**: `true` (backward compatibility) - Can be a boolean or function
- **`onFoundry`**: `false` (current behavior) - Can be a boolean or function

### Dynamic Visibility:
Both `onCoffeePub` and `onFoundry` support function values for dynamic visibility:

```javascript
// Tool that only appears in CoffeePub toolbar when a setting is enabled
blacksmith.registerToolbarTool('conditional-tool', {
    // ... other properties
    onCoffeePub: () => {
        return game.settings.get('my-module', 'enableToolbarTool');
    },
    onFoundry: false
});
```

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

### Minimal Tool Registration (v13)

```javascript
// Minimal example - many properties have defaults
// Only onClick is truly required
blacksmith.registerToolbarTool('my-utility', {
    icon: "fa-solid fa-calculator",  // Optional: has default
    onClick: () => {
        // Your utility logic
        ui.notifications.info("Utility tool activated!");
    }
    // name defaults to 'my-utility' (toolId)
    // title defaults to name or toolId
    // button defaults to true (v13 requirement)
    // visible defaults to true
    // zone defaults to "general"
    // order defaults to 999
    // onCoffeePub defaults to true
    // onFoundry defaults to false
});
```

### Basic Tool Registration

```javascript
// Register a simple utility tool (Blacksmith toolbar only)
blacksmith.registerToolbarTool('my-utility', {
    icon: "fa-solid fa-calculator",
    name: "my-utility",              // Optional: defaults to toolId
    title: "My Utility Tool",        // Optional: defaults to name or toolId
    button: true,                     // Optional: defaults to true (v13 requirement)
    visible: true,                    // Optional: defaults to true
    zone: "utilities",
    order: 10,
    moduleId: "my-module",
    onCoffeePub: true,               // Optional: defaults to true
    onFoundry: false,                // Optional: defaults to false
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

### FoundryVTT Toolbar Integration

```javascript
// Register a tool for FoundryVTT's token toolbar
blacksmith.registerToolbarTool('my-token-tool', {
    icon: "fa-solid fa-dice-d20",
    name: "my-token-tool",
    title: "Token Tool",
    button: true,
    visible: true,
    zone: "rolls",
    order: 5,
    moduleId: "my-module",
    onCoffeePub: false,     // Don't show in Blacksmith toolbar
    onFoundry: true,        // Show in FoundryVTT toolbar
    gmOnly: true,           // Only GMs can use this tool
    onClick: () => {
        // Tool logic for token operations
        ui.notifications.info("Token tool activated!");
    }
});
```

### Tool in Both Toolbars

```javascript
// Register a tool that appears in both toolbars
blacksmith.registerToolbarTool('my-universal-tool', {
    icon: "fa-solid fa-star",
    name: "my-universal-tool",
    title: "Universal Tool",
    button: true,
    visible: true,
    zone: "utilities",
    order: 10,
    moduleId: "my-module",
    onCoffeePub: true,      // Show in Blacksmith toolbar
    onFoundry: true,        // Show in FoundryVTT toolbar
    onClick: () => {
        // Tool logic
        ui.notifications.info("Universal tool activated!");
    }
});
```

### Dynamic Visibility

```javascript
// Register a tool with dynamic visibility
blacksmith.registerToolbarTool('my-conditional-tool', {
    icon: "fa-solid fa-eye",
    name: "my-conditional-tool",
    title: "Conditional Tool",
    button: true,
    visible: true,
    zone: "utilities",
    order: 20,
    moduleId: "my-module",
    onCoffeePub: true,
    onFoundry: false,
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
        const tools = blacksmith.getToolsByModule('my-module');
        tools.forEach(tool => {
            blacksmith.unregisterToolbarTool(tool.name);
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
- **For FoundryVTT v13**: Ensure `name` property is set (defaults to `toolId` if not provided)
- **For FoundryVTT v13**: `button` property defaults to `true` but must be `true` for toolbar display
- Verify `onCoffeePub` or `onFoundry` functions return `true` if using function values
- Check console for error messages
- Ensure API is loaded: `blacksmith?.registerToolbarTool`
- If players don't see newly registered tools, make sure a controls refresh runs on their client (e.g., after registration or when settings change)

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

- **v13.0.8**: FoundryVTT v13 compatibility updates
  - **Property defaults**: Added automatic defaults for `name` (defaults to `toolId`), `title`, `icon`, and `button` (defaults to `true`)
  - **Dynamic visibility**: `onCoffeePub` and `onFoundry` now support function values for dynamic visibility evaluation
  - **v13 requirements**: `button: true` is now required for toolbar display (defaults to `true` if not provided)
  - **External module support**: Improved defaults ensure external modules work correctly even if properties are missing
  - Updated API documentation to reflect v13 requirements and defaults

- **v12.1.3**: Enhanced toolbar targeting
  - Added `onCoffeePub` and `onFoundry` parameters for toolbar targeting
  - Support for FoundryVTT native toolbar integration
  - Backward compatibility maintained
  - Updated API documentation

- **v12.1.2**: Initial toolbar API release
  - Basic tool registration/unregistration
  - Zone-based organization
  - Three-tier visibility system
  - Settings management
