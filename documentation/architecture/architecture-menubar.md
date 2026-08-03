# Menubar — Architecture

**Audience:** Contributors to the Blacksmith codebase, and modules putting a bar in the menubar.

How the menubar is laid out and sized, and why the sizing model is what it is. For the public surface --
registering tools, bar types, and items -- see `../api/api-menubar.md`.

**Files:**

| File | Role |
|---|---|
| `scripts/api-menubar.js` | The `MenuBar` static class: registration, rendering, and every height variable it writes |
| `styles/menubar.css` | All layout, the size scale, and the variables the whole system reads |
| `templates/partials/menubar-secondary-default.hbs` | The shared default toolbar: zones, groups, banners, and the four item kinds |
| `scripts/manager-combatbar.js` | The encounter bar, and the one bar that sizes itself -- see `architecture-encounter.md` |

## The secondary bar is a singleton slot

There is one secondary bar at a time. `openSecondaryBar(typeId)` closes whatever was open, sets
`MenuBar.secondaryBar` to the new type, and re-renders. This is deliberate -- the bar is a tab strip, not a
stack -- but it means a module cannot assume its bar is still open, and must not hold DOM references across
an open of some other type.

A bar type may render three ways: **default** (registered items only), **custom template**
(`templatePath`, replaces the bar and rejects items), or **hybrid** (`templatePath` plus
`hybridItems: true`, which renders both). Hybrid exists because the encounter bar's portrait strip cannot
be expressed as items while its readouts are best expressed as nothing else.

### The tool that opens a bar

A bar's menubar button is a `toggleable` tool, and the generic click handler flips `tool.active` on any
such tool without knowing what it does. That means a tool goes active by a route that knows nothing about
bars, so the bar machinery has to be what turns it off.

`_syncSecondaryBarButtonStates(newType)` therefore **derives the whole set** rather than clearing one
entry: since only one bar can be open, `tool.active = barTypeId === newType` across every mapping in
`secondaryBarToolMapping`. Clearing only the previously-open type left any tool that went active by some
other route lit forever, which is precisely what the generic click handler is.

The mapping itself is **learned when it is not declared**. `registerSecondaryBarTool(barTypeId, toolId)` is
the explicit declaration and wins, but it is optional and about half the suite never called it. So a bar
opened from inside a tool's `onClick` records that tool as its owner: the click handler publishes
`MenuBar._toolBeingClicked` for the duration of the call and clears it in a `finally`, and
`openSecondaryBar` reads it when the type has no mapping yet. The `finally` is load-bearing — a handler
that throws would otherwise leave a stale id to be misattributed to the next bar opened from anywhere.

## Height is a scale factor, not a dimension

This is the single most load-bearing fact about the menubar, and the one that is not visible from any one
rule in the stylesheet.

`--blacksmith-menubar-secondary-height` does not just set how tall the bar is. Nearly every size inside the
bar is derived from it by the same shape:

```css
clamp(<floor>, calc(var(--blacksmith-menubar-secondary-height) * <factor>), <ceiling>)
```

Font sizes, icon sizes, image sizes, item gaps, and item padding all resolve this way (`menubar.css`, the
`--secondary-bar-item-*` block). A bar that raises its height to fit more content therefore also enlarges
its typography, and the two cannot be separated by configuration -- there is one number.

Two consequences follow, and both have bitten:

- **A module that wants room asks for the wrong thing.** It raises `height`, the type grows with it, and
  the bar stops matching every other bar. Repeat across the suite and there is no house style left.
- **Height must be treated as a design token, not a layout knob.** Which is why the API takes a *preset*
  (`size: 'default' | 'large' | 'xlarge'`, resolved by `MenuBar.getSecondaryBarSizePreset`) and takes no
  pixel value at all. `config.height` used to be accepted as an escape hatch; every module in the suite
  took it, which is the argument against having one. It is now ignored with a warning. A token with a
  per-caller override is not a token.

A custom template does not change any of this. `templatePath` controls markup; the bar still renders inside
`.blacksmith-menubar-secondary`, still takes its height from the same variable, and still scales its type
from it. The encounter bar sizes itself not because it has a template but because `applyBarHeight` writes
the height variables directly, which is not a public path.

`openSecondaryBar(typeId, {height})` survives and is a different mechanism: it re-opens a bar at a height
*that bar* recomputed, which is what a bar whose height changes with its own state needs. The encounter bar
is the only caller. It is not a way to choose a size, and a bar with one fixed appearance has no use for it.

The house default lives in CSS as `--blacksmith-menubar-secondary-default-height` and is deliberately equal
to `--blacksmith-menubar-primary-height`, so the two bars read as one component. It was `0px` for a long
time -- falsy, so every read fell through to a hardcoded fallback and the variable did nothing, while
`registerSecondaryBarType` defaulted to an unrelated `50`. That gap is the direct cause of the suite's bars
not matching.

### Item sizes must be lengths, never percentages

Everything inside a bar derives its size from the bar height as a **length**. That is not stylistic. A
`.secondary-bar-item` is a shrink-to-fit flex box with `min-height` and `min-width` but no `width` or
`height`, so a percentage dimension on a child is cyclic — the child's size depends on the parent's, which
depends on the child's. CSS breaks the cycle by resolving the parent against the child's *intrinsic* size.

For an `<i>` that is harmless: an icon has no intrinsic size, so the percentage collapses and the font-size
governs. For an `<img>` it is not. `--secondary-bar-item-image-size` was `100%`, which meant "the
portrait's natural dimensions" rather than "the button" — and Foundry actor art is routinely 512px, so a
portrait button expanded to the width of the screen while the bar clipped a horizontal band out of the
middle of it. `object-fit: cover` does not save this; it governs how an image fills a box whose size is
already decided, and `min-width` is a floor rather than a ceiling.

The value is now `calc(var(--blacksmith-menubar-secondary-height) - 12px)`, the same number as the item's
own minimums, so an image item is exactly the minimum square. The `- 12px` works out because
`.secondary-bar-item:has(.secondary-bar-item-image)` zeroes the item's padding, leaving the button two
pixels of border over the image and two pixels of slack inside the toolbar at every preset.

This bug survived a full migration and five verification steps because **every other bar in the suite is
icons and labels**. When adding a check for bar layout, check an item, not just the bar: a bar can be
exactly the right height with its contents entirely wrong.

## Group banners are additive

A banner captions a cluster of buttons. It used to be **subtractive**: the bannered group container derived
an `--available-height` of `bar height - banner - gap - 12px` and sized its items from that. At the house
default of 30px that leaves items 6px tall.

So a module with banners had exactly one remedy -- inflate the bar -- and inflating it inflated the type as
a side effect. The bars in this suite that are visibly larger than the rest are mostly not asking for large
text; they are asking for room under a banner.

Banners are now added on top. `MenuBar._applyBannerAllowance(barType)` runs on every open and close and
writes two variables:

| Variable | Meaning |
|---|---|
| `--blacksmith-menubar-secondary-banner-height` | The banner's own height, still 20% of the bar clamped to 10-20px |
| `--blacksmith-menubar-secondary-banner-allowance` | Banner plus gap -- the space the bar grows by |

Both are `0px` for a bar without banners, which makes every rule that reads them an exact no-op there.

The allowance is spent in three places, and all three are required:

1. `.blacksmith-menubar-secondary` takes it as `padding-bottom`. The bar is `box-sizing: content-box`
   specifically so padding adds to the configured height instead of eating it.
2. `.secondary-bar-toolbar` is `calc(100% + allowance)` and `align-self: flex-start`, so the toolbar
   actually reaches into that padding. Padding alone would not have helped -- the toolbar is a child laid
   out in the content box, and `overflow: hidden` on the bar clips at the padding edge, not the content
   edge. Top-aligned rather than centred, or the extra height spills upward into the shadow offset too.
3. `--blacksmith-menubar-total-height` includes it, so the Foundry interface below the menubar moves down.

Bannered items are sized by the ordinary `.secondary-bar-item` rule. There is no bannered-item size rule
any more, and reintroducing one puts the whole problem back.

## Who writes the height variables

Four writers, and they must agree:

| Writer | Writes |
|---|---|
| `MenuBar.openSecondaryBar` | `--blacksmith-menubar-secondary-height`, the banner variables, `--blacksmith-menubar-total-height` |
| `MenuBar.closeSecondaryBar` / `_cleanupSecondaryBars` | The same three, back to zero |
| `MenuBar._removeMenubarDom` | All of them to zero, including the primary height |
| `CombatBarManager.applyBarHeight` | The secondary height, plus its own two row variables -- the encounter bar is two stacked rows and sizes itself per combat state |

`--blacksmith-menubar-total-height` is written as a `calc()` referencing the other variables rather than a
resolved pixel value, so a later change to any term is picked up without a second write. Everything that
must sit below the menubar reads `--blacksmith-menubar-interface-offset`, which is that total plus 2px.

## Three custom-property traps

All three were live bugs, and all three look correct while being wrong:

- **A declaration on an element shadows inheritance.** Declaring a fallback on the element that also
  *consumes* the variable means the element sizes from its own fallback, not from the value written to
  `:root`. This produced a bar whose root variable read 82px while its portraits sized from 60. Declare
  fallbacks on `:root`.
- **A `:root`-declared variable substitutes at computed-value time there.** A rule elsewhere that expects
  to override it by declaring it lower in the cascade may find the value already resolved.
- **Inline styles beat stylesheets, including per-tick writes.** Any value the code writes inline once must
  be cleared by the code that later wants CSS to own it -- progress bar fill and track colours both shipped
  broken for exactly this reason. See `syncTimerReadout` in `manager-combatbar.js`.

## Item kinds, and where a new one is added

An item is either a **button**, which is clickable, or one of the **display kinds**, which is not:
`info`, `statchip`, `portraitstat`, `gaugechip`, `progressbar`, `balancebar`.

Two sets in `api-menubar.js` define that split, and both exist because the alternative was worse:

`DISPLAY_KINDS` is what switch-group handling asks. Six separate `kind !== 'info' && kind !== ...`
chains used to encode it inline, so a new kind had to find all six or be silently treated as a button
— given an active state, counted toward a switch group, and offered a pointer cursor it does nothing
with.

`CHIP_KINDS` is the narrower set that is shaped like a chip: an icon, an optional label, a value.
They share one preparation block and one branch of the value patch because they share those fields;
what differs is the ornament each adds. The bars are deliberately not in it — their live fields are
geometry, not text.

**The markup for every kind lives in one partial**, `templates/partials/menubar-secondary-item.hbs`,
invoked by each zone as `{{> "menubar-secondary-item" this groupId=../id}}`. Before that, the three
zones each carried a full copy of the per-kind dispatch, so every kind cost three identical blocks and
a fix applied to whichever zone the author happened to be reading. `groupId` is passed explicitly
because `../id` does not resolve the same way from inside a partial. The item partial must register
**before** the bar partial that invokes it (`_registerPartials`): Handlebars resolves a partial at
render time and a bar rendered in between fails rather than waiting.

So adding a kind means: a branch in the item partial, membership in the right set (or both), a case in
the preparation block, a case in the value patch, and styles in `styles/menubar-widgets.css` — which
needs its `@import` in `styles/default.css` or it is silently unstyled.

### What the three ornamented kinds are for

They exist because a rank, a quantity, a percentage and a person all rendered identically as `info`,
and nothing about a chip said which it was.

| Kind | Answers | Ornament |
|---|---|---|
| `statchip` | how much | `tone` colours the value; `record` adds a hairline |
| `portraitstat` | who | round ringed portrait, `rank` colours the ring |
| `gaugechip` | what proportion | a ring whose sweep is the percentage |

**Tone describes what a rise in the number means, not whether the number is large.** Damage dealt is
`good` and damage taken is `bad`, though both climb as a fight goes on.

**Identity, not affordance.** These may use colour, weight and shape; they may not use a fill, a
pointer cursor or a hover lift. That is the same reason `menubar-combatbar.css` strips the shared item
chrome from the data row — a readout wearing button chrome offers something it cannot do — and the
widgets must not put it back.

Two implementation choices are load-bearing rather than incidental. The gauge is a **conic gradient
masked into a ring**, not an SVG arc, so its sweep is a single custom property: a value update is one
style write with no markup to rebuild, and it inherits the row's sizing variables directly where an
SVG would need its geometry recomputed per row height. And a portrait chip's **frame keeps its size
when empty**, falling back to a placeholder glyph, so a standing changing hands never shifts the chips
either side of it.

The widget tones are declared in `menubar-widgets.css` rather than taken from the `--blacksmith-status-*`
tokens, which are chosen for light surfaces and read fluorescent on this bar's warm translucent row.
That is the same finding that gave `manager-combatbar.js` its own `getDifficultyChipColor`.

## Rendering cost

`renderMenubar` guards its work with a structure fingerprint; a per-tick update must write DOM directly and
never re-render. That machinery, and the failure mode where the fingerprint goes stale, is documented in
**§9B of `architecture-blacksmith.md`** rather than duplicated here.

A pushed readout **value** is a separate path: it is written into the standing DOM by
`_applySecondaryBarValueRefresh` rather than re-rendering, applied synchronously where it is pushed so
it never depends on a later render arriving. It reports failure only when the change needs an element
added or removed, which falls through to a rebuild.
