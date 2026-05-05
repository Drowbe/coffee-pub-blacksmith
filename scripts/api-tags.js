// ==================================================================
// ===== API-TAGS – Public interface for the Tags system ===========
// ==================================================================
// Thin wrapper over TagManager. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.tags
// See documentation/api/api-tags.md for full method contracts.
// See documentation/architecture/architecture-tags.md for internals.
// ==================================================================

import { TagManager } from './manager-tags.js';
import { TagWidget } from './widget-tags.js';

export class TagsAPI {

    static isAvailable() {
        return TagManager.isAvailable();
    }

    // ============================================================
    // Taxonomy
    // ============================================================

    static register(contextKey, taxonomy) {
        TagManager.register(contextKey, taxonomy);
    }

    static getChoices(contextKey) {
        return TagManager.getChoices(contextKey);
    }

    // ============================================================
    // Record tag CRUD
    // ============================================================

    static setTags(contextKey, recordId, tagArray) {
        return TagManager.setTags(contextKey, recordId, tagArray);
    }

    static getTags(contextKey, recordId) {
        return TagManager.getTags(contextKey, recordId);
    }

    static addTags(contextKey, recordId, tagArray) {
        return TagManager.addTags(contextKey, recordId, tagArray);
    }

    static removeTags(contextKey, recordId, tagArray) {
        return TagManager.removeTags(contextKey, recordId, tagArray);
    }

    static deleteRecordTags(contextKey, recordId) {
        return TagManager.deleteRecordTags(contextKey, recordId);
    }

    static getRecordsByTag(contextKey, tag) {
        return TagManager.getRecordsByTag(contextKey, tag);
    }

    // ============================================================
    // Registry management (GM only for mutations)
    // ============================================================

    static getRegistry() {
        return TagManager.getRegistry();
    }

    static normalize(input) {
        return TagManager.normalize(input);
    }

    static rename(oldTag, newTag) {
        return TagManager.rename(oldTag, newTag);
    }

    static delete(tag) {
        return TagManager.delete(tag);
    }

    static seedRegistry(contextKey, existingTagArrays) {
        return TagManager.seedRegistry(contextKey, existingTagArrays);
    }

    // ============================================================
    // Visibility (client-scope, per-user)
    // ============================================================

    static setVisibility(tag, visible, contextKey) {
        TagManager.setVisibility(tag, visible, contextKey);
    }

    static getVisibility(tag, contextKey) {
        return TagManager.getVisibility(tag, contextKey);
    }

    // ============================================================
    // TagWidget — embeddable UI component
    // ============================================================

    static get TagWidget() {
        return TagWidget;
    }
}
