# Card CSS Migration to Theme System

This document outlines the migration needed to convert hardcoded colors in card-specific CSS files to use the new CSS variable theme system.

## Overview

The card system now uses CSS variables defined in:
- `styles/cards-layout.css` - Layout, spacing, typography (uses CSS variables)
- `styles/cards-themes.css` - Theme color definitions (CSS variables only)

All card-specific CSS files need to migrate hardcoded colors to use the theme system.

## Files Requiring Migration

### 1. `styles/cards-xp.css`

**Status:** Needs Migration

**Hardcoded Colors to Replace:**
- Line 25: `background-color: rgba(145, 133, 107, 0.2)` - XP row background
- Line 41: `color: rgba(20, 20, 20, 0.9)` - XP content text
- Line 78, 90: `color: rgba(178, 32, 32, 0.9)` - Resolution icon and monster points (red)
- Line 107: `background: rgba(0,0,0,0.03)` - Player item background
- Line 143: `color: #18520b` - XP gained (green - semantic success color)
- Line 148: `color: rgba(62, 18, 18, 0.9)` - Total XP
- Line 162: `color: rgba(223, 87, 0, 0.9)` - Level up (orange - semantic warning color)

**Recommendation:**
- Add XP-specific CSS variables to `:root` in `cards-layout.css`:
  - `--blacksmith-card-xp-row-bg`
  - `--blacksmith-card-xp-content-text`
  - `--blacksmith-card-xp-points-color` (for monster points)
  - `--blacksmith-card-xp-player-item-bg`
  - `--blacksmith-card-xp-gained-color` (or use semantic success color)
  - `--blacksmith-card-xp-total-color`
  - `--blacksmith-card-xp-level-up-color` (or use semantic warning color)
- Or reuse existing theme variables where appropriate
- Define these in each theme in `cards-themes.css`

---

### 2. `styles/cards-skill-check.css`

**Status:** Needs Migration (HIGH PRIORITY - Most instances)

**Hardcoded Colors to Replace:**

#### Section Headers (Should use existing theme variables):
- Lines 15-25: `.cpb-card-section-header`
  - `color: #481515` → `var(--blacksmith-card-section-header-text)`
  - `border-bottom: 1px dotted rgba(0, 0, 0, 0.2)` → `var(--blacksmith-card-section-header-border)`
- Lines 31-42: `.cpb-card-section-subheader`
  - `color: #481515` → `var(--blacksmith-card-section-subheader-text)`
  - `background: rgba(0, 0, 0, 0.1)` → `var(--blacksmith-card-section-subheader-bg)`

#### Button Colors:
- Lines 49-50: `.cpb-skill-roll` - `background: #782e22`, `color: #fff`, `border: 1px solid #782e22`
- Line 57: `.cpb-skill-roll:hover` - `background: #8a3b2f`
- Line 302: Button icon `color: #782e22`
- Line 388: Skill roll icon `color: #782e22`
- Line 292: Button text `color: #594a3c` → `var(--blacksmith-card-button-text)`
- Line 316: Button hover `background: rgba(0, 0, 0, 0.1)` → `var(--blacksmith-card-button-hover-bg)`

**Recommendation:**
- Add button-specific variables:
  - `--blacksmith-card-skill-button-bg`
  - `--blacksmith-card-skill-button-text`
  - `--blacksmith-card-skill-button-border`
  - `--blacksmith-card-skill-button-hover-bg`
  - `--blacksmith-card-skill-button-icon-color`

#### Semantic Colors (Critical/Fumble/Success/Failure):
- Lines 67-68: Critical success background/border (green)
- Lines 75-80: Critical text colors (green)
- Lines 87-88: Fumble background/border (red)
- Lines 95-100: Fumble text colors (red)
- Line 189: Success icon `color: #18520b` (green)
- Line 192: Failure icon `color: #aa0200` (red)
- Lines 207-212: Success/failure container colors
- Lines 215-216: Tie container colors
- Lines 227-233: Success/failure/tie text colors

**Recommendation:**
- Add semantic color variables (these may or may not be themeable):
  - `--blacksmith-card-success-color`
  - `--blacksmith-card-failure-color`
  - `--blacksmith-card-warning-color`
  - `--blacksmith-card-tie-color`
- Or keep as hardcoded if they should remain consistent across themes

#### Roll Result Colors:
- Lines 145-146: `.cpb-roll-result` background/border
- Line 152: Actor name `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 167: Roll total `color: #461313`
- Line 244: Versus separator `color: #aa0200`
- Line 255: Versus skill `color: rgba(72, 21, 21, 0.9)`
- Line 268: Pending roll border `border: 1px solid #999` → `var(--blacksmith-card-button-border)`
- Line 270: Pending roll background `background: rgba(0, 0, 0, 0.05)` → `var(--blacksmith-card-button-container-bg)`
- Line 332: Group pending text `color: #666666`

**Recommendation:**
- Use existing theme variables where appropriate
- Add roll-specific variables for unique colors

---

### 3. `styles/cards-stats.css`

**Status:** Needs Migration

**Hardcoded Colors to Replace:**
- Line 12: `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 20: `color: #461313`
- Line 32: `background: rgba(255, 255, 255, 0.6)`, `border: 1px solid rgba(0, 0, 0, 0.2)`
- Line 41: `border: 2px solid #d5ccc7`
- Line 51: `color: #461313`
- Line 59: `color: #594a3c` → `var(--blacksmith-card-text)`
- Lines 87, 254, 357: `color: rgba(72, 21, 21, 0.9)` - Header text
- Line 93: `background-color: rgb(215, 208, 199)` - Header background
- Lines 109-111: Stat type colors (combat, damage, healing) - Semantic colors
- Line 117: `background: rgba(176, 169, 163, 0.3)`, `border: 1px solid rgba(138, 133, 128, 0.1)`
- Line 131: `border: 2px solid #d5ccc7`
- Line 144: `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 164: `background-color: #629602` - Rank tag (green)
- Line 174: `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 179: `color: #8b0000` - Expired (red - semantic)
- Line 184: `color: #666666` - Skipped (gray)
- Line 189: `color: #629602` - Crit (green - semantic)
- Line 194: `color: #952023` - Fumble (red - semantic)
- Line 203: `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 217: `color: #4a8f52` - Quick turn (green - semantic)
- Line 218: `color: #8b0000` - Expired turn (red - semantic)
- Line 223: `background: #d5ccc7` - Progress bar
- Line 232: `background: #4a8f52` - Progress fill (green - semantic)
- Line 260: `background-color: rgb(215, 208, 199)` - Moment card header
- Line 300: `color: rgba(89, 74, 60, 0.9)` → `var(--blacksmith-card-text)`
- Line 307: `color: rgba(158, 48, 47. 0.9)` - Target (red)
- Line 319: `color: #461313` - Amount
- Line 325: `color: #594a3c` → `var(--blacksmith-card-text)`
- Line 329: `background: rgba(255, 255, 255, 0.3)`
- Line 362: `background-color: rgb(215, 208, 199)` - Round stat card header
- Line 374: `color: #461313` - Round stat value
- Line 377: `color: #8b0000` - Expired (red - semantic), `color: #666666` - Skipped (gray)

**Recommendation:**
- Replace generic text colors with `var(--blacksmith-card-text)` or `var(--blacksmith-card-section-content-text)`
- Add stats-specific variables for:
  - Header backgrounds (`rgb(215, 208, 199)`)
  - Border colors (`#d5ccc7`)
  - Stat value colors (`#461313`)
- Consider semantic color variables for success/failure/warning states
- Use existing theme variables where colors match

---

## Migration Strategy

### Step 1: Add New CSS Variables
1. Add card-specific variables to `:root` in `cards-layout.css`
2. Define these variables in each theme in `cards-themes.css`

### Step 2: Replace Hardcoded Colors
1. Start with `cards-skill-check.css` (highest priority - most instances)
2. Replace section headers to use existing theme variables
3. Replace generic text colors with theme variables
4. Add new variables for card-specific colors

### Step 3: Semantic Colors Decision
- Decide if semantic colors (success/failure/warning) should be themeable
- If yes: Add semantic color variables to theme system
- If no: Keep as hardcoded but document why

### Step 4: Testing
- Test each card type with all themes
- Ensure colors are appropriate for each theme
- Verify no visual regressions

---

## Existing Theme Variables Available

These variables are already defined and can be used:
- `--blacksmith-card-bg` - Card background
- `--blacksmith-card-border` - Card border
- `--blacksmith-card-text` - General text color
- `--blacksmith-card-header-text` - Card header text
- `--blacksmith-card-section-header-text` - Section header text
- `--blacksmith-card-section-header-border` - Section header border
- `--blacksmith-card-section-subheader-text` - Subheader text
- `--blacksmith-card-section-subheader-bg` - Subheader background
- `--blacksmith-card-section-content-text` - Section content text
- `--blacksmith-card-hover-color` - Hover color
- `--blacksmith-card-button-text` - Button text
- `--blacksmith-card-button-border` - Button border
- `--blacksmith-card-button-hover-bg` - Button hover background
- `--blacksmith-card-button-container-bg` - Button container background

---

## Notes

- Some colors may be intentionally hardcoded for semantic meaning (e.g., red for failure, green for success)
- Consider whether these should remain hardcoded or become themeable
- Layout, spacing, and typography should remain in layout files, not theme files
- All new variables should be prefixed with `blacksmith-card-` to avoid conflicts

