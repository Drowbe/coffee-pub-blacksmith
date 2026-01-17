// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, matchUserBySetting, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

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

        // Register hooks for UI hiding (don't check settings here - they may not be registered yet)
        this._registerHooks();

        // Don't apply broadcast mode here - wait for ready hook when settings are guaranteed to be loaded
        // The ready hook will call _updateBroadcastMode() which checks settings at that time

        this.isInitialized = true;
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Initialized", "", true, false);
    }

    /**
     * Register hooks for broadcast mode management
     */
    static _registerHooks() {
        // Hook into setting changes to update broadcast mode
        HookManager.registerHook({
            name: 'settingChange',
            description: 'BroadcastManager: Update broadcast mode when settings change',
            context: 'broadcast-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && (
                    settingKey === 'enableBroadcast' || 
                    settingKey === 'broadcastUserId' ||
                    settingKey === 'broadcastHideInterfaceLeft' ||
                    settingKey === 'broadcastHideInterfaceMiddle' ||
                    settingKey === 'broadcastHideInterfaceRight'
                )) {
                    this._updateBroadcastMode();
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // Hook into ready to ensure broadcast mode is applied after page load
        // Note: ready is a one-time hook, so use Hooks.once directly
        // Use setTimeout to ensure document.body is ready
        Hooks.once('ready', () => {
            setTimeout(() => {
                this._updateBroadcastMode();
            }, 100);
        });
    }

    /**
     * Update broadcast mode class on body based on current user
     */
    static _updateBroadcastMode() {
        // Check if document.body exists (might not be ready yet)
        if (!document.body) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Document body not ready yet, skipping update", "", true, false);
            return;
        }

        // Check if broadcast is enabled - use getSettingSafely but default to false only if setting exists
        // If setting doesn't exist yet, getSettingSafely returns the default, but we should check if it's actually registered
        let isEnabled = false;
        try {
            // Try to check if setting is registered
            const settingExists = game.settings.settings.has(`${MODULE.ID}.enableBroadcast`);
            if (settingExists) {
                isEnabled = getSettingSafely(MODULE.ID, 'enableBroadcast', false);
            } else {
                // Setting not registered yet, skip check
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: enableBroadcast setting not registered yet, skipping update", "", true, false);
                return;
            }
        } catch (error) {
            // Settings system not ready yet
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Settings not ready yet, skipping update", "", true, false);
            return;
        }

        if (!isEnabled) {
            document.body.classList.remove('broadcast-mode', 'hide-interface-left', 'hide-interface-middle', 'hide-interface-right');
            return;
        }

        const isBroadcastUser = this._isBroadcastUser();
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Checking broadcast mode", {
            isEnabled: isEnabled,
            isBroadcastUser: isBroadcastUser,
            currentUserId: game.user?.id,
            currentUserName: game.user?.name,
            broadcastUserId: getSettingSafely(MODULE.ID, 'broadcastUserId', '')
        }, true, false);

        if (isBroadcastUser) {
            document.body.classList.add('broadcast-mode');
            
            // Apply granular control classes based on settings
            if (getSettingSafely(MODULE.ID, 'broadcastHideInterfaceLeft', true)) {
                document.body.classList.add('hide-interface-left');
            } else {
                document.body.classList.remove('hide-interface-left');
            }
            
            if (getSettingSafely(MODULE.ID, 'broadcastHideInterfaceMiddle', true)) {
                document.body.classList.add('hide-interface-middle');
            } else {
                document.body.classList.remove('hide-interface-middle');
            }
            
            if (getSettingSafely(MODULE.ID, 'broadcastHideInterfaceRight', true)) {
                document.body.classList.add('hide-interface-right');
            } else {
                document.body.classList.remove('hide-interface-right');
            }
            
            // Verify classes were applied
            const hasBroadcastClass = document.body.classList.contains('broadcast-mode');
            const hasLeftClass = document.body.classList.contains('hide-interface-left');
            const hasMiddleClass = document.body.classList.contains('hide-interface-middle');
            const hasRightClass = document.body.classList.contains('hide-interface-right');
            
            // Check if elements exist
            const interfaceExists = !!document.getElementById('interface');
            const menubarExists = !!document.querySelector('.blacksmith-menubar-container');
            const squireExists = !!document.querySelector('.squire-tray');
            
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast mode activated", {
                broadcastClass: hasBroadcastClass,
                leftClass: hasLeftClass,
                middleClass: hasMiddleClass,
                rightClass: hasRightClass,
                interfaceExists: interfaceExists,
                menubarExists: menubarExists,
                squireExists: squireExists,
                bodyClasses: Array.from(document.body.classList)
            }, true, false);
        } else {
            document.body.classList.remove('broadcast-mode', 'hide-interface-left', 'hide-interface-middle', 'hide-interface-right');
        }
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
