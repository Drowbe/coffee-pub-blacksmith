# FoundryVTT CSS Customization Module Guide

## Overview
This guide outlines how to create a FoundryVTT module that allows GMs to add and modify CSS styles at the world level. The module will provide real-time CSS updates with optional transition animations.

## Core Features
- World-level CSS customization
- Real-time style updates
- Optional transition animations
- Simple text-based CSS editor
- Settings persistence

## Technical Implementation Guide

### 1. Module Structure
```
your-module/
├── module.json
├── styles/
│   └── module.css
├── scripts/
│   ├── module.js
│   ├── settings.js
│   └── styles.js
└── templates/
    └── settings.html
```

### 2. Module.json Configuration
```json
{
  "name": "your-css-module",
  "title": "CSS Customizer",
  "description": "Add custom CSS to your FoundryVTT world",
  "version": "1.0.0",
  "compatibility": {
    "minimum": "12",
    "verified": "12"
  },
  "esmodules": ["scripts/module.js"],
  "styles": ["styles/module.css"]
}
```

### 3. Core Implementation Steps

#### A. Settings Registration
```javascript
// settings.js
export class Settings {
    static registerSettings() {
        game.settings.register('your-module', 'stylesheet', {
            scope: 'world',
            config: false,
            type: String,
            default: '/* Custom CSS */'
        });

        game.settings.register('your-module', 'transition', {
            name: 'Enable Transition Animation',
            hint: 'Adds a smooth transition when applying CSS changes',
            scope: 'world',
            config: true,
            type: Boolean,
            default: true
        });
    }
}
```

#### B. Style Application
```javascript
// styles.js
export class StyleManager {
    static applyStyles() {
        const css = game.settings.get('your-module', 'stylesheet');
        const styleId = 'your-module-styles';
        
        // Remove existing style if present
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) existingStyle.remove();

        // Create and append new style
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }
}
```

#### C. Settings Form
```html
<!-- templates/settings.html -->
<form class="css-editor-form">
    <div class="form-group">
        <label>Custom CSS</label>
        <textarea name="stylesheet" rows="10"></textarea>
    </div>
    <button type="submit">Save Changes</button>
</form>
```

### 4. Key Implementation Details

#### A. Style Application Process
1. Store CSS in world settings
2. Create a unique style element
3. Apply CSS with optional transition
4. Handle cleanup of old styles

#### B. Transition Implementation
```javascript
// Add to your CSS
.transition-enabled {
    transition: all 0.3s ease-in-out;
}
```

#### C. Socket Communication
```javascript
// For real-time updates to all connected clients
game.socket.emit('module.your-module', { css: newCSS });
```

### 5. Best Practices

1. **Error Handling**
   - Validate CSS before applying
   - Provide feedback for invalid CSS
   - Handle network issues gracefully

2. **Performance**
   - Debounce style updates
   - Clean up unused styles
   - Minimize DOM operations

3. **Security**
   - Sanitize CSS input
   - Restrict to GM only
   - Validate CSS properties

### 6. Example Usage

```javascript
// In your module.js
Hooks.once('init', () => {
    Settings.registerSettings();
});

Hooks.once('ready', () => {
    StyleManager.applyStyles();
});

// Handle settings updates
game.settings.get('your-module', 'stylesheet');
game.settings.set('your-module', 'stylesheet', newCSS);
```

## Additional Considerations

1. **Version Compatibility**
   - Test thoroughly in v12
   - Prepare for v13 compatibility
   - Use APP V2 API where possible

2. **Module Dependencies**
   - Consider using libwrapper for safer overrides
   - Use socketlib for network communication
   - Document any dependencies

3. **User Experience**
   - Provide clear error messages
   - Add helpful tooltips
   - Include example CSS snippets

## Migration Notes
- Keep settings structure simple
- Avoid complex data structures
- Plan for future version compatibility

## Testing Checklist
- [ ] CSS applies correctly
- [ ] Transitions work smoothly
- [ ] Settings persist
- [ ] Real-time updates work
- [ ] Error handling functions
- [ ] GM-only restrictions work
- [ ] Performance is acceptable 