# Compendiums API

Blacksmith owns the **Compendium Mapping** the GM configures (which compendiums to use for monsters, items, spells, features, species/races, backgrounds, classes, subclasses, journals, roll tables, and in what priority order), and exposes that mapping, a name-to-UUID resolver built on top of it, and a multi-result search over the same indexes for browsable pickers.

The enabled-source checkboxes independently define which installed Foundry packages may appear in mappings. **Auto-map Compendiums on Next Load** is a one-shot initializer: on the next active-GM load it replaces the ordinary priority settings from those enabled sources, clears itself, and leaves a fully manual configuration. `getMapping()`, `getSelected()`, `getSearchOrder()`, and all resolver methods always report and use that saved configuration; there is no separate automatic runtime mapping.

`numCompendiums` in `getMapping()` is the effective number of compatible priority slots, derived from the enabled sources. The historical `numCompendiums*` world settings are hidden compatibility storage and must not be used to determine the current selector count.

**If your module turns plain text into a link or a document, use this API.** Do not read `monsterCompendium1` / `numCompendiumsActor` yourself, and do not hand-build `@UUID[...]` strings. The setting keys carry backward-compat quirks (`Actor` maps to `monster`, `Feature` maps to `features`), the search order has world-first/world-last rules, and the matching is tiered. All of that is handled here.

## Access

```js
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const compendiums = api?.compendiums;
```

Or via the bridge (waits for readiness):

```js
const compendiums = await BlacksmithAPI.getCompendiums();
```

Or the global, after Blacksmith is ready:

```js
window.BlacksmithCompendiums
```

## The main thing: text in, UUID out

```js
const result = await compendiums.resolve('Goblin', 'actor');
// {
//   found: true,
//   uuid: 'Compendium.dnd5e.monsters.Actor.xyz789',
//   name: 'Goblin',              // what you asked for (count stripped)
//   matchedName: 'Goblin',       // what actually matched
//   packId: 'dnd5e.monsters',    // null if matched in the world
//   source: 'dnd5e.monsters',    // 'world' or a pack id
//   matchType: 'exact',          // 'exact' | 'startsWith' | 'includes'
//   confidence: 'high',          // 'high' | 'medium' | 'low'
//   documentClass: 'Actor',
//   count: null,
//   link: '@UUID[Compendium.dnd5e.monsters.Actor.xyz789]{Goblin}'
// }
```

If you just want the link:

```js
const link = await compendiums.resolveLink('Goblin', 'actor');
// "@UUID[Compendium.dnd5e.monsters.Actor.xyz789]{Goblin}"
// -> falls back to the plain name "Goblin" when nothing matches
```

If you want the actual document:

```js
const actor = await compendiums.resolveDocument('Goblin', 'actor');
```

## Matching rules

Matching is **exact-first across every configured source**, then progressively looser. Tiers:

| Tier | Rule | Confidence | Default |
|---|---|---|---|
| `exact` | Case-insensitive full name equality | `high` | always on |
| `startsWith` | Candidate name begins with your query | `medium` | on |
| `includes` | Candidate name contains your query | `low` | **off** — pass `{fuzzy: true}` |

The critical property: **a tier is exhausted across all sources before the next tier is tried anywhere.** If Priority 1 has "Goblin Boss" and Priority 3 has "Goblin", then `resolve('Goblin')` returns the Priority 3 *exact* match, not the Priority 1 prefix match. Priority breaks ties *within* a tier, it does not override match quality.

Check `matchType` / `confidence` if you want to flag uncertain links to the user rather than silently accepting them.

### Options

```js
await compendiums.resolve(name, type, {
  exact: false,       // true = only accept exact matches
  fuzzy: false,       // true = also allow the loose 'includes' tier
  itemType: null,     // prefer this document subtype, e.g. 'weapon'
  parseCount: false,  // strip a trailing "(3)" and report it as `count`
  sources: null       // optional configured-source subset, e.g. ['world', 'dnd5e.monsters']
});
```

`parseCount` handles the annotated names common in encounter text:

```js
await compendiums.resolve('Goblin (3)', 'actor', { parseCount: true });
// { name: 'Goblin', count: 3, link: '@UUID[...]{Goblin} x 3', ... }

await compendiums.resolve('Goblin (CR 1/4)', 'actor', { parseCount: true });
// { name: 'Goblin', count: null, ... }   <- CR is not a count
```

### Batches

`resolveMany` loads each pack index once for the whole batch. Use it instead of looping `resolve` — it is materially faster over a list.

```js
const results = await compendiums.resolveMany(
  ['Goblin', 'Orc', 'Beholder'],
  'actor'
);
// One result per input, in order. Check `.found` on each.

const missing = results.filter(r => !r.found).map(r => r.name);
```

Entries may also be objects, where `type` narrows the document subtype:

```js
await compendiums.resolveMany(
  [{ name: 'Longsword', type: 'weapon' }, { name: 'Shield', type: 'equipment' }],
  'item'
);
```

## Browsing: text in, candidates out

`resolve()` answers "what is this thing?" — one name in, one best match out. `search()` answers the other question — "what matches this text?" — one query in, many candidates out, for an incremental search-as-you-type picker.

```js
const results = await compendiums.search('long', 'Item', { itemType: 'weapon', limit: 40 });
// [
//   {
//     uuid: 'Compendium.dnd5e.items.Item.abc123',
//     name: 'Longbow',
//     type: 'weapon',                        // document SUBTYPE
//     documentClass: 'Item',                 // document CLASS — the drag payload wants this
//     img: 'icons/weapons/bows/longbow.webp',
//     source: 'dnd5e.items',                 // 'world' or a pack id
//     sourceLabel: 'Items (SRD)',            // the pack's own name
//     sourcePackage: 'DnD5e System',         // the module, system, or world it came from
//     matchType: 'startsWith'                // 'exact' | 'startsWith' | 'includes'
//   },
//   ...
// ]
```

Group by `source`, render `name` + `img`, add via `uuid`. Nothing else is needed to build a picker.

### Searching several types at once

`type` accepts an array. Pass the types you want, or `getTypes()` for everything mapped:

```js
await compendiums.search('long', ['Item', 'Spell', 'Feature'], { limit: 40 });
await compendiums.search('long', compendiums.getTypes(), { limit: 40 });
```

**Prefer this over calling `search()` once per type.** The scan is source-major — each compendium is opened once and every requested type reads from it — which buys three things a caller-side fan-out does not get:

- **Results stay grouped by compendium.** N separate calls return N lists that each group by source independently; merging them re-interleaves the packs, which is the thing the ordering was designed to prevent.
- **Deduplication by uuid.** This is a correctness issue, not a tidiness one. Synthetic types share packs with `Item`: a pack mapped to both `Item` and `Spell` returns its spells through *both*, because the Item pass is unfiltered and the Spell pass is subtype-filtered over the same entries. A merge of per-type lists double-lists every one of them. Here the first type to reach an entry wins and the rest are dropped.
- **One budget.** `limit` is the total. Three calls with `limit: 40` can return 120 rows, and each reports truncation against its own slice — numbers no consumer can reconcile into one honest statement.

Duplicate and aliased tokens collapse (`['Item', 'item']` is one type). An empty array returns no results. `searchOrder` in a `searchDetailed()` report is the union of the per-type orders, in the order the types were given, first appearance winning.

### `type` is the subtype; `documentClass` is the class

`type` is the document subtype (`weapon`, `spell`, `npc`) and `documentClass` is the Foundry document class (`Item`, `Actor`, `JournalEntry`). Both are on every result because both are needed and they answer different questions: a row badge wants the subtype, a drag payload wants the class.

Synthetic types make the distinction load-bearing — a `Spell` result has `documentClass: 'Item'` and `type: 'spell'`, because spells live in Item packs. Deriving the class from the type token you searched works but is a way to get a drop payload subtly wrong, especially when results from several `search()` calls are merged into one list.

```js
// Drag-to-sheet: Foundry's native payload, no derivation needed.
event.dataTransfer.setData('text/plain', JSON.stringify({
  type: result.documentClass,   // 'Item'
  uuid: result.uuid
}));
```

Every core `_onDrop*` handler reads that through `TextEditor.getDragEventData`, so an Item lands on a character sheet and an Actor lands on the canvas as a token, with no cooperation from the drop target.

### Knowing whether the scan was cut short

`limit` stops the scan, so the array alone cannot distinguish "that pack had no matches" from "that pack was never opened". `searchDetailed()` returns the same results plus what the scan covered:

```js
const { results, truncated, searchOrder, scannedSources, skippedSources } =
  await compendiums.searchDetailed('a', 'Item', { limit: 40 });

if (truncated) {
  showHint(`${skippedSources.length} more compendiums not searched — narrow the query`);
}
```

| Field | Meaning |
|---|---|
| `results` | Exactly what `search()` returns |
| `truncated` | The cap stopped the scan while candidates remained |
| `searchOrder` | Every source that would have been searched, in priority order |
| `scannedSources` | The ones actually opened and examined |
| `skippedSources` | The tail never reached, in priority order |

Do not infer truncation from `results.length === limit`. That over-reports: a scan that fills the cap exactly with the last available candidate is complete, not truncated. `truncated` is set only when a further candidate existed and could not be emitted, or when a source was left unopened.

Every field is scoped to **one call**. If you need several types, pass them as an array in one call and the report covers all of them coherently — that is the reason the array form exists.

If you still fan out yourself, combining the reports is your decision and the API cannot make it for you: union the `skippedSources` and count distinct entries if the claim is "some content in that pack went unsearched"; intersect them if the claim is "that pack was not searched at all". The two give different numbers, and neither is the sum of the per-call counts. A `truncated` in any call means the combined view is incomplete.

`search()` is `searchDetailed().results` — use whichever fits; there is no extra cost to either.

### Source identity is three discrete fields

`source` is the id, `sourceLabel` is the pack's own name, and `sourcePackage` is the module, system, or world that ships it. They arrive separate so a consumer can lay them out — a heading with a quiet subtitle, two columns, one and not the other — rather than parsing a composed string apart.

`sourceLabel` alone is ambiguous by design: several packages ship a pack called "Equipment", so a picker that groups by `source` should show `sourcePackage` alongside. For a world hit, `sourceLabel` is `'World'` and `sourcePackage` is the world's title.

**Do not use `getChoices()` for this.** Those labels are built for a settings dropdown and glue three facts into one line — `"Dungeons & Dragons Player's Handbook: Equipment — 42 Weapons, 59 Equipment, 55 Consumables, ..."`. Correct in a `<select>`, unusable as a heading. If you do want the composed `"Package: Pack"` form, `formatPackLabel(pack)` in `compendium-types.js:239` is it, and `getPackPackageLabel(pack)` is the package half on its own.

### Options

```js
await compendiums.search(query, type, {
  itemType: null,   // restrict to a document subtype, e.g. 'weapon'
  limit: 50,        // cap total results
  sources: null,    // configured-source subset, as in resolve()
  minLength: 2,     // shorter queries return [] without scanning
  fuzzy: true       // include the loose 'includes' tier
});
```

### How search() differs from resolve()

These three differences are deliberate, not oversights.

| | `resolve()` | `search()` |
|---|---|---|
| Ordering | Tier first, then source — an exact hit in Priority 3 beats a prefix hit in Priority 1 | Source first, then tier — sources in configured priority order, tier-sorted within each, alphabetical within a tier |
| `fuzzy` | `false` | `true` |
| `itemType` | Prefers the subtype, falls back to the unfiltered set | Filters strictly |

Ordering is inverted because picking a single winner and rendering a browsable list want opposite things: exact-first-everywhere is right for one answer, but it interleaves packs and destroys the grouping a list is read by. Fuzzy is on because a picker should surface "Longsword" for "sword". `itemType` filters strictly because a weapon picker must not quietly list potions when a pack has no matching weapon.

`limit` stops the scan as well as capping the output — once it is reached, remaining sources are never indexed. A low limit therefore truncates the tail of the priority order rather than sampling across it. `searchDetailed()` reports when that happened and which sources were left unopened.

`matchType` is reported for each result but tiers are mutually exclusive, so a candidate appears once.

## Type tokens

Every method accepts any of these, case-insensitively. They normalize to a canonical type:

| Canonical | Accepted aliases | Setting prefix |
|---|---|---|
| `Actor` | `actor`, `actors`, `monster`, `monsters`, `npc`, `creature` | `monsterCompendium{i}` |
| `Item` | `item`, `items`, `equipment`, `gear` | `itemCompendium{i}` |
| `Spell` | `spell`, `spells` | `spellCompendium{i}` |
| `Feature` | `feature`, `features`, `feat`, `feats` | `featuresCompendium{i}` |
| `Species` | `species`, `race`, `races`, `ancestry` | `speciesCompendium{i}` |
| `Background` | `background`, `backgrounds` | `backgroundCompendium{i}` |
| `Class` | `class`, `classes` | `classCompendium{i}` |
| `Subclass` | `subclass`, `subclasses` | `subclassCompendium{i}` |
| `JournalEntry` | `journal`, `journalentry` | `journalEntryCompendium{i}` |
| `RollTable` | `rolltable`, `table`, `tables` | `rollTableCompendium{i}` |
| `Scene`, `Macro`, `Playlist`, `Cards`, ... | singular/plural | `{camelCase}Compendium{i}` |

`Spell`, `Feature`, `Species`, `Background`, `Class`, and `Subclass` are **synthetic** types: they live in Item packs but get their own mapping, and resolution filters by document subtype (`spell`, `feat`, `race`, `background`, `class`, or `subclass`). Resolving `'Fireball'` as a `feature` correctly returns not-found.

The setting prefixes are listed for reference only — read them through `getMapping()` rather than building the keys yourself.

## Reading the mapping

```js
compendiums.getMapping('actor');
// {
//   type: 'Actor',
//   label: 'Actors',
//   packIds: ['dnd5e.monsters', 'my-module.custom-npcs'],  // priority order
//   searchWorldFirst: false,
//   searchWorldLast: true,
//   searchOrder: ['dnd5e.monsters', 'my-module.custom-npcs', 'world'],
//   numCompendiums: 2,
//   documentClass: 'Actor',
//   subtype: null
// }

compendiums.getSelected('actor');     // ['dnd5e.monsters', 'my-module.custom-npcs']
compendiums.getSearchOrder('actor');  // ['dnd5e.monsters', ..., 'world']
compendiums.getTypes();               // ['Actor', 'Item', ..., 'Spell', 'Feature', 'Species', 'Background', 'Class', 'Subclass']
compendiums.getChoices('actor');      // { 'none': '-- None --', 'dnd5e.monsters': 'D&D 5e: Monsters (SRD) — 143 Actors', ... }
```

`getChoices()` is useful if you want to build your own settings dropdown that mirrors Blacksmith's. Its values are **display strings for a `<select>`** — package, pack, and a summary of contents, composed into one line. They are not a source of structured data: to label a pack anywhere else, read `pack.metadata.label` and `getPackPackageLabel(pack)`, or take `sourceLabel` / `sourcePackage` off a `search()` result.

## Methods

### Mapping

| Method | Returns | Notes |
|---|---|---|
| `getTypes()` | `string[]` | Every type with a mapping in this world |
| `getMapping(type)` | `object` | Full mapping — packs, order, world rules |
| `getSelected(type)` | `string[]` | Configured pack IDs, priority order |
| `getSearchOrder(type)` | `string[]` | `'world'` and/or pack IDs, in search order |
| `getChoices(type)` | `{id: label}` | Dropdown choices for this type |

### Resolution

| Method | Returns | Notes |
|---|---|---|
| `resolve(name, type, options?)` | `Promise<Result>` | The core resolver |
| `resolveMany(names, type, options?)` | `Promise<Result[]>` | Batched; one result per input, in order |
| `resolveLink(name, type, options?)` | `Promise<string>` | Enricher link, or plain name on miss |
| `resolveDocument(name, type, options?)` | `Promise<Document\|null>` | Loads the document |

### Browsing

| Method | Returns | Notes |
|---|---|---|
| `search(query, type, options?)` | `Promise<Result[]>` | Many candidates for one query; grouped by source. `type` may be an array |
| `searchDetailed(query, type, options?)` | `Promise<{results, truncated, searchOrder, scannedSources, skippedSources}>` | The same, plus what the scan covered |

### Utilities

| Method | Returns | Notes |
|---|---|---|
| `normalizeType(type)` | `string\|null` | `'monster'` -> `'Actor'` |
| `getTypeLabel(type)` | `string` | `'JournalEntry'` -> `'Journal Entries'` |
| `parseQuantity(text)` | `{name, count}` | `'Goblin (3)'` -> `{name:'Goblin', count:3}` |
| `formatLink(uuid, label, count?)` | `string` | Build an enricher from a UUID you already have |
| `clearCache()` | `void` | Drop cached pack indexes |

## Performance

Pack indexes are cached after first read and invalidated automatically on `updateCompendium`. World collections are read live (they are already in memory), so they never go stale. Cached index entries carry `name`, `type`, `uuid`, and `img` — `img` is part of Foundry's default index fields, so a picker gets thumbnails without loading a single document.

Prefer `resolveMany` for lists — it warms every pack index concurrently once, rather than per name. Call `clearCache()` only if you bulk-edit compendium contents in a way that doesn't fire `updateCompendium`.

Use `search()` rather than reading pack indexes yourself. A consumer that calls `getSelected()` and indexes the packs directly builds a second cache over the same data with its own invalidation, which drifts from this one after any compendium edit.

## Console testing

```js
const c = game.modules.get('coffee-pub-blacksmith')?.api?.compendiums;

console.log('Types:', c.getTypes());
console.log('Actor mapping:', c.getMapping('actor'));
console.log('Search order:', c.getSearchOrder('actor'));

await c.resolve('Goblin', 'actor');
await c.resolveLink('Longsword', 'item');
await c.resolveMany(['Goblin', 'Orc', 'Nothing Here'], 'actor');

await c.search('long', 'Item', { itemType: 'weapon', limit: 40 });
await c.search('l', 'Item');                        // [] -- below minLength
await c.search('l', 'Item', { minLength: 1 });      // scans
```

## Notes

- The API is read-only with respect to settings. It never writes the GM's mapping.
- `resolve()` never throws for a missing name, an unconfigured type, or a missing pack — it returns a structured not-found result. Check `.found`. `search()` behaves the same way, returning an empty array.
- Returned UUIDs are always bare (`Compendium.pack.Actor.id` or `Actor.id`) and always accepted by Foundry's `fromUuid()`. The legacy `@Compendium[...]` enricher format is no longer produced.
- Modules should prefer this API over direct `game.settings.get('coffee-pub-blacksmith', ...)` reads for anything compendium-related.

## Related

- [api-campaign.md](api-campaign.md) — campaign context, party roster, rulebook compendiums
- [api-core.md](api-core.md) — registration and the `BLACKSMITH` constants object
