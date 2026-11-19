// ==================================================================
// ===== SUITE: NPC scaling ==========================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/api/api-npc-scaling.md
// Mechanism:      documentation/architecture/architecture-npc-scaling.md
// Implementation: scripts/utility-npc-scaling.js (pure; checked by tools/check-npc-scaling.mjs),
//                 scripts/manager-npc-scaling.js, scripts/api-npc-scaling.js, scripts/window-npc-scaling.js
//
// What this proves that the Node check cannot: that the field paths the engine writes to EXIST on the
// installed dnd5e, that a real NPC scales into a real new actor whose derived values match, and that the
// source is untouched. Every actor it makes is deleted afterwards, pass or fail.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const ATTACK_TYPES = ['mwak', 'rwak', 'msak', 'rsak'];

/** Delete every actor in the list, ignoring ones already gone. */
async function cleanup(actors) {
    for (const actor of actors) {
        try { await actor?.delete(); } catch (_) { /* already gone */ }
    }
}

/** A throwaway CR 1/4 NPC with 7 hit points, like a goblin, owned by no one. */
async function makeGoblin() {
    return Actor.implementation.create({
        name: 'Harness Goblin',
        type: 'npc',
        system: {
            details: { cr: 0.25 },
            attributes: { hp: { value: 7, max: 7, formula: '2d6' }, ac: { flat: 15 } }
        }
    });
}

/** The first path of these the installed dnd5e's NPC model actually has, or null. */
function firstField(actor, candidates) {
    return candidates.find((p) => actor.system.schema.getField(p.replace(/^system\./, ''))) ?? null;
}

async function code(promise) {
    try {
        await promise;
        return 'NO_ERROR';
    } catch (error) {
        return error?.code ?? `UNCODED:${error?.message}`;
    }
}

export default {
    id: 'npc-scaling',
    label: 'NPC Scaling',
    icon: 'fa-solid fa-arrow-up-right-dots',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        return [
            settingRow('api.npcScaling', api?.npcScaling ? 'available' : 'MISSING'),
            settingRow('dnd5e', game.system?.version ?? 'unknown'),
            settingRow('this user', game.user?.isGM ? 'GM' : 'player', game.user?.isGM ? null : 'Scaling is GM-only; the checks below will refuse.')
        ];
    },

    checks: [
        {
            id: 'surface',
            tier: 'headless',
            group: 'Surface',
            label: 'The API is present, frozen where it must be, and refuses by code',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const scaling = api.npcScaling;
                for (const method of ['preview', 'apply', 'guidance', 'open', 'provenance', 'specFromCR', 'proficiencyForCR']) {
                    expect.ok(`npcScaling.${method} is a function`, typeof scaling[method] === 'function');
                }
                expect.ok('the guidelines table is frozen', Object.isFrozen(scaling.guidelines));
                expect.ok('the applied hook is named', scaling.HOOK_APPLIED === 'blacksmith.npcScaling.applied');
                for (const method of ['guidelineInfo', 'buildGuidelines', 'setGuidelines', 'resetGuidelines']) {
                    expect.ok(`npcScaling.${method} is a function`, typeof scaling[method] === 'function');
                }
                for (const method of ['list', 'get', 'save', 'remove', 'nameTaken', 'fromSpec', 'toSpec', 'exportPayload', 'parseImport', 'import']) {
                    expect.ok(`npcScaling.templates.${method} is a function`, typeof scaling.templates?.[method] === 'function');
                }
                expect('a missing target is refused by code', await code(scaling.preview('Actor.doesNotExist', { cr: 5 })), 'NO_TARGET');
            }
        },
        {
            id: 'guidance',
            tier: 'headless',
            group: 'Scene guidance',
            label: 'The scene tells a creature which challenge ratings make the encounter Easy to Deadly',
            note: 'Reads the party and the other monsters on the canvas. With no player character on the scene it says so rather than guessing.',
            run: async ({ expect, log }) => {
                const scaling = requireApi('npcScaling').npcScaling;
                const actor = await makeGoblin();
                try {
                    const g = await scaling.guidance(actor, { cr: 12, count: 3 });
                    log(`party CR ${g.partyCR}, other monsters ${g.othersCR}, available ${g.available}`);
                    expect.ok('available is a boolean', typeof g.available === 'boolean');
                    expect.ok('bands is a list', Array.isArray(g.bands));
                    expect.ok('a creature from the sidebar is not on the scene', g.onScene === false);
                    if (g.available) {
                        expect.ok('there is at least one band', g.bands.length > 0);
                        expect.ok('bands rise without overlapping', g.bands.every((b, i) => b.from <= b.to && (i === 0 || b.from > g.bands[i - 1].to)));
                        expect.ok('the chosen CR is described', g.chosen?.cr === 12 && typeof g.chosen.label === 'string');
                        expect.ok('the count is carried and priced in', g.count === 3 && g.chosen.monsterCR === g.othersCR + 36);
                        expect.ok('the meter has zones along a ratio axis', g.zones.length > 0 && g.zones.at(-1).to === g.maxRatio);
                    } else {
                        expect.ok('with no party there are no bands', g.bands.length === 0);
                    }
                } finally {
                    await cleanup([actor]);
                }
            }
        },
        {
            id: 'paths',
            tier: 'headless',
            group: 'dnd5e fields',
            label: 'Every field the engine writes exists on this dnd5e (or its older layout does)',
            note: 'The decisive check for the version split. A key dnd5e does not have is dropped silently by Foundry.',
            run: async ({ expect, log }) => {
                const actor = await makeGoblin();
                try {
                    const layout = firstField(actor, ['system.rolls.attack.mwak.bonus']) ? '6.x (system.rolls)' : '5.x (system.bonuses)';
                    log(`layout: ${layout}`);
                    for (const t of ATTACK_TYPES) {
                        expect.ok(`attack bonus path for ${t}`, !!firstField(actor, [`system.rolls.attack.${t}.bonus`, `system.bonuses.${t}.attack`]));
                        expect.ok(`damage bonus path for ${t}`, !!firstField(actor, [`system.rolls.damage.${t}.bonus`, `system.bonuses.${t}.damage`]));
                    }
                    expect.ok('initiative bonus path', !!firstField(actor, ['system.attributes.init.roll.bonus', 'system.attributes.init.bonus']));
                    expect.ok('spell DC bonus path', !!firstField(actor, ['system.bonuses.spell.dc']));
                    expect.ok('hp.max', !!firstField(actor, ['system.attributes.hp.max']));
                    expect.ok('hp.value', !!firstField(actor, ['system.attributes.hp.value']));
                    expect.ok('armor class (override, or flat)', !!firstField(actor, ['system.attributes.ac.override', 'system.attributes.ac.flat']));
                    expect.ok('legendary resistances', !!firstField(actor, ['system.resources.legres.max']));
                    expect.ok('legendary actions', !!firstField(actor, ['system.resources.legact.max']));
                    expect.ok('challenge rating', !!firstField(actor, ['system.details.cr']));
                } finally {
                    await cleanup([actor]);
                }
            }
        },
        {
            id: 'scale-goblin',
            tier: 'headless',
            group: 'Scaling',
            label: 'A CR 1/4 goblin scales to CR 12 as a new actor, and the source is untouched',
            run: async ({ expect, log }) => {
                const api = requireApi('npcScaling');
                const created = [];
                const source = await makeGoblin();
                created.push(source);
                try {
                    expect('the goblin starts at CR 1/4, 7 hit points', [source.system.details.cr, source.system.attributes.hp.max], [0.25, 7]);

                    const preview = await api.npcScaling.preview(source, { cr: 12, label: 'Super' });
                    const row = (key) => preview.preview.find((r) => r.key === key);
                    expect('preview: CR row', [row('cr').from, row('cr').to], [0.25, 12]);
                    expect('preview: proficiency follows CR', [row('prof').from, row('prof').to], [2, 4]);
                    // CR 1/4 -> 12 hit point gap is 243 - 43 = 200; the goblin keeps its own 7 on top.
                    expect('preview: hit points are the creature\'s own plus the row gap', [row('hp').from, row('hp').to], [7, 207]);
                    log(`preview rows: ${preview.preview.map((r) => r.key).join(', ')}`);

                    const result = await api.npcScaling.apply(source, { cr: 12, label: 'Super' });
                    created.push(result.actor);
                    const scaled = result.actor;

                    expect('the new actor is named for its label', scaled.name, 'Harness Goblin (Super)');
                    expect('the new actor is at CR 12', scaled.system.details.cr, 12);
                    expect('dnd5e derived proficiency 4 from CR 12', scaled.system.attributes.prof, 4);
                    expect('hit points were written', [scaled.system.attributes.hp.max, scaled.system.attributes.hp.value], [207, 207]);
                    expect.ok('the new actor is a different document', scaled.id !== source.id);

                    const flag = api.npcScaling.provenance(scaled);
                    expect('provenance names the source', flag?.sourceUuid, source.uuid);
                    expect('provenance records both CRs', [flag?.crFrom, flag?.crTo], [0.25, 12]);
                    expect('the source has no provenance', api.npcScaling.provenance(source), null);

                    expect('SOURCE: CR unchanged', source.system.details.cr, 0.25);
                    expect('SOURCE: hit points unchanged', [source.system.attributes.hp.max, source.system.attributes.hp.value], [7, 7]);
                    expect('SOURCE: name unchanged', source.name, 'Harness Goblin');
                } finally {
                    await cleanup(created);
                }
            }
        },
        {
            id: 'actions',
            tier: 'headless',
            group: 'Scaling',
            label: 'Damage is written into the creature\'s own attack, and Multiattack says how many it makes',
            run: async ({ expect, log }) => {
                const api = requireApi('npcScaling');
                const created = [];
                const source = await makeGoblin();
                created.push(source);
                try {
                    // A feature with one attack: 1d6 + 2 slashing.
                    const [slash] = await source.createEmbeddedDocuments('Item', [{
                        name: 'Harness Slash',
                        type: 'feat',
                        system: {
                            activities: {
                                harnessslash0001: {
                                    _id: 'harnessslash0001',
                                    type: 'attack',
                                    activation: { type: 'action' },
                                    attack: { type: { value: 'melee', classification: 'weapon' }, ability: 'str' },
                                    damage: { includeBase: false, parts: [{ number: 1, denomination: 6, bonus: '2', types: ['slashing'] }] }
                                }
                            }
                        }
                    }]);
                    const part = (item) => item.system.activities.get('harnessslash0001')?.damage?.parts?.[0];
                    expect('the source starts at 1d6 + 2', [part(slash).number, part(slash).denomination], [1, 6]);

                    const preview = await api.npcScaling.preview(source, { cr: 12 });
                    const row = (key) => preview.preview.find((r) => r.key === key);
                    expect('a CR 12 creature is given three attacks', [row('attacks')?.from, row('attacks')?.to], [1, 3]);
                    expect.ok('the damage row says it is written into its actions', /written into/.test(row('damage')?.note ?? ''));
                    log(`damage per hit ${row('damage')?.from} -> ${row('damage')?.to}; per round ${row('dpr')?.from} -> ${row('dpr')?.to}`);

                    const result = await api.npcScaling.apply(source, { cr: 12 });
                    created.push(result.actor);
                    const scaled = result.actor;
                    const grown = scaled.items.find((i) => i.name === 'Harness Slash');
                    expect.ok('the scaled actor has the attack', !!grown);
                    expect.ok('its dice grew', part(grown).number > 1);
                    expect('its die did not change', part(grown).denomination, 6);
                    expect('and the SOURCE\'s attack is untouched', [part(slash).number, part(source.items.get(slash.id)).denomination], [1, 6]);
                    expect('no actor-level damage bonus was written', scaled.system.rolls?.damage?.mwak?.bonus ?? scaled.system.bonuses?.mwak?.damage ?? '', '');

                    const multi = scaled.items.find((i) => /multiattack/i.test(i.name));
                    expect.ok('the scaled actor has a Multiattack feature', !!multi);
                    expect.ok('and it says three attacks', /three attacks/.test(multi?.system?.description?.value ?? ''));
                    expect('the result says it was added', result.multiattack, 'added');
                    log(`Multiattack came from ${multi?._stats?.compendiumSource ? 'the compendium' : 'a plain feature'}`);
                    expect('the source has no Multiattack', source.items.some((i) => /multiattack/i.test(i.name)), false);

                    // A creature that already has one gets a paragraph appended, and its own text kept.
                    const withText = await Actor.implementation.create({ name: 'Harness Multi', type: 'npc', system: { details: { cr: 1 } } });
                    created.push(withText);
                    await withText.createEmbeddedDocuments('Item', [{ name: 'Multiattack', type: 'feat', system: { description: { value: '<p>The creature makes two attacks.</p>' } } }]);
                    const second = await api.npcScaling.apply(withText, { cr: 8, attacksTo: 3 });
                    created.push(second.actor);
                    const text = second.actor.items.find((i) => /multiattack/i.test(i.name))?.system?.description?.value ?? '';
                    expect.ok('its own text is kept', text.includes('The creature makes two attacks.'));
                    expect.ok('and the scaled paragraph is added after it', text.includes('three attacks') && text.indexOf('Scaled') > text.indexOf('two attacks'));
                    expect('the result says it was extended', second.multiattack, 'extended');
                } finally {
                    await cleanup(created);
                }
            }
        },
        {
            id: 'rescale',
            tier: 'headless',
            group: 'Scaling',
            label: 'Scaling a scaled actor starts from its source and does not stack',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const created = [];
                const source = await makeGoblin();
                created.push(source);
                try {
                    const first = (await api.npcScaling.apply(source, { cr: 12, label: 'Super' })).actor;
                    created.push(first);

                    // The same retarget, asked of the original and of the scaled copy, must agree.
                    const fromSource = await api.npcScaling.preview(source, { cr: 8 });
                    const fromScaled = await api.npcScaling.preview(first, { cr: 8 });
                    const hp = (p) => p.preview.find((r) => r.key === 'hp')?.to;
                    expect('hit points at CR 8 are the same from either', hp(fromScaled), hp(fromSource));

                    const second = (await api.npcScaling.apply(first, { cr: 8, label: 'Lesser' })).actor;
                    created.push(second);
                    expect('the second scaling points at the ORIGINAL', api.npcScaling.provenance(second)?.sourceUuid, source.uuid);
                    expect('and is named from the original, not the first copy', second.name, 'Harness Goblin (Lesser)');
                    expect('and sits at CR 8', second.system.details.cr, 8);
                } finally {
                    await cleanup(created);
                }
            }
        },
        {
            id: 'templates',
            tier: 'headless',
            group: 'Templates',
            label: 'The library seeds, saves and removes; a template scales a goblin like the table says',
            note: 'Writes one throwaway template and removes it. If the library was never touched it is also marked as seeded, which leaves it holding exactly the built-ins.',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const lib = api.npcScaling.templates;
                const created = [];
                const source = await makeGoblin();
                created.push(source);
                let tempId = null;
                try {
                    const names = lib.list().map((t) => t.name);
                    expect.ok('the library is not empty (the built-ins, or the GM\'s own)', names.length > 0);
                    expect.ok('every template has an id and a name', lib.list().every((t) => t.id && t.name));

                    // An Elite-shaped template: CR step 2, +50% hit points, +2 attack, +3 damage per hit.
                    const saved = await lib.save({ name: 'Harness Elite', crBy: 2, hp: { mode: 'percent', value: 50 }, ac: 1, attack: 2, saveDC: 2, damage: 3 });
                    tempId = saved.id;
                    expect.ok('save gave it an id', !!tempId);
                    expect('it reads back by id', lib.get(tempId)?.name, 'Harness Elite');
                    expect('its name is taken', lib.nameTaken('harness elite'), true);
                    expect('not by itself', lib.nameTaken('Harness Elite', tempId), false);

                    const preview = await api.npcScaling.preview(source, { template: tempId });
                    const row = (key) => preview.preview.find((r) => r.key === key);
                    expect('CR 1/4 steps up two to CR 2', [row('cr').from, row('cr').to], [0.25, 2]);
                    expect('hit points are 50% on top of the creature\'s own 7', [row('hp').from, row('hp').to], [7, 11]);
                    expect('armor class goes up by one', row('ac').to - row('ac').from, 1);
                    expect('the spec is labelled with the template name', preview.spec.label, 'Harness Elite');

                    const { actor } = await api.npcScaling.apply(source, { template: tempId });
                    created.push(actor);
                    expect('the new actor is named for the template', actor.name, 'Harness Goblin (Harness Elite)');
                    expect('and sits at CR 2', actor.system.details.cr, 2);
                    expect('and records which template made it', api.npcScaling.provenance(actor)?.template, tempId);

                    await lib.remove(tempId);
                    expect('removed', lib.get(tempId), null);
                    tempId = null;
                    expect('a removed template is refused by name', await code(api.npcScaling.preview(source, { template: 'tpl-does-not-exist' })), 'BAD_TEMPLATE');
                    expect('a nameless template is refused', await code(lib.save({ crBy: 2 })), 'BAD_TEMPLATE');
                } finally {
                    if (tempId) await lib.remove(tempId).catch(() => {});
                    await cleanup(created);
                }
            }
        },
        {
            id: 'guidelines',
            tier: 'headless',
            group: 'Guidelines',
            label: 'A table builds from the 2024 monsters, is sound, and scaling reads it',
            note: 'Reads the dnd5e.actors24 compendium (a few seconds). Building writes nothing. If the world has no table of its own, the check also sets the built one and resets it; if it has, that is left alone.',
            run: async ({ expect, log }) => {
                const api = requireApi('npcScaling');
                const scaling = api.npcScaling;
                expect.ok('the bundled table is frozen', Object.isFrozen(scaling.bundledGuidelines));
                const info = scaling.guidelineInfo();
                expect.ok('the table in use names its source', !!info.label);
                log(`in use: ${info.label} (${info.kind})`);

                expect('a pack that does not exist is refused by name', await code(scaling.buildGuidelines({ packs: ['nope.nope'] })), 'NO_PACK');
                if (!game.packs.get('dnd5e.actors24')) {
                    log('dnd5e.actors24 is not installed; the build is not exercised.');
                    return;
                }

                const built = await scaling.buildGuidelines({ packs: ['dnd5e.actors24'] });
                const counts = built.report.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
                log(`read ${built.report.samples} creatures (${built.skipped} skipped); rows: ${JSON.stringify(counts)}`);
                expect('a row for every challenge rating', Object.keys(built.table).length, 34);
                expect.ok('a real bestiary is hundreds of creatures', built.report.samples > 100);
                expect.ok('the built table is frozen', Object.isFrozen(built.table));
                const cr5 = built.table['5'];
                expect.ok('CR 5 armor class is plausible (11 to 19)', cr5.ac >= 11 && cr5.ac <= 19);
                expect.ok('CR 5 hit points are plausible (60 to 200)', (cr5.hp[0] + cr5.hp[1]) / 2 >= 60 && (cr5.hp[0] + cr5.hp[1]) / 2 <= 200);
                expect.ok('hit points rise from CR 1 to CR 20', built.table['20'].hp[0] > built.table['1'].hp[1]);
                expect('building wrote nothing', scaling.guidelineInfo().kind, info.kind);

                if (info.kind !== 'bundled') return;
                const goblin = await makeGoblin();
                try {
                    await scaling.setGuidelines(built);
                    expect('the world now uses the built table', scaling.guidelineInfo().kind, 'compendium');
                    expect('and `guidelines` is that table', JSON.stringify(scaling.guidelines), JSON.stringify(built.table));
                    const preview = await scaling.preview(goblin, { cr: 12 });
                    expect.ok('a scaling still plans against it', preview.preview.some((r) => r.key === 'hp'));
                    await scaling.resetGuidelines();
                    expect('reset goes back to the bundled table', scaling.guidelineInfo().kind, 'bundled');
                } finally {
                    await scaling.resetGuidelines().catch(() => {});
                    await cleanup([goblin]);
                }
            }
        },
        {
            id: 'refusals',
            tier: 'headless',
            group: 'Scaling',
            label: 'Anything that cannot be scaled is refused by name',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const created = [];
                const goblin = await makeGoblin();
                created.push(goblin);
                try {
                    const pc = await Actor.implementation.create({ name: 'Harness Hero', type: 'character' });
                    created.push(pc);
                    expect('a player character is refused', await code(api.npcScaling.preview(pc, { cr: 5 })), 'NOT_NPC');
                    expect('a CR off the table is refused', await code(api.npcScaling.preview(goblin, { cr: 31 })), 'INVALID_CR');
                    expect('no target CR and no spec is refused', await code(api.npcScaling.preview(goblin, {})), 'BAD_SPEC');
                    expect('an output that does not exist yet is refused', await code(api.npcScaling.apply(goblin, { cr: 5, output: 'token' })), 'UNSUPPORTED_OUTPUT');
                    expect('a spec of another version is refused', await code(api.npcScaling.preview(goblin, { spec: { version: 99 } })), 'BAD_SPEC');
                } finally {
                    await cleanup(created);
                }
            }
        },
        {
            id: 'hook',
            tier: 'headless',
            group: 'Scaling',
            label: 'The applied hook fires once, with the source and the result',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const created = [];
                const source = await makeGoblin();
                created.push(source);
                const seen = [];
                const id = Hooks.on(api.npcScaling.HOOK_APPLIED, (payload) => seen.push(payload));
                try {
                    const { actor } = await api.npcScaling.apply(source, { cr: 6, label: 'Hook' });
                    created.push(actor);
                    expect('fired once', seen.length, 1);
                    expect('carries the source', seen[0]?.source?.uuid, source.uuid);
                    expect('carries the result', seen[0]?.result?.uuid, actor.uuid);
                    expect('carries the spec', seen[0]?.spec?.cr, { to: 6 });
                } finally {
                    Hooks.off(api.npcScaling.HOOK_APPLIED, id);
                    await cleanup(created);
                }
            }
        },
        {
            id: 'window',
            tier: 'interactive',
            group: 'Window',
            label: 'Open the window for the selected NPC token',
            note: 'Select an NPC token first. Check: Light, Dark and Glass; the table reads stat / now / scaled; changing the CR redraws; the suffix and damage estimate edit in place; Create Scaled Actor makes a new actor and a toast that opens its sheet.',
            run: async ({ expect }) => {
                const api = requireApi('npcScaling');
                const token = canvas.tokens.controlled.find((t) => t.actor?.type === 'npc');
                expect.ok('an NPC token is selected', !!token);
                if (!token) return;
                const win = await api.npcScaling.open(token);
                expect.ok('a window opened', !!win);
                const again = await api.npcScaling.open(token);
                expect.ok('opening it again focuses the same window', again === win);
            }
        }
    ]
};
