# Inventory Architecture

**Audience:** us, and any Coffee Pub module maintainer who needs to change how inventory mutation works.

Scope: how `blacksmith.inventory` mutates items and currency safely, and which parts of it must not be simplified.

The public surface is specified in `api/api-inventory.md`. Implementation is `scripts/api-inventory.js`.

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
(`_onCreateDescendantDocuments` at `dnd5e.mjs:36073`, with update and delete equivalents at `:36082` and
`:36094`, all gated on `userId === game.userId`). The recompute reads
`this.effects.get(ActiveEffect5e.ID.ENCUMBERED)` at `:36226` and, if absent, creates
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

The recompute is also called from the Actor's own `_onUpdate` (`dnd5e.mjs:36009`), not only from the
descendant-document hooks, so an `actor.update()` followed by an item write collides identically. The
original diagnosis of this bug described it as a pair of item writes, which is narrower than the real
surface.

**A third-party follow-up write is enough to reintroduce it, and one exists in the suite today.** Squire's
`createItem` hook writes `setFlag('isNew')` on every item created on an owned Actor, by any module, after
the create returns. That is the second write, and it defeats the one-write-per-Actor property no matter how
carefully this layer behaves. It is also why `registerTransientFlag` exists: the same asynchronous stamp
makes merge identity timing-dependent for consumers that have no idea it is happening.

It only fires when the recipient crosses an encumbrance threshold on that operation, so it presents as
intermittent - and since it surfaces from a lifecycle hook rather than the caller's await chain, the mutation
succeeds and the rejection is console noise. That is worse than a failure, not better: it is the shape of
thing that sits in a log for months.

### 4. An unverifiable container is treated as packed

dnd5e stores containment on the **child** as `system.container`, pointing at the parent's id
(`dnd5e.mjs:19028`). Moving a container with `toObject()` creates it on the target under a new id and leaves
its contents behind pointing at an id that no longer exists.

`_containedCount` uses dnd5e's own `system.contents` getter rather than scanning an actor's items, because a
container resolved from a compendium or the Items directory has no actor to scan - and that is precisely the
case an actor scan reports as empty when it is not. When the count cannot be determined it returns -1 and the
caller refuses. A refused bag is a visible annoyance; an orphaned one is silent corruption.

Full container transfer is deliberately out of scope rather than half-implemented. `Item5e.createWithContents`
(`dnd5e.mjs:22216`) does the recursion, so effort is not the reason - a container move is one-to-many creates
and many source deletes, which breaks the singular return shape, makes quantity splitting meaningless, and
turns rollback into N deletes plus N restores plus reporting which of those also failed. That belongs in its
own method.

## Merge identity: exclusion, not enumeration

Two items are the same item when nothing distinguishes them. The predicate compares `name`, `type`, the whole
of `system`, and the whole of `flags`, minus what is deliberately changed or declared transient.

An earlier design enumerated the fields that mattered - container, `uses.spent`, `identified` - and it was the
wrong shape. Any enumerated list is a list someone must remember to extend, and it drifts. Comparing all of
`system` minus `quantity` and the reset set subsumes `rarity`, `price`, `attunement`, `identifier`, and
whatever dnd5e adds next, with no maintenance.

Two mechanics follow from it. Comparison is on **`_source` data, never the prepared model**: `item.system`
after preparation holds derived values such as `uses.value` (computed at `dnd5e.mjs:4357`), which differ
between two otherwise identical items for reasons unrelated to identity, so comparing them would merge almost
nothing. And any unresolvable difference resolves to `merged: false` rather than an error - strictness costs a
player an extra inventory row, looseness costs data.

Enchantments need a separate check because they are ActiveEffects on the item and therefore outside `system`
(`item.appliedEnchantments`, `dnd5e.mjs:19346`). This is the case that justifies dnd5e's own caution: a +1
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
