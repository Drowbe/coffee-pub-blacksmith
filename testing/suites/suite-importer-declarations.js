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
                    'listDeclarations', 'getJsonTemplate', 'getJsonTemplateObject'
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
            id: 'template-diff',
            label: 'Diff the derived loot template against the current hand-built one',
            tier: 'headless',
            group: 'Step 1 - template derivation',
            note: 'Differences are expected and listed. This check fails only on an UNLISTED difference.',
            run: async ({ expect, log }) => {
                const { manager } = await loadDeclarations();
                const legacy = await import(`${MODULE_PATH}/registry-json-import-items.js`);

                const derived = manager.buildTemplateObject('item', 'loot');
                const current = JSON.parse(await legacy.buildItemJsonTemplate('loot'));

                // Fields the shared template emits for every profile that the loot parser
                // never reads. Removing them is the point of declaring per profile, so
                // they are listed here rather than treated as a regression.
                const KNOWN_DROPPED = [
                    'itemSubTypeNuance', 'magicalAttunementRequired', 'itemLimitedUses',
                    'limitedUsesSpent', 'limitedUsesMax', 'destroyOnEmpty',
                    'itemRecoveryPeriod', 'activities', 'itemImageTerms', 'itemImageNuance'
                ];

                const derivedKeys = Object.keys(derived);
                const currentKeys = Object.keys(current);

                const dropped = currentKeys.filter(key => !derivedKeys.includes(key));
                const added = derivedKeys.filter(key => !currentKeys.includes(key));

                log(`dropped: ${dropped.join(', ') || 'none'}`);
                log(`added:   ${added.join(', ') || 'none'}`);

                expect('every dropped field is a listed, deliberate drop',
                    dropped.filter(key => !KNOWN_DROPPED.includes(key)), []);
                expect('the derived template adds no field the current one lacks', added, []);

                // itemSource is excluded: the current path substitutes the campaign name
                // into its placeholder after stringifying, so the two differ by delivery
                // rather than by shape. Placeholder substitution stays a delivery step.
                const differing = derivedKeys
                    .filter(key => currentKeys.includes(key) && key !== 'itemSource')
                    .filter(key => JSON.stringify(derived[key]) !== JSON.stringify(current[key]));
                for (const key of differing) {
                    log(`value differs at ${key}: derived ${JSON.stringify(derived[key])}`
                        + ` vs current ${JSON.stringify(current[key])}`);
                }
                expect('shared fields carry identical starter values', differing, []);
            }
        }
    ]
};
