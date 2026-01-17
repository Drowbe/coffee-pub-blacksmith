// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, matchUserBySetting, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { MenuBar } from './api-menubar.js';

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
    static _lastPanPosition = { x: null, y: null };
    static _lastPanTime = 0;

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
                    settingKey === 'broadcastHideInterfaceRight' ||
                    settingKey === 'broadcastHideBackground'
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
                // Register camera hooks after settings are loaded
                this._registerCameraHooks();
            }, 100);
        });
    }

    /**
     * Register hooks for camera following (token updates, combat updates)
     */
    static _registerCameraHooks() {
        // Hook for token position updates (spectator mode)
        HookManager.registerHook({
            name: 'updateToken',
            description: 'BroadcastManager: Follow party tokens on movement (spectator mode)',
            context: 'broadcast-camera',
            priority: 3,
            callback: (tokenDocument, changes, options, userId) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                // Only process for broadcast user
                if (!this._isBroadcastUser()) return;
                if (!this.isEnabled()) return;
                
                // Check if we're in spectator mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode !== 'spectator') return;
                
                // Only process if position changed
                if (!changes || (changes.x === undefined && changes.y === undefined)) return;
                
                // Follow party tokens
                this._onTokenUpdate(tokenDocument, changes);
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // Hook for combat turn changes (combat mode)
        HookManager.registerHook({
            name: 'updateCombat',
            description: 'BroadcastManager: Follow current combatant on turn change (combat mode)',
            context: 'broadcast-camera',
            priority: 3,
            callback: (combat, updateData, options, userId) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                // Only process for broadcast user
                if (!this._isBroadcastUser()) return;
                if (!this.isEnabled()) return;
                
                // Check if we're in combat mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode !== 'combat') return;
                
                // Only process on turn change (when current turn index changes)
                if (!updateData || updateData.turn === undefined) return;
                
                // Follow current combatant
                this._onCombatUpdate(combat);
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
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
            
            // Apply background hiding class
            if (getSettingSafely(MODULE.ID, 'broadcastHideBackground', true)) {
                document.body.classList.add('hide-background');
            } else {
                document.body.classList.remove('hide-background');
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
            document.body.classList.remove('broadcast-mode', 'hide-interface-left', 'hide-interface-middle', 'hide-interface-right', 'hide-background');
        }
    }

    /**
     * Handle token position update (spectator mode)
     * 
     * This method calculates the center of party tokens and pans the cameraman's viewport
     * to center that position. All calculations use world coordinates and are relative
     * to the cameraman's viewport (not GM's viewport).
     * 
     * @param {TokenDocument} tokenDocument - The token document that was updated
     * @param {Object} changes - The changes made to the token
     */
    static _onTokenUpdate(tokenDocument, changes) {
        try {
            // IMPORTANT: This code only runs for the broadcast user (cameraman)
            // All pan/zoom operations affect the cameraman's viewport only
            
            // Get party tokens visible to broadcast user
            const partyTokens = this._getVisiblePartyTokens();
            if (!partyTokens || partyTokens.length === 0) return;
            
            // Calculate target position (center of party tokens in world coordinates)
            let targetPosition = null;
            if (partyTokens.length === 1) {
                // Single token: calculate center of that token
                const token = partyTokens[0];
                targetPosition = {
                    x: token.x + (token.width * canvas.grid.size / 2),
                    y: token.y + (token.height * canvas.grid.size / 2)
                };
            } else {
                // Multiple tokens: calculate average position (center of all party tokens)
                targetPosition = this._calculateTokenCenter(partyTokens);
            }
            
            if (!targetPosition) return;
            
            // Check if we should pan (distance threshold + throttle)
            if (!this._shouldPan(targetPosition)) return;
            
            // Apply zoom based on token count (affects cameraman's viewport)
            if (partyTokens.length === 1) {
                // Single token: use default zoom + offset
                const defaultZoom = getSettingSafely(MODULE.ID, 'broadcastDefaultZoom', 1.0);
                const zoomOffset = getSettingSafely(MODULE.ID, 'broadcastSpectatorZoomOffsetSingle', 0);
                const finalZoom = this._calculateZoomFromOffset(defaultZoom, zoomOffset);
                canvas.animateZoom(finalZoom);
            } else {
                // Multiple tokens: use default zoom + offset for multiple tokens
                const zoomOffset = getSettingSafely(MODULE.ID, 'broadcastSpectatorZoomOffsetMultiple', 0);
                const defaultZoom = getSettingSafely(MODULE.ID, 'broadcastDefaultZoom', 1.0);
                const finalZoom = this._calculateZoomFromOffset(defaultZoom, zoomOffset);
                canvas.animateZoom(finalZoom);
            }
            
            // Pan to target position - canvas.animatePan() centers the coordinate
            // in the current user's (cameraman's) viewport
            // The targetPosition is the center of party tokens, so this centers
            // the token center in the cameraman's viewport center
            canvas.animatePan({ x: targetPosition.x, y: targetPosition.y });
            this._lastPanPosition = targetPosition;
            this._lastPanTime = Date.now();
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error following token", error, false, false);
        }
    }

    /**
     * Handle combat turn update (combat mode)
     * @param {Combat} combat - The combat instance
     */
    static _onCombatUpdate(combat) {
        try {
            if (!combat) return;
            
            const currentCombatant = combat.combatants.get(combat.current.combatantId);
            if (!currentCombatant) return;
            
            // Use existing MenuBar.panToCombatant function
            MenuBar.panToCombatant(currentCombatant.id);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error following combatant", error, false, false);
        }
    }

    /**
     * Get all party tokens visible to the broadcast user
     * @returns {Array} Array of visible party token placeables
     */
    static _getVisiblePartyTokens() {
        if (!canvas || !canvas.tokens) return [];
        
        const broadcastUser = this._getBroadcastUser();
        if (!broadcastUser) return [];
        
        return canvas.tokens.placeables.filter(token => {
            const actor = token.actor;
            // Must be player character
            if (!actor || actor.type !== 'character' || !actor.hasPlayerOwner) {
                return false;
            }
            // Must be visible to broadcast user
            if (token.document?.testUserVisibility) {
                return token.document.testUserVisibility(broadcastUser);
            }
            // Fallback: check if token is visible on canvas
            return token.visible;
        });
    }

    /**
     * Get the broadcast user object
     * @returns {User|null} The broadcast user, or null if not found
     */
    static _getBroadcastUser() {
        const settingValue = getSettingSafely(MODULE.ID, 'broadcastUserId', '') || '';
        if (!settingValue) return null;
        
        // Try to match by ID first
        const byId = game.users.get(settingValue);
        if (byId) return byId;
        
        // Try to match by name
        const byName = game.users.find(u => u.name?.toLowerCase() === settingValue.toLowerCase());
        if (byName) return byName;
        
        return null;
    }

    /**
     * Calculate center point of multiple tokens in world coordinates
     * 
     * This calculates the average position (center) of all provided tokens.
     * The result is in world coordinates and represents the point that will be
     * centered in the cameraman's viewport.
     * 
     * @param {Array} tokens - Array of token placeables
     * @returns {Object|null} Center position {x, y} in world coordinates, or null if no tokens
     */
    static _calculateTokenCenter(tokens) {
        if (!tokens || tokens.length === 0) return null;
        
        let sumX = 0;
        let sumY = 0;
        
        tokens.forEach(token => {
            // Token center position (x, y are top-left, so add half dimensions)
            sumX += token.x + (token.width * canvas.grid.size / 2);
            sumY += token.y + (token.height * canvas.grid.size / 2);
        });
        
        return {
            x: sumX / tokens.length,
            y: sumY / tokens.length
        };
    }

    /**
     * Check if camera should pan based on distance threshold and throttle
     * @param {Object} newPosition - New position {x, y}
     * @returns {boolean} True if should pan
     */
    static _shouldPan(newPosition) {
        const distanceThreshold = getSettingSafely(MODULE.ID, 'broadcastFollowDistanceThreshold', 1.0);
        const throttleMs = getSettingSafely(MODULE.ID, 'broadcastFollowThrottleMs', 100);
        
        // Check throttle (time-based)
        const now = Date.now();
        if (now - this._lastPanTime < throttleMs) {
            return false;
        }
        
        // Check distance threshold (if we have a last position)
        if (this._lastPanPosition.x !== null && this._lastPanPosition.y !== null) {
            const distance = Math.sqrt(
                Math.pow(newPosition.x - this._lastPanPosition.x, 2) +
                Math.pow(newPosition.y - this._lastPanPosition.y, 2)
            );
            
            // Convert pixels to grid units
            const gridUnits = distance / canvas.grid.size;
            
            if (gridUnits < distanceThreshold) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Calculate final zoom level from default zoom and offset
     * @param {number} defaultZoom - The baseline zoom level (e.g., 1.0)
     * @param {number} offset - Offset from -5 to +5, where 0 = no change from default
     * @returns {number} Final zoom level
     */
    static _calculateZoomFromOffset(defaultZoom, offset) {
        // Offset 0 = default zoom (no change)
        // Offset -5 = zoom out to 0.2x (5x zoom out)
        // Offset +5 = zoom in to 5.0x (5x zoom in)
        
        if (offset === 0) {
            return defaultZoom;
        } else if (offset > 0) {
            // Positive offset: zoom in (1.0x to 5.0x multiplier)
            // Formula: multiplier = 1.0 + (offset / 5) * 4.0
            // Examples: +1 -> 1.8x, +3 -> 3.4x, +5 -> 5.0x
            const multiplier = 1.0 + (offset / 5) * 4.0;
            return defaultZoom * multiplier;
        } else {
            // Negative offset: zoom out (0.2x to 1.0x multiplier)
            // Formula: multiplier = 1.0 + (offset / 5) * 0.8
            // Examples: -1 -> 0.84x, -3 -> 0.52x, -5 -> 0.2x
            const multiplier = 1.0 + (offset / 5) * 0.8;
            return defaultZoom * multiplier;
        }
    }

    /**
     * Apply auto-fit zoom to show all tokens
     * @param {Array} tokens - Array of token placeables
     */
    static _applyAutoFitZoom(tokens) {
        try {
            if (!tokens || tokens.length === 0) return;
            
            // Calculate bounds of all tokens
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            
            tokens.forEach(token => {
                const tokenWidth = token.width * canvas.grid.size;
                const tokenHeight = token.height * canvas.grid.size;
                minX = Math.min(minX, token.x);
                minY = Math.min(minY, token.y);
                maxX = Math.max(maxX, token.x + tokenWidth);
                maxY = Math.max(maxY, token.y + tokenHeight);
            });
            
            // Add padding (20% margin)
            const padding = Math.max(maxX - minX, maxY - minY) * 0.2;
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            
            // Calculate zoom to fit bounds
            const canvasWidth = canvas.scene.width * canvas.grid.size;
            const canvasHeight = canvas.scene.height * canvas.grid.size;
            const boundsWidth = maxX - minX;
            const boundsHeight = maxY - minY;
            
            const zoomX = canvasWidth / boundsWidth;
            const zoomY = canvasHeight / boundsHeight;
            const zoom = Math.min(zoomX, zoomY, 1.0); // Don't zoom in beyond 1.0
            
            if (zoom > 0 && zoom !== canvas.stage.scale.x) {
                canvas.animateZoom(zoom);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error applying auto-fit zoom", error, false, false);
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
