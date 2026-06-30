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

const TAXONOMY_PATH = `modules/${MODULE.ID}/resources/naming-taxonomy.json`;

/** Per-key setting id prefix; e.g. canonical key "humanoid" → "tokenNameTable_humanoid". */
export const TOKEN_NAME_TABLE_SETTING_PREFIX = 'tokenNameTable_';

/** @type {Record<string, {label: string, aliases: string[]}>|null} */
let _taxonomy = null;
/** @type {Map<string, string>|null} normalized alias/key → canonical key */
let _aliasIndex = null;

/**
 * Normalize a type/subtype/alias token for comparison.
 * @param {string} value
 * @returns {string}
 */
function normalizeKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * Build the alias→canonical lookup from the loaded taxonomy (key maps to itself too).
 */
function buildAliasIndex() {
    _aliasIndex = new Map();
    if (!_taxonomy) return;
    for (const [key, entry] of Object.entries(_taxonomy)) {
        _aliasIndex.set(normalizeKey(key), key);
        for (const alias of entry?.aliases ?? []) {
            const norm = normalizeKey(alias);
            if (norm && !_aliasIndex.has(norm)) _aliasIndex.set(norm, key);
        }
    }
}

/**
 * Load the naming taxonomy JSON once and cache it. Call before registerSettings()
 * so the per-key settings can be generated. Safe to call more than once.
 * @returns {Promise<void>}
 */
export async function loadNamingTaxonomy() {
    if (_taxonomy) return;
    try {
        const url = (typeof foundry !== 'undefined' && foundry.utils?.getRoute)
            ? foundry.utils.getRoute(TAXONOMY_PATH)
            : TAXONOMY_PATH;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json && typeof json === 'object') {
            _taxonomy = json;
            buildAliasIndex();
        }
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Token naming: failed to load naming-taxonomy.json', e, false, false);
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
 * Cascade: subtype key → type key → global `tokenNameTable`.
 * Returns the global table name (possibly the unset placeholder) when no
 * type/subtype mapping applies, preserving prior behavior.
 * @param {object} actor
 * @returns {string}
 */
export function resolveTokenNameTableName(actor) {
    const { type, subtype } = readCreatureType(actor);
    const keys = [canonicalizeCreatureKey(subtype), canonicalizeCreatureKey(type)];

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
