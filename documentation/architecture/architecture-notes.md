# Architecture: Notes

**Audience:** us, and the other Coffee Pub modules.

How the annotation layer is built and why it stores data where it does.

The public surface is in `api/api-notes.md`.

## What it is, and the test it has to pass

A note is a `JournalEntryPage`. An annotation is a link from that page to a target document, with an anchor
saying where on the target it applies.

Foundry journals already exist and are better at narrative and GM authoring than anything written here would
be. **The value of this layer is entirely in the relationship, not the document** - so it lives or dies by
one question: can any surface ask "what is attached to this thing" and get an answer? An actor sheet, a
canvas point, a map region. If that stops being true, the layer is a journal page with extra steps and should
be deleted rather than patched.

That is asserted rather than asserted-to: `testing/suites/suite-notes.js` holds it as its first check.

## Storage: on the note, not in a central store

`flags[MODULE.ID].annotations` on the `JournalEntryPage` - an array of `{ id, targetUuid, anchor, moduleId,
createdBy, createdAt }`.

**This deliberately diverges from Tags**, which keeps a central world-setting assignment store and is right
to. The difference is that a tag assignment has no owning document - a tag on a pin is not itself a thing -
while an annotation always has one. Three consequences follow, and they are the whole argument:

- **Player writes need no GM proxy.** A player who owns their note owns its flags. A world setting would
  force every player annotation through `requestGM`, as Pins has to (`manager-pins.js:2554`). Notes are
  player-authored in play, so that is the common case, not the edge - making it require a GM round trip
  would be backwards.
- **Lifecycle is automatic.** Delete the note and its annotations go with it. A central store needs orphan
  sweeping forever, and orphan sweeping is the job nobody writes.
- **Annotations travel** with the note through export, import, and compendium moves.

## The index

Storing on the note makes "what is attached to X" a scan, so `NotesManager._indexByTarget` maps
`targetUuid -> Set<notePageUuid>`. Built at `ready`, maintained by hooks on journal page create, update, and
delete, plus a full rebuild on journal entry delete because the page hook does not fire for cascaded pages.

**The index is derived and is never consulted as truth.** `getByTarget` resolves candidate pages through it
and then reads the annotations from those pages, so a stale index can cost a miss but cannot report an
annotation that does not exist. That asymmetry is deliberate: a wrong answer is worse than a missing one.

**The flags remain the source of truth**, so if the index turns out to be the wrong shape - too slow to
build, wrong granularity - it can be replaced without migrating anyone's data. That is the main reason to put
truth on the document rather than in a derived store that would then be load-bearing.

`_reindexPage` removes the page from every target before re-adding it, rather than diffing. An update may
have detached a target, and the new state alone cannot say which one. The map is small and a diff nobody
trusts is worse than a loop.

## Reminders: a note with a moment

`manager-note-reminders.js` binds a note to a moment on either of two clocks. Four flags on the page and no
central store:

| Clock | Due flag | Fired flag | Unit |
|---|---|---|---|
| `world` | `dueAt` | `firedAt` | world time, seconds |
| `real` | `dueAtReal` | `firedAtReal` | wall clock, epoch milliseconds |

A note may carry both, and they answer different questions: "when the party reaches Marpenoth" is not
"twenty minutes from now". Separate flags and separate indexes rather than one store with a clock field,
which is the same call the calendar plan makes -- every read would otherwise have to filter, and two things
that mean different things would share a code path.

What they share is the machinery. Index, scan, stamp and announce are identical in shape and differ only in
which flag they read and what "now" means, so that lives once, parameterised by the `CLOCKS` table. Two
copies would drift the first time one was fixed. `tools/check-note-reminders.mjs` guards the table: a clock
declared but not fully wired fails silently in every direction, since a missing field reads as `undefined`
and that clock's reminders simply never fire.

This is a second relationship on the same document, with its own derived index -- `NoteReminders._due`,
a sorted `[{dueAt, pageUuid}]`, built at `ready` and maintained by the same three page hooks. An array
rather than the annotation index's Map because every question asked of it is a range, and a range over a
sorted array is a slice where a Map would be a scan and a sort per call. Like `_indexByTarget` it is
derived, and `list()` re-reads each page rather than trusting it.

**The moment is its own flag rather than an annotation**, though the anchor union is already there and
would take one. An annotation requires a `targetUuid` and a moment has none; the annotation index is
exact-match while time queries are ranged; and "what is attached to this" has no ordering while "what is
due" is nothing but ordering.

### Reminders do not use `schedule()`, though calendar events do

Schedules are in-memory and nothing fires retroactively, so a reminder due while the world was closed
would be silently gone. `NoteReminders.fireDue` scans the persisted index instead -- on `updateWorldTime`,
and once at startup for whatever came due while this client was away.

### The real clock is polled, because it has no event

`updateWorldTime` says exactly when to look at world time. Wall time has no equivalent, so the real clock
is a 15-second `setInterval` and that interval is the worst case by which a real reminder is late. The scan
is a walk of a sorted array that is almost always empty at the head, so the cost is nothing; the poll is
started once and guarded, because a second interval would double every announcement with no way to reach
the orphan.

**A real-time reminder only reaches someone while Foundry is open**, and that is structural rather than a
gap to close. World time only moves when somebody is playing, so a world reminder cannot be missed in a way
that matters. A real one is wanted precisely when nobody has the client open. The dialog says so rather
than leaving it to be discovered.

**No timezone handling, deliberately.** The stored value is an absolute instant and it fires on the
author's own machine, so "half past seven" is half past seven where the person who asked for it is sitting.
Display goes through `toLocaleString`, so two people at one table in two countries each read their own wall
clock. Anything else would need a zone stored alongside the instant and a rule for whose zone wins.

The asymmetry with events is the reason for two mechanisms rather than one: a missed festival is still
visible on the calendar, and a missed personal reminder is invisible. `architecture-calendar.md` carries
the full comparison.

### One person's reminder fires on one screen

`_isMine` gates firing on the note's `authorId`, so a note shared with the party resurfaces once. A note
whose author no longer has a user falls to the GM rather than to nobody.

Idempotence is `firedAt`, stamped before anything is announced.

**`firedAt > dueAt` does NOT mean the reminder was late**, though it is the obvious reading and the first
version used it. The clock advances in steps -- a running time mode moves it several minutes at a time --
so a reminder due at 14:30 is found at 14:35 and is past its moment by construction. Wording the toast off
that comparison made every ordinary reminder announce itself in the past tense, as though it had been
missed. `_isLate` instead treats a reminder as late when the startup scan found it, or when the world has
moved more than an in-world hour past it -- the second only happens when somebody jumped the clock.

**Setting a reminder clears `firedAt`.** Moving one forward is asking to be reminded again, and leaving
the stamp would mean it never was.

### Where a reminder shows

A bell in the corner of the day on the World Calendar, a mark on the note's row in the Notes list, and a
chip on the note's own footer. The list and the footer carry one per clock -- a bell for in-world, a clock
face for real time -- because a note may have both. **The calendar draws in-world reminders only**, and
filters `blacksmith.noteRemindersChanged` on its `clock` field to avoid repainting for the other kind: a
wall-clock time has no place on a grid of in-world dates.

The footer shows one invitation, not two. Two "Remind me" buttons would ask the reader to understand the
world/real split before they have any reason to care about it; the dialog's switch asks once they are
already there.

The calendar makes **one** range query for the whole month and buckets the results by day, rather than
one query per cell. That is what `list()`'s bounds are for.

Fired reminders are kept on both bells. A marker that disappeared the moment the world moved past would
read as the reminder having been wrong rather than having happened.

`rebuildIndex` fingerprints the index and fires `blacksmith.noteRemindersChanged` only when it actually
differs. The page hooks themselves are unusable as a repaint signal: they fire on every edit to every
journal page, so a surface hung off them repaints while somebody types in an unrelated note.

## Anchors

A discriminated shape, not loose fields:

| `kind` | Payload | Owned by |
|---|---|---|
| `document` | none | this layer |
| `point` | `pinId` | Pins |
| `region` | consumer-defined | the consuming module |

A `point` anchor holding a pin id rather than coordinates is what stops this becoming a second placement
system. Blacksmith has one, and Pins' `pinsUnplaced` store already models a pin with no location - which is
exactly a note that has not been placed yet.

`region` is deliberately undefined here. Cartographer has a hand-rolled region annotation already; it should
define the payload rather than have a shape guessed for it.

## Permissions

`canAnnotate` gates on the **note's** ownership, not the target's. A player annotating an Actor they do not
own is correct and intended - annotating is note-taking, not editing the thing noted. What ownership protects
is somebody else's note.

There is no GM proxy in this layer and none is needed. That is a consequence of the storage decision rather
than a separate design.

## Relationship to the other three annotation systems

Blacksmith had three before this, with three different storage strategies:

| System | Storage | "What is attached to X?" | "What is X attached to?" |
|---|---|---|---|
| GM Notes | flags on the target, with a module-keyed section map | yes, one flag read | no - it cannot exist apart from its target |
| Tags | central world setting | yes | yes |
| Pins | scene flags when placed, world setting when not | scan | yes - the pin carries its target |

Notes is the fourth, and the one that handles **one note about several things** - which none of the other
three can express, and which is the ordinary case for a note written in play.

`api.gmNotes` is not being merged into this. Its provider sections are in-memory and rendered at request
time, so a merge would have to keep two mechanisms anyway. It instead gains a read-only view of annotations
targeting the document.

## Adopting notes from Squire

`NotesManager.adoptSquireNotes()` (`scripts/manager-notes.js`) flags Squire's sticky notes as Blacksmith
notes in place. It runs GM-only, adds only Blacksmith flags, and never removes Squire's or rewrites
ownership, so a world can be rolled back without the pages having been rewritten underneath it.

It reads Squire's flags off `page.flags['coffee-pub-squire']` directly rather than through `getFlag()`.
`Document#getFlag` throws for a scope that is not currently active, and the scope list is built from
`module.active` (`client/data/client-backend.mjs`, `getFlagScopes`). So once Squire is disabled or
uninstalled, `getFlag('coffee-pub-squire', ...)` throws on every page while the flag *data* is still sitting
there intact. Reading the object avoids making adoption depend on the module it is adopting away from -
which matters most at the end, when Squire is gone and any unadopted note would otherwise be stranded.

The scan runs on every load rather than stopping at a ledger entry. It skips pages that are already notes,
so re-running costs one pass over a single journal; the `coffee-pub-squire:notes` ledger entry only records
that adoption has happened at least once. An early return there strands any note created in Squire after the
first run.
