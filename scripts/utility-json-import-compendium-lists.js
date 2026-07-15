// ==================================================================
// Compendium / world name lists for JSON import prompts (journals, etc.)
// ==================================================================

import { compendiumManager } from './manager-compendiums.js';
import { formatPackLabel } from './compendium-types.js';
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
 * Configured compendiums for a type, in priority order, de-duplicated, with display labels.
 * @param {string} type - Any accepted type token ('actor', 'item', ...)
 * @returns {Array<{id: string, label: string}>}
 */
function getConfiguredCompendiums(type) {
    const uniqueIds = [...new Set(compendiumManager.getSelected(type))];
    return uniqueIds.map(id => ({ id, label: formatPackLabel(game.packs.get(id), id) }));
}

/**
 * @returns {Array<{id: string, label: string}>}
 */
export function getConfiguredActorCompendiums() {
    return getConfiguredCompendiums('actor');
}

/**
 * @returns {Array<{id: string, label: string}>}
 */
export function getConfiguredItemCompendiums() {
    return getConfiguredCompendiums('item');
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
