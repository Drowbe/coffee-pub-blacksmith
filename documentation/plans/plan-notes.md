# Plan: Notes

**Status: Planned. No code written.** Design pass only -- the gate below has to be satisfied on paper before
any port begins, because the wrong answer here ships a fourth annotation system into a hub that already has
three.

Notes move from Squire to Blacksmith (decided 2026-08-09, `TODO-GLOBAL.md`). This plan is about what they
become on arrival, not how to copy them.

## The gate

**If Notes is a fancy journal, it is nothing.** Foundry journals exist, and they are better at narrative and
GM authoring than anything written here would be. The value has to be in the relationship, not the document.

**The acceptance test: can any surface ask "what is attached to this thing" and get an answer?** From an
actor sheet, a canvas point, a map region, a compendium entry. If the design cannot do that, it is a journal
page with extra steps and should be abandoned rather than shipped.

Every decision below is answerable against that test.

## What already exists, and why that is the whole problem

Blacksmith has **three annotation systems with three different storage strategies**. Notes would be a fourth.

| System | Storage | Answers "what is attached to X?" | Answers "what is X attached to?" |
|---|---|---|---|
| **GM Notes** | `flags[MODULE.ID].gmNotes` on the target document, with a section map keyed by module | Yes -- read one flag | No -- a note cannot exist apart from its target |
| **Tags** | Central world setting `tagAssignments`: `{ [contextKey]: { [recordId]: string[] } }` | Yes -- one lookup | Yes -- scan one store |
| **Pins** | `scene.flags[MODULE.ID].pins` when placed, world setting `pinsUnplaced` when not | Partially -- scan scenes plus the unplaced store | Yes -- the pin carries its own target |

**Tags is the one that already passes the test**, and it passes it because the assignment store is central and
consuming modules do not keep their own copy. That is the precedent to follow, and it is not theoretical --
it is shipped and in use.

**Pins already has the "annotation with no anchor yet" case solved.** The `pinsUnplaced` store exists and its
documented purpose is "used for notes, quests, etc." A note with no location is an unplaced pin by another
name.

## What a Squire note actually is

A `JournalEntryPage` of `type: 'text'` carrying `flags['coffee-pub-squire']`:

| Flag | Duplicates |
|---|---|
| `tags` | Blacksmith's Tags system, which has a central store this bypasses |
| `sceneId`, `x`, `y` | Blacksmith's Pins, which is where a canvas anchor belongs |
| `visibility`, `authorId`, `editorIds` | Foundry document ownership, partially |
| `noteType: 'sticky'`, `timestamp` | nothing -- these are genuinely the note's own |

Plus a `pinId` flag linking to a real Blacksmith pin, and `manager-pins.js` -- 2,325 lines in Squire -- wrapping
the pins API so panels never touch it directly.

**So the port is a consolidation, not a transplant.** Three of the four flag groups already have a better home
in Blacksmith. That is the argument for the move restated as code rather than principle.

## The model

**An annotation is a triple: `(note, target, anchor)`.**

- A **note** is a document. Keep using `JournalEntryPage` -- it brings Foundry's editor, ownership, search,
  compendium export, and links for free. Reinventing that is how this becomes a fancy journal.
- A **target** is a UUID: an Actor, Item, Scene, Journal Page, or anything else.
- An **anchor** says *where* on the target: nothing at all (the whole document), a canvas point, or a region.

Every existing system is then one view of that triple:

| View | What it is |
|---|---|
| GM Notes | annotations where the anchor is the whole document, rendered on the target's sheet |
| Pins | annotations whose anchor is a canvas point -- already true today |
| Cartographer's markup | annotations whose anchor is a map region -- the third anchor, and the reason the model needs to generalise |
| The Notes window | the note itself, listing what it is attached to |

**A note with many targets is the case none of the three current systems handles**, and it is the ordinary
case: "we need to get that thing in that place" is one thought about two documents.

## Storage -- decided, and it diverges from Tags on purpose

**Annotations live in flags on the note page, with an in-memory index for target lookups.**

`flags[MODULE.ID].annotations` on the `JournalEntryPage` holds an array of `{ id, targetUuid, anchor, ... }`.
An index built at `ready` and maintained on page create/update/delete answers "what is attached to X".

Tags uses a central world setting and that is right *for tags*, because a tag assignment has no owning
document -- a tag on a pin is not itself a thing. An annotation always has one: the note. That difference
drives three consequences, and they are why the precedent is not followed here:

- **Player writes need no GM proxy.** A player who owns their note owns its flags. A central world setting
  would force every player annotation through `requestGM`, which Pins has to do and which is the part most
  likely to break quietly. Notes are player-authored in play; making the common case require a GM round trip
  would be backwards.
- **Lifecycle is automatic.** Delete the note, the annotations go with it. A central store needs orphan
  cleanup forever, and orphan cleanup is a job nobody remembers to write.
- **Annotations travel with the note** through export, import, and compendium moves.

The cost is that "what is attached to X" is a scan rather than a lookup, which is why the index exists. It is
rebuilt at `ready` and kept current by hooks. **If the index turns out to be the wrong call, the flags remain
the source of truth and it can be replaced without a data migration** -- which is the main reason to put truth
on the document rather than in a derived store.

**Anchors are a discriminated shape**, not a set of loose fields:

| `anchor.kind` | Payload | Owned by |
|---|---|---|
| `document` | none -- the annotation is about the whole target | Notes |
| `point` | `pinId` | Pins. There is one placement implementation and this is it. |
| `region` | Cartographer's shape, not yet defined | Cartographer |

A point anchor delegating to Pins is what stops this becoming a second placement system, and it reuses the
`pinsUnplaced` store for a note that has no location yet.

## Decisions taken 2026-08-09

- **`api.gmNotes` is left alone** and gains one read-only "related notes" section listing annotations that
  target the document. Nothing consuming gmNotes changes. Beyond being reversible, there is a technical
  reason: gmNotes' provider sections are in-memory and rendered at request time, so a full merge would have
  to keep two mechanisms anyway.
- **Cartographer gets the annotation-first API**: attach a note to a region. That is what its current hacky
  markup already does, so the demand is proven rather than assumed, and it is the smaller surface.
- **World documents only.** A note about a packed compendium entry is curation, which is Codex and
  Librarian's job. This keeps the Notes/Codex line where `TODO-GLOBAL.md` drew it. Pack UUIDs are not
  structurally excluded, but nothing is built for them.

## What Notes must NOT become

- **A second tag system.** Notes' tags go into `tagAssignments` under a Blacksmith context key. Squire's
  per-page `tags` flag is migrated and then dropped.
- **A second placement system.** A canvas anchor is a pin. There is one pin implementation.
- **A second annotation API.** `api.gmNotes` stays as the surface it is; it becomes a view over the
  relationship rather than a parallel store. Consumers of `gmNotes` should not have to change.

## Phasing

1. **The annotation store and its API.** No UI. `attach`, `detach`, `getByTarget`, `getByNote`, with the
   permission model and the index. This alone satisfies the gate and is independently useful.
2. **The Notes window**, ported from Squire, reading the store rather than page flags.
3. **Migration** from Squire's flags: `tags` into `tagAssignments`, `sceneId`/`x`/`y` into pins, targets into
   the annotation store. Squire's `windowStates` precedent applies -- do not orphan user data.
4. **`gmNotes` convergence**, if question 1 says so.
5. **Cartographer's region anchor**, which is the first consumer that is not Blacksmith or Squire.

Squire keeps nothing here: Notes leaves whole, and its `manager-pins.js` wrapper largely stops existing.
