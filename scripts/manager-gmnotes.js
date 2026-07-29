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
const SCHEMA_VERSION = 2;

// Public event fired after every write. Consumers (future search index,
// sheet "has notes" badges) subscribe via Hooks.on(GMNotesManager.CHANGE_HOOK, ...).
const CHANGE_HOOK = 'blacksmith.gmNotesChanged';
const PROVIDERS_HOOK = 'blacksmith.gmNotesProvidersChanged';
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
    static get PROVIDERS_HOOK() { return PROVIDERS_HOOK; }
    static _providers = new Map();
    static _providerOrder = 0;

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
        return {
            schemaVersion: SCHEMA_VERSION,
            html: '',
            text: '',
            pinned: false,
            updatedAt: 0,
            sections: {}
        };
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
            updatedAt: Number(raw.updatedAt) || 0,
            sections: this._migrateSections(raw.sections)
        };
    }

    static _migrateSections(rawSections) {
        if (!rawSections || typeof rawSections !== 'object' || Array.isArray(rawSections)) return {};
        const sections = {};
        for (const [moduleId, moduleSections] of Object.entries(rawSections)) {
            if (!moduleId || !moduleSections || typeof moduleSections !== 'object' || Array.isArray(moduleSections)) continue;
            const normalized = {};
            for (const [sectionId, raw] of Object.entries(moduleSections)) {
                if (!sectionId || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
                const html = typeof raw.html === 'string' ? raw.html : '';
                normalized[sectionId] = {
                    ...foundry.utils.deepClone(raw),
                    id: sectionId,
                    moduleId,
                    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : sectionId,
                    html,
                    text: typeof raw.text === 'string' ? raw.text : this._stripHtml(html),
                    icon: typeof raw.icon === 'string' ? raw.icon : '',
                    weight: Number.isFinite(Number(raw.weight)) ? Number(raw.weight) : 100,
                    editable: raw.editable === true,
                    sourceHint: typeof raw.sourceHint === 'string' ? raw.sourceHint : '',
                    updatedAt: Number(raw.updatedAt) || 0
                };
            }
            if (Object.keys(normalized).length) sections[moduleId] = normalized;
        }
        return sections;
    }

    static _normalizeSection(moduleId, sectionId, data = {}) {
        const html = typeof data.html === 'string' ? data.html : '';
        return {
            id: sectionId,
            moduleId,
            label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : sectionId,
            html,
            text: this._stripHtml(html),
            icon: typeof data.icon === 'string' ? data.icon : '',
            weight: Number.isFinite(Number(data.weight)) ? Number(data.weight) : 100,
            editable: data.editable === true,
            sourceHint: typeof data.sourceHint === 'string' ? data.sourceHint : '',
            updatedAt: Date.now()
        };
    }

    static _validateSectionIdentity(moduleId, sectionId) {
        const owner = String(moduleId ?? '').trim();
        const id = String(sectionId ?? '').trim();
        if (!owner || !id) {
            throw new TypeError('GM Notes sections require non-empty moduleId and sectionId values.');
        }
        return { moduleId: owner, sectionId: id };
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
    // Persisted module sections
    // ============================================================

    static async getPersistedSections(uuidOrDoc) {
        const note = await this.getNoteAsync(uuidOrDoc);
        if (!note) return [];
        return Object.values(note.sections ?? {})
            .flatMap(moduleSections => Object.values(moduleSections ?? {}))
            .map(section => ({ ...foundry.utils.deepClone(section), source: 'persisted' }))
            .sort(this._sortSections);
    }

    static async getSection(uuidOrDoc, moduleId, sectionId) {
        const identity = this._validateSectionIdentity(moduleId, sectionId);
        const note = await this.getNoteAsync(uuidOrDoc);
        const section = note?.sections?.[identity.moduleId]?.[identity.sectionId];
        return section ? foundry.utils.deepClone(section) : null;
    }

    static async setSection(uuidOrDoc, moduleId, sectionId, data = {}) {
        try {
            return await this.setSectionOrThrow(uuidOrDoc, moduleId, sectionId, data);
        } catch (err) {
            postConsoleAndNotification(
                MODULE.NAME,
                'BLACKSMITH | NOTES setSection: write failed',
                err?.message || err,
                false,
                err?.reason !== 'unresolved'
            );
            return null;
        }
    }

    static async setSectionOrThrow(uuidOrDoc, moduleId, sectionId, data = {}) {
        const identity = this._validateSectionIdentity(moduleId, sectionId);
        const capability = await this.canSet(uuidOrDoc);
        if (!capability.allowed) {
            throw new GMNotesWriteError(capability.reason, capability.message, {
                document: capability.document,
                uuid: typeof uuidOrDoc === 'string' ? uuidOrDoc : uuidOrDoc?.uuid
            });
        }

        const doc = capability.document;
        const current = this.getNote(doc) ?? this._emptyEnvelope();
        const existing = current.sections?.[identity.moduleId]?.[identity.sectionId] ?? {};
        const section = this._normalizeSection(
            identity.moduleId,
            identity.sectionId,
            { ...existing, ...data }
        );
        const envelope = {
            ...current,
            schemaVersion: SCHEMA_VERSION,
            sections: {
                ...(current.sections ?? {}),
                [identity.moduleId]: {
                    ...(current.sections?.[identity.moduleId] ?? {}),
                    [identity.sectionId]: section
                }
            },
            updatedAt: Date.now()
        };

        try {
            await doc.update({ [`flags.${MODULE.ID}.${NOTES_FLAG}`]: envelope }, { render: false });
        } catch (err) {
            throw new GMNotesWriteError('write-failed', err?.message || 'The GM Notes section could not be saved.', {
                document: doc,
                cause: err
            });
        }

        Hooks.callAll(CHANGE_HOOK, {
            ...this._buildChangePayload(doc, envelope),
            section: { ...section, source: 'persisted' },
            changeType: 'section-set'
        });
        return section;
    }

    static async clearSection(uuidOrDoc, moduleId, sectionId) {
        const identity = this._validateSectionIdentity(moduleId, sectionId);
        const capability = await this.canSet(uuidOrDoc);
        if (!capability.allowed) return false;
        const doc = capability.document;
        const current = this.getNote(doc);
        if (!current?.sections?.[identity.moduleId]?.[identity.sectionId]) return true;

        const sections = foundry.utils.deepClone(current.sections);
        delete sections[identity.moduleId][identity.sectionId];
        if (!Object.keys(sections[identity.moduleId]).length) delete sections[identity.moduleId];
        const envelope = { ...current, sections, updatedAt: Date.now() };
        try {
            await doc.update({ [`flags.${MODULE.ID}.${NOTES_FLAG}`]: envelope }, { render: false });
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES clearSection: write failed', err?.message || err, false, true);
            return false;
        }
        Hooks.callAll(CHANGE_HOOK, {
            ...this._buildChangePayload(doc, envelope),
            section: {
                id: identity.sectionId,
                moduleId: identity.moduleId,
                source: 'persisted'
            },
            changeType: 'section-clear'
        });
        return true;
    }

    // ============================================================
    // Live contributed sections
    // ============================================================

    static registerProvider(moduleId, provider, options = {}) {
        const owner = String(moduleId ?? '').trim();
        if (!owner) throw new TypeError('GM Notes provider moduleId is required.');
        if (typeof provider !== 'function') throw new TypeError('GM Notes provider must be a function.');
        const providerId = String(options.id ?? 'default').trim() || 'default';
        const key = `${owner}:${providerId}`;
        const record = {
            key,
            moduleId: owner,
            providerId,
            provider,
            weight: Number.isFinite(Number(options.weight)) ? Number(options.weight) : 100,
            order: this._providerOrder++
        };
        this._providers.set(key, record);
        Hooks.callAll(PROVIDERS_HOOK, { action: 'register', moduleId: owner, providerId });
        return () => this.unregisterProvider(owner, providerId);
    }

    static unregisterProvider(moduleId, providerId = 'default') {
        const key = `${String(moduleId ?? '').trim()}:${String(providerId ?? 'default').trim() || 'default'}`;
        const removed = this._providers.delete(key);
        if (removed) {
            Hooks.callAll(PROVIDERS_HOOK, {
                action: 'unregister',
                moduleId: String(moduleId ?? '').trim(),
                providerId: String(providerId ?? 'default').trim() || 'default'
            });
        }
        return removed;
    }

    static async getContributedSections(uuidOrDoc) {
        const doc = await this._resolveDocAsync(uuidOrDoc);
        if (!doc) return [];
        const records = [...this._providers.values()].sort((a, b) => a.order - b.order);
        const groups = await Promise.all(records.map(async record => {
            try {
                const supplied = await record.provider(doc);
                const rows = Array.isArray(supplied) ? supplied : (supplied ? [supplied] : []);
                return rows.map((raw, index) => {
                    const id = String(raw?.id ?? `${record.providerId}-${index + 1}`).trim();
                    const html = typeof raw?.html === 'string' ? raw.html : '';
                    return {
                        id,
                        moduleId: record.moduleId,
                        providerId: record.providerId,
                        label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
                        html,
                        text: this._stripHtml(html),
                        icon: typeof raw?.icon === 'string' ? raw.icon : '',
                        weight: Number.isFinite(Number(raw?.weight)) ? Number(raw.weight) : record.weight,
                        editable: false,
                        sourceHint: typeof raw?.sourceHint === 'string' ? raw.sourceHint : '',
                        order: record.order,
                        source: 'contributed',
                        readOnly: true
                    };
                }).filter(section => section.id && (section.html || section.text));
            } catch (err) {
                console.error(`${MODULE.ID} | GM Notes provider "${record.key}" failed`, err);
                return [];
            }
        }));
        return groups.flat().sort(this._sortSections);
    }

    static async getSections(uuidOrDoc, { includePersisted = true, includeContributed = true } = {}) {
        const [persisted, contributed] = await Promise.all([
            includePersisted ? this.getPersistedSections(uuidOrDoc) : [],
            includeContributed ? this.getContributedSections(uuidOrDoc) : []
        ]);
        return [...persisted, ...contributed].sort(this._sortSections);
    }

    static _sortSections(left, right) {
        return (Number(left?.weight) || 100) - (Number(right?.weight) || 100)
            || (Number(left?.order) || 0) - (Number(right?.order) || 0)
            || String(left?.moduleId ?? '').localeCompare(String(right?.moduleId ?? ''))
            || String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
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

    /** Clear the GM's General note while preserving module sections. */
    static async clearNote(uuidOrDoc) {
        const capability = await this.canSet(uuidOrDoc);
        if (!capability.allowed) return false;
        const doc = capability.document;
        const raw = doc.getFlag(MODULE.ID, NOTES_FLAG);
        const extras = raw && typeof raw === 'object'
            ? Object.fromEntries(Object.entries(foundry.utils.deepClone(raw))
                .filter(([key, value]) => {
                    if (NOTE_FIELDS.has(key)) return false;
                    if (key === 'sections') return value && Object.keys(value).length > 0;
                    return true;
                }))
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
