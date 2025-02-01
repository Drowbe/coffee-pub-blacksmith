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
            duration: 60
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
        if (!game.user.isGM) {
            PlanningTimer.state = foundry.utils.deepClone(state);
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
            
            // Add fade-out sequence for player turn transition
            if (game.user.isGM) {
                setTimeout(async () => {
                    await socket.executeForOthers("timerCleanup", { shouldFadeOut: true });
                    $('.planning-phase').fadeOut(400, function() {
                        $(this).remove();
                    });
                }, 3000);
            }
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
                const timeLimit = game.settings.get(MODULE_ID, 'planningTimerDuration');
                const percentRemaining = (this.state.remaining / timeLimit) * 100;

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
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        
        if (!this.state.isPaused && game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (this.state.isPaused) return;
                
                this.state.remaining--;
                this.syncState();

                // Calculate percentage of time remaining
                const timeLimit = game.settings.get(MODULE_ID, 'planningTimerDuration');
                const percentRemaining = (this.state.remaining / timeLimit) * 100;

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
            return false;
        }

        if (!game.combat?.started) return false;
        if (game.combat.turn !== 0) return false;
        if (this.state.isExpired) return false;

        const isGMOnly = game.settings.get(MODULE_ID, 'combatTimerGMOnly');
        if (isGMOnly && !game.user.isGM) return false;

        return true;
    }

    static startTimer(duration = null) {
        if (!this.verifyTimerConditions()) return;

        // Record planning start for stats
        if (game.user.isGM) {
            CombatStats.recordPlanningStart();
        }

        // If no duration provided, get from settings
        if (duration === null) {
            duration = game.settings.get(MODULE_ID, 'planningTimerDuration') ?? this.DEFAULTS.timeLimit;
        }

        this.state.remaining = duration;
        this.state.duration = duration;  // Store duration in state
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
                    const percentRemaining = (this.state.remaining / this.state.duration) * 100;

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
            // Use duration from state instead of settings
            const timeLimit = this.state.duration;
            const percentage = (this.state.remaining / timeLimit) * 100;
            
            // Update progress bar width and color classes
            const bar = $('.planning-timer-bar');
            if (!bar.length) return;
            
            bar.css('width', `${percentage}%`);
            
            // Update color classes based on percentage
            bar.removeClass('high medium low expired');
            if (this.state.remaining <= 0) {
                bar.addClass('expired');
                $('.planning-timer-progress').addClass('expired');
            } else if (percentage <= 25) {
                bar.addClass('low');
                $('.planning-timer-progress').removeClass('expired');
            } else if (percentage <= 50) {
                bar.addClass('medium');
                $('.planning-timer-progress').removeClass('expired');
            } else {
                bar.addClass('high');
                $('.planning-timer-progress').removeClass('expired');
            }

            if (this.state.showingMessage) return;

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
        // Record expiration in stats
        CombatStats.recordTimerExpired(true);

        this.state.isExpired = true;
        this.cleanupTimer();
            
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
            
        // Notify all clients
        if (game.user.isGM) {
            await socket.executeForOthers("timerCleanup", { wasExpired: true });
        }

        // Wait 3 seconds then remove the timer from view
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Remove the timer from view on all clients
        if (game.user.isGM) {
            await socket.executeForOthers("timerCleanup", { wasExpired: true, shouldFadeOut: true });
        }
        $('.planning-phase').fadeOut(400, function() {
            $(this).remove();
        });

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
            // Players only update UI based on received data
            if (data?.wasExpired || data?.shouldFadeOut) {
                // Handle UI updates without modifying state
                if (data.shouldFadeOut) {
                    $('.planning-phase').fadeOut(400, function() {
                        $(this).remove();
                    });
                }
            }
        } else {
            // Existing GM cleanup code
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }

            // Record planning end for stats if we were active
            if (this.state.isActive) {
                CombatStats.recordPlanningEnd();
            }

            this.state.isActive = false;
            this.state.isPaused = true;
            this.state.remaining = 0;
            
            // Don't clear showingMessage or isExpired as they may be needed for UI

            this.updateUI();
            this.syncState();

            // Add fade-out sequence for normal turn changes
            if (!data?.wasExpired) {
                setTimeout(async () => {
                    await socket.executeForOthers("timerCleanup", { shouldFadeOut: true });
                    $('.planning-phase').fadeOut(400, function() {
                        $(this).remove();
                    });
                }, 3000);
            }
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

        this.state.isActive = false;
        this.state.isPaused = true;
        this.state.remaining = 0;
        
        // Don't clear showingMessage or isExpired as they may be needed for UI

        this.updateUI();
        this.syncState();
    }

    static async syncState() {
        if (game.user.isGM) {
            await socket.executeForOthers("syncPlanningTimerState", this.state);
            this.updateUI();
        }
    }

    static forceEnd() {
        console.log(`${MODULE_TITLE} | Planning Timer | Force ending timer`);
        // Make sure we're unpaused and active
        this.state.isPaused = false;
        this.state.isActive = true;
        this.state.showingMessage = false;
        this.state.remaining = 0;
        
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
        
        // Clean up the timer
        this.cleanupTimer();
        
        // Notify all clients and wait 3 seconds
        if (game.user.isGM) {
            socket.executeForOthers("timerCleanup", { wasExpired: true });
            setTimeout(async () => {
                await socket.executeForOthers("timerCleanup", { wasExpired: true, shouldFadeOut: true });
                $('.planning-phase').fadeOut(400, function() {
                    $(this).remove();
                });
            }, 3000);
        }
        
        // Trigger planning timer expired hook
        Hooks.callAll('planningTimerExpired', {
            expired: true,
            combat: game.combat
        });
    }
}

Hooks.once('init', () => {
    console.log(`${MODULE_TITLE} | Exposing Planning Timer API`);
    // Initialize the API object if it doesn't exist
    const module = game.modules.get(MODULE_ID);
    module.api = module.api || {};
    module.api.PlanningTimer = PlanningTimer;
});


