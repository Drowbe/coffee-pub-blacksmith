# Calendar

**Audience: developers working on Blacksmith.**

The World Calendar window and the events it authors. The clock itself is
`architecture-worldclock.md`; this document covers what sits on top of it.

## What it is

A month of the world calendar, opened from the clock's menu, showing where today is and what is dated. A GM
moves the world to a day from here; anyone can add an event.

It is titled **World** Calendar because a real-world calendar is planned as a second mode of the same window
-- session dates and reminders that fire at session start. That is not built; the design and the reason the
two want separate stores are in `../plans/plan-calendar-window.md`.

## Files

| File | Holds |
|---|---|
| `scripts/window-calendar.js` | The window: grid, selection, paging, the add/edit dialog |
| `scripts/manager-calendar-events.js` | The event store, recurrence, arming and firing |
| `templates/window-calendar.hbs` | The markup |
| `styles/window-calendar.css` | All styling, reached through the `@import` chain |

Events are stored in the `calendarEvents` world setting.

## Everything is derived from the calendar

Month lengths, leap days, week length, weekday names and the column count all come from
`game.time.calendar`. Nothing assumes a Gregorian year, because a world may declare a tenday or a five-day
festival month, and a grid that assumed otherwise would render a plausible lie. Harptos is the case to hand
and has a ten-day week.

**Which weekday a date falls on is asked of core**, by converting the first of the month to a time and back
through `componentsToTime` / `timeToComponents`. Computing the modulo locally would be a second
implementation of core's decomposition, and the two would diverge the first time a calendar did something
unusual with leap days.

**Month and weekday names are localization keys** -- see the section of that name in
`architecture-worldclock.md`. Localize before slicing, or every day of the tenday abbreviates to the same
two letters.

## Selection is not today

They are different facts and carry different marks: today is where the world is (accent border), selection
is where the reader is looking (filled cell). Clicking a day selects it; **moving the world is the footer's
job, on the selected day**, which also gives that button a visible subject.

Conflating them meant a GM could not page forward, point at a date and talk about it without travelling
there -- because clicking a day *was* the travel.

Gestures on a day: **click selects, double-click adds an event**. Right-click is deliberately left alone so
Foundry's own context menu still works. The two panes are linked -- selecting a day scrolls its group into
view in the events list, and clicking an event row selects its day.

## Players write through the GM

Events are a world setting, so a player cannot write one. Rather than making the calendar GM-only,
`create`, `update` and `delete` hand off through `api.gmRequest` when the caller is not a GM.

**The handler receives the VERIFIED caller**, so the stored `author` is a fact from the server rather than a
field in a payload the player controls. Validation runs GM-side for the same reason.

## Ownership

A GM may change any event; anyone else only what they authored. `CalendarEvents.canEdit` is the rule, and it
is enforced **GM-side in the proxied handlers**, not merely by hiding buttons -- the op is reachable from a
console, so a hidden button is a suggestion rather than a permission.

Two details that keep it from being self-defeating:

- **`author` and `id` are stripped from any update.** Otherwise a player rewrites the field the check reads.
- **An event with no author is GM-only.** Anything stored before ownership shipped has none, and the
  alternative lets the first player who notices claim the GM's festivals.

## Events, and why they are not notes

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
