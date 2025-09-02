// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-common.js';
import { CombatTimer } from './timer-combat.js';
import { PlanningTimer } from './timer-planning.js';
import { ChatPanel } from './chat-panel.js';
import { VoteManager } from './vote-manager.js';
import { CSSEditor } from './window-gmtools.js';
import { LatencyChecker } from './latency-checker.js';

// ================================================================== 
// ===== SOCKET MANAGER =============================================
// ================================================================== 

class SocketManager {
    static socket = null;
    static isInitialized = false;
    static isSocketReady = false;
    static _fallbackTimer = null;
    static _usingSocketLib = false; // Track which socket system we're using

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, "SocketManager: Initializing socket system", "", true, false);
        
        // Prevent double initialization
        if (this.isInitialized) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Already initialized, skipping", "", true, false);
            return;
        }
        
        // Diagnostic: Check what modules are available
        const allModules = Array.from(game.modules.entries());
        const socketlibEntry = allModules.find(([id, module]) => id === 'socketlib');
        postConsoleAndNotification(MODULE.NAME, `SocketManager: Diagnostic - Found ${allModules.length} modules, SocketLib entry:`, {
            found: !!socketlibEntry,
            id: socketlibEntry?.[0],
            module: socketlibEntry?.[1] ? {
                id: socketlibEntry[1].id,
                active: socketlibEntry[1].active,
                hasApi: !!socketlibEntry[1].api,
                apiType: typeof socketlibEntry[1].api
            } : null
        }, true, false);
        
        // Try to initialize immediately if SocketLib is ready
        if (this._tryInitializeImmediately()) {
            return;
        }
        
        // Wait for SocketLib to be ready
        postConsoleAndNotification(MODULE.NAME, "SocketManager: Waiting for SocketLib to be ready", "", true, false);
        Hooks.once('socketlib.ready', () => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: SocketLib ready hook fired, initializing", "", true, false);
            this._initializeSocket();
        });
        
        // Fallback: Check periodically for SocketLib availability
        // This handles the case where SocketLib loads after our module
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds (20 * 500ms)
        this._fallbackTimer = setInterval(() => {
            attempts++;
            postConsoleAndNotification(MODULE.NAME, `SocketManager: Fallback check attempt ${attempts}/${maxAttempts}`, "", true, false);
            
            // Check if SocketLib API is now available
            const sl = this._getSocketLib();
            if (sl) {
                postConsoleAndNotification(MODULE.NAME, `SocketManager: SocketLib API became available during fallback check ${attempts}`, "", true, false);
                this._stopFallbackTimer();
                this._initializeSocket();
                return;
            }
            
            if (attempts >= maxAttempts) {
                this._stopFallbackTimer();
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Failed to initialize after fallback attempts, triggering native fallback", "", true, false);
                // Force the native fallback when SocketLib completely fails
                this._initializeNativeSockets();
            }
        }, 500);
    }

    /**
     * Get SocketLib API with fallback to global
     * @returns {object|null} SocketLib API or null if not available
     */
    static _getSocketLib() {
        // Prefer global if available (many modules expose SocketLib globally)
        if (globalThis.socketlib?.registerModule) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Found SocketLib in global scope", "", true, false);
            return globalThis.socketlib;
        }
        // Fallback to module API
        const mod = game.modules.get('socketlib');
        if (mod?.api) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Found SocketLib in module API", "", true, false);
            return mod.api;
        }
        return null;
    }

    static _tryInitializeImmediately() {
        try {
            const sl = this._getSocketLib();
            if (sl) {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: SocketLib already ready, initializing immediately", "", true, false);
                this._initializeSocket();
                return true;
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Error checking SocketLib availability", error, true, false);
        }
        return false;
    }

    static _initializeSocket() {
        // Idempotency guard
        if (this.isInitialized) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Already initialized, skipping SocketLib init", "", true, false);
            return;
        }
        
        try {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: _initializeSocket: Starting socket initialization", "", true, false);
            
            const sl = this._getSocketLib();
            if (!sl) {
                throw new Error('SocketLib API not available');
            }
            
            postConsoleAndNotification(MODULE.NAME, "SocketManager: _initializeSocket: Got socketlib API", { 
                apiType: typeof sl, 
                hasRegisterModule: !!sl.registerModule,
                source: globalThis.socketlib ? 'global' : 'module'
            }, true, false);
            
            this.socket = sl.registerModule(MODULE.ID);
            postConsoleAndNotification(MODULE.NAME, "SocketManager: _initializeSocket: Module registered successfully", { socketType: typeof this.socket }, true, false);
            
            this.registerSocketFunctions();
            
            this.isInitialized = true;
            this.isSocketReady = true;
            this._usingSocketLib = true; // Track that we're using SocketLib
            
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Socket initialized successfully", "", true, false);
            
            // CRITICAL: Stop fallback timer when SocketLib succeeds
            this._stopFallbackTimer();
            
            // Emit our own ready event for other modules to use
            Hooks.callAll('blacksmith.socketReady');
            postConsoleAndNotification(MODULE.NAME, "SocketManager: blacksmith.socketReady hook called", "", true, false);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: SocketLib failed, falling back to native Foundry sockets", error, true, false);
            this._initializeNativeSockets();
        }
    }

    static _initializeNativeSockets() {
        try {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Initializing native Foundry socket fallback", "", true, false);
            
            // Create a mock socket object that mimics SocketLib's interface
            this.socket = {
                register: (name, func) => {
                    postConsoleAndNotification(MODULE.NAME, `SocketManager: Native fallback - registered ${name}`, "", true, false);
                    // Store the function for later use
                    if (!this._nativeHandlers) this._nativeHandlers = new Map();
                    this._nativeHandlers.set(name, func);
                },
                executeForOthers: (handler, ...args) => {
                    const func = this._nativeHandlers.get(handler);
                    if (func) {
                        // Execute locally for now (this is a fallback)
                        postConsoleAndNotification(MODULE.NAME, `SocketManager: Native fallback - executing ${handler} locally`, "", true, false);
                        return func(...args);
                    }
                }
            };
            
            this.registerSocketFunctions();
            
            this.isInitialized = true;
            this.isSocketReady = true;
            this._usingSocketLib = false; // Track that we're using native fallback
            
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Native socket fallback initialized successfully", "", true, false);
            
            // Stop the fallback timer since we're now ready
            this._stopFallbackTimer();
            
            // Emit our own ready event for other modules to use
            Hooks.callAll('blacksmith.socketReady');
            postConsoleAndNotification(MODULE.NAME, "SocketManager: blacksmith.socketReady hook called", "", true, false);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Native socket fallback also failed", error, true, false);
            this.isSocketReady = false;
        }
    }

    static _stopFallbackTimer() {
        // This will be called when socket becomes ready to stop the fallback timer
        if (this._fallbackTimer) {
            clearInterval(this._fallbackTimer);
            this._fallbackTimer = null;
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Fallback timer stopped - socket is ready", "", true, false);
        }
    }

    static registerSocketFunctions() {
        postConsoleAndNotification(MODULE.NAME, "SocketManager: Registering socket functions", "", true, false);
        
        // Combat Timer
        this.socket.register("syncTimerState", CombatTimer.receiveTimerSync);
        this.socket.register("combatTimerAdjusted", CombatTimer.timerAdjusted);
        
        // Planning Timer
        this.socket.register("syncPlanningTimerState", PlanningTimer.receiveTimerSync);
        this.socket.register("planningTimerAdjusted", PlanningTimer.timerAdjusted);
        this.socket.register("timerCleanup", PlanningTimer.timerCleanup);
        
        // Chat Panel
        this.socket.register("updateLeader", ChatPanel.receiveLeaderUpdate);
        this.socket.register("updateTimer", ChatPanel.receiveTimerUpdate);

        // Vote Manager
        this.socket.register("receiveVoteStart", VoteManager.receiveVoteStart.bind(VoteManager));
        this.socket.register("receiveVoteUpdate", VoteManager.receiveVoteUpdate.bind(VoteManager));
        this.socket.register("receiveVoteClose", VoteManager.receiveVoteClose.bind(VoteManager));

        // Token Movement
        this.socket.register("movementChange", (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received movement change", data, false, false);
            if (data.type === 'movementChange' && !game.user.isGM) {
                ui.notifications.info(`Movement type changed to: ${data.name}`);
                
                // Force refresh of the chat panel for consistent update
                ui.chat.render();
                
                // Also try immediate update if elements exist
                setTimeout(() => {
                    const movementIcon = document.querySelector('.movement-icon');
                    const movementLabel = document.querySelector('.movement-label');
                    
                    const movementTypes = {
                        'normal-movement': { icon: 'fa-person-running', name: 'Free' },
                        'no-movement': { icon: 'fa-person-circle-xmark', name: 'Locked' },
                        'combat-movement': { icon: 'fa-swords', name: 'Combat' },
                        'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
                        'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
                    };
                    
                    const newType = movementTypes[data.movementId];
                    if (newType) {
                        if (movementIcon) {
                            movementIcon.className = `fas ${newType.icon} movement-icon`;
                        }
                        if (movementLabel) {
                            movementLabel.textContent = newType.name;
                        }
                    }
                }, 100);
            }
        });

        // Skill Roll Handler (moved from blacksmith.js)
        this.socket.register('updateSkillRoll', (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received updateSkillRoll", data, false, false);
            if (game.user.isGM) {
                // Import and call the handler from blacksmith.js
                import('./blacksmith.js').then(({ handleSkillRollUpdate }) => {
                    handleSkillRollUpdate(data);
                }).catch(error => {
                    postConsoleAndNotification(MODULE.NAME, "SocketManager: Error importing handleSkillRollUpdate", error, true, false);
                });
            }
        });

        // Cinematic Overlay Handlers (moved from blacksmith.js and roll system)
        this.socket.register('showCinematicOverlay', (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received showCinematicOverlay", data, false, false);
            // Import and call the skill check dialog method
            import('./window-skillcheck.js').then(({ SkillCheckDialog }) => {
                SkillCheckDialog._showCinematicDisplay(data.messageData, data.messageId);
            }).catch(error => {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Error importing SkillCheckDialog for showCinematicOverlay", error, true, false);
            });
        });

        this.socket.register('closeCinematicOverlay', (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received closeCinematicOverlay", data, false, false);
            // Import and call the skill check dialog method
            import('./window-skillcheck.js').then(({ SkillCheckDialog }) => {
                SkillCheckDialog._hideCinematicDisplay();
            }).catch(error => {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Error importing SkillCheckDialog for closeCinematicOverlay", error, true, false);
            });
        });

        this.socket.register('skillRollFinalized', (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received skillRollFinalized", data, false, false);
            const { messageId, flags, rollData } = data;
            // Check if cinematic display is active for this message
            // Cinema overlay updates are now handled by the new system in deliverRollResults()
        });

        // CSS Update Handler (moved from blacksmith.js)
        this.socket.register('updateCSS', (data) => {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Received CSS update", data, false, false);
            const editor = new CSSEditor();
            editor.applyCSS(data.css, data.transition);
        });

        // Latency Checker Handlers (consolidated from latency-checker.js)
        this.socket.register('ping', (data) => {
            // Handle ping for latency checker
            // Call the latency checker's internal handler with proper context
            try {
                const result = LatencyChecker._handleSocketMessage.call(LatencyChecker, data);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Error calling LatencyChecker._handleSocketMessage for ping", error, true, false);
            }
        });

        this.socket.register('pong', (data) => {
            // Handle pong for latency checker
            // Call the latency checker's internal handler with proper context
            try {
                const result = LatencyChecker._handleSocketMessage.call(LatencyChecker, data);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Error calling LatencyChecker._handleSocketMessage for pong", error, true, false);
            }
        });

        this.socket.register('latencyUpdate', (data) => {
            // Handle latency update for latency checker
            // Call the latency checker's internal handler with proper context
            try {
                const result = LatencyChecker._handleSocketMessage.call(LatencyChecker, data);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "SocketManager: Error calling LatencyChecker._handleSocketMessage for latencyUpdate", error, true, false);
            }
        });

        postConsoleAndNotification(MODULE.NAME, "SocketManager: All socket functions registered", "", true, false);
    }

    static getSocket() {
        if (!this.isSocketReady) {
            postConsoleAndNotification(MODULE.NAME, "SocketManager: Error: Socket not ready", "", true, false);
            return null;
        }
        return this.socket;
    }

    static async waitForReady() {
        if (this.isSocketReady) return true;
        
        return new Promise((resolve) => {
            Hooks.once('blacksmith.socketReady', () => {
                resolve(true);
            });
        });
    }

    /**
     * Check if we're using SocketLib or native fallback
     * @returns {boolean} true if using SocketLib, false if using native fallback
     */
    static isUsingSocketLib() {
        return this._usingSocketLib;
    }
}

// Initialize on Foundry load
Hooks.once('init', () => {
    SocketManager.initialize();
});

export { SocketManager }; 