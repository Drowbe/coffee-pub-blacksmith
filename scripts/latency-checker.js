// ================================================================== 
// ===== LATENCY CHECKER ==============================================
// ================================================================== 

export class LatencyChecker {
    static PING_INTERVAL = 5000; // Check every 5 seconds
    static #latencyData = new Map();
    static #startTimes = new Map();
    static #initialized = false;
    
    static isInitialized() {
        return this.#initialized;
    }

    static async initialize() {
        console.log("BLACKSMITH | Latency: Initializing LatencyChecker");
        
        try {
            // Wait for socket to be ready
            if (!game.socket?.connected) {
                console.error("BLACKSMITH | Latency: Socket not connected!");
                return;
            }

            // Register socket handlers using game.socket.on
            game.socket.on("module.coffee-pub-blacksmith", this.#handleSocketMessage.bind(this));
            console.log("BLACKSMITH | Latency: Socket handlers registered successfully");
            
            // Only start operations after handlers are registered
            this.#initialized = true;
            
            // Hook into the player list rendering
            Hooks.on("renderPlayerList", this.#onRenderPlayerList.bind(this));
            
            // Start periodic checks
            this.startPeriodicCheck();
            
            // Set self latency to 0
            this.#latencyData.set(game.user.id, 0);
            
            // Initial update
            this.#updateLatencyDisplay();
            console.log("BLACKSMITH | Latency: LatencyChecker initialized successfully");
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error initializing LatencyChecker:", error);
        }
    }

    static startPeriodicCheck() {
        if (!this.#initialized) {
            console.warn("BLACKSMITH | Latency: Cannot start periodic checks - LatencyChecker not initialized");
            return;
        }

        console.log("BLACKSMITH | Latency: Starting periodic checks");
        // Initial check
        this.#checkAllUsers();
        
        // Periodic checks
        setInterval(() => {
            if (this.#initialized) {
                console.log("BLACKSMITH | Latency: Running periodic check");
                this.#checkAllUsers();
            }
        }, this.PING_INTERVAL);
    }

    static async #measureLatency(userId) {
        if (!this.#initialized) {
            console.warn("BLACKSMITH | Latency: Cannot measure latency - LatencyChecker not initialized");
            return;
        }

        // If measuring self latency, just set it to 0
        if (userId === game.user.id) {
            this.#latencyData.set(userId, 0);
            this.#updateLatencyDisplay();
            return;
        }

        console.log(`BLACKSMITH | Latency: Measuring latency for user ${userId}`);
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
            console.error("BLACKSMITH | Latency: Error measuring latency:", error);
        }
    }

    static #handleSocketMessage(data) {
        if (!data.type || !data.from || !data.to) return;

        // Only process messages meant for us
        if (data.to !== game.user.id) return;

        if (data.type === "ping") {
            // Respond to ping with a pong
            game.socket.emit("module.coffee-pub-blacksmith", {
                type: "pong",
                from: game.user.id,
                to: data.from,
                time: data.time
            });
        } else if (data.type === "pong") {
            // Calculate latency from pong
            const endTime = performance.now();
            const startTime = data.time;
            
            if (startTime) {
                const roundTrip = endTime - startTime;
                const latency = Math.round(roundTrip / 2); // One-way latency
                console.log(`BLACKSMITH | Latency: Calculated latency for ${data.from}: ${latency}ms`);
                this.#latencyData.set(data.from, latency);
                this.#updateLatencyDisplay();
            }
        }
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

                // Create or get the latency span
                let latencySpan = playerNameSpan.querySelector(".player-latency");
                if (!latencySpan) {
                    latencySpan = document.createElement("span");
                    latencySpan.className = "player-latency";
                    playerNameSpan.appendChild(latencySpan);
                }
                
                if (latency !== undefined) {
                    latencySpan.textContent = ` ${latency}ms`;
                    latencySpan.classList.remove("good", "medium", "poor");
                    latencySpan.classList.add(this.#getLatencyClass(latency));
                    latencySpan.style.display = "inline-block";
                } else {
                    latencySpan.style.display = "none";
                }
            });
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error updating latency display:", error);
        }
    }

    static #getLatencyClass(latency) {
        if (latency < 25) return "good";      // Local connections should be under 25ms
        if (latency < 50) return "medium";    // Adjusted for more realistic local thresholds
        return "poor";
    }

    static #checkAllUsers() {
        try {
            game.users.forEach(user => {
                // Check all active users including self
                if (user.active) {
                    this.#measureLatency(user.id);
                }
            });
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error checking users:", error);
        }
    }

    static #onRenderPlayerList(playerList, html) {
        this.#updateLatencyDisplay();
    }
}

// Initialize when the game is ready
Hooks.once('ready', async () => {
    console.log("BLACKSMITH | Latency: Ready hook fired for LatencyChecker");
    await LatencyChecker.initialize();
}); 