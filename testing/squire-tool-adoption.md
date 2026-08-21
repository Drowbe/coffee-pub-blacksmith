# Testing: Dice Tray, Macros, Health, and Status Effects adoption

**Audience:** us.

Scope: what is still owed on the Squire tool adoption. This is a transitional document -- see the testing
rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this file when it
is empty.**

**Status: the functional pass is done.** The author verified all four tools in a live world with Squire
disabled on 2026-08-09 -- windows open, settings and macro data adopted, conditions toggle and follow
selection, thresholds unified across the combat bar, blood indicators, and health bars. Squire has been
cleared to delete its copies.

The live session on 2026-08-19 had players on their own clients and used the adopted tools, which closes the
per-user macro list: a player seeing someone else's macros is the kind of thing that gets reported inside a
minute.

What is left needs a **setting compared across two users, or a second browser** -- deliberate comparisons
that a session does not make by itself. Neither blocks Squire.

Results go to the **Verify** line of the `[Unreleased]` `CHANGELOG.md` entry, not back into this file.

## Needs a setting compared across two users

- [ ] Confirm `showHealthMenubarTool` is per-user -- turning it off for one does not hide the icon for the
      other.

## Needs a second browser

- [ ] Confirm favourites are empty in a second browser. This is **expected** -- `userFavoriteMacros` is
      client scope and no migration can change that. What is being checked is that nothing errors and the
      empty list does not overwrite the first browser's.
- [ ] Confirm the dice tray's recent-rolls toggle and the health adjustment amount are likewise per-browser
      rather than leaking across.
