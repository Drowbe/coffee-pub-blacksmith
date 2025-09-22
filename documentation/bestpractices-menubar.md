# **Blacksmith Development Best Practices**

> **For Blacksmith Developers Only**
> 
> This document covers best practices and patterns learned during development, particularly from the menubar system implementation.

## **🎯 Key Learnings from Menubar Implementation**

### **1. Dialog Method Calls**
**❌ Wrong:**
```javascript
VoteConfig.show();
SkillCheckDialog.show();
MovementConfig.show();
```

**✅ Correct:**
```javascript
new VoteConfig().render(true);
new SkillCheckDialog().render(true);
new MovementConfig().render(true);
```

**Why:** FoundryVTT dialog classes don't have static `show()` methods. They need to be instantiated and then `render(true)` called.

### **2. Event Delegation for Dynamic Content**
**❌ Wrong (Hardcoded Event Listeners):**
```javascript
document.querySelectorAll('[data-tool]').forEach(element => {
    element.addEventListener('click', handler);
});
```

**✅ Correct (Event Delegation):**
```javascript
const container = document.querySelector('.menubar-container');
container.addEventListener('click', (event) => {
    const toolElement = event.target.closest('[data-tool]');
    if (toolElement) {
        const toolName = toolElement.getAttribute('data-tool');
        // Handle tool click
    }
});
```

**Why:** Event delegation handles dynamically added content and is more performant.

### **3. API Exposure Pattern**
**✅ Standard Pattern:**
```javascript
// In blacksmith.js
module.api.addNotification = MenuBar.addNotification.bind(MenuBar);
module.api.removeNotification = MenuBar.removeNotification.bind(MenuBar);

// In initial API object
module.api = {
    addNotification: null,
    removeNotification: null
};
```

**Why:** This pattern ensures proper `this` binding and provides null placeholders for initialization.

### **4. Template Data Structure**
**✅ Consistent Data Passing:**
```javascript
const templateData = {
    isGM: game.user.isGM,
    toolsByZone: this.getMenubarToolsByZone(),
    notifications: Array.from(this.notifications.values())
};
```

**Why:** Consistent structure makes templates predictable and maintainable.

### **5. File Naming Consistency**
**✅ Naming Convention:**
- `api-menubar.js` - API implementation
- `menubar.hbs` - Template file
- `menubar.css` - Styles
- `api-menubar.md` - Documentation

**Why:** Consistent naming makes the codebase easier to navigate and understand.

## **🔧 FoundryVTT-Specific Patterns**

### **Settings Dialog Access**
```javascript
// Correct way to open FoundryVTT settings
game.settings.sheet.render(true);
```

### **UI Rendering**
```javascript
// For UI elements that need to be rendered
const html = await renderTemplate('path/to/template.hbs', data);
element.insertAdjacentHTML('beforebegin', html);
```

### **Module API Access**
```javascript
// Safe way to access module APIs
const api = game.modules.get('module-id')?.api;
if (api?.methodName) {
    api.methodName();
}
```

## **🎨 CSS and Styling Best Practices**

### **CSS Custom Properties for Dynamic Styling**
```css
.timer-section {
    --progress: 0%;
    --progress-color: rgba(37, 211, 102, 0.2);
}

.timer-section::before {
    background: linear-gradient(
        90deg,
        var(--progress-color) var(--progress),
        transparent var(--progress)
    );
}
```

**Why:** CSS custom properties allow JavaScript to dynamically update styles without hardcoding.

### **Flexbox for Layout**
```css
.menubar-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.menubar-left {
    display: flex;
    align-items: center;
    gap: 4px;
}
```

**Why:** Flexbox provides reliable, responsive layouts that work across different screen sizes.

## **🧪 Testing Patterns**

### **API Testing Functions**
```javascript
static testMenubarAPI() {
    try {
        console.log('🧪 Testing Menubar API...');
        
        // Test 1: Check if tools are registered
        if (!this.isMenubarToolRegistered('test-tool')) {
            console.log('❌ Test tool not registered');
            return false;
        }
        
        console.log('✅ All tests passed');
        return true;
        
    } catch (error) {
        console.error('❌ Test Error:', error);
        return false;
    }
}
```

**Why:** Structured testing functions make debugging easier and provide clear success/failure indicators.

## **📝 Documentation Patterns**

### **API Documentation Structure**
```markdown
#### `methodName(param1, param2)`
Description of what the method does.

**Parameters:**
- `param1` (type): Description
- `param2` (type, optional): Description with default value

**Returns:** `type` - Description

**Example:**
```javascript
const result = api.methodName('value1', 'value2');
```
```

**Why:** Consistent documentation structure makes APIs easier to understand and use.

## **🚀 Performance Considerations**

### **Event Listener Management**
- Use event delegation instead of multiple individual listeners
- Remove event listeners when components are destroyed
- Use `removeEventListener` with the same function reference

### **DOM Manipulation**
- Batch DOM updates when possible
- Use `DocumentFragment` for multiple element creation
- Cache DOM queries when elements are accessed repeatedly

### **Memory Management**
- Clear timeouts and intervals when components are destroyed
- Remove references to DOM elements in cleanup
- Use `WeakMap` for object associations when appropriate

## **🔍 Debugging Tips**

### **Console Logging Patterns**
```javascript
// Use consistent logging format
console.log('🧪 Testing Feature...');
console.log('✅ Test passed');
console.log('❌ Test failed:', error);

// Use structured logging
postConsoleAndNotification(MODULE.NAME, 'Feature activated', data, true, false);
```

### **Error Handling**
```javascript
try {
    // Risky operation
} catch (error) {
    postConsoleAndNotification(MODULE.NAME, 'Error in feature', error, false, false);
    // Provide fallback behavior
    return fallbackValue;
}
```

## **📋 Code Review Checklist**

### **Before Submitting Code:**
- [ ] All dialog method calls use `.render(true)` pattern
- [ ] Event listeners use delegation where appropriate
- [ ] API methods are properly exposed in `blacksmith.js`
- [ ] Template data structure is consistent
- [ ] CSS uses custom properties for dynamic values
- [ ] Test functions are included for new features
- [ ] Documentation is updated for new APIs
- [ ] File naming follows established conventions

### **Common Issues to Avoid:**
- [ ] Calling non-existent static methods on dialog classes
- [ ] Adding individual event listeners to dynamic content
- [ ] Forgetting to expose new API methods
- [ ] Hardcoding style values instead of using CSS custom properties
- [ ] Missing error handling in async operations
- [ ] Inconsistent file naming

## **🔄 Migration Patterns**

### **When Renaming Files:**
1. Update all import statements
2. Update file references in documentation
3. Update any hardcoded paths
4. Test all functionality after renaming

### **When Refactoring APIs:**
1. Maintain backward compatibility where possible
2. Provide clear migration documentation
3. Add deprecation warnings for old methods
4. Update all internal usage first
5. Test external module compatibility

---

**Remember:** These patterns were learned through actual development experience. Follow them to avoid common pitfalls and maintain code quality.
