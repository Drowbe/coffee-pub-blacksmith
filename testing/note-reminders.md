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

## The case the persisted flag exists for

- [ ] Set a reminder, reload the browser before it is due, advance past it: it still fires.
- [ ] Set a reminder, close the world, advance the clock past it in a later session, reopen: it reports as missed rather than vanishing.
- [ ] A missed one says "Was due ..." with the date, not "Reminder".
- [ ] Five reminders overdue at once collapse into one toast naming the count, not five toasts.

## One person, one screen

- [ ] A note shared with the party fires on the author's client only -- check a second client sees nothing.
- [ ] A player sets a reminder on their own note and it fires for them with no GM involvement.
- [ ] A note whose author's user has been deleted fires for the GM rather than for nobody.

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
