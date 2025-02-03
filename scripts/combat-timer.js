// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { COFFEEPUB, postConsoleAndNotification, playSound, trimString } from './global.js';
import { CombatStats } from './combat-stats.js';
import { ThirdPartyManager } from './third-party.js';

class CombatTimer {
    static ID = 'combat-timer';
    
    static DEFAULTS = {
        timeLimit: 60,
        enabled: true,
        state: {
            isActive: false,
            isPaused: true,
            remaining: 0,
            showingMessage: false,
            duration: 60
        }
    };

    static initialize() {
        Hooks.once('ready', () => {
            try {
                if (!game.settings.get(MODULE_ID, 'combatTimerEnabled')) {
                    postConsoleAndNotification("Combat Timer is disabled", "", false, true, false);
                    return;
                }

                postConsoleAndNotification("Initializing Combat Timer", "", false, false, false);
                
                // Initialize state
                this.state = foundry.utils.deepClone(this.DEFAULTS.state);
                this.state.remaining = game.settings.get(MODULE_ID, 'combatTimerDuration') ?? 60;
                
                // Hook into combat turns with debounce for performance
                const debouncedUpdate = foundry.utils.debounce(this._onUpdateCombat.bind(this), 100);
                Hooks.on('updateCombat', (combat, changed, options, userId) => {
                    debouncedUpdate(combat, changed, options, userId);
                });
                
                // Add timer to combat tracker
                Hooks.on('renderCombatTracker', this._onRenderCombatTracker.bind(this));

                // Handle planning timer expiration
                Hooks.on('planningTimerExpired', this.handlePlanningTimerExpired.bind(this));

                // Set up auto-open after combat tracker is ready
                Hooks.once('renderCombatTracker', () => {
                    if (game.settings.get(MODULE_ID, 'combatTrackerOpen')) {
                        const combat = game.combat;
                        if (combat?.started && combat.combatants.find(c => c.isOwner)) {
                            postConsoleAndNotification("Auto-opening combat tracker for player in active combat", "", false, true, false);
                            const tabApp = ui["combat"];
                            tabApp.renderPopout(tabApp);
                        }
                    }
                });

            } catch (error) {
                console.error(`Blacksmith | Could not initialize Combat Timer:`, error);
            }
        });

        // Add socket ready check
        Hooks.once('blacksmith.socketReady', () => {
            postConsoleAndNotification("Combat Timer | Socket is ready", "", false, true, false);
        });
    }

    static async syncState() {
        if (game.user.isGM) {
            // postConsoleAndNotification("Combat Timer: GM syncing state to players", "", false, true, false);
            const socket = ThirdPartyManager.getSocket();
            await socket.executeForOthers("syncTimerState", this.state);
            this.updateUI();
        }
    }

    static handlePlanningTimerExpired(data) {
        // Don't handle the expiration if we're manually ending the planning timer
        if (this._endingPlanningTimer) return;

        const autoStart = game.settings.get(MODULE_ID, 'combatTimerAutoStart');
        
        this.resetTimer();
        this.state.isPaused = !autoStart;
        
        if (autoStart) {
            this.resumeTimer();
            const resumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
            if (resumeSound !== 'none') {
                playSound(resumeSound, this.getTimerVolume());
            }
        } else {
            this.pauseTimer();
        }
    }

    static async _onRenderCombatTracker(app, html, data) {
        try {
            if (!game.combat?.started || game.combat.round === 0) return;

            const isEnabled = game.settings.get(MODULE_ID, 'combatTimerEnabled');
            const isGMOnly = game.settings.get(MODULE_ID, 'combatTimerGMOnly');

            if (isGMOnly && !game.user.isGM) return;
            
            const timerHtml = await renderTemplate(
                'modules/coffee-pub-blacksmith/templates/combat-timer.hbs',
                {
                    enabled: isEnabled,
                    isPaused: this.state.isPaused,
                    remaining: this.state.remaining,
                    timeLimit: this.DEFAULTS.timeLimit
                }
            );
            
            const activeCombatant = html.find('.combatant.active');
            if (activeCombatant.length) {
                activeCombatant.after(timerHtml);
            } else {
                html.find('#combat-tracker').append(timerHtml);
            }
            
            if (isEnabled) {
                this.bindTimerEvents(html);
            }

            this.updateUI();
        } catch (error) {
            console.error("Blacksmith | Combat Timer: Error rendering combat tracker:", error);
        }
    }

    static bindTimerEvents(html) {
        // Left click for pause/unpause (GM only)
        html.find('.combat-timer-progress').click((event) => {
            if (!game.user.isGM) return;
            if (event.button === 0) {
                this.state.showingMessage = false;
                $('.combat-timer-text').text('');
                this.state.isPaused ? this.resumeTimer() : this.pauseTimer();
            }
        });

        // Right click for time adjustment (GM only)
        if (game.user.isGM) {
            html.find('.combat-timer-progress').contextmenu((event) => {
                event.preventDefault();
                this.handleRightClick(event);
            });
        } else {
            // Player turn handling
            const progress = html.find('.combat-timer-progress');
            const combat = game.combat;
            const currentToken = combat?.combatant?.token;
            
            if (currentToken?.isOwner) {
                // Active player - Add class to progress bar
                progress.addClass('player-turn');
                
                // Create and add overlay
                const overlay = $(`
                    <div class="combat-timer-end-turn-overlay">
                        <div class="overlay-text">END TURN <i class="fa-solid fa-right"></i></div>
                    </div>
                `);
                
                // Add click handler to overlay
                overlay.click(() => {
                    if (currentToken?.isOwner) {
                        combat?.nextTurn();
                    }
                });
                
                progress.append(overlay);
            } else if (!game.user.isGM) {
                // Non-active player - Add hurry up overlay
                const currentPlayerName = combat?.combatant?.name || 'Unknown';
                
                // Array of hurry up messages
                const hurryMessages = [
                    "If you don't make a move soon, {name}, I'm rolling to adopt your turn as my new pet. I'll call it Procrastination Jr.",
                    "{name}, your character isn't actually frozen in time—just your decision-making skills.",
                    "By the time you pick, {name}, our torches will burn out, and we'll have to roleplay in the dark. No pressure.",
                    "Hurry up, {name}, or I'm rolling a persuasion check to convince the DM to skip you!",
                    "We're waiting, {name}, not writing a novel. Unless you are… in which case, finish Chapter 1 already!",
                    "{name}, we're all aging in real-time here. Even the elf is starting to grow gray hairs.",
                    "If you don't decide soon, {name}, I'm calling a bard to write a song about how long this turn took.",
                    "{name}, at this rate, the dice are going to roll themselves out of sheer boredom.",
                    "C'mon, {name}! Even a gelatinous cube moves faster than this.",
                    "{name}, if this turn were a quest, we'd already have failed the time limit."
                ];
                
                const overlay = $(`
                    <div class="combat-timer-hurry-overlay">
                        <div class="overlay-text"><i class="fa-solid fa-rabbit-running"></i> TELL ${currentPlayerName} TO HURRY UP!</div>
                    </div>
                `);
                
                // Add click handler to overlay
                overlay.click(() => {
                    // Get random message and replace {name} with player name when clicked
                    const randomMessage = hurryMessages[Math.floor(Math.random() * hurryMessages.length)]
                        .replace(/{name}/g, currentPlayerName);
                        
                    ChatMessage.create({
                        content: randomMessage,
                        speaker: ChatMessage.getSpeaker()
                    });

                    // Play hurry up sound if configured
                    const hurryUpSound = game.settings.get(MODULE_ID, 'hurryUpSound');
                    if (hurryUpSound !== 'none') {
                        playSound(hurryUpSound, CombatTimer.getTimerVolume());
                    }
                });
                
                progress.append(overlay);
                progress.addClass('other-player-turn');
            }
        }
    }

    static handleRightClick(event) {
        if (!game.user.isGM) return;
        
        const bar = event.currentTarget;
        const rect = bar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        
        const timeLimit = game.settings.get(MODULE_ID, 'combatTimerDuration') ?? this.DEFAULTS.timeLimit;
        const newTime = Math.round(timeLimit * percentage);
        
        this.setTime(newTime);
    }

    static setTime(newTime) {
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        
        // Send chat message for timer update if GM
        if (game.user.isGM) {
            const minutes = Math.floor(newTime / 60);
            const seconds = newTime % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            this.sendChatMessage({
                isTimerSet: true,
                timeString: timeString
            });
        }
        
        if (!this.state.isPaused) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), 1000);
        }
        
        this.updateUI();
        if (game.user.isGM) {
            this.syncState();

            // Notify all clients using ThirdPartyManager
            const socket = ThirdPartyManager.getSocket();
            if (socket) {
                socket.executeForOthers("combatTimerAdjusted", this.formatTime(newTime));
            }
        }
    }

    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    static async _onUpdateCombat(combat, changed, options, userId) {
        if (!game.user.isGM) return;
        
        postConsoleAndNotification("Combat Timer: Update Combat", { combat, changed }, false, true, false);
        
        // Skip updates if we're in the process of ending the planning timer
        if (this._endingPlanningTimer) {
            postConsoleAndNotification("Combat Timer: Skipping update while ending planning timer", "", false, true, false);
            return;
        }

        // Handle turn changes
        if ("turn" in changed) {
            // Record the end of the previous turn
            const previousTurn = combat.turn - 1;
            const previousCombatant = combat.turns?.[previousTurn];
            if (previousCombatant && previousTurn >= 0) {
                postConsoleAndNotification("Combat Timer: Recording end of previous turn for:", previousCombatant.name, false, true, false);
                CombatStats.recordTurnEnd(previousCombatant);
            }

            // Check if this is turn 0 (planning phase)
            if (combat.turn === 0) {
                postConsoleAndNotification("Combat Timer: Planning phase - forcing pause", "", false, true, false);
                this.resetTimer();
                this.state.isPaused = true;
                this.pauseTimer();
                return;
            }
            
            // For all other turns
            postConsoleAndNotification("Combat Timer: Regular turn change detected", "", false, true, false);
            
            // Check auto-start setting
            const autoStart = game.settings.get(MODULE_ID, 'combatTimerAutoStart');
            postConsoleAndNotification("Combat Timer: Auto-start setting:", autoStart, false, true, false);
            
            // Reset timer first
            this.resetTimer();
            
            // Set initial state based on auto-start setting
            this.state.isPaused = !autoStart;
            
            // Start or pause based on setting
            if (autoStart) {
                postConsoleAndNotification("Combat Timer: Auto-starting timer for new turn", "", false, true, false);
                this.resumeTimer();
                
                // Play start sound if configured
                const startSound = game.settings.get(MODULE_ID, 'combatTimerStartSound');
                if (startSound !== 'none') {
                    playSound(startSound, this.getTimerVolume());
                }
            } else {
                postConsoleAndNotification("Combat Timer: Keeping timer paused for new turn", "", false, true, false);
                this.pauseTimer();
            }
        }

        // Handle round changes first
        if ("round" in changed) {
            // Record the end of the last turn of the previous round
            if (combat.combatant) {
                postConsoleAndNotification("Combat Timer: Recording end of last turn for round change:", combat.combatant.name, false, true, false);
                CombatStats.recordTurnEnd(combat.combatant);
            }

            postConsoleAndNotification("Combat Timer: Round change detected", "", false, true, false);
            // Reset timer and set initial state based on auto-start setting
            const autoStart = game.settings.get(MODULE_ID, 'combatTimerAutoStart');
            
            // Always reset to full time on round change
            this.resetTimer();
            this.state.isPaused = !autoStart;
            
            if (combat.turn === 0) {
                postConsoleAndNotification("Combat Timer: Planning phase - forcing pause", "", false, true, false);
                this.state.isPaused = true;
                this.pauseTimer();
            } else if (autoStart) {
                postConsoleAndNotification("Combat Timer: Auto-starting timer for new round", "", false, true, false);
                this.resumeTimer();
                
                // Play start sound if configured
                const startSound = game.settings.get(MODULE_ID, 'combatTimerStartSound');
                if (startSound !== 'none') {
                    playSound(startSound, this.getTimerVolume());
                }
            } else {
                postConsoleAndNotification("Combat Timer: Keeping timer paused for new round", "", false, true, false);
                this.pauseTimer();
            }
            return;  // Don't process other changes on round change
        }
    }

    static getTimerVolume() {
        return game.settings.get(MODULE_ID, 'timerSoundVolume');
    }

    static startTimer(duration = null) {
        try {
            // If no duration provided, get from settings and update DEFAULTS
            if (duration === null) {
                duration = game.settings.get(MODULE_ID, 'combatTimerDuration') ?? this.DEFAULTS.timeLimit;
                this.DEFAULTS.timeLimit = duration;
            }
            
            this.state.remaining = duration;
            this.state.duration = duration;  // Store duration in state
            
            if (this.timer) clearInterval(this.timer);
            
            // Force UI update before starting interval
            this.updateUI();
            
            // Only start interval if not paused
            if (!this.state.isPaused) {
                this.timer = setInterval(() => this.tick(), 1000);
                
                // Emit state change hook when starting
                Hooks.callAll('combatTimerStateChange', {
                    isPaused: false,
                    isActive: true,
                    remaining: this.state.remaining
                });
            } else {
                // Emit paused state
                Hooks.callAll('combatTimerStateChange', {
                    isPaused: true,
                    isActive: true,
                    remaining: this.state.remaining
                });
            }
        } catch (error) {
            console.error("Blacksmith | Combat Timer: Error in startTimer:", error);
        }
    }

    static pauseTimer() {
        postConsoleAndNotification("Combat Timer | Pausing timer", "", false, true, false);
        this.state.isPaused = true;
        this.state.showingMessage = false;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Record pause for stats
        CombatStats.recordTimerPause();

        // Play pause/resume sound if configured
        const pauseResumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
        if (pauseResumeSound !== 'none') {
            playSound(pauseResumeSound, this.getTimerVolume());
        }

        // Send chat message if GM
        if (game.user.isGM) {
            this.sendChatMessage({
                isTimerPaused: true,
                timeRemaining: this.formatTime(this.state.remaining)
            });
        }

        this.updateUI();
        this.syncState();
        
        // Emit state change hook
        Hooks.callAll('combatTimerStateChange', {
            isPaused: true,
            isActive: true,
            remaining: this.state.remaining
        });
    }

    static resumeTimer() {
        postConsoleAndNotification("Combat Timer | Resuming timer", "", false, true, false);
        
        // If we're in planning phase (turn 0), end the planning timer gracefully
        if (game.combat?.turn === 0 && !this._endingPlanningTimer) {
            postConsoleAndNotification("Combat Timer: Ending planning timer gracefully as combat timer is being resumed", "", false, true, false);
            // Set flag to prevent recursion
            this._endingPlanningTimer = true;
            
            // Get the planning timer instance and ensure it ends properly
            const module = game.modules.get(MODULE_ID);
            if (module?.api?.PlanningTimer) {
                postConsoleAndNotification("Combat Timer: Found Planning Timer, ending it", "", false, true, false);
                const planningTimer = module.api.PlanningTimer;
                
                // Directly clean up the planning timer
                planningTimer.cleanupTimer();
                planningTimer.state.isExpired = true;
                
                // Remove the planning timer from view
                $('.planning-phase').fadeOut(400, function() {
                    $(this).remove();
                });
            } else {
                console.warn("Blacksmith | Combat Timer: Could not find Planning Timer API");
            }
            
            // Resume the combat timer immediately
            this._endingPlanningTimer = false;
        }

        // Update state first
        this.state.isPaused = false;
        this.state.showingMessage = false;
        this.state.isActive = true;  // Add this to ensure timer is marked as active

        // Only GM should handle the interval
        if (game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), 1000);

            // Record the start time for stats
            CombatStats.recordTurnStart(game.combat?.combatant);
            // Record timer resume for stats
            CombatStats.recordTimerUnpause();
            
            // Play pause/resume sound if configured
            const pauseResumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
            if (pauseResumeSound !== 'none') {
                playSound(pauseResumeSound, this.getTimerVolume());
            }

            // Send chat message for resume
            this.sendChatMessage({
                isTimerResumed: true,
                timeRemaining: this.formatTime(this.state.remaining)
            });

            this.syncState();
        }

        this.updateUI();
        
        // Emit state change hook
        Hooks.callAll('combatTimerStateChange', {
            isPaused: false,
            isActive: true,
            remaining: this.state.remaining
        });
    }

    static getFormattedMessage(message) {
        // Get current combatant name
        const combat = game.combat;
        const currentCombatant = combat?.combatant;
        const name = currentCombatant?.name || 'Unknown';
        
        // Replace {name} with actual name
        return message.replace('{name}', name);
    }

    static tick() {
        if (this.state.isPaused) return;
        
        this.state.remaining--;
        
        // Sync state to players on every tick if GM
        if (game.user.isGM) {
            //postConsoleAndNotification("Combat Timer: Ticking, syncing state to players", "", false, true, false);
            this.syncState();
        }
        
        // Update UI after state changes and sync
        this.updateUI();

        // Calculate percentage of time remaining
        const timeLimit = game.settings.get(MODULE_ID, 'combatTimerDuration');
        const percentRemaining = (this.state.remaining / timeLimit) * 100;

        // Check warning threshold
        const warningThreshold = game.settings.get(MODULE_ID, 'combatTimerWarningThreshold');
        if (percentRemaining <= warningThreshold && percentRemaining > warningThreshold - 1) {
            // Play warning sound
            const warningSound = game.settings.get(MODULE_ID, 'combatTimerWarningSound');
            if (warningSound !== 'none') {
                playSound(warningSound, this.getTimerVolume());
            }
            
            // Show warning notification
            if (this.shouldShowNotification()) {
                const message = game.settings.get(MODULE_ID, 'combatTimerWarningMessage');
                const formattedMessage = this.getFormattedMessage(message);
                ui.notifications.warn(formattedMessage);

                // Send warning chat message if GM
                if (game.user.isGM) {
                    this.sendChatMessage({
                        isTimerWarning: true,
                        warningMessage: message
                    });
                }
            }
        }

        // Check critical threshold
        const criticalThreshold = game.settings.get(MODULE_ID, 'combatTimerCriticalThreshold');
        if (percentRemaining <= criticalThreshold && percentRemaining > criticalThreshold - 1) {
            // Play critical warning sound
            const criticalSound = game.settings.get(MODULE_ID, 'combatTimerCriticalSound');
            if (criticalSound !== 'none') {
                playSound(criticalSound, this.getTimerVolume());
            }
            
            // Show critical warning notification
            if (this.shouldShowNotification()) {
                const message = game.settings.get(MODULE_ID, 'combatTimerCriticalMessage');
                const formattedMessage = this.getFormattedMessage(message);
                ui.notifications.warn(formattedMessage);

                // Send critical warning chat message if GM
                if (game.user.isGM) {
                    this.sendChatMessage({
                        isTimerExpiringSoon: true,
                        expiringSoonMessage: message
                    });
                }
            }
        }
        
        if (this.state.remaining <= 0) {
            this.timeExpired();
        }
    }

    static updateUI() {
        try {
            // postConsoleAndNotification("Combat Timer: Updating UI with state", this.state, false, true, false);
            // Update progress bar using state duration
            const percentage = (this.state.remaining / this.state.duration) * 100;
            const bar = $('.combat-timer-bar');
            bar.css('width', `${percentage}%`);
            
            // Update bar color based on percentage
            bar.removeClass('high medium low');
            if (percentage <= 25) {
                bar.addClass('low');
            } else if (percentage <= 50) {
                bar.addClass('medium');
            } else {
                bar.addClass('high');
            }

            // Handle expired state
            if (this.state.remaining <= 0) {
                $('.combat-timer-bar').addClass('expired');
                $('.combat-timer-progress').addClass('expired');
            } else {
                $('.combat-timer-bar, .combat-timer-progress').removeClass('expired');
            }

            // Don't update text if we're showing a message
            if (this.state.showingMessage) {
                // Show expired message if timer is at 0
                if (this.state.remaining <= 0) {
                    const message = game.settings.get(MODULE_ID, 'combatTimerExpiredMessage')
                        .replace('{name}', game.combat?.combatant?.name || '');
                    $('.combat-timer-text').text(message);
                }
                return;
            }
            
            // Update timer text
            const timerText = $('.combat-timer-text');
            // postConsoleAndNotification("Combat Timer: Setting timer text, isPaused:", this.state.isPaused, false, true, false);
            if (this.state.isPaused) {
                timerText.text('COMBAT TIMER PAUSED');
            } else if (this.state.remaining <= 0) {
                const message = game.settings.get(MODULE_ID, 'combatTimerExpiredMessage')
                    .replace('{name}', game.combat?.combatant?.name || '');
                timerText.text(message);
            } else {
                const minutes = Math.floor(this.state.remaining / 60);
                const seconds = this.state.remaining % 60;
                timerText.text(`${minutes}:${seconds.toString().padStart(2, '0')} REMAINING`);
            }

        } catch (error) {
            console.error("Blacksmith | Combat Timer: Error updating UI:", error);
        }
    }

    static updateCombatantDisplay() {
        const combat = game.combat;
        if (!combat) return;

        const currentCombatant = combat.combatant;
        if (!currentCombatant) return;

        // You could add additional visual indicators for the current combatant here
        // For example, highlighting their name in the combat tracker
    }

    static timeExpired() {
        // Record timer expiration for stats
        CombatStats.recordTimerExpired();

        // Clear the timer interval
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Play sound if configured
        const timeUpSound = game.settings.get(MODULE_ID, 'combatTimeisUpSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }

        // Show notification and send chat message if enabled
        if (this.shouldShowNotification() && game.user.isGM) {
            const message = game.settings.get(MODULE_ID, 'combatTimerExpiredMessage');
            ui.notifications.warn(message.replace('{name}', game.combat?.combatant?.name || ''));

            // Send expired chat message
            this.sendChatMessage({
                isTimerExpired: true,
                expiredMessage: message
            });
        }

        // Auto-advance turn if enabled
        if (game.settings.get(MODULE_ID, 'combatTimerEndTurn')) {
            game.combat?.nextTurn();
            if (this.shouldShowNotification()) {
                const message = game.settings.get(MODULE_ID, 'combatTimerAutoAdvanceMessage');
                ui.notifications.info(message.replace('{name}', game.combat?.combatant?.name || ''));
            }
        }

        // Set state to show we're displaying the expired message
        this.state.showingMessage = true;
    }

    static clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.state.remaining = 0;
        this.state.isPaused = false;
        this.updateUI();
    }

    static shouldShowNotification() {
        // Check override list first
        const overrideList = game.settings.get(MODULE_ID, 'timerNotificationOverride');
        if (overrideList.trim()) {
            // Get current combatant name
            const combat = game.combat;
            const currentCombatant = combat?.combatant;
            const name = currentCombatant?.name || '';
            
            // Split override list and trim each name
            const overrideNames = overrideList.split(',').map(n => n.trim());
            
            // If current combatant is in override list, always show notifications
            if (overrideNames.includes(name)) return true;
        }
        
        // If not in override list, use general setting
        return game.settings.get(MODULE_ID, 'timerShowNotifications');
    }

    static resetTimer() {
        // Clear any existing timer
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        
        // Reset flags
        this.state.showingMessage = false;
        
        // Clear visual states
        $('.combat-timer-progress').removeClass('expired');
        
        // Start fresh timer with chat message
        if (game.user.isGM) {
            const duration = Math.floor(game.settings.get(MODULE_ID, 'combatTimerDuration') / 60);
            this.sendChatMessage({
                isTimerStart: true,
                duration: duration
            });
        }
        
        // Start fresh timer
        this.startTimer();
    }

    endTurn() {
        // Record the end time for stats before ending the turn
        CombatStats.recordTurnEnd();

        // End the turn
        game.combat?.nextTurn();
    }

    async nextRound() {
        // Record the end time for stats before advancing the round
        CombatStats.recordTurnEnd();

        // Advance to next round
        await game.combat?.nextRound();
    }

    // Add logState method for debugging
    static logState(context = "") {
        postConsoleAndNotification(`Combat Timer: State [${context}]`, this.state, false, true, false);
    }

    // Function that will be called on non-GM clients
    static receiveTimerSync(state) {
        if (!game?.user) return;
        
        // postConsoleAndNotification("Combat Timer: Received timer sync:", state, false, true, false);
        if (!game.user.isGM) {
            CombatTimer.state = foundry.utils.deepClone(state);
            CombatTimer.updateUI();
        }
    }

    static timerAdjusted(timeString) {
        if (!game.user.isGM) {
            ui.notifications.info(`Combat timer set to ${timeString}`);
        }
    }

    // Helper method for sending chat messages
    static async sendChatMessage(data) {
        // Get the GM user to send messages from
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

        // Get the current combatant name if available
        const name = game.combat?.combatant?.name || 'Unknown';

        // Format duration to include minutes and seconds if it exists
        if (data.duration) {
            const minutes = Math.floor(data.duration);
            const seconds = Math.round((data.duration - minutes) * 60);
            data.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        // Prepare the message data with timer info
        const messageData = {
            isPublic: true,
            isTimer: true,
            timerLabel: 'Combat',
            theme: data.isTimerWarning ? 'orange' : 
                   data.isTimerExpired ? 'red' : 
                   (data.isTimerStart || data.isTimerSet) ? 'blue' : 'default',
            ...data
        };

        // Format any messages that need the combatant name
        if (data.warningMessage) {
            messageData.warningMessage = data.warningMessage.replace('{name}', name);
        }
        if (data.expiredMessage) {
            messageData.expiredMessage = data.expiredMessage.replace('{name}', name);
        }

        const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', messageData);

        await ChatMessage.create({
            content: messageHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            user: gmUser.id,
            speaker: { alias: gmUser.name }
        });
    }
}

export { CombatTimer };