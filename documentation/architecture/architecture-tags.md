# Tags System Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public API, see `../api/api-tags.md`.

The Tags system is module-agnostic labeling infrastructure. Any Coffee Pub module can declare a taxonomy of suggested tags for one of its data types, attach tags to its records through Blacksmith's central store, and rely on Blacksmith for the world registry, normalization, rename/delete, per-user visibility, and the UI widget.

A "tag" here is a normalized classification label (`"tavern"`, `"main-quest"`, `"todo"`). This is unrelated to FoundryVTT's `document.flags`, which is a generic key-value store on documents. The system was renamed from "flags" to "tags"; one artifact of that rename survives deliberately — see Taxonomy sources below.

Target: FoundryVTT v13+.

## Core concepts

| Concept | Description |
|---|---|
| **Tag** | A normalized string label: lowercase, hyphen-separated, no spaces (e.g. `"main-quest"`). |
| **Context key** | Scopes a taxonomy and its assignments to one module plus data type: `{moduleId}.{dataType}` (e.g. `"coffee-pub-squire.quest"`). |
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

Assignment writes normalize first, then prune: `setTags()` (`:300`) deletes the record's entry entirely when the resulting array is empty, so an emptied record leaves no residue in the store.

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

## Write path and the GM proxy

Tag data lives in world settings, which only a GM can write. Rather than refusing player writes, `TagManager` routes them:

- `_writeAssignments()` (`:292`) and `_writeRegistry()` (`:364`) check `game.user.isGM`. A GM writes directly; a player calls `_requestGM(action, payload)`, which goes over the socket handler named `blacksmith-tags-gm-proxy` (`:22`) and is executed GM-side by `_handleGMProxy` / `_executeGMAction`.
- So `setTags`, `addTags`, `removeTags`, and `deleteRecordTags` all work for players.

Three methods are genuinely GM-only and return early for players: `rename()` (`:386`), `delete()` (`:418`), and `seedRegistry()` (`:455`). The first two are world-wide mutations that should stay GM-gated. The guard on `seedRegistry` is not required by the write path — seeding routes through the same proxy — and it returns silently, so a player-client first-run seed simply does not happen.

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

Pins predates this system and carried its own tag vocabulary in the `pinTagRegistry` world setting. The canonical store is now `tagRegistry` via this system, with a legacy fallback to `pinTagRegistry` retained during migration, and `_loadPinTaxonomyCompat()` folds `pin-taxonomy.json` entries into the builtin registry under `{moduleId}.{type}` context keys. Pins is therefore a consumer of the Tags system rather than a parallel implementation, but the fallback path is still present — do not assume `pinTagRegistry` is dead when touching either side.
