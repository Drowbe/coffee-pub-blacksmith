# Pin Configuration Window Integration Guide

This document explains how to port your existing pin configuration window into Blacksmith's pins API.

## File Structure

Your pin configuration window should be placed at:
- **JavaScript**: `scripts/window-pin-config.js`
- **Template**: `templates/window-pin-config.hbs`
- **CSS** (optional): `styles/window-pin-config.css`

## Integration Steps

### 1. Window Class Structure

Your window class should:
- Extend `Application` (Application V2, not `FormApplication`)
- Export as `PinConfigurationWindow`
- Include a static `open(pinId, options)` method
- Accept `pinId` and optional `sceneId` in constructor

**Example structure:**
```javascript
export class PinConfigurationWindow extends Application {
    constructor(pinId, options = {}) {
        super(options);
        this.pinId = pinId;
        this.sceneId = options.sceneId || canvas?.scene?.id;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-pin-config',
            template: `modules/coffee-pub-blacksmith/templates/window-pin-config.hbs`,
            classes: ['blacksmith', 'pin-config-window'],
            title: 'Configure Pin',
            width: 600,
            height: 700,
            resizable: true
        });
    }

    async getData() {
        // Get pin data via PinManager
        const { PinManager } = await import('./manager-pins.js');
        const pin = PinManager.get(this.pinId, { sceneId: this.sceneId });
        
        // Check permissions
        const userId = game.user?.id || '';
        if (!PinManager._canEdit(pin, userId)) {
            throw new Error('Permission denied');
        }

        // Return data for template
        return { pin, /* ... other data ... */ };
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Your event handlers here
    }

    async _onSubmit(event) {
        // Extract form data and update pin via API
        const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
        await pinsAPI.update(this.pinId, updateData, { sceneId: this.sceneId });
        this.close();
    }

    static async open(pinId, options = {}) {
        const window = new PinConfigurationWindow(pinId, options);
        await window.render(true);
        return window;
    }
}
```

### 2. API Integration

The window is already integrated into the API at:
- **API Method**: `pinsAPI.configure(pinId, options)`
- **Location**: `scripts/api-pins.js`

You don't need to modify this - it's already set up to call your window class.

### 3. Context Menu Integration

The context menu integration is already added at:
- **Location**: `scripts/pins-renderer.js` in `_showContextMenu()` method
- **Menu Item**: "Configure Pin" (only shown if user can edit)

The menu item calls `pinsAPI.configure()` automatically.

### 4. Form Submission

When the form is submitted, update the pin using the API:

```javascript
async _onSubmit(event) {
    const form = event.target;
    const formData = new FormData(form);
    
    // Extract your form fields into updateData object
    const updateData = {
        size: { w: width, h: height },
        style: { fill, stroke, strokeWidth, alpha },
        shape: 'circle' | 'square' | 'none',
        text: '...',
        textLayout: 'under' | 'over' | 'around',
        textDisplay: 'always' | 'hover' | 'never' | 'gm',
        // ... etc
    };

    // Update via API
    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    await pinsAPI.update(this.pinId, updateData, { sceneId: this.sceneId });
    
    ui.notifications.info('Pin updated.');
    this.close();
}
```

### 5. Pin Data Properties

Your form should handle these pin properties (see `pins-schema.js` for full list):

**Appearance:**
- `size: { w: number, h: number }`
- `style: { fill: string, stroke: string, strokeWidth: number, alpha: number }`
- `shape: 'circle' | 'square' | 'none'`
- `dropShadow: boolean`

**Icon/Image:**
- `image: string` (Font Awesome HTML, class string, or image URL)

**Text:**
- `text: string`
- `textLayout: 'under' | 'over' | 'around'`
- `textDisplay: 'always' | 'hover' | 'never' | 'gm'`
- `textColor: string`
- `textSize: number`
- `textMaxLength: number` (0 = no limit)
- `textScaleWithPin: boolean`

**Metadata:**
- `type: string` (e.g., 'note', 'quest', 'default')

**Ownership (GM only):**
- `ownership: { default: number, users?: Record<string, number> }`

### 6. Permissions

- Check if user can edit: `PinManager._canEdit(pin, userId)`
- Only show ownership editor if `game.user?.isGM`
- The API will enforce permissions, but checking in the window provides better UX

### 7. Template Notes

If you're using Handlebars helpers, you may need to register them. Common helpers used in Blacksmith templates:
- `eq` - Equality check
- `isGM` - Check if user is GM
- `or` - Default value

If your template uses different helpers, you can either:
1. Register your helpers in `blacksmith.js` initialization
2. Use inline JavaScript in the template
3. Pre-process data in `getData()` to avoid needing helpers

### 8. Testing

After porting:
1. Right-click a pin → "Configure Pin" should open your window
2. Make changes and submit → Pin should update visually
3. Test with non-GM user → Ownership editor should be hidden
4. Test with user who can't edit → Window should not open (or show error)

## Migration Checklist

- [ ] Window class extends `Application` (V2)
- [ ] Window class exports as `PinConfigurationWindow`
- [ ] Static `open(pinId, options)` method exists
- [ ] `getData()` retrieves pin via `PinManager.get()`
- [ ] Permission check in `getData()` or `open()`
- [ ] Form submission calls `pinsAPI.update()`
- [ ] Template handles all pin properties
- [ ] Ownership editor only shown to GMs
- [ ] Window integrated into context menu (already done)
- [ ] API method `pins.configure()` works (already done)

## Questions?

If you need to adapt your existing code, focus on:
1. **Constructor**: Accept `pinId` and `options.sceneId`
2. **getData()**: Use `PinManager.get()` instead of your current data source
3. **Form submission**: Use `pinsAPI.update()` instead of your current update method
4. **Template**: Keep your existing template, just ensure it matches the data structure from `getData()`

The rest (API method, context menu) is already integrated!
