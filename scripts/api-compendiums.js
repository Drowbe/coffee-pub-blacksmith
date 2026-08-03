/**
 * Compendiums API - Public surface for compendium mapping and name resolution.
 *
 * Exposed as `game.modules.get('coffee-pub-blacksmith').api.compendiums`
 * and `BlacksmithAPI.getCompendiums()`.
 *
 * Three things live here:
 *  1. READ the GM's compendium mapping (which packs, in what priority, for what type).
 *  2. RESOLVE plain text to a well-formed UUID using that mapping.
 *  3. SEARCH that mapping for many candidates at once, for browsable pickers.
 *
 * Consuming modules should never read `monsterCompendium1` / `numCompendiumsActor`
 * or hand-build `@UUID[...]` strings -- the key names carry backward-compat quirks
 * (Actor maps to "monster", Feature maps to "features") and the search order has
 * world-first/world-last rules. Call resolve()/resolveLink() instead.
 *
 * See documentation/api/api-compendiums.md
 */

import { compendiumManager, parseQuantity, formatLink } from './manager-compendiums.js';
import { normalizeType, getTypeLabel, getChoicesArrayKey } from './compendium-types.js';
import { BLACKSMITH } from './const.js';

export const CompendiumsAPI = {
    // ===== MAPPING =====

    /**
     * Every type that has compendium mappings in this world.
     * @returns {string[]} e.g. ["Actor", "Item", "Spell", "Feature", "Species", "Background", "Class", "Subclass"]
     */
    getTypes: () => compendiumManager.getTypes(),

    /**
     * The full mapping for a type: which packs, in what order, and the world rules.
     * @param {string} type - "actor", "Actor", "monster", "item", "spell", "feat", "JournalEntry", ...
     * @returns {{type: string, label: string, packIds: string[], searchWorldFirst: boolean,
     *            searchWorldLast: boolean, searchOrder: string[], numCompendiums: number,
     *            documentClass: string, subtype: string|null}}
     */
    getMapping: (type) => compendiumManager.getMapping(type),

    /**
     * Configured pack IDs for a type, in priority order (index 0 = Priority 1).
     * @param {string} type
     * @returns {string[]}
     */
    getSelected: (type) => compendiumManager.getSelected(type),

    /**
     * Sources that will be searched, in order. 'world' plus pack IDs.
     * @param {string} type
     * @returns {string[]}
     */
    getSearchOrder: (type) => compendiumManager.getSearchOrderForType(type),

    /**
     * Dropdown choices ({packId: label}) for a type -- the compendiums eligible for
     * the GM's SEARCH mapping, narrowed by the enabled-source checkboxes and by
     * content heuristics. Handy for a settings UI that mirrors Blacksmith's.
     *
     * If you are asking the user to nominate a compendium for your own module's
     * purpose rather than for searching, you probably want getAllChoices().
     * @param {string} type
     * @returns {Object<string, string>}
     */
    getChoices: (type) => BLACKSMITH[getChoicesArrayKey(type)] ?? { none: '-- None --' },

    /**
     * Every INSTALLED compendium that can hold this type, ignoring the GM's mapping --
     * structured, not display strings.
     *
     * getChoices() answers "what did the GM map for searching". This answers "what
     * exists". They are different questions and the difference matters: a module asking
     * the user to nominate a compendium for its own use -- an injuries table, a
     * quotations journal -- often wants one that is deliberately NOT in the search set,
     * and getChoices() would hide exactly that.
     *
     * No content check at all, where getChoices() at least requires a synthetic type's
     * subtype to be present in the index. `Spell` therefore returns every Item pack,
     * including ones holding no spells -- the raw inventory of what could hold this
     * document class, for a user who knows which one they mean.
     *
     * @param {string} type - Any accepted type token
     * @returns {Array<{id: string, label: string, package: string, displayLabel: string,
     *                  documentClass: string, subtype: string|null, isWorld: boolean}>}
     *
     * @example
     * // Bibliosoph: let the user pick ANY journal compendium for injuries,
     * // including ones deliberately kept out of Blacksmith's search mapping.
     * const packs = api.compendiums.getAllPacks('JournalEntry');
     * // [{ id: 'bok-roll-tables.injuries', label: 'Injuries',
     * //    package: 'Burden of Knowledge', displayLabel: 'Burden of Knowledge: Injuries', ... }]
     */
    getAllPacks: (type) => compendiumManager.getAllPacks(type),

    /**
     * getAllPacks() as a dropdown-ready `{id: label}` object, shaped like getChoices()
     * so it drops straight into a setting's `choices`.
     *
     * Values are DISPLAY STRINGS. To lay the parts out yourself, use getAllPacks() and
     * read `label` and `package` separately rather than splitting these apart.
     *
     * @param {string} type
     * @param {object} [options]
     * @param {boolean} [options.none=true] - Include the leading "-- None --" entry
     * @returns {Object<string, string>}
     *
     * @example
     * game.settings.register('coffee-pub-bibliosoph', 'injuryCompendium', {
     *     name: 'Injury Compendium',
     *     scope: 'world', config: true, type: String, default: 'none',
     *     choices: api.compendiums.getAllChoices('JournalEntry')
     * });
     */
    getAllChoices: (type, options) => compendiumManager.getAllChoices(type, options),

    // ===== RESOLUTION =====

    /**
     * Resolve plain text to a UUID using the GM's configured mapping.
     *
     * Matching is exact-first across ALL configured sources, then startsWith.
     * Pass {exact: true} for exact-only, or {fuzzy: true} to also allow substring
     * matches. The result's `matchType`/`confidence` tell you which tier hit.
     *
     * @param {string} name - e.g. "Goblin", "Longsword"
     * @param {string} type - e.g. "actor", "item", "spell", "feature", "species", "background", "class", "subclass"
     * @param {object} [options]
     * @param {boolean} [options.exact=false]      - Exact matches only
     * @param {boolean} [options.fuzzy=false]      - Allow loose substring matching
     * @param {string}  [options.itemType=null]    - Prefer this document subtype (e.g. "weapon")
     * @param {boolean} [options.parseCount=false] - Strip a trailing "(3)" and report it as count
     * @param {string[]} [options.sources=null]    - Restrict lookup to configured source ids (`world` or pack ids)
     * @returns {Promise<{found: boolean, uuid: string|null, name: string, matchedName: string|null,
     *                    packId: string|null, source: string|null, matchType: string|null,
     *                    confidence: string, documentClass: string, count: number|null, link: string|null}>}
     *
     * @example
     * const r = await api.compendiums.resolve('Goblin', 'actor');
     * // { found: true, uuid: 'Compendium.dnd5e.monsters.Actor.xyz',
     * //   matchType: 'exact', confidence: 'high', source: 'dnd5e.monsters', ... }
     */
    resolve: (name, type, options) => compendiumManager.resolve(name, type, options),

    /**
     * Resolve many names of one type. Pack indexes load once for the whole batch,
     * so this is materially faster than looping resolve().
     * @param {Array<string|{name: string, type?: string}>} names
     * @param {string} type
     * @param {object} [options] - Same as resolve()
     * @returns {Promise<Array<object>>} One result per input, in order
     */
    resolveMany: (names, type, options) => compendiumManager.resolveMany(names, type, options),

    /**
     * Resolve straight to an enricher link, ready to drop into journal HTML.
     * @param {string} name
     * @param {string} type
     * @param {object} [options] - Same as resolve(), plus {fallback} for the no-match string
     * @returns {Promise<string>} `@UUID[...]{Name}`, or the plain name if unresolved
     */
    resolveLink: (name, type, options) => compendiumManager.resolveLink(name, type, options),

    /**
     * Resolve and load the actual Document.
     * @param {string} name
     * @param {string} type
     * @param {object} [options]
     * @returns {Promise<Document|null>}
     */
    resolveDocument: (name, type, options) => compendiumManager.resolveDocument(name, type, options),

    // ===== BROWSING =====

    /**
     * Browsable multi-result lookup for search-as-you-type pickers: one query in,
     * many candidates out. Reuses the same cached pack indexes and configured
     * sources as resolve(), so a consumer never has to build a second index cache.
     *
     * Ordering is by SOURCE in configured priority order, tier-sorted within each
     * source (and alphabetical within a tier). That is the deliberate inverse of
     * resolve(), which exhausts a tier across all sources to pick one winner --
     * interleaving packs would destroy the grouping a picker renders.
     *
     * Also unlike resolve(): `fuzzy` defaults to true, and `itemType` filters
     * rather than merely preferring, so a weapon picker never lists potions.
     *
     * `limit` stops the scan as well as capping the output, so a low limit
     * truncates the tail of the priority order rather than sampling across it.
     * Use searchDetailed() when you need to know whether that happened -- it is
     * not inferable from the array, since a scan that fills the cap exactly with
     * the last available candidate is complete rather than truncated.
     *
     * `documentClass` on each result is the Foundry document class ('Item', 'Actor'),
     * beside `type`, which is the document SUBTYPE ('weapon', 'npc'). A drag payload
     * wants the class; a badge in the row wants the subtype.
     *
     * `type` may be an ARRAY -- ['Item', 'Spell', 'Feature'], or getTypes() for
     * everything mapped. Prefer that over calling search() once per type: it opens
     * each source once, keeps the results grouped by compendium, spends ONE `limit`
     * across the whole search, and dedupes by uuid. That last one is not optional --
     * synthetic types share packs with Item, so a pack mapped to both Item and Spell
     * hands back its spells twice and a caller-side merge double-lists them.
     *
     * Source identity comes back as three DISCRETE fields -- `source` (the id),
     * `sourceLabel` (the pack's own name), and `sourcePackage` (the owning module,
     * system, or world). Compose them however your layout wants. Do NOT use
     * getChoices() for this: those labels are settings-dropdown strings that glue
     * the package, the pack, and a content summary into one line.
     *
     * @param {string} query - Partial text, e.g. "long"
     * @param {string|string[]} type - Same type tokens as resolve(), or an array of them
     * @param {object} [options]
     * @param {string}  [options.itemType=null]  - Restrict to a document subtype, e.g. "weapon"
     * @param {number}  [options.limit=50]       - Cap total results
     * @param {string[]} [options.sources=null]  - Restrict to configured source ids (`world` or pack ids)
     * @param {number}  [options.minLength=2]    - Return [] without scanning below this query length
     * @param {boolean} [options.fuzzy=true]     - Include the loose "includes" tier
     * @returns {Promise<Array<{uuid: string, name: string, type: string|null, documentClass: string,
     *                          img: string|null, source: string, sourceLabel: string,
     *                          sourcePackage: string, matchType: string}>>}
     *
     * @example
     * const results = await api.compendiums.search('long', 'Item', { itemType: 'weapon', limit: 40 });
     * // group by result.source; header from result.sourceLabel with result.sourcePackage
     * // as its subtitle; render name + img; add via result.uuid
     *
     * @example
     * // Drag-to-sheet: Foundry's native payload, no derivation needed.
     * event.dataTransfer.setData('text/plain', JSON.stringify({
     *     type: result.documentClass,   // 'Item'
     *     uuid: result.uuid
     * }));
     *
     * @example
     * // Several types in one pass, grouped and deduped, sharing one limit.
     * await api.compendiums.search('long', ['Item', 'Spell', 'Feature'], { limit: 40 });
     * await api.compendiums.search('long', api.compendiums.getTypes(), { limit: 40 });
     */
    search: (query, type, options) => compendiumManager.search(query, type, options),

    /**
     * search(), plus a report of what the scan actually covered.
     *
     * `limit` stops the scan, so the array alone cannot distinguish "that pack had
     * no matches" from "that pack was never opened". This says which, so a consumer
     * can tell the user accurately rather than inferring from the result count --
     * an inference that over-reports, since filling the cap exactly with the last
     * available candidate is a complete scan, not a truncated one.
     *
     * @param {string} query
     * @param {string} type
     * @param {object} [options] - Same as search()
     * @returns {Promise<{results: Array<object>, truncated: boolean, searchOrder: string[],
     *                    scannedSources: string[], skippedSources: string[]}>}
     *
     * @example
     * const { results, truncated, skippedSources } = await api.compendiums.searchDetailed('a', 'Item');
     * if (truncated) showMore(`${skippedSources.length} more compendiums not searched`);
     */
    searchDetailed: (query, type, options) => compendiumManager.searchDetailed(query, type, options),

    // ===== UTILITIES =====

    /**
     * Normalize a type token to Blacksmith's canonical form.
     * @param {string} type - "monster", "feat", "actors", ...
     * @returns {string|null} "Actor", "Feature", ...
     */
    normalizeType: (type) => normalizeType(type),

    /**
     * Human-readable label for a type.
     * @param {string} type
     * @returns {string} e.g. "Journal Entries"
     */
    getTypeLabel: (type) => getTypeLabel(type),

    /**
     * Split a trailing quantity off a name: "Goblin (3)" -> {name:"Goblin", count:3}
     * @param {string} text
     * @returns {{name: string, count: number|null}}
     */
    parseQuantity: (text) => parseQuantity(text),

    /**
     * Build an enricher link from a UUID you already have.
     * @param {string} uuid
     * @param {string} label
     * @param {number|null} [count]
     * @returns {string}
     */
    formatLink: (uuid, label, count) => formatLink(uuid, label, count),

    /**
     * Drop cached pack indexes. Only needed after bulk-editing compendium contents
     * in a way that doesn't fire `updateCompendium`.
     */
    clearCache: () => compendiumManager.clearCache()
};

export default CompendiumsAPI;
