# World Clock

**Audience: developers working on Blacksmith.**

How the in-world clock in the menubar is built and why. The public surface is described in
`documentation/api/api-menubar.md` where it touches the menubar; this document covers the feature itself.

## What it is

A readout of the world's in-game time, rendered in the menubar's right zone beside the session timer,
with GM-only controls for moving that time: two step sizes in each direction, and a draggable sky track.

It reads Foundry's own timekeeping and adds no calendar of its own.

## Files

The feature is deliberately self-contained. Four files carry all of it, and nothing else in the module
styles these classes or imports this manager.

| File | Holds |
|---|---|
| `scripts/manager-worldclock.js` | All behaviour: render data, formatting, stepping, dragging |
| `templates/partials/worldclock.hbs` | The markup, registered as the `blacksmith-worldclock` partial |
| `styles/worldclock.css` | All styling, reached through the `@import` chain in `default.css` |
| `tools/check-worldclock.mjs` | The invariants below, checkable from the command line |

Settings live in `scripts/settings.js` with every other setting, under the World Clock H3 heading.

## What core provides, and what this adds

Foundry v13 supplies the entire timekeeping layer. This feature consumes it and reimplements none of it:

| Capability | Source |
|---|---|
| Calendar definition, months, weekdays, seasons, leap years | `game.time.calendar` (`client/data/calendar.mjs`) |
| Current time, decomposed | `game.time.components` |
| Advancing and setting time | `game.time.advance()`, `game.time.set()` (`client/helpers/time.mjs:146`) |
| Broadcast to every client | the `updateWorldTime` hook (`client/helpers/time.mjs:211`) |

What this adds is a menubar presence and GM controls. It does **not** link time to scene darkness --
nothing in core does either, and that gap is tracked separately.

## The seam with the menubar

The menubar owns the render; the clock owns everything inside its own element. The contact surface is
exactly two calls, both from `scripts/api-menubar.js`:

- `WorldClockManager.getRenderData()` supplies the render context under the key `worldClock`
- `WorldClockManager.attachHandlers(playButtonSound)` runs from `addClickHandlers` after every render

`manager-worldclock.js` imports nothing from the menubar, so the dependency runs one way only. The sound
callback is passed in rather than imported because `playMenubarButtonSound` is a local variable inside
`MenuBar.addClickHandlers`, not a module export -- calling it from another file throws.

The widget is **not** registered with `registerMenubarTool`. That registry dispatches one `onClick` per
tool id, and this is several controls plus a drag surface inside one element. The menubar's delegated
click handler still sees these clicks, finds no registered tool, and returns.

## Why it reads components rather than doing arithmetic

`game.time.worldTime` is seconds since the world began. Deriving a time of day from it means dividing by
the length of a day -- and **the calendar declares that length**, as
`secondsPerMinute * minutesPerHour * hoursPerDay`. It is not necessarily 86400.

The first version of this readout hardcoded 86400. Harptos uses 24-hour days, so the bug was invisible in
the world it was written for and would have surfaced only in a world with a custom calendar. Everything
now derives from `calendar.days`, and `game.time.components` does the decomposition.

Two consequences that look like style choices and are not:

- **Every index in `components` is zero-based.** `month`, `dayOfMonth`, `dayOfWeek` and `season` are array
  offsets, not ordinals (`client/data/calendar.mjs:261`), hence the `+ 1` wherever a day is displayed.
- **Twelve-hour time is used only when `hoursPerDay` is 24.** AM and PM mean "before and after the midpoint
  of a 24-hour day" and say nothing on a twenty-hour calendar. Anything else falls back to zero-padded
  24-hour, which is well defined for any day length.

## Why the drag defers its write

Setting the time writes the `core.time` world setting: a database round trip broadcast to every client. A
drag across the 64px track fires a `pointermove` every few pixels, so committing per move would produce
dozens of writes for one gesture.

Instead the drag paints a local preview and commits exactly once on release. Three details make that hold:

- `updateDisplay()` returns early while `_drag` is set, so the live `updateWorldTime` repaint cannot fight
  the preview for the same nodes.
- The move and release listeners live on `window`, not the track, so the gesture survives the pointer
  leaving a very small element. They remove themselves on release.
- A release that moved less than `DRAG_EPSILON` writes nothing. Without it, tapping the track would write
  the time it already was and broadcast to every client to announce that nothing happened.

Dragged values snap to whole minutes. The track maps roughly twenty minutes of world time to a single
pixel, so finer precision is noise the GM cannot aim at, and unsnapped values produce times like 6:31:47
that read as broken rather than precise. A drag to the far right clamps to the last minute of the day
rather than rolling into the next midnight.

## The panel is a window, not a gauge

The whole panel is the sky outside: its colour is the colour of the sky at this moment, and one body arcs
across it -- a sun by day, a moon by night, changing identity at the horizon.

**One body, one arc, two phases.** `_getArc()` returns progress through the *current* phase rather than
through the day, so both bodies get a full sweep however long their phase lasts. A short winter day then
looks like a short day rather than a sun that gives up halfway. The night case wraps midnight, so it is not
a subtraction: night runs from sunset through 1.0 and on through 0.0 to sunrise, and 03:00 is *later* in
the night than 21:00 despite being the smaller number.

**The arc is a sine, not a path.** `Math.sin(PI * progress)` is 0 at both ends and 1 at the peak, which is
the shape wanted and needs no curve fitted to a particular panel size. A CSS `offset-path` would hardcode
the geometry in pixels and break the moment the panel is resized. Neither Pixi nor SVG is involved, and
neither would earn its cost: the only things changing are a colour and a position.

**Where the split falls.** JS owns every value that changes with the time and hands them to CSS as custom
properties on `.worldclock-sky` -- `--sky-top`, `--sky-bottom`, `--star-opacity`, `--body-x`, `--body-y`.
"What colour is the sky at 04:00" is a data question and has to be JS, because CSS cannot interpolate
between two gradients on a variable. "How is that painted" is a presentation question and stays in the
stylesheet. `_paint()` is therefore a loop over the properties rather than a list of cases: adding one to
`_getSkyView()` needs no change to the paint path.

**Dawn and dusk are lit from below.** Those two `SKY_STOPS` entries carry a warm bottom under a
still-dark top, and that asymmetry is the whole reason sunrise reads as sunrise instead of as a dim day.

**Stars fade rather than switch.** Snapping them on at sunset would be the one thing on the panel that
jumps, at exactly the moment the eye is watching the sun touch the horizon. They ramp across a band either
side of each horizon, which also produces the brief window where a still-warm sky carries faint stars.
They are drawn as fixed radial gradients -- no asset to ship, crisp at any DPI, and fixed because stars
that reshuffled on each repaint would shimmer every time the clock ticked.

## Permissions

Time is a world setting, so only a GM can move it. Players get the readout and the tooltip with no
controls rendered at all -- a control that errors is worse than one that is absent. `step()` and
`_beginDrag()` each re-check `isGM` for anything reaching them directly.

Players receive time changes through the ordinary `updateWorldTime` broadcast; there is no socket traffic
and no second code path.

## No interval

Unlike the session timer beside it, the clock is not on a timer. World time does not pass on its own --
it moves only when something advances it, and `updateWorldTime` fires exactly then. A ticking interval
would spend a repaint per second redrawing an identical string for the whole session.

## Invariants that fail silently

Three couplings span files, and every one of them fails without an error. `node tools/check-worldclock.mjs`
enforces all three and exits non-zero on a violation.

- **Every custom property JS sets is one the stylesheet reads, and vice versa.** A property nothing reads
  is computed for nothing; a property nothing sets falls back to its CSS default, so the panel keeps
  painting a plausible sky that has quietly stopped tracking the time.
- **`SKY_STOPS` runs 0 to 1, sorted, and closes the loop.** The interpolation walks the list in order and
  silently picks the wrong pair if it is unsorted; if the first and last colours differ, the sky flashes
  for one frame at midnight, which is near-impossible to catch by eye.
- **The classes the manager queries exist in the partial.** Every paint path fails quietly rather than
  throwing, so a renamed class means the clock simply stops updating with nothing logged.
- **The registered partial name matches the invoked one.** Handlebars throws on a missing partial and the
  menubar's render guard catches it, so a mismatch costs the entire menubar rather than just the clock.

For the same reason, `WorldClockManager.initialize()` must run **before** the first menubar render. It is
called early in `ready` in `scripts/blacksmith.js`, ahead of `MenuBar.initialize()`.

## Tooltip content is escaped

The tooltip is emitted unescaped by the template because it carries `<br>` separators, so the parts
interpolated into it are escaped in `_buildTooltip`. Month, weekday and season names come from whichever
calendar is configured -- a system, a module, or a hand-rolled world calendar -- which makes them
third-party strings.
