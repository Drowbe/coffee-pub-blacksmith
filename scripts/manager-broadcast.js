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
        // Helper function to initialize camera on scene load
        const initializeCamera = async () => {
            // Only process for broadcast user (for spectator/combat modes)
            // For GM view mode, GM client initializes monitoring separately
            if (!this._isBroadcastUser()) {
                return;
            }
            if (!this.isEnabled()) {
                return;
            }
            
            const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
            
            // Initialize spectator mode camera
            if (mode === 'spectator') {
                // Wait a bit for canvas to fully initialize
                setTimeout(async () => {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Initializing camera on scene load (spectator mode)", "", true, false);
                    // Trigger camera update by calling _onTokenUpdate with null changes
                    // This will force a pan/zoom to current party token positions
                    await this._onTokenUpdate(null, {});
                }, 500);
            }
            // For gmview mode, the GM client will send initial sync via socket
            // The cameraman client just needs to wait for the socket message
        };
        
        // Hook for canvas ready - initialize camera position when canvas is ready
        HookManager.registerHook({
            name: 'canvasReady',
            description: 'BroadcastManager: Initialize camera position when canvas is ready',
            context: 'broadcast-camera-init',
            priority: 5,
            callback: async () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                await initializeCamera.call(this);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
        
        // Also hook into canvasInit as a fallback
        HookManager.registerHook({
            name: 'canvasInit',
            description: 'BroadcastManager: Initialize camera position when canvas initializes',
            context: 'broadcast-camera-init',
            priority: 5,
            callback: async () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                await initializeCamera.call(this);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
        
        // Also manually trigger after hooks are registered (in case canvas is already ready)
        // This ensures initialization happens even if hooks fire before we register
        setTimeout(async () => {
            if (canvas?.ready) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Canvas already ready, manually initializing camera", "", true, false);
                await initializeCamera.call(this);
            }
        }, 1000);
        
        // Hook for token position updates (spectator mode)
        HookManager.registerHook({
            name: 'updateToken',
            description: 'BroadcastManager: Follow party tokens on movement (spectator mode)',
            context: 'broadcast-camera',
            priority: 3,
            callback: async (tokenDocument, changes, options, userId) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: updateToken hook fired", {
                    tokenId: tokenDocument?.id,
                    changes: changes,
                    isBroadcastUser: this._isBroadcastUser(),
                    isEnabled: this.isEnabled(),
                    mode: getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator')
                }, true, false);
                
                // Only process for broadcast user
                if (!this._isBroadcastUser()) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not broadcast user, skipping", "", true, false);
                    return;
                }
                if (!this.isEnabled()) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast not enabled, skipping", "", true, false);
                    return;
                }
                
                // Check if we're in spectator mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode !== 'spectator') {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not in spectator mode, skipping", { mode }, true, false);
                    return;
                }
                
                // Process token update (even if no position changes in this hook call)
                // This ensures we pan/zoom to final position when token stops moving
                // The _shouldPan() check will handle throttling and distance threshold
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Processing token update", { 
                    changes: changes,
                    hasPositionChanges: changes && (changes.x !== undefined || changes.y !== undefined)
                }, true, false);
                
                // Follow party tokens (await to ensure zoom updates complete)
                // Pass changes but always check current token position
                await this._onTokenUpdate(tokenDocument, changes);
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // Hook for token creation (when token is dropped on canvas)
        HookManager.registerHook({
            name: 'createToken',
            description: 'BroadcastManager: Adapt viewport when party token is created',
            context: 'broadcast-camera',
            priority: 3,
            callback: async (tokenDocument, options, userId) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: createToken hook fired", {
                    tokenId: tokenDocument?.id,
                    tokenName: tokenDocument?.name
                }, true, false);
                
                // Only process for broadcast user
                if (!this._isBroadcastUser()) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not broadcast user, skipping", "", true, false);
                    return;
                }
                if (!this.isEnabled()) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast not enabled, skipping", "", true, false);
                    return;
                }
                
                // Check if we're in spectator mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode !== 'spectator') {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not in spectator mode, skipping", { mode }, true, false);
                    return;
                }
                
                // Wait a bit for token to be fully added to canvas
                setTimeout(async () => {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Processing token creation", { 
                        tokenId: tokenDocument?.id
                    }, true, false);
                    
                    // Trigger camera update to adapt to new party token
                    // Pass the tokenDocument but no changes (it's a new token at its initial position)
                    await this._onTokenUpdate(tokenDocument, {});
                }, 100);
                
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

        // Register GM view syncing (only if broadcast is enabled and mode is gmview)
        this._registerGMViewSync();
        
        // Register player view syncing (for playerview-{userId} modes)
        this._registerPlayerViewSync();
    }

    /**
     * Register GM viewport syncing (GM client sends viewport, cameraman receives)
     */
    static _registerGMViewSync() {
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: _registerGMViewSync called", "", true, false);
        
        // Since we're already in a ready hook context (called from _registerCameraHooks which is called from ready),
        // we can't use Hooks.once('ready') here. Execute directly but async for socket readiness.
        (async () => {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM view sync initialization starting", "", true, false);
            // Wait for socket system to be ready
            try {
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (!blacksmith) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Blacksmith API not available for GM view socket", "", true, false);
                    return;
                }
                if (!blacksmith.sockets) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Blacksmith sockets API not available for GM view socket", "", true, false);
                    return;
                }
                
                await blacksmith.sockets.waitForReady();
                
                // Register socket handler for receiving GM viewport updates (cameraman client)
                await blacksmith.sockets.register('broadcast.gmViewportSync', async (data, userId) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Received GM viewport sync", { 
                        data, 
                        userId, 
                        isBroadcastUser: this._isBroadcastUser(),
                        isEnabled: this.isEnabled(),
                        mode: getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator')
                    }, true, false);
                    
                    // Only process if we're the broadcast user and in GM view mode
                    if (!this._isBroadcastUser()) {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not broadcast user, ignoring GM viewport sync", "", true, false);
                        return;
                    }
                    if (!this.isEnabled()) {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast not enabled, ignoring GM viewport sync", "", true, false);
                        return;
                    }
                    
                    const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                    if (mode !== 'gmview') {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Not in GM view mode, ignoring sync", { mode }, true, false);
                        return;
                    }
                    
                    // Apply GM's viewport to cameraman's viewport
                    await this._applyGMViewport(data);
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                });
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM view socket handler registered successfully", "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to register GM view socket handler", error, true, false);
            }
            
            // If broadcast is enabled, check for viewport monitoring setup
            if (this.isEnabled()) {
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                
                // GM viewport monitoring (GM only)
                if (game.user.isGM && mode === 'gmview') {
                    // Wait for canvas to be ready if not already
                    if (!canvas?.ready) {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Canvas not ready, waiting for canvasReady", "", true, false);
                        Hooks.once('canvasReady', () => {
                            setTimeout(() => {
                                this._startGMViewportMonitoring();
                            }, 500);
                        });
                    } else {
                        setTimeout(() => {
                            this._startGMViewportMonitoring();
                        }, 500);
                    }
                } 
                // Player viewport monitoring (any player)
                else if (typeof mode === 'string' && mode.startsWith('playerview-')) {
                    // Initialize player viewport monitoring if mode is playerview
                    if (!canvas?.ready) {
                        Hooks.once('canvasReady', () => {
                            setTimeout(() => {
                                this._updatePlayerViewportMonitoring();
                            }, 500);
                        });
                    } else {
                        setTimeout(() => {
                            this._updatePlayerViewportMonitoring();
                        }, 500);
                    }
                }
            }
        })();

        // Hook into setting changes to start/stop GM viewport monitoring
        HookManager.registerHook({
            name: 'settingChange',
            description: 'BroadcastManager: Start/stop GM viewport monitoring when mode changes',
            context: 'broadcast-gmview-sync',
            priority: 5,
            key: 'broadcast-gmview-setting-change',
            callback: async (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'broadcastMode') {
                    
                    // If we're GM and mode changed to gmview, start monitoring
                    if (game.user.isGM && this.isEnabled() && value === 'gmview') {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Starting GM viewport monitoring from settingChange hook", "", true, false);
                        this._startGMViewportMonitoring();
                    } else {
                        // Stop monitoring if mode changed away from gmview
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Stopping GM viewport monitoring", "", true, false);
                        this._stopGMViewportMonitoring();
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    static _gmPanHandler = null;
    static _gmDebounce = null;

    /**
     * Start monitoring GM viewport changes (GM client only)
     */
    static _startGMViewportMonitoring() {
        this._stopGMViewportMonitoring();

        if (!game.user.isGM) return;

        // If canvas isn't ready yet, retry once it is
        if (!canvas?.ready) {
            Hooks.once('canvasReady', () => this._startGMViewportMonitoring());
            return;
        }

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM viewport monitoring ON (canvasPan)", "", true, false);

        this._gmPanHandler = (c, position) => {
            // position is {x,y,scale} center coords
            if (!this.isEnabled()) return;
            if (getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator') !== 'gmview') return;

            // Debounce emits so we don't spam
            if (this._gmDebounce) clearTimeout(this._gmDebounce);
            this._gmDebounce = setTimeout(() => {
                this._sendGMViewportSync(position);
            }, 150);
        };

        Hooks.on('canvasPan', this._gmPanHandler);

        // Send initial state immediately
        const initial = canvas.scene?._viewPosition ?? canvas.pan;
        if (initial) this._sendGMViewportSync(initial);
    }

    /**
     * Stop monitoring GM viewport changes
     */
    static _stopGMViewportMonitoring() {
        if (this._gmDebounce) {
            clearTimeout(this._gmDebounce);
            this._gmDebounce = null;
        }
        if (this._gmPanHandler) {
            Hooks.off('canvasPan', this._gmPanHandler);
            this._gmPanHandler = null;
        }
    }

    /**
     * Send GM viewport state to broadcast user via socket (GM client only)
     * @param {Object} position - Viewport position from canvasPan hook: {x, y, scale}
     */
    static async _sendGMViewportSync(position) {
        if (!game.user.isGM) return;
        if (!this.isEnabled()) return;
        if (!canvas?.ready) return;
        if (getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator') !== 'gmview') return;

        const viewportState = {
            x: position.x,
            y: position.y,
            scale: position.scale ?? canvas.stage?.scale?.x ?? 1
        };

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM sending viewport", viewportState, true, false);

        try {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            await blacksmith?.sockets?.waitForReady();
            await blacksmith?.sockets?.emit('broadcast.gmViewportSync', viewportState);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to send GM viewport sync", error, true, false);
        }
    }

    /**
     * Apply GM viewport state to cameraman's viewport (cameraman client only)
     * @param {Object} viewportState - Viewport state from GM with {centerX, centerY, zoom}
     */
    static async _applyGMViewport(viewportState) {
        if (!this._isBroadcastUser()) return;
        if (!this.isEnabled()) return;
        if (!canvas?.ready) return;
        if (getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator') !== 'gmview') return;

        // Guard correctly (allow 0)
        if (viewportState?.x == null || viewportState?.y == null || viewportState?.scale == null) return;

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Applying GM viewport", viewportState, true, false);

        const duration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 250);

        await canvas.animatePan({
            x: viewportState.x,
            y: viewportState.y,
            scale: viewportState.scale,
            duration,
            easing: 'easeInOutCosine'
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
    static async _onTokenUpdate(tokenDocument, changes) {
        try {
            // IMPORTANT: This code only runs for the broadcast user (cameraman)
            // All pan/zoom operations affect the cameraman's viewport only
            
            // Allow null tokenDocument for initialization (scene load)
            const isInitialization = !tokenDocument;
            
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: _onTokenUpdate called", {
                tokenId: tokenDocument?.id,
                changes: changes,
                isInitialization: isInitialization
            }, true, false);
            
            // Get party tokens visible to broadcast user
            let partyTokens = this._getVisiblePartyTokens();
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Found party tokens", {
                count: partyTokens?.length || 0,
                tokenIds: partyTokens?.map(t => t.id) || []
            }, true, false);
            
            if (!partyTokens || partyTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: No party tokens found, skipping", "", true, false);
                return;
            }
            
            // If we have a tokenDocument with position changes, update the corresponding token's position
            // This ensures we use the NEW position, not the old one from the placeable
            if (tokenDocument && changes && (changes.x !== undefined || changes.y !== undefined)) {
                partyTokens = partyTokens.map(token => {
                    if (token.id === tokenDocument.id) {
                        // Create a copy of the token with updated position from tokenDocument
                        const updatedToken = Object.assign({}, token);
                        // Use the NEW position from tokenDocument, not the placeable
                        updatedToken.x = changes.x !== undefined ? changes.x : token.x;
                        updatedToken.y = changes.y !== undefined ? changes.y : token.y;
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Updated token position from changes", {
                            tokenId: token.id,
                            oldX: token.x,
                            oldY: token.y,
                            newX: updatedToken.x,
                            newY: updatedToken.y
                        }, true, false);
                        return updatedToken;
                    }
                    return token;
                });
            }
            
            // Calculate target position (center of party tokens in world coordinates)
            // Use Token.center if available (handles size, scale, grid type automatically)
            // Fallback to manual calculation if needed
            const targetPosition = partyTokens.length === 1
                ? this._getTokenCenter(partyTokens[0])
                : this._getGroupCenter(partyTokens);
            
            if (!targetPosition) return;
            
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Target position calculated", {
                tokenCount: partyTokens.length,
                targetPosition: targetPosition
            }, true, false);
            
            // Calculate zoom based on token count (affects cameraman's viewport)
            let finalZoom;
            
            if (partyTokens.length === 1) {
                // Single token: use fixed zoom (default + offset)
                const zoomOffset = getSettingSafely(MODULE.ID, 'broadcastSpectatorZoomOffsetSingle', 0);
                const defaultZoom = getSettingSafely(MODULE.ID, 'broadcastDefaultZoom', 1.0);
                finalZoom = this._calculateZoomFromOffset(defaultZoom, zoomOffset);
            } else {
                // Multiple tokens: use auto-fit zoom based on bounding box + padding
                const paddingPercent = getSettingSafely(MODULE.ID, 'broadcastSpectatorPartyBoxPadding', 20);
                const autoFitZoom = this._calculateAutoFitZoom(partyTokens, paddingPercent);
                
                if (autoFitZoom !== null) {
                    // Use auto-fit zoom
                    finalZoom = autoFitZoom;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Auto-fit zoom calculated", {
                        tokenCount: partyTokens.length,
                        paddingPercent: paddingPercent,
                        autoFitZoom: autoFitZoom
                    }, true, false);
                } else {
                    // Fallback to default zoom if auto-fit calculation fails
                    const defaultZoom = getSettingSafely(MODULE.ID, 'broadcastDefaultZoom', 1.0);
                    finalZoom = defaultZoom;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Auto-fit zoom failed, using default", {
                        finalZoom: finalZoom
                    }, false, false);
                }
            }
            
            // Pan gating (existing logic: distance threshold + throttle)
            // Skip gating for initialization (scene load) - always pan/zoom
            // Pass partyTokens to check if any are off-screen (forces pan)
            const shouldPan = isInitialization ? true : this._shouldPan(targetPosition, partyTokens);
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Should pan check", {
                shouldPan: shouldPan,
                targetPosition: targetPosition,
                lastPanPosition: this._lastPanPosition
            }, true, false);
            
            // Zoom gating (new: check if zoom needs to change)
            // Always check zoom since we always calculate finalZoom now
            const currentZoom = canvas.stage?.scale?.x ?? canvas.scene?._viewPosition?.scale ?? 1.0;
            const shouldZoom = Math.abs(currentZoom - finalZoom) > 0.001;
            
            // If neither pan nor zoom is needed, return early
            if (!shouldPan && !shouldZoom) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Pan/zoom blocked by threshold/throttle", {
                    shouldPan: shouldPan,
                    shouldZoom: shouldZoom
                }, true, false);
                return;
            }
            
            // Sanity check zoom value and bounds
            if (finalZoom !== undefined) {
                if (!Number.isFinite(finalZoom)) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Invalid finalZoom", {
                        finalZoom: finalZoom,
                        zoomOffset: zoomOffset,
                        defaultZoom: defaultZoom
                    }, false, false);
                    return;
                }
                const min = canvas.scene?._viewPosition?.minScale ?? 0.25;
                const max = canvas.scene?._viewPosition?.maxScale ?? 3.0;
                if (finalZoom < min || finalZoom > max) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: finalZoom outside bounds, clamping", {
                        finalZoom: finalZoom,
                        min: min,
                        max: max
                    }, false, false);
                    // Clamp to bounds
                    finalZoom = Math.max(min, Math.min(max, finalZoom));
                }
            }
            
            // Pan and zoom together in one atomic operation
            // canvas.animatePan() appears to center the coordinate in the viewport automatically
            // (combat mode uses canvasToken.x/y which centers perfectly, so we use token center here)
            // Always include scale since we always calculate finalZoom now
            const animationDuration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 500);
            const panOptions = {
                x: targetPosition.x,
                y: targetPosition.y,
                scale: finalZoom,
                duration: animationDuration,
                easing: "easeInOutCosine" // Smooth ease in/out animation
            };
            
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Pan/zoom execute", {
                shouldPan: shouldPan,
                shouldZoom: shouldZoom,
                currentZoom: currentZoom,
                finalZoom: finalZoom,
                panOptions: panOptions
            }, true, false);
            
            // Await to ensure scale update completes before updating lastPanPosition
            await canvas.animatePan(panOptions);
            
            // Only update lastPanPosition/time when pan actually ran
            if (shouldPan) {
                this._lastPanPosition = targetPosition;
                this._lastPanTime = Date.now();
            }
            
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
     * Get reliable world-space center for a single token
     * Uses Token.center if available (handles size, scale, grid type automatically)
     * Falls back to manual calculation if needed
     * 
     * @param {Token} token - Token placeable object
     * @returns {Object|null} Center position {x, y} in world coordinates, or null if invalid
     */
    static _getTokenCenter(token) {
        if (!token) return null;
        
        // Prefer Token.center property if available (most reliable)
        if (token.center) {
            return { x: token.center.x, y: token.center.y };
        }
        
        // Fallback: manual calculation (accounts for texture scale if present)
        const size = canvas.dimensions?.size || canvas.grid?.size || 100;
        const w = (token.width ?? 1) * size;
        const h = (token.height ?? 1) * size;
        
        // Account for texture scale if present (common for "slightly bigger" tokens)
        const sx = token.texture?.scaleX ?? 1;
        const sy = token.texture?.scaleY ?? 1;
        
        return {
            x: token.x + (w * sx) / 2,
            y: token.y + (h * sy) / 2
        };
    }

    /**
     * Calculate center point of multiple tokens using bounding box of centers
     * More stable than averaging when tokens are spread out
     * 
     * @param {Array} tokens - Array of token placeables
     * @returns {Object|null} Center position {x, y} in world coordinates, or null if no tokens
     */
    static _getGroupCenter(tokens) {
        if (!tokens || tokens.length === 0) return null;
        
        // Get centers for all tokens
        const centers = tokens.map(t => this._getTokenCenter(t)).filter(Boolean);
        if (centers.length === 0) return null;
        
        // Bounding box center (more stable than average when tokens are spread)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of centers) {
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
        }
        
        return {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        };
    }

    /**
     * Calculate bounding box of all tokens including their actual size
     * @param {Array} tokens - Array of token placeables
     * @returns {Object|null} Bounding box {minX, minY, maxX, maxY, width, height} or null
     */
    static _calculateTokenBoundingBox(tokens) {
        if (!tokens || tokens.length === 0) return null;
        
        // Use canvas.grid.size for consistency (this is pixels per grid square)
        const gridSize = canvas.grid?.size || 100;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const token of tokens) {
            // Get token dimensions in world coordinates
            // Use token.document.width/height (in grid units) not token.width/height
            // Multiply by grid size to get pixels
            const tokenWidthGrid = token.document?.width ?? token.width ?? 1;
            const tokenHeightGrid = token.document?.height ?? token.height ?? 1;
            
            const tokenWidthPixels = tokenWidthGrid * gridSize;
            const tokenHeightPixels = tokenHeightGrid * gridSize;
            
            // Account for texture scale if present
            const sx = token.texture?.scaleX ?? 1;
            const sy = token.texture?.scaleY ?? 1;
            
            const tokenWidth = tokenWidthPixels * sx;
            const tokenHeight = tokenHeightPixels * sy;
            
            // Token bounds (token.x, token.y are top-left in world coordinates/pixels)
            const tokenMinX = token.x;
            const tokenMinY = token.y;
            const tokenMaxX = token.x + tokenWidth;
            const tokenMaxY = token.y + tokenHeight;
            
            minX = Math.min(minX, tokenMinX);
            minY = Math.min(minY, tokenMinY);
            maxX = Math.max(maxX, tokenMaxX);
            maxY = Math.max(maxY, tokenMaxY);
            
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Token bounding box contribution", {
                tokenId: token.id,
                tokenX: token.x,
                tokenY: token.y,
                tokenWidth: tokenWidth,
                tokenHeight: tokenHeight,
                gridSize: gridSize,
                tokenWidthGrid: tokenWidthGrid,
                tokenHeightGrid: tokenHeightGrid,
                tokenWidthFromDoc: token.document?.width,
                tokenHeightFromDoc: token.document?.height,
                tokenWidthFromPlaceable: token.width,
                tokenHeightFromPlaceable: token.height,
                textureScaleX: sx,
                textureScaleY: sy
            }, true, false);
        }
        
        const bbox = {
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY,
            width: maxX - minX,
            height: maxY - minY
        };
        
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Total bounding box calculated", {
            bbox: bbox,
            tokenCount: tokens.length,
            gridSize: gridSize
        }, true, false);
        
        return bbox;
    }

    /**
     * Calculate zoom level to fit party bounding box with padding in viewport
     * @param {Array} tokens - Array of token placeables
     * @param {number} paddingPercent - Padding percentage (0-100)
     * @returns {number|null} Calculated zoom level or null if unable to calculate
     */
    static _calculateAutoFitZoom(tokens, paddingPercent) {
        if (!tokens || tokens.length === 0) return null;
        
        // Calculate bounding box
        const bbox = this._calculateTokenBoundingBox(tokens);
        if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;
        
        // Get viewport dimensions (canvas app renderer size, not grid size)
        // canvas.dimensions.size is the grid size, not viewport size
        const viewportWidth = canvas.app?.renderer?.width || window.innerWidth || 1920;
        const viewportHeight = canvas.app?.renderer?.height || window.innerHeight || 1080;
        
        // Add padding to bounding box (paddingPercent is percentage, so 20% = 0.2)
        const paddingMultiplier = 1 + (paddingPercent / 100);
        const paddedWidth = bbox.width * paddingMultiplier;
        const paddedHeight = bbox.height * paddingMultiplier;
        
        // Calculate zoom needed to fit padded box in viewport
        // Zoom = viewport size / padded box size
        const zoomX = viewportWidth / paddedWidth;
        const zoomY = viewportHeight / paddedHeight;
        
        // Use the smaller zoom to ensure entire box fits (zoom out more if needed)
        const zoom = Math.min(zoomX, zoomY);
        
        // Clamp to scene min/max zoom bounds
        const min = canvas.scene?._viewPosition?.minScale ?? 0.25;
        const max = canvas.scene?._viewPosition?.maxScale ?? 3.0;
        
        const finalZoom = Math.max(min, Math.min(max, zoom));
        
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Auto-fit zoom calculation", {
            bbox: bbox,
            paddingPercent: paddingPercent,
            paddedWidth: paddedWidth,
            paddedHeight: paddedHeight,
            viewportWidth: viewportWidth,
            viewportHeight: viewportHeight,
            zoomX: zoomX,
            zoomY: zoomY,
            zoom: zoom,
            min: min,
            max: max,
            finalZoom: finalZoom
        }, true, false);
        
        return finalZoom;
    }

    /**
     * Check if camera should pan based on distance threshold and throttle
     * @param {Object} newPosition - New position {x, y}
     * @param {Array} partyTokens - Optional array of party tokens to check if they're off-screen
     * @returns {boolean} True if should pan
     */
    static _shouldPan(newPosition, partyTokens = null) {
        const distanceThreshold = getSettingSafely(MODULE.ID, 'broadcastFollowDistanceThreshold', 1.0);
        const throttleMs = getSettingSafely(MODULE.ID, 'broadcastFollowThrottleMs', 100);
        
        // Check if any party tokens are off-screen or near edge - always pan in this case
        if (partyTokens && partyTokens.length > 0) {
            const viewportWidth = canvas.app?.renderer?.width || window.innerWidth || 1920;
            const viewportHeight = canvas.app?.renderer?.height || window.innerHeight || 1080;
            const currentZoom = canvas.stage?.scale?.x ?? 1.0;
            
            // Viewport bounds in world coordinates
            const viewportLeft = canvas.pan?.x ?? 0;
            const viewportTop = canvas.pan?.y ?? 0;
            const viewportRight = viewportLeft + (viewportWidth / currentZoom);
            const viewportBottom = viewportTop + (viewportHeight / currentZoom);
            
            // Check if any token is outside viewport (with small margin for edge detection)
            const margin = canvas.grid.size * 2; // 2 grid units margin
            for (const token of partyTokens) {
                const tokenCenter = this._getTokenCenter(token);
                if (!tokenCenter) continue;
                
                // Check if token is outside viewport bounds (with margin)
                if (tokenCenter.x < (viewportLeft - margin) || 
                    tokenCenter.x > (viewportRight + margin) ||
                    tokenCenter.y < (viewportTop - margin) || 
                    tokenCenter.y > (viewportBottom + margin)) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Token off-screen, forcing pan", {
                        tokenId: token.id,
                        tokenCenter: tokenCenter,
                        viewportBounds: { left: viewportLeft, top: viewportTop, right: viewportRight, bottom: viewportBottom }
                    }, true, false);
                    return true; // Force pan if token is off-screen
                }
            }
        }
        
        // Check distance threshold first (if we have a last position)
        if (this._lastPanPosition.x !== null && this._lastPanPosition.y !== null) {
            const distance = Math.sqrt(
                Math.pow(newPosition.x - this._lastPanPosition.x, 2) +
                Math.pow(newPosition.y - this._lastPanPosition.y, 2)
            );
            
            // Convert pixels to grid units
            const gridUnits = distance / canvas.grid.size;
            
            // If token hasn't moved enough, don't pan
            if (gridUnits < distanceThreshold) {
                return false;
            }
            
            // If token has moved significantly (more than 2x threshold), bypass throttle
            // Reduced from 3x to 2x for more responsive following during long drags
            if (gridUnits > (distanceThreshold * 2)) {
                return true; // Bypass throttle for large movements
            }
        }
        
        // Check throttle (time-based) for normal movements
        const now = Date.now();
        if (now - this._lastPanTime < throttleMs) {
            return false;
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
                // FoundryVTT v12+: Use canvas.stage.scale to set zoom
                if (canvas.stage && canvas.stage.scale) {
                    canvas.stage.scale.set(zoom, zoom);
                }
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

    // ==================================================================
    // ===== PLAYER VIEWPORT TRACKING ==================================
    // ==================================================================

    static _playerPanHandlers = new Map(); // userId -> handler function
    static _playerDebounces = new Map(); // userId -> timeout

    /**
     * Get party tokens with their owner user information
     * @returns {Array} Array of {token, userId, user, actor} objects
     */
    static _getPartyTokensWithUsers() {
        if (!canvas || !canvas.tokens) return [];
        
        const results = [];
        
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            // Must be player character
            if (!actor || actor.type !== 'character' || !actor.hasPlayerOwner) {
                continue;
            }
            
            // Find the owner user (permission level 3 = OWNER)
            const ownership = actor.ownership || {};
            const ownerEntry = Object.entries(ownership)
                .find(([userId, level]) => level === 3 && game.users.get(userId)?.active);
            
            if (!ownerEntry) continue;
            
            const [userId] = ownerEntry;
            const user = game.users.get(userId);
            if (!user) continue;
            
            results.push({
                token,
                userId,
                user,
                actor
            });
        }
        
        return results;
    }

    /**
     * Register portrait buttons for all party tokens
     * Called from MenuBar when registering broadcast tools
     */
    static registerPlayerPortraitButtons() {
        // Unregister all existing player portrait buttons
        const partyData = this._getPartyTokensWithUsers();
        
        // Remove old buttons (any button starting with broadcast-mode-player-)
        // This is a bit hacky - we'd need MenuBar API to unregister, but for now we'll rely on re-registration
        // The buttons will be recreated below, overwriting old ones
        
        // Register buttons for each party token
        let order = 10; // Start after manual (order 3), give some space
        for (const {token, userId, user, actor} of partyData) {
            const itemId = `broadcast-mode-player-${userId}`;
            const modeValue = `playerview-${userId}`;
            
            // Get token portrait image
            const portraitImg = token.document?.texture?.src || actor.img || '';
            
            MenuBar.registerSecondaryBarItem('broadcast', itemId, {
                icon: portraitImg || 'fas fa-user', // Use portrait as icon, fallback to font icon
                label: user.name || actor.name || 'Player',
                tooltip: `Mirror ${user.name}'s viewport`,
                group: 'modes',
                order: order++,
                onClick: async () => {
                    // Only GMs can change broadcast mode
                    if (!game.user.isGM) {
                        postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                        return;
                    }
                    await game.settings.set(MODULE.ID, 'broadcastMode', modeValue);
                }
            });
        }
    }

    /**
     * Start monitoring player viewport (for a specific player)
     * @param {string} userId - The user ID to monitor
     */
    static _startPlayerViewportMonitoring(userId) {
        if (!userId) return;
        
        // Stop existing monitoring for this user
        this._stopPlayerViewportMonitoring(userId);
        
        // Only monitor if this is the current user
        if (game.user.id !== userId) return;
        if (!canvas?.ready) {
            Hooks.once('canvasReady', () => this._startPlayerViewportMonitoring(userId));
            return;
        }

        postConsoleAndNotification(MODULE.NAME, `BroadcastManager: Player viewport monitoring ON for ${userId}`, "", true, false);

        const handler = (c, position) => {
            // Check if we should send viewport updates
            if (!this.isEnabled()) return;
            const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
            if (mode !== `playerview-${userId}`) return;

            // Debounce emits
            if (this._playerDebounces.has(userId)) {
                clearTimeout(this._playerDebounces.get(userId));
            }
            const timeout = setTimeout(() => {
                this._sendPlayerViewportSync(userId, position);
            }, 150);
            this._playerDebounces.set(userId, timeout);
        };

        Hooks.on('canvasPan', handler);
        this._playerPanHandlers.set(userId, handler);

        // Send initial state
        const initial = canvas.scene?._viewPosition ?? canvas.pan;
        if (initial) this._sendPlayerViewportSync(userId, initial);
    }

    /**
     * Stop monitoring player viewport (for a specific player)
     * @param {string} userId - The user ID to stop monitoring
     */
    static _stopPlayerViewportMonitoring(userId) {
        if (this._playerDebounces.has(userId)) {
            clearTimeout(this._playerDebounces.get(userId));
            this._playerDebounces.delete(userId);
        }
        if (this._playerPanHandlers.has(userId)) {
            const handler = this._playerPanHandlers.get(userId);
            Hooks.off('canvasPan', handler);
            this._playerPanHandlers.delete(userId);
        }
    }

    /**
     * Send player viewport state to cameraman via socket
     * @param {string} userId - The player's user ID
     * @param {Object} position - Viewport position from canvasPan hook
     */
    static async _sendPlayerViewportSync(userId, position) {
        if (!userId || game.user.id !== userId) return;
        if (!this.isEnabled()) return;
        if (!canvas?.ready) return;
        
        const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
        if (mode !== `playerview-${userId}`) return;

        const viewportState = {
            userId,
            x: position.x,
            y: position.y,
            scale: position.scale ?? canvas.stage?.scale?.x ?? 1
        };

        postConsoleAndNotification(MODULE.NAME, `BroadcastManager: Player ${userId} sending viewport`, viewportState, true, false);

        try {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            await blacksmith?.sockets?.waitForReady();
            await blacksmith?.sockets?.emit('broadcast.playerViewportSync', viewportState);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `BroadcastManager: Failed to send player viewport sync for ${userId}`, error, true, false);
        }
    }

    /**
     * Register player viewport syncing (socket handler and monitoring setup)
     */
    static _registerPlayerViewSync() {
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: _registerPlayerViewSync called", "", true, false);
        
        (async () => {
            try {
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (!blacksmith?.sockets) {
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Blacksmith sockets API not available for player view socket", "", true, false);
                    return;
                }
                
                await blacksmith.sockets.waitForReady();
                
                // Register socket handler for receiving player viewport updates (cameraman client)
                await blacksmith.sockets.register('broadcast.playerViewportSync', async (data, userId) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    // Only process if we're the broadcast user and in the correct playerview mode
                    if (!this._isBroadcastUser()) return;
                    if (!this.isEnabled()) return;
                    
                    const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                    if (mode !== `playerview-${data.userId}`) return;
                    
                    // Apply player's viewport to cameraman's viewport
                    await this._applyPlayerViewport(data);
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                });
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Player view socket handler registered successfully", "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to register player view socket handler", error, true, false);
            }
            
            // Start monitoring for each player if mode matches
            this._updatePlayerViewportMonitoring();
        })();

        // Hook into setting changes to start/stop player viewport monitoring
        HookManager.registerHook({
            name: 'settingChange',
            description: 'BroadcastManager: Start/stop player viewport monitoring when mode changes',
            context: 'broadcast-playerview-sync',
            priority: 5,
            key: 'broadcast-playerview-setting-change',
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'broadcastMode') {
                    // Check if mode is a playerview mode
                    if (typeof value === 'string' && value.startsWith('playerview-')) {
                        const userId = value.replace('playerview-', '');
                        if (game.user.id === userId) {
                            this._startPlayerViewportMonitoring(userId);
                        } else {
                            this._stopPlayerViewportMonitoring(userId);
                        }
                    } else {
                        // Stop all player monitoring if mode changed away from playerview
                        this._stopAllPlayerViewportMonitoring();
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Update player viewport monitoring based on current mode
     */
    static _updatePlayerViewportMonitoring() {
        const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
        
        if (typeof mode === 'string' && mode.startsWith('playerview-')) {
            const userId = mode.replace('playerview-', '');
            if (game.user.id === userId) {
                this._startPlayerViewportMonitoring(userId);
            }
        } else {
            this._stopAllPlayerViewportMonitoring();
        }
    }

    /**
     * Stop all player viewport monitoring
     */
    static _stopAllPlayerViewportMonitoring() {
        for (const userId of this._playerPanHandlers.keys()) {
            this._stopPlayerViewportMonitoring(userId);
        }
    }

    /**
     * Apply player viewport to cameraman's viewport
     * @param {Object} viewportState - Viewport state {userId, x, y, scale}
     */
    static async _applyPlayerViewport(viewportState) {
        if (!this._isBroadcastUser()) return;
        if (!this.isEnabled()) return;
        if (!canvas?.ready) return;
        
        const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
        if (mode !== `playerview-${viewportState.userId}`) return;

        // Guard correctly (allow 0)
        if (viewportState?.x == null || viewportState?.y == null || viewportState?.scale == null) return;

        postConsoleAndNotification(MODULE.NAME, `BroadcastManager: Applying player ${viewportState.userId} viewport`, viewportState, true, false);

        const duration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 250);

        await canvas.animatePan({
            x: viewportState.x,
            y: viewportState.y,
            scale: viewportState.scale,
            duration,
            easing: 'easeInOutCosine'
        });
    }
}
