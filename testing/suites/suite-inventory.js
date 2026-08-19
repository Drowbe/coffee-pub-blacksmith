// ==================================================================
// ===== SUITE: api.inventory mutation primitives ====================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract:       documentation/api/api-inventory.md
// Mechanism:      documentation/architecture/architecture-inventory.md
// Implementation: scripts/api-inventory.js
//
// THIS SUITE MUTATES DOCUMENTS. Every check builds its own throwaway Actors
// named with the TEMP_PREFIX below and deletes them in a finally block. It
// never reads, writes, or selects an existing Actor, and it never touches the
// canvas except in the one check that needs an unlinked token, which creates
// and removes its own. If a check dies mid-run, sweep leftovers with the
// "Delete leftover test actors" interactive check.
//
// Three assertions here exist because the thing they cover is invisible in
// working code and destructive when wrong. Do not delete them to make the
// suite faster:
//   rollback-after-merge   — a wrong rollback destroys quantity the recipient
//                            already owned, while looking like clean-up.
//   lock-serialisation     — a lost lock double-spends the last item in a stack.
//   one-write-per-actor    — a second write to one Actor collides with dnd5e's
//                            encumbrance recompute; see the architecture doc.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const TEMP_PREFIX = 'ZZ Harness Inventory';

/** Item payload used across checks. `loot` is physical, stacks, and has no activities. */
function lootData(name = 'Harness Widget', overrides = {}) {
    return foundry.utils.mergeObject({
        name,
        type: 'loot',
        system: { quantity: 1, weight: { value: 1, units: 'lb' }, price: { value: 1, denomination: 'gp' } }
    }, overrides, { inplace: false });
}

/** Create a throwaway Actor. Caller must pass it to `cleanup`. */
async function tempActor(type = 'character', suffix = '') {
    return Actor.create({
        name: `${TEMP_PREFIX}${suffix ? ` ${suffix}` : ''} ${foundry.utils.randomID(4)}`,
        type
    });
}

/** Delete every document a check created, swallowing individual failures. */
async function cleanup(documents) {
    for (const document of documents.filter(Boolean).reverse()) {
        try { await document.delete(); } catch (_) { /* already gone */ }
    }
}

/** Source quantity as stored, not as prepared. */
function quantityOf(item) {
    return item?._source?.system?.quantity ?? null;
}

/** Currency as stored. */
function currencyOf(actor, denomination) {
    return Number(actor?._source?.system?.currency?.[denomination] ?? 0);
}

/**
 * Capture console.error for the duration of `fn`.
 *
 * The encumbrance rejection surfaces from a dnd5e lifecycle hook, outside the
 * caller's await chain, so it cannot be caught with try/catch — it only ever
 * appears in the console. Watching console.error is the only way to assert its
 * absence, which is also why the real bug went unnoticed as "noise".
 */
async function withConsoleErrors(fn) {
    const captured = [];
    const original = console.error;
    console.error = (...args) => { captured.push(args.map(String).join(' ')); original.apply(console, args); };
    try {
        await fn();
        // The recompute outlives the write, so give it a beat to fail.
        await new Promise(resolve => setTimeout(resolve, 750));
    } finally {
        console.error = original;
    }
    return captured;
}

/**
 * Top-level keys whose values differ between two system objects, for diagnosing a refused merge.
 * A merge assertion that only reports true/false forces a guess; this names the field.
 */
function diffKeys(a = {}, b = {}) {
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    return [...keys].filter(key => !foundry.utils.objectsEqual(
        { v: a?.[key] ?? null }, { v: b?.[key] ?? null }
    ));
}

/** Stored flags and system data, captured for comparison later. */
function snapshot(item) {
    return {
        system: foundry.utils.deepClone(item?._source?.system ?? {}),
        flags: foundry.utils.deepClone(item?._source?.flags ?? {})
    };
}

/**
 * Log why an existing row was not merged into.
 *
 * Takes SNAPSHOTS captured before the operation, not live documents. Reading flags afterwards is
 * actively misleading: a third-party createItem hook (Squire stamps `isNew`) writes to both sides
 * asynchronously, so a post-hoc read shows them identical when they differed at compare time.
 * That hid the real cause of this suite's first two failing runs.
 */
function explainNoMerge(log, existingSnapshot, incomingSnapshot) {
    if (!existingSnapshot || !incomingSnapshot) { log('no comparable row on the target'); return; }
    const a = foundry.utils.deepClone(existingSnapshot.system ?? {});
    const b = foundry.utils.deepClone(incomingSnapshot.system ?? {});
    delete a.quantity; delete b.quantity;
    log(`system keys differing: ${JSON.stringify(diffKeys(a, b))}`);
    log(`  flags at compare time - existing: ${JSON.stringify(existingSnapshot.flags ?? {})}`);
    log(`  flags at compare time - incoming: ${JSON.stringify(incomingSnapshot.flags ?? {})}`);
    log(`  flag paths differing: ${JSON.stringify(diffKeys(existingSnapshot.flags, incomingSnapshot.flags))}`);
    log(`  registry excludes: ${JSON.stringify(requireApi('inventory').inventory.getTransientFlags())}`);
    for (const key of diffKeys(a, b)) {
        log(`  ${key}: existing=${JSON.stringify(a[key])} incoming=${JSON.stringify(b[key])}`);
    }
}

/**
 * Count embedded-document writes made to an Actor while `fn` runs.
 *
 * The batch forms exist to keep this number at two per Actor no matter how many items move, because
 * dnd5e recomputes encumbrance per write and those recomputes race. Asserting the count directly is
 * the only way to test that property - the symptom it prevents is intermittent and shows up in the
 * console rather than the return value.
 */
async function countWrites(actors, fn) {
    const counts = new Map();
    const restore = [];
    for (const actor of actors) {
        counts.set(actor.id, { create: 0, update: 0, delete: 0 });
        for (const method of ['createEmbeddedDocuments', 'updateEmbeddedDocuments', 'deleteEmbeddedDocuments']) {
            const original = actor[method].bind(actor);
            restore.push(() => { delete actor[method]; });
            actor[method] = (...args) => {
                counts.get(actor.id)[method.replace('EmbeddedDocuments', '').toLowerCase()]++;
                return original(...args);
            };
        }
    }
    try {
        const value = await fn();
        return { value, counts };
    } finally {
        for (const undo of restore) undo();
    }
}

/** Total writes recorded for one actor. */
function totalWrites(counts, actor) {
    const entry = counts.get(actor.id) ?? {};
    return (entry.create ?? 0) + (entry.update ?? 0) + (entry.delete ?? 0);
}

export default {
    id: 'inventory',
    label: 'Inventory',
    icon: 'fa-solid fa-sack',

    settings: () => {
        const encumbrance = (() => {
            try { return game.settings.get('dnd5e', 'encumbrance'); } catch (_) { return 'unavailable'; }
        })();
        const leftovers = game.actors.filter(actor => actor.name.startsWith(TEMP_PREFIX)).length;
        return [
            settingRow('dnd5e encumbrance', encumbrance,
                encumbrance === 'none' ? 'One-write-per-actor check cannot fire; dnd5e skips the recompute entirely.' : null),
            settingRow('api.inventory', game.modules.get('coffee-pub-blacksmith')?.api?.inventory ? 'present' : 'MISSING'),
            settingRow('canvas scene', canvas?.scene?.name ?? 'none', 'Token-actor check needs an active scene.'),
            settingRow('leftover test actors', leftovers, leftovers ? 'Run the cleanup check.' : null)
        ];
    },

    checks: [

        // ---------- surface ----------
        {
            id: 'api-shape',
            tier: 'headless',
            group: 'Surface',
            label: 'Public surface is present',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                for (const method of ['grantItem', 'grantItems', 'grantCurrency', 'transferItem', 'transferCurrency', 'exchange']) {
                    expect.ok(`inventory.${method} is a function`, typeof inv[method] === 'function');
                }
                expect.ok('CODES is exposed', typeof inv.CODES === 'object');
                expect.ok('LOCK_TIMEOUT code exists', inv.CODES?.LOCK_TIMEOUT === 'LOCK_TIMEOUT');
                expect.ok('CONTAINER_NOT_FOUND code exists', inv.CODES?.CONTAINER_NOT_FOUND === 'CONTAINER_NOT_FOUND');
                expect.ok('PHYSICAL_TYPES excludes class', !inv.PHYSICAL_TYPES?.includes('class'));
                expect.ok('DENOMINATIONS covers all five',
                    ['pp', 'gp', 'ep', 'sp', 'cp'].every(d => inv.DENOMINATIONS?.includes(d)));
            }
        },

        // ---------- grant ----------
        {
            id: 'grant-basic',
            tier: 'headless',
            group: 'Grant',
            label: 'Grant from a world item, and the reset set is applied',
            note: 'Equipped and attuned must NOT survive the write — dnd5e clears them on its own drop path.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'grant-target');
                    made.push(target);
                    // An EQUIPPABLE type, not loot: `equipped` and `attuned` live on
                    // EquippableItemTemplate (dnd5e.mjs:13803-13805), so asserting the reset set
                    // against a `loot` item would pass trivially - the fields are not in its
                    // schema either way, which is a false pass rather than a check.
                    const world = await Item.create({
                        name: 'Harness Grant Blade',
                        type: 'weapon',
                        system: { quantity: 4, equipped: true, attuned: true }
                    });
                    made.push(world);
                    expect.ok('fixture really is equipped before the grant', world._source.system.equipped === true);
                    expect.ok('fixture really is attuned before the grant', world._source.system.attuned === true);

                    const result = await api.inventory.grantItem({
                        targetActorUuid: target.uuid,
                        itemUuid: world.uuid,
                        quantity: 3
                    });
                    expect('grant succeeded', result.ok, true);
                    expect('merged is false on a fresh actor', result.merged, false);
                    expect('quantity honoured', result.quantity, 3);

                    const arrived = target.items.get(result.targetItemId);
                    expect.ok('item exists on target', Boolean(arrived));
                    expect('quantity on target', quantityOf(arrived), 3);
                    expect.ok('equipped did not survive the write', !arrived?._source?.system?.equipped);
                    expect.ok('attuned did not survive the write', !arrived?._source?.system?.attuned);
                    expect('source world item untouched', quantityOf(world), 4);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'grant-quantity-not-capped',
            tier: 'headless',
            group: 'Grant',
            label: 'A grant is not limited by the source document own quantity',
            note: 'A grant takes nothing, so the source stack is not stock. A compendium crowbar reads 1 '
                + 'because that is what one crowbar is. INSUFFICIENT_QUANTITY must be unreachable here.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const target = await tempActor('character', 'cap-target');
                    made.push(target);
                    const world = await Item.create(lootData('Harness Cap Crowbar', { system: { quantity: 1 } }));
                    made.push(world);

                    const single = await inv.grantItem({
                        targetActorUuid: target.uuid, itemUuid: world.uuid, quantity: 5
                    });
                    expect('granting five from a row of one succeeded', single.ok, true);
                    expect('and five arrived', quantityOf(target.items.get(single.targetItemId)), 5);
                    expect('the source row is untouched', quantityOf(world), 1);

                    const batch = await inv.grantItems({
                        targetActorUuid: target.uuid,
                        items: [{ itemUuid: world.uuid, quantity: 7 }]
                    });
                    expect('the batch path agrees', batch.ok, true);
                    expect('and merged to twelve', quantityOf(target.items.get(single.targetItemId)), 12);

                    // The check that DOES protect a caller is unchanged: an item with no quantity
                    // in its schema cannot arrive as a stack of three.
                    const unstackable = await inv.grantItem({
                        targetActorUuid: target.uuid,
                        itemData: { name: 'Harness Cap Singleton', type: 'loot', system: { weight: { value: 1, units: 'lb' } } },
                        quantity: 3
                    });
                    expect('an unstackable item still refuses a quantity above one',
                        unstackable.code, inv.CODES.INVALID_QUANTITY);
                    expect('and nothing extra was created', target.items.size, 1);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'grant-rejections',
            tier: 'headless',
            group: 'Grant',
            label: 'Rejections return a code and change nothing',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const target = await tempActor('character', 'reject-target');
                    made.push(target);
                    const feat = await Item.create({ name: 'Harness Feat', type: 'feat' });
                    made.push(feat);
                    const widget = await Item.create(lootData('Harness Reject Widget', { system: { quantity: 2 } }));
                    made.push(widget);

                    expect('non-physical type refused',
                        (await inv.grantItem({ targetActorUuid: target.uuid, itemUuid: feat.uuid })).code,
                        inv.CODES.ITEM_NOT_TRANSFERABLE);
                    expect('zero quantity refused',
                        (await inv.grantItem({ targetActorUuid: target.uuid, itemUuid: widget.uuid, quantity: 0 })).code,
                        inv.CODES.INVALID_QUANTITY);
                    expect('unresolvable uuid refused',
                        (await inv.grantItem({ targetActorUuid: target.uuid, itemUuid: 'Item.nope' })).code,
                        inv.CODES.ITEM_NOT_FOUND);
                    expect('missing source refused',
                        (await inv.grantItem({ targetActorUuid: target.uuid })).code,
                        inv.CODES.ITEM_NOT_FOUND);
                    expect('bad target actor refused',
                        (await inv.grantItem({ targetActorUuid: 'Actor.nope', itemUuid: widget.uuid })).code,
                        inv.CODES.TARGET_ACTOR_NOT_FOUND);

                    expect('nothing was created', target.items.size, 0);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'grant-items-batch',
            tier: 'headless',
            group: 'Grant',
            label: 'grantItems is index-aligned and batches the creates',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'batch-target');
                    made.push(target);
                    const a = await Item.create(lootData('Harness Batch A', { system: { quantity: 5 } }));
                    const b = await Item.create(lootData('Harness Batch B', { system: { quantity: 5 } }));
                    made.push(a, b);

                    const result = await api.inventory.grantItems({
                        targetActorUuid: target.uuid,
                        items: [
                            { itemUuid: a.uuid, quantity: 2 },
                            { itemUuid: 'Item.nope' },
                            { itemUuid: b.uuid, quantity: 1 }
                        ]
                    });
                    expect('top-level ok is false when one entry failed', result.ok, false);
                    expect('results length matches items length', result.results.length, 3);
                    expect('entry 0 succeeded', result.results[0].ok, true);
                    expect('entry 1 failed with a code', result.results[1].code, api.inventory.CODES.ITEM_NOT_FOUND);
                    expect('entry 2 succeeded', result.results[2].ok, true);
                    expect('two rows created', target.items.size, 2);
                } finally {
                    await cleanup(made);
                }
            }
        },

        {
            id: 'grant-items-coalesces',
            tier: 'headless',
            group: 'Grant',
            label: 'Duplicate entries in one batch coalesce into one row',
            note: 'The candidate search only sees documents that exist, so a payload queued earlier in the same call is invisible to it. Without coalescing, a Take All over a corpse holding two identical stacks splits them.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'coalesce');
                    made.push(target);
                    const world = await Item.create(lootData('Harness Coalesce Widget', { system: { quantity: 30 } }));
                    made.push(world);

                    const result = await api.inventory.grantItems({
                        targetActorUuid: target.uuid,
                        items: [
                            { itemUuid: world.uuid, quantity: 3 },
                            { itemUuid: world.uuid, quantity: 2 },
                            { itemUuid: world.uuid, quantity: 1 }
                        ]
                    });
                    expect('batch succeeded', result.ok, true);
                    expect('ONE row, not three', target.items.size, 1);
                    const row = target.items.contents[0];
                    expect('quantities summed', quantityOf(row), 6);
                    expect('every entry reports the row it landed in',
                        result.results.every(entry => entry.targetItemId === row.id), true);
                    expect('the first entry created the row', result.results[0].coalesced, undefined);
                    expect('later entries report coalesced', result.results[1].coalesced, true);
                    expect('and are not reported as merged', result.results[1].merged, false);

                    // A second batch of the same thing must now MERGE into the existing row.
                    const second = await api.inventory.grantItems({
                        targetActorUuid: target.uuid,
                        items: [{ itemUuid: world.uuid, quantity: 4 }, { itemUuid: world.uuid, quantity: 1 }]
                    });
                    expect('second batch succeeded', second.ok, true);
                    expect('still one row', target.items.size, 1);
                    expect('merged into the existing row', quantityOf(target.items.contents[0]), 11);
                    expect('reported as a merge this time', second.results[0].merged, true);
                } finally {
                    await cleanup(made);
                }
            }
        },
        // ---------- merging ----------
        {
            id: 'transient-flag-registry',
            tier: 'headless',
            group: 'Merging',
            label: 'Registering a third-party transient flag makes merging deterministic',
            note: 'Squire stamps coffee-pub-squire.isNew on EVERY item created on an owned actor, in a second write that lands asynchronously. Undeclared, that makes identical items merge or not depending on timing - which is what this suite caught. A consumer cannot know another module does this, so the writer declares it.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;

                // Declared here rather than by Squire only because Squire has not shipped the call
                // yet. Once it does, this becomes a no-op assertion that the registry already holds it.
                inv.registerTransientFlag('coffee-pub-squire.isNew');
                expect.ok('registry holds the declared path',
                    inv.getTransientFlags().includes('coffee-pub-squire.isNew'));
                expect('a malformed path is refused', inv.registerTransientFlag('nodots'), false);
                log(`registry: ${JSON.stringify(inv.getTransientFlags())}`);

                const made = [];
                try {
                    const target = await tempActor('character', 'registry-target');
                    const source = await tempActor('npc', 'registry-source');
                    made.push(target, source);

                    // Create on the target first and give the async stamp time to land, so the two
                    // sides genuinely differ in that flag at compare time - the exact asymmetry.
                    const [held] = await target.createEmbeddedDocuments('Item', [lootData('Harness Registry Widget', { system: { quantity: 10 } })]);
                    await new Promise(resolve => setTimeout(resolve, 400));
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Registry Widget', { system: { quantity: 4 } })]);

                    const before = { existing: snapshot(held), incoming: snapshot(item) };
                    log(`existing flags before: ${JSON.stringify(before.existing.flags)}`);
                    log(`incoming flags before: ${JSON.stringify(before.incoming.flags)}`);

                    const result = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 2
                    });
                    if (!result.merged) explainNoMerge(log, before.existing, before.incoming);
                    expect('a registered transient flag no longer blocks the merge', result.merged, true);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'merge-basic',
            tier: 'headless',
            group: 'Merging',
            label: 'Identical grants merge; separate mode does not',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'merge-target');
                    made.push(target);
                    const world = await Item.create(lootData('Harness Merge Widget', { system: { quantity: 9 } }));
                    made.push(world);

                    const first = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: world.uuid, quantity: 2 });
                    const second = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: world.uuid, quantity: 3 });
                    expect('second grant merged', second.merged, true);
                    expect('merge reused the same row', second.targetItemId, first.targetItemId);
                    expect('one row only', target.items.size, 1);
                    expect('quantities summed', quantityOf(target.items.get(first.targetItemId)), 5);

                    const third = await api.inventory.grantItem({
                        targetActorUuid: target.uuid, itemUuid: world.uuid, quantity: 1, stack: 'separate'
                    });
                    expect('separate did not merge', third.merged, false);
                    expect('now two rows', target.items.size, 2);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'merge-negatives',
            tier: 'headless',
            group: 'Merging',
            label: 'A real difference blocks the merge without failing the grant',
            note: 'Every case must land as its own row with ok:true, merged:false — never an error.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'merge-neg');
                    made.push(target);

                    const base = await Item.create(lootData('Harness Diff Widget', { system: { quantity: 5 } }));
                    made.push(base);
                    const seeded = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: base.uuid, quantity: 1 });
                    expect.ok('seed grant succeeded', seeded.ok);

                    // Same name, different system data.
                    const edited = await Item.create(lootData('Harness Diff Widget', {
                        system: { quantity: 5, description: { value: '<p>hand edited</p>' } }
                    }));
                    made.push(edited);
                    const differing = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: edited.uuid, quantity: 1 });
                    expect('differing system still succeeds', differing.ok, true);
                    expect('differing system does not merge', differing.merged, false);

                    // Same name, different undeclared flag.
                    const flagged = await Item.create(lootData('Harness Diff Widget', {
                        system: { quantity: 5 }, flags: { 'coffee-pub-blacksmith': { harnessMarker: 'x' } }
                    }));
                    made.push(flagged);
                    const flagDiff = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: flagged.uuid, quantity: 1 });
                    expect('differing flag does not merge', flagDiff.merged, false);

                    // Same flag, but declared transient — must merge now.
                    const flagged2 = await Item.create(lootData('Harness Diff Widget', {
                        system: { quantity: 5 }, flags: { 'coffee-pub-blacksmith': { harnessMarker: 'y' } }
                    }));
                    made.push(flagged2);
                    const ignored = await api.inventory.grantItem({
                        targetActorUuid: target.uuid, itemUuid: flagged2.uuid, quantity: 1,
                        ignoreFlags: ['coffee-pub-blacksmith.harnessMarker']
                    });
                    expect('declared transient flag is ignored for identity', ignored.merged, true);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'merge-source-one-sided',
            tier: 'headless',
            group: 'Merging',
            label: 'A missing compendiumSource is unknown, not different',
            note: 'Artificer\'s default world state: a pack copy with no source and a world copy with one, identical otherwise. Requiring a source, or blocking on a one-sided one, would make stacking a coin flip.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'source-one-sided');
                    made.push(target);

                    const unsourced = await Item.create(lootData('Harness OneSided Widget', { system: { quantity: 5 } }));
                    made.push(unsourced);
                    const sourced = await Item.create(lootData('Harness OneSided Widget', {
                        system: { quantity: 5 },
                        _stats: { compendiumSource: 'Compendium.harness.fake.Item.aaaaaaaaaaaaaaaa' }
                    }));
                    made.push(sourced);
                    if (!sourced._source?._stats?.compendiumSource) {
                        log('Foundry did not preserve _stats.compendiumSource on the fixture -- cannot test this rule here.');
                        return;
                    }

                    await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: unsourced.uuid, quantity: 1 });
                    const mixed = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: sourced.uuid, quantity: 1 });
                    expect('one-sided source still merges', mixed.merged, true);
                    expect('one row', target.items.size, 1);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'merge-source-conflict',
            tier: 'headless',
            group: 'Merging',
            label: 'Two present-but-different sources do not merge',
            note: 'The row on the target must itself carry a source for this to be testable. A merge only bumps quantity -- it deliberately does not adopt the incoming item\'s provenance -- so seeding with an unsourced item first would leave the row unsourced and every later grant would be another one-sided case.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'source-conflict');
                    made.push(target);

                    const sourceA = await Item.create(lootData('Harness Conflict Widget', {
                        system: { quantity: 5 },
                        _stats: { compendiumSource: 'Compendium.harness.fake.Item.aaaaaaaaaaaaaaaa' }
                    }));
                    const sourceB = await Item.create(lootData('Harness Conflict Widget', {
                        system: { quantity: 5 },
                        _stats: { compendiumSource: 'Compendium.harness.fake.Item.bbbbbbbbbbbbbbbb' }
                    }));
                    made.push(sourceA, sourceB);
                    if (!sourceA._source?._stats?.compendiumSource || !sourceB._source?._stats?.compendiumSource) {
                        log('Foundry did not preserve _stats.compendiumSource on the fixtures -- cannot test this rule here.');
                        return;
                    }

                    // Seed with a SOURCED item, so the row on the target carries a source of its own.
                    const seeded = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: sourceA.uuid, quantity: 1 });
                    expect.ok('seed grant succeeded', seeded.ok);

                    // The created row must have kept the source, or this check proves nothing.
                    const row = target.items.get(seeded.targetItemId);
                    const rowSource = row?._source?._stats?.compendiumSource ?? null;
                    if (!rowSource) {
                        log('The created row did not retain _stats.compendiumSource, so both sides cannot disagree here.');
                        log('That is worth knowing on its own: provenance is not surviving the create.');
                        expect.ok('created row retains its compendiumSource', false);
                        return;
                    }

                    const conflicting = await api.inventory.grantItem({ targetActorUuid: target.uuid, itemUuid: sourceB.uuid, quantity: 1 });
                    expect('two disagreeing sources do not merge', conflicting.merged, false);
                    expect('and it still succeeded', conflicting.ok, true);
                    expect('so there are two rows', target.items.size, 2);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'merge-across-creation-paths',
            tier: 'headless',
            group: 'Merging',
            label: 'A raw-created row merges with an API-built payload',
            note: 'A corpse row and a recipient stack are created by different paths. If creation path alone blocks a merge, merging fails in practice far more often than intended.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const target = await tempActor('character', 'path-target');
                    const source = await tempActor('npc', 'path-source');
                    made.push(target, source);

                    // Raw create on the recipient, exactly as a consumer or a loot table would.
                    const [held] = await target.createEmbeddedDocuments('Item', [lootData('Harness Path Widget', { system: { quantity: 20 } })]);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Path Widget', { system: { quantity: 5 } })]);

                    const before = { existing: snapshot(held), incoming: snapshot(item) };
                    const result = await api.inventory.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 3
                    });
                    expect('transfer succeeded', result.ok, true);
                    if (!result.merged) explainNoMerge(log, before.existing, before.incoming);
                    expect('creation path alone does not block the merge', result.merged, true);
                    if (result.merged) expect('quantities summed', quantityOf(target.items.get(held.id)), 23);
                } finally {
                    await cleanup(made);
                }
            }
        },
        // ---------- transfer ----------
        {
            id: 'transfer-basic',
            tier: 'headless',
            group: 'Transfer',
            label: 'Partial then full transfer, with derived stackability',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const source = await tempActor('npc', 'corpse');
                    const target = await tempActor('character', 'looter');
                    made.push(source, target);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Dagger', { system: { quantity: 6 } })]);

                    const partial = await api.inventory.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 3
                    });
                    expect('partial transfer ok', partial.ok, true);
                    expect('source remaining', partial.sourceRemaining, 3);
                    expect('source not deleted', partial.sourceDeleted, false);
                    expect('source quantity actually reduced', quantityOf(source.items.get(item.id)), 3);
                    expect('target received 3', quantityOf(target.items.get(partial.targetItemId)), 3);

                    const rest = await api.inventory.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id
                    });
                    expect('omitting quantity takes the whole stack', rest.quantity, 3);
                    expect('source deleted', rest.sourceDeleted, true);
                    expect('source has no items', source.items.size, 0);
                    expect('target merged to 6', quantityOf(target.items.get(rest.targetItemId)), 6);
                    expect('target has one row', target.items.size, 1);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-rejections',
            tier: 'headless',
            group: 'Transfer',
            label: 'Over-draw and same-actor are refused with nothing created',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const source = await tempActor('npc', 'reject-src');
                    const target = await tempActor('character', 'reject-tgt');
                    made.push(source, target);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Scarce', { system: { quantity: 6 } })]);

                    const over = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 10
                    });
                    expect('over-draw code', over.code, inv.CODES.INSUFFICIENT_QUANTITY);
                    expect('reports requested', over.requested, 10);
                    expect('reports available', over.available, 6);
                    expect('nothing created on target', target.items.size, 0);
                    expect('source untouched', quantityOf(source.items.get(item.id)), 6);

                    const same = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: source.uuid, itemId: item.id, quantity: 1
                    });
                    expect('same actor refused', same.code, inv.CODES.SAME_ACTOR);

                    const missing = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: 'nope', quantity: 1
                    });
                    expect('missing item refused', missing.code, inv.CODES.SOURCE_ITEM_NOT_FOUND);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-token-actor',
            tier: 'headless',
            group: 'Transfer',
            label: 'An unlinked token actor resolves as a source',
            note: 'The capability game.actors.get cannot provide, and the form every corpse takes.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                if (!canvas?.scene) {
                    log('No active scene — skipped. Open a scene and re-run.');
                    return;
                }
                const made = [];
                let token = null;
                try {
                    const proto = await tempActor('npc', 'token-src');
                    const target = await tempActor('character', 'token-tgt');
                    made.push(proto, target);
                    await proto.createEmbeddedDocuments('Item', [lootData('Harness Token Loot', { system: { quantity: 4 } })]);

                    const [created] = await canvas.scene.createEmbeddedDocuments('Token', [{
                        name: proto.name, actorId: proto.id, actorLink: false, x: 0, y: 0, hidden: true
                    }]);
                    token = created;

                    const tokenActor = token.actor;
                    expect.ok('token actor is synthetic', tokenActor?.uuid?.includes('Token.'));
                    const itemId = tokenActor.items.find(i => i.name === 'Harness Token Loot')?.id;
                    expect.ok('item present on token actor', Boolean(itemId));

                    const result = await api.inventory.transferItem({
                        sourceActorUuid: tokenActor.uuid, targetActorUuid: target.uuid, itemId, quantity: 2
                    });
                    expect('token-actor uuid resolved and transferred', result.ok, true);
                    expect('target received 2', quantityOf(target.items.get(result.targetItemId)), 2);
                    expect('token actor reduced to 2', quantityOf(tokenActor.items.get(itemId)), 2);
                } finally {
                    if (token) { try { await token.delete(); } catch (_) { /* gone */ } }
                    await cleanup(made);
                }
            }
        },
        {
            id: 'container-rules',
            tier: 'headless',
            group: 'Transfer',
            label: 'An empty container moves; a packed one is refused with a count',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const source = await tempActor('npc', 'bag-src');
                    const target = await tempActor('character', 'bag-tgt');
                    made.push(source, target);

                    const [empty] = await source.createEmbeddedDocuments('Item', [{ name: 'Harness Empty Bag', type: 'container' }]);
                    const emptyResult = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: empty.id
                    });
                    expect('empty container transfers', emptyResult.ok, true);

                    const [bag] = await source.createEmbeddedDocuments('Item', [{ name: 'Harness Packed Bag', type: 'container' }]);
                    await source.createEmbeddedDocuments('Item', [
                        lootData('Harness Bagged A', { system: { quantity: 1, container: bag.id } }),
                        lootData('Harness Bagged B', { system: { quantity: 1, container: bag.id } })
                    ]);
                    const packed = await inv.transferItem({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: bag.id
                    });
                    expect('packed container refused', packed.code, inv.CODES.CONTAINER_HAS_CONTENTS);
                    expect('reports how many to unpack', packed.contentCount, 2);
                    expect.ok('bag still on the source', Boolean(source.items.get(bag.id)));
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'container-not-inherited',
            tier: 'headless',
            group: 'Transfer',
            label: 'An item taken out of a bag arrives at root and stacks',
            note: 'Regression. Containment used to be carried over from the source, so looted contents '
                + 'arrived pointing at a bag that is not on the recipient, and matched nothing on merge.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'inherit-src');
                    const looter = await tempActor('character', 'inherit-tgt');
                    made.push(corpse, looter);

                    // The looter is already carrying the same arrows, loose. This is the case the
                    // defect broke: the arrival could not merge with them.
                    await looter.createEmbeddedDocuments('Item', [
                        lootData('Harness Inherit Arrows', { system: { quantity: 20 } })
                    ]);

                    const [bag] = await corpse.createEmbeddedDocuments('Item', [{ name: 'Harness Inherit Bag', type: 'container' }]);
                    const [bagged] = await corpse.createEmbeddedDocuments('Item', [
                        lootData('Harness Inherit Arrows', { system: { quantity: 5, container: bag.id } })
                    ]);
                    expect('fixture really is inside the bag', bagged._source.system.container, bag.id);

                    const result = await inv.transferItem({
                        sourceActorUuid: corpse.uuid, targetActorUuid: looter.uuid, itemId: bagged.id
                    });
                    expect('transfer succeeded', result.ok, true);
                    expect('it merged with the arrows already carried', result.merged, true);

                    const arrived = looter.items.get(result.targetItemId);
                    expect('one row on the looter, not two', looter.items.size, 1);
                    expect('quantities summed', quantityOf(arrived), 25);
                    expect('containment was not inherited', arrived?._source?.system?.container ?? null, null);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'container-placement',
            tier: 'headless',
            group: 'Grant',
            label: 'A grant can name the container it lands in',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const shopkeeper = await tempActor('npc', 'shelf-owner');
                    made.push(shopkeeper);
                    const [shelf] = await shopkeeper.createEmbeddedDocuments('Item', [{ name: 'Harness Shelf', type: 'container' }]);

                    const placed = await inv.grantItem({
                        targetActorUuid: shopkeeper.uuid,
                        itemData: lootData('Harness Shelved Rope', { system: { quantity: 2 } }),
                        container: shelf.id
                    });
                    expect('grant into a container succeeded', placed.ok, true);
                    expect('it landed in the shelf',
                        shopkeeper.items.get(placed.targetItemId)?._source?.system?.container, shelf.id);

                    // The same item at root is in a different place, so it is a different row.
                    const loose = await inv.grantItem({
                        targetActorUuid: shopkeeper.uuid,
                        itemData: lootData('Harness Shelved Rope', { system: { quantity: 2 } })
                    });
                    expect('the root grant succeeded', loose.ok, true);
                    expect('it did not merge across containers', loose.merged, false);
                    expect('and it is at root', shopkeeper.items.get(loose.targetItemId)?._source?.system?.container ?? null, null);

                    const again = await inv.grantItem({
                        targetActorUuid: shopkeeper.uuid,
                        itemData: lootData('Harness Shelved Rope', { system: { quantity: 3 } }),
                        container: shelf.id
                    });
                    expect('a second shelf grant merged', again.merged, true);
                    expect('into the row already on that shelf', again.targetItemId, placed.targetItemId);
                    expect('quantity summed on the shelf', quantityOf(shopkeeper.items.get(placed.targetItemId)), 5);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'container-placement-rejections',
            tier: 'headless',
            group: 'Grant',
            label: 'An unusable container id is refused, not dropped to root',
            note: 'Silently ignoring it would leave stock loose on an NPC with nothing in the result saying so.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const target = await tempActor('character', 'badshelf');
                    made.push(target);
                    const [notABag] = await target.createEmbeddedDocuments('Item', [lootData('Harness Not A Bag')]);

                    const unknown = await inv.grantItem({
                        targetActorUuid: target.uuid,
                        itemData: lootData('Harness Ghost Shelf Item'),
                        container: 'nosuchid00000000'
                    });
                    expect('an unknown container id is refused', unknown.code, inv.CODES.CONTAINER_NOT_FOUND);

                    const wrongType = await inv.grantItem({
                        targetActorUuid: target.uuid,
                        itemData: lootData('Harness Wrong Type Item'),
                        container: notABag.id
                    });
                    expect('an id that is not a container is refused', wrongType.code, inv.CODES.CONTAINER_NOT_FOUND);
                    expect('and the refusal says what it found', wrongType.type, 'loot');

                    // One bad container must not take the rest of the batch down with it.
                    const batch = await inv.grantItems({
                        targetActorUuid: target.uuid,
                        items: [
                            { itemData: lootData('Harness Batch Good') },
                            { itemData: lootData('Harness Batch Bad'), container: 'nosuchid00000000' }
                        ]
                    });
                    expect('top-level ok is false', batch.ok, false);
                    expect('the good entry still landed', batch.results[0].ok, true);
                    expect('only the bad entry was refused', batch.results[1].code, inv.CODES.CONTAINER_NOT_FOUND);

                    expect('nothing was created by the refusals', target.items.size, 2);
                } finally {
                    await cleanup(made);
                }
            }
        },

        // ---------- exchange ----------
        {
            id: 'exchange-three-party',
            tier: 'headless',
            group: 'Exchange',
            label: 'Goods to a recipient, coin from a payer, change back',
            note: 'The case a two-sided shape cannot express: buying a gift. Three parties, one settlement.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const merchant = await tempActor('npc', 'x3-merchant');
                    const payer = await tempActor('character', 'x3-payer');
                    const recipient = await tempActor('character', 'x3-recipient');
                    made.push(merchant, payer, recipient);

                    const [potion] = await merchant.createEmbeddedDocuments('Item', [
                        lootData('Harness X3 Potion', { system: { quantity: 4 } })
                    ]);
                    await payer.update({ 'system.currency.gp': 30 });
                    await merchant.update({ 'system.currency.gp': 50 });

                    const result = await inv.exchange({
                        transfers: [
                            { from: merchant.uuid, to: recipient.uuid, items: [{ itemId: potion.id, quantity: 1 }] },
                            { from: payer.uuid, to: merchant.uuid, currency: { gp: 25 } },
                            { from: merchant.uuid, to: payer.uuid, currency: { gp: 5 } }
                        ]
                    });

                    expect('the settlement succeeded', result.ok, true);
                    expect('one result per transfer', result.results.length, 3);
                    expect('the potion reached the recipient, not the payer', recipient.items.size, 1);
                    expect('the payer received no goods', payer.items.size, 0);
                    expect('merchant stock reduced', quantityOf(merchant.items.get(potion.id)), 3);
                    expect('payer paid 25 and got 5 back', currencyOf(payer, 'gp'), 10);
                    expect('merchant took 25 and paid 5', currencyOf(merchant, 'gp'), 70);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'exchange-atomic',
            tier: 'headless',
            group: 'Exchange',
            label: 'A refusal anywhere writes nothing at all',
            note: 'THE reason this primitive exists. Composing it from two calls leaves the coin moved and '
                + 'the goods not, which is the half-committed state the whole design refuses.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const merchant = await tempActor('npc', 'xa-merchant');
                    const buyer = await tempActor('character', 'xa-buyer');
                    made.push(merchant, buyer);

                    const [sword] = await merchant.createEmbeddedDocuments('Item', [
                        lootData('Harness XA Sword', { system: { quantity: 1 } })
                    ]);
                    await buyer.update({ 'system.currency.gp': 100 });

                    // The goods leg is fine; the coin leg asks for silver the buyer does not have.
                    const broke = await inv.exchange({
                        transfers: [
                            { from: merchant.uuid, to: buyer.uuid, items: [{ itemId: sword.id }] },
                            { from: buyer.uuid, to: merchant.uuid, currency: { sp: 5 } }
                        ]
                    });
                    expect('refused for the coin the buyer lacks', broke.code, inv.CODES.INSUFFICIENT_CURRENCY);
                    expect('the sword did not move', merchant.items.size, 1);
                    expect('the buyer received nothing', buyer.items.size, 0);
                    expect('no gold moved either', currencyOf(buyer, 'gp'), 100);

                    // Denominations are never converted, so 100 gp cannot pay 5 sp. That is the
                    // documented contract, and making change stays with the consumer.
                    expect('the refusal names the denomination', Object.keys(broke.shortfalls ?? {})[0], 'sp');

                    const badItem = await inv.exchange({
                        transfers: [
                            { from: buyer.uuid, to: merchant.uuid, currency: { gp: 10 } },
                            { from: merchant.uuid, to: buyer.uuid, items: [{ itemId: 'nosuchitem00000' }] }
                        ]
                    });
                    expect('refused for the missing item', badItem.code, inv.CODES.SOURCE_ITEM_NOT_FOUND);
                    expect('and it names the leg', badItem.index, 1);
                    expect('the coin from the earlier leg did not move', currencyOf(buyer, 'gp'), 100);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'exchange-copy-and-preserve',
            tier: 'headless',
            group: 'Exchange',
            label: 'copy leaves the template alone; preserveEmptySource keeps the row',
            note: 'The two stock policies. Infinite stock must not sell its template; finite stock must go '
                + 'out of stock rather than off the shelf.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const shop = await tempActor('npc', 'xc-shop');
                    const buyer = await tempActor('character', 'xc-buyer');
                    made.push(shop, buyer);

                    const [template] = await shop.createEmbeddedDocuments('Item', [
                        lootData('Harness XC Rope', { system: { quantity: 1 } })
                    ]);
                    const [finite] = await shop.createEmbeddedDocuments('Item', [
                        lootData('Harness XC Torch', { system: { quantity: 2 } })
                    ]);

                    const copied = await inv.exchange({
                        transfers: [{
                            from: shop.uuid, to: buyer.uuid, copy: true,
                            items: [{ itemId: template.id, quantity: 3 }]
                        }]
                    });
                    expect('the copy succeeded', copied.ok, true);
                    expect('three arrived even though the row reads one',
                        quantityOf(buyer.items.find(item => item.name === 'Harness XC Rope')), 3);
                    expect('the template is untouched', quantityOf(shop.items.get(template.id)), 1);
                    expect('and it reports no source remainder', copied.results[0].items[0].sourceRemaining, null);
                    expect('and reports itself as a copy', copied.results[0].items[0].copied, true);

                    const sold = await inv.exchange({
                        transfers: [{
                            from: shop.uuid, to: buyer.uuid, preserveEmptySource: true,
                            items: [{ itemId: finite.id, quantity: 2 }]
                        }]
                    });
                    expect('the sale succeeded', sold.ok, true);
                    expect.ok('the shelf row survived being emptied', Boolean(shop.items.get(finite.id)));
                    expect('and it reads zero', quantityOf(shop.items.get(finite.id)), 0);
                    expect('reported as not deleted', sold.results[0].items[0].sourceDeleted, false);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'exchange-guards',
            tier: 'headless',
            group: 'Exchange',
            label: 'Per-leg same-actor, repeat draws, and an empty call',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const shop = await tempActor('npc', 'xg-shop');
                    const buyer = await tempActor('character', 'xg-buyer');
                    made.push(shop, buyer);
                    const [stock] = await shop.createEmbeddedDocuments('Item', [
                        lootData('Harness XG Arrows', { system: { quantity: 10 } })
                    ]);

                    expect('an empty call is refused',
                        (await inv.exchange({ transfers: [] })).code, inv.CODES.EXCHANGE_EMPTY);

                    expect('a leg from an actor to itself is refused',
                        (await inv.exchange({ transfers: [{ from: shop.uuid, to: shop.uuid, currency: { gp: 1 } }] })).code,
                        inv.CODES.SAME_ACTOR);

                    // Two draws on one row: each would validate against the full stack.
                    const twice = await inv.exchange({
                        transfers: [
                            { from: shop.uuid, to: buyer.uuid, items: [{ itemId: stock.id, quantity: 6 }] },
                            { from: shop.uuid, to: buyer.uuid, items: [{ itemId: stock.id, quantity: 6 }] }
                        ]
                    });
                    expect('a repeated draw is refused', twice.code, inv.CODES.DUPLICATE_ITEM);
                    expect('the stack is untouched', quantityOf(shop.items.get(stock.id)), 10);

                    // An Actor on both sides of one settlement is the ORDINARY case and must work.
                    await buyer.update({ 'system.currency.gp': 5 });
                    const ordinary = await inv.exchange({
                        transfers: [
                            { from: shop.uuid, to: buyer.uuid, items: [{ itemId: stock.id, quantity: 2 }] },
                            { from: buyer.uuid, to: shop.uuid, currency: { gp: 5 } }
                        ]
                    });
                    expect('the merchant sending and receiving in one call is fine', ordinary.ok, true);
                    expect('stock reduced', quantityOf(shop.items.get(stock.id)), 8);
                    expect('coin moved', currencyOf(shop, 'gp'), 5);
                } finally {
                    await cleanup(made);
                }
            }
        },

        {
            id: 'transfer-items-batch',
            tier: 'headless',
            group: 'Transfer',
            label: 'Take All moves everything valid and skips what it cannot',
            note: 'Per-item results, not all-or-nothing: one packed container must not block the other rows.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'takeall-src');
                    const looter = await tempActor('character', 'takeall-tgt');
                    made.push(corpse, looter);

                    const [arrows] = await corpse.createEmbeddedDocuments('Item', [lootData('Harness TA Arrows', { system: { quantity: 20 } })]);
                    const [dagger] = await corpse.createEmbeddedDocuments('Item', [lootData('Harness TA Dagger', { system: { quantity: 6 } })]);
                    const [bag] = await corpse.createEmbeddedDocuments('Item', [{ name: 'Harness TA Bag', type: 'container' }]);
                    await corpse.createEmbeddedDocuments('Item', [lootData('Harness TA Bagged', { system: { quantity: 1, container: bag.id } })]);

                    const result = await inv.transferItems({
                        sourceActorUuid: corpse.uuid,
                        targetActorUuid: looter.uuid,
                        items: [
                            { itemId: arrows.id, quantity: 5 },   // partial
                            { itemId: dagger.id },                // whole stack
                            { itemId: bag.id },                   // packed: must be refused
                            { itemId: 'nope' }                    // missing
                        ]
                    });

                    expect('top-level ok is false when an entry failed', result.ok, false);
                    expect('results are index-aligned', result.results.length, 4);

                    expect('partial take succeeded', result.results[0].ok, true);
                    expect('partial reports the remainder', result.results[0].sourceRemaining, 15);
                    expect('partial did not delete the source row', result.results[0].sourceDeleted, false);
                    expect('whole take succeeded', result.results[1].ok, true);
                    expect('whole take deleted the source row', result.results[1].sourceDeleted, true);
                    expect('packed container refused', result.results[2].code, inv.CODES.CONTAINER_HAS_CONTENTS);
                    expect('refusal names the item', result.results[2].itemId, bag.id);
                    expect('missing item refused', result.results[3].code, inv.CODES.SOURCE_ITEM_NOT_FOUND);

                    expect('arrows reduced on the corpse', quantityOf(corpse.items.get(arrows.id)), 15);
                    expect('dagger gone from the corpse', corpse.items.get(dagger.id), undefined);
                    expect.ok('bag still on the corpse', Boolean(corpse.items.get(bag.id)));
                    expect('looter received 5 arrows', quantityOf(looter.items.find(i => i.name === 'Harness TA Arrows')), 5);
                    expect('looter received 6 daggers', quantityOf(looter.items.find(i => i.name === 'Harness TA Dagger')), 6);
                    expect('looter got nothing else', looter.items.size, 2);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-items-write-count',
            tier: 'headless',
            group: 'Transfer',
            label: 'A Take All costs at most two writes per actor',
            note: 'The whole reason the batch form exists. N single transfers would be N writes per actor, and dnd5e recomputes encumbrance per write against one fixed effect id.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'wc-src');
                    const looter = await tempActor('character', 'wc-tgt');
                    made.push(corpse, looter);

                    const rows = [];
                    for (let n = 0; n < 5; n++) {
                        const [row] = await corpse.createEmbeddedDocuments('Item', [lootData(`Harness WC ${n}`, { system: { quantity: 4 } })]);
                        rows.push(row);
                    }
                    // Two partial takes and three whole ones, so both source paths are exercised.
                    const items = rows.map((row, n) => (n < 2 ? { itemId: row.id, quantity: 2 } : { itemId: row.id }));

                    const { value, counts } = await countWrites([corpse, looter], () => api.inventory.transferItems({
                        sourceActorUuid: corpse.uuid, targetActorUuid: looter.uuid, items
                    }));

                    log(`source writes: ${JSON.stringify(counts.get(corpse.id))}`);
                    log(`target writes: ${JSON.stringify(counts.get(looter.id))}`);
                    expect('every entry succeeded', value.ok, true);
                    expect.ok('source took at most two writes for five items', totalWrites(counts, corpse) <= 2);
                    expect.ok('target took at most two writes for five items', totalWrites(counts, looter) <= 2);
                    expect('five rows arrived', looter.items.size, 5);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-items-duplicate',
            tier: 'headless',
            group: 'Transfer',
            label: 'The same item twice in one batch is refused, not summed',
            note: 'Two entries for one item make the per-entry quantity checks meaningless - together they could over-draw the stack.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'dup-src');
                    const looter = await tempActor('character', 'dup-tgt');
                    made.push(corpse, looter);
                    const [row] = await corpse.createEmbeddedDocuments('Item', [lootData('Harness Dup', { system: { quantity: 6 } })]);

                    const result = await inv.transferItems({
                        sourceActorUuid: corpse.uuid, targetActorUuid: looter.uuid,
                        items: [{ itemId: row.id, quantity: 4 }, { itemId: row.id, quantity: 4 }]
                    });
                    expect('first entry succeeded', result.results[0].ok, true);
                    expect('duplicate refused', result.results[1].code, inv.CODES.DUPLICATE_ITEM);
                    expect('the stack was not over-drawn', quantityOf(corpse.items.get(row.id)), 2);
                    expect('looter received only the first request', quantityOf(looter.items.contents[0]), 4);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-items-rollback',
            tier: 'headless',
            group: 'Rollback',
            label: 'A failed batch source reduction reverts the whole target grant',
            note: 'Created rows deleted, merged rows decremented by exactly what was added. A merged row must never be deleted.',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'brb-src');
                    const looter = await tempActor('character', 'brb-tgt');
                    made.push(corpse, looter);

                    // The looter already holds one of the two things being taken, so the batch does
                    // one merge and one create - both rollback paths in a single failure.
                    const world = await Item.create(lootData('Harness BRB Held', { system: { quantity: 30 } }));
                    made.push(world);
                    const seeded = await inv.grantItem({ targetActorUuid: looter.uuid, itemUuid: world.uuid, quantity: 12 });
                    expect.ok('seed succeeded', seeded.ok);

                    const [held] = await corpse.createEmbeddedDocuments('Item', [lootData('Harness BRB Held', { system: { quantity: 5 } })]);
                    const [fresh] = await corpse.createEmbeddedDocuments('Item', [lootData('Harness BRB Fresh', { system: { quantity: 3 } })]);

                    // Force the batched source reduction to fail.
                    const originalUpdate = corpse.updateEmbeddedDocuments.bind(corpse);
                    const originalDelete = corpse.deleteEmbeddedDocuments.bind(corpse);
                    corpse.updateEmbeddedDocuments = () => { throw new Error('harness: forced source failure'); };
                    corpse.deleteEmbeddedDocuments = () => { throw new Error('harness: forced source failure'); };
                    let result;
                    try {
                        result = await inv.transferItems({
                            sourceActorUuid: corpse.uuid, targetActorUuid: looter.uuid,
                            items: [{ itemId: held.id, quantity: 2 }, { itemId: fresh.id, quantity: 1 }]
                        });
                    } finally {
                        delete corpse.updateEmbeddedDocuments;
                        delete corpse.deleteEmbeddedDocuments;
                    }

                    expect('reported a failure', result.ok, false);
                    expect.ok('codes name the source update or the rollback',
                        result.results.every(entry => [inv.CODES.SOURCE_UPDATE_FAILED, inv.CODES.ROLLBACK_FAILED].includes(entry.code)));
                    expect('the merged row is exactly whole again', quantityOf(looter.items.get(seeded.targetItemId)), 12);
                    expect.ok('the merged row still exists', Boolean(looter.items.get(seeded.targetItemId)));
                    expect('the created row was removed', looter.items.size, 1);
                    expect('the corpse is untouched', quantityOf(corpse.items.get(held.id)), 5);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'transfer-items-one-moment',
            tier: 'headless',
            group: 'Transfer',
            label: 'A bag and its contents in one call empties the bag but leaves it',
            note: 'Pins documented behaviour rather than finding a bug. Every entry is validated against the state at the START of the call, so a bag sent alongside its own contents is still packed as far as that call is concerned. A consumer clearing a hierarchy has to loop. If this check ever fails, someone has changed when validation happens - which would silently break the per-item result contract.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const corpse = await tempActor('npc', 'onepass-src');
                    const looter = await tempActor('character', 'onepass-tgt');
                    made.push(corpse, looter);

                    const [bag] = await corpse.createEmbeddedDocuments('Item', [{ name: 'Harness OnePass Bag', type: 'container' }]);
                    const contents = await corpse.createEmbeddedDocuments('Item', [
                        lootData('Harness OnePass A', { system: { quantity: 1, container: bag.id } }),
                        lootData('Harness OnePass B', { system: { quantity: 1, container: bag.id } })
                    ]);

                    // Everything at once, contents and bag together, exactly as a naive Loot All would.
                    const first = await inv.transferItems({
                        sourceActorUuid: corpse.uuid,
                        targetActorUuid: looter.uuid,
                        items: [...contents.map(item => ({ itemId: item.id })), { itemId: bag.id }]
                    });

                    expect('the contents moved', first.results[0].ok, true);
                    expect('both contents moved', first.results[1].ok, true);
                    expect('the bag was refused', first.results[2].code, inv.CODES.CONTAINER_HAS_CONTENTS);
                    expect('and reported the count it saw at validation time', first.results[2].contentCount, 2);
                    expect.ok('the bag is still on the corpse', Boolean(corpse.items.get(bag.id)));
                    expect('but it is empty now', corpse.items.filter(i => i.system?.container === bag.id).length, 0);
                    log('One pass leaves an empty bag. That is the contract, not a defect.');

                    // A second pass takes it, which is what a consumer loop does.
                    const second = await inv.transferItems({
                        sourceActorUuid: corpse.uuid, targetActorUuid: looter.uuid,
                        items: [{ itemId: bag.id }]
                    });
                    expect('a second pass takes the now-empty bag', second.results[0].ok, true);
                    expect('the corpse is clear', corpse.items.size, 0);
                } finally {
                    await cleanup(made);
                }
            }
        },
        // ---------- rollback ----------
        {
            id: 'rollback-after-merge',
            tier: 'headless',
            group: 'Rollback',
            label: 'Rollback after a MERGE decrements — it must not delete the row',
            note: 'The destructive case. A delete here would destroy the 20 the recipient already owned.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const source = await tempActor('npc', 'rb-merge-src');
                    const target = await tempActor('character', 'rb-merge-tgt');
                    made.push(source, target);

                    // Seed the recipient's stack THROUGH the API so both sides of the merge took
                    // the same creation path. A raw createEmbeddedDocuments seed is a different
                    // question - whether creation path alone can block a merge - and it has its
                    // own check below rather than being conflated with the rollback assertion.
                    const world = await Item.create(lootData('Harness Arrow', { system: { quantity: 40 } }));
                    made.push(world);
                    const seeded = await api.inventory.grantItem({
                        targetActorUuid: target.uuid, itemUuid: world.uuid, quantity: 20
                    });
                    expect.ok('seed grant succeeded', seeded.ok);
                    const held = target.items.get(seeded.targetItemId);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Arrow', { system: { quantity: 5 } })]);

                    // Force the source reduction to fail AFTER the grant has merged.
                    const beforeSnapshot = { existing: snapshot(held), incoming: snapshot(item) };
                    const original = item.update.bind(item);
                    item.update = () => { throw new Error('harness: forced source failure'); };
                    let result;
                    try {
                        result = await inv.transferItem({
                            sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 3
                        });
                    } finally {
                        item.update = original;
                    }

                    expect.ok('reported a failure', result.ok === false);
                    expect.ok('code names the source update or the rollback',
                        [inv.CODES.SOURCE_UPDATE_FAILED, inv.CODES.ROLLBACK_FAILED].includes(result.code));
                    if (result.merged !== true) explainNoMerge(log, beforeSnapshot.existing, beforeSnapshot.incoming);
                    expect('failure names the merge', result.merged, true);
                    expect('failure carries the granted quantity', result.quantity, 3);
                    expect('recipient is exactly whole again', quantityOf(target.items.get(held.id)), 20);
                    expect('recipient row still exists', target.items.size, 1);
                    expect('source stack untouched', quantityOf(source.items.get(item.id)), 5);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'rollback-after-create',
            tier: 'headless',
            group: 'Rollback',
            label: 'Rollback after a CREATE removes the row it created',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const source = await tempActor('npc', 'rb-create-src');
                    const target = await tempActor('character', 'rb-create-tgt');
                    made.push(source, target);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Orphan', { system: { quantity: 5 } })]);

                    const original = item.update.bind(item);
                    item.update = () => { throw new Error('harness: forced source failure'); };
                    let result;
                    try {
                        result = await api.inventory.transferItem({
                            sourceActorUuid: source.uuid, targetActorUuid: target.uuid, itemId: item.id, quantity: 2
                        });
                    } finally {
                        item.update = original;
                    }

                    expect.ok('reported a failure', result.ok === false);
                    expect('failure names the create', result.merged, false);
                    expect('created row was removed', target.items.size, 0);
                    expect('source stack untouched', quantityOf(source.items.get(item.id)), 5);
                } finally {
                    await cleanup(made);
                }
            }
        },

        // ---------- currency ----------
        {
            id: 'currency-transfer',
            tier: 'headless',
            group: 'Currency',
            label: 'Deltas move, and denominations are never converted',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const source = await tempActor('npc', 'coin-src');
                    const target = await tempActor('character', 'coin-tgt');
                    made.push(source, target);
                    await source.update({ 'system.currency.cp': 10, 'system.currency.sp': 20, 'system.currency.gp': 0 });
                    await target.update({ 'system.currency.cp': 1, 'system.currency.sp': 0, 'system.currency.gp': 0 });

                    const moved = await inv.transferCurrency({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, currency: { cp: 4, sp: 5 }
                    });
                    expect('transfer ok', moved.ok, true);
                    expect('source cp reduced', currencyOf(source, 'cp'), 6);
                    expect('source sp reduced', currencyOf(source, 'sp'), 15);
                    expect('target cp increased', currencyOf(target, 'cp'), 5);
                    expect('target sp increased', currencyOf(target, 'sp'), 5);

                    // 20 sp on hand, 0 gp: no exchange may happen.
                    const noConvert = await inv.transferCurrency({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, currency: { gp: 2 }
                    });
                    expect('no auto-conversion', noConvert.code, inv.CODES.INSUFFICIENT_CURRENCY);
                    expect.ok('shortfall reported for gp', Boolean(noConvert.shortfalls?.gp));
                    expect('sp untouched by the failed gp request', currencyOf(source, 'sp'), 15);
                    expect('target gp untouched', currencyOf(target, 'gp'), 0);
                }
                finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'currency-atomicity',
            tier: 'headless',
            group: 'Currency',
            label: 'A shortfall in one denomination moves none of the others',
            run: async ({ expect }) => {
                const api = requireApi('inventory');
                const inv = api.inventory;
                const made = [];
                try {
                    const source = await tempActor('npc', 'atomic-src');
                    const target = await tempActor('character', 'atomic-tgt');
                    made.push(source, target);
                    await source.update({ 'system.currency.cp': 50, 'system.currency.gp': 1 });

                    const result = await inv.transferCurrency({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, currency: { cp: 10, gp: 5 }
                    });
                    expect('refused', result.code, inv.CODES.INSUFFICIENT_CURRENCY);
                    expect('the affordable denomination did NOT move', currencyOf(source, 'cp'), 50);
                    expect('target received nothing', currencyOf(target, 'cp'), 0);

                    const bad = await inv.transferCurrency({
                        sourceActorUuid: source.uuid, targetActorUuid: target.uuid, currency: { zz: 1 }
                    });
                    expect('unknown denomination refused', bad.code, inv.CODES.INVALID_CURRENCY);
                    const negative = await inv.grantCurrency({ targetActorUuid: target.uuid, currency: { gp: -5 } });
                    expect('negative amount refused', negative.code, inv.CODES.INVALID_CURRENCY);
                } finally {
                    await cleanup(made);
                }
            }
        },

        // ---------- concurrency ----------
        {
            id: 'lock-serialisation',
            tier: 'headless',
            group: 'Concurrency',
            label: 'Concurrent takes of one stack conserve the total',
            note: 'A lost lock double-spends. Totals must balance exactly, however the race lands.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const source = await tempActor('npc', 'race-src');
                    const a = await tempActor('character', 'race-a');
                    const b = await tempActor('character', 'race-b');
                    made.push(source, a, b);
                    const [item] = await source.createEmbeddedDocuments('Item', [lootData('Harness Contested', { system: { quantity: 4 } })]);

                    const results = await Promise.all([
                        api.inventory.transferItem({ sourceActorUuid: source.uuid, targetActorUuid: a.uuid, itemId: item.id, quantity: 3 }),
                        api.inventory.transferItem({ sourceActorUuid: source.uuid, targetActorUuid: b.uuid, itemId: item.id, quantity: 3 })
                    ]);
                    const succeeded = results.filter(r => r.ok).length;
                    log(`outcomes: ${results.map(r => r.ok ? 'ok' : r.code).join(', ')}`);

                    const received = [a, b].reduce((sum, actor) => sum + (quantityOf(actor.items.contents[0]) ?? 0), 0);
                    const remaining = quantityOf(source.items.get(item.id)) ?? 0;
                    expect('exactly one over-draw was refused', succeeded, 1);
                    expect('nothing was created twice', received + remaining, 4);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'swap-no-deadlock',
            tier: 'headless',
            group: 'Concurrency',
            label: 'Simultaneous opposite-direction transfers both complete',
            note: 'Without sorted lock acquisition this hangs rather than failing.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                const made = [];
                try {
                    const a = await tempActor('character', 'swap-a');
                    const b = await tempActor('character', 'swap-b');
                    made.push(a, b);
                    const [itemA] = await a.createEmbeddedDocuments('Item', [lootData('Harness Swap A', { system: { quantity: 1 } })]);
                    const [itemB] = await b.createEmbeddedDocuments('Item', [lootData('Harness Swap B', { system: { quantity: 1 } })]);

                    const settled = await Promise.race([
                        Promise.all([
                            api.inventory.transferItem({ sourceActorUuid: a.uuid, targetActorUuid: b.uuid, itemId: itemA.id }),
                            api.inventory.transferItem({ sourceActorUuid: b.uuid, targetActorUuid: a.uuid, itemId: itemB.id })
                        ]),
                        new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 8000))
                    ]);
                    if (settled === 'TIMEOUT') {
                        expect.ok('swap completed rather than deadlocking', false);
                        log('DEADLOCK: neither transfer resolved within 8s. Check sorted lock acquisition.');
                        return;
                    }
                    expect('both transfers succeeded', settled.every(r => r.ok), true);
                    expect('a now holds b\'s item', a.items.contents.some(i => i.name === 'Harness Swap B'), true);
                    expect('b now holds a\'s item', b.items.contents.some(i => i.name === 'Harness Swap A'), true);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'one-write-per-actor',
            tier: 'headless',
            group: 'Concurrency',
            label: 'Arrival flags do not trigger dnd5e\'s encumbrance collision',
            note: 'Needs encumbrance tracking on. Watches console.error, because the rejection never reaches the caller. NOTE: with the Encumbrance Guard installed this passes regardless of how many writes a call makes, so it now tests the guard rather than our write discipline -- transfer-items-write-count is what proves the batching.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                let mode = 'none';
                try { mode = game.settings.get('dnd5e', 'encumbrance'); } catch (_) { /* unavailable */ }
                if (mode === 'none') {
                    log('dnd5e encumbrance tracking is off — dnd5e skips the recompute, so this cannot fire. Enable it to test.');
                    return;
                }
                const made = [];
                try {
                    // Strength is set AT CREATION, not by a follow-up update. dnd5e recomputes
                    // encumbrance on the Actor's own _onUpdate as well (dnd5e.mjs:39330), not only
                    // on descendant item writes - so an update-then-grant sequence manufactures the
                    // very collision this check exists to detect, and the first version of this
                    // check did exactly that.
                    const target = await Actor.create({
                        name: `${TEMP_PREFIX} encumber ${foundry.utils.randomID(4)}`,
                        type: 'character',
                        system: { abilities: { str: { value: 3 } } }
                    });
                    made.push(target);
                    const heavy = await Item.create(lootData('Harness Anvil', {
                        system: { quantity: 10, weight: { value: 40, units: 'lb' } }
                    }));
                    made.push(heavy);

                    const captured = await withConsoleErrors(async () => {
                        const result = await api.inventory.grantItem({
                            targetActorUuid: target.uuid,
                            itemUuid: heavy.uuid,
                            quantity: 5,
                            flags: { 'coffee-pub-blacksmith': { harnessArrived: true } }
                        });
                        expect('grant with flags succeeded', result.ok, true);
                        const arrived = target.items.get(result.targetItemId);
                        expect('flag was written in the same operation',
                            arrived?.getFlag('coffee-pub-blacksmith', 'harnessArrived'), true);
                    });

                    const collisions = captured.filter(line => line.includes('dnd5eencumbered'));
                    if (collisions.length) {
                        log(collisions[0]);
                        // Attribution matters: api.inventory makes ONE write. A collision means a
                        // second write landed on the same Actor from somewhere else. Squire's
                        // createItem hook does exactly that (setFlag after every item create), so
                        // name it rather than leaving this looking like our defect.
                        if (game.modules.get('coffee-pub-squire')?.active) {
                            log('EXTERNAL CAUSE: coffee-pub-squire createItem hook writes setFlag(isNew) after every');
                            log('item create on an owned Actor. That is the second write. api.inventory made one.');
                            log('Fix belongs in Squire: inject the flag via preCreateItem instead of a follow-up write.');
                        }
                    }
                    expect('no duplicate encumbrance effect id', collisions.length, 0);

                    // The batch form must behave the same with several heavy items at once.
                    const batchTarget = await Actor.create({
                        name: `${TEMP_PREFIX} encumber-batch ${foundry.utils.randomID(4)}`,
                        type: 'character',
                        system: { abilities: { str: { value: 3 } } }
                    });
                    made.push(batchTarget);
                    const batchErrors = await withConsoleErrors(async () => {
                        const result = await api.inventory.grantItems({
                            targetActorUuid: batchTarget.uuid,
                            items: [
                                { itemUuid: heavy.uuid, quantity: 3, flags: { 'coffee-pub-blacksmith': { harnessArrived: true } } },
                                { itemUuid: heavy.uuid, quantity: 2 },
                                { itemUuid: heavy.uuid, quantity: 1 }
                            ]
                        });
                        expect('batch grant succeeded', result.ok, true);
                    });
                    expect('batch produced no collision',
                        batchErrors.filter(line => line.includes('dnd5eencumbered')).length, 0);
                } finally {
                    await cleanup(made);
                }
            }
        },

        {
            id: 'guard-installed',
            tier: 'headless',
            group: 'Encumbrance guard',
            label: 'The guard is installed, or says why not',
            note: 'A guard against a dnd5e bug, not a Blacksmith feature. It declines on a fixed system, when switched off, or when the shape it depends on has moved -- and each of those is a pass, not a failure.',
            run: async ({ expect, log }) => {
                const { EncumbranceGuard } = await import('/modules/coffee-pub-blacksmith/scripts/manager-encumbrance-guard.js');
                const enabled = (() => {
                    try { return game.settings.get('coffee-pub-blacksmith', 'enableEncumbranceGuard'); } catch (_) { return null; }
                })();
                log(`setting: ${enabled} | installed: ${EncumbranceGuard.installed} | dnd5e ${game.system?.version}`);
                if (enabled === false) {
                    expect('switched off, so not installed', EncumbranceGuard.installed, false);
                    log('Guard is off by setting. Turn it on and reload to exercise the rest of this group.');
                    return;
                }
                expect('guard is installed', EncumbranceGuard.installed, true);
                expect.ok('nothing is stuck in flight at rest', EncumbranceGuard.pendingActors.length === 0);
            }
        },
        {
            id: 'guard-collapses-recomputes',
            tier: 'headless',
            group: 'Encumbrance guard',
            label: 'Many writes to one actor produce no duplicate-id rejection',
            note: 'The reproduction: several separate writes to one actor while it crosses an encumbrance threshold. Without the guard this is where dnd5e rejects the second effect create.',
            run: async ({ expect, log }) => {
                const api = requireApi('inventory');
                let mode = 'none';
                try { mode = game.settings.get('dnd5e', 'encumbrance'); } catch (_) { /* unavailable */ }
                if (mode === 'none') {
                    log('dnd5e encumbrance tracking is off -- dnd5e skips the recompute, so nothing to guard. Enable it to test.');
                    return;
                }
                const made = [];
                try {
                    // Strength set at creation: an actor update is itself a write that triggers a
                    // recompute (dnd5e.mjs:39330), so update-then-grant would add one of our own.
                    const target = await Actor.create({
                        name: `${TEMP_PREFIX} guard ${foundry.utils.randomID(4)}`,
                        type: 'character',
                        system: { abilities: { str: { value: 3 } } }
                    });
                    made.push(target);
                    const heavy = await Item.create(lootData('Harness Guard Anvil', {
                        system: { quantity: 20, weight: { value: 40, units: 'lb' } }
                    }));
                    made.push(heavy);

                    // Deliberately the pattern the batch forms exist to avoid: six separate calls,
                    // six writes, six recomputes. The guard is what makes this safe rather than the
                    // batching, which is the whole point of having it.
                    const captured = await withConsoleErrors(async () => {
                        for (let n = 0; n < 6; n++) {
                            const result = await api.inventory.grantItem({
                                targetActorUuid: target.uuid, itemUuid: heavy.uuid, quantity: 2, stack: 'separate'
                            });
                            expect.ok(`grant ${n} succeeded`, result.ok);
                        }
                    });

                    const collisions = captured.filter(line => line.includes('dnd5eencumbered'));
                    if (collisions.length) {
                        log(collisions[0]);
                        log('If the guard is installed this should be zero. Check for another module wrapping updateEncumbrance.');
                    }
                    expect('no duplicate encumbrance effect id across six writes', collisions.length, 0);

                    const { EncumbranceGuard } = await import('/modules/coffee-pub-blacksmith/scripts/manager-encumbrance-guard.js');
                    expect('the guard drained its queue', EncumbranceGuard.pendingActors.length, 0);
                } finally {
                    await cleanup(made);
                }
            }
        },
        {
            id: 'guard-rethrows-real-errors',
            tier: 'headless',
            group: 'Encumbrance guard',
            label: 'A failure that is NOT the duplicate id still propagates',
            note: 'The narrow catch is the part most likely to be widened by someone debugging. If this check ever fails, the guard has started hiding real failures in a path nobody watches.',
            run: async ({ expect, log }) => {
                const actorClass = CONFIG?.Actor?.documentClass;
                if (typeof actorClass?.prototype?.updateEncumbrance !== 'function') {
                    log('Actor#updateEncumbrance not present -- nothing to test.');
                    return;
                }
                const made = [];
                try {
                    const target = await tempActor('character', 'guard-throw');
                    made.push(target);

                    // Replace the recompute on this ONE instance with something that fails for an
                    // unrelated reason, then call it through whatever wrapper chain is installed.
                    const original = actorClass.prototype.updateEncumbrance;
                    target.updateEncumbrance = function () {
                        return Promise.reject(new Error('harness: unrelated failure'));
                    };
                    let threw = null;
                    try {
                        await target.updateEncumbrance({});
                    } catch (error) {
                        threw = error;
                    } finally {
                        delete target.updateEncumbrance;
                    }
                    expect.ok('original method is still on the prototype', actorClass.prototype.updateEncumbrance === original);
                    expect.ok('an unrelated failure was not swallowed', Boolean(threw));
                    expect.ok('and it is the error we threw', String(threw?.message).includes('unrelated failure'));
                } finally {
                    await cleanup(made);
                }
            }
        },
        // ---------- interactive ----------
        {
            id: 'live-two-client-take',
            tier: 'interactive',
            label: 'Two clients loot one corpse at the same time',
            note: 'Needs a second logged-in client. The in-memory lock does NOT span clients — this check exists to find out what that costs in practice. Have both users take the same last item together, then compare what each received against what the corpse lost.',
            run: async ({ log }) => {
                requireApi('inventory');
                log('Set up a corpse with a single stack, then have two clients take it simultaneously.');
                log('Record: total received by both players, and the corpse\'s remaining quantity.');
                log('These must sum to the original. If they do not, the per-client lock is insufficient');
                log('and mutations need routing through one GM client — which is what consumers already do.');
            }
        },
        {
            id: 'live-curator-window',
            tier: 'interactive',
            label: 'Loot through a consumer window',
            note: 'Exercises the whole path with real UUIDs and a real corpse: per-row TAKE, a partial quantity, and a currency TAKE. Confirm the row disappears when emptied and the recipient sheet updates.',
            run: async ({ log }) => {
                requireApi('inventory');
                log('Take one full row, one partial stack, and one currency entry.');
                log('Expected: emptied rows vanish, partial rows show the reduced quantity,');
                log('and an item the looter already held grows rather than adding a second row.');
            }
        },
        {
            id: 'cleanup-leftovers',
            tier: 'interactive',
            label: 'Delete leftover test actors',
            note: 'Removes every Actor and world Item this suite created. Run it if a check died mid-run.',
            run: async ({ log }) => {
                const actors = game.actors.filter(actor => actor.name.startsWith(TEMP_PREFIX));
                const items = game.items.filter(item => item.name.startsWith('Harness '));
                for (const document of [...actors, ...items]) {
                    try { await document.delete(); } catch (_) { /* gone */ }
                }
                log(`Deleted ${actors.length} actor(s) and ${items.length} world item(s).`);
            }
        }
    ]
};
