# Plan: api.inventory - authoritative inventory mutation primitives

**Status: Planned.** Written 2026-08-07. Nothing implemented.

This plan is scaffolding. When it is implemented its content is distributed - the public surface to a new
`api/api-inventory.md`, the mechanism and the dnd5e coupling to `architecture/architecture-inventory.md`,
the work items to `TODO.md`, history to `CHANGELOG.md` - and this file is deleted.

The work breakdown in the last section is the only record of this work until implementation starts. Lift it
into `TODO.md` at that point; it must not live here once the work is real.

## What this is, and what it is not

Blacksmith gains four mechanical primitives that put items and coins onto Actors safely: `grantItem` and
`grantCurrency` for content arriving from a compendium, table, or crafting result, and `transferItem` and
`transferCurrency` for moving between two Actors. They resolve fresh documents, validate, mutate, and
return a structured result. They own no workflow.

This is not a revival of the hub-owned Transfer/Share window rejected on 2026-07-29 (see the decision in
`TODO-GLOBAL.md`). That decision's own revisit condition was two or more modules provably duplicating
meaningful code, and it is met - but by mutation code, not shell code. Approval, permission checks,
recipient selection, windows, chat cards, and notifications all stay with the consuming module, and none
of the three objections recorded in that decision apply here:

- There is no window, so nothing needs to open on a client other than the caller's.
- There is no approval step to orchestrate.
- The hub can verify a mutation primitive, because it has no workflow to exercise: call it from a script
  macro against two actors and read the return value.

## Why the hub owns it

`coffee-pub-curator/module.json` requires exactly one module: `coffee-pub-blacksmith`.
`coffee-pub-squire/module.json` requires `coffee-pub-blacksmith` and `socketlib`. Neither depends on the
other and `coffee-pub-lib` is retired, so the hub is the only place the two can share code. The
alternative is Curator taking a hard dependency on Squire, which is the "two optional things, neither
guaranteed present" case that Ground Rule 2 refuses.

This does not contradict the extraction direction in `CLAUDE.md`. What gets pulled out of the hub is
features - UI, windows, settings, hooks, lifecycle participation. This has none of them: it is a static
class and a mutex, in the same category as `api.effects` and `api.compendiums`, both of which already do
dnd5e-specific domain mechanics here. `manager-compendiums.js:1029` already writes `system.quantity` and
`manager-compendiums.js:1050` (`setActorCurrency`) already writes `system.currency`.

Cost to `blacksmith.js` is one import and one line in the api object beside `effects: EffectsAPI`
(`blacksmith.js:996`). It adds nothing to the god-module problem.

## What the duplication looks like today

Squire carries **four** near-verbatim copies of the same `_completeItemTransfer` body - in
`transfer-utils.js`, `panel-party.js`, `manager-panel.js`, and inline in the `executeItemTransfer` socket
handler in `squire.js` - plus four drop-creates across `panel-party.js` and `manager-panel.js`. Curator adds
a ninth in `LootUtilities._rollLootTable` and a tenth (currency) in `_addRandomCoins`, and Artificer an
eleventh in `addCraftedItemToActor`.

**Cite sibling code by symbol, never by line number.** This section carried exact line numbers for one
round and every one of them was stale within a day, because Squire shipped a commit into the same
functions. Line numbers are a stable pointer only inside a repo we control; into an actively developed
sibling they are worse than no pointer, because they look precise while sending a reader to the wrong
place. Blacksmith's own files and pinned dnd5e 5.2.5 keep their line numbers; siblings get symbol names.

Two counts were also wrong in the same round, both undercounts, and the second was wrong on both sides of
the conversation: `manager-panel.js` holds a fourth full copy rather than a bare create, and there are
**eight** `game.actors.get` call sites across `manager-panel.js`, `panel-party.js`, and `squire.js`, not the
two originally surveyed or the three the review settled on.

The cross-module tracking entry for retiring those call sites belongs in `TODO-GLOBAL.md`, not here.

## The four defects the primitive absorbs

Deduplication is the weaker half of the argument. Every existing copy shares four defects, and dnd5e 5.2.5
already defines correct behavior for three of them.

**1. Equipped and attuned state survives the move.** dnd5e's own drop path calls `_onDropResetData`
(`dnd5e.mjs:55332`), deleting `attuned`, `equipped`, `prepared`, and `crew.value`. A raw
`createEmbeddedDocuments(item.toObject())` does none of it, so a transferred weapon arrives already
equipped and an attuned item lands attuned without consuming a slot.

**2. Containers corrupt silently.** dnd5e stores containment as `system.container` on the child, holding
the parent item's id (`dnd5e.mjs:19028`). Moving a container with `toObject()` creates it on the target
under a new id and leaves the contents on the source pointing at an id that no longer exists.

**3. Unlinked token actors cannot be resolved.** Eight call sites across Squire's `manager-panel.js`,
`panel-party.js`, and `squire.js` resolve the source through `game.actors.get(id)`. A corpse is an unlinked
token, so its actor UUID is `Scene.x.Token.y.Actor.z` and `game.actors.get` returns undefined. UUID
resolution is a capability gain, not just hygiene, and it is the requirement Curator cannot work around.

**4. Quantity was re-checked in only one of the four copies.** The `executeItemTransfer` socket handler
compared requested against available; the other three did not, so a stale client-side quantity created the
full requested amount on the target and deleted the source stack.

Squire fixed this ahead of the API (their commit `c28e57b`), deriving available quantity from the live
document in all three, and also removed a worse version of the same hole: the socket handler's existing
check was itself gated on the client-supplied `hasQuantity`, so a client claiming an item did not stack
skipped validation entirely. The defect is therefore historical in Squire and the primitive inherits the
correct behavior rather than introducing it - but it is recorded because the same hole is what any new
consumer would write, and because it is the clearest evidence for deriving stackability rather than
accepting it.

## Surface

Lives in `scripts/api-inventory.js`, exports `InventoryAPI`, registered as `inventory`. The `api-` prefix
is correct and `manager-` is not: there is no subsystem state beyond the mutex and no lifecycle.

```js
await blacksmith.inventory.transferItem({
    sourceActorUuid,
    targetActorUuid,
    itemId,
    quantity,                 // omitted for items with no system.quantity
    stack: 'merge',           // default; 'separate' to force a new row
    ignoreFlags: []           // flag paths the merge check treats as non-identity
});
```

Success:

```js
{ ok: true, sourceItemId, targetItemId, quantity, sourceRemaining, sourceDeleted, merged }
```

Failure:

```js
{ ok: false, code: 'INSUFFICIENT_QUANTITY', requested: 5, available: 2 }
```

```js
await blacksmith.inventory.transferCurrency({
    sourceActorUuid,
    targetActorUuid,
    currency: { cp: 10, sp: 4, gp: 2 }   // deltas, never absolute totals
});
```

There is no source actor when an item comes from a compendium, a loot table, a crafting result, or the
Items directory, so `transferItem` cannot express those. They get their own primitive, and it is the one
that carries the merge logic:

```js
await blacksmith.inventory.grantItem({
    targetActorUuid,
    itemUuid,                 // or itemData for a constructed item
    quantity,
    stack: 'merge',
    ignoreFlags: []
});
// { ok: true, targetItemId, quantity, merged }

await blacksmith.inventory.grantCurrency({
    targetActorUuid,
    currency: { gp: 12 }      // deltas added to what is there
});
```

`transferItem` is then defined in terms of it: validate the source, grant on the target, reduce the source,
roll back the grant on failure. One merge predicate, shared. It calls the **unlocked core** rather than the
public `grantItem`, for the re-entrancy reason in the lock decision below. `grantItem` has no `SAME_ACTOR`,
`INSUFFICIENT_QUANTITY`, or rollback codes - there is no source to contend with - and adds `ITEM_NOT_FOUND`
for an unresolvable `itemUuid`.

`itemUuid` accepts anything `fromUuid` resolves: a compendium item (`Compendium.<pack>.Item.<id>`), a world
item (`Item.<id>`), or an item embedded on an actor. When it resolves a compendium document the grant sets
`_stats.compendiumSource`, so granted items carry provenance the current hand-rolled paths lose. That does
not affect merging - see the identity note below. `itemData` remains for genuinely constructed items that
exist nowhere, such as a crafting result assembled in memory. `ignoreFlags` applies to `grantItem` on
identical terms, since a grant into an existing stack runs the same merge predicate.

Three modules need `grantItem` and only one strictly needs `transferItem`, so it is not a secondary
convenience: Artificer's crafted and gathered items (`addCraftedItemToActor`), Curator's loot-table rolls
(`LootUtilities._rollLootTable`), and Squire's four Items-directory and fallback-import drops are all
create-on-actor with no source. `grantCurrency` covers Curator's random coin drop (`_addRandomCoins`), which
is an add from nowhere rather than a move.

Error codes: `SOURCE_ACTOR_NOT_FOUND`, `TARGET_ACTOR_NOT_FOUND`, `SOURCE_ITEM_NOT_FOUND`, `ITEM_NOT_FOUND`,
`SAME_ACTOR`, `INVALID_QUANTITY`, `INSUFFICIENT_QUANTITY`, `INSUFFICIENT_CURRENCY`,
`ITEM_NOT_TRANSFERABLE`, `CONTAINER_HAS_CONTENTS` (carries `contentCount`), `TARGET_CREATE_FAILED`,
`SOURCE_UPDATE_FAILED`, `ROLLBACK_FAILED`, `LOCK_TIMEOUT`.

`LOCK_TIMEOUT` is the only one of these a consumer should offer to retry. Every other code describes a state
that will not change by trying again.

## Design decisions, with the reason attached

**Derive stackability from the item; never accept it as a parameter.** Squire threads a caller-supplied
`hasQuantity` boolean through every call site, and that flag decides delete-the-whole-item versus decrement.
A wrong value from a caller destroys a stack.

The evidence for this is better than a hypothetical. On Squire's receiver-accept path, `hasQuantity: true` is
**hard-coded** into the socket payload for every item type, including items that have no quantity at all - not
derived, not validated, asserted. It happens not to corrupt anything today only because the
delete-versus-decrement branch falls the right way for non-stackables by coincidence. That is a parameter
working correctly for a reason nobody chose, which is the argument for deleting it rather than documenting it.
The API reads `system.quantity` off the resolved document and ignores any caller claim about it.

**The mutex keys on Actor UUID, not Item.** An item-level lock does not cover Take All against one corpse
from two clients, and it does not cover currency at all, which has no item. `transferCurrency` takes the
same lock, so a coin grab and an item grab on one corpse cannot interleave.

Every primitive locks every Actor it writes. `grantItem` locks the **target**, not just because of the
create but because a merge is a read-then-update on the target's existing item: two concurrent grants of
the same thing could both read quantity 20 and both write 23. `grantCurrency` has the same read-modify-write
shape and needs the same lock - it is the race already live in `loot-utilities.js:112`.

`transferItem` and `transferCurrency` therefore hold two locks, which introduces deadlock: an A-to-B
transfer and a B-to-A transfer each holding one lock and waiting on the other. **Acquire in a deterministic
order - sort the two UUIDs and always take the lower first** - so the pair can never be held crosswise. Do
not skip this because a simultaneous cross-transfer sounds unlikely; two players swapping items is exactly
the case a party panel invites, and a deadlock here hangs both clients with no error.

**Create on the target first, then reduce the source.** The opposite order fails toward a vanished item;
this order fails toward a visible duplicate, which is recoverable.

**Rollback is quantity-aware, and getting this wrong destroys the recipient's property.** The first draft
said rollback is "delete the item just created on the target." With merge as the default that is a
destructive bug, caught by Squire on review: if the grant merged 3 arrows into the recipient's existing
stack of 20 and the source reduction then fails, deleting `targetItemId` destroys 23 arrows, 20 of which
were never part of the transfer. The recipient silently loses property they already owned, and the failure
looks like a successful cleanup.

Rollback branches on what the grant actually did:

- `merged: false` - the grant created the row, so delete it.
- `merged: true` - the grant added to an existing row, so **decrement by exactly the granted quantity**.
  Never delete. The pre-existing quantity was at least 1, so the decrement always leaves a valid stack.

`SOURCE_UPDATE_FAILED` and `ROLLBACK_FAILED` carry `targetItemId`, `merged`, the granted quantity, and the
observed target and source quantities. A GM repairing this by hand needs to know whether the row was created
or grown, and by how much; `targetItemId` alone is not enough once merging exists.

**The lock is held by the public entry point, not by each primitive.** `transferItem` calls the grant and
the source reduction as **internal, unlocked cores**; only the public method acquires locks. Two reasons, and
the first is fatal rather than merely untidy:

- If `transferItem` held the target lock and then called the public `grantItem`, that call would wait for a
  lock its own caller already holds - a self-deadlock on every transfer, not an edge case.
- Even without re-entrancy, releasing the target lock between the grant and the source reduction opens a
  window where another client mutates the target stack, so the quantity-aware rollback above would decrement
  a number that no longer means what it meant when it was read.

So: `_grantItemCore` and `_reduceSourceCore` take no locks and assume the caller holds them; `grantItem` and
`transferItem` are thin locking wrappers over them. This is the shape that makes the rollback contract
sound.

**Acquisition failure is its own error code, `LOCK_TIMEOUT`, and it is the only retryable failure the API
returns.** Requested by Squire, and correct: without a distinct code, contention lands in a consumer's
generic failure card and reads as permanent when the honest message is "someone else is moving that right
now, try again." The result carries the actor UUID that was contended and how long it waited, so a card can
be specific and a GM can tell contention from a stuck operation.

Two facts about the mutex that bound what this code can mean. It lives in the GM client's memory, not in
world state, so there is **no cross-client lock to leak** - a client that drops mid-transfer takes its locks
with it, and there is nothing to recover or break. And the release must sit in a `finally`, because the only
way a lock outlives its operation is an exception escaping the critical section. A bounded wait exists not
to survive a crashed peer but so that an unbounded queue behind one stuck operation cannot reproduce the
exact failure the wrapper/core split was introduced to prevent: a hang with no error.

**Reject non-physical item types** (`ITEM_NOT_TRANSFERABLE`). Only `weapon`, `equipment`, `consumable`,
`tool`, `loot`, `container`. A raw create bypasses dnd5e's singleton check and the advancement manager
(`dnd5e.mjs:55298-55318`), so a loot window handing a player a `class` item is unrecoverable.

**Reject a container that has contents; allow an empty one.** `Item5e.createWithContents`
(`dnd5e.mjs:22216`) does the recursion, so effort is not the reason. The reason is that a container move
breaks every assumption the v1 contract rests on: the return shape is singular; quantity splitting is
meaningless for one; rollback becomes N deletes plus N restores plus reporting which of those also failed;
and `createWithContents` generates the ids itself and writes children's `system.container` to point at
them (`dnd5e.mjs:22226-22240`), so `createDocuments` must be called with `keepId: true` or the links
break. That footgun belongs in its own method. `CONTAINER_HAS_CONTENTS` carries the content count.

The limitation is free for the first consumer: a looting window that flattens the corpse - listing
container contents as individual rows rather than one takeable bag - never asks the API to move a full
container, and that is better looting UX independently.

**Stacking defaults to `'merge'`; `'separate'` is the opt-in.** The first draft defaulted to `'separate'` on
the grounds that it matched existing behavior. Squire pointed out that existing behavior is not a design
choice - it is a side effect of `createEmbeddedDocuments` being the only tool reached for - and that three
things in Squire key on item id and silently degrade when a second row appears: the favorites list is an
actor flag holding item ids, `activeLightSourceId` is a single item id (`utility-lights.js:379-392`), and
container membership lives on the child as `system.container`, so a new row lands loose at the root outside
whatever bag the player organized. A merged arrival inherits the target row's container and stays inside it.

That argument generalizes: a second row is not a neutral outcome, it is a quiet break of anything holding
an item id. No consumer surveyed wants `'separate'`. Default to `'merge'` and let a caller opt out.
`merged` stays on the success result because without it `targetItemId` is ambiguous about whether anything
was created.

**Merge eligibility is gated on item state, not item type.** dnd5e's own rule stacks consumables only
(`dnd5e.mjs:55349-55357`), which is a proxy for "types unlikely to carry per-item state" and is the reason
two identical daggers do not stack on a sheet. Checking the state directly is strictly better and lets them.
Merge only when every one of these holds; if any fails, create a separate row and return `merged: false`.
Never fail the transfer over a merge check - the player still gets the item.

| Condition | Why |
|---|---|
| Same `name` and same `type`, both within the physical whitelist | The baseline identity claim, and all that Artificer's own merge uses today (`utility-artificer-item.js:169-186`). Weak on its own, which is what the rest of this table is for. |
| `_stats.compendiumSource` does **not** participate - see the note below | It was added to strengthen a name-only rule that no longer exists. Once `system` and `flags` are compared whole, provenance metadata adds no identity and costs a migration wrinkle. |
| Deep-equal `flags`, excluding the transient list | Turns the flag-divergence risk into correct behavior instead of silent loss - see the note below. |
| **Deep-equal `system`**, excluding `quantity` and the reset set (`equipped`, `attuned`, `prepared`, `crew.value`) | The single rule that covers everything an enumerated field list would miss - see the note below. |
| Both carry a numeric `system.quantity` | Nothing to add otherwise. |
| Neither has applied enchantments (`item.appliedEnchantments`, `dnd5e.mjs:19346`) | Enchantments are ActiveEffects on the item, so they are outside `system` and need their own check. This is the case that justifies dnd5e's caution: a +1 dagger and a plain dagger share name *and* `compendiumSource`. Merging destroys an enchantment or grants one free. |

Equipped and attuned state is not a merge hazard: the transfer already strips it via the reset set
(`dnd5e.mjs:55332`). Nor are the actor's favorites, which reference item ids - merging creates no new id,
so it is safer there than a separate row.

**Compare the whole of `system`, not a list of fields.** The first draft enumerated `container`, `uses.spent`,
and `identified` as separate conditions. Squire asked whether identity also covered rarity and price, which
is the right question and exposes the wrong shape: any enumerated list is a list someone has to remember to
extend, and it will drift the way every copied thing in this repo has drifted. Deep-equal the entire `system`
object instead, excluding only `quantity` (the thing being added) and the reset set (deliberately cleared on
arrival). That subsumes `container`, `uses.spent`, `identified`, `rarity`, `price`, `attunement`,
`identifier`, and every field dnd5e adds later, with no maintenance.

Two implementation requirements come with it. **Compare `_source` data, never the prepared model** -
`item.system` after data preparation holds derived values (`uses.value` computed at `dnd5e.mjs:4357` is one),
and those differ between two otherwise identical items for reasons that have nothing to do with identity.
Use `item.toObject().system` or `item._source.system`. And **an unresolvable difference must fail toward
`merged: false`**, never toward an error: strictness here costs a player an extra inventory row, and that is
the acceptable failure.

**Why `compendiumSource` is out of the identity check entirely.** dnd5e bails out of stacking when there is
no source id (`dnd5e.mjs:55350-55351`), and copying that looks safe but breaks the suite's most stack-worthy
items. Foundry only sets `_stats.compendiumSource` on a proper import; Artificer creates actor items with
`item.toObject()` into `createEmbeddedDocuments` and never calls `fromCompendium`
(`manager-gather.js:289-293`), so its components carry none. Requiring one would give a player twelve rows
for twelve gathered mushrooms.

The intermediate position - compare it when both sides have it, block on a one-sided source - was also
wrong, for a subtler reason. `grantItem` resolving a compendium UUID **should** set `compendiumSource`,
because provenance is worth having and it is the correct Foundry idiom. But under a one-sided-blocks rule,
that improvement would split every legacy stack: an Artificer component gathered last month has no source,
a newly granted one does, and they would refuse to merge. The fix would have been paying a visible cost for
metadata that carries no identity.

Once `system` and `flags` are compared whole, `compendiumSource` adds nothing an equality check needs. Two
items with identical name, type, system data, and flags are the same item whether or not one remembers where
it came from. So: `grantItem` sets `compendiumSource` when it resolves a compendium document, and the merge
predicate ignores it. Provenance improves, nothing splits.

**Flags are compared, not discarded.** Artificer stores real crafting data on items - `artificerType`,
`artificerFamily`, `artificerTraits`, `artificerSkillLevel`, `artificerBiomes`, `artificerQuirk`,
`artificerAffinity` (`schema-artificer-item.js:171-179`). Its own merge keys on name and type alone, so it
already drops a differing quirk silently; this API must not inherit that. Deep-equal comparison makes
identical components merge and sends a differing one to its own row, so nothing is lost either way. Deep
equality on a small object is cheap and fails toward `merged: false`, which is the safe direction.

**The exclusion list is caller-supplied: `ignoreFlags: ['<scope>.<key>']`, default empty.** Blacksmith must
not hard-code a sibling's flag key - that is the outbound coupling Ground Rule 2 refuses, and the hub cannot
know which of a consumer's flags are identity-bearing. `api-inventory.md` documents the pattern instead: a
module that writes transient UI state to item flags passes those keys, and any flag not listed is treated as
identity and blocks the merge when it differs.

The default of empty is deliberate. It fails toward `merged: false`, so a consumer that forgets the option
gets extra rows rather than silent data loss.

**Accepted divergence from the system sheet.** These rules are more permissive than dnd5e's, so dragging a
dagger onto a sheet will not stack while transferring one through this API will. That is deliberate: the
sheet's behavior is dnd5e's to change, and merging is what a player expects when looting. It is a knowing
divergence, and `api-inventory.md` states it so nobody reports it as a bug.

**No sockets, by design.** Consumers already run GM-authoritative handlers, and each has its own
authorization rules. A primitive that emitted its own socket traffic would put the hub back in the
workflow business the 2026-07-29 decision kept it out of. The API doc states this reason explicitly, so
nobody helpfully adds it later.

**Currency takes deltas and never converts denominations.** Paying 2 gp from a purse holding 20 sp fails
with `INSUFFICIENT_CURRENCY` rather than silently exchanging. Absolute totals would race the way
`loot-utilities.js:112` does today.

## Non-goals, stated so they are not excluded by accident

- **Same-actor moves.** `SAME_ACTOR` rejection also closes off same-actor container moves, which is a
  legitimate dnd5e operation. Excluded deliberately in v1; revisit with a real use case attached.
- **Full container transfer.** A later `transferContainer()`, not a flag on `transferItem`.
- **Approval, permissions, recipient selection, chat, notifications.** Consumer-owned, permanently.

## Accepted system coupling

This API is dnd5e-specific by construction: `system.quantity`, `system.currency`, the `system.container`
model, and the physical-type whitelist. Blacksmith is a dnd5e module, so this is acceptable - but it is
accepted, not incidental, and `architecture-inventory.md` says so. Note it in `plans/migration-v14.md` as
a surface that needs re-verification against the next system version.

## Work breakdown

Each item carries its verification. There is no test framework, so every check below is a live-world step
or a script-macro call reading the returned object.

1. **`scripts/api-inventory.js` skeleton plus resolution and validation.** UUID resolution via `fromUuid`,
   same-actor rejection, type whitelist, container-contents rejection, quantity validation. No mutation
   yet. Verify: macro calls covering each rejection code against a linked actor and an unlinked token
   actor; every call returns `ok: false` with the expected `code` and no document changes.
2. **`grantItem` - the create-on-actor path.** Resolve `itemUuid` or accept `itemData`, clone, strip `_id`,
   apply dnd5e's reset set, create on the target. This is the shared core `transferItem` builds on, and it
   is what three of the four consumers actually call, so it lands first. Verify: grant a compendium item, a
   world item, and a constructed `itemData` object to an actor; confirm each arrives unequipped and
   unattuned with the requested quantity, and that an unresolvable `itemUuid` returns `ITEM_NOT_FOUND`
   without mutating anything.
3. **`transferItem` on top of it.** Validate the source, grant on the target, reduce or delete the source.
   Verify: transfer a full non-stackable item, a partial stack, and an exact-full stack between two linked
   actors; confirm the source is decremented or gone as expected and the target matches item 2's result.
4. **Quantity-aware rollback and the failure results.** Two cases, and the second is the one that destroys
   property if it is wrong. Verify (created): force a source-update failure - revoke ownership, or point the
   source at a deleted item mid-call from a macro - on a transfer that created a new row, and confirm the row
   is deleted. Verify (merged): **give the recipient an existing stack of 20, transfer 3 into it so it
   merges, then force the source reduction to throw, and assert the recipient holds exactly 20 - not 23, and
   not zero.** Deleting `targetItemId` here would destroy 20 items that were never part of the transfer, and
   it fails looking like successful cleanup. Confirm `ROLLBACK_FAILED` returns `targetItemId`, `merged`, the
   granted quantity, and the observed target and source quantities.
5. **The mutex, including the re-entrancy trap.** Verify: two clients issue overlapping transfers from one
   corpse; total quantity removed equals total quantity received, with no duplication and no over-draw. Then
   verify a single ordinary transfer completes at all - if `transferItem` calls the public `grantItem` rather
   than the unlocked core, it self-deadlocks on the target lock and hangs with no error, so a plain transfer
   never returning is the symptom. Two clients swapping items simultaneously (A to B and B to A) must both
   complete, which is what the sorted lock ordering exists for. And hold a lock artificially past the timeout
   to confirm `LOCK_TIMEOUT` comes back with the contended actor UUID and the wait duration rather than
   hanging or surfacing as a generic failure.
6. **`stack: 'merge'` and the eligibility gate.** Verify each row of the eligibility table with a live pair,
   since this is the item most likely to be wrong in a way no error reveals. Merges: two compendium
   daggers; two Artificer components with identical flags and no `compendiumSource` on either; a compendium-
   granted item against an otherwise-identical one that lacks `compendiumSource`, which must merge since
   provenance is not identity. Does not merge: differing `artificerQuirk`; an enchanted copy against a plain
   one; a wand with `uses.spent > 0`; an unidentified item; an item inside a container against one outside;
   a hand-edited description. Every negative case must still complete with `ok: true` and `merged: false`,
   never an error. Confirm `'separate'` always creates a row, and that comparison runs on `_source` - two
   identical torches with different derived `uses.value` must still merge.
7. **`transferCurrency`.** Verify: move a mixed purse; confirm deltas applied to both actors, that an
   over-draw returns `INSUFFICIENT_CURRENCY` with nothing changed, and that no denomination conversion
   occurs.
8. **Register on the api object** at `blacksmith.js:996`. Verify:
   `game.modules.get('coffee-pub-blacksmith').api.inventory` is defined in a fresh world with no console
   errors.
9. **Docs.** New `api/api-inventory.md` and `architecture/architecture-inventory.md`; add both to the
   `PUBLISH` list in `tools/wiki-sync.mjs` (a doc not on that list never reaches the wiki, and inbound
   satellite links to it 404). Note the coupling in `plans/migration-v14.md`.
10. **CHANGELOG.** `13.15.3` is closed by BUILD commit `408601da`, so this opens a fresh `## [Unreleased]`
   heading above it.

Retiring the duplicated call sites in Squire and Curator is cross-module work and belongs in
`TODO-GLOBAL.md`, tracked per module, after the API ships.
