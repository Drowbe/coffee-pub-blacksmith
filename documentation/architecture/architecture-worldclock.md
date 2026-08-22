# World Clock

**Audience: developers working on Blacksmith.**

How the in-world clock in the menubar is built and why. The public surface is described in
`documentation/api/api-menubar.md` where it touches the menubar; this document covers the feature itself.

## What it is

A readout of the world's in-game time, rendered first in the menubar's right zone so that zone reads
world time, then tools, then the session timer, with GM-only controls for moving that time: two step
sizes in each direction, and a draggable sky track.

It reads Foundry's own timekeeping and adds no calendar of its own.

## Files

The feature is deliberately self-contained. Four files carry all of it, and nothing else in the module
styles these classes or imports this manager.

| File | Holds |
|---|---|
| `scripts/manager-worldclock.js` | All behaviour: render data, formatting, stepping, dragging |
| `scripts/manager-time-modes.js` | `TimeDriver` (advances world time by itself) and `TimeModes` (which speed is selected) |
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
| Formatting helpers | `calendar.format(time, formatter, options)` (`client/data/calendar.mjs:147`) |
| The Harptos calendar, and a calendar HUD of its own | the dnd5e system (`templates/apps/calendar-core.hbs`) |

Two consequences worth stating, because both were assumed wrong at the start of this work. **There is no
calendar provider to integrate with** -- core is the provider, and a system supplies the calendar on top of
it. And **the clock is not the gap**: core already ships time, a calendar and a HUD, so putting one in the
menubar is a placement decision. The gap is darkness, below.

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
click handler still sees these clicks, finds no registered tool, and returns. It is hardcoded as the
first child of the right zone, so leader, movement, and other right-zone tools cannot reorder in front of it.

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
  24-hour, which is well defined for any day length. **The hour is always two digits on the face.** A
  leading zero that is a pad (9 o'clock) is a separate `.worldclock-tens.is-pad` node, dimmed like a
  physical clock; a real tens digit is not. That is why dragging the sun through 9:59 does not jump the
  face sideways. The tooltip string is the same value concatenated, so it stays `09:44 AM`.

## The menu

Opens on a **single left click** on either the mode indicator or the time, and on a right click too. A
right-click-only menu on a strip of read-outs is a menu nobody finds. GM only -- every entry either changes
the world's time, rests the party, or opens a window -- so players get no menu rather than an empty one.

```
Tuesday, 5 Hammer 1496    the date, disabled -- a statement, not an action
winter . leap year        season and leap year, when the calendar says so
---
Pause Time             the same toggle double-clicking performs
Rest and Recovery      the rest window; the kind of rest is the first question it asks
Calendar and Events    the calendar window
Jump to >              Dawn, Noon, Dusk, Midnight -- always forward
Time Mode >            Combat, Real-time, Slow (0.25x), Fast (60x), Paused
                       swords / play / turtle / forward / pause
Options >              Set Time, Set Date, then anything contributed
    Set Time               our dialog: time of day only, bounds from the calendar
    Set Date               the system's dnd5e.applications.calendar.SetDateDialog
    Darkness Control on <scene>     contributed through registerOptionProvider
```

**Ordered by how often a GM reaches for it, not by category.** Pause is first because it is wanted
mid-sentence when somebody walks in, and it is the only entry that acts immediately rather than opening
something. No separators: six entries do not need grouping, and a rule between them implied a distinction
that is not there.

**Set Time and Set Date live under Options**, not at the top level. They are the two entries a GM reaches
for least, and they were sitting above the ones reached for most.

**Pause is in the menu as well as on the double click.** A gesture nobody is told about is a gesture nobody
uses, and the menu is where they would look. Its label says which way the toggle goes.

**Jump to only ever moves forward.** Jumping to dawn at three in the afternoon means tomorrow morning, not
nine hours ago. A GM skipping ahead is what it is for, and rewinding would undo whatever the session just
did -- it would also ripple, since schedules re-arm on a rewind rather than firing and the darkness driver
would run the day backwards. A jump to the moment it already is goes to tomorrow rather than nowhere.

**Dawn and dusk come from the horizon settings; noon and midnight are clock positions.** On a world with a
05:00 sunrise those differ by an hour, and an entry labelled Noon that moved the clock to 13:00 would be
wrong in the way that matters -- the label is a time, so it should be that time.

**Rest routes to the system.** `party.longRest()` posts dnd5e's request card and applies its own recovery,
so Rest Recovery and anything else hooking rests keeps working. Blacksmith is not in the rest business; it
moves the clock afterwards and nothing more.

**Set Date opens the system's dialog rather than a copy.** It already knows the configured calendar's
months, leap years and year offset, and a picker that disagreed with the system about what year it is would
be worse than none. Only the dialog is used -- the system's calendar HUD stays hidden.

**Set Time is separate from Set Date, and ours.** Moving to eight in the evening is a different act from
moving to next Tuesday, and one dialog asking for both makes the common case carry the rare one's fields.
It rebuilds the time from the day's start rather than adding a delta, so only the time of day moves.

**Options is a submenu, and the seam feeds it.** The top level is for things a GM does *to the world*;
Options is for how the clock behaves. Mixing them puts the dangerous items beside the preferences.
`registerOptionProvider` lets a feature contribute without the clock importing it -- the darkness driver is
the first and only user. A provider that throws is caught and the menu still builds.

**The row is three units, not six siblings.** The markup groups into `.worldclock-steps` (each chevron
pair), `.worldclock-face` (sky + time), `.worldclock-steps`. The section gap sits between those units;
the face gap between sky and time is 6px. The hour is always two digits, with a dim pad zero when it is
not a real tens, so a drag does not resize the face. The step chevrons carry a light fill so they read
as buttons. That grouping is visual. Click handling is unchanged.

**The time label is the button, not the whole widget.** Every other part already does something on click --
the arrows step, the sun drags -- and the sky is a picture rather than a control, so a menu hung off the
section would fire from presses aimed at the sky. Only `.worldclock-time` carries the handler, and only it
takes the pointer cursor. `.worldclock-face` is not a hit target.

A click immediately following a drag is still suppressed, because a drag released over `.worldclock-time`
reports that label as the click target and would otherwise open the menu on top of the gesture that just
ended.

The tooltip carries no instructions. A grab cursor on the sun and arrows either side of a clock are
self-evident, and a line explaining them is a line the reader skips past every time they wanted the date.

## The drag handle is the sun, not the panel

Dragging anywhere on the sky was the first version and was wrong twice over.

**It was unreadable.** Nothing said the panel could be dragged, and a press on empty sky *seeked* the time
to wherever it landed — the behaviour of a scrub bar, not of something you pick up. The handle is now the
body itself, with `cursor: grab`, a hover brighten, and an invisible `::before` that roughly triples the
hit area of a ten-pixel glyph without moving the glyph (padding would have shifted it, and its position is
its meaning). Nothing is painted on pointerdown: picking a thing up must not move it.

**It was also computing the wrong time.** The body's position along the panel is progress through the
**current phase**, not through the day — that is what makes the sun sweep the whole panel between sunrise
and sunset, and the moon do the same across the night. But the drag mapped the pointer to a fraction of the
whole day. At midnight the moon sits mid-panel while a day-fraction reading of mid-panel is *midday*, so
grabbing the moon would have thrown it half a day across the sky. `_getPhase()` is now shared by the arc
and the drag, so the pointer and the thing under it cannot disagree.

Consequences worth knowing:

- **A drag is clamped to its own phase.** The sun cannot be dragged into the night; crossing a horizon is
  what the step arrows are for. A gesture that silently swapped which body you were holding would be a
  strange thing to hand someone.
- **A night drag crosses midnight into the next day**, because the drag works in absolute seconds from the
  phase's start rather than as an offset within today. Dragging back from 02:00 reaches *yesterday's*
  sunset. No date special-casing.
- **The grab offset is preserved**, so grabbing the sun by its edge does not snap it under the cursor.
- **`ARC_INSET` keeps the body off both edges.** The panel clips, and a clipped region is not hit-testable,
  so without the inset the sun would be half ungrabbable at sunrise and the moon at dusk.

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

## Scene darkness

`scripts/manager-darkness.js` makes a scene's darkness follow the clock. It is the one capability core
lacks: `scene.environment.darknessLevel` exists and the canvas reacts to it, but nothing moves it as time
passes.

**It drives that one number and nothing else.** The Ambience tab carries a full Base Ambience and Dark
Ambience pair plus Blend Ambience, and Foundry already merges the two *by darkness level*
(`client/canvas/groups/environment.mjs:228`). So one number drives the whole look -- colour, luminosity,
saturation, shadows -- and each scene keeps whatever Dark Ambience its GM chose. A cave tinted green goes
green at night for free. Driving the dark hue as well would overwrite a deliberate per-scene choice.

**The dependency runs one way.** The driver borrows `WorldClockManager.getCurrentDayFraction()` and
`getHorizons()` rather than computing its own, because two answers to "what time of day is it" that can
disagree is the failure this feature exists to avoid. `manager-worldclock.js` never references the driver.

**The curve is flat, flat, and steep in between.** Zero through the day, night darkness through the night,
a smoothed ramp across each twilight. A straight line from sunrise to sunset was the obvious first shape
and is wrong: it makes two in the afternoon perceptibly dimmer than noon, which reads as a fault rather
than as time passing.

**Twilight is centred on the horizon, not started at it.** With a one-hour twilight and a 06:00 sunrise the
change runs 05:30 to 06:30 and is half done at 06:00 -- the same moment the sun sits on the horizon in the
menubar panel. A ramp starting at sunrise would leave the world pitch black at the moment the panel shows
dawn. `_circularDelta` measures distance around a day that wraps, because a twilight can straddle midnight:
with a 00:20 sunrise, 23:55 is five minutes *before* dawn, not twenty-three hours after it.

**Sunrise and sunset are settings, and both features read them.** They are configured in hours, because
that is how a person thinks about dawn, and converted with the calendar's own `hoursPerDay`. The sky panel
does not recompute its nine `SKY_STOPS` when they move -- `_normalizeForSky()` stretches the *lookup*
instead, so the table stays authored against a 0.25/0.75 day while the real horizons land wherever they are
set.

**Writes are gated, and that is most of the design.** Only when the computed darkness differs from the
stored value by more than `EPSILON`. Because the curve is flat across midday and midnight, most clock steps
compute no change and never touch the database: stepping a full day at ten-minute increments produces about
a dozen writes across 144 steps.

**Transitions are core's, not ours.** `scene.update(..., {animateDarkness: ms})` animates on every client
(`client/documents/scene.mjs:606`) with no socket and no animation code here. Core's own default is 10s,
right for the scene-controls day/night buttons and far too slow for a clock step; `ANIMATE_MS` is 2s.

**Darkness Level Lock is the override, and the driver must never set it.** Core deletes `darknessLevel`
from any update to a locked scene (`client/documents/scene.mjs:417`), *including ours* -- so locking a
clock-driven scene would lock the clock out of it. The upside is that a GM ticking Lock genuinely does pin
that scene against the clock with nothing implemented on our side. The driver checks the lock first only to
avoid issuing writes that would be discarded.

**Opt-in per scene, never opt-out.** Following the clock is a scene flag toggled by right-clicking the
world clock. Defaulting it on would black out every dungeon, cellar and windowless tavern the first time
the clock passed sunset. The context-menu entry reports the current state as well as toggling it, and says
so when Lock is blocking the driver -- it is currently the only place that explains why a scene's Darkness
slider moves on its own.

**Only the active scene.** Darkness lives on the scene, and driving every scene in the world on every time
change would be a write per scene for scenes nobody is looking at. Re-applied on `canvasReady`.

One interaction worth knowing about and not ours to manage: when darkness exceeds a scene's **Global
Illumination Threshold**, core switches global illumination off. On a scene with GI enabled and a threshold
of 0.75, the driver crossing 0.75 snaps it from lit-everywhere to lit-by-sources.

## Permissions

Time is a world setting, so only a GM can move it. Players get the readout and the tooltip with no
controls rendered at all -- a control that errors is worse than one that is absent. `step()` and
`_beginDrag()` each re-check `isGM` for anything reaching them directly.

Players receive time changes through the ordinary `updateWorldTime` broadcast; there is no socket traffic
and no second code path.

## No interval in the readout

Unlike the session timer, the clock's *display* is not on a timer. It repaints when something advances
world time and `updateWorldTime` fires, and at no other moment. A ticking interval would spend a repaint
per second redrawing an identical string for the whole session.

Time modes do not change that. The driver below has an interval, but it is a WRITER, not a repainter --
the display still redraws only in response to time actually moving.

## Calendar events, and why they are not notes

`manager-calendar-events.js` holds dated things belonging to the **world**: a festival, a market day, a
shared deadline. They exist whether or not anyone wrote a note about them, and that is the whole of the
distinction:

| | Calendar event | Time-bound note |
|---|---|---|
| Belongs to | the world | one person |
| Recurs | usually | never |
| Authored | deliberately, by the GM | in play, by anyone |
| Stored in | the `calendarEvents` world setting | the note's own flags |

Storing a festival on somebody's note would be backwards -- delete the note and the festival stops existing.

**The store is a world setting rather than journal entries.** An event is a date and a name; if it wants
prose it wanted a note. Journals would bring permissions for free but drag in the document-subtype question,
and owning a subtype means owning a domain.

### Recurrence is computed here, not expressed to the schedule API

`schedule()` takes `at` (an absolute moment) or `dailyAt` (an hour of the day). **Neither can say "the 20th
of Marpenoth, every year."** Widening a public surface for one consumer would be the wrong trade, so an
event computes its own next occurrence, registers that as an `at`, and re-arms when it fires. One firing
mechanism, used as intended.

Two consequences worth knowing before touching `nextOccurrence`:

- **A recurring day the month does not have is SKIPPED, not clamped.** The 31st monthly in a 30-day month is
  not the 30th. Clamping would silently move a market day, and skipping is the honest reading of a date that
  is not there.
- **Re-arming searches from one second past now**, or it finds the moment that just fired, re-arms on it, and
  fires again on the next tick forever.

Schedules are `gmOnly`, because firing announces to the table and a callback registered on five clients
without it announces five times. They are re-armed on every client when the setting changes, so a GM
promoted mid-session is already armed.

**What an event MEANS is a consumer's business.** Firing calls `blacksmith.calendarEventFired` and shows a
toast, and stops there. A festival with weather, prices and rumours is content, and content belongs in a
sibling -- the hook is how it gets there.

## Calendar names are localization keys

`calendar.months.values[].name` and `days.values[].name` / `.abbreviation` hold **i18n keys**, not display
text. dnd5e's Harptos calendar stores `DND5E.CALENDAR.Harptos.Month.Hammer`, which resolves to "Hammer";
its weekdays resolve to "one-day" through "ten-day".

Anything rendering them must call `game.i18n.localize` first. Two symptoms if it does not, both seen on the
calendar window's first run: the raw key on screen, and -- because an abbreviation was derived by slicing the
name to two characters -- every day of the tenday reading "DN". **Localize before slicing.**

`localize` returns its argument unchanged when there is no translation, so a calendar storing plain names
needs no branch.

## Time modes

`manager-time-modes.js` lets the clock run at a chosen speed. Five modes: **Combat**, **Real-time**,
**Slow**, **Fast**, **Paused**. The mode is the world setting `worldClockTimeMode`, so every client agrees
about how time is passing; the speeds are `worldClockSlowMultiplier` and `worldClockFastMultiplier`, in
world seconds per real second.

**The indicator and the time are ONE control, with two gestures.** They share a wrapper, `.worldclock-readout`
-- one element, one hit target, one hover that lights both halves. Bound separately they left a dead gap
between them and the icon read as something floating between the sky and the digits, which is a claim the
markup did not support. The mode icon sits *before* the time, so the digits stay the rightmost thing in the
face and keep their tabular alignment against the step arrows. Both halves answer the same two clicks:

| Gesture | Does |
|---|---|
| single click | opens the menu, which carries Show Calendar, Rest, Jump to, Time Mode, Pause and Options |
| double click | pauses, or returns to the mode before the pause |

They were briefly split -- menu on the icon, calendar on the digits -- and it was not intuitive: an icon that
only reports state is not where a person looks for a control, and splitting two actions across two halves of
one widget meant knowing which half did which.

**The single-click handler defers by 220ms**, because a double click also fires two `click` events. Without
the delay a double click opens the menu and then toggles behind it. The pointer coordinates are read
immediately rather than off the event inside the timeout, so the menu still opens where the pointer was.

**The mode to return to is remembered, not assumed** (`worldClockPreviousTimeMode`, a world setting so it
survives a reload). The useful pause is "stop while people arrive" and the useful un-pause is "carry on
exactly as before"; defaulting to Real-time would silently change a speed the table had chosen.

Players see the indicator as a readout only: someone watching the clock crawl should be able to see why.

**Neither the readout nor the section carries a tooltip any more.** The date headed a hover for a while, which
put the one thing a GM opens a clock to find out behind a gesture that competed with the click that opens the
menu. It heads the menu instead, disabled, in its own group. `_buildTooltip` and the HTML escaping it needed
went with it -- `_nameOf` no longer escapes, because its only consumer now writes `textContent`.

**The indicator is painted in `_paint`, not left to the template.** Anything the template draws must be
reachable from the repaint path or it goes stale on screen while the state behind it is correct -- the same
failure the menubar fingerprint has shipped twice (9B.3 in `architecture-blacksmith.md`). It happened here
on the first cut: switching mode left the previous icon and tooltip in place while the context menu
underneath reported the new mode correctly. The glyph rides in the class list, so the whole list is
rewritten rather than one class toggled, and the write is guarded because the drag preview paints a partial
view of sky and time only.

**The speeds are a dropdown, not a slider**, and each option states its effect at the table
(`60x - a minute of play is one in-world hour`). A slider shows a bare number with no unit, and a GM reading
"60" cannot tell whether it means an hour a minute or a minute an hour. Values are stored as strings and
coerced by `rateFor`.

The menu used to hang off the clock face. It moved on 2026-08-21 to leave the face free for a calendar, and
because an indicator that already reports how time passes is the honest place to change how time passes.
**Set Time and Set Date moved into Options** in the same pass: they are the entries a GM reaches for least
and they were sitting above the ones reached for most.

**Combat and Paused both mean the driver stands down, and they are two modes because the reason differs.**
In Combat, core is already advancing world time: `Combat#getTimeDelta` computes a delta from
`CONFIG.time.roundTime` and `turnTime` and the round change applies it
(`client/documents/combat.mjs:186`). Driving as well would double-count every round. In Paused, nothing is
advancing it at all. Note that Paused does not stop core's combat advance -- a combat running in Paused
mode still moves the clock by the round, because that is core's contract and intercepting it would mean
vetoing `preUpdateCombat`.

### Three things make the driver harder than a `setInterval`

**The clock advances a MINUTE at a time, and writing time is expensive.** Those pull against each other and
the balance is the whole design. `game.time.advance` writes a world setting and wakes every connected
client, firing `updateWorldTime` on all of them -- which also runs the darkness driver. So the driver writes
one world minute per update, which is what makes the readout tick over minute by minute rather than leaping,
and refuses to do it more often than `worldClockMinUpdateSeconds` (default 3s real). Real-time writes once a
minute; Slow once every four; only Fast reaches the floor, where a world minute arrives every real second
and the floor holds it to a write every three carrying three minutes each.

`TimeDriver.plan(rate, floor)` is that arithmetic, pure and separately testable: it returns the cadence and
the step, and the invariant it must always satisfy is `step === cadence * rate` -- the clock is coarse, never
fast or slow.

**The rejected alternative was display interpolation** -- commit on a slow real cadence and animate the
readout between writes. It shows minutes passing that have not passed, so anything scheduled on a minute
fires after the readout has already gone by it. A clock that is a few seconds coarse is honest; one that
displays a time the world is not at is not.

**Only one client may tick.** Only a GM can write the setting, and two GMs ticking would run the world at
double speed. Ownership is `game.users.activeGM` -- core's own election, the same one `api-gm-request.js`
uses, so every module agrees with core rather than with its own sort. It is re-checked on every commit as
well as at start, because the active GM can change while the interval is running, and it is re-evaluated on
`userConnected` so a GM dropping hands the tick on rather than stopping the world.

**A minute is what the calendar says it is.** `secondsPerMinute`, not 60. Hardcoding 86400 for a day is the
mistake already recorded against `getRenderData`; this is the same one a unit down, and it would surface
only in a world with a custom calendar.

The interval is client state and the mode is world state, so a client that reloads restarts from the mode
and loses at most one commit of world time. Nothing durable holds a partial second.

### The seam the rest will use

`TimeDriver` knows nothing about modes: it advances at a rate until stopped. The interruptible rest needs
the same engine running to a *target* rather than open-endedly, which is why the two are separate classes
in one file rather than one class. See `documentation/plans/plan-interruptible-rest.md`.

The dependency runs clock -> modes and never back. `TimeModes.onChange(callback)` is how the clock hears
about a switch, which keeps the pair from being circular -- the same shape as the option providers the
clock already exposes.

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
