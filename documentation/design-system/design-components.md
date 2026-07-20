# Design Components

**For module authors building UI that matches Blacksmith.** The shared component kit: what each component
is called, which stylesheet defines it, and the structure its CSS requires.

Tokens are on the Design tokens page. Naming rules and file organization are on the Design patterns page.

Class names below are the contract. Where a component's markup structure is load-bearing -- where getting
the element types or nesting wrong yields a control that renders unstyled or does not respond to clicks --
the required structure is stated and the live template is cited. For everything else, read the cited
template rather than copying a snippet from here.

## Chat cards

The card system is the most widely reused surface. `styles/cards-common-layout.css` defines structure,
`styles/cards-common-themes.css` defines color only.

Root element is `.blacksmith-card` (`styles/cards-common-layout.css:41`) plus one theme class. Themes are
matched generically by `.blacksmith-card[class*="theme-"]` (`:63`), so a theme class is required for
themed styling to apply.

| Region | Class | Defined at |
|---|---|---|
| Header | `.card-header` | `cards-common-layout.css:82` |
| Section header | `.section-header` | `cards-common-layout.css:110` |
| Section subheader | `.section-subheader` | `cards-common-layout.css:127` |
| Body content | `.section-content` | `cards-common-layout.css:148` |
| Dark section | `.section-dark` | `cards-common-layout.css:156` |
| Button row | `.blacksmith-chat-buttons` | `cards-common-layout.css:306` |
| Button | `.chat-button` | `cards-common-layout.css:320` |
| Data table | `.section-table` | `cards-common-layout.css:258` |
| Table label cell | `.row-label` | `cards-common-layout.css:269` |
| Table value cell | `.row-content` | `cards-common-layout.css:290` |
| Actor block | `.container-user` | `cards-common-layout.css:570` |
| Actor portrait | `.token-image` | `cards-common-layout.css:578` |

Collapsible sections carry state classes: `.section-content.collapsed` (`:165`),
`.card-header:not(.collapsed)` (`:94`), and `.card-header.collapsible` (`:238`).

The nine themes are defined at `styles/cards-common-themes.css:11, 29, 48, 65, 82, 100, 118, 136, 154`.
That file sets color only -- no radius, spacing, or typography -- so a new theme needs nothing but color
declarations. Themed cards inherit the base radius; theme classes set no radius of their own.

Chat buttons are identified by a state class and a domain-specific data attribute, not by a generic
`data-action`. See `templates/cards-common.hbs:247` for the live shape.

## Token background tiles

Twelve tiling background classes at `styles/cards-common-layout.css:510-521`, backed by
`images/tiles/*.webp`. The shared rule sets both `background-repeat: repeat` (`:522`) and
`background-size: cover` (`:523`); `cover` wins, so these render scaled rather than tiled.
`.token-background-themecolor` (`:525-527`) is transparent and defers to the theme.

## Menubar

Defined in `styles/menubar.css`, template `templates/menubar.hbs`.

The bar is `position: fixed` at `z-index: 100` (`styles/menubar.css:111, 115`), offset by
`--blacksmith-menubar-interface-offset` (`:16`). Container is `.blacksmith-menubar-container`, which gains
`.has-secondary` when a secondary bar is present (`:110, 106`). Tools live in
`.blacksmith-menubar-middle-tools` (`:173`), with `.menubar-overflow` (`:301`) handling spill. State
classes are `.button-active`, `.tool-readonly`, `.tool-active` (`:211, 212, 244`).

Dividers are a **modifier class on a single element**, not a wrapper with a child. Write
`<div class="menu-divider line"></div>` -- see `templates/menubar.hbs:36`. The style variants are
`.menu-divider.line`, `.dotted`, `.double`, `.groove`, `.ridge` (`styles/menubar.css:189, 192, 195, 198,
201`). A nested-child structure produces an unstyled divider.

Secondary bars are `.blacksmith-menubar-secondary` with a `data-bar-type` attribute
(`templates/menubar.hbs:94-95`), holding `.secondary-bar-toolbar` (`styles/menubar.css:622`) and zones
`.secondary-bar-zone{,-left,-middle,-right}` (`:633, 639, 643`).

Within a zone, items are wrapped in a group rather than placed directly:
`.secondary-bar-group-container`, `-banner`, `-banner-text`, `-items`, and `-divider`
(`templates/partials/menubar-secondary-default.hbs:6, 8, 9, 12, 91`). Items are `.secondary-bar-item`,
which takes `.active` (`:74`). There are four item kinds -- text, image, progressbar, and balancebar. The
image kind puts `.secondary-bar-item-image` on the `<img>` itself (`:81`), not the wrapper; text values use
`.secondary-bar-item-value` (`:26`, styled at `styles/menubar.css:727`). Progressbar and balancebar have
their own sub-element sets at `templates/partials/menubar-secondary-default.hbs:34-46` and `:49-70`.

Menubar tokens (`--blacksmith-menubar-*`) are declared locally in `styles/menubar.css:16, 21`, not in
`styles/vars.css`.

## Windows

### Header

The unified header is `templates/partials/unified-header.hbs`, styled in `styles/window-skillcheck.css`.
It contains **two sibling** `.cpb-dialog-header-content` blocks: the first holds `.cpb-actor-info`
(`:5-18`), the second holds the dice icon, title section, and controls (`:20-33`).

| Element | Class | Defined at |
|---|---|---|
| Sticky wrapper | `.cpb-dialog-header-sticky` | `window-skillcheck.css:42` |
| Header | `.cpb-dialog-header` | `window-skillcheck.css:50` |
| Content block | `.cpb-dialog-header-content` | `window-skillcheck.css:63` |
| Actor info | `.cpb-actor-info` | `window-skillcheck.css:122` |
| Actor portrait | `.cpb-actor-portrait` | `window-skillcheck.css:135` |
| Dice icon | `.cpb-dialog-dice-icon` | `window-skillcheck.css:72` |
| Title section | `.cpb-dialog-title-section` | `window-skillcheck.css:95` |
| Main title | `.cpb-dialog-main-title` | `window-skillcheck.css:110` |
| Subtitle | `.cpb-dialog-subtitle` | `window-skillcheck.css:155` |
| Controls | `.cpb-dialog-controls` | `window-skillcheck.css:166` |

Title and subtitle are `<div>` elements, not heading or paragraph tags
(`templates/partials/unified-header.hbs:29, 30`). `.cpb-actor-name` appears in header markup but has no
rule in the window stylesheet -- it is styled only inside chat-card result contexts
(`styles/cards-skill-check.css:79, 99`), so it renders unstyled in a dialog header.

### Buttons

Defined at `styles/window-template.css:213-259`. Variants are the base button plus secondary and critical
modifiers. The shared rule sets `padding: 8px 12px`, `border-radius: 4px`, uppercase text,
`font-family: inherit`, `font-size: 1.0em`, `display: inline-flex`, `gap: 6px`, and
`border: 1px solid var(--blacksmith-window-border-color)` (`:216-224`). Secondary and critical each
override `border-color` (`:236`, `:242`), so the border is not uniform across variants. Disabled state is
`opacity: 0.6; cursor: not-allowed`. Primary width is 300px. Buttons mount into the `actionBarLeft` and
`actionBarRight` regions (`templates/window-template.hbs:59, 62`).

### Tabs

`.blacksmith-tabs` / `.blacksmith-tab` with `.is-active`, driven by `data-action="selectTab"` and
`data-value` (`styles/window-tabs.css:23, 30, 54, 60`). A disabled tab is `opacity: 0.4;
cursor: not-allowed` (`:70-73`). The usage comment at `styles/window-tabs.css:5-21` carries the current
markup.

### Form controls

Defined in `styles/window-form-controls.css`.

**Toggle switch** -- `.blacksmith-toggle` with `-input`, `-slider`, `-row`, `-label` (`:23, 32, 39, 76,
82`). 46x24px, 22px thumb travel (`:26-27, 67`), accent-colored border when checked (`:63`). This is the
current toggle for new windows; it lives in the shared stylesheet and consumes tokens.

**Range slider** -- `.blacksmith-slider` wrapping an optional icon and value span, with webkit and moz
thumb pseudo-elements (`:153-230`).

**Badge / tag pill** -- base plus four variants (`:100, 114, 121, 127, 133`). The base uses
`var(--blacksmith-radius-pill, 16px)` (`:107`).

### Legacy toggle (skill-check windows)

A second, older toggle ships alongside the current one: `.cpb-toggle-container`, `.cpb-toggle-label`,
`.cpb-toggle`, `.cpb-toggle-slider` (`styles/window-skillcheck.css:241, 249, 257, 271`). It is 35x14px,
uses no tokens, and remains in use at `templates/partials/unified-header.hbs:37-57` and
`templates/window-skillcheck.hbs:76-80`. Prefer `.blacksmith-toggle` for new work.

Its structure is load-bearing. The CSS selector is `.cpb-toggle input:checked + .cpb-toggle-slider`
(`styles/window-skillcheck.css:298`), which requires the slider to be the checkbox's immediate sibling,
and the wrapper is a `<div>` -- so the click target is the slider's `for` attribute, which needs a matching
`id` on the input:

```html
<div class="cpb-toggle-container">
    <span class="cpb-toggle-label">Cinematic</span>
    <div class="cpb-toggle">
        <input type="checkbox" name="isCinematic" id="isCinematic">
        <label for="isCinematic" class="cpb-toggle-slider"></label>
    </div>
</div>
```

Wrapping in a `<label>` or using a `<span>` slider yields a toggle that does not respond to clicks. Live
markup: `templates/partials/unified-header.hbs:38-41`.

### Lists

`styles/window-list.css` defines `.blacksmith-list`, `-row`, `-row-img`, `-row-img-lg`, `-row-main`,
`-row-title`, `-row-meta`, `-row-action`, and `.blacksmith-list-empty` (`:26-116`), with `.is-active`
(`:50`). Base thumbnail is 36px (`:57-59`); `-row-img-lg` only overrides width and height to 48px
(`:67-70`), so it is applied **in addition to** `-row-img`, not instead of it.

### Panels

`styles/window-panels.css` defines five structural classes and eight variant modifiers (`:26-125`). Each
variant reads its matching `--blacksmith-variant-*` border and background pair (`:87-125`). This is
distinct from `.blacksmith-window-section`; see the source comment at `:9`.

Detail rows and stat tiles are at `:146-233`. The detail label is `flex: 0 0 110px` (`:160`). A stat tile
is `flex: 1 1 0` with `min-width: 3rem` (`:205-206`); its label is `0.65em` uppercase accent (`:221-225`)
and its value is `1.2em` at `font-weight: 900` in `rgba(232, 232, 232, 0.98)` (`:231-233`).

### Multi-column body layout

`.blacksmith-body-columns` with `-2`, `-3`, or `-4` (`styles/window-template.css:318-352`), placed inside
`.blacksmith-window-template-body` (`templates/window-template.hbs:50`). Column widths default to `1fr`
and are overridable per column via `--blacksmith-body-col-N`. The 1px `gap` reads as a divider only
because children set `background: var(--blacksmith-window-background, #232323)` (`:328`) over the parent
background -- that background is load-bearing for anyone reimplementing the layout. Children set
`overflow: hidden`.

## Tooltip

`.tooltip-item` wrapping `.tooltiptext` (`styles/window-common.css:485, 499`). 250px wide, positioned
above via `bottom: 100%` (`:676-680`), 0.75s delay (`:663-667`), `#3b3b3b` on `#ffffff` (`:500-501`).
Optional `.tooltip-label` (`:491`) and `.tooltip-divider` (`:494`) structure the content.

## Drop zone

`.panel-drop-zone` containing `.drop-zone-content` with an icon (`styles/common.css:86, 101, 109`). The
`.dragover` state sets `background-color: rgba(0, 100, 0, 0.2)` and `border-color: #0f0` (`:96-98`).

## Canvas pins

Overlay is `.blacksmith-pins-overlay` with `data-hidden` (`styles/pins.css:19, 31`), created at
`scripts/pins-renderer.js:83-84`. Each pin is `.blacksmith-pin` (`styles/pins.css:36`) containing
`.blacksmith-pin-icon` (`scripts/pins-renderer.js:358`).

`data-shape` on the pin takes `circle`, `square`, `rectangle`, or `none` (`styles/pins.css:107, 115, 120`).
`data-icon-type` takes `fa`, `text`, or `image` and belongs on the **icon child**, not the pin
(`styles/pins.css:145, 160, 170`). `data-no-shadow` suppresses the drop shadow (`:101`). A pin carries its
own hidden state at `.blacksmith-pin[data-hidden="true"]` (`:351`), separate from the overlay's.

Permission is `blacksmithAccess` (`gm`, `private`, `public`) and visibility is `blacksmithVisibility`
(`visible`, `hidden`) -- `scripts/pins-renderer.js:1239-1316`. The GM indicator is
`.blacksmith-pin-gm-indicator` (`:245-253`), showing `user-shield` for GM-only and `user-pen` for private
(`scripts/pin-permission-icons.js:7-8`).

Sizing is written inline as `width`/`height` at `scripts/pins-renderer.js:510-511`. The per-pin custom
properties that stylesheets actually read are `--pin-stroke-color`, `--pin-stroke-px`, and
`--gm-indicator-size-px` (`:514-519`), plus `--blacksmith-pin-icon-size-ratio` (`styles/pins.css:9`).
`--pin-size-px` is set at `:512` but read by no stylesheet, so overriding it has no effect.

## Combat timer bar

`.combat-timer-container` > `.combat-timer-progress` > `.combat-timer-bar`, plus `.combat-timer-text`
(`styles/timer-combat.css:2, 19, 33, 43`; `templates/timer-combat.hbs:1-4`). The text element is a `<div>`.

State classes are applied by JavaScript at runtime, not present in the template: `.high`, `.medium`,
`.low`, `.expired` on the bar (`:92-95`). The progress element carries its own states --
`.expired` (`:98`), `.player-turn` (`:101`), `.other-player-turn` (`:160`) -- and the container takes
`.hidden` (`:14`). Turn overlays are `.combat-timer-end-turn-overlay` (`:156`) and
`.combat-timer-hurry-overlay` (`:160`).

## Damage ratio bar

`styles/cards-stats.css`, template `templates/card-stats-combat-breakdown.hbs`.

Structure is `.damage-ratio-bar` > `.ratio-bar-container` (`:292`) > `.ratio-bar-background` (`:316`). The
bar is a **discrete ten-tick scale**, not two proportional segments: ten `.ratio-segment` elements, five
`.ratio-segment-red` then five `.ratio-segment-green` (`:325, 335, 339`;
`templates/card-stats-combat-breakdown.hbs:27-36`). Each is `flex: 1` (`:326`) with no inline width; the
last resets its border (`:331`).

The marker is `.ratio-marker` (`:343`), which spans the full width and draws via `.ratio-marker::before`
(`:354`). Position comes from the `--marker-position` custom property set on the marker element
(`templates/card-stats-combat-breakdown.hbs:38`) and read at `:356` -- an inline `left` has no effect,
since the rule hardcodes `left: 0; width: 100%`.

Icons are `.ratio-icon-left` and `.ratio-icon-right` (`:300-312`), rendered outside the bar container
(`templates/card-stats-combat-breakdown.hbs:24, 40`).
