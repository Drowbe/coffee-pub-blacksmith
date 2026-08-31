// ==================================================================
// ===== SUITE: api.geography =======================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-geography.md
// Implementation: scripts/manager-geography.js, scripts/ui-scene-geography.js
//
// Three things carry the design and are therefore asserted hardest:
//
//   1. RESOLUTION ORDER. A scene's own value wins; an empty field inherits
//      the world default rather than reading as a deliberate blank. Get this
//      backwards and the world settings silently become live state again,
//      which is the exact thing this feature exists to end.
//
//   2. THE NULL FILTER. A checkbox group submits one entry per box with
//      `null` for each unticked one. `String(null)` is "null", which is
//      truthy, so a filter(Boolean) normalizer stores twelve literal "null"
//      strings that look populated and match nothing. Asserted directly
//      against a raw form-shaped array, because this is the failure mode.
//
//   3. ABSENCE VS NEUTRAL for reputation. Missing is null, 0 is neutral,
//      and they must never collapse into each other.
//
// The checks WRITE to a scene, so each one restores what it found. A suite
// that leaves geography on the GM's scene is worse than no suite.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/** A scene to write to, preferring the viewed one. */
function testScene() {
    return canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.contents?.[0] ?? null;
}

/** Run `fn` with the scene's geography flag restored afterwards, whatever happens. */
async function withRestoredFlag(scene, fn) {
    const before = foundry.utils.deepClone(scene.getFlag(MODULE_ID, 'geography') ?? null);
    try {
        return await fn();
    } finally {
        if (before === null) await scene.unsetFlag(MODULE_ID, 'geography');
        else await scene.setFlag(MODULE_ID, 'geography', before);
    }
}

export default {
    id: 'geography',
    label: 'Scene Geography',
    icon: 'fa-solid fa-mountain-sun',

    settings: () => {
        const api = game.modules.get(MODULE_ID)?.api;
        if (!api?.geography) return [settingRow('api.geography', 'MISSING')];
        const scene = testScene();
        const defaults = api.geography.get(null);
        return [
            settingRow('api.geography', 'available'),
            settingRow('Test scene', scene?.name ?? 'NONE — every check is skipped'),
            settingRow('World defaults',
                Object.values(defaults).filter(Boolean).join(' > ') || 'all four empty',
                'the seed for a scene with no flag'),
            settingRow('Vocabulary', `${api.geography.ENVIRONMENT_KEYS.length} environments`,
                api.geography.ENVIRONMENT_KEYS.join(', ')),
            settingRow('This scene', scene ? (api.geography.getBreadcrumb(scene) || 'inherits everything') : '-')
        ];
    },

    checks: [
        {
            id: 'surface',
            tier: 'headless',
            group: 'Contract',
            label: 'The geography surface is present and shaped as documented',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                for (const name of ['get', 'getSceneContext', 'getEnvironments', 'getBreadcrumb', 'set', 'clear', 'normalizeEnvironments']) {
                    expect(`api.geography.${name} is a function`, typeof api.geography[name], 'function');
                }
                expect('ENVIRONMENTS has twelve entries', api.geography.ENVIRONMENTS.length, 12);
                expect('every entry is {key, label}',
                    api.geography.ENVIRONMENTS.every(e => typeof e.key === 'string' && typeof e.label === 'string'), true);
                expect('keys are lowercase',
                    api.geography.ENVIRONMENTS.every(e => e.key === e.key.toLowerCase()), true);
                expect('labels are not merely the keys',
                    api.geography.ENVIRONMENTS.some(e => e.label !== e.key), true);
                expect('ENVIRONMENT_KEYS matches ENVIRONMENTS',
                    api.geography.ENVIRONMENT_KEYS, api.geography.ENVIRONMENTS.map(e => e.key));
            }
        },
        {
            id: 'resolution',
            tier: 'headless',
            group: 'Resolution order',
            label: 'Scene value wins; empty inherits the world default',
            note: 'The whole seed model. If this inverts, the world settings are live state again.',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                const scene = testScene();
                if (!scene) return expect.ok('a scene exists', false);

                await withRestoredFlag(scene, async () => {
                    const defaults = api.geography.get(null);

                    await api.geography.clear(scene);
                    expect('with no flag, every field is the world default', api.geography.get(scene), defaults);

                    await api.geography.set(scene, { realm: 'Harness Realm' });
                    const resolved = api.geography.get(scene);
                    expect('the scene value wins for the field it sets', resolved.realm, 'Harness Realm');
                    expect('the other fields still inherit', resolved.region, defaults.region);

                    await api.geography.set(scene, { realm: '' });
                    expect('clearing a field inherits again rather than reading as blank',
                        api.geography.get(scene).realm, defaults.realm);
                });
            }
        },
        {
            id: 'environment-nulls',
            tier: 'headless',
            group: 'Environment',
            label: 'A checkbox group\'s nulls are dropped, not stringified',
            note: 'The raw array from an unticked checkbox group is [null, null, ...]. "null" is truthy.',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                const normalize = api.geography.normalizeEnvironments;

                // Exactly what FormDataExtended submits for twelve boxes with one ticked.
                const formShaped = [null, null, null, null, null, null, 'forest', null, null, null, null, null];
                expect('one ticked box out of twelve yields one environment', normalize(formShaped), ['forest']);
                expect('all unticked yields empty', normalize(new Array(12).fill(null)), []);
                expect('no "null" string ever survives',
                    normalize(new Array(12).fill(null)).includes('null'), false);

                expect('unknown values are dropped', normalize(['forest', 'feywild']), ['forest']);
                expect('case is normalised', normalize(['FOREST', 'Urban']), ['forest', 'urban']);
                expect('duplicates collapse', normalize(['forest', 'forest']), ['forest']);
                expect('a comma string is accepted', normalize('forest,urban'), ['forest', 'urban']);
                expect('order is vocabulary order, not tick order', normalize(['urban', 'forest']), ['forest', 'urban']);
                expect('garbage yields empty', normalize(null), []);
            }
        },
        {
            id: 'environment-roundtrip',
            tier: 'headless',
            group: 'Environment',
            label: 'Environments survive a write and read back canonical',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                const scene = testScene();
                if (!scene) return expect.ok('a scene exists', false);

                await withRestoredFlag(scene, async () => {
                    await api.geography.set(scene, { environment: ['FOREST', null, 'not-a-biome', 'urban'] });
                    expect('stored canonical, filtered, ordered',
                        api.geography.getEnvironments(scene), ['forest', 'urban']);
                });
            }
        },
        {
            id: 'reputation',
            tier: 'headless',
            group: 'Reputation',
            label: 'Unset is null and 0 is neutral, and they never collapse',
            note: 'The distinction the old per-scene storage could not make.',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                const scene = testScene();
                if (!scene) return expect.ok('a scene exists', false);

                await withRestoredFlag(scene, async () => {
                    await api.geography.clear(scene);
                    expect('never set reads as null', api.geography.getSceneContext(scene).reputation, null);

                    await api.geography.set(scene, { reputation: 0 });
                    expect('explicit 0 reads as 0', api.geography.getSceneContext(scene).reputation, 0);

                    await api.geography.set(scene, { reputation: 250 });
                    expect('above scale clamps to 100', api.geography.getSceneContext(scene).reputation, 100);

                    await api.geography.set(scene, { reputation: -250 });
                    expect('below scale clamps to -100', api.geography.getSceneContext(scene).reputation, -100);
                });
            }
        },
        {
            id: 'context-shape',
            tier: 'headless',
            group: 'Contract',
            label: 'getSceneContext returns every documented key',
            run: async ({ expect }) => {
                const api = requireApi('geography');
                const scene = testScene();
                if (!scene) return expect.ok('a scene exists', false);
                const context = api.geography.getSceneContext(scene);
                expect('exactly the documented keys', Object.keys(context).sort(),
                    ['area', 'environment', 'locationUuid', 'realm', 'region', 'reputation', 'site']);
                expect('environment is always an array', Array.isArray(context.environment), true);
            }
        },
        {
            id: 'tab-registered',
            tier: 'headless',
            group: 'Contract',
            label: 'The Geography tab went through the public registration path',
            note: 'Consumer zero: Blacksmith must not inject its own tab by a private route.',
            run: async ({ expect }) => {
                const api = requireApi('geography', 'isSceneConfigTabRegistered');
                expect('the tab is in the public registry',
                    api.isSceneConfigTabRegistered(`${MODULE_ID}-geography`), true);
                const tab = api.getRegisteredSceneConfigTabs().get(`${MODULE_ID}-geography`);
                expect('and it is owned by Blacksmith', tab?.moduleId, MODULE_ID);
            }
        },
        {
            id: 'sheet',
            tier: 'interactive',
            group: 'Injection',
            label: 'Open Scene Config and check the Geography tab saves',
            run: async ({ log }) => {
                const scene = testScene();
                if (!scene) return log('No scene available.');
                await scene.sheet.render(true);
                log(`Opened Scene Config for "${scene.name}".`);
                log('CHECK: a Geography tab is present, laid out like the core tabs.');
                log('CHECK: empty fields show the campaign default as placeholder text, not as a value.');
                log('CHECK: the twelve environments render as a grid, not a tall stack.');
                log('CHECK: type a Realm, tick two environments, Save. Reopen — both persisted.');
                log('CHECK: clear the Realm and Save. It falls back to the campaign default placeholder.');
                log('CHECK: run the headless checks again afterwards; they must still pass on a scene with real data.');
            }
        }
    ]
};
