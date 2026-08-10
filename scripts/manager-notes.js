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

/** Flag key on the note page holding its annotation array. */
const FLAG_KEY = 'annotations';

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
