# FoundryVTT v12 to v13 Migration Guide

## Overview

This document tracks the migration process from FoundryVTT v12 to v13, including API changes, breaking changes, and issues encountered during migration.

**Migration Status:**
- **Phase 1:** ✅ Complete - Critical fixes (0 errors)
- **Phase 1.5:** ✅ Complete - Deprecation warnings (0 warnings)
- **Phase 2:** 🟡 In Progress - jQuery removal for remaining files (Mostly complete, testing in progress)

**Summary of Issues Found:**
- **Error #1:** `controls.findIndex is not a function` - `getSceneControlButtons` hook now receives object instead of array ✅ **FIXED**
- **Errors #2-6:** `html.find is not a function` - Multiple files affected by jQuery removal ✅ **FIXED**
  - `combat-tools.js` ✅
  - `combat-tracker.js` ✅
  - `timer-planning.js` ✅
  - `timer-round.js` ✅
  - `timer-combat.js` ✅
  - `manager-navigation.js` ✅
- **Error #7:** `window-skillcheck.js` - jQuery removal (144+ instances) ✅ **FIXED**
  - All jQuery converted to native DOM
  - Added dual-compatibility for jQuery/native DOM detection
  - Fixed `activateListeners`, `handleChatMessageClick`, `_updateToolList`, and helper methods

**Additional Issues Fixed:**
- **Bug #1:** SVG `className` property error - Fixed by using `setAttribute('class', ...)` ✅
- **Warning #1:** `Token#target` deprecation - Fixed by using `targetArrows` and `targetPips` ✅
- **Warning #2:** `FilePicker` deprecation - Fixed by using namespaced `foundry.applications.apps.FilePicker.implementation` ✅
- **Error #8:** Syntax errors in `blacksmith.js` (extra closing braces) ✅ **FIXED**
- **Error #9:** `html.querySelectorAll is not a function` in `renderChatMessage` hooks (blacksmith.js) ✅ **FIXED**
- **Error #10:** `overlay.fadeOut is not a function` in `manager-rolls.js` (cinematic overlay) ✅ **FIXED**
- **Error #11:** `html.querySelector is not a function` in `token-image-replacement.js` ✅ **FIXED**
- **Error #12:** `html.querySelector is not a function` in `RollWindow.activateListeners` (manager-rolls.js) ✅ **FIXED**
- **Error #13:** `this.element.querySelector is not a function` in `RollWindow._executeRoll` (manager-rolls.js) ✅ **FIXED**
- **Error #14:** `element.querySelector is not a function` in `_updateResults` and other methods (token-image-replacement.js) ✅ **FIXED**
- **Error #15:** `element is not defined` in `_initializeFilterToggleButton` (token-image-replacement.js) ✅ **FIXED**
- **Error #16:** Mouse events not registering on image thumbnails (token-image-replacement.js) ✅ **FIXED** - Fixed event delegation Proxy to correctly set `currentTarget`
- **Error #17:** `Illegal invocation` error on right-click (token-image-replacement.js) ✅ **FIXED** - Fixed Proxy to bind event methods to original event object
- **Error #18:** `html.querySelector is not a function` in `XpDistributionWindow.activateListeners` (xp-manager.js) ✅ **FIXED** - Added jQuery detection
- **Error #19:** `this.element.querySelector is not a function` in `_updateXpDataPlayers` and other methods (xp-manager.js) ✅ **FIXED** - Added jQuery detection for all `this.element` usage

**Combat Tracker UI Issues Fixed:**
- **Bug #2:** Health ring alignment - Fixed CSS positioning and insertion order ✅ **FIXED**
- **Bug #3:** Roll Remaining button not appearing - Fixed jQuery removal, button structure, and insertion logic ✅ **FIXED**
- **Bug #4:** Planning timer not visible/clickable - Fixed CSS, HTML structure, and event handlers ✅ **FIXED**
- **Bug #5:** Planning timer showing "0s Planning" - Fixed state initialization ✅ **FIXED**
- **Bug #6:** Planning timer not disappearing gracefully - Fixed fade-out logic ✅ **FIXED**
- **Bug #7:** Planning timer excessive renders/appearing before initiative - Added initiative check and reduced renders ✅ **FIXED**
- **Bug #8:** Combat timer not showing in popout - Fixed selectors and updateUI logic ✅ **FIXED**
- **Bug #9:** Combat timer showing before initiative rolled - Added initiative check ✅ **FIXED**
- **Bug #10:** Combat end popout not closing - Enhanced closeCombatTracker() method ✅ **FIXED**

**Key Breaking Changes:**
1. `getSceneControlButtons` - controls changed from array to object ✅ **MIGRATED**
2. jQuery removal - all hooks now receive native DOM elements instead of jQuery objects ✅ **MIGRATED**

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

### Phase 1: Critical Fixes ✅ **COMPLETE**

#### Scene Controls Migration ✅
- [x] Review all `getSceneControlButtons` hook implementations
- [x] Update controls manipulation code for v13 API (object-based instead of array-based)
- [x] Update tools manipulation within controls (object-based instead of array-based)
- [x] Migrate to v13-only patterns (no dual-compatibility)
- [x] Test toolbar functionality in v13
- [x] Verify all scene control buttons work correctly

#### jQuery Removal - Critical Hooks ✅
- [x] Update all `renderCombatTracker` hooks to handle native HTMLElement instead of jQuery
  - [x] `combat-tools.js` ✅
  - [x] `combat-tracker.js` ✅
  - [x] `timer-planning.js` ✅
  - [x] `timer-round.js` ✅
  - [x] `timer-combat.js` ✅
- [x] Update `renderSceneNavigation` and `renderSceneDirectory` hooks
  - [x] `manager-navigation.js` ✅
- [x] Fix SVG className bug (use `setAttribute('class', ...)`)
- [x] Replace jQuery selectors with native `querySelector` / `querySelectorAll`
- [x] Replace jQuery DOM manipulation with native methods
- [x] Replace jQuery event handlers with native `addEventListener`
- [x] Test all UI interactions

#### Phase 1.5: Deprecation Warnings ✅
- [x] Fix `Token#target` deprecation (use `targetArrows` and `targetPips`)
  - [x] `token-image-utilities.js` ✅
- [x] Fix `FilePicker` deprecation (use `foundry.applications.apps.FilePicker.implementation`)
  - [x] `manager-image-cache.js` ✅
  - [x] `blacksmith.js` ✅

### Phase 2: jQuery Removal - Remaining Files ✅ **COMPLETE** (Testing in progress)

#### High-Impact Files
- [x] `scripts/window-skillcheck.js` (144+ instances) ✅ **COMPLETE**
- [x] `scripts/window-query.js` (23 instances) ✅ **COMPLETE**
- [x] `scripts/window-gmtools.js` (26 instances) ✅ **COMPLETE**
- [x] `scripts/journal-tools.js` (12 instances) ✅ **COMPLETE**
- [x] `scripts/encounter-toolbar.js` (10 instances) ✅ **COMPLETE**

#### Medium-Impact Files
- [x] `scripts/token-image-replacement.js` (84+ instances) ✅ **COMPLETE** - Added jQuery detection for `activateListeners`, `_showSearchSpinner`, `_hideSearchSpinner`, `_registerDomEvent`
- [x] `scripts/blacksmith.js` (10+ instances) ✅ **COMPLETE** - Fixed syntax errors, added jQuery detection for `renderChatMessage` hooks
- [x] `scripts/xp-manager.js` (18 instances) ✅ **COMPLETE** - Fixed jQuery detection in `activateListeners`, `_onModeToggleChange`, `_collectMilestoneData`, `_getIncludedPlayerCount`, `_updateXpDataPlayers`, and `_updateXpDisplay`
- [x] `scripts/token-image-utilities.js` (24 instances) ✅ **COMPLETE** - No jQuery found, already using native DOM
- [x] `scripts/api-menubar.js` (39 instances) ✅ **COMPLETE**
- [x] `scripts/combat-tools.js` (19 instances) ✅ **COMPLETE** - Already using native DOM
- [x] `scripts/timer-planning.js` (11 instances) ✅ **COMPLETE** - Fixed `fadeOut()` replacements
- [x] `scripts/timer-combat.js` (8 instances) ✅ **COMPLETE** - Fixed jQuery usage
- [x] `scripts/manager-rolls.js` (5+ instances) ✅ **COMPLETE** - Fixed `activateListeners`, `_setupFormulaUpdates`, `_executeRoll`, `fadeOut()` replacements, improved tool lookup

### Phase 3: ApplicationV2 Migration 🔵 **PLANNED**
- [ ] Identify all Application classes
- [ ] Plan migration strategy for each Application
- [ ] Migrate to ApplicationV2 framework
- [ ] Test all application windows and dialogs

### General
- [x] Update module.json minimum Core Version to v13.0.0 ✅
- [x] Review critical hook implementations for v13 changes ✅
- [x] Check for deprecated APIs and methods ✅
- [x] Review all remaining hook implementations for v13 changes ✅
- [x] Complete jQuery removal from all identified files ✅
- [x] Implement jQuery detection patterns where needed ✅
- [x] Replace fadeOut() with CSS transitions ✅
- [x] Update documentation ✅
- [ ] Test all module functionality end-to-end (in progress)

---

## Recent Fixes (Testing Phase)

### jQuery Detection Pattern Implementation

During testing, we discovered that some hooks and Application methods still receive jQuery objects in v13, requiring dual-compatibility patterns. The following pattern was implemented across multiple files:

```javascript
// v13: Handle both jQuery and native DOM (html parameter may still be jQuery)
let htmlElement;
if (html && typeof html.jquery !== 'undefined') {
    // It's a jQuery object, get the native DOM element
    htmlElement = html[0] || html.get?.(0);
} else if (html && typeof html.querySelectorAll === 'function') {
    // It's already a native DOM element
    htmlElement = html;
} else {
    return;
}

if (!htmlElement) {
    return;
}
```

**Files Updated with jQuery Detection:**
- `blacksmith.js` - `renderChatMessage` hooks (2 instances)
- `token-image-replacement.js` - `activateListeners`, `_showSearchSpinner`, `_hideSearchSpinner`, `_registerDomEvent`
- `manager-rolls.js` - `RollWindow.activateListeners`, `_setupFormulaUpdates`, `_executeRoll`
- `xp-manager.js` - `XpDistributionWindow.activateListeners`, `_onModeToggleChange`, `_collectMilestoneData`, `_getIncludedPlayerCount`, `_updateXpDataPlayers`, `_updateXpDisplay`

### fadeOut() Replacement Pattern

jQuery's `fadeOut()` method was replaced with CSS transitions and setTimeout:

```javascript
// Before (jQuery):
overlay.fadeOut(1000, () => {
    overlay.remove();
});

// After (Native DOM):
overlay.style.transition = 'opacity 1s';
overlay.style.opacity = '0';
setTimeout(() => {
    if (overlay.parentNode) {
        overlay.remove();
    }
}, 1000);
```

**Files Updated:**
- `manager-rolls.js` - Cinematic overlay fade-out (3 instances)
- `timer-planning.js` - Planning phase fade-out (6 instances)

### Tool Lookup Improvements

Enhanced tool item lookup in `manager-rolls.js` to handle multiple lookup methods:
1. By ID: `actor.items.get(value)`
2. By baseItem: `actor.items.find(i => i.system.baseItem === value)`
3. By name: Case-insensitive name matching
4. Fallback: Use first available tool if exact match not found

### Combat Tracker UI Fixes

Multiple fixes were required to restore full combat tracker functionality in v13:

#### Health Ring Alignment ✅ **FIXED**
**Issue:** Health rings were not aligning correctly over token/portrait images in the combat tracker.

**Root Cause:** CSS positioning and insertion order issues after v13 migration.

**Solution:**
- Updated CSS for `.health-ring-container` to `top: 0; left: 0; width: 48px; height: 48px;`
- Updated CSS for `.health-ring-container svg` to `top: 12px; left: 12px;`
- Changed insertion logic to insert the `health-ring-container` right before the `token-image` element instead of as the first child of the combatant

**Files Updated:**
- `scripts/combat-tools.js` - Health ring insertion logic
- `styles/combat-tools.css` - Health ring positioning CSS

#### Roll Remaining Button ✅ **FIXED**
**Issue:** The "Roll Remaining" button was not appearing in the combat tracker.

**Root Cause:** 
- jQuery removal: button creation and insertion needed native DOM methods
- Button was being removed by Foundry's re-rendering, especially when Planning Timer called `ui.combat.render(true)`
- Selector needed to target v13 structure (`data-action="rollNPC"` instead of `data-control="rollNPC"`)

**Solution:**
- Updated button creation to use native DOM (`document.createElement('button')`)
- Changed button structure to match v13: `<button>` with classes `inline-control combat-control icon fa-solid fa-users-medical` and `data-action="rollRemaining"`
- Added jQuery detection for `html` parameter in `renderCombatTracker` callback
- Improved insertion logic with multiple search roots (`app.element`, `html`, `ui.combat.element`)
- Simplified cleanup: remove any existing buttons in current render, then insert new one
- Increased hook priority to 5 to run after planning timer's hook (priority 3)
- Fixed event listener removal to use `removeEventListener` instead of jQuery's `.off()`

**Files Updated:**
- `scripts/combat-tracker.js` - Roll Remaining button insertion and event handling

#### Planning Timer ✅ **FIXED**
**Issues:**
1. Planning timer was not visible
2. Timer bars were not clickable
3. Timer showed "0s Planning" even when active
4. Timer did not gracefully disappear after planning ended
5. Timer was calling `ui.combat.render(true)` too many times
6. Timer was appearing before initiatives were rolled

**Root Cause:**
- jQuery removal: DOM queries and event handlers needed native methods
- CSS visibility issues with `.combatant.planning-phase` class
- State initialization issues when timer should be active but `remaining` was 0
- No initiative check before showing timer

**Solution:**
- Changed HTML structure from `<li class="combatant planning-phase">` to `<li class="planning-timer-item">` to avoid conflicting `.combatant` styles
- Updated CSS to force visibility with `display: block !important`, `visibility: visible !important`, `opacity: 1 !important`
- Added state initialization check: if `remaining` is 0 but timer should be active, initialize from `duration`
- Added initiative check in `verifyTimerConditions()`: timer only shows if all combatants have rolled initiative
- Reduced unnecessary `ui.combat.render(true)` calls - only called if timer actually started
- Enhanced fade-out to work in both sidebar and popout windows
- Updated all selectors from `.planning-phase` to `.planning-timer-item`
- Fixed setting access to use `getSettingSafely` to prevent "not a registered game setting" errors

**Files Updated:**
- `scripts/timer-planning.js` - Timer visibility, clickability, state management, and initiative checks
- `styles/timer-planning.css` - Visibility CSS fixes
- `templates/timer-planning.hbs` - HTML structure change

#### Combat Timer ✅ **FIXED**
**Issues:**
1. Combat timer was not showing in the popped-out combat window
2. Combat timer was not clickable
3. Combat timer was showing before all initiatives were rolled

**Root Cause:**
- Selector issues: using `#combat-tracker` instead of `.combat-tracker` for v13
- `updateUI()` was only checking sidebar, not popout window
- No initiative check before showing timer

**Solution:**
- Updated `updateUI()` to find timer elements in both sidebar and popout windows
- Fixed selector from `#combat-tracker` to `.combat-tracker` for v13
- Added initiative check in `_onRenderCombatTracker` to prevent timer from showing until all combatants have rolled initiative

**Files Updated:**
- `scripts/timer-combat.js` - Timer visibility in popout and initiative checks

#### Combat Tracker Resize Icon ✅ **VERIFIED**
**Issue:** The resize icon for the popped-out combat tracker was not showing up.

**Root Cause:** User error - setting was not enabled.

**Status:** Working correctly when setting is enabled.

**Files Updated:**
- `scripts/combat-tools.js` - Resize icon application logic (already working)

#### XP Distribution Window ✅ **FIXED**
**Issues:**
1. `html.querySelector is not a function` in `XpDistributionWindow.activateListeners`
2. `this.element.querySelector is not a function` in `_updateXpDataPlayers` and other methods

**Root Cause:** jQuery removal - `html` and `this.element` parameters may still be jQuery objects in some contexts.

**Solution:**
- Added jQuery detection and conversion in `activateListeners()`, `_updateXpDisplay()`, `_getIncludedPlayerCount()`, `_updateXpDataPlayers()`, `_onModeToggleChange()`, and `_collectMilestoneData()`
- Ensured all DOM queries use native methods after conversion

**Files Updated:**
- `scripts/xp-manager.js` - jQuery detection for all DOM queries

#### Combat End Popout Close ✅ **FIXED**
**Issue:** The popped-out combat window was not closing when combat ended.

**Root Cause:** The `endCombat` hook callback was not properly finding and closing the popout window.

**Solution:**
- Made the `endCombat` hook callback `async` and `await` `CombatTracker.closeCombatTracker()`
- Enhanced `closeCombatTracker()` to check multiple ways to find and close the popout:
  - `ui.combat._popOut` (standard property)
  - `ui.combat._popout` (alternative spelling)
  - Direct DOM lookup for `#combat-popout` element and finding its Application instance
  - Fallback: Click the close button directly if Application instance not found
- Added proper error handling and delays for async operations

**Files Updated:**
- `scripts/combat-tracker.js` - Popout window closing logic

### Testing Status

**✅ Working:**
- Skill check rolls (window opens, rolls execute correctly)
- Cinematic overlay (displays and fades out correctly)
- Token image replacement window (opens and functions correctly)
- Roll window (opens, form updates, rolls execute)

**✅ Completed:**
- Token image replacement window (click and right-click events working)
- Skill check rolls
- Cinematic overlay fade-out
- XP distribution window (fully functional)
- All jQuery removal fixes verified
- Combat tracker UI fixes (health rings, roll remaining button, planning timer, combat timer)
- Combat tracker popout window closing on combat end

**🟡 In Progress:**
- End-to-end testing of all module features
- Verification of remaining functionality

---

## Notes

- Keep this document updated as issues are discovered and resolved
- Link to official FoundryVTT v13 migration documentation when available
- Include code examples for both v12 and v13 patterns
- When in doubt, check the v13 API reference instead of assuming v12 behavior
