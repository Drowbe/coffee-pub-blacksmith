// ==================================================================
// ===== MANAGER-GMNOTES – GM notes store per document ==============
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
// sheet "has notes" badges) subscribe via Hooks.on(GMNotesManager.CHANGE_HOOK, ...).
const CHANGE_HOOK = 'blacksmith.gmNotesChanged';
const NOTE_FIELDS = new Set(['schemaVersion', 'html', 'text', 'pinned', 'updatedAt']);

export class GMNotesWriteError extends Error {
    constructor(reason, message, { document = null, uuid = null, cause = null } = {}) {
        super(message);
        this.name = 'GMNotesWriteError';
        this.code = reason || 'write-failed';
        this.reason = this.code;
        this.document = document;
        this.uuid = uuid ?? document?.uuid ?? null;
        if (cause) this.cause = cause;
    }
}

// ----------------------------------------------------------------
// GMNotesManager
// ----------------------------------------------------------------

export class GMNotesManager {

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

    /** Resolve a UUID or Document, loading a compendium document when needed. */
    static async _resolveDocAsync(uuidOrDoc) {
        const sync = this._resolveDoc(uuidOrDoc);
        if (sync) return sync;
        if (!uuidOrDoc || typeof uuidOrDoc === 'object') return null;
        try {
            const doc = await fromUuid(String(uuidOrDoc));
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
            ...foundry.utils.deepClone(raw),
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

    static async getNoteAsync(uuidOrDoc) {
        const doc = await this._resolveDocAsync(uuidOrDoc);
        return doc ? this.getNote(doc) : null;
    }

    static async getHtmlAsync(uuidOrDoc) {
        return (await this.getNoteAsync(uuidOrDoc))?.html ?? '';
    }

    static async getTextAsync(uuidOrDoc) {
        return (await this.getNoteAsync(uuidOrDoc))?.text ?? '';
    }

    static async hasNoteAsync(uuidOrDoc) {
        const note = await this.getNoteAsync(uuidOrDoc);
        return !!(note && (note.text || note.html));
    }

    /**
     * Resolve many notes concurrently. Results are keyed by requested UUID
     * (or the live Document UUID) and retain null for unresolved/no-note targets.
     */
    static async getMany(uuidOrDocs = []) {
        const targets = Array.isArray(uuidOrDocs) ? uuidOrDocs : [];
        const pairs = await Promise.all(targets.map(async (target) => {
            const key = typeof target === 'string' ? target : target?.uuid;
            return [key, await this.getNoteAsync(target)];
        }));
        return new Map(pairs.filter(([key]) => !!key));
    }

    // ============================================================
    // Capability
    // ============================================================

    static async canSet(uuidOrDoc) {
        const doc = await this._resolveDocAsync(uuidOrDoc);
        if (!doc) {
            return {
                allowed: false,
                reason: 'unresolved',
                message: 'The target document could not be resolved.',
                document: null
            };
        }
        if (typeof doc.update !== 'function' || typeof doc.getFlag !== 'function') {
            return {
                allowed: false,
                reason: 'unsupported',
                message: 'The target does not support document flags.',
                document: doc
            };
        }

        const packId = doc.pack ?? doc.compendium?.collection;
        const pack = packId ? game.packs?.get(packId) : null;
        if (pack?.locked) {
            return {
                allowed: false,
                reason: 'locked-pack',
                message: `This document lives in the locked compendium "${pack.title ?? packId}". Copy it into a world-owned compendium to add GM notes that survive module updates.`,
                document: doc
            };
        }

        const canUpdate = typeof doc.canUserModify === 'function'
            ? doc.canUserModify(game.user, 'update')
            : (doc.isOwner ?? game.user?.isGM);
        if (!canUpdate) {
            return {
                allowed: false,
                reason: 'no-permission',
                message: 'You do not have permission to update this document.',
                document: doc
            };
        }

        return {
            allowed: true,
            reason: 'allowed',
            message: '',
            document: doc
        };
    }

    static _buildChangePayload(doc, note) {
        const parent = doc?.documentName === 'JournalEntryPage' ? doc.parent : null;
        const folder = parent?.folder ?? null;
        const folderNames = folder
            ? [
                ...Array.from(folder.ancestors ?? [])
                    .map(entry => entry?.name)
                    .filter(Boolean),
                folder.name
            ].filter(Boolean)
            : [];
        const breadcrumb = [...folderNames, parent?.name, doc?.name]
            .filter(Boolean)
            .join(' \u203a ');
        return {
            uuid: doc?.uuid ?? null,
            note,
            document: doc,
            context: {
                documentName: doc?.name ?? '',
                documentType: doc?.documentName ?? '',
                parentUuid: parent?.uuid ?? null,
                parentName: parent?.name ?? '',
                folderUuid: folder?.uuid ?? null,
                folderName: folder?.name ?? '',
                breadcrumb: breadcrumb || (doc?.name ?? '')
            }
        };
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
        try {
            return await this.setNoteOrThrow(uuidOrDoc, data);
        } catch (err) {
            postConsoleAndNotification(
                MODULE.NAME,
                'BLACKSMITH | NOTES setNote: write failed',
                err?.message || err,
                false,
                err?.reason !== 'unresolved'
            );
            return null;
        }
    }

    static async setNoteOrThrow(uuidOrDoc, data = {}) {
        const capability = await this.canSet(uuidOrDoc);
        if (!capability.allowed) {
            throw new GMNotesWriteError(capability.reason, capability.message, {
                document: capability.document,
                uuid: typeof uuidOrDoc === 'string' ? uuidOrDoc : uuidOrDoc?.uuid
            });
        }
        const doc = capability.document;

        const current = this.getNote(doc) ?? this._emptyEnvelope();
        const html = typeof data.html === 'string' ? data.html : current.html;
        const envelope = {
            ...current,
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
            throw new GMNotesWriteError('write-failed', err?.message || 'The GM note could not be saved.', {
                document: doc,
                cause: err
            });
        }

        Hooks.callAll(CHANGE_HOOK, this._buildChangePayload(doc, envelope));
        return envelope;
    }

    /** Remove all note data from a document. */
    static async clearNote(uuidOrDoc) {
        const capability = await this.canSet(uuidOrDoc);
        if (!capability.allowed) return false;
        const doc = capability.document;
        const raw = doc.getFlag(MODULE.ID, NOTES_FLAG);
        const extras = raw && typeof raw === 'object'
            ? Object.fromEntries(Object.entries(foundry.utils.deepClone(raw))
                .filter(([key]) => !NOTE_FIELDS.has(key)))
            : {};
        const hasExtras = Object.keys(extras).length > 0;
        const cleared = hasExtras
            ? {
                ...extras,
                schemaVersion: SCHEMA_VERSION,
                html: '',
                text: '',
                pinned: false,
                updatedAt: Date.now()
            }
            : null;
        try {
            const update = hasExtras
                ? { [`flags.${MODULE.ID}.${NOTES_FLAG}`]: cleared }
                : { [`flags.${MODULE.ID}.-=${NOTES_FLAG}`]: null };
            await doc.update(update, { render: false });
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES clearNote: write failed', err?.message || err, false, true);
            return false;
        }
        Hooks.callAll(CHANGE_HOOK, this._buildChangePayload(doc, cleared));
        return true;
    }
}
