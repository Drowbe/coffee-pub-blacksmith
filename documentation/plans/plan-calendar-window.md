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

It also shows **calendar events** -- marked days, the month's list, and add/delete for a GM. Those shipped
the same day; see the next section.

**No time-of-day control**, deliberately: clicking a day keeps the current time, and setting the hour stays
with Set Time on the clock menu.

## The next phase: time-bound notes

**Calendar events shipped 2026-08-21** and answered the storage question this section used to hold: they
are world data, so they live in the `calendarEvents` world setting. See
`../architecture/architecture-worldclock.md`.

What is left is the other half, and it is a different thing with a different owner:

| | Calendar event -- done | Time-bound note -- next |
|---|---|---|
| Belongs to | the world | one person |
| Recurs | yes | never |
| Stored in | the world setting | the note's own flags |
| Fires via | `schedule({ at })`, re-armed | a persisted index, scanned on crossing |

**The moment goes on the note as its own flag, not into `annotations`.** That will be tempting, because the
anchor union is already there, and it is wrong three ways: an annotation requires a `targetUuid` and a moment
has none; the index is exact-match `targetUuid -> notes` while time queries are ranged; and "what is attached
to this" has no ordering while "what is due" is nothing but ordering. Same document, second relationship,
second derived index -- sorted `[worldTime, pageUuid]`, built at `ready`, maintained by the same page hooks,
never consulted as truth.

**Why notes do NOT use `schedule()`, when events do.** Schedules are in-memory and nothing fires
retroactively, so a reminder due while the world was closed is silently gone. A persisted index can answer
"what came due while we were away"; `schedule()` structurally cannot. A missed festival is still visible on
the calendar, which is why events can afford the simpler mechanism and personal reminders cannot.

The payoff for keeping the moment on the note is composition: an annotation plus a due time gives
"remind me about this NPC on the 14th" with no new concept.

**Hold the line on scope.** No status, no assignment, no priority, no completion. When the moment arrives,
stamp `firedAt` and leave the note -- that gives "recently fired" without inventing "done". The list of
time-bound things is the index rendered; markers are a range query. Both fall out.

## The second calendar: real-world time

**Named 2026-08-22, not built.** The window is titled *World Calendar* because it is one of two: the
in-world calendar it shows today, and a real-world one the party plans around -- when the next session is,
a reminder that fires at session start, who has said they are coming.

They are the same window with a different clock behind it, and almost nothing else transfers:

| | World calendar -- built | Real-world calendar -- planned |
|---|---|---|
| Clock | `game.time` and `game.time.calendar` | the actual date, `Date` |
| Months, weeks | whatever the calendar declares | Gregorian, always |
| An event fires when | world time crosses it | wall-clock time reaches it, or the session starts |
| Audience | the characters | the players |

**Three things it needs that the world calendar does not:**

1. **A toggle**, and a clear one. The two calendars must never be mistakable for each other -- a reminder
   set on Marpenoth 20th and one set for next Tuesday are not the same kind of thing, and a window that
   looked identical in both modes would invite exactly that error.
2. **Somewhere for the campaign to hear about it.** The stated destination is the campaign's event page,
   which means this feature writes to campaign data rather than to a world setting of its own.
3. **Optional publication to Google Calendar.** External, authenticated, and offline half the time -- so it
   is a one-way export that may fail without the local event being wrong, never a sync. Anything two-way
   raises "which side wins", and that question has no good answer for a table's calendar.

**The trap to avoid:** making the existing store carry both by adding a `realWorld: true` flag. Every read
would then have to filter, `nextOccurrence` would need two implementations behind one name, and a recurring
in-world festival and a weekly session would share a code path that means different things in each. Two
stores, one window.

## Still missing from the window

Shipped 2026-08-22: season name in the header, year paging, editing an event, per-day add by right-click,
selection marked separately from today, and player access -- players view the calendar and add events, with
the write proxied to the GM through `api.gmRequest` so the author is the verified caller.

What is left:

- **No season colouring**, only the name. Tinting the grid behind the days would read well and is cosmetic.
- **No year view.** Paging a year at a time is now possible; seeing twelve months at once is not.
Ownership shipped 2026-08-22: a GM may change any event, anyone else only what they authored. Enforced
GM-side in `CalendarEvents.canEdit`, not merely in the UI -- the op is reachable from a console, so a
hidden button is a suggestion. `author` and `id` are stripped from any update, or the check would be
self-defeating. An event with no author predates this and is GM-only, which is the safe reading.

## Verification

The draft's own checks, none of which a harness can do:

- Open it on a world using a non-Gregorian calendar -- the column count, the month lengths and the weekday
  names all have to come from that calendar. Harptos is the case to hand.
- Page across a year boundary in both directions and confirm the year label moves with it.
- In a leap year, confirm the month that gains a day shows it.
- Click a day at 14:30 and confirm the world lands on that day still at 14:30.
- Open it as a player: the grid renders, the day cells are not buttons, and nothing throws.
- Add a once event on today, advance past it: one toast, GM only, no repeat.
- Add a monthly event on the 31st in a 30-day-month calendar: it skips those months rather than firing on
  the 30th.
- Delete an event: the marker and the list entry go with it.
