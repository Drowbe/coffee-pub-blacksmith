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
    isSyntheticType
} from './compendium-types.js';

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
        const numSetting = getNumCompendiumsSettingName(canonical);
        const prefix = getCompendiumSettingPrefix(canonical);
        const numCompendiums = getSettingSafely(MODULE.ID, numSetting, 1) ?? 1;

        const packIds = [];
        for (let i = 1; i <= numCompendiums; i++) {
            const packId = getSettingSafely(MODULE.ID, `${prefix}${i}`, null);
            if (packId && packId !== 'none' && packId !== '') packIds.push(packId);
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
            numCompendiums,
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
     * @returns {Promise<{found: boolean, uuid: string|null, name: string, matchedName: string|null,
     *                    packId: string|null, source: string|null, matchType: string|null,
     *                    confidence: string, documentClass: string, count: number|null, link: string|null}>}
     */
    async resolve(name, type, options = {}) {
        const {
            exact = false,
            fuzzy = false,
            itemType = null,
            parseCount = false
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

        const { searchOrder } = this.getMapping(canonical);
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
        const { searchOrder } = this.getMapping(canonical);
        await Promise.all(
            searchOrder
                .filter(source => source !== 'world')
                .map(packId => this._getPackIndex(packId).catch(() => null))
        );

        const results = [];
        for (const entry of names) {
            const isObject = entry && typeof entry === 'object';
            const rawName = isObject ? entry.name : entry;
            if (!rawName) continue;
            const perItemOptions = isObject && entry.type
                ? { ...options, itemType: entry.type }
                : options;
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
        return docs.map(d => ({ name: d.name, uuid: d.uuid, type: d.type }));
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
     * @returns {Promise<Array<{name: string, uuid: string, type: string}>|null>}
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
     * Add items, spells, and features to an existing actor.
     */
    async addItemsToActor(actor, characterData) {
        if (!actor) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No actor provided for item addition', "", false, false);
            return;
        }

        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Adding items to actor', actor.name, false, false);

        const allItems = [];
        const groups = [
            [characterData._originalItems, 'Item'],
            [characterData._originalSpells, 'Spell'],
            [characterData._originalFeatures, 'Feature']
        ];

        for (const [list, type] of groups) {
            if (!Array.isArray(list) || !list.length) continue;
            const documents = await this.fetchItemDocuments(list, type);
            allItems.push(...documents);
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | ${type} documents fetched`, `${documents.length}/${list.length}`, true, false);
        }

        if (Array.isArray(characterData._originalCurrency) && characterData._originalCurrency.length) {
            await this.setActorCurrency(actor, characterData._originalCurrency);
        }

        if (!allItems.length) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No items to add', "", false, false);
            return;
        }

        try {
            await actor.createEmbeddedDocuments('Item', allItems);
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Added ${allItems.length} items to ${actor.name}`, "", false, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error adding items to ${actor.name}`, error, false, false);
        }
    }

    /**
     * Resolve names to item data objects ready for createEmbeddedDocuments.
     * @param {Array} itemNames
     * @param {string} type
     * @returns {Promise<Array<object>>}
     */
    async fetchItemDocuments(itemNames, type) {
        const results = await this.resolveMany(itemNames, type);
        const items = [];

        for (const result of results) {
            if (!result.found) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Unresolved ${type}: ${result.name}`, "", true, false);
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
