// ==================================================================
// ===== SUITE: XP adversary record =================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO -- it is an ES module and a macro
// rejects it on the export. Paste utilities/test-harness.js instead.
//
// Contract:       documentation/architecture/architecture-xp.md
// Implementation: scripts/stats-adversaries.js, scripts/xp-manager.js
//
// THIS SUITE MUTATES DOCUMENTS. It creates its own Combat, Actors and Tokens,
// prefixed with TEMP_PREFIX, and deletes them in a finally block. It never
// touches an existing combat: every check refuses to run while one is active,
// because creating a second Combat would disturb the live one.
//
// The check that matters is `resolution-survives-token-delete`. It is the
// screenshot that started this work, as an assertion: kill a monster, delete
// its token mid-fight the way looting-and-clearing does, and the award must
// still read DEFEATED. Before the adversary record it read as untouched,
// because Combatant#actor falls back to the base prototype and a prototype is
// at full health.
// ==================================================================

import { requireApi, settingRow } from './harness-lib.js';

const TEMP_PREFIX = 'ZZ Harness XP';

/** Build a throwaway NPC with known HP. */
async function tempNpc(hp = 10, suffix = '') {
    return Actor.create({
        name: `${TEMP_PREFIX}${suffix ? ` ${suffix}` : ''} ${foundry.utils.randomID(4)}`,
        type: 'npc',
        system: { attributes: { hp: { value: hp, max: hp } }, details: { cr: 2 } }
    });
}

async function cleanup(documents) {
    for (const document of documents.filter(Boolean).reverse()) {
        try { await document.delete(); } catch (_) { /* already gone */ }
    }
}

/** An unlinked token on the current scene for a prototype actor. */
async function placeToken(actor) {
    const [token] = await canvas.scene.createEmbeddedDocuments('Token', [{
        name: actor.name, actorId: actor.id, actorLink: false, x: 0, y: 0, hidden: true
    }]);
    return token;
}

export default {
    id: 'xp-record',
    label: 'XP Record',
    icon: 'fa-solid fa-award',

    settings: () => [
        settingRow('active combat', game.combat ? `yes (${game.combat.combatants.size} combatants)` : 'no',
            game.combat ? 'Checks refuse to run while a combat is active -- end it first.' : null),
        settingRow('canvas scene', canvas?.scene?.name ?? 'none', 'Required: these checks place tokens.'),
        settingRow('leftover test actors', game.actors.filter(a => a.name.startsWith(TEMP_PREFIX)).length)
    ],

    checks: [
        {
            id: 'resolution-survives-token-delete',
            tier: 'headless',
            group: 'Adversary record',
            label: 'A killed monster still reads DEFEATED after its token is deleted',
            note: 'The reported bug, as an assertion. Looting a corpse mid-fight deletes the token; without the record the award re-derives from the base prototype at full health and pays nothing.',
            run: async ({ expect, log }) => {
                requireApi('inventory');   // proves the module API is reachable
                const { XpManager } = await import('/modules/coffee-pub-blacksmith/scripts/xp-manager.js');
                const { getAdversaryRecord, AdversaryRecord } = await import('/modules/coffee-pub-blacksmith/scripts/stats-adversaries.js');

                if (game.combat) { log('A combat is active -- end it and re-run. Refusing to create a second.'); return; }
                if (!canvas?.scene) { log('No active scene -- skipped.'); return; }

                const made = [];
                let combat = null;
                let token = null;
                try {
                    const proto = await tempNpc(10, 'victim');
                    made.push(proto);
                    token = await placeToken(proto);

                    combat = await Combat.create({ active: true });
                    await combat.createEmbeddedDocuments('Combatant', [{
                        tokenId: token.id, sceneId: canvas.scene.id, actorId: proto.id
                    }]);
                    const combatant = combat.combatants.contents[0];
                    expect.ok('combatant created', Boolean(combatant));

                    // Kill it on the TOKEN actor, which is where combat damage lands.
                    await token.actor.update({ 'system.attributes.hp.value': 0 });
                    expect('token actor is at zero', token.actor.system.attributes.hp.value, 0);
                    expect('live derivation says DEFEATED before deletion',
                        XpManager.detectMonsterResolution(combatant, combat), 'DEFEATED');

                    // Capture, then delete the token the way looting-and-clearing does.
                    await AdversaryRecord.captureAll(combat);
                    const recordedBefore = getAdversaryRecord(combat)[combatant.id];
                    expect.ok('evidence was recorded', Boolean(recordedBefore));
                    expect('recorded hp is the killed value', recordedBefore.hp, 0);

                    await token.delete();
                    token = null;

                    // The prototype is untouched, which is exactly why live derivation lies here.
                    expect('prototype is still at full health', proto.system.attributes.hp.value, 10);
                    const stillThere = combat.combatants.get(combatant.id);
                    expect.ok('combatant survived the token', Boolean(stillThere));

                    expect('resolution is STILL Defeated after the token is gone',
                        XpManager.detectMonsterResolution(stillThere, combat), 'DEFEATED');
                    expect.ok('and it is counted as a monster',
                        XpManager.getCombatMonsters(combat).some(m => m.id === combatant.id));
                    expect.ok('with a non-zero base XP',
                        XpManager.getMonsterBaseXp(stillThere, combat) > 0);
                } finally {
                    if (token) { try { await token.delete(); } catch (_) { /* gone */ } }
                    if (combat) { try { await combat.delete(); } catch (_) { /* gone */ } }
                    await cleanup(made);
                }
            }
        },
        {
            id: 'record-is-evidence-not-verdict',
            tier: 'headless',
            group: 'Adversary record',
            label: 'The record stores hit points, never a resolution',
            note: 'A stored verdict would argue with a GM correcting a resolution in the window, or with a table changing its multipliers later.',
            run: async ({ expect, log }) => {
                const { getAdversaryRecord, AdversaryRecord } = await import('/modules/coffee-pub-blacksmith/scripts/stats-adversaries.js');
                if (game.combat) { log('A combat is active -- end it and re-run.'); return; }
                if (!canvas?.scene) { log('No active scene -- skipped.'); return; }

                const made = [];
                let combat = null, token = null;
                try {
                    const proto = await tempNpc(8, 'evidence');
                    made.push(proto);
                    token = await placeToken(proto);
                    combat = await Combat.create({ active: true });
                    await combat.createEmbeddedDocuments('Combatant', [{
                        tokenId: token.id, sceneId: canvas.scene.id, actorId: proto.id
                    }]);
                    const combatant = combat.combatants.contents[0];

                    await token.actor.update({ 'system.attributes.hp.value': 3 });
                    await AdversaryRecord.captureAll(combat);
                    const evidence = getAdversaryRecord(combat)[combatant.id];

                    expect.ok('evidence exists', Boolean(evidence));
                    expect('hp is recorded', evidence.hp, 3);
                    expect('maxHp is recorded', evidence.maxHp, 8);
                    expect('defeated state is recorded', evidence.defeated, false);
                    expect('no resolution is stored', evidence.resolutionType, undefined);
                    expect('no multiplier is stored', evidence.multiplier, undefined);
                    expect('no xp figure is stored', evidence.finalXp, undefined);
                    expect.ok('keyed on combatant id, not actor id', evidence.combatantId === combatant.id);
                } finally {
                    if (token) { try { await token.delete(); } catch (_) { /* gone */ } }
                    if (combat) { try { await combat.delete(); } catch (_) { /* gone */ } }
                    await cleanup(made);
                }
            }
        },
        {
            id: 'record-persists-on-the-combat',
            tier: 'headless',
            group: 'Adversary record',
            label: 'The record lives on the Combat document, so it survives a reload',
            note: 'Sessions stop mid-combat, so in-memory state is not sufficient. This asserts the flag is really written rather than held in a variable.',
            run: async ({ expect, log }) => {
                const { AdversaryRecord } = await import('/modules/coffee-pub-blacksmith/scripts/stats-adversaries.js');
                if (game.combat) { log('A combat is active -- end it and re-run.'); return; }
                if (!canvas?.scene) { log('No active scene -- skipped.'); return; }

                const made = [];
                let combat = null, token = null;
                try {
                    const proto = await tempNpc(6, 'persist');
                    made.push(proto);
                    token = await placeToken(proto);
                    combat = await Combat.create({ active: true });
                    await combat.createEmbeddedDocuments('Combatant', [{
                        tokenId: token.id, sceneId: canvas.scene.id, actorId: proto.id
                    }]);
                    await AdversaryRecord.captureAll(combat);

                    // Read the flag off the document's own source data, which is what a reload restores.
                    const stored = combat._source?.flags?.['coffee-pub-blacksmith']?.adversaries;
                    expect.ok('flag is present in the document source', Boolean(stored));
                    expect('one entry per combatant', Object.keys(stored ?? {}).length, combat.combatants.size);
                } finally {
                    if (token) { try { await token.delete(); } catch (_) { /* gone */ } }
                    if (combat) { try { await combat.delete(); } catch (_) { /* gone */ } }
                    await cleanup(made);
                }
            }
        },
        {
            id: 'create-combat-skips-the-dead',
            tier: 'interactive',
            label: 'Create Combat leaves corpses out',
            note: 'Put a live token and a dead one on the canvas, deselect everything, and use the menubar Create tool. Only the live token should enter the tracker; the console reports how many were skipped. A GM can still add a corpse deliberately.',
            run: async ({ log }) => {
                log('Expected: dead tokens are not added, and the console names how many were skipped.');
                log('If every token found is out of the fight, the toast says so rather than creating an empty combat.');
            }
        },
        {
            id: 'cr-excludes-the-dead',
            tier: 'interactive',
            label: 'Encounter CR badges ignore corpses',
            note: 'Open a journal encounter page with the toolbar badges visible, then kill a monster on the canvas. The monster CR badge should drop. A player character at zero must NOT reduce the party CR -- they are dying, not dead.',
            run: async ({ log }) => {
                log('Watch both badges. Monster at zero: monster CR drops.');
                log('Player character at zero: party CR unchanged -- that asymmetry is deliberate.');
            }
        },
        {
            id: 'cleanup-leftovers',
            tier: 'interactive',
            label: 'Delete leftover test actors',
            note: 'Removes anything this suite created if a check died mid-run.',
            run: async ({ log }) => {
                const actors = game.actors.filter(a => a.name.startsWith(TEMP_PREFIX));
                for (const actor of actors) { try { await actor.delete(); } catch (_) { /* gone */ } }
                log(`Deleted ${actors.length} actor(s).`);
            }
        }
    ]
};
