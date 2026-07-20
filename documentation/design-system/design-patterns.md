# Design Patterns and Conventions

**For contributors to Blacksmith and authors of closely-integrated modules.** How the stylesheets and
scripts are organized, what the naming conventions are, and the cross-cutting layers -- stacking order and
motion.

Token values are on the Design tokens page; component classes are on the Design components page.

## How stylesheets load

`module.json` loads two entries: `styles/default.css` and `styles/notes-gm.css`. Everything else arrives
through `default.css`, which `@import`s 50 stylesheets. `vars.css` is the first import, so tokens are
defined before any component stylesheet consumes them.

`notes-gm.css` is the exception -- Foundry loads it directly, not through the import chain.

Two stylesheets are reached by neither mechanism and are therefore inert: `styles/journal-toolbars.css`
and `styles/widget-tags.css`. The latter styles the tag widget, whose template and script are complete but
which no template currently renders.

## Stylesheet organization

`styles/` holds 54 files, grouped by the surface they style.

| Family | Covers |
|---|---|
| `vars.css` | Global design tokens. Loads first. |
| `default.css` | The import manifest. No rules of its own. |
| `common.css` | Root layout variables, chat and scene cleanup |
| `cards-*.css` | Chat cards -- `-common-layout` is structure, `-common-themes` is color only |
| `window-*.css` | Application windows, dialogs, form controls, tooltips |
| `menubar*.css` | Primary menubar, secondary bars, combat bar |
| `toolbar*.css` | Toolbars and zones |
| `timer-*.css` | Combat, planning, and round timers |
| `sidebar-*.css` | Sidebar surfaces |
| `journal-*.css` | Journal tools, pins, toolbars |
| `pins.css` | Canvas pins |

The rest are per-feature: `toast.css`, `vote.css`, `settings.css`, `combat-tools.css`,
`token-movement.css`, `latency.css`, `loading-progress.css`, `menu-context-global.css`,
`tabs-scenes.css`, `utility-quickview.css`, `notes-gm.css`, `widget-tags.css`,
`overrides-foundry.css`, `overrides-modules.css`, `links-themes.css`.

Two conventions hold across the tree. `cards-common-themes.css` contains color declarations only -- no
radius, spacing, typography, or layout -- which is what makes a new theme a pure color exercise. And
`vars.css` carries no component-specific rules (`styles/vars.css:16`).

## CSS class naming

Two prefixes are in live parallel use: `.blacksmith-*` (345 distinct classes) and `.cpb-*` (141). Broadly
`blacksmith-` covers canvas, menubar, window and card surfaces while `cpb-` covers dialog chrome and
skill-check UI, but the split is historical rather than semantic. New components use `blacksmith-`.

A third prefix, `.bsw-*` (15 classes), is used only by the tag widget --
`templates/partials/tag-widget.hbs` and `styles/widget-tags.css`. It is scoped to that one component.

The `.bh-` prefix appears nowhere in `styles/`, `templates/`, or `scripts/`.

BEM double-underscore syntax is not used -- there are no `.block__element` selectors. Variants and states
are separate classes applied alongside the base: `.is-active`, `.active`, `.collapsed`, `.expired`,
`.dragover`, `.hidden`, `.tool-active`, `.has-secondary`, `.section-dark`, `.label-dimmed`,
`.label-highlighted`.

## CSS custom property naming

Global tokens are `--blacksmith-[category]-[step]` and live in `vars.css`. Component-scoped properties
follow `--blacksmith-[component]-[property]` and live with their component: `--blacksmith-card-*` (16),
`--blacksmith-menubar-*` (32), `--blacksmith-pin-*` (6). Two families predate the convention and keep
their own shape: `--secondary-bar-*` (6) and `--a-content-link-*` (10, in `styles/links-themes.css:6`).

Nine legacy Hungarian-notation properties remain in `styles/common.css:8-16` --- `--intChatSpacing`,
`--strHideRollTableIcon`, and the `--strScene*` set. They are written by the scene-title and chat settings
handlers.

## Script organization

`scripts/` holds 94 files in these families:

| Prefix | Count | Covers |
|---|---|---|
| `manager-*` | 24 | Long-lived subsystem controllers |
| `utility-*` | 13 | Shared helpers |
| `api-*` | 12 | Public API surfaces |
| `window-*` | 11 | ApplicationV2 window classes |
| `ui-*` | 8 | UI injection and augmentation |
| `timer-*` | 4 | Combat, planning, round timers |
| `registry-*` | 4 | Registries, including JSON import |
| `stats-*`, `pins-*`, `asset-*` | 2 each | Statistics, canvas pins, asset loading |

The remainder are single-purpose files named for what they are: `blacksmith.js` (entry point and API
assembly), `const.js`, `xp-manager.js`, `token-movement.js`, `theme-request-roll.js`, `widget-tags.js`,
`canvas-layer.js`, `compendium-types.js`, `pin-permission-icons.js`, `prompt-builder-actors.js`.

Function naming follows `get[Thing]`, `set[Thing]`, and `build[Component]`, all well populated. Variables
carry Hungarian prefixes in older code -- `str`, `int`, `bln`.

## Template organization

`templates/` holds 41 root templates plus `templates/partials/`. Cards are `card-*.hbs` with shared
structure in `cards-common.hbs`; windows are `window-*.hbs`; timers are `timer-*.hbs`. Feature templates
are named for their feature (`menubar.hbs`, `vote-window.hbs`, `journal-tools-window.hbs`).

Partials are registered with `Handlebars.registerPartial` under an explicit alias rather than by path --
the shared header is registered as `partial-unified-header` (`scripts/blacksmith.js:841-844`). Template
preloading uses `foundry.applications.handlebars.loadTemplates`; the bare v1 globals are deprecated in
v13 and are not used in this module.

## Stacking order

Stacking is assigned in tiers rather than ad hoc.

| Layer | Used by |
|---|---|
| `-1` | Menubar backdrop (`styles/menubar.css:463`) |
| `1` - `5` | In-card and in-pin layering |
| `10`, `99` | Local element stacking, menubar internals |
| `100` | Primary menubar (`styles/menubar.css:115`), tag widget, JSON import window |
| `120` | Combat bar (`styles/menubar-combatbar.css:464`) |
| `999` - `1000` | Cinematic roll overlay, encounter toolbar, quick view |
| `10000` | Global context menu, loading progress, toasts, cinematic top layer |
| `10001` | Above the toast stack (`styles/toast.css:143`) |
| `100000` | Pin interaction layer (`styles/pins.css:90`) |
| `999999` | Global context menu top layer (`styles/menu-context-global.css:21`) |

Layer `100` is shared by three components rather than reserved for the menubar, and the combat bar sits
above it at `120`.

## Motion

Transitions cluster on a small set of durations -- `0.15s ease` and `0.2s ease` dominate, with
`0.2s ease-out`, `0.3s ease`, `0.3s ease-out`, and `0.4s ease-out` also common. Other combinations appear
in smaller numbers across the tree, so this is the prevailing set rather than an enforced one.

Named animations are defined near the components that use them: pin animations in `styles/pins.css:366-569`
(ten `blacksmith-pin-*` keyframes), card and skill-check animations in `styles/cards-skill-check.css`,
cinematic roll animations in `styles/window-roll-cinematic.css`, and per-feature keyframes in
`styles/menubar.css`, `styles/menubar-combatbar.css`, `styles/timer-planning.css`,
`styles/token-movement.css`, `styles/combat-tools.css`, `styles/loading-progress.css`,
`styles/window-common.css`, `styles/window-json-import.css`, and `styles/window-skillcheck.css`.
