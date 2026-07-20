# Design Tokens

**For module authors styling against Blacksmith.** The complete set of CSS custom properties Blacksmith
defines, what each one means, and how to consume or override them from another module.

The authoritative definition is `styles/vars.css`. This page is checked against it by
`tools/check-design-tokens.mjs`, which fails if any value here drifts or any token goes undocumented.

## How tokens reach your module

`styles/vars.css` declares every token on `:root`, and Foundry loads it as part of Blacksmith's stylesheet
set. Once Blacksmith is active the tokens are global: a child module references them with no import, no
build step, and no load-order handling.

```css
/* in your module's CSS -- works as long as Blacksmith is active */
.my-module-panel {
    padding: var(--blacksmith-space-lg);
    background: var(--blacksmith-surface-dark-1);
    color: var(--blacksmith-text-light);
    border-radius: var(--blacksmith-radius-md);
}
```

Always supply a fallback for anything that must survive Blacksmith being disabled:

```css
padding: var(--blacksmith-space-lg, 12px);
```

To retheme Blacksmith's own components inside your module's scope, redefine a token on your root element.
The override cascades to any Blacksmith component rendered within it:

```css
#coffee-pub-mymodule { --blacksmith-color-brand-accent: #4a7a2a; }
```

Two constraints carried from `styles/vars.css:16-17`: component-specific rules do not belong in that file,
and new CSS references tokens rather than repeating literal values.

## Spacing

The scale is deliberately short. Pick the nearest step rather than introducing an intermediate value.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-space-xs` | `2px` | Micro gaps -- icon padding, hairline margins |
| `--blacksmith-space-sm` | `4px` | Tight spacing -- icon margins, dense rows |
| `--blacksmith-space-md` | `8px` | Standard padding -- buttons, compact elements |
| `--blacksmith-space-lg` | `12px` | Section padding -- card internals, form groups |
| `--blacksmith-space-xl` | `20px` | Separation between major content blocks |

When converting existing literals: 2px to xs, 4px to sm, 6px and 8px to md, 10px and 12px to lg, 16px and
20px to xl.

## Color: brand

The core palette. Everything else is a surface, a text tone, or a status.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-color-brand` | `#594a3c` | Primary text and body |
| `--blacksmith-color-brand-dark` | `#481515` | Headers |
| `--blacksmith-color-brand-accent` | `#c15701` | Interactive and hover orange |
| `--blacksmith-color-brand-muted` | `#8d8061` | Borders, dividers, muted text |

## Color: light surfaces

The parchment / chat-card context, lightest to strongest.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-surface-0` | `#ffffff` | Pure white |
| `--blacksmith-surface-1` | `#f6f1ed` | Off-white content areas |
| `--blacksmith-surface-2` | `#e4ddd9` | Raised areas, headers |
| `--blacksmith-surface-3` | `#c4bcaa` | Stronger contrast areas |

## Color: dark surfaces

The window / toolbar context, deepest to lightest.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-surface-dark-0` | `#0e0c0c` | Near black, deepest |
| `--blacksmith-surface-dark-1` | `#222222` | Main window background |
| `--blacksmith-surface-dark-2` | `#313030` | Button background |
| `--blacksmith-surface-dark-3` | `#4b4b4b` | Borders, dividers |

## Color: text

Pick by the surface the text sits on, not by the component.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-text-primary` | `#594a3c` | On light surfaces |
| `--blacksmith-text-secondary` | `#746950` | Subdued on light |
| `--blacksmith-text-light` | `#bdbdae` | On dark surfaces |
| `--blacksmith-text-muted` | `#ada39d` | Subdued on dark |
| `--blacksmith-text-inverse` | `#ffffff` | High contrast on dark |

## Color: interactive states

| Token | Value | Use |
|---|---|---|
| `--blacksmith-interactive-default` | `rgba(21, 9, 1, 0.9)` | Resting interactive surface |
| `--blacksmith-interactive-hover` | `rgba(97, 41, 4, 0.4)` | Hover wash |
| `--blacksmith-interactive-active` | `rgba(124, 62, 10, 0.8)` | Pressed or active |

## Color: status

Semantic outcome colors, for text and solid fills.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-status-success` | `#629602` | Success, pass |
| `--blacksmith-status-warning` | `#aa6000` | Warning, caution |
| `--blacksmith-status-danger` | `#8b0000` | Failure, destructive |
| `--blacksmith-status-damage` | `#d63737` | Combat damage, distinct from danger |
| `--blacksmith-status-info` | `#3c6685` | Informational |

## Color: variant palette

Paired border and background tints for panels and tagged content. Each variant is a translucent border at
45 percent and a background wash at 12 percent of the same hue, so variants layer over any surface without
a solid fill. Consume them as a pair.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-variant-danger-border` | `rgba(104, 41, 41, 0.45)` | Danger panel border |
| `--blacksmith-variant-danger-bg` | `rgba(104, 41, 41, 0.12)` | Danger panel background |
| `--blacksmith-variant-success-border` | `rgba(51, 92, 51, 0.45)` | Success panel border |
| `--blacksmith-variant-success-bg` | `rgba(51, 92, 51, 0.12)` | Success panel background |
| `--blacksmith-variant-warning-border` | `rgba(115, 86, 35, 0.45)` | Warning panel border |
| `--blacksmith-variant-warning-bg` | `rgba(115, 86, 35, 0.12)` | Warning panel background |
| `--blacksmith-variant-info-border` | `rgba(47, 68, 106, 0.45)` | Info panel border |
| `--blacksmith-variant-info-bg` | `rgba(47, 68, 106, 0.12)` | Info panel background |
| `--blacksmith-variant-music-border` | `rgba(160, 63, 1, 0.45)` | Music panel border |
| `--blacksmith-variant-music-bg` | `rgba(160, 63, 1, 0.12)` | Music panel background |
| `--blacksmith-variant-environment-border` | `rgba(42, 70, 62, 0.45)` | Environment panel border |
| `--blacksmith-variant-environment-bg` | `rgba(42, 70, 62, 0.12)` | Environment panel background |
| `--blacksmith-variant-oneshot-border` | `rgba(124, 133, 0, 0.45)` | One-shot panel border |
| `--blacksmith-variant-oneshot-bg` | `rgba(124, 133, 0, 0.12)` | One-shot panel background |

## Typography

Sizes are relative (`em`), so a component inherits the scale of whatever context it renders into.

| Token | Value | Use |
|---|---|---|
| `--blacksmith-font-size-xs` | `0.8em` | Fine print, badge labels |
| `--blacksmith-font-size-sm` | `0.85em` | Secondary and meta text |
| `--blacksmith-font-size-base` | `1em` | Body |
| `--blacksmith-font-size-md` | `1.1em` | Emphasized body |
| `--blacksmith-font-size-lg` | `1.3em` | Subheadings |
| `--blacksmith-font-size-xl` | `1.5em` | Headings |
| `--blacksmith-font-weight-light` | `100` | Thin display text |
| `--blacksmith-font-weight-normal` | `400` | Body |
| `--blacksmith-font-weight-bold` | `700` | Emphasis |
| `--blacksmith-font-weight-black` | `900` | Stat values, strong display |

## Border radius

| Token | Value | Use |
|---|---|---|
| `--blacksmith-radius-sm` | `3px` | Tight corners -- inputs, small chips |
| `--blacksmith-radius-md` | `4px` | Default for buttons, panels, cards |
| `--blacksmith-radius-lg` | `5px` | Larger containers |
| `--blacksmith-radius-pill` | `16px` | Fully rounded badges and pills |

## Elevation

| Token | Value | Use |
|---|---|---|
| `--blacksmith-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.3)` | Subtle lift -- resting elements |
| `--blacksmith-shadow-md` | `0 2px 4px rgba(0, 0, 0, 0.4)` | Raised panels, hover states |
| `--blacksmith-shadow-lg` | `0 4px 10px rgba(0, 0, 0, 0.6)` | Floating surfaces -- popouts, dialogs |

## Tokens defined outside vars.css

Component stylesheets define their own scoped custom properties for values only that component uses --
`--blacksmith-card-*` in the card stylesheets, `--blacksmith-menubar-*` in `styles/menubar.css`,
`--blacksmith-pin-*` in `styles/pins.css`. Those are documented with their components rather than here,
and they are not part of the global token contract: treat them as internal unless a component page says
otherwise.

A few are written by JavaScript at runtime rather than declared in CSS, so they hold no value in a static
stylesheet read. `--marker-position` is set per-card at `scripts/` render time and read by
`styles/cards-stats.css:356` to place the damage-ratio marker. On canvas pins, `--pin-stroke-color`,
`--pin-stroke-px` and `--gm-indicator-size-px` are set per-pin at `scripts/pins-renderer.js:514-519`.

`--pin-size-px` is set at `scripts/pins-renderer.js:512` but is read by no stylesheet in the module: pin
dimensions currently come from inline `width`/`height` written alongside it at
`scripts/pins-renderer.js:510-511`. Setting or overriding `--pin-size-px` from another module therefore has
no effect.
