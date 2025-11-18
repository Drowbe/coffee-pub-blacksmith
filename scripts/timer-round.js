// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { CombatStats } from './stats-combat.js';
import { postConsoleAndNotification, playSound, trimString, formatTime, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

/**
 * RoundTimer handles tiered timing concerns for combat rounds (no stat storage).
 */
export class RoundTimer {
    static updateInterval = null;
    static isActive = false;

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, `Round Timer | Initializing`, "", false, false);
        
        // Wait for ready to ensure settings are registered
        Hooks.once('ready', () => {
                    // Register hooks
        // Migrate updateCombat hook to HookManager for centralized control
        const hookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Round Timer: Reset round timer stats on round changes',
            priority: 3, // Normal priority - timer management
            callback: this._onUpdateCombat.bind(this),
            context: 'timer-round'
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "timer-round", true, false);
        
        // Register renderCombatTracker hook for Round Timer
        const renderHookId = HookManager.registerHook({
            name: 'renderCombatTracker',
            description: 'Round Timer: Add round duration display to combat tracker',
            priority: 3, // Normal priority - UI enhancement
            callback: this._onRenderCombatTracker.bind(this),
            context: 'timer-round'
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderCombatTracker", "timer-round", true, false);
        
        // Register cleanup hook for module unload
        const unloadHookId = HookManager.registerHook({
            name: 'unloadModule',
            description: 'Round Timer: Cleanup on module unload',
            context: 'timer-round-cleanup',
            priority: 3,
            callback: (moduleId) => {
                if (moduleId === MODULE.ID) {
                    this.cleanupTimer();
                    postConsoleAndNotification(MODULE.NAME, "Round Timer | Cleaned up on module unload", "", true, false);
                }
            }
        });
            
            // Clean up old interval if it exists
            this.cleanupTimer();

            // Set up game activity tracking
            this.isActive = true;
            
            // Only register focus/blur handlers for GM
            if (game.user.isGM) {
                window.addEventListener('focus', () => {
                    this.isActive = true;
                    // When game becomes active, update the start timestamp to now
                    if (game.combat?.started && game.combats.has(game.combat.id)) {
                        const stats = game.combat.getFlag(MODULE.ID, 'stats') || {};
                        if (stats.roundStartTimestamp) {
                            stats.roundStartTimestamp = Date.now();
                            stats.accumulatedTime = stats.accumulatedTime || 0;
                            game.combat.setFlag(MODULE.ID, 'stats', stats);
                        }
                    }
                });

                window.addEventListener('blur', () => {
                    this.isActive = false;
                    // When game becomes inactive, save the accumulated time
                    if (game.combat?.started && game.combats.has(game.combat.id)) {
                        const stats = game.combat.getFlag(MODULE.ID, 'stats') || {};
                        if (stats.roundStartTimestamp) {
                            stats.accumulatedTime = (stats.accumulatedTime || 0) + (Date.now() - stats.roundStartTimestamp);
                            game.combat.setFlag(MODULE.ID, 'stats', stats);
                        }
                    }
                });
            } else {
                // For non-GM users, just track active state without updating combat
                window.addEventListener('focus', () => {
                    this.isActive = true;
                });
                
                window.addEventListener('blur', () => {
                    this.isActive = false;
                });
            }
            
            // Start update interval
            this.updateInterval = setInterval(() => {
                if (game.combat?.started && this.isActive) {
                    const roundDuration = this._getCurrentRoundDuration();
                    const formattedRoundTime = formatTime(roundDuration || 0, "hh:mm:ss");
                    
                    const totalCombatTime = this._getTotalCombatDuration();
                    const formattedTotalTime = formatTime(totalCombatTime || 0, "hh:mm:ss");
                    
                    // Update all instances of the round timer (both sidebar and popout)
                    const roundElements = document.querySelectorAll('.round-timer-container .combat-time-round');
                    roundElements.forEach(element => {
                        element.textContent = formattedRoundTime;
                    });

                    // update the combat bar round time
                    const combatbarRoundElements = document.querySelectorAll('.combat-endcap-left .combat-time-round');
                    combatbarRoundElements.forEach(element => {
                        element.textContent = formattedRoundTime;
                    });

                    // Update all instances of the total combat time
                    const totalElements = document.querySelectorAll('.round-timer-container .combat-time-total');
                    totalElements.forEach(element => {
                        element.textContent = formattedTotalTime;
                    });

                    // update the combat bar total time
                    const combatbarTotalElements = document.querySelectorAll('.combat-endcap-right .combat-time-total');
                    combatbarTotalElements.forEach(element => {
                        element.textContent = formattedTotalTime;
                    });



                }
            }, 1000); // Update every second
        });
    }

    static async _onRenderCombatTracker(app, html, data) {
        if (!game.combat?.started) return;

        const roundDuration = this._getCurrentRoundDuration();
        const formattedRoundTime = formatTime(roundDuration || 0, "hh:mm:ss");
        
        // Calculate total combat time
        const totalCombatTime = this._getTotalCombatDuration();
        const formattedTotalTime = formatTime(totalCombatTime || 0, "hh:mm:ss");
        
        const timerHtml = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/timer-round.hbs',
            {
                roundDurationActual: formattedRoundTime,
                totalCombatDuration: formattedTotalTime,
                showRoundTimer: getSettingSafely(MODULE.ID, 'showRoundTimer', false)
            }
        );
        
        // Find the encounter title (which contains the round number) and insert after it
        const roundTitle = html.find('.encounter-title');
        if (roundTitle.length) {
            // Insert after the encounter controls div to place it between the round number and planning timer
            const encounterControls = html.find('.encounter-controls');
            if (encounterControls.length) {
                encounterControls.after(timerHtml);
            }
        }
    }

    static _onUpdateCombat(combat, changed, options, userId) {
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;
        
        // If round changes, we need to reset our timer
        if (changed.round && changed.round !== combat.previous.round && game.user.isGM) {
            // Get current stats before resetting
            const currentStats = game.combat.getFlag(MODULE.ID, 'stats') || {};
            
            // Calculate the duration of the previous round
            const previousRoundDuration = this._getCurrentRoundDuration();
            
            // Get or initialize total combat duration
            const totalCombatDuration = game.combat.getFlag(MODULE.ID, 'totalCombatDuration') || 0;
            
            // Add the previous round's duration to the total
            const newTotalCombatDuration = totalCombatDuration + previousRoundDuration;
            
            // Reset the timer stats for the new round
            const stats = {
                roundStartTimestamp: Date.now(),
                accumulatedTime: 0
            };
            game.combat.setFlag(MODULE.ID, 'stats', stats);
            
            // Save the updated total combat duration
            game.combat.setFlag(MODULE.ID, 'totalCombatDuration', newTotalCombatDuration);
            
            // Force a full re-render when the round changes
            ui.combat.render();
        }
    }

    static _getCurrentRoundDuration() {
        if (!game.combat?.started || !game.combats.has(game.combat.id)) return 0;
        
        // Get the current stats from combat flags
        const stats = game.combat.getFlag(MODULE.ID, 'stats') || {};
        
        // If no timestamp exists, return 0
        if (!stats.roundStartTimestamp) {
            return 0;
        }
        
        // Calculate total duration: accumulated time + current active session time
        const currentSessionTime = this.isActive ? (Date.now() - stats.roundStartTimestamp) : 0;
        return (stats.accumulatedTime || 0) + currentSessionTime;
    }

    static _getTotalCombatDuration() {
        if (!game.combat?.started || !game.combats.has(game.combat.id)) return 0;
        
        // Get the accumulated total from all previous rounds
        const totalCombatDuration = game.combat.getFlag(MODULE.ID, 'totalCombatDuration') || 0;
        
        // Add the current round duration
        const currentRoundDuration = this._getCurrentRoundDuration();
        
        return totalCombatDuration + currentRoundDuration;
    }
    
    /**
     * Clean up timer interval
     */
    static cleanupTimer() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
} 
