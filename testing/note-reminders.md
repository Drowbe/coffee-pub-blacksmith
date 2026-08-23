# Testing: time-bound notes

**Audience:** us.

Scope: verification still owed for note reminders. Transitional -- see the testing rules in `CLAUDE.md`.
**Remove an item when it passes rather than ticking it, and delete this file when it is empty.**

**Status: the feature is confirmed working on 2026-08-23** -- both clocks set, fire, show and clear in a
live world, and the date regression is confirmed fixed. Everything that ordinary use exercises has been
removed from this file.

What is left needs a setup ordinary play does not produce: a second client, a world closed across a real
interval, or a calendar that is not the one in use. None of it can be a harness check. What *can* be
asserted statically is in `tools/check-note-reminders.mjs`, which passes.

## Needs a second client

- [ ] A note shared with the party fires on the author's client only -- confirm the second client sees nothing.
- [ ] A player sets a reminder on their own note and it fires for them with no GM involvement.
- [ ] A note whose author's user has been deleted fires for the GM rather than for nobody.

## Needs the world closed across an interval

- [ ] Set a real-time reminder a minute out, close Foundry, reopen ten minutes later: it reports as "Was due", not silently gone.
- [ ] Set an in-world reminder, close the world, advance the clock past it in a later session, reopen: same.
- [ ] Five reminders overdue at once collapse into one toast naming the count, not five toasts.

## Needs a different calendar

- [ ] A non-Gregorian calendar drives the month dropdown, the month lengths and the weekday names. Harptos is the case to hand.
- [ ] In a leap year, the month that gains a day shows it, and a reminder on that day survives a round trip.
- [ ] A calendar that does not use twenty-four hours: the hour field's ceiling comes from the calendar.
- [ ] A world with NO calendar still offers real-time reminders, with the in-world half absent and nothing thrown.

## Not expected, worth knowing

- [ ] Two clients open as the same user is not a supported case; confirm a real-time reminder does not double-announce if it happens.
