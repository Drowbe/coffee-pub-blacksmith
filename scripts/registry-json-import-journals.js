// ==================================================================
// Journal JSON import — prompts, options, and registry kind
// ==================================================================

import { MODULE } from './const.js';
import { CampaignManager } from './manager-campaign.js';
import { postConsoleAndNotification } from './api-core.js';
import { copyToClipboard, createJournalEntry, buildInjuryJournalEntry } from './utility-common.js';
import { registerJsonImportKind } from './registry-json-import.js';
import {
    fetchPromptText,
    composePrompt,
    applyCampaignPlaceholders
} from './utility-json-import-prompts.js';
import {
    getCompendiumActorsList,
    getCompendiumItemsList,
    getWorldActorsList,
    getWorldItemsList,
    hasConfiguredActorCompendiums,
    hasConfiguredItemCompendiums
} from './utility-json-import-compendium-lists.js';

export const JOURNAL_PROMPT_CORE = 'prompt-journal-core.txt';
export const JOURNAL_JSON_IMPORT_KIND_ID = 'journal';

/** @type {Record<string, string>} */
export const JOURNAL_PROMPT_PROFILES = {
    area: 'prompt-journal-profile-area.txt'
};

const CATALOG_SECTION_ACTORS = /---\s*COMPENDIUM ACTORS[\s\S]*?---\s*END COMPENDIUM ACTORS\s*---/i;
const CATALOG_SECTION_ITEMS = /---\s*COMPENDIUM ITEMS[\s\S]*?---\s*END COMPENDIUM ITEMS\s*---/i;
const CATALOG_SECTION_WORLD_ACTORS = /---\s*WORLD ACTORS[\s\S]*?---\s*END WORLD ACTORS\s*---/i;
const CATALOG_SECTION_WORLD_ITEMS = /---\s*WORLD ITEMS[\s\S]*?---\s*END WORLD ITEMS\s*---/i;

/**
 * @returns {Array<{id: string, label: string, checked?: boolean, disabled?: boolean}>}
 */
export function getJournalPromptCheckboxes() {
    const hasActors = hasConfiguredActorCompendiums();
    const hasItems = hasConfiguredItemCompendiums();
    return [
        {
            id: 'compendiumActors',
            label: 'Include compendium actors',
            checked: hasActors,
            disabled: !hasActors
        },
        {
            id: 'compendiumItems',
            label: 'Include compendium items',
            checked: hasItems,
            disabled: !hasItems
        },
        {
            id: 'worldActors',
            label: 'Include world actors',
            checked: true
        },
        {
            id: 'worldItems',
            label: 'Include world items',
            checked: false
        }
    ];
}

/**
 * Geography fields for area prompt copy (prefilled from campaign).
 * @returns {Array<{id: string, label: string, value: string, showForTemplate?: string}>}
 */
export function getJournalPromptFields() {
    const ctx = CampaignManager.getPromptContext();
    return [
        { id: 'realm', label: 'Realm', value: ctx.realm || '', showForTemplate: 'area' },
        { id: 'region', label: 'Region', value: ctx.region || '', showForTemplate: 'area' },
        { id: 'site', label: 'Site', value: ctx.site || '', showForTemplate: 'area' },
        { id: 'area', label: 'Area', value: ctx.area || '', showForTemplate: 'area' },
        { id: 'scenetitle', label: 'Scene title', value: '', showForTemplate: 'area' }
    ];
}

/**
 * @param {object} [geography]
 * @returns {string}
 */
function buildLocationPathHint(geography = {}) {
    const parts = ['realm', 'region', 'site', 'area', 'scenetitle']
        .map((k) => String(geography[k] ?? '').trim())
        .filter(Boolean);
    return parts.join(' > ');
}

/**
 * @param {string} prompt
 * @param {object} [options]
 * @param {object} [options.geography]
 * @param {string} [options.foldername]
 * @param {string} [options.cardImage]
 * @returns {string}
 */
export function applyAreaJournalGeography(prompt, options = {}) {
    const geography = options.geography ?? {};
    const context = CampaignManager.getPromptContext();
    let cardImage = options.cardImage ?? context.narrativeCardImage ?? '';
    if (cardImage === 'custom') {
        cardImage = context.narrativeImagePath || '';
    }

    const replacements = [
        { placeholder: '[ADD-FOLDER-NAME-HERE]', value: options.foldername ?? context.narrativeFolder },
        { placeholder: '[ADD-REALM-HERE]', value: geography.realm ?? context.realm },
        { placeholder: '[ADD-REGION-HERE]', value: geography.region ?? context.region },
        { placeholder: '[ADD-SITE-HERE]', value: geography.site ?? context.site },
        { placeholder: '[ADD-AREA-HERE]', value: geography.area ?? context.area },
        { placeholder: '[ADD-IMAGE-PATH-HERE]', value: cardImage },
        { placeholder: '[ADD-LOCATION-PATH-HERE]', value: buildLocationPathHint(geography) }
    ];

    let result = prompt;
    for (const { placeholder, value } of replacements) {
        if (value) {
            result = result.split(placeholder).join(value);
        }
    }
    return result;
}

/**
 * @param {string} prompt
 * @param {object} catalogOptions
 * @returns {Promise<string>}
 */
async function applyAreaCatalogSections(prompt, catalogOptions) {
    let result = prompt;

    if (catalogOptions.includeCompendiumActors) {
        const list = await getCompendiumActorsList();
        result = result.replace('[ADD-COMPENDIUM-ACTORS-HERE]', list);
    } else {
        result = result.replace(CATALOG_SECTION_ACTORS, '');
    }

    if (catalogOptions.includeCompendiumItems) {
        const list = await getCompendiumItemsList();
        result = result.replace('[ADD-COMPENDIUM-ITEMS-HERE]', list);
    } else {
        result = result.replace(CATALOG_SECTION_ITEMS, '');
    }

    if (catalogOptions.includeWorldActors) {
        const list = getWorldActorsList();
        result = result.replace('[ADD-WORLD-ACTORS-HERE]', list);
    } else {
        result = result.replace(CATALOG_SECTION_WORLD_ACTORS, '');
    }

    if (catalogOptions.includeWorldItems) {
        const list = getWorldItemsList();
        result = result.replace('[ADD-WORLD-ITEMS-HERE]', list);
    } else {
        result = result.replace(CATALOG_SECTION_WORLD_ITEMS, '');
    }

    return result;
}

/**
 * @param {string} profileKey
 * @param {object} [options]
 * @param {boolean} [options.includeCompendiumActors]
 * @param {boolean} [options.includeCompendiumItems]
 * @param {boolean} [options.includeWorldActors]
 * @param {boolean} [options.includeWorldItems]
 * @param {object} [options.geography]
 * @returns {Promise<string>}
 */
export async function buildJournalImportPrompt(profileKey, options = {}) {
    const key = String(profileKey || 'area').toLowerCase();
    const core = await fetchPromptText(JOURNAL_PROMPT_CORE);
    const parts = [core];

    const profileFile = JOURNAL_PROMPT_PROFILES[key];
    if (profileFile) {
        parts.push(await fetchPromptText(profileFile));
    }

    let composed = composePrompt(parts);
    composed = await applyCampaignPlaceholders(composed);

    if (key !== 'area') {
        return composed;
    }

    composed = applyAreaJournalGeography(composed, { geography: options.geography ?? {} });
    const catalogDefaults = {
        includeCompendiumActors: hasConfiguredActorCompendiums(),
        includeCompendiumItems: hasConfiguredItemCompendiums(),
        includeWorldActors: true,
        includeWorldItems: false
    };
    composed = await applyAreaCatalogSections(composed, {
        includeCompendiumActors: options.includeCompendiumActors ?? catalogDefaults.includeCompendiumActors,
        includeCompendiumItems: options.includeCompendiumItems ?? catalogDefaults.includeCompendiumItems,
        includeWorldActors: options.includeWorldActors ?? catalogDefaults.includeWorldActors,
        includeWorldItems: options.includeWorldItems ?? catalogDefaults.includeWorldItems
    });

    for (const placeholder of [
        '[ADD-COMPENDIUM-ACTORS-HERE]',
        '[ADD-COMPENDIUM-ITEMS-HERE]',
        '[ADD-WORLD-ACTORS-HERE]',
        '[ADD-WORLD-ITEMS-HERE]'
    ]) {
        composed = composed.split(placeholder).join('');
    }

    return composed;
}

async function fetchLegacyPromptText(filename) {
    const path = `modules/${MODULE.ID}/prompts/${filename}`;
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Failed to load prompt: ${filename}`);
    }
    return res.text();
}

async function getEncounterTemplateWithDefaults(encounterTemplate) {
    const context = CampaignManager.getPromptContext();
    const settings = [
        { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
        { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
        { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
        { placeholder: '[ADD-PARTY-NAME-HERE]', value: context.partyName },
        { placeholder: '[ADD-PARTY-SIZE-HERE]', value: context.partySize },
        { placeholder: '[ADD-PARTY-LEVEL-HERE]', value: context.partyLevel },
        { placeholder: '[ADD-PARTY-MAKEUP-HERE]', value: context.partyMakeup },
        { placeholder: '[ADD-PARTY-CLASSES-HERE]', value: context.partyClasses },
        { placeholder: '[ADD-FOLDER-NAME-HERE]', value: context.encounterFolder },
        { placeholder: '[ADD-REGION-HERE]', value: context.region },
        { placeholder: '[ADD-AREA-HERE]', value: context.area },
        { placeholder: '[ADD-SITE-HERE]', value: context.site },
        { placeholder: '[ADD-REALM-HERE]', value: context.realm },
        { placeholder: '[ADD-IMAGE-PATH-HERE]', value: context.encounterCardImage }
    ];
    let result = encounterTemplate;
    for (const { placeholder, value: initialValue } of settings) {
        let value = initialValue;
        if (placeholder === '[ADD-IMAGE-PATH-HERE]' && value === 'custom') {
            value = context.encounterImagePath;
        }
        if (!value) continue;
        result = result.split(placeholder).join(value);
    }
    return result;
}

async function getLocationTemplateWithDefaults(locationTemplate) {
    const context = CampaignManager.getPromptContext();
    const settings = [
        { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
        { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
        { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
        { placeholder: '[ADD-REALM-HERE]', value: context.realm },
        { placeholder: '[ADD-REGION-HERE]', value: context.region },
        { placeholder: '[ADD-SITE-HERE]', value: context.site },
        { placeholder: '[ADD-AREA-HERE]', value: context.area }
    ];
    let result = locationTemplate;
    for (const setting of settings) {
        const value = setting.value || '';
        if (value) {
            result = result.split(setting.placeholder).join(value);
        }
    }
    return result;
}

/**
 * @param {string} templateKey
 * @param {Record<string, string|boolean>} [promptOptions]
 */
async function copyJournalTemplate(templateKey, promptOptions = {}) {
    const type = String(templateKey || 'area').toLowerCase();

    if (type === 'injury') {
        return copyToClipboard(await fetchLegacyPromptText('prompt-injuries.txt'), { notify: false });
    }
    if (type === 'encounter') {
        const raw = await fetchLegacyPromptText('prompt-encounter.txt');
        return copyToClipboard(await getEncounterTemplateWithDefaults(raw), { notify: false });
    }
    if (type === 'location') {
        const raw = await fetchLegacyPromptText('prompt-location.txt');
        return copyToClipboard(await getLocationTemplateWithDefaults(raw), { notify: false });
    }

    const prompt = await buildJournalImportPrompt('area', {
        includeCompendiumActors: !!promptOptions.compendiumActors,
        includeCompendiumItems: !!promptOptions.compendiumItems,
        includeWorldActors: !!promptOptions.worldActors,
        includeWorldItems: !!promptOptions.worldItems,
        geography: {
            realm: promptOptions.realm ?? '',
            region: promptOptions.region ?? '',
            site: promptOptions.site ?? '',
            area: promptOptions.area ?? '',
            scenetitle: promptOptions.scenetitle ?? ''
        }
    });
    return copyToClipboard(prompt, { notify: false });
}

/**
 * @param {object[]} entries
 * @returns {Promise<boolean>}
 */
async function importJournalEntries(entries) {
    for (const journalData of entries) {
        const strJournalType = journalData.journaltype;
        if (!strJournalType) {
            throw new Error("Missing 'journaltype' field in JSON data");
        }
        switch (String(strJournalType).toUpperCase()) {
            case 'AREA':
            case 'ENCOUNTER':
            case 'LOCATION':
                await createJournalEntry(journalData);
                break;
            case 'NARRATIVE':
                throw new Error(
                    'Legacy narrative import is not supported. Use journaltype "area" with blocks.*.'
                );
            case 'INJURY':
                await buildInjuryJournalEntry(journalData);
                break;
            default:
                postConsoleAndNotification(
                    MODULE.NAME,
                    "Can't create the journal entry. The journal type was not found.",
                    strJournalType,
                    false,
                    true
                );
                return false;
        }
    }
    return true;
}

const journalJsonImportKind = {
    id: JOURNAL_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-masks-theater"></i> Import',
    idSuffix: 'journal',
    windowTitle: 'Import JSON',
    headerTitle: 'Import Journal',
    windowIcon: 'fa-solid fa-masks-theater',
    position: { width: 920, height: 720 },
    templateOptions: [
        { value: 'area', label: 'Area' },
        { value: 'location', label: 'Location' },
        { value: 'encounter', label: 'Encounter' },
        { value: 'injury', label: 'Injury' }
    ],
    get promptCheckboxes() {
        return getJournalPromptCheckboxes();
    },
    get promptFields() {
        return getJournalPromptFields();
    },
    onCopyTemplate: copyJournalTemplate,
    onImport: async (entries) => importJournalEntries(entries),
    onImportError(e) {
        const message = e?.message || String(e);
        postConsoleAndNotification(MODULE.NAME, `Journal import failed: ${message}`, e, false, true);
        return false;
    }
};

registerJsonImportKind(journalJsonImportKind);
