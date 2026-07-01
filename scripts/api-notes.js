// ==================================================================
// ===== API-NOTES – Public interface for the GM Notes system =======
// ==================================================================
// Thin wrapper over NotesManager. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.notes
// See documentation/api/api-notes.md for full method contracts.
// ==================================================================

import { NotesManager } from './manager-notes.js';

export class NotesAPI {

    static isAvailable() {
        return NotesManager.isAvailable();
    }

    /** Hook name fired after every note write/clear. */
    static get CHANGE_HOOK() {
        return NotesManager.CHANGE_HOOK;
    }

    // ============================================================
    // Read
    // ============================================================

    /** Full envelope { schemaVersion, html, text, pinned, updatedAt } or null. */
    static get(uuid) {
        return NotesManager.getNote(uuid);
    }

    /** Rich HTML (empty string if none). */
    static getHtml(uuid) {
        return NotesManager.getHtml(uuid);
    }

    /** Plain-text mirror — indexable for gm: search. */
    static getText(uuid) {
        return NotesManager.getText(uuid);
    }

    /** True if the document has a non-empty note. */
    static has(uuid) {
        return NotesManager.hasNote(uuid);
    }

    // ============================================================
    // Write
    // ============================================================

    /** Replace the note. data: { html?, pinned? }. Returns the envelope or null. */
    static set(uuid, data) {
        return NotesManager.setNote(uuid, data);
    }

    /** Remove all note data from the document. */
    static clear(uuid) {
        return NotesManager.clearNote(uuid);
    }
}
