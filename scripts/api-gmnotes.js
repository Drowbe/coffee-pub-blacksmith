// ==================================================================
// ===== API-GMNOTES – Public interface for the GM Notes system =====
// ==================================================================
// Thin wrapper over GMNotesManager. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.gmNotes
// See documentation/api/api-gmnotes.md for full method contracts.
// ==================================================================

import { GMNotesManager } from './manager-gmnotes.js';

export class GMNotesAPI {

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

    // ============================================================
    // Write
    // ============================================================

    /** Replace the note. data: { html?, pinned? }. Returns the envelope or null. */
    static set(uuid, data) {
        return GMNotesManager.setNote(uuid, data);
    }

    /** Remove all note data from the document. */
    static clear(uuid) {
        return GMNotesManager.clearNote(uuid);
    }
}
