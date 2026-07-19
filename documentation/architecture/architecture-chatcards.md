# Chat Cards Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes how Blacksmith's chat card system is built: the HTML/CSS contract, the theme system, and the current theme API. It is an architecture reference; for how to build cards in your own module, see `../api/api-chatcards.md`.

## Overview

The chat card system renders styled, themeable messages in the FoundryVTT chat log. There is no central card store — a "chat card" is an ordinary chat message whose HTML follows a fixed contract, so Blacksmith's CSS styles it. The pieces:

- **HTML contract** - semantic classes (`.blacksmith-card`, `.card-header`, `.section-content`, ...) that every card follows.
- **CSS layers** - layout and typography in one file, theme colors (CSS variables) in another, plus card-type-specific overrides (XP, skill check, stats).
- **Theme system** - named themes applied as `theme-{id}` classes; colors are CSS variables, so themes can be extended or overridden without touching layout.
- **Theme API** - `module.api.chatCards`: programmatic access to the theme list and class names, for dropdowns and templates.
- **Rendering** - consumers render a template to HTML and send it with `ChatMessage.create()`; the consumer owns the message lifecycle.

Target: FoundryVTT v13+.

## HTML contract

All Blacksmith-style cards share this structure so layout and themes apply consistently:

- **Root**: `<div class="blacksmith-card theme-{name}">` - required. `theme-{name}` selects the theme (e.g. `theme-default`, `theme-blue`, `theme-announcement-green`).
- **Header**: `<div class="card-header">` - optional; typically an icon and title. Uses "Modesto Condensed" and the theme header color.
- **Body**: `<div class="section-content">` - main content area.
- **Sections**: `<div class="section-header">`, `<div class="section-subheader">` - dividers with optional icons.
- **Data**: `<div class="section-table">` with `.row-label` and `.row-content` for key-value rows; variants `.label-dimmed`, `.label-highlighted`.
- **Actions**: `<div class="blacksmith-chat-buttons">` with `<button class="chat-button" data-action="...">`.

To hide Foundry's default chat message header, a template can start with:

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
```

Layout and semantics come from these classes; theme colors are applied via CSS variables scoped to `.blacksmith-card.theme-*`.

## CSS layers

- **`styles/cards-common-layout.css`** - base layout, spacing, typography, and default CSS-variable values (`:root`). Structure only; colors use variables so themes can override.
- **`styles/cards-common-themes.css`** - theme definitions only. Each theme is a selector like `.blacksmith-card.theme-default` that sets `--blacksmith-card-*` variables. No layout rules.
- **Card-type files** - `cards-xp.css`, `cards-skill-check.css`, `cards-stats.css` add styles for specific card types (XP, skill checks, combat/stats). These still contain hardcoded colors rather than the theme variables.

Card CSS is imported through `styles/default.css`. Theme variables resolve at use; layout variables can be set in `:root` or overridden per theme.

## Theme system

- **Types**: `card` (light background, dark text) and `announcement` (dark background, light header text).
- **Theme list**: defined in `scripts/api-chat-cards.js` as `CHAT_CARD_THEMES` (id, name, className, type, description). The current ids are `default`, `amber`, `blue`, `green`, `red`, `orange`, `announcement-green`, `announcement-blue`, `announcement-red`. Class names follow `theme-{id}`. Treat `CHAT_CARD_THEMES` as the source of truth rather than this list.
- **Variables** (per theme, in `cards-common-themes.css`): `--blacksmith-card-bg`, `--blacksmith-card-border`, `--blacksmith-card-text`, `--blacksmith-card-header-text`, `--blacksmith-card-section-header-text`, `--blacksmith-card-section-header-border`, `--blacksmith-card-section-subheader-*`, `--blacksmith-card-section-content-text`, `--blacksmith-card-hover-color`, `--blacksmith-card-button-*`, `--blacksmith-card-button-container-bg`. All prefixed `--blacksmith-card-` to avoid clashes.
- **Custom themes**: external modules or world CSS can add new `.blacksmith-card.theme-*` rules that set the same variables; the HTML contract does not change.

## Rendering flow

1. **Template** produces HTML that conforms to the contract (root `blacksmith-card` plus a theme class, header, section-content, ...).
2. **Data** - the caller passes title, icon, content, theme id, etc. into the template.
3. **Render** - the template renders to an HTML string; the theme class can come from `chatCards.getThemeClassName(themeId)`.
4. **Send** - the caller calls `ChatMessage.create({ content: html, ... })`. No Blacksmith API creates or updates the message today; the consumer owns its lifecycle.
5. **Display** - Foundry renders the message; Blacksmith CSS applies because the content carries the `.blacksmith-card` and theme classes.

## Theme API (current surface)

Exposed at `game.modules.get('coffee-pub-blacksmith')?.api?.chatCards` (and via the Blacksmith API bridge). Implemented in `scripts/api-chat-cards.js` (`ChatCardsAPI`), attached to `module.api.chatCards` in `blacksmith.js`. It is theme-only — it does not create, update, or delete messages:

- **getThemes([type])** - theme objects (id, name, className, type, description); optional filter by `'card'` or `'announcement'`.
- **getCardThemes()** / **getAnnouncementThemes()** - card vs announcement convenience.
- **getThemeChoices([type])** - `{ [themeId]: displayName }` for dropdowns.
- **getThemeChoicesWithClassNames([type])** - `{ [className]: displayName }` for templates that need the class name directly.
- **getTheme(themeId)** - single theme object, or null.
- **getThemeClassName(themeId)** - CSS class name for a theme id (e.g. `'theme-default'`).

A broader posting API — create/update/delete for themed cards — does not exist; the surface is theme-only. Render your own HTML against the contract and send it with `ChatMessage.create()`. Method-level documentation lives in `../api/api-chatcards.md`.

## Integration points

| Concern | Location / mechanism |
|--------|----------------------|
| HTML contract | `.blacksmith-card`, `.theme-*`, `.card-header`, `.section-*`, `.section-table`, `.blacksmith-chat-buttons` |
| Layout & base variables | `styles/cards-common-layout.css` |
| Theme colors | `styles/cards-common-themes.css` (per-theme variable blocks) |
| Card-type styles | `styles/cards-xp.css`, `styles/cards-skill-check.css`, `styles/cards-stats.css` |
| Theme list & API | `scripts/api-chat-cards.js` (`CHAT_CARD_THEMES`, `ChatCardsAPI`); `module.api.chatCards` in `blacksmith.js` |
| Style loading | `styles/default.css` |
| Rendering | caller renders template -> HTML string -> `ChatMessage.create({ content: html, ... })` |
| API reference | `../api/api-chatcards.md` |
