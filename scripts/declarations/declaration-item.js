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
    derive: ['weaponAttackActivity'],
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
        { name: 'weaponAbility', path: 'system.ability', type: 'string', default: '', example: '',
          values: ['', 'str', 'dex', 'int', 'wis', 'cha', 'spellcasting', 'none'],
          guidance: 'The ability the attack uses; blank lets dnd5e choose from the properties.' },
        { name: 'weaponAttackBonus', path: 'system.attackBonus', type: 'string', default: '', example: '',
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
