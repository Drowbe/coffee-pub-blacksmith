// ==================================================================
// Item JSON import — prompt registry (core + partial + profile)
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { copyToClipboard } from './utility-common.js';
import { registerJsonImportKind } from './registry-json-import.js';
import { parseFlatItemToFoundry } from './parsers/parse-item.js';
import {
    fetchPromptText,
    composePrompt,
    applyCampaignPlaceholders
} from './utility-json-import-prompts.js';

export const ARTIFICER_MODULE_ID = 'coffee-pub-artificer';

export const ITEM_PROMPT_CORE = 'prompt-item-core.txt';
export const ITEM_PROMPT_PARTIAL_ARTIFICER = 'prompt-item-partial-artificer.txt';
export const ITEM_PROMPT_PROFILE_ARTIFICER = 'prompt-item-profile-artificer.txt';

/** @type {Record<string, string>} */
export const ITEM_PROMPT_PROFILES = {
    loot: 'prompt-item-profile-loot.txt',
    consumable: 'prompt-item-profile-consumable.txt',
    weapon: 'prompt-item-profile-weapon.txt',
    equipment: 'prompt-item-profile-equipment.txt',
    tool: 'prompt-item-profile-tool.txt',
    container: 'prompt-item-profile-container.txt'
};

/** Dropdown options for JsonImportWindow (item directory). */
export const ITEM_TEMPLATE_OPTIONS = [
    { value: 'loot', label: 'Loot' },
    { value: 'consumable', label: 'Consumable' },
    { value: 'weapon', label: 'Weapon' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'tool', label: 'Tool' },
    { value: 'container', label: 'Container' }
];

/**
 * True when Coffee Pub Artificer is installed and active.
 * @returns {boolean}
 */
export function isArtificerModuleActive() {
    return game.modules.get(ARTIFICER_MODULE_ID)?.active === true;
}

/**
 * Build the full clipboard prompt for an item import template.
 * @param {string} templateKey - loot | consumable | weapon | equipment | tool | container
 * @param {{ includeArtificer?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function buildItemImportPrompt(templateKey, options = {}) {
    const key = String(templateKey || 'loot').toLowerCase();
    const includeArtificer = !!options.includeArtificer;
    const core = await fetchPromptText(ITEM_PROMPT_CORE);
    const parts = [core];

    const profileFile = ITEM_PROMPT_PROFILES[key];
    if (profileFile) {
        parts.push(await fetchPromptText(profileFile));
    }

    if (includeArtificer) {
        parts.push(await fetchPromptText(ITEM_PROMPT_PARTIAL_ARTIFICER));
        parts.push(await fetchPromptText(ITEM_PROMPT_PROFILE_ARTIFICER));
    }

    const composed = composePrompt(parts);
    return applyCampaignPlaceholders(composed);
}

export const ITEM_JSON_IMPORT_KIND_ID = 'item';

const itemJsonImportKind = {
    id: ITEM_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-briefcase"></i> Import',
    idSuffix: 'item',
    windowTitle: 'Import JSON',
    headerTitle: 'Import Item',
    windowIcon: 'fa-solid fa-briefcase',
    position: { width: 920, height: 680 },
    templateOptions: ITEM_TEMPLATE_OPTIONS,
    get promptCheckboxes() {
        if (!isArtificerModuleActive()) return [];
        return [{ id: 'artificerItem', label: 'Artificer Item', checked: false }];
    },
    onCopyTemplate: async (type, promptOptions = {}) => {
        const prompt = await buildItemImportPrompt(type, {
            includeArtificer: !!promptOptions.artificerItem
        });
        return copyToClipboard(prompt, { notify: false });
    },
    onImport: async (entries) => {
        const itemsToImport = await Promise.all(entries.map(parseFlatItemToFoundry));
        const created = await Item.createDocuments(itemsToImport, { keepId: false });
        postConsoleAndNotification(
            MODULE.NAME,
            `Imported ${created.length} item(s) successfully.`,
            '',
            false,
            true
        );
        return true;
    },
    onImportError: (e) => {
        postConsoleAndNotification(MODULE.NAME, 'Failed to import items', e, false, true);
        ui.notifications.error(`Failed to import items: ${e.message}`);
        return false;
    }
};

registerJsonImportKind(itemJsonImportKind);
