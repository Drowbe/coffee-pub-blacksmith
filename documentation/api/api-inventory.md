# Inventory API

**Audience:** developers of Coffee Pub modules that move items or coins between Actors.

Scope: the public surface of `blacksmith.inventory` - the four mutation primitives, their results, and their error codes.

Mechanism and design rationale live in `architecture/architecture-inventory.md`.

## What it is for

These are mechanical primitives. They resolve fresh documents, validate, mutate, and return a structured
result.

They own no workflow. There are no sockets, no permission checks, no windows, no chat messages, and no
notifications. A consumer calls them from its own GM-authoritative handler after its own authorization has
passed, so approval, recipient selection, distance checks, and domain rules stay with the module that has
them.

Two shapes, because they answer different questions. `grantItem`, `grantItems`, and `grantCurrency` put
content onto an Actor from a compendium, a loot table, a crafting result, or constructed data - there is no
source Actor and nothing is taken from anywhere. `transferItem` and `transferCurrency` move content between
two Actors.

Always branch on `result.ok`. These validate against live documents, so a call can legitimately fail on a
corpse two players are looting at once.

## grantItem

```js
const result = await blacksmith.inventory.grantItem({
    targetActorUuid,
    itemUuid,                                          // or itemData
    quantity: 3,
    stack: 'merge',
    ignoreFlags: ['coffee-pub-squire.isNew'],
    flags: { 'coffee-pub-squire': { isNew: true } }
});
// { ok: true, targetItemId, quantity, merged }
```

| Option | Required | Meaning |
|---|---|---|
| `targetActorUuid` | yes | Accepts a synthetic token-actor UUID (`Scene.x.Token.y.Actor.z`). |
| `itemUuid` | one of | Anything `fromUuid` resolves: compendium, world, or actor-embedded item. |
| `itemData` | one of | A raw item object, for something assembled in memory. Used only when `itemUuid` is absent. |
| `quantity` | no | Defaults to the source item's own quantity. Must be a positive integer. |
| `stack` | no | `'merge'` (default) or `'separate'`. |
| `ignoreFlags` | no | Flag paths the merge check treats as non-identity. |
| `flags` | no | Flags written in the same operation as the item. See below - this is not a convenience. |

When `itemUuid` resolves a compendium document, the created item carries `_stats.compendiumSource`, so
granted items keep provenance that a hand-rolled `toObject()` create loses. This never splits a stack; see
the merge rules.

## grantItems

```js
const result = await blacksmith.inventory.grantItems({
    targetActorUuid,
    items: [
        { itemUuid, quantity: 1, flags },
        { itemUuid, quantity: 6 }
    ],
    stack: 'merge',
    ignoreFlags: []
});
// { ok: true, results: [ { ok, targetItemId, quantity, merged }, ... ] }
```

`results` is index-aligned with `items`, and each entry has the same shape as a `grantItem` result. Top-level
`ok` is true only when every entry succeeded; individual entries can fail independently, so check them rather
than the top-level flag alone.

Duplicate entries in one batch **coalesce into a single row**. Three entries for the same item produce one
row holding the summed quantity, and all three results report that row's `targetItemId`. The entries after
the first carry `coalesced: true` with `merged: false` - nothing that already existed was grown, so calling
it a merge would be wrong, but neither did they create a row of their own.

Merges into rows that already existed are applied as one batched update, and creates as one batched create,
so a batch of any size costs at most two writes to the target Actor rather than one per item.

**Use this instead of looping `grantItem`.** It is not a convenience wrapper. Everything that can be created
goes in a single `createEmbeddedDocuments` and every merge in a single `updateEmbeddedDocuments`, which
matters for the reason described under `flags`. For taking items *off* another Actor, use `transferItems`.

**Calling this once per item defeats the whole point.** A loop of `grantItems({items: [oneThing]})` is
exactly as many writes as a loop of `grantItem`, and duplicate items cannot coalesce because their payloads
never meet in the same call. Accumulate everything first, then make one call. This has already been shipped
by mistake once - the plural name made a per-item loop look like batching.

## transferItem

```js
const result = await blacksmith.inventory.transferItem({
    sourceActorUuid,
    targetActorUuid,
    itemId,
    quantity: 3,
    stack: 'merge',
    ignoreFlags: [],
    flags: {}
});
// { ok: true, sourceItemId, targetItemId, quantity, sourceRemaining, sourceDeleted, merged }
```

`itemId` is the embedded item id on the source Actor. The item is resolved and its quantity re-checked
against the live document inside the lock, so a stale client-side quantity cannot create more on the target
than the source holds.

## transferItems

Take All. Moves several items from one Actor to another in one operation.

```js
const result = await blacksmith.inventory.transferItems({
    sourceActorUuid,
    targetActorUuid,
    items: [
        { itemId: arrowsId, quantity: 5 },   // partial
        { itemId: daggerId },                // whole stack
        { itemId: bagId }                    // refused if packed; other rows still move
    ],
    stack: 'merge',
    ignoreFlags: []
});
// { ok, results: [ { ok, targetItemId, quantity, merged, sourceItemId, sourceRemaining, sourceDeleted }, ... ] }
```

**Use this rather than looping `transferItem`.** It is not sugar. N single transfers are N writes to the
recipient and N to the source; this is at most two writes per Actor whatever the item count, which is the
difference between one encumbrance recompute per Actor and N racing ones.

`results` is index-aligned with `items` and each entry has the same shape as a `transferItem` result, plus
`itemId` on failures so a caller can attribute a refusal to a row. **Validation is per item, not
all-or-nothing:** one packed container on a corpse does not stop the other rows being taken. Top-level `ok` is
true only when every entry succeeded, so check the entries.

Duplicate entries coalesce on the target the same way `grantItems` does, so two rows of the same arrows land
as one stack.

**The same `itemId` twice in one call is refused** with `DUPLICATE_ITEM` on the second entry. Two entries for
one item make the per-entry quantity checks meaningless - each validates against the full stack, and together
they could over-draw it. Summing them would be guessing at intent the caller can state exactly.

If the source reduction fails after the target has been written, the whole grant is reversed: created rows
deleted, merged rows decremented by exactly what was added. Every entry then reports `SOURCE_UPDATE_FAILED`,
or `ROLLBACK_FAILED` if the reversal itself failed.

## grantCurrency and transferCurrency

```js
await blacksmith.inventory.grantCurrency({
    targetActorUuid,
    currency: { gp: 12 }
});
// { ok: true, currency: { gp: 12 } }

await blacksmith.inventory.transferCurrency({
    sourceActorUuid,
    targetActorUuid,
    currency: { cp: 10, sp: 4, gp: 2 }
});
// { ok: true, currency: { cp: 10, sp: 4, gp: 2 } }
```

Amounts are **deltas to move, never absolute totals**. Denominations are `pp`, `gp`, `ep`, `sp`, `cp`, and
each amount must be a non-negative integer.

**Denominations are never converted.** Moving 2 gp from a purse holding only 20 sp returns
`INSUFFICIENT_CURRENCY`. Automatic exchange is a house rule, not a mechanic, and imposing one would make a
primitive decide something that belongs to a table.

`transferCurrency` validates every denomination before writing anything, because a partially completed
currency move is not something a rollback expresses cleanly.

## Stackability is derived, never declared

There is no `hasQuantity` parameter and there will not be one. Whether an item stacks decides
delete-the-whole-item versus decrement, and a wrong value from a caller destroys a stack. The API reads
`system.quantity` off the resolved document and ignores any caller claim about it.

## Arrival flags belong in the write

Pass `flags` rather than setting them afterwards with `setFlag`. A follow-up write to the same Actor
reintroduces a live dnd5e bug: encumbrance is recomputed on every item create, update, and delete as a
check-then-create against one fixed effect id with no lock, and Foundry does not await that recompute from the
promise `createEmbeddedDocuments` returns. Two sequential, individually awaited writes to one Actor therefore
both try to create the same effect id and the server rejects the second:

```
Error: The _id [dnd5eencumbered0] already exists within the parent collection: Actor [...] effects
```

Awaiting correctly does not avoid this, and neither does the API's own locking, because the recompute
completes outside the critical section. One write is the only fix available to anyone. This is also why
`grantItems` exists rather than a loop.

The recompute also runs on an Actor's own update, not only on item writes, so an `actor.update()` followed
closely by an item write collides the same way. If you see this error while using this API, something is
making a second write to that Actor - the API itself makes one per Actor per call.

The flags are folded into the create payload on the create branch, and into the same update as the quantity
change on the merge branch. On a merge, only the flags you passed are written - the incoming document's own
flag set is not applied to the row that already existed.

`flags` and `ignoreFlags` compose rather than compete. Declaring the same key in both is correct: transient UI
state is identity-irrelevant and arrival-relevant at the same time.

## registerTransientFlag

If your module writes a flag to items AFTER they are created, declare it once during ready:

```js
blacksmith.inventory.registerTransientFlag('coffee-pub-squire.isNew');
blacksmith.inventory.getTransientFlags();   // diagnostics
```

Every merge comparison then ignores that path, for every caller. `ignoreFlags` is unioned with this
registry.

**Declare it if you write it, because no consumer can declare it for you.** A module that stamps a flag on
items other modules created makes those modules' merges depend on whether its write has landed yet - two
identical items merge or do not merge according to timing. The consumer calling `grantItem` has no way to
know your module does this, so the obligation sits with the writer.

Declare a flag if you write it after creation and it does not describe what the item *is*. A "recently
arrived" badge is transient. A crafting quirk or a skill level is not - those are identity, and excluding
them would merge items that genuinely differ.

## Merging

With `stack: 'merge'` (the default) an incoming item is added to a matching row on the target instead of
creating a second one. A second row is not a neutral outcome - it quietly breaks anything holding an item id,
including favourites lists, tracked light sources, and container membership.

An incoming item merges only when all of the following hold. If any fails, it lands as a separate row and
`merged` is `false`; a failed merge check never fails the operation.

- Same `name` and same `type`, and the type is transferable.
- Both carry a numeric `system.quantity`.
- Deep-equal `system` source data, excluding `quantity` and the reset set.
- Deep-equal `flags`, excluding the paths in `ignoreFlags`.
- Neither side has applied enchantments.
- `_stats.compendiumSource` does not contradict: a missing source on either side is treated as unknown, and
  only two present-but-different sources block a merge.

Comparison is on source data, not the prepared model, so derived values like `uses.value` do not spuriously
prevent a merge. Anything undeclared in `ignoreFlags` counts as identity, which is why a module writing UI
state to item flags must declare those keys.

`stack: 'separate'` always creates a new row.

## What is refused

**Non-physical item types.** Only `weapon`, `equipment`, `consumable`, `tool`, `loot`, and `container` move.
Anything else returns `ITEM_NOT_TRANSFERABLE`. A raw create of a class, feat, or spell bypasses dnd5e's
singleton check and its advancement flow.

**A container that is not empty.** Returns `CONTAINER_HAS_CONTENTS` with `contentCount`, so a consumer can
say how many items to unpack first. An empty container transfers normally. When emptiness cannot be
determined, the container is refused and `contentCount` is `null` - an unverifiable container is treated as
packed, because dnd5e stores containment on the child and a wrong answer orphans the contents silently.

**Same-actor transfers.** `SAME_ACTOR`. This also excludes moving an item between containers on one Actor,
which is a legitimate dnd5e operation this API does not currently express.

## Failure results and error codes

Every failure is `{ ok: false, code, ...context }`.

| Code | Meaning |
|---|---|
| `SOURCE_ACTOR_NOT_FOUND` / `TARGET_ACTOR_NOT_FOUND` | The UUID did not resolve to an Actor. |
| `SOURCE_ITEM_NOT_FOUND` | No item with that id on the source Actor. |
| `ITEM_NOT_FOUND` | `itemUuid` did not resolve, or neither `itemUuid` nor `itemData` was supplied. |
| `SAME_ACTOR` | Source and target are the same Actor. |
| `INVALID_QUANTITY` | Not a positive integer, or above 1 for a non-stacking item. |
| `INSUFFICIENT_QUANTITY` | Carries `requested` and `available`. |
| `INVALID_CURRENCY` | Unknown denomination, negative or non-integer amount, or nothing positive to move. |
| `INSUFFICIENT_CURRENCY` | Carries `shortfalls` keyed by denomination, each with `requested` and `available`. |
| `ITEM_NOT_TRANSFERABLE` | Carries `type` and `allowed`. |
| `CONTAINER_HAS_CONTENTS` | Carries `contentCount`, or `null` when it could not be determined. |
| `TARGET_CREATE_FAILED` | The write to the target failed. Nothing was taken from the source. |
| `SOURCE_UPDATE_FAILED` | The target received the item but the source could not be reduced. The grant was rolled back. |
| `ROLLBACK_FAILED` | As above, and the rollback also failed. Requires manual repair. |
| `LOCK_TIMEOUT` | Another operation held the Actor too long. Carries `actorUuid` and `waitedMs`. |
| `DUPLICATE_ITEM` | `transferItems` only: the same `itemId` appeared twice in one call. |

`SOURCE_UPDATE_FAILED` and `ROLLBACK_FAILED` also carry `targetItemId`, `merged`, `quantity`,
`observedTargetQuantity`, and `observedSourceQuantity`. Surface these rather than swallowing them: whether
the row was created or grown, and by how much, is what a GM needs to repair the state by hand.

**`LOCK_TIMEOUT` is the only retryable code.** Every other code describes a state that will not change by
trying again, so offering a retry on those misleads the user.

## Concurrency

Each primitive locks every Actor it writes for the whole operation, so a Take All from one corpse on two
clients cannot double-spend a stack. Two Actors are locked in a deterministic order, so simultaneous
opposite-direction transfers cannot deadlock.

The lock is per-client and in memory. It serialises calls made through this API on one client; it is not a
distributed lock and does not coordinate two GM clients. Consumers already route mutations through a single
GM-authoritative handler, which is what makes that sufficient.
