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
        const root = 'flags.coffee-pub-blacksmith.gmNotes';
        return Object.freeze([
            `${root}.html`,
            `${root}.text`,
            `${root}.pinned`,
            `${root}.updatedAt`
        ]);
    }

    static get REIMPORT_POLICY() {
        return Object.freeze({
            general: 'preserve',
            persistedSections: 'merge-by-module-and-section-id-incoming-wins',
            contributedSections: 'not-stored'
        });
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

    /** Hook fired when a live contributed-section provider is added or removed. */
    static get PROVIDERS_HOOK() {
        return GMNotesManager.PROVIDERS_HOOK;
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

    static getSection(uuid, moduleId, sectionId) {
        return GMNotesManager.getSection(uuid, moduleId, sectionId);
    }

    static getSections(uuid, options = {}) {
        return GMNotesManager.getSections(uuid, options);
    }

    static getPersistedSections(uuid) {
        return GMNotesManager.getPersistedSections(uuid);
    }

    static getContributedSections(uuid) {
        return GMNotesManager.getContributedSections(uuid);
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

    /** Clear the GM's General note while preserving module sections. */
    static clear(uuid) {
        return GMNotesManager.clearNote(uuid);
    }

    static setSection(uuid, moduleId, sectionId, data = {}) {
        return GMNotesManager.setSection(uuid, moduleId, sectionId, data);
    }

    static setSectionOrThrow(uuid, moduleId, sectionId, data = {}) {
        return GMNotesManager.setSectionOrThrow(uuid, moduleId, sectionId, data);
    }

    static clearSection(uuid, moduleId, sectionId) {
        return GMNotesManager.clearSection(uuid, moduleId, sectionId);
    }

    /**
     * Register live, read-only GM Notes content. Returns an unregister function.
     * Providers receive the resolved Document and return one section or an array.
     */
    static registerProvider(moduleId, provider, options = {}) {
        return GMNotesManager.registerProvider(moduleId, provider, options);
    }

    static unregisterProvider(moduleId, providerId = 'default') {
        return GMNotesManager.unregisterProvider(moduleId, providerId);
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
