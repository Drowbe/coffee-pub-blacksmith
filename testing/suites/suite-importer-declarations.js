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
const FIXTURE_PATH = '/modules/coffee-pub-blacksmith/testing/data/import-json';

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
                    'registerFieldGroup', 'getFieldGroupsFor', 'listFieldGroups'
                ]) {
                    expect.ok(`api.importer.${method} is a function`,
                        typeof api.importer[method] === 'function');
                }
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

                // impliedBy is bidirectional: either half alone is a contradiction.
                expect('magical without the magical property fails',
                    code({ itemIsMagical: true }), 'RULE_IMPLIEDBY');
                expect('the magical property without the flag fails',
                    code({ weaponProperties: ['magical'] }), 'RULE_IMPLIEDBY');
                expect('both together are clean',
                    code({ itemIsMagical: true, weaponProperties: ['magical'] }), 'success');

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

                const built = async (entry) => manager.buildDocumentData(kind, 'host', entry);
                const special = await built({ probeName: 'X', gateKey: 'special', onlyWhenSpecial: 'yes' });
                expect('the gated field lands when the gate holds',
                    special?.flags?.probe?.extra, 'yes');

                const plain = await built({ probeName: 'X', gateKey: 'plain', onlyWhenSpecial: 'yes' });
                expect('and does not when it does not', plain?.flags?.probe?.extra, undefined);
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
