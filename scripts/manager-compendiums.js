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
} from './compendium-types.js';
import { isNativeFoundryItemData, parseFlatItemToFoundry } from './parsers/parse-item.js';
import {
    getAutomaticCompendiumPackIds,
    getCompendiumSourceId,
    getCompendiumSourceSettingKey,
    getInstalledCompendiumSources,
    isSourceAggregatedMappingType,
    getMappedSourceGroups,
    expandMappedSelection
} from './utility-compendium-auto-map.js';

/** Match tiers in priority order. */
const MATCH_TIERS = ['exact', 'startsWith', 'includes'];

/**
 * Compendium Manager Class
 * Handles all compendium lookups and provides a unified interface.
 */
export class CompendiumManager {
    constructor() {
        /**
         * packId -> Promise<{ entries: Array, byName: Map<string, Array> }>
         * Only pack indexes are cached; world collections are already in memory
         * and are read live so they never go stale.
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

        const sourcePool = getInstalledCompendiumSources()
            .filter(source => getSettingSafely(MODULE.ID, getCompendiumSourceSettingKey(source.id), true))
            .map(source => source.id);
        const enabledSources = new Set(sourcePool);
        const eligiblePackIds = getAutomaticCompendiumPackIds(canonical, { sourceIds: sourcePool });
        const eligiblePacks = new Set(eligiblePackIds);
        const selectorCount = isSourceAggregatedMappingType(canonical)
            ? getMappedSourceGroups(canonical, { sourceIds: sourcePool }).length
            : eligiblePackIds.length;
        const manualPackIds = [];
        for (let i = 1; i <= selectorCount; i++) {
            const selection = getSettingSafely(MODULE.ID, `${prefix}${i}`, null);
            for (const packId of expandMappedSelection(canonical, selection, { sourceIds: sourcePool })) {
                if (!manualPackIds.includes(packId)) manualPackIds.push(packId);
            }
        }
        const availableManualPackIds = manualPackIds.filter(packId => {
            const pack = game.packs.get(packId);
            return pack && enabledSources.has(getCompendiumSourceId(pack)) && eligiblePacks.has(packId);
        });
        const packIds = availableManualPackIds;

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
     * Nothing is filtered out: not the enabled-source checkboxes, and not the content
     * heuristics behind getChoices(). Those heuristics are strict -- a JournalEntry pack
     * must pass `isPrimaryJournalCompendium`, and a Spell pack must actually contain
     * spells -- which is correct for a search mapping and wrong for "let the user pick
     * any journal compendium".
     *
     * Synthetic types therefore return every pack of their document class: asking for
     * `Spell` returns all Item packs, because content sniffing is the very filter this
     * method exists to escape. Use getChoices() when you want the narrowed set.
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

        const empty = (searchOrder = []) => ({
            results: [], truncated: false, searchOrder,
            scannedSources: [], skippedSources: [...searchOrder]
        });

        const needle = String(query ?? '').trim().toLowerCase();
        if (needle.length < minLength) return empty();

        const canonicalTypes = [...new Set(
            (Array.isArray(type) ? type : [type]).map(t => normalizeType(t)).filter(Boolean)
        )];
        if (!canonicalTypes.length) return empty();

        const requestedSources = Array.isArray(sources) ? [...new Set(sources.filter(Boolean))] : null;

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
        const tiers = fuzzy ? MATCH_TIERS : ['exact', 'startsWith'];
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
            // the caller cannot otherwise see.
            if (results.length >= cap) {
                truncated = true;
                break;
            }

            const buckets = { exact: [], startsWith: [], includes: [] };
            let opened = false;

            for (const plan of plans) {
                if (!plan.sources.has(source)) continue;

                let entries;
                try {
                    entries = source === 'world'
                        ? this._getWorldEntries(plan.type)
                        : await this._getPackEntries(source, plan.type);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error searching ${source}`, error, false, false);
                    continue;
                }
                opened = true;
                if (!entries?.length) continue;
                if (itemType) entries = entries.filter(e => e.type === itemType);

                for (const entry of entries) {
                    // Dedup at bucketing time, not at emit time: an entry reachable
                    // through two types must not occupy a slot twice, and the earlier
                    // type's documentClass is the one that stands.
                    if (seenUuids.has(entry.uuid)) continue;
                    const tier = classifyMatch(entry.name, needle);
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
                    if (results.length >= cap) {
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
                        matchType: tier
                    });
                }
            }
        }

        const skippedSources = searchOrder.filter(source => !scannedSources.includes(source));

        postConsoleAndNotification(MODULE.NAME,
            `Compendium Manager | Searched ${canonicalTypes.join('+')} "${needle}"`,
            `${results.length} result(s)${truncated ? `, truncated (${skippedSources.length} source(s) not scanned)` : ''}`,
            true, false);
        return { results, truncated, searchOrder, scannedSources, skippedSources };
    }

    // ==============================================================
    // ===== INTERNAL: MATCHING =====================================
    // ==============================================================

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
     * @private
     */
    _getWorldEntries(type) {
        const docs = getWorldCollection(type);
        if (!docs) return [];
        return docs.map(d => ({ name: d.name, uuid: d.uuid, type: d.type, img: d.img ?? null }));
    }

    /**
     * Pack-side candidates, filtered to the type's subtype if it has one.
     * @private
     */
    async _getPackEntries(packId, type) {
        const index = await this._getPackIndex(packId);
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
     * @returns {Promise<Array<{name: string, uuid: string, type: string, img: string|null}>|null>}
     */
    _getPackIndex(packId) {
        this._ensureCacheHooks();

        if (this._indexCache.has(packId)) return this._indexCache.get(packId);

        const promise = (async () => {
            const pack = game.packs.get(packId);
            if (!pack) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Compendium not found: ${packId}`, "", true, false);
                return null;
            }

            const docClass = pack.metadata.type;
            const index = await pack.getIndex();
            return Array.from(index).map(e => ({
                name: e.name,
                type: e.type,
                img: e.img ?? null,
                uuid: e.uuid ?? `Compendium.${packId}.${docClass}.${e._id}`
            }));
        })();

        // Don't cache failures -- a transient error shouldn't poison the pack forever.
        promise.catch(() => this._indexCache.delete(packId));

        this._indexCache.set(packId, promise);
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

// Create a singleton instance
export const compendiumManager = new CompendiumManager();

// Export the class for custom instances if needed
export default CompendiumManager;
