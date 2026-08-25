// ==================================================================
// ===== ITEM DECLARATIONS ==========================================
// ==================================================================
// Blacksmith's own Item profiles, declared as data. Loot first; the
// remaining seven arrive with step 4 of the build sequence in
// documentation/TODO.md.
//
// This file is DATA. The derivation lives in manager-declarations.js
// and knows nothing about items.
//
// Nothing in the module load path imports this yet -- only the harness
// suite does. It enters the load path at step 3, when construction is
// derived and the loot profile switches over. Until then the existing
// parser remains the only path that creates anything.
// ==================================================================

import { registerDeclaration } from '../registry-declarations.js';

/**
 * Loot: the simplest mapped profile, and the reference for the rest.
 *
 * SURFACE NOTE, worth reading before comparing this to today's template.
 * `buildItemJsonTemplate` emits ONE field set for every Item profile, so the
 * loot template currently hands an author nine fields the loot parser never
 * reads: itemSubTypeNuance (consumable), magicalAttunementRequired (equipment),
 * itemLimitedUses / limitedUsesSpent / limitedUsesMax / itemRecoveryPeriod /
 * destroyOnEmpty (consumable), activities (feature and spell), and the image
 * generation hints itemImageTerms / itemImageNuance, which belong to the
 * prompt rather than to import. They are silently ignored on import today.
 * This declaration lists what loot actually consumes, so the derived template
 * is smaller on purpose. That difference is the finding, not a regression.
 */
export const ITEM_LOOT_DECLARATION = {
    kind: 'item',
    id: 'loot',
    label: 'Loot',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'loot' },
    fields: [
        {
            name: 'itemName',
            path: 'name',
            type: 'string',
            required: true,
            // The current parser reads `entry.itemName || entry.name`, so payloads
            // in the wild carry either. A key alias keeps them working; it is a
            // different thing from the value aliases on itemRarity below.
            acceptsKeys: ['name'],
            example: '',
            guidance: 'The item name as it appears in the sidebar and on a character sheet.'
        },
        {
            name: 'itemDescription',
            path: 'system.description.value',
            type: 'string',
            default: '',
            guidance: 'The description shown on the item sheet, as HTML or plain prose.'
        },
        {
            name: 'itemDescriptionUnidentified',
            path: 'system.description.unidentified',
            type: 'string',
            default: '',
            guidance: 'What players see while the item is unidentified.'
        },
        {
            name: 'itemDescriptionChat',
            path: 'system.description.chat',
            type: 'string',
            default: '',
            guidance: 'A shorter description posted to chat when the item is used.'
        },
        {
            name: 'itemGMNotes',
            path: 'flags.coffee-pub-blacksmith.gmNotes',
            type: 'string',
            default: '',
            acceptsKeys: ['gmNotes'],
            transform: 'gmNotes',
            guidance: 'Private notes for the GM, never shown to players.'
        },
        {
            // Selects which profile the payload belongs to; the created document's
            // type comes from `document.type` rather than from this value.
            name: 'itemType',
            role: 'selector',
            type: 'string',
            example: 'Loot',
            guidance: 'Which kind of item this is; it selects the rest of the schema.'
        },
        {
            name: 'itemSubType',
            path: 'system.type.value',
            type: 'string',
            default: 'trinket',
            example: 'Treasure',
            guidance: 'The loot category, such as Treasure, Gear, or Trinket.'
        },
        {
            name: 'itemRarity',
            path: 'system.rarity',
            type: 'string',
            default: 'common',
            values: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
            guidance: 'How hard the item is to come by.'
        },
        {
            name: 'itemQuantity',
            path: 'system.quantity',
            type: 'integer',
            default: 1,
            guidance: 'How many of the item this entry represents.'
        },
        {
            name: 'itemWeight',
            path: 'system.weight',
            type: 'number',
            example: 0,
            guidance: 'Weight of a single unit, in the system default unit.'
        },
        {
            name: 'itemPrice',
            path: 'system.price',
            type: 'string',
            transform: 'price',
            // Authored shape, not the {value, denomination} the transform produces.
            default: '0 gp',
            example: '0 GP',
            guidance: 'Price as an amount and a coin abbreviation, such as "50 GP".'
        },
        {
            name: 'itemIdentified',
            path: 'system.identified',
            type: 'boolean',
            default: true,
            guidance: 'Whether players can already see the item for what it is.'
        },
        {
            name: 'itemImagePath',
            path: 'img',
            type: 'string',
            default: '',
            transform: 'itemIcon',
            guidance: 'Path to the item artwork; Blacksmith guesses an icon when it is blank.'
        },
        {
            name: 'itemIsMagical',
            path: 'system.properties',
            type: 'boolean',
            default: false,
            transform: 'magicalProperty',
            guidance: 'Whether the item is magical, which adds the magical property.'
        },
        {
            name: 'itemSource',
            // The current parser also writes this to a `coffee-pub` flag. That flag is
            // read by nothing -- not here, not in any of the thirteen sibling modules --
            // and the parser is inconsistent about it, defaulting the system field to ''
            // while leaving the flag undefined. Not carried forward; the migration is
            // when write-only duplicates get retired rather than reproduced.
            path: 'system.source.custom',
            type: 'string',
            default: '',
            example: '[ADD-CAMPAIGN-NAME-HERE]',
            guidance: 'Where the item comes from, usually the campaign name.'
        },
        {
            name: 'itemLicense',
            path: 'system.source.license',
            type: 'string',
            default: '',
            example: 'CC BY 4.0',
            guidance: 'The licence the item content is published under, if any.'
        },
        {
            // Any module's namespace passes through uninterpreted. This is the seam
            // that lets a sibling carry its own data on a Blacksmith-built item
            // without Blacksmith knowing the shape -- Artificer's block rides here.
            name: 'flags',
            path: 'flags',
            type: 'object',
            merge: 'mergeNamespaces',
            requiresOption: 'includeArtificer',
            guidance: 'Module-owned data, keyed by module id, passed through untouched.'
        }
    ]
};

registerDeclaration(ITEM_LOOT_DECLARATION);

/**
 * Weapon: the profile that tests the model rather than repeating it.
 *
 * It is declared second, before the five simpler profiles, deliberately. Loot
 * established the pattern; what was unproven was whether the cross-field rule
 * vocabulary could carry a real profile, and finding that out after declaring six
 * would have meant revisiting all of them. Weapon exercises every rule kind.
 *
 * Three constructs appear here for the first time:
 *   - `role: 'input'` -- itemIsMagical and weaponDamageType are authored and
 *     validated but land nowhere themselves; a sibling field's transform reads
 *     them, because two authored fields genuinely feed one document path.
 *   - a named rule -- weaponRangeRequired tests a DERIVED value (ranged-ness comes
 *     from a subtype lookup), which the closed vocabulary cannot address.
 *   - `derive` -- system.activities is generated from the resolved document, and
 *     the rules forbid authoring it so two sources cannot diverge.
 */
export const ITEM_WEAPON_DECLARATION = {
    kind: 'item',
    id: 'weapon',
    label: 'Weapon',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'weapon' },
    derive: ['weaponAttackActivity', 'equippablePassiveEffects'],
    fields: [
        { name: 'itemName', path: 'name', type: 'string', required: true, acceptsKeys: ['name'],
          example: '', guidance: 'The weapon name as it appears in the sidebar and on a sheet.' },
        { name: 'itemDescription', path: 'system.description.value', type: 'string', default: '',
          guidance: 'The description shown on the item sheet, as HTML or plain prose.' },
        { name: 'itemDescriptionUnidentified', path: 'system.description.unidentified', type: 'string',
          default: '', guidance: 'What players see while the weapon is unidentified.' },
        { name: 'itemDescriptionChat', path: 'system.description.chat', type: 'string', default: '',
          guidance: 'A shorter description posted to chat when the weapon is used.' },
        { name: 'itemGMNotes', path: 'flags.coffee-pub-blacksmith.gmNotes', type: 'string', default: '',
          acceptsKeys: ['gmNotes'], transform: 'gmNotes',
          guidance: 'Private notes for the GM, never shown to players.' },
        { name: 'itemType', role: 'selector', type: 'string', example: 'Weapon',
          guidance: 'Which kind of item this is; it selects the rest of the schema.' },
        { name: 'itemSubType', path: 'system.type.value', type: 'string', transform: 'weaponType',
          default: 'Simple Melee', example: 'Simple Melee',
          guidance: 'The weapon category: Simple or Martial, Melee or Ranged, or Natural, Improvised or Siege.' },
        { name: 'weaponBaseItem', path: 'system.type.baseItem', type: 'string', default: '', example: '',
          guidance: 'The dnd5e base weapon this one derives from, if any.' },
        { name: 'itemRarity', path: 'system.rarity', type: 'string', default: 'common',
          values: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
          guidance: 'How hard the weapon is to come by.' },
        { name: 'itemQuantity', path: 'system.quantity', type: 'integer', default: 1,
          guidance: 'How many of the weapon this entry represents.' },
        { name: 'itemWeight', path: 'system.weight', type: 'number', example: 0,
          guidance: 'Weight of a single unit, in the system default unit.' },
        { name: 'itemPrice', path: 'system.price', type: 'string', transform: 'price', default: '0 gp',
          example: '0 GP', guidance: 'Price as an amount and a coin abbreviation, such as "50 GP".' },
        { name: 'itemIdentified', path: 'system.identified', type: 'boolean', default: true,
          guidance: 'Whether players can already see the weapon for what it is.' },
        { name: 'itemImagePath', path: 'img', type: 'string', default: '', transform: 'itemIcon',
          guidance: 'Path to the weapon artwork; Blacksmith guesses an icon when it is blank.' },
        { name: 'itemIsMagical', role: 'input', type: 'boolean', default: false, example: false,
          guidance: 'Whether the weapon is magical, which adds the magical property.' },
        { name: 'magicalAttunementRequired', path: 'system.attunement', type: 'string', default: '',
          example: '', transform: 'attunement',
          values: ['', 'none', 'not required', 'attunement not required', 'required',
                   'attunement required', 'optional', 'attunement optional'],
          guidance: 'Whether attunement is required or optional; only magical weapons store it.' },
        { name: 'weaponProperties', path: 'system.properties', type: 'array', default: [],
          transform: 'weaponProperties',
          guidance: 'Weapon properties such as Finesse, Light, Thrown, Versatile or Two-Handed.' },
        { name: 'weaponDamageFormula', path: 'system.damage.base', type: 'string', required: true,
          transform: 'damagePart', example: '1d8',
          guidance: 'Base damage as dice, such as 1d8 or 2d6 + 1.' },
        { name: 'weaponDamageType', role: 'input', type: 'string', required: true, example: 'slashing',
          guidance: 'The damage type the weapon deals, such as slashing or fire.' },
        { name: 'weaponVersatileDamageFormula', path: 'system.damage.versatile', type: 'string',
          default: '', example: '', transform: 'versatileDamage',
          guidance: 'Two-handed damage for a Versatile weapon; supply it only with that property.' },
        { name: 'weaponRange', path: 'system.range', type: 'object', transform: 'weaponRange',
          example: { value: null, long: null, reach: 5, units: 'ft' },
          guidance: 'Normal and long range, reach, and the units they are measured in.' },
        { name: 'weaponMastery', path: 'system.mastery', type: 'string', default: '', example: '',
          values: ['', 'cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'],
          guidance: 'The dnd5e 2024 mastery property, if the weapon has one.' },
        // Both feed the generated Attack activity rather than the document: dnd5e
        // stores them at activity.attack.*, and giving them system paths wrote them twice.
        { name: 'weaponAbility', role: 'input', type: 'string', default: '', example: '',
          values: ['', 'str', 'dex', 'int', 'wis', 'cha', 'spellcasting', 'none'],
          guidance: 'The ability the attack uses; blank lets dnd5e choose from the properties.' },
        { name: 'weaponAttackBonus', role: 'input', type: 'string', default: '', example: '',
          guidance: 'A flat bonus added to the attack roll, as a formula.' },
        { name: 'weaponMagicalBonus', path: 'system.magicalBonus', type: 'integer', default: 0, example: 0,
          guidance: 'The plus on a magical weapon, such as 1 for a +1 longsword.' },
        { name: 'weaponProficient', path: 'system.proficient', type: 'integer', nullable: true,
          default: null, example: null, values: [null, 0, 1],
          guidance: 'Leave null to let proficiency follow the character, or force 0 or 1.' },
        { name: 'weaponAmmunitionType', path: 'system.ammunition.type', type: 'string', default: '',
          example: '', guidance: 'The ammunition a Ranged weapon consumes, if any.' },
        { name: 'activities', role: 'input', type: 'array', default: [], example: [],
          guidance: 'Leave empty. Blacksmith generates the standard Attack activity.' },
        // Emitted by the equippablePassiveEffects derivation, which needs the resolved
        // icon. Present in authoring output unless the option switches it off.
        { name: 'passiveEffects', role: 'input', type: 'array', default: [], example: [],
          suppressedByOption: 'includePassiveEffects',
          guidance: 'Effects applied while the weapon is equipped, or equipped and attuned.' },
        // Always emitted, never authored: dnd5e expects both on a weapon and neither
        // is a decision an author makes at import time.
        { name: 'attuned', path: 'system.attuned', const: false,
          guidance: 'Whether the weapon is currently attuned.' },
        { name: 'equipped', path: 'system.equipped', const: false,
          guidance: 'Whether the weapon is currently equipped.' },
        { name: 'itemSource', path: 'system.source.custom', type: 'string', default: '',
          example: '[ADD-CAMPAIGN-NAME-HERE]',
          guidance: 'Where the weapon comes from, usually the campaign name.' },
        { name: 'itemLicense', path: 'system.source.license', type: 'string', default: '',
          example: 'CC BY 4.0', guidance: 'The licence the content is published under, if any.' },
        { name: 'flags', path: 'flags', type: 'object', merge: 'mergeNamespaces',
          requiresOption: 'includeArtificer',
          guidance: 'Module-owned data, keyed by module id, passed through untouched.' }
    ],
    rules: [
        { kind: 'requiresTogether', fields: ['weaponProperties:versatile', 'weaponVersatileDamageFormula'] },
        { kind: 'mutuallyExclusive', fields: ['weaponProperties:versatile', 'weaponProperties:two-handed'] },
        { kind: 'impliedBy', when: 'itemIsMagical', then: ['weaponProperties:magical'] },
        { kind: 'requires', when: 'weaponMagicalBonus', then: ['itemIsMagical'] },
        { kind: 'mustBeEmpty', field: 'activities' },
        { named: 'weaponRangeRequired' }
    ]
};

registerDeclaration(ITEM_WEAPON_DECLARATION);

// ------------------------------------------------------------------
// The physical profiles: equipment, tool, container.
//
// These three differ from Loot only in where their subtype lands and what
// each adds on top, so they are declared together rather than one per pass.
// Every construct they use was proven by Loot and Weapon; nothing here is new,
// which is the point -- once the model took Weapon, the rest is description.
// ------------------------------------------------------------------

/** Fields every physical Item profile shares, in the order the template emits them. */
function physicalItemFields({ subTypePath, subTypeTransform, subTypeDefault, subTypeExample, subTypeGuidance }) {
    return [
        { name: 'itemName', path: 'name', type: 'string', required: true, acceptsKeys: ['name'],
          example: '', guidance: 'The item name as it appears in the sidebar and on a character sheet.' },
        { name: 'itemDescription', path: 'system.description.value', type: 'string', default: '',
          guidance: 'The description shown on the item sheet, as HTML or plain prose.' },
        { name: 'itemDescriptionUnidentified', path: 'system.description.unidentified', type: 'string',
          default: '', guidance: 'What players see while the item is unidentified.' },
        { name: 'itemDescriptionChat', path: 'system.description.chat', type: 'string', default: '',
          guidance: 'A shorter description posted to chat when the item is used.' },
        { name: 'itemGMNotes', path: 'flags.coffee-pub-blacksmith.gmNotes', type: 'string', default: '',
          acceptsKeys: ['gmNotes'], transform: 'gmNotes',
          guidance: 'Private notes for the GM, never shown to players.' },
        { name: 'itemType', role: 'selector', type: 'string', example: subTypeExample.itemType,
          guidance: 'Which kind of item this is; it selects the rest of the schema.' },
        { name: 'itemSubType', path: subTypePath, type: 'string', transform: subTypeTransform,
          default: subTypeDefault, example: subTypeExample.itemSubType, guidance: subTypeGuidance },
        { name: 'itemRarity', path: 'system.rarity', type: 'string', default: 'common',
          values: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
          guidance: 'How hard the item is to come by.' },
        { name: 'itemQuantity', path: 'system.quantity', type: 'integer', default: 1,
          guidance: 'How many of the item this entry represents.' },
        { name: 'itemWeight', path: 'system.weight', type: 'number', example: 0,
          guidance: 'Weight of a single unit, in the system default unit.' },
        { name: 'itemPrice', path: 'system.price', type: 'string', transform: 'price', default: '0 gp',
          example: '0 GP', guidance: 'Price as an amount and a coin abbreviation, such as "50 GP".' },
        { name: 'itemIdentified', path: 'system.identified', type: 'boolean', default: true,
          guidance: 'Whether players can already see the item for what it is.' },
        { name: 'itemImagePath', path: 'img', type: 'string', default: '', transform: 'itemIcon',
          guidance: 'Path to the item artwork; Blacksmith guesses an icon when it is blank.' },
        { name: 'itemIsMagical', path: 'system.properties', type: 'boolean', default: false,
          transform: 'magicalProperty',
          guidance: 'Whether the item is magical, which adds the magical property.' },
        { name: 'itemSource', path: 'system.source.custom', type: 'string', default: '',
          example: '[ADD-CAMPAIGN-NAME-HERE]',
          guidance: 'Where the item comes from, usually the campaign name.' },
        { name: 'itemLicense', path: 'system.source.license', type: 'string', default: '',
          example: 'CC BY 4.0', guidance: 'The licence the item content is published under, if any.' },
        { name: 'flags', path: 'flags', type: 'object', merge: 'mergeNamespaces',
          requiresOption: 'includeArtificer',
          guidance: 'Module-owned data, keyed by module id, passed through untouched.' }
    ];
}

/**
 * Equipment: the only one of the three that carries passive effects, and the
 * reason `attunementIfMagical` exists -- a mundane piece of equipment has no
 * attunement key at all, where a weapon always has one.
 */
export const ITEM_EQUIPMENT_DECLARATION = {
    kind: 'item',
    id: 'equipment',
    label: 'Equipment',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'equipment' },
    derive: ['equippablePassiveEffects'],
    fields: [
        ...physicalItemFields({
            subTypePath: 'system.type.value',
            subTypeTransform: 'slug',
            subTypeDefault: 'trinket',
            subTypeExample: { itemType: 'Equipment', itemSubType: 'Clothing' },
            subTypeGuidance: 'The equipment category, such as Clothing, Light Armor or Shield.'
        }),
        { name: 'magicalAttunementRequired', path: 'system.attunement', type: 'string', default: '',
          example: '', transform: 'attunementIfMagical',
          values: ['', 'none', 'not required', 'attunement not required', 'required',
                   'attunement required', 'optional', 'attunement optional'],
          guidance: 'Whether attunement is required or optional; only magical equipment stores it.' },
        { name: 'passiveEffects', role: 'input', type: 'array', default: [], example: [],
          suppressedByOption: 'includePassiveEffects',
          guidance: 'Effects applied while the item is equipped, or equipped and attuned.' }
    ]
};

/**
 * Tool: equipment minus the effects, plus dnd5e's ability block, which is fixed
 * at import and so is declared const rather than authored.
 */
export const ITEM_TOOL_DECLARATION = {
    kind: 'item',
    id: 'tool',
    label: 'Tool',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'tool' },
    fields: [
        ...physicalItemFields({
            subTypePath: 'system.type.value',
            subTypeTransform: 'slug',
            subTypeDefault: 'artisans-tools',
            subTypeExample: { itemType: 'Tool', itemSubType: "Artisan's Tools" },
            subTypeGuidance: 'The tool category, such as Artisan\'s Tools or Gaming Set.'
        }),
        { name: 'toolAbility', path: 'system.ability.value', const: 'int',
          guidance: 'The ability a tool check uses.' },
        { name: 'toolProficient', path: 'system.ability.proficient', const: false,
          guidance: 'Whether the tool is used proficiently.' }
    ]
};

/**
 * Container: the plainest of the three. Its subtype is stored VERBATIM rather
 * than slugged -- the parser does not normalise it the way equipment and tools
 * do, and matching that is what parity means here.
 */
export const ITEM_CONTAINER_DECLARATION = {
    kind: 'item',
    id: 'container',
    label: 'Container',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'container' },
    fields: physicalItemFields({
        subTypePath: 'system.type.value',
        subTypeTransform: undefined,
        subTypeDefault: 'other',
        // The current template emits null here. An empty string is the better
        // authoring prompt and the parser treats the two identically
        // (`flat.itemSubType || 'other'`), so this is a listed, deliberate difference.
        subTypeExample: { itemType: 'Container', itemSubType: '' },
        subTypeGuidance: 'The container category, such as Backpack or Pouch.'
    })
};

registerDeclaration(ITEM_EQUIPMENT_DECLARATION);
registerDeclaration(ITEM_TOOL_DECLARATION);
registerDeclaration(ITEM_CONTAINER_DECLARATION);


/**
 * The authored shape of one activity, declared once.
 *
 * Feature, Spell and Consumable all accept authored activities and all convert
 * them through `_buildActivities`. Declaring the shape here rather than in each
 * profile means the worked example in the JSON template, the guide lines, the
 * prompt lines and the validation all come from one place -- the old builder
 * hand-maintained a thirty-field example next to a parser that accepted
 * something slightly different, and the two had no way to stay in step.
 *
 * These are NESTED fields: they carry no `path`, because the parent field owns
 * the document path and this describes the shape of its value.
 *
 * `activityType` is deliberately narrow. dnd5e defines more types than this, but
 * `_activityBase` converts exactly these five and refuses the rest by name --
 * including a specific message for "Use", which is not a dnd5e type at all.
 * Declaring the five it converts is honest; listing the ones it rejects would be
 * a schema promising what the converter cannot deliver.
 */
export const ACTIVITY_FIELDS = [
    { name: 'activityType', type: 'string', required: true, example: 'Save',
      values: ['attack', 'damage', 'heal', 'save', 'utility'],
      aliases: { Attack: 'attack', Damage: 'damage', Heal: 'heal', Save: 'save', Utility: 'utility' },
      guidance: 'What the activity does: attack, damage, heal, save or utility.' },
    { name: 'activityName', type: 'string', default: '', example: '',
      guidance: 'Display name; falls back to the activity type.' },
    { name: 'activityIcon', type: 'string', default: '', example: '',
      guidance: 'Icon path; falls back to the item artwork.' },
    { name: 'activityFlavorText', type: 'string', default: '', example: '',
      guidance: 'Text shown in chat when the activity is used.' },
    { name: 'activationType', type: 'string', default: 'action', example: 'action',
      guidance: 'The action cost: action, bonus, reaction, minute, hour or special.' },
    { name: 'activationValue', type: 'integer', nullable: true, default: 1, example: 1,
      guidance: 'How many of the activation unit are needed.' },
    { name: 'activationCondition', type: 'string', default: '', example: '',
      guidance: 'A condition that must hold before it can be used.' },
    { name: 'damageFormula', type: 'string', default: '', example: '',
      acceptsKeys: ['activityFormula'],
      guidance: 'Damage dice, such as 2d6 or 1d8 + 2.' },
    { name: 'damageType', type: 'string', default: '', example: '',
      acceptsKeys: ['activityEffectType'],
      guidance: 'The damage type dealt, such as fire or piercing.' },
    { name: 'healingFormula', type: 'string', default: '', example: '',
      guidance: 'Healing dice, for a heal activity.' },
    { name: 'healingType', type: 'string', default: '', example: '',
      guidance: 'Either healing or temphp.' },
    { name: 'saveAbility', type: 'string', default: 'wis', example: 'wis',
      values: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      guidance: 'Which ability the target saves with.' },
    { name: 'saveDC', type: 'integer', nullable: true, default: null, example: null,
      guidance: 'A fixed save DC; leave blank to let dnd5e calculate it.' },
    { name: 'onSave', type: 'string', default: 'none', example: 'none',
      values: ['none', 'half', 'full'],
      guidance: 'How much effect a successful save avoids.' },
    { name: 'attackType', type: 'string', default: '', example: '',
      guidance: 'Melee or ranged, for an attack activity.' },
    { name: 'attackAbility', type: 'string', default: '', example: '',
      guidance: 'The ability the attack uses; blank lets dnd5e choose.' },
    { name: 'rollFormula', type: 'string', default: '', example: '',
      guidance: 'A formula rolled by a utility activity.' },
    { name: 'activityUsesMax', type: 'string', nullable: true, default: null, example: null,
      guidance: 'Uses of this activity specifically, separate from the item.' },
    { name: 'activityUsesSpent', type: 'integer', default: 0, example: 0,
      guidance: 'How many of those uses are already spent.' },
    { name: 'activityRecoveryPeriod', type: 'string', default: 'none', example: 'none',
      values: ['none', 'long rest', 'short rest', 'day', 'dawn', 'dusk',
               'initiative', 'start of turn', 'end of turn', 'recharge'],
      guidance: 'When this activity\'s own uses come back.' },
    { name: 'activityRecoveryFormula', type: 'string', default: '', example: '',
      guidance: 'For a recharge period, the die that recharges it.' },
    { name: 'activityDuration', type: 'object', fields: [
        { name: 'value', type: 'integer', nullable: true, default: null, example: null,
          guidance: 'How long it lasts.' },
        { name: 'units', type: 'string', default: 'inst', example: 'inst',
          guidance: 'The unit of duration; inst means instantaneous.' },
        { name: 'special', type: 'string', default: '', example: '',
          guidance: 'A duration the units cannot express.' },
        { name: 'concentration', type: 'boolean', default: false, example: false,
          guidance: 'Whether maintaining it requires concentration.' }
      ], guidance: 'How long the activity lasts once used.' },
    { name: 'activityRange', type: 'object', fields: [
        { name: 'value', type: 'integer', nullable: true, default: null, example: null,
          guidance: 'The reach or range.' },
        { name: 'units', type: 'string', default: 'self', example: 'self',
          guidance: 'The unit the range is measured in.' },
        { name: 'special', type: 'string', default: '', example: '',
          guidance: 'A range the units cannot express.' }
      ], guidance: 'How far the activity reaches.' },
    { name: 'activityTarget', type: 'object', fields: [
        { name: 'affectsType', type: 'string', default: 'creature', example: 'creature',
          guidance: 'What it affects: creature, ally, enemy, object or space.' },
        // Deliberately untyped: dnd5e stores '' for unset and a number otherwise
        // (`count: target.affectsCount ?? ''`). A union type for two fields would
        // cost more than it buys, and declaring `integer` would reject the empty
        // form the system itself writes.
        { name: 'affectsCount', default: null, example: '',
          guidance: 'How many targets; blank means any number.' },
        { name: 'choice', type: 'boolean', default: false, example: false,
          guidance: 'Whether the user chooses the affected type.' },
        { name: 'special', type: 'string', default: '', example: '',
          guidance: 'A targeting rule the fields cannot express.' },
        { name: 'templateType', type: 'string', default: '', example: '',
          guidance: 'A measured template shape, such as cone or sphere.' },
        { name: 'templateSize', type: 'integer', nullable: true, default: null, example: null,
          guidance: 'The template size.' },
        { name: 'templateWidth', type: 'integer', nullable: true, default: null, example: null,
          guidance: 'The template width, where the shape uses one.' },
        { name: 'templateHeight', type: 'integer', nullable: true, default: null, example: null,
          guidance: 'The template height, where the shape uses one.' },
        { name: 'templateCount', default: null, example: '',
          guidance: 'How many templates are placed.' },
        { name: 'contiguous', type: 'boolean', default: false, example: false,
          guidance: 'Whether multiple templates must touch.' },
        { name: 'units', type: 'string', default: 'ft', example: 'ft',
          guidance: 'The unit template sizes are measured in.' },
        { name: 'prompt', type: 'boolean', default: false, example: false,
          guidance: 'Whether to prompt for template placement.' }
      ], guidance: 'What the activity targets, and any measured template.' },
    { name: 'appliedEffects', type: 'array', default: [], example: [],
      guidance: 'Names of effects from this item applied by the activity.' }
];

// ------------------------------------------------------------------
// The described profiles: feature and spell.
//
// These two share almost nothing with the physical items above. They carry no
// rarity, weight, price, quantity or identified state, and they do carry an
// identifier slug and authored activities. `_descriptionSystem` in the parser
// is the seam: physical items use `_sharedItemSystem`, these use the other one.
// ------------------------------------------------------------------

/** Fields both described profiles share, in the order the template emits them. */
function describedItemFields(itemTypeExample) {
    return [
        { name: 'itemName', path: 'name', type: 'string', required: true, acceptsKeys: ['name'],
          example: '', guidance: 'The name as it appears in the sidebar and on a character sheet.' },
        { name: 'itemDescription', path: 'system.description.value', type: 'string', default: '',
          guidance: 'The description shown on the sheet, as HTML or plain prose.' },
        { name: 'itemDescriptionChat', path: 'system.description.chat', type: 'string', default: '',
          guidance: 'A shorter description posted to chat when it is used.' },
        { name: 'itemGMNotes', path: 'flags.coffee-pub-blacksmith.gmNotes', type: 'string', default: '',
          acceptsKeys: ['gmNotes'], transform: 'gmNotes',
          guidance: 'Private notes for the GM, never shown to players.' },
        { name: 'itemType', role: 'selector', type: 'string', example: itemTypeExample,
          guidance: 'Which kind of item this is; it selects the rest of the schema.' },
        { name: 'itemImagePath', path: 'img', type: 'string', default: '', transform: 'itemIcon',
          guidance: 'Path to the artwork; Blacksmith guesses an icon when it is blank.' },
        // Read by the itemActivities derivation, which produces both system.activities
        // and effects together -- _buildActivities pushes applied effects into the array.
        { name: 'activities', role: 'input', type: 'array', fields: ACTIVITY_FIELDS,
          guidance: 'Activities this grants: attack, damage, heal, save or utility.' },
        { name: 'effects', role: 'input', type: 'array', default: [], example: [],
          guidance: 'Active Effects carried alongside the activities.' },
        { name: 'itemSource', path: 'system.source.custom', type: 'string', default: '',
          example: '[ADD-CAMPAIGN-NAME-HERE]',
          guidance: 'Where this comes from, usually the campaign name.' },
        { name: 'itemLicense', path: 'system.source.license', type: 'string', default: '',
          example: 'CC BY 4.0', guidance: 'The licence the content is published under, if any.' },
        { name: 'flags', path: 'flags', type: 'object', merge: 'mergeNamespaces',
          requiresOption: 'includeArtificer',
          guidance: 'Module-owned data, keyed by module id, passed through untouched.' }
    ];
}

/**
 * Feature: the first profile whose activities are AUTHORED rather than generated.
 *
 * A weapon's attack activity is derived and authoring one is refused; here the
 * author writes them and Blacksmith converts. Same derivation position, opposite
 * relationship to the author -- which is why `activities` is `role: 'input'` in
 * both places but carries a `mustBeEmpty` rule in only one.
 */
export const ITEM_FEATURE_DECLARATION = {
    kind: 'item',
    id: 'feature',
    label: 'Feature',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'feat' },
    derive: ['slugIdentifier', 'itemActivities'],
    fields: [
        ...describedItemFields('Feature'),
        { name: 'featureType', path: 'system.type.value', type: 'string', default: 'monster',
          example: 'monster',
          values: ['background', 'class', 'monster', 'race', 'enchantment', 'feat',
                   'supernaturalGift', 'vehicle'],
          guidance: 'What kind of feature this is: a class feature, a monster trait, a feat.' },
        { name: 'featureSubtype', path: 'system.type.subtype', type: 'string', default: '', example: '',
          guidance: 'A narrower category within the feature type, if the system defines one.' },
        { name: 'featureRequirements', path: 'system.requirements', type: 'string', nullable: true,
          default: null, example: '',
          guidance: 'What must be true to have this feature, as free text.' },
        { name: 'featureProperties', path: 'system.properties', type: 'array', default: [], example: [],
          guidance: 'System properties the feature carries.' },
        // The uses block: max owns the path, the other three feed it. The parser reads
        // each of them under a short alias too, and the transform honours those.
        { name: 'featureUsesMax', path: 'system.uses', nullable: true, default: null, example: null,
          acceptsKeys: ['usesMax'], transform: 'limitedUses',
          spentFrom: 'featureUsesSpent', periodFrom: 'featureRecoveryPeriod',
          formulaFrom: 'featureRecoveryFormula',
          guidance: 'How many times it can be used before recovery; leave blank for unlimited.' },
        { name: 'featureUsesSpent', role: 'input', type: 'integer', default: 0, example: 0,
          acceptsKeys: ['usesSpent'], guidance: 'How many uses are already spent.' },
        { name: 'featureRecoveryPeriod', role: 'input', type: 'string', default: 'none', example: 'none',
          acceptsKeys: ['recoveryPeriod'],
          values: ['none', 'long rest', 'short rest', 'day', 'dawn', 'dusk',
                   'initiative', 'start of turn', 'end of turn', 'recharge'],
          guidance: 'When spent uses come back.' },
        { name: 'featureRecoveryFormula', role: 'input', type: 'string', default: '', example: '',
          guidance: 'For a recharge period, the die that recharges it.' },
        // dnd5e expects all five on a feat and none is an import-time decision.
        { name: 'advancement', path: 'system.advancement', const: [],
          guidance: 'Advancement steps; never set at import.' },
        { name: 'cover', path: 'system.cover', const: null, guidance: 'Cover granted; never set at import.' },
        { name: 'crewed', path: 'system.crewed', const: false, guidance: 'Vehicle crewing state.' },
        { name: 'enchant', path: 'system.enchant', const: { max: '', period: '' },
          guidance: 'Enchantment limits; never set at import.' },
        { name: 'prerequisites', path: 'system.prerequisites',
          const: { items: [], level: null, repeatable: false },
          guidance: 'Structured prerequisites; never set at import.' }
    ]
};

registerDeclaration(ITEM_FEATURE_DECLARATION);
