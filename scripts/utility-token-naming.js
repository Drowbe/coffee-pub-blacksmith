// ==================================================================
// Creature-type / subtype token naming
// ==================================================================
//
// Resolves which random-name RollTable to use for a token based on its creature
// type and subtype, falling back to the global `tokenNameTable` setting.
//
// Source of truth: resources/naming-taxonomy.json — canonical keys (creature
// types + a few distinct subtypes), each with a display label and aliases. The
// per-key settings (registered in settings.js) are generated from this list, and
// runtime resolution canonicalizes a token's type/subtype through the aliases.
//
// See documentation/plans/plan-token-naming.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/** Bundled default taxonomy shipped with the module. */
export const DEFAULT_TAXONOMY_PATH = `modules/${MODULE.ID}/resources/naming-taxonomy.json`;

/** World setting (a file path) that lets a GM point at their own taxonomy JSON. */
export const NAMING_TAXONOMY_SETTING = 'namingTaxonomyJson';

/** Per-key setting id prefix; e.g. canonical key "humanoid" → "tokenNameTable_humanoid". */
export const TOKEN_NAME_TABLE_SETTING_PREFIX = 'tokenNameTable_';

// A key is "broad" when its `kind` is "type" (the official creature types). A broad key must
// never win over a "specific" key (subtype like `elf`, or role like `cultist`): broad keys
// resolve only from the creature's actual type field, never from a word in the token's name.
// Everything is derived from the taxonomy JSON — no hardcoded key lists here.

/** @type {Record<string, {label: string, kind?: string, aliases: string[]}>|null} */
let _taxonomy = null;
/** @type {Map<string, string>|null} normalized alias/key → canonical key */
let _aliasIndex = null;
/** @type {Set<string>|null} canonical keys whose kind === "type" (broad) */
let _broadKeys = null;

/**
 * Normalize a type/subtype/alias token for comparison.
 * @param {string} value
 * @returns {string}
 */
function normalizeKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * Build the alias→canonical lookup and the broad-key set from the loaded taxonomy
 * (each key maps to itself too). Broad = entry.kind === "type"; anything else is specific.
 */
function buildIndexes() {
    _aliasIndex = new Map();
    _broadKeys = new Set();
    if (!_taxonomy) return;
    for (const [key, entry] of Object.entries(_taxonomy)) {
        _aliasIndex.set(normalizeKey(key), key);
        for (const alias of entry?.aliases ?? []) {
            const norm = normalizeKey(alias);
            if (norm && !_aliasIndex.has(norm)) _aliasIndex.set(norm, key);
        }
        if (normalizeKey(entry?.kind) === 'type') _broadKeys.add(key);
    }
}

/**
 * Read a world setting's raw stored value before it is registered (loadNamingTaxonomy runs
 * before registerSettings). Returns '' if unavailable/unset. Defensive across storage shapes.
 * @param {string} settingKey
 * @returns {string}
 */
function readRawWorldSetting(settingKey) {
    try {
        const world = game?.settings?.storage?.get?.('world');
        if (!world) return '';
        const fullKey = `${MODULE.ID}.${settingKey}`;
        const doc = world.getSetting?.(fullKey)
            ?? (typeof world.find === 'function' ? world.find((s) => s?.key === fullKey) : null);
        let val = doc?.value;
        if (typeof val !== 'string' || !val) return '';
        // Stored setting values may be JSON-encoded (e.g. "\"path\"").
        try {
            const parsed = JSON.parse(val);
            if (typeof parsed === 'string') val = parsed;
        } catch { /* value was a plain string */ }
        return val;
    } catch {
        return '';
    }
}

/**
 * @param {string} path
 * @returns {Promise<object|null>}
 */
async function fetchTaxonomyJson(path) {
    const url = (typeof foundry !== 'undefined' && foundry.utils?.getRoute)
        ? foundry.utils.getRoute(path)
        : path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Load the naming taxonomy once and cache it. Prefers the GM-configured custom path
 * ({@link NAMING_TAXONOMY_SETTING}), falling back to the bundled default. Call before
 * registerSettings() so the per-key settings can be generated. Safe to call repeatedly.
 * @returns {Promise<void>}
 */
export async function loadNamingTaxonomy() {
    if (_taxonomy) return;

    const customPath = readRawWorldSetting(NAMING_TAXONOMY_SETTING);
    const candidates = [];
    if (customPath && customPath !== DEFAULT_TAXONOMY_PATH) candidates.push(customPath);
    candidates.push(DEFAULT_TAXONOMY_PATH);

    for (const path of candidates) {
        try {
            const json = await fetchTaxonomyJson(path);
            if (json && typeof json === 'object' && Object.keys(json).length) {
                _taxonomy = json;
                buildIndexes();
                return;
            }
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, `Token naming: failed to load taxonomy from ${path}`, e, false, false);
        }
    }
}

/**
 * Ordered canonical keys with labels, for generating per-key settings.
 * Empty until {@link loadNamingTaxonomy} resolves.
 * @returns {Array<{key: string, label: string}>}
 */
export function getNamingKeyList() {
    if (!_taxonomy) return [];
    return Object.entries(_taxonomy).map(([key, entry]) => ({
        key,
        label: entry?.label || key
    }));
}

/**
 * Setting id for a canonical key.
 * @param {string} key
 * @returns {string}
 */
export function tokenNameTableSettingId(key) {
    return `${TOKEN_NAME_TABLE_SETTING_PREFIX}${key}`;
}

/**
 * Resolve a creature type/subtype string to a canonical key, or '' if unknown.
 * @param {string} value
 * @returns {string}
 */
export function canonicalizeCreatureKey(value) {
    const norm = normalizeKey(value);
    if (!norm || !_aliasIndex) return '';
    return _aliasIndex.get(norm) || '';
}

/**
 * Read an actor's creature type and subtype (dnd5e shape, with safe fallbacks).
 * @param {object} actor
 * @returns {{ type: string, subtype: string }}
 */
function readCreatureType(actor) {
    const details = actor?.system?.details ?? {};
    const typeData = details.type;
    let type = '';
    let subtype = '';
    if (typeData && typeof typeData === 'object') {
        type = typeData.value ?? '';
        // dnd5e stores a free-text type under "custom" when value === "custom".
        if (normalizeKey(type) === 'custom') type = typeData.custom || type;
        subtype = typeData.subtype ?? '';
    } else if (typeof typeData === 'string') {
        type = typeData;
    }
    if (!type) type = details.creatureType ?? '';
    return { type: String(type ?? ''), subtype: String(subtype ?? '') };
}

/**
 * Match a **specific** canonical key (subtype or role — never a broad creature type) from the
 * words of an actor's name, e.g. a token named "Cultist" or "Goblin Boss". First specific match
 * in name order wins; broad words like "human"/"commoner" are skipped so they can't beat a role.
 * @param {object} actor
 * @returns {string}
 */
function readSpecificNameKey(actor) {
    const name = normalizeKey(actor?.name ?? actor?.prototypeToken?.name ?? '');
    if (!name || !_aliasIndex) return '';
    for (const word of name.split(/[^a-z0-9]+/)) {
        if (!word) continue;
        const key = _aliasIndex.get(word);
        if (key && !_broadKeys?.has(key)) return key;
    }
    return '';
}

/**
 * Read a per-key (or global) table-name setting safely.
 * @param {string} settingId
 * @returns {string}
 */
function readTableSetting(settingId) {
    try {
        return String(game.settings.get(MODULE.ID, settingId) ?? '');
    } catch {
        return '';
    }
}

/**
 * Resolve the RollTable NAME to use for naming this actor's token.
 * Cascade (specific beats broad):
 *   1. subtype field  (structured `type.subtype`, e.g. elf/orc — strongest signal)
 *   2. specific name keyword  (role/subtype word in the name; broad type words skipped)
 *   3. type field  (broad creature type, e.g. humanoid/dragon)
 *   4. global `tokenNameTable`
 * Returns the global table name (possibly the unset placeholder) when nothing matches,
 * preserving prior behavior.
 * @param {object} actor
 * @returns {string}
 */
export function resolveTokenNameTableName(actor) {
    const { type, subtype } = readCreatureType(actor);
    const keys = [
        canonicalizeCreatureKey(subtype),
        readSpecificNameKey(actor),
        canonicalizeCreatureKey(type)
    ];

    for (const key of keys) {
        if (!key) continue;
        const tableName = readTableSetting(tokenNameTableSettingId(key));
        if (tableName && tableName !== 'none' && game.tables?.getName(tableName)) {
            return tableName;
        }
    }

    // Global fallback (the existing single setting).
    return readTableSetting('tokenNameTable');
}
