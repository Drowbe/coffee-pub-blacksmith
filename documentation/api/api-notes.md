# Notes API

**Audience:** developers of Coffee Pub modules that want to attach a note to something, or ask what is
attached to something.

Scope: the public surface of `blacksmith.notes` - creating, removing, and querying annotations.

Mechanism and design rationale live in `architecture/architecture-notes.md`.

## What it is for

An **annotation** is a triple: a note, a target, and an anchor.

| Part | What it is |
|---|---|
| note | A `JournalEntryPage`. Foundry already owns editing, ownership, search, and export. |
| target | The UUID of whatever the note is about - an Actor, Item, Scene, another page. |
| anchor | Where on the target: the whole document, a canvas point, or a region. |

The question this exists to answer is the one a journal cannot: **what is attached to this thing?** Asked
from an actor sheet, a canvas point, a map region. If you only need "here is some text about this document",
use `blacksmith.gmNotes` instead - it is simpler and it is not going away.

Notes are not a place to put module data. They are user-authored documents that your module can point at.

## Attaching

```js
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// The whole document.
await blacksmith.notes.attach(notePage, actor);

// A point on a scene. The anchor carries a pin id, not coordinates - Pins owns placement.
await blacksmith.notes.attach(notePage, scene, {
    anchor: { kind: blacksmith.notes.ANCHOR_KINDS.POINT, pinId },
    moduleId: 'my-module'
});
```

Returns the annotation, or `null` if it was refused. Refusal is not an error state worth throwing over -
check the return value.

**Attaching is idempotent.** The same note, target, and anchor kind returns the existing annotation rather
than creating a second, so a control that double-fires cannot duplicate.

`moduleId` is stamped so you can find your own annotations later. It defaults to Blacksmith.

## Anchors

| `anchor.kind` | Payload | Meaning |
|---|---|---|
| `document` | none | The note is about the whole target. The default. |
| `point` | `pinId` | A place on a scene. The pin is a real Blacksmith pin; this layer does not store coordinates. |
| `region` | defined by the consuming module | An area rather than a point. |

A `point` anchor referencing a pin rather than holding `x`/`y` is deliberate: there is one placement
implementation in Blacksmith and it is Pins. An unplaced pin is a note with no location yet, which Pins
already models.

## Querying

```js
blacksmith.notes.getByTarget(actor);                    // everything attached to this actor
blacksmith.notes.getByTarget(scene, { kind: 'point' }); // only the pinned ones
blacksmith.notes.getByNote(notePage);                   // what this note is about
blacksmith.notes.hasTarget(actor);                      // cheap enough for a badge
blacksmith.notes.getAnnotatedTargets();                 // every target with at least one
```

Each returned annotation carries `id`, `targetUuid`, `anchor`, `moduleId`, `createdBy`, `createdAt`, and
`noteUuid` so you can resolve back to the page.

`getByTarget` may under-report if the index has drifted, and cannot over-report: the answer is read from the
pages themselves rather than from the index. Call `rebuildIndex()` after bulk document changes that the
document hooks did not observe.

## Removing

```js
await blacksmith.notes.detach(notePage, annotationId);  // one, by id
await blacksmith.notes.detachTarget(notePage, actor);   // every anchor pointing at this target
```

`detach` returns whether anything was removed; `detachTarget` returns how many. Detaching something already
gone returns `false` or `0` rather than throwing.

**Deleting the note removes its annotations.** They live on the page, so there is nothing to clean up and no
orphan to sweep.

## Permissions

```js
if (blacksmith.notes.canAnnotate(notePage)) { /* offer the control */ }
```

**Gated on the note's ownership, not the target's.** A player may annotate an Actor they do not own, because
annotating is note-taking rather than editing the thing noted - that is the whole point of players having
notes. What they cannot do is edit somebody else's note.

There is no GM proxy and none is needed: the write goes to the note's own flags, which its owner may write.

Ask `canAnnotate` before offering the control rather than after the click. A button that looks live and
refuses is the failure this call exists to prevent.

## Hooks

| Hook | Fires with |
|---|---|
| `blacksmith.notes.attached` | the annotation, including `noteUuid` |
| `blacksmith.notes.detached` | `{ annotationId, noteUuid }`, or `{ targetUuid, noteUuid, count }` from `detachTarget` |

## Scope

**World documents only.** A note about a compendium entry is curation, which belongs to Codex rather than
here. Pack UUIDs are not structurally rejected, but nothing is built for them and the index does not walk
packs.

## The notes themselves

An annotation needs a note to point at. These create and manage them.

```js
const note = await blacksmith.notes.createNote({
    title: 'The duke is lying',
    content: '<p>He knew about the shipment.</p>',
    visibility: blacksmith.notes.VISIBILITY.PARTY,   // or PRIVATE, the default
    tags: ['intrigue', 'waterdeep']
});

await blacksmith.notes.updateNote(note, { title, content, visibility });
await blacksmith.notes.deleteNote(note);

blacksmith.notes.listNotes();                     // everything this user can see
blacksmith.notes.listNotes({ tag: 'intrigue' });
blacksmith.notes.listNotes({ authorId: game.user.id });
blacksmith.notes.isNote(page);
```

A note is an ordinary `JournalEntryPage` of type `text`, flagged as a note. It is **not** a document
subtype - so a note remains a readable journal page if Blacksmith is ever uninstalled, and Blacksmith
declares no subtypes of its own.

Notes live as pages inside one GM-chosen journal, named by the `notesJournal` world setting. `createNote`
returns `null` and warns if no journal is configured, or if the user lacks OBSERVER on it.

### Visibility is ownership

| Value | Who owns the page |
|---|---|
| `private` | the author, plus every GM |
| `party` | every player, plus every GM |

Changing visibility **rewrites Foundry ownership**. The flag records the intent; the ownership is what is
enforced. A note a player should not see is one they cannot load - which is why `listNotes` filters on
permission rather than on the flag.

### Tags

```js
blacksmith.notes.getNoteTags(note);
await blacksmith.notes.setNoteTags(note, ['intrigue', 'waterdeep']);
```

Stored in the shared Tags registry under `blacksmith.notes.TAG_CONTEXT`, not on the page. That is why a tag
used by a note and a tag used by a pin are the same tag rather than two spellings of one.

Deleting a note clears its assignments. They are keyed by page id, so a missed cleanup would orphan them
with no way to find them again.

### Hooks

`blacksmith.notes.created`, `blacksmith.notes.updated`, `blacksmith.notes.deleted`, each with `{ noteUuid }`.

### Windows

| Id | What |
|---|---|
| `blacksmith-notes` | the list: search, tag chips, privacy and pin indicators, pin actions |
| `blacksmith-note-editor` | one note; pass `{ note }` to edit, omit to create. Opens in edit mode; a header toggle switches to a read view where content links are followable |

One menubar tool opens them. Left-click shows the list; right-click gives Quick Note and Open Notes, followed
by the user's favourite notes, each opening straight into its editor.

### Sharing with named people

`createNote` and `updateNote` accept `sharedWith`, an array of user ids. It is additive to the author, so
sharing a note is not giving it away -- handing somebody a note is sharing it with them and removing
yourself, which is why there is no separate give-to call.

Only two values are ever stored in the `visibility` flag. "Shared with named people" is `private` plus a
non-empty ownership map, because it is still "not everyone" and a third flag value would mean two places to
look for one fact. Read the shape from ownership, never from the flag.

### Pins

A note gets a pin lazily -- the first time an icon is chosen or it is placed -- and that pin may be
unplaced, which Pins already models. **The pin owns the icon**, so "the pin uses the icon I chose" is true by
construction rather than by keeping two copies in step. The note stores only `pinId`.

Changing a note's visibility rewrites its pin's ownership to match, because hiding a marker from someone is
done with pin ownership rather than `blacksmithVisibility`. Deleting a note deletes its pin. Unpinning uses
`unplace`, so the icon and design survive and re-pinning restores them.
