# Testing: time-bound notes

**Audience:** us.

Scope: verification owed for note reminders, shipped 2026-08-23. Transitional -- see the testing rules in
`CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this file when it is empty.**

**Status: nothing here is proven.** None of it can be a harness check: every item needs a world clock that
actually moves, a second client, or a browser reload.

Keep items to one line each. Wrapped continuations in these files keep being reformatted into code fences by
an editor pass.

## The moment itself

- [ ] Set a reminder three in-world days out, advance the clock past it, and confirm it fires exactly once.
- [ ] Advance the clock further afterwards: it does not fire again.
- [ ] Clicking the toast opens that note.
- [ ] The footer chip shows the date after setting, and the bell goes hollow-to-solid.
- [ ] Clear the reminder: the chip returns to "Remind me..." and the note is otherwise untouched.

## Where it shows

- [ ] The World Calendar draws a bell in the corner of the day a reminder falls on.
- [ ] Hovering that day names the reminder and its time, alongside any events on the same day.
- [ ] A day with both an event and a reminder shows the dot AND the bell without them fighting.
- [ ] Setting a reminder while the calendar is open repaints it without reopening.
- [ ] Typing in an unrelated note does NOT repaint the calendar.
- [ ] The Notes list shows a bell on the row, tooltipped with the due date.
- [ ] After it fires, both bells go hollow and read "passed" / "resurfaced" rather than disappearing.
- [ ] Page the calendar to a month with no reminders: no bells, no errors.

## The case the persisted flag exists for

- [ ] Set a reminder, reload the browser before it is due, advance past it: it still fires.
- [ ] Set a reminder, close the world, advance the clock past it in a later session, reopen: it reports as missed rather than vanishing.
- [ ] A missed one says "Was due ..." with the date, not "Reminder".
- [ ] Five reminders overdue at once collapse into one toast naming the count, not five toasts.

## One person, one screen

- [ ] A note shared with the party fires on the author's client only -- check a second client sees nothing.
- [ ] A player sets a reminder on their own note and it fires for them with no GM involvement.
- [ ] A note whose author's user has been deleted fires for the GM rather than for nobody.

## Dates land where they were asked to (regression: everything landed on Hammer 1)

- [ ] Open the picker with no reminder set: it seeds TODAY'S date and time, matching the clock readout exactly, year included.
- [ ] Set a reminder for a date late in the year. The footer chip shows that date, not the first of the year.
- [ ] The World Calendar's bell appears on the day asked for.
- [ ] Calendar events: add one on a late-year date and confirm it arms for that date, not Hammer 1.
- [ ] The calendar grid's first-of-month sits under the right weekday -- check two different months.
- [ ] Select a day and travel to it: the clock lands on that day, not the first of the year.

## The picker

- [ ] The month dropdown carries the world calendar's own months, localized -- Harptos is the case to hand.
- [ ] The shortcut buttons fill the fields rather than submitting, and the filled date is editable afterwards.
- [ ] "In a month" on a calendar with uneven month lengths lands sensibly rather than adding thirty days blindly.
- [ ] The hour field's ceiling comes from the calendar on a world that does not use twenty-four hours.
- [ ] Editing an existing reminder opens with its own date seeded, not today's.

## Boundaries

- [ ] A note you do not own shows no reminder chip at all.
- [ ] `blacksmith.notes.listReminders()` never returns a note the caller cannot read -- check as a player.
- [ ] A world with no calendar warns rather than throwing.
