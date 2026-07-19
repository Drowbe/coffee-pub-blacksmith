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
    getConfiguredActorCompendiums,
    getConfiguredItemCompendiums
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

/** @type {string[]} */
const PORTRAIT_GENDERS = ['Male', 'Female', 'Androgynous', 'Nonbinary'];

/** @type {string[]} */
const PORTRAIT_RACES = [
    'Human', 'Elf', 'Half-Elf', 'Drow', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Orc',
    'Dragonborn', 'Tiefling', 'Aasimar', 'Genasi', 'Goliath', 'Firbolg', 'Tabaxi', 'Kenku',
    'Aarakocra', 'Tortle', 'Triton', 'Goblin', 'Hobgoblin', 'Bugbear', 'Kobold', 'Lizardfolk',
    'Yuan-ti', 'Gnoll', 'Minotaur', 'Centaur', 'Satyr', 'Changeling', 'Shifter', 'Warforged',
    'Giant', 'Ogre', 'Troll', 'Hag', 'Vampire', 'Undead / Skeleton', 'Construct', 'Demon / Devil',
    'Celestial', 'Fey', 'Elemental', 'Beast / Animal', 'Other'
];

/** @type {string[]} */
const PORTRAIT_CLASSES = [
    'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue',
    'Sorcerer', 'Warlock', 'Wizard', 'Artificer',
    'Commoner', 'Merchant', 'Innkeeper', 'Noble', 'Guard', 'Soldier', 'Knight', 'Mercenary',
    'Bandit', 'Pirate', 'Sailor', 'Assassin', 'Spy', 'Cultist', 'Priest', 'Acolyte', 'Mage',
    'Scholar', 'Hunter', 'Scout', 'Blacksmith', 'Farmer', 'Beggar', 'Entertainer', 'Monarch',
    'None / Other'
];

/** @type {string[]} */
const PORTRAIT_EXPRESSIONS = [
    'Neutral', 'Calm', 'Confident', 'Stern', 'Angry', 'Fierce', 'Smiling', 'Joyful', 'Smug',
    'Sad', 'Melancholic', 'Fearful', 'Surprised', 'Suspicious', 'Determined', 'Weary', 'Pained',
    'Cruel', 'Kind', 'Curious', 'Bored', 'Haughty'
];

/** @type {string[]} */
const PORTRAIT_PROPS = [
    'None', 'Sword', 'Dagger', 'Bow', 'Staff', 'Wand', 'Spellbook', 'Shield', 'Torch', 'Lantern',
    'Tankard', 'Coin purse', 'Holy symbol', 'Musical instrument', 'Tools', 'Scroll', 'Potion',
    'Animal companion', 'Walking stick', 'Crown'
];

/** @type {string[]} */
const PORTRAIT_AGES = [
    'Child', 'Adolescent', 'Young adult', 'Adult', 'Middle-aged', 'Elderly', 'Ancient'
];

/** @type {string[]} */
const PORTRAIT_PHYSIQUES = [
    'Slim', 'Average', 'Athletic', 'Muscular', 'Stocky', 'Heavyset', 'Gaunt', 'Frail',
    'Towering', 'Diminutive'
];

/**
 * Portrait facet fields for Import JSON (prefill before copy). Categorical facets use
 * dropdowns; free-form facets (name, hair, skin) stay text. Grouped into sections via `group`.
 * @returns {Array<{id: string, label: string, value?: string, showForTemplate: string, inputType?: string, options?: Array<{value: string, label: string}>, group?: string, groupIcon?: string}>}
 */
export function getJournalPortraitPromptFields() {
    const IDENTITY = { group: 'Identity', groupIcon: 'fa-solid fa-id-badge' };
    const SPECIES = { group: 'Species & Role', groupIcon: 'fa-solid fa-dna' };
    const APPEARANCE = { group: 'Appearance', groupIcon: 'fa-solid fa-palette' };
    const select = (values, value = '') => ({ inputType: 'select', options: promptSelectOptions(values), value });
    return [
        { id: 'portraitName', label: 'Name', value: '', showForTemplate: 'portrait', ...IDENTITY },
        { id: 'portraitGender', label: 'Gender', showForTemplate: 'portrait', ...select(PORTRAIT_GENDERS), ...IDENTITY },
        { id: 'portraitAge', label: 'Age', showForTemplate: 'portrait', ...select(PORTRAIT_AGES), ...IDENTITY },
        { id: 'portraitRace', label: 'Creature race', showForTemplate: 'portrait', ...select(PORTRAIT_RACES), ...SPECIES },
        { id: 'portraitClass', label: 'Creature class', showForTemplate: 'portrait', ...select(PORTRAIT_CLASSES), ...SPECIES },
        { id: 'portraitPhysique', label: 'Physique', showForTemplate: 'portrait', ...select(PORTRAIT_PHYSIQUES), ...APPEARANCE },
        { id: 'portraitExpression', label: 'Expression', showForTemplate: 'portrait', ...select(PORTRAIT_EXPRESSIONS), ...APPEARANCE },
        { id: 'portraitHair', label: 'Hair', value: '', showForTemplate: 'portrait', ...APPEARANCE },
        { id: 'portraitSkin', label: 'Skin', value: '', showForTemplate: 'portrait', ...APPEARANCE },
        { id: 'portraitProp', label: 'Prop', value: '', inputType: 'textarea', rows: 3, fullWidth: true, showForTemplate: 'portrait', ...APPEARANCE }
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

// Per-compendium checkbox ids encode their pack id after the prefix, e.g.
// "compendiumActor:dnd5e.monsters". collectSelectedCompendiumIds() reverses this.
const COMPENDIUM_ACTOR_CHECKBOX_PREFIX = 'compendiumActor:';
const COMPENDIUM_ITEM_CHECKBOX_PREFIX = 'compendiumItem:';

/**
 * Pack ids whose per-compendium checkbox is selected in the prompt options.
 * @param {Record<string, string|boolean>} promptOptions
 * @param {string} prefix
 * @returns {string[]}
 */
function collectSelectedCompendiumIds(promptOptions, prefix) {
    return Object.keys(promptOptions ?? {})
        .filter((key) => key.startsWith(prefix) && promptOptions[key])
        .map((key) => key.slice(prefix.length));
}

const PROMPT_SELECTIONS_SETTING = 'journalPromptCompendiumSelections';

/**
 * Remembered checkbox states for the journal Generate tab (compendium + world), keyed by
 * checkbox id. Empty object when nothing has been saved yet.
 * @returns {Record<string, boolean>}
 */
function getSavedPromptSelections() {
    try {
        const raw = game.settings.get(MODULE.ID, PROMPT_SELECTIONS_SETTING);
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/**
 * Persist the current compendium/world checkbox states so they pre-select next time.
 * @param {Record<string, string|boolean>} promptOptions
 */
async function saveJournalPromptSelections(promptOptions = {}) {
    const map = {};
    for (const key of Object.keys(promptOptions)) {
        if (key.endsWith('__none')) continue;
        if (key.startsWith(COMPENDIUM_ACTOR_CHECKBOX_PREFIX) || key.startsWith(COMPENDIUM_ITEM_CHECKBOX_PREFIX)) {
            map[key] = !!promptOptions[key];
        }
    }
    map.worldActors = !!promptOptions.worldActors;
    map.worldItems = !!promptOptions.worldItems;
    try {
        await game.settings.set(MODULE.ID, PROMPT_SELECTIONS_SETTING, map);
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Failed to save journal prompt selections', e, false, false);
    }
}

/**
 * Catalog append options — **Area Narrative** copy only (profile embeds compendium lists).
 * Compendium actors/items render as one checkbox per configured compendium, grouped into
 * sections so the GM can choose which compendiums to source from. World options stay global.
 * @returns {Array<{id: string, label: string, checked?: boolean, disabled?: boolean, showForTemplate: string, section?: string, sectionIcon?: string, isNote?: boolean, stacked?: boolean}>}
 */
export function getJournalPromptCheckboxes() {
    const checkboxes = [];
    const saved = getSavedPromptSelections();
    // Remembered state wins; otherwise default per checkbox (compendiums on, world off).
    const isChecked = (id, fallback) => (id in saved ? !!saved[id] : fallback);

    const addCompendiumSection = (compendiums, prefix, section, sectionIcon, emptyNote) => {
        if (!compendiums.length) {
            checkboxes.push({
                id: `${prefix}__none`,
                label: emptyNote,
                checked: false,
                disabled: true,
                showForTemplate: 'area',
                section,
                sectionIcon,
                isNote: true
            });
            return;
        }
        for (const comp of compendiums) {
            const id = `${prefix}${comp.id}`;
            checkboxes.push({
                id,
                label: comp.label,
                checked: isChecked(id, true),
                showForTemplate: 'area',
                section,
                sectionIcon
            });
        }
    };

    addCompendiumSection(
        getConfiguredActorCompendiums(),
        COMPENDIUM_ACTOR_CHECKBOX_PREFIX,
        'Compendium Actors',
        'fa-solid fa-dragon',
        'No actor compendiums configured (see module settings).'
    );
    addCompendiumSection(
        getConfiguredItemCompendiums(),
        COMPENDIUM_ITEM_CHECKBOX_PREFIX,
        'Compendium Items',
        'fa-solid fa-wand-sparkles',
        'No item compendiums configured (see module settings).'
    );

    checkboxes.push(
        {
            id: 'worldActors',
            label: 'Include world actors',
            checked: isChecked('worldActors', false),
            showForTemplate: 'area',
            section: 'World',
            sectionIcon: 'fa-solid fa-globe',
            stacked: true
        },
        {
            id: 'worldItems',
            label: 'Include world items',
            checked: isChecked('worldItems', false),
            showForTemplate: 'area',
            section: 'World',
            sectionIcon: 'fa-solid fa-globe',
            stacked: true
        }
    );

    return checkboxes;
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
        generationOptions: [
            {
                id: 'sceneEmphasis', label: 'Scene emphasis', value: 'auto',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'exploration', label: 'Exploration' },
                    { value: 'social', label: 'Social' },
                    { value: 'combat', label: 'Combat' },
                    { value: 'mixed', label: 'Mixed' }
                ]
            },
            {
                id: 'contentHandling', label: 'Content handling', value: 'expand',
                options: [
                    { value: 'expand', label: 'Expand Freely' },
                    { value: 'preserve', label: 'Preserve Supplied Facts' },
                    { value: 'catalog', label: 'Catalog Content Only' }
                ]
            },
            {
                id: 'detailLevel', label: 'Detail level', value: 'standard',
                options: [
                    { value: 'concise', label: 'Concise' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'detailed', label: 'Detailed' }
                ]
            },
            {
                id: 'encounterContent', label: 'Encounter', value: 'auto',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'include', label: 'Include' },
                    { value: 'omit', label: 'Omit' }
                ]
            },
            {
                id: 'conversationContent', label: 'Conversations', value: 'auto',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'include', label: 'Include' },
                    { value: 'omit', label: 'Omit' }
                ]
            },
            {
                id: 'rewardContent', label: 'Rewards', value: 'auto',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'include', label: 'Include' },
                    { value: 'omit', label: 'Omit' }
                ]
            }
        ],
        additionalContext: {
            id: 'additionalContext',
            label: 'Additional context',
            value: ''
        },
        images: [
            {
                fieldId: 'narrativeImage',
                checkboxId: 'narrativeImagePlaceholder',
                fieldLabel: 'Narrative Image',
                value: ctx.narrativeImagePath || '',
                checked: !!(ctx.narrativeImagePath || '')
            },
            {
                fieldId: 'characterImage',
                checkboxId: 'characterImagePlaceholder',
                fieldLabel: 'Character Image',
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
 * Persist folder and geography from the import UI. Always mirrors whatever the GM entered
 * (no opt-in checkbox) so those fields pre-fill next time. Only fields present in the options
 * are written.
 * @param {Record<string, string|boolean>} promptOptions
 */
async function saveCampaignGeography(promptOptions = {}) {
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
 * Persist narrative/character image paths from the import UI. Always mirrors whatever the GM
 * entered (no opt-in checkbox). Only writes a path when its field is present in the options.
 * @param {Record<string, string|boolean>} promptOptions
 */
async function saveCampaignImagePaths(promptOptions = {}) {
    if (promptOptions.narrativeImage != null) {
        await game.settings.set(
            MODULE.ID,
            'narrativeDefaultImagePath',
            String(promptOptions.narrativeImage ?? '')
        );
    }
    if (promptOptions.characterImage != null) {
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
        },
        {
            placeholder: '[ADD-AREA-GENERATION-DIRECTIVES-HERE]',
            value: buildAreaGenerationDirectives(options),
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

const AREA_GENERATION_OPTIONS = {
    sceneEmphasis: {
        default: 'auto',
        values: {
            auto: 'Scene emphasis: infer the most useful emphasis from the supplied context; do not force an optional block without evidence.',
            exploration: 'Scene emphasis: exploration. Prioritize navigable layout, interactive details, discoverable facts, clues, and meaningful environmental choices.',
            social: 'Scene emphasis: social. Prioritize a playable cast, motives, knowledge, rumors, wants, and conversational leverage.',
            combat: 'Scene emphasis: combat. Make the encounter runnable with clear participants, triggers, terrain implications, tactics, and special conditions.',
            mixed: 'Scene emphasis: mixed. Balance exploration, social interaction, and conflict while keeping each included element actionable.'
        }
    },
    contentHandling: {
        default: 'expand',
        values: {
            expand: 'Content handling: expand freely within the supplied campaign facts. Invent cohesive supporting details, NPCs, items, clues, and complications when they improve play.',
            preserve: 'Content handling: preserve supplied facts. Treat pasted/source material as authoritative; organize and clarify it, but add only conservative connective detail and never replace established facts.',
            catalog: 'Content handling: catalog content only for linkable Actors and Items. Use exact names from the appended selected catalogs; do not invent named Actors or Items. Non-linkable scenery and prose details may still be created.'
        }
    },
    detailLevel: {
        default: 'standard',
        values: {
            concise: 'Detail level: concise. Produce a lean table-ready scene with short read-aloud text and only the most actionable entries.',
            standard: 'Detail level: standard. Provide enough material to run the scene comfortably without padding or novel-like prose.',
            detailed: 'Detail level: detailed. Provide robust alternatives, clues, motivations, and operational detail, but preserve fast scanning during play.'
        }
    },
    encounterContent: {
        default: 'auto',
        values: {
            auto: 'Encounter block: include only when the context supports a runnable conflict or hazard.',
            include: 'Encounter block: REQUIRED. Include blocks.encounter with a runnable overview, tactics, triggers, and special conditions as applicable.',
            omit: 'Encounter block: OMIT blocks.encounter entirely, even if conflict is mentioned; retain only non-encounter context elsewhere when useful.'
        }
    },
    conversationContent: {
        default: 'auto',
        values: {
            auto: 'Conversations block: include only when specific people meaningfully participate in the scene.',
            include: 'Conversations block: REQUIRED. Include at least one playable individual with a personal name or diegetic handle and useful knowledge, hearsay, and wants.',
            omit: 'Conversations block: OMIT blocks.conversations entirely; anonymous population may remain environmental prose.'
        }
    },
    rewardContent: {
        default: 'auto',
        values: {
            auto: 'Rewards: include blocks.preparation.rewards only when the context supports treasure, payment, clues-as-rewards, or other meaningful gains.',
            include: 'Rewards: REQUIRED. Include at least one context-appropriate reward entry; use exact catalog Item names for linkable items.',
            omit: 'Rewards: omit the rewards field entirely; do not emit an empty array or filler reward.'
        }
    }
};

/**
 * Convert stable Area generation options into explicit prompt directives. This is shared by
 * the Foundry window and future API/tool callers of buildJournalImportPrompt().
 * @param {object} [options]
 * @returns {string}
 */
export function buildAreaGenerationDirectives(options = {}) {
    const lines = [];
    for (const [key, config] of Object.entries(AREA_GENERATION_OPTIONS)) {
        const value = String(options[key] ?? config.default).trim().toLowerCase();
        const directive = config.values[value];
        if (!directive) {
            throw new Error(`Unsupported Area prompt option ${key}="${options[key]}"`);
        }
        lines.push(`- ${directive}`);
    }
    return lines.join('\n');
}

/**
 * @param {string} prompt
 * @param {object} catalogOptions
 * @returns {Promise<string>}
 */
async function applyAreaCatalogSections(prompt, catalogOptions) {
    let result = prompt;

    if (catalogOptions.actorCompendiumIds?.length) {
        const list = await getCompendiumActorsList(catalogOptions.actorCompendiumIds, catalogOptions.onProgress);
        result = result.replace('[ADD-COMPENDIUM-ACTORS-HERE]', list);
    } else {
        result = result.replace(CATALOG_SECTION_ACTORS, '');
    }

    if (catalogOptions.itemCompendiumIds?.length) {
        const list = await getCompendiumItemsList(catalogOptions.itemCompendiumIds, catalogOptions.onProgress);
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
 * @param {string[]} [options.actorCompendiumIds] - actor pack ids to embed; omit for all configured
 * @param {string[]} [options.itemCompendiumIds] - item pack ids to embed; omit for all configured
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
        characterImage: options.characterImage,
        sceneEmphasis: options.sceneEmphasis,
        contentHandling: options.contentHandling,
        detailLevel: options.detailLevel,
        encounterContent: options.encounterContent,
        conversationContent: options.conversationContent,
        rewardContent: options.rewardContent
    });
    // Default to all configured compendiums when the caller doesn't specify a subset,
    // preserving the prior "include everything" behavior.
    const actorCompendiumIds = Array.isArray(options.actorCompendiumIds)
        ? options.actorCompendiumIds
        : getConfiguredActorCompendiums().map((comp) => comp.id);
    const itemCompendiumIds = Array.isArray(options.itemCompendiumIds)
        ? options.itemCompendiumIds
        : getConfiguredItemCompendiums().map((comp) => comp.id);
    composed = await applyAreaCatalogSections(composed, {
        actorCompendiumIds,
        itemCompendiumIds,
        includeWorldActors: options.includeWorldActors ?? false,
        includeWorldItems: options.includeWorldItems ?? false,
        onProgress: options.onProgress
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
 * @param {(message: string) => void} [onProgress] - status callback while scanning compendiums
 * @returns {Promise<string>}
 */
async function buildJournalPrompt(templateKey, promptOptions = {}, onProgress) {
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
        await saveCampaignGeography(promptOptions);
        return buildLocationImportPrompt(promptOptions);
    }

    await saveCampaignGeography(promptOptions);
    await saveCampaignImagePaths(promptOptions);
    await saveJournalPromptSelections(promptOptions);

    const prompt = await buildJournalImportPrompt('area', {
        actorCompendiumIds: collectSelectedCompendiumIds(promptOptions, COMPENDIUM_ACTOR_CHECKBOX_PREFIX),
        itemCompendiumIds: collectSelectedCompendiumIds(promptOptions, COMPENDIUM_ITEM_CHECKBOX_PREFIX),
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
        additionalContext: promptOptions.additionalContext ?? '',
        sceneEmphasis: promptOptions.sceneEmphasis ?? 'auto',
        contentHandling: promptOptions.contentHandling ?? 'expand',
        detailLevel: promptOptions.detailLevel ?? 'standard',
        encounterContent: promptOptions.encounterContent ?? 'auto',
        conversationContent: promptOptions.conversationContent ?? 'auto',
        rewardContent: promptOptions.rewardContent ?? 'auto',
        onProgress
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
