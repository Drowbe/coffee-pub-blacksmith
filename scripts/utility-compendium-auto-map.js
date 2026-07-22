// ==================================================================
// Automatic compendium mapping
// ==================================================================

import { getDocumentSubtype, getPackType, normalizeType } from './compendium-types.js';

const OFFICIAL_SUPPLEMENT_PATTERNS = [
    /tasha/, /xanathar/, /fizban/, /mordenkainen/, /volo/, /sword coast/,
    /eberron/, /ravenloft/, /spelljammer/, /planescape/, /strixhaven/,
    /bigby/, /glory of the giants/, /wildemount/, /thero/, /dragonlance/
];

const CORE_PHB_PATTERNS = [
    /player'?s handbook/, /\bphb\b/, /character classes?/, /character origins?/,
    /^equipment$/, /^feats$/, /^spells$/
];
const CORE_DMG_PATTERNS = [/dungeon master'?s guide/, /\bdmg\b/, /^items$/];
const CORE_MM_PATTERNS = [/monster manual/, /\bmm\b/, /^monster features$/];

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getOwningPackageId(pack) {
    const metadata = pack?.metadata ?? {};
    return String(metadata.packageName || metadata.package || metadata.id?.split('.')[0] || '');
}

function getOwningPackageTitle(pack) {
    if (isWorldOwnedPack(pack)) return globalThis.game?.world?.title || globalThis.game?.world?.id || 'Current World';

    const metadata = pack?.metadata ?? {};
    const packageId = getOwningPackageId(pack);
    const moduleTitle = globalThis.game?.modules?.get?.(packageId)?.title;
    if (moduleTitle) return moduleTitle;
    if (packageId && packageId === globalThis.game?.system?.id) return globalThis.game.system.title || packageId;
    return metadata.packageLabel || '';
}

function ownerSearchText(pack) {
    const metadata = pack?.metadata ?? {};
    return normalizeSearchText([
        getOwningPackageId(pack), getOwningPackageTitle(pack),
        metadata.packageType, metadata.system
    ].filter(Boolean).join(' '));
}

function getDeclaredSourceBook(pack) {
    const metadata = pack?.metadata ?? {};
    const systemId = metadata.system || globalThis.game?.system?.id;
    const direct = metadata.flags?.[systemId]?.sourceBook
        || metadata.flags?.dnd5e?.sourceBook
        || metadata.sourceBook;
    if (direct) return String(direct);

    const packageId = getOwningPackageId(pack);
    const owner = globalThis.game?.modules?.get?.(packageId)
        || (packageId === globalThis.game?.system?.id ? globalThis.game.system : null);
    const declarations = owner?.packs;
    if (!declarations) return '';
    const candidates = Array.isArray(declarations)
        ? declarations
        : Array.from(declarations.values?.() || declarations);
    const packName = String(metadata.name || metadata.id?.split('.').pop() || '');
    const declaration = candidates.find(candidate => {
        const data = candidate?.metadata || candidate;
        return data?.name === packName || data?.label === metadata.label || data?.id === metadata.id;
    });
    const data = declaration?.metadata || declaration;
    return String(data?.flags?.[systemId]?.sourceBook || data?.flags?.dnd5e?.sourceBook || data?.sourceBook || '');
}

function packSearchText(pack) {
    const metadata = pack?.metadata ?? {};
    return normalizeSearchText([
        metadata.id, metadata.label, metadata.name, metadata.package,
        metadata.packageName, metadata.packageLabel, metadata.system,
        getOwningPackageTitle(pack)
    ].filter(Boolean).join(' '));
}

function packLabel(pack) {
    return String(pack?.metadata?.label || pack?.metadata?.name || pack?.metadata?.id || '').trim();
}

function isWorldOwnedPack(pack) {
    const metadata = pack?.metadata ?? {};
    return metadata.packageType === 'world'
        || String(metadata.id || '').startsWith('world.')
        || String(pack?.collection || '').startsWith('world.');
}

export function getCompendiumSourceId(pack) {
    const metadata = pack?.metadata ?? {};
    if (isWorldOwnedPack(pack)) return 'world';
    return String(metadata.packageName || metadata.package || metadata.id?.split('.')[0] || 'unknown');
}

export function getCompendiumSourceLabel(pack) {
    const metadata = pack?.metadata ?? {};
    if (isWorldOwnedPack(pack)) {
        return `World: ${globalThis.game?.world?.title || globalThis.game?.world?.id || 'Current World'}`;
    }
    return String(getOwningPackageTitle(pack) || metadata.package || metadata.packageName || metadata.id?.split('.')[0] || 'Unknown Source');
}

function stableHash(value) {
    let hash = 5381;
    for (const character of String(value)) hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
    return (hash >>> 0).toString(36);
}

export function getCompendiumSourceSettingKey(sourceId) {
    const slug = String(sourceId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'source';
    return `compendiumSourceEnabled-${slug}-${stableHash(sourceId)}`;
}

const IMPORTER_RELEVANT_PACK_TYPES = new Set(['Actor', 'Item', 'JournalEntry', 'RollTable']);

export function isImporterRelevantCompendium(pack) {
    const type = String(pack?.metadata?.type || '');
    return IMPORTER_RELEVANT_PACK_TYPES.has(type)
        && indexEntries(pack).length > 0
        && (type !== 'JournalEntry' || isPrimaryJournalCompendium(pack));
}

export function getInstalledCompendiumSources() {
    if (!globalThis.game?.packs) return [];
    const sources = new Map();
    for (const pack of game.packs.values()) {
        if (!isImporterRelevantCompendium(pack)) continue;
        const id = getCompendiumSourceId(pack);
        const current = sources.get(id) || {
            id,
            label: getCompendiumSourceLabel(pack),
            packCount: 0,
            contentCounts: new Map()
        };
        current.packCount += 1;
        accumulateSourceContents(current.contentCounts, pack);
        sources.set(id, current);
    }
    return [...sources.values()]
        .map(source => ({
            ...source,
            contentSummary: formatContentCounts(source.contentCounts)
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function matchesAny(text, patterns) {
    return patterns.some(pattern => pattern.test(text));
}

/**
 * Rank sources using Blacksmith's documented precedence:
 * 1 official supplements, 2 core rulebooks (PHB, DMG, MM),
 * 3 third-party/homebrew/imported content, 4 bundled SRD content.
 */
export function classifyCompendiumTier(pack) {
    const text = packSearchText(pack);
    const ownerText = ownerSearchText(pack);
    const label = normalizeSearchText(packLabel(pack));
    const packageId = getOwningPackageId(pack).toLowerCase();
    const sourceBook = normalizeSearchText(getDeclaredSourceBook(pack));

    if (/\bsrd\b/.test(sourceBook) || /\bsrd\b/.test(text)) return { tier: 4, order: 0, reason: 'SRD' };
    if (matchesAny(ownerText, OFFICIAL_SUPPLEMENT_PATTERNS)) return { tier: 1, order: 0, reason: 'official supplement' };

    // The dnd5e system's non-SRD Character Classes, Character Origins,
    // Equipment, Feats, Spells, Items, and Monster Features packs represent
    // current core-book content even when the book name is not in the label.
    // metadata.system is dnd5e for every compatible third-party pack, so only
    // the owning package—not the game system—can establish official core status.
    const officialCore = packageId === 'dnd5e';
    if (matchesAny(ownerText, CORE_PHB_PATTERNS) || (officialCore && matchesAny(label, CORE_PHB_PATTERNS))) {
        return { tier: 2, order: 0, reason: 'Player’s Handbook/core player content' };
    }
    if (matchesAny(ownerText, CORE_DMG_PATTERNS) || (officialCore && matchesAny(label, CORE_DMG_PATTERNS))) {
        return { tier: 2, order: 1, reason: 'Dungeon Master’s Guide/core GM content' };
    }
    if (matchesAny(ownerText, CORE_MM_PATTERNS) || (officialCore && matchesAny(label, CORE_MM_PATTERNS))) {
        return { tier: 2, order: 2, reason: 'Monster Manual/core monster content' };
    }
    if (officialCore) return { tier: 2, order: 3, reason: 'official core system content' };
    return { tier: 3, order: 0, reason: 'third-party, imported, or homebrew content' };
}

function indexEntries(pack) {
    const index = pack?.index;
    if (!index) return [];
    if (Array.isArray(index.contents)) return index.contents;
    try { return Array.from(index); } catch (_error) { return []; }
}

const CONTENT_LABELS = {
    actor: 'Actors', background: 'Backgrounds', class: 'Classes', feat: 'Features / Feats',
    race: 'Species / Races', spell: 'Spells', subclass: 'Subclasses', weapon: 'Weapons',
    equipment: 'Equipment', consumable: 'Consumables', tool: 'Tools', loot: 'Loot',
    item: 'Other Items', journalentry: 'Journals', rolltable: 'Roll Tables'
};

const CONTENT_ORDER = [
    'actor', 'background', 'race', 'class', 'subclass', 'feat', 'spell',
    'weapon', 'equipment', 'consumable', 'tool', 'loot', 'item',
    'journalentry', 'rolltable'
];

function incrementContentCount(counts, type, amount = 1) {
    const key = String(type || '').toLowerCase();
    if (!key || amount <= 0) return;
    counts.set(key, (counts.get(key) || 0) + amount);
}

function accumulateSourceContents(counts, pack) {
    const entries = indexEntries(pack);
    const packType = String(pack?.metadata?.type || '').toLowerCase();

    // Actor subtypes (npc/character/vehicle) are all useful through the Actor
    // mapping, while Journal and Roll Table indexes generally expose no subtype.
    if (packType === 'actor' || packType === 'journalentry' || packType === 'rolltable') {
        incrementContentCount(counts, packType, entries.length);
        return;
    }

    if (packType === 'item') {
        for (const entry of entries) incrementContentCount(counts, entry?.type || 'item');
    }
}

function formatContentCounts(counts) {
    return [...counts.entries()]
        .sort(([a], [b]) => {
            const aOrder = CONTENT_ORDER.indexOf(a);
            const bOrder = CONTENT_ORDER.indexOf(b);
            if (aOrder !== bOrder) return (aOrder < 0 ? Number.MAX_SAFE_INTEGER : aOrder)
                - (bOrder < 0 ? Number.MAX_SAFE_INTEGER : bOrder);
            return (CONTENT_LABELS[a] || a).localeCompare(CONTENT_LABELS[b] || b);
        })
        .map(([type, count]) => `${count} ${CONTENT_LABELS[type] || type}`)
        .join(', ');
}

export function describeCompendiumContents(pack) {
    const counts = new Map();
    for (const entry of indexEntries(pack)) {
        const type = String(entry?.type || '').toLowerCase();
        if (type) counts.set(type, (counts.get(type) || 0) + 1);
    }
    if (!counts.size) return '';
    return formatContentCounts(counts);
}

const LABEL_SUBTYPE_HINTS = {
    spell: [/spell/],
    feat: [/feat/, /feature/, /origin/],
    race: [/race/, /species/, /origin/],
    background: [/background/, /origin/],
    class: [/class/],
    subclass: [/subclass/, /class/]
};

// Some automation/content modules split a public-facing feature into a parent
// document and one or more implementation documents stored in support packs.
// Those children are valid dnd5e `feat` Items, but offering their packs as
// authoring catalogs produces noisy prompts, duplicate names, and references to
// mechanics that were never intended to be placed on an Actor directly.
//
// Keep this based on the pack's declared purpose rather than a package id so a
// GM can still use the source's real Feats, Class Features, Monster Features,
// Species Features, and Actions. The whole-source checkbox remains available
// when a GM wants to exclude an automation package entirely.
const FEATURE_SUPPORT_PACK_PATTERNS = [
    /\bclass feature items?\b/,
    /\bfeat features?\b/,
    /\bfeature items?\b/,
    /\bitem features?\b/,
    /\bspell features?\b/,
    /\bsummon features?\b/,
    /\bembedded macro(?: sample)? items?\b/
];

export function isPrimaryFeatureCompendium(pack) {
    const label = packLabel(pack).toLowerCase();
    if (matchesAny(label, FEATURE_SUPPORT_PACK_PATTERNS)) return false;

    const entries = indexEntries(pack);
    const types = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
    const featureCount = types.filter(type => type === 'feat').length;
    if (!featureCount) return false;

    // Equipment/background/spell packs sometimes carry a few implementation
    // Features. Do not promote the entire pack into the Feature catalog unless
    // Features are actually its primary indexed content.
    const incidentalPurpose = matchesAny(label, [
        /\bequipment\b/, /\bweapons?\b/, /\barmor\b/,
        /\bbackgrounds?\b/, /\bspells?\b/
    ]);
    return !incidentalPurpose || featureCount > types.length / 2;
}

export function isPrimarySpellCompendium(pack) {
    const label = packLabel(pack).toLowerCase();
    const entries = indexEntries(pack);
    const types = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
    const spellCount = types.filter(type => type === 'spell').length;
    if (!spellCount) return false;
    if (/\bspells?\b/.test(label)) return true;

    // A class, ancestry, background, equipment, or monster pack may include a
    // rider spell without being a useful spell-authoring catalog. Broadly named
    // option/campaign packs remain eligible when they intentionally mix content.
    const incidentalPurpose = matchesAny(label, [
        /\bclasses?\b/, /\bsubclasses?\b/, /\bbackgrounds?\b/,
        /\braces?\b/, /\bspecies\b/, /\borigins?\b/,
        /\bequipment\b/, /\bitems?\b/, /\bmonster features?\b/
    ]);
    return !incidentalPurpose || spellCount > types.length / 2;
}

// Some tools use world-owned Journal compendiums as implementation storage.
// These are real JournalEntry documents, but preset/cache/configuration stores
// are not narrative catalogs and should not become importer sources merely
// because another module chose JournalEntry as its persistence format.
const JOURNAL_SUPPORT_PACK_PATTERNS = [
    /\bpresets?\b/, /\bcaches?\b/, /\bconfiguration\b/,
    /\binternal storage\b/, /\bdata store\b/
];

export function isPrimaryJournalCompendium(pack) {
    return !matchesAny(packLabel(pack).toLowerCase(), JOURNAL_SUPPORT_PACK_PATTERNS);
}

// The generic Item mapping is for inventory a character can carry: weapons,
// equipment, consumables, tools, loot, and containers. Many class, background,
// spell, and feature packs contain one incidental physical Item (or a helper
// Item) alongside their real content. Presence alone therefore cannot make a
// pack an Item catalog.
const PHYSICAL_ITEM_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);
const NON_ITEM_PACK_PURPOSE_PATTERNS = [
    /\bbackgrounds?\b/, /\bclasses?\b/, /\bsubclasses?\b/,
    /\bfeatures?\b/, /\bfeats?\b/, /\bspells?\b/,
    /\braces?\b/, /\bspecies\b/, /\borigins?\b/,
    /\bmonster(?:s)?\b/, /\bactions?\b/, /\bsummons?\b/,
    /\bbastions?\b/, /\bfacilit(?:y|ies)\b/
];
const ITEM_PACK_PURPOSE_PATTERNS = [
    /\bitems?\b/, /\bequipment\b/, /\bweapons?\b/, /\barmor\b/,
    /\bconsumables?\b/, /\bpotions?\b/, /\bscrolls?\b/,
    /\btools?\b/, /\bgear\b/, /\bloot\b/, /\btreasure\b/,
    /\btrade goods?\b/, /\bcontainers?\b/
];

export function isPrimaryItemCompendium(pack) {
    const entries = indexEntries(pack);
    const indexedTypes = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
    if (!indexedTypes.length) {
        const label = packLabel(pack).toLowerCase();
        return !matchesAny(label, NON_ITEM_PACK_PURPOSE_PATTERNS)
            && matchesAny(label, ITEM_PACK_PURPOSE_PATTERNS);
    }

    const physicalCount = indexedTypes.filter(type => PHYSICAL_ITEM_TYPES.has(type)).length;
    if (!physicalCount) return false;

    const label = packLabel(pack).toLowerCase();
    if (matchesAny(label, NON_ITEM_PACK_PURPOSE_PATTERNS)) return false;
    if (matchesAny(label, ITEM_PACK_PURPOSE_PATTERNS)) return true;

    // Ambiguously named mixed packs qualify only when physical inventory is
    // their majority content. This retains packs such as "Creations" without
    // admitting a character-options pack because it happens to contain a sword.
    return physicalCount > indexedTypes.length / 2;
}

export function compendiumContainsMappedType(pack, type) {
    const canonicalType = normalizeType(type);
    const expectedPackType = getPackType(canonicalType);
    if (String(pack?.metadata?.type || '') !== expectedPackType) return false;

    const subtype = getDocumentSubtype(canonicalType);
    const entries = indexEntries(pack);
    if (!entries.length) return false;
    if (canonicalType === 'JournalEntry' && !isPrimaryJournalCompendium(pack)) return false;
    if (subtype) {
        const indexedTypes = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
        if (indexedTypes.length) {
            if (!indexedTypes.includes(subtype)) return false;
            if (canonicalType === 'Feature' && !isPrimaryFeatureCompendium(pack)) return false;
            if (canonicalType === 'Spell' && !isPrimarySpellCompendium(pack)) return false;
            return true;
        }
        const label = packLabel(pack).toLowerCase();
        if (canonicalType === 'Feature' && !isPrimaryFeatureCompendium(pack)) return false;
        if (canonicalType === 'Spell' && !isPrimarySpellCompendium(pack)) return false;
        if (['class', 'subclass'].includes(subtype) && /feature|feat/.test(label)) return false;
        if (subtype === 'class' && /subclass/.test(label)) return false;
        return matchesAny(label, LABEL_SUBTYPE_HINTS[subtype] || []);
    }

    if (canonicalType !== 'Item') return true;
    return isPrimaryItemCompendium(pack);
}

/**
 * Return matching pack ids in automatic priority order.
 * Stable alphabetical ordering makes equal-tier results predictable.
 */
export function getAutomaticCompendiumPackIds(type, { sourceIds = null } = {}) {
    const canonicalType = normalizeType(type);
    if (!canonicalType || !globalThis.game?.packs) return [];
    const allowedSources = Array.isArray(sourceIds) ? new Set(sourceIds) : null;

    return Array.from(game.packs.values())
        .filter(pack => !allowedSources || allowedSources.has(getCompendiumSourceId(pack)))
        .filter(pack => compendiumContainsMappedType(pack, canonicalType))
        .map(pack => ({ pack, ...classifyCompendiumTier(pack) }))
        .sort((a, b) => a.tier - b.tier
            || a.order - b.order
            || packLabel(a.pack).localeCompare(packLabel(b.pack)))
        .map(entry => entry.pack.metadata.id);
}

// Scene packs are commonly divided by adventure, chapter, or location. Those
// divisions organize a package but are rarely meaningful mapping decisions, so
// the settings UI selects their owning source and runtime expands it back into
// concrete pack ids. Keep the expansion boundary centralized so APIs and lookup
// code continue to operate exclusively on real compendium ids.
const SOURCE_AGGREGATED_MAPPING_TYPES = new Set(['Scene']);
const SOURCE_SELECTION_PREFIX = 'source:';

export function isSourceAggregatedMappingType(type) {
    return SOURCE_AGGREGATED_MAPPING_TYPES.has(normalizeType(type));
}

export function getMappedSourceGroups(type, { sourceIds = null } = {}) {
    const canonicalType = normalizeType(type);
    if (!isSourceAggregatedMappingType(canonicalType)) return [];

    const groups = new Map();
    for (const packId of getAutomaticCompendiumPackIds(canonicalType, { sourceIds })) {
        const pack = game.packs.get(packId);
        if (!pack) continue;
        const sourceId = getCompendiumSourceId(pack);
        const current = groups.get(sourceId) || {
            id: sourceId,
            value: `${SOURCE_SELECTION_PREFIX}${sourceId}`,
            label: getCompendiumSourceLabel(pack),
            packIds: [],
            documentCount: 0
        };
        current.packIds.push(packId);
        current.documentCount += indexEntries(pack).length;
        groups.set(sourceId, current);
    }
    return [...groups.values()];
}

export function expandMappedSelection(type, selection, { sourceIds = null } = {}) {
    const canonicalType = normalizeType(type);
    const value = String(selection || '');
    if (!value || value === 'none') return [];
    if (!isSourceAggregatedMappingType(canonicalType)) return [value];

    let sourceId = value.startsWith(SOURCE_SELECTION_PREFIX)
        ? value.slice(SOURCE_SELECTION_PREFIX.length)
        : null;

    // Backward compatibility: an existing Scene pack selection now means its
    // owning source, so old worlds gain the compact behavior without migration.
    if (!sourceId) {
        const pack = game.packs.get(value);
        if (pack) sourceId = getCompendiumSourceId(pack);
    }
    if (!sourceId) return [];

    const allowedSources = Array.isArray(sourceIds) ? new Set(sourceIds) : null;
    if (allowedSources && !allowedSources.has(sourceId)) return [];
    return getAutomaticCompendiumPackIds(canonicalType, { sourceIds: [sourceId] });
}

export function getAutomaticCompendiumPlan(types, options = {}) {
    return Object.fromEntries(types.map(type => [normalizeType(type), getAutomaticCompendiumPackIds(type, options)]));
}
