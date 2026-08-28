# Plan: Fullscreen Window Type

**Status:** Implemented -- pending live verification.

Delete this file once `testing/testing-fullscreen-window.md` is empty. The durable content has already
been distributed: the contract to `documentation/api/api-window.md`, the mechanism to
`documentation/architecture/architecture-window.md`, and the history to `CHANGELOG.md`. Nothing below is
a source of truth.

---

## Problem

Blacksmith exposes two window presentations -- the five-zone standard editor
(`BlacksmithWindowBaseV2`) and the compact tool palette (`BlacksmithToolWindowBaseV2`). Several suite
modules want a third: a surface that covers the viewport, blocks the table underneath, carries a
consumer-supplied background image or colour wash, and lays its content out in one of a few fixed shapes.

Blacksmith already ships one, badly. Request a Roll's Cinematic mode
(`SkillCheckDialog._showCinematicDisplay`) hand-rolls `#cpb-cinematic-overlay`: a `position: fixed` div
built as an HTML string, appended to `document.body`, shown by toggling a `.visible` class on a
`setTimeout(50)`, and torn down by `element.remove()` from three different call sites. It is not an
Application, so it has no lifecycle, no `close()`, and -- the tell -- **no Escape key**. Every module that
wants this copies those thirty lines and gets a slightly different set of bugs.

## Why a third base class rather than a mode on the standard base

Fullscreen differs in behaviour, not only in skin:

- Position is the viewport. `resizable`, `minimizable`, and position persistence are meaningless, and the
  minimise machinery in `_applyWindowSizeConstraints` is solving a problem that cannot arise.
- Two of them stacked is not a layout, it is a lost window. The Tool base is deliberately multi-instance;
  this one must be the opposite.
- It answers questions neither other type asks: what it covers, whether it blocks the canvas, what
  dismisses it.

It is still a `BlacksmithWindowBaseV2` subclass, exactly as the Tool base is, so `ACTION_HANDLERS`
delegation, scroll save/restore, and the registry keep working unchanged.

## Decisions

**Coverage: everything.** Settled by the author -- Foundry's layout offers no clean seam at which to
cover the canvas but not the sidebar, so the surface is the whole viewport.

**Modality: blocking.** The root is an opaque-to-pointers `position: fixed; inset: 0` layer, so nothing
underneath is reachable. Dismissed by Escape or the close button in the upper right. Backdrop click does
**not** dismiss by default (`dismissOnBackdrop`, default false).

**Frameless Application V2.** `window: { frame: false, positioned: false }`. Verified against
`client/applications/api/application.mjs` in the installed Foundry:

- `_renderFrame` returns a bare `div#id.classes` and `#content === #element` (line 492), so the whole
  element is ours.
- `bringToFront()` early-returns when `frame` is false (line 1088), so **no inline `z-index` is ever
  written** and plain CSS decides the stacking. That is why the pinned z-index needs no `!important`.
- `setPosition()` early-returns when `positioned` is false (line 893), so Foundry writes no inline
  geometry and CSS owns the layout.
- `_attachFrameListeners` binds the click/pointerdown handlers regardless of frame (line 1354), so
  `data-action` still dispatches.
- The element is appended to `document.body` (line 786).

The same early-return that gives us clean CSS also means the window never becomes `ui.activeWindow`, so
Foundry's own Escape-dismiss chain will not reach it. Escape is therefore handled explicitly, in the
capture phase, and swallowed -- correct here precisely because the surface is modal.

**Z-index `calc(var(--z-index-tooltip) - 10)`** = 9989. Foundry sets `--z-index-window: 100`,
`--z-index-tooltip: 9999`, `--z-index-notification: 99999` (`public/css/foundry2.css:310`), and
`ApplicationV2._maxZ` starts at `--z-index-window` and increments once per window focus. 9989 is above
any plausible session's window stack and below tooltips and notifications, which must stay reachable.

**Backdrop is a separate layer.** Opacity on the root would fade the content with it, so the image lives
on its own element behind the panel and the colour wash sits on the root. That is what lets an image be
laid over a colour at partial strength.

**Layouts are a closed set of four**, expressed as `data-layout` on the root and implemented purely in
CSS: `centered`, `bar`, `split`, `full`. Not a layout engine. Blacksmith is shedding features, not
growing a grid system; anything richer belongs inside the consumer's `bodyContent`.

**Everything else is a CSS custom property**, following the Tool shell precedent. These are component
properties of the fullscreen shell, not design tokens: they do not go in `styles/vars.css` and are not
subject to `check-design-tokens.mjs`.

## Work

1. `scripts/window-styles.js` -- lift `BLACKSMITH_WINDOW_STYLES` out of `window-tool-base.js` and add
   `FULLSCREEN`. The bridge keeps exporting it, so no consumer sees the move.
2. `BlacksmithWindowBaseV2.ZONE_DEFAULTS` -- the parent hard-coded all four zones to default true, which
   a subclass cannot change without calling `getData()` twice. Reading them from a class property makes
   the existing behaviour the default and lets fullscreen default the option bar out entirely.
3. `scripts/window-fullscreen-base.js`, `templates/window-fullscreen-template.hbs`,
   `styles/window-fullscreen.css` (+ `@import` in `default.css`).
4. Expose on `module.api` at both assignment points in `blacksmith.js`, and from `api/blacksmith-api.js`.
5. **Consumer zero:** convert Request a Roll's Cinematic mode onto the base.

## Consumer zero: the scope line

The cinematic overlay keeps `id="cpb-cinematic-overlay"` and its entire inner markup, because
`manager-rolls.js` reaches into that DOM by selector from four places to reveal results, append the group
banner, and fade out. The **shell** becomes the base's -- fixed cover, backdrop, z-index, Escape, close
button, singleton, lifecycle -- and the band stays the consumer's own content, which is the contract the
Tool base already states. The only behavioural change to the feature is that Escape now closes it.

Deliberately not done: rebuilding the band on the `bar` layout, or moving its string-built markup into a
template. That is a rewrite of a live roll flow, it is not what a third window type is for, and it would
have to happen in the same unreviewed change.

## Not in scope

- Sibling adoption. The base has to exist and be verified first.
- A theme chooser. A consumer setting a background image does not want a Light/Dark/Glass toggle
  fighting it; the Tool shell's three themes stay a Tool concept.
