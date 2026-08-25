// ==================================================================
// ===== SUITE: Tags write path =====================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO -- it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/api/api-tags.md
// Implementation: scripts/manager-tags.js (serialized write path)
//
// WHAT THIS SUITE IS FOR. Every tag mutation is a read-modify-write of a whole
// world setting, so correctness rests entirely on one cycle running at a time.
// That is invisible in single-call testing: every check here passes trivially
// if you await each write. The checks deliberately do NOT await individually --
// they fire concurrently through Promise.all, which is what a loop of pin
// mirrors and a consumer's bulk migration both look like from the store's side.
//
// Against the old whole-object write path, `concurrent-set-tags-all-land`
// recorded 1 of 8 tagged records: all eight cloned the same stale snapshot and
// the last write discarded the other seven, silently and with no error.
//
// THIS SUITE WRITES WORLD SETTINGS -- `tagAssignments` and `tagRegistry` are
// briefly visible to every connected client. It confines itself to a context
// key and tag names carrying a random suffix, so it cannot collide with real
// data, and `restore()` removes both in a finally block. `assertIsolation`
// additionally proves every other context came through byte-identical, which
// is the regression guarding a player's stale snapshot from overwriting the
// whole store.
//
// GM ONLY. Tag deletion is GM-gated, so a player client could run the checks
// but not clean up after them.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/** A context key and tag vocabulary no real data can collide with. */
function probeScope() {
    const nonce = foundry.utils.randomID(6).toLowerCase();
    return {
        nonce,
        contextKey: `zz-harness-tags.probe-${nonce}`,
        tag: (name) => `zz-harness-${nonce}-${name}`,
        record: (n) => `record-${nonce}-${n}`
    };
}

/** The whole assignments object, for before/after comparison. */
function assignmentsSnapshot() {
    try {
        return foundry.utils.deepClone(game.settings.get(MODULE_ID, 'tagAssignments') ?? {});
    } catch (_) {
        return {};
    }
}

/**
 * Assert that nothing outside the probe context moved.
 *
 * This is the check that would have caught the cross-client clobber: the failure
 * was never "my tag did not save", it was "someone else's context vanished".
 *
 * It reports the NAMES of the context keys that differ, not the two objects. A live
 * store holds thousands of characters of real assignments, and asserting the objects
 * against each other prints two blobs the console truncates at the point they are
 * still identical -- which is exactly what happened the first time this fired, and
 * turned a one-line answer into a hunt.
 */
function assertIsolation(expect, before, contextKey) {
    const after = assignmentsSnapshot();
    delete before[contextKey];
    delete after[contextKey];

    const keys    = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...keys]
        .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .sort();

    expect('no other context key was touched', changed, []);
}

/** Remove everything the probe wrote: assignments first, then the registry entries. */
async function restore(api, scope, tags) {
    try {
        const records = api.tags.getRecordsByTag
            ? Object.keys((game.settings.get(MODULE_ID, 'tagAssignments') ?? {})[scope.contextKey] ?? {})
            : [];
        for (const recordId of records) await api.tags.deleteRecordTags(scope.contextKey, recordId);
    } catch (_) { /* nothing written */ }
    for (const tag of tags) {
        try { await api.tags.delete(tag); } catch (_) { /* never reached the registry */ }
    }
}

export default {
    id: 'tags',
    label: 'Tags',
    icon: 'fa-solid fa-tags',

    settings: () => [
        settingRow('running as', game.user?.isGM ? 'GM' : 'player',
            game.user?.isGM ? null : 'Checks refuse to run -- cleanup needs GM.'),
        settingRow('api.tags', game.modules.get(MODULE_ID)?.api?.tags ? 'present' : 'missing'),
        settingRow('records in store',
            Object.values(game.settings.get(MODULE_ID, 'tagAssignments') ?? {})
                .reduce((n, ctx) => n + Object.keys(ctx ?? {}).length, 0),
            'The suite adds to this and removes what it added.'),
        settingRow('leftover probe contexts',
            Object.keys(game.settings.get(MODULE_ID, 'tagAssignments') ?? {})
                .filter(k => k.startsWith('zz-harness-tags.')).length,
            'Should be 0. Anything else is a suite that failed mid-run.')
    ],

    checks: [
        {
            id: 'concurrent-set-tags-all-land',
            label: 'Concurrent setTags across records: every write survives',
            tier: 'headless',
            group: 'Concurrency',
            note: 'Fires 8 setTags at once. The whole-object write path kept only the last.',
            run: async ({ api, expect, log }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags', 'tags.getTags', 'tags.deleteRecordTags');

                const scope  = probeScope();
                const tag    = scope.tag('concurrent');
                const before = assignmentsSnapshot();
                const ids    = Array.from({ length: 8 }, (_, i) => scope.record(i));

                try {
                    await Promise.all(ids.map(id => api.tags.setTags(scope.contextKey, id, [tag])));

                    const landed = ids.filter(id => api.tags.getTags(scope.contextKey, id).includes(tag));
                    log(`${landed.length} of ${ids.length} records carry the tag`);
                    expect('every concurrent write landed', landed.length, ids.length);
                    assertIsolation(expect, before, scope.contextKey);
                } finally {
                    await restore(api, scope, [tag]);
                }
            }
        },
        {
            id: 'concurrent-add-tags-one-record',
            label: 'Concurrent addTags on one record: union, not last-wins',
            tier: 'headless',
            group: 'Concurrency',
            note: 'addTags resolves against current data, not a snapshot the caller read first.',
            run: async ({ api, expect, log }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.addTags', 'tags.getTags');

                const scope  = probeScope();
                const tags   = ['alpha', 'beta', 'gamma', 'delta'].map(scope.tag);
                const record = scope.record(0);
                const before = assignmentsSnapshot();

                try {
                    await Promise.all(tags.map(t => api.tags.addTags(scope.contextKey, record, [t])));

                    const stored = api.tags.getTags(scope.contextKey, record).sort();
                    log(`stored: ${stored.join(', ') || '(none)'}`);
                    expect('all four tags merged onto the record', stored, [...tags].sort());
                    assertIsolation(expect, before, scope.contextKey);
                } finally {
                    await restore(api, scope, tags);
                }
            }
        },
        {
            id: 'concurrent-remove-tags-one-record',
            label: 'Concurrent removeTags on one record: all removals applied',
            tier: 'headless',
            group: 'Concurrency',
            run: async ({ api, expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags', 'tags.removeTags', 'tags.getTags');

                const scope  = probeScope();
                const tags   = ['one', 'two', 'three', 'four'].map(scope.tag);
                const record = scope.record(0);

                try {
                    await api.tags.setTags(scope.contextKey, record, tags);
                    await Promise.all(tags.slice(0, 3).map(t => api.tags.removeTags(scope.contextKey, record, [t])));

                    expect('only the untouched tag remains', api.tags.getTags(scope.contextKey, record), [tags[3]]);
                } finally {
                    await restore(api, scope, tags);
                }
            }
        },
        {
            id: 'registry-absorbs-concurrent-tags',
            label: 'Registry records every tag from a concurrent burst',
            tier: 'headless',
            group: 'Concurrency',
            note: 'The registry is a second whole-setting read-modify-write on the same path.',
            run: async ({ api, expect, log }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags', 'tags.getRegistry');

                const scope = probeScope();
                const tags  = Array.from({ length: 6 }, (_, i) => scope.tag(`reg${i}`));

                try {
                    await Promise.all(tags.map((t, i) => api.tags.setTags(scope.contextKey, scope.record(i), [t])));

                    const registry = api.tags.getRegistry();
                    const missing  = tags.filter(t => !registry.includes(t));
                    log(`missing from registry: ${missing.join(', ') || '(none)'}`);
                    expect('every tag reached the registry', missing.length, 0);
                } finally {
                    await restore(api, scope, tags);
                }
            }
        },
        {
            id: 'empty-set-prunes-record-and-context',
            label: 'setTags with an empty array leaves no residue',
            tier: 'headless',
            group: 'Store shape',
            note: 'Emptying the last record in a context removes the context bucket too.',
            run: async ({ api, expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags', 'tags.getTags');

                const scope  = probeScope();
                const tag    = scope.tag('residue');
                const record = scope.record(0);

                try {
                    await api.tags.setTags(scope.contextKey, record, [tag]);
                    expect('tag stored', api.tags.getTags(scope.contextKey, record), [tag]);

                    await api.tags.setTags(scope.contextKey, record, []);
                    expect('record reads empty', api.tags.getTags(scope.contextKey, record), []);

                    const store = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
                    expect.ok('context bucket pruned', !(scope.contextKey in store));
                } finally {
                    await restore(api, scope, [tag]);
                }
            }
        },
        {
            id: 'delete-record-tags-matches-empty-set',
            label: 'deleteRecordTags and setTags(..., []) agree',
            tier: 'headless',
            group: 'Store shape',
            run: async ({ api, expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags', 'tags.deleteRecordTags', 'tags.getTags');

                const scope = probeScope();
                const tag   = scope.tag('agree');

                try {
                    await api.tags.setTags(scope.contextKey, scope.record(0), [tag]);
                    await api.tags.setTags(scope.contextKey, scope.record(1), [tag]);

                    await api.tags.setTags(scope.contextKey, scope.record(0), []);
                    await api.tags.deleteRecordTags(scope.contextKey, scope.record(1));

                    const store = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
                    expect.ok('both paths pruned the context', !(scope.contextKey in store));
                } finally {
                    await restore(api, scope, [tag]);
                }
            }
        },
        {
            id: 'rename-does-not-lose-concurrent-writes',
            label: 'A rename running against concurrent writes loses nothing',
            tier: 'headless',
            group: 'Sweeps',
            note: 'rename sweeps every assignment; a write interleaving mid-sweep used to vanish.',
            run: async ({ api, expect, log }) => {
                if (!game.user?.isGM) throw new Error('GM only -- rename is GM-gated.');
                requireApi('tags.setTags', 'tags.rename', 'tags.getTags');

                const scope   = probeScope();
                const oldTag  = scope.tag('before');
                const newTag  = scope.tag('after');
                const spectator = scope.tag('spectator');
                const ids     = Array.from({ length: 6 }, (_, i) => scope.record(i));

                try {
                    await Promise.all(ids.map(id => api.tags.setTags(scope.contextKey, id, [oldTag])));

                    // Rename concurrently with a fresh write to a record the sweep also visits.
                    await Promise.all([
                        api.tags.rename(oldTag, newTag),
                        api.tags.setTags(scope.contextKey, scope.record(99), [spectator])
                    ]);

                    const renamed = ids.filter(id => api.tags.getTags(scope.contextKey, id).includes(newTag));
                    log(`${renamed.length} of ${ids.length} records renamed`);
                    expect('every record picked up the new tag', renamed.length, ids.length);
                    expect('the concurrent write was not swallowed',
                        api.tags.getTags(scope.contextKey, scope.record(99)), [spectator]);
                } finally {
                    await restore(api, scope, [oldTag, newTag, spectator]);
                }
            }
        },
        {
            id: 'delete-tag-removes-emptied-records',
            label: 'Deleting a tag removes records it empties',
            tier: 'headless',
            group: 'Sweeps',
            note: 'A record whose last tag is deleted must go, not be left as an empty array.',
            run: async ({ api, expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- delete is GM-gated.');
                requireApi('tags.setTags', 'tags.delete');

                const scope  = probeScope();
                const doomed = scope.tag('doomed');
                const keeper = scope.tag('keeper');

                try {
                    await api.tags.setTags(scope.contextKey, scope.record(0), [doomed]);
                    await api.tags.setTags(scope.contextKey, scope.record(1), [doomed, keeper]);

                    await api.tags.delete(doomed);

                    const store = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
                    const ctx   = store[scope.contextKey] ?? {};
                    expect.ok('the emptied record is gone', !(scope.record(0) in ctx));
                    expect('the record keeping a tag survives', ctx[scope.record(1)], [keeper]);
                } finally {
                    await restore(api, scope, [doomed, keeper]);
                }
            }
        },
        {
            id: 'prune-stays-inside-the-written-context',
            label: 'A write does not prune empty buckets in other contexts',
            tier: 'headless',
            group: 'Store shape',
            note: 'Pruning the whole store on every write would make the isolation check unassertable.',
            run: async ({ api, expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- cleanup requires GM.');
                requireApi('tags.setTags');

                const bystander = probeScope();
                const writer    = probeScope();
                const tag       = writer.tag('writer');

                try {
                    // Leave an empty bucket behind, the shape older versions produced.
                    const seeded = foundry.utils.deepClone(
                        game.settings.get(MODULE_ID, 'tagAssignments') ?? {});
                    seeded[bystander.contextKey] = {};
                    await game.settings.set(MODULE_ID, 'tagAssignments', seeded);

                    await api.tags.setTags(writer.contextKey, writer.record(0), [tag]);

                    const store = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
                    expect.ok('the untouched empty bucket survived', bystander.contextKey in store);
                } finally {
                    await restore(api, writer, [tag]);
                    const store = foundry.utils.deepClone(
                        game.settings.get(MODULE_ID, 'tagAssignments') ?? {});
                    delete store[bystander.contextKey];
                    await game.settings.set(MODULE_ID, 'tagAssignments', store);
                }
            }
        },
        {
            id: 'store-left-clean',
            label: 'No probe data survives a full suite run',
            tier: 'headless',
            group: 'Sweeps',
            note: 'Run this last. It fails if an earlier check leaked a context or a tag.',
            run: async ({ api, expect }) => {
                const store    = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
                const contexts = Object.keys(store).filter(k => k.startsWith('zz-harness-tags.'));
                const tags     = api.tags.getRegistry().filter(t => t.startsWith('zz-harness-'));

                expect('no probe contexts left in the store', contexts, []);
                expect('no probe tags left in the registry', tags, []);
            }
        }
    ]
};
