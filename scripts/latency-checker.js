// ================================================================== 
// ===== LATENCY CHECKER ==============================================
// ================================================================== 

export class LatencyChecker {
    static PING_INTERVAL = 5000; // Check every 5 seconds
    static #latencyData = new Map();
    static #startTimes = new Map();
    static #pingIds = new Map();
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
            game.socket.on("module.coffee-pub-blacksmith", this.#handlePong.bind(this));
            console.log("BLACKSMITH | Latency: Socket handlers registered successfully");
            
            // Only start operations after handlers are registered
            this.#initialized = true;
            
            // Hook into the player list rendering
            Hooks.on("renderPlayerList", this.#onRenderPlayerList.bind(this));
            
            // Start periodic checks
            this.startPeriodicCheck();
            
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

        console.log(`BLACKSMITH | Latency: Measuring latency for user ${userId}`);
        try {
            const startTime = performance.now();
            
            // Send ping through socket
            game.socket.emit("module.coffee-pub-blacksmith", {
                userId: game.user.id,
                average: 0 // Will be calculated when pong is received
            });
            
            this.#startTimes.set(userId, startTime);
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error measuring latency:", error);
        }
    }

    static #handlePong(data) {
        console.log(`BLACKSMITH | Latency: Received pong from ${data.userId}`);
        try {
            const endTime = performance.now();
            const startTime = this.#startTimes.get(data.userId);
            
            if (startTime) {
                const latency = Math.round((endTime - startTime) / 2); // Round trip time divided by 2
                console.log(`BLACKSMITH | Latency: Calculated latency for ${data.userId}: ${latency}ms`);
                this.#latencyData.set(data.userId, latency);
                this.#updateLatencyDisplay();
                this.#startTimes.delete(data.userId);
            }
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error handling pong:", error);
        }
    }

    static #updateLatencyDisplay() {
        console.log("BLACKSMITH | Latency: Updating latency display");
        try {
            const playerList = document.getElementById("player-list");
            if (!playerList) {
                console.log("BLACKSMITH | Latency: Player list not found");
                return;
            }

            console.log("BLACKSMITH | Latency: Current latency data:", Object.fromEntries(this.#latencyData));

            playerList.querySelectorAll("li.player").forEach(li => {
                const userId = li.dataset.userId;
                const latency = this.#latencyData.get(userId);
                console.log(`BLACKSMITH | Latency: Processing user ${userId} with latency ${latency}`);
                
                // Find the player-name span
                const playerNameSpan = li.querySelector(".player-name");
                if (!playerNameSpan) {
                    console.log(`BLACKSMITH | Latency: Player name span not found for ${userId}`);
                    return;
                }

                // Create or get the latency span
                let latencySpan = playerNameSpan.querySelector(".player-latency");
                if (!latencySpan) {
                    console.log(`BLACKSMITH | Latency: Creating latency span for ${userId}`);
                    latencySpan = document.createElement("span");
                    latencySpan.className = "player-latency";
                    // Insert after any text content
                    playerNameSpan.appendChild(latencySpan);
                }
                
                if (latency !== undefined && userId !== game.user.id) {
                    console.log(`BLACKSMITH | Latency: Setting latency display for ${userId} to ${latency}ms`);
                    latencySpan.textContent = ` ${latency}ms`;
                    latencySpan.classList.remove("good", "medium", "poor");
                    latencySpan.classList.add(this.#getLatencyClass(latency));
                    latencySpan.style.display = "inline-block";
                } else {
                    console.log(`BLACKSMITH | Latency: Hiding latency display for ${userId}`);
                    latencySpan.style.display = "none";
                }
            });
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error updating latency display:", error);
        }
    }

    static #getLatencyClass(latency) {
        if (latency < 100) return "good";
        if (latency < 200) return "medium";
        return "poor";
    }

    static #checkAllUsers() {
        console.log("BLACKSMITH | Latency: Checking all users");
        try {
            game.users.forEach(user => {
                // Only check active users except self
                if (user.active && user.id !== game.user.id) {
                    console.log(`BLACKSMITH | Latency: Checking user ${user.id} (active: ${user.active})`);
                    this.#measureLatency(user.id);
                }
            });
        } catch (error) {
            console.error("BLACKSMITH | Latency: Error checking users:", error);
        }
    }

    static #onRenderPlayerList(playerList, html) {
        console.log("BLACKSMITH | Latency: Player list rendered, updating display");
        this.#updateLatencyDisplay();
    }
}

// Initialize when the game is ready
Hooks.once('ready', async () => {
    console.log("BLACKSMITH | Latency: Ready hook fired for LatencyChecker");
    await LatencyChecker.initialize();
}); 