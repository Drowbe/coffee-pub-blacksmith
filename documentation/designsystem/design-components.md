# Design Components

**Audience:** module authors building UI that matches Blacksmith.

The shared component kit: what each component
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
| Button row | `.blacksmith-card-buttons` | `cards-common-layout.css:306` |
| Button | `.card-button` | `cards-common-layout.css:320` |
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
It contains **one** `.cpb-dialog-header-content` block (`:5`) holding the icon circle, title section, and
controls. The circle renders the actor's portrait when the caller passes one and the `diceIcon` glyph
otherwise, so the roll window shows a face and the skill check dialog shows a d20.

| Element | Class | Defined at |
|---|---|---|
| Sticky wrapper | `.cpb-dialog-header-sticky` | `window-skillcheck.css:42` |
| Header | `.cpb-dialog-header` | `window-skillcheck.css:50` |
| Content block | `.cpb-dialog-header-content` | `window-skillcheck.css:63` |
| Icon circle | `.cpb-dialog-dice-icon` | `window-skillcheck.css:72` |
| Portrait in the circle | `.cpb-dialog-dice-icon .cpb-actor-portrait` | `window-skillcheck.css:141` |
| Title section | `.cpb-dialog-title-section` | `window-skillcheck.css:95` |
| Main title | `.cpb-dialog-main-title` | `window-skillcheck.css:110` |
| Subtitle | `.cpb-dialog-subtitle` | `window-skillcheck.css:148` |
| Actor name in subtitle | `.cpb-subtitle-actor` | `window-skillcheck.css:156` |
| Controls | `.cpb-dialog-controls` | `window-skillcheck.css:166` |

Title and subtitle are `<div>` elements, not heading or paragraph tags
(`templates/partials/unified-header.hbs:25, 26`). The subtitle carries the actor's name ahead of the roll
type, in `.cpb-subtitle-actor`.

`.cpb-actor-name` no longer appears in header markup. It is now only the skill check dialog's actor-list
item (`templates/window-skillcheck.hbs:53`), styled unscoped at `styles/window-skillcheck.css:636`. That
selector being unscoped used to reach the dialog header as well, which is worth remembering if header
markup ever reintroduces the class.

### Buttons

Defined at `styles/window-template.css:213-259`. Variants are the base button plus secondary and critical
modifiers. The shared rule sets `padding: 8px 12px`, `border-radius: 4px`, uppercase text,
`font-family: inherit`, `font-size: 1.0em`, `display: inline-flex`, `gap: 6px`, and
`border: 1px solid var(--blacksmith-window-border-color)` (`:216-224`). Secondary and critical each
override `border-color` (`:236`, `:242`), so the border is not uniform across variants. Disabled state is
`opacity: 0.6; cursor: not-allowed`. **No width is set.** A shared button class carrying a fixed pixel
width stretched the primary action across a flex footer and squeezed the secondary one onto two lines; the
rule was removed on 2026-08-08, by which point four stylesheets were already resetting it to `auto`.
Buttons mount into the `actionBarLeft` and `actionBarRight` regions
(`templates/window-template.hbs:59, 62`).

To make buttons fill their footer, put **`blacksmith-actions-fill` on the container** — the action bar, or
a window's own footer div. It works on any flex footer, and the window template's action bar gets an extra
rule because its buttons sit one level deeper inside the left and right groups.

The modifier is container-level on purpose: filling is a property of a footer's layout, not of a button.
The per-button version of the same idea is what the deleted `width: 300px` was, and it failed because a
width belonging to one button squeezes whatever sits beside it. It uses `flex: 1 1 0` rather than `flex: 1`
so buttons come out equal rather than divided in proportion to their label lengths, with `min-width: 0` so
a long label ellipsises instead of widening the row.

### Tabs

`.blacksmith-tabs` / `.blacksmith-tab` with `.is-active`, driven by `data-action="selectTab"` and
`data-value` (`styles/window-tabs.css:23, 30, 54, 60`). A disabled tab is `opacity: 0.4;
cursor: not-allowed` (`:70-73`). The usage comment at `styles/window-tabs.css:5-21` carries the current
markup.

### Form controls

Defined in `styles/window-form-controls.css`.

**Toggle switch** -- `.blacksmith-toggle` with `-input`, `-slider`, `-row`, `-label` (`:23, 32, 39, 76,
82`). 46x24px, 22px thumb travel (`:26-27, 67`), accent-colored border when checked (`:63`). This is the
current toggle for new windows; it lives in the shared stylesheet and consumes tokens. Inside a Tool window the
track, thumb, border, checked state and label follow the window's theme through `--blacksmith-tool-surface-sunken`,
`-surface-selected`, `-field-border`, `-text-muted`, `-accent` and `-text`, each with the dark-window value as its
fallback, so a toggle is readable on Light, Glass and the dark theme without the consumer styling it.

**Range slider** -- `.blacksmith-slider` wrapping an optional icon and value span, with webkit and moz
thumb pseudo-elements (`:153-230`). Its track, thumb, icon and value readout read the `--blacksmith-tool-*`
surface, field border, accent and text variables with the old values as fallbacks, so inside a Tool window the whole
component, including the value, follows Light, Glass and dark.

**Badge / tag pill** -- base plus four variants (`:100, 114, 121, 127, 133`). The base uses
`var(--blacksmith-radius-pill, 16px)` (`:107`). The base and `-accent` read the `--blacksmith-tool-*` surface, divider,
text and accent variables with the dark-window values as fallbacks. The `-success`, `-danger` and `-warning` text colours
are light tints for a dark ground, so inside a Tool window (`.application.blacksmith-window-tool`) they keep their hue
and are mixed toward `--blacksmith-tool-text` with `color-mix`, which darkens them on Light.

### Legacy toggle (skill-check windows)

A second, older toggle ships alongside the current one: `.cpb-toggle-container`, `.cpb-toggle-label`,
`.cpb-toggle`, `.cpb-toggle-slider` (`styles/window-skillcheck.css:241, 249, 257, 271`). It is 35x14px,
uses no tokens, and remains in use at `templates/partials/unified-header.hbs:33-59` and
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
markup: `templates/partials/unified-header.hbs:35-38`.

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

## Tool window controls

Shared controls for Tool windows, all namespaced `blacksmith-tool-*` (`styles/window-tool-controls.css`). Every
colour is a `--blacksmith-tool-*` variable with the dark-window value as its fallback, so each follows Light, Dark
and Glass with no theme-aware code and still reads in a standard window. A satellite uses these rather than
writing its own.

**Button** -- `.blacksmith-tool-btn`: 24px high, transparent with a divider border, a hover surface. `.is-active`
is the selected tint with orange text, `.is-danger` turns red on hover, `:disabled` is dimmed, `.is-icon` is a
square 24px button for one icon and should carry a `data-tooltip`. State uses the brand orange rather than
`--blacksmith-tool-accent`, which is near-black under Light and cream under Glass and so cannot mean "on".

**Outside a Tool window** the button, the button group and the segmented control still read in a plain dialog:
without the `--blacksmith-tool-*` variables they fall back to Foundry's own theme-aware text colours
(`--color-text-primary`, `--color-text-secondary`) and neutral grey borders and fills, so a dialog on Foundry's light
theme is not pale on pale.

**Segmented control** -- `.blacksmith-tool-segmented` holding two to four `.blacksmith-tool-segment` labels, each a
native radio plus an optional icon and a label. One rounded bordered container; the selected segment is filled
brand orange with inverse text, the others are transparent with muted text and a hover fill. Because it is
native radios, exactly one is selected, the arrow keys move it, it submits with a form, and a consumer listens
for `change`. `.is-fill` shares the width evenly. Use it for a choice that changes what is shown or done; use
tabs for whole panes and the toggle for a single on or off. **Multi-select:** several related options that are
each on or off on their own read better as one control than as a column of toggles. Use checkboxes instead of
radios and `role="group"` instead of `radiogroup`; each segment fills orange when on. The arrow keys do not move
between them, they are separate checkboxes reached with Tab.

**Toggle in a Tool window** -- `.blacksmith-toggle` is a compact 30x16 track, filled brand orange when on, with the
label in normal case inside a Tool window; elsewhere it stays 46x24 with an uppercase label. Keep it for a single on or off option. The order in a
`.blacksmith-toggle-row` is the markup's: switch first and label after is as supported as label first. The class
`.blacksmith-toggle-label` is a style, not an element, so it can be a real `<label for="id">` that flips the switch when
clicked, which is better than the span the examples show.

**Joined button group** -- `.blacksmith-tool-btn-group` wraps several `.blacksmith-tool-btn` actions in one bordered row
with dividers, so related actions do not read as separate things. For actions, not choices; a choice is the
segmented control.

**Tabs** -- `.blacksmith-tool-tabs` with `.blacksmith-tool-tab` is the Tool window tab bar: normal-case labels, a
brand-orange underline under the open tab, and an optional `.blacksmith-tool-tab-count` pill sized to the tab's own
type. `is-fill` shares the width. The boxed `.blacksmith-tab` is the standard-window bar; inside a Tool window it
takes the theme so its inactive tabs read as inactive and not disabled, and `.blacksmith-tab-count` gives it a
count that fits.

**Section** -- `.blacksmith-tool-section` with `-head`, `-title` and `-actions`: a caption (small, uppercase, in the
window accent) with an optional right-hand set of actions, and a rule above every section that follows another.
It is a rule and a caption rather than a panel, because a Tool window body is already a surface. The section is a
column with a 6px gap, so its head and whatever follows (a row of buttons, a second row, a list, a toggle) are spaced
without the consumer wrapping the content in a stack. `is-ruleless`
drops the rule; `has-rule` adds one above a section that is not preceded by another. Use this, not
`.blacksmith-window-section`, which paints a dark panel and is wrong on the Light theme.

**Card** -- `.blacksmith-tool-card` with `-head`, `-summary`, `-caret`, `-title`, `-badges`, `-actions` and `-body`. A
one-line header (name, badges, a few actions) that opens into a body. The open state is a native checkbox
(`.blacksmith-tool-card-toggle`) inside the header's label, so it opens by click and by keyboard with no script,
a consumer reads `checked`, and the actions sit outside the label: pressing one never opens or closes the card.
`is-static` is a card that does not collapse. A text field or contenteditable placed inside `-title` sits above the toggle, so
a card can have an inline rename without opening or closing when it is used. `-notice` (with `is-warning` or
`is-danger`) sits between the head and the body and shows whether the card is open or closed, for a warning or a
mode the user must not miss. The open state lives only in the page: a window that redraws sets `checked` again
from what it remembers, by listening for `change` on `.blacksmith-tool-card-toggle`.

**Chip** -- `.blacksmith-tool-chip` in a `.blacksmith-tool-chips` row: a small pill for a value the user can act
on. `is-selectable` is a native checkbox (the selected chip takes the orange tint); a `-chip-remove` button inside
makes it removable. A badge is a status label; a chip is a value.

**Hint and empty state** -- `.blacksmith-tool-hint` is one muted line that explains the controls above it,
`.blacksmith-tool-empty` is the italic "nothing here yet". A pair, and neither carries state.

**Editable text** -- `.blacksmith-tool-editable` with `-text` and a `.blacksmith-tool-btn.is-icon.blacksmith-tool-editable-edit`
pencil: a name or description that is plain text until the pencil is pressed, then a field, then text again on
Enter, blur or Escape. `data-multiline="true"` makes it a description (Enter makes a new line, Ctrl or Cmd plus Enter
accepts); `data-placeholder`, `data-maxlength` and `data-required="true"` are the other options. The behaviour is
`scripts/utility-tool-editable.js`, installed once by Blacksmith through one delegated listener, so a satellite writes
the markup and listens for `change` on the root, whose `detail` is `{ value, previous }`. It fires only when the value
changed. It works inside a card title and a list row title. A window that redraws must skip the redraw while one is
open: the root carries `is-editing`, and `api.toolEditable.isEditing(scope)` answers it; `api.toolEditable.begin(root)`
starts an edit from code, for a rename straight after creating something.

**Stack** -- `.blacksmith-tool-stack` is a column with a gap. Toggle rows are inline, so several in a row run
together; put them in a stack.

**Drop zone** -- `.blacksmith-tool-dropzone`: a dashed target for something dragged onto it (a document, a file, an
image), with an optional icon and `.blacksmith-tool-dropzone-hint`. This is the look and the state; the drag
handling is the consumer's, who toggles `is-over` (solid orange border and tint) while a drag is above it.
`is-filled` calms a zone that already holds something to a solid divider.

**The older components inside a Tool window** -- `.blacksmith-tag`, `.blacksmith-icon-action`,
`.blacksmith-window-section` (with its header and header action) and `.blacksmith-panel-card` were painted for a dark
window and rendered pale-on-pale or as dark slabs on the Light theme. Each now reads the `--blacksmith-tool-*`
surface, divider, text and accent variables with its old value as the fallback, so it follows Light, Glass and
dark inside a Tool window and is unchanged elsewhere. For new Tool window work use `.blacksmith-tool-section` and
`.blacksmith-tool-card`, which are built for it.

**Action bar buttons in a Tool window** -- the `.blacksmith-window-btn-primary`, `-secondary` and `-critical`
buttons keep their dark-window look everywhere else, but inside a Tool window they take the theme (brand
orange, raised surface, danger) and are compact to suit the 30px footer. Left footer slot: secondary and other
actions. Right: the primary action.

## Selectable entity list

`.blacksmith-entity-list` containing `.blacksmith-entity` rows, each a `<label>` wrapping a native radio or
checkbox plus `.blacksmith-entity-img`, `.blacksmith-entity-body` (`-name`, `-type`, `-reason`), and optional
`.blacksmith-entity-badges` (`styles/entity-list.css`). Selection styling follows `:has(input:checked)`
rather than a JS-applied class, so it cannot drift from the inputs. Surfaces read `--blacksmith-tool-*` with
fallbacks, so a list inside a Tool window inherits that shell. Markup is generated — see `api-entity-list.md`.

## Quantity split

`.blacksmith-quantity-split` — a three-column grid of `.blacksmith-quantity-split-value` (Give), a native
`input[type="range"]`, and a second value box (Keep), with `.blacksmith-quantity-split-caption` labels
beneath (`styles/window-form-controls.css`). Keep is always `max - give`. Same Tool-variable inheritance as
the entity list. Markup is generated — see `api-quantity-split.md`.

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

`styles/cards-parts.css`, part `templates/parts/part-gauge.hbs`.

A discrete ten-tick scale rather than two proportional segments: ten equal segments, five red then five
green, with a triangular marker placed along the track at the measured position and an icon flanking each
end. It is composed as a `gauge` -- `documentation/api/api-chatcards.md` lists the fields -- and a stats
card nests one inside each party member's `subject`.

This was previously eleven hand-written divs in `styles/cards-stats.css` with a template of its own. Both
were deleted when the stats cards moved to parts. The gauge part was built from them, so the geometry
carried over rather than being reinvented.
