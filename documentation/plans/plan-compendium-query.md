# Plan: the filtered compendium query

**Status: Planned.** Nothing in this document is implemented.

Implements the decision recorded in `../TODO-GLOBAL.md` under "Blacksmith owns the filtered compendium
query", raised by Merchant 2026-08-23. That entry holds the reasoning for taking the work; this file holds
the contract shapes and the design decisions. The work items live in `../TODO.md`.

Per the plans rule: when it is built, distribute it -- surface to `../api/api-compendiums.md`, design to
`../architecture/architecture-compendiums.md`, history to `CHANGELOG.md` -- and delete this file.

---

## The shape of the problem

`search()` answers "text in, candidates out". Merchant needs "shape in, candidates out": every item in the
GM's configured sources whose subtype, rarity and price fall in a range, with no text to match on. A shop
stocked from a query cannot dangle the way one stocked from a roll table does, and it picks up newly
installed content instead of freezing at whatever someone typed last year.

Three things stand between the current code and that.

**The index does not carry the fields.** `pack.getIndex()` returns `name`, `type`, `img`, `uuid`. dnd5e
5.3.3 adds only `system.container` and `system.identifier` (`dnd5e.mjs:82397`). Neither `system.rarity` nor
`system.price` is indexed by default, and loading documents to read them is slow enough across an SRD-sized
pack that a GM notices.

**Our cache is a lossy projection.** `_getPackIndex` (`manager-compendiums.js:661`) maps every entry down to
`{name, type, img, uuid}` and discards the rest, so widening what Foundry indexes changes nothing until the
projection widens with it.

**`limit` stops the scan.** `searchDetailed` breaks out of both loops when the cap fills, which truncates the
tail of the GM's priority order. That is right for a type-ahead picker, where the head of the order is the
best answer, and wrong for a shop -- `limit: 200` would stock every shop out of the first configured pack
and never open the sixth.

---

## Decision: one engine, two entry points

`query()` is not a second scanner. It is the same scan with the needle made optional, so the source-order
union, the per-type plans, the uuid dedup, the world-vs-pack entry split and the source labelling are shared
rather than forked. Two independent scanners over the same caches is how the two drift.

The engine takes two explicit modes where the callers genuinely differ:

| | `search()` | `query()` |
|---|---|---|
| Needle | required, `minLength` applies | absent |
| Ordering | source, then match tier, then name | source, then name |
| `limit` | stops the scan | caps the output after a full scan |
| `matchType` on a row | the tier that hit | `null` |
| Economics fields | populated only when a rarity or price filter is present | always populated |

`limit` semantics are a mode flag on the engine, not an inference from whether a needle was supplied. A
caller reading the code must be able to see which it gets.

**Rows keep one shape across both.** `query()` returns the `search()` row plus `rarity`, `priceGp` and the
raw `price`, and `search()` returns those three too -- `null` when the index was not extended. A consumer
moving between the two never remaps, and a key never appears and disappears depending on which call made it.

**The filters apply to both.** The window needs a rarity facet that works while text is also being typed, so
the filters belong on the engine rather than on `query()` alone. `query()` is then exactly "the engine with
no needle", which is what makes one engine honest rather than a wrapper pretending to be one.

---

## Decision: the projection only ever widens

`getIndex({fields})` (`client/documents/collections/compendium-collection.mjs:332`) unions the requested
fields with the already-indexed set and returns the cache only when the request is a subset; otherwise it
re-fetches the whole index from the server and merges. So field sets must be **declared and fixed**, never
free-form per call -- each distinct superset costs one more full re-fetch of every pack, for the session.

One module-level constant holds the set. `_getPackIndex` gains an `extended` flag rather than a field list,
so there are exactly two states a pack's cache can be in:

- A base request is satisfied by either state. The extended rows are a superset.
- An extended request against a base entry discards it and re-fetches.
- An extended entry is never downgraded.

The cache entry therefore carries which state it holds, and the rule is monotonic in one direction. The cost
is one extra index fetch per configured pack, once per session, on the first query that needs economics --
worth stating in the API doc's performance section rather than leaving a GM to wonder what the pause was.

`_getWorldEntries` reads live documents and so has the fields already; it populates them directly and never
consults the flag.

---

## Decision: the dnd5e economics live here, and are exposed

Three facts about dnd5e item economics are things a consumer cannot verify and would each get wrong once.
They are handled in the hub and surfaced as helpers, because Merchant is not the only module that will want
them.

**Rarity is blank for mundane gear.** `system.rarity` is `StringField({required: true, blank: true})`
(`dnd5e.mjs:14077`). Non-magical equipment carries `""`, not `"common"`. A shop stocking basic gear and
asking for common plus uncommon gets *only magic items*, silently, with a plausible-looking result set. The
filter vocabulary therefore adds an explicit `mundane` token for `""`, and normalisation accepts
`very rare` / `veryrare` / `Very Rare` for `veryRare`, since a caller will type the label rather than the key.

**Price has a denomination.** dnd5e stores `{value, denomination}` with gp as the pivot -- `DND5E.currencies`
gives cp 100, sp 10, ep 2, gp 1, pp 0.1 -- so 50 sp is 5 gp and a raw compare against `system.price.value` is
wrong for anything not priced in gp. The hub converts, and the parameter is `priceGp`, never "base units".
An unknown denomination yields `null` rather than being silently treated as gp.

**Unpriced and free are the same stored value.** `price.value` has `initial: 0`, so a filter with a zero
floor sweeps in every unpriced entry in the pack -- which is how a shop ends up full of nothing. The option
is named `includeUnpriced` and defaults to `false` whenever a price filter is present, and the doc says
plainly that the two cannot be distinguished.

**Rarity and price exist only on the physical item types.** An entry that does not carry the field fails a
filter on it rather than passing unfiltered, so combining a price range with a non-physical type returns
nothing. That is the least surprising reading and the only one that cannot quietly over-return.

---

## Contract

```js
const rows = await blacksmith.compendiums.query({
    type: 'Item',                        // one token or an array, same as search()
    subtypes: ['weapon', 'equipment'],   // document subtypes; omit for any
    rarity: ['mundane', 'common'],       // normalised tokens; omit for any
    priceGp: { min: 1, max: 500 },       // either end omittable
    includeUnpriced: false,              // default false when priceGp is present
    sources: null,                       // default: the GM's configured search set
    limit: 200                           // caps output; the scan is always complete
});
```

Rows carry the `search()` shape plus `rarity`, `priceGp`, `price` and `matchType: null`.
`queryDetailed()` mirrors `searchDetailed()`, adding `truncated` / `searchOrder` / `scannedSources` /
`skippedSources` -- `scannedSources` covers every source in query mode, which is the observable difference
from search and the thing the harness asserts.

Helpers exposed beside it: `normalizeRarity(token)` and `toGp(price)`.

---

## Consumer zero

`window-compendium-search.js` takes the facets, and this is not a token adoption -- it changes what the
window can do. The palette currently refuses to run below two characters of text (`MIN_QUERY_LENGTH`), so
there is no way to browse. With a rarity or price facet set, an empty query box becomes a valid browse and
the window switches from `searchDetailed` to `queryDetailed`. That exercises the whole path -- widened
projection, full scan, cap-after, economics conversion -- against real installed packs before Merchant
depends on any of it.

The facets follow the rule `_availableSubtypes` already establishes: offered only when the current type is
Item-backed and hidden in All mode, where pooling rarities across document classes would mean nothing. Rows
gain rarity and price badges when the fields are populated. The stored preference set gains both.

---

## Order of work

Each step is verifiable on its own; none of them leaves the module in a state where `search()` or `resolve()`
behave differently than they do now.

1. **Extend the index projection.** `_getPackIndex` gains the flag and the two-state cache; the declared
   field set becomes a constant. Nothing calls it with the flag yet. Verified by the existing suite passing
   unchanged.
2. **Extract the scan.** Pull the plan builder and the source loop out of `searchDetailed` into the shared
   engine with the two mode flags; `searchDetailed` becomes its needle-mode caller. Verified by the existing
   57 assertions passing untouched -- this step is a refactor with no behaviour change, and the suite is what
   says so.
3. **Economics helpers.** Rarity normalisation and gp conversion, with their own assertions.
4. **`query()` / `queryDetailed()`** on the manager, then the API delegates and JSDoc.
5. **Harness assertions**, including the two that separate query from search: a full scan under a low limit,
   and a strict rarity filter that `mundane` matches and `common` does not.
6. **Consumer zero** -- the window facets, the browse mode, the badges, the CSS, the preferences.
7. **Docs** -- the API section, and `architecture-compendiums.md`, which does not exist yet and should: the
   manager is 1159 lines holding a resolver, a search engine, an index cache and now a query engine, and
   everything a reader would need about it currently has to be recovered from the source.

---

## What this plan does not cover

Anything that would make the query a *stocking* tool rather than a filter -- weighting, sampling, quantity,
gold budgets, shop themes. That is what a shop is for, and it encodes what Merchant is for. The hub returns
the candidate set; Merchant decides what to do with it.
