// ==================================================================
// Compendium / world name lists for JSON import prompts (journals, etc.)
// ==================================================================

import { MODULE } from './const.js';
import {
    getCompendiumActorsList,
    getCompendiumItemsList,
    getWorldActorsList,
    getWorldItemsList
} from './utility-rolltable-import-lists.js';

export {
    getCompendiumActorsList,
    getCompendiumItemsList,
    getWorldActorsList,
    getWorldItemsList
};

/**
 * Configured compendiums for a settings group, de-duplicated, with display labels.
 * @param {string} countKey - settings key holding the configured count (e.g. 'numCompendiumsActor')
 * @param {string} prefix - per-slot settings key prefix (e.g. 'monsterCompendium')
 * @returns {Array<{id: string, label: string}>}
 */
function getConfiguredCompendiums(countKey, prefix) {
    const out = [];
    const seen = new Set();
    const num = game.settings.get(MODULE.ID, countKey) ?? 1;
    for (let i = 1; i <= num; i++) {
        const id = game.settings.get(MODULE.ID, `${prefix}${i}`);
        if (!id || id === 'none' || seen.has(id)) continue;
        seen.add(id);
        const pack = game.packs.get(id);
        out.push({ id, label: formatCompendiumLabel(pack, id) });
    }
    return out;
}

/**
 * Human-readable compendium label including its source package, matching the
 * format used in module settings (e.g. "dnd5e: Monsters (SRD)").
 * @param {object|undefined} pack - the resolved game.packs entry
 * @param {string} id - the pack id (fallback when pack/metadata is missing)
 * @returns {string}
 */
function formatCompendiumLabel(pack, id) {
    const meta = pack?.metadata;
    if (!meta) return id;
    let packageLabel = meta.packageLabel || meta.package || meta.packageName
        || meta.system || meta.id?.split('.')[0] || 'Unknown Source';
    if (packageLabel === 'world') packageLabel = 'World';
    return `${packageLabel}: ${meta.label}`;
}

/**
 * @returns {Array<{id: string, label: string}>}
 */
export function getConfiguredActorCompendiums() {
    return getConfiguredCompendiums('numCompendiumsActor', 'monsterCompendium');
}

/**
 * @returns {Array<{id: string, label: string}>}
 */
export function getConfiguredItemCompendiums() {
    return getConfiguredCompendiums('numCompendiumsItem', 'itemCompendium');
}

/**
 * @returns {boolean}
 */
export function hasConfiguredActorCompendiums() {
    return getConfiguredActorCompendiums().length > 0;
}

/**
 * @returns {boolean}
 */
export function hasConfiguredItemCompendiums() {
    return getConfiguredItemCompendiums().length > 0;
}
