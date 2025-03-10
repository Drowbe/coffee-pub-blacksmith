// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { CombatStats } from './combat-stats.js';
import { COFFEEPUB, postConsoleAndNotification, playSound, trimString, formatTime } from './global.js';

export class RoundTimer {
    static updateInterval = null;

    static initialize() {
        postConsoleAndNotification(`Round Timer | Initializing`);
        
        // Wait for ready to ensure settings are registered
        Hooks.once('ready', () => {
            // Register hooks
            Hooks.on('renderCombatTracker', this._onRenderCombatTracker.bind(this));
            Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
            
            // Clean up old interval if it exists
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
            // Start update interval
            this.updateInterval = setInterval(() => {
                if (game.combat?.started) {
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
            'modules/coffee-pub-blacksmith/templates/round-timer.hbs',
            {
                roundDurationActual: formattedTime,
                showRoundTimer: game.settings.get(MODULE_ID, 'showRoundTimer'),
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
        if (changed.round && changed.round !== combat.previous.round) {
            // Force a full re-render when the round changes
            ui.combat.render();
        }
    }

    static _getCurrentRoundDuration() {
        if (!game.combat?.started) return 0;
        
        // Get the current stats from combat flags
        const stats = game.combat.getFlag(MODULE_ID, 'stats') || {};
        const now = Date.now();
        
        // If no timestamp exists, return 0
        if (!stats.roundStartTimestamp) {
            return 0;
        }
        
        return now - stats.roundStartTimestamp;
    }
} 