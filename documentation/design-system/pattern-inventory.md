# Cross-Module Pattern Inventory
_Audit of coffee-pub-minstrel and coffee-pub-artificer vs coffee-pub-blacksmith_
_Generated: 2026-04-18_

---

## Executive Summary

Every module has independently implemented the same 6–8 core component patterns with nearly identical CSS but different class names. The values are the same; the names are not. This is the root cause of "similar but not quite the same." The fix is to canonicalize each pattern once in Blacksmith and have every module's V2 migration adopt it.

---

## 1. Duplication Map

### 1A. Window CSS Custom Properties — Duplicated in Every Window

Every Artificer window (crafting, gather, skills) scopes its own copy of the same four variables. Values are byte-for-byte identical across all of them:

| Token | Value | Files |
|-------|-------|-------|
| `--*-border-color` | `#444` or `rgba(68,68,68,0.5)` | crafting, gather, skills, blacksmith template |
| `--*-accent-color` | `#ac9f81` | crafting, gather, skills, blacksmith template |
| `--*-background` | `#232323` | crafting, gather, skills, blacksmith template |
| `--*-header-bg` | `rgba(0,0,0,0.7)` | crafting, gather, skills, blacksmith template |

**These are already in `window-template.css` as `--blacksmith-window-*`.** Every Artificer window should inherit them instead of re-declaring them.

---

### 1B. Header Structure — 4 Identical Implementations

The header zone (icon badge + title block + subtitle) appears in:
- `window-template.css` → `.blacksmith-window-template-header-*`
- `window-crafting.css` → `.crafting-window-header-*`
- `window-gather.css` → `.gather-window-header-*`
- `window-skills.css` → `.skills-window-header-*`

All four implement the same structure:
```
header-content    flex row, gap: 12px
  header-icon     44px circle, rgba(0,0,0,0.8) bg, rgba(172,159,129,0.9) 2px border
    i             1.4em, rgba(255,255,255,0.9)
  header-title-block  flex column, gap: 2px
    header-title  1.2em, bold, uppercase, accent color, letter-spacing 0.02em
    header-subtitle  0.85em, rgba(255,255,255,0.75)
  header-right    flex row (optional)
```

The Blacksmith `window-template.hbs` already renders this correctly. Artificer windows that migrate to V2 get it for free. **No new CSS needed — this is solved by V2 migration.**

---

### 1C. Buttons — 4 Identical Implementations

Primary/secondary/hover pattern appears identically in:

| File | Class prefix |
|------|-------------|
| `window-template.css` | `.blacksmith-window-template-btn-` |
| `window-crafting.css` | `.crafting-window-btn-` |
| `window-gather.css` | `.gather-window-btn-` |
| `window-skills.css` | `.skills-window-btn-` |
| `window-minstrel.css` | `.minstrel-btn-` |

All share identical rules:
- `padding: 8px 12px`, `border-radius: 4px`, `text-transform: uppercase`, `font-family: inherit`
- Primary: `rgba(41, 94, 47, 0.9)` green
- Secondary: `rgba(33, 40, 46, 0.9)` dark
- Hover (both): `rgba(255, 100, 0, 0.6)` orange
- Disabled: `opacity: 0.6`, `cursor: not-allowed`

Minstrel adds a third variant: **critical** (danger/destructive action, red).

**Canonical target:** `.blacksmith-window-btn-primary`, `.blacksmith-window-btn-secondary`, `.blacksmith-window-btn-critical` in `window-template.css`. Replace the current `-template-btn-*` naming.

---

### 1D. Action Bar — 4 Identical Implementations

The locked-bottom action bar appears in every window:

```css
.{prefix}-window-buttons        flex-shrink: 0, border-top, dark bg, padding: 10px 12px
  .{prefix}-window-action-bar   flex, space-between, gap: 12px
    .{prefix}-window-action-left   flex, gap: 10px
    .{prefix}-window-action-right  flex, gap: 8px
```

Already in `window-template.hbs` as `blacksmith-window-template-buttons/action-bar/action-left/action-right`. **Solved by V2 migration.**

---

### 1E. Section Headers — 3+ Implementations

| File | Class | Notes |
|------|-------|-------|
| `window-template.css` | `.blacksmith-window-section-header` | ← canonical (just added) |
| `window-crafting.css` | `.crafting-zone-section-title` | uppercase, accent color, no icon |
| `window-skills.css` | `.skills-zone-section-title` | identical to crafting |
| `window-minstrel.css` | `.minstrel-section-header`, `.minstrel-section-title` | slightly richer |

Artificer's section titles are lighter (no border-bottom, no icon). Minstrel's adds controls on the right (`.minstrel-section-header` is `space-between`). The `.blacksmith-window-section-header` is the richest and should be the standard.

**Action:** Artificer and Minstrel adopt `.blacksmith-window-section-header` on V2 migration.

---

### 1F. Toggle Switch — 2 Implementations

| File | Class |
|------|-------|
| `shared.css` (Artificer) | `.artificer-toggle`, `.artificer-toggle-slider` |
| `window-pin-config.css` (Blacksmith) | `.blacksmith-pin-config-toggle`, `.blacksmith-pin-config-toggle-slider` |

Both implement an identical 35×14px pill toggle with a sliding thumb, transition, and orange hover glow. Values differ only in minor sizing.

**Action:** Create `.blacksmith-toggle` in a new `window-form-controls.css`. Both windows adopt it.

---

### 1G. Range Slider — 2 Implementations

| File | Class | Notes |
|------|-------|-------|
| `window-minstrel.css` | `.minstrel-toolbar-slider` | horizontal, webkit + moz |
| `window-crafting.css` | `.crafting-bench-horizontal-slider` | gradient fill |
| `shared.css` (Artificer) | `.artificer-rangeslider` | custom div-based (not input[type=range]) |

Three implementations, two approaches (native `input[type=range]` vs custom div). The native approach (Minstrel) is simpler. 

**Action:** Create `.blacksmith-slider` (native input) in `window-form-controls.css`. Use `-webkit-slider-*` and `-moz-range-*` pseudo-elements. The Artificer div-based rangeslider can stay for its specific heat/grind widgets — those are too specialized to genericize.

---

### 1H. List Row — 3 Implementations

A thumbnail + title + meta + action row appears across all modules:

| File | Class | Structure |
|------|-------|-----------|
| `window-minstrel.css` | `.minstrel-list-row`, `.minstrel-track-row` | flex, hover bg, active border |
| `window-crafting.css` | `.crafting-ingredient-row` | flex, 48px image |
| `window-gather.css` | `.gather-result-item` | flex, 28px image, green-tinted bg |

All are `display: flex; align-items: center; gap: Npx` with a left image and right content. Hover state is universal.

**Action:** Create `.blacksmith-list-row` with `.blacksmith-list-row-img`, `.blacksmith-list-row-title`, `.blacksmith-list-row-meta`, `.blacksmith-list-row-action` in a new `window-list.css`.

---

### 1I. Detail Row (Label + Value) — 2 Implementations

| File | Class | Notes |
|------|-------|-------|
| `window-skills.css` | `.skills-detail-row`, `.skills-detail-label`, `.skills-detail-value` | flex, 100px label |
| `window-crafting.css` | `.crafting-recipe-stat-tile` | grid-based stat scoreboard |

Different visual presentations for the same concept: named property + value. Skills uses a horizontal row; Crafting uses a tile grid.

**Action:** Create both as Blacksmith components. `.blacksmith-detail-row` (label/value pair) and `.blacksmith-stat-tile` (centered tile for scoreboards) in `window-panels.css`.

---

## 2. Module-Specific Patterns (Do NOT Extract)

These are legitimately module-specific and should stay in their modules:

| Pattern | Module | Why |
|---------|--------|-----|
| Timeline/playhead | Minstrel | Music-domain specific |
| Automation rule cards + time-range slider | Minstrel | Automation-domain specific |
| Crafting bench slot grid + heat effects + animations | Artificer | Crafting-domain specific |
| Apparatus slot with `color-mix()` heat reactivity | Artificer | Highly specialized |
| Skills perk grid (5×2) + chain indicators | Artificer | Perk-system specific |
| Round timer (conic-gradient) | Artificer | Crafting-domain specific |
| Cue browser card with left border accent | Minstrel | Cue-domain specific |

---

## 3. What Minstrel Has That Blacksmith Is Missing

These are patterns polished enough in Minstrel to extract as core Blacksmith components:

### 3A. Tab Bar Navigation
Minstrel's DASHBOARD / SOUND SCENES / CUES / PLAYLISTS / AUTOMATION tab strip is the standard multi-section window navigation pattern. Every complex window needs this.

**Proposed:** `.blacksmith-tabs`, `.blacksmith-tab`, `.blacksmith-tab.is-active` in a new `window-tabs.css`. Body responds via `[data-tab]` attributes (same pattern Foundry uses).

### 3B. Panel Card
Minstrel's `.minstrel-panel-card` — semi-transparent card with border, optional background image header, and body area. Different from a section (which is just a content divider). A panel card is a self-contained widget.

**Proposed:** `.blacksmith-panel-card`, `.blacksmith-panel-card-header`, `.blacksmith-panel-card-body` in `window-panels.css`.

### 3C. Color Variant System
Minstrel's `.minstrel-card-music`, `.minstrel-card-environment`, `.minstrel-card-oneshot`, `.minstrel-card-timeline` — each applies a color theme (border, bg, accent) to a card. This is a modifier pattern.

**Proposed:** Define as CSS custom property overrides on variant classes, not hardcoded colors. Extend `vars.css` with semantic palette tokens for module-type colors.

### 3D. Tag / Badge
Minstrel's `.minstrel-tag` — inline pill label. Artificer has slot count badges. Neither is in Blacksmith.

**Proposed:** `.blacksmith-badge` (pill with count/label) in `window-form-controls.css`.

### 3E. Multi-Column Body Layout
Minstrel uses 3-column workspace grids; Artificer uses 4-column. Blacksmith's body zone is a single scrollable div with no multi-panel support.

**Proposed:** `.blacksmith-body-columns` with CSS grid, configurable via `--blacksmith-body-col-*` custom properties. Documented in `window-template.css`. Not rigid — each window sets its own column widths.

### 3F. Critical/Danger Button Variant
Minstrel's `.minstrel-btn-critical` — a red destructive action button. Blacksmith only has primary (green) and secondary (dark). Delete and destructive actions need this.

**Proposed:** `.blacksmith-window-btn-critical` added alongside primary/secondary.

---

## 4. Recommended Extraction Order

Ordered by impact and difficulty:

| Priority | Component | New File | Difficulty |
|----------|-----------|----------|------------|
| 1 | Rename `-template-btn-*` → `-btn-*`, add critical variant | `window-template.css` | Low |
| 2 | Toggle switch | `window-form-controls.css` | Low |
| 3 | Badge/tag pill | `window-form-controls.css` | Low |
| 4 | Tab bar | `window-tabs.css` | Medium |
| 5 | Range slider (native) | `window-form-controls.css` | Medium |
| 6 | List row | `window-list.css` | Medium |
| 7 | Panel card | `window-panels.css` | Medium |
| 8 | Detail row + stat tile | `window-panels.css` | Medium |
| 9 | Multi-column body | `window-template.css` | Medium |
| 10 | Color variant system | `vars.css` + `window-panels.css` | High |

---

## 5. V2 Migration Payoff

When a module migrates to V2 and adopts Blacksmith's canonical components, it drops:
- Its own header structure CSS
- Its own action bar CSS  
- Its own button CSS
- Its own CSS custom property declarations

Estimated line reduction per window: **~200–400 lines of duplicate CSS deleted.**

The remaining CSS in each module's file should be only domain-specific components — the things on the "Do NOT Extract" list above.
