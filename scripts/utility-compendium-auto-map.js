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

function packSearchText(pack) {
    const metadata = pack?.metadata ?? {};
    return [
        metadata.id, metadata.label, metadata.name, metadata.package,
        metadata.packageName, metadata.packageLabel, metadata.system
    ].filter(Boolean).join(' ').toLowerCase();
}

function packLabel(pack) {
    return String(pack?.metadata?.label || pack?.metadata?.name || pack?.metadata?.id || '').trim();
}

export function getCompendiumSourceId(pack) {
    const metadata = pack?.metadata ?? {};
    return String(metadata.packageName || metadata.package || metadata.id?.split('.')[0] || 'unknown');
}

export function getCompendiumSourceLabel(pack) {
    const metadata = pack?.metadata ?? {};
    return String(metadata.packageLabel || metadata.package || metadata.packageName || metadata.id?.split('.')[0] || 'Unknown Source');
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
    return IMPORTER_RELEVANT_PACK_TYPES.has(String(pack?.metadata?.type || ''))
        && indexEntries(pack).length > 0;
}

export function getInstalledCompendiumSources() {
    if (!globalThis.game?.packs) return [];
    const sources = new Map();
    for (const pack of game.packs.values()) {
        if (!isImporterRelevantCompendium(pack)) continue;
        const id = getCompendiumSourceId(pack);
        const current = sources.get(id) || { id, label: getCompendiumSourceLabel(pack), packCount: 0 };
        current.packCount += 1;
        sources.set(id, current);
    }
    return [...sources.values()].sort((a, b) => a.label.localeCompare(b.label));
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
    const label = packLabel(pack).toLowerCase();
    const packageId = String(pack?.metadata?.package || pack?.metadata?.packageName || '').toLowerCase();

    if (/\bsrd\b|\(srd\)/.test(text)) return { tier: 4, order: 0, reason: 'SRD' };
    if (matchesAny(text, OFFICIAL_SUPPLEMENT_PATTERNS)) return { tier: 1, order: 0, reason: 'official supplement' };

    // The dnd5e system's non-SRD Character Classes, Character Origins,
    // Equipment, Feats, Spells, Items, and Monster Features packs represent
    // current core-book content even when the book name is not in the label.
    // metadata.system is dnd5e for every compatible third-party pack, so only
    // the owning package—not the game system—can establish official core status.
    const officialCore = packageId === 'dnd5e';
    if (matchesAny(text, CORE_PHB_PATTERNS) || (officialCore && matchesAny(label, CORE_PHB_PATTERNS))) {
        return { tier: 2, order: 0, reason: 'Player’s Handbook/core player content' };
    }
    if (matchesAny(text, CORE_DMG_PATTERNS) || (officialCore && matchesAny(label, CORE_DMG_PATTERNS))) {
        return { tier: 2, order: 1, reason: 'Dungeon Master’s Guide/core GM content' };
    }
    if (matchesAny(text, CORE_MM_PATTERNS) || (officialCore && matchesAny(label, CORE_MM_PATTERNS))) {
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
    equipment: 'Equipment', consumable: 'Consumables', tool: 'Tools', loot: 'Loot'
};

export function describeCompendiumContents(pack) {
    const counts = new Map();
    for (const entry of indexEntries(pack)) {
        const type = String(entry?.type || '').toLowerCase();
        if (type) counts.set(type, (counts.get(type) || 0) + 1);
    }
    if (!counts.size) return '';
    return [...counts.entries()]
        .sort(([a], [b]) => (CONTENT_LABELS[a] || a).localeCompare(CONTENT_LABELS[b] || b))
        .map(([type, count]) => `${count} ${CONTENT_LABELS[type] || type}`)
        .join(', ');
}

const LABEL_SUBTYPE_HINTS = {
    spell: [/spell/],
    feat: [/feat/, /feature/, /origin/],
    race: [/race/, /species/, /origin/],
    background: [/background/, /origin/],
    class: [/class/],
    subclass: [/subclass/, /class/]
};

export function compendiumContainsMappedType(pack, type) {
    const canonicalType = normalizeType(type);
    const expectedPackType = getPackType(canonicalType);
    if (String(pack?.metadata?.type || '') !== expectedPackType) return false;

    const subtype = getDocumentSubtype(canonicalType);
    const entries = indexEntries(pack);
    if (!entries.length) return false;
    if (subtype) {
        const indexedTypes = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
        if (indexedTypes.length) return indexedTypes.includes(subtype);
        const label = packLabel(pack).toLowerCase();
        if (['class', 'subclass'].includes(subtype) && /feature|feat/.test(label)) return false;
        if (subtype === 'class' && /subclass/.test(label)) return false;
        return matchesAny(label, LABEL_SUBTYPE_HINTS[subtype] || []);
    }

    if (canonicalType !== 'Item') return true;
    const specialized = new Set(['spell', 'feat', 'race', 'background', 'class', 'subclass']);
    const indexedTypes = entries.map(entry => String(entry?.type || '').toLowerCase()).filter(Boolean);
    if (indexedTypes.length) return indexedTypes.some(type => !specialized.has(type));
    return !matchesAny(packLabel(pack).toLowerCase(), [/spell/, /feat/, /feature/, /race/, /species/, /background/, /class/, /origin/]);
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

export function getAutomaticCompendiumPlan(types, options = {}) {
    return Object.fromEntries(types.map(type => [normalizeType(type), getAutomaticCompendiumPackIds(type, options)]));
}
