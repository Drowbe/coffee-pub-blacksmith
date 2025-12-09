# Implementation Plan: Hybrid Secondary Bar System

## Overview

This plan outlines the implementation of a hybrid secondary bar system that supports:
1. **Tool/Item Registration** (default) - Simple, timing-safe approach for toolbars like Cartographer
2. **Custom Templates** (optional) - Complex toolbars like the combat bar with custom layouts

## Goals

- ✅ Maintain backward compatibility with existing combat bar
- ✅ Provide timing-safe tool registration for simple toolbars
- ✅ Allow multiple modules to contribute to the same secondary bar
- ✅ Automatic UI spacing adjustment via CSS variables
- ✅ Tab-like behavior (only one secondary bar open at a time)

---

## Architecture

### 1. Registration System

#### Secondary Bar Type Registration
Modules register a secondary bar type with configuration:

```javascript
blacksmith.registerSecondaryBarType('cartographer', {
    height: 60,
    persistence: 'manual',
    autoCloseDelay: 10000,
    templatePath: null  // null = use default tool system, path = use custom template
});
```

#### Tool/Item Registration (Default System)
For simple toolbars, modules register individual tools/items:

```javascript
blacksmith.registerSecondaryBarItem('cartographer', 'pencil-tool', {
    icon: 'fa-solid fa-pencil',
    name: 'pencil-tool',
    title: 'Pencil Tool',
    order: 10,
    moduleId: 'coffee-pub-cartographer',
    onClick: () => { ... }
});
```

### 2. Rendering Logic

**Decision Tree:**
1. Check if `templatePath` is provided
   - **Yes**: Load custom template, render with `secondaryBar.data`
   - **No**: Use default template, collect all registered items, render them

**Main Template Update:**
```handlebars
{{#if secondaryBar.isOpen}}
<div class="blacksmith-menubar-secondary" 
     data-bar-type="{{secondaryBar.type}}"
     style="height: {{secondaryBar.height}}px;">
    {{#if secondaryBar.hasCustomTemplate}}
        {{> (concat "menubar-" secondaryBar.type) secondaryBar.data}}
    {{else}}
        {{> "menubar-secondary-default" secondaryBar.data}}
    {{/if}}
</div>
{{/if}}
```

### 3. Default Template Structure

Create `templates/partials/menubar-secondary-default.hbs`:

```handlebars
<div class="secondary-bar-toolbar">
    <div class="secondary-bar-tools">
        {{#each items}}
        <div class="secondary-bar-tool {{name}}" 
             data-tool="{{name}}"
             data-tooltip="{{title}}"
             title="{{title}}">
            <i class="{{icon}}"></i>
            <span class="tool-label">{{title}}</span>
        </div>
        {{/each}}
    </div>
</div>
```

---

## Implementation Steps

### Phase 1: Data Structures

#### Update `barType` Structure
**File**: `scripts/api-menubar.js`

```javascript
const barType = {
    typeId: typeId,
    height: config.height || 50,
    persistence: config.persistence || 'manual',
    autoCloseDelay: config.autoCloseDelay || 10000,
    templatePath: config.templatePath || null,  // NEW
    hasCustomTemplate: !!config.templatePath,   // NEW
    items: new Map()  // NEW - stores registered items for default system
};
```

#### Add Items Storage
**File**: `scripts/api-menubar.js`

```javascript
static secondaryBarItems = new Map();  // Map<typeId, Map<itemId, itemData>>
```

### Phase 2: API Methods

#### Update `registerSecondaryBarType`
**File**: `scripts/api-menubar.js`

**Changes:**
1. Accept `templatePath` in config
2. Store `hasCustomTemplate` flag
3. Initialize items Map for default system
4. If `templatePath` provided:
   - Fetch template content
   - Register as Handlebars partial: `menubar-{typeId}`
   - Handle errors gracefully

```javascript
static async registerSecondaryBarType(typeId, config) {
    // ... existing validation ...
    
    const barType = {
        typeId: typeId,
        height: config.height || 50,
        persistence: config.persistence || 'manual',
        autoCloseDelay: config.autoCloseDelay || 10000,
        templatePath: config.templatePath || null,
        hasCustomTemplate: !!config.templatePath,
        items: new Map()
    };
    
    // If custom template, load and register it
    if (config.templatePath) {
        try {
            const templateContent = await fetch(config.templatePath).then(r => r.text());
            const partialName = `menubar-${typeId}`;
            Handlebars.registerPartial(partialName, templateContent);
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Custom template registered", { typeId, partialName }, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Failed to load template", { typeId, error }, false, true);
            return false;
        }
    }
    
    this.secondaryBarTypes.set(typeId, barType);
    // Initialize items storage for this bar type
    if (!this.secondaryBarItems.has(typeId)) {
        this.secondaryBarItems.set(typeId, new Map());
    }
    
    return true;
}
```

#### Add `registerSecondaryBarItem`
**File**: `scripts/api-menubar.js`

**New Method:**
- Register item to a bar type
- Validate bar type exists
- Store in `secondaryBarItems`
- If bar is currently open, re-render

```javascript
static registerSecondaryBarItem(barTypeId, itemId, itemData) {
    try {
        // Validate bar type exists
        const barType = this.secondaryBarTypes.get(barTypeId);
        if (!barType) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Bar type not registered", { barTypeId }, false, false);
            return false;
        }
        
        // Validate item data
        if (!itemId || !itemData || !itemData.icon || !itemData.onClick) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Invalid item data", { itemId }, false, false);
            return false;
        }
        
        // Store item
        const items = this.secondaryBarItems.get(barTypeId);
        items.set(itemId, {
            ...itemData,
            itemId: itemId,
            barTypeId: barTypeId
        });
        
        // If bar is currently open, re-render
        if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
            this.renderMenubar(true);
        }
        
        postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Item registered", { barTypeId, itemId }, true, false);
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error registering item", { barTypeId, itemId, error }, false, false);
        return false;
    }
}
```

#### Add `unregisterSecondaryBarItem`
**File**: `scripts/api-menubar.js`

```javascript
static unregisterSecondaryBarItem(barTypeId, itemId) {
    const items = this.secondaryBarItems.get(barTypeId);
    if (items) {
        items.delete(itemId);
        // Re-render if bar is open
        if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
            this.renderMenubar(true);
        }
        return true;
    }
    return false;
}
```

### Phase 3: Template Data Preparation

#### Update `openSecondaryBar` / Render Logic
**File**: `scripts/api-menubar.js`

**In `renderMenubar()` or template data preparation:**

```javascript
static async _prepareSecondaryBarData() {
    if (!this.secondaryBar.isOpen) return null;
    
    const barType = this.secondaryBarTypes.get(this.secondaryBar.type);
    if (!barType) return null;
    
    if (barType.hasCustomTemplate) {
        // Custom template - use existing data preparation
        // For combat bar, call getCombatData()
        if (this.secondaryBar.type === 'combat') {
            return {
                ...this.secondaryBar.data,
                hasCustomTemplate: true
            };
        }
        // For other custom templates, use secondaryBar.data as-is
        return {
            ...this.secondaryBar.data,
            hasCustomTemplate: true
        };
    } else {
        // Default template - collect all registered items
        const items = this.secondaryBarItems.get(this.secondaryBar.type) || new Map();
        const sortedItems = Array.from(items.values())
            .filter(item => {
                // Apply visibility logic (similar to main menubar)
                if (item.gmOnly && !game.user.isGM) return false;
                if (item.leaderOnly && !this._isPartyLeader(game.user)) return false;
                if (typeof item.visible === 'function') {
                    return item.visible();
                }
                return item.visible !== false;
            })
            .sort((a, b) => (a.order || 999) - (b.order || 999));
        
        return {
            items: sortedItems,
            hasCustomTemplate: false
        };
    }
}
```

### Phase 4: Template Updates

#### Update Main Menubar Template
**File**: `templates/menubar.hbs`

**Change:**
```handlebars
{{!-- SECONDARY BAR --}}
{{#if secondaryBar.isOpen}}
<div class="blacksmith-menubar-secondary" 
     data-bar-type="{{secondaryBar.type}}"
     style="height: {{secondaryBar.height}}px;">
    {{#if secondaryBar.hasCustomTemplate}}
        {{> (concat "menubar-" secondaryBar.type) secondaryBar.data}}
    {{else}}
        {{> "menubar-secondary-default" secondaryBar.data}}
    {{/if}}
</div>
{{/if}}
```

#### Create Default Secondary Bar Template
**File**: `templates/partials/menubar-secondary-default.hbs`

```handlebars
{{!-- Default Secondary Bar Template for Tool-Based Bars --}}
<div class="secondary-bar-toolbar default">
    <div class="secondary-bar-tools">
        {{#each items}}
        <div class="secondary-bar-tool {{name}}" 
             data-tool="{{name}}"
             data-bar-type="{{barTypeId}}"
             data-tooltip="{{title}}"
             title="{{title}}">
            <i class="{{icon}}"></i>
            {{#if showLabel}}
            <span class="tool-label">{{title}}</span>
            {{/if}}
        </div>
        {{/each}}
    </div>
</div>
```

### Phase 5: Event Handling

#### Update Click Handler
**File**: `scripts/api-menubar.js`

**In `addClickHandlers()`:**

```javascript
// Handle secondary bar tool clicks (default template)
const secondaryBarTool = event.target.closest('.secondary-bar-tool');
if (secondaryBarTool) {
    const itemId = secondaryBarTool.getAttribute('data-tool');
    const barTypeId = secondaryBarTool.getAttribute('data-bar-type');
    
    if (itemId && barTypeId) {
        const items = this.secondaryBarItems.get(barTypeId);
        const item = items?.get(itemId);
        
        if (item && item.onClick) {
            event.preventDefault();
            event.stopPropagation();
            try {
                item.onClick(event);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error in item onClick", { barTypeId, itemId, error }, false, false);
            }
        }
    }
}

// Existing combat bar click handling remains unchanged
// (handles .combatbar-button, .combat-portrait-container, etc.)
```

### Phase 6: CSS Styling

#### Add Default Secondary Bar Styles
**File**: `styles/menubar.css`

```css
/* Default Secondary Bar Toolbar */
.secondary-bar-toolbar.default {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    gap: 8px;
}

.secondary-bar-tools {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
}

.secondary-bar-tool {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.secondary-bar-tool:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.secondary-bar-tool i {
    font-size: 1.2em;
}

.secondary-bar-tool .tool-label {
    font-size: 0.9em;
}
```

### Phase 7: API Exposure

#### Update Blacksmith API
**File**: `scripts/blacksmith.js`

```javascript
// In the API exposure section:
module.api.registerSecondaryBarItem = MenuBar.registerSecondaryBarItem.bind(MenuBar);
module.api.unregisterSecondaryBarItem = MenuBar.unregisterSecondaryBarItem.bind(MenuBar);
module.api.getSecondaryBarItems = (barTypeId) => {
    const items = MenuBar.secondaryBarItems.get(barTypeId);
    return items ? Array.from(items.values()) : [];
};
```

---

## UI Spacing System

### Current Implementation (Already Works)
- CSS variable: `--blacksmith-menubar-secondary-height` (set when bar opens)
- CSS variable: `--blacksmith-menubar-total-height` (primary + secondary)
- CSS variable: `--blacksmith-menubar-interface-offset` (total + 2px)
- `#interface { margin-top: var(--blacksmith-menubar-interface-offset) }`

### Verification Needed
- Ensure height is set correctly for all bar types
- Verify CSS variables update when switching between bars
- Test with different bar heights

### Per-Bar-Type Height Variables (Optional Enhancement)
Currently uses a single `--blacksmith-menubar-secondary-height`. We could add per-type variables:

```css
:root {
    --blacksmith-menubar-secondary-cartographer-height: 60px;
    --blacksmith-menubar-secondary-combat-height: 60px;
}
```

But the current single variable approach should work fine since only one bar is open at a time.

---

## Timing & Coordination

### Problem
- Module A registers bar type
- Module B wants to add items to Module A's bar
- Race condition: Module B's `ready` hook might fire before Module A's template/bar type is registered

### Solution
**Deferred Registration Pattern:**

```javascript
// Module B can register items anytime
blacksmith.registerSecondaryBarItem('cartographer', 'my-tool', {
    icon: 'fa-star',
    onClick: () => { ... }
});

// If bar type doesn't exist yet, store in pending queue
// When bar type is registered, apply pending items
```

**Implementation:**
- Add `pendingItems` Map: `Map<barTypeId, Map<itemId, itemData>>`
- In `registerSecondaryBarItem`: If bar type doesn't exist, store in pending
- In `registerSecondaryBarType`: Check for pending items and apply them

---

## Testing Checklist

### Combat Bar (Backward Compatibility)
- [ ] Combat bar still opens/closes correctly
- [ ] Combat bar renders with custom template
- [ ] Combat bar click handlers work (next turn, previous round, etc.)
- [ ] Combat bar updates when combat changes
- [ ] UI spacing adjusts correctly

### Default Tool System (Cartographer)
- [ ] Register bar type without templatePath
- [ ] Register multiple items from different modules
- [ ] Items appear in correct order
- [ ] Click handlers work
- [ ] Visibility logic works (gmOnly, leaderOnly)
- [ ] Items can be registered before bar type exists (pending queue)
- [ ] UI spacing adjusts correctly

### Tab Switching
- [ ] Open combat bar, then open cartographer bar → combat bar closes
- [ ] Open cartographer bar, then open combat bar → cartographer bar closes
- [ ] UI spacing updates correctly when switching
- [ ] No visual glitches during switch

### Multiple Modules Contributing
- [ ] Module A registers bar type
- [ ] Module B registers items to Module A's bar
- [ ] Both modules' items appear correctly
- [ ] No timing issues

---

## API Documentation Updates

### New Methods to Document
1. `registerSecondaryBarType` - Updated to accept `templatePath`
2. `registerSecondaryBarItem` - New method
3. `unregisterSecondaryBarItem` - New method
4. `getSecondaryBarItems` - New method

### Usage Examples
- Simple toolbar (Cartographer)
- Complex toolbar (Combat - existing)
- Multiple modules contributing to same bar
- Tool ordering and visibility

---

## Migration Notes

### For Existing Code
- **Combat bar**: No changes needed, continues using custom template
- **New modules**: Can use either approach (tool registration or custom template)

### Breaking Changes
- None - fully backward compatible

---

## Future Enhancements (Out of Scope)

- Custom template hooks (allow modules to modify templates)
- Nested toolbars
- Toolbar presets/profiles
- Drag-and-drop tool ordering
- Toolbar animations/transitions

