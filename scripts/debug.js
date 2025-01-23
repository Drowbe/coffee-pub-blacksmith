// Import MODULE variables
import { MODULE_ID } from './const.js';

export class CombatStatsDebug {
    static DEBUG_CATEGORIES = {
        COMBAT: {
            START: 'combat_start',
            END: 'combat_end',
            ROUND: 'round_update'
        },
        STATS: {
            DAMAGE: 'damage_update',
            HEALING: 'healing_update',
            ATTACKS: 'attack_update',
            TURNS: 'turn_update'
        },
        MVP: {
            CALCULATION: 'mvp_calc',
            SELECTION: 'mvp_selection'
        }
    };

    static debugLog(category, data) {
        if (!game.settings.get(MODULE_ID, 'enableDebugLogs')) return;
        
        const debugInfo = {
            timestamp: new Date().toISOString(),
            category,
            data
        };
        
        console.log(`Combat Stats Debug [${category}]:`, debugInfo);
    }

    static validateStats(stats, category) {
        const original = foundry.utils.deepClone(stats);
        const corrected = foundry.utils.deepClone(stats);
        let hasChanges = false;

        // Basic value validations
        if (corrected.damage) {
            if (corrected.damage.dealt < 0) {
                corrected.damage.dealt = 0;
                hasChanges = true;
            }
            if (corrected.damage.taken < 0) {
                corrected.damage.taken = 0;
                hasChanges = true;
            }
        }

        if (corrected.healing) {
            if (corrected.healing.given < 0) {
                corrected.healing.given = 0;
                hasChanges = true;
            }
            if (corrected.healing.received < 0) {
                corrected.healing.received = 0;
                hasChanges = true;
            }
        }

        // Validate derived calculations
        if (corrected.attacks) {
            // Validate hit/miss ratio
            const totalAttempts = (corrected.attacks.hits || 0) + (corrected.attacks.misses || 0);
            if (corrected.attacks.total !== totalAttempts) {
                corrected.attacks.total = totalAttempts;
                hasChanges = true;
            }

            // Validate rolls if they exist
            if (corrected.attacks.rolls) {
                if (corrected.attacks.total > 0 && corrected.attacks.rolls.total) {
                    const expectedAverage = corrected.attacks.rolls.total / corrected.attacks.total;
                    if (Math.abs(corrected.attacks.rolls.average - expectedAverage) > 0.01) {
                        corrected.attacks.rolls.average = expectedAverage;
                        hasChanges = true;
                    }
                }

                // Ensure highest is actually highest
                if (corrected.attacks.rolls.highest < corrected.attacks.rolls.average) {
                    corrected.attacks.rolls.highest = corrected.attacks.rolls.average;
                    hasChanges = true;
                }

                // Ensure lowest is actually lowest
                if (corrected.attacks.rolls.lowest > corrected.attacks.rolls.average) {
                    corrected.attacks.rolls.lowest = corrected.attacks.rolls.average;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            this._notifyValidationIssue(category, original, corrected);
        }

        return corrected;
    }

    static _notifyValidationIssue(category, original, corrected) {
        ui.notifications.warn('Combat Stats: Data validation issues detected. Check console log for details.');
        
        console.log('Combat Stats Validation Issue:', {
            category,
            timestamp: new Date().toISOString(),
            original,
            corrected,
            trace: new Error().stack
        });
    }
} 