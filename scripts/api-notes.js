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

import { NotesManager, ANCHOR_KINDS, NOTE_VISIBILITY, NOTE_TAG_CONTEXT } from './manager-notes.js';
import { NoteReminders, REMINDER_CLOCKS } from './manager-note-reminders.js';

export const NotesAPI = {

    /** Anchor kinds: `document`, `point`, `region`. */
    ANCHOR_KINDS,

    /** Visibility values: `private` (author + GMs) or `party` (everyone). */
    VISIBILITY: NOTE_VISIBILITY,

    /** Tag context key for notes, for anyone reading the Tags registry directly. */
    TAG_CONTEXT: NOTE_TAG_CONTEXT,

    // ---- the notes themselves ----

    /**
     * Create a note in the configured notes journal.
     * @param {object} [data] `{ title, content, visibility, tags }`
     * @returns {Promise<JournalEntryPage|null>} null when refused
     */
    createNote: (data) => NotesManager.createNote(data),

    /**
     * Change a note's title, content, or visibility.
     * Visibility rewrites Foundry ownership -- that is what makes it private.
     * @returns {Promise<boolean>}
     */
    updateNote: (note, changes) => NotesManager.updateNote(note, changes),

    /** Delete a note. Its annotations and tags go with it. */
    deleteNote: (note) => NotesManager.deleteNote(note),

    /**
     * Notes the current user can see, filtered by permission rather than by flag.
     * @param {object} [options] `{ tag, authorId }`
     * @returns {JournalEntryPage[]}
     */
    listNotes: (options) => NotesManager.listNotes(options),

    /** Whether a page is a note. */
    isNote: (page) => NotesManager.isNote(page),

    /** The configured notes journal, or null when a GM has not chosen one. */
    getNotesJournal: () => NotesManager.getNotesJournal(),

    /** A note's tags, from the shared Tags registry. */
    getNoteTags: (note) => NotesManager.getNoteTags(note),

    /** Replace a note's tags. */
    setNoteTags: (note, tags) => NotesManager.setNoteTags(note, tags),

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

    // ---- reminders: a note with a moment ----

    /** The two clocks a reminder can be bound to: `world` and `real`. */
    REMINDER_CLOCKS,

    /**
     * Bind a note to a world time. Clears any previous firing, because moving a
     * reminder forward is asking to be reminded again. The real-time reminder, if
     * there is one, is untouched.
     * @param {JournalEntryPage|string} note
     * @param {number} dueAt world time in seconds
     * @returns {Promise<boolean>}
     */
    setReminder: (note, dueAt) => NoteReminders.set(note, dueAt),

    /** Unbind a note from its world moment. It stays a note. @returns {Promise<boolean>} */
    clearReminder: (note) => NoteReminders.clear(note),

    /** When a note is due in world time, or null. @returns {number|null} */
    getReminder: (note) => NoteReminders.getDue(note),

    /** When a note resurfaced in world time, or null if it has not yet. @returns {number|null} */
    getReminderFired: (note) => NoteReminders.getFired(note),

    /**
     * Bind a note to a real moment. Epoch milliseconds, so it is an absolute
     * instant and needs no timezone handling -- it fires on the author's own
     * machine, at their own wall clock.
     * @param {number} dueAt epoch milliseconds
     * @returns {Promise<boolean>}
     */
    setRealReminder: (note, dueAt) => NoteReminders.setReal(note, dueAt),

    /** Unbind a note from its real moment. @returns {Promise<boolean>} */
    clearRealReminder: (note) => NoteReminders.clearReal(note),

    /** When a note is due in real time, or null. @returns {number|null} epoch milliseconds */
    getRealReminder: (note) => NoteReminders.getRealDue(note),

    /** When a real-time reminder resurfaced, or null. @returns {number|null} */
    getRealReminderFired: (note) => NoteReminders.getRealFired(note),

    /**
     * Reminders in a window of world time, in due order.
     *
     * Both bounds inclusive, either omittable -- so this answers "due today" for a
     * calendar day cell and "everything pending" for a list with no second method.
     * Filtered by note permission, so it never reports a note you cannot read.
     *
     * @param {object} [options] `{ from, to, includeFired }`
     * @returns {Array<{note: JournalEntryPage, dueAt: number, firedAt: number|null}>}
     */
    listReminders: (options) => NoteReminders.list(options),

    /** The same, for real-time reminders. Bounds in epoch milliseconds. */
    listRealReminders: (options) => NoteReminders.listReal(options),

    /** Whether the current user may set a reminder on this note. Same answer for both clocks. */
    canSetReminder: (note) => NoteReminders.canSet(note),

    /** A world time as a date and clock in the world's own calendar. */
    formatMoment: (time) => NoteReminders.formatMoment(time),

    /** A real instant as the reader's own local date and time. */
    formatRealMoment: (time) => NoteReminders.formatRealMoment(time),

    /** Rebuild the target index. Only needed after bulk document changes the hooks did not see. */
    rebuildIndex: () => NotesManager.rebuildIndex()
};
