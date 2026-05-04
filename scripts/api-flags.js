// ==================================================================
// ===== API-FLAGS – Public interface for the Flags system =========
// ==================================================================
// Thin wrapper over FlagManager. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.flags
// See documentation/api/api-flags.md for full method contracts.
// See documentation/architecture/architecture-flags.md for internals.
// ==================================================================

import { FlagManager } from './manager-flags.js';
import { FlagWidget } from './widget-flags.js';

export class FlagsAPI {

    // ============================================================
    // Availability
    // ============================================================

    /** Returns true when the Flags API is loaded and ready. Safe to call at any time. */
    static isAvailable() {
        return FlagManager.isAvailable();
    }

    // ============================================================
    // Taxonomy
    // ============================================================

    /**
     * Merge a taxonomy entry into the in-memory registry at runtime.
     * Prefer adding entries to flag-taxonomy.json for shipped modules.
     * @param {string} contextKey - e.g. 'coffee-pub-squire.quests'
     * @param {{ label?: string, flags: Array<string | {key: string, protected?: boolean}> }} taxonomy
     */
    static register(contextKey, taxonomy) {
        FlagManager.register(contextKey, taxonomy);
    }

    /**
     * Get the merged suggested flag list for a context (taxonomy + globals).
     * @param {string} contextKey
     * @returns {Array<{key: string, label: string, protected: boolean, tier: 'taxonomy'|'global'}>}
     */
    static getChoices(contextKey) {
        return FlagManager.getChoices(contextKey);
    }

    // ============================================================
    // Record flag CRUD
    // ============================================================

    /**
     * Replace the flag set for a record.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     * @returns {Promise<void>}
     */
    static setFlags(contextKey, recordId, flagArray) {
        return FlagManager.setFlags(contextKey, recordId, flagArray);
    }

    /**
     * Get the current flags for a record. Returns [] if none.
     * @param {string} contextKey
     * @param {string} recordId
     * @returns {string[]}
     */
    static getFlags(contextKey, recordId) {
        return FlagManager.getFlags(contextKey, recordId);
    }

    /**
     * Add flags to a record without replacing existing flags.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     * @returns {Promise<void>}
     */
    static addFlags(contextKey, recordId, flagArray) {
        return FlagManager.addFlags(contextKey, recordId, flagArray);
    }

    /**
     * Remove specific flags from a record.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     * @returns {Promise<void>}
     */
    static removeFlags(contextKey, recordId, flagArray) {
        return FlagManager.removeFlags(contextKey, recordId, flagArray);
    }

    /**
     * Remove all flag data for a record. Call when the record is deleted.
     * @param {string} contextKey
     * @param {string} recordId
     * @returns {Promise<void>}
     */
    static deleteRecordFlags(contextKey, recordId) {
        return FlagManager.deleteRecordFlags(contextKey, recordId);
    }

    /**
     * Get all record IDs in a context that have a specific flag.
     * @param {string} contextKey
     * @param {string} flag
     * @returns {string[]}
     */
    static getRecordsByFlag(contextKey, flag) {
        return FlagManager.getRecordsByFlag(contextKey, flag);
    }

    // ============================================================
    // Registry management (GM only for mutations)
    // ============================================================

    /**
     * Get the full world flag list — every flag ever used.
     * @returns {string[]}
     */
    static getRegistry() {
        return FlagManager.getRegistry();
    }

    /**
     * Normalize a flag string or array.
     * @param {string | string[]} input
     * @returns {string | string[]}
     */
    static normalize(input) {
        return FlagManager.normalize(input);
    }

    /**
     * Rename a flag globally across all records and the registry. GM only.
     * Silently rejected for protected flags.
     * @param {string} oldFlag
     * @param {string} newFlag
     * @returns {Promise<{updated: number}|null>}
     */
    static rename(oldFlag, newFlag) {
        return FlagManager.rename(oldFlag, newFlag);
    }

    /**
     * Delete a flag globally from all records and the registry. GM only.
     * Silently rejected for protected flags.
     * @param {string} flag
     * @returns {Promise<{removed: number}|null>}
     */
    static delete(flag) {
        return FlagManager.delete(flag);
    }

    /**
     * Seed the registry from existing record data on first load.
     * @param {string} contextKey - Used for logging
     * @param {string[][]} existingFlagArrays - One array per record
     * @returns {Promise<void>}
     */
    static seedRegistry(contextKey, existingFlagArrays) {
        return FlagManager.seedRegistry(contextKey, existingFlagArrays);
    }

    // ============================================================
    // Visibility (client-scope, per-user)
    // ============================================================

    /**
     * Set visibility for a flag. Omit contextKey to set the global default.
     * @param {string} flag
     * @param {boolean} visible
     * @param {string} [contextKey]
     */
    static setVisibility(flag, visible, contextKey) {
        FlagManager.setVisibility(flag, visible, contextKey);
    }

    /**
     * Get effective visibility for a flag.
     * Resolution: context override → global default → true.
     * @param {string} flag
     * @param {string} [contextKey]
     * @returns {boolean}
     */
    static getVisibility(flag, contextKey) {
        return FlagManager.getVisibility(flag, contextKey);
    }

    // ============================================================
    // FlagWidget — embeddable UI component
    // ============================================================

    /** The FlagWidget class, for embedding in Application V2 windows. */
    static get FlagWidget() {
        return FlagWidget;
    }
}
