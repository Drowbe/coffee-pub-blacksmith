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
 * @returns {boolean}
 */
export function hasConfiguredActorCompendiums() {
    const num = game.settings.get(MODULE.ID, 'numCompendiumsActor') ?? 1;
    for (let i = 1; i <= num; i++) {
        const id = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
        if (id && id !== 'none') return true;
    }
    return false;
}

/**
 * @returns {boolean}
 */
export function hasConfiguredItemCompendiums() {
    const num = game.settings.get(MODULE.ID, 'numCompendiumsItem') ?? 1;
    for (let i = 1; i <= num; i++) {
        const id = game.settings.get(MODULE.ID, `itemCompendium${i}`);
        if (id && id !== 'none') return true;
    }
    return false;
}
