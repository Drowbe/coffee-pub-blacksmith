// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound, trimString, getSettingSafely } from './api-core.js';
import { CombatStats } from './stats-combat.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';

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
        postConsoleAndNotification(MODULE.NAME, "Planning Timer | Initializing", "", false, false);
        
        // Initialize state
        this.state = foundry.utils.deepClone(this.DEFAULTS.state);
        this.timer = null;
        this.isInitialized = false;

        // Register hooks
        const renderCombatTrackerHookId = HookManager.registerHook({
			name: 'renderCombatTracker',
			description: 'Planning Timer: Handle combat tracker rendering for planning phase UI',
			context: 'timer-planning-combat-tracker',
			priority: 3,
			callback: this._onRenderCombatTracker.bind(this)
		});
		
		// Add hook for ending the planning timer from combat timer
		const endPlanningTimerHookId = HookManager.registerHook({
			name: 'endPlanningTimer',
			description: 'Planning Timer: Handle forced planning timer end',
			context: 'timer-planning-force-end',
			priority: 3,
			callback: this.forceEnd.bind(this)
		});
		
		// Register cleanup hook for combat deletion
		const deleteCombatHookId = HookManager.registerHook({
			name: 'deleteCombat',
			description: 'Planning Timer: Cleanup when combat is deleted',
			context: 'timer-planning-cleanup',
			priority: 3,
			callback: () => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				this.cleanupTimer();
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

		// Register cleanup hook for module unload
		Hooks.once('ready', () => {
			const unloadHookId = HookManager.registerHook({
				name: 'unloadModule',
				description: 'Planning Timer: Cleanup on module unload',
				context: 'timer-planning-cleanup',
				priority: 3,
				callback: (moduleId) => {
					if (moduleId === MODULE.ID) {
						this.cleanupTimer();
						postConsoleAndNotification(MODULE.NAME, "Planning Timer | Cleaned up on module unload", "", true, false);
					}
				}
			});
		});

        // Wait for game to be ready before checking initial state
        Hooks.once('ready', () => {
            this.isInitialized = true;
            
            // Check if we're loading into an active combat with planning phase
            if (game.combat?.started && game.combat.turn === 0) {
                // Defer planning restoration until CombatStats is ready to prevent race condition
                if (CombatStats.currentStats) {
                    const duration = game.settings.get(MODULE.ID, 'planningTimerDuration');
                    this.startTimer(duration, true);
                    ui.combat.render(true);
                } else {
                    // Wait for CombatStats to be ready before restoring planning state
                    Hooks.once('blacksmithUpdated', () => {
                        if (game.combat?.started && game.combat.turn === 0) {
                            const duration = game.settings.get(MODULE.ID, 'planningTimerDuration');
                            this.startTimer(duration, true);
                            ui.combat.render(true);
                        }
                    });
                }
            }
        });

        // Add socket ready check
        Hooks.once('blacksmith.socketReady', () => {
    
        });

        // Handle combat updates
        const updateCombatHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Planning Timer: Handle combat updates for planning phase management',
            context: 'timer-planning',
            priority: 3, // Normal priority - timer management
            callback: this.handleCombatUpdate.bind(this)
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "timer-planning", true, false);
    }

    static async syncState() {
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            await socket.executeForOthers("syncPlanningTimerState", this.state);
            this.updateUI();
        }
    }

    static async timerAdjusted(timeString) {
        if (!game.user.isGM) {
            ui.notifications.info(`Planning timer set to ${timeString}`);
        }
    }

    static async timerCleanup(data) {
        // Ensure state is initialized before proceeding
        if (!PlanningTimer.state) {
            PlanningTimer.state = foundry.utils.deepClone(PlanningTimer.DEFAULTS.state);
        }
        
        if (!game.user.isGM) {
            // Players only update UI based on received data
            if (data?.wasExpired || data?.shouldFadeOut) {
                // Handle UI updates without modifying state
                if (data.shouldFadeOut) {
                    // Find timer in both sidebar and popout windows
                    const searchRoots = [document];
                    if (ui.combat?.element) {
                        searchRoots.push(ui.combat.element);
                    }
                    searchRoots.forEach(root => {
                        const planningPhaseElements = root.querySelectorAll('.planning-timer-item');
                        planningPhaseElements.forEach((el) => {
                            el.style.transition = 'opacity 0.4s';
                            el.style.opacity = '0';
                            setTimeout(() => {
                                if (el.parentNode) {
                                    el.remove();
                                }
                            }, 400);
                        });
                    });
                }
            }
        } else {
            // Existing GM cleanup code
            if (PlanningTimer.timer) {
                clearInterval(PlanningTimer.timer);
                PlanningTimer.timer = null;
            }

            // Record planning end for stats if we were active and CombatStats is ready
            if (PlanningTimer.state.isActive && CombatStats.currentStats) {
                CombatStats.recordPlanningEnd();
            }

            PlanningTimer.state.isActive = false;
            PlanningTimer.state.isPaused = true;
            PlanningTimer.state.remaining = 0;
            
            // Don't clear showingMessage or isExpired as they may be needed for UI

            PlanningTimer.updateUI();
            PlanningTimer.syncState();

            // Add fade-out sequence for normal turn changes
            if (!data?.wasExpired) {
                setTimeout(async () => {
                    const socket = SocketManager.getSocket();
                    await socket.executeForOthers("timerCleanup", { shouldFadeOut: true });
                    // Find timer in both sidebar and popout windows
                    const searchRoots = [document];
                    if (ui.combat?.element) {
                        searchRoots.push(ui.combat.element);
                    }
                    searchRoots.forEach(root => {
                        const planningPhaseElements = root.querySelectorAll('.planning-timer-item');
                        planningPhaseElements.forEach((el) => {
                            el.style.transition = 'opacity 0.4s';
                            el.style.opacity = '0';
                            setTimeout(() => {
                                if (el.parentNode) {
                                    el.remove();
                                }
                            }, 400);
                        });
                    });
                }, 3000);
            }
        }
    }

    static handleCombatUpdate(combat, changed, options, userId) {
        // Only GM handles timer state changes
        if (!game.user.isGM) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Safely check if planning timer is enabled
        try {
            if (!game.settings.get(MODULE.ID, 'planningTimerEnabled')) return;
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

        const duration = game.settings.get(MODULE.ID, 'planningTimerDuration');
        this.startTimer(duration, true);

        requestAnimationFrame(() => ui.combat.render(true));
    }

    static handleNewRound(combat) {
        this.state.isExpired = false;
        this.cleanupTimer();

        // Ensure combat timer is cleaned up
        Hooks.callAll('combatTimerCleanup');

        const duration = game.settings.get(MODULE.ID, 'planningTimerDuration');
        this.startTimer(duration, true);

        setTimeout(() => ui.combat.render(true), 100);
    }

    static handleTurnChange(combat) {
        if (combat.turn === 0) {
            this.state.isExpired = false;
            this.cleanupTimer();
            Hooks.callAll('combatTimerCleanup');

            const duration = game.settings.get(MODULE.ID, 'planningTimerDuration');
            this.startTimer(duration, true);

            setTimeout(() => ui.combat.render(true), 100);
        } else if (combat.turn > 0) {
            this.cleanupTimer();
            
            // Add fade-out sequence for player turn transition
            if (game.user.isGM) {
                setTimeout(async () => {
                    const socket = SocketManager.getSocket();
                    await socket.executeForOthers("timerCleanup", { shouldFadeOut: true });
                    // Find timer in both sidebar and popout windows
                    const searchRoots = [document];
                    if (ui.combat?.element) {
                        searchRoots.push(ui.combat.element);
                    }
                    searchRoots.forEach(root => {
                        const planningPhaseElements = root.querySelectorAll('.planning-timer-item');
                        planningPhaseElements.forEach((el) => {
                            el.style.transition = 'opacity 0.4s';
                            el.style.opacity = '0';
                            setTimeout(() => {
                                if (el.parentNode) {
                                    el.remove();
                                }
                            }, 400);
                        });
                    });
                }, 3000);
            }
        }
    }

    static async _onRenderCombatTracker(app, html, data) {
        // Verify settings and combat state
        if (!this.verifyTimerConditions()) {
            // Debug: Log why timer isn't showing (use getSettingSafely to avoid errors)
            const enabled = getSettingSafely(MODULE.ID, 'planningTimerEnabled', false);
            postConsoleAndNotification(MODULE.NAME, `Planning Timer: Conditions not met - enabled: ${enabled}, combat started: ${game.combat?.started}, turn: ${game.combat?.turn}, expired: ${this.state.isExpired}`, "", true, false);
            return;
        }

        // Get label from settings
        const label = getSettingSafely(MODULE.ID, 'planningTimerLabel', 'Planning');
        
        // Ensure state has valid duration
        if (!this.state.duration || this.state.duration === 0) {
            this.state.duration = getSettingSafely(MODULE.ID, 'planningTimerDuration', this.DEFAULTS.timeLimit);
        }
        
        // If remaining is 0 but timer should be active, initialize it
        if (this.state.remaining === 0 && this.state.isActive && !this.state.isExpired) {
            this.state.remaining = this.state.duration;
        }
        
        const timerHtml = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/timer-planning.hbs',
            {
                label,
                isPaused: this.state.isPaused,
                remaining: this.state.remaining,
                timeLimit: this.state.duration || this.DEFAULTS.timeLimit,
                isExpired: this.state.isExpired
            }
        );
        
        // Remove any existing planning timers (v13: html is native DOM element)
        html.querySelectorAll('.planning-timer-item, .planning-timer-container, .planning-phase').forEach(el => el.remove());
        
        // v13: Find the combat tracker list (ol.combat-tracker) and insert into it
        // Try multiple selectors to find the combat tracker list
        const combatTracker = html.querySelector('ol.combat-tracker.plain') || 
                              html.querySelector('ol.combat-tracker') ||
                              html.querySelector('.combat-tracker.plain') ||
                              html.querySelector('.combat-tracker') ||
                              html.querySelector('[data-application-part="tracker"]');
        if (combatTracker) {
            postConsoleAndNotification(MODULE.NAME, `Planning Timer: Found combat tracker, inserting timer`, "", true, false);
            // Parse HTML string into DOM element
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = timerHtml;
            const timerElement = tempDiv.firstElementChild;
            if (timerElement) {
                // Insert at the beginning of the list, before any combatants or drop targets
                // v13: Insert as a div before the first child (which might be a drop-target or combatant)
                combatTracker.insertBefore(timerElement, combatTracker.firstChild);
                
                // Bind click handlers after insertion (v13: native DOM)
                if (game.user.isGM) {
                    const progressElement = timerElement.querySelector('.planning-timer-progress');
                    if (progressElement) {
                        // Remove any existing handlers by cloning (clean slate)
                        const newProgress = progressElement.cloneNode(true);
                        progressElement.parentNode.replaceChild(newProgress, progressElement);
                        
                        // Add fresh handlers to the cloned element
                        newProgress.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            this._onTimerClick(event);
                        });
                        newProgress.addEventListener('contextmenu', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            this._onTimerRightClick(event);
                        });
                    }
                }
            }
        } else {
            // Fallback: try to find first combatant (v13: native DOM)
            postConsoleAndNotification(MODULE.NAME, `Planning Timer: Combat tracker not found, trying fallback`, "", true, false);
            const firstCombatant = html.querySelector('.combatant');
            if (firstCombatant) {
                // Parse HTML string into DOM element
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = timerHtml;
                const timerElement = tempDiv.firstElementChild;
                if (timerElement) {
                    firstCombatant.insertAdjacentElement('beforebegin', timerElement);
                    
                    // Bind click handlers after insertion (v13: native DOM)
                    if (game.user.isGM) {
                        const progressElement = timerElement.querySelector('.planning-timer-progress');
                        if (progressElement) {
                            // Remove any existing handlers by cloning (clean slate)
                            const newProgress = progressElement.cloneNode(true);
                            progressElement.parentNode.replaceChild(newProgress, progressElement);
                            
                            // Add fresh handlers to the cloned element
                            newProgress.addEventListener('click', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                this._onTimerClick(event);
                            });
                            newProgress.addEventListener('contextmenu', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                this._onTimerRightClick(event);
                            });
                        }
                    }
                }
            }
        }
        
        // Update UI after rendering to ensure correct display
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
        
        const timeLimit = game.settings.get(MODULE.ID, 'planningTimerDuration');
        const newTime = Math.round(timeLimit * percentage);
        
        this.setTime(newTime);
    }

    static pauseTimer() {

        this.state.isPaused = true;
        this.state.showingMessage = false;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Record pause for stats
        CombatStats.recordTimerPause();

        // Play pause/resume sound if configured (for all clients)
        const pauseResumeSound = game.settings.get(MODULE.ID, 'timerPauseResumeSound');
        if (pauseResumeSound !== 'none') {
            playSound(pauseResumeSound, this.getTimerVolume());
        }

        // Send chat message if GM
        if (game.user.isGM) {
            this.sendChatMessage({
                isPlanningPaused: true,
                timeRemaining: this.formatTime(this.state.remaining)
            });
        }

        this.updateUI();
        this.syncState();
    }

    static resumeTimer() {

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
                const timeLimit = game.settings.get(MODULE.ID, 'planningTimerDuration');
                const percentRemaining = (this.state.remaining / timeLimit) * 100;

                // Check ending soon threshold
                const endingSoonThreshold = game.settings.get(MODULE.ID, 'planningTimerEndingSoonThreshold');
                if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                    // Play ending soon sound (for all clients)
                    const endingSoonSound = game.settings.get(MODULE.ID, 'planningTimerEndingSoonSound');
                    if (endingSoonSound !== 'none') {
                        playSound(endingSoonSound, this.getTimerVolume());
                    }
                    
                    // Show ending soon notification and send chat message (GM only)
                    if (this.shouldShowNotification() && game.user.isGM) {
                        const message = game.settings.get(MODULE.ID, 'planningTimerEndingSoonMessage');
                        ui.notifications.warn(message);
                        this.sendChatMessage({
                            isTimerWarning: true,
                            warningMessage: message
                        });
                    }
                }

                if (this.state.remaining <= 0) {
                    this.timeExpired();
                }
            }, 1000);

            // Record resume for stats
            CombatStats.recordTimerUnpause();
            
            // Play pause/resume sound (for all clients)
            const pauseResumeSound = game.settings.get(MODULE.ID, 'timerPauseResumeSound');
            if (pauseResumeSound !== 'none') {
                playSound(pauseResumeSound, this.getTimerVolume());
            }

            // Send chat message for resume (GM only)
            this.sendChatMessage({
                isPlanningResumed: true,
                timeRemaining: this.formatTime(this.state.remaining)
            });

            this.syncState();
        }

        this.updateUI();
    }

    static setTime(newTime) {
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        
        // Send chat message for timer update if GM
        if (game.user.isGM) {
            this.sendChatMessage({
                isTimerSet: true,
                timeString: this.formatTime(newTime)
            });
        }

        if (!this.state.isPaused && game.user.isGM) {
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (this.state.isPaused) return;
                
                this.state.remaining--;
                this.syncState();

                // Calculate percentage of time remaining
                const timeLimit = game.settings.get(MODULE.ID, 'planningTimerDuration');
                const percentRemaining = (this.state.remaining / timeLimit) * 100;

                // Check ending soon threshold
                const endingSoonThreshold = game.settings.get(MODULE.ID, 'planningTimerEndingSoonThreshold');
                if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                    // Play ending soon sound
                    const endingSoonSound = game.settings.get(MODULE.ID, 'planningTimerEndingSoonSound');
                    if (endingSoonSound !== 'none') {
                        playSound(endingSoonSound, this.getTimerVolume());
                    }
                    
                    // Show ending soon notification
                    if (this.shouldShowNotification()) {
                        const message = game.settings.get(MODULE.ID, 'planningTimerEndingSoonMessage');
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

            // Notify all clients using SocketManager
            const socket = SocketManager.getSocket();
            if (socket) {
                socket.executeForOthers("planningTimerAdjusted", this.formatTime(newTime));
            }
        }
    }

    static getTimerVolume() {
        return game.settings.get(MODULE.ID, 'timerSoundVolume');
    }

    static verifyTimerConditions() {
        // Use getSettingSafely to avoid errors if settings aren't registered yet
        if (!getSettingSafely(MODULE.ID, 'planningTimerEnabled', false)) return false;

        if (!game.combat?.started) return false;
        if (game.combat.turn !== 0) return false;
        if (this.state.isExpired) return false;

        const isGMOnly = getSettingSafely(MODULE.ID, 'combatTimerGMOnly', false);
        if (isGMOnly && !game.user.isGM) return false;

        return true;
    }

    static startTimer(duration = null) {
        if (!this.verifyTimerConditions()) return;

        // Record planning start for stats - only if CombatStats is ready
        if (game.user.isGM && CombatStats.currentStats) {
            CombatStats.recordPlanningStart();
        }

        // If no duration provided, get from settings
        if (duration === null) {
            duration = game.settings.get(MODULE.ID, 'planningTimerDuration') ?? this.DEFAULTS.timeLimit;
        }

        this.state.remaining = duration;
        this.state.duration = duration;  // Store duration in state
        this.state.isActive = true;
        this.state.isPaused = !game.settings.get(MODULE.ID, 'planningTimerAutoStart');
        this.state.showingMessage = false;
        this.state.isExpired = false;

        // Send chat message for planning start if GM and timer is at full duration
        if (game.user.isGM && duration === game.settings.get(MODULE.ID, 'planningTimerDuration')) {
            // Check if the setting is enabled before sending the message
            if (game.settings.get(MODULE.ID, 'timerChatPlanningStart')) {
                this.sendChatMessage({
                    isPlanningStart: true,
                    duration: Math.floor(duration / 60)
                });
            }
        }

        // If auto-start is enabled, start the timer interval
        if (!this.state.isPaused && game.user.isGM) {
    
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (this.state.isPaused) return;
                
                this.state.remaining--;
                this.syncState();

                // Calculate percentage of time remaining
                const timeLimit = game.settings.get(MODULE.ID, 'planningTimerDuration');
                const percentRemaining = (this.state.remaining / timeLimit) * 100;

                // Check ending soon threshold
                const endingSoonThreshold = game.settings.get(MODULE.ID, 'planningTimerEndingSoonThreshold');
                if (percentRemaining <= endingSoonThreshold && percentRemaining > endingSoonThreshold - 1) {
                    // Play ending soon sound (for all clients)
                    const endingSoonSound = game.settings.get(MODULE.ID, 'planningTimerEndingSoonSound');
                    if (endingSoonSound !== 'none') {
                        playSound(endingSoonSound, this.getTimerVolume());
                    }
                    
                    // Show ending soon notification and send chat message (GM only)
                    if (this.shouldShowNotification() && game.user.isGM) {
                        const message = game.settings.get(MODULE.ID, 'planningTimerEndingSoonMessage');
                        ui.notifications.warn(message);
                        this.sendChatMessage({
                            isTimerWarning: true,
                            warningMessage: message
                        });
                    }
                }

                if (this.state.remaining <= 0) {
                    this.timeExpired();
                }
            }, 1000);
        }

        this.updateUI();
        this.syncState();
    }

    static updateUI() {
        try {
            // Use duration from state instead of settings
            const timeLimit = this.state.duration || this.DEFAULTS.timeLimit;
            const percentage = timeLimit > 0 ? (this.state.remaining / timeLimit) * 100 : 0;
            
            // v13: Find all combat tracker windows (sidebar and popout)
            const allBars = [];
            const allTexts = [];
            const allProgressElements = [];
            
            // Check sidebar combat tracker
            if (ui.combat?.element) {
                const sidebarBar = ui.combat.element.querySelector('.planning-timer-bar');
                const sidebarText = ui.combat.element.querySelector('.planning-timer-text');
                const sidebarProgress = ui.combat.element.querySelectorAll('.planning-timer-progress');
                if (sidebarBar) allBars.push(sidebarBar);
                if (sidebarText) allTexts.push(sidebarText);
                sidebarProgress.forEach(el => allProgressElements.push(el));
            }
            
            // Check popout windows
            document.querySelectorAll('#combat-popout .planning-timer-bar, .combat-sidebar .planning-timer-bar').forEach(bar => {
                if (!allBars.includes(bar)) allBars.push(bar);
            });
            document.querySelectorAll('#combat-popout .planning-timer-text, .combat-sidebar .planning-timer-text').forEach(text => {
                if (!allTexts.includes(text)) allTexts.push(text);
            });
            document.querySelectorAll('#combat-popout .planning-timer-progress, .combat-sidebar .planning-timer-progress').forEach(progress => {
                if (!allProgressElements.includes(progress)) allProgressElements.push(progress);
            });
            
            // Update all bars
            allBars.forEach(bar => {
                bar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
                
                // Update color classes based on percentage
                bar.classList.remove('high', 'medium', 'low', 'expired');
                if (this.state.remaining <= 0) {
                    bar.classList.add('expired');
                } else if (percentage <= 25) {
                    bar.classList.add('low');
                } else if (percentage <= 50) {
                    bar.classList.add('medium');
                } else {
                    bar.classList.add('high');
                }
            });
            
            // Update progress elements
            allProgressElements.forEach(el => {
                el.classList.remove('expired');
                if (this.state.remaining <= 0) {
                    el.classList.add('expired');
                }
            });

            if (this.state.showingMessage) return;

            // Update all text elements
            const label = getSettingSafely(MODULE.ID, 'planningTimerLabel', 'Planning');
            let textContent;
            
            if (this.state.remaining <= 0) {
                textContent = getSettingSafely(MODULE.ID, 'planningTimerExpiredMessage', 'Planning Timer Expired');
            } else if (this.state.isPaused) {
                textContent = `${label} TIMER PAUSED`;
            } else {
                const timeString = this.formatTime(this.state.remaining);
                textContent = `${timeString} ${label}`;
            }
            
            allTexts.forEach(timerText => {
                timerText.textContent = textContent;
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Planning Timer | Error updating UI:", error, false, false);
        }
    }

    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    static shouldShowNotification() {
        // Planning timer just uses the general notification setting
        return game.settings.get(MODULE.ID, 'timerShowNotifications');
    }

    static async timeExpired() {
        // Record expiration in stats
        CombatStats.recordTimerExpired(true);

        this.state.isExpired = true;
        this.cleanupTimer();
            
        // Play expiration sound if configured
        const timeUpSound = game.settings.get(MODULE.ID, 'planningTimerExpiredSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }
            
        // Show notification if enabled
        if (this.shouldShowNotification()) {
            const label = game.settings.get(MODULE.ID, 'planningTimerLabel');
            ui.notifications.info(`${label} Has Ended`);
        }

        // Send chat message for timer expiration if GM
        if (game.user.isGM) {
            const label = game.settings.get(MODULE.ID, 'planningTimerLabel');
            await this.sendChatMessage({
                isTimerExpired: true,
                expiredMessage: `${label} Has Ended`
            });
        }
            
        // Notify all clients
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            await socket.executeForOthers("timerCleanup", { wasExpired: true });
        }

        // Wait 3 seconds then remove the timer from view
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Remove the timer from view on all clients
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            await socket.executeForOthers("timerCleanup", { wasExpired: true, shouldFadeOut: true });
        }
        // Find timer in both sidebar and popout windows
        const searchRoots = [document];
        if (ui.combat?.element) {
            searchRoots.push(ui.combat.element);
        }
        searchRoots.forEach(root => {
            const planningPhaseElements = root.querySelectorAll('.planning-timer-item');
            planningPhaseElements.forEach((el) => {
                el.style.transition = 'opacity 0.4s';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (el.parentNode) {
                        el.remove();
                    }
                }, 400);
            });
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

        // Record planning end for stats if we were active and CombatStats is ready
        if (this.state.isActive && CombatStats.currentStats) {
            CombatStats.recordPlanningEnd();
        }

        this.state.isActive = false;
        this.state.isPaused = true;
        this.state.remaining = 0;
        
        // Don't clear showingMessage or isExpired as they may be needed for UI

        this.updateUI();
        this.syncState();
    }

    // Function that will be called on non-GM clients
    static receiveTimerSync(state) {
        if (!game?.user) return;
    
        if (!game.user.isGM) {
            PlanningTimer.state = foundry.utils.deepClone(state);
            PlanningTimer.updateUI();
        }
    }

    static forceEnd() {
        postConsoleAndNotification(MODULE.NAME, "Planning Timer | Force ending timer", "", true, false);
        // Make sure we're unpaused and active
        this.state.isPaused = false;
        this.state.isActive = true;
        this.state.showingMessage = false;
        this.state.remaining = 0;
        
        // Play expiration sound if configured
        const timeUpSound = game.settings.get(MODULE.ID, 'planningTimerExpiredSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }
        
        // Show notification if enabled
        if (this.shouldShowNotification()) {
            const label = game.settings.get(MODULE.ID, 'planningTimerLabel');
            ui.notifications.info(`${label} Has Ended`);
        }
        
        // Clean up the timer
        this.cleanupTimer();
        
        // Notify all clients and wait 3 seconds
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            socket.executeForOthers("timerCleanup", { wasExpired: true });
            setTimeout(async () => {
                await socket.executeForOthers("timerCleanup", { wasExpired: true, shouldFadeOut: true });
                // Find timer in both sidebar and popout windows
                const searchRoots = [document];
                if (ui.combat?.element) {
                    searchRoots.push(ui.combat.element);
                }
                searchRoots.forEach(root => {
                    const planningPhaseElements = root.querySelectorAll('.planning-timer-item');
                    planningPhaseElements.forEach((el) => {
                        el.style.transition = 'opacity 0.4s';
                        el.style.opacity = '0';
                        setTimeout(() => {
                            if (el.parentNode) {
                                el.remove();
                            }
                        }, 400);
                    });
                });
            }, 3000);
        }
        
        // Trigger planning timer expired hook
        Hooks.callAll('planningTimerExpired', {
            expired: true,
            combat: game.combat
        });
    }

    // Helper method for sending chat messages
    static async sendChatMessage(data) {
        // Get the GM user to send messages from
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

        // Get the timer label from settings
        const timerLabel = game.settings.get(MODULE.ID, 'planningTimerLabel');

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
            timerLabel,
            theme: data.isTimerWarning ? 'orange' : 
                   data.isTimerExpired ? 'red' : 
                   (data.isTimerStart || data.isTimerSet) ? 'blue' : 'default',
            ...data
        };

        const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', messageData);

        await ChatMessage.create({
            content: messageHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            user: gmUser.id,
            speaker: { alias: gmUser.name }
        });
    }
}

// Remove the API exposure at the end of the file and replace with a comment
// explaining that we're using Hooks for communication instead
// This replaces the Hooks.once('init') block at the end of the file


