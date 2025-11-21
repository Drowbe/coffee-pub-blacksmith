# FoundryVTT v12 to v13 Migration Guide

## Overview

This document tracks the migration process from FoundryVTT v12 to v13, including API changes, breaking changes, and issues encountered during migration.

---

## Key Changes in v13

### ApplicationV2 API

FoundryVTT v13 introduces the ApplicationV2 framework, which replaces the previous Application class. Modules should migrate to use ApplicationV2 for new applications and update existing ones.

**Reference:** 
- [ApplicationV2 API](https://foundryvtt.wiki/en/development/api/applicationv2)
- [ApplicationV2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)

### jQuery Removal

jQuery has been removed from FoundryVTT v13. All jQuery-dependent code must be migrated to native JavaScript methods.

### Resources for Migration

**Official Documentation:**
- [API Migration Guides](https://foundryvtt.com/article/migration/) - Canonical starting point for "what changed and why"
- [v13 API Reference](https://foundryvtt.com/api/) - Source of truth for new types, signatures, and class changes
- [v13 Release Notes](https://foundryvtt.com/releases/13.341) - Breaking changes, new APIs, and deprecations
- [Canvas API Documentation](https://foundryvtt.wiki/en/development/api/canvas) - Scene controls and canvas changes

**Community Support:**
- Foundry Discord `#dev-support` channel
- Foundry Community Wiki

---

## API Changes

### SceneControls / getSceneControlButtons Hook

**Status:** 🔴 Breaking Change

This is one of the bigger v13 breaking changes. The `controls` parameter passed to the `getSceneControlButtons` hook has changed from an array to an object.

**v12 Hook Signature:**
```typescript
getSceneControlButtons(controls: SceneControl[])
```

**v12 Behavior:**
- `controls` was an Array of `SceneControl` objects
- Could use array methods like `findIndex()`, `splice()`, `push()`, `find()`
- Tools within each control were also arrays

**v13 Hook Signature:**
```typescript
getSceneControlButtons(controls: Record<string, SceneControl>)
```

**v13 Behavior:**
- `controls` is now an object keyed by control name (`Record<string, SceneControl>`)
- Access controls directly: `controls.tokens`, `controls.measure`, etc.
- Tools within each control are now objects keyed by tool name, not arrays
- Array methods are no longer available

**v12 Pattern:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // Find control in array
    const tokenControl = controls.find(control => control.name === "token");
    
    // Find tool in array
    const existingIndex = controls.findIndex(control => control.name === "blacksmith-utilities");
    if (existingIndex !== -1) {
        controls.splice(existingIndex, 1);
    }
    
    // Push to array
    controls.push({
        name: "blacksmith-utilities",
        tools: [...]
    });
    
    // Add tool to control's tools array
    if (tokenControl) {
        tokenControl.tools.push({
            name: "myTool",
            ...
        });
    }
});
```

**v13 Pattern:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // Access control directly by key
    const tokenControl = controls.tokens;
    
    // Access/create control by key
    if (controls['blacksmith-utilities']) {
        delete controls['blacksmith-utilities'];
    }
    
    // Add control by key
    controls['blacksmith-utilities'] = {
        name: "blacksmith-utilities",
        tools: {...}
    };
    
    // Add tool to control's tools object
    if (tokenControl) {
        tokenControl.tools.myTool = {
            name: "myTool",
            title: "MyTool.Title",
            icon: "fa-solid fa-wrench",
            order: Object.keys(tokenControl.tools).length,
            button: true,
            visible: game.user.isGM,
            onClick: () => {/* ... */}
        };
    }
});
```

**Dual Compatibility Pattern (v12 + v13):**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // v12: controls is an array
    // v13: controls is an object keyed by control name
    let tokenControl;
    if (Array.isArray(controls)) {
        // v12 style
        tokenControl = controls.find(c => c.name === "token");
    } else {
        // v13 style
        tokenControl = controls.tokens;
    }
    
    if (!tokenControl) return;
    
    const tools = tokenControl.tools;
    const blacksmithTool = {
        name: "blacksmith",
        title: "Coffee Pub Blacksmith",
        icon: "fas fa-hammer",
        button: true,
        visible: game.user.isGM,
        order: Array.isArray(tools) ? tools.length : Object.keys(tools).length,
        onClick: () => {
            // open your toolbar/app
        }
    };
    
    if (Array.isArray(tools)) {
        // v12: tools is an array
        tools.push(blacksmithTool);
    } else {
        // v13: tools is an object keyed by tool name
        tools.blacksmith = blacksmithTool;
    }
});
```

**References:**
- [v13 API: getSceneControlButtons](https://foundryvtt.com/api/functions/hookEvents.getSceneControlButtons.html)
- [v13 API: SceneControls](https://foundryvtt.com/api/classes/client.SceneControls.html)
- [Canvas API Documentation](https://foundryvtt.wiki/en/development/api/canvas)

---

## Errors and Issues

This section tracks errors encountered in v13 that do not occur in v12.

### Error #1: `controls.findIndex is not a function`

**Date:** 2025-01-XX
**Location:** `scripts/manager-toolbar.js:485:44`
**Hook:** `getSceneControlButtons`

**Error Message:**
```
Hook callback error in getSceneControlButtons: TypeError: controls.findIndex is not a function
    at Object.callback (manager-toolbar.js:485:44)
    at Object.hookRunner [as fn] (manager-hooks.js:60:43)
    at #call (foundry.mjs:23832:20)
    at Hooks.callAll (foundry.mjs:23791:17)
    at #prepareControls (foundry.mjs:116336:13)
    at SceneControls._configureRenderOptions (foundry.mjs:116241:89)
    at #render (foundry.mjs:27219:10)
```

**Root Cause:**
In v13, the `controls` parameter in the `getSceneControlButtons` hook is no longer an array. It is now a `Record<string, SceneControl>` object keyed by control name (e.g., `controls.tokens`, `controls.measure`), not an array. Array methods like `findIndex()`, `splice()`, `push()`, and `find()` are no longer available.

Additionally, `tools` within each control are also objects keyed by tool name in v13, not arrays.

**Affected Code:**
```485:549:scripts/manager-toolbar.js
            const existingIndex = controls.findIndex(control => control.name === "blacksmith-utilities");
            if (existingIndex !== -1) {
                controls.splice(existingIndex, 1);
            }
            
            // Convert to the format expected by FoundryVTT
            const tools = visibleTools.map(tool => ({
                icon: tool.icon,
                name: tool.name,
                title: tool.title,
                button: tool.button,
                visible: true, // Visibility is already filtered by getVisibleTools()
                onClick: tool.onClick
            }));

            controls.push({
                name: "blacksmith-utilities",
                title: "Blacksmith Utilities",
                icon: "fa-solid fa-mug-hot",
                layer: "blacksmith-utilities-layer", // Ensure this matches the registration key
                tools: tools
            });

            // Add tools to FoundryVTT native toolbars
            const foundryTools = getFoundryToolbarTools();
            
            // Add tools to token toolbar (default behavior for now)
            const tokenControl = controls.find(control => control.name === "token");
            if (tokenControl && foundryTools.length > 0) {
                foundryTools.forEach(tool => {
                    // Check if tool already exists
                    const existingTool = tokenControl.tools.find(existing => existing.name === tool.name);
                    if (!existingTool) {
                        // ... visibility logic ...
                        if (shouldShow) {
                            tokenControl.tools.push({
                                icon: tool.icon,
                                name: tool.name,
                                title: tool.title,
                                button: tool.button,
                                visible: true,
                                onClick: tool.onClick
                            });
                        }
                    }
                });
            }
```

**Solution:**
The code needs to be rewritten to handle both v12 (array) and v13 (object) structures, or migrated to v13-only. See the "Dual Compatibility Pattern" in the API Changes section above for the recommended approach.

**Status:** 🔴 **Identified - Fix Required**
- Root cause confirmed: `controls` is `Record<string, SceneControl>` in v13, not array
- `tools` within controls are also objects in v13, not arrays
- Code needs to be updated to use object-based access patterns or dual-compatibility approach

**Fix Required:**
1. Replace `controls.findIndex()` with object property check: `if (controls['blacksmith-utilities'])`
2. Replace `controls.splice()` with object deletion: `delete controls['blacksmith-utilities']`
3. Replace `controls.push()` with object property assignment: `controls['blacksmith-utilities'] = {...}`
4. Replace `controls.find()` with direct property access: `controls.tokens`
5. Update tools handling: replace `tools.find()` and `tools.push()` with object property access/assignment

---

## Migration Checklist

### Scene Controls Migration
- [ ] Review all `getSceneControlButtons` hook implementations
- [ ] Update controls manipulation code for v13 API (object-based instead of array-based)
- [ ] Update tools manipulation within controls (object-based instead of array-based)
- [ ] Implement dual-compatibility pattern for v12/v13 or migrate to v13-only
- [ ] Test toolbar functionality in both v12 and v13 (if supporting both)
- [ ] Verify all scene control buttons work correctly
- [ ] Test with other modules that might interact with scene controls

### ApplicationV2 Migration
- [ ] Identify all Application classes
- [ ] Plan migration strategy for each Application
- [ ] Migrate to ApplicationV2 framework
- [ ] Test all application windows and dialogs

### jQuery Removal
- [ ] Identify all jQuery usage in codebase
- [ ] Replace jQuery selectors with native `document.querySelector` / `querySelectorAll`
- [ ] Replace jQuery DOM manipulation with native methods
- [ ] Replace jQuery event handlers with native `addEventListener`
- [ ] Test all UI interactions

### General
- [ ] Review all hook implementations for v13 changes
- [ ] Check for deprecated APIs and methods
- [ ] Update module.json minimum Core Version to v13.0.0
- [ ] Test all module functionality end-to-end
- [ ] Update documentation

---

## Notes

- Keep this document updated as issues are discovered and resolved
- Link to official FoundryVTT v13 migration documentation when available
- Include code examples for both v12 and v13 patterns
- When in doubt, check the v13 API reference instead of assuming v12 behavior
