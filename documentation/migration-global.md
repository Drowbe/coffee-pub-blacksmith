# FoundryVTT v12 to v13 Global Migration Guide

> **For All Coffee Pub Modules**
> 
> This guide provides a comprehensive, reusable migration path for upgrading any Coffee Pub module from FoundryVTT v12 to v13. Use this as your primary reference during migration.

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Breaking Changes](#breaking-changes)
4. [Migration Patterns](#migration-patterns)
5. [Common Conversions](#common-conversions)
6. [Deprecation Fixes](#deprecation-fixes)
7. [Testing Checklist](#testing-checklist)
8. [Resources](#resources)

---

## Overview

### Key v13 Breaking Changes

FoundryVTT v13 introduces two major breaking changes that affect all modules:

1. **jQuery Removal** - jQuery has been completely removed from FoundryVTT
2. **`getSceneControlButtons` API Change** - Controls structure changed from array to object

### Migration Strategy

**Recommended Approach: v13-Only Migration**
- Clean break from v12 simplifies codebase
- No dual-compatibility code needed
- Faster migration timeline
- Easier maintenance going forward

**Alternative: Dual Compatibility**
- Only if you need to support both v12 and v13 simultaneously
- Adds complexity and maintenance burden
- Not recommended for new development

---

## Pre-Migration Checklist

Before starting migration, complete these steps:

### 1. Lock Down v12 Release
- [ ] Finalize and test current v12 version
- [ ] Create git tag: `v12.X.X-FINAL`
- [ ] Create GitHub release marking as final v12 version
- [ ] Update README with v12 support end notice
- [ ] Update CHANGELOG with final v12 release entry

### 2. Update Module Configuration
- [ ] Update `module.json` minimum Core Version to `"13.0.0"`
- [ ] Update module version to `13.0.0` (or appropriate v13 starting version)
- [ ] Review and update compatibility notes

### 3. Prepare Development Environment
- [ ] Set up FoundryVTT v13 testing environment
- [ ] Create feature branch (optional): `v13-migration` or `v13-dev`
- [ ] Document current functionality baseline

### 4. Audit Current Codebase
- [ ] Search for jQuery usage: `html.find`, `$()`, `.each()`, `.append()`, etc.
- [ ] Search for `getSceneControlButtons` hook implementations
- [ ] Search for deprecated APIs: `Token#target`, `FilePicker`, etc.
- [ ] Document all Application classes that extend `Application` or `FormApplication`

---

## Breaking Changes

### 1. jQuery Removal

**Impact:** All hooks that receive `html` parameter now receive native DOM elements instead of jQuery objects.

**Affected Hooks:**
- `renderCombatTracker`
- `renderSceneNavigation`
- `renderSceneDirectory`
- `renderApplication` (for custom applications)
- `renderSettings`
- `renderJournalSheet`
- `renderActorSheet`
- `renderItemSheet`
- Any hook that receives `html` as a parameter

**v12 Behavior:**
```javascript
Hooks.on('renderCombatTracker', (app, html, data) => {
    // html is a jQuery object
    const elements = html.find('.combatant');
    elements.each((i, el) => {
        const $el = $(el);
        // jQuery methods available
    });
    html.append('<div>New content</div>');
});
```

**v13 Behavior:**
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

### 2. `getSceneControlButtons` Hook API Change

**Impact:** The `controls` parameter changed from an array to an object keyed by control name.

**v12 Behavior:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // controls is an Array
    const tokenControl = controls.find(c => c.name === "token");
    const index = controls.findIndex(c => c.name === "my-control");
    controls.push({ name: "my-control", tools: [...] });
    controls.splice(index, 1);
    
    // tools are arrays
    tokenControl.tools.push({ name: "myTool", ... });
});
```

**v13 Behavior:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // controls is an object: Record<string, SceneControl>
    const tokenControl = controls.tokens; // Direct property access
    
    // Delete control
    if (controls['my-control']) {
        delete controls['my-control'];
    }
    
    // Add control
    controls['my-control'] = {
        name: "my-control",
        tools: {...} // tools is also an object
    };
    
    // tools are objects keyed by tool name
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

---

## Migration Patterns

### Pattern 1: jQuery Selector Replacement

**Find jQuery Selectors:**
```bash
# Search for common jQuery patterns
grep -r "html\.find" scripts/
grep -r "\$(" scripts/
grep -r "\.each(" scripts/
```

**v12 Pattern:**
```javascript
const elements = html.find('.my-class');
const element = html.find('.my-class').first();
const $element = $(someElement);
```

**v13 Pattern:**
```javascript
const elements = html.querySelectorAll('.my-class');
const element = html.querySelector('.my-class');
const element = someElement; // Already a DOM element
```

### Pattern 2: jQuery Iteration Replacement

**v12 Pattern:**
```javascript
html.find('.combatant').each((i, el) => {
    const $el = $(el);
    // Process element
});
```

**v13 Pattern:**
```javascript
html.querySelectorAll('.combatant').forEach((el, i) => {
    // el is already a DOM element
    // Process element
});
```

### Pattern 3: DOM Manipulation Replacement

**v12 Pattern:**
```javascript
html.append('<div>Content</div>');
html.before('<div>Content</div>');
html.after('<div>Content</div>');
element.remove();
```

**v13 Pattern:**
```javascript
// Option 1: Create element and append
const div = document.createElement('div');
div.textContent = 'Content';
html.appendChild(div);

// Option 2: Use insertAdjacentHTML (for HTML strings)
html.insertAdjacentHTML('beforeend', '<div>Content</div>');
html.insertAdjacentHTML('beforebegin', '<div>Content</div>');
html.insertAdjacentHTML('afterend', '<div>Content</div>');

// Remove (same API)
element.remove();
```

### Pattern 4: Length Checks

**v12 Pattern:**
```javascript
const elements = html.find('.my-class');
if (elements.length) {
    // Process elements
}
```

**v13 Pattern:**
```javascript
const elements = html.querySelectorAll('.my-class');
if (elements.length) {
    // Process elements (same syntax)
}
```

### Pattern 5: Event Handler Replacement

**v12 Pattern:**
```javascript
html.find('.button').on('click', (event) => {
    // Handle click
});

html.find('.button').off('click');
```

**v13 Pattern:**
```javascript
html.querySelectorAll('.button').forEach(button => {
    button.addEventListener('click', (event) => {
        // Handle click
    });
});

// Remove listeners (store reference)
const handler = (event) => { /* ... */ };
button.addEventListener('click', handler);
button.removeEventListener('click', handler);
```

### Pattern 6: Closest/Parent Traversal

**v12 Pattern:**
```javascript
const parent = $(element).closest('.parent-class');
const parent = $(element).parent();
```

**v13 Pattern:**
```javascript
const parent = element.closest('.parent-class');
const parent = element.parentElement;
```

### Pattern 7: Attribute Manipulation

**v12 Pattern:**
```javascript
$(element).attr('data-id', '123');
const id = $(element).attr('data-id');
$(element).addClass('active');
$(element).removeClass('active');
$(element).toggleClass('active');
```

**v13 Pattern:**
```javascript
element.setAttribute('data-id', '123');
const id = element.getAttribute('data-id');
element.classList.add('active');
element.classList.remove('active');
element.classList.toggle('active');
```

### Pattern 8: Text/HTML Content

**v12 Pattern:**
```javascript
$(element).text('New text');
$(element).html('<div>HTML</div>');
const text = $(element).text();
const html = $(element).html();
```

**v13 Pattern:**
```javascript
element.textContent = 'New text';
element.innerHTML = '<div>HTML</div>';
const text = element.textContent;
const html = element.innerHTML;
```

### Pattern 9: SVG ClassName Bug Fix

**Issue:** SVG elements don't support `className` property directly in some contexts.

**v12 Pattern:**
```javascript
svgElement.className = 'my-class';
```

**v13 Pattern:**
```javascript
svgElement.setAttribute('class', 'my-class');
// Or use classList if available
if (svgElement.classList) {
    svgElement.classList.add('my-class');
} else {
    svgElement.setAttribute('class', 'my-class');
}
```

---

## Common Conversions

### Quick Reference Table

| jQuery (v12) | Native DOM (v13) |
|--------------|------------------|
| `html.find(selector)` | `html.querySelectorAll(selector)` or `html.querySelector(selector)` |
| `html.find(selector).first()` | `html.querySelector(selector)` |
| `.each((i, el) => {...})` | `.forEach((el, i) => {...})` |
| `.append(content)` | `.appendChild(element)` or `.insertAdjacentHTML('beforeend', content)` |
| `.before(content)` | `.insertAdjacentElement('beforebegin', element)` or `.insertAdjacentHTML('beforebegin', content)` |
| `.after(content)` | `.insertAdjacentElement('afterend', element)` or `.insertAdjacentHTML('afterend', content)` |
| `.remove()` | `.remove()` (same) |
| `.length` | `.length` (same for NodeList) |
| `$(element)` | `element` (already DOM element) |
| `.closest(selector)` | `.closest(selector)` (same) |
| `.parent()` | `.parentElement` |
| `.attr(name, value)` | `.setAttribute(name, value)` |
| `.attr(name)` | `.getAttribute(name)` |
| `.addClass(name)` | `.classList.add(name)` |
| `.removeClass(name)` | `.classList.remove(name)` |
| `.toggleClass(name)` | `.classList.toggle(name)` |
| `.text()` | `.textContent` |
| `.html()` | `.innerHTML` |
| `.on(event, handler)` | `.addEventListener(event, handler)` |
| `.off(event, handler)` | `.removeEventListener(event, handler)` |
| `.val()` | `.value` |
| `.prop(name, value)` | `.name = value` (for properties) or `.setAttribute(name, value)` (for attributes) |

### Scene Controls Conversion

**v12 Pattern:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // Find control
    const myControl = controls.find(c => c.name === "my-control");
    
    // Remove control
    const index = controls.findIndex(c => c.name === "my-control");
    if (index !== -1) {
        controls.splice(index, 1);
    }
    
    // Add control
    controls.push({
        name: "my-control",
        title: "My Control",
        icon: "fa-solid fa-wrench",
        layer: "my-layer",
        tools: [
            { name: "tool1", icon: "...", onClick: () => {} },
            { name: "tool2", icon: "...", onClick: () => {} }
        ]
    });
    
    // Add tool to existing control
    if (myControl) {
        myControl.tools.push({
            name: "newTool",
            icon: "...",
            onClick: () => {}
        });
    }
});
```

**v13 Pattern:**
```javascript
Hooks.on('getSceneControlButtons', (controls) => {
    // Access control directly
    const myControl = controls['my-control'];
    
    // Remove control
    if (controls['my-control']) {
        delete controls['my-control'];
    }
    
    // Add control
    controls['my-control'] = {
        name: "my-control",
        title: "My Control",
        icon: "fa-solid fa-wrench",
        layer: "my-layer",
        tools: {
            tool1: {
                name: "tool1",
                title: "Tool 1",
                icon: "...",
                order: 0,
                button: true,
                visible: true,
                onClick: () => {}
            },
            tool2: {
                name: "tool2",
                title: "Tool 2",
                icon: "...",
                order: 1,
                button: true,
                visible: true,
                onClick: () => {}
            }
        }
    };
    
    // Add tool to existing control
    const tokenControl = controls.tokens;
    if (tokenControl) {
        const toolCount = Object.keys(tokenControl.tools).length;
        tokenControl.tools.newTool = {
            name: "newTool",
            title: "New Tool",
            icon: "...",
            order: toolCount,
            button: true,
            visible: game.user.isGM,
            onClick: () => {}
        };
    }
});
```

---

## Deprecation Fixes

### 1. Token#target Deprecation

**Deprecated:** `token.target`  
**Replacement:** `token.targetArrows` and `token.targetPips`  
**Urgency:** High (removed in v14)

**v12 Pattern:**
```javascript
token.target = true;
token.target = false;
if (token.target) {
    // Check if targeted
}
```

**v13 Pattern:**
```javascript
// Set targeting
token.targetArrows = true;
token.targetPips = true;

// Clear targeting
token.targetArrows = false;
token.targetPips = false;

// Check if targeted
if (token.targetArrows || token.targetPips) {
    // Token is targeted
}
```

### 2. FilePicker Deprecation

**Deprecated:** Global `FilePicker`  
**Replacement:** `foundry.applications.apps.FilePicker.implementation`  
**Urgency:** Medium (removed in v15)

**v12 Pattern:**
```javascript
FilePicker.browse({
    type: "image",
    current: currentPath,
    callback: (path) => {
        // Handle path
    }
});
```

**v13 Pattern:**
```javascript
// Option 1: Direct access
foundry.applications.apps.FilePicker.implementation.browse({
    type: "image",
    current: currentPath,
    callback: (path) => {
        // Handle path
    }
});

// Option 2: Create helper (recommended)
static get FilePicker() {
    return foundry.applications.apps.FilePicker.implementation;
}

// Then use:
MyClass.FilePicker.browse({
    type: "image",
    current: currentPath,
    callback: (path) => {
        // Handle path
    }
});
```

---

## Testing Checklist

### Phase 1: Critical Path Testing

After fixing breaking changes, test:

- [ ] Module loads without console errors
- [ ] Scene controls render correctly
- [ ] All hooks that receive `html` parameter work correctly
- [ ] Combat tracker renders (if applicable)
- [ ] Scene navigation works (if applicable)
- [ ] No deprecation warnings in console

### Phase 2: Functionality Testing

- [ ] All UI interactions work correctly
- [ ] Event handlers fire correctly
- [ ] DOM manipulation works as expected
- [ ] Forms submit correctly (if applicable)
- [ ] Dialogs open and close correctly
- [ ] Settings panels work (if applicable)

### Phase 3: Integration Testing

- [ ] Test with other v13-compatible modules
- [ ] Test with popular module combinations
- [ ] Verify no conflicts with other modules
- [ ] Test performance (no regressions)

### Phase 4: Edge Cases

- [ ] Test with empty data
- [ ] Test with large datasets
- [ ] Test error handling
- [ ] Test with different user permissions (GM vs Player)
- [ ] Test with different system versions (if applicable)

---

## Resources

### Official Documentation

- **[API Migration Guides](https://foundryvtt.com/article/migration/)** - Canonical starting point for "what changed and why"
- **[v13 API Reference](https://foundryvtt.com/api/)** - Source of truth for new types, signatures, and class changes
- **[v13 Release Notes](https://foundryvtt.com/releases/13.341)** - Breaking changes, new APIs, and deprecations
- **[ApplicationV2 API](https://foundryvtt.wiki/en/development/api/applicationv2)** - New application framework
- **[ApplicationV2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)** - Step-by-step conversion guide
- **[Canvas API Documentation](https://foundryvtt.wiki/en/development/api/canvas)** - Scene controls and canvas changes

### Community Support

- **Foundry Discord** `#dev-support` channel
- **Foundry Community Wiki**

### Migration Tools

**Search for jQuery Usage:**
```bash
# Find jQuery selectors
grep -r "html\.find" scripts/
grep -r "\$(" scripts/

# Find jQuery methods
grep -r "\.each(" scripts/
grep -r "\.append(" scripts/
grep -r "\.before(" scripts/
grep -r "\.after(" scripts/
grep -r "\.on(" scripts/
grep -r "\.off(" scripts/
```

**Search for Scene Controls:**
```bash
grep -r "getSceneControlButtons" scripts/
```

**Search for Deprecations:**
```bash
grep -r "\.target\s*=" scripts/
grep -r "FilePicker\." scripts/
```

---

## Migration Workflow

### Step 1: Audit
1. Search for all jQuery usage
2. Search for `getSceneControlButtons` hooks
3. Search for deprecated APIs
4. Document all findings

### Step 2: Prioritize
1. Fix breaking changes first (jQuery in hooks, `getSceneControlButtons`)
2. Fix deprecation warnings
3. Remove remaining jQuery usage
4. Migrate to ApplicationV2 (optional, can be done later)

### Step 3: Migrate
1. Work file by file
2. Test after each file
3. Commit frequently
4. Document any issues encountered

### Step 4: Test
1. Run through testing checklist
2. Test with other modules
3. Fix any issues found
4. Document test results

### Step 5: Release
1. Update version number
2. Update CHANGELOG
3. Create release notes
4. Tag and release

---

## Common Pitfalls

### 1. Forgetting to Update Length Checks
**Issue:** `querySelectorAll` returns NodeList, not array, but `.length` still works.

**Solution:** No change needed - `.length` works on NodeLists.

### 2. SVG className Property
**Issue:** SVG elements may not support `className` property directly.

**Solution:** Use `setAttribute('class', ...)` or check for `classList` support.

### 3. Event Handler Cleanup
**Issue:** Need to store references to remove event listeners.

**Solution:** Store handler function reference for `removeEventListener`.

### 4. Tools Order in Scene Controls
**Issue:** Tools need `order` property in v13.

**Solution:** Set `order: Object.keys(control.tools).length` when adding tools.

### 5. Tools Visibility
**Issue:** Tools need explicit `visible` property.

**Solution:** Set `visible: true` or conditional visibility based on permissions.

---

## Best Practices

1. **Test Frequently** - Test after each file migration
2. **Commit Often** - Small, focused commits make rollback easier
3. **Document Issues** - Keep notes on any problems encountered
4. **Use Native DOM** - Prefer native methods over jQuery patterns
5. **Check Console** - Always check for errors and warnings
6. **Verify Functionality** - Don't just fix errors, verify features work

---

## Quick Start Template

For a new file migration:

```javascript
// BEFORE (v12)
Hooks.on('renderCombatTracker', (app, html, data) => {
    const elements = html.find('.combatant');
    elements.each((i, el) => {
        const $el = $(el);
        $el.addClass('custom-class');
    });
    html.append('<div>New content</div>');
});

// AFTER (v13)
Hooks.on('renderCombatTracker', (app, html, data) => {
    const elements = html.querySelectorAll('.combatant');
    elements.forEach((el) => {
        el.classList.add('custom-class');
    });
    const div = document.createElement('div');
    div.textContent = 'New content';
    html.appendChild(div);
});
```

---

## Support

For questions or issues during migration:

1. Check this guide first
2. Review official FoundryVTT documentation
3. Search Foundry Discord `#dev-support`
4. Review existing Coffee Pub module migrations for examples

---

**Last Updated:** 2025-01-XX  
**Version:** 1.0  
**Maintained By:** Coffee Pub Development Team

