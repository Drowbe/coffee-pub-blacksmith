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
    console.log("Blacksmith | Setting up Planning Timer socketlib");
    socket = socketlib.registerModule(MODULE_ID);
    socket.register("syncPlanningTimerState", PlanningTimer.receiveTimerSync);
    socket.register("timerAdjusted", PlanningTimer.timerAdjusted);
    socket.register("timerCleanup", PlanningTimer.timerCleanup);
});

export class PlanningTimer {
    static DEFAULTS = {
        timeLimit: 60,
        enabled: true,
        state: {
            isActive: false,
            isPaused: true,
            remaining: 0,
            showingMessage: false,
            isExpired: false,
            timeLimit: 60
        }
    };

    static initialize() {
        console.log(`${MODULE_TITLE} | Planning Timer | Initializing`);
        
        // Initialize state
        this.state = foundry.utils.deepClone(this.DEFAULTS.state);
        this.timer = null;
        this.isInitialized = false;

        // Register hooks
        Hooks.on('renderCombatTracker', this._onRenderCombatTracker.bind(this));

        // Wait for game to be ready before checking initial state
        Hooks.once('ready', () => {
            this.isInitialized = true;
            
            // Check if we're loading into an active combat with planning phase
            if (game.combat?.started && game.combat.turn === 0) {
                console.log(`${MODULE_TITLE} | Planning Timer | Initial load during planning phase`);
                const duration = game.settings.get(MODULE_ID, 'planningTimerDuration');
                this.startTimer(duration, true);
                ui.combat.render(true);
            }
        });

        // Handle combat updates
        Hooks.on('updateCombat', this.handleCombatUpdate.bind(this));
    }

    // Function that will be called on non-GM clients
    static receiveTimerSync(state) {
        console.log(`${MODULE_TITLE} | Planning Timer: Received timer sync from GM`, state);
        if (!game.user.isGM) {
            // If we're showing an expired message, don't override showingMessage and isExpired
            if (PlanningTimer.state.showingMessage && PlanningTimer.state.isExpired) {
                const newState = foundry.utils.deepClone(state);
                newState.showingMessage = true;
                newState.isExpired = true;
                PlanningTimer.state = newState;
            } else {
                PlanningTimer.state = foundry.utils.deepClone(state);
            }
            PlanningTimer.updateUI();
        }
    }

    static handleSocketMessage(data) {
        if (!game.user.isGM) {
            switch (data.action) {
                case 'timerAdjusted':
                    ui.notifications.info(`Planning timer set to ${data.time}`);
                    break;
                case 'cleanup':
                    this.state.isExpired = data.wasExpired;
                    this.cleanupTimer();
                    break;
            }
        }
    }

    static handleCombatUpdate(combat, changed, options, userId) {
        // Only GM handles timer state changes
        if (!game.user.isGM) return;

        // Safely check if planning timer is enabled
        try {
            if (!game.settings.get(MODULE_ID, 'planningTimerEnabled')) return;
        } catch (error) {
            console.debug(`${MODULE_TITLE} | Planning Timer | Settings not yet registered`);
            return;
        }

        // Handle combat start/stop
        if ("started" in changed) {
            if (changed.started && combat.turn === 0) {
                this.handleCombatStart(combat);
            } else if (!changed.started) {
                this.cleanupTimer();
            }
            return;
        }
        
        // Handle round changes
        if ("round" in changed && combat.turn === 0) {
            this.handleNewRound(combat);
            return;
        }

        // Handle turn changes
        if ("turn" in changed) {
            this.handleTurnChange(combat);
        }
    }

    static handleCombatStart(combat) {
        if (!this.isInitialized) {
            console.log(`${MODULE_TITLE} | Planning Timer | Waiting for initialization...`);
                return;
            }
            
        this.state.isExpired = false;
        this.cleanupTimer();

        const duration = game.settings.get(MODULE_ID, 'planningTimerDuration');
        this.startTimer(duration, true);

        requestAnimationFrame(() => ui.combat.render(true));
    }

    static handleNewRound(combat) {
        this.state.isExpired = false;
        this.cleanupTimer();

        // Ensure combat timer is cleaned up
        Hooks.callAll('combatTimerCleanup');

        const duration = game.settings.get(MODULE_ID, 'planningTimerDuration');
        this.startTimer(duration, true);

        setTimeout(() => ui.combat.render(true), 100);
    }

    static handleTurnChange(combat) {
        if (combat.turn === 0) {
            this.state.isExpired = false;
            this.cleanupTimer();
            Hooks.callAll('combatTimerCleanup');

            const duration = game.settings.get(MODULE_ID, 'planningTimerDuration');
            this.startTimer(duration, true);

            setTimeout(() => ui.combat.render(true), 100);
        } else if (combat.turn > 0) {
            this.cleanupTimer();
        }
    }

    static async _onRenderCombatTracker(app, html, data) {
        // Verify settings and combat state
        if (!this.verifyTimerConditions()) return;

        // Get label from settings
        const label = game.settings.get(MODULE_ID, 'planningTimerLabel');
        
        const timerHtml = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/planning-timer.hbs',
            {
                label,
                isPaused: this.state.isPaused,
                remaining: this.state.remaining,
                timeLimit: this.DEFAULTS.timeLimit,
                isExpired: this.state.isExpired
            }
        );
        
        // Remove any existing planning timers
        html.find('.planning-phase').remove();
        
        // Insert before first combatant
        const firstCombatant = html.find('.combatant').first();
        firstCombatant.before(timerHtml);
        
        // Bind click handlers
        if (game.user.isGM) {
            html.find('.planning-timer-progress').click(this._onTimerClick.bind(this));
            html.find('.planning-timer-progress').contextmenu(this._onTimerRightClick.bind(this));
        }
        
        this.updateUI();
    }

    static _onTimerClick(event) {
        event.preventDefault();
        if (!game.user.isGM) return;

        if (this.state.isPaused) {
            this.resumeTimer();
        } else {
            this.pauseTimer();
        }
    }

    static _onTimerRightClick(event) {
        event.preventDefault();
        if (!game.user.isGM) return;

        const bar = event.currentTarget;
        const rect = bar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        
        const timeLimit = game.settings.get(MODULE_ID, 'planningTimerDuration');
        const newTime = Math.round(timeLimit * percentage);
        
        this.setTime(newTime);
    }

    static pauseTimer() {
        console.log(`${MODULE_TITLE} | Planning Timer | Pausing timer`);
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
    }

    static resumeTimer() {
        console.log(`${MODULE_TITLE} | Planning Timer | Resuming timer`);
        this.state.isPaused = false;
        this.state.showingMessage = false;

        // Only GM should handle the interval
        if (game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (this.state.isPaused) return;
                
                this.state.remaining--;
                this.syncState();

                // Calculate percentage of time remaining
                const percentRemaining = (this.state.remaining / this.state.timeLimit) * 100;

                // Check ending soon threshold
                const endingSoonThreshold = game.settings.get(MODULE_ID, 'planningTimerEndingSoonThreshold');
                if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                    // Play ending soon sound
                    const endingSoonSound = game.settings.get(MODULE_ID, 'planningTimerEndingSoonSound');
                    if (endingSoonSound !== 'none') {
                        playSound(endingSoonSound, this.getTimerVolume());
                    }
                    
                    // Show ending soon notification
                    if (this.shouldShowNotification()) {
                        const message = game.settings.get(MODULE_ID, 'planningTimerEndingSoonMessage');
                        ui.notifications.warn(message);
                    }
                }

                if (this.state.remaining <= 0) {
                    this.timeExpired();
                }
            }, 1000);

            // Record resume for stats
            CombatStats.recordTimerUnpause();
            
            // Play pause/resume sound if configured
            const pauseResumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
            if (pauseResumeSound !== 'none') {
                playSound(pauseResumeSound, this.getTimerVolume());
            }

            this.syncState();
        }

        this.updateUI();
    }

    static setTime(newTime) {
        console.log(`${MODULE_TITLE} | Planning Timer | Setting new time: ${newTime}s`);
        
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        
        if (!this.state.isPaused && game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (this.state.isPaused) return;
                
                this.state.remaining--;
                this.syncState();

                // Calculate percentage of time remaining
                const percentRemaining = (this.state.remaining / this.state.timeLimit) * 100;

                // Check ending soon threshold
                const endingSoonThreshold = game.settings.get(MODULE_ID, 'planningTimerEndingSoonThreshold');
                if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                    // Play ending soon sound
                    const endingSoonSound = game.settings.get(MODULE_ID, 'planningTimerEndingSoonSound');
                    if (endingSoonSound !== 'none') {
                        playSound(endingSoonSound, this.getTimerVolume());
                    }
                    
                    // Show ending soon notification
                    if (this.shouldShowNotification()) {
                        const message = game.settings.get(MODULE_ID, 'planningTimerEndingSoonMessage');
                        ui.notifications.warn(message);
                    }
                }

                if (this.state.remaining <= 0) {
                    this.timeExpired();
                }
            }, 1000);
        }
        
        this.updateUI();
        if (game.user.isGM) {
            this.syncState();

            // Notify all clients
            socket.executeForOthers("timerAdjusted", this.formatTime(newTime));
        }
    }

    static getTimerVolume() {
        return game.settings.get(MODULE_ID, 'timerSoundVolume');
    }

    static verifyTimerConditions() {
        try {
            if (!game.settings.get(MODULE_ID, 'planningTimerEnabled')) return false;
        } catch (error) {
            console.debug(`${MODULE_TITLE} | Planning Timer | Settings not yet registered`);
            return false;
        }

        if (!game.combat?.started) return false;
        if (game.combat.turn !== 0) return false;
        if (this.state.isExpired) return false;

        const isGMOnly = game.settings.get(MODULE_ID, 'combatTimerGMOnly');
        if (isGMOnly && !game.user.isGM) return false;

        return true;
    }

    static startTimer(duration, isNewRound = false) {
        if (!this.verifyTimerConditions()) return;

        // Record planning start for stats
        if (game.user.isGM) {
            CombatStats.recordPlanningStart();
            // Store timeLimit in state when GM starts timer
            this.state.timeLimit = game.settings.get(MODULE_ID, 'planningTimerDuration');
        }

        this.state.remaining = duration;
        this.state.isActive = true;
        this.state.isPaused = !game.settings.get(MODULE_ID, 'planningTimerAutoStart');
        this.state.showingMessage = false;
        this.state.isExpired = false;

        // Only GM should handle the interval
        if (game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            if (!this.state.isPaused) {
                this.timer = setInterval(() => {
                    if (this.state.isPaused) return;
                    
                    this.state.remaining--;
                    this.syncState();

                    // Calculate percentage of time remaining
                    const percentRemaining = (this.state.remaining / this.state.timeLimit) * 100;

                    // Check ending soon threshold
                    const endingSoonThreshold = game.settings.get(MODULE_ID, 'planningTimerEndingSoonThreshold');
                    if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                        // Play ending soon sound
                        const endingSoonSound = game.settings.get(MODULE_ID, 'planningTimerEndingSoonSound');
                        if (endingSoonSound !== 'none') {
                            playSound(endingSoonSound, this.getTimerVolume());
                        }
                        
                        // Show ending soon notification
                        if (this.shouldShowNotification()) {
                            const message = game.settings.get(MODULE_ID, 'planningTimerEndingSoonMessage');
                            ui.notifications.warn(message);
                        }
                    }

                    if (this.state.remaining <= 0) {
                        this.timeExpired();
                    }
                }, 1000);
            }
        }

        this.updateUI();
        if (game.user.isGM) {
            this.syncState();
        }
    }

    static updateUI() {
        try {
            // Use timeLimit from state instead of settings
            const percentage = (this.state.remaining / this.state.timeLimit) * 100;
            
            // Update progress bar width and color classes
            const bar = $('.planning-timer-bar');
            if (!bar.length) return;
            
            bar.css('width', `${percentage}%`);
            
            // Update color classes based on percentage
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
                $('.planning-timer-bar').addClass('expired');
                $('.planning-timer-progress').addClass('expired');
            } else {
                $('.planning-timer-bar, .planning-timer-progress').removeClass('expired');
            }

            // Don't update text if we're showing a message
            if (this.state.showingMessage) {
                // Show expired message if timer is at 0
                if (this.state.remaining <= 0) {
                    const message = game.settings.get(MODULE_ID, 'planningTimerExpiredMessage');
                    $('.planning-timer-text').text(message);
                }
                return;
            }

            const timerText = $('.planning-timer-text');
            if (!timerText.length) return;
            
            const label = game.settings.get(MODULE_ID, 'planningTimerLabel');

            if (this.state.remaining <= 0) {
                timerText.text(game.settings.get(MODULE_ID, 'planningTimerExpiredMessage'));
            } else if (this.state.isPaused) {
                timerText.text(`${label} TIMER PAUSED`);
            } else {
                const timeString = this.formatTime(this.state.remaining);
                timerText.text(`${timeString} ${label}`);
            }
        } catch (error) {
            console.error(`${MODULE_TITLE} | Planning Timer | Error updating UI:`, error);
        }
    }

    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    static shouldShowNotification() {
        // Planning timer just uses the general notification setting
        return game.settings.get(MODULE_ID, 'timerShowNotifications');
    }

    static async timeExpired() {
        // Set expired state
        this.state.isActive = false;
        this.state.showingMessage = true;
        this.state.isExpired = true;
        this.state.remaining = 0;
        this.syncState();  // Sync expired state to players

        // Play expiration sound if configured
        const timeUpSound = game.settings.get(MODULE_ID, 'planningTimerExpiredSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }

        // Show notification if enabled
        if (this.shouldShowNotification()) {
            const label = game.settings.get(MODULE_ID, 'planningTimerLabel');
            ui.notifications.info(`${label} Has Ended`);
        }

        // Wait full 3 seconds before cleanup
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Now do cleanup and notify players
        socket.executeForOthers("timerCleanup", { wasExpired: true });
        this.cleanupTimer();
        this.syncState();  // Sync cleaned state after cleanup

        // Trigger planning timer expired hook
        Hooks.callAll('planningTimerExpired', {
            expired: true,
            combat: game.combat
        });
    }

    static async timerAdjusted(timeString) {
        if (!game.user.isGM) {
            ui.notifications.info(`Planning timer set to ${timeString}`);
        }
    }

    static async timerCleanup(data) {
        if (!game.user.isGM) {
            this.cleanupTimer();
        }
    }

    static cleanupTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Record planning end for stats if we were active
        if (this.state.isActive) {
            CombatStats.recordPlanningEnd();
        }

        // Reset all state flags
        this.state.isActive = false;
        this.state.isPaused = true;
        this.state.remaining = 0;
        this.state.showingMessage = false;
        this.state.isExpired = false;
        
        this.updateUI();
    }

    static async syncState() {
        if (game.user.isGM) {
            console.log(`${MODULE_TITLE} | Planning Timer: GM syncing state to players`);
            await socket.executeForOthers("syncPlanningTimerState", this.state);
            this.updateUI();
        }
    }

    static async forceEnd() {
        this.state.isActive = false;
        this.state.showingMessage = true;
        this.state.isExpired = true;
        this.state.remaining = 0;
        this.syncState();
        
        // Notify clients of cleanup
        socket.executeForOthers("timerCleanup", { wasExpired: true });
        this.cleanupTimer();
    }
}

Hooks.once('init', () => {
    console.log(`${MODULE_TITLE} | Exposing Planning Timer API`);
    // Initialize the API object if it doesn't exist
    const module = game.modules.get(MODULE_ID);
    module.api = module.api || {};
    module.api.PlanningTimer = PlanningTimer;
});


