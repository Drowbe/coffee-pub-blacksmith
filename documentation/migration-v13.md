# FoundryVTT v12 to v13 Migration Guide

## Overview

This document tracks the migration process from FoundryVTT v12 to v13, including API changes, breaking changes, and issues encountered during migration.

---

## Key Changes in v13

### ApplicationV2 API

FoundryVTT v13 introduces the ApplicationV2 framework, which replaces the previous Application class. Modules should migrate to use ApplicationV2 for new applications and update existing ones.

**Reference:** https://foundryvtt.wiki/en/development/api/applicationv2

### jQuery Removal

jQuery has been removed from FoundryVTT v13. All jQuery-dependent code must be migrated to native JavaScript methods.

---

## API Changes

### SceneControls / getSceneControlButtons Hook

**Status:** 🔴 Breaking Change

In v13, the `controls` parameter passed to the `getSceneControlButtons` hook has changed structure.

**v12 Behavior:**
- `controls` was an Array
- Could use array methods like `findIndex()`, `splice()`, `push()`, `find()`

**v13 Behavior:**
- `controls` is now a Map (or similar structure)
- Array methods are no longer available directly
- Need to use Map methods or convert to array when needed

**Example v12 Code:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    const existingIndex = controls.findIndex(control => control.name === "blacksmith-utilities");
    if (existingIndex !== -1) {
        controls.splice(existingIndex, 1);
    }
    controls.push({...});
});
```

**v13 Migration:**
```javascript
// Need to convert Map to array, or use Map methods
// Structure TBD - requires investigation of actual v13 API
```

---

## Errors and Issues

This section tracks errors encountered in v13 that do not occur in v12.

### Error #1: `controls.findIndex is not a function`

**Date:** [Current Date]
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
In v13, the `controls` parameter in the `getSceneControlButtons` hook is no longer an array. It appears to be a Map or similar structure that doesn't have array methods like `findIndex()`.

**Affected Code:**
```485:512:scripts/manager-toolbar.js
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
```

**Status:** 🔴 **Needs Investigation**
- Need to determine the actual structure of `controls` in v13
- Need to identify the correct API methods to:
  - Check if a control exists
  - Remove an existing control
  - Add a new control

**Investigation Needed:**
1. Log the type and structure of `controls` parameter
2. Check FoundryVTT v13 API documentation for SceneControls
3. Review v13 release notes for getSceneControlButtons changes
4. Determine if controls is a Map, Object, or other structure

---

## Migration Checklist

- [ ] Review all `getSceneControlButtons` hook implementations
- [ ] Update controls manipulation code for v13 API
- [ ] Test toolbar functionality
- [ ] Verify all scene control buttons work correctly
- [ ] Test with other modules that might interact with scene controls

---

## Notes

- Keep this document updated as issues are discovered and resolved
- Link to official FoundryVTT v13 migration documentation when available
- Include code examples for both v12 and v13 patterns
