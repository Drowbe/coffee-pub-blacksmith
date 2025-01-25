// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';

export class RoundTimer {
    static initialize() {
        console.log(`${MODULE_TITLE} | Round Timer | Initializing`);
        
        // Register hooks
        Hooks.on('renderCombatTracker', this._onRenderCombatTracker.bind(this));
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
    }

    static async _onRenderCombatTracker(app, html, data) {
        if (!game.combat?.started) return;

        const timerHtml = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/round-timer.hbs',
            {
                roundDuration: this._formatTime(this._getCurrentRoundDuration())
            }
        );
        
        // Find the round number element and insert after it
        const roundNumber = html.find('.combat-round');
        if (roundNumber.length) {
            roundNumber.after(timerHtml);
        }
    }

    static _onUpdateCombat(combat, changed, options, userId) {
        // Re-render the combat tracker to update the timer
        ui.combat.render();
    }

    static _getCurrentRoundDuration() {
        if (!game.combat?.started) return 0;
        
        const stats = game.combat.getFlag('coffee-pub-blacksmith', 'stats') || {};
        const roundStartTimestamp = stats.roundStartTimestamp || Date.now();
        
        return Date.now() - roundStartTimestamp;
    }

    static _formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
} 