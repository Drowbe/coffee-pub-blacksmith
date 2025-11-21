# FoundryVTT v12 to v13 Migration Guide

## Overview

This document tracks the migration process from FoundryVTT v12 to v13, including API changes, breaking changes, and issues encountered during migration.

**Summary of Issues Found:**
- **Error #1:** `controls.findIndex is not a function` - `getSceneControlButtons` hook now receives object instead of array
- **Errors #2-5:** `html.find is not a function` - Multiple files affected by jQuery removal in `renderCombatTracker` hook
  - `combat-tools.js`
  - `combat-tracker.js`
  - `timer-planning.js`
  - `timer-round.js`

**Key Breaking Changes:**
1. `getSceneControlButtons` - controls changed from array to object
2. jQuery removal - all hooks now receive native DOM elements instead of jQuery objects

---

## Key Changes in v13

### ApplicationV2 API

FoundryVTT v13 introduces the ApplicationV2 framework, which replaces the previous Application class. Modules should migrate to use ApplicationV2 for new applications and update existing ones.

**Reference:** 
- [ApplicationV2 API](https://foundryvtt.wiki/en/development/api/applicationv2)
- [ApplicationV2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)

### jQuery Removal

jQuery has been removed from FoundryVTT v13. All jQuery-dependent code must be migrated to native JavaScript methods.

**Impact on Hooks:**
- In v12, hooks like `renderCombatTracker` received `html` as a jQuery object
- In v13, hooks receive `html` as a native DOM element (HTMLElement)
- jQuery methods like `.find()`, `.each()`, `.append()`, `.before()`, `.after()`, `.remove()`, `.length`, etc. are no longer available
- Must use native DOM methods or convert to jQuery manually if needed

**v12 Pattern (jQuery):**
```javascript
Hooks.on('renderCombatTracker', (app, html, data) => {
    // html is a jQuery object
    const elements = html.find('.combatant');
    elements.each((i, el) => {
        const $el = $(el);
        // Use jQuery methods
    });
    html.append('<div>New content</div>');
});
```

**v13 Pattern (Native DOM):**
```javascript
Hooks.on('renderCombatTracker', (app, html, data) => {
    // html is a native HTMLElement
    const elements = html.querySelectorAll('.combatant');
    elements.forEach((el) => {
        // Use native DOM methods
    });
    const div = document.createElement('div');
    div.textContent = 'New content';
    html.appendChild(div);
});
```

**Dual Compatibility Pattern (v12 + v13):**
```javascript
Hooks.on('renderCombatTracker', (app, html, data) => {
    // Convert to jQuery if needed (v12) or use native (v13)
    const $html = html.jquery ? html : $(html);
    
    // Or check for jQuery methods
    if (typeof html.find === 'function') {
        // v12: html is jQuery
        html.find('.combatant').each(...);
    } else {
        // v13: html is native DOM
        html.querySelectorAll('.combatant').forEach(...);
    }
});
```

**Common jQuery to Native DOM Conversions:**
- `html.find(selector)` → `html.querySelectorAll(selector)` or `html.querySelector(selector)`
- `html.each(callback)` → `html.querySelectorAll(...).forEach(callback)`
- `html.append(content)` → `html.appendChild(element)` or `html.insertAdjacentHTML('beforeend', content)`
- `html.before(content)` → `html.insertAdjacentElement('beforebegin', element)` or `html.insertAdjacentHTML('beforebegin', content)`
- `html.after(content)` → `html.insertAdjacentElement('afterend', element)` or `html.insertAdjacentHTML('afterend', content)`
- `html.remove()` → `html.remove()` (same in v13, native method)
- `html.length` → `html.querySelectorAll(...).length` (for collections)
- `$(element)` → `element` is already a DOM element in v13, or wrap manually: `$(element)` if jQuery is needed

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

### Error #2: `html.find is not a function` in `renderCombatTracker` (combat-tools.js)

**Date:** 2025-01-XX
**Location:** `scripts/combat-tools.js:24:36`
**Hook:** `renderCombatTracker`

**Error Message:**
```
Hook callback error in renderCombatTracker: TypeError: html.find is not a function
    at Object.callback (combat-tools.js:24:36)
    at Object.hookRunner [as fn] (manager-hooks.js:60:43)
    at #call (foundry.mjs:23832:20)
    at Hooks.callAll (foundry.mjs:23791:17)
    at #callHooks (foundry.mjs:27972:15)
    at #dispatchEvent (foundry.mjs:27956:36)
```

**Root Cause:**
In v13, jQuery has been removed. The `html` parameter in the `renderCombatTracker` hook is now a native HTMLElement, not a jQuery object. jQuery methods like `.find()`, `.each()`, `.append()`, etc. are no longer available.

**Affected Code:**
```24:48:scripts/combat-tools.js
        const controlGroups = html.find('.combatant-controls');
        if (!controlGroups.length) return;

        // Set up observer for portrait changes if enabled
        if (getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' || mutation.type === 'attributes') {
                        const combatant = $(mutation.target).closest('.combatant');
                        if (combatant.length) {
                            updatePortrait(combatant[0]);
                        }
                    }
                });
            });

            // Observe the combat tracker for changes
            html.find('.directory-list').each((i, el) => {
                observer.observe(el, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src']
                });
            });
```

**Additional Affected Code:**
Multiple uses of `html.find()` throughout the file:
- Line 24: `html.find('.combatant-controls')`
- Line 41: `html.find('.directory-list').each(...)`
- Line 86: `html.find('.drop-target').each(...)`
- Line 155: `html.find('.combatant').each(...)`

**Status:** 🔴 **Identified - Fix Required**
- Root cause confirmed: `html` is native HTMLElement in v13, not jQuery object
- Multiple jQuery method calls need to be replaced with native DOM methods

**Fix Required:**
1. Replace `html.find(selector)` with `html.querySelectorAll(selector)` or `html.querySelector(selector)`
2. Replace `.each((i, el) => {...})` with `.forEach((el, i) => {...})`
3. Replace `.length` checks with `.length` on NodeList (same syntax)
4. Replace `$(element)` with native DOM element handling
5. Update DOM manipulation methods (`.append()`, `.before()`, `.after()`, `.remove()`, etc.)

---

### Error #3: `html.find is not a function` in `renderCombatTracker` (combat-tracker.js)

**Date:** 2025-01-XX
**Location:** `scripts/combat-tracker.js:426:34`
**Hook:** `renderCombatTracker`

**Error Message:**
```
Hook callback error in renderCombatTracker: TypeError: html.find is not a function
    at Object.callback (combat-tracker.js:426:34)
    at Object.hookRunner [as fn] (manager-hooks.js:60:43)
    at #call (foundry.mjs:23832:20)
    at Hooks.callAll (foundry.mjs:23791:17)
    at #callHooks (foundry.mjs:27972:15)
    at #dispatchEvent (foundry.mjs:27956:36)
```

**Root Cause:**
Same as Error #2 - jQuery removal in v13. The `html` parameter is now a native HTMLElement, not a jQuery object.

**Affected Code:**
```426:436:scripts/combat-tracker.js
						const rollNPCButton = html.find('.combat-control[data-control="rollNPC"]');
						if (!rollNPCButton.length) return;

						// Remove old button and handler if they exist
						this._removeRollRemainingButton();

						// Check if button already exists in the HTML (from previous render)
						let existingButton = html.find('.combat-control[data-control="rollRemaining"]');
						if (existingButton.length) {
							existingButton.remove();
						}
```

**Status:** 🔴 **Identified - Fix Required**
- Same root cause as Error #2
- Multiple jQuery method calls need to be replaced

**Fix Required:**
Same as Error #2 - replace all jQuery methods with native DOM methods.

---

### Error #4: `html.find is not a function` in `renderCombatTracker` (timer-planning.js)

**Date:** 2025-01-XX
**Location:** `scripts/timer-planning.js:295:14`
**Hook:** `renderCombatTracker`

**Error Message:**
```
Uncaught (in promise) TypeError: html.find is not a function
    at PlanningTimer._onRenderCombatTracker (timer-planning.js:295:14)
```

**Root Cause:**
Same as Errors #2 and #3 - jQuery removal in v13.

**Affected Code:**
```295:298:scripts/timer-planning.js
        html.find('.planning-phase').remove();
        
        // Insert before first combatant
        const firstCombatant = html.find('.combatant').first();
        firstCombatant.before(timerHtml);
```

**Status:** 🔴 **Identified - Fix Required**
- Same root cause as Errors #2 and #3

**Fix Required:**
Same as Errors #2 and #3 - replace jQuery methods with native DOM methods.

---

### Error #5: `html.find is not a function` in `renderCombatTracker` (timer-round.js)

**Date:** 2025-01-XX
**Location:** `scripts/timer-round.js:164:33`
**Hook:** `renderCombatTracker`

**Error Message:**
```
Uncaught (in promise) TypeError: html.find is not a function
    at RoundTimer._onRenderCombatTracker (timer-round.js:164:33)
```

**Root Cause:**
Same as Errors #2, #3, and #4 - jQuery removal in v13.

**Affected Code:**
```164:168:scripts/timer-round.js
        const roundTitle = html.find('.encounter-title');
        if (roundTitle.length) {
            // Insert after the encounter controls div to place it between the round number and planning timer
            const encounterControls = html.find('.encounter-controls');
            if (encounterControls.length) {
```

**Status:** 🔴 **Identified - Fix Required**
- Same root cause as previous jQuery-related errors

**Fix Required:**
Same as previous errors - replace jQuery methods with native DOM methods.

---

### Error #6: Duplicate of Error #1 (getSceneControlButtons)

**Note:** Error #4 mentioned in the user's report (`controls.findIndex is not a function` at `manager-toolbar.js:485:44`) is a duplicate of Error #1. See Error #1 for details.

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
- [ ] Identify all jQuery usage in codebase (use grep for `.find(`, `.each(`, `$(` patterns)
- [ ] Replace jQuery selectors with native `document.querySelector` / `querySelectorAll`
- [ ] Replace jQuery DOM manipulation with native methods (`.append()` → `.appendChild()`, etc.)
- [ ] Replace jQuery event handlers with native `addEventListener`
- [ ] Update all `renderCombatTracker` hooks to handle native HTMLElement instead of jQuery
- [ ] Update all other hooks that receive `html` parameter (check all render hooks)
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
