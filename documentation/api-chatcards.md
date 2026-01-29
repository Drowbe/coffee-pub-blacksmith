# Chat Cards API Documentation

> **Status**: Chat Cards API available. Provides access to chat card themes for use in dropdowns and UI elements. Full chat card creation/management API coming in future release.

## Overview

The Chat Cards API provides programmatic access to Blacksmith's chat card theme system, allowing external modules to:
- Get lists of available themes for dropdowns
- Filter themes by type (card vs. announcement)
- Look up theme information by ID
- Get CSS class names for themes
- Integrate with Blacksmith's chat card styling system

### Theme Types

Blacksmith themes are organized into two types:

- **`card`**: Regular card themes with light backgrounds and dark text. Suitable for general chat cards, skill checks, combat summaries, etc.
- **`announcement`**: Announcement themes with dark backgrounds and light header text. Designed for important announcements that need to stand out.

## Getting Started

### Accessing the API

```javascript
// Via game.modules (no imports – use in browser console or other modules)
const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;

// Or via Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
const blacksmith = await BlacksmithAPI.get();
const chatCardsAPI = blacksmith?.chatCards;
```

### API Availability Check

```javascript
const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
if (!chatCardsAPI) {
    console.warn('Blacksmith Chat Cards API not available');
    return;
}
```

## Available Methods

### `chatCards.getThemes([type])`

Returns an array of available chat card themes with full information. Optionally filter by type.

**Parameters**:
- `type` (string, optional): Filter by type - `'card'` or `'announcement'`. If omitted, returns all themes.

**Returns**: `Array<{id: string, name: string, className: string, type: string, description: string}>`

```javascript
// Get all themes
const allThemes = chatCardsAPI.getThemes();
// Returns:
// [
//   {
//     id: 'default',
//     name: 'Default',
//     className: 'theme-default',
//     type: 'card',
//     description: 'Light background, subtle borders'
//   },
//   {
//     id: 'blue',
//     name: 'Blue',
//     className: 'theme-blue',
//     type: 'card',
//     description: 'Blue accent theme'
//   },
//   ...
// ]

// Get only card themes
const cardThemes = chatCardsAPI.getThemes('card');

// Get only announcement themes
const announcementThemes = chatCardsAPI.getThemes('announcement');
```

**Use Case**: When you need full theme information for custom UI or detailed displays.

### `chatCards.getCardThemes()`

Returns an array of all card themes (light backgrounds).

**Returns**: `Array<{id: string, name: string, className: string, type: string, description: string}>`

```javascript
const cardThemes = chatCardsAPI.getCardThemes();
// Returns only themes with type: 'card'
```

**Use Case**: Convenience method to get only regular card themes.

### `chatCards.getAnnouncementThemes()`

Returns an array of all announcement themes (dark backgrounds).

**Returns**: `Array<{id: string, name: string, className: string, type: string, description: string}>`

```javascript
const announcementThemes = chatCardsAPI.getAnnouncementThemes();
// Returns only themes with type: 'announcement'
```

**Use Case**: Convenience method to get only announcement themes.

### `chatCards.getThemesByType(type)`

Get themes filtered by a specific type.

**Parameters**:
- `type` (string): Theme type - `'card'` or `'announcement'`

**Returns**: `Array<{id: string, name: string, className: string, type: string, description: string}>`

```javascript
const cardThemes = chatCardsAPI.getThemesByType('card');
const announcementThemes = chatCardsAPI.getThemesByType('announcement');
```

**Use Case**: When you need to filter themes by type programmatically.

### `chatCards.getThemeChoices([type])`

Returns an object suitable for Foundry settings dropdowns (key-value pairs). Optionally filter by type.

**Parameters**:
- `type` (string, optional): Filter by type - `'card'` or `'announcement'`. If omitted, returns all themes.

**Returns**: `Object<string, string>` - Object mapping theme IDs to display names

```javascript
// Get all theme choices
const allChoices = chatCardsAPI.getThemeChoices();
// Returns:
// {
//   'default': 'Default',
//   'blue': 'Blue',
//   'green': 'Green',
//   'red': 'Red',
//   'orange': 'Orange',
//   'announcement-green': 'Announcement Green',
//   'announcement-blue': 'Announcement Blue',
//   'announcement-red': 'Announcement Red'
// }

// Get only card theme choices
const cardChoices = chatCardsAPI.getThemeChoices('card');
// Returns: { 'default': 'Default', 'blue': 'Blue', ... }

// Get only announcement theme choices
const announcementChoices = chatCardsAPI.getThemeChoices('announcement');
// Returns: { 'announcement-green': 'Announcement Green', ... }
```

**Use Case**: Perfect for Foundry settings registration where you need a choices object.

```javascript
// For regular chat cards
game.settings.register('my-module', 'cardTheme', {
    name: 'Chat Card Theme',
    hint: 'Choose the theme for chat cards created by this module',
    scope: 'world',
    config: true,
    type: String,
    default: 'default',
    choices: chatCardsAPI.getThemeChoices('card')  // Only card themes
});

// For announcements
game.settings.register('my-module', 'announcementTheme', {
    name: 'Announcement Theme',
    hint: 'Choose the theme for announcements',
    scope: 'world',
    config: true,
    type: String,
    default: 'announcement-blue',
    choices: chatCardsAPI.getThemeChoices('announcement')  // Only announcement themes
});
```

### `chatCards.getCardThemeChoices()`

Returns theme choices for card themes only (convenience method).

**Returns**: `Object<string, string>` - Object mapping theme IDs to display names

```javascript
const cardChoices = chatCardsAPI.getCardThemeChoices();
// Returns only card theme choices
```

**Use Case**: Convenience method to get choices for regular card themes.

### `chatCards.getAnnouncementThemeChoices()`

Returns theme choices for announcement themes only (convenience method).

**Returns**: `Object<string, string>` - Object mapping theme IDs to display names

```javascript
const announcementChoices = chatCardsAPI.getAnnouncementThemeChoices();
// Returns only announcement theme choices
```

**Use Case**: Convenience method to get choices for announcement themes.

### `chatCards.getThemeChoicesWithClassNames([type])`

Returns theme choices with **CSS class names as keys** instead of theme IDs. This is ideal when you need to use the CSS class name directly in templates or HTML without conversion.

**Parameters**:
- `type` (string, optional): Filter by type - `'card'` or `'announcement'`. If omitted, returns all themes.

**Returns**: `Object<string, string>` - Object mapping CSS class names to display names

```javascript
// Get all theme choices with class names as keys
const allChoices = chatCardsAPI.getThemeChoicesWithClassNames();
// Returns:
// {
//   'theme-default': 'Default',
//   'theme-blue': 'Blue',
//   'theme-green': 'Green',
//   'theme-red': 'Red',
//   'theme-orange': 'Orange',
//   'theme-announcement-green': 'Announcement Green',
//   'theme-announcement-blue': 'Announcement Blue',
//   'theme-announcement-red': 'Announcement Red'
// }

// Get only card theme choices with class names
const cardChoices = chatCardsAPI.getThemeChoicesWithClassNames('card');
// Returns: { 'theme-default': 'Default', 'theme-blue': 'Blue', ... }

// Get only announcement theme choices with class names
const announcementChoices = chatCardsAPI.getThemeChoicesWithClassNames('announcement');
// Returns: { 'theme-announcement-green': 'Announcement Green', ... }
```

**Use Case**: When registering Foundry settings or rendering templates where you need the CSS class name directly to use in HTML like `<div class="blacksmith-card {{theme}}">`. This eliminates the need to convert IDs to class names.

```javascript
// Register setting that stores CSS class name directly
game.settings.register('my-module', 'cardTheme', {
    name: 'Chat Card Theme',
    hint: 'Choose the theme for chat cards created by this module',
    scope: 'world',
    config: true,
    type: String,
    default: 'theme-default',  // CSS class name, not ID
    choices: chatCardsAPI.getThemeChoicesWithClassNames('card')
});

// In template, use directly:
// <div class="blacksmith-card {{cardTheme}}">
// No conversion needed!
```

### `chatCards.getCardThemeChoicesWithClassNames()`

Returns card theme choices with CSS class names as keys (convenience method).

**Returns**: `Object<string, string>` - Object mapping CSS class names to display names

```javascript
const cardChoices = chatCardsAPI.getCardThemeChoicesWithClassNames();
// Returns: { 'theme-default': 'Default', 'theme-blue': 'Blue', ... }
```

**Use Case**: Convenience method to get card theme choices with class names as keys.

### `chatCards.getAnnouncementThemeChoicesWithClassNames()`

Returns announcement theme choices with CSS class names as keys (convenience method).

**Returns**: `Object<string, string>` - Object mapping CSS class names to display names

```javascript
const announcementChoices = chatCardsAPI.getAnnouncementThemeChoicesWithClassNames();
// Returns: { 'theme-announcement-green': 'Announcement Green', ... }
```

**Use Case**: Convenience method to get announcement theme choices with class names as keys.

### `chatCards.getTheme(themeId)`

Get a specific theme by its ID.

**Parameters**:
- `themeId` (string): The theme ID (e.g., 'default', 'blue', 'announcement-green')

**Returns**: `{id: string, name: string, className: string, type: string, description: string} | null`

```javascript
const theme = chatCardsAPI.getTheme('blue');
// Returns:
// {
//   id: 'blue',
//   name: 'Blue',
//   className: 'theme-blue',
//   type: 'card',
//   description: 'Blue accent theme'
// }

const announcementTheme = chatCardsAPI.getTheme('announcement-green');
// Returns:
// {
//   id: 'announcement-green',
//   name: 'Announcement Green',
//   className: 'theme-announcement-green',
//   type: 'announcement',
//   description: 'Dark green background for announcements'
// }

// Returns null if theme not found
const invalid = chatCardsAPI.getTheme('invalid');
// Returns: null
```

**Use Case**: When you need to look up specific theme details, including its type.

### `chatCards.getThemeClassName(themeId)`

Get the CSS class name for a theme ID.

**Parameters**:
- `themeId` (string): The theme ID

**Returns**: `string` - The CSS class name (e.g., 'theme-default')

```javascript
const className = chatCardsAPI.getThemeClassName('blue');
// Returns: 'theme-blue'

// Falls back to 'theme-default' if theme not found
const invalid = chatCardsAPI.getThemeClassName('invalid');
// Returns: 'theme-default'
```

**Use Case**: When rendering templates and you need the CSS class name.

```javascript
const themeId = game.settings.get('my-module', 'cardTheme') || 'default';
const themeClassName = chatCardsAPI.getThemeClassName(themeId);

const html = `<div class="blacksmith-card ${themeClassName}">
    <div class="card-header">My Card</div>
    <div class="section-content">Content here</div>
</div>`;
```

## Available Themes

The following themes are available, organized by type:

### Card Themes (Light Backgrounds)

| ID | Name | CSS Class | Description |
|---|---|---|---|
| `default` | Default | `theme-default` | Light background, subtle borders |
| `blue` | Blue | `theme-blue` | Blue accent theme |
| `green` | Green | `theme-green` | Green accent theme |
| `red` | Red | `theme-red` | Red accent theme |
| `orange` | Orange | `theme-orange` | Orange accent theme |

### Announcement Themes (Dark Backgrounds)

| ID | Name | CSS Class | Description |
|---|---|---|---|
| `announcement-green` | Announcement Green | `theme-announcement-green` | Dark green background for announcements |
| `announcement-blue` | Announcement Blue | `theme-announcement-blue` | Dark blue background for announcements |
| `announcement-red` | Announcement Red | `theme-announcement-red` | Dark red background for announcements |

## Usage Examples

### Example 1: Settings Dropdown (All Themes)

```javascript
Hooks.once('init', () => {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    
    if (!chatCardsAPI) {
        console.warn('Blacksmith Chat Cards API not available');
        return;
    }
    
    // Register setting with all themes
    game.settings.register('my-module', 'cardTheme', {
        name: 'Chat Card Theme',
        hint: 'Choose the theme for chat cards created by this module',
        scope: 'world',
        config: true,
        type: String,
        default: 'default',
        choices: chatCardsAPI.getThemeChoices()  // All themes
    });
});
```

### Example 1b: Separate Settings for Card vs Announcement Themes

```javascript
Hooks.once('init', () => {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    
    if (!chatCardsAPI) {
        console.warn('Blacksmith Chat Cards API not available');
        return;
    }
    
    // Register setting for regular chat cards (card themes only)
    game.settings.register('my-module', 'cardTheme', {
        name: 'Chat Card Theme',
        hint: 'Choose the theme for regular chat cards',
        scope: 'world',
        config: true,
        type: String,
        default: 'default',
        choices: chatCardsAPI.getCardThemeChoices()  // Only card themes
    });
    
    // Register separate setting for announcements (announcement themes only)
    game.settings.register('my-module', 'announcementTheme', {
        name: 'Announcement Theme',
        hint: 'Choose the theme for announcements',
        scope: 'world',
        config: true,
        type: String,
        default: 'announcement-blue',
        choices: chatCardsAPI.getAnnouncementThemeChoices()  // Only announcement themes
    });
});
```

### Example 1c: Using CSS Class Names Directly (Recommended for Templates)

This approach stores CSS class names directly in settings, eliminating the need to convert IDs to class names in templates.

```javascript
Hooks.once('init', () => {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    
    if (!chatCardsAPI) {
        console.warn('Blacksmith Chat Cards API not available');
        return;
    }
    
    // Register setting that stores CSS class name directly
    game.settings.register('my-module', 'cardTheme', {
        name: 'Chat Card Theme',
        hint: 'Choose the theme for chat cards created by this module',
        scope: 'world',
        config: true,
        type: String,
        default: 'theme-default',  // CSS class name, not ID
        choices: chatCardsAPI.getThemeChoicesWithClassNames('card')  // Keys are CSS class names
    });
});

// In your Handlebars template (my-card.hbs):
// <div class="blacksmith-card {{cardTheme}}">
//     <div class="card-header">{{title}}</div>
//     <div class="section-content">{{content}}</div>
// </div>

// In JavaScript, use the setting value directly:
async function sendMyCard(data) {
    // Get CSS class name directly from settings - no conversion needed!
    const themeClassName = game.settings.get('my-module', 'cardTheme') || 'theme-default';
    
    const templateData = {
        title: data.title || "Default Title",
        icon: data.icon || "fa-info-circle",
        content: data.content || "No content provided",
        cardTheme: themeClassName  // Pass directly to template
    };
    
    const html = await foundry.applications.handlebars.renderTemplate(
        'modules/my-module/templates/my-card.hbs',
        templateData
    );
    
    await ChatMessage.create({
        content: html,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        speaker: ChatMessage.getSpeaker({ user: game.user.id })
    });
}
```

**Benefits of this approach:**
- No ID-to-class-name conversion needed
- Setting value can be used directly in templates
- More efficient (no API calls during rendering)
- Cleaner code

### Example 2: Template Rendering with Theme (Using ID Conversion)

This example shows the traditional approach where settings store theme IDs and you convert them to class names. **Note:** Example 1c above is recommended for new code as it's more efficient.

```javascript
async function sendMyCard(data) {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    
    // Get theme ID from settings (stored as ID, not class name)
    const themeId = game.settings.get('my-module', 'cardTheme') || 'default';
    // Convert ID to class name
    const themeClassName = chatCardsAPI?.getThemeClassName(themeId) || 'theme-default';
    
    const templateData = {
        title: data.title || "Default Title",
        icon: data.icon || "fa-info-circle",
        content: data.content || "No content provided",
        themeClassName: themeClassName
    };
    
    // Render template (themeClassName used in template)
    const html = await foundry.applications.handlebars.renderTemplate(
        'modules/my-module/templates/my-card.hbs',
        templateData
    );
    
    await ChatMessage.create({
        content: html,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        speaker: ChatMessage.getSpeaker({ user: game.user.id })
    });
}
```

### Example 3: Dynamic Theme Selection UI

```javascript
function createThemeSelector() {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    if (!chatCardsAPI) return null;
    
    const themes = chatCardsAPI.getThemes();
    const currentTheme = game.settings.get('my-module', 'cardTheme') || 'default';
    
    const select = document.createElement('select');
    themes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme.id;
        option.textContent = theme.name;
        option.title = theme.description;
        if (theme.id === currentTheme) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
        game.settings.set('my-module', 'cardTheme', e.target.value);
    });
    
    return select;
}
```

### Example 4: Theme Preview

```javascript
function showThemePreview(themeId) {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    if (!chatCardsAPI) return;
    
    const theme = chatCardsAPI.getTheme(themeId);
    if (!theme) {
        console.warn(`Theme '${themeId}' not found`);
        return;
    }
    
    console.log(`Theme: ${theme.name}`);
    console.log(`CSS Class: ${theme.className}`);
    console.log(`Description: ${theme.description}`);
    
    // Use in preview
    const previewHtml = `<div class="blacksmith-card ${theme.className}">
        <div class="card-header">Preview</div>
        <div class="section-content">
            <p>This is how ${theme.name} theme looks.</p>
        </div>
    </div>`;
    
    return previewHtml;
}
```

## Integration with Chat Card System

The Chat Cards API works with the chat card HTML/CSS framework documented in `migration-chat-cards.md`. Use the API to:

1. **Get theme choices** for settings dropdowns (with IDs or CSS class names as keys)
2. **Look up theme class names** when rendering templates
3. **Filter themes by type** (card vs. announcement)
4. **Validate theme IDs** before using them
5. **Build dynamic UI** that adapts to available themes

### Recommended Approach: Use CSS Class Names Directly

For new code, we recommend using `getThemeChoicesWithClassNames()` to store CSS class names directly in settings. This eliminates the need for ID-to-class-name conversion:

```handlebars
{{!-- templates/my-card.hbs --}}
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card {{cardTheme}}">
    <div class="card-header">
        <i class="fas fa-{{icon}}"></i> {{title}}
    </div>
    <div class="section-content">
        <p>{{{content}}}</p>
    </div>
</div>
```

```javascript
// JavaScript - Register setting with CSS class names as keys
game.settings.register('my-module', 'cardTheme', {
    name: 'Chat Card Theme',
    scope: 'world',
    config: true,
    type: String,
    default: 'theme-default',
    choices: chatCardsAPI.getThemeChoicesWithClassNames('card')
});

// Use setting value directly in template - no conversion needed!
const html = await renderTemplate('modules/my-module/templates/my-card.hbs', {
    title: "My Card",
    icon: "fa-dice",
    content: "Card content",
    cardTheme: game.settings.get('my-module', 'cardTheme')  // Already a CSS class name
});
```

### Alternative Approach: Convert IDs to Class Names

If you prefer to store theme IDs in settings and convert them when rendering:

```handlebars
{{!-- templates/my-card.hbs --}}
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card {{themeClassName}}">
    <div class="card-header">
        <i class="fas fa-{{icon}}"></i> {{title}}
    </div>
    <div class="section-content">
        <p>{{{content}}}</p>
    </div>
</div>
```

```javascript
// JavaScript - Convert ID to class name
const themeId = game.settings.get('my-module', 'cardTheme') || 'default';
const themeClassName = chatCardsAPI.getThemeClassName(themeId);
const html = await renderTemplate('modules/my-module/templates/my-card.hbs', {
    title: "My Card",
    icon: "fa-dice",
    content: "Card content",
    themeClassName: themeClassName
});
```

## Related Documentation

- **`migration-chat-cards.md`** - Complete guide to using the chat card HTML/CSS framework
- **`api-core.md`** - Core Blacksmith API documentation
- **Chat Card Templates** - See `templates/cards-common.hbs`, `templates/cards-xp.hbs` for examples

## Future Enhancements

A full Chat Card API for programmatic creation, updating, and management of chat cards is planned for a future release. The current API focuses on theme access to support dropdowns and UI integration.

---

**Note**: This API provides access to themes only. For creating and rendering chat cards, use the template rendering approach documented in `migration-chat-cards.md`.
