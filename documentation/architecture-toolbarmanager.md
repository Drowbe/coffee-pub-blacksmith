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

### **Phase 1: Blacksmith Toolbar Extension**
1. Create `BlacksmithToolbarManager` class
2. Modify `manager-toolbar.js` to use dynamic tool collection
3. Add tool registration/unregistration methods
4. Update API exposure
5. **Migrate existing hardcoded tools** to new registration system

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

- [ ] Phase 1: Blacksmith Toolbar Extension
- [ ] Phase 2: Token Control Toolbar Integration  
- [ ] Phase 3: API Integration
- [ ] Phase 4: Testing & Validation

## Notes

- **Encounter Toolbar**: No changes planned - this system is dynamic and journal-content based
- **Migration Approach**: Since we're the only consumer, we can safely refactor internal implementation
- **API Design**: Follow existing `ChatPanel.toolbarIcons` pattern for consistency
- **Documentation**: Will be updated after implementation is locked down
