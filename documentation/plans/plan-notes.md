# Plan: Notes

**Status: designed, partly built, and part of what is built is wrong.** The annotation layer (phase 1) and
the Related Notes section (phase 2) are shipped and verified. The note CRUD, list, and editor shipped on
2026-08-09 were built without reading Squire's `documents/architecture-notes.md` and are a list of journal
pages with tags -- they fail the gate below by its own terms. This plan replaces that design.

What exists today, in Squire, is inventoried separately in `plan-notes-inventory.md`. Read that first if you
want to know what is being replaced.

## The gate

**If Notes is a fancy journal, it is nothing.** The value is the relationship, not the document.

**Test: can any surface ask "what is attached to this thing" and get an answer?** The annotation layer
passes it. The UI has to earn it too -- a list that only lists is the failure this gate exists to catch, and
it has already happened once.

## The user's own words, which are the requirements

> I want to be able to create notes.
> I want to give notes an icon or image for an icon.
> I may want to pin that note to the canvas... and if I do, I want that pin to just go ahead and use the
> icon or image I chose for my note.
> I want to easily relate one note to another. I will do this by using tags. So if I create a bunch of notes
> about my pal Bob and tag them all with bob, I will find all the bob notes.
> Sometimes I don't want anyone else to see my notes.
> Sometimes I want to share a note with the whole party.
> Sometimes I may want to share the note with just one or two people.
> I don't want taking notes to feel heavy and like I just opened Word.

Everything below is answerable against those nine lines. Anything that is not traceable to one of them is a
candidate for the "klunky and just too much" the author named.

## Decisions

### 1. Collaborative editing, and no locks

Foundry v13 supports it natively -- `HTMLProseMirrorElement.create({ collaborate: true, documentUUID,
name: 'text.content' })`, per `client/applications/elements/prosemirror-editor.mjs:14-16,202-207,365-370`.
Squire wanted this, could not get it working, and added edit locks as the fallback. Locks are the workaround,
so if collab works they go entirely rather than sitting alongside it.

**This also removes the untitled-notes bug, for free.** Squire created a draft page on first interaction
*because collaborative editing needs a document to bind to*, which is why a click that went nowhere left an
"Untitled Note" behind. But a note being created has no other editors -- nobody can co-edit something that
does not exist yet.

- **New note:** plain editor, no document, page created on save. No draft, nothing to reap.
- **Existing note:** collaborative editor bound to the page.

If collab turns out not to work in practice, the fallback is a lock -- but it is a fallback, not a
second mechanism, and the new/existing split above stands either way.

### 2. Visibility is ownership, in three shapes, and it absorbs give-to

| Shape | Page ownership |
|---|---|
| Private | author + GMs |
| Party | every player + GMs |
| Shared with... | author + chosen users + GMs |

One mechanism, two presets, and a picker. Expressed as real Foundry ownership so it holds where Blacksmith
is not the one asking -- a compendium export, a plain journal browse, another module's sheet.

**Give-to stops being a feature.** Handing Bob a note is sharing it with Bob and optionally dropping
yourself. Squire had a whole transfer window for this; it is one control now.

**Phase 1: the GM sees everything**, and can see and edit who has access. The "shared with Bob, Mira" display
is a GM affordance, not a per-player one.

### 3. The pin mirrors the note

The note carries **one** icon: `{ type: 'fa'|'img', value }`. When pinned, the pin uses it. The ten
`notePin*` appearance flags Squire kept on the page stop existing -- pin design belongs to the pin, and
Blacksmith's own pin config window already edits it for anyone who wants to override.

**Pin ownership mirrors page ownership**, the same users map. This is the crossover the author flagged, and
Blacksmith's own guidance already answers it: hiding a marker from a player is done with `ownership`, not
`blacksmithVisibility` (`squire/documents/guides/developer-note-pin-editing-visibility.md`, "Solo" section).
So:

| Note | Pin |
|---|---|
| private | ownership: author + GMs; `blacksmithVisibility: 'visible'`; `blacksmithAccess: 'private'` |
| party | ownership: everyone; same |
| shared | ownership: author + chosen + GMs; same |

`blacksmithVisibility` stays `visible` in every case. Re-sharing a note rewrites its pin's ownership in the
same operation -- Blacksmith owns both sides now, so this is a direct write rather than Squire's
`resolveOwnership` hook plus a sync pass.

**Lifecycle:** deleting a note deletes its pin. Deleting a pin unpins the note, and does not delete it.
Squire needed a `_cleanupMissingPins` sweep because it could not guarantee that; owning both sides, we can.

**Is a pinned note an annotation with a `point` anchor?** Yes -- that is what makes `getByTarget(scene)`
return the notes pinned to it, and it is the answer to the gate for the canvas. The pin id lives in the
anchor, exactly as `api-notes.md` already specifies.

### 4. Tags are the relationship mechanism

Already built, already shared with Pins. "All the bob notes" is a tag filter. No note-to-note linking
feature is needed and none should be added.

### 5. The list keeps search and tags. Everything else goes.

Squire had search, tag chips, a scene dropdown, a visibility tri-toggle, and a sort mode. The author's test
is "if we can make it easy to get to notes, simple is better."

- **Keep:** search, tag chips. Those are "find the bob notes".
- **Drop:** the scene dropdown and the ALL/PARTY/PRIVATE tri-toggle. A privacy *indicator* on each row stays;
  filtering by it is a different thing and nobody asked for it.
- **Sort:** newest first. Not a control.

### 6. Creation stays two-doored

- A **quick note** tool in the menubar's left zone, as today.
- A **new note** control inside the notes window.

Both open the same editor. Quick note is the one that has to feel weightless.

### 7. "Not like I opened Word"

The one requirement with no obvious mechanism, so it is stated as a constraint on the UI rather than a
feature: **title and body are visible; icon, pin, and sharing are reached for.** A note you never share and
never pin should require touching nothing but the title and the body.

## What of the shipped code survives

| Shipped | Verdict |
|---|---|
| annotation layer (`manager-notes.js` reads/writes, index) | keep -- verified, and it is the gate |
| Related Notes gmNotes section | keep |
| `createNote` / `updateNote` / `deleteNote` / `listNotes` | keep the shape; visibility grows the third case |
| visibility as ownership | keep -- correct, just incomplete |
| tags via the Tags registry | keep |
| `notesJournal` setting, Squire adoption | keep |
| the list window | **deleted 2026-08-09**, unbuilt. Keeping it would have anchored the rebuild to the wrong shape. |
| the editor window | **deleted 2026-08-09**, unbuilt. Same reason. |
| the harness suite | extend rather than replace |

## Open, still

1. **Does collab actually work** bound to a `JournalEntryPage` field in a world with two clients? Everything
   in decision 1 rests on it, and it cannot be proven single-client.
2. **Quick note's shape.** "Weightless" needs a concrete answer: a one-field capture that expands, or the
   full editor opened small.
3. **Does the icon picker fit the tool window**, or does choosing an icon open Blacksmith's pin config?
