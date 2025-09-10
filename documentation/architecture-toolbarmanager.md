# Blacksmith Toolbar Manager Architecture

## Overview

This document outlines the architecture for extending Blacksmith's toolbar system to support dynamic tool registration for both the Blacksmith toolbar and FoundryVTT's token control toolbar, while providing an API for other modules to register tools.

## Current Architecture Analysis

### 1. **Blacksmith Toolbar System** (Current Implementation)
- **Location**: `scripts/manager-toolbar.js`
- **Hook Used**: `getSceneControlButtons` 
- **Structure**: Creates a "Blacksmith Utilities" toolbar with predefined tools (regent, lookup, character, assistant, encounter, narrative, css, journal-tools, refresh)
- **Tools are hardcoded** in the `addToolbarButton()` function as individual tool objects with `icon`, `name`, `title`, `button`, `visible`, and `onClick` properties

### 2. **Chat Panel Toolbar System** (Current Implementation)
- **Location**: `scripts/chat-panel.js` 
- **Hook Used**: `renderChatLog`
- **Structure**: Has a `toolbarIcons` Map that stores module-specific toolbar icons
- **Dynamic System**: Other modules can register toolbar icons via `ChatPanel.registerToolbarIcon(moduleId, iconData)`
- **Template**: `templates/chat-panel.hbs` contains the HTML structure

### 3. **Encounter Toolbar System** (Current Implementation)
- **Location**: `scripts/encounter-toolbar.js`
- **Hook Used**: `renderJournalSheet`
- **Structure**: Adds toolbars to journal sheets with CR calculations and token management
- **Status**: **NO CHANGES** - This toolbar is dynamic and based on journal content

## Extension Requirements

### **1. Adding Tools to Blacksmith Toolbar**

**Current State**: Tools are hardcoded in `manager-toolbar.js`

**Required Changes**:
- **Create a Tool Registration System**: Similar to how `ChatPanel` has `toolbarIcons` Map
- **Modify `addToolbarButton()`**: Change from hardcoded tools to dynamic tool collection
- **Add API Methods**: 
  - `registerBlacksmithTool(toolId, toolData)` 
  - `unregisterBlacksmithTool(toolId)`
  - `getRegisteredBlacksmithTools()`
- **Update Tool Structure**: Ensure tools support the same properties (icon, name, title, button, visible, onClick)

### **2. Adding Tools to Foundry's Token Control Toolbar**

**Current State**: No integration with Foundry's default toolbars

**Required Changes**:
- **Research FoundryVTT v12 Token Control Hooks**: Need to identify the correct hook for token control toolbar
- **Create Token Control Tool Manager**: New class similar to `manager-toolbar.js` but for token controls
- **Hook Integration**: Use Foundry's token control hooks (likely `getTokenControlButtons` or similar)
- **Tool Registration System**: Similar to blacksmith toolbar but for token controls
- **API Methods**:
  - `registerTokenControlTool(toolId, toolData)`
  - `unregisterTokenControlTool(toolId)`
  - `getRegisteredTokenControlTools()`

### **3. Exposing API for Other Modules**

**Current State**: API exists but doesn't include toolbar registration

**Required Changes**:
- **Extend `blacksmith-api.js`**: Add toolbar registration methods to the exposed API
- **Update Module API Exposure**: Add new toolbar managers to the module.api object in `blacksmith.js`
- **Create Toolbar Manager Classes**: 
  - `BlacksmithToolbarManager` (for blacksmith toolbar)
  - `TokenControlToolbarManager` (for foundry token controls)
- **Documentation**: Update API documentation with new toolbar registration methods

## Technical Implementation Plan

### **Phase 1: Blacksmith Toolbar Extension** ✅ COMPLETED
1. ✅ Create `BlacksmithToolbarManager` class (`scripts/manager-blacksmith-toolbar.js`)
2. ✅ Modify `manager-toolbar.js` to use dynamic tool collection
3. ✅ Add tool registration/unregistration methods
4. ✅ Update API exposure in `blacksmith.js`
5. ✅ **Migrate existing hardcoded tools** to new registration system
6. ✅ **Add Zone System** for tool organization and visual grouping
7. ✅ **Add CSS Styling** for zone-based visual organization (`styles/toolbar-zones.css`)

### **Phase 2: Token Control Toolbar Integration**
1. Research and identify correct FoundryVTT hooks for token control
2. Create `TokenControlToolbarManager` class
3. Implement hook registration for token control toolbar
4. Add tool registration system

### **Phase 3: API Integration**
1. Extend `blacksmith-api.js` with toolbar methods
2. Update module API exposure in `blacksmith.js`
3. Create comprehensive documentation
4. Add example usage patterns

### **Phase 4: Testing & Validation**
1. Test tool registration/unregistration
2. Verify compatibility with existing modules
3. Test FoundryVTT v12 and v13 compatibility
4. Validate API stability

## Migration Strategy

Since we are the only consumers of the current toolbar system, we will migrate existing hardcoded tools to the new registration approach as part of this process:

### **Migration Steps**:
1. **Create new toolbar managers** with registration systems
2. **Migrate existing tools** from hardcoded arrays to registered tools
3. **Update `manager-toolbar.js`** to use the new dynamic system
4. **Remove hardcoded tool definitions** once migration is complete
5. **Test all existing functionality** to ensure no regressions

### **Migration Benefits**:
- **Consistency**: All tools use the same registration pattern
- **Maintainability**: Easier to add/remove tools
- **API Ready**: External modules can use the same system
- **Future Proof**: Foundation for advanced toolbar features

## Risk Analysis

### **Low Risk**:
- **API Changes**: Since we're the only consumer, we can safely refactor the internal implementation
- **Hook Timing**: Existing hook patterns are well-established in the codebase
- **Tool Structure**: Tool objects already follow a consistent pattern

### **Medium Risk**:
- **FoundryVTT Hook Discovery**: Need to identify correct hooks for token control toolbar
- **Hook Priority Conflicts**: New toolbar hooks might conflict with existing ones
- **Performance Impact**: Dynamic tool collection might have slight performance overhead

### **High Risk**:
- **FoundryVTT v12/v13 Compatibility**: Token control hooks might change between versions
- **Hook Registration Timing**: Tools must be registered before Foundry renders toolbars
- **Module Loading Order**: External modules might try to register tools before Blacksmith is ready

### **Mitigation Strategies**:
1. **Comprehensive Testing**: Test with multiple FoundryVTT versions
2. **Graceful Degradation**: Handle missing hooks or failed registrations gracefully
3. **Timing Safeguards**: Use `Hooks.once('ready')` for tool registration
4. **Error Handling**: Robust error handling for invalid tool registrations
5. **Documentation**: Clear documentation of hook timing requirements

## Key Considerations

1. **Hook Timing**: Ensure toolbar tools are registered before Foundry renders the toolbars
2. **Module Dependencies**: Handle cases where other modules try to register tools before Blacksmith is ready
3. **Tool Validation**: Validate tool data structure and required properties
4. **Error Handling**: Graceful handling of invalid tool registrations
5. **Performance**: Efficient tool lookup and rendering
6. **Migration Safety**: Ensure existing functionality remains intact during migration

## Implementation Status

- [x] Phase 1: Blacksmith Toolbar Extension
- [ ] Phase 2: Token Control Toolbar Integration  
- [ ] Phase 3: API Integration
- [ ] Phase 4: Testing & Validation

## Current Implementation Details

### **Phase 1 Implementation** ✅ COMPLETED

#### **BlacksmithToolbarManager Class** (`scripts/manager-blacksmith-toolbar.js`)
- **Static Properties**:
  - `registeredTools = new Map()` - Stores all registered tool data
- **Key Methods**:
  - `registerTool(toolId, toolData)` - Register a new tool with zone and ordering
  - `unregisterTool(toolId)` - Remove a specific tool
  - `unregisterModuleTools(moduleId)` - Remove all tools from a module
  - `getVisibleTools()` - Get all visible tools
  - `getVisibleToolsByZones()` - Get tools organized by zones with proper ordering
  - `_registerDefaultTools()` - Register all 9 default Blacksmith tools

#### **Zone System**
- **Predefined Zones**: `general`, `rolls`, `communication`, `utilities`, `leadertools`, `gmtools`
- **Zone Order**: Tools are grouped by zone, then sorted by `order` within each zone
- **Default Zone**: `general` (if not specified)
- **Default Order**: `999` (if not specified)

#### **Tool Data Structure**
```javascript
{
    icon: "fa-solid fa-dice-d20",           // FontAwesome icon class
    name: "request-roll",                   // Unique tool identifier
    title: "Request Roll",                  // Tooltip text
    button: true,                           // Whether to show as button
    visible: true,                          // Whether tool is visible (boolean or function)
    onClick: () => { /* handler */ },       // Click handler function
    moduleId: "blacksmith-core",            // Module that registered the tool
    zone: "rolls",                         // Zone for organization (optional)
    order: 10,                             // Order within zone (optional)
    gmOnly: false,                         // Whether tool is GM-only (optional)
    leaderOnly: false                      // Whether tool is leader-only (optional)
}
```

#### **Three-Tier Visibility System**
- **GM**: Sees all tools (including GM tools and leader tools)
- **LEADER**: Sees all tools except GM tools, plus leader tools
- **PLAYER**: Sees all tools except GM tools and leader tools

#### **CSS Styling** (`styles/toolbar-zones.css`)
- **Zone Background Colors**: Each zone has a distinct background color
- **Zone Dividers**: Visual separators between zones using CSS borders
- **Class Structure**: `#tools-panel-blacksmith-utilities .control-tool.toolbar-zone-{zone}`
- **Dynamic Application**: Zone classes applied via JavaScript after toolbar rendering

#### **API Integration** (`scripts/blacksmith.js`)
- **Dynamic Import**: `BlacksmithToolbarManager` loaded via dynamic import
- **API Exposure**: Added to `module.api` after initialization
- **Timing**: Initialized before toolbar rendering to ensure tools are available

### **Module Registration Requirements**

When external modules register tools with the Blacksmith toolbar, they **MUST** provide:

#### **Required Properties**:
- `icon` - FontAwesome icon class (e.g., "fa-solid fa-dice-d20")
- `name` - Unique tool identifier (used for data-tool attribute)
- `title` - Tooltip text displayed on hover
- `onClick` - Function to execute when tool is clicked

#### **Optional Properties**:
- `zone` - Zone for organization (`general`, `rolls`, `communication`, `utilities`, `leadertools`, `gmtools`)
- `order` - Order within zone (lower numbers appear first)
- `moduleId` - Module identifier (defaults to "blacksmith-core")
- `button` - Whether to show as button (defaults to true)
- `visible` - Whether tool is visible (defaults to true)
- `gmOnly` - Whether tool is only visible to GMs (defaults to false)

#### **Example Module Registration**:
```javascript
// In your module's initialization
game.modules.get("coffee-pub-blacksmith").api.BlacksmithToolbarManager.registerTool("my-roll-tool", {
    icon: "fa-solid fa-dice-d20",
    name: "my-roll-tool",
    title: "My Custom Roll Tool",
    zone: "rolls",          // Place in rolls zone
    order: 5,               // Order within rolls zone
    moduleId: "my-module",  // Your module ID
    gmOnly: false,          // Visible to all users (default)
    onClick: () => {
        // Your tool logic here
        console.log("My custom roll tool clicked!");
    }
});
```

#### **Zone Guidelines**:
- **`general`**: Default zone for tools that don't fit other categories (first in order)
- **`rolls`**: Roll-related tools, dice rollers, random generators
- **`communication`**: Chat, messaging, and communication tools
- **`utilities`**: General utility tools, helpers, calculators
- **`leadertools`**: Leadership and management tools (coming soon)
- **`gmtools`**: GM-specific tools, admin functions, management tools (last in order)

#### **Ordering Guidelines**:
- **Lower numbers appear first** within each zone
- **Recommended ranges**:
  - `1-10`: Core/primary tools
  - `11-50`: Secondary tools
  - `51-100`: Utility tools
  - `101+`: Optional/advanced tools

## Notes

- **Encounter Toolbar**: No changes planned - this system is dynamic and journal-content based
- **Migration Approach**: Since we're the only consumer, we can safely refactor internal implementation
- **API Design**: Follow existing `ChatPanel.toolbarIcons` pattern for consistency
- **Zone System**: Provides visual organization and logical grouping of tools
- **CSS Classes**: Applied dynamically via JavaScript after toolbar rendering
- **Documentation**: Will be updated after implementation is locked down
