// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { CombatStats } from './stats-combat.js';
import { postConsoleAndNotification, playSound, trimString, formatTime } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class RoundTimer {
    static updateInterval = null;
    static isActive = false;

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, `Round Timer | Initializing`, "", false, false);
        
        // Wait for ready to ensure settings are registered
        Hooks.once('ready', () => {
                    // Register hooks
        // NOTE: renderCombatTracker hook has been consolidated into combat-tools.js via HookManager
        // This eliminates hook conflicts and improves performance
        
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
            
            // Clean up old interval if it exists
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            // Set up game activity tracking
            this.isActive = true;
            
            // Only register focus/blur handlers for GM
            if (game.user.isGM) {
                window.addEventListener('focus', () => {
                    this.isActive = true;
                    // When game becomes active, update the start timestamp to now
                    if (game.combat?.started) {
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
                    if (game.combat?.started) {
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
                    const duration = this._getCurrentRoundDuration();
                    const formattedTime = formatTime(duration || 0, "verbose");
                    // Update all instances of the timer (both sidebar and popout)
                    const elements = document.querySelectorAll('.round-timer .round-duration-time');
                    elements.forEach(element => {
                        element.textContent = formattedTime;
                    });
                }
            }, 1000); // Update every second
        });
    }

    static async _onRenderCombatTracker(app, html, data) {
        if (!game.combat?.started) return;

        const duration = this._getCurrentRoundDuration();
        const formattedTime = formatTime(duration || 0, "verbose");
        
        const timerHtml = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/timer-round.hbs',
            {
                roundDurationActual: formattedTime,
                showRoundTimer: game.settings.get(MODULE.ID, 'showRoundTimer'),
                partyStats: {
                    ...CombatStats.currentStats?.partyStats || {},
                    averageTurnTime: formatTime(CombatStats.currentStats?.partyStats?.averageTurnTime || 0, "verbose")
                }
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
        // If round changes, we need to reset our timer
        if (changed.round && changed.round !== combat.previous.round && game.user.isGM) {
            // Reset the timer stats for the new round
            const stats = {
                roundStartTimestamp: Date.now(),
                accumulatedTime: 0
            };
            game.combat.setFlag(MODULE.ID, 'stats', stats);
            // Force a full re-render when the round changes
            ui.combat.render();
        }
    }

    static _getCurrentRoundDuration() {
        if (!game.combat?.started) return 0;
        
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
} 
