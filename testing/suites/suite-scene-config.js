// ==================================================================
// ===== SUITE: api.registerSceneConfigTab ==========================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-scene-config.md
// Implementation: scripts/manager-scene-config.js
//
// The headless checks cover the REGISTRY only — validation, ownership, and
// the fact that a bad registration is refused rather than stored. None of
// that needs a sheet.
//
// The injection itself cannot be asserted here, because the failure modes
// are all "the DOM looked right once and wrong on the second render": a
// duplicated panel, a tab lost to a render race, a panel appended to a
// detached node. Those need a real sheet opened, closed, and reopened, so
// they are an interactive check that registers a throwaway tab and tells
// the reader what to look at.
//
// Every check cleans up after itself. A suite that leaves a tab registered
// would put a "Harness" tab on every scene in the world until reload.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

/** Ids used by the checks. Namespaced so a leak is obvious in the registry. */
const TEST_TAB = 'blacksmith-harness-scene-tab';
const OTHER_MODULE = 'blacksmith-harness-not-a-real-module';

/** Remove anything this suite may have left behind. */
function cleanup(api) {
    for (const id of [TEST_TAB, `${TEST_TAB}-2`]) {
        try { api.unregisterSceneConfigTab(id); } catch { /* never fatal in cleanup */ }
    }
}

export default {
    id: 'scene-config',
    label: 'Scene Config Tabs',
    icon: 'fa-solid fa-map',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        if (!api) return [settingRow('api', 'MISSING')];
        let registered = [];
        try {
            registered = Array.from(api.getRegisteredSceneConfigTabs?.()?.values() ?? []);
        } catch (error) {
            registered = [];
        }
        return [
            settingRow('api.registerSceneConfigTab',
                typeof api.registerSceneConfigTab === 'function' ? 'available' : 'MISSING'),
            settingRow('Registered tabs', registered.length ? String(registered.length) : 'none',
                registered.map(t => `${t.id} (${t.moduleId})`).join(', ') || 'no module has registered a tab yet')
        ];
    },

    checks: [
        {
            id: 'surface',
            tier: 'headless',
            group: 'Contract',
            label: 'All four methods are on the API and callable',
            note: 'They are statically imported, so they must be real functions rather than null placeholders.',
            run: async ({ expect }) => {
                const api = requireApi('registerSceneConfigTab');
                for (const name of ['registerSceneConfigTab', 'unregisterSceneConfigTab',
                                    'getRegisteredSceneConfigTabs', 'isSceneConfigTabRegistered']) {
                    expect(`api.${name} is a function`, typeof api[name], 'function');
                }
            }
        },
        {
            id: 'roundtrip',
            tier: 'headless',
            group: 'Contract',
            label: 'Register, look up, unregister',
            run: async ({ expect }) => {
                const api = requireApi('registerSceneConfigTab');
                cleanup(api);
                try {
                    const ok = api.registerSceneConfigTab(TEST_TAB, {
                        label: 'Harness',
                        icon: 'fa-solid fa-flask',
                        moduleId: 'coffee-pub-blacksmith',
                        render: () => '<p>harness</p>'
                    });
                    expect('register returns true', ok, true);
                    expect('isSceneConfigTabRegistered agrees', api.isSceneConfigTabRegistered(TEST_TAB), true);

                    const stored = api.getRegisteredSceneConfigTabs().get(TEST_TAB);
                    expect('stored label survives', stored?.label, 'Harness');
                    expect('stored moduleId survives', stored?.moduleId, 'coffee-pub-blacksmith');

                    expect('unregister returns true', api.unregisterSceneConfigTab(TEST_TAB), true);
                    expect('gone afterwards', api.isSceneConfigTabRegistered(TEST_TAB), false);
                    expect('unregistering twice returns false', api.unregisterSceneConfigTab(TEST_TAB), false);
                } finally {
                    cleanup(api);
                }
            }
        },
        {
            id: 'registry-is-a-copy',
            tier: 'headless',
            group: 'Contract',
            label: 'getRegisteredSceneConfigTabs returns a copy, not the live registry',
            note: 'A caller mutating the returned Map must not be able to unregister another module\'s tab.',
            run: async ({ expect }) => {
                const api = requireApi('registerSceneConfigTab');
                cleanup(api);
                try {
                    api.registerSceneConfigTab(TEST_TAB, { label: 'Harness', render: () => '' });
                    const copy = api.getRegisteredSceneConfigTabs();
                    copy.delete(TEST_TAB);
                    expect('deleting from the copy leaves the registry intact',
                        api.isSceneConfigTabRegistered(TEST_TAB), true);
                } finally {
                    cleanup(api);
                }
            }
        },
        {
            id: 'validation',
            tier: 'headless',
            group: 'Validation',
            label: 'A registration that could not produce a tab is refused',
            note: 'Each of these would otherwise be stored, return true, and fail silently on the sheet.',
            run: async ({ expect, log }) => {
                const api = requireApi('registerSceneConfigTab');
                cleanup(api);
                try {
                    const cases = [
                        ['empty tabId', () => api.registerSceneConfigTab('', { label: 'x', render: () => '' })],
                        ['non-string tabId', () => api.registerSceneConfigTab(42, { label: 'x', render: () => '' })],
                        ['missing tabData', () => api.registerSceneConfigTab(TEST_TAB)],
                        ['render not a function', () => api.registerSceneConfigTab(TEST_TAB, { label: 'x', render: 'nope' })],
                        ['missing render', () => api.registerSceneConfigTab(TEST_TAB, { label: 'x' })],
                        ['missing label', () => api.registerSceneConfigTab(TEST_TAB, { render: () => '' })],
                        ['empty label', () => api.registerSceneConfigTab(TEST_TAB, { label: '', render: () => '' })]
                    ];
                    for (const [name, fn] of cases) {
                        expect(`${name} returns false`, fn(), false);
                    }
                    expect('nothing was stored by any rejected call',
                        api.isSceneConfigTabRegistered(TEST_TAB), false);
                    log('Each rejection also logs to console; that is the intended way a consumer finds out.');
                } finally {
                    cleanup(api);
                }
            }
        },
        {
            id: 'ownership',
            tier: 'headless',
            group: 'Validation',
            label: 'A second module cannot take an id, but the owner can re-register',
            note: 'A silent overwrite would make the first tab vanish while its call still reported success.',
            run: async ({ expect }) => {
                const api = requireApi('registerSceneConfigTab');
                cleanup(api);
                try {
                    api.registerSceneConfigTab(TEST_TAB, {
                        label: 'First', moduleId: 'coffee-pub-blacksmith', render: () => ''
                    });

                    const stolen = api.registerSceneConfigTab(TEST_TAB, {
                        label: 'Second', moduleId: OTHER_MODULE, render: () => ''
                    });
                    expect('another module is refused', stolen, false);
                    expect('the original owner still holds it',
                        api.getRegisteredSceneConfigTabs().get(TEST_TAB)?.label, 'First');

                    const again = api.registerSceneConfigTab(TEST_TAB, {
                        label: 'Updated', moduleId: 'coffee-pub-blacksmith', render: () => ''
                    });
                    expect('the owner may re-register', again, true);
                    expect('re-registration replaces the entry',
                        api.getRegisteredSceneConfigTabs().get(TEST_TAB)?.label, 'Updated');
                } finally {
                    cleanup(api);
                }
            }
        },
        {
            id: 'injection',
            tier: 'interactive',
            group: 'Injection',
            label: 'The tab appears exactly once, and survives re-rendering',
            note: 'This is the part no headless check can cover — every failure mode is a second render.',
            run: async ({ expect, log }) => {
                const api = requireApi('registerSceneConfigTab');

                const scene = canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.contents?.[0] ?? null;
                if (!scene) return expect.ok('a scene exists to open', false);

                // Runs as a toggle rather than register-inspect-cleanup, because cleaning up in the
                // same run would remove the tabs before anyone could look at them — and looking is
                // the entire check. Run once to add, look, run again to remove.
                if (api.isSceneConfigTabRegistered(TEST_TAB)) {
                    cleanup(api);
                    await scene.sheet.render(true);
                    log('Harness tabs unregistered and the sheet re-rendered.');
                    log('CHECK: neither "Harness" nor "Second" is in the tab strip any more.');
                    return;
                }

                api.registerSceneConfigTab(TEST_TAB, {
                    label: 'Harness',
                    icon: 'fa-solid fa-flask',
                    moduleId: 'coffee-pub-blacksmith',
                    render: (s) => `<div class="form-group"><label>Scene</label><p>${s?.name ?? '(none)'}</p></div>`
                });
                // Deliberately short and icon-bearing, like a core tab. An earlier version used
                // 'Harness Two' with no icon to prove the icon is optional, and it wrapped: the
                // label is wider than the tab, so with nothing above it the first line sits on the
                // icon row and reads as broken. The API is fine; the fixture was not representative.
                api.registerSceneConfigTab(`${TEST_TAB}-2`, {
                    label: 'Second',
                    icon: 'fa-solid fa-vial',
                    moduleId: 'coffee-pub-blacksmith',
                    render: () => '<p>Second tab, to prove two coexist and save independently.</p>'
                });

                await scene.sheet.render(true);

                log(`Opened Scene Config for "${scene.name}" with two throwaway tabs registered.`);
                log('CHECK: both "Harness" and "Second" appear in the tab strip, once each, laid out like core tabs.');
                log('CHECK: click each — the panel shows its own content, and the scene name is correct.');
                log('CHECK: switch to another tab and back; content is still there.');
                log('CHECK: close and reopen the sheet five times. Still one of each, never two.');
                log('CHECK: change something on a core tab and Save. The sheet saves with no error.');
                log('THEN: run this check a second time to unregister both and confirm they disappear.');
            }
        }
    ]
};
