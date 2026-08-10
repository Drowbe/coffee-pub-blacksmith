// ==================================================================
// ===== NOTES API - the public annotation surface ==================
// ==================================================================
//
// Thin layer over NotesManager. Consuming modules get this as
// `blacksmith.notes` and never import the manager.
//
// Mechanism and the reasoning behind the storage choice live in
// documentation/architecture/architecture-notes.md.
//
// ==================================================================

import { NotesManager, ANCHOR_KINDS } from './manager-notes.js';

export const NotesAPI = {

    /** Anchor kinds: `document`, `point`, `region`. */
    ANCHOR_KINDS,

    /**
     * Attach a note to a target.
     * @param {JournalEntryPage|string} note the note page, or its uuid
     * @param {Document|string} target what the note is about, or its uuid
     * @param {object} [options]
     * @param {object} [options.anchor] `{ kind, ... }`; defaults to `{ kind: 'document' }`
     * @param {string} [options.moduleId] your module id, for later filtering
     * @returns {Promise<object|null>} the annotation, or null if refused
     */
    attach: (note, target, options) => NotesManager.attach(note, target, options),

    /**
     * Remove one annotation by id.
     * @returns {Promise<boolean>} whether anything was removed
     */
    detach: (note, annotationId) => NotesManager.detach(note, annotationId),

    /**
     * Remove every annotation on a note pointing at a target, whatever the anchor.
     * @returns {Promise<number>} how many were removed
     */
    detachTarget: (note, target) => NotesManager.detachTarget(note, target),

    /**
     * Everything attached to a target -- the question a journal cannot answer.
     * @param {Document|string} target
     * @param {object} [options]
     * @param {string} [options.kind] only this anchor kind
     * @returns {Array<object>}
     */
    getByTarget: (target, options) => NotesManager.getByTarget(target, options),

    /**
     * What a note is attached to.
     * @returns {Array<object>}
     */
    getByNote: (note) => NotesManager.getByNote(note),

    /** Whether anything is attached to a target. Cheaper than getByTarget for a badge. */
    hasTarget: (target) => NotesManager.hasTarget(target),

    /** Every target with at least one annotation. */
    getAnnotatedTargets: () => NotesManager.getAnnotatedTargets(),

    /**
     * Whether the current user may change this note's annotations.
     *
     * Gated on the NOTE's ownership, not the target's -- annotating is note-taking,
     * not editing the thing noted. Ask before offering the control.
     */
    canAnnotate: (note) => NotesManager.canAnnotate(note),

    /** Rebuild the target index. Only needed after bulk document changes the hooks did not see. */
    rebuildIndex: () => NotesManager.rebuildIndex()
};
