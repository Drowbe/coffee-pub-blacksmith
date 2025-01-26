// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { COFFEEPUB, postConsoleAndNotification, playSound, trimString } from './global.js';
import { CombatStats } from './combat-stats.js';

let socket;

// Set up socketlib
Hooks.once('socketlib.ready', () => {
    console.log("Blacksmith | Setting up Combat Timer socketlib");
    socket = socketlib.registerModule(MODULE_ID);
    socket.register("syncTimerState", CombatTimer.receiveTimerSync);
});

class CombatTimer {
    static ID = 'combat-timer';
    
    static DEFAULTS = {
        timeLimit: 60,
        enabled: true,
        state: {
            isActive: false,
            isPaused: true,
            remaining: 0,
            showingMessage: false
        }
    };

    static initialize() {
        Hooks.once('ready', () => {
            try {
                if (!game.settings.get(MODULE_ID, 'combatTimerEnabled')) {
                    console.log(`Blacksmith | Combat Timer is disabled`);
                    return;
                }

                console.log(`Blacksmith | Initializing Combat Timer`);
                
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

            } catch (error) {
                console.error(`Blacksmith | Could not initialize Combat Timer:`, error);
            }
        });
    }

    // Function that will be called on non-GM clients
    static receiveTimerSync(state) {
        console.log("Blacksmith | Combat Timer: Received timer sync from GM", state);
        if (!game.user.isGM) {
            CombatTimer.state = foundry.utils.deepClone(state);
            CombatTimer.updateUI();
        }
    }

    static async syncState() {
        if (game.user.isGM) {
            console.log("Blacksmith | Combat Timer: GM syncing state to players");
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
        // Left click for pause/unpause
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
        
        if (!this.state.isPaused) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), 1000);
        }
        
        this.updateUI();
        
        const timeString = this.formatTime(newTime);
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'combatTimer',
            action: 'timerAdjusted',
            time: timeString
        });
        
        ui.notifications.info(`Timer set to ${timeString}`);
    }

    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    static async _onUpdateCombat(combat, changed, options, userId) {
        if (!game.user.isGM) return;
        
        console.log("Blacksmith | Combat Timer: Update Combat", { combat, changed }); // Debug log
        
        // Skip updates if we're in the process of ending the planning timer
        if (this._endingPlanningTimer) {
            console.log("Blacksmith | Combat Timer: Skipping update while ending planning timer");
            return;
        }

        // Handle turn changes
        if ("turn" in changed) {
            // Record the end of the previous turn
            const previousTurn = combat.turn - 1;
            const previousCombatant = combat.turns?.[previousTurn];
            if (previousCombatant && previousTurn >= 0) {
                console.log("Blacksmith | Combat Timer: Recording end of previous turn for:", previousCombatant.name);
                CombatStats.recordTurnEnd(previousCombatant);
            }

            // Check if this is turn 0 (planning phase)
            if (combat.turn === 0) {
                console.log("Blacksmith | Combat Timer: Planning phase - forcing pause"); // Debug log
                this.resetTimer();
                this.state.isPaused = true;
                this.pauseTimer();
                return;
            }
            
            // For all other turns
            console.log("Blacksmith | Combat Timer: Regular turn change detected"); // Debug log
            
            // Check auto-start setting
            const autoStart = game.settings.get(MODULE_ID, 'combatTimerAutoStart');
            console.log("Blacksmith | Combat Timer: Auto-start setting:", autoStart); // Debug log
            
            // Reset timer first
            this.resetTimer();
            
            // Set initial state based on auto-start setting
            this.state.isPaused = !autoStart;
            
            // Start or pause based on setting
            if (autoStart) {
                console.log("Blacksmith | Combat Timer: Auto-starting timer for new turn"); // Debug log
                this.resumeTimer();
                
                // Play start sound if configured
                const startSound = game.settings.get(MODULE_ID, 'combatTimerStartSound');
                if (startSound !== 'none') {
                    playSound(startSound, this.getTimerVolume());
                }
            } else {
                console.log("Blacksmith | Combat Timer: Keeping timer paused for new turn"); // Debug log
                this.pauseTimer();
            }
        }

        // Handle round changes first
        if ("round" in changed) {
            // Record the end of the last turn of the previous round
            if (combat.combatant) {
                console.log("Blacksmith | Combat Timer: Recording end of last turn for round change:", combat.combatant.name);
                CombatStats.recordTurnEnd(combat.combatant);
            }

            console.log("Blacksmith | Combat Timer: Round change detected"); // Debug log
            // Reset timer and set initial state based on auto-start setting
            const autoStart = game.settings.get(MODULE_ID, 'combatTimerAutoStart');
            
            // Always reset to full time on round change
            this.resetTimer();
            this.state.isPaused = !autoStart;
            
            if (combat.turn === 0) {
                console.log("Blacksmith | Combat Timer: Planning phase - forcing pause"); // Debug log
                this.state.isPaused = true;
                this.pauseTimer();
            } else if (autoStart) {
                console.log("Blacksmith | Combat Timer: Auto-starting timer for new round"); // Debug log
                this.resumeTimer();
                
                // Play start sound if configured
                const startSound = game.settings.get(MODULE_ID, 'combatTimerStartSound');
                if (startSound !== 'none') {
                    playSound(startSound, this.getTimerVolume());
                }
            } else {
                console.log("Blacksmith | Combat Timer: Keeping timer paused for new round"); // Debug log
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
            console.error("Combat Timer: Error in startTimer:", error);
        }
    }

    static pauseTimer() {
        console.log("Blacksmith | Combat Timer: Pausing timer");
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
        console.log("Blacksmith | Combat Timer: Resuming timer");
        
        // If we're in planning phase (turn 0), end the planning timer gracefully
        if (game.combat?.turn === 0 && !this._endingPlanningTimer) {
            console.log("Blacksmith | Combat Timer: Ending planning timer gracefully as combat timer is being resumed");
            // Set flag to prevent recursion
            this._endingPlanningTimer = true;
            
            // Get the planning timer instance and ensure it ends properly
            const module = game.modules.get(MODULE_ID);
            if (module?.api?.PlanningTimer) {
                console.log("Blacksmith | Combat Timer: Found Planning Timer, ending it");
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
        
        // Clear any existing timer
        if (this.timer) clearInterval(this.timer);
        
        // Only GM sets up the interval
        if (game.user.isGM) {
            this.timer = setInterval(() => this.tick(), 1000);
            // Sync state immediately after state changes
            this.syncState();
        }

        // Record the start time for stats
        CombatStats.recordTurnStart(game.combat?.combatant);
        // Record timer resume for stats
        CombatStats.recordTimerUnpause();

        // Play pause/resume sound if configured
        const pauseResumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
        if (pauseResumeSound !== 'none') {
            playSound(pauseResumeSound, this.getTimerVolume());
        }
        
        // Update UI after all state changes
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
            console.log("Blacksmith | Combat Timer: Ticking, syncing state to players");
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
            }
        }
        
        if (this.state.remaining <= 0) {
            this.timeExpired();
        }
    }

    static updateUI() {
        try {
            console.log("Blacksmith | Combat Timer: Updating UI with state", this.state);
            // Update progress bar
            const timeLimit = game.settings.get(MODULE_ID, 'combatTimerDuration');
            const percentage = (this.state.remaining / timeLimit) * 100;
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
            console.log("Blacksmith | Combat Timer: Setting timer text, isPaused:", this.state.isPaused);
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

        // Show notification if enabled
        if (this.shouldShowNotification()) {
            ui.notifications.warn(
                game.settings.get(MODULE_ID, 'combatTimerExpiredMessage')
                    .replace('{name}', game.combat?.combatant?.name || '')
            );
        }

        // Auto-advance turn if enabled
        if (game.settings.get(MODULE_ID, 'combatTimerEndTurn')) {
            game.combat?.nextTurn();
            if (this.shouldShowNotification()) {
                ui.notifications.info(
                    game.settings.get(MODULE_ID, 'combatTimerAutoAdvanceMessage')
                        .replace('{name}', game.combat?.combatant?.name || '')
                );
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
        console.log(`Blacksmith | Combat Timer: State [${context}]`, {
            state: foundry.utils.deepClone(this.state),
            isGM: game.user.isGM,
            hasTimer: !!this.timer
        });
    }
}

export { CombatTimer };