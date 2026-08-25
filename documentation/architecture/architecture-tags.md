# Tags System Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public API, see `../api/api-tags.md`.

The Tags system is module-agnostic labeling infrastructure. Any Coffee Pub module can declare a taxonomy of suggested tags for one of its data types, attach tags to its records through Blacksmith's central store, and rely on Blacksmith for the world registry, normalization, rename/delete, per-user visibility, and the UI widget.

A "tag" here is a normalized classification label (`"tavern"`, `"main-quest"`, `"todo"`). This is unrelated to FoundryVTT's `document.flags`, which is a generic key-value store on documents. The system was renamed from "flags" to "tags"; one artifact of that rename survives deliberately — see Taxonomy sources below.

Target: FoundryVTT v13+.

## Core concepts

| Concept | Description |
|---|---|
| **Tag** | A normalized string label: lowercase, hyphen-separated, no spaces (e.g. `"main-quest"`). |
| **Context key** | Scopes a taxonomy and its assignments to one module plus data type: `{moduleId}.{dataType}` (e.g. `"coffee-pub-librarian.quest"`). |
| **Taxonomy** | The declared set of suggested tags for a context key. |
| **Global tags** | Tags offered as suggestions in every context (e.g. `"todo"`, `"revisit"`), from the taxonomy's `globalTags`. |
| **Protected tag** | A taxonomy tag marked `protected: true` because module code checks it by value. GMs cannot rename or delete it. |
| **Registry** | The world-level deduplicated list of every tag ever used. |

`getChoices(contextKey)` returns entries shaped `{ key, label, protected, tier }`, where **`tier` is `'taxonomy'` or `'global'`** — those are the only two tiers the code has. "Custom" and "orphan" are descriptive terms for registry entries that appear in no taxonomy; they are not a stored classification.

## Storage

All tag data lives in Blacksmith settings; consuming modules do not store tags in their own records. The keys are defined at the top of `manager-tags.js` (`:16-19`).

| Setting | Scope | Type | Holds |
|---|---|---|---|
| `tagAssignments` | world | Object | `{ [contextKey]: { [recordId]: string[] } }` — the central assignment store |
| `tagRegistry` | world | Array | The deduplicated list of known tags |
| `tagVisibility` | **user** | Object | Per-user visibility map (see Visibility) |
| `tagTaxonomyOverrideJson` | world | String | Path to a GM-supplied override taxonomy |
| `tagsMigrationComplete` | world | Boolean | Migration sentinel |

Assignment writes normalize first, then prune: emptying a record deletes its entry, and emptying a context deletes the context bucket, so neither leaves residue in the store. See the write path below for how a write reaches these settings -- nothing outside `_applyMutation()` may set them.

## Taxonomy sources

The taxonomy registry is merged from three sources, held in separate maps on `TagManager` and resolved by `ensureTaxonomyLoaded()`:

| Map | Source |
|---|---|
| `_builtinRegistry` | `resources/tag-taxonomy.json`, plus `pin-taxonomy.json` via `_loadPinTaxonomyCompat()` |
| `_overrideRegistry` | the JSON at the `tagTaxonomyOverrideJson` setting path |
| `_runtimeRegistry` | `register(contextKey, taxonomy)` calls from consuming modules |

`_globalTags` holds the cross-context suggestions. `invalidateTaxonomy()` clears the cache so a changed override is picked up.

**The `tags` / `flags` key.** All three readers go through one helper, `_normalizeTagList(entry)` (`:174`), which accepts either `tags` or `flags` as the array key and accepts entries as plain strings or `{ key, protected }` objects. This exists because the shipped `tag-taxonomy.json` uses `flags` (a leftover from the rename) while `tags` is the documented shape. Reading both means no caller gets a silently empty taxonomy from picking the wrong key. `tags` wins if an entry somehow carries both.

## Components

| File | Role |
|---|---|
| `scripts/manager-tags.js` | `TagManager` — storage, normalization, taxonomy merge, registry, GM proxy |
| `scripts/api-tags.js` | `TagsAPI` — the public wrapper exposed as `module.api.tags` |
| `scripts/widget-tags.js` | `TagWidget` — the embeddable UI component |
| `templates/partials/tag-widget.hbs` | Widget template |
| `styles/widget-tags.css` | Widget styles |
| `resources/tag-taxonomy.json` | Canonical taxonomy for Coffee Pub contexts |

### TagWidget

Three static methods carry the whole component:

- `prepareData({ contextKey, currentTags, mode, placeholder })` (`widget-tags.js:17`) — builds the render context. It takes a **destructured options object**, not positional arguments. `mode` defaults to `'full'`; `'filter'` is declared but not implemented.
- `activate(element, contextKey, onChange)` (`:78`) — installs the entire event layer: suggestion clicks, Enter-to-add, chip removal, live search. Rendering the partial without calling this yields a display-only div.
- `readValue(element, contextKey)` — reads the current selection back out.

The partial must receive its context positionally; passing it as a hash adds a key rather than replacing the context, and the partial reads `contextKey` / `isFullMode` / `chips` off the root — the failure mode is a silent empty div.

## Write path: one queue, and deltas over the wire

Every mutation is a read-modify-write of a whole setting: read `tagAssignments` (or `tagRegistry`), clone it, change one key, write it back. That is correct only while exactly one cycle is in flight, and the write path is built around holding that guarantee in two places at once.

**One entry point.** `_mutate(action, params)` (`manager-tags.js:325`) is the only route to a tag write; `setTags`, `addTags`, `removeTags`, `deleteRecordTags`, `rename`, `delete` and `seedRegistry` all go through it. On a GM it wraps the cycle in `_enqueue()`, which chains it behind any cycle already running. On a player it sends the action to the GM instead.

**The payload is a delta, never a finished object.** A player sends what changed -- `{contextKey, recordId, tags}` -- and the GM reads current data and applies it, queued on the GM's own chain because several players' requests can land together. This is the load-bearing property: a client that ships a complete settings object is shipping its snapshot of *every* context key for *every* module, so a stale one overwrites whatever was edited since it was read.

`_applyMutation()` (`:337`) is the sole place `game.settings.set` touches either key, and it runs only inside `_enqueue`. Preserve that invariant -- a write added anywhere else reintroduces the race in a form no test here will see, because a single awaited call always looks correct.

The dispatch table:

| Action | Applies |
|---|---|
| `setRecordTags` | replace a record's tags (empty array deletes the record) |
| `mergeRecordTags` | add or remove tags, resolved against current data |
| `deleteRecordTags` | drop a record |
| `addRegistryTags` | union tags into the registry |
| `renameTag` / `deleteTag` | sweep every assignment plus the registry |
| `adoptLegacyStore` | take a whole legacy blob into a store still empty -- the one correct whole-object write, with emptiness re-checked inside the queued unit |

`addTags` and `removeTags` are their own delta actions rather than a `getTags` followed by `setTags`. A read-then-write split across two queued units is still a race: the read happens outside the cycle that consumes it. They return `{tags, changed}` rather than the array, because whether anything actually changed is known only on the applying side -- across the socket, for a player -- and `blacksmith.tags.changed` fires only when `changed` is true. Adding a tag a record already carries is silent.

Assignment writes prune as they go, and **pruning is confined to the contexts the write touched**. `_putAssignments()` takes those context keys explicitly; a caller that genuinely visits every context -- `renameTag`, `deleteTag`, `adoptLegacyStore` -- passes `null` for all of them.

Sweeping the whole object on every write is tidier and is wrong. It makes a write to one context edit unrelated contexts, which destroys the only property worth asserting about this path: that a write changes nothing outside its own scope. That assertion is the guard against a stale client overwriting the store, so it has to stay sharp -- worth more than opportunistically tidying buckets nothing reads. Empty buckets left by older versions are inert and get cleaned when their own context is next written.

Records follow the same rule: emptying a record deletes it, including when `deleteTag` removes a record's last tag. So `setTags(ctx, id, [])`, `deleteRecordTags(ctx, id)` and a sweep that empties a record all leave the store in the same shape.

The socket handler is named `blacksmith-tags-gm-proxy` (`:22`), dispatched by `_handleGMProxy` / `_executeGMAction`. Both ends ship in this module, so the payload shape is internal.

Two methods are GM-only and return early for players: `rename()` and `delete()`, both world-wide mutations. `seedRegistry()` is not gated -- it routes through `_mutate` like everything else, so a player-client first-run seed works.

Concurrency is asserted by `testing/suites/suite-tags.js`, which fires writes through `Promise.all` on purpose. Awaiting each call individually passes whatever the write path does, which is why the suite does not.

## Normalization

`normalizeTag` / `normalizeTagArray` lowercase, hyphenate, and deduplicate. Normalization happens on the way in — at assignment, registration, and registry add — so stored data is always canonical and comparisons never need to normalize again.

## Visibility

Visibility is stored in `tagVisibility` at **user** scope: it is a per-client display preference, not a permission. It filters UI only and never removes tags from stored data. `setVisibility(tag, visible, contextKey?)` sets a context-specific override when `contextKey` is supplied and the global default otherwise; `getVisibility` resolves context override, then global default, then `true`.

## Hooks

| Hook | Payload |
|---|---|
| `blacksmith.tags.changed` | `{ contextKey, recordId, tags }` |
| `blacksmith.tags.renamed` | `{ oldTag, newTag, updated }` |
| `blacksmith.tags.deleted` | `{ tag, removed }` |

Note the payload key on `changed` is `tags`, not `flags`.

## Relationship to Pins

Pins predates this system and carried its own tag vocabulary in the `pinTagRegistry` world setting. The canonical store is now `tagRegistry`, with a legacy fallback to `pinTagRegistry` retained during migration, and `_loadPinTaxonomyCompat()` folds `pin-taxonomy.json` entries into the builtin registry under `{moduleId}.{type}` context keys. Do not assume `pinTagRegistry` is dead when touching either side.

**Pins contributes tags to the registry and stores no assignments.** `_contributeTagsToRegistry` (`manager-pins.js:612`) calls `addRegistryTags`, so a pin's tags join the shared vocabulary and appear as suggestions. The tags themselves live in pin data, which is where pins reads them from -- `normalizePinTags(pin.tags)`, never the central store.

It used to write assignment rows as well, keyed by `pin.id` under `{moduleId}.{type}`, putting a module's pins in the same bucket as that module's own records. Two facts killed that:

- **Nothing read them.** No code in Blacksmith reads a tag assignment back, and pins filters off pin data. The rows were write-only, and visible to the one module that does read the store.
- **The pin id is the caller's.** The schema defaults it to `''` (`manager-pins-schema.js:333`) and nothing in pins generates one, so its shape is whatever the consuming module chose. A bucket holding two kinds of id from two namespaces, told apart only by a format Blacksmith does not define, cannot be given a contract -- a consumer can only guess, and guess silently wrong.

Librarian found this by migrating 342 codex entries into a bucket that then held 344 rows. A context key's bucket now holds only what its owner put there.

`PinManager.purgeLegacyTagRows()` removes the rows already written, once per world, by enumerating every pin and deleting its row by exact key -- so nothing a module authored is touched. It runs at `ready` after the tag migration and is guarded by the `pinTagRowsPurged` sentinel.
