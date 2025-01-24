// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { COFFEEPUB, postConsoleAndNotification, playSound, trimString } from './global.js';
import { CombatStats } from './combat-stats.js';

export class PlanningTimer {
    static DEFAULTS = {
        timeLimit: 60,
        enabled: true,
        state: {
            isActive: false,
            isPaused: true,
            remaining: 0,
            showingMessage: false,
            isExpired: false
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
        
        // Set up socket handling for client-server sync
        game.socket.on(`module.${MODULE_ID}`, (data) => {
            if (data.type === 'planningTimer') {
                this.handleSocketMessage(data);
            }
        });

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

    static handleSocketMessage(data) {
        if (!game.user.isGM) {
            switch (data.action) {
                case 'sync':
                    this.state = data.state;
                        this.updateUI();
                    break;
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

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), 1000);

        // Record resume for stats
        CombatStats.recordTimerUnpause();
        
        // Play pause/resume sound if configured
        const pauseResumeSound = game.settings.get(MODULE_ID, 'timerPauseResumeSound');
        if (pauseResumeSound !== 'none') {
            playSound(pauseResumeSound, this.getTimerVolume());
        }

        this.updateUI();
        this.syncState();
    }

    static setTime(newTime) {
        console.log(`${MODULE_TITLE} | Planning Timer | Setting new time: ${newTime}s`);
        
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        
        if (!this.state.isPaused) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), 1000);
        }
        
        this.updateUI();
        this.syncState();

        // Notify all clients
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'planningTimer',
            action: 'timerAdjusted',
            time: this.formatTime(newTime)
        });
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
        CombatStats.recordPlanningStart();

        this.state.remaining = duration;
        this.state.isActive = true;
        this.state.isPaused = false;
        this.state.showingMessage = false;
        this.state.isExpired = false;

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), 1000);

        this.updateUI();
        this.syncState();
    }

    static updateUI() {
        try {
            // Get the time limit from settings for proper percentage calculation
            const timeLimit = game.settings.get(MODULE_ID, 'planningTimerDuration');
            const percentage = (this.state.remaining / timeLimit) * 100;
            
            // Update progress bar width and color classes
            const bar = $('.planning-timer-bar');
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

            if (this.state.showingMessage) return;

            const timerText = $('.planning-timer-text');
            const label = game.settings.get(MODULE_ID, 'planningTimerLabel');

            if (this.state.isPaused) {
                timerText.text(`${label} TIMER PAUSED`);
            } else if (this.state.remaining <= 0) {
                timerText.text(game.settings.get(MODULE_ID, 'planningTimerExpiredMessage'));
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

    static tick() {
        if (this.state.isPaused) return;

        this.state.remaining--;
        this.updateUI();

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
                game.socket.emit(`module.${MODULE_ID}`, {
            type: 'planningTimer',
            action: 'cleanup',
                    wasExpired: true
                });

        // Wait 3 seconds then remove the timer from view
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Remove the timer from view
        $('.planning-phase').fadeOut(400, function() {
            $(this).remove();
        });

        // Trigger planning timer expired hook
        Hooks.callAll('planningTimerExpired', {
            expired: true,
            combat: game.combat
        });
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

    static syncState() {
        if (game.user.isGM) {
            game.socket.emit(`module.${MODULE_ID}`, {
                type: 'planningTimer',
                action: 'sync',
                state: this.state
            });
        }
    }

    static forceEnd() {
        console.log(`${MODULE_TITLE} | Planning Timer | Force ending timer`);
        // Make sure we're unpaused and active
        this.state.isPaused = false;
        this.state.isActive = true;
        this.state.showingMessage = false;
        
        // Get the label from settings
        const label = game.settings.get(MODULE_ID, 'planningTimerLabel');
        
        // Update UI to show ending state
        const bar = $('.planning-timer-bar');
        bar.css('width', '0%');
        bar.removeClass('high medium low').addClass('expired');
        
        // Show ending message
        $('.planning-timer-text').text(`${label} Has Ended`);
        
        // Play expiration sound if configured
        const timeUpSound = game.settings.get(MODULE_ID, 'planningTimerExpiredSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }
        
        // Show notification if enabled
        if (this.shouldShowNotification()) {
            ui.notifications.info(`${label} Has Ended`);
        }
        
        // Wait 3 seconds then fade out
        setTimeout(() => {
            $('.planning-phase').fadeOut(400, function() {
                $(this).remove();
            });
        }, 3000);
        
        // Clean up the timer
        this.cleanupTimer();
        
        // Notify all clients
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'planningTimer',
            action: 'cleanup',
            wasExpired: true
        });
        
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


