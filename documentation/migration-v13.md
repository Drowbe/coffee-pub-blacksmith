# FoundryVTT v12 to v13 Migration Guide

## Overview

This document tracks the migration process from FoundryVTT v12 to v13, including API changes, breaking changes, and issues encountered during migration.

**Migration Status:**
- **Phase 1:** ✅ Complete - Critical fixes (0 errors)
- **Phase 1.5:** ✅ Complete - Deprecation warnings (0 warnings)
- **Phase 2:** ✅ Complete - jQuery removal and detection patterns implemented

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


## Migration Checklist

### Phase 3: ApplicationV2 Migration 🔵 **PLANNED**
- [ ] Identify all Application classes
- [ ] Plan migration strategy for each Application
- [ ] Migrate to ApplicationV2 framework
- [ ] Test all application windows and dialogs

---

## Migration Patterns

### jQuery Detection Pattern Implementation

During testing, we discovered that both `Application.activateListeners(html)` and `FormApplication.activateListeners(html)` may still receive jQuery objects in v13, requiring detection patterns. Additionally, the `renderChatMessage` hook requires special handling.

**Standard Pattern for activateListeners:**
```javascript
activateListeners(html) {
    super.activateListeners(html);
    
    // v13: Application/FormApplication.activateListeners may still receive jQuery
    // Convert to native DOM if needed
    let htmlElement = html;
    if (html && (html.jquery || typeof html.find === 'function')) {
        htmlElement = html[0] || html.get?.(0) || html;
    } else if (html && typeof html.querySelectorAll !== 'function') {
        // Not a valid DOM element
        return;
    }
    
    if (!htmlElement) {
        return;
    }
    
    // Now use htmlElement for all DOM operations
    const button = htmlElement.querySelector('.my-button');
    // ...
}
```

**Special Pattern for renderChatMessage Hook:**
```javascript
/**
 * Convert renderChatMessage html parameter to native DOM element
 * Handles jQuery objects, DocumentFragments, and HTMLElements
 */
function getChatMessageElement(html) {
    if (!html) return null;
    
    // If it's already a native DOM element with querySelectorAll, use it
    if (typeof html.querySelectorAll === 'function') {
        return html;
    }
    
    // If it's a jQuery object, extract the first element
    if (html.jquery || typeof html.find === 'function') {
        const element = html[0] || html.get?.(0);
        if (element && typeof element.querySelectorAll === 'function') {
            return element;
        }
    }
    
    // If it's a DocumentFragment, return it (has querySelectorAll)
    if (html instanceof DocumentFragment) {
        return html;
    }
    
    // If it's an array-like object, try first element
    if (html.length && html[0]) {
        const element = html[0];
        if (element && typeof element.querySelectorAll === 'function') {
            return element;
        }
    }
    
    // Last resort: try to use it directly if it has nodeType
    if (html.nodeType === Node.ELEMENT_NODE || html.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return html;
    }
    
    return null;
}

// Usage in renderChatMessage hook:
callback: (message, html, data) => {
    const htmlElement = getChatMessageElement(html);
    if (!htmlElement) return;
    // Use htmlElement for DOM operations
}
```

**Key Discovery:**
Both `Application.activateListeners(html)` and `FormApplication.activateListeners(html)` may still receive jQuery objects in v13, requiring detection patterns. The `renderChatMessage` hook also requires special handling via a helper function.

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

---

## Notes

- Keep this document updated as issues are discovered and resolved
- Link to official FoundryVTT v13 migration documentation when available
- Include code examples for both v12 and v13 patterns
- When in doubt, check the v13 API reference instead of assuming v12 behavior
