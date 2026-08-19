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
| `container` | no | Id of a container on the target Actor. Omitted or `null` lands the item at the root of the inventory. |

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

### One call validates against one moment

Every entry is validated against the state at the **start** of the call, before anything moves. That is what
makes per-item results coherent, and it has one consequence worth stating plainly because it is invisible from
the outside.

**A container and its contents cannot be emptied and taken in the same call.** Send a bag and the items inside
it together and the bag is still packed as far as that call is concerned - even though the same call is what
empties it. The contents move, the bag comes back `CONTAINER_HAS_CONTENTS`, and the source is left holding an
empty bag.

That is the documented behaviour working correctly, and it still looks like a bug from the table: a Loot All
that clears a body leaves a row of now-empty sacks on it.

**A consumer clearing a container hierarchy has to loop.** Take everything that is not currently a packed
container, then call again - the next pass picks up whatever the previous one emptied, and nested bags resolve
the same way without special handling. Bound the loop and stop as soon as a pass moves nothing, so a genuinely
stuck row is reported as left behind rather than retried forever. Curator's loot window does exactly this,
capped at four passes.

This is stated because the failure is silent and the correct reading is not obvious. A consumer that
implements a single pass sees empty containers left behind and reasonably concludes `transferItems` is dropping
rows. It is not; it is answering the question it was asked, at the moment it was asked.

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

## exchange

Several directed transfers settled as one operation. Everything commits, or nothing does.

```js
const result = await blacksmith.inventory.exchange({
    transfers: [
        { from: merchantUuid, to: recipientUuid, items: [{ itemId, quantity: 1 }], container: shelfId },
        { from: payerUuid,    to: merchantUuid,  currency: { gp: 25 } },
        { from: merchantUuid, to: payerUuid,     currency: { gp: 5 } }
    ]
});
// { ok: true, results: [ { ok, from, to, items: [...], currency: {...} }, ... ] }
```

A transfer is directed: `from` and `to` are Actor UUIDs, and it carries `items`, `currency`, or both.
Selling is the same call with the sides swapped. Two-party is simply the two-transfer case.

Transfers are directed rather than sided because a shop transaction is routinely three-party - the shopper
pays, so buying for someone else sends goods to a recipient, coin from a payer, and change back to the
payer. A two-sided shape cannot say where anything goes once there are three parties.

| Option on a transfer | Meaning |
|---|---|
| `items` | `[{ itemId, quantity?, flags? }]`, drawn from `from`. |
| `currency` | Deltas moved from `from` to `to`. |
| `container` | Arrival container on `to`, as for `grantItem`. |
| `copy` | The target receives the items and the source is not touched. |
| `preserveEmptySource` | An emptied stackable row stays at quantity 0 instead of being deleted. |

`stack` and `ignoreFlags` are call-level and apply to every arrival.

**This is all-or-nothing, unlike `transferItems`.** That method reports per item because one packed bag on
a corpse must not stop the other rows; here a partly applied settlement is the thing being prevented. Any
refusal fails the whole call and writes nothing. A failure result is a single `{ ok: false, code, index, ... }`
naming the leg at fault, with `entryIndex` when a specific item is the cause - not a per-transfer array.

### copy and preserveEmptySource

These answer two different stock models and are not interchangeable.

`copy` is for stock that has no count: the source row is a template and a sale hands over a duplicate.
Because there is no count, the source stack is **not** a ceiling - a shop can sell three from a row that
reads one, and `INSUFFICIENT_QUANTITY` cannot arise. The source is not written at all, so the result
reports `sourceRemaining: null` and `sourceDeleted: false`.

`preserveEmptySource` is for stock that is a count in `system.quantity`. The source genuinely loses what
moves; the only change is that emptying the stack leaves the row at 0 rather than deleting it, so a shop
goes out of stock rather than off the shelf. It has no effect on an item without a quantity, which has no
zero to sit at.

### What it validates, and when

Everything is checked against the state at the **start of the call**, the same rule `transferItems` states.
Change arriving in the same settlement cannot fund the payment - the payer must actually hold what they
hand over.

Payment and change between the same pair are never netted. Affordability is judged on the total each Actor
pays out; only the resulting write is combined, which is arithmetic rather than a relaxation.

`from === to` is refused per transfer with `SAME_ACTOR`. An Actor appearing in several transfers is normal
and expected - the merchant sends goods and receives coin in one settlement.

The same `itemId` drawn twice fails with `DUPLICATE_ITEM`, for the reason `transferItems` gives. Two `copy`
legs may name the same source freely, since neither draws it down.

An empty `transfers` array fails with `EXCHANGE_EMPTY`.

## Where an item lands

Every one of these writes `system.container` on arrival. Without a `container` option the item lands at
the root of the target's inventory; with one it lands inside that container. The source item's own
containment is never carried over - it names a row on the source Actor, which does not exist on the
target.

`grantItems` and `transferItems` take `container` at the top level as a default for the batch, and each
entry may carry its own. An entry stating `container: null` lands at root even when the batch names one;
an entry that omits the key takes the batch default.

An id that does not resolve to a container on the target Actor is refused with `CONTAINER_NOT_FOUND`
rather than quietly falling back to root, because a caller that names a container has a reason and a
silent fallback puts the item somewhere the result does not mention. Nesting deeper than dnd5e permits is
refused with `CONTAINER_MAX_DEPTH`. In the batch forms both are per entry, so one bad id does not stop the
other rows.

Containment participates in merge identity. Two otherwise identical stacks in different containers are in
different places and stay separate rows; a grant naming a container merges only with a matching row
already in that container.

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

A merge bumps quantity and writes any arrival flags. It does **not** adopt the incoming item's
`compendiumSource`, so a row keeps whatever provenance it was created with. One consequence follows from that
plus the rule above: an unsourced row will merge with items from any source, because each of those is another
one-sided comparison. The stack's provenance stays unknown, which is what it already was, and the items are
identical in every respect the predicate checks.

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
| `CONTAINER_NOT_FOUND` | The `container` id did not resolve to a container on the target Actor. Carries `containerId`, and `type` when the id resolved to something that is not a container. |
| `CONTAINER_MAX_DEPTH` | Placing the item there would nest deeper than dnd5e allows. Carries `containerId`, `depth`, and `max`. |
| `TARGET_CREATE_FAILED` | The write to the target failed. Nothing was taken from the source. |
| `SOURCE_UPDATE_FAILED` | The target received the item but the source could not be reduced. The grant was rolled back. |
| `ROLLBACK_FAILED` | As above, and the rollback also failed. Requires manual repair. |
| `LOCK_TIMEOUT` | Another operation held the Actor too long. Carries `actorUuid` and `waitedMs`. |
| `DUPLICATE_ITEM` | The same `itemId` was drawn twice in one call (`transferItems`, or `exchange` across legs). |
| `EXCHANGE_EMPTY` | `exchange` was called with no transfers. |

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
