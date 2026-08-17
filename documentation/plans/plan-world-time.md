# Plan: World Time and Darkness

**Status:** Planned. Nothing below is built except a first-pass readout that Phase 1 replaces.

**Outcome:** feature.

Put the in-world clock in the menubar with the controls a GM actually uses, and restore the one thing
that is lost when SmallTime is disabled: scene darkness following the time of day.

## What core already does, and why that shrinks this a lot

The first sizing of this work assumed a calendar module would have to be integrated with, and that a date
could not be shown without one. Both were wrong. Foundry v13 and dnd5e 5.2.5 supply the whole timekeeping
layer between them, and this feature consumes it rather than reimplementing any of it:

| Capability | Where it already lives |
|---|---|
| Calendar definition | `game.time.calendar`, a `CalendarData` (`client/data/calendar.mjs:13`) |
| Day structure | `calendar.days.{hoursPerDay, minutesPerHour, secondsPerMinute, daysPerYear}` |
| Months, weekdays, seasons, leap years | `calendar.months.values`, `.days.values`, `.seasons.values`, `.years.leapYear` |
| Current time, decomposed | `game.time.components` -> year, month, dayOfMonth, dayOfWeek, hour, minute, second, season |
| Advancing time | `game.time.advance(delta)` and `game.time.set(time)` (`client/helpers/time.mjs:146`) |
| Broadcast to every client | the `updateWorldTime` hook, fired from `time.mjs:211` |
| Formatting | `calendar.format(time, formatter, options)` (`calendar.mjs:147`) |
| Harptos, and a calendar HUD | the dnd5e system (`templates/apps/calendar-core.hbs`) |

Two consequences worth stating plainly.

**There is no provider integration to build.** Core *is* the provider. SmallTime's "acquire sunrise and
sunset from available calendar provider" is SmallTime reading core, not a bridge we would have to write.

**The clock is not the gap.** Core ships time, a calendar, and a HUD for it. A Blacksmith clock is a
*placement* decision -- one menubar rather than another floating widget -- which is a legitimate reason to
build it but a much smaller claim than replacing SmallTime. The real gap is below.

## What is actually missing

**Nothing in core links time to scene darkness.** `scene.environment.darknessLevel` exists
(`common/documents/scene.mjs:119`) and the canvas reacts to it, but nothing moves it as time passes. That
is the capability that disappears when SmallTime is turned off, and it is the only requirement here with no
core equivalent.

It is also the least like a menubar readout, which matters for where the code goes -- see the last section.

## The requirements, and what each one costs

1. **Darkness control, world-level for now, not per scene.** Settings-driven. Note that the *write target*
   is still a scene, because darkness is a scene property -- "world-level" means one set of sunrise/sunset
   and darkness bounds applied to the active scene, not a per-scene opt-in like SmallTime's.
2. **Left/right time change.** Small and large steps in both directions, GM only.
3. **Visual of time of day.** The sky bar with a sun or moon travelling across it.
4. **Drag to change.** Scrub the same bar to set time directly.
5. **Rich `data-tooltip`.** The full date, the season, and the weekday, which the compact readout omits.

## Design decisions that are not obvious

**Never hardcode the length of a day.** The calendar defines it:
`secondsPerDay = secondsPerMinute * minutesPerHour * hoursPerDay`. Harptos happens to use 24-hour days, so
a hardcoded 86400 looks correct in this world and silently breaks in any world with a custom calendar. The
readout shipped ahead of this plan does hardcode it -- Phase 1 removes that, and it is the reason Phase 1
exists rather than starting at the controls. Use `game.time.components`, which already decomposes correctly.

**Darkness writes are database writes, and only a GM may make them.** `game.time.advance` writes the
`core.time` world setting, and a scene update needs scene ownership. So the darkness driver runs on the GM
client only and reaches players through the ordinary document-update broadcast. No socket work, and no
second code path -- but every client must tolerate *receiving* the update without trying to make one.

**Dragging must not write per frame.** A drag across the bar would otherwise produce a scene update and a
world-time write per pointer move. During the drag, preview locally with
`canvas.environment.animateDarkness()` (`client/canvas/groups/effects.mjs:511`) and update the readout text,
then commit the time once on release. This is the single biggest performance risk in the feature and the
easiest to get wrong.

**Respect `darknessLock`.** The scene schema carries it (`scene.mjs:120`) and SmallTime's scene config
exposes it. A driver that ignores it overrides a GM who has explicitly said "not this scene", which is worse
than not having the feature.

**Switching scenes has to re-apply.** Darkness lives on the scene, so a world-level driver must reassert
itself when the active scene changes. The menubar already hooks `canvasReady` for exactly this shape of
problem.

**Sunrise and sunset are four numbers, not a drag surface.** SmallTime's drag-the-suns configuration is a
nicety on top of sunrise time, sunset time, daytime darkness and night-time darkness. Ship the four
settings; the graphical editor is a later convenience and is not required for the driver to work.

## Phases

Each phase is independently shippable. They are listed in dependency order, which is **not** the order of
urgency -- see the note below.

| Phase | Work | How it is verified |
|---|---|---|
| 1 | Readout reads the calendar: real date, calendar-derived day length, formats from `calendar.format` | Console `game.time.advance()` across a day and a month boundary; readout matches the dnd5e HUD exactly |
| 2 | Darkness driver: four settings, GM-only writes, `darknessLock` respected, re-apply on `canvasReady` | Advance time past sunset in a live world; darkness moves. Lock a scene; it does not. Check a player client sees it |
| 3 | Step controls, GM only, small/large step settings | Click each of the four; time moves by the configured amount. Player sees no buttons |
| 4 | The sky bar with sun/moon marker | Advance across dawn and dusk; marker travels, icon swaps |
| 5 | Drag to scrub, with local preview and a single commit on release | Drag across the bar watching the network tab: exactly one time write on release, none during |
| 6 | Detailed tooltip: full date, weekday, season | Hover; compare against `game.time.components` |

**Phase 2 is the one worth pulling forward.** It is the actual regression from disabling SmallTime, it is
independent of every UI phase, and it needs only settings -- no widget at all. If darkness matters more than
the widget does, build Phase 1 and 2 and stop.

## Where this code should live

Blacksmith is shedding features, not gaining them, so this needs an answer rather than a shrug.

**The readout and its controls belong here.** The menubar is Blacksmith's, and a clock in it is menubar
furniture, consuming a core API the way the session timer beside it consumes `Date.now()`.

**The darkness driver is a feature with no UI**, and by the direction-of-travel rule it belongs in a
sibling. Splitting the two across modules for a first pass would cost more than it saves.

**So: build both here, but keep the driver in its own file** with no menubar coupling and no imports in
either direction -- it should read settings and the world clock and write scene darkness, nothing else.
Extracting it later is then a file move rather than a rewrite. If the driver ever starts reaching into
menubar internals, that is the signal it has outgrown this module.
