/**
 * Tier 1 & 2 statistics manager for Coffee Pub Blacksmith.
 * - Tracks round-scoped data (ephemeral) and combat-scoped aggregates.
 * - Generates round chat summaries and end-of-combat summaries for the API.
 * - Emits `blacksmith.combatSummaryReady` so lifetime consumers can update.
 */

// Import MODULE variables
import { MODULE } from './const.js';
import { getPortraitImage, isPlayerCharacter, postConsoleAndNotification, playSound, getSettingSafely } from './api-core.js';
import { PlanningTimer } from './timer-planning.js';
import { CombatTimer } from './timer-combat.js';
import { HookManager } from './manager-hooks.js';
import { SocketManager } from './manager-sockets.js';
//import { MVPDescriptionGenerator } from './mvp-description-generator.js';
import { MVPTemplates } from '../resources/assets.js';

// Helper function to get actor portrait
function getActorPortrait(combatant) {
    if (!combatant) return "icons/svg/mystery-man.svg";
    const actor = combatant.actor;
    if (!actor) return "icons/svg/mystery-man.svg";
    return getPortraitImage(actor) || "icons/svg/mystery-man.svg";
}

class CombatStats {
    static currentStats = null;
    static combatStats = null;
    static _lastRollWasCritical = false;
    static _processedCombats = new Set();
    
    static DEFAULTS = {
        roundStats: {
            roundStartTime: Date.now(),
            roundStartTimestamp: 0,  // New field to track actual wall-clock start time
            planningStartTime: Date.now(),
            turnStartTime: Date.now(),
            actualRoundStartTime: 0,
            actualPlanningStartTime: 0,
            actualPlanningEndTime: 0,
            firstPlayerStartTime: 0,
            activeRoundTime: 0,
            activePlanningTime: 0,
            lastUnpauseTime: 0,
            hits: [],
            misses: [],
            expiredTurns: [],
            partyStats: {
                hits: 0,
                misses: 0,
                damageDealt: 0,
                damageTaken: 0,
                healingDone: 0,
                turnTimes: [],
                averageTurnTime: 0
            },
            notableMoments: {
                biggestHit: { amount: 0, actor: null },
                mostDamage: { amount: 0 },
                biggestHeal: { amount: 0 },
                longestTurn: { duration: 0 },
                mostHurt: { amount: 0 },
                weakestHit: { amount: 0, actor: null },
                mostHealing: { amount: 0, actor: null },
                quickestTurn: { duration: 0, actor: null }
            }
        },
        combatStats: {
            startTime: Date.now(),
            participantStats: {},
            totals: {
                damage: { dealt: 0, taken: 0 },
                healing: { given: 0, received: 0 },
                attacks: {
                    attempts: 0,
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0
                }
            },
            rounds: [],
            longestTurn: { duration: 0 },
            fastestTurn: { duration: Infinity },
            topHits: [],  // Top N hits during combat (sorted by amount, descending)
            topHeals: []  // Top N heals during combat (sorted by amount, descending)
        }
    };

    // -------------------------------------------------------------------------
    // Utility helpers
    // -------------------------------------------------------------------------

    // Bounded push helper to prevent unbounded array growth
    static _boundedPush(array, item, maxSize = 1000) {
        array.push(item);
        if (array.length > maxSize) {
            array.shift(); // Remove oldest item if over limit
        }
    }

    /**
     * Maintain a sorted top N list (e.g., top hits, top heals)
     * Inserts item into sorted array and keeps only top N items
     * @param {Array} sortedArray - Array to maintain (must be sorted descending)
     * @param {Object} item - Item to potentially add
     * @param {Function} extractValue - Function to extract comparison value from item
     * @param {number} maxSize - Maximum number of items to keep (default: 5)
     */
    static _maintainTopN(sortedArray, item, extractValue, maxSize = 5) {
        if (!sortedArray) sortedArray = [];
        
        const itemValue = extractValue(item);
        
        // If array is not full, just insert and sort
        if (sortedArray.length < maxSize) {
            sortedArray.push(item);
            sortedArray.sort((a, b) => extractValue(b) - extractValue(a)); // Descending
            return;
        }
        
        // If array is full, check if this item should replace the smallest
        const smallestValue = extractValue(sortedArray[sortedArray.length - 1]);
        if (itemValue > smallestValue) {
            // Remove smallest and insert new item
            sortedArray.pop();
            sortedArray.push(item);
            sortedArray.sort((a, b) => extractValue(b) - extractValue(a)); // Re-sort descending
        }
    }

    static _computeMvpScore({ hits = 0, crits = 0, fumbles = 0, damage = 0, healing = 0 }) {
        const rawScore = (hits * 2) + (crits * 3) + (damage * 0.1) + (healing * 0.2) - (fumbles * 2);
        return Number(rawScore.toFixed(1));
    }

    static _ensureCombatTotals() {
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        if (!this.combatStats.totals) {
            this.combatStats.totals = foundry.utils.deepClone(this.DEFAULTS.combatStats.totals);
        } else {
            this.combatStats.totals.damage = this.combatStats.totals.damage || { dealt: 0, taken: 0 };
            this.combatStats.totals.healing = this.combatStats.totals.healing || { given: 0, received: 0 };
            this.combatStats.totals.attacks = this.combatStats.totals.attacks || {
                attempts: 0,
                hits: 0,
                misses: 0,
                crits: 0,
                fumbles: 0
            };
        }
    }

    static _ensureParticipantStats(actor, { includeCurrent = true, includeCombat = true } = {}) {
        if (!actor) return { current: null, combat: null };

        if (includeCurrent) {
            if (!this.currentStats) this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            if (!this.currentStats.participantStats) this.currentStats.participantStats = {};
        }

        if (includeCombat) {
            if (!this.combatStats) this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
            if (!this.combatStats.participantStats) this.combatStats.participantStats = {};
            this._ensureCombatTotals();
        }

        const defaultCurrentParticipantStats = {
            name: actor.name,
            damage: { dealt: 0, taken: 0 },
            healing: { given: 0, received: 0 },
            combat: {
                attacks: {
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0,
                    attempts: 0
                }
            },
            turnDuration: 0,
            lastTurnExpired: false,
            hits: [],
            misses: []
        };

        const defaultCombatParticipantStats = {
            name: actor.name,
            damage: { dealt: 0, taken: 0 },
            healing: { given: 0, received: 0 },
            combat: {
                attacks: {
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0,
                    attempts: 0
                }
            },
            turnDuration: 0
        };

        if (includeCurrent) {
            if (!this.currentStats.participantStats[actor.id]) {
                // Use real defaults, not this.DEFAULTS.roundStats.participantStats (it doesn't exist)
                this.currentStats.participantStats[actor.id] = foundry.utils.deepClone(defaultCurrentParticipantStats);
            }

            // Guarantee required shape
            const ps = this.currentStats.participantStats[actor.id];
            ps.name ??= actor.name;
            ps.damage ??= { dealt: 0, taken: 0 };
            ps.healing ??= { given: 0, received: 0 };
            ps.combat ??= {};
            ps.combat.attacks ??= { hits: 0, misses: 0, crits: 0, fumbles: 0, attempts: 0 };
            ps.hits = Array.isArray(ps.hits) ? ps.hits : [];
            ps.misses = Array.isArray(ps.misses) ? ps.misses : [];
        }

        if (includeCombat) {
            if (!this.combatStats.participantStats[actor.id]) {
                this.combatStats.participantStats[actor.id] = foundry.utils.deepClone(defaultCombatParticipantStats);
            } else if (!this.combatStats.participantStats[actor.id].combat?.attacks) {
                this.combatStats.participantStats[actor.id].combat = foundry.utils.deepClone(defaultCombatParticipantStats.combat);
            }
        }

        return {
            current: includeCurrent ? this.currentStats.participantStats[actor.id] : null,
            combat: includeCombat ? this.combatStats.participantStats[actor.id] : null
        };
    }

    /**
     * Initialize combat stat tracking for the active GM.
     * Sets up default structures, registers helpers, and subscribes to hooks.
     */
    static initialize() {
        // Only initialize if this is the GM and stats tracking is enabled
        if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;

        postConsoleAndNotification(MODULE.NAME, "Initializing Combat Stats | trackCombatStats:", getSettingSafely(MODULE.ID, 'trackCombatStats', false), true, false);

        // Check for existing stats in combat flags
        const existingStats = game.combat?.getFlag(MODULE.ID, 'stats');
        
        // Initialize stats objects - use existing stats if available, otherwise use defaults
        this.currentStats = existingStats || foundry.utils.deepClone(this.DEFAULTS.roundStats);
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        
        // Ensure Maps are properly initialized
        this.currentStats.turnStartTimes = new Map();
        this.currentStats.turnEndTimes = new Map();

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats:', {
            currentStats: this.currentStats,
            notableMoments: this.currentStats.notableMoments,
            existingStats: existingStats
        }, true, false);

        // Register Handlebars helpers
        this.registerHelpers();

        // Register hooks
        this._registerHooks();
    }

    static async _onUpdateCombat(combat, changed, options, userId) {
        // Only process combat updates if this is the GM
        if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;

        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Detect combat ending via update (active flag turned off)
        if (changed.active === false && combat.previous?.active !== false) {
            await this._onCombatEnd(combat, options, userId);
            return;
        }

        if (!game.combat?.started) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        const currentCombatant = combat.combatant;
        const previousCombatant = combat.turns[combat.previous?.turn] || null;

        // Track round changes - only trigger at the end of a round
        if (changed.round && changed.round > combat.previous.round) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Round Change Detected:', {
                from: combat.previous.round,
                to: changed.round,
                currentStats: this.currentStats
            }, true, false);
            
            // Only call _onRoundEnd when we're actually ending a round (not starting a new one)
            if (combat.previous.round >= 1) {
                await this._onRoundEnd(combat.previous.round);
            }
            this._onRoundStart(combat);
        }

        // Track turn changes
        if (changed.turn !== undefined && changed.turn !== combat.previous.turn) {
            this._onTurnChange(combat, currentCombatant, previousCombatant);
        }
    }

    static _onRoundStart(combat) {
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;
        
        // Handle stats tracking if enabled
        if (game.user.isGM && getSettingSafely(MODULE.ID, 'trackCombatStats', false)) {
            // Ensure currentStats is initialized before overwriting
            if (!this.currentStats) {
                this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            }
            
            // Initialize new round stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            // Ensure Maps are properly initialized
            this.currentStats.turnStartTimes = new Map();
            this.currentStats.turnEndTimes = new Map();
            this.currentStats.roundStartTime = Date.now();
            this.currentStats.roundStartTimestamp = Date.now();  // Set the wall-clock start time
            this.currentStats.planningStartTime = Date.now();

            // Save the stats to combat flags
            game.combat.setFlag(MODULE.ID, 'stats', this.currentStats);

            postConsoleAndNotification(MODULE.NAME, "Round Started | Combat:", {
                round: {
                    number: combat.round,
                    startTime: this.currentStats.roundStartTime,
                    combatants: combat.turns.map(t => ({
                        name: t.name,
                        initiative: t.initiative
                    }))
                }
            }, true, false);
        }

        // Handle round announcement if enabled (independent of stats tracking)
        if (game.user.isGM && getSettingSafely(MODULE.ID, 'announceNewRounds', false)) {
            this._announceNewRound(combat);
        }
    }

    // New method to handle round announcements
    static async _announceNewRound(combat) {
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;
        
        try {
            // Use the current round number (no need to subtract 1 since this is announcing the start)
            const roundNumber = combat.round;

            // Prepare template data
            const templateData = {
                roundNumber: roundNumber  // Use the same property name as in _onRoundEnd
            };

            // Render the template
            const content = await foundry.applications.handlebars.renderTemplate('modules/' + MODULE.ID + '/templates/cards-common.hbs', {
                ...templateData,
                isPublic: true,
                isRoundAnnouncement: true
            });

            // Create chat message
            await ChatMessage.create({
                content: content,
                speaker: { alias: "Game Master" }
            });

            // Play sound if configured
            const soundId = game.settings.get(MODULE.ID, 'newRoundSound');
            if (soundId && soundId !== 'none') {
                const volume = game.settings.get(MODULE.ID, 'timerSoundVolume');
                try {
                    await playSound(soundId, volume);
                } catch (soundError) {
                    // Silently handle sound playback errors (non-critical)
                    // Errors are already logged by playSound function
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error announcing new round', error, false, false);
        }
    }

    static _onTurnChange(combat, currentCombatant, previousCombatant) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        // Ensure arrays are initialized
        if (!this.currentStats.expiredTurns) {
            this.currentStats.expiredTurns = [];
        }

        // Calculate duration based on progress bar position or expiration
        const totalAllowedTime = game.settings.get(MODULE.ID, 'combatTimerDuration');
        const isExpired = CombatTimer.state?.expired || CombatTimer.state?.remaining === 0;
        const duration = isExpired 
            ? totalAllowedTime * 1000  // Use full duration if expired
            : ((totalAllowedTime - (CombatTimer.state?.remaining ?? 0)) * 1000);  // Otherwise calculate from remaining time
        
        // Record expired turn if it exceeded the time limit
        if (previousCombatant && isExpired) {
            this._boundedPush(this.currentStats.expiredTurns, {
                actor: previousCombatant.name,
                round: combat.round,
                duration: duration
            });
        }

        // Update timing stats
        this.currentStats.turnStartTime = Date.now();

        postConsoleAndNotification(MODULE.NAME, "Turn Changed | Stats:", {
            turn: {
                current: currentCombatant?.name,
                previous: previousCombatant?.name,
                round: combat.round,
                duration: duration,
                expired: isExpired
            }
        }, true, false);

        // Add notable moment tracking for turn duration
        if (previousCombatant) {
            this._updateNotableMoments('turn', {
                actorId: previousCombatant.actorId,
                actorName: previousCombatant.name,
                duration: duration
            });
        }

        // Only include player character turns in the average
        if (previousCombatant && this._isPlayerCharacter(previousCombatant)) {
            // Initialize turnTimes as an object if it's still an array
            if (Array.isArray(this.currentStats.partyStats.turnTimes)) {
                this.currentStats.partyStats.turnTimes = {};
            }
            
            // Store duration by combatant ID
            this.currentStats.partyStats.turnTimes[previousCombatant.id] = duration;
            
            // Calculate average from all player character turns
            const turnTimes = Object.values(this.currentStats.partyStats.turnTimes);
            this.currentStats.partyStats.averageTurnTime = 
                turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length;

            postConsoleAndNotification(MODULE.NAME, 'Average Turn Time Update:', {
                turnTimes: this.currentStats.partyStats.turnTimes,
                newAverage: this.currentStats.partyStats.averageTurnTime
            }, true, false);
        }
    }

    /**
     * Generate combat summary from combatStats
     * Creates aggregated summary with top N moments and MVP rankings (no full event arrays)
     * @param {Combat} combat - The combat object
     * @returns {Object} Combat summary with metadata, aggregates, and top moments
     */
    static _generateCombatSummary(combat) {
        const combatDuration = Date.now() - this.combatStats.startTime;
        const scene = combat.scene ? game.scenes.get(combat.scene) : null;
        const sceneName = scene ? scene.name : 'Unknown Scene';

        // Extract participant summaries (aggregates only, no arrays)
        const participantSummaries = Object.entries(this.combatStats.participantStats || {}).map(([actorId, stats]) => {
            const attackStats = stats.combat?.attacks || {
                hits: 0,
                misses: 0,
                crits: 0,
                fumbles: 0,
                attempts: 0
            };
            const hitCount = attackStats.hits || 0;
            const missCount = attackStats.misses || Math.max(0, (attackStats.attempts || 0) - hitCount);
            return {
                actorId,
                name: stats.name || 'Unknown',
                damageDealt: stats.damage?.dealt || 0,
                damageTaken: stats.damage?.taken || 0,
                healingGiven: stats.healing?.given || 0,
                healingReceived: stats.healing?.received || 0,
                hits: hitCount,
                misses: missCount,
                totalAttacks: attackStats.attempts || (hitCount + missCount),
                criticals: attackStats.crits || 0,
                fumbles: attackStats.fumbles || 0
            };
        });

        // Extract top N moments from combatStats.topHits and topHeals (maintained during combat)
        const topHits = (this.combatStats.topHits || []).map(hit => ({
            attacker: hit.attacker || hit.attackerName || 'Unknown',
            attackerId: hit.attackerId,
            target: hit.targetName || 'Unknown',
            targetId: hit.targetId,
            amount: hit.amount || 0,
            weapon: hit.weapon || 'Unknown',
            isCritical: hit.isCritical || false,
            timestamp: hit.timestamp
        }));

        const topHeals = (this.combatStats.topHeals || []).map(heal => ({
            healer: heal.healer || heal.healerName || 'Unknown',
            healerId: heal.healerId,
            target: heal.targetName || 'Unknown',
            targetId: heal.targetId,
            amount: heal.amount || 0,
            timestamp: heal.timestamp
        }));

        // Calculate aggregates
        const combatTotals = this.combatStats.totals || {};
        const totalHits = combatTotals.attacks?.hits || 0;
        const totalMisses = combatTotals.attacks?.misses || 0;
        const totalDamage = combatTotals.damage?.dealt || participantSummaries.reduce((sum, p) => sum + p.damageDealt, 0);
        const totalDamageTaken = combatTotals.damage?.taken || participantSummaries.reduce((sum, p) => sum + p.damageTaken, 0);
        const totalHealing = combatTotals.healing?.given || participantSummaries.reduce((sum, p) => sum + p.healingGiven, 0);
        const totalCriticals = combatTotals.attacks?.crits || 0;
        const totalFumbles = combatTotals.attacks?.fumbles || 0;

        // Compute MVP rankings using the same formula as round breakdown
        const mvpRankings = participantSummaries.map(p => {
            const score = this._computeMvpScore({
                hits: p.hits || 0,
                crits: p.criticals || 0,
                fumbles: p.fumbles || 0,
                damage: p.damageDealt || 0,
                healing: p.healingGiven || 0
            });

            const totalAttacks = p.totalAttacks || (p.hits || 0) + (p.misses || 0);
            const misses = (typeof p.misses === 'number') ? p.misses : Math.max(0, totalAttacks - (p.hits || 0));

            return {
                actorId: p.actorId,
                name: p.name,
                score,
                hits: p.hits || 0,
                misses,
                totalAttacks,
                crits: p.criticals || 0,
                fumbles: p.fumbles || 0,
                damageDealt: p.damageDealt || 0,
                damageTaken: p.damageTaken || 0,
                healingGiven: p.healingGiven || 0,
                healingReceived: p.healingReceived || 0
            };
        }).sort((a, b) => b.score - a.score);

        const mvp = mvpRankings.length ? { ...mvpRankings[0] } : null;
        this.combatStats.mvpRankings = mvpRankings;

        // Build summary
        const summary = {
            // Metadata
            combatId: combat.id,
            date: new Date().toISOString(),
            duration: combatDuration, // milliseconds
            durationSeconds: Math.round(combatDuration / 1000),
            totalRounds: combat.round || 0,  // Total number of rounds fought
            sceneName,
            sceneId: combat.scene || null,

            // Aggregated totals
            totals: {
                hits: totalHits,
                misses: totalMisses,
                totalAttacks: totalHits + totalMisses,
                damageDealt: totalDamage,
                damageTaken: totalDamageTaken,
                healingGiven: totalHealing,
                criticals: totalCriticals,
                fumbles: totalFumbles,
                hitRate: totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses) * 100).toFixed(1) : 0
            },

            // Per-participant summaries (totals only, no event arrays)
            participants: participantSummaries,

            // Top N moments (highlights only)
            notableMoments: {
                biggestHit: topHits[0] || null,
                topHits: topHits,
                topHeals: topHeals,
                longestTurn: this.combatStats.longestTurn || null,
                fastestTurn: this.combatStats.fastestTurn?.duration !== Infinity ? this.combatStats.fastestTurn : null,
                mvp: mvp || null,
                mvpRankings
            },

            // Round summaries (already aggregated from rounds array, if it exists)
            roundCount: (this.combatStats.rounds || []).length,
            rounds: (this.combatStats.rounds || []).map((round, index) => {
                // Use the stored round number if valid, otherwise fall back to array index
                // The round number was stored when the round ended in _onRoundEnd
                let roundNum = round.round || round.roundNumber;
                
                // Explicit type validation and coercion
                if (typeof roundNum !== 'number' || isNaN(roundNum) || roundNum <= 0) {
                    // Fallback to array index if stored value is invalid
                    roundNum = index + 1;
                }
                
                // Ensure it's a number (not a string or other type)
                roundNum = Number(roundNum);
                
                // Handle whatever structure the round summary has
                return {
                    round: roundNum,
                    // Only include aggregated data, no event arrays
                    summary: {
                        duration: round.duration || round.roundDuration || 0,
                        hits: round.totalHits || round.hits || 0,
                        misses: round.totalMisses || round.misses || 0,
                        damage: round.damageDealt || round.damage || 0,
                        healing: round.healingDone || round.healing || 0
                    }
                };
            })
        };

        return summary;
    }

    /**
     * Store combat summary in world flags (bounded array, keep last N)
     * @param {Object} summary - Combat summary to store
     */
    static async _storeCombatSummary(summary) {
        try {
            // Get current history or initialize empty array
            const currentHistory = game.settings.get(MODULE.ID, 'combatHistory') || [];
            
            // Add new summary to front of array
            const updatedHistory = [summary, ...currentHistory];
            
            // Keep only last 20 combats (bounded array)
            const MAX_HISTORY = 20;
            const prunedHistory = updatedHistory.slice(0, MAX_HISTORY);
            
            // Store in world flags (async)
            await game.settings.set(MODULE.ID, 'combatHistory', prunedHistory);
            
            postConsoleAndNotification(MODULE.NAME, "Combat Summary | Stored to history", {
                historySize: prunedHistory.length,
                combatId: summary.combatId
            }, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error storing combat summary", error, false, false);
        }
    }

    /**
     * Get the most recent combat summary (for API access)
     * @returns {Object|null} Most recent combat summary or null
     */
    static getCombatSummary() {
        const history = game.settings.get(MODULE.ID, 'combatHistory') || [];
        return history.length > 0 ? history[0] : null;
    }

    /**
     * Get combat history (for API access)
     * @param {number} limit - Maximum number of summaries to return (default: 20)
     * @returns {Array} Array of combat summaries
     */
    static getCombatHistory(limit = 20) {
        const history = game.settings.get(MODULE.ID, 'combatHistory') || [];
        return history.slice(0, limit);
    }

    /**
     * Handle Foundry's `updateCombat` event when combat ends.
     * Generates, logs, and stores the combat summary, then emits an API hook.
     * @param {Combat} combat - The combat instance that ended.
     */
    static async _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !combat.id) return;

        if (!this._processedCombats) {
            this._processedCombats = new Set();
        }
        if (this._processedCombats.has(combat.id)) {
            return;
        }
        this._processedCombats.add(combat.id);
        
        // Combat may already be removed from collection if delete fired first
        if (!game.combats.has(combat.id)) {
            // continue so we can still generate summary with existing data
        }

        // Ensure stats are initialized
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        // Generate combat summary before resetting stats
        const combatSummary = this._generateCombatSummary(combat);

        // Report combat summary to console (debug flag enabled)
        postConsoleAndNotification(MODULE.NAME, "COMBAT SUMMARY: Object ", combatSummary, true, false);

        // Fire hook to expose combat summary (for stats-player.js and other consumers)
        Hooks.callAll('blacksmith.combatSummaryReady', combatSummary, combat);

        // Optionally store combat summary in world flags (bounded array, keep last 20)
        // Note: Fire-and-forget async operation, don't await
        this._storeCombatSummary(combatSummary).catch(error => {
            postConsoleAndNotification(MODULE.NAME, "Error storing combat summary", error, false, false);
        });

        // Render combat summary chat card
        try {
            const template = 'modules/' + MODULE.ID + '/templates/stats-combat.hbs';
            const content = await foundry.applications.handlebars.renderTemplate(template, combatSummary);
            const shareStats = game.settings.get(MODULE.ID, 'shareCombatStats');

            await ChatMessage.create({
                content,
                whisper: shareStats ? [] : [game.user.id],
                speaker: { alias: "Game Master", user: game.user.id }
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error rendering combat summary chat card', error, false, false);
        }

        // Reset stats after summary is generated and exposed
        this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
    }

    // Method to record when a turn starts
    static recordTurnStart(combatant) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
    }

    // Method to record when a turn ends
    static recordTurnEnd(combatant) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        
        if (combatant) {
            const totalAllowedTime = game.settings.get(MODULE.ID, 'combatTimerDuration');
            const remainingTime = CombatTimer.state?.remaining ?? 0;
            const timeUsed = totalAllowedTime - remainingTime;
            const duration = timeUsed * 1000;
            const isExpired = timeUsed === totalAllowedTime;
            
            // Update turn times for player characters
            if (this._isPlayerCharacter(combatant)) {
                // Ensure partyStats is initialized
                if (!this.currentStats.partyStats) {
                    this.currentStats.partyStats = foundry.utils.deepClone(this.DEFAULTS.roundStats.partyStats);
                }
                
                if (Array.isArray(this.currentStats.partyStats.turnTimes)) {
                    this.currentStats.partyStats.turnTimes = {};
                }
                
                this.currentStats.partyStats.turnTimes[combatant.id] = duration;
                
                if (!this.currentStats.turnStats) {
                    this.currentStats.turnStats = {};
                }
                if (!this.currentStats.turnStats[combatant.id]) {
                    this.currentStats.turnStats[combatant.id] = {};
                }
                this.currentStats.turnStats[combatant.id].expired = isExpired;
                
                const turnTimes = Object.values(this.currentStats.partyStats.turnTimes);
                this.currentStats.partyStats.averageTurnTime = 
                    turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length;
            }
        }
    }

    // Helper to format time in a readable way
    static formatTime(ms, context) {
        if (ms === undefined || ms === null) return 'SKIPPED';
        ms = Number(ms);
        if (isNaN(ms)) return 'SKIPPED';

        if (this.planningDuration !== undefined && this.planningDuration === ms) {
            if (ms === 0) return 'SKIPPED';
            const maxPlanningTime = game.settings.get(MODULE.ID, 'planningTimerDuration') * 1000;
            if (ms >= maxPlanningTime) return 'EXPIRED';
        }
        else if (this.id !== undefined && this.turnDuration === ms) {
            if (ms === 0) return 'SKIPPED';
            const maxTurnTime = game.settings.get(MODULE.ID, 'combatTimerDuration') * 1000;
            if (ms >= maxTurnTime) return 'EXPIRED';
        }
        
        const seconds = Math.floor(ms / 1000);
        return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }

    static recordPlanningStart() {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        
        const now = Date.now();
        this.currentStats.actualPlanningStartTime = now;
        this.currentStats.lastUnpauseTime = now;
        if (!this.currentStats.actualRoundStartTime) {
            this.currentStats.actualRoundStartTime = now;
        }
    }

    static recordPlanningEnd() {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        
        const now = Date.now();
        this.currentStats.actualPlanningEndTime = now;
        
        const totalDuration = game.settings.get(MODULE.ID, 'planningTimerDuration');
        const remainingTime = PlanningTimer.state.remaining;
        this.currentStats.activePlanningTime = (totalDuration - remainingTime) * 1000;
    }

    static recordTimerPause() {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        const now = Date.now();
        if (this.currentStats.lastUnpauseTime) {
            if (game.combat?.turn === 0) {
                this.currentStats.activePlanningTime += now - this.currentStats.lastUnpauseTime;
            } else {
                this.currentStats.activeRoundTime += now - this.currentStats.lastUnpauseTime;
            }
        }
        this.currentStats.lastUnpauseTime = 0;
    }

    static recordTimerUnpause() {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        
        this.currentStats.lastUnpauseTime = Date.now();
    }

    static recordTimerExpired(isPlanningPhase = false) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        const now = Date.now();
        if (isPlanningPhase) {
            this.currentStats.actualPlanningEndTime = now;
            if (this.currentStats.lastUnpauseTime) {
                this.currentStats.activePlanningTime += now - this.currentStats.lastUnpauseTime;
            }
        } else {
            if (this.currentStats.lastUnpauseTime) {
                this.currentStats.activeRoundTime += now - this.currentStats.lastUnpauseTime;
            }
        }
        this.currentStats.lastUnpauseTime = 0;
    }

    // API Methods expected by api-stats.js
    static getCurrentStats() {
        return this.currentStats || foundry.utils.deepClone(this.DEFAULTS.roundStats);
    }

    static getParticipantStats(participantId) {
        if (!this.currentStats?.participantStats) return null;
        return this.currentStats.participantStats[participantId] || null;
    }

    static getNotableMoments() {
        if (!this.currentStats?.notableMoments) return null;
        return this.currentStats.notableMoments;
    }

    static getRoundSummary(round = null) {
        if (!this.combatStats?.rounds) return null;
        const targetRound = round || game.combat?.round || 1;
        return this.combatStats.rounds.find(r => r.round === targetRound) || null;
    }

    static subscribeToUpdates(callback) {
        // Simple subscription system - in a real implementation, you'd want a proper event system
        if (!this._subscribers) this._subscribers = new Set();
        this._subscribers.add(callback);
        return `sub_${Date.now()}_${Math.random()}`;
    }

    static unsubscribeFromUpdates(subscriptionId) {
        if (!this._subscribers) return;
        // In a real implementation, you'd track subscription IDs properly
        this._subscribers.clear();
    }

    // Register Handlebars helpers
    static registerHelpers() {
        // Helper to round numbers
        Handlebars.registerHelper('round', function(number) {
            return Math.round(number);
        });

        // Helper to format damage numbers
        Handlebars.registerHelper('formatDamage', function(amount, isHealing = false) {
            if (typeof amount !== 'number') return '0';
            return `${amount}`;
        });

        // Helper to format time in a readable way
        Handlebars.registerHelper('formatTime', CombatStats.formatTime);

        // Helper to multiply numbers
        Handlebars.registerHelper('multiply', function(a, b) {
            return a * b;
        });

        // Helper to divide numbers
        Handlebars.registerHelper('divide', function(a, b) {
            return a / b;
        });

        // Helper to add numbers
        Handlebars.registerHelper('add', function(a, b) {
            return a + b;
        });

        // Helper to subtract numbers
        Handlebars.registerHelper('subtract', function(a, b) {
            return a - b;
        });

        // Helper to check equality
        Handlebars.registerHelper('eq', function(a, b) {
            return a === b;
        });

        // Helper for greater than
        Handlebars.registerHelper('gt', function(a, b) {
            return a > b;
        });
    }

    // Helper method to format time
    static _formatTime(timeValue) {
        if (typeof timeValue !== 'number' || isNaN(timeValue)) return '0s';
        
        // Convert milliseconds to seconds if needed
        const seconds = timeValue > 1000 ? Math.round(timeValue / 1000) : Math.round(timeValue);
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
        timeString += `${remainingSeconds}s`;
        
        return timeString;
    }

    // Helper method to format damage
    static _formatDamage(amount, isHeal = false) {
        if (typeof amount !== 'number' || isNaN(amount)) return '0';
        amount = Math.round(amount); // Remove decimals
        return isHeal ? `${amount} HP` : `${amount}`;
    }

    // Helper method to get actor from UUID (v12/v13 compatible)
    static async _getActorFromUuid(uuid) {
        try {
            // Try v13 method first
            const actor = await fromUuid(uuid).catch(() => null);
            if (actor) return actor;

            // Fallback for v12
            const actorId = uuid.split('.')[1];
            return game.actors.get(actorId);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error getting actor from UUID', error, false, false);
            return null;
        }
    }

    // Helper method to calculate MVP score
    static async _calculateMVPScore(stats) {
        // Skip if not a player character
        const actor = await this._getActorFromUuid(stats.uuid);
        if (!actor || (!actor.hasPlayerOwner && actor.type !== 'character')) return -1;

        return this._computeMvpScore({
            hits: stats.combat?.attacks?.hits || 0,
            crits: stats.combat?.attacks?.crits || 0,
            fumbles: stats.combat?.attacks?.fumbles || 0,
            damage: stats.damage?.dealt || 0,
            healing: stats.healing?.given || 0
        });
    }

    // Helper method to calculate MVP
    static async _calculateMVP(playerCharacters) {
        if (!playerCharacters?.length) {
            postConsoleAndNotification(MODULE.NAME, 'MVP - No Players:', { message: 'No player characters for MVP calculation' }, true, false);
            return null;
        }

        postConsoleAndNotification(MODULE.NAME, 'MVP - Starting Calculation:', { playerCharacters }, true, false);

        // Process each character asynchronously
        const mvpCandidates = await Promise.all(playerCharacters.map(async (detail) => {
            const score = await this._calculateMVPScore(detail);
            
            if (score <= 0) return null;

            // Get actor from UUID for portrait
            const actor = await this._getActorFromUuid(detail.uuid);
            if (!actor) return null;

            postConsoleAndNotification(MODULE.NAME, 'MVP - Processing Character:', {
                name: actor.name,
                score,
                stats: {
                    combat: detail.combat,
                    damage: detail.damage,
                    healing: detail.healing
                }
            }, true, false);

            // Generate MVP description
            const description = MVPDescriptionGenerator.generateDescription(detail);

            postConsoleAndNotification(MODULE.NAME, 'MVP - Generated Description:', {
                name: actor.name,
                description,
                score
            }, true, false);

            return {
                ...detail,
                score,
                description,
                name: actor.name,
                tokenImg: actor.img
            };
        }));

        // Filter out null entries and find the highest score
        const validCandidates = mvpCandidates
            .filter(c => c !== null)
            .sort((a, b) => b.score - a.score);
        const topCandidate = validCandidates.length ? validCandidates[0] : null;

        postConsoleAndNotification(MODULE.NAME, 'MVP - Final Selection:', {
            selectedMVP: topCandidate?.name,
            score: topCandidate?.score,
            description: topCandidate?.description,
            allCandidates: validCandidates.map(c => ({
                name: c.name,
                score: c.score,
                description: c.description
            }))
        }, true, false);

        return {
            mvp: topCandidate,
            rankings: validCandidates
        };
    }

    // Helper method to check if an actor is a player character
    static _isPlayerCharacter(input) {
        // If input is a string (name), use the existing check
        if (typeof input === 'string') {
            return isPlayerCharacter(input);
        }
        
        // If input is a combatant object
        if (input?.actor) {
            return input.actor.hasPlayerOwner || input.actor.type === 'character';
        }
        
        // If input is an actor object
        if (input?.hasPlayerOwner !== undefined) {
            return input.hasPlayerOwner || input.type === 'character';
        }

        postConsoleAndNotification(MODULE.NAME, 'Timer Debug - Invalid input for _isPlayerCharacter', input, false, false);
        return false;
    }

    // Helper method to generate MVP description
    static _generateMVPDescription(stats) {
        const hits = stats.hits?.length || 0;
        const damageDealt = stats.damage?.dealt || 0;
        const healingGiven = stats.healing?.given || 0;
        const healingReceived = stats.healing?.received || 0;

        let description = '';
        if (hits > 0) description += `Had ${hits} hits `;
        if (damageDealt > 0) {
            if (hits > 0) description += `totaling ${this._formatDamage(damageDealt)} resulting in ${damageDealt} HP total damage `;
            else description += `Dealt ${damageDealt} HP damage `;
        }
        if (healingGiven > 0 || healingReceived > 0) {
            if (healingReceived > 0) description += `and only needed ${healingReceived} HP in healing`;
            else if (healingGiven > 0) description += `and gave ${healingGiven} HP in healing`;
        }
        return description.trim();
    }

    // -------------------------------------------------------------------------
    // GM-side processors (shared by hooks + sockets)
    // -------------------------------------------------------------------------

    // Extract the active/kept d20 result from a roll
    static _getD20ResultFromRoll(roll) {
        if (!roll) return null;

        // DiceTerm may appear in roll.dice or roll.terms depending on context/system
        const d20Term =
            roll.dice?.find(t => t?.faces === 20) ??
            roll.terms?.find(t => t?.faces === 20) ??
            null;

        if (!d20Term?.results?.length) return null;

        // Foundry marks kept die results as active
        const active = d20Term.results.find(r => r?.active);
        if (active?.result != null) return active.result;

        // Fallback: if nothing is marked active, take the first numeric result
        const first = d20Term.results.find(r => typeof r?.result === "number");
        return first?.result ?? null;
    }

    // Get crit/fumble flags from roll, context, or d20 result
    static _getCritFumbleFlags({ roll, context, d20Result }) {
        // If the system tells us directly, trust it
        const ctxCrit = context?.isCritical ?? context?.critical;
        const ctxFumble = context?.isFumble ?? context?.fumble;

        // Some rolls expose helpers
        const rollCrit = roll?.isCritical;
        const rollFumble = roll?.isFumble;

        const isCritical =
            (typeof ctxCrit === "boolean" ? ctxCrit : undefined) ??
            (typeof rollCrit === "boolean" ? rollCrit : undefined) ??
            (typeof d20Result === "number" ? d20Result === 20 : false);

        const isFumble =
            (typeof ctxFumble === "boolean" ? ctxFumble : undefined) ??
            (typeof rollFumble === "boolean" ? rollFumble : undefined) ??
            (typeof d20Result === "number" ? d20Result === 1 : false);

        return { isCritical, isFumble };
    }

    static async _processAttackRoll({ item, rollTotal, d20Result = null, isCritical = null, isFumble = null, targetAC = null, timestamp = null }) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;
        if (!item?.parent) return;

        const actor = item.parent;
        const { current: attackerStats, combat: attackerCombatStats } = this._ensureParticipantStats(actor, {
            includeCurrent: true,
            includeCombat: true
        });

        if (!this.currentStats.hits) this.currentStats.hits = [];
        if (!this.currentStats.misses) this.currentStats.misses = [];
        this._ensureCombatTotals();
        const combatTotals = this.combatStats.totals;

        // Use provided flags if available, otherwise derive from d20Result
        const crit = (typeof isCritical === "boolean") ? isCritical : (d20Result === 20);
        const fumble = (typeof isFumble === "boolean") ? isFumble : (d20Result === 1);

        // If you cannot reliably know AC, treat "hit" as unknown and only track attempts/crits/fumbles
        // Keep your previous heuristic (>= 10) but allow a passed AC
        const ac = (typeof targetAC === "number") ? targetAC : 10;
        const isHit = rollTotal >= ac;

        const hitInfo = {
            attackRoll: rollTotal,
            isCritical: crit,
            isFumble: fumble,
            isHit,
            timestamp: timestamp ?? Date.now(),
            actorId: actor.id,
            actorName: actor.name,
            itemName: item.name
        };

        attackerStats.combat.attacks.attempts++;
        attackerCombatStats.combat.attacks.attempts++;
        combatTotals.attacks.attempts++;

        // Count crits and fumbles regardless of hit status (nat20/nat1 always count)
        if (crit) {
            attackerStats.combat.attacks.crits++;
            attackerCombatStats.combat.attacks.crits++;
            combatTotals.attacks.crits++;
        }

        if (fumble) {
            attackerStats.combat.attacks.fumbles++;
            attackerCombatStats.combat.attacks.fumbles++;
            combatTotals.attacks.fumbles++;
        }

        if (isHit) {
            this._boundedPush(this.currentStats.hits, hitInfo);
            if (Array.isArray(attackerStats.hits)) this._boundedPush(attackerStats.hits, hitInfo);

            attackerStats.combat.attacks.hits++;
            attackerCombatStats.combat.attacks.hits++;
            combatTotals.attacks.hits++;
        } else {
            this._boundedPush(this.currentStats.misses, hitInfo);
            if (Array.isArray(attackerStats.misses)) this._boundedPush(attackerStats.misses, hitInfo);

            attackerStats.combat.attacks.misses++;
            attackerCombatStats.combat.attacks.misses++;
            combatTotals.attacks.misses++;
        }

        this._lastRollWasCritical = crit;

        if (this._isPlayerCharacter(actor)) {
            if (isHit) this.currentStats.partyStats.hits++;
            else this.currentStats.partyStats.misses++;
        }
    }

    static async _processDamageOrHealing({
        item,
        amount,
        isHealing = false,
        isCritical = false,
        targetActorIds = [],
        targetTokenUuids = [],
        timestamp = null
    }) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;
        if (!item?.parent) return;

        const actor = item.parent;
        const { current: attackerStats, combat: attackerCombatStats } = this._ensureParticipantStats(actor, {
            includeCurrent: true,
            includeCombat: true
        });

        attackerStats.damage ??= { dealt: 0, taken: 0 };
        attackerStats.healing ??= { given: 0, received: 0 };
        attackerCombatStats.damage ??= { dealt: 0, taken: 0 };
        attackerCombatStats.healing ??= { given: 0, received: 0 };

        this._ensureCombatTotals();
        const combatTotals = this.combatStats.totals;

        const when = timestamp ?? Date.now();

        // Resolve targets in a stable way:
        // - Prefer explicit actor ids (most reliable)
        // - Then token uuids
        // - Then GM targets (only works when GM is the roller)
        const resolvedTargetActors = [];

        if (Array.isArray(targetActorIds) && targetActorIds.length) {
            for (const id of targetActorIds) {
                const a = game.actors.get(id);
                if (a) resolvedTargetActors.push(a);
            }
        }

        if (!resolvedTargetActors.length && Array.isArray(targetTokenUuids) && targetTokenUuids.length) {
            for (const uuid of targetTokenUuids) {
                const doc = fromUuidSync?.(uuid);
                const tokenDoc = doc?.documentName === "Token" ? doc : doc?.document ?? doc;
                const a = tokenDoc?.actor ?? doc?.actor;
                if (a) resolvedTargetActors.push(a);
            }
        }

        if (!resolvedTargetActors.length) {
            for (const t of Array.from(game.user.targets || [])) {
                if (t?.actor) resolvedTargetActors.push(t.actor);
            }
        }

        // Healing
        if (isHealing) {
            attackerStats.healing.given += amount;
            attackerCombatStats.healing.given += amount;
            combatTotals.healing.given += amount;

            this.combatStats.topHeals ??= [];

            if (resolvedTargetActors.length) {
                for (const targetActor of resolvedTargetActors) {
                    const healEvent = {
                        healer: actor.name,
                        healerId: actor.id,
                        healerName: actor.name,
                        target: targetActor.name,
                        targetName: targetActor.name,
                        targetId: targetActor.id,
                        amount,
                        timestamp: when
                    };
                    this._maintainTopN(this.combatStats.topHeals, healEvent, h => h.amount || 0, 5);

                    const { current: tCur, combat: tCom } = this._ensureParticipantStats(targetActor, {
                        includeCurrent: true,
                        includeCombat: true
                    });

                    tCur.healing ??= { given: 0, received: 0 };
                    tCom.healing ??= { given: 0, received: 0 };

                    tCur.healing.received += amount;
                    tCom.healing.received += amount;
                    combatTotals.healing.received += amount;

                    this._updateNotableMoments('healing', {
                        healerId: actor.id,
                        healer: actor.name,
                        targetId: targetActor.id,
                        targetName: targetActor.name,
                        amount
                    });
                }
            } else {
                // self-heal fallback
                attackerStats.healing.received += amount;
                attackerCombatStats.healing.received += amount;
                combatTotals.healing.received += amount;

                const healEvent = {
                    healer: actor.name,
                    healerId: actor.id,
                    healerName: actor.name,
                    target: actor.name,
                    targetName: actor.name,
                    targetId: actor.id,
                    amount,
                    timestamp: when
                };
                this._maintainTopN(this.combatStats.topHeals, healEvent, h => h.amount || 0, 5);

                this._updateNotableMoments('healing', {
                    healerId: actor.id,
                    healer: actor.name,
                    targetId: actor.id,
                    targetName: actor.name,
                    amount
                });
            }

            if (this._isPlayerCharacter(actor)) {
                this.currentStats.partyStats.healingDone += amount;
            }

            return;
        }

        // Damage
        attackerStats.damage.dealt += amount;
        attackerCombatStats.damage.dealt += amount;
        combatTotals.damage.dealt += amount;

        this.combatStats.topHits ??= [];

        if (resolvedTargetActors.length) {
            for (const targetActor of resolvedTargetActors) {
                const hitEvent = {
                    attacker: actor.name,
                    attackerId: actor.id,
                    attackerName: actor.name,
                    target: targetActor.name,
                    targetName: targetActor.name,
                    targetId: targetActor.id,
                    amount,
                    weapon: item.name || 'Unknown',
                    isCritical: !!isCritical,
                    timestamp: when
                };
                this._maintainTopN(this.combatStats.topHits, hitEvent, h => h.amount || 0, 5);

                const { current: tCur, combat: tCom } = this._ensureParticipantStats(targetActor, {
                    includeCurrent: true,
                    includeCombat: true
                });

                tCur.damage ??= { dealt: 0, taken: 0 };
                tCom.damage ??= { dealt: 0, taken: 0 };

                tCur.damage.taken += amount;
                tCom.damage.taken += amount;
                combatTotals.damage.taken += amount;

                this._updateNotableMoments('damage', {
                    attackerId: actor.id,
                    attacker: actor.name,
                    targetId: targetActor.id,
                    targetName: targetActor.name,
                    amount,
                    isCritical: !!isCritical
                });
            }
        }

        if (this._isPlayerCharacter(actor)) {
            this.currentStats.partyStats.damageDealt += amount;
        }
    }

    // Normalize roll hook arguments for dnd5e v5.2.x
    // In v5.2.x: first arg is array of Rolls, second arg is context object
    static _normalizeRollHookArgs(a, b) {
        const rolls =
            Array.isArray(a) ? a :
            Array.isArray(b) ? b :
            [a, b].filter(r => r && typeof r.total === "number");

        const context =
            Array.isArray(a) ? b :
            Array.isArray(b) ? a :
            (b && typeof b === "object" ? b : null);

        // Try hard to find the Item
        const item =
            (a instanceof Item) ? a :
            (b instanceof Item) ? b :
            context?.item ??
            context?.subject?.item ??
            context?.subject?.parent?.parent ??   // activity -> activities -> item
            context?.activity?.parent ??
            null;

        return { rolls, context, item };
    }

    // Add new method to track damage rolls
    static async _onDamageRoll(a, b) {
        try {
            if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
            if (!game.combat?.started) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Skipping damage roll (combat not started)', "", true, false);
                return;
            }

            const { rolls, context, item } = this._normalizeRollHookArgs(a, b);

            if (!item || !item.id) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Skipping damage roll (no item)', {
                    aType: a?.constructor?.name,
                    bType: b?.constructor?.name,
                    contextKeys: context ? Object.keys(context) : null,
                    subjectType: context?.subject?.constructor?.name
                }, true, false);
                return;
            }

            const validRolls = (rolls || []).filter(r => r && typeof r.total === "number");
            if (!validRolls.length) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Skipping damage roll (no valid rolls)', {
                    item: item.name,
                    rollsInfo: (rolls || []).map(r => ({ t: r?.total, c: r?.constructor?.name }))
                }, true, false);
                return;
            }

            // Get amount - sum all rolls if multiple damage lines
            const amount = validRolls.reduce((sum, r) => sum + r.total, 0);
            
            // Determine if healing - check multiple sources
            const itemNameLower = (item.name || "").toLowerCase();
            const actionType = (item.system?.actionType ?? "").toString().toLowerCase();
            
            // Check activities system (dnd5e v5.2.4) for healing activities
            const hasHealingActivity = item.system?.activities && Object.values(item.system.activities).some(activity => {
                const activityType = (activity.type || "").toLowerCase();
                return activityType === "heal" || activity.healing || activity.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            });
            
            // Check damage parts for healing type
            const hasHealingDamage = item.system?.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            
            // Check item name for healing keywords
            const nameIndicatesHealing = itemNameLower.includes("heal") || itemNameLower.includes("cure") || itemNameLower.includes("restore");
            
            const isHealing =
                actionType === "heal" || actionType === "healing" ||
                hasHealingActivity ||
                hasHealingDamage ||
                nameIndicatesHealing;

            // Forward to GM if needed
            if (!game.user.isGM) {
                const socket = SocketManager.getSocket();
                if (socket?.executeAsGM) {
                    const targetTokenUuids = Array.from(game.user.targets || [])
                        .map(t => t?.document?.uuid)
                        .filter(Boolean);

                    await socket.executeAsGM("cpbTrackDamage", {
                        itemUuid: item.uuid,
                        total: amount,
                        rolls: validRolls.map(r => ({ total: r.total, formula: r.formula })),
                        targetTokenUuids
                    });
                }
                return;
            }

            // Resolve targets for GM roller case
            const targetActorIds = Array.from(game.user.targets || [])
                .map(t => t?.actor?.id)
                .filter(Boolean);

            // If this call arrived from socket, you will have context.targetTokenUuids
            const targetTokenUuids = context?.targetTokenUuids || [];

            await this._processDamageOrHealing({
                item,
                amount,
                isHealing,
                isCritical: this._lastRollWasCritical || false,
                targetActorIds,
                targetTokenUuids,
                timestamp: Date.now()
            });
        } catch (error) {
            // Catch any errors to prevent breaking the hook chain for other modules (e.g., midi-qol)
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in _onDamageRoll:', error, false, false);
            console.error('Combat Stats - _onDamageRoll error:', error);
        }
    }

    // Add new method to track pre-damage rolls
    static _onPreDamageRoll(item, config) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        if (config.critical) {
            this._lastRollWasCritical = true;
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Critical hit detected', "", true, false);
        }
    }

    // Add new method to track attack rolls
    static async _onAttackRoll(a, b) {
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        const { rolls, context, item } = this._normalizeRollHookArgs(a, b);
        const rollObj = rolls?.[0];

        if (!rollObj || rollObj.total === undefined) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Skipping attack roll (invalid roll)', {
                aType: a?.constructor?.name,
                bType: b?.constructor?.name,
                rollKeys: rollObj ? Object.keys(rollObj) : null,
                contextKeys: context ? Object.keys(context) : null
            }, true, false);
            return;
        }

        if (!item || !item.id) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Skipping attack roll (no item)', {
                aType: a?.constructor?.name,
                bType: b?.constructor?.name,
                contextKeys: context ? Object.keys(context) : null
            }, true, false);
            return;
        }

        // Forward to GM if needed
        if (!game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket?.executeAsGM) {
                const d20Result = this._getD20ResultFromRoll(rollObj);
                const { isCritical, isFumble } = this._getCritFumbleFlags({ roll: rollObj, context, d20Result });

                await socket.executeAsGM("cpbTrackAttack", {
                    itemUuid: item.uuid,
                    rollTotal: rollObj.total,
                    d20Result: d20Result,
                    isCritical: isCritical,
                    isFumble: isFumble
                });
            }
            return;
        }

        // GM path: normalize hook data, then process
        const actor = item.parent;
        if (!actor) return;

        const rollTotal = rollObj.total;
        const d20Result = this._getD20ResultFromRoll(rollObj);
        const { isCritical, isFumble } = this._getCritFumbleFlags({ roll: rollObj, context, d20Result });

        // Debug log to verify d20 extraction
        const d20Term = rollObj.dice?.find(t => t?.faces === 20) ?? rollObj.terms?.find(t => t?.faces === 20);
        postConsoleAndNotification(MODULE.NAME, "Attack d20 debug", {
            total: rollObj.total,
            d20Result,
            isCritical,
            isFumble,
            d20Results: d20Term?.results?.map(r => ({ result: r.result, active: r.active, discarded: r.discarded })),
        }, true, false);

        // You still don't really have target AC here.
        // Keep your current heuristic by not passing targetAC (processor falls back to 10).
        await this._processAttackRoll({
            item,
            rollTotal,
            d20Result,
            isCritical,
            isFumble,
            timestamp: Date.now()
        });
    }

    // Register all necessary hooks
    static _registerHooks() {
        // Register combat start hook
        const combatStartHookId = HookManager.registerHook({
            name: 'combatStart',
            description: 'Combat Stats: Initialize stats when combat starts',
            context: 'stats-combat',
            priority: 3,
            callback: (combat) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                this._onCombatStart(combat);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | combatStart", "stats-combat", true, false);
        
        // Register combat hooks
        // Migrate updateCombat hook to HookManager for centralized control
        const hookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Combat Stats: Record combat data for analytics',
            priority: 3, // Normal priority - statistics collection
            callback: this._onUpdateCombat.bind(this),
            context: 'stats-combat'
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "stats-combat", true, false);
        
        const deleteCombatHookId = HookManager.registerHook({
			name: 'deleteCombat',
			description: 'Combat Stats: Track combat deletion for statistics cleanup',
			context: 'stats-combat-combat-end',
			priority: 3,
			callback: this._onCombatEnd.bind(this)
		});
		
		const endCombatHookId = HookManager.registerHook({
			name: 'endCombat',
			description: 'Combat Stats: Track combat end for statistics finalization',
			context: 'stats-combat-combat-end',
			priority: 3,
			callback: this._onCombatEnd.bind(this)
		});

        // Register damage tracking hooks
        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Registering attack and damage hooks', "", true, false);
        
        // Attack roll hooks
        const preRollAttackHookId = HookManager.registerHook({
			name: 'dnd5e.preRollAttack',
			description: 'Combat Stats: Monitor pre-attack rolls for statistics tracking',
			context: 'stats-combat-pre-attack',
			priority: 3,
			callback: (item, config) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Pre-Attack Roll detected:', { item, config }, true, false);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});
        
        const rollAttackHookId = HookManager.registerHook({
			name: 'dnd5e.rollAttack',
			description: 'Combat Stats: Monitor attack rolls for statistics tracking',
			context: 'stats-combat-attack-rolls',
			priority: 3,
			callback: (a, b) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				const { rolls, context, item } = this._normalizeRollHookArgs(a, b);
				postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Attack Roll detected:', {
					aType: a?.constructor?.name,
					bType: b?.constructor?.name,
					rolls: rolls?.map(r => r?.total),
					contextKeys: context ? Object.keys(context) : null,
					itemName: item?.name
				}, true, false);
				this._onAttackRoll(a, b);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        // Damage roll hooks
        const preRollDamageHookId = HookManager.registerHook({
			name: 'dnd5e.preRollDamage',
			description: 'Combat Stats: Monitor pre-damage rolls for statistics tracking',
			context: 'stats-combat-pre-damage',
			priority: 3,
			callback: (item, config) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Pre-Damage Roll detected:', { item, config }, true, false);
				this._onPreDamageRoll(item, config);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});
        
        const rollDamageHookId = HookManager.registerHook({
			name: 'dnd5e.rollDamage',
			description: 'Combat Stats: Monitor damage rolls for statistics tracking',
			context: 'stats-combat-damage-rolls',
			priority: 3,
			callback: (a, b) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				const { rolls, context, item } = this._normalizeRollHookArgs(a, b);
				postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Roll detected:', {
					aType: a?.constructor?.name,
					bType: b?.constructor?.name,
					rolls: rolls?.map(r => r?.total),
					contextKeys: context ? Object.keys(context) : null,
					itemName: item?.name
				}, true, false);
				this._onDamageRoll(a, b);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        // Additional debug hooks
        const createChatMessageHookId = HookManager.registerHook({
			name: 'createChatMessage',
			description: 'Combat Stats: Monitor chat messages for roll statistics',
			context: 'stats-combat-chat-messages',
			priority: 3,
			callback: (message) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				if (message.isRoll) {
					postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Roll Chat Message:', {
						flavor: message.flavor,
						type: message.type,
						roll: message.roll
					}, true, false);
				}
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Hooks registered', "", true, false);
        
        // Register socket handlers for non-GM clients to forward combat data
        SocketManager.waitForReady().then(() => {
            const socket = SocketManager.getSocket();
            if (socket && socket.register) {
                socket.register("cpbTrackDamage", this._onSocketTrackDamage.bind(this));
                socket.register("cpbTrackAttack", this._onSocketTrackAttack.bind(this));
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Socket handlers registered', "", true, false);
            }
        });
    }


    // Socket handler for damage rolls forwarded from non-GM clients
    static async _onSocketTrackDamage(payload) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            const item = await fromUuid(payload.itemUuid);
            if (!item) return;

            const amount =
                typeof payload.total === "number"
                    ? payload.total
                    : (payload.rolls || []).reduce((s, r) => s + (Number(r.total) || 0), 0);

            // Determine healing on GM side (or accept payload.isHealing if you include it)
            const itemNameLower = (item.name || "").toLowerCase();
            const actionType = (item.system?.actionType ?? "").toString().toLowerCase();
            
            // Check activities system (dnd5e v5.2.4) for healing activities
            const hasHealingActivity = item.system?.activities && Object.values(item.system.activities).some(activity => {
                const activityType = (activity.type || "").toLowerCase();
                return activityType === "heal" || activity.healing || activity.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            });
            
            // Check damage parts for healing type
            const hasHealingDamage = item.system?.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            
            // Check item name for healing keywords
            const nameIndicatesHealing = itemNameLower.includes("heal") || itemNameLower.includes("cure") || itemNameLower.includes("restore");
            
            const isHealing =
                payload.isHealing === true ||
                actionType === "heal" || actionType === "healing" ||
                hasHealingActivity ||
                hasHealingDamage ||
                nameIndicatesHealing;

            await this._processDamageOrHealing({
                item,
                amount,
                isHealing,
                isCritical: this._lastRollWasCritical || false,
                targetTokenUuids: payload.targetTokenUuids || [],
                timestamp: Date.now()
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in socket damage handler:', error, false, false);
            console.error(error);
        }
    }

    // Socket handler for attack rolls forwarded from non-GM clients
    static async _onSocketTrackAttack(payload) {
        if (!game.user.isGM) return; // Only GM processes
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            const item = await fromUuid(payload.itemUuid);
            if (!item || !item.id) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Socket attack: item not found', { itemUuid: payload.itemUuid }, true, false);
                return;
            }

            await this._processAttackRoll({
                item,
                rollTotal: Number(payload.rollTotal) || 0,
                d20Result: (payload.d20Result ?? null),
                timestamp: Date.now()
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in socket attack handler:', error, false, false);
            console.error(error);
        }
    }


    static recordHit(hitData) {
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Recording hit:', {
            hitData,
            currentStats: this.currentStats,
            combatStats: this.combatStats,
            currentRound: game.combat?.round,
            currentTurn: game.combat?.turn,
            currentCombatant: game.combat?.combatant?.name
        }, true, false);

        // Initialize stats objects if they don't exist
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        if (!this.currentStats.hits) this.currentStats.hits = [];
        this._ensureCombatTotals();

        // Ensure hit data has all required fields
        const processedHitData = {
            ...hitData,
            round: game.combat?.round || 1,
            turn: game.combat?.turn || 0,
            attacker: hitData.attacker || game.actors.get(hitData.attackerId)?.name,
            targetName: hitData.targetName || game.actors.get(hitData.targetId)?.name,
            amount: Number(hitData.amount) || 0,
            isCritical: Boolean(hitData.isCritical),
            hit: Boolean(hitData.hit),
            timestamp: Date.now()
        };

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Processed hit data:', {
            original: hitData,
            processed: processedHitData,
            currentHits: this.currentStats.hits.length
        }, true, false);

        // Add hit to current round stats
        this._boundedPush(this.currentStats.hits, processedHitData);

        const attackerActor = game.actors.get(hitData.attackerId) || { id: hitData.attackerId, name: processedHitData.attacker };
        const targetActor = hitData.targetId ? (game.actors.get(hitData.targetId) || { id: hitData.targetId, name: processedHitData.targetName }) : null;

        const { current: currentAttackerStats, combat: combatAttackerStats } = this._ensureParticipantStats(attackerActor, {
            includeCurrent: true,
            includeCombat: true
        });

        currentAttackerStats.damage.dealt += processedHitData.amount;
        combatAttackerStats.damage.dealt += processedHitData.amount;

        if (Array.isArray(currentAttackerStats.hits)) {
            this._boundedPush(currentAttackerStats.hits, processedHitData);
        }

        if (targetActor) {
            const { current: currentTargetStats, combat: combatTargetStats } = this._ensureParticipantStats(targetActor, {
                includeCurrent: true,
                includeCombat: true
            });
            currentTargetStats.damage.taken += processedHitData.amount;
            combatTargetStats.damage.taken += processedHitData.amount;
        }

        // Update combat totals and notable hits
        this.combatStats.totals.damage.dealt += processedHitData.amount;
        if (targetActor) {
            this.combatStats.totals.damage.taken += processedHitData.amount;
        }
        this._maintainTopN(this.combatStats.topHits, processedHitData, (h) => h.amount || 0, 5);

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Stats after hit:', {
            currentStats: {
                hits: this.currentStats.hits.length,
                lastHit: this.currentStats.hits[this.currentStats.hits.length - 1]
            },
            combatStats: {
                participantStats: Object.fromEntries(
                    Object.entries(this.combatStats.participantStats).map(([id, stats]) => [
                        id,
                        {
                            name: stats.name,
                            damage: stats.damage,
                            hits: (stats.hits || []).length
                        }
                    ])
                )
            }
        }, true, false);
    }

    // Helper method for debug logging
    static _debugLog(title, data) {
        postConsoleAndNotification(MODULE.NAME, `${title} | Stats Debug:`, data, true, false);
    }

    // Combat flow tracking methods
    static _onCombatStart(combat) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        if (this._processedCombats && combat.id) {
            this._processedCombats.delete(combat.id);
        }

        // Ensure stats are initialized
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        postConsoleAndNotification(MODULE.NAME, "Combat Started | Stats:", {
            combat: {
                id: combat.id,
                round: combat.round,
                turn: combat.turn,
                combatants: combat.combatants.map(c => ({
                    name: c.name,
                    id: c.id,
                    initiative: c.initiative
                }))
            }
        }, true, false);

        // Initialize combat stats
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        
        // Ensure top N lists are initialized
        if (!this.combatStats.topHits) {
            this.combatStats.topHits = [];
        }
        if (!this.combatStats.topHeals) {
            this.combatStats.topHeals = [];
        }
        
        // Record combat start time
        this.combatStats.startTime = Date.now();
        this.currentStats.roundStartTime = Date.now();
    }

    static async _onRoundEnd(roundNumber) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        postConsoleAndNotification(MODULE.NAME, 'Round End - Starting MVP calculation', "", true, false);

        // Record the last turn's duration using the last combatant in the turns array
        const lastTurn = game.combat.turns?.length - 1;
        const lastCombatant = game.combat.turns?.[lastTurn];
        if (lastCombatant) {
            postConsoleAndNotification(MODULE.NAME, 'Recording last turn of round:', {
                combatant: lastCombatant.name,
                id: lastCombatant.id,
                turn: lastTurn
            }, true, false);
            this.recordTurnEnd(lastCombatant);
        }

        // Initialize participantStats if it doesn't exist
        if (!this.currentStats.participantStats) {
            this.currentStats.participantStats = {};
        }

        // Get all player characters' stats for MVP calculation
        const playerStats = Object.entries(this.currentStats.participantStats || {})
            .filter(([id, stats]) => {
                const actor = game.actors.get(id);
                return actor && (actor.hasPlayerOwner || actor.type === 'character');
            })
            .map(([id, stats]) => ({
                ...stats,
                uuid: `Actor.${id}`  // Create UUID for the actor
            }));

        postConsoleAndNotification(MODULE.NAME, 'Round End - Player Stats for MVP:', playerStats, true, false);

        // Calculate MVP only if there are player stats
        let roundMvpResult = { mvp: null, rankings: [] };
        if (playerStats.length > 0) {
            roundMvpResult = await this._calculateMVP(playerStats);
        } else {
            roundMvpResult.mvp = {
                score: 0,
                description: MVPDescriptionGenerator.generateDescription({
                    combat: { attacks: { hits: 0, attempts: 0 } },
                    damage: { dealt: 0 },
                    healing: { given: 0 }
                })
            };
        }

        postConsoleAndNotification(MODULE.NAME, 'Round End - MVP Calculated:', roundMvpResult, true, false);

        // Calculate total round duration (real wall-clock time)
        const roundEndTimestamp = Date.now();
        const totalRoundDuration = roundEndTimestamp - this.currentStats.roundStartTimestamp;
        this.currentStats.roundDuration = totalRoundDuration;

        // Use the actual round number from combat data
        const finalRoundNumber = game.combat?.round ?? 1;

        // Calculate round statistics
        const roundStats = {
            round: finalRoundNumber,  // The round that just ended
            roundNumber: finalRoundNumber,  // Alias for template compatibility
            duration: totalRoundDuration,  // Round duration in milliseconds
            roundDuration: totalRoundDuration,  // Alias for template compatibility
            hits: (this.currentStats.hits || []).length,
            totalHits: (this.currentStats.hits || []).length,  // Alias for template compatibility
            misses: this.currentStats.partyStats.misses || 0,
            totalMisses: this.currentStats.partyStats.misses || 0,  // Alias for template compatibility
            damageDealt: this.currentStats.partyStats.damageDealt || 0,
            damage: this.currentStats.partyStats.damageDealt || 0,  // Alias for template compatibility
            damageTaken: this.currentStats.partyStats.damageTaken || 0,
            healingDone: this.currentStats.partyStats.healingDone || 0,
            healing: this.currentStats.partyStats.healingDone || 0,  // Alias for template compatibility
            expiredTurns: (this.currentStats.expiredTurns || []).length,  // Keep for potential future use
            turnTimes: this.currentStats.partyStats?.turnTimes || {}  // Keep for potential future use
        };

        try {
            // Prepare template data
            const templateData = await this._prepareTemplateData(this.currentStats.participantStats);

            // Store round stats if needed
            if (!this.combatStats.rounds) {
                this.combatStats.rounds = [];
            }
            this._boundedPush(this.combatStats.rounds, roundStats);

            // Set the round number for the template
            templateData.roundNumber = finalRoundNumber;

            // Add MVP data to template (always exists, even if score is 0)
            if (roundMvpResult.mvp) {
                templateData.roundMVP = roundMvpResult.mvp;
                // Also provide description at root level for fallback cases
                templateData.description = roundMvpResult.mvp.description;
            }

            // Send each card as a separate chat message in order
            await this._sendRoundCards(templateData, finalRoundNumber);

            // Reset current stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            this.currentStats.partyStats.turnTimes = {};
            this.currentStats.activePlanningTime = 0;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Round End - Error', error, false, false);
        }
    }

    static async _prepareTemplateData(participantStats) {
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        postConsoleAndNotification(MODULE.NAME, `Timer Debug [${new Date().toISOString()}] - ENTER _prepareTemplateData`, {
            hasParticipantStats: !!this.currentStats.participantStats,
            participantCount: this.currentStats.participantStats ? Object.keys(this.currentStats.participantStats).length : 0,
            rawStats: this.currentStats.participantStats,
            turnTimes: this.currentStats.partyStats?.turnTimes || {}
        }, true, false);

        const participantMap = new Map();

        // First pass: Get all player characters from the combat
        if (game.combat?.turns) {
            for (const turn of game.combat.turns) {
                // Skip if no actor or not a player character
                if (!turn?.actor || !this._isPlayerCharacter(turn.actor)) continue;
                
                const actorId = turn.actor.id;
                const actorUuid = turn.actor.uuid;
                const combatantId = turn.id; // Use combatant ID for per-round timing
                if (!actorId || !combatantId) continue;

                // Get this combatant's specific turn duration
                const turnDuration = this.currentStats.partyStats?.turnTimes?.[combatantId] || 0;

                postConsoleAndNotification(MODULE.NAME, `Turn Duration for ${turn.actor.name}:`, {
                    turnDuration,
                    combatantId,
                    actorId,
                    turnTimes: this.currentStats.partyStats?.turnTimes || {}
                }, true, false);

                // Safely get stats, defaulting to empty structure if not found
                const stats = this.currentStats?.participantStats?.[actorId] || {
                    name: turn.actor.name,
                    damage: { dealt: 0, taken: 0 },
                    healing: { given: 0, received: 0 },
                    combat: {
                        attacks: {
                            attempts: 0,
                            hits: 0,
                            misses: 0,
                            crits: 0,
                            fumbles: 0
                        }
                    },
                    hits: [],
                    misses: [],
                    turnDuration: turnDuration,
                    combatantId
                };

                const existingStats = participantMap.get(actorId) || {
                    actorId,
                    actorUuid,
                    name: stats.name,
                    damage: { dealt: 0, taken: 0 },
                    healing: { given: 0, received: 0 },
                    combat: {
                        attacks: {
                            attempts: 0,
                            hits: 0,
                            misses: 0,
                            crits: 0,
                            fumbles: 0
                        }
                    },
                    hits: [],
                    misses: [],
                    turnDuration: turnDuration,
                    combatantIds: new Set()
                };

                // Track combatant IDs encountered (for timing data)
                existingStats.combatantIds.add(combatantId);
                existingStats.actorUuid = actorUuid;
                existingStats.name = stats.name;

                // Safely merge damage and healing
                existingStats.damage.dealt += stats.damage?.dealt || 0;
                existingStats.damage.taken += stats.damage?.taken || 0;
                existingStats.healing.given += stats.healing?.given || 0;
                existingStats.healing.received += stats.healing?.received || 0;

                // Safely merge combat stats
                if (stats.combat?.attacks) {
                    existingStats.combat.attacks.attempts += stats.combat.attacks.attempts || 0;
                    existingStats.combat.attacks.hits += stats.combat.attacks.hits || 0;
                    existingStats.combat.attacks.misses += stats.combat.attacks.misses || 0;
                    existingStats.combat.attacks.crits += stats.combat.attacks.crits || 0;
                    existingStats.combat.attacks.fumbles += stats.combat.attacks.fumbles || 0;
                }

                // Safely merge hits and misses arrays with bounded push
                if (Array.isArray(stats.hits)) {
                    for (const hit of stats.hits) {
                        this._boundedPush(existingStats.hits, hit);
                    }
                }
                if (Array.isArray(stats.misses)) {
                    for (const miss of stats.misses) {
                        this._boundedPush(existingStats.misses, miss);
                    }
                }

                participantMap.set(actorId, existingStats);
            }
        }

        // Second pass: Calculate final scores and prepare for template
        const sortedParticipants = Array.from(participantMap.values()).map(stats => {
            // Calculate MVP score
            const score = this._computeMvpScore({
                hits: stats.combat.attacks.hits,
                crits: stats.combat.attacks.crits,
                fumbles: stats.combat.attacks.fumbles,
                damage: stats.damage.dealt,
                healing: stats.healing.given
            });

            // Get token image
            const tokenImg = (() => {
                const actor = game.actors.get(stats.actorId);
                if (actor) return getPortraitImage(actor);
                const combatantId = Array.from(stats.combatantIds || [])[0];
                const combatant = combatantId ? game.combat?.combatants?.get(combatantId) : null;
                return getActorPortrait(combatant);
            })();

            // Calculate damage ratio: show green (dealt) vs red (taken)
            // 50/50 = balanced, more green = more DPS, more red = more tank
            // If both are 0, default to 50/50 split
            const damageDealt = stats.damage?.dealt || 0;
            const damageTaken = stats.damage?.taken || 0;
            // Include healing given as "damage given" for the ratio
            const healingGiven = stats.healing?.given || 0;
            const totalGiven = damageDealt + healingGiven;
            const totalTaken = damageTaken;
            const totalActivity = totalGiven + totalTaken;
            
            // Calculate percentages: green = given (damage + healing), red = taken
            // Default to 50/50 if both are 0
            const greenPercent = totalActivity > 0 
                ? (totalGiven / totalActivity) * 100 
                : 50;
            const redPercent = totalActivity > 0 
                ? (totalTaken / totalActivity) * 100 
                : 50;
            
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Ratio Calculation:', {
                name: stats.name,
                damageDealt,
                healingGiven,
                totalGiven,
                damageTaken,
                totalTaken,
                totalActivity,
                greenPercent: greenPercent.toFixed(2),
                redPercent: redPercent.toFixed(2)
            }, true, false);
            
            return {
                actorId: stats.actorId,
                actorUuid: stats.actorUuid,
                combatantIds: Array.from(stats.combatantIds || []),
                name: stats.name,
                damage: stats.damage,
                healing: stats.healing,
                combat: stats.combat,
                score,
                tokenImg,
                turnDuration: stats.turnDuration,
                damageRatioGreen: Math.round(greenPercent * 100) / 100, // Round to 2 decimals
                damageRatioRed: Math.round(redPercent * 100) / 100    // Round to 2 decimals
            };
        }).sort((a, b) => b.score - a.score);

        // Calculate total party time by summing all turn durations
        const totalPartyTime = Object.values(this.currentStats.partyStats.turnTimes).reduce((sum, duration) => sum + duration, 0);

        postConsoleAndNotification(MODULE.NAME, 'Planning Time Debug:', {
            activePlanningTime: this.currentStats.activePlanningTime,
            totalPartyTime: totalPartyTime,
            formattedTime: this._formatTime(this.currentStats.activePlanningTime)
        }, true, false);

        // Calculate active duration by combining total party time and planning time
        const activeRoundDuration = totalPartyTime + (this.currentStats.activePlanningTime || 0);

        const templateData = {
            roundDurationActive: activeRoundDuration,  // Combined party time + planning
            roundDurationActual: this.currentStats.roundDuration,  // Wall-clock time
            planningDuration: this.currentStats.activePlanningTime,  // Pass raw number
            turnDetails: sortedParticipants,
            roundMVP: sortedParticipants[0],
            totalPartyTime: totalPartyTime,
            partyStats: {
                hitMissRatio: this.currentStats.partyStats.hits /
                    (this.currentStats.partyStats.hits + this.currentStats.partyStats.misses) * 100 || 0,
                totalHits: this.currentStats.partyStats.hits,
                totalMisses: this.currentStats.partyStats.misses,
                damageDealt: sortedParticipants.reduce((sum, p) => sum + (p.damage?.dealt || 0), 0),
                damageTaken: sortedParticipants.reduce((sum, p) => sum + (p.damage?.taken || 0), 0),
                healingDone: this.currentStats.partyStats.healingDone,
                averageTurnTime: this._formatTime(this.currentStats.partyStats.averageTurnTime),
                criticalHits: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.crits || 0), 0),
                fumbles: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.fumbles || 0), 0),
            },
            settings: {
                showRoundSummary: game.settings.get(MODULE.ID, 'showRoundSummary'),
                showRoundMVP: game.settings.get(MODULE.ID, 'showRoundMVP'),
                showNotableMoments: game.settings.get(MODULE.ID, 'showNotableMoments'),
                showPartyBreakdown: game.settings.get(MODULE.ID, 'showPartyBreakdown'),
                showRoundTimer: game.settings.get(MODULE.ID, 'showRoundTimer'),
                planningTimerEnabled: game.settings.get(MODULE.ID, 'planningTimerEnabled'),
                combatTimerEnabled: game.settings.get(MODULE.ID, 'combatTimerEnabled')
            },
            notableMoments: await this._enrichNotableMomentsWithPortraits(this.currentStats.notableMoments),
            hasNotableMoments: Object.values(this.currentStats.notableMoments)
                .some(moment => moment.amount > 0 || moment.duration > 0)
        };

        const actorScores = sortedParticipants.map((participant, index) => ({
            name: participant.name,
            actorId: participant.actorId,
            actorUuid: participant.actorUuid,
            score: participant.score,
            rank: index + 1
        }));

        postConsoleAndNotification(
            MODULE.NAME,
            'COMBAT STATS: Round MVP rankings computed',
            {
                round: game.combat?.round ?? 0,
                actorScores
            },
            true,
            false
        );

        actorScores.forEach(entry => {
            if (!entry.actorId) return;
            Hooks.callAll('blacksmith.roundMvpScore', entry);
        });

        return {
            roundDurationActive: activeRoundDuration,  // Combined party time + planning
            roundDurationActual: this.currentStats.roundDuration,  // Wall-clock time
            planningDuration: this.currentStats.activePlanningTime,  // Pass raw number
            turnDetails: sortedParticipants,
            roundMVP: sortedParticipants[0],
            totalPartyTime: totalPartyTime,
            partyStats: {
                hitMissRatio: this.currentStats.partyStats.hits /
                    (this.currentStats.partyStats.hits + this.currentStats.partyStats.misses) * 100 || 0,
                totalHits: this.currentStats.partyStats.hits,
                totalMisses: this.currentStats.partyStats.misses,
                damageDealt: sortedParticipants.reduce((sum, p) => sum + (p.damage?.dealt || 0), 0),
                damageTaken: sortedParticipants.reduce((sum, p) => sum + (p.damage?.taken || 0), 0),
                healingDone: this.currentStats.partyStats.healingDone,
                averageTurnTime: this._formatTime(this.currentStats.partyStats.averageTurnTime),
                criticalHits: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.crits || 0), 0),
                fumbles: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.fumbles || 0), 0),
            },
            settings: {
                showRoundSummary: game.settings.get(MODULE.ID, 'showRoundSummary'),
                showRoundMVP: game.settings.get(MODULE.ID, 'showRoundMVP'),
                showNotableMoments: game.settings.get(MODULE.ID, 'showNotableMoments'),
                showPartyBreakdown: game.settings.get(MODULE.ID, 'showPartyBreakdown'),
                showRoundTimer: game.settings.get(MODULE.ID, 'showRoundTimer'),
                planningTimerEnabled: game.settings.get(MODULE.ID, 'planningTimerEnabled'),
                combatTimerEnabled: game.settings.get(MODULE.ID, 'combatTimerEnabled')
            },
            notableMoments: await this._enrichNotableMomentsWithPortraits(this.currentStats.notableMoments),
            hasNotableMoments: Object.values(this.currentStats.notableMoments)
                .some(moment => moment.amount > 0 || moment.duration > 0)
        };
    }

    /**
     * Send round cards as separate chat messages
     * Order: Round End, Round Summary, Round MVP, Notable Moments, Party Breakdown
     */
    static async _sendRoundCards(templateData, roundNumber) {
        const isShared = game.settings.get(MODULE.ID, 'shareCombatStats');
        const whisper = isShared ? [] : [game.user.id];
        const speaker = { alias: "Game Master", user: game.user.id };

        // 1. Round End Card (always send if no other cards are being sent)
        const showAnyCard = templateData.settings.showRoundSummary || 
                           templateData.settings.showRoundMVP || 
                           templateData.settings.showNotableMoments || 
                           templateData.settings.showPartyBreakdown;
        
        if (!showAnyCard) {
            const endContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-end.hbs',
                { roundNumber }
            );
            await ChatMessage.create({ content: endContent, whisper, speaker });
            return;
        }

        // 2. Round Summary Card
        if (templateData.settings.showRoundSummary) {
            const summaryContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-summary.hbs',
                templateData
            );
            await ChatMessage.create({ content: summaryContent, whisper, speaker });
        }

        // 3. Round MVP Card
        if (templateData.settings.showRoundMVP) {
            const mvpContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-mvp.hbs',
                templateData
            );
            await ChatMessage.create({ content: mvpContent, whisper, speaker });
        }

        // 4. Notable Moments Card
        if (templateData.settings.showNotableMoments) {
            const momentsContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-moments.hbs',
                templateData
            );
            await ChatMessage.create({ content: momentsContent, whisper, speaker });
        }

        // 5. Party Breakdown Card
        if (templateData.settings.showPartyBreakdown) {
            const breakdownContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-breakdown.hbs',
                templateData
            );
            await ChatMessage.create({ content: breakdownContent, whisper, speaker });
        }
    }

    static async generateRoundSummary(templateData) {
        const content = await foundry.applications.handlebars.renderTemplate('modules/' + MODULE.ID + '/templates/stats-round.hbs', templateData);
        return content;
    }

    // Add new method to track notable moments
    static _updateNotableMoments(type, data) {
        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        postConsoleAndNotification(MODULE.NAME, 'Update Notable Moments:', {
            type,
            data,
            currentMoments: this.currentStats.notableMoments
        }, true, false);

        if (!this.currentStats?.notableMoments) {
            postConsoleAndNotification(MODULE.NAME, 'Notable Moments structure not initialized', "", false, false);
            return;
        }
        
        const moments = this.currentStats.notableMoments;
        
        switch (type) {
            case 'damage':
                // Track biggest hit
                if (data.amount > moments.biggestHit.amount) {
                    moments.biggestHit = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        isCritical: data.isCritical,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                
                // Track weakest hit (non-zero)
                if (data.amount > 0 && (moments.weakestHit.amount === 0 || data.amount < moments.weakestHit.amount)) {
                    moments.weakestHit = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                
                // Update most damage (cumulative)
                const attacker = this.currentStats.participantStats[data.attackerId];
                if (attacker && attacker.damage.dealt > moments.mostDamage.amount) {
                    moments.mostDamage = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        amount: attacker.damage.dealt
                    };
                }
                
                // Update most hurt (cumulative damage taken)
                const target = this.currentStats.participantStats[data.targetId];
                if (target && target.damage.taken > moments.mostHurt.amount) {
                    moments.mostHurt = {
                        actorId: data.targetId,
                        actorName: data.targetName,
                        amount: target.damage.taken
                    };
                }
                break;
                
            case 'healing':
                // Track biggest heal
                if (data.amount > moments.biggestHeal.amount) {
                    moments.biggestHeal = {
                        actorId: data.healerId,
                        actorName: data.healer,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                break;
                
            case 'turn':
                // Track longest turn
                if (data.duration > moments.longestTurn.duration) {
                    moments.longestTurn = {
                        actorId: data.actorId,
                        actorName: data.actorName,
                        duration: data.duration,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                break;
        }
    }

    // Enrich notable moments with portrait images
    static async _enrichNotableMomentsWithPortraits(notableMoments) {
        if (!notableMoments) return notableMoments;
        
        const enriched = foundry.utils.deepClone(notableMoments);
        
        // Helper to add portrait to a moment
        const addPortrait = async (moment) => {
            if (!moment || !moment.actorId) return moment;
            const actor = game.actors.get(moment.actorId);
            if (actor) {
                moment.actorImg = getPortraitImage(actor) || "icons/svg/mystery-man.svg";
            } else {
                moment.actorImg = "icons/svg/mystery-man.svg";
            }
            return moment;
        };
        
        // Add portraits to all notable moments that have actorId
        if (enriched.biggestHit?.actorId) await addPortrait(enriched.biggestHit);
        if (enriched.weakestHit?.actorId) await addPortrait(enriched.weakestHit);
        if (enriched.mostDamage?.actorId) await addPortrait(enriched.mostDamage);
        if (enriched.biggestHeal?.actorId) await addPortrait(enriched.biggestHeal);
        if (enriched.mostHurt?.actorId) await addPortrait(enriched.mostHurt);
        if (enriched.longestTurn?.actorId) await addPortrait(enriched.longestTurn);
        
        return enriched;
    }

    // Record when first player's turn starts
    static recordFirstPlayerStart() {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        
        const now = Date.now();
        this.currentStats.firstPlayerStartTime = now;
        if (!this.currentStats.actualRoundStartTime) {
            this.currentStats.actualRoundStartTime = now;
        }
    }
}

export { CombatStats };

// ************************************
// ** CLASS MVPDescriptionGenerator
// ************************************
// Generates descriptions for MVPs based on combat stats.

class MVPDescriptionGenerator {
    static THRESHOLDS = {
        COMBAT_EXCELLENCE: {
            accuracy: 75,
            hits: 2,
            crits: 1
        },
        DAMAGE_FOCUS: {
            damage: 5,
            hits: 1
        },
        PRECISION: {
            accuracy: 90,
            hits: 1
        },
        MIXED: {
            fumbles: 1,
            damage: 5
        }
    };

    static calculateStats(rawStats) {
        // Safely access nested properties with defaults
        const combat = rawStats.combat || {};
        const attacks = combat.attacks || {};
        const damage = rawStats.damage || {};
        const healing = rawStats.healing || {};
        
        const hits = attacks.hits || 0;
        const attempts = attacks.attempts || 0;
        
        return {
            hits: hits,
            attempts: attempts,
            accuracy: attempts > 0 ? Math.round((hits / attempts) * 100) : 0,
            damage: damage.dealt || 0,
            crits: attacks.crits || 0,
            healing: healing.given || 0,
            fumbles: attacks.fumbles || 0
        };
    }

    static determinePattern(stats) {
        const accuracy = stats.attempts > 0 ? (stats.hits / stats.attempts) * 100 : 0;

        // Combat Excellence: High accuracy + crits + multiple hits
        if (accuracy >= this.THRESHOLDS.COMBAT_EXCELLENCE.accuracy && 
            stats.hits >= this.THRESHOLDS.COMBAT_EXCELLENCE.hits &&
            stats.crits >= this.THRESHOLDS.COMBAT_EXCELLENCE.crits) {
            return 'combatExcellence';
        }
        
        // Damage Focus: High damage output
        if (stats.damage >= this.THRESHOLDS.DAMAGE_FOCUS.damage &&
            stats.hits >= this.THRESHOLDS.DAMAGE_FOCUS.hits) {
            return 'damage';
        }

        // Precision: Very high accuracy
        if (accuracy >= this.THRESHOLDS.PRECISION.accuracy &&
            stats.hits >= this.THRESHOLDS.PRECISION.hits) {
            return 'precision';
        }

        // Mixed: Has fumbles but still contributed
        if (stats.fumbles >= this.THRESHOLDS.MIXED.fumbles &&
            stats.damage >= this.THRESHOLDS.MIXED.damage) {
            return 'mixed';
        }

        return null; // No pattern matches - will trigger "no MVP" message
    }

    static getRandomTemplate(pattern) {
        const templates = pattern ? MVPTemplates[`${pattern}Templates`] : MVPTemplates.noMVPTemplates;
        return templates[Math.floor(Math.random() * templates.length)];
    }

    static formatDescription(template, stats) {
        return template.replace(/{(\w+)}/g, (match, stat) => {
            // Handle special formatting
            if (stat === 'accuracy') {
                return `${stats[stat]}%`;
            }
            if (stat === 'damage' || stat === 'healing') {
                return stats[stat].toLocaleString();
            }
            return stats[stat]?.toString() || '0';
        });
    }

    static generateDescription(rawStats) {
        // Calculate derived stats
        const stats = this.calculateStats(rawStats);
        
        postConsoleAndNotification(MODULE.NAME, "MVP Description - Processing:", {
            rawStats,
            calculatedStats: stats
        }, true, false);
        
        // Determine which pattern to use
        const pattern = this.determinePattern(stats);
        
        // Get a random template
        const template = this.getRandomTemplate(pattern);
        
        // Format the description with actual values
        const description = this.formatDescription(template, stats);
        
        postConsoleAndNotification(MODULE.NAME, "MVP Description - Result:", {
            pattern,
            description
        }, true, false);
        
        return description;
    }

} 
