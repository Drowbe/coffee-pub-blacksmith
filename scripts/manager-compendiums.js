/**
 * Manager Compendiums - Unified Compendium Lookup System
 *
 * Centralized name -> UUID resolution across world collections and compendiums,
 * honoring the priority order and world-first/world-last rules the GM configured
 * in Campaign Settings > Compendium Mapping.
 *
 * This is the single implementation of "plain text in, well-formed UUID out".
 * Everything else in Blacksmith (JSON import autolinking, journal tools, the
 * link builders in utility-common.js) delegates here, and other Coffee Pub
 * modules reach it through `api.compendiums` -- see documentation/api/api-compendiums.md.
 *
 * Matching is TIERED and exact-first: an exact match in ANY configured source
 * beats a loose match in a higher-priority source. Tiers run in this order:
 *   1. exact      - case-insensitive full name equality
 *   2. startsWith - candidate name begins with the query  (skip with {exact: true})
 *   3. includes   - candidate name contains the query     (opt in with {fuzzy: true})
 *
 * Every result reports which tier matched so callers can flag low-confidence links.
 *
 * search() answers the other question -- "what matches this text?" -- returning many
 * candidates for one query, for search-as-you-type pickers. It reuses the same cached
 * indexes and configured sources, but groups by source rather than exhausting tiers
 * across sources; see the note on the method.
 */

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import {
    normalizeType,
    getCompendiumSettingPrefix,
    getNumCompendiumsSettingName,
    getSearchWorldFirstKey,
    getSearchWorldLastKey,
    getDocumentClass,
    getDocumentSubtype,
    getPackType,
    getTypeLabel,
    getWorldCollection,
    getMappedTypes,
    isSyntheticType,
    getPackPackageLabel,
    formatPackLabel
} from './utility-compendium-types.js';
import { isNativeFoundryItemData, parseFlatItemToFoundry } from './parsers/parse-item.js';

/** Match tiers in priority order. */
const MATCH_TIERS = ['exact', 'startsWith', 'includes'];

/**
 * Index fields beyond Foundry's defaults, for callers that filter on item economics.
 *
 * DECLARED AND FIXED, never assembled per call. `getIndex({fields})` unions the request
 * with what the pack has already indexed and returns the cache only when the request is a
 * SUBSET (`client/documents/collections/compendium-collection.mjs:332`); anything wider
 * re-fetches the entire index from the server and merges. So every distinct field set in
 * play costs one more full re-fetch of every pack, for the session. One set means one
 * widening, once -- which is the whole reason this lives in the hub rather than in each
 * consumer that wants a rarity.
 *
 * Not listed here because dnd5e already indexes them (`dnd5e.mjs:82397`, verified against
 * 5.3.3): `system.container`, `system.identifier`. They ride along free and are carried
 * through by the projection.
 */
const EXTENDED_INDEX_FIELDS = ['system.rarity', 'system.price.value', 'system.price.denomination'];

/**
 * Compendium Manager Class
 * Handles all compendium lookups and provides a unified interface.
 */
export class CompendiumManager {
    constructor() {
        /**
         * packId -> { promise: Promise<Array|null>, extended: boolean }
         *
         * Only pack indexes are cached; world collections are already in memory and are
         * read live so they never go stale. `extended` records WHICH projection the
         * cached rows hold, because the two are not interchangeable in both directions --
         * see _getPackIndex for the one-way rule.
         * @private
         */
        this._indexCache = new Map();
        this._cacheHooksBound = false;
    }

    // ==============================================================
    // ===== CONFIGURATION ==========================================
    // ==============================================================

    /**
     * The full compendium mapping for a type, as configured by the GM.
     * @param {string} type - Any accepted type token ("actor", "Actor", "monster", "feat", ...)
     * @returns {{type: string, label: string, packIds: string[], searchWorldFirst: boolean,
     *            searchWorldLast: boolean, searchOrder: string[], numCompendiums: number,
     *            documentClass: string, subtype: string|null}}
     */
    getMapping(type) {
        const canonical = normalizeType(type);
        const prefix = getCompendiumSettingPrefix(canonical);

        // What the GM put in the slots is the mapping. There is no second gate: the
        // old one re-filtered saved picks against enabled packages and content
        // heuristics on every lookup, so a pack could sit visibly in a priority slot
        // and silently never be searched. The only rejection left is a pack that no
        // longer exists in this world.
        const selectorCount = Math.max(0, Number(
            getSettingSafely(MODULE.ID, getNumCompendiumsSettingName(canonical), 0)) || 0);
        const packIds = [];
        for (let i = 1; i <= selectorCount; i++) {
            const packId = getSettingSafely(MODULE.ID, `${prefix}${i}`, null);
            if (!packId || packId === 'none') continue;
            if (!game.packs.get(packId)) continue;
            if (!packIds.includes(packId)) packIds.push(packId);
        }

        const searchWorldFirst = !!getSettingSafely(MODULE.ID, getSearchWorldFirstKey(canonical), false);
        const searchWorldLast = !!getSettingSafely(MODULE.ID, getSearchWorldLastKey(canonical), false);

        const searchOrder = [];
        if (searchWorldFirst) searchOrder.push('world');
        searchOrder.push(...packIds);
        if (searchWorldLast && !searchWorldFirst) searchOrder.push('world');

        return {
            type: canonical,
            label: getTypeLabel(canonical),
            packIds,
            searchWorldFirst,
            searchWorldLast,
            searchOrder,
            numCompendiums: selectorCount,
            documentClass: getDocumentClass(canonical),
            subtype: getDocumentSubtype(canonical)
        };
    }

    /**
     * Configured pack IDs for a type, in priority order (index 0 = Priority 1).
     * @param {string} type
     * @returns {string[]}
     */
    getSelected(type) {
        return this.getMapping(type).packIds;
    }

    /**
     * Sources to search, in order: 'world' and/or pack IDs.
     * @param {string} type
     * @returns {string[]}
     */
    getSearchOrderForType(type) {
        return this.getMapping(type).searchOrder;
    }

    /**
     * Every type that has compendium mappings registered in this world.
     * @returns {string[]}
     */
    getTypes() {
        return getMappedTypes(BLACKSMITH.arrCompendiumChoicesData ?? []);
    }

    /**
     * Every INSTALLED compendium that can hold this type, ignoring the GM's mapping.
     *
     * This answers a different question from getMapping()/getSelected()/getChoices(),
     * which all answer "what did the GM pick for searching". A module that needs the
     * user to nominate a compendium for its own purpose -- an injuries table, a
     * quotations journal -- often wants one that is deliberately NOT in the search set,
     * so filtering by the search configuration would hide exactly the right answer.
     *
     * No content check at all, where getChoices() at least requires a synthetic type's
     * subtype to be present in the index. So asking for `Spell` returns every Item pack,
     * including ones holding no spells. That is the point: a caller here wants the raw
     * inventory of what could hold this document class, and will present it to a user
     * who knows which one they mean.
     *
     * @param {string} type - Any accepted type token
     * @returns {Array<{id: string, label: string, package: string, displayLabel: string,
     *                  documentClass: string, subtype: string|null, isWorld: boolean}>}
     *          Sorted by package, then pack label.
     */
    getAllPacks(type) {
        const canonical = normalizeType(type);
        if (!canonical) return [];

        const packType = getPackType(canonical);
        const subtype = getDocumentSubtype(canonical);
        const packs = [];

        for (const pack of game.packs?.values() ?? []) {
            if (String(pack?.metadata?.type ?? '') !== packType) continue;
            const id = pack.metadata.id ?? pack.collection;
            if (!id) continue;
            packs.push({
                id,
                label: pack.metadata.label ?? id,
                package: getPackPackageLabel(pack),
                // The composed "Package: Label" form, taken from the shared helper rather
                // than rebuilt here so the two cannot drift apart.
                displayLabel: formatPackLabel(pack, id),
                documentClass: getDocumentClass(canonical),
                subtype,
                isWorld: String(pack.metadata.packageType ?? '') === 'world'
                    || String(pack.collection ?? '').startsWith('world.')
            });
        }

        return packs.sort((a, b) =>
            a.package.localeCompare(b.package) || a.label.localeCompare(b.label));
    }

    /**
     * getAllPacks() as a dropdown-ready `{id: label}` object, shaped like getChoices()
     * so it drops straight into a setting's `choices`.
     *
     * The values are DISPLAY STRINGS. To lay the parts out yourself, use getAllPacks()
     * and read `label` and `package` separately rather than splitting these apart.
     *
     * @param {string} type
     * @param {object} [options]
     * @param {boolean} [options.none=true] - Include the leading "-- None --" entry
     * @returns {Object<string, string>}
     */
    getAllChoices(type, { none = true } = {}) {
        const choices = none ? { none: '-- None --' } : {};
        for (const pack of this.getAllPacks(type)) choices[pack.id] = pack.displayLabel;
        return choices;
    }

    // ==============================================================
    // ===== RESOLUTION =============================================
    // ==============================================================

    /**
     * Resolve plain text to a well-formed UUID using the configured mapping.
     *
     * @param {string} name - Plain text name, e.g. "Goblin" or "Goblin (3)"
     * @param {string} type - Type token: "actor", "item", "spell", "feature", "JournalEntry", ...
     * @param {object} [options]
     * @param {boolean} [options.exact=false]      - Only accept exact matches
     * @param {boolean} [options.fuzzy=false]      - Also allow the loose "includes" tier
     * @param {string}  [options.itemType=null]    - Prefer entries with this document subtype
     * @param {boolean} [options.parseCount=false] - Strip a trailing "(3)" / "(CR 1/2)" and report the count
     * @param {string[]} [options.sources=null]    - Optional subset of configured source ids (`world` or pack ids)
     * @returns {Promise<{found: boolean, uuid: string|null, name: string, matchedName: string|null,
     *                    packId: string|null, source: string|null, matchType: string|null,
     *                    confidence: string, documentClass: string, count: number|null, link: string|null}>}
     */
    async resolve(name, type, options = {}) {
        const {
            exact = false,
            fuzzy = false,
            itemType = null,
            parseCount = false,
            sources = null
        } = options;

        const canonical = normalizeType(type);
        const parsed = parseCount ? parseQuantity(name) : { name: String(name ?? '').trim(), count: null };
        const query = parsed.name;

        const miss = {
            found: false, uuid: null, name: query, matchedName: null,
            packId: null, source: null, matchType: null, confidence: 'none',
            documentClass: getDocumentClass(canonical), count: parsed.count, link: null
        };

        if (!query) return miss;

        const mapping = this.getMapping(canonical);
        const requestedSources = Array.isArray(sources) ? [...new Set(sources.filter(Boolean))] : null;
        const searchOrder = requestedSources
            ? requestedSources.filter(source => source === 'world' || mapping.packIds.includes(source))
            : mapping.searchOrder;
        if (!searchOrder.length) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | No sources configured for type`, canonical, true, false);
            return miss;
        }

        const tiers = exact ? ['exact'] : (fuzzy ? MATCH_TIERS : ['exact', 'startsWith']);

        // Exact-first ACROSS sources: finish tier 1 everywhere before trying tier 2
        // anywhere, so an exact hit in Priority 3 beats a prefix hit in Priority 1.
        for (const tier of tiers) {
            for (const source of searchOrder) {
                const hit = await this._matchInSource(source, canonical, query, tier, itemType);
                if (!hit) continue;

                const result = {
                    found: true,
                    uuid: hit.uuid,
                    name: query,
                    matchedName: hit.name,
                    packId: source === 'world' ? null : source,
                    source,
                    matchType: tier,
                    confidence: tier === 'exact' ? 'high' : (tier === 'startsWith' ? 'medium' : 'low'),
                    documentClass: getDocumentClass(canonical),
                    count: parsed.count,
                    link: null
                };
                result.link = formatLink(result.uuid, query, parsed.count);

                postConsoleAndNotification(MODULE.NAME,
                    `Compendium Manager | Resolved ${canonical} "${query}"`,
                    `${hit.uuid} (${tier} in ${source})`, true, false);
                return result;
            }
        }

        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Not found: ${canonical} "${query}"`, "", true, false);
        return miss;
    }

    /**
     * Resolve many names of the same type. Pack indexes are loaded once and
     * shared across the whole batch.
     * @param {Array<string|{name: string, type?: string}>} names
     * @param {string} type
     * @param {object} [options] - Same options as resolve()
     * @returns {Promise<Array<object>>} One result per input, in order
     */
    async resolveMany(names, type, options = {}) {
        if (!Array.isArray(names) || names.length === 0) return [];

        const canonical = normalizeType(type);

        // Warm every source's index once, concurrently, before resolving.
        const mapping = this.getMapping(canonical);
        const requestedSources = Array.isArray(options.sources) ? [...new Set(options.sources.filter(Boolean))] : null;
        const searchOrder = requestedSources
            ? requestedSources.filter(source => source === 'world' || mapping.packIds.includes(source))
            : mapping.searchOrder;
        await Promise.all(
            searchOrder
                .filter(source => source !== 'world')
                .map(packId => this._getPackIndex(packId).catch(() => null))
        );

        const results = [];
        for (const entry of names) {
            const isObject = entry && typeof entry === 'object';
            const rawName = isObject ? (entry.name ?? entry.itemName) : entry;
            const requestedItemType = isObject ? (entry.type ?? entry.itemType) : null;
            const perItemOptions = requestedItemType
                ? { ...options, itemType: String(requestedItemType).trim().toLowerCase() }
                : options;
            // Always push, one result per input, in order — an empty/blank entry must still yield a
            // structured miss. `resolve()` handles falsy input and returns one. Previously this
            // `continue`d past blanks, silently shortening the array and shifting every later index, so
            // callers doing `names.map((n, i) => results[i])` attached wrong UUIDs to wrong names.
            results.push(await this.resolve(rawName, canonical, perItemOptions));
        }
        return results;
    }

    /**
     * Resolve to a ready-to-embed enricher link.
     * @param {string} name
     * @param {string} type
     * @param {object} [options]
     * @param {string} [options.fallback] - Returned when nothing matches (default: the plain name)
     * @returns {Promise<string>} e.g. `@UUID[Compendium.dnd5e.monsters.Actor.abc]{Goblin} x 3`
     */
    async resolveLink(name, type, options = {}) {
        const result = await this.resolve(name, type, options);
        if (result.found) return result.link;
        if (options.fallback !== undefined) return options.fallback;
        return result.count ? `${result.name} x ${result.count}` : result.name;
    }

    /**
     * Resolve and load the actual Document.
     * @param {string} name
     * @param {string} type
     * @param {object} [options]
     * @returns {Promise<Document|null>}
     */
    async resolveDocument(name, type, options = {}) {
        const result = await this.resolve(name, type, options);
        if (!result.found) return null;
        try {
            return await fromUuid(result.uuid);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Could not load ${result.uuid}`, error, false, false);
            return null;
        }
    }

    // ==============================================================
    // ===== BROWSING ===============================================
    // ==============================================================

    /**
     * Browsable multi-result lookup: one query in, many candidates out.
     *
     * This is the inverse question from resolve(). resolve() picks a single winner and
     * therefore exhausts the exact tier across every source before trying startsWith
     * anywhere. search() feeds a list a human reads, so it walks sources in configured
     * priority order and sorts by tier WITHIN each source, keeping every compendium's
     * hits together for grouping. That ordering difference is deliberate.
     *
     * Two other deliberate differences from resolve():
     *  - `fuzzy` defaults to TRUE here. A picker wants "sword" to surface "Longsword".
     *  - `itemType` FILTERS rather than merely preferring. resolve() falls back to the
     *    unfiltered set when a subtype yields nothing, which is right for one winner and
     *    wrong for a list -- a weapon picker must not quietly list potions.
     *
     * `limit` caps the total and stops the scan: once it is reached, remaining sources
     * are never indexed. A low limit therefore truncates the tail of the priority order.
     * Use searchDetailed() when you need to know whether that happened.
     *
     * `type` may be an ARRAY of type tokens to search several at once -- see
     * searchDetailed() for why that belongs here rather than in a caller's fan-out.
     *
     * @param {string} query - Partial text, e.g. "long"
     * @param {string|string[]} type - Type token, same as resolve(), or several
     * @param {object} [options]
     * @param {string}  [options.itemType=null]  - Restrict to this document subtype, e.g. "weapon"
     * @param {number}  [options.limit=50]       - Cap total results (Infinity or <=0 for uncapped)
     * @param {string[]} [options.sources=null]  - Optional subset of configured source ids
     * @param {number}  [options.minLength=2]    - Return [] without scanning below this query length
     * @param {boolean} [options.fuzzy=true]     - Include the loose "includes" tier
     * @returns {Promise<Array<{uuid: string, name: string, type: string|null, documentClass: string,
     *                          img: string|null, source: string, sourceLabel: string,
     *                          sourcePackage: string, matchType: string}>>}
     */
    async search(query, type, options = {}) {
        return (await this.searchDetailed(query, type, options)).results;
    }

    /**
     * search(), plus a report of what the scan actually covered.
     *
     * Because `limit` stops the scan rather than only capping the output, a caller
     * holding just the array cannot tell "that pack had no matches" from "that pack
     * was never opened". Inferring it from `results.length === limit` over-reports:
     * a scan that fills the cap exactly with the last available candidate is complete,
     * not truncated. This reports it rather than leaving consumers to guess.
     *
     * MULTI-TYPE. `type` may be an array -- ['Item', 'Spell', 'Feature'], or
     * getTypes() for everything mapped. The scan is then SOURCE-MAJOR: each source is
     * opened once and every requested type reads from it, so results stay grouped by
     * compendium instead of arriving as N separate per-type lists a caller has to
     * interleave. Two things this gets right that a caller-side fan-out does not:
     *
     *  - **Deduplication.** Synthetic types share packs with Item -- a pack mapped to
     *    both Item and Spell yields its spells twice, because the Item pass is
     *    unfiltered and the Spell pass is subtype-filtered over the same entries.
     *    Merging per-type result lists therefore double-lists them. Deduped by uuid
     *    here, first type wins.
     *  - **One budget.** `limit` is the total, not per type. N calls with the same
     *    limit can return N x limit rows and each reports truncation against its own
     *    slice, which no consumer can reconcile into one honest count.
     *
     * @param {string} query
     * @param {string|string[]} type - One type token, or several
     * @param {object} [options] - Same as search()
     * @returns {Promise<{results: Array<object>, truncated: boolean, searchOrder: string[],
     *                    scannedSources: string[], skippedSources: string[]}>}
     *   - `truncated`  - the cap stopped the scan while candidates remained
     *   - `searchOrder` - every source that would have been searched, in priority order
     *   - `scannedSources` - the ones actually opened and examined
     *   - `skippedSources` - the tail never reached, in priority order
     *
     * Every field describes THIS call. For several types, `searchOrder` is the union of
     * their orders in the order the types were given, first appearance winning -- so a
     * caller passing several types gets one coherent report rather than several to
     * reconcile. A caller that still fans out itself must union the skipped sources for
     * "some content there went unsearched" and intersect for "that pack was never
     * searched at all"; the two differ, and neither is the sum of the counts.
     */
    async searchDetailed(query, type, options = {}) {
        const {
            itemType = null,
            limit = 50,
            sources = null,
            minLength = 2,
            fuzzy = true
        } = options;

        const needle = String(query ?? '').trim().toLowerCase();
        if (needle.length < minLength) {
            return { results: [], truncated: false, searchOrder: [], scannedSources: [], skippedSources: [] };
        }

        const { rarity = null, priceGp = null, includeUnpriced = false } = options;

        return this._scan({
            type,
            sources,
            subtypes: itemType ? [itemType] : null,
            needle,
            fuzzy,
            limit,
            // Search semantics: the cap STOPS the scan. Right for a picker, where the
            // head of the priority order is the best answer; see _scan.
            stopAtLimit: true,
            rarity,
            priceGp,
            includeUnpriced,
            // Only when the caller is actually asking about economics. Extending the index
            // costs one full re-fetch per pack, and a type-ahead picker that never reads a
            // rarity should not pay it -- which is also why the economics fields come back
            // null here rather than half-populated.
            extended: !!(rarity || priceGp),
            logVerb: `Searched`,
            logSubject: `"${needle}"`
        });
    }

    /**
     * Shape in, candidates out: everything in the GM's configured sources matching a set
     * of filters, with no text to match against.
     *
     * This exists because a reference stored somewhere -- a roll table row, a saved list --
     * ROTS. Rename a pack, update a content module, uninstall one, and the reference points
     * at nothing. A query resolves against what exists at the moment it runs, so it cannot
     * dangle, and it picks up newly installed content instead of freezing at whatever was
     * written down last year.
     *
     * THREE THINGS DIFFER FROM search(), all deliberate:
     *
     *  - **`limit` caps the output, it does not stop the scan.** Every configured source is
     *    opened. search() stops early because the head of the priority order is the best
     *    answer to a typed query; that reasoning does not transfer, and a stop-scan limit
     *    here would draw every result from the first configured pack and never open the
     *    sixth. `scannedSources` covering the whole order is the observable difference.
     *  - **Ordering is source, then name.** There is no match tier to sort by, and
     *    `matchType` on every row is null rather than an invented value.
     *  - **The economics fields are always populated**, because a query is the call that
     *    asks about them.
     *
     * @param {object} [filter]
     * @param {string|string[]} [filter.type='Item'] - Type token(s), same as search()
     * @param {string[]} [filter.subtypes=null] - Document subtypes to keep, e.g. ['weapon']
     * @param {string[]} [filter.rarity=null] - Rarity tokens; 'mundane' for unmarked gear
     * @param {{min?: number, max?: number}} [filter.priceGp=null] - Price window in gold
     * @param {boolean} [filter.includeUnpriced=false] - Keep entries stored at price 0
     * @param {string[]} [filter.sources=null] - Restrict to configured source ids
     * @param {number} [filter.limit=200] - Cap the output; the scan is always complete
     * @returns {Promise<Array<object>>} search() rows plus `rarity`, `price`, `priceGp`
     */
    async query(filter = {}) {
        return (await this.queryDetailed(filter)).results;
    }

    /**
     * query(), plus a report of what the scan covered.
     *
     * `scannedSources` lists EVERY configured source here, where search() can leave a tail
     * unopened -- that is the difference the two reports exist to make visible. `truncated`
     * therefore means only "there were more candidates than you asked for", never "some
     * content went unread", and `skippedSources` is empty unless a source failed to open.
     *
     * @param {object} [filter] - Same as query()
     * @returns {Promise<{results: Array<object>, truncated: boolean, searchOrder: string[],
     *                    scannedSources: string[], skippedSources: string[]}>}
     */
    async queryDetailed(filter = {}) {
        const {
            type = 'Item',
            subtypes = null,
            rarity = null,
            priceGp = null,
            includeUnpriced = false,
            sources = null,
            limit = 200
        } = filter;

        const described = [
            subtypes?.length ? subtypes.join('/') : null,
            rarity?.length ? rarity.join('/') : null,
            priceGp ? `${priceGp.min ?? ''}-${priceGp.max ?? ''}gp` : null
        ].filter(Boolean).join(' ');

        return this._scan({
            type,
            sources,
            subtypes,
            // No needle at all, which is what puts the scan in single-bucket mode.
            needle: null,
            limit,
            stopAtLimit: false,
            extended: true,
            rarity,
            priceGp,
            includeUnpriced,
            logVerb: 'Queried',
            logSubject: described ? `[${described}]` : ''
        });
    }

    // ==============================================================
    // ===== INTERNAL: MATCHING =====================================
    // ==============================================================

    /**
     * A predicate over index entries for the rarity and price options, or null when
     * neither was asked for.
     *
     * ABSENT IS NOT BLANK, and the whole filter turns on it. The projection keeps `""`
     * (a physical item nobody marked magical) distinct from `null` (a document type with
     * no such field at all -- a spell, a class, a journal entry). An entry missing the
     * field FAILS the filter rather than passing unfiltered, so asking for a price range
     * returns priced things and nothing else. The alternative reading -- ignore the filter
     * where it does not apply -- can only ever over-return, and over-returning silently is
     * how a shop ends up stocked with spells.
     *
     * @private
     * @param {object} spec
     * @param {string[]|null} spec.rarity
     * @param {{min?: number, max?: number}|null} spec.priceGp
     * @param {boolean} spec.includeUnpriced
     * @returns {((entry: object) => boolean)|null}
     */
    _buildEconomicsFilter({ rarity = null, priceGp = null, includeUnpriced = false } = {}) {
        const wantedRarity = Array.isArray(rarity) && rarity.length
            ? new Set(rarity.map(normalizeRarity).filter(Boolean))
            : null;

        const hasMin = Number.isFinite(Number(priceGp?.min));
        const hasMax = Number.isFinite(Number(priceGp?.max));
        const min = hasMin ? Number(priceGp.min) : -Infinity;
        const max = hasMax ? Number(priceGp.max) : Infinity;
        const wantsPrice = !!priceGp && (hasMin || hasMax);

        if (!wantedRarity && !wantsPrice) return null;

        return (entry) => {
            if (wantedRarity) {
                // normalizeRarity returns null for an absent field, and null is never in
                // the wanted set -- so "has no rarity" fails without a second check.
                const value = normalizeRarity(entry.rarity);
                if (!value || !wantedRarity.has(value)) return false;
            }

            if (wantsPrice) {
                if (!entry.price) return false;
                const gp = toGp(entry.price);
                if (gp === null) return false;
                // dnd5e stores an unpriced item and a free one identically (`price.value`
                // has `initial: 0`), so this cannot distinguish them and does not pretend
                // to. Excluding them is the default because a pack's unpriced entries
                // otherwise flood any range with a zero floor.
                if (gp === 0 && !includeUnpriced) return false;
                if (gp < min || gp > max) return false;
            }

            return true;
        };
    }

    /**
     * The multi-result scan, shared by searchDetailed() and queryDetailed().
     *
     * ONE ENGINE, TWO MODES. Search and query differ in exactly two ways that matter to
     * the scan, and both are explicit flags rather than something inferred from whether a
     * needle was supplied -- a reader has to be able to see which semantics a call gets:
     *
     *  - `needle` present or absent. Present, entries are classified into match tiers and
     *    emitted tier-by-tier within each source. Absent, there is one bucket per source
     *    and it sorts by name. Everything else -- the per-type plans, the source-order
     *    union, the uuid dedup, the world-vs-pack split, the source labelling -- is the
     *    same work, which is why this is one function and not two.
     *  - `stopAtLimit`. True, the cap ends the scan, so a low limit truncates the TAIL of
     *    the GM's priority order. That is right for a type-ahead picker and wrong for
     *    anything stocking from the result: a shop built on a stop-scan limit draws
     *    everything from the first configured pack and never opens the sixth. False, every
     *    source is scanned and the cap applies to the output afterwards.
     *
     * `truncated` means the same thing in both modes -- there were more candidates than the
     * caller asked for -- but only the stop-scan mode can leave sources unopened, which is
     * why `scannedSources` is the field that actually separates them.
     *
     * @private
     * @param {object} spec
     * @param {string|string[]} spec.type - Type token(s), same as search()
     * @param {string[]|null} [spec.sources] - Restrict to these configured source ids
     * @param {string[]|null} [spec.subtypes] - Restrict to these document subtypes
     * @param {string|null} [spec.needle] - Lowercased search text, or null for no text match
     * @param {boolean} [spec.fuzzy=true] - Include the loose "includes" tier (needle mode only)
     * @param {number} [spec.limit=50] - Cap; Infinity or <=0 for uncapped
     * @param {boolean} [spec.stopAtLimit=false] - Cap ends the scan rather than the output
     * @param {boolean} [spec.extended=false] - Index and populate the economics fields
     * @param {string[]|null} [spec.rarity] - Rarity tokens to keep; normalised here
     * @param {{min?: number, max?: number}|null} [spec.priceGp] - Price window in gold pieces
     * @param {boolean} [spec.includeUnpriced=false] - Keep entries stored at a price of 0
     * @param {string} [spec.logVerb] - Verb for the debug line
     * @param {string} [spec.logSubject] - Subject for the debug line
     * @returns {Promise<{results: Array<object>, truncated: boolean, searchOrder: string[],
     *                    scannedSources: string[], skippedSources: string[]}>}
     */
    async _scan({
        type,
        sources = null,
        subtypes = null,
        needle = null,
        fuzzy = true,
        limit = 50,
        stopAtLimit = false,
        extended = false,
        rarity = null,
        priceGp = null,
        includeUnpriced = false,
        logVerb = 'Scanned',
        logSubject = ''
    }) {
        const empty = (searchOrder = []) => ({
            results: [], truncated: false, searchOrder,
            scannedSources: [], skippedSources: [...searchOrder]
        });

        const canonicalTypes = [...new Set(
            (Array.isArray(type) ? type : [type]).map(t => normalizeType(t)).filter(Boolean)
        )];
        if (!canonicalTypes.length) return empty();

        const requestedSources = Array.isArray(sources) ? [...new Set(sources.filter(Boolean))] : null;
        const subtypeFilter = Array.isArray(subtypes) && subtypes.length ? new Set(subtypes) : null;
        const economicsFilter = this._buildEconomicsFilter({ rarity, priceGp, includeUnpriced });
        // A filter reads fields the base projection nulls out, so asking to filter IS asking
        // to extend. Deriving it here rather than trusting the caller means a future entry
        // point cannot pass a filter with `extended: false` and get an empty result set with
        // nothing to explain it.
        const useExtended = extended || !!economicsFilter;

        // One plan per type, then a single source order that is their union in the
        // order the types were given. First appearance wins, so a source mapped to
        // several types is opened once and appears once in the results.
        const plans = [];
        const searchOrder = [];
        for (const canonical of canonicalTypes) {
            const mapping = this.getMapping(canonical);
            const order = requestedSources
                ? requestedSources.filter(source => source === 'world' || mapping.packIds.includes(source))
                : mapping.searchOrder;
            if (!order.length) continue;
            plans.push({ type: canonical, sources: new Set(order), documentClass: getDocumentClass(canonical) });
            for (const source of order) if (!searchOrder.includes(source)) searchOrder.push(source);
        }
        if (!plans.length) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | No sources configured for type`, canonicalTypes.join(', '), true, false);
            return empty();
        }

        const cap = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
        // Needle mode emits tier by tier; no-needle mode has a single bucket, so the
        // rest of the loop does not have to know which mode it is in.
        // NULL, not falsy. An empty-string needle is still text mode -- a caller passing
        // {minLength: 0} with an empty query is asking "everything, tiered", and treating
        // that as no-needle mode would silently retier every row.
        const hasNeedle = needle !== null && needle !== undefined;
        const tiers = hasNeedle ? (fuzzy ? MATCH_TIERS : ['exact', 'startsWith']) : ['all'];
        const results = [];
        const scannedSources = [];
        const seenUuids = new Set();
        let truncated = false;

        // Labelled so hitting the cap mid-source leaves both loops at once. Without it
        // the outer loop would keep going and re-decide truncation per source.
        outer:
        for (const source of searchOrder) {
            // Reaching here with the cap already full means this source, and every
            // source after it, is never opened -- which is exactly the truncation
            // the caller cannot otherwise see. Only stop-scan mode can get here.
            if (stopAtLimit && results.length >= cap) {
                truncated = true;
                break;
            }

            const buckets = { exact: [], startsWith: [], includes: [], all: [] };
            let opened = false;

            for (const plan of plans) {
                if (!plan.sources.has(source)) continue;

                let entries;
                try {
                    entries = source === 'world'
                        ? this._getWorldEntries(plan.type)
                        : await this._getPackEntries(source, plan.type, { extended: useExtended });
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error searching ${source}`, error, false, false);
                    continue;
                }
                opened = true;
                if (!entries?.length) continue;
                if (subtypeFilter) entries = entries.filter(e => subtypeFilter.has(e.type));
                if (economicsFilter) entries = entries.filter(economicsFilter);

                for (const entry of entries) {
                    // Dedup at bucketing time, not at emit time: an entry reachable
                    // through two types must not occupy a slot twice, and the earlier
                    // type's documentClass is the one that stands.
                    if (seenUuids.has(entry.uuid)) continue;
                    const tier = hasNeedle ? classifyMatch(entry.name, needle) : 'all';
                    if (!tier) continue;
                    seenUuids.add(entry.uuid);
                    buckets[tier].push({ entry, documentClass: plan.documentClass });
                }
            }

            if (opened) scannedSources.push(source);

            // Two DISCRETE fields, never one composed string. getChoices() looks like the
            // obvious source and is not: those labels are built for a settings dropdown
            // and read "Package: Pack -- 42 Weapons, 59 Equipment, ...", which is three
            // facts glued together and unusable as a heading.
            const pack = source === 'world' ? null : game.packs.get(source);
            const sourceLabel = source === 'world' ? 'World' : (pack?.metadata?.label ?? source);
            const sourcePackage = source === 'world'
                ? (game.world?.title ?? 'World')
                : (getPackPackageLabel(pack) || '');

            for (const tier of tiers) {
                const bucket = buckets[tier].sort((a, b) => a.entry.name.localeCompare(b.entry.name));
                for (const { entry, documentClass } of bucket) {
                    // The check sits before the push, so reaching it means there WAS
                    // another candidate to emit -- which is what makes this truncation
                    // rather than a scan that happened to fill the cap exactly.
                    if (stopAtLimit && results.length >= cap) {
                        truncated = true;
                        break outer;
                    }
                    results.push({
                        uuid: entry.uuid,
                        name: entry.name,
                        type: entry.type ?? null,
                        // The document CLASS, beside the document subtype in `type`.
                        // Both are needed and they are not the same thing: a drag payload
                        // wants {type: 'Item'} while the row badge wants 'weapon'. Deriving
                        // this from the type token searched is easy to get subtly wrong,
                        // and it is free here -- so every consumer gets it rather than
                        // each carrying it through their own bookkeeping.
                        documentClass,
                        img: entry.img ?? null,
                        source,
                        sourceLabel,
                        sourcePackage,
                        // Present on EVERY row from either entry point, null when the call
                        // did not involve economics. A key that appears and disappears
                        // depending on which method produced the row is a trap, and so is
                        // one populated for world rows (where the fields are free) and null
                        // for pack rows in the same result set.
                        rarity: useExtended ? (entry.rarity ?? null) : null,
                        price: useExtended && entry.price ? { ...entry.price } : null,
                        priceGp: useExtended ? toGp(entry.price) : null,
                        // No tier was consulted when there was nothing to match against,
                        // and saying so is more honest than inventing one.
                        matchType: hasNeedle ? tier : null
                    });
                }
            }
        }

        // Full-scan mode caps here instead. Every source was opened, so `truncated` says
        // only "there were more than you asked for" -- never "some content went unread".
        if (!stopAtLimit && results.length > cap) {
            truncated = true;
            results.length = cap;
        }

        const skippedSources = searchOrder.filter(source => !scannedSources.includes(source));

        postConsoleAndNotification(MODULE.NAME,
            `Compendium Manager | ${logVerb} ${canonicalTypes.join('+')} ${logSubject}`.trim(),
            `${results.length} result(s)${truncated ? `, truncated (${skippedSources.length} source(s) not scanned)` : ''}`,
            true, false);
        return { results, truncated, searchOrder, scannedSources, skippedSources };
    }

    /**
     * Try to match a query within one source at one tier.
     * @private
     * @returns {Promise<{name: string, uuid: string}|null>}
     */
    async _matchInSource(source, type, query, tier, itemType) {
        try {
            const entries = source === 'world'
                ? this._getWorldEntries(type)
                : await this._getPackEntries(source, type);

            if (!entries?.length) return null;

            // When a subtype was requested, prefer entries matching it, then fall
            // back to the unfiltered set within this same tier.
            if (itemType) {
                const narrowed = entries.filter(e => e.type === itemType);
                const hit = matchEntries(narrowed, query, tier);
                if (hit) return hit;
            }
            return matchEntries(entries, query, tier);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error searching ${source}`, error, false, false);
            return null;
        }
    }

    /**
     * World-side candidates. Read live -- game.actors / game.items are already
     * in memory, so caching them would only risk staleness.
     *
     * There is no `extended` flag here and there should not be: a live document already
     * carries every field, so the economics come free and the two-state cache the pack
     * side needs has nothing to model. World rows therefore always populate them, which
     * also means a world entry never has to be re-read to answer a filter.
     * @private
     */
    _getWorldEntries(type) {
        const docs = getWorldCollection(type);
        if (!docs) return [];
        return docs.map(d => ({
            name: d.name,
            uuid: d.uuid,
            type: d.type,
            img: d.img ?? null,
            rarity: d.system?.rarity ?? null,
            price: d.system?.price ? { ...d.system.price } : null
        }));
    }

    /**
     * Pack-side candidates, filtered to the type's subtype if it has one.
     * @private
     */
    async _getPackEntries(packId, type, { extended = false } = {}) {
        const index = await this._getPackIndex(packId, { extended });
        if (!index) return [];

        const subtype = getDocumentSubtype(type);
        return subtype ? index.filter(e => e.type === subtype) : index;
    }

    /**
     * Load and cache a pack's index as normalized entries with UUIDs attached.
     * Concurrent callers share one in-flight promise.
     * @private
     * `img` comes free -- it is already in Foundry's default index fields for the
     * document types that have one -- and spares picker consumers a per-row document load.
     *
     * THE PROJECTION ONLY EVER WIDENS. A pack's cache is in one of two states, and the
     * transition runs one way:
     *  - A base request is satisfied by EITHER state, because the extended rows are a
     *    superset. So asking for economics once does not make every later caller pay.
     *  - An extended request against a base entry discards it and re-fetches. That is the
     *    one extra round trip per pack, once per session, and it is why the field set is
     *    a constant rather than a parameter -- see EXTENDED_INDEX_FIELDS.
     *  - An extended entry is never downgraded. Nothing gains from narrowing it, and a
     *    cache that flips back and forth would re-fetch on alternating callers.
     *
     * `extended` is a FLAG, not a field list, precisely so a caller cannot invent a third
     * state. The fields it adds are raw here -- `rarity` and `price` land as stored, with
     * no denomination conversion and no vocabulary normalisation. Interpreting them is the
     * filter's job, not the cache's.
     *
     * @param {string} packId
     * @param {object} [options]
     * @param {boolean} [options.extended=false] - Also index EXTENDED_INDEX_FIELDS
     * @returns {Promise<Array<{name: string, uuid: string, type: string, img: string|null,
     *                          rarity: string|null, price: {value: number, denomination: string}|null}>|null>}
     */
    _getPackIndex(packId, { extended = false } = {}) {
        this._ensureCacheHooks();

        const cached = this._indexCache.get(packId);
        // A base caller takes whatever is there; an extended caller takes only an
        // extended entry. Anything else falls through and re-fetches.
        if (cached && (!extended || cached.extended)) return cached.promise;

        const promise = (async () => {
            const pack = game.packs.get(packId);
            if (!pack) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Compendium not found: ${packId}`, "", true, false);
                return null;
            }

            const docClass = pack.metadata.type;
            // Foundry unions these with whatever it has already indexed, so passing them
            // to a pack that has them costs nothing and returns the cached index.
            const index = extended
                ? await pack.getIndex({ fields: EXTENDED_INDEX_FIELDS })
                : await pack.getIndex();

            return Array.from(index).map(e => ({
                name: e.name,
                type: e.type,
                img: e.img ?? null,
                uuid: e.uuid ?? `Compendium.${packId}.${docClass}.${e._id}`,
                // Dot-path index fields come back NESTED, not flattened, so these read
                // through `system` rather than off `e['system.rarity']`. Null when the
                // pack was indexed without them, and null again for a document type that
                // simply has no such field -- the filter cannot tell those apart and
                // treats both as "does not match", which is the only reading that cannot
                // silently over-return.
                rarity: extended ? (e.system?.rarity ?? null) : null,
                price: extended && e.system?.price ? { ...e.system.price } : null
            }));
        })();

        // Don't cache failures -- a transient error shouldn't poison the pack forever.
        promise.catch(() => {
            if (this._indexCache.get(packId)?.promise === promise) this._indexCache.delete(packId);
        });

        this._indexCache.set(packId, { promise, extended });
        return promise;
    }

    /**
     * Drop cached indexes when pack contents change.
     * @private
     */
    _ensureCacheHooks() {
        if (this._cacheHooksBound) return;
        this._cacheHooksBound = true;

        Hooks.on('updateCompendium', (pack) => {
            const id = pack?.collection ?? pack?.metadata?.id;
            if (id) this._indexCache.delete(id);
        });
    }

    /** Drop all cached pack indexes. Call after bulk compendium edits. */
    clearCache() {
        this._indexCache.clear();
    }

    // ==============================================================
    // ===== LEGACY SURFACE =========================================
    // ==============================================================
    // Signatures preserved. These now share the resolver above, so the
    // world-vs-compendium return-format split that used to break
    // fetchItemDocuments is gone: every one of these returns a bare UUID.

    /**
     * Get compendium settings for a type.
     * @deprecated Use getMapping(type) -- richer and type-token agnostic.
     */
    getCompendiumSettings(type) {
        const mapping = this.getMapping(type);
        const settings = {
            searchWorldFirst: mapping.searchWorldFirst,
            searchWorldLast: mapping.searchWorldLast
        };
        mapping.packIds.forEach((packId, i) => { settings[`compendium${i + 1}`] = packId; });
        return settings;
    }

    /**
     * Search order from a settings object.
     * @deprecated Use getSearchOrderForType(type).
     */
    getSearchOrder(settings, type) {
        const order = [];
        if (settings?.searchWorldFirst) order.push('world');
        Object.keys(settings ?? {})
            .filter(k => /^compendium\d+$/.test(k))
            .sort((a, b) => parseInt(a.slice(10)) - parseInt(b.slice(10)))
            .forEach(k => { if (settings[k]) order.push(settings[k]); });
        if (settings?.searchWorldLast && !settings?.searchWorldFirst) order.push('world');
        return order;
    }

    /** @returns {Promise<string|null>} UUID of the found item, or null */
    async searchItem(itemName, itemType = null) {
        const result = await this.resolve(itemName, 'Item', { itemType });
        return result.found ? result.uuid : null;
    }

    /** @returns {Promise<string|null>} UUID of the found spell, or null */
    async searchSpell(spellName) {
        const result = await this.resolve(spellName, 'Spell');
        return result.found ? result.uuid : null;
    }

    /** @returns {Promise<string|null>} UUID of the found feature, or null */
    async searchFeature(featureName) {
        const result = await this.resolve(featureName, 'Feature');
        return result.found ? result.uuid : null;
    }

    /** @returns {Promise<string|null>} UUID of the found actor, or null */
    async searchActor(actorName) {
        const result = await this.resolve(actorName, 'Actor');
        return result.found ? result.uuid : null;
    }

    /** @returns {Promise<string|null>} UUID, or null */
    async searchInSource(source, name, type, itemType = null) {
        const hit = await this._matchInSource(source, normalizeType(type), String(name ?? '').trim(), 'exact', itemType);
        return hit ? hit.uuid : null;
    }

    /** @returns {Promise<string|null>} UUID, or null */
    async searchInWorld(name, type, itemType = null) {
        return this.searchInSource('world', name, type, itemType);
    }

    /** @returns {Promise<string|null>} UUID, or null */
    async searchInCompendium(compendiumName, name, type, itemType = null) {
        return this.searchInSource(compendiumName, name, type, itemType);
    }

    /**
     * Resolve a list of names to UUIDs, dropping any that don't match.
     * @param {Array} items
     * @param {string} type
     * @returns {Promise<string[]>}
     */
    async processItemList(items, type) {
        const results = await this.resolveMany(items, type);
        return results.filter(r => r.found).map(r => r.uuid);
    }

    // ==============================================================
    // ===== ACTOR BUILDING =========================================
    // ==============================================================

    /**
     * Process character data and prepare for actor creation.
     * Items are stripped out here and re-added after creation by addItemsToActor().
     */
    async processCharacterData(characterData) {
        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing character data', 'items, spells, features', false, false);

        const processedData = { ...characterData };

        processedData._originalItems = characterData.items || [];
        processedData._originalSpells = characterData.spells || [];
        processedData._originalFeatures = characterData.features || [];
        processedData._originalCurrency = characterData.currency || [];

        delete processedData.items;
        delete processedData.spells;
        delete processedData.features;
        delete processedData.currency;

        return processedData;
    }

    /**
     * Resolve Actor inventory references and parse inline definitions without creating documents.
     * Returns user-facing warnings for anything that would be skipped during post-processing.
     */
    async validateCharacterItems(characterData) {
        const warnings = [];
        const groups = [
            [characterData._originalItems ?? characterData.items, 'Item'],
            [characterData._originalSpells ?? characterData.spells, 'Spell'],
            [characterData._originalFeatures ?? characterData.features, 'Feature']
        ];
        for (const [list, type] of groups) {
            if (!Array.isArray(list) || !list.length) continue;
            const inline = list.filter(entry => this._isInlineItemDefinition(entry));
            const references = list.filter(entry => !this._isInlineItemDefinition(entry));
            for (const reference of references) this._validateItemReferenceWrapper(reference);
            const referencesByType = this._groupReferencesByMappingType(references, type);
            for (const [mappingType, mappedReferences] of referencesByType) {
                for (const result of await this.resolveMany(mappedReferences, mappingType)) {
                    if (!result.found) warnings.push(`No matching ${mappingType} named "${result.name || '(blank name)'}" was found.`);
                }
            }
            for (const definition of inline) {
                try {
                    await parseFlatItemToFoundry({
                        ...definition,
                        itemImagePath: definition.itemImagePath || definition.img || 'icons/svg/item-bag.svg'
                    });
                } catch (error) {
                    const name = definition?.name || definition?.itemName || '(unnamed inline item)';
                    warnings.push(`Inline ${type} "${name}" is invalid: ${error.message}`);
                }
            }
        }
        return warnings;
    }

    /**
     * Add items, spells, and features to an existing actor.
     */
    async addItemsToActor(actor, characterData) {
        if (!actor) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No actor provided for item addition', "", false, false);
            throw new Error('No Actor was provided for item post-processing.');
        }

        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Adding items to actor', actor.name, false, false);

        const allItems = [];
        const unresolved = [];
        const groups = [
            [characterData._originalItems, 'Item'],
            [characterData._originalSpells, 'Spell'],
            [characterData._originalFeatures, 'Feature']
        ];

        for (const [list, type] of groups) {
            if (!Array.isArray(list) || !list.length) continue;
            const inline = list.filter(entry => this._isInlineItemDefinition(entry));
            const references = list.filter(entry => !this._isInlineItemDefinition(entry));
            const documents = [];
            const referencesByType = this._groupReferencesByMappingType(references, type);
            for (const [mappingType, mappedReferences] of referencesByType) {
                documents.push(...await this.fetchItemDocuments(mappedReferences, mappingType, unresolved));
            }
            for (const definition of inline) {
                try {
                    documents.push(await parseFlatItemToFoundry(definition));
                } catch (error) {
                    const name = definition?.name || definition?.itemName || '(unnamed inline item)';
                    unresolved.push(`${type}: ${name}`);
                    postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Invalid inline ${type}: ${name}`, error, false, false);
                }
            }
            allItems.push(...documents);
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | ${type} documents fetched`, `${documents.length}/${list.length}`, true, false);
        }

        if (Array.isArray(characterData._originalCurrency) && characterData._originalCurrency.length) {
            await this.setActorCurrency(actor, characterData._originalCurrency);
        }

        if (unresolved.length) {
            const message = `Imported ${actor.name}, but could not add: ${unresolved.join(', ')}`;
            postConsoleAndNotification(MODULE.NAME, message, '', false, false);
            ui.notifications.warn(message);
        }

        if (!allItems.length) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No items to add', "", false, false);
            return { unresolved, embeddedCount: 0, embeddedDocuments: [] };
        }

        try {
            const embeddedDocuments = await actor.createEmbeddedDocuments('Item', allItems);
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Added ${allItems.length} items to ${actor.name}`, "", false, false);
            return { unresolved, embeddedCount: allItems.length, embeddedDocuments };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error adding items to ${actor.name}`, error, false, false);
            ui.notifications.error(`Imported ${actor.name}, but its inline or resolved Items could not be embedded: ${error.message}`);
            throw error;
        }
    }

    /**
     * Inline definitions use either native Foundry Item data or Blacksmith's flat item schema.
     * Lightweight `{name, type?}` objects remain compendium references.
     * @param {*} entry
     * @returns {boolean}
     * @private
     */
    _isInlineItemDefinition(entry) {
        return isNativeFoundryItemData(entry)
            || !!(entry && typeof entry === 'object' && typeof entry.itemName === 'string' && !this._isItemReferenceWrapper(entry));
    }

    /**
     * Friendly reference plus Actor-local state. This deliberately remains on
     * the name-resolution path rather than becoming an incomplete flat Item.
     */
    _isItemReferenceWrapper(entry) {
        if (!entry || typeof entry !== 'object' || typeof entry.itemName !== 'string') return false;
        const wrapperKeys = new Set(['itemName', 'itemType', 'name', 'type', 'equipped', 'attuned', 'prepared', 'quantity']);
        return Object.keys(entry).every(key => wrapperKeys.has(key));
    }

    /**
     * Character foundation references are Item documents with independent
     * compendium mappings. Ordinary inventory remains on the Item mapping.
     */
    _referenceMappingType(entry, fallbackType) {
        if (String(fallbackType).toLowerCase() !== 'item' || !entry || typeof entry !== 'object') return fallbackType;
        const subtype = String(entry.type || entry.itemType || '').trim().toLowerCase();
        const mappingType = ({ race: 'Species', species: 'Species', background: 'Background', class: 'Class', subclass: 'Subclass' })[subtype];
        if (!mappingType) return fallbackType;
        // Existing worlds historically resolved every foundation through Item.
        // Preserve that path until the GM configures this dedicated mapping.
        return this.getSearchOrderForType(mappingType).length ? mappingType : fallbackType;
    }

    _groupReferencesByMappingType(references, fallbackType) {
        const groups = new Map();
        for (const reference of references) {
            const mappingType = this._referenceMappingType(reference, fallbackType);
            if (!groups.has(mappingType)) groups.set(mappingType, []);
            groups.get(mappingType).push(reference);
        }
        return groups;
    }

    _validateItemReferenceWrapper(entry) {
        if (!this._isItemReferenceWrapper(entry)) return;
        if (entry.quantity !== undefined) {
            const quantity = Number(entry.quantity);
            if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`Item reference "${entry.itemName}" requires a non-negative integer quantity`);
        }
        for (const key of ['equipped', 'attuned', 'prepared']) {
            if (entry[key] !== undefined && typeof entry[key] !== 'boolean') {
                throw new Error(`Item reference "${entry.itemName}" requires ${key} to be true or false`);
            }
        }
        if (entry.prepared !== undefined && String(entry.itemType || '').trim().toLowerCase() !== 'spell') {
            throw new Error(`Only Spell references may set prepared (${entry.itemName})`);
        }
    }

    /**
     * Resolve names to item data objects ready for createEmbeddedDocuments.
     * @param {Array} itemNames
     * @param {string} type
     * @returns {Promise<Array<object>>}
     */
    async fetchItemDocuments(itemNames, type, unresolved = []) {
        const results = await this.resolveMany(itemNames, type);
        const items = [];

        for (let index = 0; index < results.length; index++) {
            const result = results[index];
            const reference = itemNames[index];
            if (!result.found) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Unresolved ${type}: ${result.name}`, "", true, false);
                unresolved.push(`${type}: ${result.name || '(blank name)'}`);
                continue;
            }
            try {
                // fromUuid handles both world and compendium UUIDs, so world hits
                // no longer fall through the way the old @Compendium[...] regex did.
                const document = await fromUuid(result.uuid);
                if (!document) {
                    postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Document not found`, result.uuid, true, false);
                    continue;
                }
                const itemData = document.toObject();
                delete itemData._id;
                if (itemData.type === 'class' && reference && typeof reference === 'object' && reference.levels !== undefined) {
                    const levels = Number(reference.levels);
                    if (!Number.isInteger(levels) || levels < 1 || levels > 20) {
                        throw new Error(`Class reference "${result.name}" requires integer levels from 1 through 20`);
                    }
                    itemData.system = itemData.system || {};
                    itemData.system.levels = levels;
                }
                if (reference && typeof reference === 'object') {
                    itemData.system = itemData.system || {};
                    if (reference.quantity !== undefined) {
                        const quantity = Number(reference.quantity);
                        if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`Item reference "${result.name}" requires a non-negative integer quantity`);
                        itemData.system.quantity = quantity;
                    }
                    if (reference.equipped !== undefined) itemData.system.equipped = !!reference.equipped;
                    if (reference.attuned !== undefined) itemData.system.attuned = !!reference.attuned;
                    if (reference.prepared !== undefined) {
                        if (itemData.type !== 'spell') throw new Error(`Only Spell references may set prepared (${result.name})`);
                        itemData.system.prepared = reference.prepared ? 1 : 0;
                    }
                }
                items.push(itemData);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error fetching ${result.name}`, error, false, false);
            }
        }

        return items;
    }

    /**
     * Set currency directly on the actor.
     */
    async setActorCurrency(actor, currencyData) {
        if (!Array.isArray(currencyData) || currencyData.length === 0) return;

        const denominations = {
            gp: ['gp', 'gold', 'gold piece', 'gold pieces'],
            sp: ['sp', 'silver', 'silver piece', 'silver pieces'],
            cp: ['cp', 'copper', 'copper piece', 'copper pieces'],
            ep: ['ep', 'electrum', 'electrum piece', 'electrum pieces'],
            pp: ['pp', 'platinum', 'platinum piece', 'platinum pieces']
        };

        const currencyUpdate = {};
        for (const currency of currencyData) {
            if (!currency?.type || !currency?.value) continue;
            const token = String(currency.type).toLowerCase();
            const field = Object.keys(denominations).find(k => denominations[k].includes(token));
            if (field) currencyUpdate[`system.currency.${field}`] = currency.value;
        }

        if (!Object.keys(currencyUpdate).length) return;

        try {
            await actor.update(currencyUpdate);
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Currency updated on ${actor.name}`, currencyUpdate, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error updating currency on ${actor.name}`, error, false, false);
        }
    }
}

// ==============================================================
// ===== HELPERS ================================================
// ==============================================================

/**
 * Find the first entry matching a query at a given tier.
 * @param {Array<{name: string, uuid: string}>} entries
 * @param {string} query
 * @param {string} tier - 'exact' | 'startsWith' | 'includes'
 * @returns {{name: string, uuid: string}|null}
 */
function matchEntries(entries, query, tier) {
    const needle = query.toLowerCase();
    switch (tier) {
        case 'exact':
            return entries.find(e => e.name?.toLowerCase() === needle) ?? null;
        case 'startsWith':
            return entries.find(e => e.name?.toLowerCase().startsWith(needle)) ?? null;
        case 'includes':
            return entries.find(e => e.name?.toLowerCase().includes(needle)) ?? null;
        default:
            return null;
    }
}

/**
 * The best tier a single candidate name matches at, or null for no match.
 * Tiers are mutually exclusive here so a candidate appears once in a search result.
 * @param {string} name
 * @param {string} needle - Already trimmed and lower-cased
 * @returns {'exact'|'startsWith'|'includes'|null}
 */
function classifyMatch(name, needle) {
    const candidate = String(name ?? '').toLowerCase();
    if (!candidate) return null;
    if (candidate === needle) return 'exact';
    if (candidate.startsWith(needle)) return 'startsWith';
    if (candidate.includes(needle)) return 'includes';
    return null;
}

/**
 * Split a trailing quantity or CR annotation off a name.
 * "Goblin (3)" -> { name: "Goblin", count: 3 }
 * "Goblin (CR 1/4)" -> { name: "Goblin", count: null }
 * @param {string} text
 * @returns {{name: string, count: number|null}}
 */
export function parseQuantity(text) {
    const raw = String(text ?? '').trim();
    if (!raw) return { name: '', count: null };

    // A trailing "(3)" is a count; "(CR 1/2)" and similar are not.
    const countMatch = raw.match(/\((\d+)\)[^(]*$/);
    const count = countMatch ? parseInt(countMatch[1], 10) : null;

    const name = raw
        .replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)|\s*\(CR\s*[0-9/]+\)/g, '')
        .trim();

    return { name: name || raw, count };
}

/**
 * Build a Foundry enricher link.
 * @param {string} uuid
 * @param {string} label
 * @param {number|null} [count]
 * @returns {string}
 */
export function formatLink(uuid, label, count = null) {
    const link = `@UUID[${uuid}]{${label}}`;
    return count ? `${link} x ${count}` : link;
}

// ==============================================================
// ===== ITEM ECONOMICS =========================================
// ==============================================================
// Three dnd5e facts a consumer cannot verify from the outside and would each get
// wrong exactly once. They live here, and are exposed on the API, because Merchant
// is not the last module that will want to filter items by what they cost.

/** The token this system does not have a key for: gear with no rarity at all. */
export const RARITY_MUNDANE = 'mundane';

/**
 * A rarity token in whatever shape a caller typed it, as the key dnd5e stores.
 *
 * TWO TRAPS, and the first is the expensive one.
 *
 * **Mundane gear is blank, not "common".** `system.rarity` is
 * `StringField({required: true, blank: true})` (`dnd5e.mjs:14077`, verified against
 * 5.3.3), and non-magical equipment carries `""`. A shop stocking basic gear and
 * asking for common plus uncommon therefore gets ONLY MAGIC ITEMS -- silently, with a
 * result set that looks entirely plausible. `mundane` is the explicit token for it and
 * maps to `""` in both directions; it is not a dnd5e key and is not meant to be.
 *
 * **The keys are camelCase and the labels are not.** A caller reads "Very Rare" in the
 * item sheet and types `very rare`, so spacing and case are normalised away rather than
 * silently matching nothing.
 *
 * BLANK IS NOT ABSENT. `""` normalises to RARITY_MUNDANE, because a physical item with no
 * rarity set is mundane. `null`/`undefined` normalise to `null`, because a document type
 * that has no rarity field at all -- a spell, a class -- is not mundane, it is outside the
 * question. Filters lean on that difference: it is what stops a rarity filter from quietly
 * matching every spell in the world.
 *
 * @param {string|null|undefined} token
 * @returns {string|null} A `CONFIG.DND5E.itemRarity` key, RARITY_MUNDANE, or null if the
 *                        token names no rarity this system defines.
 */
export function normalizeRarity(token) {
    if (token === null || token === undefined) return null;

    const flat = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!flat || flat === RARITY_MUNDANE || flat === 'none') return RARITY_MUNDANE;

    const keys = Object.keys(CONFIG?.DND5E?.itemRarity ?? {});
    return keys.find(key => key.toLowerCase() === flat) ?? null;
}

/**
 * A stored price as a number of gold pieces.
 *
 * dnd5e stores `{value, denomination}` and gp is the pivot -- `DND5E.currencies` gives
 * cp 100, sp 10, ep 2, gp 1, pp 0.1 -- so 50 sp is 5 gp and comparing raw
 * `system.price.value` across items is wrong for anything not priced in gp. Dividing by
 * the conversion is the whole of it, and it is here so that three modules do not each
 * discover the direction by trial.
 *
 * An UNKNOWN denomination returns null rather than being treated as gp. A module adding
 * its own currency would otherwise have every price silently misread by a factor nobody
 * can see, which is worse than a missing number.
 *
 * Note that this cannot tell FREE from UNPRICED: `price.value` has `initial: 0`, so both
 * are stored as 0 and both come back as 0. Callers filtering on price handle that with an
 * explicit option rather than by guessing here.
 *
 * @param {{value: number, denomination: string}|null|undefined} price
 * @returns {number|null}
 */
export function toGp(price) {
    const value = Number(price?.value);
    if (!Number.isFinite(value)) return null;

    const denomination = price?.denomination || CONFIG?.DND5E?.defaultCurrency || 'gp';
    const conversion = Number(CONFIG?.DND5E?.currencies?.[denomination]?.conversion);
    if (!Number.isFinite(conversion) || conversion <= 0) return null;

    return value / conversion;
}

// Create a singleton instance
export const compendiumManager = new CompendiumManager();

// Export the class for custom instances if needed
export default CompendiumManager;
