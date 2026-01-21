// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound, trimString } from './api-core.js';
import { CombatStats } from './stats-combat.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';

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

    static initialize() {
        Hooks.once('ready', () => {
            try {
                
                if (!game.settings.get(MODULE.ID, 'combatTimerEnabled')) {
                    return;
                }

                
                // Initialize state
                this.state = foundry.utils.deepClone(this.DEFAULTS.state);
                this.state.remaining = game.settings.get(MODULE.ID, 'combatTimerDuration') ?? 60;
                
                
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

                // Register cleanup hook for module unload
                const unloadHookId = HookManager.registerHook({
                    name: 'unloadModule',
                    description: 'Combat Timer: Cleanup on module unload',
                    context: 'timer-combat-cleanup',
                    priority: 3,
                    callback: (moduleId) => {
                        if (moduleId === MODULE.ID) {
                            this.cleanupTimer();
                            postConsoleAndNotification(MODULE.NAME, "Combat Timer | Cleaned up on module unload", "", true, false);
                        }
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

            const isEnabled = game.settings.get(MODULE.ID, 'combatTimerEnabled');
            const isGMOnly = game.settings.get(MODULE.ID, 'combatTimerGMOnly');


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
                
                const overlay = document.createElement('div');
                overlay.className = 'combat-timer-hurry-overlay';
                overlay.innerHTML = `<div class="overlay-text"><i class="fa-solid fa-rabbit-running"></i> TELL ${currentPlayerName} TO HURRY UP!</div>`;
                
                // Add click handler to overlay (v13: native DOM)
                overlay.addEventListener('click', () => {
                    // Get random message and replace {name} with player name when clicked
                    const randomMessage = hurryMessages[Math.floor(Math.random() * hurryMessages.length)]
                        .replace(/{name}/g, currentPlayerName);
                        
                    ChatMessage.create({
                        content: randomMessage,
                        speaker: ChatMessage.getSpeaker()
                    });

                    // Play hurry up sound if configured
                    const hurryUpSound = game.settings.get(MODULE.ID, 'hurryUpSound');
                    if (hurryUpSound !== 'none') {
                        playSound(hurryUpSound, CombatTimer.getTimerVolume());
                    }
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
        if (sendMessage && game.user.isGM && game.settings.get(MODULE.ID, 'timerChatPauseUnpause')) {
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
            if (sendMessage && game.settings.get(MODULE.ID, 'timerChatPauseUnpause')) {
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
                    
                    // Show notification if general notifications are enabled
                    if (this.shouldShowNotification()) {
                        ui.notifications.warn(formattedMessage);
                    }

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
            // Update progress bar using state duration
            const timeLimit = this.state.duration || this.DEFAULTS.timeLimit;
            const percentage = timeLimit > 0 ? (this.state.remaining / timeLimit) * 100 : 0;
            
            // v13: Find all combat timer elements in all windows (sidebar and popout)
            const allBars = [];
            const allTexts = [];
            const allProgressElements = [];
            
            // Check sidebar combat tracker
            if (ui.combat?.element) {
                const sidebarBar = ui.combat.element.querySelector('.combat-timer-bar');
                const sidebarText = ui.combat.element.querySelector('.combat-timer-text');
                const sidebarProgress = ui.combat.element.querySelectorAll('.combat-timer-progress');
                if (sidebarBar) allBars.push(sidebarBar);
                if (sidebarText) allTexts.push(sidebarText);
                sidebarProgress.forEach(el => allProgressElements.push(el));
            }
            
            // Check popout windows
            document.querySelectorAll('#combat-popout .combat-timer-bar, .combat-sidebar .combat-timer-bar').forEach(bar => {
                if (!allBars.includes(bar)) allBars.push(bar);
            });
            document.querySelectorAll('#combat-popout .combat-timer-text, .combat-sidebar .combat-timer-text').forEach(text => {
                if (!allTexts.includes(text)) allTexts.push(text);
            });
            document.querySelectorAll('#combat-popout .combat-timer-progress, .combat-sidebar .combat-timer-progress').forEach(progress => {
                if (!allProgressElements.includes(progress)) allProgressElements.push(progress);
            });
            
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

        // Show notification and send chat message if enabled
        if (this.shouldShowNotification() && game.user.isGM) {
            const message = game.settings.get(MODULE.ID, 'combatTimerExpiredMessage');
            ui.notifications.warn(message.replace('{name}', game.combat?.combatant?.name || ''));

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
        const progressElements = document.querySelectorAll('.combat-timer-progress');
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

        // Pull timer label from settings so the chat card matches configured text
        const timerLabel = game.settings.get(MODULE.ID, 'combatTimerLabel') || 'Combat';

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

        // Format any messages that need the combatant name
        if (data.warningMessage) {
            messageData.warningMessage = data.warningMessage.replace('{name}', name);
        }
        if (data.expiredMessage) {
            messageData.expiredMessage = data.expiredMessage.replace('{name}', name);
        }

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
