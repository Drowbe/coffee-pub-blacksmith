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
                for (const method of ['preview', 'apply', 'open', 'provenance', 'specFromCR', 'proficiencyForCR']) {
                    expect.ok(`npcScaling.${method} is a function`, typeof scaling[method] === 'function');
                }
                expect.ok('the guidelines table is frozen', Object.isFrozen(scaling.guidelines));
                expect.ok('the applied hook is named', scaling.HOOK_APPLIED === 'blacksmith.npcScaling.applied');
                expect('a missing target is refused by code', await code(scaling.preview('Actor.doesNotExist', { cr: 5 })), 'NO_TARGET');
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
