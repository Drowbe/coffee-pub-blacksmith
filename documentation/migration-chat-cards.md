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

## Themes

The theme system controls the color scheme of your card. Apply a theme by adding the theme class to the `.blacksmith-card` element.

### Available Themes

- **`theme-default`** - Light background, subtle borders
- **`theme-blue`** - Blue accent theme
- **`theme-green`** - Green accent theme
- **`theme-red`** - Red accent theme
- **`theme-orange`** - Orange accent theme
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

Then add custom CSS in your module's stylesheet:

```css
.my-module-card {
    /* Your custom styles */
}
```

**Important:** Always scope your custom styles to avoid conflicts:

```css
.my-module-card .section-content {
    /* Scoped to your module's cards only */
}
```

### Icon Usage

Icons use Font Awesome. Common icon classes:

- `fas fa-dice` - Dice icon
- `fas fa-check` - Checkmark
- `fas fa-times` - X mark
- `fas fa-info-circle` - Information
- `fas fa-exclamation-triangle` - Warning
- `fas fa-star` - Star
- `fas fa-users` - Users/Party
- `fas fa-sword` - Combat
- `fas fa-coins` - Loot/Currency

See [Font Awesome Icons](https://fontawesome.com/icons) for the full list.

## Best Practices

1. **Always use the base structure**: Start with `.blacksmith-card` and a theme class
2. **Use semantic classes**: Use `.card-header`, `.section-content`, `.section-header` for consistency
3. **Hide Foundry header**: Add the hide-header span at the beginning of your template
4. **Choose appropriate themes**: Match theme colors to your card's purpose (blue for info, red for warnings, etc.)
5. **Use data attributes**: Add `data-*` attributes to buttons and elements for event handling
6. **Scope custom CSS**: Always scope your custom styles to avoid conflicts with other modules
7. **Test with different themes**: Ensure your content is readable with all theme options
8. **Use Handlebars conditionals**: Use `{{#if}}` blocks to show/hide optional content

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

### Card Not Styling Correctly

- Ensure Coffee Pub Blacksmith module is active
- Check that you're using `.blacksmith-card` as the base class
- Verify a theme class is applied (e.g., `theme-default`)
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

## Next Steps

1. Create your Handlebars template file
2. Add the base HTML structure with appropriate theme
3. Add your content using the layout components
4. Render the template in your JavaScript code
5. Send the rendered HTML to chat
6. Add event handlers for interactive elements
7. Test with different themes and content

## Support

For issues or questions:
- Check the Blacksmith module documentation
- Review existing Blacksmith card templates for examples
- Test with the provided theme options
- Ensure your module structure matches FoundryVTT conventions

---

**Note:** This guide covers the HTML/CSS framework for chat cards. A future API will provide programmatic methods for creating, updating, and managing chat cards. For now, use the template rendering approach described above.
