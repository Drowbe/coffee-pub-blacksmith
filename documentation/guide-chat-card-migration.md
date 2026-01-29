# Chat Card Migration Guide

This guide explains how to leverage the Coffee Pub Blacksmith chat card HTML template framework and CSS classes to create styled chat cards that match the Blacksmith module's visual design.

## Overview

The Blacksmith module provides a comprehensive chat card system with:
- **Consistent HTML structure** using semantic classes
- **Theme system** with multiple color schemes
- **CSS variables** for easy customization
- **Layout components** for headers, sections, tables, and buttons
- **Handlebars template rendering** integration with FoundryVTT

## Prerequisites

- Coffee Pub Blacksmith module must be installed and active
- Your module must have access to FoundryVTT's Handlebars rendering system
- Basic knowledge of HTML, CSS, and Handlebars templating

## Core HTML Structure

### Basic Card Structure

Every Blacksmith chat card follows this base structure:

```html
<div class="blacksmith-card theme-default">
    <div class="card-header">
        <i class="fas fa-icon-name"></i> Card Title
    </div>
    <div class="section-content">
        <!-- Your content here -->
    </div>
</div>
```

### Required Classes

- **`.blacksmith-card`** - Base container class (required)
- **`.theme-{name}`** - Theme class (required, see Themes section)
- **`.card-header`** - Header section (optional but recommended)
- **`.section-content`** - Main content area (optional but recommended)

### Hide Foundry Header

To hide Foundry's default chat message header, add this at the very beginning of your template:

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
```

**Note:** Use `visibility: hidden` (not `visibility: none` — that value is invalid in CSS).

## Themes

The theme system controls the color scheme of your card. Apply a theme by adding the theme class to the `.blacksmith-card` element.

### Theme Types

Themes are organized into two types:

- **Card Themes** - Light backgrounds with dark text. Suitable for general chat cards, skill checks, combat summaries, etc.
- **Announcement Themes** - Dark backgrounds with light header text. Designed for important announcements that need to stand out.

### Available Themes

#### Card Themes (Light Backgrounds)

- **`theme-default`** - Light background, subtle borders
- **`theme-blue`** - Blue accent theme
- **`theme-green`** - Green accent theme
- **`theme-red`** - Red accent theme
- **`theme-orange`** - Orange accent theme

#### Announcement Themes (Dark Backgrounds)

- **`theme-announcement-green`** - Dark green background for announcements
- **`theme-announcement-blue`** - Dark blue background for announcements
- **`theme-announcement-red`** - Dark red background for announcements

### Example

```html
<div class="blacksmith-card theme-blue">
    <div class="card-header">
        <i class="fas fa-info-circle"></i> Information
    </div>
    <div class="section-content">
        <p>This card uses the blue theme.</p>
    </div>
</div>
```

## Layout Components

### Card Header

The header displays the card title with an optional icon.

```html
<div class="card-header">
    <i class="fas fa-dice"></i> Skill Check
</div>
```

**Features:**
- Large, bold text using "Modesto Condensed" font
- Icon support (Font Awesome)
- Hover effects when collapsible
- Automatically styled based on theme

### Section Content

The main content area for your card body.

```html
<div class="section-content">
    <p>Your paragraph content here.</p>
</div>
```

**Features:**
- Proper spacing and margins
- Theme-aware text colors
- Supports paragraphs, lists, and other HTML elements

**Important (from migration experience):** Style **only** content inside `.section-content`. Do **not** add your own CSS for `.card-header`, the header icon, or the header title — Blacksmith themes provide that. Your module’s CSS should target `.blacksmith-card .section-content` and your custom elements within it (e.g. `.blacksmith-card .section-content [id^="my-module-"]`) so you don’t override Blacksmith’s header styling.

### Section Headers

Use section headers to divide content within a card.

```html
<div class="section-header">
    <i class="fas fa-list"></i> Summary
</div>
```

**Features:**
- Uppercase text
- Dotted border separator
- Icon support
- Theme-aware colors

### Section Subheaders

For prominent section titles.

```html
<div class="section-subheader">
    <i class="fas fa-star"></i> Results
</div>
```

**Features:**
- Large, centered text
- Background highlight
- Uppercase styling
- Icon support

### Data Tables

Use the grid-based table system for key-value pairs.

```html
<div class="section-table">
    <div class="row-label">Label 1</div>
    <div class="row-content">Content 1</div>
    <div class="row-label label-dimmed">Label 2</div>
    <div class="row-content">Content 2</div>
    <div class="row-label label-highlighted">Label 3</div>
    <div class="row-content">Content 3</div>
</div>
```

**Features:**
- Two-column grid layout (label | content)
- Label styling with background colors
- Content styling with subtle background
- Special label variants:
  - `label-dimmed` - Dimmed appearance
  - `label-highlighted` - Highlighted appearance

### Buttons

Use the button container and button classes for interactive elements.

```html
<div class="blacksmith-chat-buttons">
    <button class="chat-button accept" data-action="accept">
        <i class="fas fa-check"></i> Accept
    </button>
    <button class="chat-button reject" data-action="reject">
        <i class="fas fa-times"></i> Reject
    </button>
</div>
```

**Features:**
- Flexbox layout with spacing
- Theme-aware styling
- Icon support
- Hover effects
- Custom data attributes for event handling

## CSS Variables

The theme system uses CSS variables that you can override if needed. All variables are prefixed with `--blacksmith-card-` to avoid conflicts.

### Available Variables

```css
--blacksmith-card-bg              /* Background color */
--blacksmith-card-border          /* Border color */
--blacksmith-card-text            /* Default text color */
--blacksmith-card-header-text     /* Header text color */
--blacksmith-card-section-header-text        /* Section header text */
--blacksmith-card-section-header-border     /* Section header border */
--blacksmith-card-section-subheader-text    /* Subheader text */
--blacksmith-card-section-subheader-bg       /* Subheader background */
--blacksmith-card-section-content-text       /* Content text color */
--blacksmith-card-hover-color               /* Hover color */
--blacksmith-card-button-text               /* Button text color */
--blacksmith-card-button-border             /* Button border color */
--blacksmith-card-button-hover-bg           /* Button hover background */
--blacksmith-card-button-container-bg       /* Button container background */
```

### Custom Theme Example

You can create custom themes by overriding CSS variables:

```css
.blacksmith-card.theme-custom {
    --blacksmith-card-bg: rgba(100, 50, 200, 0.1);
    --blacksmith-card-border: rgba(100, 50, 200, 0.3);
    --blacksmith-card-header-text: #6432c8;
    /* ... override other variables as needed ... */
}
```

## Handlebars Template Example

Here's a complete Handlebars template example:

```handlebars
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card theme-default">
    <div class="card-header">
        <i class="fas fa-{{icon}}"></i> {{title}}
    </div>
    <div class="section-content">
        {{#if showSummary}}
        <div class="section-header">
            <i class="fas fa-list"></i> Summary
        </div>
        <div class="section-table">
            <div class="row-label">Value 1</div>
            <div class="row-content">{{value1}}</div>
            <div class="row-label">Value 2</div>
            <div class="row-content">{{value2}}</div>
        </div>
        {{/if}}
        
        <p>{{{content}}}</p>
        
        {{#if showButtons}}
        <div class="blacksmith-chat-buttons">
            <button class="chat-button" data-action="action1">
                <i class="fas fa-check"></i> Action 1
            </button>
            <button class="chat-button" data-action="action2">
                <i class="fas fa-times"></i> Action 2
            </button>
        </div>
        {{/if}}
    </div>
</div>
```

## Rendering and Sending to Chat

### Step 1: Create Your Template File

Save your Handlebars template in your module's `templates/` directory, e.g., `templates/my-card.hbs`.

### Step 2: Render the Template

Use Foundry's Handlebars rendering system:

```javascript
const templateData = {
    title: "My Card Title",
    icon: "fa-dice",
    content: "Card content here",
    showSummary: true,
    value1: "100",
    value2: "200",
    showButtons: true
};

const html = await foundry.applications.handlebars.renderTemplate(
    'modules/your-module-name/templates/my-card.hbs',
    templateData
);
```

### Step 3: Send to Chat

Create a chat message with the rendered HTML:

```javascript
await ChatMessage.create({
    content: html,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    speaker: ChatMessage.getSpeaker({ user: game.user.id })
});
```

### Complete Example Function

```javascript
async function sendMyCard(data) {
    // Prepare template data
    const templateData = {
        title: data.title || "Default Title",
        icon: data.icon || "fa-info-circle",
        content: data.content || "No content provided",
        showSummary: data.showSummary || false,
        value1: data.value1,
        value2: data.value2,
        showButtons: data.showButtons || false
    };
    
    // Render template
    const html = await foundry.applications.handlebars.renderTemplate(
        'modules/your-module-name/templates/my-card.hbs',
        templateData
    );
    
    // Send to chat
    await ChatMessage.create({
        content: html,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        speaker: ChatMessage.getSpeaker({ user: game.user.id })
    });
}

// Usage
await sendMyCard({
    title: "Skill Check Result",
    icon: "fa-dice-d20",
    content: "You rolled a <strong>15</strong>!",
    showSummary: true,
    value1: "Roll",
    value2: "15",
    showButtons: false
});
```

## Advanced Features

### Collapsible Sections

You can make sections collapsible using Foundry's built-in collapsible system:

```html
<details class="collapsible">
    <summary class="card-header collapsible">
        <i class="fas fa-chevron-down"></i> Collapsible Section
    </summary>
    <div class="collapsible-content">
        <p>This content can be collapsed.</p>
    </div>
</details>
```

### Custom Styling

You can add custom CSS classes to your cards for module-specific styling:

```html
<div class="blacksmith-card theme-default my-module-card" data-custom-attr="value">
    <!-- content -->
</div>
```

Then add custom CSS in your module's stylesheet. **Scope all custom styles to `.section-content`** so you don’t override Blacksmith’s card header or wrapper:

```css
/* Only style content inside section-content */
.blacksmith-card .section-content [id^="my-module-"] {
    /* Your custom content styles */
}
```

**Important:** Do **not** style `.card-header`, the header icon, or the header title in your CSS. Blacksmith drives those. Restrict your rules to descendants of `.blacksmith-card .section-content` (and your own IDs/classes) to avoid conflicts with Blacksmith and other modules.

### Icon Usage

Icons use Font Awesome. In Foundry v13+, Font Awesome 6 is used; prefer the `fa-solid` prefix:

- `fa-solid fa-dice` - Dice icon (or `fas fa-dice` where still supported)
- `fa-solid fa-check` - Checkmark
- `fa-solid fa-times` - X mark
- `fa-solid fa-info-circle` - Information
- `fa-solid fa-exclamation-triangle` - Warning
- `fa-solid fa-star` - Star
- `fa-solid fa-users` - Users/Party
- `fa-solid fa-sword` - Combat
- `fa-solid fa-coins` - Loot/Currency

See [Font Awesome Icons](https://fontawesome.com/icons) for the full list.

## Best Practices

1. **Always use the base structure**: Start with `.blacksmith-card` and a theme class
2. **Use semantic classes**: Use `.card-header`, `.section-content`, `.section-header` for consistency
3. **Hide Foundry header**: Add the hide-header span at the beginning of your template (`visibility: hidden`, not `none`)
4. **Choose appropriate themes**: Use **announcement themes** for announcements (rounds, alerts); use **card themes** for regular chat cards (turns, skill checks). Don’t mix both in one dropdown — use separate settings and API methods per type
5. **Style only section-content**: Add CSS only for content inside `.blacksmith-card .section-content`. Do not style `.card-header` or the wrapper — Blacksmith themes handle those
6. **Use data attributes**: Add `data-*` attributes to buttons and elements for event handling
7. **Scope custom CSS**: Scope all custom styles to `.blacksmith-card .section-content` and your own IDs/classes to avoid conflicts
8. **Test with different themes**: Ensure your content is readable with all theme options
9. **Use Handlebars conditionals**: Use `{{#if}}` blocks to show/hide optional content
10. **Use the API for theme choices**: Use `getThemeChoicesWithClassNames()` (or the card/announcement variants) so settings store CSS class names; then pass the value directly into templates with no ID-to-class conversion

## Common Patterns

### Simple Notification Card

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card theme-blue">
    <div class="card-header">
        <i class="fas fa-bell"></i> Notification
    </div>
    <div class="section-content">
        <p>Your notification message here.</p>
    </div>
</div>
```

### Card with Data Table

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card theme-default">
    <div class="card-header">
        <i class="fas fa-table"></i> Statistics
    </div>
    <div class="section-content">
        <div class="section-table">
            <div class="row-label">Stat 1</div>
            <div class="row-content">{{stat1}}</div>
            <div class="row-label">Stat 2</div>
            <div class="row-content">{{stat2}}</div>
        </div>
    </div>
</div>
```

### Card with Multiple Sections

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card theme-default">
    <div class="card-header">
        <i class="fas fa-list"></i> Multi-Section Card
    </div>
    <div class="section-content">
        <div class="section-header">
            <i class="fas fa-info"></i> Section 1
        </div>
        <p>Content for section 1.</p>
        
        <div class="section-header">
            <i class="fas fa-star"></i> Section 2
        </div>
        <p>Content for section 2.</p>
    </div>
</div>
```

### Card with Interactive Buttons

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
<div class="blacksmith-card theme-green">
    <div class="card-header">
        <i class="fas fa-question"></i> Confirmation
    </div>
    <div class="section-content">
        <p>Do you want to proceed?</p>
        <div class="blacksmith-chat-buttons">
            <button class="chat-button accept" data-action="confirm" data-id="{{id}}">
                <i class="fas fa-check"></i> Confirm
            </button>
            <button class="chat-button reject" data-action="cancel" data-id="{{id}}">
                <i class="fas fa-times"></i> Cancel
            </button>
        </div>
    </div>
</div>
```

## Event Handling

To handle button clicks and other interactions, use Foundry's event delegation:

```javascript
// In your module's initialization
Hooks.on('renderChatMessage', (message, html, data) => {
    // Handle button clicks
    html.find('.chat-button').on('click', async (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        const id = button.dataset.id;
        
        // Handle the action
        switch (action) {
            case 'confirm':
                await handleConfirm(id);
                break;
            case 'cancel':
                await handleCancel(id);
                break;
        }
    });
});
```

## Troubleshooting

### "Setting is not registered" at startup

- Theme choices come from the Chat Cards API asynchronously. Register settings in a `ready` hook (not `init`) and **await** your `registerSettings()` function before reading any of those settings (e.g. before calling `getRoundInitialized()` or other code that uses theme-related settings).
- Ensure `registerSettings` is async and that you `await registerSettings()` in your ready callback.

### Card Not Styling Correctly

- Ensure Coffee Pub Blacksmith module is active
- Check that you're using `.blacksmith-card` as the base class
- Verify a theme class is applied (e.g., `theme-default`)
- Do not add your own CSS for `.card-header` — style only content inside `.section-content`
- Check browser console for CSS errors

### Icons Not Showing

- Verify Font Awesome is loaded (it should be by default in Foundry)
- Check icon class names (use `fas fa-icon-name` format)
- Ensure icon classes are valid Font Awesome icons

### Template Not Rendering

- Verify template path is correct (relative to `modules/your-module-name/templates/`)
- Check that template file has `.hbs` extension
- Ensure template data matches what the template expects
- Check browser console for Handlebars errors

### Buttons Not Working

- Verify event listeners are registered
- Check that `data-*` attributes are set correctly
- Ensure event delegation is set up in `renderChatMessage` hook
- Check browser console for JavaScript errors

## File Locations Reference

Blacksmith's chat card CSS files (for reference):
- `styles/cards-layout.css` - Layout, spacing, typography
- `styles/cards-themes.css` - Theme color definitions
- `styles/cards-skill-check.css` - Skill check specific styles (example of extension)

Blacksmith's template examples:
- `templates/cards-common.hbs` - Common card patterns
- `templates/cards-xp.hbs` - XP distribution card example
- `templates/card-skill-check.hbs` - Skill check card example

## Lessons from Migration (Coffee Pub Crier)

When migrating an existing chat card system to Blacksmith:

1. **Structure as contract** — Use exactly: hide-header span → `.blacksmith-card` + theme → `.card-header` (don’t style) → `.section-content` (style only this). Don’t add extra wrapper classes (e.g. `crier`) on the card; scope your CSS to `.blacksmith-card .section-content` instead.
2. **Theme type separation** — Use `getAnnouncementThemeChoicesWithClassNames()` only for round/announcement cards and `getCardThemeChoicesWithClassNames()` only for turn/regular cards. Don’t mix both in one dropdown.
3. **Async settings** — Because theme choices come from the API, register settings in a `ready` hook and `await registerSettings()` before reading any of those settings. Otherwise you can hit “setting is not registered” at startup.
4. **No legacy theme mapping** — Remove old theme keys (e.g. `cardsdark`, `cardsgreen`) and use only API themes; store CSS class names in settings and pass them straight into templates.
5. **Generic content selectors** — Prefer attribute selectors like `[class^="my-module-user-"]` or `[id^="my-module-"]` instead of theme-specific classes so new themes work without CSS changes.

## Next Steps

1. Create your Handlebars template file
2. Add the base HTML structure with appropriate theme
3. Add your content using the layout components
4. Render the template in your JavaScript code
5. Send the rendered HTML to chat
6. Add event handlers for interactive elements
7. Test with different themes and content

## Chat Card Themes API

The Blacksmith module exposes a Chat Cards API that provides access to available themes for use in dropdowns and other UI elements.

### Accessing the API

```javascript
// Via game.modules
const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;

// Or via Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
const blacksmith = await BlacksmithAPI.get();
const chatCardsAPI = blacksmith?.chatCards;
```

### Available Methods

#### `chatCards.getThemes([type])`

Returns an array of all available themes with full information. Optionally filter by type (`'card'` or `'announcement'`):

```javascript
// Get all themes
const themes = chatCardsAPI.getThemes();
// Returns:
// [
//   { id: 'default', name: 'Default', className: 'theme-default', type: 'card', description: 'Light background, subtle borders' },
//   { id: 'blue', name: 'Blue', className: 'theme-blue', type: 'card', description: 'Blue accent theme' },
//   ...
// ]

// Get only card themes
const cardThemes = chatCardsAPI.getThemes('card');

// Get only announcement themes
const announcementThemes = chatCardsAPI.getThemes('announcement');
```

#### `chatCards.getThemeChoices([type])`

Returns an object suitable for Foundry settings dropdowns, with theme IDs as keys:

```javascript
// Get all theme choices
const choices = chatCardsAPI.getThemeChoices();
// Returns:
// {
//   'default': 'Default',
//   'blue': 'Blue',
//   'green': 'Green',
//   ...
// }

// Get only card theme choices
const cardChoices = chatCardsAPI.getThemeChoices('card');

// Get only announcement theme choices
const announcementChoices = chatCardsAPI.getThemeChoices('announcement');
```

#### `chatCards.getThemeChoicesWithClassNames([type])` ⭐ **Recommended**

Returns an object with **CSS class names as keys** instead of theme IDs. This is the recommended approach for new code as it eliminates the need to convert IDs to class names:

```javascript
// Get all theme choices with CSS class names as keys
const choices = chatCardsAPI.getThemeChoicesWithClassNames();
// Returns:
// {
//   'theme-default': 'Default',
//   'theme-blue': 'Blue',
//   'theme-green': 'Green',
//   ...
// }

// Get only card theme choices with class names
const cardChoices = chatCardsAPI.getThemeChoicesWithClassNames('card');

// Get only announcement theme choices with class names
const announcementChoices = chatCardsAPI.getThemeChoicesWithClassNames('announcement');
```

**Benefits:**
- Store CSS class names directly in settings
- Use setting value directly in templates: `<div class="blacksmith-card {{cardTheme}}">`
- No ID-to-class-name conversion needed
- More efficient (no API calls during rendering)

**Convenience methods** (no type argument needed):
- `chatCards.getCardThemeChoicesWithClassNames()` — card themes only
- `chatCards.getAnnouncementThemeChoicesWithClassNames()` — announcement themes only

Use these for separate dropdowns: e.g. one setting for “round/announcement” cards (announcement themes only) and one for “turn/regular” cards (card themes only).

#### `chatCards.getTheme(themeId)`

Get a specific theme by ID:

```javascript
const theme = chatCardsAPI.getTheme('blue');
// Returns: { id: 'blue', name: 'Blue', className: 'theme-blue', type: 'card', description: 'Blue accent theme' }
```

#### `chatCards.getThemeClassName(themeId)`

Get the CSS class name for a theme ID:

```javascript
const className = chatCardsAPI.getThemeClassName('blue');
// Returns: 'theme-blue'

// Use in template:
const html = `<div class="blacksmith-card ${className}">...</div>`;
```

**Note:** If you use `getThemeChoicesWithClassNames()` for settings, you won't need this method for conversion.

### Example: Creating a Theme Dropdown (Recommended Approach)

**Using CSS class names directly** (recommended for new code). **Important:** Theme choices come from the Chat Cards API, which is available asynchronously. Register settings in a `ready` hook and **await** your choices so the API is available:

```javascript
// Register settings in ready (not init) so Blacksmith API is available
export const registerSettings = async () => {
    const blacksmith = await BlacksmithAPI.get();
    const chatCardsAPI = blacksmith?.chatCards;
    
    if (!chatCardsAPI) {
        console.warn('Blacksmith Chat Cards API not available');
        return;
    }
    
    // Store CSS class names directly in settings
    game.settings.register('my-module', 'cardTheme', {
        name: 'Chat Card Theme',
        hint: 'Choose the theme for chat cards created by this module',
        scope: 'world',
        config: true,
        type: String,
        default: 'theme-default',  // CSS class name, not ID
        choices: chatCardsAPI.getCardThemeChoicesWithClassNames()  // Keys are CSS class names
    });
    
    // Separate setting for announcements — use announcement themes only
    game.settings.register('my-module', 'announcementTheme', {
        name: 'Announcement Theme',
        hint: 'Choose the theme for round/announcement cards',
        scope: 'world',
        config: true,
        type: String,
        default: 'theme-announcement-green',
        choices: chatCardsAPI.getAnnouncementThemeChoicesWithClassNames()
    });
};

// In your module's ready hook, await registration before using any settings
Hooks.once('ready', async () => {
    await registerSettings();
    // Now safe to read game.settings.get(MODULE.ID, 'cardTheme') etc.
});

// In your Handlebars template (my-card.hbs):
// <div class="blacksmith-card {{cardTheme}}">
//     <div class="card-header">My Card</div>
//     <div class="section-content">Content here</div>
// </div>

// In your template rendering - use setting value directly (no conversion)
async function renderMyCard(data) {
    const themeClassName = game.settings.get('my-module', 'cardTheme') || 'theme-default';
    
    const templateData = {
        ...data,
        cardTheme: themeClassName  // Pass directly to template
    };
    
    const html = await foundry.applications.handlebars.renderTemplate(
        'modules/my-module/templates/my-card.hbs',
        templateData
    );
    
    await ChatMessage.create({
        content: html,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
}
```

### Example: Alternative Approach (Using Theme IDs)

If you prefer to store theme IDs and convert them when rendering:

```javascript
// In your module's settings registration
Hooks.once('init', () => {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    
    if (chatCardsAPI) {
        game.settings.register('my-module', 'cardTheme', {
            name: 'Chat Card Theme',
            hint: 'Choose the theme for chat cards created by this module',
            scope: 'world',
            config: true,
            type: String,
            default: 'default',  // Theme ID
            choices: chatCardsAPI.getThemeChoices('card')  // Keys are theme IDs
        });
    }
});

// In your template rendering - convert ID to class name
async function renderMyCard(data) {
    const chatCardsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    const themeId = game.settings.get('my-module', 'cardTheme') || 'default';
    const themeClassName = chatCardsAPI?.getThemeClassName(themeId) || 'theme-default';
    
    const templateData = {
        ...data,
        themeClassName: themeClassName
    };
    
    const html = await foundry.applications.handlebars.renderTemplate(
        'modules/my-module/templates/my-card.hbs',
        templateData
    );
    
    await ChatMessage.create({
        content: html,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
}
```

## Support

For issues or questions:
- Check the Blacksmith module documentation
- Review existing Blacksmith card templates for examples
- Test with the provided theme options
- Ensure your module structure matches FoundryVTT conventions

---

**Note:** This guide covers the HTML/CSS framework for chat cards. The Chat Cards API provides programmatic access to themes. A future API will provide programmatic methods for creating, updating, and managing chat cards. For now, use the template rendering approach described above.
