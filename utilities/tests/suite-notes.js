// ==================================================================
// ===== SUITE: api.notes (annotations) =============================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste utilities/test-harness.js instead; it
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

import { requireApi, settingRow } from './harness-lib.js';

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
