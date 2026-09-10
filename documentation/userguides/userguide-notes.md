# Notes

**Audience:** players and GMs keeping notes during play.

How to write a note, decide who can read it, tag and find it, put it on the map, have it come back
to you at a set time, and keep GM-only notes on items and actors.

Notes are ordinary journal pages that Blacksmith keeps in one journal, so everything Foundry can do
with a page -- search, export, ownership -- still works. Codex entries, quests and objectives are
Librarian's.

## Set up the notes journal

GM only, once. Under **User Experience** and **Notes**, choose the **Notes Journal**: the journal
that will hold everyone's notes. Give it **All Players = Observer** ownership so players can create
notes of their own; each note's privacy is then set on the note itself. Until a journal is chosen,
the editor says "No notes journal is selected. A GM sets one in Blacksmith settings."

## Write a note

Anyone. Click the sticky-note button on the Blacksmith bar to open **Notes**, then **New note**; or
right-click the button and choose **Quick Note** to skip the list. The editor is a title and a
body, with a strip beneath for the things most notes never need: who can see it, its tags, and its
icon. A note you never share and never pin needs nothing but the title and the body.

The note is created when you close the editor, and only if you wrote something, so an editor
opened and abandoned leaves nothing behind. Reopening an existing note lets two people write in it
at once.

## Decide who can read it

The note's author, or the GM. The visibility control in the editor's strip offers:

| Choice | Who can read it |
|---|---|
| **Only me** | You, and the GM. |
| **Everyone in the party** | Every player. |
| **GMs only** | The GM alone; a note you are handing to the GM. |
| Named people | The players you pick from the list, and you. |

Sharing a note keeps you on it. To hand a note over entirely, share it with the other person and
then remove your own access; the editor asks "Remove your own access?" and warns that somebody it is
shared with would have to share it back.

## Find a note again

Anyone. The **Notes** window lists every note you can read, with its icon, its title, and marks for
how it is shared and whether it sits on the map; hover a row for a preview of its text. **Search
notes** filters the list as you type, the tag chips under the search narrow it to one tag, and the
sort button switches between newest first and by name. Click a row to open the note; a note you
can read but not edit opens in a read view where its links still work.

Each row carries **Edit**, **Delete**, **Favourite**, and, where they apply, **Place on the map**,
**Show on the map**, and **Unpin**. Favourites are yours alone and appear in the bar button's
right-click menu, so a note you keep returning to is one click away without the list.

## Put a note on the map

The note's author, or the GM, with a scene open. Press **Place on the map** on the note's row or in
its editor. The editor closes so you can see the map, and "Click the map to place this note. Esc
cancels." A pin appears where you click, carrying the note's icon; it behaves like every other pin,
and [the pins guide](userguide-pins.md) says how. **Show on the map** on a placed note pans to its
pin, and **Unpin** takes it off the map without deleting the note.

## Have a note come back to you

The note's author. In the editor choose **Remind me about this note**. A reminder follows one of
two clocks, and you can set both:

- **In the world**: a moment on the in-world calendar, such as the day a debt falls due. Pick a
  date and time; a world with no calendar cannot take one, and a date the calendar does not have
  is refused.
- **Real time**: a moment at the table. Choose **In 15 minutes**, **In an hour**, **In 3 hours**,
  **Tomorrow**, **In 3 days**, **In a month**, or pick a date and time. A time already past is
  refused.

Press **Set Reminder**. A note has to be saved before it can carry a reminder. When the moment
arrives, a toast tells you which note is due and opens it when clicked; nobody else is told. A
reminder that fell due while the world was closed is announced the next time you load, worded as
missed, and several missed at once collapse into a single toast. A reminder fires once and does
not repeat; a calendar event, which does, is a different thing and belongs to the world.

Days with a reminder due are marked with a bell on the World Calendar; see
[the world clock guide](userguide-worldclock.md).

## Keep GM notes on an item or an actor

GM only. Items, actors and journals carry a **GM Notes** card on their sheets that players never
see. The card is read-only at a glance; click its feather, **Edit GM Notes**, to open the GM Notes
editor and write. The note is saved on the document itself, so it travels with the item into a
compendium or another world, and the card refreshes on every open sheet when it changes.

Under the GM Notes card, the sheet also lists every note from the Notes window that has been
attached to that document, so a note about a particular sword or villain is found from the thing it
is about.
