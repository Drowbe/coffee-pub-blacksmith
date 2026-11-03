# Architecture: Callout

**Audience:** contributors to the Blacksmith codebase.

How the data box that points at the canvas is built, and why it has the shape it has. The public surface is `api/api-callout.md`.

Source: `scripts/api-callout.js` (`CalloutAPI`, a plain object). Styles: `styles/callout.css`, `@import`ed from `styles/default.css`. First consumer: `scripts/utility-pin-callout.js`.

## Why DOM and not PIXI

The route label that prompted this was `PIXI.Text`: one string, one style. A box with an image, badges, rows and buttons is a layout problem and a component problem, and HTML already solves both. DOM also lets the box use `blacksmith-badge` and `blacksmith-tool-btn` unchanged instead of drawing a second look in a canvas.

The cost is placement. A PIXI child follows the stage for free; a DOM box has to be moved. It does what pins do: `canvas.stage.toGlobal` for scene points, the pin element's `getBoundingClientRect` for pins, and a re-place on `canvasPan` and `resize`, coalesced to one `requestAnimationFrame`.

## Data in, markup out

`renderMarkup` is the only place HTML is made. Strings go through `foundry.utils.escapeHTML`; an icon passes `faClass` (letters, digits, hyphens and spaces, with an `fa` token) or is dropped; a badge variant is checked against a set. There is no class or HTML field in the spec, and no free-form colour. Appearance is one `style` object that `applyStyle` turns into custom properties on the box: a colour must match `#rgb`..`#rrggbbaa`, numbers are rounded and clamped, and anything else is dropped. A value that passes is a measured token and never text a stylesheet or an attribute could be broken out of. A caller that passes no `style` gets the stock panel, so a module cannot restyle the component by accident; the option exists so an author can restyle their own pins. The reasoning is the rule `tools/check-card-contracts.mjs` holds for chat cards, with the exception that here the colour is a setting its owner chose in Configure Pin, not something a consumer decides.

`validate` throws a `TypeError` at `show` and `update`, so a bad anchor or missing title fails where the mistake is. Optional arrays are not truncated.

## Anchors

An anchor resolves to a client-pixel rectangle on every placement, never once. A point is a zero-size rectangle; a pin is its element's rectangle (so a pin being dragged or zoomed is followed without the pin system telling us); a document is its placeable's `bounds` corners. An anchor that resolves to nothing is hidden, except a missing pin, which closes the callout: the pin is gone for good.

Pin elements are found by `.blacksmith-pin[data-pin-id]`. That couples this file to the pin renderer's markup; the alternative, an import of the renderer, would make the API depend on a feature.

## Placement

`place` measures the box (it is in the layer, hidden, before it is placed), tries the preferred side and then the others (a preferred corner flips on each axis, then both, then the four sides; `data-side` for a corner is its horizontal edge, so the tail is drawn on that edge at the end nearest the anchor), and takes the first that fits the viewport with an 8px margin. If none fits it takes the preferred one and clamps. The box is clamped; the tail is not: `--blacksmith-callout-tail` is the anchor's centre expressed along the box's edge, kept 14px off the corners, so the tail still points at the anchor when the box has slid away from it. `data-side` is the side of the anchor the box is on, and the stylesheet draws the tail on the edge that faces it.

`interactive: false` adds `blacksmith-callout-passive`, which is `pointer-events: none`. It exists for a box that follows the pointer: an interactive one would take `pointermove` from the canvas the moment the cursor crossed it. It cannot carry `actions`, and `validate` says so rather than ignoring them.

## Lifecycle and hover

Lifetime is the caller's. The one piece of behaviour the API owns is the grace period, because a hover-driven callout that vanishes the moment the pointer leaves the anchor can never be clicked. `hide(id, { grace: true })` waits 180 ms; the box's `mouseenter` cancels it and `mouseleave` restarts it. The grace flag is held on the entry, so a box shown without ever being hidden gracefully does not close when the pointer leaves it.

`pinned` and `dismissOnEscape` were considered and left out: a persistent callout is just one that nobody hides, and a close gesture is a design the first persistent consumer should decide, not this one.

Hooks (`canvasPan`, `canvasTearDown`) are registered through `HookManager` under one context when the first callout opens and disposed when the last closes, so an idle client carries no listeners.

## Theme

The box is a dark panel whatever Foundry's theme is, because it floats over a map. `.blacksmith-callout` sets the `--blacksmith-tool-*` values the shared badge and button read (text, divider, hover surface, sunken surface), so they take the panel's colours the way they take a Tool window's. Nothing restyles them. Without those four values a button reads `--color-text-primary`, which is dark text under Foundry's light theme, on a dark panel.

Those four, and the box's other derived colours, come from two inputs: the ink (`--blacksmith-callout-text`, else white) and the background (`--blacksmith-callout-fill`, else the dark surface). The muted ink, the divider, the hover surface and the icon tile are `color-mix` of the two, worked out once at the top of `.blacksmith-callout`, so a custom text colour or background carries to the badges and buttons without a rule for either. `applyStyle` sets only the inputs (`-fill`, `-stroke`, `-stroke-width`, `-shadow`, `-icon-color`, `-text`, `-text-size`); an input left unset falls through to the stock value.

The layer sits at `z-index: 2` after the pins overlay (`1`), under Foundry's interface.

## Pin callouts

`PinCallout` (`utility-pin-callout.js`) is Blacksmith using its own API. The pin renderer calls `show` on `mouseenter` and `hide(…, { grace: true })` on `mouseleave`; a press (`mousedown`) and `removePin` hide it at once. The content is built from the pin's data:

| Part | Source |
|---|---|
| title | `pin.text`, else the type's registered name |
| subtitle | `config.callout.subtitle`, else the type's name |
| image or icon | `pin.image`, split into URL or Font Awesome |
| badges | `config.callout.badges`, else `pin.tags` |
| body, rows, footer | `config.callout.*` |
| buttons | the pin context menu's registered items without a submenu, in order, then Configure Pin for whoever may edit |

The buttons are the context menu's items rather than a second registry, so a module that already added "Bring Players Here" to its pins has it in the callout with no change, and `visible`, `gmOnly` and `moduleId` filter the same way in both places. Items with a submenu are left out: a flyout inside a box is a second design.

`wanted` guards an async gap. Building the spec awaits `manager-pins.js`; if the pointer has left by then, nothing is shown, instead of a box that nothing will ever hide.

The picture is `calloutImage` (`mode`: `pin` default, `none`, `custom`; `src`, `fit`, `zoom`), checked by `normalizeCalloutImage`. `pin` (shown as Mirror pin) is the old behaviour: the pin's own image, or icon, with its own fit and zoom. `custom` passes `src` with the `fit` and `zoom` chosen for it. The API draws the image in a clipping tile (`data-fit` plus a clamped `--blacksmith-callout-image-zoom`), so `zoom` is a scale the tile cuts off rather than a larger box.

The fields are `calloutDisplay` (`'never'` default, `'hover'`) and `calloutStyle` (width, fill, stroke, strokeWidth, iconColor, dropShadow, textColor, textSize), both validated in `manager-pins-schema.js` and `PinManager.update` (`normalizeCalloutStyle` checks the style field by field and keeps the earlier value for one that is not valid). They are edited in the Callout section of Configure Pin's Appearance tab, which is its own section so it takes part in Update All and Default as `callout`. The style is passed straight through as the callout's `style`, and its `width` as `maxWidth`: the pin's own design options, applied to the box, with no pin-only path in the API.
