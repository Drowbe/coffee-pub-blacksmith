// ================================================================== 
// ===== LATENCY CHECKER ==============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';

export class LatencyChecker {
    static #latencyData = new Map();
    static #startTimes = new Map();
    static #initialized = false;
    static #checkInterval = null;
    
    static isInitialized() {
        return this.#initialized;
    }

    static async initialize() {
        postConsoleAndNotification(MODULE.NAME, "Latency: Initializing LatencyChecker", "", true, false);
        
        try {
            // Check if latency is enabled in settings
            if (!game.settings.get(MODULE.ID, 'enableLatency')) {
                postConsoleAndNotification(MODULE.NAME, "Latency: Latency display is disabled in settings", "", true, false);
                return;
            }

            // Wait for socket to be ready
            if (!game.socket?.connected) {
                postConsoleAndNotification(MODULE.NAME, "Latency: Socket not connected!", "", false, false);
                return;
            }

            // Socket handlers are now registered in SocketManager
            postConsoleAndNotification(MODULE.NAME, "Latency: Socket handlers registered successfully", "", true, false);
            
            // Only start operations after handlers are registered
            this.#initialized = true;
            
            // Hook into the player list rendering
            const renderPlayerListHookId = HookManager.registerHook({
				name: 'renderPlayerList',
				description: 'Latency Checker: Monitor player list rendering for latency updates',
				context: 'latency-checker-player-list',
				priority: 3,
				callback: this.#onRenderPlayerList.bind(this)
			});
			
			// Register cleanup hook for module unload
			const unloadHookId = HookManager.registerHook({
				name: 'unloadModule',
				description: 'Latency Checker: Cleanup on module unload',
				context: 'latency-checker-cleanup',
				priority: 3,
				callback: (moduleId) => {
					if (moduleId === MODULE.ID) {
						this.cleanupChecker();
						postConsoleAndNotification(MODULE.NAME, "Latency Checker | Cleaned up on module unload", "", true, false);
					}
				}
			});
            
            // Start periodic checks
            this.startPeriodicCheck();
            
            // Set initial latency
            if (this.#isLocalGM()) {
                // If GM is hosting locally, set their latency to 0
                this.#latencyData.set(game.user.id, 0);
            }
            
            // Initial update
            this.#updateLatencyDisplay();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Latency: Error initializing LatencyChecker:", error, false, false);
        }
    }

    static startPeriodicCheck() {
        if (!this.#initialized) {
            postConsoleAndNotification(MODULE.NAME, "Latency: Cannot start periodic checks - LatencyChecker not initialized", "", false, false);
            return;
        }

        // Clear any existing interval
        if (this.#checkInterval) {
            clearInterval(this.#checkInterval);
        }

        // Get interval from settings (convert from seconds to milliseconds)
        const interval = game.settings.get(MODULE.ID, 'latencyCheckInterval') * 1000;

        postConsoleAndNotification(MODULE.NAME, `Latency: Starting periodic checks every ${interval/1000} seconds`, "", false, false);
        
        // Initial update to show "--ms" for all players
        this.#updateLatencyDisplay();
        
        // Wait for the full interval before doing the first check
        setTimeout(() => {
            // Initial check after waiting
            this.#checkAllUsers();
            
            // Periodic checks
            this.#checkInterval = setInterval(() => {
                if (this.#initialized) {
                    this.#checkAllUsers();
                }
            }, interval);
        }, interval);
    }

    static async #measureLatency(userId) {
        if (!this.#initialized) return;

        // Only set 0ms latency for local GM
        if (userId === game.user.id && this.#isLocalGM()) {
            this.#latencyData.set(userId, 0);
            return;
        }

        try {
            const startTime = performance.now();
            this.#startTimes.set(userId, startTime);
            
            // Send ping through SocketManager
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("ping", {
                    type: "ping",  // Add type back to data object
                    from: game.user.id,
                    to: userId,
                    time: startTime
                });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Latency: Error measuring latency:", error, false, false);
        }
    }

    static async _handleSocketMessage(data) {
        
        if (!data.type) {
            return;
        }

        // Check if game.user is available before accessing its properties
        if (!game.user) {
            return;
        }

        if (data.type === "ping" && data.to === game.user.id) {
            // Respond to ping with a pong
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("pong", {
                    type: "pong",  // Add type back to data object
                    from: game.user.id,
                    to: data.from,
                    time: data.time
                });
            } else {
                postConsoleAndNotification(MODULE.NAME, "LatencyChecker._handleSocketMessage: No socket available for pong", "", true, false);
            }
        } else if (data.type === "ping" && data.to !== game.user.id) {
            // Ping not intended for this user, silently ignore (broadcast to all but only target processes)
            return;
        } else if (data.type === "pong" && data.to === game.user.id) {
            // Calculate latency from pong
            const endTime = performance.now();
            const startTime = data.time;
            
            if (startTime) {
                const roundTrip = endTime - startTime;
                const latency = Math.round(roundTrip / 2); // One-way latency
       
                if (game.user.isGM) {
                    // GM updates latency for the responding player
                    this.#latencyData.set(data.from, latency);
                    // Broadcast complete latency data to all clients
                    await this.#broadcastLatencyData();
                } else {
                    // Players update their own latency to GM
                    this.#latencyData.set(data.from, latency);
                }
            } else {
                postConsoleAndNotification(MODULE.NAME, "LatencyChecker._handleSocketMessage: No start time in pong data", data, true, false);
            }
        } else if (data.type === "pong" && data.to !== game.user.id) {
            // Pong not intended for this user, silently ignore (broadcast to all but only target processes)
            return;
        } else if (data.type === "latencyUpdate") {
            // Everyone receives and processes the complete latency data from GM
            if (data.latencyData) {
                // Update our local latency data with the complete dataset
                this.#latencyData = new Map(Object.entries(data.latencyData));
                this.#updateLatencyDisplay();
            } else {
                postConsoleAndNotification(MODULE.NAME, "LatencyChecker._handleSocketMessage: No latencyData in update", data, true, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, "LatencyChecker._handleSocketMessage: Unknown message type", { type: data.type, data }, false, false);
        }       
    }

    static async #broadcastLatencyData() {
        if (!game.user.isGM) return;
        
        // Convert Map to object for transmission
        const latencyObject = Object.fromEntries(this.#latencyData);
        
        // Broadcast to all clients using SocketManager
        const socket = SocketManager.getSocket();
        if (socket) {
            await socket.executeForEveryone("latencyUpdate", {
                type: "latencyUpdate",  // Add type back to data object
                latencyData: latencyObject
            });
        }
        
        // Update GM's own display
        this.#updateLatencyDisplay();
    }

    static #updateLatencyDisplay() {
        try {
            // v13: New structure uses #players-active > ol.players-list
            const playersActive = document.getElementById("players-active");
            if (!playersActive) return;
            
            const playerList = playersActive.querySelector("ol.players-list");
            if (!playerList) return;

            playerList.querySelectorAll("li.player").forEach(li => {
                const userId = li.dataset.userId;
                const latency = this.#latencyData.get(userId);
                
                // Find the player-name span
                const playerNameSpan = li.querySelector(".player-name");
                if (!playerNameSpan) return;

                // Remove any existing latency spans
                playerNameSpan.querySelectorAll(".player-latency").forEach(span => span.remove());

                // Create new latency span
                const latencySpan = document.createElement("span");
                latencySpan.className = "player-latency";
                playerNameSpan.appendChild(latencySpan);
                
                if (latency !== undefined) {
                    latencySpan.textContent = `${latency} ms`;
                    latencySpan.classList.remove("good", "medium", "poor");
                    latencySpan.classList.add(this.#getLatencyClass(latency));
                    latencySpan.style.display = "inline";
                    playerNameSpan.style.paddingRight = "40px";
                } else {
                    // Show "--ms" for players we haven't measured yet
                    latencySpan.textContent = "-- ms";
                    latencySpan.classList.remove("good", "medium", "poor");
                    latencySpan.style.display = "inline";
                    playerNameSpan.style.paddingRight = "30px";
                }
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Latency: Error updating latency display:", error, false, false);
        }
    }

    static #getLatencyClass(latency) {
        if (latency < 100) return "good";      // Local connections should be under 25ms
        if (latency < 250) return "medium";    // Adjusted for more realistic local thresholds
        return "poor";
    }

    static #checkAllUsers() {
        try {
            if (game.user.isGM) {
                // GM measures latency for all active players
                game.users.forEach(user => {
                    if (user.active && user.id !== game.user.id) {
                        this.#measureLatency(user.id);
                    }
                });

                // Only set GM latency to 0 if hosting locally
                if (this.#isLocalGM()) {
                    this.#latencyData.set(game.user.id, 0);
                }

                // Always broadcast complete data after checking users
                this.#broadcastLatencyData();
            } else {
                // Players only measure latency to GM
                const gmUser = game.users.find(u => u.isGM && u.active);
                if (gmUser) {
                    this.#measureLatency(gmUser.id);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Latency: Error checking users:", error, false, false);
        }
    }

    static #onRenderPlayerList(playerList, html) {
        this.#updateLatencyDisplay();
    }

    // Helper to determine if GM is hosting locally
    static #isLocalGM() {
        return game.user.isGM && window.location.hostname === 'localhost';
    }
    
    /**
     * Clean up latency checker interval
     */
    static cleanupChecker() {
        if (this.#checkInterval) {
            clearInterval(this.#checkInterval);
            this.#checkInterval = null;
        }
        this.#initialized = false;
    }
} 
