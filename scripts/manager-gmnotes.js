// ==================================================================
// ===== MANAGER-NOTES – GM notes / metadata store per document =====
// ==================================================================
// Central GM metadata store. Notes attach to any Foundry document via
// that document's own flags, addressed by UUID at the API boundary.
// "Notes" is the first field of a broader GM-metadata envelope; new
// fields (reveal, links, ...) live under the same flag and schema.
//
// Storage is intentionally on document flags (UI-gated, not encrypted).
// See documentation/api/api-gmnotes.md for the public contract.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

// Flag key on the target document that holds the metadata envelope.
const NOTES_FLAG = 'gmNotes';

// Envelope schema version. Bump when the shape changes; migrate on read.
const SCHEMA_VERSION = 1;

// Public event fired after every write. Consumers (future search index,
// sheet "has notes" badges) subscribe via Hooks.on(NotesManager.CHANGE_HOOK, ...).
const CHANGE_HOOK = 'blacksmith.gmNotesChanged';

// ----------------------------------------------------------------
// NotesManager
// ----------------------------------------------------------------

export class NotesManager {

    static get CHANGE_HOOK() { return CHANGE_HOOK; }

    static isAvailable() {
        return !!game?.user;
    }

    // ============================================================
    // Internal helpers
    // ============================================================

    /** Resolve a UUID string or a live Document into a Document. */
    static _resolveDoc(uuidOrDoc) {
        if (!uuidOrDoc) return null;
        // Already a Document (has the flag API we need).
        if (typeof uuidOrDoc === 'object' && typeof uuidOrDoc.getFlag === 'function') {
            return uuidOrDoc;
        }
        try {
            const doc = fromUuidSync(String(uuidOrDoc));
            // fromUuidSync can return a compendium index entry (no getFlag).
            return (doc && typeof doc.getFlag === 'function') ? doc : null;
        } catch (_err) {
            return null;
        }
    }

    /** A fresh, empty envelope. */
    static _emptyEnvelope() {
        return { schemaVersion: SCHEMA_VERSION, html: '', text: '', pinned: false, updatedAt: 0 };
    }

    /** Normalize any stored value into the current envelope shape. */
    static _migrate(raw) {
        const base = this._emptyEnvelope();
        if (!raw || typeof raw !== 'object') return base;
        return {
            schemaVersion: SCHEMA_VERSION,
            html: typeof raw.html === 'string' ? raw.html : '',
            text: typeof raw.text === 'string' ? raw.text : this._stripHtml(raw.html),
            pinned: !!raw.pinned,
            updatedAt: Number(raw.updatedAt) || 0
        };
    }

    /** Derive the plain-text search mirror from rich HTML. */
    static _stripHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = String(html);
        return (div.textContent || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Build a note envelope from raw HTML without touching a document.
     * For importers that bake GM notes into document creation data
     * (keeps the envelope shape — schemaVersion, text mirror — single-sourced).
     * @param {{html?: string, pinned?: boolean}} [data]
     * @returns {object}
     */
    static buildEnvelope({ html = '', pinned = false } = {}) {
        const clean = typeof html === 'string' ? html : '';
        return {
            schemaVersion: SCHEMA_VERSION,
            html: clean,
            text: this._stripHtml(clean),
            pinned: !!pinned,
            updatedAt: Date.now()
        };
    }

    // ============================================================
    // Read
    // ============================================================

    /** Full envelope for a document, or null if none stored / unresolvable. */
    static getNote(uuidOrDoc) {
        const doc = this._resolveDoc(uuidOrDoc);
        if (!doc) return null;
        const raw = doc.getFlag(MODULE.ID, NOTES_FLAG);
        return raw ? this._migrate(raw) : null;
    }

    /** Rich HTML for a document (empty string if none). */
    static getHtml(uuidOrDoc) {
        return this.getNote(uuidOrDoc)?.html ?? '';
    }

    /** Plain-text mirror for a document — the future gm: search index. */
    static getText(uuidOrDoc) {
        return this.getNote(uuidOrDoc)?.text ?? '';
    }

    /** True if the document has a non-empty note. Drives sheet badges. */
    static hasNote(uuidOrDoc) {
        const note = this.getNote(uuidOrDoc);
        return !!(note && (note.text || note.html));
    }

    // ============================================================
    // Write
    // ============================================================

    /**
     * Replace the note for a document. Regenerates the text mirror,
     * stamps updatedAt, writes without re-rendering the sheet, and
     * fires CHANGE_HOOK. Returns the stored envelope, or null on failure.
     *
     * @param {string|Document} uuidOrDoc
     * @param {{html?: string, pinned?: boolean}} data
     */
    static async setNote(uuidOrDoc, data = {}) {
        const doc = this._resolveDoc(uuidOrDoc);
        if (!doc) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES setNote: could not resolve document', uuidOrDoc, false, false);
            return null;
        }

        const current = this.getNote(doc) ?? this._emptyEnvelope();
        const html = typeof data.html === 'string' ? data.html : current.html;
        const envelope = {
            schemaVersion: SCHEMA_VERSION,
            html,
            text: this._stripHtml(html),
            pinned: typeof data.pinned === 'boolean' ? data.pinned : current.pinned,
            updatedAt: Date.now()
        };

        try {
            // render:false so autosave-while-typing does not rebuild the sheet.
            await doc.update({ [`flags.${MODULE.ID}.${NOTES_FLAG}`]: envelope }, { render: false });
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES setNote: write failed', err?.message || err, false, true);
            return null;
        }

        Hooks.callAll(CHANGE_HOOK, { uuid: doc.uuid, note: envelope, document: doc });
        return envelope;
    }

    /** Remove all note data from a document. */
    static async clearNote(uuidOrDoc) {
        const doc = this._resolveDoc(uuidOrDoc);
        if (!doc) return false;
        try {
            await doc.update({ [`flags.${MODULE.ID}.-=${NOTES_FLAG}`]: null }, { render: false });
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES clearNote: write failed', err?.message || err, false, true);
            return false;
        }
        Hooks.callAll(CHANGE_HOOK, { uuid: doc.uuid, note: null, document: doc });
        return true;
    }
}
