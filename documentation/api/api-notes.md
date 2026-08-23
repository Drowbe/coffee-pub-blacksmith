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

### Reminders

A note can carry a moment it wants to come back at, on either of two clocks. `blacksmith.notes.REMINDER_CLOCKS`
names them: `world` and `real`.

```js
// In-world: three days from now, in world seconds.
await blacksmith.notes.setReminder(note, game.time.worldTime + 259200);

// Real time: twenty minutes from now, in epoch milliseconds.
await blacksmith.notes.setRealReminder(note, Date.now() + 20 * 60 * 1000);
```

| Call | Clock | Returns |
|---|---|---|
| `setReminder(note, dueAt)` | world | `Promise<boolean>`. `dueAt` in world seconds. |
| `setRealReminder(note, dueAt)` | real | `Promise<boolean>`. `dueAt` in epoch milliseconds. |
| `clearReminder(note)` / `clearRealReminder(note)` | either | `Promise<boolean>`. The note stays. |
| `getReminder(note)` / `getRealReminder(note)` | either | the moment, or `null` when not bound |
| `getReminderFired(note)` / `getRealReminderFired(note)` | either | when it resurfaced, or `null` |
| `listReminders(opts)` / `listRealReminders(opts)` | either | `[{note, dueAt, firedAt}]` in due order |
| `formatMoment(t)` | world | a date and clock in the world's own calendar |
| `formatRealMoment(t)` | real | the reader's own local date and time |
| `canSetReminder(note)` | both | whether the current user may. Ask before offering a control. |

**The two clocks are independent.** A note may carry one, the other, or both, and setting one never touches
the other. Which to use is not a preference: `world` is "when the party reaches Marpenoth", `real` is "in
twenty minutes".

Setting a reminder clears that clock's fired stamp, because moving one forward is asking to be reminded
again.

The list calls take inclusive bounds and either may be omitted, so one call answers both "due on this day"
for a calendar cell and "everything still pending" for a list. They filter by note permission, so they never
report a note the caller cannot read. Fired reminders are excluded unless asked for.

A reminder belongs to one person and fires on that person's client -- the note's author. A note shared with
the whole party still resurfaces once.

**A real-time reminder needs no timezone handling and accepts none.** The stored value is an absolute
instant and it fires on the author's own machine, so it is correct for a table spread across countries;
`formatRealMoment` renders it in each reader's local time. It also **only reaches someone while Foundry is
open** -- that is structural, not a gap. A world reminder cannot be meaningfully missed, because world time
only moves when somebody is playing.

Reminders never recur. A dated thing belonging to the world rather than to a person is a calendar event;
see the Calendar API.

### Hooks

`blacksmith.notes.created`, `blacksmith.notes.updated`, `blacksmith.notes.deleted`, each with `{ noteUuid }`.

`blacksmith.noteReminderFired` carries `{ note, clock, dueAt, firedAt, late, startup }`. It fires only on
the client that owes the reminder. `clock` is `world` or `real` and decides how to word anything you show:
`dueAt` is world seconds for one and epoch milliseconds for the other. `startup` is true when the scan at
load found it rather than a clock moving.

**`late` is not `firedAt > dueAt`.** The clock moves in steps, so every reminder is found slightly past its
moment and that comparison would call all of them late. `late` means the reminder was found by the startup
scan, or the world moved more than an in-world hour past it -- which only happens when somebody jumped the
clock rather than let it run. Use `late` for wording, not the timestamps.

`blacksmith.noteRemindersChanged` carries `{ clock }` and fires when that clock's set of reminders changes
-- one was set, moved, cleared, or fired. Filter on `clock` if your surface only draws one kind. Listen to
this rather than to the journal page hooks if you draw reminders: those fire on every edit to every page,
so a surface hung off them repaints while somebody types.

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
