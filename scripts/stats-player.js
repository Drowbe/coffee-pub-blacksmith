/**
 * Tier 3 statistics manager for Coffee Pub Blacksmith.
 * - Maintains per-session data (in-memory) and lifetime aggregates on actor flags.
 * - Listens for combat summaries to update long-term records (MVP totals, damage, etc.).
 */

// Import MODULE variables
import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, trimString, isPlayerCharacter } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// Default stats structure
const CPB_STATS_DEFAULTS = {
    session: {
        combats: [],
        currentCombat: null,
        pendingAttacks: new Map() // Store attack rolls until damage confirms hit
    },
    lifetime: {
        attacks: {
            biggest: {
                amount: 0,
                date: null,
                weaponName: null,
                attackRoll: null,
                targetName: null,
                targetAC: null,
                sceneName: null,
                isCritical: false
            },
            weakest: {
                amount: 0,
                date: null,
                weaponName: null,
                attackRoll: null,
                targetName: null,
                targetAC: null,
                sceneName: null,
                isCritical: false
            },
            hitMissRatio: 0,
            totalHits: 0,
            totalMisses: 0,
            criticals: 0,
            fumbles: 0,
            totalDamage: 0,
            damageByWeapon: {},
            damageByType: {},
            hitLog: [] // Store last X hits with details
        },
        healing: {
            total: 0,
            received: 0,
            byTarget: {},
            mostHealed: null,
            leastHealed: null
        },
        turnStats: {
            average: 0,
            total: 0,
            count: 0,
            fastest: null,
            slowest: null
        },
        mvp: {
            totalScore: 0,
            highScore: 0,
            combats: 0,
            averageScore: 0,
            lastScore: 0,
            lastRank: null
        },
        unconscious: 0,
        movement: 0,
        lastUpdated: null
    }
};

class CPBPlayerStats {
    // Bounded push helper to prevent unbounded array growth
    static _boundedPush(array, item, maxSize = 1000) {
        array.push(item);
        if (array.length > maxSize) {
            array.shift(); // Remove oldest item if over limit
        }
    }

    /**
     * Clone-safe helper for MVP aggregates on lifetime stats.
     * @param {Object|null} existing - Previously stored aggregate, if any.
     * @param {number|null} score - Score from the latest combat (optional).
     * @param {number|null} rank - Rank from the latest combat (optional).
     * @param {boolean} accumulate - Whether to add the score to running totals.
     * @returns {Object} Updated MVP aggregate object.
     */
    static _updateLifetimeMvp(existing, score = null, rank = null, accumulate = true) {
        const aggregate = existing
            ? foundry.utils.deepClone(existing)
            : foundry.utils.deepClone(CPB_STATS_DEFAULTS.lifetime.mvp);

        if (typeof score === 'number') {
            if (accumulate) {
                aggregate.totalScore = (aggregate.totalScore || 0) + score;
                aggregate.combats = (aggregate.combats || 0) + 1;
                aggregate.highScore = Math.max(aggregate.highScore || 0, score);
                aggregate.averageScore = Number((aggregate.totalScore / aggregate.combats).toFixed(2));
            }
            aggregate.lastScore = score;
            aggregate.lastRank = rank;
        } else if (typeof rank === 'number') {
            aggregate.lastRank = rank;
        }

        return aggregate;
    }

    /**
     * Initialize lifetime tracking for the current GM.
     * Sets default actor flags, registers hooks, and prepares session caches.
     */
    static initialize() {
        if (!game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        
        postConsoleAndNotification(MODULE.NAME, `Player Stats - Initializing player statistics tracking`, "", false, false);
        
        // Initialize stats for all player characters
        game.actors.forEach(actor => {
            if (actor.hasPlayerOwner && !actor.isToken) {
                this.initializeActorStats(actor.id);
            }
        });

        // Register hooks for data collection
        const rollAttackHookId = HookManager.registerHook({
			name: 'dnd5e.rollAttack',
			description: 'Player Stats: Track attack rolls for player characters',
			context: 'stats-player-attack-rolls',
			priority: 3,
			callback: this._onAttackRoll.bind(this)
		});
		
		const rollDamageHookId = HookManager.registerHook({
			name: 'dnd5e.rollDamage',
			description: 'Player Stats: Track damage rolls for player characters',
			context: 'stats-player-damage-rolls',
			priority: 3,
			callback: this._onDamageRoll.bind(this)
		});
        
        // Migrate updateCombat hook to HookManager for centralized control
        const hookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Player Stats: Track player character turn statistics and combat data',
            priority: 3, // Normal priority - statistics collection
            callback: this._onCombatUpdate.bind(this),
            context: 'stats-player'
        });
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "stats-player", true, false);
        
        const updateActorHookId = HookManager.registerHook({
			name: 'updateActor',
			description: 'Player Stats: Track actor updates for player characters',
			context: 'stats-player-actor-updates',
			priority: 3,
			callback: this._onActorUpdate.bind(this)
		});
        const combatSummaryHookId = HookManager.registerHook({
            name: 'blacksmith.combatSummaryReady',
            description: 'Player Stats: Consume combat summaries for lifetime statistics',
            context: 'stats-player-combat-summary',
            priority: 3,
            key: 'stats-player-combat-summary',
            options: {},
            callback: (summary, combat) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                this._onCombatSummaryReady(summary, combat);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        const roundMvpHookId = HookManager.registerHook({
            name: 'blacksmith.roundMvpScore',
            description: 'Player Stats: Snapshot MVP score each round to preserve progress across sessions',
            context: 'stats-player-round-mvp',
            priority: 3,
            key: 'stats-player-round-mvp',
            options: {},
            callback: (payload) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                this._applyRoundMvpScore(payload || {});
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
        const createActorHookId = HookManager.registerHook({
			name: 'createActor',
			description: 'Player Stats: Initialize statistics for newly created player characters',
			context: 'stats-player-actor-creation',
			priority: 3,
			callback: (actor) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				if (actor.hasPlayerOwner && !actor.isToken) {
					this.initializeActorStats(actor.id);
				}
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        // Initialize session storage
        this._sessionStats = new Map();
    }

    // Core data management methods
    static async initializeActorStats(actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;

        const existingStats = await actor.getFlag(MODULE.ID, 'playerStats');
        if (!existingStats) {
            postConsoleAndNotification(MODULE.NAME, `Initializing stats for actor:`, actor.name, false, false);
            await actor.setFlag(MODULE.ID, 'playerStats', foundry.utils.deepClone(CPB_STATS_DEFAULTS));
        }
    }

    static async getPlayerStats(actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return null;

        const stats = await actor.getFlag(MODULE.ID, 'playerStats');
        if (!stats) {
            await this.initializeActorStats(actorId);
            return await actor.getFlag(MODULE.ID, 'playerStats');
        }
        return stats;
    }

    static async updatePlayerStats(actorId, updates) {
        // Only GMs can update player statistics
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Player Stats: Only GMs can update player statistics", "", false, true);
            return;
        }
        
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const currentStats = await this.getPlayerStats(actorId);
        if (!currentStats) return;

        // Use mergeObject with insertKeys and overwrite to ensure nested objects are properly replaced
        const newStats = foundry.utils.mergeObject(currentStats, updates, {
            insertKeys: true,
            overwrite: true,
            recursive: true,
            inplace: false
        });
        newStats.lifetime.lastUpdated = new Date().toISOString();
        
        await actor.setFlag(MODULE.ID, 'playerStats', newStats);
    }

    /**
     * Clear all player statistics for a specific actor
     * @param {string} actorId - The actor ID
     * @returns {Promise<void>}
     */
    static async clearPlayerStats(actorId) {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Player Stats: Only GMs can clear player statistics", "", false, true);
            return;
        }

        const actor = game.actors.get(actorId);
        if (!actor) return;

        await actor.setFlag(MODULE.ID, 'playerStats', foundry.utils.deepClone(CPB_STATS_DEFAULTS));
        
        // Also clear session stats
        if (this._sessionStats) {
            this._sessionStats.delete(actorId);
        }

        postConsoleAndNotification(MODULE.NAME, `Player Stats | Cleared all stats for ${actor.name}`, { actorId }, false, false);
    }

    /**
     * Clear all player statistics for all actors
     * @returns {Promise<void>}
     */
    static async clearAllPlayerStats() {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Player Stats: Only GMs can clear player statistics", "", false, true);
            return;
        }

        const actors = game.actors.filter(actor => actor.hasPlayerOwner && !actor.isToken);
        let clearedCount = 0;

        for (const actor of actors) {
            await actor.setFlag(MODULE.ID, 'playerStats', foundry.utils.deepClone(CPB_STATS_DEFAULTS));
            if (this._sessionStats) {
                this._sessionStats.delete(actor.id);
            }
            clearedCount++;
        }

        postConsoleAndNotification(MODULE.NAME, `Player Stats | Cleared all stats for ${clearedCount} player(s)`, { clearedCount }, false, false);
    }

    /**
     * Remove a combat from a player's session stats and reverse lifetime stats
     * @param {string} actorId - The actor ID
     * @param {string} combatId - The combat ID to remove
     * @param {Object} combatSummary - The combat summary with participant data
     * @returns {Promise<boolean>} True if combat was found and removed
     */
    static async removeCombatFromPlayerStats(actorId, combatId, combatSummary) {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Player Stats: Only GMs can remove combat from player statistics", "", false, true);
            return false;
        }

        const actor = game.actors.get(actorId);
        if (!actor) return false;

        // Find participant data for this actor in the combat summary
        const participant = combatSummary?.participants?.find(p => p.actorId === actorId);
        if (!participant) {
            // No participant data, just remove from session if present
            const sessionStats = this._getSessionStats(actorId);
            if (sessionStats?.combats) {
                const index = sessionStats.combats.findIndex(c => c.combatId === combatId);
                if (index !== -1) {
                    sessionStats.combats.splice(index, 1);
                    this._updateSessionStats(actorId, sessionStats);
                    return true;
                }
            }
            return false;
        }

        // Remove from session stats
        const sessionStats = this._getSessionStats(actorId);
        if (sessionStats?.combats) {
            const index = sessionStats.combats.findIndex(c => c.combatId === combatId);
            if (index !== -1) {
                sessionStats.combats.splice(index, 1);
                this._updateSessionStats(actorId, sessionStats);
            }
        }

        // Reverse lifetime stats by subtracting the combat's contribution
        const stats = await this.getPlayerStats(actorId);
        if (!stats) return false;

        const lifetimeAttacks = stats.lifetime?.attacks || {};
        const updates = {
            lifetime: {
                attacks: {
                    totalHits: Math.max(0, (lifetimeAttacks.totalHits || 0) - (participant.hits || 0)),
                    totalMisses: Math.max(0, (lifetimeAttacks.totalMisses || 0) - (participant.misses || 0)),
                    criticals: Math.max(0, (lifetimeAttacks.criticals || 0) - (participant.criticals || 0)),
                    fumbles: Math.max(0, (lifetimeAttacks.fumbles || 0) - (participant.fumbles || 0))
                },
                mvp: { ...stats.lifetime?.mvp }
            }
        };

        // Reverse MVP stats if this combat had MVP data
        const mvpRankings = combatSummary?.notableMoments?.mvpRankings || [];
        const rankingIndex = mvpRankings.findIndex(r => r.actorId === actorId);
        if (rankingIndex >= 0) {
            const rankingEntry = mvpRankings[rankingIndex];
            const score = rankingEntry?.score ?? null;
            
            if (typeof score === 'number' && updates.lifetime.mvp) {
                // Subtract from totals
                updates.lifetime.mvp.totalScore = Math.max(0, (updates.lifetime.mvp.totalScore || 0) - score);
                updates.lifetime.mvp.combats = Math.max(0, (updates.lifetime.mvp.combats || 0) - 1);
                
                // Recalculate average
                if (updates.lifetime.mvp.combats > 0) {
                    updates.lifetime.mvp.averageScore = Number((updates.lifetime.mvp.totalScore / updates.lifetime.mvp.combats).toFixed(2));
                } else {
                    updates.lifetime.mvp.averageScore = 0;
                }
                
                // If this was the high score, we'd need to recalculate from remaining combats
                // For now, we'll just ensure it doesn't go below 0
                if (updates.lifetime.mvp.highScore === score) {
                    // High score might have been from this combat, but we can't easily recalculate
                    // This is a limitation - we'd need to track all scores to properly recalculate
                    updates.lifetime.mvp.highScore = Math.max(0, (updates.lifetime.mvp.highScore || 0));
                }
            }
        }

        await this.updatePlayerStats(actorId, updates);
        return true;
    }

    /**
     * Remove a combat from all players' stats
     * @param {string} combatId - The combat ID to remove
     * @param {Object} combatSummary - The combat summary with participant data
     * @returns {Promise<number>} Number of players updated
     */
    static async removeCombatFromAllPlayers(combatId, combatSummary) {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Player Stats: Only GMs can remove combat from player statistics", "", false, true);
            return 0;
        }

        if (!combatSummary?.participants) return 0;

        let updatedCount = 0;
        for (const participant of combatSummary.participants) {
            const actorId = participant.actorId;
            if (!actorId) continue;

            const actor = game.actors.get(actorId);
            if (!actor || !actor.hasPlayerOwner || actor.isToken) continue;

            const removed = await this.removeCombatFromPlayerStats(actorId, combatId, combatSummary);
            if (removed) updatedCount++;
        }

        postConsoleAndNotification(MODULE.NAME, `Player Stats | Removed combat from ${updatedCount} player(s)`, {
            combatId,
            updatedCount
        }, false, false);

        return updatedCount;
    }

    // Session management methods
    static _getSessionStats(actorId) {
        if (!this._sessionStats.has(actorId)) {
            this._sessionStats.set(actorId, foundry.utils.deepClone(CPB_STATS_DEFAULTS.session));
        }
        return this._sessionStats.get(actorId);
    }

    static _updateSessionStats(actorId, updates) {
        const currentStats = this._getSessionStats(actorId);
        const newStats = foundry.utils.mergeObject(currentStats, updates);
        this._sessionStats.set(actorId, newStats);
    }

    // Combat update handler
    static async _onCombatUpdate(combat, changed, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Only process if turn changed or combat ended
        if (!changed.turn && !changed.round && !changed.active) return;

        const currentTurn = combat.turns[combat.turn];
        const previousTurn = combat.turns[combat.previous?.turn];

        // Process previous turn if it exists and was a player character
        if (previousTurn && this._isPlayerCharacter(previousTurn)) {
            await this._processTurnEnd(combat, previousTurn);
        }

        // Start tracking new turn if it's a player character
        if (currentTurn && this._isPlayerCharacter(currentTurn) && combat.started) {
            await this._processTurnStart(combat, currentTurn);
        }
    }

    // Turn processing methods
    static async _processTurnStart(combat, combatant) {
        const actorId = combatant.actorId;
        const sessionStats = this._getSessionStats(actorId);
        
        if (!sessionStats.currentCombat) {
            sessionStats.currentCombat = {
                startTime: Date.now(),
                turns: []
            };
        }

        // Record turn start
        const turnData = {
            startTime: Date.now(),
            round: combat.round,
            turnNumber: combat.turn
        };
        
        this._boundedPush(sessionStats.currentCombat.turns, turnData);
        this._updateSessionStats(actorId, { currentCombat: sessionStats.currentCombat });
    }

    static async _processTurnEnd(combat, combatant) {
        const actorId = combatant.actorId;
        const sessionStats = this._getSessionStats(actorId);
        
        if (!sessionStats.currentCombat?.turns.length) return;

        // Get the last turn for this combatant
        const currentTurn = sessionStats.currentCombat.turns[sessionStats.currentCombat.turns.length - 1];
        if (!currentTurn.startTime) return;

        // Calculate turn duration
        const endTime = Date.now();
        const duration = (endTime - currentTurn.startTime) / 1000; // Convert to seconds

        // Update session stats
        currentTurn.endTime = endTime;
        currentTurn.duration = duration;

        this._updateSessionStats(actorId, { currentCombat: sessionStats.currentCombat });

        // Update lifetime stats
        const currentStats = await this.getPlayerStats(actorId);
        const turnStats = currentStats.lifetime.turnStats;
        
        // Update turn time averages
        turnStats.total += duration;
        turnStats.count += 1;
        turnStats.average = turnStats.total / turnStats.count;

        // Update fastest/slowest turns
        if (!turnStats.fastest || duration < turnStats.fastest.duration) {
            turnStats.fastest = {
                duration,
                round: combat.round,
                date: new Date().toISOString()
            };
        }
        if (!turnStats.slowest || duration > turnStats.slowest.duration) {
            turnStats.slowest = {
                duration,
                round: combat.round,
                date: new Date().toISOString()
            };
        }

        await this.updatePlayerStats(actorId, { lifetime: { turnStats } });
    }

    // Utility methods
    static _isPlayerCharacter(combatant) {
        return isPlayerCharacter(combatant);
    }

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

    // Attack roll handler
    static async _onAttackRoll(item, roll, ammo) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const actor = item.parent;
        if (!actor || !actor.hasPlayerOwner || actor.isToken) return;

        try {
            // Get the d20 result
            const d20Result = roll.dice.find(d => d.faces === 20)?.results?.[0]?.result;
            if (!d20Result) return;

            const isCritical = d20Result === 20;
            const isFumble = d20Result === 1;

            // Store attack info in session for when damage is rolled
            const sessionStats = this._getSessionStats(actor.id);
            const attackId = foundry.utils.randomID();
            
            sessionStats.pendingAttacks.set(attackId, {
                attackRoll: roll.total,
                isCritical,
                isFumble,
                weaponName: item.name,
                timestamp: Date.now(),
                targetActor: game.user.targets.first()?.actor,
                sceneName: game.scenes.current?.name || 'Unknown Scene'
            });

            this._updateSessionStats(actor.id, sessionStats);

            // Update crit/fumble counts immediately
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error processing attack roll:`, error, false, false);
        }
    }

    // Damage roll handler
    static async _onDamageRoll(item, roll) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const actor = item.parent;
        if (!actor || !actor.hasPlayerOwner || actor.isToken) return;

        try {
            const rollTotal = roll.total;
            const isHealing = item.system.actionType === 'heal';

            // Get current stats
            const stats = await this.getPlayerStats(actor.id);
            if (!stats) return;

            const updates = { lifetime: {} };
            const sessionStats = this._getSessionStats(actor.id);

            if (isHealing) {
                updates.lifetime.healing = updates.lifetime.healing || {};
                updates.lifetime.healing.total = (stats.lifetime.healing.total || 0) + rollTotal;
            } else {
                // Find the matching attack roll
                let attackInfo = null;
                for (const [id, attack] of sessionStats.pendingAttacks) {
                    if (Date.now() - attack.timestamp < 10000) { // Within last 10 seconds
                        attackInfo = attack;
                        sessionStats.pendingAttacks.delete(id);
                        break;
                    }
                }

                updates.lifetime.attacks = foundry.utils.deepClone(stats.lifetime.attacks);
                
                // Record the hit and update totals
                updates.lifetime.attacks.totalHits = (stats.lifetime.attacks.totalHits || 0) + 1;
                updates.lifetime.attacks.totalDamage = (stats.lifetime.attacks.totalDamage || 0) + rollTotal;

                // Track damage by weapon
                const weaponName = item.name || 'Unknown Weapon';
                updates.lifetime.attacks.damageByWeapon[weaponName] = (updates.lifetime.attacks.damageByWeapon[weaponName] || 0) + rollTotal;

                // Track damage by type
                const damageType = item.system.damage?.parts?.[0]?.[1] || 'unspecified';
                updates.lifetime.attacks.damageByType[damageType] = (updates.lifetime.attacks.damageByType[damageType] || 0) + rollTotal;

                // Update biggest/weakest hits
                const hitDetails = {
                    amount: rollTotal,
                    date: new Date().toISOString(),
                    weaponName: item.name,
                    attackRoll: attackInfo?.attackRoll,
                    targetName: attackInfo?.targetActor?.name || 'Unknown Target',
                    targetAC: attackInfo?.targetActor?.system?.attributes?.ac?.value,
                    sceneName: attackInfo?.sceneName || game.scenes.current?.name,
                    isCritical: attackInfo?.isCritical || false
                };

                // Update biggest hit - check if current biggest exists and compare amounts
                const currentBiggest = stats.lifetime.attacks.biggest;
                if (!currentBiggest || !currentBiggest.amount || rollTotal > currentBiggest.amount) {
                    updates.lifetime.attacks.biggest = foundry.utils.deepClone(hitDetails);
                }
                
                // Update weakest hit - check if current weakest exists and compare amounts
                const currentWeakest = stats.lifetime.attacks.weakest;
                if (!currentWeakest || !currentWeakest.amount || (rollTotal > 0 && (rollTotal < currentWeakest.amount || currentWeakest.amount === 0))) {
                    updates.lifetime.attacks.weakest = foundry.utils.deepClone(hitDetails);
                }

                // Add to hit log
                const hitLog = [...(stats.lifetime.attacks.hitLog || [])];
                hitLog.unshift(hitDetails);
                updates.lifetime.attacks.hitLog = hitLog.slice(0, 20); // Keep last 20 hits
            }

            await this.updatePlayerStats(actor.id, updates);

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error processing damage roll:`, error, false, false);
            postConsoleAndNotification(MODULE.NAME, 'Actor:', actor, false, false);
            postConsoleAndNotification(MODULE.NAME, 'Combat:', game.combat, false, false);
            postConsoleAndNotification(MODULE.NAME, 'Roll:', roll, false, false);
        }
    }

    static async _onActorUpdate(actor, changes, options, userId) {
        if (!game.user.isGM) return;
        // We'll implement this to track HP changes and unconsciousness
    }

    /**
     * Consume end-of-combat summaries to update lifetime actor statistics.
     * @param {Object} summary - Summary emitted by `CombatStats`.
     * @param {Combat} combat - The source combat document.
     */
    static async _onCombatSummaryReady(summary, combat) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        if (!summary?.participants?.length) return;

        const rankings = summary.notableMoments?.mvpRankings || [];

        for (const participant of summary.participants) {
            const actorId = participant.actorId;
            if (!actorId) continue;

            const actor = game.actors.get(actorId);
            if (!actor || !actor.hasPlayerOwner || actor.isToken) continue;

            const stats = await this.getPlayerStats(actorId);
            if (!stats) continue;

            const lifetimeAttacks = stats.lifetime?.attacks || {};
            const updates = {
                lifetime: {
                    attacks: {
                        totalHits: (lifetimeAttacks.totalHits || 0) + (participant.hits || 0),
                        totalMisses: (lifetimeAttacks.totalMisses || 0) + (participant.misses || 0),
                        criticals: (lifetimeAttacks.criticals || 0) + (participant.criticals || 0),
                        fumbles: (lifetimeAttacks.fumbles || 0) + (participant.fumbles || 0)
                    },
                    mvp: { ...stats.lifetime?.mvp }
                }
            };

            const rankingIndex = rankings.findIndex(r => r.actorId === actorId);
            const rankingEntry = rankingIndex >= 0 ? rankings[rankingIndex] : null;
            const score = rankingEntry?.score ?? null;
            const rank = rankingEntry ? rankingIndex + 1 : null;
            if (rankingEntry) {
                updates.lifetime.mvp = CPBPlayerStats._updateLifetimeMvp(stats.lifetime?.mvp, score, rank, false);
            }

            await this.updatePlayerStats(actorId, updates);

            const sessionStats = this._getSessionStats(actorId);
            if (sessionStats) {
                const combatRecord = {
                    combatId: summary.combatId,
                    date: summary.date,
                    damageDealt: participant.damageDealt || 0,
                    damageTaken: participant.damageTaken || 0,
                    healingGiven: participant.healingGiven || 0,
                    healingReceived: participant.healingReceived || 0,
                    hits: participant.hits || 0,
                    misses: participant.misses || 0
                };
                if (rankingEntry) {
                    combatRecord.mvpScore = rankingEntry.score;
                    combatRecord.mvpRank = rank;
                }
                this._boundedPush(sessionStats.combats, combatRecord, 20);
                sessionStats.currentCombat = null;
            }
        }
    }

    static async _applyRoundMvpScore({ actorId, score, rank }) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        if (!actorId || typeof score !== 'number') return;

        const actor = game.actors.get(actorId);
        if (!actor || !actor.hasPlayerOwner || actor.isToken) return;

        const stats = await this.getPlayerStats(actor.id);
        if (!stats) return;

        const updatedMvp = this._updateLifetimeMvp(stats.lifetime?.mvp, score, rank, true);
        await this.updatePlayerStats(actor.id, { lifetime: { mvp: updatedMvp } });

        postConsoleAndNotification(
            MODULE.NAME,
            'COMBAT STATS: MVP round score applied',
            {
                actorId: actor.id,
                actorName: actor.name,
                score,
                rank,
                totalScore: updatedMvp.totalScore,
                combats: updatedMvp.combats,
                averageScore: updatedMvp.averageScore
            },
            true,
            false
        );
    }
}

export { CPBPlayerStats, CPB_STATS_DEFAULTS }; 
