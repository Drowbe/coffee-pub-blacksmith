# Compendiums Architecture

**Audience:** us, and any Coffee Pub module maintainer who needs to change how compendium lookup works.

Scope: how `manager-compendiums.js` turns the GM's mapping into answers — one winner, many candidates, or a filtered set — and which parts of it must not be simplified.

The public surface is specified in `api/api-compendiums.md`. Implementation is `scripts/manager-compendiums.js` and the thin delegating layer `scripts/api-compendiums.js`.


## Three questions, one set of caches

The manager answers three different questions over the same configured sources and the same cached indexes.

| Question | Entry point | Shape of the answer |
|---|---|---|
| "What is this thing?" | `resolve()` | one best match, tier-first across all sources |
| "What matches this text?" | `search()` | many candidates, grouped by source |
| "What matches this shape?" | `query()` | many candidates, no text involved |

They are one implementation on purpose. A second scanner over the same caches is how two answers to the same question start disagreeing, and it has already happened once in this repo's history with a consumer-side index cache.

`resolve()` keeps its own path because picking a single winner is genuinely different work — it exhausts a match tier across every source before dropping to the next tier, which is the opposite traversal from the other two. `search()` and `query()` share `_scan()`.


## The scan has two modes, and both are explicit

`_scan()` takes `needle` and `stopAtLimit` as separate flags rather than inferring one from the other. The two callers differ in exactly those two ways:

- **`needle` present or absent.** Present, entries are classified into match tiers and emitted tier by tier within each source. Absent, there is one bucket per source, sorted by name, and `matchType` on every row is `null`.
- **`stopAtLimit`.** True, the cap ends the scan. False, every source is opened and the cap applies to the output afterwards.

The mode test is `needle !== null`, not truthiness. An empty-string needle with `{minLength: 0}` is still text mode — a caller asking for "everything, tiered" — and treating it as no-needle mode would silently retier every row.

**The `limit` difference is the load-bearing one.** `search()` stops the scan because for a typed query the head of the GM's priority order is the best answer, and indexing the tail to throw it away is wasted work. That reasoning does not transfer to a query: a stop-scan cap would draw every result from the first configured pack and never open the sixth, so anything stocking from it would silently contain only that pack's contents and look exactly the same as a correct result.

This is why `scannedSources` exists on both reports. It is the only field that distinguishes "that pack had no matches" from "that pack was never opened", and it is why `searchDetailed()`/`queryDetailed()` are separate entry points rather than an option.


## The index projection only ever widens

`_getPackIndex(packId, {extended})` caches a **projection** of Foundry's index, not the index itself — `{name, type, img, uuid, rarity, price}`. Two facts drive its design.

**Foundry's index is cumulative and re-fetches on every widening.** `getIndex({fields})` unions the requested fields with what the pack has already indexed and returns the cache only when the request is a subset (`client/documents/collections/compendium-collection.mjs:332`). Anything wider re-fetches the entire index from the server and merges. So every distinct field set in play costs one more full re-fetch of every pack, for the session.

**Therefore the extra fields are a fixed constant, not a parameter.** `EXTENDED_INDEX_FIELDS` holds them and `extended` is a boolean. A caller cannot nominate its own set, because doing so would trade one widening for N. This is also the reason the filtered query belongs in the hub at all rather than in each consumer that wants a rarity.

The cache entry records which projection it holds, and the transition runs one way:

- A base request is satisfied by **either** state, because the extended rows are a superset. Asking for economics once does not make every later caller pay.
- An extended request against a base entry discards it and re-fetches.
- An extended entry is never downgraded. Nothing gains from narrowing it, and a cache that flipped back and forth would re-fetch on alternating callers.

`_getWorldEntries` has no such flag and should not grow one. A live document already carries every field, so the economics come free and there is no second state to model.

**Absent is not blank, and the projection preserves the difference.** `e.system?.rarity ?? null` yields `""` for a physical item nobody marked magical and `null` for a document type with no rarity field at all. `??` catches only null and undefined, so the empty string survives. That distinction is what stops a rarity filter from matching every spell in the world, and flattening it — with `||`, or with a default — would break the filter silently rather than loudly.


## Filters fail closed

`_buildEconomicsFilter` returns a predicate or null. An entry missing the filtered field **fails** the filter rather than passing unfiltered, so a price range combined with a non-physical type returns nothing.

The alternative reading — ignore a filter where it does not apply — can only ever over-return, and over-returning silently is worse than an empty result a caller can see. The same principle governs `toGp()` returning `null` for an unknown denomination instead of assuming gold: a module adding its own currency would otherwise have every price misread by a factor nobody can observe.


## The dnd5e economics traps

Three facts that a consumer cannot verify from outside, each a silent wrong answer rather than an error. They live here so that no sibling rediscovers them.

**Rarity is blank for mundane gear.** `system.rarity` is `StringField({required: true, blank: true})` (`dnd5e.mjs:14077`, verified against 5.3.3). A plain longsword stores `""`, not `"common"`. Filtering for common and uncommon returns magic items only, with a result set that looks entirely plausible. `RARITY_MUNDANE` is the explicit token for it; it is not a dnd5e key and is not meant to be.

**Price carries a denomination.** `DND5E.currencies` gives gold the pivot conversion of 1, with cp 100, sp 10, ep 2 and pp 0.1, so 50 sp is 5 gp. Comparing raw `system.price.value` across items is wrong for anything not priced in gold. `toGp()` divides by the conversion; getting the direction backwards is the easy mistake and is why this is a named helper rather than an inline expression.

**Unpriced and free are indistinguishable.** `price.value` has `initial: 0`, so both are stored as 0 and nothing can tell them apart. `includeUnpriced` defaults to false whenever a price filter is present, because a range with a zero floor otherwise returns every unpriced entry in the pack.

These citations name a dnd5e version because a `dnd5e.mjs:NNNN` pointer is only true of one release. When `tools/check-dnd5e-citations.mjs` fires, re-verify the claim and not just the location.


## What consumers must not do

`search()` and `query()` exist so a consumer never builds a second index cache. One that calls `getSelected()` and indexes the packs directly gets its own invalidation, which drifts from this one after any compendium edit — and, if it reads rarity or price, widens the underlying Foundry index a second time at the cost of another full re-fetch per pack.

The reference consumer is `window-compendium-search.js`, which uses both modes: `searchDetailed()` when there is text, and `queryDetailed()` when a facet is set and the box is empty. That second path is the reason the window can browse at all — below its minimum query length it previously refused.
