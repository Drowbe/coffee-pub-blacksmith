# Inventory Architecture

**Audience:** us, and any Coffee Pub module maintainer who needs to change how inventory mutation works.

Scope: how `blacksmith.inventory` mutates items and currency safely, and which parts of it must not be simplified.

The public surface is specified in `api/api-inventory.md`. Implementation is `scripts/api-inventory.js`.


## Locks key on the resolved actor

`_acquire` is called with `actor.uuid` from `_resolveActor`, never with the caller's string. That is
load-bearing rather than incidental: a caller may name an actor as `Actor.a`, as `Scene.s.Token.t`, or as
`Scene.s.Token.t.Actor.a`, and two of those can be the same document. Keying on the argument would take two
locks on one actor and let two writers in at once -- the exact thing the lock exists to stop.

It also means two unlinked tokens sharing a base Actor take two different locks, which is right: each has
its own ActorDelta, so they are genuinely separate documents and a write to one is not a write to the other.

## Why the hub owns this

Curator requires only `coffee-pub-blacksmith`. Squire requires Blacksmith and `socketlib`. Neither requires
the other, and `coffee-pub-lib` is retired, so the hub is the only place two satellites can share code without
one taking a hard dependency on the other.

It is infrastructure rather than a feature: a static surface plus a mutex, with no UI, no settings, no hooks,
and no lifecycle participation. That is the same category as `api.effects` and `api.compendiums`, both of
which already perform dnd5e-specific domain work here.

## Accepted system coupling

This layer is dnd5e-specific by construction: `system.quantity`, `system.currency`, the `system.container`
containment model, and the physical-type whitelist. Blacksmith is a dnd5e module, so the coupling is accepted
rather than incidental. It is a surface that needs re-verification against any future system version.

## Shape: two locking wrappers over unlocked cores

`grantItem`, `grantItems`, `grantCurrency`, `transferItem`, `transferItems`, and `transferCurrency` are public
and acquire locks. `_grantItemCore`, `_grantBatchCore`, `_reduceSourceCore`, `_rollbackGrant` and
`_rollbackBatch` acquire nothing and assume the caller holds what they need.

`transferItem` is defined as: validate the source, grant on the target, reduce the source, roll back the grant
on failure. `transferItems` is the same sentence with batched writes on both sides. Both call the **cores**,
never the public methods.

**The batch forms exist for write count, not ergonomics.** `_grantBatchCore` puts every create into one
`createEmbeddedDocuments` and every merge into one `updateEmbeddedDocuments`; `transferItems` reduces the
source with one `updateEmbeddedDocuments` for partial takes and one `deleteEmbeddedDocuments` for whole ones.
So a Take All of any size costs at most two writes per Actor rather than two per item. Given that dnd5e
recomputes encumbrance per write, against one fixed effect id, with no lock and a recompute that outlives the
write (see invariant 3), item count would otherwise be the number of racing recomputes.

Two consequences worth knowing before changing them. Batched merges accumulate into a single update per
target row, so several entries taking the same item add up rather than overwriting each other. And entries
that cannot merge with an existing row still coalesce with a payload queued earlier in the same batch - the
candidate search only sees documents that exist, so without that step a Take All over a corpse holding two
identical stacks would split them.

## Four invariants that are invisible in correct code

Each of these reads as redundant caution when the code works, and each is destructive when removed. None is
recoverable by reading the shipped implementation, which is why they are here.

### 1. The public methods hold the locks; the cores do not

If `transferItem` held the target lock and then called the public `grantItem`, that call would wait on a lock
its own caller already holds. That is a self-deadlock on **every transfer**, not an edge case, and it presents
as a hang with no error and no stack - the first instinct is to look at sockets or the GM client rather than at
one primitive calling another.

Releasing the target lock between the grant and the source reduction is also unsafe even without
re-entrancy: another client could change the target stack in that window, and the quantity-aware rollback
below would then decrement a number that no longer means what it meant when it was read. The lock must span
the whole operation for the rollback contract to mean anything.

### 2. Rollback is quantity-aware

The grant happens first, so a failure leaves a visible duplicate rather than a vanished item. Undoing it
depends on what the grant actually did:

- Created a row: delete it.
- **Merged into an existing row: decrement by exactly the granted quantity. Never delete.**

Deleting after a merge destroys quantity the recipient already owned - three arrows into a stack of twenty
followed by a delete loses twenty items that were never part of the transfer. It fails while looking like
successful cleanup, which is why the failure result carries `merged`, `quantity`, and both observed
quantities rather than just `targetItemId`.

`_rollbackBatch` applies the same rule across a whole batch, which is why it tracks what it did rather than
inferring it afterwards: an `undo` descriptor records created row ids and per-row merged quantities as the
grant happens. Reconstructing that after the fact is not possible - once a merge has landed there is nothing
in the document to say how much of the stack arrived in this operation.

### 3. Arrival flags are folded into the item write

dnd5e recomputes encumbrance on every item create, update, and delete on an Actor
(`_onCreateDescendantDocuments` at `dnd5e.mjs:39357`, with update and delete equivalents at `:39371` and
`:39385`, all gated on `userId === game.userId`). The recompute reads
`this.effects.get(ActiveEffect5e.ID.ENCUMBERED)` at `:39554` and, if absent, creates
`{ _id: ActiveEffect5e.ID.ENCUMBERED, ... }` with `keepId: true` at `:36235-36238`. Check-then-create against
one fixed id, no lock, nothing between the read and the write.

Foundry does not await `_onCreateDescendantDocuments` from the promise `createEmbeddedDocuments` returns, so
the recompute outlives the write that triggered it. Two sequential writes to one Actor - even individually
awaited - produce two recomputes that both read an empty effects collection and both try to create
`dnd5eencumbered0`. The server rejects the second.

**Neither correct awaiting nor this layer's mutex prevents it**, because the recompute completes outside the
critical section. Reducing the operation to one write per Actor is the only fix available. That is why `flags`
is a parameter rather than a caller's follow-up `setFlag`, why `grantItems` exists rather than a loop, and a
second reason the reset set is applied here rather than left to consumers: every fixup folded into the
original write is a follow-up write nobody makes.

The recompute is also called from the Actor's own `_onUpdate` (`dnd5e.mjs:39330`), not only from the
descendant-document hooks, so an `actor.update()` followed by an item write collides identically. The
original diagnosis of this bug described it as a pair of item writes, which is narrower than the real
surface.

**A third-party write is enough to reintroduce it, which is why one-write-per-Actor cannot be the whole
answer.** Any second write to the same Actor collides, and two different modules writing to one Actor in the
same moment do so with neither at fault. Per-module discipline gets to "no module trips it alone", which is
strictly weaker than "it cannot happen", and it decays the moment anyone adds a follow-up write.

So the class is guarded centrally as well: `scripts/manager-encumbrance-guard.js` wraps
`Actor5e#updateEncumbrance` to serialise and coalesce recomputes per Actor. **Batching and the guard are
independent and both worth having** - the guard means correctness no longer depends on batching discipline,
and batching still means fewer writes, fewer recomputes, and fewer per-item hooks for every other consumer.
See the guard section below.

It only fires when the recipient crosses an encumbrance threshold on that operation, so it presents as
intermittent - and since it surfaces from a lifecycle hook rather than the caller's await chain, the mutation
succeeds and the rejection is console noise. That is worse than a failure, not better: it is the shape of
thing that sits in a log for months.

### 4. An unverifiable container is treated as packed

dnd5e stores containment on the **child** as `system.container`, pointing at the parent's id
(`dnd5e.mjs:14055`). Moving a container with `toObject()` creates it on the target under a new id and leaves
its contents behind pointing at an id that no longer exists.

`_containedCount` uses dnd5e's own `system.contents` getter rather than scanning an actor's items, because a
container resolved from a compendium or the Items directory has no actor to scan - and that is precisely the
case an actor scan reports as empty when it is not. When the count cannot be determined it returns -1 and the
caller refuses. A refused bag is a visible annoyance; an orphaned one is silent corruption.

Full container transfer is deliberately out of scope rather than half-implemented. `Item5e.createWithContents`
(`dnd5e.mjs:24153`) does the recursion, so effort is not the reason - a container move is one-to-many creates
and many source deletes, which breaks the singular return shape, makes quantity splitting meaningless, and
turns rollback into N deletes plus N restores plus reporting which of those also failed. That belongs in its
own method.

## exchange: the order of application is the rollback design

`exchange` settles N directed transfers across N Actors atomically. It reuses the cores rather than
reimplementing transfer semantics: `_grantBatchCore` for arrivals, `_rollbackBatch` for their undo, the
same batched update-and-delete for departures.

Two things about it are not obvious and both are load-bearing.

**Locks generalise for free; acquiring per transfer does not.** `_acquire` already dedupes and sorts an
array, so one acquisition covering every Actor named anywhere inherits the ordering that makes simultaneous
opposite-direction transfers safe. Acquiring inside the per-transfer loop would reopen the exact window the
method exists to close, and it would do so while looking like tidier code.

**Currency, then arrivals, then departures.** This is the multi-party form of "grant before you reduce",
and the ordering IS the rollback strategy rather than a preference:

- Currency is a numeric delta, reversible by writing back the value read under the lock.
- Arrivals have a quantity-aware undo already (`_rollbackBatch`).
- Departures are the only irreversible half - a deleted row cannot be restored with its id, which is what
  container membership and favourites lists point at - so they run **last**, when nothing after them can
  fail and require them to be undone.

Reordering these so departures happen earlier produces code that looks equivalent and cannot roll back.

**All-or-nothing, which is the opposite of `transferItems`.** Per-item results are right for a Take All,
where one packed bag must not stop twelve other rows. They are wrong here: a partly applied settlement is
precisely the state the primitive exists to prevent, so any refusal aborts and writes nothing. A failure is
a single result naming the leg, not an array.

**Affordability is summed per Actor, never netted per pair.** A payer handing over 30 and receiving 5 must
hold 30. Only the resulting write is combined. Netting the validation would let someone spend money they do
not have because change is coming back, and it has no meaning across denominations in an API that never
converts.

### copy and preserveEmptySource are different primitives, not variants

They exist because a consumer's stock is either a count or a template, and the two want opposite things.

`copy` grants without touching the source. The important consequence is that **the source stack stops being
a ceiling**: a template with no count can sell three from a row reading one, so the availability check is
deliberately skipped and `INSUFFICIENT_QUANTITY` cannot arise on a copied leg. Shape is still validated.

`preserveEmptySource` keeps a stackable row at 0 rather than deleting it when the take empties it. That is
a display and restock concern rather than a data one - a shop should read "out of stock" instead of
vanishing from its own shelf - and it cannot apply to an item with no quantity.

The first version of this design assumed `copy` alone covered both. It does not: with only `copy`, finite
stock has to decrement itself outside the settlement, which puts the very bookkeeping the primitive exists
to make atomic back in the consumer.

## Containment is written on arrival, never inherited

`_buildPayload` sets `system.container` on every payload it produces - to the caller's `container` option,
or to `null`. It is deliberately not in `RESET_PATHS`, because that set is deleted and dnd5e writes the
field rather than dropping it. An absent key and an explicit `null` are not the same value.

dnd5e's own reset set does not mention containment either (`_onDropResetData`, `dnd5e.mjs:57594`), and
copying that omission is what produced the defect. The system does not need containment in its reset set
because every creation path assigns it explicitly: `Item5e.createWithContents` applies
`mergeObject(newItemData, {"system.container": containerId})` to each create (`dnd5e.mjs:24171`), and
moving an item out of a container nulls it (`dnd5e.mjs:57414`). Containment is an argument of the arrival
in every core path.

Inheriting it instead meant an item taken out of a bag arrived carrying the *source* Actor's bag id, which
names no row on the recipient. Two symptoms followed, and neither pointed at this file. The row was
orphaned into a container that does not exist; and because containment sits inside `system`, it also
participates in merge identity, so the arrival compared against a foreign id and matched nothing - arrows
looted from a corpse's pack refused to stack with the arrows the looter already carried.

`_identitySystem` normalises `container` to `null` rather than excluding it. Excluding it would merge two
stacks that are in different places, which is wrong; normalising covers rows written by another module or
an older dnd5e that carry no key at all, which would otherwise compare unequal to our explicit `null`.

`_validateContainer` runs **inside the target Actor's lock**, for the same reason quantities are re-read
there: an id checked before the lock can be deleted before the write, which recreates the dangling pointer
the check exists to prevent. It refuses rather than falling back to root, because a silent fallback puts
the item somewhere the result does not report. The depth rule mirrors dnd5e's own refusal
(`dnd5e.mjs:24156-24160`) and is feature-detected on `system.allContainers` - if that getter moves, the
check is skipped rather than refusing every container grant, since existence and type already rule out the
orphaning case.

Full container transfer remains out of scope; see invariant 4. Granting a container *with* its contents as
a unit is a different operation again - `Item5e.createWithContents` (`dnd5e.mjs:24153`) is the recursion,
and it is one-to-many creates rather than the one-to-one shape these primitives return.

## The encumbrance guard

`scripts/manager-encumbrance-guard.js` mitigates the dnd5e race described in invariant 3. It is a guard
against a **system** bug rather than a Blacksmith feature, and it is built to remove itself.

**Why the hub owns it.** A per-module fix removes only that module's contribution. The hub is loaded wherever
this matters, already owns the libWrapper layer, and writes to Actors itself through `api.inventory`.

**Serialise and coalesce, not just serialise.** Serialising alone closes the race but still runs one recompute
per write. Only the last result matters: `updateEncumbrance` reads `this.system.attributes.encumbrance` and
`this.effects` fresh at call time, so one run after the final write produces the same state as one run after
each. So at most one executes and one waits; further calls collapse into the waiter.

What makes collapsing provably safe rather than a guess: **`updateEncumbrance(options)` accepts an options
argument and never reads it** in 5.2.5. Two calls differing only in options are interchangeable. The latest
options are carried through anyway, and if a future dnd5e starts reading them the guard needs re-examining
rather than re-gating.

One visible consequence: `_displayScrollingStatus` fires fewer times, so fewer stacked encumbrance popups
during a bulk change. That is an improvement, but it is a behaviour change rather than a pure fix.

**Keyed on Actor UUID, not id.** A synthetic token actor carries the base actor's id
(`client/documents/actor-delta.mjs:28`), so keying on id would queue every unlinked corpse derived from one
prototype - and the world actor itself - together. Safe but needlessly coarse, and the same mistake the
inventory mutex avoids.

**Registered through libWrapper, not assigned to the prototype.** Some worlds have other modules wrapping the
same method, and libWrapper is what makes that visible instead of last-writer-wins.

**Four things keep it from becoming a permanent patch nobody remembers:**

- `FIXED_IN_DND5E` in the guard is a version gate. Set it when a release fixes this and the guard stops
  installing. It is deliberately not feature-detected - detecting the absence of a race means matching a
  method body, which is more fragile than the bug it protects against.
- It feature-detects `Actor#updateEncumbrance` and `ActiveEffect.ID.ENCUMBERED` and declines rather than
  patching blindly if either has moved.
- It logs once on activation, so it is discoverable from the console rather than only from the source.
- The `enableEncumbranceGuard` world setting switches it off for diagnosing a conflict.

**The catch is deliberately narrow** - only a message containing both `already exists` and `dnd5eencumbered`
is swallowed, and only after serialisation has already made it unlikely. Widening it would hide real failures
in a code path nobody watches, which is why a harness check asserts that an unrelated failure still
propagates.

**Consequence for the harness.** With the guard installed, a check that counts duplicate-id rejections passes
regardless of how many writes a call makes, so it tests the guard rather than our write discipline. The check
that proves batching is `transfer-items-write-count`, which counts writes directly.

## Merge identity: exclusion, not enumeration

Two items are the same item when nothing distinguishes them. The predicate compares `name`, `type`, the whole
of `system`, and the whole of `flags`, minus what is deliberately changed or declared transient.

An earlier design enumerated the fields that mattered - container, `uses.spent`, `identified` - and it was the
wrong shape. Any enumerated list is a list someone must remember to extend, and it drifts. Comparing all of
`system` minus `quantity` and the reset set subsumes `rarity`, `price`, `attunement`, `identifier`, and
whatever dnd5e adds next, with no maintenance.

Two mechanics follow from it. Comparison is on **`_source` data, never the prepared model**: `item.system`
after preparation holds derived values such as `uses.value` (computed at `dnd5e.mjs:11539`), which differ
between two otherwise identical items for reasons unrelated to identity, so comparing them would merge almost
nothing. And any unresolvable difference resolves to `merged: false` rather than an error - strictness costs a
player an extra inventory row, looseness costs data.

Enchantments need a separate check because they are ActiveEffects on the item and therefore outside `system`
(`item.appliedEnchantments`, `dnd5e.mjs:29360`). This is the case that justifies dnd5e's own caution: a +1
dagger and a plain dagger can share both name and `compendiumSource`.

### compendiumSource is a negative signal only

A missing `_stats.compendiumSource` means unknown, not different. Only two present-and-disagreeing sources
block a merge.

This is not a softening for convenience; requiring a source, or blocking on a one-sided one, both break real
worlds. Foundry sets `compendiumSource` only on a proper import, and modules that build actor items with
`toObject()` into `createEmbeddedDocuments` never set it. A GM dragging a pack into the world produces a
sourced copy of an unsourced pack item, byte-identical otherwise, and an item cache that indexes both ends up
choosing between them arbitrarily - so a one-sided block would make stacking the same component a coin flip.
Measured in one live world: zero of 564 pack items carried a source, while 278 of 281 of the same items in the
world did.

The consumer-side remedy makes it worse rather than better. Importing everything through `fromCompendium`
gives the pack copy and the world copy *different* source UUIDs, and they stop merging entirely.

`grantItem` still stamps `compendiumSource` when it resolves a compendium document, so granted items gain
provenance the hand-rolled paths lose. Under this rule that improvement cannot split a stack.

## Merging is the default because a second row breaks references

Existing behaviour across the suite was to always create a new row, which is not a design choice - it is what
`createEmbeddedDocuments` does when it is the only tool reached for. An item id is referenced by favourites
lists, tracked light sources, and container membership, so a duplicate row silently detaches from all of them,
while a merged arrival inherits the existing row's container and stays inside it.

`stack: 'separate'` remains available and no consumer surveyed wanted it.

## Locking

Keyed on Actor UUID, not item. An item-level lock does not cover a Take All against one corpse from two
clients, and it does not cover currency, which has no item. Every primitive locks every Actor it writes,
including `grantItem` locking its target, because a merge is a read-then-update on the target's existing row.

Two-Actor operations acquire in sorted UUID order, so a simultaneous A-to-B and B-to-A transfer cannot hold
the pair crosswise. Two players swapping items is exactly what a party panel invites.

**A timed-out waiter does not resolve its own tail immediately.** It chains that to the real holder's release
and returns `LOCK_TIMEOUT`. Resolving early would let the next waiter's race succeed while the holder still
holds the lock - two holders, which is the thing the lock exists to prevent. This is the subtlest line in the
file.

`LOCK_TIMEOUT` is the only retryable failure the API produces, and the bounded wait exists so that an
unbounded queue behind one stuck operation cannot become a hang with no error. It is not there to survive a
crashed peer: the mutex is in this client's memory, so a client that drops takes its locks with it and there is
nothing to recover or break.

## What this layer refuses to own

No sockets. Consumers already run GM-authoritative handlers with their own authorization rules, and a
primitive emitting its own socket traffic would put the hub into the transfer-workflow business that a
standing decision keeps it out of. Approval, permission checks, recipient selection, windows, chat cards, and
notifications are consumer-owned, permanently.

Currency conversion is refused for a different reason: exchanging denominations to satisfy a payment is a
table's house rule, not a mechanic, and a primitive must not decide it.
