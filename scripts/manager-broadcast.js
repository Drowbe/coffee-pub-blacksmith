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
    static _lastModeEmit = { mode: null, at: 0 };
    static _playerButtonsDebounce = null;
    static _lastBroadcastMode = null;
    static _broadcastTrackedWindows = new Map(); // appKey -> { type, timeoutId, appRef }
    static _broadcastWindowHooksRegistered = false;
    
    // Resource tracking for cleanup
    static _hookIds = new Set(); // HookManager callback IDs
    static _timeoutIds = new Set(); // setTimeout references
    static _socketHandlerNames = new Set(); // Socket handler event names

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

        // Register cleanup hook for module unload
        HookManager.registerHook({
            name: 'unloadModule',
            description: 'BroadcastManager: Cleanup on module unload',
            context: 'broadcast-cleanup',
            priority: 3,
            callback: (moduleId) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (moduleId === MODULE.ID) {
                    this.cleanup();
                }
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

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
                    // Re-render menubar to update view mode button visibility
                    MenuBar.renderMenubar();
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // Hook into user connection/disconnection to update view mode button visibility
        HookManager.registerHook({
            name: 'userConnected',
            description: 'BroadcastManager: Update menubar when users connect',
            context: 'broadcast-settings',
            priority: 3,
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                // Re-render menubar to update view mode button visibility
                MenuBar.renderMenubar();
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'userDisconnected',
            description: 'BroadcastManager: Update menubar when users disconnect',
            context: 'broadcast-settings',
            priority: 3,
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                // Re-render menubar to update view mode button visibility
                MenuBar.renderMenubar();
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // Hook into ready to ensure broadcast mode is applied after page load
        // Note: ready is a one-time hook, so use Hooks.once directly
        // Use setTimeout to ensure document.body is ready
        Hooks.once('ready', () => {
            setTimeout(async () => {
                this._updateBroadcastMode();
                // Register camera hooks after settings are loaded
                this._registerCameraHooks();
                // Register broadcast bar type before registering tools
                await this._registerBroadcastBarType();
                // Register broadcast tools after bar type is registered
                this._registerBroadcastTools();
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
                
                // Check if we're in spectator or follow mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode === 'playerview-follow') {
                    const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                    if (followTokenId && tokenDocument?.id === followTokenId) {
                        await this._onFollowTokenUpdate(tokenDocument);
                    }
                    return;
                }
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
                
                // Check if we're in spectator or follow mode
                const mode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
                if (mode === 'playerview-follow') {
                    const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                    if (followTokenId && tokenDocument?.id === followTokenId) {
                        await this._onFollowTokenUpdate(tokenDocument);
                    }
                    return;
                }
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
                const gmViewportSyncHandler = 'broadcast.gmViewportSync';
                this._socketHandlerNames.add(gmViewportSyncHandler);
                await blacksmith.sockets.register(gmViewportSyncHandler, async (data, userId) => {
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

                // Register socket handler for broadcast mode changes (all clients)
                const modeChangedHandler = 'broadcast.modeChanged';
                this._socketHandlerNames.add(modeChangedHandler);
                await blacksmith.sockets.register(modeChangedHandler, async (data) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    if (!data || !data.mode) return;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Received mode change socket", { data }, true, false);
                    
                    // Adjust viewport for the new mode (client-specific behavior)
                    await this._adjustViewportForMode(data.mode);
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                });
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Mode change socket handler registered successfully", "", true, false);

                // Register socket handler for map view (all clients)
                const mapViewHandler = 'broadcast.mapView';
                this._socketHandlerNames.add(mapViewHandler);
                await blacksmith.sockets.register(mapViewHandler, async () => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    await this._applyMapView();
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                });
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Map view socket handler registered successfully", "", true, false);

                // Register socket handler for broadcast window commands (cameraman only)
                const windowCommandHandler = 'broadcast.windowCommand';
                this._socketHandlerNames.add(windowCommandHandler);
                await blacksmith.sockets.register(windowCommandHandler, async (data) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    if (!data?.action) return;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Received window command", {
                        data,
                        isBroadcastUser: this._isBroadcastUser(),
                        isEnabled: this.isEnabled()
                    }, true, false);
                    if (data.targetUserId && !matchUserBySetting(game.user, data.targetUserId)) {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Window command ignored (not target user)", { targetUserId: data.targetUserId }, true, false);
                        return;
                    }
                    if (!this._isBroadcastUser()) return;

                    switch (data.action) {
                        case 'close-images':
                            this._closeTrackedWindowsByType('image');
                            break;
                        case 'close-journals':
                            this._closeTrackedWindowsByType('journal');
                            break;
                        case 'close-all':
                            await this._closeAllWindows();
                            break;
                        case 'refresh':
                            window.location.reload();
                            break;
                        case 'settings':
                            game.settings.sheet.render(true);
                            break;
                        default:
                            break;
                    }
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                });
                
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Window command socket handler registered successfully", "", true, false);
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
                else if (typeof mode === 'string' && mode.startsWith('playerview-') && mode !== 'playerview-follow') {
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

        // Send initial state immediately - match canvasPan format (center coords)
        const view = canvas.scene?._viewPosition ?? canvas.pan ?? { x: 0, y: 0, scale: 1 };
        const initialPosition = {
            x: view.x ?? 0,
            y: view.y ?? 0,
            scale: view.scale ?? canvas.stage?.scale?.x ?? 1
        };
        
        // Use a small timeout to ensure canvas is fully ready
        setTimeout(() => {
            this._sendGMViewportSync(initialPosition);
        }, 100);
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
            
            // Use auto-fit zoom based on bounding box + padding (single or multiple tokens)
            const fillPercent = getSettingSafely(MODULE.ID, 'broadcastSpectatorPartyBoxFill', 20);
            const autoFitZoom = this._calculateAutoFitZoom(partyTokens, fillPercent);
            
            if (autoFitZoom !== null) {
                finalZoom = autoFitZoom;
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Auto-fit zoom calculated", {
                    tokenCount: partyTokens.length,
                    fillPercent: fillPercent,
                    autoFitZoom: autoFitZoom
                }, true, false);
            } else {
                // Fallback to current zoom if auto-fit calculation fails
                finalZoom = canvas.stage?.scale?.x ?? 1.0;
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Auto-fit zoom failed, using current", {
                    finalZoom: finalZoom
                }, false, false);
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
     * Adjust viewport immediately when mode changes
     * @param {string} mode - The new broadcast mode
     */
    static async _adjustViewportForMode(mode) {
        if (!this.isEnabled() || !canvas?.ready) return;
        
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Adjusting viewport for mode change", { 
            mode,
            isBroadcastUser: this._isBroadcastUser(),
            isGM: game.user.isGM
        }, true, false);
        
        if (mode === 'spectator') {
            // Only adjust viewport for broadcast user (cameraman)
            if (this._isBroadcastUser()) {
                // Immediately pan/zoom to party tokens
                await this._onTokenUpdate(null, {});
            }
        } else if (mode === 'combat') {
            // Only adjust viewport for broadcast user (cameraman)
            if (this._isBroadcastUser()) {
                // Immediately pan to current combatant if combat is active
                const combat = game.combat;
                if (combat) {
                    this._onCombatUpdate(combat);
                }
            }
        } else if (mode === 'gmview') {
            // For GM view, the GM client sends initial sync, cameraman receives it
            // GM: trigger initial sync (not the broadcast user, so early return doesn't apply)
            if (game.user.isGM) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM view mode - GM client triggering initial sync", "", true, false);
                // The _startGMViewportMonitoring will send initial state
                // But we should also trigger it here if not already monitoring
                if (!this._gmPanHandler) {
                    this._startGMViewportMonitoring();
                } else {
                    // Already monitoring, just send current viewport immediately
                    const view = canvas.scene?._viewPosition ?? canvas.pan ?? { x: 0, y: 0, scale: 1 };
                    const centerX = view.x ?? 0;
                    const centerY = view.y ?? 0;
                    const currentScale = view.scale ?? canvas.stage?.scale?.x ?? 1;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM sending immediate viewport sync", { centerX, centerY, currentScale }, true, false);
                    this._sendGMViewportSync({ x: centerX, y: centerY, scale: currentScale });
                }
            }
            // Cameraman: just wait for socket message (handled by socket handler)
        } else if (typeof mode === 'string' && mode.startsWith('playerview-')) {
            // For player view, the player client sends initial sync, cameraman receives it
            // Player: trigger initial sync (not the broadcast user, so early return doesn't apply)
            if (mode === 'playerview-follow') {
                if (this._isBroadcastUser()) {
                    const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                    await this._onFollowTokenUpdate(null, followTokenId, true);
                }
                return;
            }
            const userId = mode.replace('playerview-', '');
            if (game.user.id === userId) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Player view mode - Player client triggering initial sync", { userId }, true, false);
                // The _startPlayerViewportMonitoring will send initial state
                // But we should also trigger it here if not already monitoring
                if (!this._playerPanHandlers.has(userId)) {
                    this._startPlayerViewportMonitoring(userId);
                } else {
                    // Already monitoring, just send current viewport immediately
                    const view = canvas.scene?._viewPosition ?? canvas.pan ?? { x: 0, y: 0, scale: 1 };
                    const centerX = view.x ?? 0;
                    const centerY = view.y ?? 0;
                    const currentScale = view.scale ?? canvas.stage?.scale?.x ?? 1;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Player sending immediate viewport sync", { userId, centerX, centerY, currentScale }, true, false);
                    this._sendPlayerViewportSync(userId, { x: centerX, y: centerY, scale: currentScale });
                }
            }
            // Cameraman: just wait for socket message (handled by socket handler)
        }
        // Manual mode: do nothing (manual camera control)
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
            
            const token = currentCombatant.token;
            if (!token) return;
            const canvasToken = canvas.tokens.get(token.id);
            if (!canvasToken) return;

            const center = this._getTokenCenter(canvasToken);
            if (!center) return;

            const fillPercent = getSettingSafely(MODULE.ID, 'broadcastCombatViewFill', 20);
            const autoFitZoom = this._calculateAutoFitZoom([canvasToken], fillPercent);
            const finalZoom = autoFitZoom ?? (canvas.stage?.scale?.x ?? 1.0);
            const duration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 250);

            canvas.animatePan({
                x: center.x,
                y: center.y,
                scale: finalZoom,
                duration,
                easing: 'easeInOutCosine'
            });
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error following combatant", error, false, false);
        }
    }

    /**
     * Follow a specific token in playerview-follow mode.
     * @param {TokenDocument|null} tokenDocument - Token document to follow
     * @param {string|null} tokenIdOverride - Token ID to follow
     */
    static async _onFollowTokenUpdate(tokenDocument, tokenIdOverride = null, forcePan = false) {
        try {
            if (!this._isBroadcastUser()) return;
            if (!this.isEnabled()) return;
            if (!canvas?.ready) return;
            if (getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator') !== 'playerview-follow') return;

            const tokenId = tokenIdOverride || tokenDocument?.id;
            if (!tokenId) return;

            const canvasToken = canvas.tokens.get(tokenId);
            if (!canvasToken) return;

            const center = this._getTokenCenter(canvasToken);
            if (!center) return;
            const shouldPan = forcePan ? true : this._shouldPan({ x: center.x, y: center.y }, [canvasToken]);
            if (!shouldPan) return;

            const fillPercent = getSettingSafely(MODULE.ID, 'broadcastFollowViewFill', 20);
            const followBoxGridSize = 3;
            const fixedZoom = this._calculateFixedBoxZoom(followBoxGridSize, fillPercent);
            const finalZoom = fixedZoom ?? (canvas.stage?.scale?.x ?? 1.0);

            const duration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 250);
            await canvas.animatePan({
                x: center.x,
                y: center.y,
                scale: finalZoom,
                duration,
                easing: 'easeInOutCosine'
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error following token (follow mode)", error, false, false);
        }
    }

    /**
     * Fit the current scene to the viewport (broadcast user only).
     */
    static async _applyMapView() {
        try {
            if (!this._isBroadcastUser()) return;
            if (!this.isEnabled()) return;
            if (!canvas?.ready) return;

            const dims = canvas.scene?.dimensions;
            if (!dims) return;

            const viewWidth = canvas.app?.renderer?.width ?? 0;
            const viewHeight = canvas.app?.renderer?.height ?? 0;
            if (!viewWidth || !viewHeight) return;

            const rect = dims.sceneRect || { x: 0, y: 0, width: dims.width, height: dims.height };
            const centerX = rect.x + (rect.width / 2);
            const centerY = rect.y + (rect.height / 2);
            const scale = Math.min(viewWidth / rect.width, viewHeight / rect.height) * 0.95;

            const duration = getSettingSafely(MODULE.ID, 'broadcastAnimationDuration', 250);
            await canvas.animatePan({
                x: centerX,
                y: centerY,
                scale,
                duration,
                easing: 'easeInOutCosine'
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Error applying map view", error, false, false);
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

    static _shouldTrackBroadcastWindows() {
        return this.isEnabled() && this._isBroadcastUser();
    }

    static _trackBroadcastWindow(app, type) {
        if (!this._shouldTrackBroadcastWindows()) return;
        if (!app) return;

        const appKey = app.appId ?? app.id ?? app._id ?? app;
        const existing = this._broadcastTrackedWindows.get(appKey);
        if (existing?.timeoutId) {
            clearTimeout(existing.timeoutId);
        }

        const entry = { type, timeoutId: null, appRef: app };
        this._broadcastTrackedWindows.set(appKey, entry);
        this._scheduleBroadcastWindowClose(appKey, type, app);
    }

    static _scheduleBroadcastWindowClose(appKey, type, appRef = null) {
        const shouldAutoClose = getSettingSafely(MODULE.ID, 'broadcastAutoCloseWindows', true);

        if (!shouldAutoClose) return;

        const delaySeconds = getSettingSafely(MODULE.ID, 'broadcastAutoCloseDelaySeconds', 3);

        const delayMs = Math.max(1, delaySeconds) * 1000;
        const timeoutId = setTimeout(() => {
            const entry = this._broadcastTrackedWindows.get(appKey);
            if (!entry) return;
            const app = appRef || entry.appRef;
            if (app?.close) {
                app.close({ animate: false });
            }
            this._clearTrackedWindow(appKey);
            this._closeTrackedWindowsByType(type);
        }, delayMs);

        this._timeoutIds.add(timeoutId);
        const entry = this._broadcastTrackedWindows.get(appKey);
        if (entry) {
            entry.timeoutId = timeoutId;
        }
    }

    static _getBroadcastWindowType(app) {
        if (!app) return null;
        const name = app.constructor?.name || '';
        if (name === 'ImagePopout') return 'image';
        const doc = app.document;
        if (doc instanceof JournalEntry || doc instanceof JournalEntryPage) return 'journal';
        if (name.toLowerCase().includes('journal')) return 'journal';
        return null;
    }

    static _clearTrackedWindow(appKey) {
        const entry = this._broadcastTrackedWindows.get(appKey);
        if (entry?.timeoutId) {
            clearTimeout(entry.timeoutId);
        }
        this._broadcastTrackedWindows.delete(appKey);
    }

    static _closeTrackedWindowsByType(type) {
        let closedAny = false;
        for (const [appKey, entry] of this._broadcastTrackedWindows.entries()) {
            if (type && entry.type !== type) continue;
            const app = entry.appRef || ui.windows?.[appKey];
            if (app?.close) {
                app.close({ animate: false });
            }
            this._clearTrackedWindow(appKey);
            closedAny = true;
        }

        if (closedAny) return;

        for (const app of this._getOpenWindows()) {
            if (!app?.close) continue;
            const isImage = app.constructor?.name === 'ImagePopout';
            const isJournal = app.document instanceof JournalEntry;
            if (type === 'image' && !isImage) continue;
            if (type === 'journal' && !isJournal) continue;
            app.close({ animate: false });
        }
    }

    static async _closeAllWindows() {
        const windows = this._getOpenWindows();
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Closing all windows on cameraman", {
            count: windows.length,
            windows: windows.map(app => ({
                appId: app?.appId,
                name: app?.constructor?.name,
                title: app?.title
            }))
        }, true, false);
        for (const app of windows) {
            if (!app) continue;
            try {
                if (typeof app.close === 'function') {
                    await app.close({ animate: false });
                } else if (typeof app.render === 'function') {
                    app.render(false);
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to close window", { appId: app?.appId, error }, true, false);
            }
        }
        for (const appId of Array.from(this._broadcastTrackedWindows.keys())) {
            this._clearTrackedWindow(appId);
        }
    }

    static _getOpenWindows() {
        const windows = [];
        const seen = new Set();

        for (const app of Object.values(ui.windows || {})) {
            if (!app) continue;
            const key = app.appId ?? app;
            if (seen.has(key)) continue;
            seen.add(key);
            windows.push(app);
        }

        const v2Instances = foundry?.applications?.instances;
        if (v2Instances && typeof v2Instances.values === 'function') {
            for (const app of v2Instances.values()) {
                if (!app) continue;
                const key = app.appId ?? app;
                if (seen.has(key)) continue;
                seen.add(key);
                windows.push(app);
            }
        }

        return windows;
    }

    static _registerBroadcastWindowHooks() {
        if (this._broadcastWindowHooksRegistered) return;
        this._broadcastWindowHooksRegistered = true;
        console.log(`[${MODULE.NAME}] BroadcastManager: Registering broadcast window hooks`);

        HookManager.registerHook({
            name: 'renderImagePopout',
            description: 'BroadcastManager: Track broadcast images on cameraman',
            context: 'broadcast-windows',
            priority: 5,
            key: 'broadcast-windows-image',
            callback: (app, html) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                console.log(`[${MODULE.NAME}] BroadcastManager: renderImagePopout hook fired`, { appId: app?.appId });
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: renderImagePopout hook fired", { appId: app?.appId }, true, false);
                this._trackBroadcastWindow(app, 'image');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'renderJournalSheet',
            description: 'BroadcastManager: Track broadcast journals on cameraman',
            context: 'broadcast-windows',
            priority: 5,
            key: 'broadcast-windows-journal',
            callback: (app, html) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                console.log(`[${MODULE.NAME}] BroadcastManager: renderJournalSheet hook fired`, { appId: app?.appId });
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: renderJournalSheet hook fired", { appId: app?.appId }, true, false);
                this._trackBroadcastWindow(app, 'journal');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'renderJournalPageSheet',
            description: 'BroadcastManager: Track broadcast journal pages on cameraman',
            context: 'broadcast-windows',
            priority: 5,
            key: 'broadcast-windows-journal-page',
            callback: (app, html) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                console.log(`[${MODULE.NAME}] BroadcastManager: renderJournalPageSheet hook fired`, { appId: app?.appId });
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: renderJournalPageSheet hook fired", { appId: app?.appId }, true, false);
                this._trackBroadcastWindow(app, 'journal');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'renderApplication',
            description: 'BroadcastManager: Track broadcast windows (generic)',
            context: 'broadcast-windows',
            priority: 5,
            key: 'broadcast-windows-application',
            callback: (app) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                const type = this._getBroadcastWindowType(app);
                if (!type) return;
                console.log(`[${MODULE.NAME}] BroadcastManager: renderApplication hook fired`, {
                    appId: app?.appId,
                    type
                });
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: renderApplication hook fired", {
                    appId: app?.appId,
                    type
                }, true, false);
                this._trackBroadcastWindow(app, type);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
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
     * Calculate zoom level for a box to fill a percentage of the viewport.
     * @param {number} boxWidth - Box width in pixels
     * @param {number} boxHeight - Box height in pixels
     * @param {number} fillPercent - Percent of viewport the box should fill (0-100)
     * @returns {number|null} Calculated zoom level or null if unable to calculate
     */
    static _calculateViewportFillZoom(boxWidth, boxHeight, fillPercent) {
        if (!boxWidth || !boxHeight || boxWidth <= 0 || boxHeight <= 0) return null;
        const viewportWidth = canvas.app?.renderer?.width || window.innerWidth || 1920;
        const viewportHeight = canvas.app?.renderer?.height || window.innerHeight || 1080;
        const clampedFill = Math.max(1, Math.min(100, fillPercent));
        const fillFraction = clampedFill / 100;

        const zoomX = (viewportWidth * fillFraction) / boxWidth;
        const zoomY = (viewportHeight * fillFraction) / boxHeight;
        const zoom = Math.min(zoomX, zoomY);

        const min = canvas.scene?._viewPosition?.minScale ?? 0.25;
        const max = canvas.scene?._viewPosition?.maxScale ?? 3.0;
        const finalZoom = Math.max(min, Math.min(max, zoom));

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Viewport fill zoom calculation", {
            boxWidth,
            boxHeight,
            fillPercent,
            clampedFill,
            fillFraction,
            viewportWidth,
            viewportHeight,
            zoomX,
            zoomY,
            zoom,
            min,
            max,
            finalZoom
        }, true, false);

        return finalZoom;
    }

    /**
     * Calculate zoom level to fit party bounding box based on viewport fill percent
     * @param {Array} tokens - Array of token placeables
     * @param {number} fillPercent - Percent of viewport the box should fill (0-100)
     * @returns {number|null} Calculated zoom level or null if unable to calculate
     */
    static _calculateAutoFitZoom(tokens, fillPercent) {
        if (!tokens || tokens.length === 0) return null;
        
        // Calculate bounding box
        const bbox = this._calculateTokenBoundingBox(tokens);
        if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;
        
        return this._calculateViewportFillZoom(bbox.width, bbox.height, fillPercent);
    }

    /**
     * Calculate zoom level to fit a fixed-size box (in grid units) based on viewport fill percent.
     * @param {number} boxSizeGrid - Box size in grid units (assumes square)
     * @param {number} fillPercent - Percent of viewport the box should fill (0-100)
     * @returns {number|null} Calculated zoom level or null if unable to calculate
     */
    static _calculateFixedBoxZoom(boxSizeGrid, fillPercent) {
        if (!boxSizeGrid || boxSizeGrid <= 0) return null;
        const gridSize = canvas.grid?.size || 100;
        const boxPixels = boxSizeGrid * gridSize;
        return this._calculateViewportFillZoom(boxPixels, boxPixels, fillPercent);
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
        
        const resultsByUser = new Map();
        const addResult = (userId, data) => {
            if (!userId || resultsByUser.has(userId)) return;
            resultsByUser.set(userId, data);
        };
        const OWNER_LEVEL = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const pickActiveOwner = (ownership) => {
            const entries = Object.entries(ownership || {})
                .filter(([userId, level]) => level === OWNER_LEVEL)
                .filter(([userId]) => {
                    const user = game.users.get(userId);
                    return user?.active && !user.isGM;
                });
            if (!entries.length) return null;
            return entries[0];
        };
        
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            // Must be player character
            if (!actor || actor.type !== 'character') {
                continue;
            }
            
            // Prefer token ownership for unlinked tokens, fallback to actor ownership
            const tokenOwnership = token.document?.ownership || {};
            const actorOwnership = actor.ownership || {};
            let ownerEntry = pickActiveOwner(tokenOwnership);
            if (!ownerEntry) {
                ownerEntry = pickActiveOwner(actorOwnership);
            }
            if (!ownerEntry) continue;
            
            const [userId] = ownerEntry;
            const user = game.users.get(userId);
            if (!user || user.isGM) continue;
            
            addResult(userId, {
                token,
                userId,
                user,
                actor
            });
        }
        
        // Fallback: include active users with assigned characters even if no token is on canvas
        for (const user of game.users) {
            if (!user?.active || user.isGM || resultsByUser.has(user.id)) continue;
            const actor = user.character;
            if (!actor || actor.type !== 'character') continue;
            if (actor.ownership?.[user.id] !== OWNER_LEVEL) continue;

            const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id) || null;
            addResult(user.id, {
                token,
                userId: user.id,
                user,
                actor
            });
        }
        
        return Array.from(resultsByUser.values());
    }

    /**
     * Get party tokens on canvas for follow mode (GM view).
     * @returns {Array} Array of token placeables
     */
    static _getPartyTokensOnCanvas() {
        if (!canvas || !canvas.tokens) return [];
        return canvas.tokens.placeables.filter(token => {
            const actor = token.actor;
            if (!actor || actor.type !== 'character') return false;
            // Follow list includes player-owned characters even if the player is offline
            if (actor.hasPlayerOwner) return true;
            const ownership = token.document?.ownership || actor.ownership || {};
            return Object.entries(ownership).some(([userId, level]) => {
                const user = game.users.get(userId);
                return level === (CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3) && user && !user.isGM;
            });
        });
    }

    /**
     * Register the broadcast secondary bar type
     * @private
     */
    static async _registerBroadcastBarType() {
        await MenuBar.registerSecondaryBarType('broadcast', {
            height: MenuBar.getSecondaryBarHeight('broadcast'),
            persistence: 'manual',
            groupBannerEnabled: true,
            groupBannerColor: 'rgba(62, 92, 13, 0.9)',
            groups: {
                'modes': {
                    mode: 'switch',  // Radio-button behavior: only one mode active at a time
                    order: 0,
                    masterSwitchGroup: 'broadcast-view'
                },
                'mirror': {
                    mode: 'switch',  // Radio-button behavior: only one player selected at a time
                    order: 1,
                    masterSwitchGroup: 'broadcast-view',
                    bannerColor: 'rgba(65, 29, 18, 0.9)'  // Custom banner color for mirror group
                },
                'follow': {
                    mode: 'switch',  // Radio-button behavior: only one token selected at a time
                    order: 2,
                    masterSwitchGroup: 'broadcast-view',
                    bannerColor: 'rgba(36, 60, 110, 0.9)'  // Custom banner color for follow group
                },
                'tools': {
                    mode: 'default',
                    order: 3,
                    bannerColor: 'rgba(40, 40, 40, 0.9)'
                }
            }
        });
    }

    /**
     * Register broadcast tools in the broadcast secondary bar
     * @private
     */
    static _registerBroadcastTools() {
        
        
        
        // Register Manual mode button
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-mode-manual', {
            icon: 'fa-solid fa-hand',
            label: null,
            tooltip: 'Manual - No automatic following (manual camera control)',
            group: 'modes',
            toggleable: false,
            order: 0,
            iconColor: null,
            buttonColor: null,
            borderColor: null,
            visible: true,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Manual mode button clicked", "", true, false);
                // Only GMs can change broadcast mode
                if (!game.user.isGM) {
                    postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                    return;
                }
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Setting broadcast mode to 'manual'", "", true, false);
                await this._setBroadcastMode('manual');
                // Switch mode automatically manages active state - no manual re-rendering needed
            }
        });
        
        
        // Register GM View mode button
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-mode-gmview', {
            icon: 'fa-solid fa-chess-king',
            label: null,
            tooltip: 'GM View - Mirror GM\'s viewport (center and zoom)',
            group: 'modes',
            toggleable: false,
            order: 1,
            iconColor: null,
            buttonColor: null,
            borderColor: null,
            visible: true,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: GM View mode button clicked", "", true, false);
                // Only GMs can change broadcast mode
                if (!game.user.isGM) {
                    postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                    return;
                }
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Setting broadcast mode to 'gmview'", "", true, false);
                await this._setBroadcastMode('gmview');
                // Switch mode automatically manages active state - no manual re-rendering needed
            }
        });


        // Register Combat mode button
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-mode-combat', {
            icon: 'fa-solid fa-swords',
            label: null,
            tooltip: 'Combat - Follow current combatant automatically',
            group: 'modes',
            toggleable: false,
            order: 2,
            iconColor: null,
            buttonColor: null,
            borderColor: null,
            visible: true,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Combat mode button clicked", "", true, false);
                // Only GMs can change broadcast mode
                if (!game.user.isGM) {
                    postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                    return;
                }
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Setting broadcast mode to 'combat'", "", true, false);
                await this._setBroadcastMode('combat');
                // Switch mode automatically manages active state - no manual re-rendering needed
            }
        });

        
        // Register Spectator mode button
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-mode-spectator', {
            icon: 'fa-solid fa-users',
            label: null,
            tooltip: 'Spectator - Follow party tokens automatically',
            group: 'modes',
            toggleable: false,
            order: 3,
            iconColor: null,
            buttonColor: null,
            borderColor: null,
            visible: true,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Spectator mode button clicked", "", true, false);
                // Only GMs can change broadcast mode
                if (!game.user.isGM) {
                    postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                    return;
                }
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Setting broadcast mode to 'spectator'", "", true, false);
                await this._setBroadcastMode('spectator');
                // Switch mode automatically manages active state - no manual re-rendering needed
            }
        });


        // Register Map View button (fit scene to viewport)
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-mode-mapview', {
            icon: 'fa-solid fa-map',
            label: null,
            tooltip: 'Map View - Fit scene to viewport',
            group: 'modes',
            toggleable: false,
            order: 4,
            iconColor: null,
            buttonColor: null,
            borderColor: null,
            visible: true,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Map View button clicked", "", true, false);
                if (!game.user.isGM) {
                    postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can use Map View", "", false, false);
                    return;
                }
                await this._emitMapView();
            }
        });

        // Register broadcast tools (GM-only)
        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-tool-close-images', {
            icon: 'fa-solid fa-image',
            label: null,
            tooltip: 'Close broadcast images on cameraman',
            group: 'tools',
            toggleable: false,
            order: 0,
            visible: () => game.user.isGM,
            onClick: async () => {
                if (!game.user.isGM) return;
                await this._emitBroadcastWindowCommand('close-images');
            }
        });

        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-tool-close-journals', {
            icon: 'fa-solid fa-book',
            label: null,
            tooltip: 'Close broadcast journals on cameraman',
            group: 'tools',
            toggleable: false,
            order: 1,
            visible: () => game.user.isGM,
            onClick: async () => {
                if (!game.user.isGM) return;
                await this._emitBroadcastWindowCommand('close-journals');
            }
        });

        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-tool-close-windows', {
            icon: 'fa-solid fa-rectangle-xmark',
            label: null,
            tooltip: 'Close all windows on cameraman',
            group: 'tools',
            toggleable: false,
            order: 2,
            visible: () => game.user.isGM,
            onClick: async () => {
                if (!game.user.isGM) return;
                await this._emitBroadcastWindowCommand('close-all');
            }
        });

        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-tool-refresh', {
            icon: 'fa-solid fa-rotate-right',
            label: null,
            tooltip: 'Refresh cameraman client',
            group: 'tools',
            toggleable: false,
            order: 3,
            visible: () => game.user.isGM,
            onClick: async () => {
                if (!game.user.isGM) return;
                await this._emitBroadcastWindowCommand('refresh');
            }
        });

        MenuBar.registerSecondaryBarItem('broadcast', 'broadcast-tool-settings', {
            icon: 'fa-solid fa-gear',
            label: null,
            tooltip: 'Open settings on cameraman',
            group: 'tools',
            toggleable: false,
            order: 4,
            visible: () => game.user.isGM,
            onClick: async () => {
                if (!game.user.isGM) return;
                await this._emitBroadcastWindowCommand('settings');
            }
        });

        

        // Register player view buttons (mirror/follow)
        this.registerPlayerPortraitButtons();
        this.registerFollowTokenButtons();
        this._registerPlayerPortraitSyncHooks();
        this._registerBroadcastWindowHooks();

        // Register view mode button in main menubar (right section)
        this._registerBroadcastMenubarButton();

        // Set initial active state based on current broadcastMode setting
        // Switch mode will default to first item if none is set, so we set the correct one
        const currentMode = this._getCachedBroadcastMode();
        const modeItemMap = {
            'spectator': 'broadcast-mode-spectator',
            'combat': 'broadcast-mode-combat',
            'gmview': 'broadcast-mode-gmview',
            'manual': 'broadcast-mode-manual'
        };
        
        // Check if mode is a playerview mode (playerview-{userId})
        if (typeof currentMode === 'string' && currentMode.startsWith('playerview-') && currentMode !== 'playerview-follow') {
            const userId = currentMode.replace('playerview-', '');
            // Activate the selected player's portrait button in mirror group
            const activeItemId = `broadcast-mode-player-${userId}`;
            MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
        } else {
            const activeItemId = modeItemMap[currentMode] || 'broadcast-mode-spectator';
            MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
        }

        // Listen for broadcast mode setting changes to sync button active state and adjust camera
        HookManager.registerHook({
            name: 'settingChange',
            description: 'BroadcastManager: Sync broadcast mode button active state when mode changes',
            context: 'broadcast-mode-buttons',
            priority: 5,
            key: 'broadcastModeButtons',
            callback: async (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'broadcastMode') {
                    this._lastBroadcastMode = value;
                    postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Setting change hook fired for broadcastMode", { 
                        value, 
                        isBroadcastUser: this._isBroadcastUser(),
                        isEnabled: this.isEnabled(),
                        canvasReady: canvas?.ready
                    }, true, false);
                    
                    // Update active state to match the setting (switch mode handles deactivating others)
                    // Check if mode is a playerview mode (playerview-{userId})
                    if (typeof value === 'string' && value.startsWith('playerview-') && value !== 'playerview-follow') {
                        const userId = value.replace('playerview-', '');
                        // Activate the selected player's portrait button in mirror group
                        const activeItemId = `broadcast-mode-player-${userId}`;
                        MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
                        // Clear follow selection for mirror view
                        const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                        if (followTokenId) {
                            MenuBar.updateSecondaryBarItemActive('broadcast', `broadcast-follow-token-${followTokenId}`, false);
                        }
                    } else if (value === 'playerview-follow') {
                        const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                        if (followTokenId) {
                            MenuBar.updateSecondaryBarItemActive('broadcast', `broadcast-follow-token-${followTokenId}`, true);
                        }
                    } else {
                        const modeItemMap = {
                            'spectator': 'broadcast-mode-spectator',
                            'combat': 'broadcast-mode-combat',
                            'gmview': 'broadcast-mode-gmview',
                            'manual': 'broadcast-mode-manual'
                        };
                        const activeItemId = modeItemMap[value] || 'broadcast-mode-spectator';
                        MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
                    }

                    // Re-render menubar to update the right section button title/tooltip
                    // Use immediate=true to ensure it renders right away, not debounced
                    MenuBar.renderMenubar(true);

                    // If GM changes mode, broadcast to other clients immediately
                    if (game.user.isGM && this._shouldEmitModeChange(value)) {
                        await this._emitModeChange(value);
                    }
                    
                    // Immediately adjust viewport when mode changes
                    // Note: For GM/Player view modes, the GM/Player client needs to send sync
                    // For Spectator/Combat modes, only the broadcast user (cameraman) adjusts viewport
                    if (this.isEnabled() && canvas?.ready) {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Conditions met, will adjust viewport", { 
                            value,
                            isBroadcastUser: this._isBroadcastUser(),
                            isGM: game.user.isGM
                        }, true, false);
                        // Use a small delay to ensure mode change is fully processed
                        setTimeout(async () => {
                            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Calling _adjustViewportForMode", { value }, true, false);
                            await this._adjustViewportForMode(value);
                        }, 50);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Conditions NOT met, skipping viewport adjustment", { 
                            isBroadcastUser: this._isBroadcastUser(),
                            isEnabled: this.isEnabled(),
                            canvasReady: canvas?.ready
                        }, true, false);
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK -------------------
            }
        });

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Broadcast tools registered", "", true, false);
    }

    /**
     * Register view mode button in main menubar (right section)
     * Only shows when cameraman is connected and broadcast is active
     * @private
     */
    static _registerBroadcastMenubarButton() {
        // Get mode display names
        const getModeDisplayName = (mode) => {
            if (mode === 'playerview-follow') {
                const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                const tokenName = followTokenId ? canvas.tokens.get(followTokenId)?.name : null;
                return tokenName ? `Follow: ${tokenName}` : 'Follow';
            }
            if (typeof mode === 'string' && mode.startsWith('playerview-')) {
                const userId = mode.replace('playerview-', '');
                const user = game.users.get(userId);
                const name = user?.name || 'Player';
                return `Mirror: ${name}`;
            }
            const modeNames = {
                'manual': 'Manual',
                'gmview': 'GM View',
                'combat': 'Combat',
                'spectator': 'Spectator',
                'playerview': 'Player View'
            };
            return modeNames[mode] || 'Manual';
        };

        // Get mode icon
        const getModeIcon = (mode) => {
            if (typeof mode === 'string' && mode.startsWith('playerview-')) {
                return 'fa-solid fa-helmet-battle';
            }
            const modeIcons = {
                'manual': 'fa-solid fa-hand',
                'gmview': 'fa-solid fa-chess-king',
                'combat': 'fa-solid fa-swords',
                'spectator': 'fa-solid fa-users',
                'playerview': 'fa-solid fa-helmet-battle'
            };
            return modeIcons[mode] || 'fa-solid fa-hand';
        };

        const success = MenuBar.registerMenubarTool('broadcast-view-mode', {
            icon: 'fa-solid fa-video',
            name: 'broadcast-view-mode',
            title: () => {
                if (!this.isEnabled() || !this._getBroadcastUser()) {
                    return 'View Mode';
                }
                const mode = this._getCachedBroadcastMode();
                return getModeDisplayName(mode);
            },
            tooltip: () => {
                if (!this.isEnabled() || !this._getBroadcastUser()) {
                    return 'View Mode (Not Active)';
                }
                const mode = this._getCachedBroadcastMode();
                return `${getModeDisplayName(mode)} - Click to change`;
            },
            zone: 'right',
            group: 'general',
            groupOrder: 999,
            order: 10, // After timer-section
            moduleId: MODULE.ID,
            gmOnly: true,
            leaderOnly: false,
            visible: () => {
                // TODO: Add visibility checks after button is confirmed working
                // Always show for now to debug
                return true;
            },
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null,
            onClick: async () => {
                if (!game.user.isGM) {
                    ui.notifications.warn("Only GMs can change broadcast mode");
                    return;
                }

                if (!this.isEnabled()) {
                    ui.notifications.warn("Broadcast is not enabled");
                    return;
                }

                const currentMode = this._getCachedBroadcastMode();
                
                // Create mode selection dialog
                const modeOptions = [
                    { value: 'manual', label: 'Manual' },
                    { value: 'gmview', label: 'GM View' },
                    { value: 'combat', label: 'Combat' },
                    { value: 'spectator', label: 'Spectator' },
                    { value: 'mapview', label: 'Map View' }
                ];

                const mirrorUsers = this._getPartyTokensWithUsers()
                    .map(entry => entry.user)
                    .filter(Boolean);
                for (const user of mirrorUsers) {
                    modeOptions.push({
                        value: `mirror:${user.id}`,
                        label: `Mirror: ${user.name}`
                    });
                }

                const followTokens = this._getPartyTokensOnCanvas();
                for (const token of followTokens) {
                    const label = token?.actor?.name || token?.name || 'Token';
                    modeOptions.push({
                        value: `follow:${token.id}`,
                        label: `Follow: ${label}`
                    });
                }

                // Determine which option should be selected
                let selectedValue = currentMode;
                if (currentMode === 'playerview-follow') {
                    const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
                    selectedValue = followTokenId ? `follow:${followTokenId}` : 'playerview-follow';
                } else if (currentMode.startsWith('playerview-')) {
                    const userId = currentMode.replace('playerview-', '');
                    selectedValue = `mirror:${userId}`;
                }

                const content = `
                    <form>
                        <div class="form-group">
                            <label>Select Broadcast Mode:</label>
                            <select name="mode" id="broadcast-mode-select">
                                ${modeOptions.map(mode => {
                                    const isSelected = selectedValue === mode.value;
                                    return `<option value="${mode.value}" ${isSelected ? 'selected' : ''}>${mode.label}</option>`;
                                }).join('')}
                            </select>
                        </div>
                    </form>
                `;

                const dialog = new Dialog({
                    title: 'Select Broadcast Mode',
                    content: content,
                    buttons: {
                        set: {
                            icon: '<i class="fas fa-check"></i>',
                            label: "Set Mode",
                            callback: async (html) => {
                                // v13: Detect and convert jQuery to native DOM if needed
                                let nativeDialogHtml = html;
                                if (html && (html.jquery || typeof html.find === 'function')) {
                                    nativeDialogHtml = html[0] || html.get?.(0) || html;
                                }
                        
                                const modeSelect = nativeDialogHtml.querySelector('#broadcast-mode-select');
                                const modeValue = modeSelect ? modeSelect.value : '';
                                
                                    if (modeValue) {
                                        if (modeValue === 'mapview') {
                                            await this._emitMapView();
                                        } else if (modeValue.startsWith('mirror:')) {
                                            const userId = modeValue.replace('mirror:', '');
                                            await this._setBroadcastMode(`playerview-${userId}`);
                                            MenuBar.updateSecondaryBarItemActive('broadcast', `broadcast-mode-player-${userId}`, true);
                                        } else if (modeValue.startsWith('follow:')) {
                                            const tokenId = modeValue.replace('follow:', '');
                                            await game.settings.set(MODULE.ID, 'broadcastFollowTokenId', tokenId);
                                            await this._setBroadcastMode('playerview-follow');
                                            MenuBar.updateSecondaryBarItemActive('broadcast', `broadcast-follow-token-${tokenId}`, true);
                                        } else {
                                            await this._setBroadcastMode(modeValue);
                                            const modeItemMap = {
                                                'spectator': 'broadcast-mode-spectator',
                                                'combat': 'broadcast-mode-combat',
                                                'gmview': 'broadcast-mode-gmview',
                                                'manual': 'broadcast-mode-manual'
                                            };
                                            const activeItemId = modeItemMap[modeValue];
                                            if (activeItemId) {
                                                MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
                                            }
                                        }
                                        
                                        MenuBar.renderMenubar(); // Update button text
                                    }
                            }
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Cancel"
                        }
                    },
                    default: "set"
                });

                dialog.render(true);
            }
        });

        if (success) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: View mode menubar button registered", "", true, false);
            // Force menubar render to show the new button
            MenuBar.renderMenubar();
        } else {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to register view mode menubar button", "", false, false);
        }
    }

    /**
     * Register portrait buttons for all party tokens
     * Called from _registerBroadcastTools when registering broadcast tools
     */
    static registerPlayerPortraitButtons() {
        const partyData = this._getPartyTokensWithUsers();

        // Remove old buttons (any button starting with broadcast-mode-player-)
        const existingItems = MenuBar.secondaryBarItems?.get('broadcast');
        if (existingItems) {
            for (const itemId of existingItems.keys()) {
                if (itemId.startsWith('broadcast-mode-player-')) {
                    MenuBar.unregisterSecondaryBarItem('broadcast', itemId);
                }
            }
        }
        
        // Register buttons for each party token
        let order = 10; // Start after manual (order 3), give some space
        for (const {token, userId, user, actor} of partyData) {
            const itemId = `broadcast-mode-player-${userId}`;
            const modeValue = `playerview-${userId}`;
            
            // Get token portrait image (actor.img is the portrait, not token texture which is the token image)
            const portraitImg = token?.document?.texture?.src || actor?.img || actor?.prototypeToken?.texture?.src || user?.avatar || '';
            
            MenuBar.registerSecondaryBarItem('broadcast', itemId, {
                icon: 'fas fa-user', // Fallback icon if image is not available
                image: portraitImg || null, // Use portrait image if available
                label: null,
                tooltip: `Mirror ${user.name}'s viewport`,
                group: 'mirror',
                toggleable: false,
                order: order++,
                iconColor: null,
                buttonColor: null,
                borderColor: null,
                visible: () => game.user.isGM, // Only GMs can see/use these buttons
                onClick: async () => {
                    // Double-check: Only GMs can change broadcast mode
                    if (!game.user.isGM) {
                        postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                        return;
                    }
                    try {
                        await this._setBroadcastMode(modeValue);
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, "Broadcast: Failed to update mode", error.message, false, false);
                    }
                }
            });
        }

        // Re-sync active state for current playerview mode after rebuild
        const currentMode = this._getCachedBroadcastMode();
        if (typeof currentMode === 'string' && currentMode.startsWith('playerview-') && currentMode !== 'playerview-follow') {
            const userId = currentMode.replace('playerview-', '');
            const activeItemId = `broadcast-mode-player-${userId}`;
            MenuBar.updateSecondaryBarItemActive('broadcast', activeItemId, true);
        }
    }

    /**
     * Register follow-token buttons for player view follow mode.
     */
    static registerFollowTokenButtons() {
        const tokens = this._getPartyTokensOnCanvas();
        
        // Remove old buttons (any button starting with broadcast-follow-token-)
        const existingItems = MenuBar.secondaryBarItems?.get('broadcast');
        if (existingItems) {
            for (const itemId of existingItems.keys()) {
                if (itemId.startsWith('broadcast-follow-token-')) {
                    MenuBar.unregisterSecondaryBarItem('broadcast', itemId);
                }
            }
        }
        
        let order = 10;
        for (const token of tokens) {
            const itemId = `broadcast-follow-token-${token.id}`;
            const actor = token.actor;
            const label = actor?.name || token.name || 'Token';
            const image = actor?.img || token.document?.texture?.src || '';
            
            MenuBar.registerSecondaryBarItem('broadcast', itemId, {
                icon: 'fas fa-location-crosshairs',
                image: image || null,
                label: null,
                tooltip: `Follow ${label}`,
                group: 'follow',
                toggleable: false,
                order: order++,
                iconColor: null,
                buttonColor: null,
                borderColor: null,
                visible: () => game.user.isGM, // Only GMs can see/use these buttons
                onClick: async () => {
                    if (!game.user.isGM) {
                        postConsoleAndNotification(MODULE.NAME, "Broadcast: Only GMs can change broadcast mode", "", false, false);
                        return;
                    }
                    await game.settings.set(MODULE.ID, 'broadcastFollowTokenId', token.id);
                    await this._setBroadcastMode('playerview-follow');
                }
            });
        }

        // Re-sync active state for current follow selection
        const currentMode = this._getCachedBroadcastMode();
        if (currentMode === 'playerview-follow') {
            const followTokenId = getSettingSafely(MODULE.ID, 'broadcastFollowTokenId', '');
            if (followTokenId) {
                MenuBar.updateSecondaryBarItemActive('broadcast', `broadcast-follow-token-${followTokenId}`, true);
            }
        }
    }

    /**
     * Register hooks to keep player portrait buttons in sync.
     */
    static _registerPlayerPortraitSyncHooks() {
        if (!game.user.isGM) return;

        HookManager.registerHook({
            name: 'updateUser',
            description: 'BroadcastManager: Sync player portrait buttons when users connect/disconnect',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-updateUser',
            callback: (user, changes) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                if (!changes || changes.active === undefined) return;
                this._queuePlayerPortraitSync('updateUser');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'userConnected',
            description: 'BroadcastManager: Sync player portrait buttons when user connects',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-userConnected',
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                this._queuePlayerPortraitSync('userConnected');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'userDisconnected',
            description: 'BroadcastManager: Sync player portrait buttons when user disconnects',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-userDisconnected',
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                this._queuePlayerPortraitSync('userDisconnected');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'createToken',
            description: 'BroadcastManager: Sync player portrait buttons when party tokens are created',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-createToken',
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                this._queuePlayerPortraitSync('createToken');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'deleteToken',
            description: 'BroadcastManager: Sync player portrait buttons when party tokens are removed',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-deleteToken',
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                this._queuePlayerPortraitSync('deleteToken');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'canvasReady',
            description: 'BroadcastManager: Sync player portrait buttons when scenes change',
            context: 'broadcast-player-buttons',
            priority: 5,
            key: 'broadcast-player-buttons-canvasReady',
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                if (!this.isEnabled()) return;
                this._queuePlayerPortraitSync('canvasReady');
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Debounced sync for player portrait buttons.
     * @param {string} reason - Reason for sync
     */
    static _queuePlayerPortraitSync(reason) {
        if (!game.user.isGM) return;
        if (!this.isEnabled()) return;
        if (this._playerButtonsDebounce) {
            clearTimeout(this._playerButtonsDebounce);
        }
        this._playerButtonsDebounce = setTimeout(() => {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Syncing player portrait buttons", { reason }, true, false);
            this.registerPlayerPortraitButtons();
            this.registerFollowTokenButtons();
        }, 150);
    }

    /**
     * Pick a default playerview mode based on last selection or first party member.
     * @returns {string|null} playerview-{userId} mode string or null if none available
     */
    static _getDefaultPlayerViewMode() {
        const currentMode = getSettingSafely(MODULE.ID, 'broadcastMode', 'spectator');
        if (typeof currentMode === 'string' && currentMode.startsWith('playerview-') && currentMode !== 'playerview-follow') {
            return currentMode;
        }
        
        const partyData = this._getPartyTokensWithUsers();
        if (!partyData.length) return null;
        
        const firstUserId = partyData[0]?.userId;
        return firstUserId ? `playerview-${firstUserId}` : null;
    }

    /**
     * Emit a broadcast mode change to all clients.
     * @param {string} mode - The new broadcast mode
     */
    static async _emitModeChange(mode) {
        try {
            this._lastModeEmit = { mode, at: Date.now() };
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (!blacksmith?.sockets) return;
            await blacksmith.sockets.waitForReady();
            await blacksmith.sockets.emit('broadcast.modeChanged', { mode });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to emit mode change", error, true, false);
        }
    }

    /**
     * Emit a map view request to all clients.
     */
    static async _emitMapView() {
        try {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (!blacksmith?.sockets) return;
            await blacksmith.sockets.waitForReady();
            await blacksmith.sockets.emit('broadcast.mapView', {});
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to emit map view", error, true, false);
        }
    }

    /**
     * Emit a broadcast window command to the cameraman client.
     * @param {string} action - Command action (close-images, close-journals, close-all, refresh)
     */
    static async _emitBroadcastWindowCommand(action) {
        try {
            if (!this.isEnabled()) return;
            const targetUserId = getSettingSafely(MODULE.ID, 'broadcastUserId', '') || '';
            if (!targetUserId) {
                postConsoleAndNotification(MODULE.NAME, "BroadcastManager: No broadcast user configured for window command", { action }, true, false);
                return;
            }
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Emitting window command", { action, targetUserId }, true, false);
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (!blacksmith?.sockets) return;
            await blacksmith.sockets.waitForReady();
            await blacksmith.sockets.emit('broadcast.windowCommand', { action, targetUserId });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to emit window command", { action, error }, true, false);
        }
    }

    /**
     * Decide whether to emit a mode change (dedupe rapid repeats).
     * @param {string} mode - The mode to emit
     * @returns {boolean} True if we should emit
     */
    static _shouldEmitModeChange(mode) {
        if (!mode) return false;
        const now = Date.now();
        if (this._lastModeEmit.mode === mode && (now - this._lastModeEmit.at) < 500) {
            return false;
        }
        return true;
    }

    /**
     * Set broadcast mode, emit to clients, and adjust local viewport.
     * @param {string} mode - The new broadcast mode
     * @returns {Promise<boolean>} True if set succeeded
     */
    static async _setBroadcastMode(mode) {
        if (!mode) return false;
        try {
            this._lastBroadcastMode = mode;
            await game.settings.set(MODULE.ID, 'broadcastMode', mode);
            if (game.user.isGM && this._shouldEmitModeChange(mode)) {
                await this._emitModeChange(mode);
            }
            if (this.isEnabled() && canvas?.ready) {
                await this._adjustViewportForMode(mode);
            }
            MenuBar.renderMenubar(true);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Failed to set broadcast mode", error, true, false);
            return false;
        }
    }

    /**
     * Get the most recent broadcast mode for UI rendering.
     * @returns {string} Broadcast mode
     */
    static _getCachedBroadcastMode() {
        return this._lastBroadcastMode || getSettingSafely(MODULE.ID, 'broadcastMode', 'manual');
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
                const playerViewportSyncHandler = 'broadcast.playerViewportSync';
                this._socketHandlerNames.add(playerViewportSyncHandler);
                await blacksmith.sockets.register(playerViewportSyncHandler, async (data, userId) => {
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
                    if (typeof value === 'string' && value.startsWith('playerview-') && value !== 'playerview-follow') {
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
        
        if (typeof mode === 'string' && mode.startsWith('playerview-') && mode !== 'playerview-follow') {
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

    // ==================================================================
    // ===== CLEANUP ====================================================
    // ==================================================================

    /**
     * Helper to track setTimeout for cleanup
     * @param {Function} callback - Callback function
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timeout ID
     */
    static _trackedSetTimeout(callback, delay) {
        const timeoutId = setTimeout(() => {
            this._timeoutIds.delete(timeoutId);
            callback();
        }, delay);
        this._timeoutIds.add(timeoutId);
        return timeoutId;
    }

    /**
     * Clean up all resources (hooks, timeouts, socket handlers, Maps)
     */
    static cleanup() {
        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Cleaning up resources", "", true, false);

        // Stop all monitoring
        this._stopGMViewportMonitoring();
        this._stopAllPlayerViewportMonitoring();

        // Clear all timeouts
        for (const timeoutId of this._timeoutIds) {
            clearTimeout(timeoutId);
        }
        this._timeoutIds.clear();

        // Clear player debounce if exists
        if (this._playerButtonsDebounce) {
            clearTimeout(this._playerButtonsDebounce);
            this._playerButtonsDebounce = null;
        }

        // Clear Maps
        this._playerPanHandlers.clear();
        this._playerDebounces.clear();

        // Unregister all HookManager hooks by context
        HookManager.disposeByContext('broadcast-settings');
        HookManager.disposeByContext('broadcast-camera-init');
        HookManager.disposeByContext('broadcast-camera');
        HookManager.disposeByContext('broadcast-gmview-sync');
        HookManager.disposeByContext('broadcast-mode-buttons');
        HookManager.disposeByContext('broadcast-playerview-sync');
        HookManager.disposeByContext('broadcast-player-buttons');

        // Unregister socket handlers
        // Note: Socket handlers are stored in SocketManager._externalEventHandlers which isn't directly accessible
        // via the API. They will be cleaned up when the module unloads, but we track names for potential future cleanup.
        // For now, clearing the tracking set is sufficient - handlers will be garbage collected when module context is destroyed.
        this._socketHandlerNames.clear();

        // Clear hook IDs tracking
        this._hookIds.clear();

        // Reset initialization flag
        this.isInitialized = false;

        postConsoleAndNotification(MODULE.NAME, "BroadcastManager: Cleanup complete", "", true, false);
    }
}
