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

## Rendering cost

`renderMenubar` guards its work with a structure fingerprint; a per-tick update must write DOM directly and
never re-render. That machinery, and the failure mode where the fingerprint goes stale, is documented in
**§9B of `architecture-blacksmith.md`** rather than duplicated here.
