// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { CombatStats } from './stats-combat.js';
import { postConsoleAndNotification, playSound, trimString, formatTime, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

/**
 * Combat flag owned solely by RoundTimer: `{ startedAt, accumulatedTime }`.
 * Kept separate from the `stats` flag (owned by stats-combat.js) because the two subsystems
 * store different quantities under what used to be the same key — stats-combat writes `stats`
 * wholesale, which silently dropped this timer's `accumulatedTime`.
 */
const ROUND_TIMER_FLAG = 'roundTimer';

/**
 * RoundTimer handles tiered timing concerns for combat rounds (no stat storage).
 */
export class RoundTimer {
    static updateInterval = null;
    static isActive = false;

    /** Cached text nodes — refreshed when combat tracker renders or when refs go stale */
    static _roundTimerDomCache = {
        round: [],
        combatbarRound: [],
        total: [],
        combatbarTotal: []
    };

    static _refreshRoundTimerDomCache() {
        const c = this._roundTimerDomCache;
        c.round = Array.from(document.querySelectorAll('.round-timer-container .combat-time-round'));
        c.combatbarRound = Array.from(document.querySelectorAll('.combat-endcap-left .combat-time-round'));
        c.total = Array.from(document.querySelectorAll('.round-timer-container .combat-time-total'));
        c.combatbarTotal = Array.from(document.querySelectorAll('.combat-endcap-right .combat-time-total'));
    }

    static _clearRoundTimerDomCache() {
        const c = this._roundTimerDomCache;
        c.round = [];
        c.combatbarRound = [];
        c.total = [];
        c.combatbarTotal = [];
    }

    static _isRoundTimerDomCacheStale() {
        const c = this._roundTimerDomCache;
        for (const key of ['round', 'combatbarRound', 'total', 'combatbarTotal']) {
            for (const el of c[key]) {
                if (!el.isConnected) return true;
            }
        }
        return false;
    }

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, `Round Timer | Initializing`, "", false, false);
        
        // Wait for ready to ensure settings are registered
        Hooks.once('ready', () => {
            if (!getSettingSafely(MODULE.ID, 'showRoundTimer', true)) {
                postConsoleAndNotification(MODULE.NAME, "Round Timer | Disabled, skipping initialization", "", true, false);
                return;
            }

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
        
            // Clean up old interval if it exists
            this.cleanupTimer();

            // Set up game activity tracking
            this.isActive = true;
            
            // Only register focus/blur handlers for GM
            if (game.user.isGM) {
                window.addEventListener('focus', () => {
                    this.isActive = true;
                    // Resume: begin a new active session from now; banked time is unchanged.
                    if (game.combat?.started && game.combats.has(game.combat.id)) {
                        const { startedAt, accumulatedTime } = this._getRoundTiming();
                        if (startedAt) this._setRoundTiming(Date.now(), accumulatedTime);
                    }
                });

                window.addEventListener('blur', () => {
                    this.isActive = false;
                    // Pause: bank the elapsed active session.
                    if (game.combat?.started && game.combats.has(game.combat.id)) {
                        const { startedAt, accumulatedTime } = this._getRoundTiming();
                        if (startedAt) {
                            this._setRoundTiming(startedAt, accumulatedTime + (Date.now() - startedAt));
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
                    if (this._isRoundTimerDomCacheStale()) {
                        this._refreshRoundTimerDomCache();
                    }

                    const roundDuration = this._getCurrentRoundDuration();
                    const formattedRoundTime = formatTime(roundDuration || 0, "hh:mm:ss");
                    
                    const totalCombatTime = this._getTotalCombatDuration();
                    const formattedTotalTime = formatTime(totalCombatTime || 0, "hh:mm:ss");
                    
                    const c = this._roundTimerDomCache;
                    c.round.forEach((el) => { el.textContent = formattedRoundTime; });
                    c.combatbarRound.forEach((el) => { el.textContent = formattedRoundTime; });
                    c.total.forEach((el) => { el.textContent = formattedTotalTime; });
                    c.combatbarTotal.forEach((el) => { el.textContent = formattedTotalTime; });
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
        
        const timerHtml = await foundry.applications.handlebars.renderTemplate(
            'modules/coffee-pub-blacksmith/templates/timer-round.hbs',
            {
                roundDurationActual: formattedRoundTime,
                totalCombatDuration: formattedTotalTime,
                showRoundTimer: getSettingSafely(MODULE.ID, 'showRoundTimer', false)
            }
        );
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Find the encounter title (which contains the round number) and insert after it (v13: native DOM)
        const roundTitle = nativeHtml.querySelector('.encounter-title');
        if (roundTitle) {
            // Insert after the encounter controls div to place it between the round number and planning timer
            const encounterControls = nativeHtml.querySelector('.encounter-controls');
            if (encounterControls) {
                // Parse HTML string into DOM element
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = timerHtml;
                const timerElement = tempDiv.firstElementChild;
                if (timerElement) {
                    encounterControls.insertAdjacentElement('afterend', timerElement);
                }
            }
        }

        this._refreshRoundTimerDomCache();
    }

    static _onUpdateCombat(combat, changed, options, userId) {
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;
        
        // If round changes, we need to reset our timer
        if (changed.round && changed.round !== combat.previous.round && game.user.isGM) {
            // Calculate the duration of the previous round
            const previousRoundDuration = this._getCurrentRoundDuration();
            
            // Get or initialize total combat duration
            const totalCombatDuration = game.combat.getFlag(MODULE.ID, 'totalCombatDuration') || 0;
            
            // Add the previous round's duration to the total
            const newTotalCombatDuration = totalCombatDuration + previousRoundDuration;
            
            // Reset this timer's own state for the new round. The `stats` flag is not touched here —
            // it belongs to stats-combat.js.
            this._setRoundTiming(Date.now(), 0);

            // Save the updated total combat duration
            game.combat.setFlag(MODULE.ID, 'totalCombatDuration', newTotalCombatDuration);
            
            // Force a full re-render when the round changes
            ui.combat.render();
        }
    }

    /**
     * Read this round's timing state from the combat flag this timer owns.
     *
     * `startedAt` is the current *active session* start (reset on focus), not the wall-clock start
     * of the round — `stats-combat.js` owns that, under its own `stats` flag. Keeping the two apart
     * is deliberate: they are different quantities that were previously stored under one key.
     *
     * Falls back to the legacy fields on the shared `stats` flag so combats already in flight when
     * this shipped keep their elapsed time. Remove the fallback a release after it lands.
     *
     * @returns {{startedAt: number, accumulatedTime: number}}
     */
    static _getRoundTiming() {
        const combat = game.combat;
        if (!combat) return { startedAt: 0, accumulatedTime: 0 };

        const timing = combat.getFlag(MODULE.ID, ROUND_TIMER_FLAG);
        if (timing && typeof timing === 'object') {
            return { startedAt: timing.startedAt || 0, accumulatedTime: timing.accumulatedTime || 0 };
        }

        const legacy = combat.getFlag(MODULE.ID, 'stats') || {};
        return {
            startedAt: legacy.roundStartTimestamp || 0,
            accumulatedTime: legacy.accumulatedTime || 0
        };
    }

    /** Write this round's timing state to the flag this timer owns. */
    static _setRoundTiming(startedAt, accumulatedTime) {
        if (!game.combat) return;
        game.combat.setFlag(MODULE.ID, ROUND_TIMER_FLAG, { startedAt, accumulatedTime });
    }

    /** Elapsed time for the current round, in ms. Public: the combat bar reads this. */
    static getCurrentRoundDuration() {
        return this._getCurrentRoundDuration();
    }

    static _getCurrentRoundDuration() {
        if (!game.combat?.started || !game.combats.has(game.combat.id)) return 0;

        const { startedAt, accumulatedTime } = this._getRoundTiming();
        if (!startedAt) return 0;

        // Total duration: time banked from previous active sessions + the running one.
        const currentSessionTime = this.isActive ? (Date.now() - startedAt) : 0;
        return accumulatedTime + currentSessionTime;
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
        this._clearRoundTimerDomCache();
    }
} 
