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

That is asserted rather than asserted-to: `utilities/tests/suite-notes.js` holds it as its first check.

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
