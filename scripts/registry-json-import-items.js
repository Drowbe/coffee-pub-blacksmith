// ==================================================================
// Item JSON import — prompt registry (core + partial + profile)
// ==================================================================

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
export const ITEM_PROMPT_PARTIAL_IMAGE_REQUEST = 'prompt-item-partial-image-request.txt';
export const ITEM_PROMPT_PROFILE_ARTIFICER = 'prompt-item-profile-artificer.txt';

/** @type {Record<string, string>} */
export const ITEM_PROMPT_PROFILES = {
    loot: 'prompt-item-profile-loot.txt',
    consumable: 'prompt-item-profile-consumable.txt',
    weapon: 'prompt-item-profile-weapon.txt',
    equipment: 'prompt-item-profile-equipment.txt',
    tool: 'prompt-item-profile-tool.txt',
    container: 'prompt-item-profile-container.txt',
    feature: 'prompt-item-profile-feature.txt',
    spell: 'prompt-item-profile-spell.txt'
};

/** Dropdown options for JsonImportWindow (item directory). */
export const ITEM_TEMPLATE_OPTIONS = [
    { value: 'loot', label: 'Loot' },
    { value: 'consumable', label: 'Consumable' },
    { value: 'weapon', label: 'Weapon' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'tool', label: 'Tool' },
    { value: 'container', label: 'Container' },
    { value: 'feature', label: 'Feature' },
    { value: 'spell', label: 'Spell' }
];

const ITEM_GENERATION_OPTIONS = {
    itemPurpose: {
        default: 'auto', values: {
            auto: 'Item purpose: infer its most useful role from the requested concept and selected Item type.',
            practical: 'Item purpose: practical gear. Favor believable construction, clear everyday utility, and restrained lore.',
            reward: 'Item purpose: memorable reward. Make its value, identity, and table use immediately legible.',
            plot: 'Item purpose: plot or exploration object. Give it actionable clues, provenance, and future implications without replacing mechanics with mystery.',
            combat: 'Item purpose: combat-facing. Prioritize clear action economy, targeting, uses, recovery, and effects.'
        }
    },
    itemPower: {
        default: 'standard', values: {
            conservative: 'Power posture: conservative. Prefer familiar mechanics and modest numerical benefits.',
            standard: 'Power posture: standard. Match rarity, level, price, uses, and action economy; avoid hidden power spikes.',
            bold: 'Power posture: bold homebrew. Distinctive mechanics are welcome, but keep them bounded, explicit, and playable.'
        }
    },
    itemComplexity: {
        default: 'standard', values: {
            simple: 'Mechanical complexity: simple. Prefer one clear behavior and minimal bookkeeping.',
            standard: 'Mechanical complexity: standard. Include the activities and effects genuinely needed, without redundant branches.',
            advanced: 'Mechanical complexity: advanced. Multiple activities or conditional branches are welcome when the concept requires them; keep cosmetic branches in prose.'
        }
    },
    itemLore: {
        default: 'standard', values: {
            concise: 'Lore depth: concise. Use brief, functional descriptions.',
            standard: 'Lore depth: standard. Give the Item a clear appearance, purpose, and a restrained story hook.',
            rich: 'Lore depth: rich. Add cohesive provenance, sensory identity, and implications while keeping mechanics easy to find.'
        }
    },
    automationPolicy: {
        default: 'appropriate', values: {
            appropriate: 'Automation: encode supported activities, targeting, recovery, and effects when they materially improve play; leave relational or event-driven exceptions in prose.',
            maximize: 'Automation: maximize the friendly schema. Encode every supported activity, range, target, duration, recovery, and effect instead of leaving supported mechanics only in prose.',
            description: 'Automation: description-first. Keep the mechanics correct but minimize optional activities/effects and favor GM adjudication for nonessential automation.'
        }
    }
};

export function getItemPromptFields() {
    const make = (id, label, value, entries) => ({
        id, label, value, inputType: 'select', showForTemplate: Object.keys(ITEM_PROMPT_PROFILES).join(' '),
        group: 'Generation direction', groupIcon: 'fa-solid fa-sliders',
        options: entries.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))
    });
    return [
        make('itemPurpose', 'Item purpose', 'auto', [['auto','Auto'],['practical','Practical Gear'],['reward','Memorable Reward'],['plot','Plot / Exploration'],['combat','Combat-Facing']]),
        make('itemPower', 'Power posture', 'standard', [['conservative','Conservative'],['standard','Standard'],['bold','Bold Homebrew']]),
        make('itemComplexity', 'Complexity', 'standard', [['simple','Simple'],['standard','Standard'],['advanced','Advanced']]),
        make('itemLore', 'Lore depth', 'standard', [['concise','Concise'],['standard','Standard'],['rich','Rich']]),
        make('automationPolicy', 'Automation', 'appropriate', [['appropriate','Appropriate'],['maximize','Maximize Friendly'],['description','Description-First']])
    ];
}

export function buildItemGenerationDirectives(options = {}) {
    return Object.entries(ITEM_GENERATION_OPTIONS).map(([key, config]) => {
        const value = String(options[key] ?? config.default).trim().toLowerCase();
        const directive = config.values[value];
        if (!directive) throw new Error(`Unsupported Item prompt option ${key}="${options[key]}"`);
        return `- ${directive}`;
    }).join('\n');
}

/**
 * True when Coffee Pub Artificer is installed and active.
 * @returns {boolean}
 */
export function isArtificerModuleActive() {
    return game.modules.get(ARTIFICER_MODULE_ID)?.active === true;
}

/**
 * Build the full clipboard prompt for an item import template.
 * @param {string} templateKey - loot | consumable | weapon | equipment | tool | container | feature | spell
 * @param {{ includeArtificer?: boolean, includeImageRequest?: boolean }} [options]
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

    if (options.includeImageRequest) {
        parts.push(await fetchPromptText(ITEM_PROMPT_PARTIAL_IMAGE_REQUEST));
    }

    if (['weapon', 'equipment'].includes(key)) {
        parts.push(options.includePassiveEffects === false
            ? 'SCHEMA SELECTION: Omit passiveEffects entirely for this Item. Keep passive or equipped benefits in the description unless another selected supported structure represents them.'
            : 'SCHEMA SELECTION: Include passiveEffects when the Item has an equipped or equipped-and-attuned ongoing benefit; use [] when no such effect applies.');
    }

    parts.push(`========================================\nGENERATION DIRECTION (AUTHORITATIVE)\n========================================\n\n${buildItemGenerationDirectives(options)}`);

    const composed = composePrompt(parts);
    return applyCampaignPlaceholders(composed);
}

const ITEM_TEMPLATE_DEFAULTS = {
    loot: { itemType: 'Loot', itemSubType: 'Treasure' },
    consumable: { itemType: 'Consumable', itemSubType: 'Potion', destroyOnEmpty: true },
    weapon: { itemType: 'Weapon', itemSubType: 'Simple Melee' },
    equipment: { itemType: 'Equipment', itemSubType: 'Clothing' },
    tool: { itemType: 'Tool', itemSubType: "Artisan's Tools" },
    container: { itemType: 'Container', itemSubType: null },
    feature: { itemType: 'Feature', itemSubType: '' },
    spell: { itemType: 'Spell', itemSubType: '' }
};

/**
 * Build valid JSON-only starter content for hand authoring.
 * @param {string} templateKey
 * @param {{ includeArtificer?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function buildItemJsonTemplate(templateKey, options = {}) {
    const key = String(templateKey || 'loot').toLowerCase();
    const defaults = ITEM_TEMPLATE_DEFAULTS[key] || ITEM_TEMPLATE_DEFAULTS.loot;
    const data = {
        itemName: '',
        itemDescription: '',
        itemDescriptionUnidentified: '',
        itemDescriptionChat: '',
        itemGMNotes: '',
        itemType: defaults.itemType,
        itemSubType: defaults.itemSubType,
        itemSubTypeNuance: '',
        itemRarity: 'common',
        itemQuantity: 1,
        itemWeight: 0,
        itemPrice: '0 GP',
        itemIdentified: true,
        itemImagePath: '',
        itemImageTerms: [],
        itemImageNuance: '',
        itemIsMagical: false,
        magicalAttunementRequired: '',
        itemLimitedUses: 1,
        limitedUsesSpent: 0,
        limitedUsesMax: 1,
        destroyOnEmpty: defaults.destroyOnEmpty === true,
        itemRecoveryPeriod: 'none',
        itemSource: '[ADD-CAMPAIGN-NAME-HERE]',
        itemLicense: 'CC BY 4.0',
        activities: []
    };

    if ((key === 'equipment' || key === 'weapon') && options.includePassiveEffects !== false) data.passiveEffects = [];

    if (key === 'weapon') {
        Object.assign(data, {
            weaponBaseItem: '',
            weaponDamageFormula: '1d8',
            weaponDamageType: 'slashing',
            weaponVersatileDamageFormula: '',
            weaponAbility: '',
            weaponAttackBonus: '',
            weaponMagicalBonus: 0,
            weaponProficient: null,
            weaponMastery: '',
            weaponProperties: [],
            weaponRange: { value: null, long: null, reach: 5, units: 'ft' },
            weaponAmmunitionType: ''
        });
    }

    if (key === 'feature') {
        Object.assign(data, {
            featureType: 'monster',
            featureSubtype: '',
            featureRequirements: '',
            featureProperties: [],
            featureUsesMax: null,
            featureUsesSpent: 0,
            featureRecoveryPeriod: 'none',
            featureRecoveryFormula: ''
        });
        data.activities = [_friendlyActivityTemplate('Save')];
    } else if (key === 'spell') {
        Object.assign(data, {
            spellLevel: 1,
            spellSchool: 'evo',
            spellAbility: '',
            spellPreparation: 'prepared',
            spellProperties: ['vocal', 'somatic'],
            materialDescription: '',
            materialCost: 0,
            materialConsumed: false,
            castingTime: { value: 1, units: 'action' },
            spellRange: { value: 60, units: 'ft' },
            spellDuration: { value: null, units: 'inst' },
            spellTarget: {
                affectsType: 'creature', affectsCount: 1,
                templateType: '', templateSize: null, units: 'ft'
            }
        });
        data.activities = [_friendlyActivityTemplate('Save')];
    }

    if (options.includeArtificer) {
        data.flags = {
            [ARTIFICER_MODULE_ID]: {
                artificerType: 'Component',
                artificerFamily: 'Plant',
                artificerTraits: ['Herb', 'Medicinal'],
                artificerSkillLevel: 1,
                artificerQuirk: '',
                artificerBiomes: [],
                artificerAffinity: ''
            }
        };
    }

    return applyCampaignPlaceholders(JSON.stringify(data, null, 2));
}

const ITEM_GUIDANCE = {
    loot: 'Loot is narrative treasure or an exploration object. Use itemSubType for its loot category; activities are normally empty.',
    consumable: 'Consumables normally use limited uses and may destroy themselves when empty. Add supported activities for their executable effects.',
    weapon: 'Weapons require damage formula/type, a valid weapon category, properties, range, and optional mastery/bonuses. Blacksmith creates the standard Attack activity automatically; leave activities empty.',
    equipment: 'Equipment uses a worn/equipment subtype. Magical status and attunement must agree. Passive effects can provide equipped reminders/statuses but friendly changes must remain empty.',
    tool: 'Tools describe a usable tool category and normally rely on Actor proficiency rather than custom activities.',
    container: 'Containers represent carried storage. Set believable weight, price, and identification data; activities are normally empty.',
    feature: 'Features use featureType and may contain one or more activities. Use multiple activities for genuinely different executable behaviors and prose for cosmetic branches.',
    spell: 'Spells require level, school, preparation, components, casting time, range, duration, target, and appropriate activities. A null saveDC defers to the caster.'
};

export async function buildItemAuthoringGuide(templateKey, options = {}) {
    const key = String(templateKey || 'loot').toLowerCase();
    const json = await buildItemJsonTemplate(key, options);
    const passive = ['weapon', 'equipment'].includes(key)
        ? (options.includePassiveEffects === false
            ? '- Passive effects were omitted by your schema selection.'
            : '- passiveEffects is included. activation is equipped or equippedAndAttuned; changes must be [] in the friendly schema.')
        : '';
    const artificer = options.includeArtificer
        ? '- Artificer flags are included. Keep the coffee-pub-artificer namespace and allowed field types intact.'
        : '- Artificer flags are omitted.';
    return `BLACKSMITH ${key.toUpperCase()} ITEM JSON AUTHORING GUIDE

The JSON block below is a valid starter template. After editing, copy only the JSON object into Blacksmith's Import JSON tab. Do not place comments inside the JSON.

Profile guidance
- ${ITEM_GUIDANCE[key] || ITEM_GUIDANCE.loot}
${passive}
${artificer}

Common fields
- itemName must not be blank. itemType should remain the selected profile type.
- Keep numbers, booleans, null, arrays, and objects as their existing JSON types; do not quote them.
- itemPrice uses text such as "50 GP". itemWeight and itemQuantity are numbers.
- itemIsMagical and magicalAttunementRequired must agree. Use "", "attunement optional", or "attunement required".
- itemImagePath may be blank for Blacksmith icon lookup. itemImageTerms and itemImageNuance guide that lookup/generation workflow.
- activities must follow the selected profile's supported structure. Do not invent field names.
- Exact existing names are preferable for official content; this template is intended for genuinely custom Items.

Validation reminders
- No trailing commas or duplicate keys.
- Use straight quotes and escape double quotes inside HTML strings.
- Unsupported values and inconsistent cross-field combinations fail visibly rather than importing corrupted data.
- For mechanics beyond the friendly schema, use an exported native Foundry Item JSON object instead.

JSON TEMPLATE

\`\`\`json
${json}
\`\`\`
`;
}

function _friendlyActivityTemplate(activityType) {
    return {
        activityType,
        activityName: '',
        activityIcon: '',
        activityFlavorText: '',
        activationType: 'action',
        activationValue: 1,
        activationCondition: '',
        damageFormula: '',
        damageType: '',
        healingFormula: '',
        healingType: '',
        saveAbility: 'wis',
        saveDC: null,
        onSave: 'none',
        attackType: '',
        attackAbility: '',
        rollFormula: '',
        activityUsesMax: null,
        activityUsesSpent: 0,
        activityRecoveryPeriod: 'none',
        activityRecoveryFormula: '',
        activityDuration: { value: null, units: 'inst', special: '', concentration: false },
        activityRange: { value: null, units: 'self', special: '' },
        activityTarget: {
            affectsType: 'creature', affectsCount: '', choice: false, special: '',
            templateType: '', templateSize: null, templateWidth: null, templateHeight: null,
            templateCount: '', contiguous: false, units: 'ft', prompt: false
        },
        appliedEffects: []
    };
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
        const options = [{ id: 'includeImageRequest', label: 'Include Image Generation Request', checked: false, authoringModes: 'prompt' }];
        options.unshift({
            id: 'includePassiveEffects', label: 'Include Passive Effects', checked: true,
            authoringModes: 'json prompt', showForTemplate: 'weapon equipment'
        });
        if (isArtificerModuleActive()) {
            options.unshift({ id: 'artificerItem', label: 'Artificer Item', checked: false, authoringModes: 'json prompt' });
        }
        return options;
    },
    get promptFields() {
        return getItemPromptFields();
    },
    onBuildPrompt: async (type, promptOptions = {}) => buildItemImportPrompt(type, {
        includeArtificer: !!promptOptions.artificerItem,
        includeImageRequest: !!promptOptions.includeImageRequest,
        includePassiveEffects: promptOptions.includePassiveEffects !== false,
        itemPurpose: promptOptions.itemPurpose,
        itemPower: promptOptions.itemPower,
        itemComplexity: promptOptions.itemComplexity,
        itemLore: promptOptions.itemLore,
        automationPolicy: promptOptions.automationPolicy
    }),
    onBuildJsonTemplate: async (type, promptOptions = {}) => buildItemJsonTemplate(type, {
        includeArtificer: !!promptOptions.artificerItem,
        includePassiveEffects: promptOptions.includePassiveEffects !== false
    }),
    onBuildAuthoringGuide: async (type, promptOptions = {}) => buildItemAuthoringGuide(type, {
        includeArtificer: !!promptOptions.artificerItem,
        includePassiveEffects: promptOptions.includePassiveEffects !== false
    }),
    onValidateEntry: async (entry) => {
        if (!String(entry?.itemName || entry?.name || '').trim()) throw new Error('Item name is required.');
        return parseFlatItemToFoundry({ ...entry, itemImagePath: entry.itemImagePath || entry.img || 'icons/svg/item-bag.svg' });
    },
    onImportEntry: async (entry) => {
        const [created] = await Item.createDocuments([await parseFlatItemToFoundry(entry)], { keepId: false });
        return created;
    }
};

registerJsonImportKind(itemJsonImportKind);
