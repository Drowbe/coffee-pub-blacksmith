# Compendiums API

Blacksmith owns the **Compendium Mapping** the GM configures (which compendiums to use for monsters, items, spells, features, journals, roll tables, and in what priority order), and exposes both that mapping and a name-to-UUID resolver built on top of it.

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

## Type tokens

Every method accepts any of these, case-insensitively. They normalize to a canonical type:

| Canonical | Accepted aliases | Setting prefix |
|---|---|---|
| `Actor` | `actor`, `actors`, `monster`, `monsters`, `npc`, `creature` | `monsterCompendium{i}` |
| `Item` | `item`, `items`, `equipment`, `gear` | `itemCompendium{i}` |
| `Spell` | `spell`, `spells` | `spellCompendium{i}` |
| `Feature` | `feature`, `features`, `feat`, `feats` | `featuresCompendium{i}` |
| `JournalEntry` | `journal`, `journalentry` | `journalEntryCompendium{i}` |
| `RollTable` | `rolltable`, `table`, `tables` | `rollTableCompendium{i}` |
| `Scene`, `Macro`, `Playlist`, `Cards`, ... | singular/plural | `{camelCase}Compendium{i}` |

`Spell` and `Feature` are **synthetic** types: they live in Item packs but get their own mapping, and resolution filters by document subtype (`spell` / `feat`). Resolving `'Fireball'` as a `feature` correctly returns not-found.

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
compendiums.getTypes();               // ['Actor', 'Item', 'JournalEntry', ..., 'Spell', 'Feature']
compendiums.getChoices('actor');      // { 'none': '-- None --', 'dnd5e.monsters': 'D&D 5e: Monsters (SRD)', ... }
```

`getChoices()` is useful if you want to build your own compendium picker that mirrors Blacksmith's.

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

### Utilities

| Method | Returns | Notes |
|---|---|---|
| `normalizeType(type)` | `string\|null` | `'monster'` -> `'Actor'` |
| `getTypeLabel(type)` | `string` | `'JournalEntry'` -> `'Journal Entries'` |
| `parseQuantity(text)` | `{name, count}` | `'Goblin (3)'` -> `{name:'Goblin', count:3}` |
| `formatLink(uuid, label, count?)` | `string` | Build an enricher from a UUID you already have |
| `clearCache()` | `void` | Drop cached pack indexes |

## Performance

Pack indexes are cached after first read and invalidated automatically on `updateCompendium`. World collections are read live (they are already in memory), so they never go stale.

Prefer `resolveMany` for lists — it warms every pack index concurrently once, rather than per name. Call `clearCache()` only if you bulk-edit compendium contents in a way that doesn't fire `updateCompendium`.

## Console testing

```js
const c = game.modules.get('coffee-pub-blacksmith')?.api?.compendiums;

console.log('Types:', c.getTypes());
console.log('Actor mapping:', c.getMapping('actor'));
console.log('Search order:', c.getSearchOrder('actor'));

await c.resolve('Goblin', 'actor');
await c.resolveLink('Longsword', 'item');
await c.resolveMany(['Goblin', 'Orc', 'Nothing Here'], 'actor');
```

## Notes

- The API is read-only with respect to settings. It never writes the GM's mapping.
- `resolve()` never throws for a missing name, an unconfigured type, or a missing pack — it returns a structured not-found result. Check `.found`.
- Returned UUIDs are always bare (`Compendium.pack.Actor.id` or `Actor.id`) and always accepted by Foundry's `fromUuid()`. The legacy `@Compendium[...]` enricher format is no longer produced.
- Modules should prefer this API over direct `game.settings.get('coffee-pub-blacksmith', ...)` reads for anything compendium-related.

## Related

- [api-campaign.md](api-campaign.md) — campaign context, party roster, rulebook compendiums
- [api-core.md](api-core.md) — registration and the `BLACKSMITH` constants object
