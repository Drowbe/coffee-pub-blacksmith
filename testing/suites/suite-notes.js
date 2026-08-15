// ==================================================================
// ===== SUITE: api.notes (annotations) =============================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-notes.md
// Implementation: scripts/manager-notes.js, scripts/api-notes.js
//
// The suite exists mostly to hold ONE assertion honest: that
// getByTarget answers "what is attached to this thing". That is the whole
// reason the layer was built rather than using journal pages directly, so
// if it ever stops being true the layer should be deleted, not patched.
//
// Boolean assertions use `expect.ok(label, condition)`. The three-argument
// `expect(label, actual, expected)` is for value comparisons — passing a
// condition and a message to it puts the message in the `actual` slot and
// compares it against undefined, which fails every time and looks like the
// code is broken when the suite is.
//
// Every headless check creates its own journal entry and deletes it in a
// finally, so a failed run leaves no residue in the world.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/** A throwaway journal entry with one text page, plus its cleanup. */
async function makeNote(name = 'Harness Note') {
    const entry = await JournalEntry.create({
        name: `${name} ${foundry.utils.randomID(6)}`,
        pages: [{ name: 'Note', type: 'text', text: { content: '<p>harness</p>' } }]
    });
    return {
        entry,
        page: entry.pages.contents[0],
        cleanup: () => entry.delete()
    };
}

/** Any world document to point at. An Actor if there is one, else the current scene. */
function someTarget() {
    return game.actors?.contents?.[0] ?? game.scenes?.contents?.[0] ?? null;
}

export default {
    id: 'notes',
    label: 'Notes',
    icon: 'fa-solid fa-note-sticky',

    settings: () => {
        const api = game.modules.get(MODULE_ID)?.api;
        const target = someTarget();
        return [
            settingRow('api.notes', api?.notes ? 'available' : 'MISSING'),
            settingRow('Indexed targets', String(api?.notes?.getAnnotatedTargets?.().length ?? '—')),
            settingRow('Target for checks', target ? `${target.documentName} "${target.name}"` : 'NONE — create an actor or scene first'),
            settingRow('Journal entries', String(game.journal?.size ?? 0),
                'the index is rebuilt from every page of every entry at ready')
        ];
    },

    checks: [
        // ---------- the gate ----------
        {
            id: 'attach-then-query-target',
            label: 'Attaching makes the target answerable',
            tier: 'headless',
            group: 'The gate — what is attached to this thing',
            note: 'The one assertion the whole layer exists for.',
            run: async ({ expect }) => {
                const api = requireApi('notes.attach', 'notes.getByTarget');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    const annotation = await api.notes.attach(note.page, target);
                    expect.ok('attach returned an annotation', !!annotation);
                    expect('annotation names the target', annotation?.targetUuid, target.uuid);
                    expect('anchor defaults to document', annotation?.anchor?.kind, 'document');

                    const found = api.notes.getByTarget(target);
                    expect.ok('getByTarget finds it — this is the gate; if it fails the layer is a fancy journal',
                        found.some(a => a.id === annotation?.id));
                    expect.ok('the result carries the note uuid so a caller can resolve back',
                        found.some(a => a.noteUuid === note.page.uuid));
                } finally {
                    await note.cleanup();
                }
            }
        },
        {
            id: 'has-target',
            label: 'hasTarget agrees with getByTarget',
            tier: 'headless',
            group: 'The gate — what is attached to this thing',
            note: 'hasTarget is the cheap path used for badges; it must not disagree.',
            run: async ({ expect }) => {
                const api = requireApi('notes.hasTarget');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    expect('agree before attaching',
                        api.notes.hasTarget(target), api.notes.getByTarget(target).length > 0);
                    await api.notes.attach(note.page, target);
                    expect('true after attaching', api.notes.hasTarget(target), true);
                    expect.ok('and getByTarget agrees', api.notes.getByTarget(target).length > 0);
                } finally {
                    await note.cleanup();
                }
            }
        },

        // ---------- round trip ----------
        {
            id: 'get-by-note',
            label: 'getByNote returns what the note points at',
            tier: 'headless',
            group: 'Round trip',
            run: async ({ expect }) => {
                const api = requireApi('notes.getByNote');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    await api.notes.attach(note.page, target);
                    const mine = api.notes.getByNote(note.page);
                    expect('one annotation on the note', mine.length, 1);
                    expect('pointing at the target', mine[0]?.targetUuid, target.uuid);
                } finally {
                    await note.cleanup();
                }
            }
        },
        {
            id: 'attach-is-idempotent',
            label: 'Attaching twice does not make two',
            tier: 'headless',
            group: 'Round trip',
            note: 'Same note, same target, same anchor kind. A UI that double-fires must not duplicate.',
            run: async ({ expect }) => {
                const api = requireApi('notes.attach');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    const first = await api.notes.attach(note.page, target);
                    const second = await api.notes.attach(note.page, target);
                    expect('the same annotation came back', second?.id, first?.id);
                    expect('still only one stored', api.notes.getByNote(note.page).length, 1);
                } finally {
                    await note.cleanup();
                }
            }
        },
        {
            id: 'one-note-many-targets',
            label: 'One note can be about several things',
            tier: 'headless',
            group: 'Round trip',
            note: 'The case none of pins, tags, or gmNotes handles — and the ordinary one.',
            run: async ({ expect }) => {
                const api = requireApi('notes.attach');
                const targets = [game.actors?.contents?.[0], game.scenes?.contents?.[0]].filter(Boolean);
                if (!expect.ok('two different world documents exist', targets.length >= 2)) return;

                const note = await makeNote();
                try {
                    for (const t of targets) await api.notes.attach(note.page, t);
                    expect('both stored on one note', api.notes.getByNote(note.page).length, 2);
                    for (const t of targets) {
                        expect.ok(`${t.documentName} finds it`, api.notes.getByTarget(t).length >= 1);
                    }
                } finally {
                    await note.cleanup();
                }
            }
        },
        {
            id: 'detach',
            label: 'detach removes it from both directions',
            tier: 'headless',
            group: 'Round trip',
            run: async ({ expect }) => {
                const api = requireApi('notes.detach');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    const annotation = await api.notes.attach(note.page, target);
                    expect('detach reported success', await api.notes.detach(note.page, annotation.id), true);
                    expect('gone from the note', api.notes.getByNote(note.page).length, 0);
                    expect.ok('gone from the target',
                        !api.notes.getByTarget(target).some(a => a.id === annotation.id));
                    expect('detaching again reports false rather than throwing',
                        await api.notes.detach(note.page, annotation.id), false);
                } finally {
                    await note.cleanup();
                }
            }
        },

        // ---------- index integrity ----------
        {
            id: 'index-survives-note-deletion',
            label: 'Deleting the note removes it from the index',
            tier: 'headless',
            group: 'Index integrity',
            note: 'Lifecycle is the reason annotations live on the note rather than in a central store.',
            run: async ({ expect }) => {
                const api = requireApi('notes.getByTarget');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                const annotation = await api.notes.attach(note.page, target);
                expect.ok('present while the note exists',
                    api.notes.getByTarget(target).some(a => a.id === annotation?.id));

                await note.cleanup();
                expect.ok('gone once the note is deleted — no orphan',
                    !api.notes.getByTarget(target).some(a => a.id === annotation?.id));
            }
        },
        {
            id: 'index-rebuild-is-stable',
            label: 'Rebuilding the index changes nothing',
            tier: 'headless',
            group: 'Index integrity',
            note: 'The index is derived. A rebuild is what happens on every reload.',
            run: async ({ expect }) => {
                const api = requireApi('notes.rebuildIndex');
                const target = someTarget();
                if (!expect.ok('a world document exists to annotate', !!target)) return;

                const note = await makeNote();
                try {
                    await api.notes.attach(note.page, target);
                    const before = api.notes.getByTarget(target).length;
                    api.notes.rebuildIndex();
                    expect('same answer after a full rebuild — this is what a reload does',
                        api.notes.getByTarget(target).length, before);
                } finally {
                    await note.cleanup();
                }
            }
        },
        {
            id: 'bad-input-refuses',
            label: 'Missing note or target refuses rather than throwing',
            tier: 'headless',
            group: 'Index integrity',
            note: 'Logs two deliberate refusals to the console. Those lines are the check passing, not failing.',
            run: async ({ expect }) => {
                const api = requireApi('notes.attach', 'notes.getByTarget');
                expect('null note returns null', await api.notes.attach(null, someTarget()), null);
                expect('null target returns null', await api.notes.attach('JournalEntryPage.doesnotexist', null), null);
                expect.ok('getByTarget(null) is an empty array, not a throw', Array.isArray(api.notes.getByTarget(null)));
                expect('and it is empty', api.notes.getByTarget(null).length, 0);
                expect('hasTarget(null) is false', api.notes.hasTarget(null), false);
            }
        },

        // ---------- the notes themselves ----------
        {
            id: 'create-read-delete',
            label: 'Create, list, and delete a note',
            tier: 'headless',
            group: 'Notes',
            note: 'Needs a notes journal configured in Blacksmith settings. Skips cleanly without one.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'notes.listNotes', 'notes.deleteNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — set one under Settings > Notes to run this.');
                    return;
                }

                const title = `ZZ Harness ${foundry.utils.randomID(6)}`;
                const note = await api.notes.createNote({ title, content: '<p>body</p>' });
                if (!expect.ok('createNote returned a page', !!note)) return;

                try {
                    expect('title stored', note.name, title);
                    expect.ok('flagged as a note', api.notes.isNote(note));
                    expect.ok('appears in listNotes', api.notes.listNotes().some(n => n.id === note.id));
                } finally {
                    expect('deleteNote reported success', await api.notes.deleteNote(note), true);
                    expect.ok('gone from listNotes', !api.notes.listNotes().some(n => n.id === note.id));
                }
            }
        },
        {
            id: 'visibility-writes-ownership',
            label: 'Visibility is real Foundry ownership, not a flag',
            tier: 'headless',
            group: 'Notes',
            note: 'The privacy model rests on this. A flag nobody enforces is not privacy.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'notes.updateNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }

                const note = await api.notes.createNote({ title: `ZZ Vis ${foundry.utils.randomID(6)}` });
                if (!expect.ok('note created', !!note)) return;

                try {
                    expect('default ownership is NONE', note.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE);
                    expect('private by default', note.getFlag('coffee-pub-blacksmith', 'visibility'), 'private');

                    await api.notes.updateNote(note, { visibility: 'party' });
                    const players = game.users.filter(u => !u.isGM);
                    if (players.length) {
                        expect.ok('party visibility grants every player ownership',
                            players.every(u => note.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
                    } else {
                        log('No non-GM users in this world — the party half could not be checked.');
                    }
                    expect.ok('GMs always own it',
                        game.users.filter(u => u.isGM).every(u => note.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },
        {
            id: 'tags-go-to-the-registry',
            label: 'Note tags live in the shared Tags registry',
            tier: 'headless',
            group: 'Notes',
            note: 'Not on the page. Squire kept its own list, which is how one tag ends up spelled two ways.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'notes.getNoteTags', 'tags.getTags');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }

                const note = await api.notes.createNote({
                    title: `ZZ Tags ${foundry.utils.randomID(6)}`,
                    tags: ['harness-alpha', 'harness-beta']
                });
                if (!expect.ok('note created', !!note)) return;

                try {
                    const tags = api.notes.getNoteTags(note);
                    expect.ok('both tags read back', tags.includes('harness-alpha') && tags.includes('harness-beta'));
                    expect.ok('and they are in the Tags store, not a page flag',
                        (api.tags.getTags(api.notes.TAG_CONTEXT, note.id) ?? []).includes('harness-alpha'));
                    expect('no tags flag on the page', note.getFlag('coffee-pub-blacksmith', 'tags'), undefined);
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },
        {
            id: 'delete-clears-tags',
            label: 'Deleting a note clears its tag assignments',
            tier: 'headless',
            group: 'Notes',
            note: 'Tags are keyed by page id, so a missed cleanup orphans them permanently.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'tags.getTags');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }

                const note = await api.notes.createNote({
                    title: `ZZ Orphan ${foundry.utils.randomID(6)}`,
                    tags: ['harness-orphan']
                });
                if (!expect.ok('note created', !!note)) return;

                const pageId = note.id;
                await api.notes.deleteNote(note);
                expect('no assignments left behind',
                    (api.tags.getTags(api.notes.TAG_CONTEXT, pageId) ?? []).length, 0);
            }
        },

        {
            id: 'access-list-excludes-groups',
            label: 'The access list holds people, not the party token',
            tier: 'headless',
            group: 'Notes',
            note: 'A user whose assigned character is a GROUP actor is the party roster, not a person. ' +
                  'It appeared in the sharing strip as something you could grant a note to.',
            run: async ({ expect, log }) => {
                const { noteAccessUsers } = await import('../../scripts/manager-notes.js');
                const listed = noteAccessUsers();

                expect('no GMs', listed.filter((u) => u.isGM).length, 0);
                expect('no group actors',
                    listed.filter((u) => u.character?.type === 'group').length, 0);

                const groups = game.users.filter((u) => u.character?.type === 'group');
                if (groups.length) {
                    log(`excluded ${groups.length} group-actor user(s): ${groups.map((u) => u.name).join(', ')}`);
                } else {
                    log('no group-actor users in this world — the exclusion is untested here.');
                }
            }
        },

        {
            id: 'revoking-access-applies',
            label: 'Removing somebody actually removes them',
            tier: 'headless',
            group: 'Notes',
            note: 'ownership is an ObjectField, so an update MERGES -- Foundry has a "-=userId" removal ' +
                  'syntax precisely because of it. Omitting a user from the new map leaves their old ' +
                  'level intact, so granting worked and revoking silently did nothing.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'notes.updateNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }
                const player = game.users.find((u) => !u.isGM);
                if (!player) {
                    log('No non-GM user in this world — skipping.');
                    return;
                }

                const note = await api.notes.createNote({ title: `ZZ Revoke ${foundry.utils.randomID(6)}` });
                if (!expect.ok('note created', !!note)) return;

                try {
                    await api.notes.updateNote(note, {
                        visibility: 'private',
                        sharedWith: [player.id]
                    });
                    expect('shared: the player owns it',
                        note.ownership?.[player.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);

                    // The whole point: an update that simply does not mention them.
                    await api.notes.updateNote(note, { visibility: 'private', sharedWith: [] });
                    expect.ok('revoked: the player no longer owns it',
                        note.ownership?.[player.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                    expect.ok('and cannot observe it',
                        !note.testUserPermission(player, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },

        {
            id: 'favorites-are-per-user',
            label: 'Favourites live on the user, not the note',
            tier: 'headless',
            group: 'Notes',
            note: 'Two people sharing a note will not favourite the same things. Stored on the note, ' +
                  'one player starring it would star it for everyone.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }
                const { NotesManager } = await import('../../scripts/manager-notes.js');
                const note = await api.notes.createNote({ title: `ZZ Fav ${foundry.utils.randomID(6)}` });
                if (!expect.ok('note created', !!note)) return;

                try {
                    expect('starts unfavourited', NotesManager.isFavorite(note), false);
                    expect('toggles on', await NotesManager.toggleFavorite(note), true);
                    expect('reads back as favourite', NotesManager.isFavorite(note), true);

                    // The note document must be untouched -- that is the whole point.
                    expect.ok('nothing written to the note',
                        note.flags?.[MODULE_ID]?.favorite === undefined);
                    expect.ok('recorded on the user',
                        (game.user.getFlag(MODULE_ID, 'favoriteNotes') ?? []).includes(note.uuid));

                    expect('toggles off', await NotesManager.toggleFavorite(note), false);
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },

        {
            id: 'ownership-keys-are-users',
            label: 'Ownership keys are real user ids, whatever the caller passes',
            tier: 'headless',
            group: 'Notes',
            note: 'The user picker has getSelection() (entity objects) and getSelectedIds() (strings). ' +
                  'Passing objects made a "[object Object]" ownership key, which Foundry rejected only ' +
                  'at save with "is not a mapping of user IDs and document permission levels".',
            run: async ({ expect }) => {
                const { NotesManager } = await import('../../scripts/manager-notes.js');
                const me = game.user;

                const fromIds = NotesManager.buildNoteOwnership('private', me.id, [me.id]);
                const fromObjects = NotesManager.buildNoteOwnership('private', me.id, [{ id: me.id }]);

                const badKeys = (o) => Object.keys(o).filter((k) => k !== 'default' && !game.users.get(k));
                expect('no non-user keys from id strings', badKeys(fromIds).length, 0);
                expect('no non-user keys from entity objects', badKeys(fromObjects).length, 0);

                // Junk must be dropped, not written through as a key.
                const junk = NotesManager.buildNoteOwnership('private', me.id, ['not-a-user', null, {}]);
                expect('junk entries dropped', badKeys(junk).length, 0);

                const levels = Object.values(fromIds);
                expect.ok('every level is a valid ownership level',
                    levels.every((v) => Object.values(CONST.DOCUMENT_OWNERSHIP_LEVELS).includes(v)));
            }
        },

        {
            id: 'pin-payload-valid',
            label: 'The note pin payload passes Pins validation',
            tier: 'headless',
            group: 'Notes',
            note: 'Pins does not generate ids -- the caller supplies one, and omitting it throws ' +
                  '"Pin id must be a non-empty string (UUID)" only when somebody actually clicks Place. ' +
                  'Runs the real builder through the real validator so the two cannot drift.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }

                const { validatePinData } = await import('../../scripts/manager-pins-schema.js');
                const { NotesManager } = await import('../../scripts/manager-notes.js');

                const note = await api.notes.createNote({ title: `ZZ Pin ${foundry.utils.randomID(6)}` });
                if (!expect.ok('note created', !!note)) return;

                try {
                    const payload = NotesManager.buildNotePinData(note);
                    // Unplaced: the note gets coordinates from the click, not from here.
                    const result = validatePinData(payload, { allowUnplaced: true });
                    expect.ok(`payload validates (${result.ok ? 'ok' : result.error})`, result.ok === true);
                    expect.ok('id is a non-empty string', typeof payload.id === 'string' && !!payload.id.trim());
                    expect('config points back at the note', payload.config?.noteUuid, note.uuid);
                    expect.ok('ownership is the nested pin shape',
                        !!payload.ownership && typeof payload.ownership.users === 'object');
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },

        {
            id: 'ownership-shape',
            label: 'Note ownership is the flat document shape',
            tier: 'headless',
            group: 'Notes',
            note: 'Documents use { default, userId: level }; Blacksmith pins use ' +
                  '{ default, users: { userId: level } }. They look interchangeable and are not -- passing ' +
                  'the pin shape to a page throws "is not a mapping of user IDs and document permission ' +
                  'levels", and it only surfaces at save.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }

                const note = await api.notes.createNote({ title: `ZZ Own ${foundry.utils.randomID(6)}` });
                if (!expect.ok('note created — a nested ownership map would have thrown here', !!note)) return;

                try {
                    expect.ok('no users key: the map is flat', note.ownership.users === undefined);
                    expect('default is a level', typeof note.ownership.default, 'number');
                    expect('the author owns it at the top level',
                        note.ownership[game.user.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },
        {
            id: 'shared-with-named-people',
            label: 'Sharing with named people grants exactly them',
            tier: 'headless',
            group: 'Notes',
            note: 'The third visibility shape. Additive to the author -- sharing is not giving away.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.createNote', 'notes.updateNote');
                if (!api.notes.getNotesJournal()) {
                    log('No notes journal selected — skipping.');
                    return;
                }
                const players = game.users.filter(u => !u.isGM);
                if (!expect.ok('at least one non-GM user exists', players.length > 0)) return;

                const target = players[0];
                const note = await api.notes.createNote({
                    title: `ZZ Share ${foundry.utils.randomID(6)}`,
                    sharedWith: [target.id]
                });
                if (!expect.ok('note created', !!note)) return;

                try {
                    expect('the named person owns it', note.ownership[target.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                    expect.ok('the author still owns it — sharing is not giving away',
                        note.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                    expect('default is still NONE', note.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE);

                    const others = players.filter(u => u.id !== target.id);
                    if (others.length) {
                        expect.ok('nobody else was granted',
                            others.every(u => note.ownership[u.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
                    } else {
                        log('Only one non-GM user — could not check that others are excluded.');
                    }

                    // Stored as private plus an ownership map, not a third flag value.
                    expect('visibility flag stays private', note.getFlag('coffee-pub-blacksmith', 'visibility'), 'private');

                    await api.notes.updateNote(note, { visibility: 'private', sharedWith: [] });
                    expect.ok('unsharing revokes them',
                        note.ownership[target.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                } finally {
                    await api.notes.deleteNote(note);
                }
            }
        },

        // ---------- the collaborative editing spike ----------
        //
        // The Notes design (documentation/plans/plan-notes.md, decision 1) rests
        // entirely on this working: if two clients can co-edit one note, the edit
        // locks Squire built as a fallback are unnecessary, and the draft-page
        // problem that produced hundreds of "Untitled Note" orphans dissolves.
        //
        // Squire wanted this and could not get it working. These checks establish
        // whether that was a version problem or a real limitation, before anything
        // is built on the assumption.
        {
            id: 'collab-preconditions',
            label: 'Collaborative editing: the pieces exist',
            tier: 'headless',
            group: 'Collaborative editing spike',
            note: 'Everything a collaborative editor needs, checked before asking a person to test it.',
            run: async ({ expect }) => {
                const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
                expect.ok('HTMLProseMirrorElement exists', !!Cls);
                expect.ok('it has a create() factory', typeof Cls?.create === 'function');

                // The element reads these off its own dataset at activation time and
                // resolves the document itself (prosemirror-editor.mjs:202-207).
                const editor = Cls?.create?.({
                    name: 'text.content',
                    value: '',
                    collaborate: true,
                    documentUUID: 'JournalEntryPage.spike'
                });
                expect.ok('create() accepts a collaborate config', !!editor);
                expect.ok('the collaborate attribute is set', editor?.hasAttribute?.('collaborate') === true);
                expect.ok('the document uuid reaches the dataset',
                    editor?.dataset?.documentUuid === 'JournalEntryPage.spike');
                expect('fieldName travels as the element name', editor?.getAttribute?.('name'), 'text.content');
            }
        },
        {
            id: 'collab-open',
            label: 'Open a collaborative editor on a shared page',
            tier: 'interactive',
            group: 'Collaborative editing spike',
            note: 'Run this on TWO clients, then type on one. If the text appears on the other, collab works ' +
                  'and the edit locks in Squire were a workaround for a fixable problem. Both clients bind the ' +
                  'same page, which is the whole point — a per-client page would prove nothing. ' +
                  'Run "Clean up the collab spike" afterwards.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.getNotesJournal');
                const journal = api.notes.getNotesJournal() ?? game.journal?.contents?.[0];
                if (!expect.ok('a journal exists to hold the spike page', !!journal)) return;

                // Reused by name, not created per run: both clients must bind the SAME
                // document or there is nothing to collaborate over.
                const NAME = 'ZZ Collab Spike';
                let page = journal.pages.contents.find(p => p.name === NAME);
                if (!page) {
                    if (!game.user.isGM) {
                        log('No spike page yet — a GM must run this first to create it.');
                        return;
                    }
                    [page] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
                        name: NAME,
                        type: 'text',
                        text: { content: '<p>Type here on one client and watch the other.</p>' },
                        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
                    }]);
                    log(`Created ${NAME} — ownership is OWNER for everyone so any client can edit it.`);
                }
                if (!expect.ok('spike page resolved', !!page)) return;
                expect.ok('this client may edit it', page.isOwner);

                const Cls = foundry.applications.elements.HTMLProseMirrorElement;
                const editor = Cls.create({
                    name: 'text.content',
                    value: page.text?.content ?? '',
                    collaborate: true,
                    documentUUID: page.uuid,
                    compact: true
                });
                editor.disabled = false;
                editor.removeAttribute('readonly');

                const host = document.createElement('div');
                host.style.minHeight = '260px';
                host.appendChild(editor);

                await foundry.applications.api.DialogV2.wait({
                    window: { title: `Collab Spike — ${page.name}` },
                    position: { width: 600, height: 420 },
                    content: '<p>Type below. Open this same check on another client and watch.</p>',
                    render: (_ev, dialog) => {
                        dialog.element.querySelector('.window-content')?.appendChild(host);
                        // The element mounts inactive; the open event is where it
                        // actually activates and the collaboration session starts.
                        editor.addEventListener('open', () => {
                            editor.disabled = false;
                            editor.removeAttribute('readonly');
                            requestAnimationFrame(() => {
                                const content = editor.querySelector('.editor-content');
                                content?.setAttribute('contenteditable', 'true');
                                content?.focus();
                            });
                            log('Editor activated. If a second client is open, type and compare.');
                        }, { once: true });
                    },
                    buttons: [{ action: 'done', label: 'Close', default: true }]
                }).catch(() => null);

                log('Closed. Report whether text typed on one client appeared on the other.');
            }
        },
        {
            id: 'collab-cleanup',
            label: 'Clean up the collab spike',
            tier: 'interactive',
            group: 'Collaborative editing spike',
            note: 'Deletes the ZZ Collab Spike page. GM only.',
            run: async ({ expect, log }) => {
                if (!game.user.isGM) {
                    log('GM only.');
                    return;
                }
                const pages = game.journal.contents
                    .flatMap(e => e.pages.contents)
                    .filter(p => p.name === 'ZZ Collab Spike');
                for (const page of pages) await page.delete();
                expect('spike pages removed', game.journal.contents
                    .flatMap(e => e.pages.contents)
                    .filter(p => p.name === 'ZZ Collab Spike').length, 0);
                log(`Deleted ${pages.length} spike page(s).`);
            }
        },

        // ---------- needs a person ----------
        {
            id: 'player-can-annotate-own-note',
            label: 'A player can annotate their own note without a GM',
            tier: 'interactive',
            group: 'Permissions — needs a second client',
            note: 'Log in as a player who OWNS a note page, run this, and confirm it attaches. ' +
                  'This is why annotations live on the note rather than in a world setting — a ' +
                  'central store would force every player annotation through a GM proxy.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.canAnnotate');
                if (game.user.isGM) {
                    log('Running as GM — this check only means something as a player.');
                    return;
                }
                const owned = game.journal?.contents
                    ?.flatMap(e => e.pages.contents)
                    ?.find(p => p.isOwner);
                if (!expect.ok('this player owns at least one journal page', !!owned)) return;

                const annotation = await api.notes.attach(owned, someTarget());
                expect.ok('a player attached without a GM proxy', !!annotation);
                if (annotation) await api.notes.detach(owned, annotation.id);
            }
        },
        {
            id: 'player-refused-on-unowned-note',
            label: 'A player cannot annotate a note they do not own',
            tier: 'interactive',
            group: 'Permissions — needs a second client',
            note: 'As a player, on a GM-only note page. Expect a refusal warning and no write. ' +
                  'Permission is gated on the NOTE, not the target — annotating an actor you ' +
                  'do not own is allowed and intended.',
            run: async ({ expect, log }) => {
                const api = requireApi('notes.canAnnotate');
                if (game.user.isGM) {
                    log('Running as GM — this check only means something as a player.');
                    return;
                }
                const unowned = game.journal?.contents
                    ?.flatMap(e => e.pages.contents)
                    ?.find(p => !p.isOwner);
                if (!expect.ok('a page this player does not own exists', !!unowned)) return;

                expect('canAnnotate says no', api.notes.canAnnotate(unowned), false);
                expect('attach refused', await api.notes.attach(unowned, someTarget()), null);
            }
        }
    ]
};
