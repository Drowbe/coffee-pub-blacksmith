// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, matchUserBySetting, getSettingSafely } from './api-core.js';

// ================================================================== 
// ===== BROADCAST MANAGER ==========================================
// ================================================================== 

/**
 * BroadcastManager - Manages broadcast/streaming functionality
 * 
 * Provides a user-based approach to streaming FoundryVTT sessions.
 * A designated "cameraman" user receives a clean, UI-free view with
 * automatic token following capabilities.
 */
export class BroadcastManager {
    static isInitialized = false;

    /**
     * Initialize the BroadcastManager
     */
    static initialize() {
        if (this.isInitialized) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Already initialized", "", true, false);
            return;
        }

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Initializing", "", true, false);

        // Check if broadcast is enabled (use getSettingSafely to handle unregistered settings gracefully)
        const isEnabled = getSettingSafely(MODULE.ID, 'enableBroadcast', false);
        if (!isEnabled) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast feature is disabled", "", true, false);
            this.isInitialized = true;
            return;
        }

        // Future: Register hooks for UI hiding, camera following, etc.
        // Phase 2+ implementation will go here

        this.isInitialized = true;
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Initialized", "", true, false);
    }

    /**
     * Check if the current user (or specified user) is the broadcast user
     * @param {User} user - Optional user to check (defaults to current user)
     * @returns {boolean} True if user is the broadcast user
     */
    static _isBroadcastUser(user) {
        if (!user) user = game.user;
        const settingValue = getSettingSafely(MODULE.ID, 'broadcastUserId', '') || '';
        return matchUserBySetting(user, settingValue);
    }

    /**
     * Check if broadcast feature is enabled
     * @returns {boolean} True if broadcast is enabled
     */
    static isEnabled() {
        return getSettingSafely(MODULE.ID, 'enableBroadcast', false) === true;
    }
}
