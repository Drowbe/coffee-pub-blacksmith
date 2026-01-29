# Chat Cards Architecture

This document describes how Blacksmith's chat card system is built: HTML/CSS contract, theme system, current API, and how internal changes or new features are migrated. It is an architecture reference; for usage (how to create cards in your module) see `migration-guide-chat-cards.md`; for API method details see `api-chat-cards.md`.

## Overview

The chat card system provides a consistent, themeable way to render styled messages in the FoundryVTT chat log. It consists of:

- **HTML structure** – Semantic classes (`.blacksmith-card`, `.card-header`, `.section-content`, etc.) that define the card contract.
- **CSS layers** – Layout and typography in one place, theme colors via CSS variables, and card-type-specific overrides (XP, skill check, stats).
- **Theme system** – Named themes (default, blue, green, red, orange, announcement-*) applied as classes; colors are CSS variables so themes can be extended or overridden.
- **Theme API** – Programmatic access to theme lists and class names for dropdowns and templates (`module.api.chatCards`).
- **Rendering** – Consumers (Blacksmith or other modules) render Handlebars templates to HTML and send them via `ChatMessage.create()`. There is no central “card store”; cards are chat messages with a specific HTML/CSS contract.

**Target**: FoundryVTT v13+. Application V2 is used where dialogs or forms are involved; chat card output is HTML in chat messages.

---

## Current Architecture

### HTML Contract

All Blacksmith-style chat cards share a common structure so layout and themes apply consistently.

- **Root**: `<div class="blacksmith-card theme-{name}">` — required. `theme-{name}` selects the theme (e.g. `theme-default`, `theme-blue`, `theme-announcement-green`).
- **Header**: `<div class="card-header">` — optional; typically includes an icon and title. Uses “Modesto Condensed” and theme header color.
- **Body**: `<div class="section-content">` — main content area.
- **Sections**: `<div class="section-header">`, `<div class="section-subheader">` — dividers with optional icons.
- **Data**: `<div class="section-table">` with `.row-label` and `.row-content` for key-value rows; variants `.label-dimmed`, `.label-highlighted`.
- **Actions**: `<div class="blacksmith-chat-buttons">` with `<button class="chat-button">` for actions. Use `data-action` (and optional other attributes) for event handling.

To hide Foundry’s default chat message header, the template can start with:

```html
<span style="visibility: hidden">coffeepub-hide-header</span>
```

Layout and semantics are defined by these classes; theme colors are applied via CSS variables scoped to `.blacksmith-card.theme-*`.

### CSS Layers

- **`styles/cards-layout.css`** – Base layout, spacing, typography, and default values for CSS variables (`:root`). Defines `.blacksmith-card`, `.card-header`, `.section-*`, `.section-table`, `.blacksmith-chat-buttons`, etc. Layout and structure only; colors use variables so themes can override.
- **`styles/cards-themes.css`** – Theme definitions only. Each theme is a selector like `.blacksmith-card.theme-default`, `.blacksmith-card.theme-blue`, `.blacksmith-card.theme-announcement-green`, etc., setting `--blacksmith-card-bg`, `--blacksmith-card-header-text`, and other `--blacksmith-card-*` variables. No layout rules.
- **Card-type-specific** – `cards-xp.css`, `cards-skill-check.css`, `cards-stats.css` add styles for specific card types (XP, skill checks, combat/stats). These may still use hardcoded colors; see “Migration (internal)” below.
- **Legacy** – `cards-layout-legacy.css` and `cards-themes-legacy.css` support older card markup during migration. New cards should use the main layout and theme files.

Load order (in `default.css`): legacy first, then `cards-layout.css`, then `cards-themes.css`, then card-type-specific files. Theme variables are resolved at use; layout variables can be set in `:root` or overridden per theme.

### Theme System

- **Types**: `card` (light backgrounds, dark text) and `announcement` (dark backgrounds, light header text).
- **Theme list**: Defined in `scripts/api-chat-cards.js` as `CHAT_CARD_THEMES` (id, name, className, type, description). Class names follow `theme-{id}` (e.g. `theme-default`, `theme-announcement-green`).
- **Variables** (in `cards-themes.css` per theme): e.g. `--blacksmith-card-bg`, `--blacksmith-card-border`, `--blacksmith-card-text`, `--blacksmith-card-header-text`, `--blacksmith-card-section-header-text`, `--blacksmith-card-section-header-border`, `--blacksmith-card-section-subheader-*`, `--blacksmith-card-section-content-text`, `--blacksmith-card-hover-color`, `--blacksmith-card-button-*`, `--blacksmith-card-button-container-bg`. All prefixed with `--blacksmith-card-` to avoid clashes.
- **Custom themes**: External modules or world CSS can add new `.blacksmith-card.theme-*` rules that set the same variables; the HTML contract does not change.

### Rendering Flow

1. **Template** – A Handlebars (or other) template produces HTML that conforms to the HTML contract (e.g. `blacksmith-card`, a theme class, card-header, section-content, etc.).
2. **Data** – The caller passes data (title, icon, content, theme id, etc.) into the template.
3. **Render** – Foundry’s Handlebars (or equivalent) renders the template to a string. Theme class can be chosen via `chatCards.getThemeClassName(themeId)`.
4. **Send** – The caller creates a chat message with that HTML as content (`ChatMessage.create({ content: html, ... })`). No Blacksmith API currently creates or updates the message; the consumer owns the message lifecycle.
5. **Display** – Foundry renders the message in the chat log; our CSS applies because the message content includes the `.blacksmith-card` and theme classes.

So the “architecture” is: contract (HTML + CSS variables) + theme API (theme list and class names) + consumer-owned rendering and `ChatMessage.create`. There is no separate “chat card document” or card store; a “chat card” is a chat message whose content follows the contract.

### API Surface (Current)

- **Exposure**: `game.modules.get('coffee-pub-blacksmith')?.api?.chatCards` (and via Blacksmith API bridge). Implemented in `scripts/api-chat-cards.js`; class `ChatCardsAPI` is attached to `module.api.chatCards` in `blacksmith.js`.
- **Theme-only**: The current API is theme-focused. It does not create, update, or delete chat messages.
  - **getThemes([type])** – Array of theme objects (id, name, className, type, description); optional filter by `'card'` or `'announcement'`.
  - **getCardThemes()** / **getAnnouncementThemes()** – Convenience for card vs announcement.
  - **getThemeChoices([type])** – `{ [themeId]: displayName }` for dropdowns (e.g. Foundry settings).
  - **getThemeChoicesWithClassNames([type])** – `{ [className]: displayName }` for templates that need the class name directly.
  - **getTheme(themeId)** – Single theme object or null.
  - **getThemeClassName(themeId)** – CSS class name for a theme id (e.g. `'theme-default'`).

This supports dropdowns, settings, and template helpers; it does not yet provide `create`, `update`, or `delete` for chat card messages.

---

## Migration (Internal Changes and Improvements)

When changing or improving the chat card system internally (e.g. refactoring CSS or adding features), follow these patterns.

### Migrating Card CSS to the Theme System

Card-type-specific files (`cards-xp.css`, `cards-skill-check.css`, `cards-stats.css`) may still use hardcoded colors. Migrating them to the theme system keeps styling consistent and themeable.

**Principle**: Replace hardcoded colors with CSS variables. Prefer existing theme variables where they match; add new variables only when needed (e.g. semantic success/failure, or card-type-specific accents).

**Steps**:

1. **Identify usages** – In each card file, find `color`, `background`, `border-color`, etc. that are literal values.
2. **Map to variables** – Use existing `--blacksmith-card-*` variables from `cards-themes.css` where the meaning matches (e.g. text → `--blacksmith-card-text`, section header → `--blacksmith-card-section-header-text`). See `api-chat-cards.md` or `cards-themes.css` for the full list.
3. **Add variables only when necessary** – If a color is semantic (e.g. success green, failure red) or card-specific (e.g. XP row background), add a new variable:
   - In `cards-layout.css` under `:root` and/or in theme blocks in `cards-themes.css`, define e.g. `--blacksmith-card-xp-row-bg`, `--blacksmith-card-success-color`. Document whether it is themeable or global.
   - In the card file, use `var(--blacksmith-card-...)`.
4. **Semantic colors** – Decide per variable whether it should be theme-dependent or fixed (e.g. success/failure might stay consistent across themes). If theme-dependent, add it to each theme in `cards-themes.css`.
5. **Test** – Run each card type under several themes; ensure no regressions and that new variables resolve correctly.

**Files and priorities** (detailed checklist below):

- **cards-skill-check.css** – High priority; many hardcoded colors (section headers, buttons, semantic critical/fumble/success, roll results). Replace with theme variables first, then add any skill-check-specific variables.
- **cards-xp.css** – XP row, content text, semantic colors (e.g. gained, level up). Add XP-specific or semantic variables as above.
- **cards-stats.css** – Stats headers, borders, semantic and state colors. Replace generic text with theme variables; add stats-specific variables where needed.

**Existing theme variables** (full list for migration): `--blacksmith-card-bg`, `--blacksmith-card-border`, `--blacksmith-card-text`, `--blacksmith-card-header-text`, `--blacksmith-card-section-header-text`, `--blacksmith-card-section-header-border`, `--blacksmith-card-section-subheader-text`, `--blacksmith-card-section-subheader-bg`, `--blacksmith-card-section-content-text`, `--blacksmith-card-hover-color`, `--blacksmith-card-button-text`, `--blacksmith-card-button-border`, `--blacksmith-card-button-hover-bg`, `--blacksmith-card-button-container-bg`.

**Naming**: New variables should be prefixed with `--blacksmith-card-` and, if card-type-specific, a suffix (e.g. `--blacksmith-card-xp-row-bg`). Keep layout/spacing in layout files; keep color definitions in theme/layout variable blocks.

#### Card CSS migration checklist (detailed)

Use this checklist when performing the migration. Line numbers may shift as files change; treat as approximate.

**1. `styles/cards-xp.css`** — Status: needs migration.

- Line 25: `background-color: rgba(145, 133, 107, 0.2)` (XP row background)
- Line 41: `color: rgba(20, 20, 20, 0.9)` (XP content text)
- Lines 78, 90: `color: rgba(178, 32, 32, 0.9)` (resolution icon, monster points)
- Line 107: `background: rgba(0,0,0,0.03)` (player item background)
- Line 143: `color: #18520b` (XP gained – semantic success)
- Line 148: `color: rgba(62, 18, 18, 0.9)` (total XP)
- Line 162: `color: rgba(223, 87, 0, 0.9)` (level up – semantic warning)

Recommendation: Add XP-specific variables (e.g. `--blacksmith-card-xp-row-bg`, `--blacksmith-card-xp-content-text`, `--blacksmith-card-xp-points-color`, `--blacksmith-card-xp-player-item-bg`, `--blacksmith-card-xp-gained-color`, `--blacksmith-card-xp-total-color`, `--blacksmith-card-xp-level-up-color`) in `:root` / `cards-layout.css` and per theme in `cards-themes.css`, or reuse existing theme/semantic variables where appropriate.

**2. `styles/cards-skill-check.css`** — Status: needs migration (high priority; most instances).

- **Section headers (use existing theme variables):** Lines 15–25 `.cpb-card-section-header`: `color: #481515` → `var(--blacksmith-card-section-header-text)`, `border-bottom` → `var(--blacksmith-card-section-header-border)`. Lines 31–42 `.cpb-card-section-subheader`: `color` → `var(--blacksmith-card-section-subheader-text)`, `background` → `var(--blacksmith-card-section-subheader-bg)`.
- **Button colors:** Lines 49–50, 57, 292, 302, 316, 388 – replace with theme variables or add `--blacksmith-card-skill-button-bg`, `--blacksmith-card-skill-button-text`, `--blacksmith-card-skill-button-border`, `--blacksmith-card-skill-button-hover-bg`, `--blacksmith-card-skill-button-icon-color`.
- **Semantic (critical/fumble/success/tie):** Lines 67–68, 75–80, 87–88, 95–100, 189, 192, 207–212, 215–216, 227–233 – add or use `--blacksmith-card-success-color`, `--blacksmith-card-failure-color`, `--blacksmith-card-warning-color`, `--blacksmith-card-tie-color` (or keep hardcoded if not themeable).
- **Roll results:** Lines 145–146, 152, 167, 244, 255, 268, 270, 332 – use existing theme variables where appropriate; add roll-specific variables for unique colors.

**3. `styles/cards-stats.css`** — Status: needs migration.

- Replace generic text with `var(--blacksmith-card-text)` or `var(--blacksmith-card-section-content-text)` (e.g. lines 12, 59, 144, 174, 203, 300, 325).
- Headers, borders, semantic/state colors throughout (e.g. lines 20, 32, 41, 51, 87, 93, 109–111, 117, 131, 164, 179, 184, 189, 194, 217–218, 223, 232, 260, 307, 319, 329, 362, 374, 377). Add stats-specific variables for header backgrounds (`rgb(215, 208, 199)`), border (`#d5ccc7`), stat value colors (`#461313`), and semantic success/failure/warning where needed.

**Migration strategy (order of work):**

1. Add new CSS variables to `:root` in `cards-layout.css` and define them in each theme in `cards-themes.css`.
2. Replace hardcoded colors: start with `cards-skill-check.css`, then section headers and generic text, then card-specific/semantic variables.
3. Decide whether semantic colors (success/failure/warning) are themeable; if yes, add to theme system; if no, keep hardcoded and document.
4. Test each card type with all themes; verify no visual regressions.

**Notes:** Some colors may be intentionally hardcoded for semantic meaning (e.g. red for failure, green for success); document if kept. Layout, spacing, and typography stay in layout files, not theme files. All new variables use the `--blacksmith-card-` prefix.

### Other Internal Migrations

- **Legacy cards** – When converting an old card to the new structure, change its markup to the HTML contract above and ensure it uses a theme class. Remove or reduce reliance on legacy layout/themes once no messages depend on them.
- **New card types** – Add a new card-type CSS file only if needed; prefer reusing layout and theme variables. If the new type is used by the API or core features, consider documenting it in this file and in the usage guide.

---

## Emerging Chat Card API

The current API is **theme-only**: it exposes theme metadata and class names so modules can build and style their own chat card HTML. A broader **chat card API** is planned to align with patterns used elsewhere (e.g. pins): programmatic creation and management of chat card messages.

### Current: Theme API

- **Purpose**: Support dropdowns, settings, and template rendering with correct theme class names.
- **Surface**: `chatCards.getThemes`, `chatCards.getThemeChoices`, `chatCards.getThemeClassName`, etc., as described above.
- **Stability**: Theme IDs and class names are part of the contract; new themes can be added with new IDs/classes.

### Planned: Full Chat Card API (Emerging)

Planned directions (see also `TODO.md`) include:

- **create / update / delete** – `chatCards.create()`, `chatCards.update()`, `chatCards.delete()`, etc., to create or modify chat messages that follow the Blacksmith card contract, so external modules can post cards without manually calling `ChatMessage.create` and assembling HTML.
- **Templates and card types** – Support for registering or selecting card templates (e.g. by type or name) and rendering them with a consistent data shape, possibly with default theme and layout.
- **Integration** – Tighter integration with Blacksmith’s roll system and skill check system (e.g. standard card types for rolls, skill checks, combat stats), while still allowing custom card types and themes.

Design details (signatures, options, and storage of card metadata if any) are to be defined as the API emerges. This architecture doc will be updated when the create/update/delete surface and template/card-type model are settled. Until then, consumers should use the theme API for styling and continue to render their own HTML and call `ChatMessage.create()` for sending cards.

---

## Integration Points (Summary)

| Concern | Location / mechanism |
|--------|----------------------|
| HTML contract | `.blacksmith-card`, `.theme-*`, `.card-header`, `.section-*`, `.section-table`, `.blacksmith-chat-buttons` (see migration-guide-chat-cards.md) |
| Layout & base variables | `styles/cards-layout.css` |
| Theme colors | `styles/cards-themes.css` (per-theme variable blocks) |
| Card-type styles | `styles/cards-xp.css`, `styles/cards-skill-check.css`, `styles/cards-stats.css` |
| Theme list & API | `scripts/api-chat-cards.js` (`CHAT_CARD_THEMES`, `ChatCardsAPI`); `module.api.chatCards` in `blacksmith.js` |
| Style loading | `styles/default.css` imports layout and theme files |
| Rendering | Caller renders template → HTML string → `ChatMessage.create({ content: html, ... })` |
| Usage guide | `migration-guide-chat-cards.md` (how to build cards in your module) |
| API reference | `api-chat-cards.md` (method-level documentation) |
| Card CSS migration | This doc, “Migration (internal)” → “Card CSS migration checklist (detailed)” |

---

**Last updated**: Current session  
**Status**: Theme API stable; full create/update/delete API planned (emerging).
