// ==================================================================
// Item JSON import — prompt registry (core + partial + profile)
// ==================================================================

import {
    fetchPromptText,
    composePrompt,
    applyCampaignPlaceholders
} from './utility-json-import-prompts.js';

export const ITEM_PROMPT_CORE = 'prompt-item-core.txt';
export const ITEM_PROMPT_PARTIAL_ARTIFICER = 'prompt-item-partial-artificer.txt';

/** @type {Record<string, string>} */
export const ITEM_PROMPT_PROFILES = {
    loot: 'prompt-item-profile-loot.txt',
    consumable: 'prompt-item-profile-consumable.txt',
    weapon: 'prompt-item-profile-weapon.txt',
    equipment: 'prompt-item-profile-equipment.txt',
    tool: 'prompt-item-profile-tool.txt',
    container: 'prompt-item-profile-container.txt',
    artificer: 'prompt-item-profile-artificer.txt'
};

/** Dropdown options for JsonImportWindow (item directory). */
export const ITEM_TEMPLATE_OPTIONS = [
    { value: 'loot', label: 'Loot' },
    { value: 'consumable', label: 'Consumable' },
    { value: 'weapon', label: 'Weapon' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'tool', label: 'Tool' },
    { value: 'container', label: 'Container' },
    { value: 'artificer', label: 'Artificer' }
];

/**
 * Build the full clipboard prompt for an item import template.
 * @param {string} templateKey - loot | consumable | weapon | equipment | tool | container | artificer
 * @returns {Promise<string>}
 */
export async function buildItemImportPrompt(templateKey) {
    const key = String(templateKey || 'loot').toLowerCase();
    const core = await fetchPromptText(ITEM_PROMPT_CORE);
    const parts = [core];

    if (key === 'artificer') {
        parts.push(await fetchPromptText(ITEM_PROMPT_PARTIAL_ARTIFICER));
    }

    const profileFile = ITEM_PROMPT_PROFILES[key];
    if (profileFile) {
        parts.push(await fetchPromptText(profileFile));
    }

    const composed = composePrompt(parts);
    return applyCampaignPlaceholders(composed);
}
