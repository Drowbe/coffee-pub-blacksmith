// ==================================================================
// Journal JSON import — prompts, options, and registry kind
// ==================================================================

import { MODULE } from './const.js';
import { CampaignManager } from './manager-campaign.js';
import { postConsoleAndNotification } from './api-core.js';
import { createJournalEntry, buildInjuryJournalEntry } from './utility-common.js';
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
export const JOURNAL_PROMPT_VISUAL_CORE = 'prompt-journal-visual-core.txt';
export const JOURNAL_PROMPT_VISUAL_ILLUSTRATION = 'prompt-journal-visual-illustration.txt';
export const JOURNAL_PROMPT_VISUAL_PORTRAIT = 'prompt-journal-visual-portrait.txt';
export const JOURNAL_PROMPT_LOCATION = 'prompt-location.txt';
export const JOURNAL_JSON_IMPORT_KIND_ID = 'journal';

/** @type {Record<string, string[]>} */
export const JOURNAL_VISUAL_PROMPT_COMPOSE = {
    illustration: [JOURNAL_PROMPT_VISUAL_ILLUSTRATION],
    portrait: [JOURNAL_PROMPT_VISUAL_CORE, JOURNAL_PROMPT_VISUAL_PORTRAIT]
};

/**
 * @param {string} subjectType
 * @returns {string}
 */
/**
 * @param {string} subjectType
 * @returns {boolean}
 */
function isIllustrationCharacterScene(subjectType) {
    const s = String(subjectType ?? '').trim().toLowerCase();
    return s.includes('character');
}

/**
 * @param {string} subjectType
 * @returns {boolean}
 */
function isIllustrationNauticalScene(subjectType) {
    const s = String(subjectType ?? '').trim().toLowerCase();
    return (
        s.includes('boat')
        || s.includes('ship')
        || s.includes('harbor')
        || s.includes('dock')
        || s.includes('waterfront')
        || s.includes('pier')
        || s.includes('nautical')
    );
}

function illustrationAspectRulesBlock(subjectType) {
    const s = String(subjectType ?? '').trim().toLowerCase();
    if (s.includes('object') || s.includes('artifact')) {
        return (
            '- Square aspect ratio (1:1)\n'
            + '- The object or artifact must dominate the frame\n'
            + '- Minimal background distraction'
        );
    }
    if (isIllustrationCharacterScene(subjectType)) {
        return (
            '- Landscape aspect ratio (16x9)\n'
            + '- One character as the clear focal point\n'
            + '- Show enough of the setting for context (tavern, deck, camp, street, etc.)\n'
            + '- Not a tight portrait bust — use Portrait Image for headshots'
        );
    }
    if (isIllustrationNauticalScene(subjectType)) {
        return (
            '- Landscape aspect ratio (16x9)\n'
            + '- Maritime setting must read clearly (water, hull, rigging, pier, harbor, etc.)\n'
            + '- The vessel or waterfront environment must fill the frame'
        );
    }
    return (
        '- Landscape aspect ratio (16x9)\n'
        + '- Landscape canvas only\n'
        + '- The environment must fill the entire frame'
    );
}

/** @type {string[]} */
const ILLUSTRATION_SUBJECT_TYPES = [
    'Character (in scene)',
    'Interior',
    'Exterior',
    'Landscape',
    'Street',
    'Landmark',
    'Room',
    'Inn',
    'Shop',
    'Market',
    'Church',
    'Boat',
    'Ship',
    'Harbor / dock',
    'Waterfront',
    'Object',
    'Artifact'
];

/** @type {string[]} */
const ILLUSTRATION_TIMES_OF_DAY = [
    'Pre-dawn',
    'Dawn',
    'Morning',
    'Midday',
    'Afternoon',
    'Dusk',
    'Evening',
    'Night',
    'Deep night'
];

/** @type {string[]} */
const ILLUSTRATION_SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter', 'Timeless / not specified'];

/** @type {string[]} */
const ILLUSTRATION_OCCUPANCY = ['Empty (no people)', 'Sparse', 'Moderate', 'Crowded'];

/**
 * @param {string} occupancy
 * @returns {boolean}
 */
function isIllustrationOccupancyEmpty(occupancy) {
    const o = String(occupancy ?? '').trim().toLowerCase();
    if (!o) return false;
    return (
        o.includes('empty')
        || o.includes('no people')
        || o.includes('no figures')
        || o === 'none'
        || o.includes('unoccupied')
        || o.includes('deserted')
    );
}

/**
 * @param {string} occupancy
 * @returns {string}
 */
function illustrationFigurePolicyBlock(occupancy, subjectType = '') {
    if (isIllustrationCharacterScene(subjectType)) {
        return (
            'One primary character from the description as focal point, embedded in the setting. '
            + 'Additional figures only if [CROWD / OCCUPANCY] allows; not a posed party lineup.'
        );
    }
    if (isIllustrationOccupancyEmpty(occupancy)) {
        return 'No people or humanoid figures — uninhabited scene only.';
    }
    const o = String(occupancy ?? '').trim().toLowerCase();
    if (o.includes('sparse')) {
        return 'Sparse occupancy — at most a few small, distant incidental figures; no party lineup.';
    }
    return '';
}

/**
 * @param {string[]} values
 * @param {string} [selected]
 * @returns {Array<{value: string, label: string}>}
 */
function promptSelectOptions(values, selected = '') {
    const opts = [{ value: '', label: '—' }];
    for (const v of values) {
        opts.push({ value: v, label: v });
    }
    return opts;
}

/**
 * Illustration facet fields for Import JSON (prefill before copy).
 * @returns {Array<{id: string, label: string, value?: string, showForTemplate: string, inputType?: string, fullWidth?: boolean, options?: Array<{value: string, label: string}>}>}
 */
export function getJournalIllustrationPromptFields() {
    return [
        { id: 'illustrationTitle', label: 'Title', value: '', showForTemplate: 'illustration' },
        {
            id: 'illustrationSubjectType',
            label: 'Subject type',
            inputType: 'select',
            value: 'Interior',
            options: promptSelectOptions(ILLUSTRATION_SUBJECT_TYPES),
            showForTemplate: 'illustration'
        },
        {
            id: 'illustrationDescription',
            label: 'Description',
            inputType: 'textarea',
            fullWidth: true,
            value: '',
            showForTemplate: 'illustration'
        },
        {
            id: 'illustrationTimeOfDay',
            label: 'Time of day',
            inputType: 'select',
            value: '',
            options: promptSelectOptions(ILLUSTRATION_TIMES_OF_DAY),
            showForTemplate: 'illustration'
        },
        { id: 'illustrationWeather', label: 'Weather / sky', value: '', showForTemplate: 'illustration' },
        {
            id: 'illustrationSeason',
            label: 'Season',
            inputType: 'select',
            value: '',
            options: promptSelectOptions(ILLUSTRATION_SEASONS),
            showForTemplate: 'illustration'
        },
        { id: 'illustrationMood', label: 'Mood / atmosphere', value: '', showForTemplate: 'illustration' },
        {
            id: 'illustrationOccupancy',
            label: 'Crowd / occupancy',
            inputType: 'select',
            value: 'Empty (no people)',
            options: promptSelectOptions(ILLUSTRATION_OCCUPANCY, 'Empty (no people)'),
            showForTemplate: 'illustration'
        },
        { id: 'illustrationFocal', label: 'Focal anchor', value: '', showForTemplate: 'illustration' }
    ];
}

/**
 * Portrait facet fields for Import JSON (prefill before copy).
 * @returns {Array<{id: string, label: string, value?: string, showForTemplate: string}>}
 */
export function getJournalPortraitPromptFields() {
    return [
        { id: 'portraitName', label: 'Name', value: '', showForTemplate: 'portrait' },
        { id: 'portraitRace', label: 'Creature race', value: '', showForTemplate: 'portrait' },
        { id: 'portraitClass', label: 'Creature class', value: '', showForTemplate: 'portrait' },
        { id: 'portraitGender', label: 'Gender', value: '', showForTemplate: 'portrait' },
        { id: 'portraitExpression', label: 'Expression', value: '', showForTemplate: 'portrait' },
        { id: 'portraitProp', label: 'Prop', value: 'None', showForTemplate: 'portrait' },
        { id: 'portraitHair', label: 'Hair', value: '', showForTemplate: 'portrait' },
        { id: 'portraitAge', label: 'Age', value: '', showForTemplate: 'portrait' },
        { id: 'portraitSkin', label: 'Skin', value: '', showForTemplate: 'portrait' },
        { id: 'portraitPhysique', label: 'Physique', value: '', showForTemplate: 'portrait' }
    ];
}

/**
 * @param {string} prompt
 * @param {Record<string, string|boolean>} [options]
 * @returns {string}
 */
export function applyPortraitPromptPlaceholders(prompt, options = {}) {
    const race = String(options.portraitRace ?? '').trim();
    const cls = String(options.portraitClass ?? '').trim();
    const raceClass = [race, cls].filter(Boolean).join(' ');

    const replacements = [
        { placeholder: '[ADD-PORTRAIT-NAME-HERE]', value: options.portraitName },
        { placeholder: '[ADD-PORTRAIT-RACE-HERE]', value: options.portraitRace },
        { placeholder: '[ADD-PORTRAIT-CLASS-HERE]', value: options.portraitClass },
        { placeholder: '[ADD-PORTRAIT-GENDER-HERE]', value: options.portraitGender },
        { placeholder: '[ADD-PORTRAIT-EXPRESSION-HERE]', value: options.portraitExpression },
        { placeholder: '[ADD-PORTRAIT-PROP-HERE]', value: options.portraitProp ?? 'None' },
        { placeholder: '[ADD-PORTRAIT-HAIR-HERE]', value: options.portraitHair },
        { placeholder: '[ADD-PORTRAIT-AGE-HERE]', value: options.portraitAge },
        { placeholder: '[ADD-PORTRAIT-SKIN-HERE]', value: options.portraitSkin },
        { placeholder: '[ADD-PORTRAIT-PHYSIQUE-HERE]', value: options.portraitPhysique },
        { placeholder: '[ADD-PORTRAIT-RACE-CLASS-HERE]', value: raceClass }
    ];

    let result = String(prompt ?? '');
    for (const { placeholder, value } of replacements) {
        result = result.split(placeholder).join(String(value ?? '').trim());
    }
    return result;
}

/**
 * @param {string} prompt
 * @param {Record<string, string|boolean>} [options]
 * @returns {string}
 */
export function applyIllustrationPromptPlaceholders(prompt, options = {}) {
    const focalRaw = String(options.illustrationFocal ?? '').trim();
    const description = String(options.illustrationDescription ?? '').trim();
    const focalDisplay = focalRaw
        || (description ? '(from description — environmental anchor only, not characters)' : '');

    const replacements = [
        { placeholder: '[ADD-ILLUSTRATION-TITLE-HERE]', value: options.illustrationTitle },
        { placeholder: '[ADD-ILLUSTRATION-SUBJECT-TYPE-HERE]', value: options.illustrationSubjectType },
        {
            placeholder: '[ADD-ILLUSTRATION-ASPECT-RULES-HERE]',
            value: illustrationAspectRulesBlock(options.illustrationSubjectType)
        },
        { placeholder: '[ADD-ILLUSTRATION-DESCRIPTION-HERE]', value: options.illustrationDescription },
        { placeholder: '[ADD-ILLUSTRATION-TIME-OF-DAY-HERE]', value: options.illustrationTimeOfDay },
        { placeholder: '[ADD-ILLUSTRATION-WEATHER-HERE]', value: options.illustrationWeather },
        { placeholder: '[ADD-ILLUSTRATION-SEASON-HERE]', value: options.illustrationSeason },
        { placeholder: '[ADD-ILLUSTRATION-MOOD-HERE]', value: options.illustrationMood },
        { placeholder: '[ADD-ILLUSTRATION-OCCUPANCY-HERE]', value: options.illustrationOccupancy },
        { placeholder: '[ADD-ILLUSTRATION-FOCAL-HERE]', value: focalDisplay },
        {
            placeholder: '[ADD-ILLUSTRATION-FIGURE-POLICY-HERE]',
            value: illustrationFigurePolicyBlock(
                options.illustrationOccupancy,
                options.illustrationSubjectType
            )
        }
    ];

    let result = String(prompt ?? '');
    for (const { placeholder, value } of replacements) {
        result = result.split(placeholder).join(String(value ?? '').trim());
    }
    return result;
}

/**
 * Illustration + portrait facet fields for Import JSON.
 * @returns {Array<{id: string, label: string, value?: string, showForTemplate: string}>}
 */
export function getJournalImagePromptFields() {
    return [...getJournalIllustrationPromptFields(), ...getJournalPortraitPromptFields()];
}

/** @type {Record<string, string>} */
export const JOURNAL_PROMPT_PROFILES = {
    area: 'prompt-journal-profile-area.txt'
};

const CATALOG_SECTION_ACTORS = /---\s*COMPENDIUM ACTORS[\s\S]*?---\s*END COMPENDIUM ACTORS\s*---/i;
const CATALOG_SECTION_ITEMS = /---\s*COMPENDIUM ITEMS[\s\S]*?---\s*END COMPENDIUM ITEMS\s*---/i;
const CATALOG_SECTION_WORLD_ACTORS = /---\s*WORLD ACTORS[\s\S]*?---\s*END WORLD ACTORS\s*---/i;
const CATALOG_SECTION_WORLD_ITEMS = /---\s*WORLD ITEMS[\s\S]*?---\s*END WORLD ITEMS\s*---/i;

/**
 * Catalog append options — **Area Narrative** copy only (profile embeds compendium lists).
 * @returns {Array<{id: string, label: string, checked?: boolean, disabled?: boolean, showForTemplate: string}>}
 */
export function getJournalPromptCheckboxes() {
    const hasActors = hasConfiguredActorCompendiums();
    const hasItems = hasConfiguredItemCompendiums();
    return [
        {
            id: 'compendiumActors',
            label: 'Include compendium actors',
            checked: hasActors,
            disabled: !hasActors,
            showForTemplate: 'area'
        },
        {
            id: 'compendiumItems',
            label: 'Include compendium items',
            checked: hasItems,
            disabled: !hasItems,
            showForTemplate: 'area'
        },
        {
            id: 'worldActors',
            label: 'Include world actors',
            checked: false,
            showForTemplate: 'area'
        },
        {
            id: 'worldItems',
            label: 'Include world items',
            checked: false,
            showForTemplate: 'area'
        }
    ];
}

/**
 * Area journal import UI (folder, geography, image placeholders).
 * @returns {object}
 */
/**
 * Location journal import UI (folder, journal container, title, geography, image path).
 * @returns {object}
 */
export function getJournalLocationImportUi() {
    const ctx = CampaignManager.getPromptContext();
    return {
        showForTemplate: 'location',
        folder: {
            id: 'locationFoldername',
            label: 'Journal folder',
            value: 'Libraries'
        },
        journal: {
            id: 'locationJournalname',
            label: 'Journal name',
            value: 'Locations'
        },
        title: {
            id: 'locationTitle',
            label: 'Location title',
            value: ''
        },
        additionalContext: {
            id: 'additionalContext',
            label: 'Additional context',
            value: ''
        },
        geography: [
            { id: 'realm', label: 'Realm', value: ctx.realm || '' },
            { id: 'region', label: 'Region', value: ctx.region || '' },
            { id: 'site', label: 'Site', value: ctx.site || '' },
            { id: 'area', label: 'Area', value: ctx.area || '' }
        ],
        geographyDefault: { id: 'geographyDefault', label: 'Default' },
        locationImage: {
            fieldId: 'locationimage',
            fieldLabel: 'Location image path',
            value: ''
        }
    };
}

export function getJournalAreaImportUi() {
    const ctx = CampaignManager.getPromptContext();
    return {
        showForTemplate: 'area',
        folder: {
            id: 'foldername',
            label: 'Narrative Folder',
            value: ctx.narrativeFolder || ''
        },
        geography: [
            { id: 'realm', label: 'Realm', value: ctx.realm || '' },
            { id: 'region', label: 'Region', value: ctx.region || '' },
            { id: 'site', label: 'Site', value: ctx.site || '' },
            { id: 'area', label: 'Area', value: ctx.area || '' },
            { id: 'scenetitle', label: 'Scene title', value: '' }
        ],
        geographyDefault: { id: 'geographyDefault', label: 'Default' },
        additionalContext: {
            id: 'additionalContext',
            label: 'Additional context',
            value: ''
        },
        images: [
            {
                fieldId: 'narrativeImage',
                checkboxId: 'narrativeImagePlaceholder',
                defaultCheckboxId: 'narrativeImageDefault',
                fieldLabel: 'Default Narrative Image',
                checkboxLabel: 'Narrative Image Placeholder',
                defaultLabel: 'Default',
                value: ctx.narrativeImagePath || '',
                checked: !!(ctx.narrativeImagePath || '')
            },
            {
                fieldId: 'characterImage',
                checkboxId: 'characterImagePlaceholder',
                defaultCheckboxId: 'characterImageDefault',
                fieldLabel: 'Default Character Image',
                checkboxLabel: 'Character Image Placeholder',
                defaultLabel: 'Default',
                value: ctx.narrativeCharacterImagePath || '',
                checked: !!(ctx.narrativeCharacterImagePath || '')
            }
        ]
    };
}

const GEOGRAPHY_SETTING_KEYS = {
    realm: 'defaultCampaignRealm',
    region: 'defaultCampaignRegion',
    site: 'defaultCampaignSite',
    area: 'defaultCampaignArea'
};

/**
 * Persist folder and geography from import UI when "Default" is checked.
 * @param {Record<string, string|boolean>} promptOptions
 */
async function saveCampaignGeographyDefaultsIfRequested(promptOptions = {}) {
    if (!promptOptions.geographyDefault) return;
    if (promptOptions.foldername != null) {
        await game.settings.set(MODULE.ID, 'defaultNarrativeFolder', String(promptOptions.foldername ?? ''));
    }
    for (const [field, settingKey] of Object.entries(GEOGRAPHY_SETTING_KEYS)) {
        if (promptOptions[field] != null) {
            await game.settings.set(MODULE.ID, settingKey, String(promptOptions[field] ?? ''));
        }
    }
}

/**
 * Persist narrative/character image paths from import UI when "Default" is checked.
 * @param {Record<string, string|boolean>} promptOptions
 */
async function saveCampaignImageDefaultsIfRequested(promptOptions = {}) {
    if (promptOptions.narrativeImageDefault) {
        await game.settings.set(
            MODULE.ID,
            'narrativeDefaultImagePath',
            String(promptOptions.narrativeImage ?? '')
        );
    }
    if (promptOptions.characterImageDefault) {
        await game.settings.set(
            MODULE.ID,
            'narrativeDefaultCharacterImagePath',
            String(promptOptions.characterImage ?? '')
        );
    }
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
 * @param {string} [options.foldername]
 * @param {boolean} [options.includeNarrativeImage]
 * @param {boolean} [options.includeCharacterImage]
 * @param {string} [options.narrativeImage]
 * @param {string} [options.characterImage]
 * @returns {string}
 */
export function applyAreaJournalGeography(prompt, options = {}) {
    const geography = options.geography ?? {};
    const context = CampaignManager.getPromptContext();
    const narrativeImage = options.includeNarrativeImage
        ? String(options.narrativeImage ?? context.narrativeImagePath ?? '')
        : '';
    const characterImage = options.includeCharacterImage
        ? String(options.characterImage ?? context.narrativeCharacterImagePath ?? '')
        : '';

    const replacements = [
        { placeholder: '[ADD-FOLDER-NAME-HERE]', value: options.foldername ?? context.narrativeFolder },
        { placeholder: '[ADD-REALM-HERE]', value: geography.realm ?? context.realm },
        { placeholder: '[ADD-REGION-HERE]', value: geography.region ?? context.region },
        { placeholder: '[ADD-SITE-HERE]', value: geography.site ?? context.site },
        { placeholder: '[ADD-AREA-HERE]', value: geography.area ?? context.area },
        { placeholder: '[ADD-LOCATION-PATH-HERE]', value: buildLocationPathHint(geography) },
        { placeholder: '[ADD-IMAGE-PATH-HERE]', value: narrativeImage, allowEmpty: true },
        { placeholder: '[ADD-NARRATIVE-IMAGE-PATH-HERE]', value: narrativeImage, allowEmpty: true },
        { placeholder: '[ADD-CHARACTER-IMAGE-PATH-HERE]', value: characterImage, allowEmpty: true },
        {
            placeholder: '[ADD-AREA-ADDITIONAL-CONTEXT-HERE]',
            value: options.additionalContext,
            allowEmpty: true
        },
        {
            placeholder: '[ADD-AREA-CONTEXT-HERE]',
            value: options.additionalContext,
            allowEmpty: true
        }
    ];

    let result = prompt;
    for (const { placeholder, value, allowEmpty } of replacements) {
        if (value || allowEmpty) {
            result = result.split(placeholder).join(value ?? '');
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
/**
 * Image-only prompt (shared visual core + illustration or portrait profile).
 * @param {'illustration'|'portrait'} bucket
 * @param {Record<string, string|boolean>} [promptOptions] — portrait facet values when bucket is portrait
 * @returns {Promise<string>}
 */
export async function buildJournalVisualPrompt(bucket, promptOptions = {}) {
    const key = String(bucket || '').toLowerCase();
    const files = JOURNAL_VISUAL_PROMPT_COMPOSE[key];
    if (!files?.length) {
        throw new Error(`Unknown journal visual prompt bucket: ${bucket}`);
    }
    const parts = await Promise.all(files.map((f) => fetchPromptText(f)));
    let composed = composePrompt(parts);
    if (key === 'illustration') {
        composed = applyIllustrationPromptPlaceholders(composed, promptOptions);
    } else if (key === 'portrait') {
        composed = applyPortraitPromptPlaceholders(composed, promptOptions);
        composed = (
            '========================================\n'
            + 'GENERATE ONE NPC PORTRAIT NOW\n'
            + '========================================\n\n'
            + 'Use your image-generation tool. Apply PREFILLED FACETS and STYLE RULES below. '
            + 'Do not render prompt text inside the image.\n\n'
            + '--------------------------------\n'
            + 'PORTRAIT REFERENCE (below)\n'
            + '--------------------------------\n\n'
        ) + composed;
    }
    return composed;
}

/**
 * Narrative JSON prompt (core + import profile). Does not include image-generation rules.
 * @param {string} profileKey
 * @param {object} [options]
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

    composed = applyAreaJournalGeography(composed, {
        geography: options.geography ?? {},
        additionalContext: options.additionalContext ?? '',
        foldername: options.foldername,
        includeNarrativeImage: options.includeNarrativeImage,
        includeCharacterImage: options.includeCharacterImage,
        narrativeImage: options.narrativeImage,
        characterImage: options.characterImage
    });
    const catalogDefaults = {
        includeCompendiumActors: hasConfiguredActorCompendiums(),
        includeCompendiumItems: hasConfiguredItemCompendiums(),
        includeWorldActors: false,
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

/**
 * @param {string} prompt
 * @param {Record<string, string|boolean>} [options]
 * @returns {string}
 */
export function applyLocationPromptPlaceholders(prompt, options = {}) {
    const ctx = CampaignManager.getPromptContext();
    const pick = (key, fallbackKey) => {
        const v = String(options[key] ?? '').trim();
        if (v) return v;
        if (fallbackKey) return String(ctx[fallbackKey] ?? '').trim();
        return '';
    };

    const replacements = [
        { placeholder: '[ADD-LOCATION-FOLDER-HERE]', value: options.locationFoldername ?? 'Libraries' },
        { placeholder: '[ADD-LOCATION-JOURNAL-HERE]', value: options.locationJournalname ?? 'Locations' },
        { placeholder: '[ADD-LOCATION-TITLE-HERE]', value: options.locationTitle },
        { placeholder: '[ADD-LOCATION-REALM-HERE]', value: pick('realm', 'realm') },
        { placeholder: '[ADD-LOCATION-REGION-HERE]', value: pick('region', 'region') },
        { placeholder: '[ADD-LOCATION-SITE-HERE]', value: pick('site', 'site') },
        { placeholder: '[ADD-LOCATION-AREA-HERE]', value: pick('area', 'area') },
        {
            placeholder: '[ADD-LOCATION-IMAGE-HERE]',
            value: options.locationimage || 'None (generate with Illustration Image, then paste path)'
        },
        {
            placeholder: '[ADD-LOCATION-ADDITIONAL-CONTEXT-HERE]',
            value: options.additionalContext,
            allowEmpty: true
        },
        {
            placeholder: '[ADD-LOCATION-CONTEXT-HERE]',
            value: options.additionalContext,
            allowEmpty: true
        }
    ];

    let result = String(prompt ?? '');
    for (const { placeholder, value, allowEmpty } of replacements) {
        const text = String(value ?? '').trim();
        if (text || allowEmpty) {
            result = result.split(placeholder).join(text);
        } else {
            result = result.split(placeholder).join('(not specified)');
        }
    }
    return result;
}

/**
 * @param {Record<string, string|boolean>} [promptOptions]
 * @returns {Promise<string>}
 */
export async function buildLocationImportPrompt(promptOptions = {}) {
    let composed = await fetchPromptText(JOURNAL_PROMPT_LOCATION);
    composed = applyLocationPromptPlaceholders(composed, promptOptions);
    return applyCampaignPlaceholders(composed);
}

/**
 * Build the prompt text for a journal import template. The window decides how to
 * deliver it (copy to clipboard or save as a text file).
 * @param {string} templateKey
 * @param {Record<string, string|boolean>} [promptOptions]
 * @returns {Promise<string>}
 */
async function buildJournalPrompt(templateKey, promptOptions = {}) {
    const type = String(templateKey || 'area').toLowerCase();

    if (type === 'illustration') {
        return buildJournalVisualPrompt('illustration', promptOptions);
    }
    if (type === 'portrait') {
        return buildJournalVisualPrompt('portrait', promptOptions);
    }

    if (type === 'injury') {
        return fetchLegacyPromptText('prompt-injuries.txt');
    }
    if (type === 'encounter') {
        const raw = await fetchLegacyPromptText('prompt-encounter.txt');
        return getEncounterTemplateWithDefaults(raw);
    }
    if (type === 'location') {
        await saveCampaignGeographyDefaultsIfRequested(promptOptions);
        return buildLocationImportPrompt(promptOptions);
    }

    await saveCampaignGeographyDefaultsIfRequested(promptOptions);
    await saveCampaignImageDefaultsIfRequested(promptOptions);

    const prompt = await buildJournalImportPrompt('area', {
        includeCompendiumActors: !!promptOptions.compendiumActors,
        includeCompendiumItems: !!promptOptions.compendiumItems,
        includeWorldActors: !!promptOptions.worldActors,
        includeWorldItems: !!promptOptions.worldItems,
        foldername: promptOptions.foldername ?? '',
        includeNarrativeImage: !!promptOptions.narrativeImagePlaceholder,
        includeCharacterImage: !!promptOptions.characterImagePlaceholder,
        narrativeImage: promptOptions.narrativeImage ?? '',
        characterImage: promptOptions.characterImage ?? '',
        geography: {
            realm: promptOptions.realm ?? '',
            region: promptOptions.region ?? '',
            site: promptOptions.site ?? '',
            area: promptOptions.area ?? '',
            scenetitle: promptOptions.scenetitle ?? ''
        },
        additionalContext: promptOptions.additionalContext ?? ''
    });
    return prompt;
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
        { value: 'area', label: 'Area Narrative' },
        { value: 'illustration', label: 'Illustration Image' },
        { value: 'portrait', label: 'Portrait Image' },
        { value: 'location', label: 'Location Narrative' },
        { value: 'encounter', label: 'Encounter (Legacy)' },
        { value: 'injury', label: 'Injury (Legacy)' }
    ],
    get promptCheckboxes() {
        return getJournalPromptCheckboxes();
    },
    get promptFields() {
        return getJournalImagePromptFields();
    },
    get journalAreaUi() {
        return getJournalAreaImportUi();
    },
    get journalLocationUi() {
        return getJournalLocationImportUi();
    },
    onBuildPrompt: buildJournalPrompt,
    onImport: async (entries) => importJournalEntries(entries),
    onImportError(e) {
        const message = e?.message || String(e);
        postConsoleAndNotification(MODULE.NAME, `Journal import failed: ${message}`, e, false, true);
        return false;
    }
};

registerJsonImportKind(journalJsonImportKind);
