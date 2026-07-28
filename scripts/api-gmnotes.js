// ==================================================================
// ===== API-GMNOTES – Public interface for the GM Notes system =====
// ==================================================================
// Thin wrapper over GMNotesManager. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.gmNotes
// See documentation/api/api-gmnotes.md for full method contracts.
// ==================================================================

import { GMNotesManager, GMNotesWriteError } from './manager-gmnotes.js';
import { GMNotesFieldController } from './ui-gmnotes-field.js';

export class GMNotesAPI {

    static get PRESERVE_ON_REIMPORT() {
        return Object.freeze([`flags.coffee-pub-blacksmith.gmNotes`]);
    }

    static get WriteError() {
        return GMNotesWriteError;
    }

    static isAvailable() {
        return GMNotesManager.isAvailable();
    }

    /** Hook name fired after every note write/clear. */
    static get CHANGE_HOOK() {
        return GMNotesManager.CHANGE_HOOK;
    }

    // ============================================================
    // Read
    // ============================================================

    /** Full envelope { schemaVersion, html, text, pinned, updatedAt } or null. */
    static get(uuid) {
        return GMNotesManager.getNote(uuid);
    }

    /** Rich HTML (empty string if none). */
    static getHtml(uuid) {
        return GMNotesManager.getHtml(uuid);
    }

    /** Plain-text mirror — indexable for gm: search. */
    static getText(uuid) {
        return GMNotesManager.getText(uuid);
    }

    /** True if the document has a non-empty note. */
    static has(uuid) {
        return GMNotesManager.hasNote(uuid);
    }

    static getAsync(uuid) {
        return GMNotesManager.getNoteAsync(uuid);
    }

    static getHtmlAsync(uuid) {
        return GMNotesManager.getHtmlAsync(uuid);
    }

    static getTextAsync(uuid) {
        return GMNotesManager.getTextAsync(uuid);
    }

    static hasAsync(uuid) {
        return GMNotesManager.hasNoteAsync(uuid);
    }

    static getMany(uuids) {
        return GMNotesManager.getMany(uuids);
    }

    static canSet(uuid) {
        return GMNotesManager.canSet(uuid);
    }

    // ============================================================
    // Write
    // ============================================================

    /** Replace the note. data: { html?, pinned? }. Returns the envelope or null. */
    static set(uuid, data) {
        return GMNotesManager.setNote(uuid, data);
    }

    static setOrThrow(uuid, data) {
        return GMNotesManager.setNoteOrThrow(uuid, data);
    }

    /** Remove all note data from the document. */
    static clear(uuid) {
        return GMNotesManager.clearNote(uuid);
    }

    /**
     * Build a reusable GM-only field/controller for a custom document sheet.
     * The returned controller exposes element, mount(root), refresh(), destroy().
     */
    static createField(uuid, options = {}) {
        return GMNotesFieldController.create(uuid, options);
    }

    /** Friendly alias matching the original integration proposal. */
    static renderField(uuid, options = {}) {
        return this.createField(uuid, options);
    }
}
