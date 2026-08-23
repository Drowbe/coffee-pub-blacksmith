# Testing: time-bound notes

**Audience:** us.

Scope: verification owed for note reminders on both clocks -- in-world and real time -- shipped 2026-08-23.
Transitional -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking
it, and delete this file when it is empty.**

**Status: nothing here is proven.** None of it can be a harness check: every item needs a clock that
actually moves, real elapsed time, a second client, or a browser reload. What *can* be asserted statically
is in `tools/check-note-reminders.mjs`, which passes.

Start with the "Dates land where they were asked to" section: it is a regression list for a bug that made
every computed date land on day one of the year, and it is the one most likely to still be wrong.

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

## Real-time reminders

- [ ] Set one for two minutes out and leave Foundry alone: it fires within about fifteen seconds of the time, with a clock icon rather than a bell.
- [ ] It fires with world time completely paused -- the wall clock is the only thing driving it.
- [ ] The toast reads "Reminder for 7:42 PM" (present tense), not "Was due".
- [ ] Clicking it opens the note.
- [ ] Advance nothing and wait: it does not fire a second time.
- [ ] Set one, reload the browser before it is due, wait: it still fires.
- [ ] Set one for a minute out, close Foundry, reopen ten minutes later: it reports as "Was due", not silently gone.

## Both clocks on one note

- [ ] Set an in-world reminder AND a real-time one on the same note. Two chips in the footer, two marks on the list row.
- [ ] Firing one does not clear or fire the other.
- [ ] Clearing one leaves the other alone.
- [ ] The World Calendar shows the in-world one only -- no bell appears for the real-time one.
- [ ] Setting a real-time reminder while the calendar is open does NOT repaint it.
- [ ] Clicking a chip opens the dialog on that chip's clock; the + button opens on whichever clock is still free.

## The switch

- [ ] The dialog opens with the right half showing, and moving the switch swaps the fields.
- [ ] Submitting after moving the switch stores the clock that is showing, not the one it opened on.
- [ ] A past real time is refused with "That time has already passed."
- [ ] A past IN-WORLD date is accepted -- a GM rewinding the clock is ordinary.
- [ ] Keyboard: the switch is reachable by Tab and operable by arrow keys.

## Boundaries

- [ ] A note you do not own shows no reminder chip at all.
- [ ] `blacksmith.notes.listReminders()` never returns a note the caller cannot read -- check as a player.
- [ ] A world with no calendar still offers real-time reminders -- the in-world half is simply absent, and nothing throws.
- [ ] Two clients open as the same user is not a supported case, but check a real reminder does not double-announce if it happens.
