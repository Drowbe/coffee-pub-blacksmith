/**
 * Compendium Types - Canonical Taxonomy
 *
 * SINGLE SOURCE OF TRUTH for compendium type tokens and the setting keys derived
 * from them. Previously this mapping was duplicated (and drifted) across
 * settings.js, manager-compendiums.js, manager-journal-tools.js and
 * utility-common.js.
 *
 * The canonical type token is the Foundry document type ("Actor", "Item",
 * "JournalEntry", "RollTable", ...) plus two synthetic content-based types
 * ("Spell", "Feature") which live inside Item packs but are mapped separately.
 *
 * Setting keys keep their historical (inconsistent) names for backward
 * compatibility -- Actor maps to "monsterCompendium{i}", Feature maps to
 * "featuresCompendium{i}". Never hand-build these keys; always go through the
 * helpers here so the forward and reverse mappings stay in sync.
 */

/** Synthetic types that are stored in Item packs but mapped independently. */
export const SYNTHETIC_TYPES = ['Spell', 'Feature'];

/**
 * Per-type overrides. Anything not listed here is derived mechanically from the
 * Foundry type token, so new document types work without a code change.
 */
const TYPE_OVERRIDES = {
    Actor:   { prefix: 'monsterCompendium',  num: 'numCompendiumsActor',   array: 'arrSelectedMonsterCompendiums', plural: 'Actors',  label: 'Actors',  docClass: 'Actor' },
    Item:    { prefix: 'itemCompendium',     num: 'numCompendiumsItem',    array: 'arrSelectedItemCompendiums',    plural: 'Items',   label: 'Items',   docClass: 'Item' },
    Spell:   { prefix: 'spellCompendium',    num: 'numCompendiumsSpell',   array: 'arrSelectedSpellCompendiums',   plural: 'Spells',  label: 'Spells',  docClass: 'Item', packType: 'Item', subtype: 'spell', choices: 'arrSpellChoices' },
    Feature: { prefix: 'featuresCompendium', num: 'numCompendiumsFeature', array: 'arrSelectedFeatureCompendiums', plural: 'Features', label: 'Features', docClass: 'Item', packType: 'Item', subtype: 'feat', choices: 'arrFeatureChoices' },

    JournalEntry: { plural: 'JournalEntries', label: 'Journal Entries' },
    RollTable:    { plural: 'RollTables',     label: 'Roll Tables' },
    Cards:        { plural: 'Cards',          label: 'Cards' }
};

/**
 * Accepted aliases -> canonical type. Lets callers pass whatever token their
 * corner of the codebase historically used ('actor', 'monster', 'feat', ...).
 * Keys are lowercased at lookup time.
 */
const TYPE_ALIASES = {
    actor: 'Actor', actors: 'Actor', monster: 'Actor', monsters: 'Actor', npc: 'Actor', creature: 'Actor',
    item: 'Item', items: 'Item', equipment: 'Item', gear: 'Item',
    spell: 'Spell', spells: 'Spell',
    feature: 'Feature', features: 'Feature', feat: 'Feature', feats: 'Feature',
    journal: 'JournalEntry', journalentry: 'JournalEntry', journalentries: 'JournalEntry',
    rolltable: 'RollTable', rolltables: 'RollTable', table: 'RollTable', tables: 'RollTable',
    scene: 'Scene', scenes: 'Scene',
    macro: 'Macro', macros: 'Macro',
    playlist: 'Playlist', playlists: 'Playlist',
    adventure: 'Adventure', adventures: 'Adventure',
    card: 'Cards', cards: 'Cards'
};

/**
 * Normalize any caller-supplied type token to its canonical form.
 * Case-insensitive; accepts historical aliases.
 * @param {string} type - e.g. "actor", "Monster", "feat", "JournalEntry"
 * @returns {string|null} Canonical type, or null if unrecognized
 */
export function normalizeType(type) {
    if (!type || typeof type !== 'string') return null;
    const trimmed = type.trim();
    if (!trimmed) return null;

    // Already canonical (exact match on a known or derivable Foundry type)
    if (TYPE_OVERRIDES[trimmed]) return trimmed;

    const alias = TYPE_ALIASES[trimmed.toLowerCase()];
    if (alias) return alias;

    // Unknown but plausibly a real Foundry document type -- PascalCase it and
    // let it through so new pack types keep working without a code change.
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** @returns {string} Setting prefix, e.g. "monsterCompendium" for "Actor" */
export function getCompendiumSettingPrefix(type) {
    const t = normalizeType(type);
    if (TYPE_OVERRIDES[t]?.prefix) return TYPE_OVERRIDES[t].prefix;
    return `${t.charAt(0).toLowerCase()}${t.slice(1)}Compendium`;
}

/** @returns {string} Count setting name, e.g. "numCompendiumsActor" */
export function getNumCompendiumsSettingName(type) {
    const t = normalizeType(type);
    if (TYPE_OVERRIDES[t]?.num) return TYPE_OVERRIDES[t].num;
    return `numCompendiums${t}`;
}

/** @returns {string} BLACKSMITH array name, e.g. "arrSelectedMonsterCompendiums" */
export function getSelectedArrayName(type) {
    const t = normalizeType(type);
    if (TYPE_OVERRIDES[t]?.array) return TYPE_OVERRIDES[t].array;
    return `arrSelected${t}Compendiums`;
}

/** @returns {string} Plural token used in searchWorld{Plural}First/Last keys */
export function getSearchWorldPlural(type) {
    const t = normalizeType(type);
    return TYPE_OVERRIDES[t]?.plural ?? `${t}s`;
}

/** @returns {string} Human-readable label, e.g. "Journal Entries" */
export function getTypeLabel(type) {
    const t = normalizeType(type);
    return TYPE_OVERRIDES[t]?.label ?? t;
}

/** @returns {string} BLACKSMITH key holding the dropdown choices for this type */
export function getChoicesArrayKey(type) {
    const t = normalizeType(type);
    if (TYPE_OVERRIDES[t]?.choices) return TYPE_OVERRIDES[t].choices;
    return `arrCompendiumChoices${t}`;
}

/** @returns {string} searchWorld{Plural}First setting key */
export function getSearchWorldFirstKey(type) {
    return `searchWorld${getSearchWorldPlural(type)}First`;
}

/** @returns {string} searchWorld{Plural}Last setting key */
export function getSearchWorldLastKey(type) {
    return `searchWorld${getSearchWorldPlural(type)}Last`;
}

/**
 * The Foundry document class a resolved entry of this type will be.
 * Spell and Feature both live in Item packs.
 * @returns {string} e.g. "Item" for "Spell"
 */
export function getDocumentClass(type) {
    const t = normalizeType(type);
    return TYPE_OVERRIDES[t]?.docClass ?? t;
}

/**
 * The pack `type` whose compendiums are eligible for this mapped type.
 * Spell/Feature draw from Item packs.
 * @returns {string} e.g. "Item" for "Feature"
 */
export function getPackType(type) {
    const t = normalizeType(type);
    return TYPE_OVERRIDES[t]?.packType ?? getDocumentClass(t);
}

/**
 * The document subtype to filter index entries by, if this is a synthetic type.
 * @returns {string|null} e.g. "feat" for "Feature", null for "Actor"
 */
export function getDocumentSubtype(type) {
    const t = normalizeType(type);
    return TYPE_OVERRIDES[t]?.subtype ?? null;
}

/** @returns {boolean} True for Spell/Feature -- content-based, not real pack types */
export function isSyntheticType(type) {
    return SYNTHETIC_TYPES.includes(normalizeType(type));
}

/**
 * The world-side collection to search for this type.
 * @returns {Array|null} Array of documents, or null if the type has no world collection
 */
export function getWorldCollection(type) {
    const t = normalizeType(type);
    const docClass = getDocumentClass(t);
    const subtype = getDocumentSubtype(t);

    const collections = {
        Actor: () => game.actors,
        Item: () => game.items,
        JournalEntry: () => game.journal,
        RollTable: () => game.tables,
        Scene: () => game.scenes,
        Macro: () => game.macros,
        Playlist: () => game.playlists,
        Cards: () => game.cards
    };

    const collection = collections[docClass]?.();
    if (!collection) return null;

    const docs = Array.from(collection);
    return subtype ? docs.filter(d => d.type === subtype) : docs;
}

/**
 * Reverse of getCompendiumSettingPrefix: setting key -> canonical type.
 * Correctly inverts the backward-compat prefixes (monster -> Actor,
 * features -> Feature), which a naive PascalCase of the prefix does not.
 * @param {string} settingKey - e.g. "monsterCompendium1"
 * @returns {string|null} Canonical type, or null if not a compendium setting key
 */
export function extractTypeFromCompendiumSetting(settingKey) {
    const match = String(settingKey ?? '').match(/^(.+?)Compendium\d+$/);
    if (!match) return null;

    const prefixToken = match[1];

    // Invert the explicit overrides first -- "monster" must resolve to Actor,
    // not "Monster", or every downstream key lookup misses.
    for (const [type, config] of Object.entries(TYPE_OVERRIDES)) {
        if (config.prefix === `${prefixToken}Compendium`) return type;
    }

    return normalizeType(prefixToken);
}

/**
 * Every type that currently has compendium mappings registered, derived from the
 * packs present in this world plus the synthetic types.
 * @param {Array<{type: string}>} [compendiumData] - BLACKSMITH.arrCompendiumChoicesData
 * @returns {string[]} Canonical types
 */
export function getMappedTypes(compendiumData = []) {
    const found = [...new Set((compendiumData ?? []).map(c => c.type).filter(Boolean))];
    return [...new Set([...found, ...SYNTHETIC_TYPES])];
}

/**
 * Human-readable pack label including its source package, e.g. "dnd5e: Monsters (SRD)".
 * This is THE label format for compendiums across Blacksmith -- settings dropdowns
 * and import pickers both use it, so they can't drift apart.
 * @param {object} pack - A game.packs entry
 * @param {string} [fallbackId] - Returned when the pack has no metadata
 * @returns {string}
 */
export function formatPackLabel(pack, fallbackId = '') {
    const meta = pack?.metadata;
    if (!meta) return fallbackId;

    let packageLabel = meta.packageLabel || meta.package || meta.packageName
        || meta.system || meta.id?.split('.')[0] || 'Unknown Source';
    if (packageLabel === 'world') packageLabel = 'World';

    return `${packageLabel}: ${meta.label}`;
}
