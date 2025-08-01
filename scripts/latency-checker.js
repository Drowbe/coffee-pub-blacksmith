// ================================================================== 
// ===== LATENCY CHECKER ==============================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class LatencyChecker {
    static #latencyData = new Map();
    static #startTimes = new Map();
    static #initialized = false;
    static #checkInterval = null;
    
    static isInitialized() {
        return this.#initialized;
    }

    static async initialize() {
        postConsoleAndNotification("BLACKSMITH | Latency: Initializing LatencyChecker", "", false, true, false);
        
        try {
            // Check if latency is enabled in settings
            if (!game.settings.get(MODULE_ID, 'enableLatency')) {
                postConsoleAndNotification("BLACKSMITH | Latency: Latency display is disabled in settings", "", false, true, false);
                return;
            }

            // Wait for socket to be ready
            if (!game.socket?.connected) {
                postConsoleAndNotification("BLACKSMITH | Latency: Socket not connected!", "", false, false, true);
                return;
            }

            // Register socket handlers using game.socket.on
            game.socket.on("module.coffee-pub-blacksmith", this.#handleSocketMessage.bind(this));
            postConsoleAndNotification("BLACKSMITH | Latency: Socket handlers registered successfully", "", false, true, false);
            
            // Only start operations after handlers are registered
            this.#initialized = true;
            
            // Hook into the player list rendering
            Hooks.on("renderPlayerList", this.#onRenderPlayerList.bind(this));
            
            // Start periodic checks
            this.startPeriodicCheck();
            
            // Set initial latency
            if (this.#isLocalGM()) {
                // If GM is hosting locally, set their latency to 0
                this.#latencyData.set(game.user.id, 0);
            }
            
            // Initial update
            this.#updateLatencyDisplay();
            postConsoleAndNotification("BLACKSMITH | Latency: LatencyChecker initialized successfully", "", false, true, false);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Latency: Error initializing LatencyChecker:", error, false, false, true);
        }
    }

    static startPeriodicCheck() {
        if (!this.#initialized) {
            postConsoleAndNotification("BLACKSMITH | Latency: Cannot start periodic checks - LatencyChecker not initialized", "", false, false, true);
            return;
        }

        // Clear any existing interval
        if (this.#checkInterval) {
            clearInterval(this.#checkInterval);
        }

        // Get interval from settings (convert from seconds to milliseconds)
        const interval = game.settings.get(MODULE_ID, 'latencyCheckInterval') * 1000;

        postConsoleAndNotification(`BLACKSMITH | Latency: Starting periodic checks every ${interval/1000} seconds`, "", false, true, false);
        
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
            
            // Send ping through socket
            game.socket.emit("module.coffee-pub-blacksmith", {
                type: "ping",
                from: game.user.id,
                to: userId,
                time: startTime
            });
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Latency: Error measuring latency:", error, false, false, true);
        }
    }

    static #handleSocketMessage(data) {
        if (!data.type) return;

        if (data.type === "ping" && data.to === game.user.id) {
            // Respond to ping with a pong
            game.socket.emit("module.coffee-pub-blacksmith", {
                type: "pong",
                from: game.user.id,
                to: data.from,
                time: data.time
            });
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
                    this.#broadcastLatencyData();
                } else {
                    // Players update their own latency to GM
                    this.#latencyData.set(data.from, latency);
                }
            }
        } else if (data.type === "latencyUpdate") {
            // Everyone receives and processes the complete latency data from GM
            if (data.latencyData) {
                // Update our local latency data with the complete dataset
                this.#latencyData = new Map(Object.entries(data.latencyData));
                this.#updateLatencyDisplay();
            }
        }
    }

    static #broadcastLatencyData() {
        if (!game.user.isGM) return;
        
        // Convert Map to object for transmission
        const latencyObject = Object.fromEntries(this.#latencyData);
        
        // Broadcast to all clients using a general message
        game.socket.emit("module.coffee-pub-blacksmith", {
            type: "latencyUpdate",
            latencyData: latencyObject
        });
        
        // Update GM's own display
        this.#updateLatencyDisplay();
    }

    static #updateLatencyDisplay() {
        try {
            const playerList = document.getElementById("player-list");
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
                    playerNameSpan.style.paddingRight = "40px";
                }
            });
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Latency: Error updating latency display:", error, false, false, true);
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
            postConsoleAndNotification("BLACKSMITH | Latency: Error checking users:", error, false, false, true);
        }
    }

    static #onRenderPlayerList(playerList, html) {
        this.#updateLatencyDisplay();
    }

    // Helper to determine if GM is hosting locally
    static #isLocalGM() {
        return game.user.isGM && window.location.hostname === 'localhost';
    }
} 