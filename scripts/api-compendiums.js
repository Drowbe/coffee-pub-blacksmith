/**
 * Compendiums API - Public surface for compendium mapping and name resolution.
 *
 * Exposed as `game.modules.get('coffee-pub-blacksmith').api.compendiums`
 * and `BlacksmithAPI.getCompendiums()`.
 *
 * Two things live here:
 *  1. READ the GM's compendium mapping (which packs, in what priority, for what type).
 *  2. RESOLVE plain text to a well-formed UUID using that mapping.
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
     * @returns {string[]} e.g. ["Actor", "Item", "JournalEntry", "RollTable", "Spell", "Feature"]
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
     * Dropdown choices ({packId: label}) for a type -- handy for building your
     * own settings UI that mirrors Blacksmith's.
     * @param {string} type
     * @returns {Object<string, string>}
     */
    getChoices: (type) => BLACKSMITH[getChoicesArrayKey(type)] ?? { none: '-- None --' },

    // ===== RESOLUTION =====

    /**
     * Resolve plain text to a UUID using the GM's configured mapping.
     *
     * Matching is exact-first across ALL configured sources, then startsWith.
     * Pass {exact: true} for exact-only, or {fuzzy: true} to also allow substring
     * matches. The result's `matchType`/`confidence` tell you which tier hit.
     *
     * @param {string} name - e.g. "Goblin", "Longsword"
     * @param {string} type - e.g. "actor", "item", "spell", "feature"
     * @param {object} [options]
     * @param {boolean} [options.exact=false]      - Exact matches only
     * @param {boolean} [options.fuzzy=false]      - Allow loose substring matching
     * @param {string}  [options.itemType=null]    - Prefer this document subtype (e.g. "weapon")
     * @param {boolean} [options.parseCount=false] - Strip a trailing "(3)" and report it as count
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
