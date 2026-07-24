// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound, trimString, getSettingSafely } from './api-core.js';
import { CombatStats } from './stats-combat.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';
import { routeTimerNotification, sendHurryUpNudge } from './timer-notifications.js';

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
            duration: 60,
            hasHandledCritical: false
        }
    };

    static _combatTimerDomCache = { bars: [], texts: [], progress: [] };

    static _refreshCombatTimerDomCache() {
        const bars = [];
        const texts = [];
        const progress = [];
        if (ui.combat?.element) {
            const sidebarBar = ui.combat.element.querySelector('.combat-timer-bar');
            const sidebarText = ui.combat.element.querySelector('.combat-timer-text');
            if (sidebarBar) bars.push(sidebarBar);
            if (sidebarText) texts.push(sidebarText);
            ui.combat.element.querySelectorAll('.combat-timer-progress').forEach((el) => progress.push(el));
        }
        document.querySelectorAll('#combat-popout .combat-timer-bar, .combat-sidebar .combat-timer-bar').forEach((bar) => {
            if (!bars.includes(bar)) bars.push(bar);
        });
        document.querySelectorAll('#combat-popout .combat-timer-text, .combat-sidebar .combat-timer-text').forEach((text) => {
            if (!texts.includes(text)) texts.push(text);
        });
        document.querySelectorAll('#combat-popout .combat-timer-progress, .combat-sidebar .combat-timer-progress').forEach((p) => {
            if (!progress.includes(p)) progress.push(p);
        });
        this._combatTimerDomCache = { bars, texts, progress };
    }

    static _clearCombatTimerDomCache() {
        this._combatTimerDomCache = { bars: [], texts: [], progress: [] };
    }

    static _isCombatTimerDomCacheStale() {
        const c = this._combatTimerDomCache;
        for (const key of ['bars', 'texts', 'progress']) {
            for (const el of c[key]) {
                if (!el.isConnected) return true;
            }
        }
        return false;
    }

    static _combatTimerDomCacheAllEmpty() {
        const c = this._combatTimerDomCache;
        return !c.bars.length && !c.texts.length && !c.progress.length;
    }

    static initialize() {
        Hooks.once('ready', () => {
            try {
                
                if (!getSettingSafely(MODULE.ID, 'combatTimerEnabled', true)) {
                    return;
                }

                
                // Initialize state — keep duration and remaining aligned with configured turn length (fixes progress bar %)
                this.state = foundry.utils.deepClone(this.DEFAULTS.state);
                const combatDur = getSettingSafely(MODULE.ID, 'combatTimerDuration', 60);
                this.state.remaining = combatDur;
                this.state.duration = combatDur;
                
                
                // Add debounce for round changes
                this._lastRoundChange = 0;
                this._roundChangeDebounceTime = 100; // ms
                
                // Hook into combat turns with debounce for performance
                const debouncedUpdate = foundry.utils.debounce(this._onUpdateCombat.bind(this), 100);
                
                // Register updateCombat hook using HookManager for centralized control
                const updateCombatHookId = HookManager.registerHook({
                    name: 'updateCombat',
                    description: 'Combat Timer: Handle combat updates with debounced processing',
                    context: 'timer-combat',
                    priority: 3, // Normal priority - timer management
                    callback: (combat, changed, options, userId) => {
                        debouncedUpdate(combat, changed, options, userId);
                    }
                });
                
                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "timer-combat", true, false);
                
                // Add timer to combat tracker
                const renderCombatTrackerHookId = HookManager.registerHook({
                    name: 'renderCombatTracker',
                    description: 'Combat Timer: Add timer display to combat tracker',
                    context: 'timer-combat',
                    priority: 3, // Normal priority - UI enhancement
                    callback: this._onRenderCombatTracker.bind(this)
                });
                
                // Log hook registration

                // Handle planning timer expiration
                const planningTimerExpiredHookId = HookManager.registerHook({
					name: 'planningTimerExpired',
					description: 'Combat Timer: Handle planning timer expiration',
					context: 'timer-combat-planning-expired',
					priority: 3,
					callback: this.handlePlanningTimerExpired.bind(this)
				});

                // Add hooks for token movement and actions
                const updateTokenHookId = HookManager.registerHook({
					name: 'updateToken',
					description: 'Combat Timer: Monitor token movement to resume timer on activity',
					context: 'timer-combat-token-movement',
					priority: 3,
					callback: (token, changes, options, userId) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						if (!game.settings.get(MODULE.ID, 'combatTimerActivityStart')) return;
						if (!game.combat?.started) return;
						
						// Check if token belongs to current combatant
						const currentToken = game.combat.combatant?.token;
						if (!currentToken) return;
						
						// Check if this is the current combatant's token and it actually moved
						if (token.id === currentToken.id && (changes.x || changes.y) && CombatTimer.state.isPaused) {
							CombatTimer.state.showingMessage = false;
							const timerText = document.querySelector('.combat-timer-text');
							if (timerText) timerText.textContent = '';
							CombatTimer.resumeTimer(false);
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});

                // Monitor attack rolls
                const rollAttackHookId = HookManager.registerHook({
					name: 'dnd5e.rollAttack',
					description: 'Combat Timer: Monitor attack rolls to resume timer on activity',
					context: 'timer-combat-attack-rolls',
					priority: 3,
					callback: (item, roll) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						if (!game.settings.get(MODULE.ID, 'combatTimerActivityStart')) return;
						if (!game.combat?.started) return;
						
						const currentActor = game.combat.combatant?.actor;
						if (!currentActor || !item.parent) return;
						
						// Check if this is the current combatant's action
						if (item.parent.id === currentActor.id && CombatTimer.state.isPaused) {
							CombatTimer.state.showingMessage = false;
							const timerText = document.querySelector('.combat-timer-text');
							if (timerText) timerText.textContent = '';
							CombatTimer.resumeTimer(false);
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});

                // Monitor damage rolls
                const rollDamageHookId = HookManager.registerHook({
					name: 'dnd5e.rollDamage',
					description: 'Combat Timer: Monitor damage rolls to resume timer on activity',
					context: 'timer-combat-damage-rolls',
					priority: 3,
					callback: (item, roll) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						if (!game.settings.get(MODULE.ID, 'combatTimerActivityStart')) return;
						if (!game.combat?.started) return;
						
						const currentActor = game.combat.combatant?.actor;
						if (!currentActor || !item.parent) return;
						
						// Check if this is the current combatant's action
						if (item.parent.id === currentActor.id && CombatTimer.state.isPaused) {
							CombatTimer.state.showingMessage = false;
							const timerText = document.querySelector('.combat-timer-text');
							if (timerText) timerText.textContent = '';
							CombatTimer.resumeTimer(false);
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});

                // Monitor token targeting
                const targetTokenHookId = HookManager.registerHook({
					name: 'targetToken',
					description: 'Combat Timer: Monitor token targeting to resume timer on activity',
					context: 'timer-combat-token-targeting',
					priority: 3,
					callback: (user, token, targeted) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						if (!game.settings.get(MODULE.ID, 'combatTimerActivityStart')) return;
						if (!game.combat?.started) return;
						
						// Only process if a token is being targeted (not untargeted)
						if (!targeted) return;
						
						// Check if the user controls the current combatant
						const currentCombatant = game.combat.combatant;
						if (!currentCombatant) return;
						
						// Check if this user controls the current combatant
						const isCurrentCombatantUser = currentCombatant.isOwner && 
													  (user.id === game.user.id);
						
						if (isCurrentCombatantUser && CombatTimer.state.isPaused) {
							CombatTimer.state.showingMessage = false;
							const timerText = document.querySelector('.combat-timer-text');
							if (timerText) timerText.textContent = '';
							CombatTimer.resumeTimer(false);
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});

                // Register cleanup hook for combat deletion
                const deleteCombatHookId = HookManager.registerHook({
                    name: 'deleteCombat',
                    description: 'Combat Timer: Cleanup when combat is deleted',
                    context: 'timer-combat-cleanup',
                    priority: 3,
                    callback: () => {
                        // --- BEGIN - HOOKMANAGER CALLBACK ---
                        this.cleanupTimer();
                        this.resetTimer(false);
                        this.state.isPaused = true;
                        // --- END - HOOKMANAGER CALLBACK ---
                    }
                });

            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Could not initialize Combat Timer`, error, false, false);
            }
        });

        // Add socket ready check
        Hooks.once('blacksmith.socketReady', () => {
            postConsoleAndNotification(MODULE.NAME, "Combat Timer | Socket is ready", "", true, false);
        });
    }
    
    /**
     * Clean up timer interval
     */
    static cleanupTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this._clearCombatTimerDomCache();
    }

    static async syncState() {
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            await socket.executeForOthers("syncTimerState", this.state);
            this.updateUI();
        }
    }

    static handlePlanningTimerExpired(data) {
        // Don't handle the expiration if we're manually ending the planning timer
        if (this._endingPlanningTimer) return;

        const autoStart = game.settings.get(MODULE.ID, 'combatTimerAutoStart');
        
        this.resetTimer(false);
        this.state.isPaused = !autoStart;
        
        if (autoStart) {
            this.startTimer();
            const resumeSound = game.settings.get(MODULE.ID, 'timerPauseResumeSound');
            if (resumeSound !== 'none') {
                playSound(resumeSound, this.getTimerVolume());
            }
        } else {
            this.pauseTimer(false);
        }
    }

    static async _onRenderCombatTracker(app, html, data) {
        try {

            if (!game.combat?.started || game.combat.round === 0) {
                return;
            }

            const isEnabled = getSettingSafely(MODULE.ID, 'combatTimerEnabled', true);
            const isGMOnly = getSettingSafely(MODULE.ID, 'combatTimerGMOnly', false);


            if (isGMOnly && !game.user.isGM) {
                return;
            }

            // Check if all combatants have rolled initiative before showing combat timer
            const combatants = game.combat.turns || [];
            const combatantsNeedingInitiative = combatants.filter(c => 
                c.initiative === null && !c.isDefeated
            );
            if (combatantsNeedingInitiative.length > 0) {
                // Not all initiatives rolled yet - don't show timer
                return;
            }
            

            const timerHtml = await foundry.applications.handlebars.renderTemplate(
                'modules/coffee-pub-blacksmith/templates/timer-combat.hbs',
                {
                    enabled: isEnabled,
                    isPaused: this.state.isPaused,
                    remaining: this.state.remaining,
                    timeLimit: this.DEFAULTS.timeLimit
                }
            );
            
            
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeHtml = html;
            if (html && (html.jquery || typeof html.find === 'function')) {
                nativeHtml = html[0] || html.get?.(0) || html;
            }
            
            // Modified selector to exclude groups and look for active individual combatant (v13: native DOM)
            const activeCombatant = nativeHtml.querySelector('.combatant.active:not(.combatant-group)');
            const activeGroupMember = nativeHtml.querySelector('.group-children .combatant.active');
            // v13: Changed from #combat-tracker to .combat-tracker
            const combatTracker = nativeHtml.querySelector('.combat-tracker') || nativeHtml.querySelector('ol.combat-tracker') || nativeHtml.querySelector('#combat-tracker');
            
            // Parse HTML string into DOM element
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = timerHtml;
            const timerElement = tempDiv.firstElementChild;

            if (activeCombatant && timerElement) {
                activeCombatant.insertAdjacentElement('afterend', timerElement);
            } else if (activeGroupMember && timerElement) {
                activeGroupMember.insertAdjacentElement('afterend', timerElement);
            } else if (combatTracker && timerElement) {
                // Insert into the combat tracker list
                combatTracker.appendChild(timerElement);
            }
            
            if (isEnabled) {
                this.bindTimerEvents(nativeHtml);
            }

            this._refreshCombatTimerDomCache();
            this.updateUI();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Timer: Error rendering combat tracker", error, false, false);
        }
    }

    static bindTimerEvents(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Left click for pause/unpause (GM only) (v13: native DOM)
        nativeHtml.querySelectorAll('.combat-timer-progress').forEach(el => {
            el.addEventListener('click', (event) => {
                if (!game.user.isGM) return;
                if (event.button === 0) {
                    this.state.showingMessage = false;
                    // v13: native DOM
                    const timerText = document.querySelector('.combat-timer-text');
                    if (timerText) timerText.textContent = '';
                    this.state.isPaused ? this.resumeTimer() : this.pauseTimer();
                }
            });
        });

        // Right click for time adjustment (GM only) (v13: native DOM)
        if (game.user.isGM) {
            nativeHtml.querySelectorAll('.combat-timer-progress').forEach(el => {
                el.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    this.handleRightClick(event);
                });
            });
        } else {
            // Player turn handling (v13: native DOM)
            const progress = nativeHtml.querySelector('.combat-timer-progress');
            const combat = game.combat;
            const currentToken = combat?.combatant?.token;
            
            if (currentToken?.isOwner && progress) {
                // Active player - Add class to progress bar (v13: native DOM)
                progress.classList.add('player-turn');
                
                // Create and add overlay (v13: native DOM)
                const overlay = document.createElement('div');
                overlay.className = 'combat-timer-end-turn-overlay';
                overlay.innerHTML = '<div class="overlay-text">END TURN <i class="fa-solid fa-right"></i></div>';
                
                // Add click handler to overlay (v13: native DOM)
                overlay.addEventListener('click', () => {
                    if (currentToken?.isOwner) {
                        combat?.nextTurn();
                    }
                });
                
                progress.appendChild(overlay);
            } else if (!game.user.isGM && progress) {
                // Non-active player - Add hurry up overlay
                const currentPlayerName = combat?.combatant?.name || 'Unknown';
                const currentActor = combat?.combatant?.actor || null;

                const overlay = document.createElement('div');
                overlay.className = 'combat-timer-hurry-overlay';
                overlay.innerHTML = `<div class="overlay-text"><i class="fa-solid fa-rabbit-running"></i> TELL ${currentPlayerName} TO HURRY UP!</div>`;

                // Nudge routing (toast/chat/both, sound included) lives in the
                // shared helper — see notifyHurryUp in the Notifications settings.
                // The tracker overlay is table banter, so it BLASTS — matching
                // its pre-toast behavior of razzing via public chat.
                overlay.addEventListener('click', () => {
                    void sendHurryUpNudge(currentPlayerName, currentActor, 'blast');
                });
                
                progress.appendChild(overlay);
                progress.classList.add('other-player-turn');
            }
        }
    }

    static handleRightClick(event) {
        if (!game.user.isGM) return;
        
        const bar = event.currentTarget;
        const rect = bar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        
        const timeLimit = game.settings.get(MODULE.ID, 'combatTimerDuration') ?? this.DEFAULTS.timeLimit;
        const newTime = Math.round(timeLimit * percentage);
        
        this.setTime(newTime);
    }

    static setTime(newTime) {
        this.state.remaining = Math.max(0, newTime);
        this.state.showingMessage = false;
        this.state.hasHandledCritical = false;
        
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
            this.cleanupTimer();
            this.timer = setInterval(() => this.tick(), 1000);
        }
        
        this.updateUI();
        if (game.user.isGM) {
            this.syncState();

            // Notify all clients using SocketManager
            const socket = SocketManager.getSocket();
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
        
        if (!game.user.isGM) {
            return;
        }
        
        // Skip updates if we're in the process of ending the planning timer
        if (this._endingPlanningTimer) {
            return;
        }

        // Handle combat end - cleanup timers when combat stops
        if ("started" in changed && !changed.started) {
            this.cleanupTimer();
            this.resetTimer(false);
            this.state.isPaused = true;
            return;
        }

        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Only process timer logic when combat is actually started
        // This prevents timers from starting during combat creation
        if (!combat.started) return;

        // Handle round changes first - detect by explicit round property change or using our tracking
        const isRoundChanged = ("round" in changed) || (combat.round > 0 && combat.round !== this._lastProcessedRound);
        
        if (isRoundChanged) {
            // Record the end of the last turn of the previous round
            if (combat.combatant) {
                CombatStats.recordTurnEnd(combat.combatant);
            }
            
            // Update our tracking variable
            this._lastProcessedRound = combat.round;

            // Force stop any existing timer
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }

            // Reset timer and set initial state based on auto-start setting
            const autoStart = game.settings.get(MODULE.ID, 'combatTimerAutoStart');
            
            // Always reset to full time on round change
            this.resetTimer(false);
            this.state.isPaused = !autoStart;
            
            if (combat.turn === 0) {
                // Planning phase: do not start combat timer
                this.state.isPaused = true;
                this.pauseTimer(false);
            } else {
                if (autoStart) {
                    // Play start sound if configured
                    const startSound = game.settings.get(MODULE.ID, 'combatTimerStartSound');
                    if (startSound !== 'none') {
                        playSound(startSound, this.getTimerVolume());
                    }
                }
                // Start timer; will only run if not paused
                this.startTimer();
            }
            return;  // Don't process other changes on round change
        }

        // Handle turn changes
        if ("turn" in changed) {
            // Record the end of the previous turn
            const previousTurn = combat.turn - 1;
            const previousCombatant = combat.turns?.[previousTurn];
            if (previousCombatant && previousTurn >= 0) {
                CombatStats.recordTurnEnd(previousCombatant);
            }

            // Check if this is turn 0 (planning phase)
            if (combat.turn === 0) {
                this.resetTimer();
                this.state.isPaused = true;
                this.pauseTimer();
                return;
            }
            
            // Check auto-start setting
            const autoStart = game.settings.get(MODULE.ID, 'combatTimerAutoStart');
            
            // Reset timer first
            this.resetTimer();
            
            // Set initial state based on auto-start setting
            this.state.isPaused = !autoStart;
            
            // Start or pause based on setting
            if (autoStart) {
                this.resumeTimer(false);
                
                // Play start sound if configured
                const startSound = game.settings.get(MODULE.ID, 'combatTimerStartSound');
                if (startSound !== 'none') {
                    playSound(startSound, this.getTimerVolume());
                }
            } else {
                this.pauseTimer(false);
            }
        }
    }

    static getTimerVolume() {
        return game.settings.get(MODULE.ID, 'timerSoundVolume');
    }

    static startTimer(duration = null) {
        try {
            // Check if all combatants have rolled initiative before starting timer
            if (game.combat?.started) {
                const combatants = game.combat.turns || [];
                const combatantsNeedingInitiative = combatants.filter(c => 
                    c.initiative === null && !c.isDefeated
                );
                if (combatantsNeedingInitiative.length > 0) {
                    // Not all initiatives rolled yet - don't start timer or send messages
                    return;
                }
            }
            
            // If no duration provided, get from settings and update DEFAULTS
            if (duration === null) {
                duration = game.settings.get(MODULE.ID, 'combatTimerDuration') ?? this.DEFAULTS.timeLimit;
                this.DEFAULTS.timeLimit = duration;
            }
            
            this.state.remaining = duration;
            this.state.duration = duration;  // Store duration in state
            this.state.hasHandledCritical = false;
            
            if (this.timer) clearInterval(this.timer);
            
            // Reset percentage tracking
            this.previousPercentRemaining = undefined;
            
            // Force UI update before starting interval
            this.updateUI();
            
            // Only start interval if not paused
            if (!this.state.isPaused) {
                this.timer = setInterval(() => this.tick(), 1000);
                
                // Send start message if GM and setting enabled
                if (game.user.isGM && game.settings.get(MODULE.ID, 'timerChatTurnStart')) {
                    this.sendChatMessage({
                        isTimerStart: true,
                        duration: Math.floor(duration / 60)
                    });
                }
                
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
            postConsoleAndNotification(MODULE.NAME, "Combat Timer: Error in startTimer", error, false, false);
        }
    }

    static pauseTimer(sendMessage = true) {
        this.state.isPaused = true;
        this.state.showingMessage = false;
        this.state.hasHandledCritical = false;

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

        // Send chat message only if manually paused and setting enabled
        if (sendMessage && game.user.isGM && game.settings.get(MODULE.ID, 'timerChatTurnPause')) {
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

    static resumeTimer(sendMessage = true) {
        postConsoleAndNotification(MODULE.NAME, "Combat Timer | Resuming timer", "", true, false);
        
        // If we're in planning phase (turn 0), end the planning timer gracefully
        if (game.combat?.turn === 0 && !this._endingPlanningTimer) {
            // Set flag to prevent recursion
            this._endingPlanningTimer = true;
            
            // Use Hook to end the planning timer instead of direct API access
            Hooks.call('endPlanningTimer');
            
            // Resume the combat timer immediately
            this._endingPlanningTimer = false;
        }

        // Update state first
        this.state.isPaused = false;
        this.state.showingMessage = false;
        this.state.isActive = true;
        this.state.hasHandledCritical = false;

        // Only GM should handle the interval and messages
        if (game.user.isGM) {
            this.cleanupTimer();
            this.timer = setInterval(() => this.tick(), 1000);

            // Record the start time for stats
            CombatStats.recordTurnStart(game.combat?.combatant);
            // Record timer resume for stats
            CombatStats.recordTimerUnpause();
            
            // Send chat message for resume if setting enabled and manual
            if (sendMessage && game.settings.get(MODULE.ID, 'timerChatTurnPause')) {
                this.sendChatMessage({
                    isTimerResumed: true,
                    timeRemaining: this.formatTime(this.state.remaining)
                });
            }

            this.syncState();
        }

        // Play pause/resume sound if configured (for all clients)
        const pauseResumeSound = game.settings.get(MODULE.ID, 'timerPauseResumeSound');
        if (pauseResumeSound !== 'none') {
            playSound(pauseResumeSound, this.getTimerVolume());
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
            this.syncState();
        }
        
        // Update UI after state changes and sync
        this.updateUI();

        // Calculate percentage of time remaining
        const timeLimit = game.settings.get(MODULE.ID, 'combatTimerDuration');
        const percentRemaining = (this.state.remaining / timeLimit) * 100;

        // Get critical threshold
        const criticalThreshold = game.settings.get(MODULE.ID, 'combatTimerCriticalThreshold');
        
        // Track previous percentage to detect threshold crossings
        const previousPercentRemaining = this.previousPercentRemaining ?? Infinity;
        
        // Detect when we first cross into the critical threshold
        const justEnteredCritical = previousPercentRemaining > criticalThreshold && 
                                    percentRemaining <= criticalThreshold;

        // Check critical threshold
        if (percentRemaining <= criticalThreshold) {
            // Play critical warning sound (for all clients) - only once when first entering
            if (justEnteredCritical) {
                const criticalSound = game.settings.get(MODULE.ID, 'combatTimerCriticalSound');
                if (criticalSound !== 'none') {
                    playSound(criticalSound, this.getTimerVolume());
                }
                
                // Show critical warning notification and send chat message - only once
                if (!this.state.hasHandledCritical && game.settings.get(MODULE.ID, 'combatTimerCriticalEnabled')) {
                    this.state.hasHandledCritical = true;
                    const message = game.settings.get(MODULE.ID, 'combatTimerCriticalMessage');
                    const formattedMessage = this.getFormattedMessage(message);
                    
                    // No ui.notifications banner — the critical warning is owned by the
                    // notifyCombatTimer channel (toast broadcast / chat) via sendChatMessage

                    // Send critical warning chat message if GM
                    if (game.user.isGM) {
                        this.sendChatMessage({
                            isTimerExpiringSoon: true,
                            expiringSoonMessage: formattedMessage
                        });
                    }
                }
            }
        } else {
            // Reset critical flag when we're outside the critical zone
            this.state.hasHandledCritical = false;
        }
        
        // Store current percentage for next comparison
        this.previousPercentRemaining = percentRemaining;
        
        if (this.state.remaining <= 0) {
            this.timeExpired();
        }
    }

    static updateUI() {
        try {
            const needsDomRefresh = this._isCombatTimerDomCacheStale()
                || (this._combatTimerDomCacheAllEmpty() && this.state.isActive && game.combat?.started && (game.combat?.round ?? 0) > 0);
            if (needsDomRefresh) {
                this._refreshCombatTimerDomCache();
            }

            // Denominator: configured max (same as tick/critical thresholds) so remaining never exceeds a stale DEFAULTS.duration
            const configuredLimit = game.settings.get(MODULE.ID, 'combatTimerDuration') ?? this.DEFAULTS.timeLimit;
            const timeLimit = Math.max(configuredLimit, this.state.duration || 0);
            const percentage = timeLimit > 0 ? (this.state.remaining / timeLimit) * 100 : 0;

            const allBars = this._combatTimerDomCache.bars;
            const allTexts = this._combatTimerDomCache.texts;
            const allProgressElements = this._combatTimerDomCache.progress;
            
            if (allBars.length === 0) return; // No timer bars found
            
            // Update all bars
            allBars.forEach(bar => {
                bar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
                
                // Update bar color based on percentage
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

            // Don't update text if we're showing a message
            if (this.state.showingMessage) {
                // Show expired message if timer is at 0
                if (this.state.remaining <= 0) {
                    const message = game.settings.get(MODULE.ID, 'combatTimerExpiredMessage')
                        .replace('{name}', game.combat?.combatant?.name || '');
                    allTexts.forEach(timerText => {
                        timerText.textContent = message;
                    });
                }
                return;
            }
            
            // Update all timer text elements
            let textContent;
            if (this.state.isPaused) {
                textContent = 'COMBAT TIMER PAUSED';
            } else if (this.state.remaining <= 0) {
                const message = game.settings.get(MODULE.ID, 'combatTimerExpiredMessage')
                    .replace('{name}', game.combat?.combatant?.name || '');
                textContent = message;
            } else {
                const minutes = Math.floor(this.state.remaining / 60);
                const seconds = this.state.remaining % 60;
                textContent = `${minutes}:${seconds.toString().padStart(2, '0')} REMAINING`;
            }
            
            allTexts.forEach(timerText => {
                timerText.textContent = textContent;
            });

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Timer: Error updating UI", error, false, false);
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
        const timeUpSound = game.settings.get(MODULE.ID, 'combatTimeisUpSound');
        if (timeUpSound !== 'none') {
            playSound(timeUpSound, this.getTimerVolume());
        }

        // Send the expiry announcement if enabled — no ui.notifications banner; the
        // announcement is owned by the notifyCombatTimer channel via sendChatMessage
        if (this.shouldShowNotification() && game.user.isGM) {
            const message = game.settings.get(MODULE.ID, 'combatTimerExpiredMessage');

            // Send expired chat message if setting enabled
            if (game.settings.get(MODULE.ID, 'timerChatTurnEnded')) {
                this.sendChatMessage({
                    isTimerExpired: true,
                    expiredMessage: message
                });
            }
        }

        // Auto-advance turn if enabled
        if (game.settings.get(MODULE.ID, 'combatTimerEndTurn')) {
            game.combat?.nextTurn();
            if (this.shouldShowNotification()) {
                const message = game.settings.get(MODULE.ID, 'combatTimerAutoAdvanceMessage');
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
        const overrideList = game.settings.get(MODULE.ID, 'timerNotificationOverride');
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
        return game.settings.get(MODULE.ID, 'timerShowNotifications');
    }

    static resetTimer(startTimerFlag = true) {

        // Clear any existing timer
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        
        // Reset flags
        this.state.showingMessage = false;
        this.state.hasHandledCritical = false;
        
        // Reset percentage tracking
        this.previousPercentRemaining = undefined;
        
        // Clear visual states
        this._refreshCombatTimerDomCache();
        const progressElements = this._combatTimerDomCache.progress.length
            ? this._combatTimerDomCache.progress
            : document.querySelectorAll('.combat-timer-progress');
        progressElements.forEach(el => el.classList.remove('expired'));
        
        // Start fresh timer (startTimer will send chat message if enabled)
        if (startTimerFlag) {
            this.startTimer();
        }

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
        postConsoleAndNotification(MODULE.NAME, `Combat Timer: State [${context}]`, this.state, true, false);
    }

    // Function that will be called on non-GM clients
    static receiveTimerSync(state) {
        if (!game?.user) return;
        
        if (!game.user.isGM) {
            CombatTimer.state = foundry.utils.deepClone(state);
            CombatTimer.updateUI();
        }
    }

    static async timerAdjusted(timeString) {
        // No ui.notifications here — the "timer set" announcement is owned by the
        // notifyCombatTimer channel (toast/chat) via sendChatMessage.
    }

    // Helper method for sending chat messages
    static async sendChatMessage(data) {
        // Get the current combatant name if available
        const name = game.combat?.combatant?.name || 'Unknown';

        // Format any messages that need the combatant name — shared by the toast
        // and chat halves, so this must happen before routing
        if (data.warningMessage) {
            data.warningMessage = data.warningMessage.replace('{name}', name);
        }
        if (data.expiredMessage) {
            data.expiredMessage = data.expiredMessage.replace('{name}', name);
        }

        // Pull timer label from settings so the announcement matches configured text
        const timerLabel = game.settings.get(MODULE.ID, 'combatTimerLabel') || 'Combat';

        // Route per the notifyCombatTimer channel (Notifications section) — the
        // toast half broadcasts to every client; false = no chat card either
        if (!routeTimerNotification('notifyCombatTimer', timerLabel, 'blacksmith-timer-combat', data)) return;

        // Get the GM user to send messages from
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

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

        const messageHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', messageData);

        await ChatMessage.create({
            content: messageHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            user: gmUser.id,
            speaker: { alias: gmUser.name }
        });
    }
}

export { CombatTimer };
