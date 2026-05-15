# Coffee Pub Blacksmith — Design System

> **Audience:** Human developers and AI coding assistants building or maintaining modules in the Coffee Pub ecosystem.
> **Version:** Blacksmith 13.6.1 | Foundry VTT 13–14
> **Module ID:** `coffee-pub-blacksmith`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Organization](#2-file-organization)
3. [CSS Custom Properties (Tokens)](#3-css-custom-properties-tokens)
4. [Color Palette](#4-color-palette)
5. [Typography](#5-typography)
6. [Spacing & Layout](#6-spacing--layout)
7. [Border Radius](#7-border-radius)
8. [Z-Index Hierarchy](#8-z-index-hierarchy)
9. [Animations & Transitions](#9-animations--transitions)
10. [Component Library](#10-component-library)
11. [Naming Conventions](#11-naming-conventions)
12. [How Child Modules Extend Blacksmith](#12-how-child-modules-extend-blacksmith)
13. [Handlebars Template Patterns](#13-handlebars-template-patterns)
14. [JavaScript Patterns](#14-javascript-patterns)
15. [Known Inconsistencies](#15-known-inconsistencies)
16. [Quick Reference: AI Code Generation Cheatsheet](#16-quick-reference-ai-code-generation-cheatsheet)

---

## 1. Architecture Overview

Blacksmith is the **core foundation module** for all `coffee-pub-*` modules. It provides:

- A shared CSS design system loaded globally into Foundry VTT
- A card/message theming system used by all child modules for chat output
- A fixed top menubar that child modules can add items to
- A canvas pin system
- Utility APIs exposed on `game.modules.get('coffee-pub-blacksmith').api`

All styles are loaded from `styles/default.css`, which `@import`s every other CSS file. Child modules do **not** re-import these files — they inherit everything automatically.

**Required dependencies:** `socketlib`, `lib-wrapper`

---

## 2. File Organization

```
coffee-pub-blacksmith/
├── styles/
│   ├── default.css               ← Master entry point (@imports everything)
│   ├── vars.css                  ← Design tokens — loaded FIRST (spacing, color, type, radius, shadow)
│   ├── common.css                ← :root layout variables, chat/scene cleanup
│   ├── cards-common-layout.css   ← Base card component (layout + typography)
│   ├── cards-common-themes.css   ← Card theme color overrides (ONLY colors here)
│   ├── cards-xp.css              ← XP-specific card styles
│   ├── cards-stats.css           ← Stats card styles
│   ├── cards-skill-check.css     ← Skill check card styles
│   ├── menubar.css               ← Primary and secondary menubar
│   ├── menubar-combatbar.css     ← Combat-specific secondary bar
│   ├── window-common.css         ← Shared dialog/window styles + tooltips
│   ├── window-*.css              ← Feature-specific window styles
│   ├── timer-*.css               ← Timer components (combat, planning, round)
│   ├── pins.css                  ← Canvas pin system
│   ├── sidebar-*.css             ← Sidebar styling variants
│   ├── links-themes.css          ← Content link and inline roll styling
│   ├── overrides-foundry.css     ← Foundry VTT core overrides
│   ├── overrides-modules.css     ← Third-party module overrides
│   └── [feature].css             ← One file per feature
├── templates/
│   ├── cards-common.hbs          ← Root chat card template (routes all card types)
│   ├── card-*.hbs                ← Specific card layouts
│   ├── window-*.hbs              ← Dialog/window templates
│   ├── timer-*.hbs               ← Timer templates
│   └── partials/
│       ├── unified-header.hbs    ← Shared dialog header partial
│       ├── menubar-combat.hbs    ← Combat bar partial
│       └── menubar-secondary-default.hbs
├── scripts/
│   ├── const.js                  ← MODULE and BLACKSMITH constants
│   ├── blacksmith.js             ← Main module entry point
│   ├── common.js                 ← Shared utilities
│   ├── api-*.js                  ← Public API modules
│   ├── manager-*.js              ← Internal feature managers
│   ├── ui-*.js                   ← UI controllers
│   ├── window-*.js               ← Dialog/window classes
│   ├── timer-*.js                ← Timer feature scripts
│   └── utility-*.js              ← Shared helper functions
└── module.json
```

**Rule:** One CSS file per feature area. Layout properties go in `*-layout.css`; colors go in `*-themes.css`. Never mix them.

---

## 3. CSS Custom Properties (Tokens)

All primitive tokens are defined in `styles/vars.css`, which is the first file imported by `default.css`. They are available globally in Foundry VTT — child modules do not need to import anything.

**Rule for new code:** Never write a hardcoded color, spacing value, font size, border radius, or box-shadow in new CSS. Always reference a token from `vars.css`. If no token fits, add one to `vars.css` first.

### 3.0 Spacing Tokens

Defined in `vars.css`. Use these for all padding, margin, and gap values in new CSS. Do not write bare pixel values for spacing — pick the nearest step.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-space-xs` | `2px` | Micro gaps — icon padding, hairline margins |
| `--blacksmith-space-sm` | `4px` | Tight spacing — icon margins, dense rows |
| `--blacksmith-space-md` | `8px` | Standard padding — buttons, compact elements |
| `--blacksmith-space-lg` | `12px` | Section padding — card internals, form groups |
| `--blacksmith-space-xl` | `20px` | Section separation — between major content blocks |

**Rounding guide for existing values:** 2px→xs, 4px→sm, 6px→md, 8px→md, 10px→lg, 12px→lg, 16px→xl, 20px→xl

**Child module usage:**
```css
padding: var(--blacksmith-space-lg);
gap: var(--blacksmith-space-sm);
margin-bottom: var(--blacksmith-space-xl);
```

---

### 3.1 Card System Tokens

Defined in `cards-common-layout.css`. These are the master defaults — themes override them by scoping the same variable names to a class.

```css
/* ---- Card Container ---- */
--blacksmith-card-bg: #ffffff;
--blacksmith-card-border: #594a3c;
--blacksmith-card-text: #594a3c;

/* ---- Card Header ---- */
--blacksmith-card-header-text: #594a3c;

/* ---- Section Header ---- */
--blacksmith-card-section-header-text: #481515;
--blacksmith-card-section-header-border: rgba(0, 0, 0, 0.2);

/* ---- Section Subheader ---- */
--blacksmith-card-section-subheader-text: #481515;
--blacksmith-card-section-subheader-bg: rgba(0, 0, 0, 0.1);

/* ---- Section Content ---- */
--blacksmith-card-section-content-text: #594a3c;

/* ---- Interactive States ---- */
--blacksmith-card-hover-color: #c15701;

/* ---- Buttons ---- */
--blacksmith-card-button-text: #594a3c;
--blacksmith-card-button-border: #999;
--blacksmith-card-button-hover-bg: rgba(0, 0, 0, 0.1);
--blacksmith-card-button-container-bg: rgba(0, 0, 0, 0.05);

/* ---- Generic backgrounds/borders (section-dark variant) ---- */
--blacksmith-card-background: rgba(0, 0, 0, 0.08);
--blacksmith-card-border-color: rgba(0, 0, 0, 0.05);
```

### 3.2 Menubar Tokens

Defined in `menubar.css`. All proportional sizing uses these as roots.

```css
/* ---- Primary Bar Geometry ---- */
--blacksmith-menubar-primary-height: 30px;
--blacksmith-menubar-secondary-height: 0px;           /* overridden by JS */
--blacksmith-menubar-total-height: calc(var(--blacksmith-menubar-primary-height) + var(--blacksmith-menubar-secondary-height));
--blacksmith-menubar-zone-height: calc(var(--blacksmith-menubar-primary-height) - 2px);
--blacksmith-menubar-interface-offset: calc(var(--blacksmith-menubar-total-height) + 2px);
--blacksmith-menubar-divider-height: calc(var(--blacksmith-menubar-primary-height) - 12px);

/* ---- Primary Bar Colors ---- */
--blacksmith-menubar-backgroundcolor-middle: rgba(32, 20, 20, 0.9);
--blacksmith-menubar-backgroundcolor-endzones: rgba(16, 8, 8, 0.9);
--blacksmith-menubar-border-endzones: 1px solid rgba(0, 0, 0, 0.9);
--blacksmith-menubar-backgroundcolor-divider: rgba(255, 255, 255, 0.3);

/* ---- Primary Bar Typography ---- */
--blacksmith-menubar-fontsize: .9em;
--blacksmith-menubar-iconsize: .85em;
--blacksmith-menubar-fontcolor: rgba(240, 240, 224, 0.8);

/* ---- Primary Bar Gaps ---- */
--blacksmith-menubar-gap-endzones: 12px;
--blacksmith-menubar-gap-middle: 4px;

/* ---- Middle Zone Buttons ---- */
--blacksmith-menubar-middle-buttoncolor: rgba(21, 9, 1, 0.9);
--blacksmith-menubar-middle-bordercolor: rgba(255, 255, 255, 0.1);
--blacksmith-menubar-middle-color: rgba(240, 240, 224, 0.9);
--blacksmith-menubar-middle-hover-buttoncolor: rgba(97, 41, 4, 0.4);
--blacksmith-menubar-middle-hover-color: rgba(255, 100, 0, 0.7);
--blacksmith-menubar-middle-active-buttoncolor: rgba(124, 62, 10, 0.8);
--blacksmith-menubar-middle-active-bordercolor: rgba(0, 0, 0, 0.1);
--blacksmith-menubar-middle-active-hover-buttoncolor: rgba(48, 24, 29, 1);

/* ---- Secondary Bar ---- */
--blacksmith-menubar-secondary-combat-height: 60px;
--blacksmith-menubar-secondary-default-height: 0px;
--blacksmith-menubar-secondary-top-paddding-offset: 4px;
--blacksmith-menubar-secondary-edge-offset: 10px;
--blacksmith-menubar-secondary-fontcolor: rgba(240, 240, 224, 0.8);
--blacksmith-menubar-secondary-buttoncolor: rgba(0, 0, 0, 0.8);
--blacksmith-menubar-secondary-bordercolor: rgba(255, 255, 255, 0.1);
--blacksmith-menubar-secondary-backgroundcolor: rgba(0, 0, 0, 0.8);

/* ---- Secondary Bar Responsive Sizing (clamp-based) ---- */
--secondary-bar-item-font-size: clamp(12px, calc(var(--blacksmith-menubar-secondary-height) * 0.40), 100px);
--secondary-bar-item-icon-size: clamp(8px, calc(var(--blacksmith-menubar-secondary-height) * 0.40), 50px);
--secondary-bar-item-image-size: 100%;
--secondary-bar-item-padding-hor: clamp(6px, calc(var(--blacksmith-menubar-secondary-height) * 0.12), 10px);
--secondary-bar-item-padding-ver: clamp(2px, calc(var(--blacksmith-menubar-secondary-height) * 0.1), 8px);
--secondary-bar-item-gap: clamp(4px, calc(var(--blacksmith-menubar-secondary-height) * 0.10), 12px);
```

### 3.3 Window/Dialog Tokens

Defined in `window-common.css`.

```css
--element-radius: 4px;
--container-opacity: 0.85;
```

### 3.4 Layout Tokens (Scene/Chat)

Defined in `common.css`.

```css
--intChatSpacing: 3px;
--strHideRollTableIcon: block;
--strSceneTextAlign: center;
--strScenePaddingLeft: 10px;
--strScenePaddingRight: 10px;
--strScenePaddingTop: inherit;
--strScenePaddingBottom: inherit;
--strSceneFontSize: 1.0em;
--intScenePanelHeight: 300px;
--sidebar-scene-height: var(--intScenePanelHeight);
```

### 3.5 Pin System Tokens

Defined in `pins.css`. Some are set by JavaScript at runtime.

```css
--blacksmith-pin-icon-size-ratio: 0.60;         /* icon is 60% of pin size */
--blacksmith-pin-around-text-size-ratio: 0.22;
--blacksmith-pin-square-border-radius: 15%;
--blacksmith-pin-drop-shadow: drop-shadow(0 0px 5px rgba(0, 0, 0, 0.9));
--pin-size-px: 53px;                            /* set by JS */
--gm-badge-size: calc(var(--pin-size-px, 53px) * 0.14);
--marker-position: 50%;                         /* set by JS */
```

### 3.6 Link Tokens

Defined in `links-themes.css`.

```css
--a-content-link-color: #191814;
--a-content-link-background: #dddddd;
--a-content-link-border: #4b4a45;
--a-content-link-hover-background: #dddddd;
--a-content-link-hover-border: #4b4a45;
--a-content-link-box-shadow-color: #4f4a4a;
--a-content-link-box-shadow-border: 0px;
--a-content-link-i-color: #7a7972;
--a-content-link-border-radius: 0px;
--a-content-link-text-transform: none;
```

### 3.7 Timer Tokens

Defined inline within `timer-combat.css` and `timer-planning.css`.

```css
--progress-color: rgba(5, 255, 5, 0.7);    /* default / running */
--progress-color: rgba(243, 0, 0, 0.9);    /* expired state */
--background-color: rgba(255, 255, 255, 0.4);
```

---

## 4. Color Palette

### 4.1 Core Brand Browns (Primary Palette)

These are the dominant warm tones used across all text, borders, and headers.

| Token / Usage | Hex Value |
|---|---|
| Primary text / body | `#594a3c` |
| Dark header text | `#481515` |
| Deep dark accent | `#461313` |
| Alt brown text | `#5b4630` |
| Dark golden brown (header) | `#6e4d1f` |
| Deep brown accent | `#5d3d16` |
| Light border (images) | `#d5ccc7` |
| Header background | `#d7d0c7` |
| Medium tan | `#c4bcaa` |
| Light beige header | `#e4ddd9` |
| Alt light beige | `#ddd3ce` |
| Off-white content | `#f6f1ed` |
| Pure white | `#ffffff` |

### 4.2 Accent / Interactive Colors

| Usage | Value |
|---|---|
| Primary hover / accent orange | `#c15701` |
| Medium gray-brown | `rgba(161, 148, 118, 0.8)` |
| Border brown | `#8d8061` |
| Message divider | `rgba(161, 148, 118, 0.8)` |

### 4.3 Semantic Status Colors

| Status | Value |
|---|---|
| Success / healing green | `#629602` |
| Damage red | `#d63737` |
| Dark red / expired | `#8b0000` |
| Fumble / critical failure red | `#952023` |
| Warning orange | `#aa6000` |
| Info blue | `#3c6685` |
| Hover / link blue | `#1e3f8f` |

### 4.4 Combat Timer Bar States

| State | Value |
|---|---|
| High (lots of time) | `#0e8a0e` (green) |
| Medium | `#b6b630` (yellow) |
| Low | `#920e0e` (dark red) |
| Expired | `#4a0707` (very dark red) |

### 4.5 Dark Window / Dialog Colors

These are used in dark-background windows (the Blacksmith main dialog, toolbars).

| Usage | Value |
|---|---|
| Main window background | `#222222` |
| Button background | `#313030` |
| Button base (dark) | `#0e0c0c` |
| Dark border | `#4b4b4b` |
| Light body text | `#bdbdae` |
| Medium gray text | `#ada39d` |
| Hover highlight yellow | `#f4eb72` |
| Selected / accent green | `#a4c76a` |

### 4.6 Card Theme Background Colors

| Theme Class | Background | Use Case |
|---|---|---|
| `theme-default` | `rgba(0, 0, 0, 0.05)` | General purpose |
| `theme-amber` | `rgba(191, 142, 63, 0.12)` | Warm / featured cards |
| `theme-orange` | `rgba(247, 140, 1, 0.1)` | Warnings / alerts |
| `theme-red` | `rgba(118, 31, 19, 0.1)` | Danger / combat |
| `theme-blue` | `rgba(0, 120, 212, 0.1)` | Info / arcane |
| `theme-green` | `rgba(0, 212, 64, 0.1)` | Success / nature |
| `theme-announcement-blue` | `rgba(0, 63, 88, 1.0)` | Full-color announcements |
| `theme-announcement-green` | `rgba(25, 49, 0, 1.0)` | Full-color announcements |
| `theme-announcement-red` | `rgba(97, 2, 2, 1.0)` | Full-color announcements |

**Announcement themes** use a solid/opaque background — they are meant to be visually dominant. Use sparingly.

---

## 5. Typography

### 5.1 Font Families

| Context | Font |
|---|---|
| Card body / general UI | `var(--dnd5e-font-roboto)` (Roboto) |
| General Foundry UI | `var(--font-primary)` (Signika) |
| Card headers | `"Modesto Condensed"` (bold, condensed display font) |

### 5.2 Type Scale (Card Context)

| Element | Size | Weight | Transform |
|---|---|---|---|
| `.card-header` | `1.5em` | `900` | — |
| `.section-subheader` | `1.3em` | `900` | uppercase |
| `.token-name` | `1.1em` | `900` | — |
| `.section-header` | `1.0em` | `900` | uppercase |
| Body / `.section-content` | `1.0em` | `400` | — |
| `.token-character` | `0.85em` | `100` | — |
| Buttons | `var(--font-size-13)` | `bold` | uppercase |
| `.stat-label` | `0.8em` | `200` | — |
| `.stat-value` | `0.8em` | `900` | — |
| List items `.li` | `0.9em` | `400` | — |
| `<pre>` blocks | `0.8em` | `400` | — |

### 5.3 Line Height

Cards use a tight `1.1` line-height. Table cells use `1.0`. Do not set `line-height` greater than `1.3` inside cards.

### 5.4 Markdown Class Overrides

When rendering markdown inside a card, use these classes (not bare HTML tags) to maintain the card's type scale:

| Class | Equivalent |
|---|---|
| `.markdown-h1` | h1 — `1.3em`, weight `900` |
| `.markdown-h2` | h2 — `1.1em`, weight `900` |
| `.markdown-h3` | h3 — `0.9em`, weight `900` |
| `.markdown-p` | p — `1.0em`, weight `400` |
| `.markdown-blockquote` | blockquote with left border |
| `.markdown-ul` | unordered list |
| `.markdown-ol` | ordered list (decimal-leading-zero) |
| `.markdown-hr` | horizontal rule (dotted) |

---

## 6. Spacing & Layout

### 6.1 Spacing Scale

All spacing in new CSS should use tokens from `vars.css`. See Section 3.0 for the full token table. Quick reference:

```css
--blacksmith-space-xs: 2px   /* micro gaps */
--blacksmith-space-sm: 4px   /* tight */
--blacksmith-space-md: 8px   /* standard */
--blacksmith-space-lg: 12px  /* section */
--blacksmith-space-xl: 20px  /* separation */
```

### 6.2 Common Spacing Patterns

| Context | Token |
|---|---|
| Icon margins, hairline gaps | `xs` |
| Button padding, dense row gaps | `sm` |
| Card padding, section content gaps | `md` |
| Section header margins, form group padding | `lg` |
| List indentation, major block separation | `xl` |

### 6.4 Section Table Layout

`.section-table` uses a fixed `1fr 2fr` grid: label column takes 1/3, content takes 2/3.

```css
.section-table {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 4px;
}
```

### 6.5 Token Portrait Sizes

| Usage | Size |
|---|---|
| `.container-user .token-image` | `32px` height |
| `.turn-portrait` (turn rows) | Defined per card, typically `40px` |

---

## 7. Border Radius

| Context | Value |
|---|---|
| Standard UI element | `4px` (matches `--element-radius`) |
| Base `.blacksmith-card` | `5px` |
| Themed card (any `theme-*`) | `4px` |
| Pill / round button | `16px` |
| Small inputs | `3px` |
| Pin shapes — square | `15%` |
| Pin shapes — circle | `50%` |

---

## 8. Z-Index Hierarchy

Respect this stacking order when placing new elements:

| Level | Value | Usage |
|---|---|---|
| Content base | `1` | Card overlays, general content |
| Secondary overlays | `2` | Images inside cards |
| Progress overlays | `3` | Bar fill overlays |
| Badges | `5` | MVP ribbon badges |
| Controls / labels | `10` | Text overlays, tooltips |
| Secondary menubar | `99` | |
| **Primary menubar** | **`100`** | Fixed top bar |
| Cinematic windows | `999` | Full-screen overlays |
| Quickview / toolbars | `1000` | Floating panels |
| Context menus / loading | `10000` | |
| Pin placement preview | `100000` | Must float over all UI |
| Global context menu | `999999` | Highest priority |

---

## 9. Animations & Transitions

### 9.1 Standard Transitions

Use these timing values consistently — do not invent new easing curves.

| Duration | Easing | Use Case |
|---|---|---|
| `0.15s ease` | ease | Quick icon/color feedback |
| `0.2s ease` | ease | Hover color changes |
| `0.2s ease-out` | ease-out | Fade-in appearances |
| `0.3s ease` | ease | Layout width/height changes |
| `0.3s ease-out` | ease-out | Collapse/expand sections |
| `0.4s ease-out` | ease-out | Loading overlays |

### 9.2 Named Keyframe Animations

| Name | Duration | Use Case |
|---|---|---|
| `cpb-shake-x` | 4s infinite | Fumble card shake (horizontal) |
| `cpb-shake-y` | 5s infinite | Critical success shake (vertical) |
| `cpb-pulse` | varies | Subtle scale pulse |
| `message-processing` | 2s infinite | AI/processing indicator (green pulse) |
| `cpb-progress-shimmer` | 2s infinite | Loading bar shimmer |
| `cpb-activity-spin` | 1.5s linear infinite | Spinner |
| `textPulse` | 1.6s ease-in-out infinite | Timer warning text (yellow) |
| `pulse-dead` | 2s ease-in-out infinite | Dead combatant |
| `pulse-border` | 1s infinite | Movement UI border |
| `planning-timer-low-pulse` | 2s ease-in-out infinite | Planning timer low warning |
| `blacksmith-pin-pulse` | 0.8s ease-out | Pin creation pulse |
| `blacksmith-pin-flash` | 0.5s ease-in-out | Pin highlight flash |
| `blacksmith-pin-glow` | 1.5s ease-in-out | Pin ambient glow |
| `blacksmith-pin-bounce` | 0.6s ease-in-out | Pin creation bounce |
| `blacksmith-pin-rotate` | 0.8s ease-in-out | Pin rotation |
| `blacksmith-pin-shake` | 0.5s ease-in-out | Pin shake |
| `blacksmith-pin-ripple` | 1s ease-out | Pin ripple wave |
| `blacksmith-pin-delete-fade` | 0.35s ease-out | Pin deletion fade |
| `blacksmith-pin-delete-dissolve` | 0.35s ease-out | Pin deletion dissolve |
| `blacksmith-pin-delete-scale-small` | 0.4s ease-in | Pin deletion scale-down |

---

## 10. Component Library

### 10.1 The Card System

The card system is the primary UI component. All chat messages from coffee-pub modules use `.blacksmith-card`.

#### Base Structure

```html
<div class="blacksmith-card theme-default">
  <div class="card-header">
    <i class="fas fa-star"></i> Card Title
  </div>
  <div class="section-content">
    <p>Body content goes here.</p>
  </div>
</div>
```

#### With Sections

```html
<div class="blacksmith-card theme-amber">
  <div class="card-header">
    <i class="fas fa-sword"></i> Combat Report
  </div>
  <div class="section-content">
    <div class="section-header">
      <i class="fas fa-chart-bar"></i> Statistics
    </div>
    <!-- section content -->
    <div class="section-subheader">Sub Group</div>
    <!-- sub content -->
  </div>
</div>
```

#### With Section Dark Background

```html
<div class="section-content section-dark">
  <!-- content gets subtle dark background + border -->
</div>
```

#### With Collapsible Content (Foundry built-in)

```html
<details class="collapsible">
  <summary class="summary card-header">
    <i class="fas fa-caret-down"></i> Collapsible Section
  </summary>
  <div class="collapsible-content">
    <p>Hidden by default content.</p>
  </div>
</details>
```

#### With Action Buttons

```html
<div class="blacksmith-chat-buttons">
  <button class="chat-button" data-action="accept">
    <i class="fas fa-circle-check"></i> Accept
  </button>
  <button class="chat-button" data-action="reject">
    <i class="fas fa-circle-xmark"></i> Reject
  </button>
</div>
```

#### With Actor Info Row

```html
<div class="container-user">
  <img class="token-image" src="path/to/portrait.webp" />
  <div class="token-text-wrapper">
    <span class="token-name">Thorin Ironforge</span>
    <span class="token-character">Fighter / Level 5</span>
  </div>
</div>
```

#### Data Table (2-column key/value grid)

```html
<div class="section-table">
  <div class="row-label">Damage</div>
  <div class="row-content">14 Slashing</div>
  <div class="row-label label-dimmed">Missed</div>
  <div class="row-content">AC 18 not reached</div>
  <div class="row-label label-highlighted">Critical</div>
  <div class="row-content">Double dice!</div>
</div>
```

#### Card Theme Selection Guide

| Situation | Theme |
|---|---|
| General / neutral information | `theme-default` |
| Combat, danger, failure | `theme-red` |
| Success, loot, positive events | `theme-green` |
| Arcane, info, planning | `theme-blue` |
| Warnings, caution | `theme-orange` |
| Premium / featured content | `theme-amber` |
| Session-wide announcements (dark bg) | `theme-announcement-blue/green/red` |

### 10.2 Menubar

The menubar is a fixed `position: fixed; top: 0` bar with z-index 100. It has three zones:

```
[ LEFT ZONE ] ←→ [ MIDDLE ZONE (tools + notifications) ] ←→ [ RIGHT ZONE ]
```

The Foundry interface is offset by `--blacksmith-menubar-interface-offset` to avoid being hidden under the bar.

**Left/Right zones:** Fixed-width "end zones" with slightly darker background (`rgba(16, 8, 8, 0.9)`).

**Middle zone:** Flexible, holds tool buttons, notification badges, dividers.

#### Menubar Button Types

| Class | Description |
|---|---|
| `.button.button-active` | Clickable tool button |
| `.tool-readonly` | Display-only, non-interactive |
| `.tool-active` | Active / selected state |

#### Menubar Divider Types

```html
<div class="menu-divider"><div class="line"></div></div>
<div class="menu-divider"><div class="dotted"></div></div>
<div class="menu-divider"><div class="double"></div></div>
<div class="menu-divider"><div class="groove"></div></div>
<div class="menu-divider"><div class="ridge"></div></div>
```

#### Secondary Bar Structure

```html
<div class="blacksmith-menubar-secondary" data-bar-type="combat">
  <div class="secondary-bar-toolbar">
    <div class="secondary-bar-zone secondary-bar-zone-left">...</div>
    <div class="secondary-bar-zone secondary-bar-zone-middle">...</div>
    <div class="secondary-bar-zone secondary-bar-zone-right">...</div>
  </div>
</div>
```

#### Secondary Bar Item Types

```html
<!-- Image button -->
<div class="secondary-bar-item secondary-bar-item-image">
  <img src="..." />
  <span class="secondary-bar-item-label">Label</span>
</div>

<!-- Info display -->
<div class="secondary-bar-item secondary-bar-item-info">
  <span class="secondary-bar-item-label">HP</span>
  <span>45 / 60</span>
</div>

<!-- Progress bar -->
<div class="secondary-bar-item secondary-bar-item-progressbar">
  <!-- bar contents -->
</div>
```

### 10.3 Tooltip Component

```html
<span class="tooltip-item">
  Hover me
  <span class="tooltiptext">Tooltip text appears here after 0.75s</span>
</span>
```

Tooltip text boxes are `250px` wide, positioned above the trigger, with a `0.75s` fade-in delay. Background is `#3b3b3b`, text is `#ffffff`.

### 10.4 Toggle Switch

```html
<div class="cpb-toggle-container">
  <label class="cpb-toggle-label">Feature Name</label>
  <label class="cpb-toggle">
    <input type="checkbox" name="featureEnabled" />
    <span class="cpb-toggle-slider"></span>
  </label>
</div>
```

### 10.5 Dialog / Window Header (Unified Header)

Dialogs use a sticky header partial (`templates/partials/unified-header.hbs`):

```html
<div class="cpb-dialog-header-sticky">
  <div class="cpb-dialog-header">
    <div class="cpb-dialog-header-content">
      <div class="cpb-actor-info">
        <img class="cpb-actor-portrait" src="..." />
        <span class="cpb-actor-name">Actor Name</span>
      </div>
      <div class="cpb-dialog-title-section">
        <h2 class="cpb-dialog-main-title">Window Title</h2>
        <p class="cpb-dialog-subtitle">Subtitle text</p>
      </div>
      <div class="cpb-dialog-controls">
        <!-- control buttons -->
      </div>
    </div>
  </div>
</div>
```

### 10.6 Token Background Tiles

Predefined background tile classes for use on containers:

```
.token-background-themecolor   (transparent)
.token-background-parchment
.token-background-clothlight
.token-background-clothdark
.token-background-brick
.token-background-cobblestone
.token-background-dessert
.token-background-stonefloor
.token-background-rock
.token-background-stone
.token-background-grass
.token-background-dirt
```

All tile images are in `images/tiles/*.webp`. Applied as `background-repeat: repeat`.

### 10.7 Canvas Pin System

Pins live on a custom canvas layer:

```html
<div class="blacksmith-pins-overlay" data-hidden="true">
  <div class="blacksmith-pin"
       data-shape="circle"          <!-- circle | square | none -->
       data-icon-type="fa"          <!-- fa | text | image -->
       data-gm-only-access="false"
       data-no-shadow="false">
    <div class="blacksmith-pin-icon">
      <i class="fas fa-skull"></i>
    </div>
  </div>
</div>
```

Pin size is controlled entirely via the `--pin-size-px` CSS variable set by JavaScript.

### 10.8 Combat Timer Bar

```html
<div class="combat-timer-container">
  <div class="combat-timer-progress">
    <div class="combat-timer-bar high"><!-- fill width set by JS --></div>
    <span class="combat-timer-text">0:45</span>
  </div>
</div>
```

State classes: `.high` → `.medium` → `.low` → `.expired` — applied by JS as time decreases.

### 10.9 Damage Ratio Bar

```html
<div class="damage-ratio-bar">
  <div class="ratio-bar-background">
    <div class="ratio-segment ratio-segment-red" style="width: 40%"></div>
    <div class="ratio-segment ratio-segment-green" style="width: 60%"></div>
  </div>
  <div class="ratio-marker" style="left: 40%"></div>
  <i class="ratio-icon-left fas fa-shield"></i>
  <i class="ratio-icon-right fas fa-sword"></i>
</div>
```

### 10.10 Drop Zone

For drag-and-drop areas:

```html
<div class="panel-drop-zone">
  <div class="drop-zone-content">
    <i class="fas fa-upload"></i>
    <span>Drop item here</span>
  </div>
</div>
```

On dragover, JS adds `.dragover` class which changes background to `rgba(0, 100, 0, 0.2)`.

---

### 10.11 Window Buttons

Canonical button components for all Blacksmith windows. Defined in `window-template.css`. Use these instead of module-specific button classes.

**Three variants:**

| Class | Role | Visual |
|---|---|---|
| `.blacksmith-window-btn-primary` | Primary / confirm action | Green (`rgba(41,94,47,0.9)`), 300px wide |
| `.blacksmith-window-btn-secondary` | Secondary / utility action | Dark (`rgba(33,40,46,0.9)`) |
| `.blacksmith-window-btn-critical` | Destructive / danger action | Red (`rgba(120,30,30,0.9)`) |

All three variants share: `padding: 8px 12px`, `border-radius: 4px`, `text-transform: uppercase`, `font-family: inherit`. Hover state is orange (`rgba(255,100,0,0.6)`) for all variants. Disabled state: `opacity: 0.6; cursor: not-allowed`.

```html
<!-- Primary: main confirm action -->
<button type="button" class="blacksmith-window-btn-primary" data-action="save">
  <i class="fa-solid fa-floppy-disk"></i> Save
</button>

<!-- Secondary: utility/cancel -->
<button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
  <i class="fa-solid fa-xmark"></i> Cancel
</button>

<!-- Critical: destructive action -->
<button type="button" class="blacksmith-window-btn-critical" data-action="delete">
  <i class="fa-solid fa-trash"></i> Delete
</button>
```

Place buttons in `actionBarLeft` (secondary) and `actionBarRight` (primary/critical) in the window data object.

---

### 10.12 Toggle Switch

Canonical pill toggle for boolean settings. Defined in `window-form-controls.css`. Replaces `blacksmith-pin-config-toggle` and `artificer-toggle`.

```html
<!-- Standalone -->
<label class="blacksmith-toggle">
  <input type="checkbox" class="blacksmith-toggle-input" {{checked}}>
  <span class="blacksmith-toggle-slider"></span>
</label>

<!-- With label row -->
<div class="blacksmith-toggle-row">
  <span class="blacksmith-toggle-label">Show Labels</span>
  <label class="blacksmith-toggle">
    <input type="checkbox" class="blacksmith-toggle-input">
    <span class="blacksmith-toggle-slider"></span>
  </label>
</div>
```

Size: 46×24px pill. Thumb travels 22px on check. Checked state uses `--blacksmith-window-accent-color` border. Hover state: orange glow.

---

### 10.13 Badge / Tag Pill

Inline pill label for counts, tags, and status indicators. Defined in `window-form-controls.css`.

```html
<span class="blacksmith-badge">Label</span>
<span class="blacksmith-badge blacksmith-badge-accent">12</span>
<span class="blacksmith-badge blacksmith-badge-success">Active</span>
<span class="blacksmith-badge blacksmith-badge-danger">Error</span>
<span class="blacksmith-badge blacksmith-badge-warning">Pending</span>
```

Variants: `blacksmith-badge-accent` (gold), `blacksmith-badge-success` (green), `blacksmith-badge-danger` (red), `blacksmith-badge-warning` (amber).

---

### 10.14 Tab Bar

Multi-section navigation strip. Defined in `window-tabs.css`. Designed for `optionBarLeft` or `toolsContent` in the window template.

```html
<nav class="blacksmith-tabs">
  <button type="button" class="blacksmith-tab is-active"
          data-action="selectTab" data-value="overview">
    <i class="fa-solid fa-chart-pie"></i><span>Overview</span>
  </button>
  <button type="button" class="blacksmith-tab"
          data-action="selectTab" data-value="details">
    <i class="fa-solid fa-list"></i><span>Details</span>
  </button>
</nav>
```

Window JS state drives `.is-active`. Body content re-renders on tab switch — no hidden panels. Active tab: gold accent border/text. Hover: subtle bg highlight.

---

### 10.15 Range Slider

Native `input[type="range"]` with dark styled track and thumb. Defined in `window-form-controls.css`. Uses webkit and moz pseudo-elements.

```html
<div class="blacksmith-slider">
  <i class="fa-solid fa-volume-low"></i>
  <input type="range" min="0" max="100" value="50">
  <span>50%</span>
</div>
```

The icon and `<span>` are optional. Track: `rgba(148,140,123,0.3)`. Thumb: dark circle with `--blacksmith-window-accent-color` border. Thumb hover: orange glow.

---

### 10.16 List Row

Thumbnail + title + meta + action row. Defined in `window-list.css`. Replaces `minstrel-list-row`, `crafting-ingredient-row`, and `gather-result-item`.

```html
<div class="blacksmith-list">
  <div class="blacksmith-list-row">
    <img class="blacksmith-list-row-img" src="..." alt="">
    <div class="blacksmith-list-row-main">
      <div class="blacksmith-list-row-title">Item Name</div>
      <div class="blacksmith-list-row-meta">Category · Detail</div>
    </div>
    <div class="blacksmith-list-row-action">
      <button type="button" class="blacksmith-window-btn-secondary" data-action="pan">Pan</button>
    </div>
  </div>
</div>
```

The `.blacksmith-list-row-img`, `.blacksmith-list-row-meta`, and `.blacksmith-list-row-action` zones are optional. Add `.is-active` for selected state. Add `.blacksmith-list-row-img-lg` for 48px thumbnail. Use `.blacksmith-list-empty` for zero-state messaging.

---

### 10.17 Panel Card

Self-contained widget with optional header. Defined in `window-panels.css`. Different from `.blacksmith-window-section` (which is a content divider) — a panel card is a discrete widget that can be column-slotted or floated.

```html
<div class="blacksmith-panel-card">
  <div class="blacksmith-panel-card-header">
    <span class="blacksmith-panel-card-title">Inventory</span>
    <div class="blacksmith-panel-card-header-actions">
      <button ...>Add</button>
    </div>
  </div>
  <div class="blacksmith-panel-card-body">
    <!-- content -->
  </div>
</div>
```

Add a color variant modifier to theme the card:

```html
<div class="blacksmith-panel-card blacksmith-panel-card-variant-danger">
```

Available variants: `danger`, `success`, `warning`, `info`, `music`, `environment`, `oneshot`, `timeline`. Each reads its own `--blacksmith-variant-*-border` and `--blacksmith-variant-*-bg` tokens from `vars.css`.

---

### 10.18 Detail Row and Stat Tile

Two complementary display patterns for named property values. Defined in `window-panels.css`.

**Detail row** — horizontal label/value pairs. Label is fixed-width accent text; value has dark pill bg.

```html
<div class="blacksmith-detail-rows">
  <div class="blacksmith-detail-row">
    <span class="blacksmith-detail-label">Duration</span>
    <span class="blacksmith-detail-value">8 hours</span>
  </div>
  <div class="blacksmith-detail-row">
    <span class="blacksmith-detail-label">Components</span>
    <span class="blacksmith-detail-value">Iron, Coal</span>
  </div>
</div>
```

**Stat tile** — centered scoreboard grid for numeric metrics.

```html
<div class="blacksmith-stat-scoreboard">
  <div class="blacksmith-stat-tile">
    <span class="blacksmith-stat-tile-label">Batches</span>
    <span class="blacksmith-stat-tile-value">12</span>
  </div>
  <div class="blacksmith-stat-tile">
    <span class="blacksmith-stat-tile-label">Gold Cost</span>
    <span class="blacksmith-stat-tile-value">240</span>
  </div>
</div>
```

Tiles flex-grow equally; min-width `3rem`. Label: `0.65em` uppercase accent. Value: `1.2em` bold white.

---

### 10.19 Multi-Column Body Layout

CSS grid wrapper for multi-panel windows. Defined in `window-template.css`. Replaces ad-hoc workspace grids in Minstrel and Artificer.

```html
<div class="blacksmith-body-columns blacksmith-body-columns-3"
     style="--blacksmith-body-col-1: 260px; --blacksmith-body-col-3: 320px;">
  <div><!-- left column --></div>
  <div><!-- center column (1fr by default) --></div>
  <div><!-- right column --></div>
</div>
```

Place directly inside `.blacksmith-window-template-body`. Column counts: `blacksmith-body-columns-2`, `-3`, `-4`. Each column defaults to `1fr`; override per-column with `--blacksmith-body-col-N`. Columns are separated by a 1px divider rendered via background on the grid. Each child fills its column with `overflow: hidden` — add your own scroll on child elements.

---

### 10.20 Color Variant Tokens

Defined in `vars.css` under `COLOR: VARIANT PALETTE`. Each variant has two tokens: `-border` (45% opacity) and `-bg` (12% opacity).

| Variant | Border token | Bg token |
|---|---|---|
| `danger` | `--blacksmith-variant-danger-border` | `--blacksmith-variant-danger-bg` |
| `success` | `--blacksmith-variant-success-border` | `--blacksmith-variant-success-bg` |
| `warning` | `--blacksmith-variant-warning-border` | `--blacksmith-variant-warning-bg` |
| `info` | `--blacksmith-variant-info-border` | `--blacksmith-variant-info-bg` |
| `music` | `--blacksmith-variant-music-border` | `--blacksmith-variant-music-bg` |
| `environment` | `--blacksmith-variant-environment-border` | `--blacksmith-variant-environment-bg` |
| `oneshot` | `--blacksmith-variant-oneshot-border` | `--blacksmith-variant-oneshot-bg` |
| `timeline` | `--blacksmith-variant-timeline-border` | `--blacksmith-variant-timeline-bg` |

Child modules can define their own variant tokens in their root scope and create matching modifier classes.

---

## 11. Naming Conventions

### 11.1 CSS Class Naming

**Pattern:** `[prefix]-[component]-[element]--[modifier]`

| Prefix | Scope | Example |
|---|---|---|
| `.blacksmith-` | Main module styling, layout, structural | `.blacksmith-card`, `.blacksmith-menubar-container` |
| `.cpb-` | Chat card content, form elements, dialogs | `.cpb-chat-card`, `.cpb-toggle-container` |
| `.bh-` | Reserved — not currently in use | — |

**Modifiers / State Classes:**

| Pattern | Meaning |
|---|---|
| `.theme-[name]` | Color theme variant on a card |
| `.active` / `.tool-active` | Active or selected state |
| `.collapsed` | Hidden/collapsed state |
| `.hidden` | Display: none |
| `.expired` | Timer/state expired |
| `.warning` | Warning state |
| `.high` / `.medium` / `.low` | Graduated states (timer bars) |
| `.label-dimmed` | Dimmed table row label |
| `.label-highlighted` | Highlighted table row label |
| `.section-dark` | Alternate dark background for section-content |
| `.has-secondary` | Modifier on menubar container when secondary bar is visible |

**Do not use:** BEM double-underscores (`__`) — the codebase uses single dashes throughout.

### 11.2 CSS Variable Naming

**Pattern:** `--[module]-[component]-[property]`

| Prefix | Usage |
|---|---|
| `--blacksmith-card-*` | Card system tokens |
| `--blacksmith-menubar-*` | Menubar tokens |
| `--blacksmith-pin-*` | Pin system tokens |
| `--blacksmith-mvp-*` | MVP card tokens |
| `--secondary-bar-*` | Secondary bar responsive tokens |
| `--a-content-link-*` | Content link tokens |
| `--element-*` | Generic window/element tokens |

**Do not use** generic names like `--color` or `--bg` — always prefix with the module/component.

### 11.3 JavaScript File Naming

| Pattern | Role |
|---|---|
| `api-[feature].js` | Public API — methods exposed to child modules |
| `manager-[feature].js` | Internal feature manager (stateful, coordinates subsystems) |
| `ui-[feature].js` | UI controller (DOM interaction, event handling) |
| `window-[feature].js` | ApplicationV2 window class definition |
| `utility-[feature].js` | Stateless utility functions |
| `timer-[feature].js` | Timer feature scripts |
| `const.js` | Module constants (`MODULE`, `BLACKSMITH`) |
| `common.js` | Shared utilities used across scripts |
| `blacksmith.js` | Entry point — hooks registration only |
| `settings.js` | Settings registration |

### 11.4 JavaScript Function Naming

| Convention | Usage |
|---|---|
| `camelCase` | All functions and variables |
| `PascalCase` | Class names |
| `SCREAMING_SNAKE` | Constants (in `const.js`) |
| `str` prefix | String variables (e.g., `strCardTitle`) |
| `int` / `bln` prefix | Integer / boolean variables (e.g., `intScenePanelHeight`, `blnDebugOn`) |
| `get[Thing]()` | Getter/reader functions |
| `set[Thing]()` | Setter functions |
| `on[Event]()` | Event handler functions |
| `render[Component]()` | Functions that produce HTML/DOM output |
| `build[Component]()` | Functions that assemble data for rendering |

### 11.5 Handlebars Template Naming

| Pattern | Usage |
|---|---|
| `cards-common.hbs` | Root router template (routes by card type flags) |
| `card-[type].hbs` | Specific card layout (e.g., `card-stats-round-summary.hbs`) |
| `cards-[feature].hbs` | Group of related cards |
| `window-[feature].hbs` | Dialog/ApplicationV2 window template |
| `timer-[feature].hbs` | Timer overlay template |
| `partials/[name].hbs` | Reusable partial fragments |

---

## 12. How Child Modules Extend Blacksmith

### 12.1 CSS Inheritance

Child modules **do not** import or duplicate Blacksmith's CSS. All `:root` variables and `.blacksmith-*` classes are globally available.

**In your child module's CSS:**

```css
/* ✅ DO: Override a Blacksmith token scoped to your component */
.my-module-special-card {
    --blacksmith-card-hover-color: #8822ff;
    --blacksmith-card-bg: rgba(50, 0, 100, 0.08);
}

/* ✅ DO: Extend an existing component with a new modifier */
.blacksmith-card.theme-my-custom-theme {
    --blacksmith-card-bg: rgba(200, 100, 50, 0.1);
    --blacksmith-card-header-text: #3a1a00;
    /* ... all other --blacksmith-card-* variables */
}

/* ❌ DON'T: Duplicate Blacksmith layout rules */
/* ❌ DON'T: Override .blacksmith-card globally without a scoping class */
/* ❌ DON'T: Use hardcoded colors instead of tokens */
```

### 12.2 Creating a Custom Card Theme

To add a new theme to the card system in a child module:

```css
/* In your module's CSS file */
.blacksmith-card.theme-my-module-special {
    --blacksmith-card-bg: rgba(80, 20, 100, 0.1);
    --blacksmith-card-border: rgba(80, 20, 100, 0.15);
    --blacksmith-card-text: #2a0a3a;
    --blacksmith-card-header-text: #1a0028;
    --blacksmith-card-section-header-text: #1a0028;
    --blacksmith-card-section-header-border: rgba(80, 20, 100, 0.2);
    --blacksmith-card-section-subheader-text: #1a0028;
    --blacksmith-card-section-subheader-bg: rgba(80, 20, 100, 0.1);
    --blacksmith-card-section-content-text: #2a0a3a;
    --blacksmith-card-hover-color: rgba(140, 50, 200, 0.8);
    --blacksmith-card-button-text: #2a0a3a;
    --blacksmith-card-button-border: rgba(80, 20, 100, 0.4);
    --blacksmith-card-button-hover-bg: rgba(80, 20, 100, 0.12);
    --blacksmith-card-button-container-bg: rgba(80, 20, 100, 0.05);
}
```

Then use it in your Handlebars template:

```html
<div class="blacksmith-card theme-my-module-special">
  <div class="card-header"><i class="fas fa-hat-wizard"></i> Magic Card</div>
  <div class="section-content"><p>Content here.</p></div>
</div>
```

### 12.3 Adding to the Menubar (via API)

Do not manually inject HTML into the menubar. Use the exposed API:

```javascript
// After Blacksmith is ready
const blacksmithApi = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmithApi?.menubar) {
    blacksmithApi.menubar.addButton({
        id: 'my-module-tool',
        icon: 'fas fa-wand-magic-sparkles',
        tooltip: 'My Feature',
        onClick: () => { /* your handler */ }
    });
}
```

### 12.4 Using Blacksmith Constants

```javascript
import { MODULE } from './const.js'; // your module's const
// Blacksmith's constants are available via:
const bsModule = game.modules.get('coffee-pub-blacksmith');
```

### 12.5 Chat Card Pattern for Child Modules

When sending chat cards from a child module, use the Blacksmith card structure:

```javascript
// In your child module
const content = await renderTemplate(
    `modules/my-module/templates/my-card.hbs`,
    { /* template data */ }
);
ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker(),
    flags: { 'my-module': { cardType: 'my-type' } }
});
```

Your template (`my-card.hbs`) should use `.blacksmith-card` as the root container.

---

## 13. Handlebars Template Patterns

### 13.1 Standard Card Template Pattern

```handlebars
<div class="blacksmith-card {{#if theme}}theme-{{theme}}{{else}}theme-default{{/if}}">
  <div class="card-header">
    <i class="fas {{icon}}"></i> {{title}}
  </div>
  <div class="section-content">
    {{#if hasSection}}
      <div class="section-header">
        <i class="fas fa-list"></i> Section Name
      </div>
      <p>{{description}}</p>
    {{/if}}
  </div>
</div>
```

### 13.2 Conditional Rendering Pattern

Cards in `cards-common.hbs` use boolean flag properties to route content:

```handlebars
{{#if isPlanningStart}}
  <!-- planning start card -->
{{else if isTimerExpired}}
  <!-- timer expired card -->
{{else}}
  <!-- fallback / error card -->
{{/if}}
```

**Convention:** Boolean flags use `is[EventName]` or `has[Feature]` naming.

### 13.3 Partial Registration

Partials must be registered in `blacksmith.js` using:

```javascript
loadTemplates([
    'modules/coffee-pub-blacksmith/templates/partials/unified-header.hbs',
    // ...
]);
```

Child modules register their own partials in their own entry point.

### 13.4 Hiding the Foundry Message Header

All Blacksmith chat cards include this at the top of templates to hide the default Foundry chat header:

```handlebars
<span style="visibility: none">coffeepub-hide-header</span>
```

This is a CSS hook targeted by `overrides-foundry.css`. Include it in all chat card templates.

---

## 14. JavaScript Patterns

### 14.1 Module Constants

Every script imports constants from `const.js`:

```javascript
import { MODULE, BLACKSMITH } from './const.js';

// Usage
console.log(MODULE.ID);       // 'coffee-pub-blacksmith'
console.log(MODULE.TITLE);    // 'Coffee Pub Blacksmith'
console.log(MODULE.VERSION);  // '13.6.1'
```

### 14.2 Safe Settings Access

Never call `game.settings.get()` directly — use the safe wrappers from `api-core.js`:

```javascript
import { getSettingSafely, setSettingSafely } from './api-core.js';

const value = getSettingSafely('my-module', 'mySetting', defaultValue);
await setSettingSafely('my-module', 'mySetting', newValue);
```

These handle race conditions during module initialization and permission differences between GM and player.

### 14.3 Hook Registration Pattern

Hooks are registered in `blacksmith.js` (entry point). Feature logic lives in manager files:

```javascript
// blacksmith.js
Hooks.on('ready', () => ManagerFeature.initialize());
Hooks.on('createChatMessage', (msg) => ManagerFeature.onChatMessage(msg));

// manager-feature.js
export class ManagerFeature {
    static initialize() { /* setup */ }
    static onChatMessage(msg) { /* handle */ }
}
```

### 14.4 ApplicationV2 Window Pattern

New windows extend `window-base-v2.js`:

```javascript
// window-myfeature.js
import { WindowBase } from './window-base-v2.js';

export class MyFeatureWindow extends WindowBase {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'my-feature-window',
            template: `modules/${MODULE.ID}/templates/window-myfeature.hbs`,
            title: 'My Feature',
            width: 600,
        });
    }
    getData() { return { /* template data */ }; }
}
```

### 14.5 Debug Logging Pattern

```javascript
if (BLACKSMITH.blnDebugOn) {
    console.log(`${MODULE.TITLE} | MyManager | someFunction | message`);
}
```

Log format: `[Module Title] | [ClassName] | [functionName] | [message]`

---

## 15. Known Inconsistencies

These are real inconsistencies in the current codebase that should be standardized in future work.

### 15.1 CSS Variable Naming Prefixes (Mixed Conventions)

Some older variables use Hungarian-notation prefixes (`--intChatSpacing`, `--strHideRollTableIcon`) while newer variables use semantic names (`--blacksmith-card-bg`). **Standard going forward:** semantic names with `--blacksmith-[component]-[property]` pattern. The old `--int*` / `--str*` prefixed variables in `common.css` are legacy and should be migrated when those features are touched.

### 15.2 Hardcoded Colors vs. Token References

Several files (particularly `window-common.css`) use hardcoded hex values (`#222222`, `#313030`, `#4b4b4b`) that should be CSS variables for theming. These are concentrated in the dark-window styles. **Standard:** any repeated color should become a token.

### 15.3 Duplicate Layout Rules in `window-common.css`

`window-common.css` contains some duplicate rule blocks for the same selectors (e.g., `div#coffee-pub-blacksmith .window-content` is defined twice). There is also a comment acknowledging unorganized CSS near the bottom of the file: `/* THINGS BELOW HAVE NOT BEEN ORGANIZED */`. **Standard:** one rule per selector per file.

### 15.4 `cpb-` vs `blacksmith-` Prefix Usage

The `cpb-` prefix appears on both chat card classes (`.cpb-chat-card`) and UI components (`.cpb-toggle-container`, `.cpb-dialog-header`). This makes it ambiguous what `cpb-` scopes. **Standard going forward:** use `blacksmith-` for all new components regardless of type; reserve `cpb-` only for legacy chat card selectors.

### 15.5 Typography Not Fully Tokenized

Font sizes within cards are set as literal `em` values (`1.5em`, `1.3em`, etc.) rather than CSS variables. This makes it hard to adjust the overall type scale. **Standard:** future work should introduce `--blacksmith-card-font-*` tokens for each scale step.

### 15.6 No Standard Spacing Token Set

Padding and margin values (`6px`, `4px`, `10px`) are used directly throughout rather than referencing a spacing scale. **Standard:** consider introducing `--blacksmith-space-xs: 4px`, `--blacksmith-space-sm: 6px`, `--blacksmith-space-md: 10px` tokens.

### 15.7 Incomplete `.bh-` Namespace

The `.bh-` prefix is described as reserved but is referenced nowhere in the current codebase. Either adopt it (as the shortened form of `blacksmith`) or remove the reservation from documentation.

---

## 16. Quick Reference: AI Code Generation Cheatsheet

> Use this section to generate consistent, on-brand code quickly.

### Minimal Card (any chat message)
```html
<div class="blacksmith-card theme-default">
  <div class="card-header"><i class="fas fa-[icon]"></i> [Title]</div>
  <div class="section-content"><p>[Content]</p></div>
</div>
```

### Card with Data Table
```html
<div class="blacksmith-card theme-amber">
  <div class="card-header"><i class="fas fa-[icon]"></i> [Title]</div>
  <div class="section-content">
    <div class="section-table">
      <div class="row-label">[Label]</div><div class="row-content">[Value]</div>
    </div>
  </div>
</div>
```

### Card with Action Buttons
```html
<div class="blacksmith-card theme-green">
  <div class="card-header"><i class="fas fa-[icon]"></i> [Title]</div>
  <div class="section-content"><p>[Message]</p></div>
  <div class="blacksmith-chat-buttons">
    <button class="chat-button" data-action="[action]"><i class="fas fa-[icon]"></i> [Label]</button>
  </div>
</div>
```

### Card with Actor
```html
<div class="blacksmith-card theme-default">
  <div class="card-header"><i class="fas fa-[icon]"></i> [Title]</div>
  <div class="section-content">
    <div class="container-user">
      <img class="token-image" src="[portrait-path]" />
      <div class="token-text-wrapper">
        <span class="token-name">[Actor Name]</span>
        <span class="token-character">[Class / Info]</span>
      </div>
    </div>
    <p>[Content]</p>
  </div>
</div>
```

### Handlebars Dynamic Theme
```handlebars
<div class="blacksmith-card {{#if theme}}theme-{{theme}}{{else}}theme-default{{/if}}">
```

### CSS: New Custom Theme
```css
.blacksmith-card.theme-[name] {
    --blacksmith-card-bg: rgba(R, G, B, 0.1);
    --blacksmith-card-border: rgba(R, G, B, 0.07);
    --blacksmith-card-text: #[hex];
    --blacksmith-card-header-text: #[hex];
    --blacksmith-card-section-header-text: #[hex];
    --blacksmith-card-section-header-border: rgba(R, G, B, 0.2);
    --blacksmith-card-section-subheader-text: #[hex];
    --blacksmith-card-section-subheader-bg: rgba(R, G, B, 0.1);
    --blacksmith-card-section-content-text: #[hex];
    --blacksmith-card-hover-color: rgba(R, G, B, 0.8);
    --blacksmith-card-button-text: #[hex];
    --blacksmith-card-button-border: rgba(R, G, B, 0.4);
    --blacksmith-card-button-hover-bg: rgba(R, G, B, 0.12);
    --blacksmith-card-button-container-bg: rgba(R, G, B, 0.05);
}
```

### Spacing Token Quick Reference
```
--blacksmith-space-xs: 2px   ← micro (icon padding, hairlines)
--blacksmith-space-sm: 4px   ← tight (icon margins, dense rows)
--blacksmith-space-md: 8px   ← standard (buttons, compact elements)
--blacksmith-space-lg: 12px  ← section (card internals, form groups)
--blacksmith-space-xl: 20px  ← separation (between major blocks)
```

### JS: Safe Settings Pattern
```javascript
import { getSettingSafely, setSettingSafely } from './api-core.js';
const val = getSettingSafely(MODULE.ID, 'myKey', defaultValue);
await setSettingSafely(MODULE.ID, 'myKey', newValue);
```

### JS: Send Styled Chat Card
```javascript
const content = await renderTemplate(
    `modules/${MODULE.ID}/templates/my-card.hbs`,
    { theme: 'default', title: 'My Title', content: 'My content.' }
);
ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
```

### Available Theme Classes (copy-paste)
`theme-default` | `theme-amber` | `theme-orange` | `theme-red` | `theme-blue` | `theme-green` | `theme-announcement-blue` | `theme-announcement-green` | `theme-announcement-red`

### Available Token Background Classes
`token-background-themecolor` | `token-background-parchment` | `token-background-clothlight` | `token-background-clothdark` | `token-background-brick` | `token-background-cobblestone` | `token-background-dessert` | `token-background-stonefloor` | `token-background-rock` | `token-background-stone` | `token-background-grass` | `token-background-dirt`
