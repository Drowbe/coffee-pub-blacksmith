// ==================================================================
// Roll table JSON import — prompt registry (core + profile) + kind
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { copyToClipboard } from './utility-common.js';
import { registerJsonImportKind } from './registry-json-import.js';
import { parseTableToFoundry } from './parsers/parse-rolltable.js';
import {
    fetchPromptText,
    composePrompt,
    applyCampaignPlaceholders
} from './utility-json-import-prompts.js';
import {
    getWorldActorsList,
    getWorldItemsList,
    getItemCompendiumsList,
    getActorCompendiumsList,
    getCompendiumItemsList,
    getCompendiumActorsList
} from './utility-rolltable-import-lists.js';

export const ROLLTABLE_PROMPT_CORE = 'prompt-rolltable-core.txt';

/** @type {Record<string, string>} */
export const ROLLTABLE_PROMPT_PROFILES = {
    text: 'prompt-rolltable-profile-text.txt',
    'document-custom': 'prompt-rolltable-profile-document-custom.txt',
    'document-item': 'prompt-rolltable-profile-document-item.txt',
    'document-actor': 'prompt-rolltable-profile-document-actor.txt',
    'compendium-item': 'prompt-rolltable-profile-compendium-item.txt',
    'compendium-actor': 'prompt-rolltable-profile-compendium-actor.txt'
};

export const ROLLTABLE_TEMPLATE_OPTIONS = [
    { value: 'text', label: 'Simple Text' },
    { value: 'document-custom', label: 'Custom' },
    { value: 'document-item', label: 'World Items' },
    { value: 'document-actor', label: 'World Actors' },
    { value: 'compendium-item', label: 'Compendium Items' },
    { value: 'compendium-actor', label: 'Compendium Actors' }
];

/**
 * @param {string} templateKey
 * @returns {Promise<string>}
 */
export async function buildRollTableImportPrompt(templateKey) {
    const key = String(templateKey || 'text').toLowerCase();
    const core = await fetchPromptText(ROLLTABLE_PROMPT_CORE);
    const profileFile = ROLLTABLE_PROMPT_PROFILES[key];
    const parts = [core];
    if (profileFile) {
        parts.push(await fetchPromptText(profileFile));
    }

    let composed = composePrompt(parts);
    composed = await applyCampaignPlaceholders(composed);

    if (key === 'document-actor') {
        composed = composed.split('[ADD-ACTORS-HERE]').join(getWorldActorsList());
    } else if (key === 'document-item') {
        composed = composed.split('[ADD-ITEMS-HERE]').join(getWorldItemsList());
    } else if (key === 'compendium-item') {
        composed = composed.split('[ADD-COMPENDIUMS-HERE]').join(getItemCompendiumsList());
        const compendiumItemsList = await getCompendiumItemsList();
        composed = composed.split('[ADD-COMPENDIUM-ITEMS-HERE]').join(compendiumItemsList);
    } else if (key === 'compendium-actor') {
        composed = composed.split('[ADD-COMPENDIUMS-HERE]').join(getActorCompendiumsList());
        const compendiumActorsList = await getCompendiumActorsList();
        composed = composed.split('[ADD-COMPENDIUM-ACTORS-HERE]').join(compendiumActorsList);
    }

    return composed;
}

export const ROLLTABLE_JSON_IMPORT_KIND_ID = 'rolltable';

const rolltableJsonImportKind = {
    id: ROLLTABLE_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-dice-d20"></i> Import',
    idSuffix: 'rolltable',
    windowTitle: 'Import JSON',
    headerTitle: 'Import Roll Table',
    windowIcon: 'fa-solid fa-dice-d20',
    position: { width: 920, height: 680 },
    templateOptions: ROLLTABLE_TEMPLATE_OPTIONS,
    onCopyTemplate: async (type) => {
        const prompt = await buildRollTableImportPrompt(type);
        copyToClipboard(prompt);
    },
    onImport: async (entries) => {
        const tablesToImport = await Promise.all(entries.map(parseTableToFoundry));
        const created = await RollTable.createDocuments(tablesToImport, { keepId: false });
        postConsoleAndNotification(
            MODULE.NAME,
            `Imported ${created.length} table(s) successfully.`,
            '',
            false,
            true
        );
        return true;
    },
    onImportError: (e) => {
        postConsoleAndNotification(MODULE.NAME, 'Failed to import tables', e, false, true);
        ui.notifications.error(`Failed to import tables: ${e.message}`);
        return false;
    }
};

registerJsonImportKind(rolltableJsonImportKind);
