// ==================================================================
// ===== SUITE: api.entityList ======================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste utilities/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-entity-list.md
// Implementation: scripts/api-entity-list.js
// ==================================================================

import { requireApi, settingRow, stylesheetContains } from './harness-lib.js';

const fixtures = () => ([
    { id: 'a', name: 'Alice', img: 'icons/svg/mystery-man.svg', type: 'Fighter', badges: [{ label: 'Lv 5' }] },
    { id: 'b', name: 'Bob', img: 'icons/svg/mystery-man.svg', type: 'Wizard', payload: { keep: 'me' } },
    { id: 'c', name: 'Carol', img: 'icons/svg/mystery-man.svg', disabled: true, disabledReason: 'Already owns this item' }
]);

export default {
    id: 'entity-list',
    label: 'Entity List',
    icon: 'fa-solid fa-list-check',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        return [
            settingRow('api.entityList', api?.entityList ? 'available' : 'MISSING'),
            settingRow('entity-list.css', stylesheetContains('.blacksmith-entity-list')
                ? 'loaded'
                : 'NOT LOADED — check the @import in styles/default.css'),
            settingRow('Tool base', api?.BlacksmithToolWindowBaseV2 ? 'available' : 'MISSING',
                'needed by the theme check')
        ];
    },

    checks: [
        {
            id: 'selection-rules',
            tier: 'headless',
            label: 'Selection rules and disabled guards',
            run: async ({ expect }) => {
                const { entityList } = requireApi('entityList');

                const single = entityList.create({ entities: fixtures(), mode: 'single', selected: ['a', 'b'] });
                expect('single mode keeps only the first pre-selected id', single.getSelectedIds(), ['a']);

                const disabledPre = entityList.create({ entities: fixtures(), mode: 'single', selected: 'c' });
                expect('a disabled entity cannot be pre-selected', disabledPre.getSelectedIds(), []);

                const multi = entityList.create({ entities: fixtures(), mode: 'multi', selected: ['a', 'b', 'c'] });
                expect('multi keeps several but still drops the disabled one', multi.getSelectedIds(), ['a', 'b']);

                multi.setSelection(['c']);
                expect('setSelection cannot select a disabled entity', multi.getSelectedIds(), []);

                const singleSet = entityList.create({ entities: fixtures(), mode: 'single' });
                singleSet.setSelection(['a', 'b']);
                expect('setSelection in single mode keeps one', singleSet.getSelectedIds(), ['a']);
            }
        },
        {
            id: 'data-handling',
            tier: 'headless',
            label: 'Filtering, payload round-trip, escaping',
            run: async ({ expect }) => {
                const { entityList } = requireApi('entityList');

                const filtered = entityList.create({ entities: fixtures(), filter: e => e.id !== 'b' });
                expect('filter is applied before render', filtered.entities.map(e => e.id), ['a', 'c']);

                const payload = entityList.create({ entities: fixtures(), mode: 'multi', selected: 'b' });
                expect('getSelection returns the caller object, payload intact',
                    payload.getSelection()[0]?.payload, { keep: 'me' });

                const escaped = entityList.create({ entities: [{ id: 'x', name: '<script>bad()</script>' }] });
                expect.ok('entity names are escaped', !escaped.html.includes('<script>bad()'));

                const empty = entityList.create({ entities: [], emptyMessage: 'Nobody here.' });
                expect.ok('empty state renders the message', empty.html.includes('Nobody here.'));

                const badFilter = entityList.create({ entities: fixtures(), filter: () => { throw new Error('boom'); } });
                expect('a throwing filter drops rows instead of propagating', badFilter.entities, []);
            }
        },
        {
            id: 'markup',
            tier: 'headless',
            label: 'Input types, disabled attribute, custom input name',
            run: async ({ expect }) => {
                const { entityList } = requireApi('entityList');

                const single = entityList.create({ entities: fixtures(), mode: 'single' });
                const multi = entityList.create({ entities: fixtures(), mode: 'multi' });

                expect('renders one input per entity', (single.html.match(/<input /g) || []).length, 3);
                expect.ok('single mode uses radios', single.html.includes('type="radio"'));
                expect.ok('multi mode uses checkboxes', multi.html.includes('type="checkbox"'));
                expect.ok('disabled entity renders a disabled input', single.html.includes('disabled>'));
                expect.ok('disabled reason is rendered', single.html.includes('Already owns this item'));

                const named = entityList.create({ entities: fixtures(), inputName: 'custom-name' });
                expect.ok('custom inputName is honored', named.html.includes('name="custom-name"'));
                expect('inputName is reported back', named.inputName, 'custom-name');

                const skinned = entityList.create({ entities: fixtures(), itemClass: 'host-row', listClass: 'host-list' });
                expect.ok('itemClass reaches the rows', skinned.html.includes('host-row'));
                expect.ok('listClass reaches the container', skinned.html.includes('host-list'));
            }
        },
        {
            id: 'lifecycle',
            tier: 'headless',
            label: 'attach/destroy are safe to repeat',
            run: async ({ expect }) => {
                const { entityList } = requireApi('entityList');
                const container = document.createElement('div');
                const list = entityList.create({ entities: fixtures(), mode: 'multi' });
                container.innerHTML = list.html;
                document.body.appendChild(container);
                try {
                    list.attach(container);
                    list.attach(container);
                    expect.ok('attach twice does not throw', true);

                    list.setSelection(['a']);
                    expect('setSelection drives the live DOM', list.getSelectedIds(), ['a']);

                    const input = container.querySelector('input[value="b"]');
                    input.checked = true;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    expect('a DOM change is reflected in getSelection', list.getSelectedIds(), ['a', 'b']);

                    list.destroy();
                    list.destroy();
                    expect.ok('destroy twice does not throw', true);
                } finally {
                    container.remove();
                }
            }
        },
        {
            id: 'providers',
            tier: 'headless',
            label: 'Providers return well-formed descriptors',
            run: async ({ expect }) => {
                const { entityList } = requireApi('entityList');
                const users = entityList.providers.fromUsers();
                const actors = entityList.providers.fromActors();
                const tokens = entityList.providers.fromTokens();

                expect.ok('fromUsers returns an array', Array.isArray(users));
                expect.ok('fromActors returns an array', Array.isArray(actors));
                expect.ok('fromTokens returns an array', Array.isArray(tokens));
                expect.ok('every user descriptor has an id and name',
                    users.every(u => u.id && u.name));
                expect.ok('GMs are excluded by default',
                    users.every(u => !game.users.get(u.id)?.isGM));
                expect.ok('offline users are disabled with a reason',
                    users.filter(u => u.disabled).every(u => u.disabledReason === 'Offline'));
                expect.ok('includeGM widens the set',
                    entityList.providers.fromUsers({ includeGM: true }).length >= users.length);
            }
        },
        {
            id: 'live-single',
            tier: 'interactive',
            label: 'Single-select in a dialog',
            note: 'Pick one, then another — the first must clear. Arrow keys should move between rows.',
            run: async ({ api, log }) => {
                const list = api.entityList.create({
                    entities: fixtures(),
                    mode: 'single',
                    inputName: 'harness-single',
                    onSelectionChange: ({ selected, changed }) =>
                        log(`change -> ${changed?.name} | selection: ${selected.map(e => e.name).join(', ') || 'none'}`)
                });
                const outcome = await api.dialog.prompt({
                    title: 'Single Select',
                    content: `<p>Pick one. Selecting a second must replace the first.</p>${list.html}`,
                    submitLabel: 'Choose',
                    onRender: (root) => list.attach(root),
                    getValue: () => list.getSelectedIds(),
                    closeValue: []
                });
                list.destroy();
                log(`resolved: ${JSON.stringify(outcome)}`);
            }
        },
        {
            id: 'live-multi',
            tier: 'interactive',
            label: 'Multi-select, and setSelection driving the DOM',
            note: 'Alice starts checked. Bob should become checked on his own ~0.6s after opening.',
            run: async ({ api, log }) => {
                const list = api.entityList.create({
                    entities: fixtures(),
                    mode: 'multi',
                    inputName: 'harness-multi',
                    selected: ['a'],
                    onSelectionChange: ({ selected }) => log(`selection: ${selected.map(e => e.name).join(', ') || 'none'}`)
                });
                const outcome = await api.dialog.prompt({
                    title: 'Multi Select',
                    content: `<p>Check several.</p>${list.html}`,
                    submitLabel: 'Choose',
                    onRender: (root) => {
                        list.attach(root);
                        setTimeout(() => {
                            list.setSelection(['a', 'b']);
                            log(`after setSelection(["a","b"]): ${list.getSelectedIds().join(', ')}`);
                        }, 600);
                    },
                    getValue: () => list.getSelectedIds(),
                    closeValue: []
                });
                list.destroy();
                log(`resolved: ${JSON.stringify(outcome)}`);
            }
        },
        {
            id: 'live-disabled',
            tier: 'interactive',
            label: 'A disabled row resists mouse and keyboard',
            note: 'Try hard to select Carol — click, tab to her, press space. She must stay unselected and show her reason.',
            run: async ({ api, log }) => {
                const list = api.entityList.create({
                    entities: fixtures(),
                    mode: 'multi',
                    inputName: 'harness-disabled'
                });
                const outcome = await api.dialog.prompt({
                    title: 'Disabled Row',
                    content: `<p>Carol is disabled. She must stay unselected.</p>${list.html}`,
                    submitLabel: 'Done',
                    onRender: (root) => {
                        list.attach(root);
                        list.setSelection(['c']);
                        log(`after setSelection(["c"]) — must be empty: [${list.getSelectedIds().join(', ')}]`);
                    },
                    getValue: () => list.getSelectedIds(),
                    closeValue: []
                });
                list.destroy();
                log(`resolved: ${JSON.stringify(outcome)} — must not contain "c"`);
            }
        },
        {
            id: 'tool-themes',
            tier: 'interactive',
            label: 'Readability in a Tool window: Light, Dark, Glass',
            note: 'The gap both live conversions leave — one is a dialog, the other a standard window, but Squire hosts this in a Tool window under Glass.',
            run: async ({ api, log }) => {
                const ToolBase = api.BlacksmithToolWindowBaseV2;
                if (!ToolBase) throw new Error('BlacksmithToolWindowBaseV2 is not exposed on module.api.');

                const list = api.entityList.create({
                    entities: fixtures(),
                    mode: 'multi',
                    inputName: 'harness-tool',
                    selected: ['a']
                });

                class EntityListThemeProbe extends ToolBase {
                    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
                        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
                        {
                            id: 'blacksmith-entity-list-theme-probe',
                            rememberPosition: false,
                            position: { width: 340, height: 'auto' },
                            window: { title: 'Entity List Themes', resizable: false }
                        }
                    );
                    async getData() {
                        return { appId: this.id, bodyContent: list.html };
                    }
                    async _onRender(context, options) {
                        await super._onRender?.(context, options);
                        list.attach(this.element);
                    }
                    _onClose(options) {
                        list.destroy();
                        return super._onClose?.(options);
                    }
                }

                const probe = new EntityListThemeProbe();
                await probe.render({ force: true });
                log('Cycling Light -> Dark -> Glass, 2s each.');
                for (const theme of ['light', 'dark', 'glass']) {
                    await probe.setToolTheme(theme);
                    log(`theme: ${theme} — names, portraits, badges, and the selected ring readable?`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                log('Left on Glass. Check the selected-row ring against the translucent shell, then close it.');
            }
        }
    ]
};
