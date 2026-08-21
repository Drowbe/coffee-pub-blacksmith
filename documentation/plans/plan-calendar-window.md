# Plan: the calendar window

**Status: In progress (first draft shipped 2026-08-21).** The window exists and works; what it is *for* is
only half built. Distribute and delete this file when the rest lands -- surface to the API docs if any of it
becomes public, mechanism to `../architecture/architecture-worldclock.md`, history to `CHANGELOG.md`.

## Why it exists

`TODO.md` records that dated reminders and calendar events are a store plus a view over a firing mechanism
that already works: `worldClock.schedule({ at })` fires once at an absolute world time, and core's
`calendar.componentsToTime()` turns a date into that number. **This window is the view half.** It is not a
clock feature; it is the authoring surface the events work will need, built first because it is useful on
its own.

## What the draft does

- Renders one month of the world calendar as a grid.
- Pages month by month, rolling the year at either end, and jumps back to today.
- Marks today.
- A GM clicks a day to move the world to it, keeping the current time of day.
- Opens from the world clock's time readout, for players as well as the GM. Players get the same grid
  without the day buttons: a calendar is a readout before it is a control.
- Registered as `blacksmith-calendar`, so `openWindow()` reaches it from a macro or another module.

**Everything is derived from `game.time.calendar`** -- month lengths, leap days, week length, weekday names.
Nothing assumes a Gregorian year, because a world is free to declare a nine-day week or a five-day festival
month, and a grid that assumed otherwise would render a plausible lie. The clock next door already carries
that scar: its first version hardcoded 86400 for a day.

**Which weekday a date falls on is asked of core**, by converting the first of the month to a time and back,
rather than computed here. Doing the modulo locally would be a second implementation of `timeToComponents`,
and the two would drift the first time a calendar did something unusual with leap days.

## What it deliberately does not do yet

- **No events, reminders or markers.** That is the point of the window and it is the next phase, but it
  needs the store below before a day can show a dot.
- **No season or festival colouring.** `calendar.seasons` is available and would read well behind the grid;
  it is cosmetic and was left out of a first draft.
- **No year view or year jump.** Paging twelve months to reach next winter is tedious; a year picker is the
  obvious next ergonomic fix.
- **No time-of-day control.** Clicking a day keeps the current time deliberately, and setting the hour stays
  with Set Time on the clock menu.

## The next phase, and the question it turns on

Events need somewhere to live, and that is the only genuinely open decision:

- **A world setting** is simplest and matches how the module already stores structured data. It is also one
  blob that every client re-reads on any change.
- **A journal or a folder of them** makes events editable content a GM can write prose into, and gets
  permissions and ownership for free -- but it puts a document subtype question in front of us, and the
  ownership rules say declaring one means owning a domain.
- **Scene or actor flags** are wrong here: an event belongs to the world's calendar, not to a place or a
  person.

Whatever holds them, three things follow from the schedule API's own contract and should be designed in
rather than discovered: **schedules are not persisted**, so every stored event must be re-registered on
`ready`; **nothing fires retroactively**, so an event whose moment passed while the world was closed needs an
explicit "missed" path rather than silence; and **`crossings` can exceed one**, so a party resting a week
past a weekly event has to decide whether that is one notification or seven.

## Verification

The draft's own checks, none of which a harness can do:

- Open it on a world using a non-Gregorian calendar -- the column count, the month lengths and the weekday
  names all have to come from that calendar. Harptos is the case to hand.
- Page across a year boundary in both directions and confirm the year label moves with it.
- In a leap year, confirm the month that gains a day shows it.
- Click a day at 14:30 and confirm the world lands on that day still at 14:30.
- Open it as a player: the grid renders, the day cells are not buttons, and nothing throws.
