# Plan: api.inventory - authoritative inventory mutation primitives

**Status: Planned.** Written 2026-08-07. Nothing implemented.

This plan is scaffolding. When it is implemented its content is distributed - the public surface to a new
`api/api-inventory.md`, the mechanism and the dnd5e coupling to `architecture/architecture-inventory.md`,
the work items to `TODO.md`, history to `CHANGELOG.md` - and this file is deleted.

The work breakdown in the last section is the only record of this work until implementation starts. Lift it
into `TODO.md` at that point; it must not live here once the work is real.

## What this is, and what it is not

Blacksmith gains two mechanical primitives that move items and coins between Actors safely:
`transferItem` and `transferCurrency`. They resolve fresh documents, validate, mutate, and return a
structured result. They own no workflow.

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

The item-move mechanic is written out six times in Squire, three of them near-verbatim copies of the same
`_completeItemTransfer` body: `transfer-utils.js:311`, `panel-party.js:658`, `squire.js:1513`, plus
`manager-panel.js:1647` and two drop-handler creates at `panel-party.js:345` and `panel-party.js:392`.
Curator has begun a seventh at `loot-utilities.js:74` and an eighth (currency) at `loot-utilities.js:112`.

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

**3. Unlinked token actors cannot be resolved.** `squire.js:1460` uses `game.actors.get(id)`. A corpse is
an unlinked token, so its actor UUID is `Scene.x.Token.y.Actor.z` and `game.actors.get` returns undefined.
UUID resolution is a capability gain, not just hygiene.

**4. Only the GM socket path validates quantity.** `squire.js:1489` checks requested against available;
the two direct-permission paths do not re-check at mutation time, so a stale client-side quantity creates
the full requested amount on the target and deletes the source stack.

## Surface

Lives in `scripts/api-inventory.js`, exports `InventoryAPI`, registered as `inventory`. The `api-` prefix
is correct and `manager-` is not: there is no subsystem state beyond the mutex and no lifecycle.

```js
await blacksmith.inventory.transferItem({
    sourceActorUuid,
    targetActorUuid,
    itemId,
    quantity,                 // omitted for items with no system.quantity
    stack: 'separate',        // or 'merge'
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

Error codes: `SOURCE_ACTOR_NOT_FOUND`, `TARGET_ACTOR_NOT_FOUND`, `SOURCE_ITEM_NOT_FOUND`, `SAME_ACTOR`,
`INVALID_QUANTITY`, `INSUFFICIENT_QUANTITY`, `INSUFFICIENT_CURRENCY`, `ITEM_NOT_TRANSFERABLE`,
`CONTAINER_HAS_CONTENTS`, `TARGET_CREATE_FAILED`, `SOURCE_UPDATE_FAILED`, `ROLLBACK_FAILED`.

## Design decisions, with the reason attached

**Derive stackability from the item; never accept it as a parameter.** Squire threads a caller-supplied
`hasQuantity` boolean through every call site, and that flag decides delete-the-whole-item versus
decrement. A wrong value from a caller destroys a stack. The API reads `system.quantity` off the resolved
document and ignores any caller claim about it.

**The mutex keys on source Actor UUID, not source Item.** An item-level lock does not cover Take All
against one corpse from two clients, and it does not cover currency at all, which has no item.
`transferCurrency` takes the same lock, so a coin grab and an item grab on one corpse cannot interleave.

**Create on the target first, then reduce the source.** The opposite order fails toward a vanished item;
this order fails toward a visible duplicate, which is recoverable. Rollback is therefore "delete the item
just created on the target." `SOURCE_UPDATE_FAILED` and `ROLLBACK_FAILED` both carry `targetItemId` and
the observed source quantity, because a GM cleaning up needs exactly those two facts.

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

**Stacking is an option, defaulting to current behavior.** Every existing copy always creates a new item,
so looting 3 arrows while holding 20 yields a second row. Whether to merge is policy, not mechanics:
`stack: 'separate'` (default, matches today) or `'merge'`. `merged` is on the success result because
without it `targetItemId` is ambiguous about whether anything was created.

**Merge eligibility is gated on item state, not item type.** dnd5e's own rule stacks consumables only
(`dnd5e.mjs:55349-55357`), which is a proxy for "types unlikely to carry per-item state" and is the reason
two identical daggers do not stack on a sheet. Checking the state directly is strictly better and lets them.
Merge only when every one of these holds; if any fails, create a separate row and return `merged: false`.
Never fail the transfer over a merge check - the player still gets the item.

| Condition | Why |
|---|---|
| Same `name` and same `type`, both within the physical whitelist | The baseline identity claim, and all that Artificer's own merge uses today (`utility-artificer-item.js:169-186`). Weak on its own, which is what the rest of this table is for. |
| `_stats.compendiumSource` equal **when both have one**; a one-sided source blocks the merge | Strengthens identity where it exists without requiring it. Requiring it outright is wrong - see the note below. Legacy fallback `flags.dnd5e.sourceId`, as dnd5e does at `dnd5e.mjs:16714`. |
| Deep-equal `flags`, excluding the transient list | Turns the flag-divergence risk into correct behavior instead of silent loss - see the note below. |
| Same `system.container` (both null, or the same id) | Otherwise quantity teleports into or out of a bag. dnd5e checks this at `dnd5e.mjs:55353`. |
| Both carry a numeric `system.quantity` | Nothing to add otherwise. |
| Neither has applied enchantments (`item.appliedEnchantments`, `dnd5e.mjs:19346`) | The case that justifies dnd5e's caution: a +1 dagger and a plain dagger share name *and* `compendiumSource`, so source equality does not catch it. Merging destroys an enchantment or grants one free. |
| `system.uses.spent === 0` on both, or neither has `uses.max` | `uses` persists `spent` (`dnd5e.mjs:4331`, derived at `:4357`). Merging a wand at 3 of 7 into one at 7 of 7 loses the charge state. |
| `system.identified !== false` on both | `identified` exists on identifiable types (`dnd5e.mjs:5188`, `:10157`). Two unidentified items look identical to a player by design; merging destroys the distinction the mechanic exists to create. |

Equipped and attuned state is not a merge hazard: the transfer already strips it via the reset set
(`dnd5e.mjs:55332`). Nor are the actor's favorites, which reference item ids - merging creates no new id,
so it is safer there than a separate row.

**Why `compendiumSource` is not required.** dnd5e bails out of stacking entirely when there is no source id
(`dnd5e.mjs:55350-55351`), and copying that rule looks safe but breaks the suite's most stack-worthy items.
Foundry only sets `_stats.compendiumSource` on a proper import; Artificer creates actor items with
`item.toObject()` into `createEmbeddedDocuments` and never calls `fromCompendium`
(`manager-gather.js:289-293`), so its components carry no source id at all. Requiring one would give a
player twelve rows for twelve gathered mushrooms. The rule is tuned for compendium-dragged items and fails
for programmatically created ones, which is most of what the suite makes. Compare it when both sides have
it; never demand it.

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
2. **The item mutation path.** Clone, strip `_id`, apply dnd5e's reset set, create on target, reduce or
   delete source. Verify: transfer a full non-stackable item, a partial stack, and an exact-full stack
   between two linked actors; confirm on the target that the item arrives unequipped and unattuned, and
   that the source is decremented or gone as expected.
3. **Rollback and the failure results.** Verify: force a source-update failure (revoke ownership, or point
   the source at a deleted item mid-call from a macro) and confirm the created target item is removed, or
   that `ROLLBACK_FAILED` returns `targetItemId` and the observed quantity.
4. **The source-actor mutex.** Verify: two clients issue overlapping transfers from one corpse; total
   quantity removed equals total quantity received, with no duplication and no over-draw.
5. **`stack: 'merge'` and the eligibility gate.** Verify each row of the eligibility table with a live pair,
   since this is the item most likely to be wrong in a way no error reveals. Merges: two compendium
   daggers; two Artificer components with identical flags and no `compendiumSource` on either. Does not
   merge: differing `artificerQuirk`; an enchanted copy against a plain one; a wand with `uses.spent > 0`;
   an unidentified item; an item inside a container against one outside; one side carrying a
   `compendiumSource` the other lacks. Every negative case must still complete the transfer with `ok: true`
   and `merged: false`, never an error. Confirm `'separate'` always creates a row.
6. **`transferCurrency`.** Verify: move a mixed purse; confirm deltas applied to both actors, that an
   over-draw returns `INSUFFICIENT_CURRENCY` with nothing changed, and that no denomination conversion
   occurs.
7. **Register on the api object** at `blacksmith.js:996`. Verify:
   `game.modules.get('coffee-pub-blacksmith').api.inventory` is defined in a fresh world with no console
   errors.
8. **Docs.** New `api/api-inventory.md` and `architecture/architecture-inventory.md`; add both to the
   `PUBLISH` list in `tools/wiki-sync.mjs` (a doc not on that list never reaches the wiki, and inbound
   satellite links to it 404). Note the coupling in `plans/migration-v14.md`.
9. **CHANGELOG.** `13.15.3` is closed by BUILD commit `408601da`, so this opens a fresh `## [Unreleased]`
   heading above it.

Retiring the duplicated call sites in Squire and Curator is cross-module work and belongs in
`TODO-GLOBAL.md`, tracked per module, after the API ships.
