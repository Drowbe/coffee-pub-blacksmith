# Plan: the calendar window

**Status: In progress.** The window, calendar events and time-bound notes shipped and are verified. Only
the real-world calendar mode remains.

**The shipped mechanism has moved out of this file** to `../architecture/architecture-calendar.md`, per the
rule that a plan is never a source of truth. What remains here is design that is not built. Delete this file
when it is, distributing surface to the API docs, mechanism to that architecture doc, history to
`CHANGELOG.md`.

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

   **Reconsidered 2026-08-23:** the module already has a real-world clock in the session timer, whose
   `sessionStartTime` and `sessionEndTime` are synced world settings. This mode should be that surface's
   planning view rather than a store of its own -- "next session is Tuesday at 7" is `sessionEndTime`'s
   scheduled counterpart, and "a reminder that fires at session start" is a hook on it rather than a
   scheduled time at all. See `plan-time-api.md`, which supersedes this item.
3. **Optional publication to Google Calendar.** External, authenticated, and offline half the time -- so it
   is a one-way export that may fail without the local event being wrong, never a sync. Anything two-way
   raises "which side wins", and that question has no good answer for a table's calendar.

**The trap to avoid:** making the existing store carry both by adding a `realWorld: true` flag. Every read
would then have to filter, `nextOccurrence` would need two implementations behind one name, and a recurring
in-world festival and a weekly session would share a code path that means different things in each. Two
stores, one window.

## Still missing from the window

Shipped 2026-08-22: season name in the header, year paging, editing an event, per-day add by double-click,
selection marked separately from today, and player access -- players view the calendar and add events, with
the write proxied to the GM through `api.gmRequest` so the author is the verified caller.

What is left:

- **No season colouring**, only the name. Tinting the grid behind the days would read well and is cosmetic.
- **No year view.** Paging a year at a time is now possible; seeing twelve months at once is not.

Ownership shipped 2026-08-22: a GM may change any event, anyone else only what they authored. Enforced
GM-side in `CalendarEvents.canEdit`, not merely in the UI -- the op is reachable from a console, so a
hidden button is a suggestion. `author` and `id` are stripped from any update, or the check would be
self-defeating. An event with no author predates this and is GM-only, which is the safe reading.

