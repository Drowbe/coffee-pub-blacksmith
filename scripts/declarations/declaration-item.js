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
            default: { value: 0, denomination: 'gp' },
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
