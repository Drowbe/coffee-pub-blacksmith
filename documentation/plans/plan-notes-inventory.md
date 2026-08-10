# Notes: what exists today

**Status: inventory only. No decisions, no design.** Written 2026-08-09 to establish what Squire's Notes
system actually does, because the first Blacksmith implementation was built without reading it and shipped a
list of journal pages with tags -- which fails the gate in `plan-notes.md` by its own terms.

Sources read: Squire `documents/architecture-notes.md`, `documents/guides/developer-note-pin-editing-visibility.md`,
`scripts/panel-notes.js` (1,591), `scripts/window-note.js` (1,144), `templates/window-note.hbs`,
`scripts/utility-notes-parser.js`, and the author's own list of what the first attempt missed.

## The thing I got wrong, stated once

A note in Squire is not a document that *has* a pin and *has* tags. **The note, the pin, and the tag
assignment are one object with three faces.** Ownership propagates note to pin; pin moves write back to page
flags; the list shows pin state and pans the canvas; the editor places pins. Building the document and
leaving the relationships as attributes is what produced a fancy journal.

## The data

A note is a `JournalEntryPage` in the journal named by the `notesJournal` world setting, flagged
`noteType: 'sticky'`. Content is `page.text.content`. Everything else is flags:

| Flag | Holds |
|---|---|
| `noteType` | `'sticky'`; the parser ignores any page without it |
| `visibility` | `'private'` or `'party'` -- drives page ownership AND pin visibility |
| `tags` | array of strings |
| `authorId` | creator |
| `editorIds` | co-editors, rendered as avatars |
| `timestamp` | ISO |
| `sceneId`, `x`, `y` | where its pin is |
| `pinId` | the Blacksmith pin |
| `noteIcon` | `{ type: 'fa'\|'img', value }` |
| `notePinSize`, `notePinShape`, `notePinStyle`, `notePinDropShadow`, `notePinTextLayout`, `notePinTextDisplay`, `notePinTextColor`, `notePinTextSize`, `notePinTextMaxLength`, `notePinTextScaleWithPin` | pin appearance, ten flags |
| `editLock` | `{ userId, at }` |

Ownership: private = GM + author; party = GM + every non-GM player. Synced to the page and to the pin
through Blacksmith's `blacksmith.pins.resolveOwnership` hook.

**Settings:** `notesJournal` (world), `showTabNotes` (user), `notesWindowPosition` (user).
**User flags:** `notesSortMode` (`date`/`alpha`), `notesCardTheme` (`dark`/`light`).

## The list (`panel-notes.js`)

| Feature | Notes |
|---|---|
| Search | free text over title and content, with a clear button |
| Tag filter | multi-select chips with counts, from tags in use |
| Scene filter | dropdown, "All Scenes" |
| Visibility filter | ALL / PARTY / PRIVATE as a three-way toggle |
| Sort | date or alphabetical, remembered per user |
| Row: icon | the note's `noteIcon`, or first image found in its content |
| Row: privacy indicator | lock or party icon |
| Row: pin indicator | present and coloured when pinned |
| Pan to pin | clicking the pin indicator moves the canvas to it |
| Place on canvas | crosshair cursor, click to place, Esc cancels |
| Unpin | removes the pin, keeps the note |
| Give to player | private notes only; transfers authorship, page ownership, and pin ownership |
| Bulk pin cleanup | delete all pins by scope; reap pins whose note is gone |
| Ownership sync | re-syncs pinned notes' ownership |
| Row hover preview | plain-text excerpt as a tooltip |

Private notes are filtered out for everyone but their author before rendering.

## The editor (`window-note.js`)

| Feature | Notes |
|---|---|
| Title | |
| Body | ProseMirror. **Collaborative** when editing an existing note -- `collaborate: true`, `document: page`, `fieldName: 'text.content'`. New notes use a plain editor and write on save. |
| Edit lock | `{ userId, at }` flag, 30-minute TTL, touched no more than every 30s, with expiry handling |
| "X is editing" indicator | shows the holder's name in the header |
| Edit / view mode | toggle; the author is fine dropping read-only view |
| Visibility toggle | private / party |
| Tags | text input **with suggestions** |
| Icon / image | `NoteIconPicker`: icon-vs-image mode, Font Awesome categories from `pin-icons.json`, plus pin design and text config |
| Author avatars | every `editorIds` entry rendered |
| Scene / location meta | where its pin is |
| Timestamp | or "Not saved yet" |
| Save | |
| Save and Place Pin | saves then enters placement |
| Draft creation | a page is created on first interaction so collaborative editing has a document to bind to |

## Cross-cutting behaviour

- **Pin to page sync.** `blacksmith.pins.created` and `blacksmith.pins.updated` write `pinId`, `sceneId`,
  `x`, `y`, `noteIcon`, and the ten appearance flags back to the page, then refresh the list. Guarded by a
  `suppressNotesPanelRoute` flag so the page update does not bounce back and refresh twice.
- **Page to panel routing.** `createJournalEntryPage`, `updateJournalEntryPage`, `deleteJournalEntryPage`
  refresh the list when the page belongs to the notes journal.
- **Cross-client toast.** Editing a **party** note raises a transient "Note updated" menubar toast on every
  other client, linked back to the note. Content and title changes only -- flag-only updates are ignored, and
  private notes never notify.
- **Pin failures are non-fatal.** Every pin create/update is wrapped so the note still saves.

## What Blacksmith already owns

This is the part that changes what "port" means, and I had it backwards:

| Squire built it because it had to | Blacksmith has it |
|---|---|
| `NoteIconPicker` -- icon/image, FA categories, pin design, text config | `scripts/window-pin-configuration.js` and `resources/pin-icons.json`, already migrated |
| tag input with suggestions | Tags `getChoices(contextKey)` returns taxonomy and global tiers |
| pin placement, permissions, ownership | Pins |
| transfer window for give-to | `api.dialog`, `api.entityList` |
| its own toast | `api.toast` |

So a Blacksmith note editor should own title, body, visibility, and the *handing off* -- not a
reimplementation of any of the right-hand column.

## Open questions for the design conversation

Recorded here, deliberately unanswered.

1. **Collaborative editing or edit locks?** Squire has both -- collab for the body, a lock for the window.
   They solve overlapping problems and the author has called the system klunky.
2. **What does "the note is the pin" mean structurally?** Should placing a pin *be* creating an annotation
   with a point anchor, so `getByTarget(scene)` returns pinned notes for free? That collapses ten appearance
   flags into pin-owned data.
3. **How much of the list's filtering survives?** Search, tags, scene, visibility, and sort is five
   mechanisms on one list, which is a candidate for the "too much" the author named.
4. **Does the editor stay lightweight?** The author likes the tool-window shape. The meta block -- avatars,
   scene, timestamp, editing indicator, icon -- is a lot of chrome for a micro titlebar.
5. **Is give-to worth keeping**, and does it generalise beyond notes?
6. **Do party-note edits still toast every client?**
