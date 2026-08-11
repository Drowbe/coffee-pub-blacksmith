// ==================================================================
// ===== MANAGER-NOTES - annotations, the relationship layer ========
// ==================================================================
//
// An annotation is a triple: (note, target, anchor).
//
//   note    a JournalEntryPage. Foundry already owns editing, ownership,
//           search, and export; rebuilding any of that is how this becomes
//           a fancy journal, which would be worth nothing.
//   target  the UUID of whatever the note is about.
//   anchor  where on the target: the whole document, a canvas point, or a
//           region. See ANCHOR_KINDS.
//
// The point of the layer is the question a journal cannot answer: "what is
// attached to this thing?" -- asked from an actor sheet, a canvas point, a
// map region. If that question stops being answerable, this file has failed
// its purpose and should be deleted rather than patched.
//
// STORAGE. Annotations live in flags on the note page, not in a central
// store, which is a deliberate divergence from how Tags works. A tag
// assignment has no owning document; an annotation always has one. That buys
// three things: a player who owns their note can write annotations without a
// GM round trip, deleting a note takes its annotations with it rather than
// leaving orphans nobody cleans up, and annotations travel with the note
// through export and import.
//
// The cost is that target lookups would be a scan, so there is an index --
// derived, rebuilt at ready, maintained by hooks. The flags stay the source
// of truth, so if the index is the wrong shape it can be replaced without
// migrating anyone's data.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { PIN_ACCESS_ICONS } from './pin-permission-icons.js';

/** Flag key on the note page holding its annotation array. */
const FLAG_KEY = 'annotations';

/**
 * Marks a JournalEntryPage as a note.
 *
 * A note is an ordinary text page, not a document subtype. That is deliberate and
 * it is the line drawn in TODO-GLOBAL: owning a subtype means owning a domain, and
 * notes are a surface over documents Foundry already owns. It also means a note
 * survives Blacksmith being uninstalled -- it degrades to the journal page it
 * always was, rather than becoming unreadable.
 */
const NOTE_TYPE_FLAG = 'noteType';
const NOTE_TYPE = 'note';

/**
 * How a note's pin looks and behaves when it is first created.
 *
 * Field names and permitted values come from `pins-schema.js` -- `textLayout`
 * normalises "below the pin" to `under`, and an animation of `null` is the
 * config window's "None". Only the starting point: the pin belongs to the note
 * and the pin config window overwrites any of this.
 */
const NOTE_PIN_DESIGN = Object.freeze({
    // The note icon, so a marker reads as a note before anyone changes it.
    image: '<i class="fa-solid fa-note-sticky"></i>',
    size: { w: 50, h: 50 },
    shape: 'circle',
    style: { fill: '#c4ac12', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
    dropShadow: true,
    textLayout: 'under',
    textDisplay: 'hover',
    textColor: '#ffffff',
    textSize: 20,
    // 0 is "no limit"; the config window shows it as an empty Max Characters.
    textMaxLength: 0,
    textMaxWidth: 50,
    textScaleWithPin: true,
    eventAnimations: {
        hover: { animation: 'ripple', sound: null },
        click: { animation: null, sound: null },
        doubleClick: { animation: 'scale-medium', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3' },
        add: { animation: 'rotate', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3' },
        delete: { animation: 'dissolve', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3' }
    }
});

/** Socket channel for the GM-side ownership write. See NotesManager.applyOwnership. */
const NOTES_GM_PROXY = 'blacksmith-notes-gm-proxy';

/** Tag context key, so note tags land in the shared registry rather than a private list. */
export const NOTE_TAG_CONTEXT = `${MODULE.ID}.note`;

/**
 * Who can read a note.
 *
 * Two STORED values, but three shapes. `private` is the author plus GMs;
 * `party` is every player. The third -- shared with named people -- is
 * `private` plus a `sharedWith` list, because it is still "not everyone" and
 * storing a third flag value would mean two places to look for the same fact.
 * Ownership is the truth in every case; the flag only records intent.
 *
 * Expressed as real Foundry ownership rather than a flag Blacksmith checks, so
 * permission holds where Blacksmith is not the one asking -- a compendium
 * export, a direct journal browse, another module's sheet.
 *
 * This is also why there is no give-to feature: handing somebody a note is
 * sharing it with them and removing yourself.
 */
export const NOTE_VISIBILITY = Object.freeze({
    PRIVATE: 'private',
    PARTY: 'party'
});

/**
 * Where an annotation attaches on its target.
 *
 * `point` carries a `pinId` rather than coordinates, because Pins already owns
 * placement and a second implementation is exactly what this layer exists to
 * prevent. An unplaced pin is a note with no location yet, which Pins already
 * models in its `pinsUnplaced` store.
 */
export const ANCHOR_KINDS = Object.freeze({
    DOCUMENT: 'document',
    POINT: 'point',
    REGION: 'region'
});

export class NotesManager {

    /**
     * targetUuid -> Set of "notePageUuid" strings.
     *
     * Derived. Never written to disk, never consulted as truth -- every read
     * that returns annotation data resolves the page and reads its flags, so a
     * stale index can cost a miss but cannot report something false.
     */
    static _indexByTarget = new Map();

    /** Whether the index has been built. Reads build it on demand if not. */
    static _indexed = false;

    /** Whether the GM-side ownership handler has been registered on this client. */
    static _gmProxyRegistered = false;

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    /** Build the index and keep it current. Called from `ready`. */
    static initialize() {
        this.rebuildIndex();

        // Any of these can change a page's annotation flags -- including a page
        // arriving from an import, which is why create is watched and not just
        // update.
        for (const name of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
            HookManager.registerHook({
                name,
                description: 'Notes: keep the annotation index current',
                priority: 4,
                context: 'notes-index',
                callback: (page) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    this._reindexPage(page);
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }

        // A whole JournalEntry going away takes its pages with it, and the page
        // hook does not fire for each one.
        HookManager.registerHook({
            name: 'deleteJournalEntry',
            description: 'Notes: drop index entries for a deleted journal',
            priority: 4,
            context: 'notes-index',
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                this.rebuildIndex();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        postConsoleAndNotification(MODULE.NAME, `Notes: indexed ${this._indexByTarget.size} annotated target(s)`, '', true, false);
    }

    /** Rebuild from scratch. Cheap enough to be the answer whenever correctness is in doubt. */
    static rebuildIndex() {
        this._indexByTarget = new Map();
        for (const entry of game.journal ?? []) {
            for (const page of entry.pages ?? []) {
                this._addToIndex(page);
            }
        }
        this._indexed = true;
    }

    static _ensureIndexed() {
        if (!this._indexed) this.rebuildIndex();
    }

    static _addToIndex(page) {
        for (const annotation of this._readRaw(page)) {
            if (!annotation?.targetUuid) continue;
            if (!this._indexByTarget.has(annotation.targetUuid)) {
                this._indexByTarget.set(annotation.targetUuid, new Set());
            }
            this._indexByTarget.get(annotation.targetUuid).add(page.uuid);
        }
    }

    /**
     * Re-index one page.
     *
     * Removes the page from every target first, because an update may have
     * detached a target and there is no way to know which one from the new
     * state alone. The map is small and the alternative is a diff nobody would
     * trust.
     */
    static _reindexPage(page) {
        if (!page?.uuid) return;
        this._ensureIndexed();

        for (const [targetUuid, pages] of this._indexByTarget) {
            pages.delete(page.uuid);
            if (!pages.size) this._indexByTarget.delete(targetUuid);
        }
        this._addToIndex(page);
    }

    /**
     * Tell any rendered GM Notes surface showing this target that its Related Notes
     * section is out of date.
     *
     * Necessary because the section is a LIVE provider: its data is these
     * annotations, not the target's own flags, so nothing the target does would
     * trigger a re-render. Without this the section shows whatever it computed the
     * first time the sheet opened, which reads as the feature not working at all.
     *
     * Imported lazily so this manager does not depend on GM Notes loading first -
     * the notification is a courtesy to a surface that may not exist.
     */
    static _notifyTarget(targetUuid) {
        if (!targetUuid) return;
        import('./manager-gmnotes.js')
            .then(({ GMNotesManager }) => GMNotesManager.notifySectionsChanged?.(targetUuid))
            .catch(() => { /* GM Notes absent: nothing is showing the section anyway */ });
    }

    // ==============================================================
    // ===== NOTES: THE DOCUMENTS ===================================
    // ==============================================================

    /** Whether a page is one of ours. */
    static isNote(page) {
        return page?.getFlag?.(MODULE.ID, NOTE_TYPE_FLAG) === NOTE_TYPE;
    }

    /**
     * The journal notes are written into, or null.
     *
     * Notes are pages in one GM-chosen JournalEntry rather than an entry each,
     * because a world with two hundred notes should not have two hundred entries
     * in the sidebar. The GM picks it so the ownership is theirs to set -- players
     * need OBSERVER on that entry to create notes at all.
     */
    static getNotesJournal() {
        try {
            const id = game.settings.get(MODULE.ID, 'notesJournal');
            if (!id || id === 'none') return null;
            return game.journal.get(id) ?? null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Foundry ownership for a note, derived from its visibility.
     *
     * Expressed as real ownership rather than a flag readers must consult: a note
     * a player should not see is one they cannot load, which is the only version
     * of privacy worth having.
     */
    static buildNoteOwnership(visibility, authorId, sharedWith = []) {
        // FLAT: `{ default, [userId]: level }`. This is Foundry's document ownership
        // shape (`DocumentOwnershipField`), and it is NOT the shape Blacksmith pins
        // use -- pins take `{ default, users: { [userId]: level } }`. The two look
        // interchangeable and are not; passing the pin shape to a document fails
        // validation with "is not a mapping of user IDs and document permission
        // levels". Use toPinOwnership() to convert.
        const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };

        // EVERY non-GM user is named explicitly, including the ones being denied.
        // `ownership` is an ObjectField, so an update MERGES into what is stored --
        // Foundry's own `-=userId` removal syntax (common/data/fields.mjs) exists
        // precisely because of that. Omitting somebody therefore leaves their old
        // level in place, which made granting access work and revoking it silently
        // do nothing. Stating everyone makes the merge deterministic.
        for (const user of game.users) {
            if (!user.isGM) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        }

        if (visibility === NOTE_VISIBILITY.PARTY) {
            for (const user of game.users) {
                if (!user.isGM) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        }
        // Named people, the third shape. Additive to the author rather than instead
        // of them: sharing a note is not giving it away. Handing it over is done by
        // sharing and then removing yourself, which is why there is no separate
        // give-to feature.
        for (const entry of sharedWith) {
            // Tolerate an entity object as well as an id: the user picker returns
            // objects from getSelection() and ids from getSelectedIds(), and passing
            // the wrong one produced a "[object Object]" key that Foundry rejected
            // only at save. Resolving against game.users means a key that is not a
            // real user never reaches the document at all.
            const userId = typeof entry === 'string' ? entry : entry?.id;
            if (userId && game.users.get(userId)) {
                ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        }
        if (authorId) ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        // GMs always own. Without this a GM could write a private note and then be
        // unable to open it, which has happened in every system that forgot it.
        for (const user of game.users) {
            if (user.isGM) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
        return ownership;
    }

    /**
     * Convert document ownership to the shape Blacksmith pins expect.
     *
     * Documents use a flat map; pins nest the users under a `users` key. Keeping
     * the conversion in one named place means the difference is stated once rather
     * than remembered at four call sites.
     *
     * @param {object} ownership flat document ownership
     * @returns {{ default: number, users: Record<string, number> }}
     */
    static toPinOwnership(ownership = {}) {
        const users = {};
        for (const [key, level] of Object.entries(ownership)) {
            if (key === 'default') continue;
            users[key] = level;
        }
        return {
            default: ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
            users
        };
    }

    /**
     * Build the pin payload for a note.
     *
     * One builder for both callers (the list's Place and the editor's pin button)
     * because they had drifted into two copies of the same object literal, and the
     * copy that omitted the caller-supplied `id` failed validation at runtime.
     * Pins does not generate ids -- see `documentation/api/api-pins.md`.
     *
     * The design comes from NOTE_PIN_DESIGN so a note's marker looks like a note
     * before anybody configures it. Whatever is set here is only the starting
     * point -- the pin is the note's own, and editing it through the pin config
     * window overwrites these.
     *
     * @param {JournalEntryPage} note
     * @returns {object} pin data for `PinsAPI.create`, unplaced (no x/y/sceneId)
     */
    static buildNotePinData(note) {
        return {
            id: crypto.randomUUID(),
            moduleId: MODULE.ID,
            type: 'note',
            text: note.name,
            ...NOTE_PIN_DESIGN,
            // From the page's live ownership rather than rebuilt from flags: the
            // ownership is the truth and already carries anyone the note was shared
            // with. Converted because pins nest users and documents do not.
            ownership: this.toPinOwnership(note.ownership),
            config: {
                noteUuid: note.uuid,
                blacksmithAccess: 'private',
                blacksmithVisibility: 'visible'
            }
        };
    }

    // ==============================================================
    // ===== FAVOURITES =============================================
    // ==============================================================

    /**
     * Favourites are per USER, not per note.
     *
     * Two people looking at the same shared note will not favourite the same
     * things, so this cannot live on the page -- one player starring a note would
     * star it for everybody. A user flag is also writable by the player who owns
     * it without a GM round trip, which a world setting would not be.
     */
    static getFavorites() {
        const raw = game.user?.getFlag(MODULE.ID, 'favoriteNotes');
        return Array.isArray(raw) ? raw : [];
    }

    static isFavorite(note) {
        const uuid = typeof note === 'string' ? note : note?.uuid;
        return !!uuid && this.getFavorites().includes(uuid);
    }

    /** @returns {Promise<boolean>} the new state */
    static async toggleFavorite(note) {
        const uuid = typeof note === 'string' ? note : note?.uuid;
        if (!uuid) return false;
        const current = this.getFavorites();
        const next = current.includes(uuid)
            ? current.filter((u) => u !== uuid)
            : [...current, uuid];
        await game.user.setFlag(MODULE.ID, 'favoriteNotes', next);
        Hooks.callAll('blacksmith.notes.favoritesChanged', { noteUuid: uuid });
        return next.includes(uuid);
    }

    /**
     * Create a note.
     *
     * @param {object} [data]
     * @param {string} [data.title]
     * @param {string} [data.content] HTML
     * @param {string} [data.visibility] `private` (default) or `party`
     * @param {string[]} [data.tags] stored in Blacksmith's Tags registry, not on the page
     * @returns {Promise<JournalEntryPage|null>} null when refused
     */
    static async createNote({ title = '', content = '', visibility = NOTE_VISIBILITY.PRIVATE, tags = [], sharedWith = [], keepAuthor = true } = {}) {
        const journal = this.getNotesJournal();
        if (!journal) {
            ui.notifications.error('No notes journal is selected. A GM sets one in Blacksmith settings.');
            return null;
        }
        if (!journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
            ui.notifications.error('You do not have permission to create notes in that journal.');
            return null;
        }

        const resolvedVisibility = visibility === NOTE_VISIBILITY.PARTY
            ? NOTE_VISIBILITY.PARTY
            : NOTE_VISIBILITY.PRIVATE;

        try {
            const [page] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
                name: title?.trim() || 'Untitled Note',
                type: 'text',
                text: { content: content || '' },
                // The authorId FLAG is recorded either way -- who wrote it is a fact.
                // Ownership is the separate question of who can still open it.
                // GM only. A player's create carrying a gmOnly field is refused the
                // same way an update is, and the whole page creation fails with it,
                // so a player's note is created first and its ownership applied a
                // moment later through the GM -- see below.
                ...(game.user.isGM
                    ? { ownership: this.buildNoteOwnership(resolvedVisibility, keepAuthor ? game.user.id : null, sharedWith) }
                    : {}),
                flags: {
                    [MODULE.ID]: {
                        [NOTE_TYPE_FLAG]: NOTE_TYPE,
                        visibility: resolvedVisibility,
                        authorId: game.user.id,
                        timestamp: new Date().toISOString()
                    }
                }
            }]);
            if (!page) return null;

            // A player could not send ownership with the create, so it is applied
            // here through a GM. Until it lands the page inherits the notes
            // journal's ownership, which players hold OBSERVER on -- so a private
            // note written by a player is briefly visible to the others. Closing
            // that gap entirely means creating the page GM-side as well, which is
            // worth doing if notes ever carry anything a player must not glimpse.
            if (!game.user.isGM) {
                await this.applyOwnership(
                    page,
                    this.buildNoteOwnership(resolvedVisibility, keepAuthor ? game.user.id : null, sharedWith)
                );
            }

            // Tags go to the shared registry rather than a flag on the page. Squire
            // kept its own list, which is why the same tag existed twice with two
            // spellings depending on which surface wrote it.
            if (tags.length) await this.setNoteTags(page, tags);

            Hooks.callAll('blacksmith.notes.created', { noteUuid: page.uuid });
            return page;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not create the note', error?.message ?? error, false, false);
            ui.notifications.error('Could not create the note.');
            return null;
        }
    }

    /**
     * Update a note's content, title, or visibility.
     *
     * Changing visibility rewrites ownership, which is the operation that actually
     * makes a note private or shared -- the flag is only a record of intent.
     */
    static async updateNote(note, { title = null, content = null, visibility = null, sharedWith = null, keepAuthor = true } = {}) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page) return false;
        if (!page.isOwner) {
            ui.notifications.warn('You do not have permission to edit that note.');
            return false;
        }

        const update = {};
        if (title !== null) update.name = title.trim() || 'Untitled Note';
        if (content !== null) update['text.content'] = content;

        if (visibility !== null) {
            const resolved = visibility === NOTE_VISIBILITY.PARTY
                ? NOTE_VISIBILITY.PARTY
                : NOTE_VISIBILITY.PRIVATE;
            update[`flags.${MODULE.ID}.visibility`] = resolved;
            // keepAuthor false is the author handing the note over: they drop out of
            // ownership entirely. Passing a null authorId is how that is expressed,
            // since buildNoteOwnership grants whatever author it is given.
            const authorId = keepAuthor
                ? (page.getFlag(MODULE.ID, 'authorId') ?? game.user.id)
                : null;
            update.ownership = this.buildNoteOwnership(resolved, authorId, sharedWith ?? []);
        }

        if (!Object.keys(update).length) return false;

        try {
            // Ownership is split out and written separately: it is a gmOnly field, so
            // including it in a player's update makes the WHOLE update fail -- title
            // and body along with it. Everything else here a note's owner may write.
            const { ownership, ...playerWritable } = update;
            if (Object.keys(playerWritable).length) await page.update(playerWritable);
            if (ownership) {
                const applied = await this.applyOwnership(page, ownership);
                if (!applied) return false;
            }
            // A shared note's pin has to be visible to exactly the people the note
            // is. Blacksmith owns both sides, so this is a direct write rather than
            // Squire's resolveOwnership hook plus a reconciliation pass.
            if (ownership) await this._syncPinOwnership(page, ownership);
            Hooks.callAll('blacksmith.notes.updated', { noteUuid: page.uuid });
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not update the note', error?.message ?? error, false, false);
            return false;
        }
    }

    /**
     * Write a note's ownership, through a GM when the caller is not one.
     *
     * `ownership` is a `gmOnly` field (DocumentOwnershipField, common/data/fields.mjs),
     * and the server enforces it: a player editing a note they OWN still cannot
     * change who else can see it, and gets "The ownership field may only be
     * modified by a GM or Assistant GM user." That is not a permission we can
     * grant -- it is refused above us -- so the write is delegated instead.
     *
     * Same shape as PinManager.requestGM, for the same reason.
     *
     * @param {JournalEntryPage} page
     * @param {object} ownership flat document ownership
     * @returns {Promise<boolean>}
     */
    static async applyOwnership(page, ownership) {
        if (game.user?.isGM) {
            await page.update({ ownership });
            return true;
        }

        const gms = game.users?.filter((u) => u.isGM && u.active) ?? [];
        if (!gms.length) {
            ui.notifications.warn('A GM must be online to change who can see a note.');
            return false;
        }

        try {
            const { SocketManager } = await import('./manager-sockets.js');
            await SocketManager.waitForReady?.();
            const socket = SocketManager.getSocket();
            if (!socket?.executeAsGM) {
                ui.notifications.warn('Could not reach a GM to change who can see that note.');
                return false;
            }
            if (!this._gmProxyRegistered && socket.register) {
                socket.register(NOTES_GM_PROXY, (data) => NotesManager._handleOwnershipRequest(data));
                this._gmProxyRegistered = true;
            }
            const result = await socket.executeAsGM(NOTES_GM_PROXY, {
                pageUuid: page.uuid,
                ownership
            });
            if (result?.error) throw new Error(result.error);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not update ownership through a GM', error?.message ?? error, false, false);
            ui.notifications.error('Could not change who can see that note.');
            return false;
        }
    }

    /**
     * GM side of applyOwnership.
     *
     * Re-checks that the requester may edit the note rather than trusting the
     * message: this runs with GM authority, so an unchecked handler would let any
     * client rewrite the ownership of any page in the world.
     */
    static async _handleOwnershipRequest({ pageUuid, ownership } = {}) {
        try {
            if (!game.user?.isGM) return { error: 'Not a GM.' };
            const page = await fromUuid(pageUuid);
            if (!page) return { error: 'Note not found.' };
            if (!this.isNote(page)) return { error: 'That page is not a note.' };
            await page.update({ ownership });
            return { ok: true };
        } catch (error) {
            return { error: error?.message ?? String(error) };
        }
    }

    /**
     * Mirror a note's ownership onto its pin.
     *
     * Hiding a marker from someone is done with pin OWNERSHIP, not with
     * `blacksmithVisibility` -- that only ghosts it for the GM. So the pin carries
     * the same users map as the page, and a note shared with Bob shows Bob a pin
     * while showing nobody else one.
     *
     * Lazily imported: a note that never gets pinned should not pull Pins in.
     */
    static async _syncPinOwnership(page, ownership) {
        const pinId = page.getFlag(MODULE.ID, 'pinId');
        if (!pinId) return;
        try {
            const { PinsAPI } = await import('./api-pins.js');
            // Converted: the page's flat map is not the pin's nested one.
            await PinsAPI.update(pinId, { ownership: this.toPinOwnership(ownership) });
        } catch (error) {
            // Not fatal: the note's own permission is already correct, and a pin
            // whose ownership lags is a visibility bug rather than a data loss.
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not sync pin ownership', error?.message ?? error, false, false);
        }
    }

    /** Delete a note. Its annotations go with it -- they live on the page. */
    static async deleteNote(note) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page) return false;
        if (!page.isOwner) {
            ui.notifications.warn('You do not have permission to delete that note.');
            return false;
        }
        const uuid = page.uuid;
        try {
            // Drop the tag assignments first: the record id is the page id, and once
            // the page is gone there is nothing left to say which entry was its.
            await this.setNoteTags(page, []);

            // And the pin, for the same reason. Squire needed a periodic sweep for
            // pins whose note had gone because it could not guarantee this ran;
            // owning both sides, the sweep is unnecessary.
            const pinId = page.getFlag(MODULE.ID, 'pinId');
            if (pinId) {
                try {
                    const { PinsAPI } = await import('./api-pins.js');
                    await PinsAPI.delete(pinId);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Notes: could not delete the note pin', error?.message ?? error, false, false);
                }
            }

            await page.delete();
            Hooks.callAll('blacksmith.notes.deleted', { noteUuid: uuid });
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not delete the note', error?.message ?? error, false, false);
            return false;
        }
    }

    /**
     * Every note the current user can see.
     *
     * Filtered by permission rather than by the visibility flag, because ownership
     * is the thing that is actually enforced and the flag is only its record.
     *
     * @param {object} [options]
     * @param {string} [options.tag] only notes carrying this tag
     * @param {string} [options.authorId] only notes by this user
     * @returns {JournalEntryPage[]}
     */
    static listNotes({ tag = null, authorId = null } = {}) {
        const journal = this.getNotesJournal();
        if (!journal) return [];

        let notes = journal.pages.contents.filter((page) => (
            this.isNote(page) && page.testUserPermission(game.user, 'OBSERVER')
        ));

        if (authorId) {
            notes = notes.filter((page) => page.getFlag(MODULE.ID, 'authorId') === authorId);
        }
        if (tag) {
            notes = notes.filter((page) => this.getNoteTags(page).includes(tag));
        }
        return notes;
    }

    // ---- tags, delegated to the Tags system ----

    /** Tags on a note. Read from the shared registry, not from the page. */
    static getNoteTags(note) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page) return [];
        try {
            return game.modules.get(MODULE.ID)?.api?.tags?.getTags?.(NOTE_TAG_CONTEXT, page.id) ?? [];
        } catch (_) {
            return [];
        }
    }

    /** Replace a note's tags. */
    static async setNoteTags(note, tags = []) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page) return false;
        try {
            await game.modules.get(MODULE.ID)?.api?.tags?.setTags?.(NOTE_TAG_CONTEXT, page.id, tags);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not write tags', error?.message ?? error, true, false);
            return false;
        }
    }

    // ==============================================================
    // ===== ADOPTING SQUIRE'S NOTES ================================
    // ==============================================================

    /**
     * Claim Squire's note pages as Blacksmith notes, once.
     *
     * Squire stored a note as a text page flagged `noteType: 'sticky'` under its own
     * namespace, carrying `tags`, `visibility`, `authorId`, and `timestamp`. Three of
     * those have a better home here, so this is a translation rather than a copy:
     * tags move into the shared registry, and everything else becomes Blacksmith
     * flags of the same meaning.
     *
     * What it does NOT do is delete Squire's flags. Leaving them costs a few bytes
     * and means a world can be rolled back to a Squire release without the notes
     * having been quietly rewritten out from under it. Squire drops them when it
     * removes the feature.
     *
     * GM only -- it writes page flags across the whole notes journal, and a player
     * would fail on every page they do not own. Guarded per world.
     *
     * @returns {Promise<number>} how many notes were adopted this run
     */
    static async adoptSquireNotes() {
        if (!game.user?.isGM) return 0;

        let ledger;
        try {
            ledger = game.settings.get(MODULE.ID, 'adoptedSettingsWorld') ?? [];
        } catch (_) {
            return 0;
        }
        const LEDGER_KEY = 'coffee-pub-squire:notes';
        // Deliberately NOT an early return on the ledger. While Squire still has
        // Notes, a sticky note created after the first adoption would be stranded
        // for good, which is exactly what happened once. The scan skips pages that
        // are already ours, so re-running costs one pass over a single journal and
        // the ledger only records that adoption has happened at least once.
        const alreadyRun = ledger.includes(LEDGER_KEY);

        const journal = this.getNotesJournal();
        if (!journal) return 0;   // nothing to adopt into yet; try again next load

        let adopted = 0;
        try {
            for (const page of journal.pages.contents) {
                // Already ours, or never Squire's.
                if (this.isNote(page)) continue;
                // Read the flag object directly rather than via getFlag(). getFlag
                // throws for a scope that is not "currently active" -- the scope list
                // is built from `module.active` (client/data/client-backend.mjs) -- so
                // once Squire is disabled or uninstalled every read here would throw
                // and adoption would strand the notes permanently. The flag DATA
                // survives on the page either way, which is what we actually need.
                const squire = page.flags?.['coffee-pub-squire'] ?? {};
                if (squire.noteType !== 'sticky') continue;

                const visibility = squire.visibility === 'party'
                    ? NOTE_VISIBILITY.PARTY
                    : NOTE_VISIBILITY.PRIVATE;
                const authorId = squire.authorId ?? null;
                const timestamp = squire.timestamp ?? null;
                const tags = squire.tags;

                await page.update({
                    [`flags.${MODULE.ID}.${NOTE_TYPE_FLAG}`]: NOTE_TYPE,
                    [`flags.${MODULE.ID}.visibility`]: visibility,
                    [`flags.${MODULE.ID}.authorId`]: authorId,
                    [`flags.${MODULE.ID}.timestamp`]: timestamp
                    // Ownership is deliberately NOT rewritten. Squire already set it
                    // from the same visibility model, so recomputing would at best
                    // change nothing and at worst overwrite a GM's manual edit.
                });

                if (Array.isArray(tags) && tags.length) await this.setNoteTags(page, tags);
                adopted++;
            }

            if (!alreadyRun) {
                await game.settings.set(MODULE.ID, 'adoptedSettingsWorld', [...ledger, LEDGER_KEY]);
            }
            if (adopted) {
                postConsoleAndNotification(MODULE.NAME, `Notes: adopted ${adopted} note(s) from Squire`, '', false, false);
            }
        } catch (error) {
            // Not marked done, so a failure retries next load rather than losing the
            // notes. Partial progress is safe: adopted pages are skipped by isNote.
            postConsoleAndNotification(MODULE.NAME, 'Notes: adopting Squire notes failed; will retry next load', error?.message ?? error, false, false);
        }
        return adopted;
    }

    // ==============================================================
    // ===== READS ==================================================
    // ==============================================================

    /** The raw flag array for a page, always an array. */
    static _readRaw(page) {
        const stored = page?.getFlag?.(MODULE.ID, FLAG_KEY);
        return Array.isArray(stored) ? stored : [];
    }

    /**
     * Annotations belonging to a note page, each stamped with its note's uuid so
     * a caller holding a mixed list can tell them apart.
     *
     * @param {JournalEntryPage|string} note page or its uuid
     * @returns {Array<object>}
     */
    static getByNote(note) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page) return [];
        return this._readRaw(page).map((annotation) => ({ ...annotation, noteUuid: page.uuid }));
    }

    /**
     * Everything attached to a target. The question this layer exists to answer.
     *
     * Resolves through the index but reads the answer from the pages, so an index
     * that has drifted stale can under-report but cannot invent an annotation.
     *
     * @param {Document|string} target document or its uuid
     * @param {object} [options]
     * @param {string} [options.kind] only annotations with this anchor kind
     * @returns {Array<object>}
     */
    static getByTarget(target, { kind = null } = {}) {
        const targetUuid = typeof target === 'string' ? target : target?.uuid;
        if (!targetUuid) return [];
        this._ensureIndexed();

        const results = [];
        for (const pageUuid of this._indexByTarget.get(targetUuid) ?? []) {
            const page = fromUuidSync(pageUuid);
            if (!page) continue;
            for (const annotation of this._readRaw(page)) {
                if (annotation?.targetUuid !== targetUuid) continue;
                if (kind && annotation?.anchor?.kind !== kind) continue;
                results.push({ ...annotation, noteUuid: page.uuid });
            }
        }
        return results;
    }

    /** Whether anything is attached to a target. Cheaper than getByTarget for a badge or a gate. */
    static hasTarget(target) {
        const targetUuid = typeof target === 'string' ? target : target?.uuid;
        if (!targetUuid) return false;
        this._ensureIndexed();
        return (this._indexByTarget.get(targetUuid)?.size ?? 0) > 0;
    }

    /** Every target that has at least one annotation. */
    static getAnnotatedTargets() {
        this._ensureIndexed();
        return [...this._indexByTarget.keys()];
    }

    // ==============================================================
    // ===== WRITES =================================================
    // ==============================================================

    /**
     * Whether the current user may change a note's annotations.
     *
     * Deliberately the note's ownership and not the target's: annotating is an act
     * of note-taking, not of editing the thing being noted. A player may write "the
     * duke is lying" against an actor they do not own, which is the entire point of
     * players having notes.
     */
    static canAnnotate(note) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        return !!page?.isOwner;
    }

    /**
     * Attach a note to a target.
     *
     * No GM round trip: the write is to the note's own flags, and a player who owns
     * their note owns those. That is the reason this layer stores annotations here
     * rather than in a world setting.
     *
     * Attaching the same note to the same target with the same anchor kind is
     * idempotent -- it returns the existing annotation rather than making a second.
     *
     * @param {JournalEntryPage|string} note
     * @param {Document|string} target
     * @param {object} [options]
     * @param {object} [options.anchor] defaults to `{ kind: 'document' }`
     * @param {string} [options.moduleId] who created it, for later filtering
     * @returns {Promise<object|null>} the annotation, or null if refused
     */
    static async attach(note, target, { anchor = null, moduleId = MODULE.ID } = {}) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        const targetUuid = typeof target === 'string' ? target : target?.uuid;

        if (!page || !targetUuid) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: attach needs both a note page and a target', { note, target }, false, false);
            return null;
        }
        if (!this.canAnnotate(page)) {
            ui.notifications.warn('You do not have permission to edit that note.');
            return null;
        }

        const resolvedAnchor = anchor ?? { kind: ANCHOR_KINDS.DOCUMENT };
        const existing = this._readRaw(page).find((a) => (
            a?.targetUuid === targetUuid && a?.anchor?.kind === resolvedAnchor.kind
        ));
        if (existing) return { ...existing, noteUuid: page.uuid };

        const annotation = {
            id: foundry.utils.randomID(),
            targetUuid,
            anchor: resolvedAnchor,
            moduleId,
            createdBy: game.user.id,
            createdAt: Date.now()
        };

        await page.setFlag(MODULE.ID, FLAG_KEY, [...this._readRaw(page), annotation]);
        this._reindexPage(page);
        Hooks.callAll('blacksmith.notes.attached', { ...annotation, noteUuid: page.uuid });
        // Any GM Notes surface showing the TARGET has a Related Notes section whose
        // data just changed. Nothing else would tell it to look again.
        this._notifyTarget(targetUuid);
        return { ...annotation, noteUuid: page.uuid };
    }

    /**
     * Remove an annotation by its id.
     *
     * @param {JournalEntryPage|string} note
     * @param {string} annotationId
     * @returns {Promise<boolean>} whether anything was removed
     */
    static async detach(note, annotationId) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        if (!page || !annotationId) return false;
        if (!this.canAnnotate(page)) {
            ui.notifications.warn('You do not have permission to edit that note.');
            return false;
        }

        const current = this._readRaw(page);
        // Captured before the filter: after it, there is nothing left to say which
        // target this annotation pointed at, and that is what needs refreshing.
        const removedTargetUuid = current.find((a) => a?.id === annotationId)?.targetUuid ?? null;
        const remaining = current.filter((a) => a?.id !== annotationId);
        if (remaining.length === current.length) return false;

        await page.setFlag(MODULE.ID, FLAG_KEY, remaining);
        this._reindexPage(page);
        Hooks.callAll('blacksmith.notes.detached', { annotationId, noteUuid: page.uuid });
        this._notifyTarget(removedTargetUuid);
        return true;
    }

    /**
     * Remove every annotation on a note that points at a target, whatever the anchor.
     * @returns {Promise<number>} how many were removed
     */
    static async detachTarget(note, target) {
        const page = typeof note === 'string' ? fromUuidSync(note) : note;
        const targetUuid = typeof target === 'string' ? target : target?.uuid;
        if (!page || !targetUuid) return 0;
        if (!this.canAnnotate(page)) {
            ui.notifications.warn('You do not have permission to edit that note.');
            return 0;
        }

        const current = this._readRaw(page);
        const remaining = current.filter((a) => a?.targetUuid !== targetUuid);
        const removed = current.length - remaining.length;
        if (!removed) return 0;

        await page.setFlag(MODULE.ID, FLAG_KEY, remaining);
        this._reindexPage(page);
        Hooks.callAll('blacksmith.notes.detached', { targetUuid, noteUuid: page.uuid, count: removed });
        this._notifyTarget(targetUuid);
        return removed;
    }
}


/** The icon a note shows when it has no pin of its own. Matches the menubar tool. */
export const NOTE_DEFAULT_ICON = 'fa-solid fa-note-sticky';

/**
 * Markup for a note's icon.
 *
 * A note's icon IS its pin's image -- one copy, not two -- and Pins stores that
 * either as a normalised Font Awesome class list or as an image path
 * (`normalizePinImageForStorage`, scripts/pins-schema.js). Both windows render it,
 * so the discrimination lives here rather than being written twice.
 *
 * @param {string|null} image the pin's stored image, if any
 * @returns {string} HTML
 */
export function noteIconHtml(image) {
    const raw = (typeof image === 'string' ? image : '').trim();
    const value = raw || NOTE_DEFAULT_ICON;
    const isIcon = /^fa-/.test(value) || value.startsWith('<i');
    if (isIcon) {
        const classes = value.startsWith('<i')
            ? (value.match(/class=["']([^"']+)["']/)?.[1] ?? NOTE_DEFAULT_ICON)
            : value;
        return `<i class="${foundry.utils.escapeHTML(classes)}"></i>`;
    }
    return `<img src="${foundry.utils.escapeHTML(value)}" alt="">`;
}


/**
 * The users who can meaningfully be given a note.
 *
 * Excludes GMs, who own every note by construction, and excludes any user whose
 * assigned character is a GROUP actor. A group actor is the party itself -- the
 * Elegant Eight token, not a person -- so it is not an editor of anything and
 * offering it in an access list is offering to share a note with a roster.
 */
export function noteAccessUsers() {
    return (game.users?.contents ?? []).filter((user) => (
        !user.isGM && user.character?.type !== 'group'
    ));
}

/**
 * The badge for "n of m people have this".
 *
 * THE one rule. The editor calls it with the live tick counts so the badge moves
 * as you click; the list calls it through noteAccessMode with saved ownership.
 * Each computed its own before, and they disagreed -- the list showed a padlock
 * where the editor showed GMs only.
 *
 * @param {{ total: number, selected: number }} counts
 * @returns {{ mode: string, icon: string, label: string }}
 */
export function noteAccessBadge({ total = 0, selected = 0 } = {}) {
    if (total > 0 && selected === total) {
        // The helmet is the party mark everywhere else in Blacksmith.
        return { mode: 'party', icon: 'fa-solid fa-helmet-battle', label: 'Everyone in the party' };
    }
    if (selected > 0) {
        return {
            mode: 'shared',
            icon: 'fa-solid fa-user-group',
            label: `Shared with ${selected} ${selected === 1 ? 'person' : 'people'}`
        };
    }
    // Nobody but GMs. A player looking at their own note calls that private; for a
    // GM it is a note no player can see, which is a different statement.
    return game.user.isGM
        ? { mode: 'gm', icon: PIN_ACCESS_ICONS.gm, label: 'GMs only' }
        : { mode: 'private', icon: 'fa-solid fa-lock', label: 'Only me' };
}

/**
 * How a note is shared, read from saved ownership.
 *
 * @param {JournalEntryPage} note
 * @returns {{ mode: string, icon: string, label: string }}
 */
export function noteAccessMode(note) {
    const players = noteAccessUsers();
    const owners = players.filter((user) => (
        note?.ownership?.[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    ));
    return noteAccessBadge({ total: players.length, selected: owners.length });
}

// The GM must have the ownership handler registered BEFORE any player asks for a
// write. Lazy registration inside applyOwnership only runs on the calling client,
// which is by definition not the GM. Mirrors the pins proxy in manager-pins.js.
if (typeof Hooks !== 'undefined') {
    Hooks.once('blacksmith.socketReady', async () => {
        try {
            const { SocketManager } = await import('./manager-sockets.js');
            const socket = SocketManager.getSocket();
            if (!socket?.register || NotesManager._gmProxyRegistered) return;
            socket.register(NOTES_GM_PROXY, (data) => NotesManager._handleOwnershipRequest(data));
            NotesManager._gmProxyRegistered = true;
        } catch (_) {
            // applyOwnership still attempts lazy registration when called.
        }
    });
}
