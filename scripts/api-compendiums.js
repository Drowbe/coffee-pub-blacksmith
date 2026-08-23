/**
 * Compendiums API - Public surface for compendium mapping and name resolution.
 *
 * Exposed as `game.modules.get('coffee-pub-blacksmith').api.compendiums`
 * and `BlacksmithAPI.getCompendiums()`.
 *
 * Four things live here:
 *  1. READ the GM's compendium mapping (which packs, in what priority, for what type).
 *  2. RESOLVE plain text to a well-formed UUID using that mapping.
 *  3. SEARCH that mapping for many candidates at once, for browsable pickers.
 *  4. QUERY it by shape rather than by text -- subtype, rarity, price -- for anything that
 *     would otherwise store a list of references and watch them rot.
 *
 * Consuming modules should never read `monsterCompendium1` / `numCompendiumsActor`
 * or hand-build `@UUID[...]` strings -- the key names carry backward-compat quirks
 * (Actor maps to "monster", Feature maps to "features") and the search order has
 * world-first/world-last rules. Call resolve()/resolveLink() instead.
 *
 * See documentation/api/api-compendiums.md
 */

import { compendiumManager, parseQuantity, formatLink, normalizeRarity, toGp } from './manager-compendiums.js';
import { normalizeType, getTypeLabel, getChoicesArrayKey } from './utility-compendium-types.js';
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

    // ===== FILTERING =====

    /**
     * Shape in, candidates out. Everything in the GM's configured sources whose subtype,
     * rarity and price match, with no text to match against.
     *
     * Use this instead of storing references. A roll table row, a saved uuid list, anything
     * written down ROTS: rename a pack, update a content module, uninstall one, and the
     * reference points at nothing. A query resolves against what exists at the moment it
     * runs, so it cannot dangle, and it picks up newly installed content instead of
     * freezing at whatever someone typed last year.
     *
     * Three deliberate differences from search(), all of which bite if you assume otherwise:
     *
     *  - **`limit` caps the OUTPUT. The scan is always complete.** search() lets the cap
     *    stop the scan, because for a typed query the head of the GM's priority order is
     *    the best answer. That does not transfer: a stop-scan limit here would draw every
     *    result from the first configured pack and never open the sixth, so a shop stocked
     *    from it would silently only ever contain SRD basics.
     *  - **`matchType` is null on every row.** No tier was consulted, and inventing one
     *    would be a lie a consumer might sort by.
     *  - **`rarity`, `price` and `priceGp` are populated**, where search() leaves them null
     *    unless you passed a rarity or price filter to it too.
     *
     * Three dnd5e facts this handles so you do not have to, each of which is a silent wrong
     * answer rather than an error if you get it wrong yourself:
     *
     *  - **Mundane gear has a BLANK rarity, not 'common'.** A plain longsword stores `""`.
     *    Asking for `['common', 'uncommon']` gets you magic items only. Use the `mundane`
     *    token for unmarked gear.
     *  - **Price has a denomination.** 50 sp is 5 gp, so a raw compare on the stored number
     *    is wrong for anything not priced in gold. Ranges here are in GOLD PIECES, converted
     *    for you.
     *  - **Unpriced and free are the same stored value.** Both are 0 and cannot be told
     *    apart. They are excluded from a price range by default; `includeUnpriced: true`
     *    keeps them.
     *
     * An entry whose document type has no rarity or price field at all -- a spell, a class,
     * a journal entry -- FAILS a filter on that field rather than passing unfiltered. So
     * combining a price range with a non-physical type returns nothing, on purpose.
     *
     * @param {object} [filter]
     * @param {string|string[]} [filter.type='Item'] - Type token(s), same as search()
     * @param {string[]} [filter.subtypes=null]      - Subtypes to keep, e.g. ['weapon', 'tool']
     * @param {string[]} [filter.rarity=null]        - Rarity tokens; 'mundane' for unmarked gear
     * @param {{min?: number, max?: number}} [filter.priceGp=null] - Price window in gold pieces
     * @param {boolean} [filter.includeUnpriced=false] - Keep entries stored at price 0
     * @param {string[]} [filter.sources=null]       - Restrict to configured source ids
     * @param {number}  [filter.limit=200]           - Cap the output
     * @returns {Promise<Array<{uuid: string, name: string, type: string|null, documentClass: string,
     *                          img: string|null, source: string, sourceLabel: string,
     *                          sourcePackage: string, matchType: null,
     *                          rarity: string|null, price: object|null, priceGp: number|null}>>}
     *
     * @example
     * // Stock a shop from what is installed right now, rather than from a table that rots.
     * const stock = await api.compendiums.query({
     *     type: 'Item',
     *     subtypes: ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'],
     *     rarity: ['mundane', 'common', 'uncommon'],   // 'mundane' or you get magic only
     *     priceGp: { min: 1, max: 500 },
     *     limit: 200
     * });
     */
    query: (filter) => compendiumManager.query(filter),

    /**
     * query(), plus a report of what the scan covered.
     *
     * `scannedSources` lists every configured source, where searchDetailed() can leave a
     * tail unopened -- that is the difference the two reports exist to show. `truncated`
     * here means only "there were more candidates than you asked for", never "some content
     * went unread", so a consumer can say "showing 200 of many" without hedging about
     * whether the rest was even looked at.
     *
     * @param {object} [filter] - Same as query()
     * @returns {Promise<{results: Array<object>, truncated: boolean, searchOrder: string[],
     *                    scannedSources: string[], skippedSources: string[]}>}
     */
    queryDetailed: (filter) => compendiumManager.queryDetailed(filter),

    // ===== UTILITIES =====

    /**
     * A rarity token in whatever shape a user typed it, as the key dnd5e stores.
     *
     * Accepts 'Very Rare', 'very rare' and 'veryrare' for `veryRare`, since the sheet shows
     * a label and the data holds a camelCase key. Returns `'mundane'` for `''` -- unmarked
     * gear -- and `null` for `null`/`undefined`, which is a document type with no rarity
     * field at all rather than an item that has none. Those two are not the same and a
     * filter that conflates them matches every spell in the world.
     *
     * @param {string|null|undefined} token
     * @returns {string|null}
     */
    normalizeRarity: (token) => normalizeRarity(token),

    /**
     * A stored dnd5e price as a number of gold pieces.
     *
     * `{value: 50, denomination: 'sp'}` is 5 gp. Comparing the raw `value` across items is
     * wrong for anything not priced in gold, which is the bug this exists to prevent.
     * Returns null for an unknown denomination rather than assuming gold.
     *
     * @param {{value: number, denomination: string}|null|undefined} price
     * @returns {number|null}
     */
    toGp: (price) => toGp(price),

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
