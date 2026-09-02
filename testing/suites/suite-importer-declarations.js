// ==================================================================
// ===== SUITE: IMPORTER DECLARATIONS ===============================
// ==================================================================
// The declaration engine is a pure data transformation -- declaration in,
// template out -- with no world state, which makes it the first part of the
// importer that can be asserted headlessly at all. It grows with each step
// of the build sequence in documentation/TODO.md.
//
// It deliberately does NOT assert the callback importer being replaced.
// A harness asserting a contract on its way out manufactures confidence,
// which is the failure test-harness.js warns about in its own header.
// ==================================================================

import { requireApi } from '../harness-lib.js';

const MODULE_PATH = '/modules/coffee-pub-blacksmith/scripts';
const FIXTURE_PATH = '/modules/coffee-pub-blacksmith/testing/import-json';

/**
 * The declaration modules are imported at their CANONICAL urls, deliberately
 * un-cache-busted.
 *
 * The harness busts suite urls because a suite is meant to be re-imported. Doing
 * the same to module code under scripts/ is actively wrong, and wrong in a way
 * that looks like a product bug: import() caches by url, but a busted module's
 * own relative imports are NOT busted. `declaration-item.js` imports
 * `../registry-declarations.js` plainly, so it always registers into the single
 * canonical registry -- while a suite that imported `registry-declarations.js?v=N`
 * would be reading a different, permanently empty Map. That mismatch presented as
 * "a declaration is already registered" on every run after the first.
 *
 * Importing canonically also means the suite observes the same registry
 * `api.importer` does, which is what a consumer-zero test should assert.
 *
 * The cost is the ordinary no-build one: after editing a declaration, reload
 * Foundry. Every other file in scripts/ already works that way.
 */
async function loadDeclarations() {
    const registry = await import(`${MODULE_PATH}/registry-declarations.js`);
    const manager = await import(`${MODULE_PATH}/manager-declarations.js`);
    // Not in the module load path until step 3; the suite is what pulls it in.
    const items = await import(`${MODULE_PATH}/declarations/declaration-item.js`);
    return { registry, manager, items };
}

/**
 * Probe declarations register into the real registry, which persists for the
 * session, so each run needs its own kind or the second run collides with the
 * first. That is the duplicate rule working, not a flaw in it.
 */
function probeKind() {
    return `harness-${foundry.utils.randomID(8)}`;
}

/** A minimal valid declaration. Built fresh so a mutation cannot leak between checks. */
function validDeclaration(kind, overrides = {}) {
    return {
        kind,
        id: 'probe',
        label: 'Probe',
        schemaVersion: 1,
        form: 'mapped',
        document: { documentName: 'Item', type: 'loot' },
        fields: [{ name: 'probeName', path: 'name', type: 'string' }],
        ...overrides
    };
}

export default {
    id: 'importer-declarations',
    label: 'Importer Declarations',
    icon: 'fa-solid fa-file-import',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        const importer = api?.importer;
        return [
            {
                label: 'api.importer',
                value: importer ? 'present' : 'missing',
                note: 'the public surface declarations register through'
            },
            {
                label: 'registerDeclaration',
                value: typeof importer?.registerDeclaration === 'function' ? 'present' : 'missing',
                note: 'step 0 of the build sequence'
            },
            {
                label: 'getJsonTemplate',
                value: typeof importer?.getJsonTemplate === 'function' ? 'present' : 'missing',
                note: 'step 1 derivation'
            }
        ];
    },

    checks: [
        {
            id: 'public-surface',
            label: 'The public surface exposes the declaration methods',
            tier: 'headless',
            group: 'Step 0 - public registration path',
            note: 'Blacksmith registers through the same methods a consuming module does.',
            run: async ({ expect }) => {
                const api = requireApi('importer');
                for (const method of [
                    'registerDeclaration', 'getDeclaration', 'getDeclarationsForKind',
                    'listDeclarations', 'getJsonTemplate', 'getJsonTemplateObject',
                    'getAuthoringGuide',
                    // Validation and construction. A consumer that cannot reach these
                    // has to keep its own builder, which is the duplication this whole
                    // model exists to end -- and Blacksmith reaching them internally
                    // while a sibling could not was the consumer-zero violation.
                    'validateEntry', 'validateEntryDeep', 'buildDocumentData', 'buildDocumentUpdate',
                    'declarationFromModel',
                    'registerFieldGroup', 'getFieldGroupsFor', 'listFieldGroups'
                ]) {
                    expect.ok(`api.importer.${method} is a function`,
                        typeof api.importer[method] === 'function');
                }

                // The public path must BUILD, not merely validate. A sibling's item
                // window is a second consumer of construction with no JSON in sight,
                // and it is the case that proves construction belongs on the surface.
                const built = await api.importer.buildDocumentData('item', 'loot', {
                    itemName: 'Probe Loot', itemType: 'Loot'
                });
                expect('the public path builds a document', built?.name, 'Probe Loot');
                expect('and types it from the declaration', built?.type, 'loot');

                // An UPDATE must assert only what the caller supplied. Everything
                // asserted here was a way a consumer's edit path would have clobbered
                // live state, which is why it exists at all.
                const patch = await api.importer.buildDocumentUpdate('item', 'loot', {
                    itemName: 'Renamed Loot'
                });
                expect('an update carries the supplied field', patch?.name, 'Renamed Loot');
                expect.ok('an update never retypes the document', patch.type === undefined);
                expect.ok('an update applies no defaults for absent fields',
                    patch.system?.quantity === undefined && patch.system?.identified === undefined);
                // Transforms still run, so a supplied field converts as it would on create.
                const priced = await api.importer.buildDocumentUpdate('item', 'loot', {
                    itemName: 'X', itemPrice: '15 GP'
                });
                expect('an update still converts what it does carry',
                    priced.system?.price?.value, 15);
            }
        },

        {
            id: 'registration',
            label: 'A valid declaration registers and reads back',
            tier: 'headless',
            group: 'Step 0 - public registration path',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const kind = probeKind();
                const key = registry.registerDeclaration(validDeclaration(kind));
                expect('registration returns the kind.profile key', key, `${kind}.probe`);

                const read = registry.getDeclaration(kind, 'probe');
                expect('the declaration reads back by kind and profile', read?.label, 'Probe');

                expect('a profile is scoped to its kind, not global',
                    registry.getDeclaration('item', 'probe'), undefined);

                expect.ok('getDeclarationsForKind returns it',
                    registry.getDeclarationsForKind(kind).length === 1);
            }
        },

        {
            id: 'registration-rejects',
            label: 'A malformed declaration is rejected at registration',
            tier: 'headless',
            group: 'Step 0 - public registration path',
            note: 'A bad declaration must fail here, loudly, rather than silently at import.',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const kind = probeKind();
                const reject = (label, overrides) => expect.throws(
                    label, () => registry.registerDeclaration(validDeclaration(kind, overrides)));

                await reject('missing kind is rejected', { kind: '' });
                await reject('missing id is rejected', { id: '' });
                await reject('an unknown form is rejected', { form: 'freeform' });
                await reject('schemaVersion below 1 is rejected', { schemaVersion: 0 });
                await reject('a missing documentName is rejected', { document: { type: 'loot' } });
                await reject('a mapped field with no path or role is rejected',
                    { id: 'p2', fields: [{ name: 'stray', type: 'string' }] });
                await reject('an alias pointing outside values is rejected', {
                    id: 'p3',
                    fields: [{
                        name: 'rarity', path: 'system.rarity', type: 'string',
                        values: ['common'], aliases: { ordinary: 'uncommon' }
                    }]
                });
                await reject('a default in the wrong shape is rejected', {
                    id: 'p5',
                    fields: [{
                        name: 'price', path: 'system.price', type: 'string',
                        transform: 'price', default: { value: 0, denomination: 'gp' }
                    }]
                });
                await reject('a duplicate field name is rejected', {
                    id: 'p4',
                    fields: [
                        { name: 'dup', path: 'a', type: 'string' },
                        { name: 'dup', path: 'b', type: 'string' }
                    ]
                });

                // Registering the same profile twice is an error rather than a silent
                // replace, for the same reason two contributions claiming one entry is.
                registry.registerDeclaration(validDeclaration(kind, { id: 'once' }));
                await expect.throws('re-registering a profile is rejected',
                    () => registry.registerDeclaration(validDeclaration(kind, { id: 'once' })));
            }
        },

        {
            id: 'loot-declared',
            label: 'The loot profile is declared and self-consistent',
            tier: 'headless',
            group: 'Step 1 - template derivation',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const loot = registry.getDeclaration('item', 'loot');
                expect.ok('item.loot is registered', Boolean(loot));
                expect('it is a mapped profile', loot?.form, 'mapped');
                expect('it builds an Item', loot?.document?.documentName, 'Item');
                expect('it builds a loot Item', loot?.document?.type, 'loot');

                // Every authorable field carries one sentence of guidance, because that
                // sentence is what the guide line and the prompt line are both built from.
                const missing = (loot?.fields ?? [])
                    .filter(field => field.authorable !== false && !field.guidance)
                    .map(field => field.name);
                expect('every authorable field carries guidance', missing, []);
            }
        },

        {
            id: 'template-parses',
            label: 'The derived template is valid JSON carrying every authorable field',
            tier: 'headless',
            group: 'Step 1 - template derivation',
            run: async ({ expect }) => {
                const { manager } = await loadDeclarations();
                const text = manager.buildTemplateText('item', 'loot');

                let parsed = null;
                try {
                    parsed = JSON.parse(text);
                } catch (error) {
                    expect('the derived template parses as JSON', error.message, 'no error');
                    return;
                }
                expect.ok('the derived template parses as JSON', parsed !== null);

                const expected = manager.authorableFieldNames('item', 'loot');
                expect('template keys match the authorable fields, in order',
                    Object.keys(parsed), expected);

                expect.ok('a non-authorable option block is absent by default',
                    !('flags' in parsed));
                expect.ok('an option block appears when its option is on',
                    'flags' in manager.buildTemplateObject('item', 'loot', { includeArtificer: true }));
            }
        },

        {
            id: 'validation-shape',
            label: 'Derived validation reports a code and a path, not a bare message',
            tier: 'headless',
            group: 'Step 2 - validation derivation',
            note: 'The structured envelope every kind promises and none currently populates.',
            run: async ({ expect }) => {
                const { manager } = await loadDeclarations();
                const run = (entry) => manager.validateEntry('item', 'loot', entry);

                const missing = run({ itemRarity: 'common' });
                expect('a missing required field is an error', missing.status, 'error');
                expect('it carries a stable code', missing.errors[0]?.code, 'REQUIRED_FIELD_MISSING');
                expect('it names the field', missing.errors[0]?.path, 'itemName');
                expect('it names the stage', missing.errors[0]?.stage, 'validate');

                const badValue = run({ itemName: 'X', itemRarity: 'mythic' });
                expect('a value outside the allowed set is an error', badValue.errors[0]?.code,
                    'VALUE_NOT_ALLOWED');
                expect('the allowed set travels with the issue',
                    Array.isArray(badValue.errors[0]?.details?.allowed), true);

                const badTypes = run({ itemName: 'X', itemQuantity: 'two', itemIdentified: 'yes' });
                expect('every type mismatch is reported, not just the first',
                    badTypes.errors.map(error => error.path), ['itemQuantity', 'itemIdentified']);

                const unknown = run({ itemName: 'X', itemDescriptionn: 'typo' });
                expect('an undeclared key warns rather than failing', unknown.status, 'warning');
                expect('undeclared keys are one warning, not one each',
                    unknown.warnings.filter(one => one.code === 'UNKNOWN_FIELDS').length, 1);
                expect('and the offending key is named in it',
                    unknown.warnings.find(one => one.code === 'UNKNOWN_FIELDS')?.details?.fields,
                    ['itemDescriptionn']);

                // A stock fixture carries eight template fields loot does not read.
                // One line, not eight, or the result screen reads as a failure.
                const residue = run({
                    itemName: 'X', itemSubTypeNuance: '', itemImageTerms: [], itemImageNuance: '',
                    itemLimitedUses: 1, limitedUsesSpent: 0, limitedUsesMax: 1,
                    destroyOnEmpty: false, itemRecoveryPeriod: 'none'
                });
                expect('template residue produces exactly one warning', residue.warnings.length, 1);
                expect('naming every field it covers',
                    residue.warnings[0]?.details?.fields?.length, 8);

                const legacyKey = run({ name: 'Legacy' });
                expect('a legacy key is accepted', legacyKey.status, 'warning');
                expect('and reported as deprecated', legacyKey.warnings[0]?.code, 'DEPRECATED_KEY');
                expect('naming the current field',
                    legacyKey.warnings[0]?.details?.canonical, 'itemName');

                expect('a valid entry is clean',
                    run({ itemName: 'Plain', itemRarity: 'common' }).status, 'success');

                // On an ARRAY field, `values` constrains each ELEMENT. Comparing the
                // array itself to the allowed list is false for every array including
                // an empty one, so a field declared that way rejected everything --
                // enforced-looking and never satisfiable. No Blacksmith profile has an
                // array with a values list, so nothing here exercised it until a
                // consuming module declared the first one.
                const { registry } = await loadDeclarations();
                const kind = probeKind();
                registry.registerDeclaration(validDeclaration(kind, { id: 'host' }));
                registry.registerFieldGroup({
                    id: 'enumlist', module: 'coffee-pub-probe', kind, appliesTo: '*',
                    option: { id: 'enumListOption', label: 'Enum List' },
                    fields: [{ name: 'tags', path: 'flags.probe.tags', type: 'array',
                               default: [], example: [], values: ['ALPHA', 'BETA'],
                               guidance: 'A constrained list.' }]
                });
                const list = (tags) => manager.validateEntry(kind, 'host', { probeName: 'X', tags });
                expect('an empty constrained array is clean', list([]).status, 'success');
                expect('every element allowed is clean', list(['ALPHA', 'BETA']).status, 'success');
                expect('one disallowed element fails',
                    list(['ALPHA', 'GAMMA']).errors[0]?.code, 'VALUE_NOT_ALLOWED');
                expect('and the failure names the value, not the array',
                    list(['ALPHA', 'GAMMA']).errors[0]?.details?.actual, 'GAMMA');
            }
        },

        {
            id: 'validation-shadow',
            label: 'Shadow the current validator and account for every divergence',
            tier: 'headless',
            group: 'Step 2 - validation derivation',
            note: 'Derived validation vs the parser it replaces. Fails only on an UNACCOUNTED difference.',
            run: async ({ expect, log }) => {
                const { manager } = await loadDeclarations();
                // Compare against the PARSER, not against the kind's callback. Once a
                // profile switches over, the callback routes to the derived path and the
                // check would be shadowing itself -- which it was, and which it caught.
                // The parser is what is actually being replaced, so it stays the baseline
                // for as long as any profile still uses it.
                const parser = await import(`${MODULE_PATH}/parsers/parse-item.js`);

                // Every divergence is listed with WHY. An unlisted one fails the check.
                //   stricter — the declaration rejects what the current parser waves through
                //   looser   — shape-only validation cannot see a failure that belongs to a
                //              transform, and transforms run at construction in step 3
                const CASES = [
                    { id: 'fixture', entry: {
                        itemType: 'loot', itemSubType: 'trinket', itemName: 'Blacksmith Test Trinket',
                        itemDescription: 'A harmless test trinket.', itemPrice: '5 gp', itemWeight: 1,
                        itemQuantity: 1, itemRarity: 'common', itemIsMagical: false,
                        itemIdentified: true, itemSource: 'Coffee Pub Test Data', itemLicense: 'Internal Test'
                    }, diverges: null },
                    // The parser alone does not require a name -- its tail rebuilds an
                    // unnamed entry as "Imported Item". The requirement lived in the kind's
                    // callback rather than in the parser, so shipped behaviour and the
                    // declaration agree; only the parser taken on its own differs.
                    { id: 'missing name', entry: { itemRarity: 'common' },
                      diverges: 'stricter than the parser alone: it silently names an unnamed entry "Imported Item"' },
                    { id: 'legacy name key', entry: { name: 'Legacy Loot' }, diverges: null },
                    { id: 'invalid rarity', entry: { itemName: 'X', itemRarity: 'mythic' },
                      diverges: 'stricter: rarity is unchecked by the parser, so an invalid value reaches the document' },
                    { id: 'quantity as a word', entry: { itemName: 'X', itemQuantity: 'two' },
                      diverges: 'stricter: the parser writes the string to system.quantity unchecked' },
                    // Agreed since step 3: deep validation runs the conversion, so a price
                    // that cannot parse fails at Validate rather than surviving to Import.
                    { id: 'unparseable price', entry: { itemName: 'X', itemPrice: 'a fortune' },
                      diverges: null }
                ];

                const unaccounted = [];
                for (const testCase of CASES) {
                    const outcome = await manager.validateEntryDeep('item', 'loot', testCase.entry);
                    const derivedFails = outcome.status === 'error';
                    let currentFails = false;
                    try {
                        await parser.parseFlatItemToFoundry(testCase.entry);
                    } catch (_) {
                        currentFails = true;
                    }
                    const same = derivedFails === currentFails;
                    log(`${testCase.id}: derived ${derivedFails ? 'reject' : 'accept'}`
                        + `, current ${currentFails ? 'reject' : 'accept'}`
                        + (same ? '' : ` — ${testCase.diverges ?? 'UNACCOUNTED'}`));
                    if (!same && !testCase.diverges) unaccounted.push(testCase.id);
                    if (same && testCase.diverges) unaccounted.push(`${testCase.id} (listed but agreed)`);
                }
                expect('every divergence from the current validator is accounted for', unaccounted, []);
            }
        },

        {
            id: 'construction-parity',
            label: 'Derived construction matches the parser it replaces',
            tier: 'headless',
            group: 'Step 3 - construction derivation',
            note: 'Builds the same entries both ways and compares the document source data.',
            run: async ({ expect, log }) => {
                const { manager } = await loadDeclarations();
                const parser = await import(`${MODULE_PATH}/parsers/parse-item.js`);

                // buildEnvelope stamps updatedAt from the clock, so two runs of the same
                // input differ by design. Normalise it rather than exclude the field:
                // the envelope's presence and its html are exactly what must match.
                // Two sources of deliberate nondeterminism have to be normalised, and
                // neither can simply be excluded: their PRESENCE is what must match.
                //   - buildEnvelope stamps updatedAt from the clock
                //   - activities and effects carry a randomID, and the activity id is
                //     also the KEY it is stored under, so both sides must be renamed
                const settle = (data) => {
                    const clone = foundry.utils.deepClone(data);
                    const note = clone?.flags?.['coffee-pub-blacksmith']?.gmNotes;
                    if (note && typeof note === 'object') note.updatedAt = 0;

                    const activities = clone?.system?.activities;
                    if (activities && typeof activities === 'object') {
                        clone.system.activities = Object.fromEntries(
                            Object.values(activities).map((activity, index) => {
                                const settled = { ...activity, _id: `activity-${index}` };
                                return [`activity-${index}`, settled];
                            }));
                    }
                    if (Array.isArray(clone?.effects)) {
                        clone.effects = clone.effects.map((effect, index) =>
                            ({ ...effect, _id: `effect-${index}` }));
                    }
                    return clone;
                };

                const CASES = [
                    {
                        id: 'a plain melee weapon',
                        profile: 'weapon',
                        entry: {
                            itemType: 'weapon', itemSubType: 'Simple Melee', itemName: 'Test Club',
                            weaponDamageFormula: '1d4', weaponDamageType: 'bludgeoning',
                            itemImagePath: 'icons/weapons/clubs/club-simple.webp'
                        }
                    },
                    {
                        id: 'a versatile weapon',
                        profile: 'weapon',
                        entry: {
                            itemType: 'weapon', itemSubType: 'Martial Melee', itemName: 'Test Longsword',
                            weaponDamageFormula: '1d8', weaponDamageType: 'slashing',
                            weaponProperties: ['versatile'], weaponVersatileDamageFormula: '1d10',
                            weaponMastery: 'sap', weaponAbility: 'str',
                            itemImagePath: 'icons/weapons/swords/sword-broad-steel.webp'
                        }
                    },
                    {
                        id: 'a magical ranged weapon with attunement',
                        profile: 'weapon',
                        entry: {
                            itemType: 'weapon', itemSubType: 'Martial Ranged', itemName: 'Test Longbow +1',
                            weaponDamageFormula: '1d8', weaponDamageType: 'piercing',
                            weaponProperties: ['two-handed', 'ammunition', 'magical'],
                            weaponRange: { value: 150, long: 600, reach: null, units: 'ft' },
                            weaponAmmunitionType: 'arrow', itemIsMagical: true, weaponMagicalBonus: 1,
                            magicalAttunementRequired: 'required', itemRarity: 'rare',
                            itemImagePath: 'icons/weapons/bows/bow-recurve-yellow.webp'
                        }
                    },
                    {
                        id: 'a piece of equipment with attunement',
                        profile: 'equipment',
                        entry: {
                            itemType: 'equipment', itemSubType: 'Light Armor', itemName: 'Test Leather',
                            itemIsMagical: true, magicalAttunementRequired: 'required', itemRarity: 'uncommon',
                            itemImagePath: 'icons/equipment/chest/breastplate-leather-brown.webp'
                        }
                    },
                    {
                        id: 'mundane equipment, which stores no attunement key at all',
                        profile: 'equipment',
                        entry: {
                            itemType: 'equipment', itemSubType: 'Clothing', itemName: 'Test Cloak',
                            itemImagePath: 'icons/equipment/back/cape-layered-red.webp'
                        }
                    },
                    {
                        id: 'a tool',
                        profile: 'tool',
                        entry: {
                            itemType: 'tool', itemSubType: "Artisan's Tools", itemName: 'Test Smith Tools',
                            itemImagePath: 'icons/tools/smithing/hammer-menacing-steel.webp'
                        }
                    },
                    {
                        id: 'a container',
                        profile: 'container',
                        entry: {
                            itemType: 'container', itemSubType: 'backpack', itemName: 'Test Pack',
                            itemImagePath: 'icons/containers/bags/pack-simple-leather.webp'
                        }
                    },
                    {
                        id: 'a feature with uses and an activity',
                        profile: 'feature',
                        entry: {
                            itemType: 'feature', itemName: 'Test Breath Weapon',
                            itemDescription: '<p>A gout of flame.</p>',
                            featureType: 'monster', featureUsesMax: 1,
                            featureRecoveryPeriod: 'short rest',
                            itemImagePath: 'icons/magic/fire/breath-jet-stream-red.webp',
                            activities: [{
                                activityType: 'Save', activityName: 'Breath',
                                saveAbility: 'dex', onSave: 'half',
                                damageFormula: '4d6', damageType: 'fire'
                            }]
                        }
                    },
                    {
                        id: 'a spell with a template and materials',
                        profile: 'spell',
                        entry: {
                            itemType: 'spell', itemName: 'Test Fireball',
                            spellLevel: 3, spellSchool: 'evo',
                            spellProperties: ['vocal', 'somatic', 'material'],
                            materialDescription: 'a tiny ball of bat guano',
                            materialCost: 0, materialConsumed: false,
                            castingTime: { value: 1, units: 'action' },
                            spellRange: { value: 150, units: 'ft' },
                            spellDuration: { value: null, units: 'inst' },
                            spellTarget: { affectsType: 'creature', templateType: 'sphere', templateSize: 20, units: 'ft' },
                            itemImagePath: 'icons/magic/fire/explosion-fireball-large-orange.webp',
                            activities: [{
                                activityType: 'Save', saveAbility: 'dex', onSave: 'half',
                                damageFormula: '8d6', damageType: 'fire'
                            }]
                        }
                    },
                    {
                        id: 'a consumable with uses that destroys when empty',
                        profile: 'consumable',
                        entry: {
                            itemType: 'consumable', itemSubType: 'Potion', itemName: 'Test Healing Potion',
                            limitedUsesMax: 1, limitedUsesSpent: 0, destroyOnEmpty: true,
                            itemRecoveryPeriod: 'none', itemPrice: '50 gp',
                            itemImagePath: 'icons/consumables/potions/bottle-round-corked-red.webp'
                        }
                    },
                    {
                        id: 'the loot fixture',
                        entry: {
                            itemType: 'loot', itemSubType: 'trinket',
                            itemName: 'Blacksmith Test Trinket',
                            itemDescription: 'A harmless test trinket.',
                            itemGMNotes: '<p>GM-only note.</p>',
                            itemPrice: '5 gp', itemWeight: 1, itemQuantity: 1,
                            itemRarity: 'common', itemIsMagical: false, itemIdentified: true,
                            itemImagePath: 'icons/commodities/treasure/token-gold.webp',
                            itemSource: 'Coffee Pub Test Data', itemLicense: 'Internal Test'
                        }
                    },
                    {
                        id: 'a magical item with no notes',
                        entry: {
                            itemType: 'loot', itemName: 'Glimmering Bauble',
                            itemIsMagical: true, itemRarity: 'rare',
                            itemImagePath: 'icons/commodities/gems/gem-faceted-round-blue.webp'
                        }
                    },
                    {
                        id: 'a module flag namespace riding along',
                        entry: {
                            itemType: 'loot', itemName: 'Component',
                            itemImagePath: 'icons/commodities/flowers/flower-purple.webp',
                            flags: { 'coffee-pub-artificer': { artificerType: 'Component' } }
                        }
                    }
                ];

                // ONE deliberate difference, asserted rather than waved through: the parser
                // also writes source and license into a `coffee-pub` flag namespace that
                // nothing reads -- not Blacksmith, not any sibling -- and is inconsistent
                // about it, defaulting the system field to '' while leaving the flag
                // undefined. The declaration drops it. Both halves are checked below, so
                // the drop stays deliberate and cannot quietly become an accident.
                const dropLegacyFlag = (data) => {
                    const clone = foundry.utils.deepClone(data);
                    delete clone?.flags?.['coffee-pub'];
                    if (clone.flags && !Object.keys(clone.flags).length) delete clone.flags;
                    // A second retired duplicate, Consumable's. dnd5e reads it in one
                    // place -- a migration shim, into a variable named `oldType` -- and
                    // reads `type.value` at runtime. Dropped for the same reason as the
                    // flag above, and normalised here so the rest still compares.
                    delete clone?.system?.consumableType;
                    // The parser wrote NO activities key when none were authored; the
                    // shared builder writes {}. Artificer confirmed {} is what dnd5e
                    // expects, so the derived side is right and the parser side is
                    // normalised up to it rather than the reverse.
                    if (clone?.system && Object.keys(clone.system.activities ?? {}).length === 0) {
                        delete clone.system.activities;
                    }
                    // The same difference on the effects side, and the same reasoning.
                    // Consumable's parser branch never set `effects`; the shared
                    // derivation always does, because a consumable's activities can now
                    // apply effects where the old inline builder passed no array at all.
                    // An empty embedded collection and an absent one are equivalent at
                    // creation, so this normalises the shape rather than the behaviour.
                    if (Array.isArray(clone?.effects) && !clone.effects.length) {
                        delete clone.effects;
                    }
                    return clone;
                };

                const probe = await parser.parseFlatItemToFoundry({
                    itemType: 'loot', itemName: 'Legacy Flag Probe',
                    itemImagePath: 'icons/svg/item-bag.svg', itemSource: 'Somewhere'
                });
                expect.ok('the parser still writes the legacy coffee-pub flag',
                    probe?.flags?.['coffee-pub'] !== undefined);
                expect('the declaration does not', (await manager.buildDocumentData('item', 'loot', {
                    itemType: 'loot', itemName: 'Legacy Flag Probe',
                    itemImagePath: 'icons/svg/item-bag.svg', itemSource: 'Somewhere'
                }))?.flags?.['coffee-pub'], undefined);

                for (const testCase of CASES) {
                    const profile = testCase.profile ?? 'loot';
                    const derived = dropLegacyFlag(settle(await manager.buildDocumentData('item', profile, testCase.entry)));
                    const current = dropLegacyFlag(settle(await parser.parseFlatItemToFoundry(testCase.entry)));
                    // Stable key order before stringifying: object key order is an artefact
                    // of insertion, and reporting it as a difference cries wolf. The
                    // assertion below uses deepEqual and never cared.
                    const stable = (value) => JSON.stringify(value, (_, inner) =>
                        (inner && typeof inner === 'object' && !Array.isArray(inner))
                            ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
                            : inner);
                    const keys = [...new Set([...Object.keys(derived), ...Object.keys(current)])].sort();
                    for (const key of keys) {
                        const same = stable(derived[key]) === stable(current[key]);
                        if (!same) {
                            log(`${testCase.id} differs at ${key}:`);
                            log(`   derived ${JSON.stringify(derived[key])}`);
                            log(`   current ${JSON.stringify(current[key])}`);
                        }
                    }
                    expect(`${testCase.id}: derived construction equals the parser`, derived, current);
                }
            }
        },

        {
            id: 'weapon-rules',
            label: 'Every cross-field rule kind fires, in both directions',
            tier: 'headless',
            group: 'Step 4 - the rule vocabulary',
            note: 'Weapon is declared before the simpler profiles because it is what tests the model.',
            run: async ({ expect }) => {
                const { manager } = await loadDeclarations();
                const base = { itemName: 'X', weaponDamageFormula: '1d8', weaponDamageType: 'slashing' };
                const code = (extra) => {
                    const outcome = manager.validateEntry('item', 'weapon', { ...base, ...extra });
                    return outcome.errors[0]?.code ?? outcome.status;
                };

                expect('a plain melee weapon is clean', code({}), 'success');

                // requiresTogether, and it must fire from either side.
                expect('versatile without a versatile formula fails',
                    code({ weaponProperties: ['versatile'] }), 'RULE_REQUIRESTOGETHER');
                expect('a versatile formula without the property fails',
                    code({ weaponVersatileDamageFormula: '1d10' }), 'RULE_REQUIRESTOGETHER');
                expect('both together are clean',
                    code({ weaponProperties: ['versatile'], weaponVersatileDamageFormula: '1d10' }), 'success');

                expect('versatile and two-handed cannot combine',
                    code({ weaponProperties: ['versatile', 'two-handed'], weaponVersatileDamageFormula: '1d10' }),
                    'RULE_MUTUALLYEXCLUSIVE');

                // The flag and the property are related in ONE direction. The flag
                // alone is complete -- the transform adds the property -- and
                // demanding both made a correct weapon fail for not saying it twice.
                expect('the magical flag alone is complete',
                    code({ itemIsMagical: true }), 'success');
                // The reverse still fails, and not for tidiness: the flag is what the
                // attunement transforms key on, so the property alone silently drops
                // attunement.
                expect('the magical property without the flag fails',
                    code({ weaponProperties: ['magical'] }), 'RULE_REQUIRES');
                expect('both together are clean',
                    code({ itemIsMagical: true, weaponProperties: ['magical'] }), 'success');
                // Case folds here as everywhere: the payload spelling is not the
                // canonical one, and the rule must still see it.
                expect('a capitalised property without the flag still fails',
                    code({ weaponProperties: ['Magical'] }), 'RULE_REQUIRES');

                expect('a magical bonus requires a magical weapon',
                    code({ weaponMagicalBonus: 1 }), 'RULE_REQUIRES');
                expect('authored activities are refused',
                    code({ activities: [{ activityType: 'Attack' }] }), 'RULE_MUSTBEEMPTY');

                // The named rule: ranged-ness is derived from the subtype, not authored.
                expect('a ranged weapon without a range fails',
                    code({ itemSubType: 'Martial Ranged' }), 'WEAPON_RANGE_REQUIRED');
                expect('a thrown melee weapon without a range fails',
                    code({ weaponProperties: ['thrown'] }), 'WEAPON_RANGE_REQUIRED');
                expect('a ranged weapon with a range is clean',
                    code({ itemSubType: 'Martial Ranged', weaponRange: { value: 120, long: 480 } }), 'success');

                expect('an unknown mastery is refused',
                    code({ weaponMastery: 'whirl' }), 'VALUE_NOT_ALLOWED');
            }
        },

        {
            id: 'weapon-sentences',
            label: 'Each rule states its own sentence, for the guide and the prompt',
            tier: 'headless',
            group: 'Step 4 - the rule vocabulary',
            note: 'One source for the validation message, the guide line and the prompt line.',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const rules = await import(`${MODULE_PATH}/manager-declaration-rules.js`);
                const weapon = registry.getDeclaration('item', 'weapon');
                const sentences = rules.ruleSentences(weapon);

                expect('every rule produces a sentence', sentences.length, weapon.rules.length);
                expect('none is blank', sentences.filter(one => !one.trim()), []);
                expect.ok('the named rule contributes its own wording',
                    sentences.some(one => one.includes('Ranged and Thrown')));
            }
        },

        {
            id: 'construction-errors',
            label: 'A transform failure carries a code and a path',
            tier: 'headless',
            group: 'Step 3 - construction derivation',
            note: 'Closes the one place step 2 was looser than the current validator.',
            run: async ({ expect }) => {
                const { manager } = await loadDeclarations();
                let caught = null;
                try {
                    await manager.buildDocumentData('item', 'loot', {
                        itemName: 'Bad Price', itemPrice: 'a fortune',
                        itemImagePath: 'icons/svg/item-bag.svg'
                    });
                } catch (error) {
                    caught = error;
                }
                expect.ok('an unparseable price fails construction', caught !== null);
                expect('it carries a stable code', caught?.issue?.code, 'PRICE_UNPARSEABLE');
                expect('it names the field', caught?.issue?.path, 'itemPrice');
                expect('it names the convert stage', caught?.issue?.stage, 'convert');
            }
        },

        {
            id: 'roundtrip-fixtures',
            label: 'Every fixture imports and Foundry stores what we built',
            tier: 'headless',
            group: 'Step 4 - round trip through Foundry',
            note: 'Creates real Items and deletes them. Parity stops at the source data; this is the half after.',
            run: async ({ expect, log }) => {
                const api = requireApi('importer');
                const kind = api.importer.getKind('item');
                expect.ok('the item kind is reachable through the public surface',
                    typeof kind?.onImportEntry === 'function');
                if (typeof kind?.onImportEntry !== 'function') return;

                // The gap this closes: construction-parity compares what
                // buildDocumentData PRODUCES. It never calls createDocuments, so
                // nothing has ever checked what dnd5e accepts, normalises or
                // silently drops on the way in. A structurally wrong activity is
                // accepted by our code and fixed up or discarded by the system.
                const imported = async (fixture, assertions) => {
                    let response;
                    try {
                        response = await fetch(`${FIXTURE_PATH}/${fixture}`);
                    } catch (error) {
                        expect(`${fixture} is readable`, error.message, 'no error');
                        return;
                    }
                    if (!response.ok) {
                        expect(`${fixture} is readable`, `HTTP ${response.status}`, 'HTTP 200');
                        return;
                    }
                    const entry = await response.json();

                    let created = null;
                    try {
                        created = await kind.onImportEntry(entry);
                    } catch (error) {
                        expect(`${fixture} imports`, error.message, 'no error');
                        return;
                    }
                    try {
                        expect.ok(`${fixture}: the Item is in the world`,
                            Boolean(game.items.get(created?.id)));
                        // Stored source, not prepared data: the question is what
                        // Foundry persisted, which is not what the sheet shows.
                        await assertions(created.toObject(), created);
                    } finally {
                        await created?.delete?.();
                    }
                };

                await imported('item-import-loot.json', (stored) => {
                    expect('loot: type', stored.type, 'loot');
                    expect('loot: price survived', stored.system?.price,
                        { value: 5, denomination: 'gp' });
                    expect.ok('loot: the GM Notes flag is stored',
                        Boolean(stored.flags?.['coffee-pub-blacksmith']?.gmNotes?.html));
                    expect.ok('loot: the retired coffee-pub flag is NOT written',
                        stored.flags?.['coffee-pub'] === undefined);
                });

                await imported('item-import-weapon.json', (stored) => {
                    expect('weapon: type', stored.type, 'weapon');
                    // The activity is DERIVED, not mapped -- the highest-risk thing
                    // the engine builds, and invisible until a document exists.
                    const activities = Object.values(stored.system?.activities ?? {});
                    expect('weapon: exactly one generated activity', activities.length, 1);
                    expect('weapon: it is an attack', activities[0]?.type, 'attack');
                    expect.ok('weapon: dnd5e kept the attack block',
                        Boolean(activities[0]?.attack?.type?.value));
                    expect.ok('weapon: base damage survived',
                        activities[0] !== undefined && stored.system?.damage?.base !== undefined);
                    expect('weapon: not attuned on import', stored.system?.attuned, false);
                    expect('weapon: not equipped on import', stored.system?.equipped, false);
                    log(`weapon activity: ${JSON.stringify(activities[0]?.attack ?? null)}`);
                });

                await imported('item-import-equipment-passive.json', (stored) => {
                    expect('equipment: type', stored.type, 'equipment');
                    expect('equipment: one passive effect stored', (stored.effects ?? []).length, 1);
                    expect.ok('equipment: the effect transfers to its owner',
                        stored.effects?.[0]?.transfer === true);
                    expect.ok('equipment: attunement was written for a magical item',
                        typeof stored.system?.attunement === 'string');
                });

                await imported('item-import-feature.json', (stored) => {
                    expect('feature: type', stored.type, 'feat');
                    expect.ok('feature: an identifier was derived from the name',
                        Boolean(stored.system?.identifier));
                });

                await imported('item-import-feature-save-area.json', (stored) => {
                    expect('feature-area: type', stored.type, 'feat');
                    const activities = Object.values(stored.system?.activities ?? {});
                    expect.ok('feature-area: at least one activity', activities.length > 0);
                    expect.ok('feature-area: a measured template survived creation',
                        activities.some(one => Boolean(one?.target?.template?.type)));
                });

                await imported('item-import-spell.json', (stored) => {
                    expect('spell: type', stored.type, 'spell');
                    expect.ok('spell: level is a number', Number.isInteger(stored.system?.level));
                    expect.ok('spell: school survived', Boolean(stored.system?.school));
                    expect.ok('spell: the materials block is an object',
                        stored.system?.materials !== null && typeof stored.system?.materials === 'object');
                });

                // No consumable fixture exists -- the profile whose activity path had
                // rotted was also the one nothing covered. Built inline until one lands.
                await (async () => {
                    let created = null;
                    try {
                        created = await kind.onImportEntry({
                            itemType: 'consumable', itemSubType: 'Potion',
                            itemName: 'Harness Test Potion',
                            limitedUsesMax: 1, destroyOnEmpty: true,
                            itemImagePath: 'icons/consumables/potions/bottle-round-corked-red.webp'
                        });
                        const stored = created.toObject();
                        expect('consumable: type', stored.type, 'consumable');
                        expect('consumable: uses max stored', String(stored.system?.uses?.max), '1');
                        expect('consumable: destroys when empty',
                            stored.system?.uses?.autoDestroy, true);
                        expect.ok('consumable: the retired consumableType is NOT written',
                            stored.system?.consumableType === undefined);
                    } finally {
                        await created?.delete?.();
                    }
                })();

                expect.ok('no test items were left behind',
                    !game.items.some(one => one.name?.startsWith('Harness Test')));
            }
        },

        {
            id: 'roundtrip-behaviour',
            label: 'Import a weapon and a spell, then use them',
            tier: 'interactive',
            group: 'Step 4 - round trip through Foundry',
            note: 'Creates two Items and LEAVES them. Roll the weapon, place the spell template, then delete both.',
            run: async ({ expect, log }) => {
                const api = requireApi('importer');
                const kind = api.importer.getKind('item');
                const made = [];
                for (const fixture of ['item-import-weapon.json', 'item-import-spell.json']) {
                    const response = await fetch(`${FIXTURE_PATH}/${fixture}`);
                    if (!response.ok) {
                        log(`SKIPPED: ${fixture} not readable (${response.status})`);
                        continue;
                    }
                    const created = await kind.onImportEntry(await response.json());
                    made.push(created);
                    log(`created: ${created.name} (${created.uuid})`);
                }
                expect.ok('both items were created', made.length === 2);

                // Everything above this line is assertable and is asserted in the
                // headless check. What is left is behaviour AFTER creation, which no
                // comparison of document data can reach: a structurally valid activity
                // can still roll wrongly, and a template that stores fine can still
                // fail to place.
                log('');
                log('CHECK, then delete both items yourself:');
                log('  1. Drag the weapon to an actor and roll its attack.');
                log('     The attack should roll and the damage button should appear.');
                log('  2. Open the spell and use it. Its measured template should be');
                log('     offered for placement at the right size.');
                log('  3. Both sheets should open with no console errors.');
                log('');
                log('These are LEFT IN THE WORLD on purpose -- you cannot roll a deleted item.');
            }
        },

        {
            id: 'field-group-registration',
            label: 'A field group registers, and a malformed one is rejected',
            tier: 'headless',
            group: 'Step 5 - field groups',
            note: 'A module contributing fields to profiles it does not own.',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const kind = probeKind();
                registry.registerDeclaration(validDeclaration(kind, { id: 'host' }));

                const group = (overrides = {}) => ({
                    id: 'probe-group', module: 'coffee-pub-probe', kind, appliesTo: '*',
                    option: { id: 'probeGroupOption', label: 'Probe Group' },
                    fields: [{ name: 'probeExtra', path: 'flags.probe.extra', type: 'string',
                               default: '', example: '', guidance: 'A contributed field.' }],
                    ...overrides
                });

                expect('registration returns the kind.id key',
                    registry.registerFieldGroup(group()), `${kind}.probe-group`);
                expect.ok('it reads back for a profile of that kind',
                    registry.getFieldGroupsFor(kind, 'host').length === 1);

                const reject = (label, overrides) => expect.throws(
                    label, () => registry.registerFieldGroup(group(overrides)));
                await reject('a missing kind is rejected', { kind: '', id: 'g2' });
                await reject('a missing id is rejected', { id: '' });
                // A group exists so a module can contribute to a profile it does not own,
                // so a failure has to be able to name whose fields are at fault.
                await reject('a missing owning module is rejected', { id: 'g3', module: '' });
                await reject('a missing option is rejected', { id: 'g4', option: undefined });
                await reject('a bad appliesTo is rejected', { id: 'g5', appliesTo: 'everything' });
                // A contributed field is not a lesser field: same validation as a profile's.
                await reject('a field with no path or role is rejected',
                    { id: 'g6', fields: [{ name: 'stray', type: 'string' }] });
                await reject('an unknown transform is rejected',
                    { id: 'g7', fields: [{ name: 'x', path: 'flags.p.x', transform: 'notReal' }] });
                await reject('re-registering the same id is rejected', {});
            }
        },

        {
            id: 'field-group-composition',
            label: 'Contributed fields reach the template, validation and construction',
            tier: 'headless',
            group: 'Step 5 - field groups',
            note: 'Anything reading a declaration\'s own field list drops the group silently.',
            run: async ({ expect }) => {
                const { registry, manager } = await loadDeclarations();
                const kind = probeKind();
                registry.registerDeclaration(validDeclaration(kind, { id: 'host' }));
                registry.registerFieldGroup({
                    id: 'compose', module: 'coffee-pub-probe', kind, appliesTo: '*',
                    option: { id: 'composeOption', label: 'Compose' },
                    fields: [
                        { name: 'contributedType', path: 'flags.probe.type', type: 'string',
                          required: true, values: ['alpha', 'beta'], example: 'alpha',
                          guidance: 'A contributed enum.' },
                        { name: 'contributedList', path: 'flags.probe.list', type: 'array',
                          default: [], example: [], guidance: 'A contributed list.' }
                    ],
                    rules: [{ kind: 'requires', when: 'contributedType:alpha', then: ['contributedList'] }]
                });

                const off = Object.keys(manager.buildTemplateObject(kind, 'host'));
                const on = Object.keys(manager.buildTemplateObject(kind, 'host', { composeOption: true }));
                expect.ok('the group is absent from the template by default',
                    !off.includes('contributedType'));
                expect.ok('and present when its option is on', on.includes('contributedType'));
                expect.ok('the option gates the whole group, not each field',
                    on.includes('contributedList'));

                const check = (entry) => manager.validateEntry(kind, 'host', entry);

                // The bug this guards: composing fields WITHOUT rules put the group's
                // fields in the template while their constraints silently did not exist.
                expect('a contributed rule fires',
                    check({ probeName: 'X', contributedType: 'alpha' }).errors[0]?.code,
                    'RULE_REQUIRES');
                expect('satisfying it clears',
                    check({ probeName: 'X', contributedType: 'alpha', contributedList: ['a'] }).status,
                    'success');
                expect('contributed values are enforced',
                    check({ probeName: 'X', contributedType: 'gamma' }).errors[0]?.code,
                    'VALUE_NOT_ALLOWED');

                // The second bug, and the worse one: a group's `required` field was
                // demanded of EVERY entry of the kind, so a payload that never mentioned
                // the group failed for want of a field belonging to someone else.
                expect('an entry that does not engage the group is unaffected',
                    check({ probeName: 'X' }).status, 'success');
                expect('but half a group is a genuine error',
                    check({ probeName: 'X', contributedList: ['a'] }).errors[0]?.path,
                    'contributedType');
            }
        },

        {
            id: 'field-group-value-gate',
            label: 'A field can require another field to have a value',
            tier: 'headless',
            group: 'Step 5 - field groups',
            note: 'requiresWhen reuses the rule vocabulary\'s field:value reference.',
            run: async ({ expect }) => {
                const { registry, manager } = await loadDeclarations();
                const kind = probeKind();
                registry.registerDeclaration(validDeclaration(kind, { id: 'host' }));
                registry.registerFieldGroup({
                    id: 'gated', module: 'coffee-pub-probe', kind, appliesTo: ['host'],
                    option: { id: 'gatedOption', label: 'Gated' },
                    rules: [{ kind: 'requires', when: 'gateKey:special', then: ['onlyWhenSpecial'] }],
                    fields: [
                        { name: 'gateKey', path: 'flags.probe.key', type: 'string',
                          values: ['plain', 'special'], example: 'plain', guidance: 'The gate.' },
                        { name: 'onlyWhenSpecial', path: 'flags.probe.extra', type: 'string',
                          default: '', example: '', requiresWhen: 'gateKey:special',
                          guidance: 'Exists only for the special kind.' }
                    ]
                });

                expect.ok('appliesTo can name profiles rather than all of them',
                    registry.getFieldGroupsFor(kind, 'host').length === 1);

                // A template is a single starting point with no entry to test a gate
                // against, so a gated field must not appear in one. Including it
                // produced a contradictory example -- a Plant component carrying the
                // fields that exist only on a Process, which the rules forbid.
                const template = manager.buildTemplateObject(kind, 'host', { gatedOption: true });
                expect.ok('the gate field itself is offered', 'gateKey' in template);
                expect.ok('the gated field is NOT in the template',
                    !('onlyWhenSpecial' in template));

                // It is documented instead, with the condition stated, which is where
                // a condition can actually be expressed.
                const prompt = manager.buildPromptSchemaText(kind, 'host', { gatedOption: true });
                expect.ok('but it is documented in the prompt', prompt.includes('ONLYWHENSPECIAL'));
                expect.ok('with the condition that governs it',
                    prompt.includes('Include only when gateKey is special'));
                expect.ok('a contributed RULE is stated when the option is on',
                    prompt.includes('gateKey "special"'));

                const built = async (entry) => manager.buildDocumentData(kind, 'host', entry);

                // Authoring is gated by the OPTION; validation is gated by what the
                // payload engages. Using the validation rule set for authoring told a
                // generator about constraints on fields the prompt had switched off --
                // a rule about something absent, which is the never-firing defect
                // pointing the other way.
                const withGroup = manager.buildPromptSchemaText(kind, 'host', { gatedOption: true });
                const withoutGroup = manager.buildPromptSchemaText(kind, 'host');
                expect.ok('a group field appears when its option is on',
                    withGroup.includes('GATEKEY'));
                expect.ok('and not when it is off', !withoutGroup.includes('GATEKEY'));
                const special = await built({ probeName: 'X', gateKey: 'special', onlyWhenSpecial: 'yes' });
                expect('the gated field lands when the gate holds',
                    special?.flags?.probe?.extra, 'yes');

                const plain = await built({ probeName: 'X', gateKey: 'plain', onlyWhenSpecial: 'yes' });
                expect('and does not when it does not', plain?.flags?.probe?.extra, undefined);
            }
        },

        {
            id: 'guide-derivation',
            label: 'The authoring guide is derived, and states every rule',
            tier: 'headless',
            group: 'Step 5 - derived authoring output',
            note: 'The hand-written guide documented fields the parser never read and no rules at all.',
            run: async ({ expect }) => {
                const { manager, registry } = await loadDeclarations();
                const guide = manager.buildGuideText('item', 'weapon');
                const weapon = registry.getDeclaration('item', 'weapon');

                // The JSON block has to be usable as-is: a guide whose template does not
                // parse sends the reader to fix JSON rather than to author content.
                const block = guide.slice(guide.indexOf('{'), guide.lastIndexOf('}') + 1);
                let parsed = null;
                try {
                    parsed = JSON.parse(block);
                } catch (error) {
                    expect('the embedded template parses', error.message, 'no error');
                }
                expect.ok('the embedded template parses', parsed !== null);

                const authorable = manager.authorableFieldNames('item', 'weapon');
                const undocumented = authorable.filter(name => !guide.includes(`- ${name}`));
                expect('every authorable field is documented', undocumented, []);

                // The point of deriving it: the guide and the validator cannot disagree,
                // because both sentences come from the same rule.
                const rules = await import(`${MODULE_PATH}/manager-declaration-rules.js`);
                const missing = rules.ruleSentences(weapon).filter(one => !guide.includes(one));
                expect('every rule sentence appears in the guide', missing, []);

                expect.ok('required fields are marked', guide.includes('itemName (required'));
                expect.ok('key aliases are stated', guide.includes('also accepts: name'));
                expect.ok('allowed values are listed', guide.includes('one of: common'));
            }
        },

        {
            id: 'window-routes-to-derived',
            label: 'The import window asks the declaration, not the old builder',
            tier: 'headless',
            group: 'Step 5 - derived authoring output',
            note: 'Routing is by declaration presence, the same rule construction uses.',
            run: async ({ expect }) => {
                const api = requireApi('importer');
                const kind = api.importer.getKind('item');
                expect.ok('the kind exposes a template builder',
                    typeof kind?.onBuildJsonTemplate === 'function');
                if (typeof kind?.onBuildJsonTemplate !== 'function') return;

                const text = await kind.onBuildJsonTemplate('weapon', {});
                const template = JSON.parse(text);
                // The shared builder emits one field set for all eight profiles. The
                // derived one emits what weapon reads, so the consumable uses block is
                // the tell for which one answered.
                expect.ok('the window received the derived template',
                    !('destroyOnEmpty' in template) && !('itemLimitedUses' in template));
                expect.ok('and it carries the profile own fields',
                    'weaponDamageFormula' in template);

                const guide = await kind.onBuildAuthoringGuide('weapon', {});
                expect.ok('the guide is derived too',
                    guide.includes('BLACKSMITH WEAPON AUTHORING GUIDE'));

                // An undeclared profile still reaches the kind's own builder, which is
                // what lets kinds move across one at a time.
                const undeclared = await kind.onBuildJsonTemplate('portrait', {});
                expect.ok('an undeclared profile falls back', typeof undeclared === 'string');
            }
        },

        {
            id: 'group-option-surfaces',
            label: 'A group option becomes a checkbox in the window',
            tier: 'headless',
            group: 'Step 5 - derived authoring output',
            note: 'Without it a group is gated by a control the user never sees.',
            run: async ({ expect }) => {
                const { registry } = await loadDeclarations();
                const api = requireApi('importer');
                const kind = api.importer.getKind('item');

                // Whatever a kind offers today, every registered group for that kind
                // must contribute its own gate. The first group worked only because
                // Blacksmith hardcoded a checkbox with a matching id.
                const groups = registry.listFieldGroups().filter(one => one.kind === 'item');
                expect.ok('the check is meaningful only with a group registered',
                    groups.length >= 0);

                const ids = new Set((kind.promptCheckboxes ?? []).map(one => one.id));
                const unsurfaced = groups
                    .map(one => one.option.id)
                    .filter(id => !ids.has(id));
                expect('every registered group option has a checkbox', unsurfaced, []);

                // Duplicate ids would render the same gate twice.
                const all = (kind.promptCheckboxes ?? []).map(one => one.id);
                expect('no option is offered twice', all.length, new Set(all).size);
            }
        },

        {
            id: 'actor-passthrough',
            label: 'Actor declares its envelope and passes the stat block through',
            tier: 'headless',
            group: 'Step 7 - Actor',
            note: 'Passthrough keeps every undeclared key; the envelope is consumed and removed.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-actor.js`);

                expect.ok('all three Actor profiles are declared',
                    registry.getDeclarationsForKind('actor').length === 3);
                for (const profile of ['npc', 'sidekick', 'character']) {
                    expect.ok(`${profile} is passthrough`,
                        registry.getDeclaration('actor', profile).form === 'passthrough');
                }

                // The whole point of passthrough: a stat block nobody declared has to
                // survive intact, and be reported as content rather than as noise.
                const statBlock = {
                    name: 'Harness Goblin', type: 'npc', img: 'icons/svg/mystery-man.svg',
                    system: { abilities: { str: { value: 8 } }, attributes: { hp: { value: 7, max: 7 } } },
                    effects: [], items: []
                };
                const shape = manager.validateEntry('actor', 'npc', statBlock);
                expect('a stat block validates clean', shape.errors, []);
                expect.ok('undeclared native keys are not reported as unknown',
                    !shape.warnings.some(one => one.code === 'UNKNOWN_FIELDS'));

                // Nested validation. Every one of these was declared before this step
                // and enforced by nothing: validation looked at the containing value
                // and never descended into it.
                const NESTED = [
                    { id: 'a role outside the list', entry: { name: 'A', sidekick: { role: 'wizard', level: 1 } },
                      code: 'VALUE_NOT_ALLOWED', path: 'sidekick.role' },
                    { id: 'a level above the bound', entry: { name: 'A', sidekick: { role: 'expert', level: 44 } },
                      code: 'VALUE_OUT_OF_RANGE', path: 'sidekick.level' },
                    { id: 'a missing nested requirement', entry: { name: 'A', sidekick: { role: 'expert' } },
                      code: 'REQUIRED_FIELD_MISSING', path: 'sidekick.level' }
                ];
                for (const testCase of NESTED) {
                    const result = manager.validateEntry('actor', 'sidekick', testCase.entry);
                    const found = result.errors.some(one => one.code === testCase.code && one.path === testCase.path);
                    if (!found) log(`${testCase.id}: got ${JSON.stringify(result.errors)}`);
                    expect.ok(`${testCase.id} is reported at its own path`, found);
                }
                expect('a sound sidekick block passes',
                    manager.validateEntry('actor', 'sidekick',
                        { name: 'A', sidekick: { role: 'expert', level: 3, spellcastingAbility: '' } }).errors, []);

                // Nesting reaches the other kinds too, which is why it is asserted here
                // rather than only on Actor: a Roll Table row is the same shape of claim.
                const row = manager.validateEntry('rolltable', 'text', {
                    tableName: 'Harness Nested',
                    results: [{ resultType: 'text', resultText: 'a' }, { resultType: 'nope', resultText: 'b' }]
                });
                expect.ok('a bad Roll Table row names its index',
                    row.errors.some(one => one.path === 'results[1].resultType'));

                // A declared vocabulary is canonical and matching it folds case, the
                // way every parser here already did.
                expect('a capitalised value matches its canonical form',
                    manager.validateEntry('rolltable', 'text', {
                        tableName: 'Harness Case',
                        results: [{ resultType: 'Text', resultText: 'a' }]
                    }).errors, []);

                const guide = manager.buildGuideText('actor', 'sidekick');
                expect.ok('the guide documents a nested field', guide.includes('sidekick.role'));
                expect.ok('the guide states a declared bound', guide.includes('1 to 20'));
                expect.ok('the guide does not claim undeclared keys are ignored',
                    guide.includes('kept as written'));
            }
        },

        {
            id: 'actor-construction',
            label: 'Actor construction consumes the envelope and keeps the rest',
            tier: 'interactive',
            group: 'Step 7 - Actor',
            note: 'Needs Foundry: construction resolves named content against the configured compendiums.',
            run: async ({ expect, log }) => {
                const { manager } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-actor.js`);

                const built = await manager.buildDocumentData('actor', 'sidekick', {
                    name: 'Harness Pip', type: 'sidekick',
                    sidekick: { role: 'expert', level: 3, baseCreature: 'Mastiff', baseStatBlock: '', spellcastingAbility: '' },
                    token: { name: 'Pip', actorLink: true },
                    system: { attributes: { proficiency: 2 } },
                    items: []
                });

                expect('the profile decides the Actor type', built.type, 'npc');
                expect('sidekick metadata lands in the module namespace',
                    built.flags?.['coffee-pub-blacksmith']?.sidekick?.role, 'expert');
                expect('a sidekick is marked important', built.system?.traits?.important, true);
                expect('the friendly token block becomes prototypeToken',
                    built.prototypeToken?.name, 'Pip');
                expect('the payload stat block survives',
                    built.system?.attributes?.proficiency, 2);

                // The envelope is CONSUMED, not copied. Leaving the authored key
                // behind would store `sidekick` and `token` on the Actor beside the
                // consumed form of themselves.
                for (const key of ['sidekick', 'token']) {
                    expect.ok(`${key} is removed from the document`, built[key] === undefined);
                }
                if (built.sidekick !== undefined) log(`sidekick survived as ${JSON.stringify(built.sidekick)}`);
            }
        },

        {
            id: 'shipped-fixtures-validate',
            label: 'Every shipped fixture validates against its declared profile',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'The check that would have caught the area fixture failing import after passing validate.',
            run: async ({ expect, log }) => {
                const { manager } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-journal.js`);
                await import(`${MODULE_PATH}/declarations/declaration-actor.js`);
                await import(`${MODULE_PATH}/declarations/declaration-rolltable.js`);

                // A fixture is a worked example we ship. One that does not validate is
                // either a broken example or a wrong declaration, and both are defects
                // -- but neither announces itself, because nothing imports the fixtures
                // except a person doing it by hand.
                //
                // This exists because the Area journal fixture passed Validate and then
                // failed Import: `blocks.area.narrative` is an OBJECT of three labelled
                // passages and the declaration called it a string. It went unnoticed
                // because the throwaway script that checked the other fixtures had no
                // journal mapping and skipped them silently.
                const FIXTURES = [
                    ['journal-import-area.json', 'journal', 'area'],
                    ['actor-import-npc.json', 'actor', 'npc'],
                    ['actor-import-sidekick.json', 'actor', 'sidekick'],
                    ['actor-import-character.json', 'actor', 'character'],
                    ['rolltable-import-simple.json', 'rolltable', 'text'],
                    ['item-import-loot.json', 'item', 'loot'],
                    ['item-import-weapon.json', 'item', 'weapon'],
                    ['item-import-equipment-passive.json', 'item', 'equipment'],
                    ['item-import-feature.json', 'item', 'feature'],
                    ['item-import-feature-save-area.json', 'item', 'feature'],
                    ['item-import-spell.json', 'item', 'spell']
                ];

                for (const [file, kind, profile] of FIXTURES) {
                    let payload;
                    try {
                        const response = await fetch(`${FIXTURE_PATH}/${file}`);
                        if (!response.ok) {
                            expect.ok(`${file} is readable`, false);
                            continue;
                        }
                        payload = await response.json();
                    } catch (error) {
                        expect.ok(`${file} is readable`, false);
                        log(`${file}: ${error.message}`);
                        continue;
                    }
                    const entry = Array.isArray(payload) ? payload[0] : payload;
                    const outcome = manager.validateEntry(kind, profile, entry);
                    if (outcome.errors.length) {
                        log(`${file}: ${outcome.errors.map(one => `${one.code} ${one.path}`).join(', ')}`);
                    }
                    expect(`${file} validates as ${kind}.${profile}`, outcome.errors, []);
                }
            }
        },

        {
            id: 'prompt-schema-depth',
            label: 'The generation prompt describes nested fields, bounds and aliases',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'The prompt is what a generator is TOLD the schema is; an undescribed field is never emitted.',
            run: async ({ expect }) => {
                const { manager } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-journal.js`);
                await import(`${MODULE_PATH}/declarations/declaration-actor.js`);

                // Three levels deep. This described only the top level, so every nested
                // shape in every profile was something the generator had to guess at.
                const area = manager.buildPromptSchemaText('journal', 'area');
                for (const path of ['BLOCKS.AREA.NARRATIVE.DESCRIPTION',
                                    'BLOCKS.CONVERSATIONS[].THEYKNOW',
                                    'BLOCKS.AREA.NARRATIVECARD.IMAGE']) {
                    expect.ok(`the prompt describes ${path}`, area.includes(path));
                }

                // A declared bound was stated in the guide and not in the prompt, so a
                // generator was never told it. Sidekick level is the case.
                const sidekick = manager.buildPromptSchemaText('actor', 'sidekick');
                expect.ok('the prompt states a declared bound', sidekick.includes('1 to 20'));

                // An accepted spelling is worth telling a generator about: it is what
                // stops a consumer's existing payload shape being treated as unknown.
                const encounter = manager.buildPromptSchemaText('journal', 'encounter');
                expect.ok('the prompt states an accepted spelling',
                    encounter.includes('Also accepted: scenelocation'));
            }
        },

        {
            id: 'journal-encounter-regent',
            label: 'Encounter accepts the spellings Regent emits instead of dropping them',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'Regent drives this profile through api.createJournalEntry, not the import window.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-journal.js`);

                expect.ok('encounter is declared', Boolean(registry.getDeclaration('journal', 'encounter')));

                // Every Regent encounter imported successfully with its whole breadcrumb
                // missing, because Blacksmith read none of these names anywhere. They are
                // `acceptsKeys` now, so the payload works unchanged and is REPORTED.
                const regent = manager.validateEntry('journal', 'encounter', {
                    journaltype: 'encounter', scenelocation: 'Moonsea', sceneparent: 'Phlan',
                    scenearea: 'Goblin Cave', scenetitle: 'Ambush', prepencounter: 'Goblin'
                });
                if (regent.errors.length) log(`unexpected: ${JSON.stringify(regent.errors)}`);
                expect('a Regent payload validates', regent.errors, []);
                expect('and all three spellings are reported',
                    regent.warnings.filter(one => one.code === 'DEPRECATED_KEY').length, 3);

                // `sceneenvironment` is deliberately NOT accepted: it is a HABITAT, which
                // is scene geography with its own vocabulary rather than a breadcrumb step.
                // Reporting it as unknown is the truth until the scene-geography write lands.
                const habitat = manager.validateEntry('journal', 'encounter',
                    { journaltype: 'encounter', sceneenvironment: 'Forest' });
                expect.ok('sceneenvironment is reported rather than silently mapped',
                    habitat.warnings.some(one => one.code === 'UNKNOWN_FIELDS'));

                // A nested shape must produce a WORKED element, not an empty array --
                // setting `example: []` beside declared `fields` silently defeats that,
                // which it did on three fields until this caught it.
                const template = manager.buildTemplateObject('journal', 'encounter');
                expect.ok('the template carries a worked card, not an empty array',
                    'cardtitle' in (template.sections?.[0]?.cards?.[0] ?? {}));
                const area = manager.buildTemplateObject('journal', 'area');
                expect.ok('and so does the area conversations block',
                    'theyknow' in (area.blocks?.conversations?.[0] ?? {}));
            }
        },

        {
            id: 'declaration-from-model',
            label: 'A declaration walked from a DataModel keeps every path',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'A shaped top-level field losing its path is a field dropped from every document.',
            run: async ({ expect, log }) => {
                const { declarationFromModel } =
                    await import(`${MODULE_PATH}/manager-declaration-from-model.js`);
                const field = (cls, options = {}) => ({ constructor: { name: cls }, ...options });
                const choices = (values) => Object.fromEntries(values.map(one => [one, one]));

                const schema = {
                    severity: field('StringField',
                        { required: true, blank: false, initial: 'minor', choices: choices(['minor', 'major']) }),
                    optional: field('StringField', { required: true, blank: true, initial: '' }),
                    damage: field('NumberField',
                        { required: true, integer: true, min: 0, max: 100, initial: 0 }),
                    treatmentdc: field('NumberField',
                        { required: false, integer: true, min: 1, initial: null, nullable: true }),
                    modifiers: field('ArrayField', { initial: [], element: field('SchemaField', {
                        fields: {
                            stat: field('StringField',
                                { required: true, blank: false, choices: choices(['attack', 'ac']) }),
                            value: field('NumberField',
                                { required: true, integer: true, min: -5, max: 5, initial: 0 })
                        }
                    }) })
                };

                const declaration = declarationFromModel(schema, {
                    kind: 'journal', id: 'walked', label: 'Walked', module: 'probe-module',
                    document: { documentName: 'JournalEntryPage', type: 'probe-module.thing' },
                    guidance: { severity: 'How bad it is.', 'modifiers.value': 'The bonus.' },
                    extraFields: [{ name: 'title', path: 'name', type: 'string', required: true }]
                });
                const by = Object.fromEntries(declaration.fields.map(one => [one.name, one]));

                // The path is decided by whether a field IS a nested child, never by
                // whether it HAS nested shape. Conflating the two cost `modifiers` its
                // path, so the importer had nowhere to write it and dropped it from
                // every document with no error -- caught by a consumer feeding real
                // schema output where the earlier tests had asserted only the children.
                expect('a shaped top-level field keeps its path', by.modifiers?.path, 'system.modifiers');
                expect.ok('and its children carry none',
                    by.modifiers?.fields?.every(one => one.path === undefined));

                expect('a plain field is prefixed once', by.severity?.path, 'system.severity');
                expect('choices become values', JSON.stringify(by.severity?.values), '["minor","major"]');
                expect('integer is detected from the field', by.damage?.type, 'integer');
                expect('bounds are lifted', `${by.damage?.min}-${by.damage?.max}`, '0-100');
                expect.ok('nullable with a null initial survives as a value, not an absence',
                    by.treatmentdc?.nullable === true && by.treatmentdc?.default === null);
                // `required` alone is not enough for a string: `blank: true` means an
                // empty value satisfies it, so it is not required in the authoring sense.
                expect.ok('required honours blank', by.severity?.required === true
                    && by.optional?.required === undefined);
                expect('guidance is keyed by dotted path', by.modifiers?.fields
                    ?.find(one => one.name === 'value')?.guidance, 'The bonus.');
                if (!by.title) log('extraFields missing from the walked declaration');
                expect('a module-supplied field comes first', declaration.fields[0]?.name, 'title');
            }
        },

        {
            id: 'journal-page-profile',
            label: 'A profile can build a PAGE and be filed into its container entry',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'The satellite shape: the entry is a category, each page is one record under it.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                const kind = `probe-page-${foundry.utils.randomID(6)}`;

                // A page with nowhere to go is built correctly, lands nowhere, and
                // reports success -- so both of these are rejected at REGISTRATION.
                const bare = {
                    kind, id: 'no-container', label: 'Probe', schemaVersion: 1, form: 'mapped',
                    document: { documentName: 'JournalEntryPage', type: 'coffee-pub-bibliosoph.injury' },
                    fields: [{ name: 'severity', path: 'system.severity', type: 'string' }]
                };
                let threw = '';
                try { registry.registerDeclaration(bare); } catch (error) { threw = error.message; }
                expect.ok('a page profile without containerNameFrom is rejected',
                    threw.includes('containerNameFrom'));

                threw = '';
                try {
                    registry.registerDeclaration({ ...bare, id: 'bad-container',
                        document: { ...bare.document, containerNameFrom: 'nope' } });
                } catch (error) { threw = error.message; }
                expect.ok('and one naming an undeclared field is rejected',
                    threw.includes('not a declared field'));

                registry.registerDeclaration({
                    kind, id: 'injury', label: 'Probe Injury', schemaVersion: 1, form: 'mapped',
                    module: 'coffee-pub-bibliosoph',
                    document: {
                        documentName: 'JournalEntryPage',
                        type: 'coffee-pub-bibliosoph.injury',
                        containerNameFrom: 'category'
                    },
                    fields: [
                        { name: 'title', path: 'name', type: 'string', required: true, example: 'Seared Flesh' },
                        { name: 'category', role: 'input', type: 'string', values: ['fire', 'cold'], example: 'fire' },
                        { name: 'severity', path: 'system.severity', type: 'string',
                          values: ['minor', 'major'], example: 'minor' },
                        // Null is the norm here and means "use the severity ladder". It must
                        // not become 0, which is what an omit-and-default would produce.
                        { name: 'treatmentdc', path: 'system.treatmentdc', type: 'integer',
                          nullable: true, default: null, min: 1 }
                    ]
                });

                const page = await manager.buildDocumentData(kind, 'injury',
                    { title: 'Seared Flesh', category: 'fire', severity: 'minor', treatmentdc: null });
                if (!page) log('nothing built');
                expect('the page carries the declared subtype', page?.type, 'coffee-pub-bibliosoph.injury');
                expect('a page-level path sets the page name', page?.name, 'Seared Flesh');
                // Paths are written VERBATIM. Prefixing would produce system.system.severity,
                // which does not throw -- it lands a page of defaults the owner then skips.
                expect('a system path lands verbatim', page?.system?.severity, 'minor');
                expect.ok('a nullable field stays null rather than defaulting to 0',
                    page?.system?.treatmentdc === null);
                expect.ok('and the profile builds a page, not an entry with no pages',
                    page?.pages === undefined);

                // The container NAME is produced by a named transform, not a casing
                // enum. Asserting that a second, unrelated transform is accepted is
                // what proves the mechanism is general rather than one consumer's need
                // wearing a general name.
                const named = (transform) => {
                    try {
                        registry.registerDeclaration({
                            kind, id: `fmt-${transform ?? 'none'}`, label: 'P', schemaVersion: 1,
                            form: 'mapped',
                            document: { documentName: 'JournalEntryPage', type: 'x.y',
                                        containerNameFrom: 'category',
                                        ...(transform ? { containerNameTransform: transform } : {}) },
                            fields: [{ name: 'category', role: 'input', type: 'string' },
                                     { name: 'title', path: 'name', type: 'string' }]
                        });
                        return null;
                    } catch (error) { return error.message; }
                };
                expect.ok('an unknown container transform is rejected by name',
                    (named('shouty') ?? '').includes('no transform named'));
                expect.ok('titleCase is accepted', named('titleCase') === null);
                expect.ok('and so is slug, an unrelated transform', named('slug') === null);
                expect.ok('omitting it is accepted, leaving the value untouched', named(null) === null);
            }
        },

        {
            id: 'journal-subtype-seam',
            label: 'A journal profile creates the page subtype it declares',
            tier: 'headless',
            group: 'Step 8 - Journal',
            note: 'The seam three siblings wait on: a module-owned JournalEntryPage subtype.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-journal.js`);

                expect.ok('both JSON journal profiles are declared',
                    registry.getDeclarationsForKind('journal').length >= 2);

                // Blacksmith's own profiles keep the default. A page with no declared
                // subtype must still be `text`, or every existing journal changes shape.
                const area = await manager.buildDocumentData('journal', 'area', {
                    journaltype: 'area', area: 'Harness Cave',
                    blocks: { area: { narrative: 'A damp cave.' } }
                });
                expect('an undeclared page type defaults to text', area.pages?.[0]?.type, 'text');
                expect.ok('and the page carries composed content',
                    typeof area.pages?.[0]?.text?.content === 'string' && area.pages[0].text.content.length > 0);

                // A satellite's shape: its own namespaced subtype. Foundry namespaces the
                // DECLARATION of a subtype, not its creation, which is why Blacksmith can
                // build one it does not own.
                const kind = `probe-journal-${foundry.utils.randomID(6)}`;
                registry.registerDeclaration({
                    kind, id: 'injury', label: 'Probe Injury', schemaVersion: 1, form: 'mapped',
                    module: 'coffee-pub-bibliosoph',
                    document: { documentName: 'JournalEntry', pageType: 'coffee-pub-bibliosoph.injury' },
                    derive: [],
                    fields: [
                        { name: 'severity', path: 'severity', type: 'string', required: true,
                          values: ['minor', 'moderate', 'severe'], example: 'minor' },
                        { name: 'odds', path: 'odds', type: 'integer', min: 1, default: 1, example: 1 }
                    ]
                });
                const declared = registry.getDeclaration(kind, 'injury');
                expect('the profile declares its page subtype',
                    declared?.document?.pageType, 'coffee-pub-bibliosoph.injury');

                const shape = manager.validateEntry(kind, 'injury', { severity: 'Severe', odds: 3 });
                if (shape.errors.length) log(`unexpected: ${JSON.stringify(shape.errors)}`);
                expect('a foreign profile validates through the public path', shape.errors, []);

                const rejected = manager.validateEntry(kind, 'injury', { severity: 'fatal', odds: 0 });
                expect.ok('and its own vocabulary and bounds are enforced',
                    rejected.errors.some(one => one.code === 'VALUE_NOT_ALLOWED')
                    && rejected.errors.some(one => one.code === 'VALUE_OUT_OF_RANGE'));
            }
        },

        {
            id: 'rolltable-parity',
            label: 'Roll Table construction matches the parser it replaces',
            tier: 'headless',
            group: 'Step 6 - Roll Table',
            note: 'Ordered ranges and the derived die are the whole risk here.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                await import(`${MODULE_PATH}/declarations/declaration-rolltable.js`);
                const parser = await import(`${MODULE_PATH}/parsers/parse-rolltable.js`);

                expect.ok('both Roll Table profiles are declared',
                    registry.getDeclarationsForKind('rolltable').length === 2);

                const CASES = [
                    {
                        id: 'rows numbered in order',
                        profile: 'text',
                        entry: {
                            tableName: 'Harness Order', results: [
                                { resultType: 'text', resultText: 'first' },
                                { resultType: 'text', resultText: 'second' },
                                { resultType: 'text', resultText: 'third' }
                            ]
                        }
                    },
                    {
                        id: 'weights widening the ranges',
                        profile: 'text',
                        entry: {
                            tableName: 'Harness Weights', drawWithReplacement: false,
                            displayRollFormula: true,
                            results: [
                                { resultType: 'text', resultText: 'common', resultWeight: 5 },
                                { resultType: 'text', resultText: 'rare', resultWeight: 1 }
                            ]
                        }
                    },
                    {
                        id: 'explicit ranges honoured',
                        profile: 'text',
                        entry: {
                            tableName: 'Harness Explicit', results: [
                                { resultType: 'text', resultText: 'low', resultRangeLower: 1, resultRangeUpper: 10 },
                                { resultType: 'text', resultText: 'high', resultRangeLower: 11, resultRangeUpper: 20 }
                            ]
                        }
                    }
                ];

                for (const testCase of CASES) {
                    const derived = await manager.buildDocumentData('rolltable', testCase.profile, testCase.entry);
                    const current = await parser.parseTableToFoundry(testCase.entry);
                    const keys = [...new Set([...Object.keys(derived), ...Object.keys(current)])].sort();
                    for (const key of keys) {
                        if (JSON.stringify(derived[key]) !== JSON.stringify(current[key])) {
                            log(`${testCase.id} differs at ${key}:`);
                            log(`   derived ${JSON.stringify(derived[key])}`);
                            log(`   current ${JSON.stringify(current[key])}`);
                        }
                    }
                    expect(`${testCase.id}: derived construction equals the parser`, derived, current);
                }

                // The die follows the rows. A formula that disagrees with the ranges
                // produces a table that cannot roll some of its own results.
                const weighted = await manager.buildDocumentData('rolltable', 'text', CASES[1].entry);
                expect('the die covers the widest range', weighted.formula, '1d6');

                // Overlapping ranges are refused rather than silently producing a
                // table where one number rolls two things.
                let overlapped = null;
                try {
                    await manager.buildDocumentData('rolltable', 'text', {
                        tableName: 'Harness Overlap', results: [
                            { resultType: 'text', resultText: 'a', resultRangeLower: 1, resultRangeUpper: 5 },
                            { resultType: 'text', resultText: 'b', resultRangeLower: 4, resultRangeUpper: 8 }
                        ]
                    });
                } catch (error) {
                    overlapped = error;
                }
                expect.ok('overlapping ranges are refused', overlapped !== null);
            }
        },

        {
            id: 'template-diff',
            label: 'Diff the derived loot template against the current hand-built one',
            tier: 'headless',
            group: 'Step 1 - template derivation',
            note: 'Differences are expected and listed. This check fails only on an UNLISTED difference.',
            run: async ({ expect, log }) => {
                const { manager, registry } = await loadDeclarations();
                const legacy = await import(`${MODULE_PATH}/registry-json-import-items.js`);
                const profiles = registry.getDeclarationsForKind('item').map(one => one.id);
                expect.ok('at least one Item profile is declared', profiles.length > 0);

                for (const profile of profiles) {
                const derived = manager.buildTemplateObject('item', profile);
                const current = JSON.parse(await legacy.buildItemJsonTemplate(profile));

                // Fields the shared template emits for every profile that the loot parser
                // never reads. Removing them is the point of declaring per profile, so
                // they are listed here rather than treated as a regression.
                // `buildItemJsonTemplate` emits ONE field set for all eight Item
                // profiles, so every profile is handed fields its parser never reads.
                // These are the ones no profile uses -- the consumable limited-uses
                // block, the nuance field, and two hints belonging to image generation
                // rather than to import.
                const DROPPED_BY_EVERY_PROFILE = [
                    'itemSubTypeNuance', 'itemLimitedUses', 'limitedUsesSpent',
                    'limitedUsesMax', 'destroyOnEmpty', 'itemRecoveryPeriod',
                    'itemImageTerms', 'itemImageNuance'
                ];
                // Beyond that, a profile drops what it does not declare. Weapon keeps
                // both extras; equipment keeps attunement; the rest keep neither.
                // Feature and Spell are not physical items: no rarity, weight, price,
                // quantity, identified state or subtype. The shared template hands them
                // all of it anyway.
                const NOT_A_PHYSICAL_ITEM = [
                    'itemDescriptionUnidentified', 'itemSubType', 'itemRarity', 'itemQuantity',
                    'itemWeight', 'itemPrice', 'itemIdentified', 'itemIsMagical',
                    'magicalAttunementRequired'
                ];
                const ALSO_DROPPED = {
                    loot: ['magicalAttunementRequired', 'activities'],
                    weapon: [],
                    equipment: ['activities'],
                    tool: ['magicalAttunementRequired', 'activities'],
                    container: ['magicalAttunementRequired', 'activities'],
                    feature: NOT_A_PHYSICAL_ITEM,
                    spell: NOT_A_PHYSICAL_ITEM,
                    // itemLimitedUses is not gone: it is a key alias of limitedUsesMax,
                    // so it is accepted on input and not offered as its own field.
                    consumable: ['itemLimitedUses']
                };

                // Fields the derived template ADDS. Every one is a field the parser has
                // always read and the shared template never offered, so an author had no
                // way to supply it. Additions are listed as deliberately as drops.
                const KNOWN_ADDED = {
                    // _featureData and _spellData both clone flat.effects.
                    feature: ['effects'],
                    // Plus the three uses keys _spellData actually reads. The template
                    // offered itemLimitedUses / limitedUsesSpent / limitedUsesMax /
                    // itemRecoveryPeriod instead, which the spell parser ignores entirely
                    // -- so limited uses on a spell silently did nothing.
                    spell: ['effects', 'spellSourceClass', 'usesMax', 'usesSpent', 'recoveryPeriod'],
                    // recoveryAmount is the recharge formula the parser reads. effects is
                    // new behaviour: the old inline activity builder never passed an
                    // effects array, so a consumable's activities could not apply effects.
                    consumable: ['recoveryAmount', 'effects']
                };
                const allowedDrops = (profileId) => [
                    ...DROPPED_BY_EVERY_PROFILE, ...(ALSO_DROPPED[profileId] ?? [])
                ];

                const derivedKeys = Object.keys(derived);
                const currentKeys = Object.keys(current);

                const dropped = currentKeys.filter(key => !derivedKeys.includes(key));
                const added = derivedKeys.filter(key => !currentKeys.includes(key));

                log(`${profile} dropped: ${dropped.join(', ') || 'none'}`);
                log(`${profile} added:   ${added.join(', ') || 'none'}`);

                expect(`${profile}: every dropped field is a listed, deliberate drop`,
                    dropped.filter(key => !allowedDrops(profile).includes(key)), []);
                expect(`${profile}: every added field is a listed, deliberate addition`,
                    added.filter(key => !(KNOWN_ADDED[profile] ?? []).includes(key)), []);

                // Listed starter-value differences, per profile. A value difference is a
                // change to what an author is handed, so it is named here or it fails.
                const KNOWN_VALUE_DIFFS = {
                    // null is a poor authoring prompt for "leave blank", and the parser
                    // reads null and '' identically.
                    container: ['itemSubType'],
                    // The shared builder gave Feature and Spell a worked example activity
                    // and Consumable an empty array, though all three accept activities.
                    // The derived example comes from the declared activity shape, so it
                    // cannot drift from what validation accepts.
                    consumable: ['activities'],
                    feature: ['activities'],
                    spell: ['activities']
                };

                // itemSource is excluded: the current path substitutes the campaign name
                // into its placeholder after stringifying, so the two differ by delivery
                // rather than by shape. Placeholder substitution stays a delivery step.
                const allowedDiffs = new Set(['itemSource', ...(KNOWN_VALUE_DIFFS[profile] ?? [])]);
                const differing = derivedKeys
                    .filter(key => currentKeys.includes(key) && !allowedDiffs.has(key))
                    .filter(key => JSON.stringify(derived[key]) !== JSON.stringify(current[key]));
                for (const key of differing) {
                    log(`${profile} value differs at ${key}: derived ${JSON.stringify(derived[key])}`
                        + ` vs current ${JSON.stringify(current[key])}`);
                }
                expect(`${profile}: shared fields carry identical starter values`, differing, []);
                }
            }
        }
    ]
};
