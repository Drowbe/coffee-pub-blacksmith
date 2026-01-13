/**
 * Tier 3 statistics manager for Coffee Pub Blacksmith.
 * - Maintains per-session data (in-memory) and lifetime aggregates on actor flags.
 * - Listens for combat summaries to update long-term records (MVP totals, damage, etc.).
 */

// Import MODULE variables
import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, trimString, isPlayerCharacter } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { resolveAttackMessage, resolveDamageMessage, makeKey } from './utility-message-resolution.js';
import { CombatStats } from './stats-combat.js';

// Default stats structure
const CPB_STATS_DEFAULTS = {
    session: {
        combats: [],
        currentCombat: null,
        combatTracking: {
            // Track what we've added during current combat to avoid double counting at combat end
            hitsAdded: 0,
            critsAdded: 0,
            fumblesAdded: 0
        }
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
            given: 0,
            unattributedGiven: 0,
            byTarget: {},
            mostHealed: null,
            leastHealed: null
        },
        revives: {
            received: 0,
            given: 0
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
        unconscious: {
            count: 0,
            log: [] // Store last X unconscious events (date, sceneName, attackerName, weaponName, damageAmount)
        },
        movement: 0,
        lastUpdated: null
    }
};

class CPBPlayerStats {
    // Attack resolution cache for correlating damage to attacks (separate from CombatStats)
    static _attackCache = new Map(); // key -> { attackEvent, processedDamageMsgIds: Set<string>, ts }
    static ATTACK_TTL_MS = 15_000; // 15 second TTL for attack cache entries
    
    // HP cache for preUpdateActor hook (keyed by actor.uuid)
    static _preHpCache = new Map(); // key: actor.uuid, value: { hp: number, temp: number, max: number }
    
    // Cache to track recently recorded unconscious events (to avoid duplicates from HP delta)
    static _recentUnconsciousRecorded = new Map(); // key: actor.id, value: timestamp
    
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
        // Chat message hook - source of truth for attack/damage resolution
        const createChatMessageHookId = HookManager.registerHook({
			name: 'createChatMessage',
			description: 'Player Stats: Resolve attacks and correlate damage from chat messages',
			context: 'stats-player-chat-messages',
			priority: 3,
			callback: this._onChatMessage.bind(this)
		});
        
        // Roll hooks - narrowed to only crit/fumble detection (min risk approach)
        const rollAttackHookId = HookManager.registerHook({
			name: 'dnd5e.rollAttack',
			description: 'Player Stats: Track crits/fumbles for player characters (narrowed scope)',
			context: 'stats-player-attack-rolls',
			priority: 3,
			callback: this._onAttackRoll.bind(this)
		});
		
		const rollDamageHookId = HookManager.registerHook({
			name: 'dnd5e.rollDamage',
			description: 'Player Stats: Not used for damage tracking (handled by createChatMessage)',
			context: 'stats-player-damage-rolls',
			priority: 3,
			callback: () => {
				// No-op - damage tracking moved to createChatMessage
				// This hook kept for now to avoid breaking existing registration
			}
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
        
        // Register preUpdateActor hook for HP tracking
        const preUpdateActorHookId = HookManager.registerHook({
            name: 'preUpdateActor',
            description: 'Player Stats: Capture HP before update for healing tracking',
            context: 'stats-player-hp-tracking',
            priority: 3,
            callback: this._onPreActorUpdate.bind(this)
        });
        
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
        // For unconscious.log array, we need to ensure it's always present, so handle it specially
        let newStats = foundry.utils.mergeObject(currentStats, updates, {
            insertKeys: true,
            overwrite: true,
            recursive: true,
            inplace: false
        });
        
        // Special handling: If we're updating unconscious, ensure log array exists
        if (updates.lifetime?.unconscious) {
            if (!newStats.lifetime) newStats.lifetime = {};
            if (!newStats.lifetime.unconscious) newStats.lifetime.unconscious = {};
            // Explicitly set the log array to ensure it's preserved
            if (updates.lifetime.unconscious.log) {
                newStats.lifetime.unconscious.log = foundry.utils.deepClone(updates.lifetime.unconscious.log);
            }
            // Explicitly set the count
            if (typeof updates.lifetime.unconscious.count === 'number') {
                newStats.lifetime.unconscious.count = updates.lifetime.unconscious.count;
            }
        }
        
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

    /**
     * Prune expired entries from the attack cache.
     * Should be called periodically (e.g., on each createChatMessage).
     */
    static _pruneAttackCache() {
        const now = Date.now();
        for (const [key, entry] of CPBPlayerStats._attackCache.entries()) {
            if (now - entry.ts > CPBPlayerStats.ATTACK_TTL_MS) {
                CPBPlayerStats._attackCache.delete(key);
            }
        }
    }

    /**
     * Chat message handler - source of truth for attack/damage resolution.
     * Resolves attack messages to compute hit/miss and correlates damage messages to attacks.
     * @param {ChatMessage} message - The chat message
     */
    static async _onChatMessage(message) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        // Prune expired cache entries
        CPBPlayerStats._pruneAttackCache();

        // DIAGNOSTIC: Log healing messages for debugging (using reliable activity.type signal)
        const dnd = message.flags?.dnd5e;
        const activityType = dnd?.activity?.type;
        if (activityType === "heal") {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Chat Message (healing detected):', {
                messageId: message.id,
                rollType: dnd?.roll?.type ?? 'none',
                activityType: activityType,
                itemName: dnd?.item?.name ?? 'none',
                speaker: message.speaker?.actor ?? 'none',
                targets: dnd?.targets?.map(t => t.uuid) ?? []
            }, true, false);
        }

        // 1) Try to resolve as attack message
        const attackEvent = resolveAttackMessage(message);
        if (attackEvent) {
            // Only process player character attacks
            const attackerActor = game.actors.get(attackEvent.attackerActorId);
            if (!attackerActor || !attackerActor.hasPlayerOwner) {
                return; // Skip non-player actors
            }

            // Cache the attack resolution for damage correlation
            CPBPlayerStats._attackCache.set(attackEvent.key, {
                attackEvent: attackEvent,
                processedDamageMsgIds: new Set(),
                ts: attackEvent.ts
            });

            // Process the resolved attack event (records hits/misses)
            await CPBPlayerStats._processResolvedAttack(attackEvent);

            // Debug log for correlation verification
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Attack Resolved:', {
                key: attackEvent.key,
                attacker: attackerActor.name,
                attackTotal: attackEvent.attackTotal,
                hitTargetsCount: attackEvent.hitTargets.length,
                missTargetsCount: attackEvent.missTargets.length
            }, true, false);

            return;
        }

        // 2) Try to resolve as damage message
        const damageEvent = resolveDamageMessage(message);
        if (!damageEvent) return;

        // Get attacker actor (can be player or NPC - we need both for unconscious tracking)
        const attackerActor = game.actors.get(damageEvent.attackerActorId);
        if (!attackerActor) {
            return; // Can't process without attacker
        }
        
        // Only track damage stats for player attackers, but we'll process all damage for unconscious tracking
        const isPlayerAttacker = attackerActor.hasPlayerOwner;

        // Correlate damage to cached attack - check both caches
        // CPBPlayerStats cache has player attacks, CombatStats cache has ALL attacks (including NPCs)
        let cacheEntry = CPBPlayerStats._attackCache.get(damageEvent.key);
        if (!cacheEntry) {
            // Not in player cache - check CombatStats cache (has NPC attacks too)
            cacheEntry = CombatStats._attackCache.get(damageEvent.key);
        }
        
        if (!cacheEntry) {
            // Couldn't correlate - check if this is healing before skipping
            // Healing spells don't have attacks, so they'll be unlinked
            let item = null;
            if (damageEvent.itemUuid) {
                try {
                    item = await fromUuid(damageEvent.itemUuid);
                } catch (e) {
                    // Skip if can't resolve
                }
            }
            
            // Check if this is healing using the only reliable signal: activity.type === "heal"
            // Per developer review: In dnd5e 5.2.4, healing rolls appear as roll.type === "damage"
            // but activity.type === "heal" is the reliable indicator
            const dnd = message.flags?.dnd5e;
            const activityType = dnd?.activity?.type;
            const isHealing = activityType === "heal";
            
            if (isHealing) {
                // This is healing - track it for the caster's lifetime stats (informational/attribution only)
                // HP delta tracking remains the source of truth for applied healing
                if (item) {
                    await CPBPlayerStats._recordRolledHealing(attackerActor, damageEvent, item);
                }
                return; // Tracked - HP delta will also track applied healing on target
            }
            
            // Not healing and couldn't correlate - treat as unlinked damage (skip for now)
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unlinked Damage (skipped):', {
                key: damageEvent.key,
                damageTotal: damageEvent.damageTotal,
                attacker: attackerActor.name
            }, true, false);
            return;
        }

        // Check dedupe - skip if we've already processed this damage message
        if (cacheEntry.processedDamageMsgIds.has(damageEvent.damageMsgId)) {
            return; // Already processed
        }

        // Mark this damage message as processed
        cacheEntry.processedDamageMsgIds.add(damageEvent.damageMsgId);

        // Classify damage based on attack outcome
        const hadHit = cacheEntry.attackEvent.hitTargets.length > 0;
        const isWeaponAttack = cacheEntry.attackEvent.itemType === "weapon";

        // Classification rules (same as CombatStats)
        if (isWeaponAttack && hadHit) {
            damageEvent.bucket = "onHit";
        } else if (isWeaponAttack && !hadHit) {
            damageEvent.bucket = "other";
        } else if (hadHit) {
            damageEvent.bucket = "onHit";
        } else {
            damageEvent.bucket = "other";
        }

        damageEvent.attackMsgId = cacheEntry.attackEvent.attackMsgId;

        // Debug log for correlation verification
        const cacheSource = CPBPlayerStats._attackCache.has(damageEvent.key) ? 'CPBPlayerStats' : 'CombatStats';
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Damage Resolved:', {
            key: damageEvent.key,
            attacker: attackerActor.name,
            isPlayerAttacker: isPlayerAttacker,
            cacheSource: cacheSource,
            bucket: damageEvent.bucket,
            damageTotal: damageEvent.damageTotal,
            attackMsgId: damageEvent.attackMsgId
        }, true, false);

        // Process the classified damage event
        // Only track damage stats for player attackers, but process all for unconscious tracking
        if (isPlayerAttacker) {
            await CPBPlayerStats._processResolvedDamage(damageEvent);
        } else {
            // For NPC attackers, we still want to check if a player target went unconscious
            // But we don't track damage stats for NPCs
            await CPBPlayerStats._processResolvedDamageForUnconscious(damageEvent);
        }
    }

    /**
     * Process a resolved attack event for player stats.
     * Records hits and misses per target.
     * @param {AttackResolvedEvent} attackEvent - Normalized attack event
     */
    static async _processResolvedAttack(attackEvent) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const attackerActor = game.actors.get(attackEvent.attackerActorId);
        if (!attackerActor || !attackerActor.hasPlayerOwner) {
            return;
        }

        // Process hits and misses from resolved attack
        // Note: We track hits/misses here for real-time updates
        // Combat summary will reconcile at end of combat
        const stats = await this.getPlayerStats(attackerActor.id);
        if (!stats) return;

        const sessionStats = this._getSessionStats(attackerActor.id);
        if (!sessionStats.combatTracking) {
            sessionStats.combatTracking = { hitsAdded: 0, critsAdded: 0, fumblesAdded: 0 };
        }

        // Track hits/misses for this combat (will be reconciled at combat end)
        const hitsThisCombat = attackEvent.hitTargets.length;
        const missesThisCombat = attackEvent.missTargets.length;

        // Update lifetime stats in real-time (will be reconciled later)
        const lifetimeAttacks = stats.lifetime?.attacks || {};
        const updates = {
            lifetime: {
                attacks: {
                    totalHits: (lifetimeAttacks.totalHits || 0) + hitsThisCombat,
                    totalMisses: (lifetimeAttacks.totalMisses || 0) + missesThisCombat
                }
            }
        };

        // Update hit/miss ratio
        const newTotalHits = updates.lifetime.attacks.totalHits;
        const newTotalMisses = updates.lifetime.attacks.totalMisses;
        const totalAttacks = newTotalHits + newTotalMisses;
        updates.lifetime.attacks.hitMissRatio = totalAttacks > 0 ? ((newTotalHits / totalAttacks) * 100) : 0;

        // Log collected data in human-readable format before writing to actor
        const attackLogMessage = [
            `=== PLAYER STATS - ATTACK DATA (${attackerActor.name}) ===`,
            `Attack Roll: ${attackEvent.attackTotal ?? 'N/A'}`,
            `Hit Targets: ${hitsThisCombat} (UUIDs: ${attackEvent.hitTargets.join(', ') || 'none'})`,
            `Miss Targets: ${missesThisCombat} (UUIDs: ${attackEvent.missTargets.join(', ') || 'none'})`,
            `Unknown Targets: ${attackEvent.unknownTargets.length} (UUIDs: ${attackEvent.unknownTargets.join(', ') || 'none'})`,
            `--- Lifetime Totals (Before Update) ---`,
            `  Total Hits: ${lifetimeAttacks.totalHits || 0} → ${updates.lifetime.attacks.totalHits} (+${hitsThisCombat})`,
            `  Total Misses: ${lifetimeAttacks.totalMisses || 0} → ${updates.lifetime.attacks.totalMisses} (+${missesThisCombat})`,
            `  Hit/Miss Ratio: ${lifetimeAttacks.hitMissRatio?.toFixed(2) || 0}% → ${updates.lifetime.attacks.hitMissRatio.toFixed(2)}%`,
            `========================================`
        ].join('\n');
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Attack Data', attackLogMessage, false, false);

        await this.updatePlayerStats(attackerActor.id, updates);

        // Track what we added during this combat (for reconciliation)
        sessionStats.combatTracking.hitsAdded = (sessionStats.combatTracking.hitsAdded || 0) + hitsThisCombat;
        this._updateSessionStats(attackerActor.id, sessionStats);
    }

    /**
     * Process a resolved damage event for unconscious tracking only (NPC attackers).
     * Doesn't track damage stats, just checks if a player target went unconscious.
     * @param {DamageResolvedEvent} damageEvent - Normalized damage event
     */
    static async _processResolvedDamageForUnconscious(damageEvent) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const attackerActor = game.actors.get(damageEvent.attackerActorId);
        if (!attackerActor) return;

        // Get item
        let item = null;
        if (damageEvent.itemUuid) {
            try {
                item = await fromUuid(damageEvent.itemUuid);
            } catch (e) {
                // Skip if can't resolve
            }
        }

        // Get target actor from attack cache
        const cacheEntry = CPBPlayerStats._attackCache.get(damageEvent.key) || CombatStats._attackCache.get(damageEvent.key);
        const attackEvent = cacheEntry?.attackEvent;
        
        let targetActor = null;
        if (attackEvent?.hitTargets?.length > 0) {
            try {
                const firstTargetUuid = attackEvent.hitTargets[0];
                const targetDoc = await fromUuid(firstTargetUuid);
                const targetActorDoc = targetDoc?.actor ?? targetDoc;
                targetActor = targetActorDoc;
            } catch (e) {
                // Skip if can't resolve
            }
        }
        
        // Check if this damage caused a player target to go unconscious
        if (targetActor && targetActor.id && targetActor.hasPlayerOwner) {
            try {
                // Get current HP and check if damage would cause unconscious
                // We need to check BEFORE damage is applied, so get current HP and subtract damage
                const currentHp = targetActor.system?.attributes?.hp?.value ?? null;
                if (currentHp !== null) {
                    // Calculate HP after this damage
                    const hpAfterDamage = currentHp - damageEvent.damageTotal;
                    
                    // If HP would drop to 0 or below, record unconscious
                    // We check hpAfterDamage <= 0 instead of currentHp <= 0 because
                    // the HP might not be updated yet when the damage message fires
                    if (hpAfterDamage <= 0 && currentHp > 0) {
                        await this._recordUnconsciousFromDamage(
                            targetActor,
                            currentHp,
                            hpAfterDamage,
                            attackerActor.name,
                            item?.name || 'Unknown Weapon',
                            damageEvent.damageTotal
                        );
                    }
                }
            } catch (e) {
                // Skip if can't check HP
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious (NPC): Error checking HP', {
                    error: e.message,
                    target: targetActor?.name
                }, true, false);
            }
        }
    }

    /**
     * Process a resolved damage event for player stats.
     * Only tracks damage if classified as "onHit" (hit-based damage).
     * Also checks for unconscious events.
     * @param {DamageResolvedEvent} damageEvent - Normalized damage event
     */
    static async _processResolvedDamage(damageEvent) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        // Only track damage if it's classified as "onHit" (hit-based damage)
        // "other" bucket includes midi miss damage, AOE effects, etc. - track separately if desired
        if (damageEvent.bucket !== "onHit") {
            // For now, skip non-hit damage to maintain current behavior
            // In the future, we could track "damage.rolled.other" separately
            return;
        }

        const attackerActor = game.actors.get(damageEvent.attackerActorId);
        if (!attackerActor || !attackerActor.hasPlayerOwner) {
            return;
        }

        // Get item to process damage
        let item = null;
        if (damageEvent.itemUuid) {
            try {
                item = await fromUuid(damageEvent.itemUuid);
            } catch (e) {
                // Skip if can't resolve
            }
        }

        if (!item) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Damage Resolved: Item not found', {
                key: damageEvent.key,
                itemUuid: damageEvent.itemUuid
            }, true, false);
            return;
        }

        // Get fresh stats to ensure we have latest values
        const stats = await this.getPlayerStats(attackerActor.id);
            if (!stats) return;

        const lifetimeAttacks = stats.lifetime?.attacks || {};
        const sessionStats = this._getSessionStats(attackerActor.id);
        
        // Initialize combat tracking if needed
        if (!sessionStats.combatTracking) {
            sessionStats.combatTracking = { hitsAdded: 0, critsAdded: 0, fumblesAdded: 0 };
        }

        // Deep clone to preserve nested objects
        const clonedAttacks = foundry.utils.deepClone(lifetimeAttacks);
        
        // Track damage in real-time (only for onHit damage)
        clonedAttacks.totalDamage = (lifetimeAttacks.totalDamage || 0) + damageEvent.damageTotal;

                // Track damage by weapon
                const weaponName = item.name || 'Unknown Weapon';
        if (!clonedAttacks.damageByWeapon) {
            clonedAttacks.damageByWeapon = {};
        }
        clonedAttacks.damageByWeapon[weaponName] = (clonedAttacks.damageByWeapon[weaponName] || 0) + damageEvent.damageTotal;

                // Track damage by type
        if (!clonedAttacks.damageByType) {
            clonedAttacks.damageByType = {};
        }
        const damageParts = item.system.damage?.parts || [];
        if (damageParts.length > 0) {
            for (const part of damageParts) {
                const damageType = part?.[1] || 'unspecified';
                const typeDamage = damageParts.length === 1 ? damageEvent.damageTotal : Math.round(damageEvent.damageTotal / damageParts.length);
                clonedAttacks.damageByType[damageType] = (clonedAttacks.damageByType[damageType] || 0) + typeDamage;
            }
        } else {
            clonedAttacks.damageByType['unspecified'] = (clonedAttacks.damageByType['unspecified'] || 0) + damageEvent.damageTotal;
        }

        // Get cached attack event for hit details
        const cacheEntry = CPBPlayerStats._attackCache.get(damageEvent.key);
        const attackEvent = cacheEntry?.attackEvent;

        // Try to get target name from first hit target (simplified - don't block on async resolution)
        let targetName = 'Unknown Target';
        let targetAC = null;
        let targetActor = null; // We'll use this for unconscious tracking
        if (attackEvent?.hitTargets?.length > 0) {
            try {
                const firstTargetUuid = attackEvent.hitTargets[0];
                const targetDoc = await fromUuid(firstTargetUuid);
                const targetActorDoc = targetDoc?.actor ?? targetDoc;
                targetActor = targetActorDoc; // Save for unconscious check
                if (targetActorDoc?.name) {
                    targetName = targetActorDoc.name;
                }
                // Get AC from the target outcome
                const targetOutcome = attackEvent.targets.find(t => t.uuid === firstTargetUuid);
                targetAC = targetOutcome?.ac ?? null;
            } catch (e) {
                // Skip if can't resolve - not critical
            }
        }
        
        // Check if this damage caused the target (player) to go unconscious
        // We have all the context here: attacker, weapon, damage, target
        // Track unconscious for player targets, regardless of who the attacker is
        if (targetActor && targetActor.id && targetActor.hasPlayerOwner) {
            try {
                // Get current HP from the target actor (BEFORE damage is applied)
                const currentHp = targetActor.system?.attributes?.hp?.value ?? null;
                
                if (currentHp !== null) {
                    // Calculate HP after this damage would be applied
                    const hpAfterDamage = currentHp - damageEvent.damageTotal;
                    
                    postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Checking from damage', {
                        target: targetActor.name,
                        targetId: targetActor.id,
                        currentHp: currentHp,
                        damageTotal: damageEvent.damageTotal,
                        hpAfterDamage: hpAfterDamage,
                        attacker: attackerActor?.name,
                        weapon: item?.name
                    }, true, false);
                    
                    // If damage would cause HP to drop to 0 or below (and current HP > 0), record unconscious
                    // We check hpAfterDamage <= 0 because the HP might not be updated yet when damage message fires
                    if (hpAfterDamage <= 0 && currentHp > 0) {
                        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Recording from damage', {
                            target: targetActor.name,
                            oldHp: currentHp,
                            newHp: hpAfterDamage,
                            attacker: attackerActor?.name,
                            weapon: item?.name
                        }, true, false);
                        
                        // Record unconscious event on the target actor
                        await this._recordUnconsciousFromDamage(
                            targetActor,
                            currentHp,
                            hpAfterDamage,
                            attackerActor?.name || 'Unknown Attacker',
                            item?.name || 'Unknown Weapon',
                            damageEvent.damageTotal
                        );
                        
                        // Mark that we've recorded this so HP delta method doesn't duplicate
                        if (!CPBPlayerStats._recentUnconsciousRecorded) {
                            CPBPlayerStats._recentUnconsciousRecorded = new Map();
                        }
                        CPBPlayerStats._recentUnconsciousRecorded.set(targetActor.id, Date.now());
                        
                        // Clean up old entries (older than 5 seconds)
                        const now = Date.now();
                        for (const [actorId, timestamp] of CPBPlayerStats._recentUnconsciousRecorded.entries()) {
                            if (now - timestamp > 5000) {
                                CPBPlayerStats._recentUnconsciousRecorded.delete(actorId);
                            }
                        }
                    }
                }
            } catch (e) {
                // Skip if can't check HP - not critical
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Error checking target HP', {
                    error: e.message,
                    target: targetName
                }, true, false);
            }
        }

        // Check if this was a critical (from roll hook state - will be set by _onAttackRoll for nat 20)
        // Note: We track crits from roll hooks, so check if there's a recent crit for this actor
        // For now, we'll set isCritical based on whether the attack had a nat 20
        // This is a simplification - ideally we'd track this in the cache entry
        const isCritical = false; // Will be improved when we better integrate crit tracking

                // Update biggest/weakest hits
                const hitDetails = {
            amount: damageEvent.damageTotal,
            date: new Date(damageEvent.ts).toISOString(),
                    weaponName: item.name,
            attackRoll: attackEvent?.attackTotal ?? null,
            targetName: targetName,
            targetAC: targetAC,
            sceneName: game.scenes.current?.name || 'Unknown Scene',
            isCritical: isCritical
        };

        // Update biggest hit
        const currentBiggest = clonedAttacks.biggest;
        const currentBiggestAmount = currentBiggest?.amount || 0;
        if (damageEvent.damageTotal > currentBiggestAmount) {
            clonedAttacks.biggest = foundry.utils.deepClone(hitDetails);
        }

        // Update weakest hit (non-zero, positive damage only)
        const currentWeakest = clonedAttacks.weakest;
        if (damageEvent.damageTotal > 0 && (!currentWeakest || !currentWeakest.amount || (damageEvent.damageTotal < currentWeakest.amount))) {
            clonedAttacks.weakest = foundry.utils.deepClone(hitDetails);
        }

        // Add to hit log (bounded to last 20)
        if (!clonedAttacks.hitLog) {
            clonedAttacks.hitLog = [];
        }
        clonedAttacks.hitLog.push(hitDetails);
        clonedAttacks.hitLog = clonedAttacks.hitLog.slice(-20); // Keep last 20

        // Update stats
        const updates = {
            lifetime: {
                attacks: clonedAttacks
            }
        };

        // Log collected data in human-readable format before writing to actor
        const damageByWeaponLog = Object.entries(clonedAttacks.damageByWeapon || {}).map(([weapon, dmg]) => {
            const oldDmg = lifetimeAttacks.damageByWeapon?.[weapon] || 0;
            const change = dmg - oldDmg;
            return `  ${weapon}: ${oldDmg} → ${dmg} ${change > 0 ? `(+${change})` : ''}`;
        }).join('\n');
        const damageByTypeLog = Object.entries(clonedAttacks.damageByType || {}).map(([type, dmg]) => {
            const oldDmg = lifetimeAttacks.damageByType?.[type] || 0;
            const change = dmg - oldDmg;
            return `  ${type}: ${oldDmg} → ${dmg} ${change > 0 ? `(+${change})` : ''}`;
        }).join('\n');
        const damageLogMessage = [
            `=== PLAYER STATS - DAMAGE DATA (${attackerActor.name}) ===`,
            `Weapon: ${weaponName}`,
            `Damage Total: ${damageEvent.damageTotal}`,
            `Damage Bucket: ${damageEvent.bucket}`,
            `Attack Roll: ${attackEvent?.attackTotal ?? 'N/A'}`,
            `Target: ${targetName} (AC: ${targetAC ?? 'N/A'})`,
            `Is Critical: ${isCritical}`,
            `Scene: ${game.scenes.current?.name || 'Unknown'}`,
            `--- Lifetime Totals (Before Update) ---`,
            `  Total Damage: ${lifetimeAttacks.totalDamage || 0} → ${clonedAttacks.totalDamage} (+${damageEvent.damageTotal})`,
            `  Biggest Hit: ${currentBiggest?.amount || 0} → ${clonedAttacks.biggest.amount} ${damageEvent.damageTotal > currentBiggestAmount ? '(UPDATED)' : '(unchanged)'}`,
            `  Weakest Hit: ${currentWeakest?.amount || 0} → ${clonedAttacks.weakest.amount || 0}`,
            `  Hit Log Entries: ${(lifetimeAttacks.hitLog?.length || 0)} → ${clonedAttacks.hitLog.length}`,
            `--- Damage By Weapon ---`,
            damageByWeaponLog || '  (none)',
            `--- Damage By Type ---`,
            damageByTypeLog || '  (none)',
            `========================================`
        ].join('\n');
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Damage Data', damageLogMessage, false, false);

        await this.updatePlayerStats(attackerActor.id, updates);
    }

    // Attack roll handler - NARROWED to only crit/fumble detection
    static async _onAttackRoll(a, b) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        try {
            // Normalize hook arguments to extract item and rolls
            const { rolls, context, item } = this._normalizeRollHookArgs(a, b);

            if (!item || !item.id) {
                return; // Skip if no item found
            }

            const actor = item.parent;
            if (!actor || !actor.hasPlayerOwner) {
                return; // Skip non-player actors
            }

            // Get the first valid roll (attack rolls typically have one roll)
            const rollObj = rolls?.[0];
            if (!rollObj || rollObj.total === undefined) {
                return; // Skip if no valid roll
            }

            // Get the d20 result - check both dice and terms
            const d20Die = rollObj.dice?.find(d => d.faces === 20) || rollObj.terms?.find(t => t?.faces === 20);
            const d20Result = d20Die?.results?.[0]?.result;
            if (!d20Result) {
                return; // Skip if no d20 found
            }

            const isCritical = d20Result === 20;
            const isFumble = d20Result === 1;

            // Track crits/fumbles in real-time (these are definitive - nat 20 = crit, nat 1 = fumble)
            if (isCritical || isFumble) {
                const stats = await this.getPlayerStats(actor.id);
                if (stats) {
                    const lifetimeAttacks = stats.lifetime?.attacks || {};
                    const sessionStats = this._getSessionStats(actor.id);
                    
                    // Initialize combat tracking if needed
                    if (!sessionStats.combatTracking) {
                        sessionStats.combatTracking = { hitsAdded: 0, critsAdded: 0, fumblesAdded: 0 };
                    }
                    
                    const updates = {
                        lifetime: {
                            attacks: {
                                criticals: isCritical ? (lifetimeAttacks.criticals || 0) + 1 : (lifetimeAttacks.criticals || 0),
                                fumbles: isFumble ? (lifetimeAttacks.fumbles || 0) + 1 : (lifetimeAttacks.fumbles || 0)
                            }
                        }
                    };
            await this.updatePlayerStats(actor.id, updates);

                    // Track that we added crit/fumble during this combat (to avoid double counting at combat end)
                    if (isCritical) {
                        sessionStats.combatTracking.critsAdded = (sessionStats.combatTracking.critsAdded || 0) + 1;
                    }
                    if (isFumble) {
                        sessionStats.combatTracking.fumblesAdded = (sessionStats.combatTracking.fumblesAdded || 0) + 1;
                    }
                    this._updateSessionStats(actor.id, sessionStats);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error processing attack roll:`, error, false, false);
        }
    }

    /**
     * Normalize roll hook arguments to extract item, rolls, and context
     * Matches the pattern used by CombatStats for consistent hook handling
     * @param {*} a - First hook argument (could be item, roll, array, or context)
     * @param {*} b - Second hook argument (could be item, roll, array, or context)
     * @returns {Object} Normalized arguments with { rolls, context, item }
     */
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

    // _onDamageRoll method removed - damage tracking now handled by createChatMessage hook
    // This method is no longer called (hook registration is no-op)

    /**
     * Capture HP state before update for healing/damage tracking.
     * @param {Actor} actor - The actor being updated
     * @param {Object} change - The change data
     * @param {Object} options - Update options
     * @param {string} userId - User ID performing the update
     */
    static _onPreActorUpdate(actor, change, options, userId) {
        if (!game.user.isGM) return;
        
        // Only cache if HP fields are being updated
        const hpChange = change?.system?.attributes?.hp;
        if (!hpChange) return;
        
        // DIAGNOSTIC: Log all HP-related updates to see what's happening
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - preUpdateActor (HP change detected):', {
            actor: actor.name,
            actorId: actor.id,
            actorUuid: actor.uuid,
            hpChange: hpChange,
            currentHp: actor.system?.attributes?.hp?.value ?? 0,
            currentTemp: actor.system?.attributes?.hp?.temp ?? 0,
            currentMax: actor.system?.attributes?.hp?.max ?? 0
        }, true, false);
        
        // Cache current HP state (before update) - use actor.uuid as key
        const cacheEntry = {
            hp: actor.system?.attributes?.hp?.value ?? 0,
            temp: actor.system?.attributes?.hp?.temp ?? 0,
            max: actor.system?.attributes?.hp?.max ?? 0
        };
        
        CPBPlayerStats._preHpCache.set(actor.uuid, cacheEntry);
    }

    /**
     * Track HP changes for applied healing/damage tracking (Lane 1).
     * Records healing based on HP delta (truth of what was applied).
     * @param {Actor} actor - The actor being updated
     * @param {Object} changes - The change data
     * @param {Object} options - Update options
     * @param {string} userId - User ID performing the update
     */
    static async _onActorUpdate(actor, changes, options, userId) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const preHp = CPBPlayerStats._preHpCache.get(actor.uuid);
        CPBPlayerStats._preHpCache.delete(actor.uuid);
        if (!preHp) return;

        const newHp = actor.system?.attributes?.hp?.value ?? 0;
        const newTemp = actor.system?.attributes?.hp?.temp ?? 0;

        const deltaHp = newHp - preHp.hp;
        const deltaTemp = newTemp - preHp.temp;

        if (deltaHp === 0 && deltaTemp === 0) return;

        const combat = game.combat;
        if (!combat?.started) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - HP Change (no active combat):', {
                actor: actor.name,
                deltaHp: deltaHp,
                newHp: newHp,
                oldHp: preHp.hp
            }, true, false);
            return;
        }

        // Check if actor is a combatant (check actorId, c.actor.id, and c.actor.uuid)
        const isCombatant = combat.combatants.some(c => {
            if (c.actorId && c.actorId === actor.id) return true;
            if (c.actor?.id && c.actor.id === actor.id) return true;
            if (c.actor?.uuid && c.actor.uuid === actor.uuid) return true;
            return false;
        });
        if (!isCombatant) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - HP Change (not a combatant):', {
                actor: actor.name,
                deltaHp: deltaHp,
                newHp: newHp,
                oldHp: preHp.hp
            }, true, false);
            return;
        }

        // Skip transforms / HP rebases where max changes in the same update
        const hpChange = changes?.system?.attributes?.hp;
        const maxChangingInThisUpdate =
            hpChange && Object.prototype.hasOwnProperty.call(hpChange, "max");
        if (maxChangingInThisUpdate) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - HP Change (transform detected):', {
                actor: actor.name,
                deltaHp: deltaHp,
                newHp: newHp,
                oldHp: preHp.hp
            }, true, false);
            return;
        }

        // Track healing (deltaHp > 0) - fire and forget to avoid slowing combat
        if (deltaHp > 0) {
            this._recordAppliedHealing(actor, deltaHp, preHp.hp, newHp).catch(error => {
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Error recording healing', error, false, false);
            });
        }

        // Track unconscious (HP went from >0 to 0 or below)
        // Note: This is a fallback for cases where damage doesn't go through chat messages.
        // Most unconscious events should be caught in _processResolvedDamage where we have full context.
        // Skip if we already recorded this from damage processing (within last 5 seconds)
        if (preHp.hp > 0 && newHp <= 0) {
            const recentlyRecorded = CPBPlayerStats._recentUnconsciousRecorded?.get(actor.id);
            const now = Date.now();
            if (recentlyRecorded && (now - recentlyRecorded) < 5000) {
                // Already recorded from damage processing - skip to avoid duplicate
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Skipping HP delta (already recorded from damage)', {
                    actor: actor.name,
                    timeSinceDamageRecord: now - recentlyRecorded
                }, true, false);
                return;
            }
            
            // Not recently recorded from damage - use fallback method
            this._recordUnconscious(actor, preHp.hp, newHp).catch(error => {
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Error recording unconscious', error, false, false);
            });
        }
    }
    
    /**
     * Record applied healing to lifetime stats (Phase 1 - minimal scope).
     * Always records received healing on target, tracks revives.
     * @param {Actor} targetActor - The actor receiving healing
     * @param {number} amount - Amount of healing applied
     * @param {number} oldHp - HP before healing
     * @param {number} newHp - HP after healing
     */
    static async _recordAppliedHealing(targetActor, amount, oldHp, newHp) {
        // Use actor.id for getPlayerStats (current codebase pattern)
        const stats = await this.getPlayerStats(targetActor.id);
        if (!stats) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Healing: Stats not initialized', {
                actor: targetActor.name,
                actorId: targetActor.id
            }, true, false);
            return; // Skip if actor doesn't have stats initialized
        }

        const lifetimeHealing = stats.lifetime?.healing || {};
        const lifetimeRevives = stats.lifetime?.revives || { received: 0 };

        const oldReceived = lifetimeHealing.received || 0;
        const oldRevives = lifetimeRevives.received || 0;
        const isRevive = oldHp === 0 && newHp > 0;

        // Always record received healing on target
        const updates = {
            lifetime: {
                healing: {
                    ...lifetimeHealing,
                    received: oldReceived + amount
                },
                revives: {
                    ...lifetimeRevives
                }
            }
        };

        // Track revives (HP went from 0 to >0)
        if (isRevive) {
            updates.lifetime.revives.received = oldRevives + 1;
        }

        // Log collected data in human-readable format before writing to actor
        const healingLogMessage = [
            `=== PLAYER STATS - HEALING DATA (${targetActor.name}) ===`,
            `Healing Amount: ${amount}`,
            `HP Change: ${oldHp} → ${newHp}`,
            `Is Revive: ${isRevive ? 'Yes' : 'No'}`,
            `Scene: ${game.scenes.current?.name || 'Unknown'}`,
            `--- Lifetime Totals (Before Update) ---`,
            `  Total Healing Received: ${oldReceived} → ${oldReceived + amount} (+${amount})`,
            `  Revives Received: ${oldRevives} → ${oldRevives + (isRevive ? 1 : 0)} ${isRevive ? '(+1)' : '(unchanged)'}`,
            `========================================`
        ].join('\n');
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Healing Data', healingLogMessage, false, false);

        await this.updatePlayerStats(targetActor.id, updates);

        // TODO: Best-effort healer attribution (non-blocking, Phase 2)
        // For now, just record received healing
    }

    /**
     * Record rolled healing for caster's lifetime stats (from chat message).
     * Tracks healing given and total for the caster.
     * 
     * NOTE: This is informational/attribution only. HP delta tracking is the source of truth
     * for applied healing. Chat messages tell us intent, HP delta tells us truth.
     * 
     * @param {Actor} casterActor - The actor casting the healing spell
     * @param {DamageResolvedEvent} damageEvent - The resolved damage/healing event
     * @param {Item} item - The item/spell being used
     */
    static async _recordRolledHealing(casterActor, damageEvent, item) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        
        const stats = await this.getPlayerStats(casterActor.id);
        if (!stats) return;

        const lifetimeHealing = stats.lifetime?.healing || {};
        const healingAmount = damageEvent.damageTotal || 0;
        
        if (healingAmount <= 0) return;

        // Get target info for byTarget tracking
        const targetUuids = damageEvent.targetUuids || [];
        let targetName = 'Unknown Target';
        if (targetUuids.length > 0) {
            try {
                const targetDoc = await fromUuid(targetUuids[0]);
                const targetActorDoc = targetDoc?.actor ?? targetDoc;
                if (targetActorDoc?.name) {
                    targetName = targetActorDoc.name;
                }
            } catch (e) {
                // Skip if can't resolve - not critical
            }
        }

        // Update healing stats for caster
        const updates = {
            lifetime: {
                healing: {
                    ...lifetimeHealing,
                    total: (lifetimeHealing.total || 0) + healingAmount,
                    given: (lifetimeHealing.given || 0) + healingAmount,
                    byTarget: {
                        ...(lifetimeHealing.byTarget || {}),
                        [targetName]: ((lifetimeHealing.byTarget || {})[targetName] || 0) + healingAmount
                    }
                }
            }
        };

        // Update most/least healed
        const byTarget = updates.lifetime.healing.byTarget;
        const targetEntries = Object.entries(byTarget);
        if (targetEntries.length > 0) {
            const sorted = targetEntries.sort((a, b) => b[1] - a[1]);
            updates.lifetime.healing.mostHealed = { name: sorted[0][0], amount: sorted[0][1] };
            updates.lifetime.healing.leastHealed = { name: sorted[sorted.length - 1][0], amount: sorted[sorted.length - 1][1] };
        }

        // Write updates to actor
        await this.updatePlayerStats(casterActor.id, updates);

        // Log collected data
        const healingLogMessage = [
            `=== PLAYER STATS - HEALING GIVEN (${casterActor.name}) ===`,
            `Healing Amount: ${healingAmount}`,
            `Item: ${item.name || 'Unknown'}`,
            `Target: ${targetName}`,
            `--- Lifetime Totals (Before Update) ---`,
            `  Total Healing: ${lifetimeHealing.total || 0} → ${updates.lifetime.healing.total} (+${healingAmount})`,
            `  Healing Given: ${lifetimeHealing.given || 0} → ${updates.lifetime.healing.given} (+${healingAmount})`,
            `========================================`
        ].join('\n');
        postConsoleAndNotification(MODULE.NAME, 'Player Stats | Healing Given', healingLogMessage, false, false);
    }

    /**
     * Record unconscious event when actor HP drops to 0 or below.
     * Tracks count and maintains log of unconscious events with date, scene, and optional attacker info.
     * @param {Actor} targetActor - The actor that went unconscious
     * @param {number} oldHp - HP before the change
     * @param {number} newHp - HP after the change (should be <= 0)
     */
    static async _recordUnconscious(targetActor, oldHp, newHp) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        
        const stats = await this.getPlayerStats(targetActor.id);
        if (!stats) return;

        // Ensure unconscious structure exists and has log array (handle legacy data)
        if (!stats.lifetime) stats.lifetime = {};
        if (!stats.lifetime.unconscious) {
            stats.lifetime.unconscious = { count: 0, log: [] };
        }
        if (!Array.isArray(stats.lifetime.unconscious.log)) {
            stats.lifetime.unconscious.log = [];
        }
        
        const lifetimeUnconscious = stats.lifetime.unconscious;
        
        // Try to find recent damage event that caused this (best-effort attribution)
        let attackerName = null;
        let weaponName = null;
        let damageAmount = null;
        
        // Look for recent damage events targeting this actor (within last 10 seconds - increased from 5)
        const now = Date.now();
        const recentWindow = 10_000; // 10 seconds to account for delayed HP updates
        const targetActorUuid = targetActor.uuid;
        const targetActorId = targetActor.id;
        
        // Debug: Log cache contents
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Searching caches', {
            targetActor: targetActor.name,
            targetUuid: targetActorUuid,
            targetId: targetActorId,
            combatStatsCacheSize: CombatStats._attackCache.size,
            playerStatsCacheSize: CPBPlayerStats._attackCache.size,
            recentWindow: recentWindow
        }, true, false);
        
        // Check both attack caches - CombatStats has ALL attacks (including NPCs), CPBPlayerStats only has player attacks
        const cachesToCheck = [
            { name: 'CombatStats', cache: CombatStats._attackCache },
            { name: 'CPBPlayerStats', cache: CPBPlayerStats._attackCache }
        ];
        
        let bestMatch = null;
        let bestMatchTime = Infinity;
        
        for (const { name: cacheName, cache } of cachesToCheck) {
            for (const [key, cacheEntry] of cache.entries()) {
                const attackEvent = cacheEntry.attackEvent;
                if (!attackEvent) continue;
                
                const timeSinceAttack = now - attackEvent.ts;
                
                // Check if this attack targeted our actor and was recent
                // Try multiple matching strategies:
                // 1. Check UUID in target arrays
                const targetedByUuid = attackEvent.hitTargets.includes(targetActorUuid) || 
                                      attackEvent.missTargets.includes(targetActorUuid) ||
                                      attackEvent.unknownTargets.includes(targetActorUuid);
                
                // 2. Check if any target UUID resolves to our actor
                let targetedByResolution = false;
                if (!targetedByUuid && attackEvent.hitTargets.length > 0) {
                    try {
                        for (const uuid of [...attackEvent.hitTargets, ...attackEvent.missTargets, ...attackEvent.unknownTargets]) {
                            const doc = await fromUuid(uuid);
                            const actorDoc = doc?.actor ?? doc;
                            if (actorDoc?.id === targetActorId || actorDoc?.uuid === targetActorUuid) {
                                targetedByResolution = true;
                                break;
                            }
                        }
                    } catch (e) {
                        // Skip if can't resolve
                    }
                }
                
                const targetedThisActor = targetedByUuid || targetedByResolution;
                
                if (targetedThisActor && timeSinceAttack < recentWindow && timeSinceAttack >= 0) {
                    // Found a recent attack - prefer the most recent one
                    if (timeSinceAttack < bestMatchTime) {
                        bestMatch = { attackEvent, cacheName, timeSinceAttack };
                        bestMatchTime = timeSinceAttack;
                    }
                }
            }
        }
        
        // If we found a match, extract attacker and item info
        if (bestMatch) {
            const { attackEvent, cacheName } = bestMatch;
            try {
                const attackerActor = game.actors.get(attackEvent.attackerActorId);
                if (attackerActor) {
                    attackerName = attackerActor.name;
                }
                
                if (attackEvent.itemUuid) {
                    const item = await fromUuid(attackEvent.itemUuid);
                    if (item) {
                        weaponName = item.name;
                    }
                }
                
                // Estimate damage from HP drop (best effort)
                damageAmount = oldHp - newHp;
                
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Found recent attack', {
                    cacheName: cacheName,
                    attacker: attackerName,
                    weapon: weaponName,
                    target: targetActor.name,
                    timeSinceAttack: bestMatchTime,
                    attackEventKey: attackEvent.key,
                    hitTargets: attackEvent.hitTargets,
                    missTargets: attackEvent.missTargets
                }, true, false);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Error resolving attacker/item', {
                    error: e.message,
                    cacheName: cacheName,
                    attackerActorId: attackEvent.attackerActorId,
                    itemUuid: attackEvent.itemUuid
                }, true, false);
            }
        } else {
            // No match found - log for debugging
            postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: No recent attack found', {
                targetActor: targetActor.name,
                targetUuid: targetActorUuid,
                recentWindow: recentWindow,
                combatStatsCacheSize: CombatStats._attackCache.size,
                playerStatsCacheSize: CPBPlayerStats._attackCache.size
            }, true, false);
        }

        // Create unconscious event entry
        const sceneName = game.scenes?.current?.name || game.scenes?.active?.name || 'Unknown Scene';
        const unconsciousEvent = {
            date: new Date().toISOString(),
            sceneName: sceneName,
            oldHp: oldHp,
            newHp: newHp,
            attackerName: attackerName,
            weaponName: weaponName,
            damageAmount: damageAmount
        };

        // Ensure log array exists (handle legacy data that might not have it)
        const existingLog = Array.isArray(lifetimeUnconscious.log) ? lifetimeUnconscious.log : [];
        
        // Update unconscious stats - ensure we provide the complete object structure
        // Create a new array to avoid mutating the original, then push the new event
        const updatedLog = [...existingLog];
        this._boundedPush(updatedLog, unconsciousEvent, 100); // Keep last 100 unconscious events
        
        // Create complete unconscious object (not partial update)
        const updatedUnconscious = {
            count: (lifetimeUnconscious.count || 0) + 1,
            log: updatedLog
        };
        
        // IMPORTANT: We need to replace the entire unconscious object, not merge into it
        // This ensures the log array is always present
        const updates = {
            lifetime: {
                unconscious: foundry.utils.deepClone(updatedUnconscious)
            }
        };
        
        // Debug: Log what we're about to write
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Update structure', {
            existingCount: lifetimeUnconscious.count || 0,
            newCount: updatedUnconscious.count,
            existingLogLength: existingLog.length,
            newLogLength: updatedLog.length,
            newEvent: unconsciousEvent,
            updatesStructure: updates
        }, true, false);

        // Write updates to actor
        await this.updatePlayerStats(targetActor.id, updates);
        
        // Verify the update was written correctly
        const verifyStats = await this.getPlayerStats(targetActor.id);
        const verifyUnconscious = verifyStats?.lifetime?.unconscious;
        postConsoleAndNotification(MODULE.NAME, 'Player Stats - Unconscious: Verification after update', {
            hasUnconscious: !!verifyUnconscious,
            count: verifyUnconscious?.count,
            hasLog: Array.isArray(verifyUnconscious?.log),
            logLength: verifyUnconscious?.log?.length || 0,
            logFirstEntry: verifyUnconscious?.log?.[0] || null
        }, true, false);

        // Log collected data
        const unconsciousLogMessage = [
            `=== PLAYER STATS - UNCONSCIOUS EVENT (${targetActor.name}) ===`,
            `HP Change: ${oldHp} → ${newHp}`,
            `Scene: ${sceneName}`,
            attackerName ? `Attacker: ${attackerName}` : 'Attacker: Unknown',
            weaponName ? `Weapon: ${weaponName}` : 'Weapon: Unknown',
            damageAmount ? `Damage: ${damageAmount}` : '',
            `--- Lifetime Totals (Before Update) ---`,
            `  Total Unconscious Events: ${lifetimeUnconscious.count || 0} → ${updates.lifetime.unconscious.count} (+1)`,
            `========================================`
        ].filter(Boolean).join('\n');
        postConsoleAndNotification(MODULE.NAME, 'Player Stats | Unconscious Event', unconsciousLogMessage, false, false);
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
            const sessionStats = this._getSessionStats(actorId);
            
            // Get what we tracked in real-time during this combat to avoid double counting
            const combatTracking = sessionStats?.combatTracking || { hitsAdded: 0, critsAdded: 0, fumblesAdded: 0 };
            const hitsAddedThisCombat = combatTracking.hitsAdded || 0;
            const critsAddedThisCombat = combatTracking.critsAdded || 0;
            const fumblesAddedThisCombat = combatTracking.fumblesAdded || 0;
            
            // Combat summary has authoritative values for this combat
            // Reconcile: subtract what we added in real-time, then add combat summary values
            const combatSummaryHits = participant.hits || 0;
            const combatSummaryMisses = participant.misses || 0;
            const combatSummaryCrits = participant.criticals || 0;
            const combatSummaryFumbles = participant.fumbles || 0;
            
            // Reconcile: subtract what we added, add what combat summary says (authoritative)
            const newTotalHits = (lifetimeAttacks.totalHits || 0) - hitsAddedThisCombat + combatSummaryHits;
            const newTotalMisses = (lifetimeAttacks.totalMisses || 0) + combatSummaryMisses; // Misses only tracked from summary
            const newTotalCrits = (lifetimeAttacks.criticals || 0) - critsAddedThisCombat + combatSummaryCrits;
            const newTotalFumbles = (lifetimeAttacks.fumbles || 0) - fumblesAddedThisCombat + combatSummaryFumbles;
            
            const totalAttacks = newTotalHits + newTotalMisses;
            const newHitMissRatio = totalAttacks > 0 ? ((newTotalHits / totalAttacks) * 100) : 0;
            
            const updates = {
                lifetime: {
                    attacks: {
                        totalHits: Math.max(0, newTotalHits), // Ensure non-negative
                        totalMisses: Math.max(0, newTotalMisses),
                        hitMissRatio: newHitMissRatio,
                        criticals: Math.max(0, newTotalCrits),
                        fumbles: Math.max(0, newTotalFumbles)
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
                
                // Reset combat tracking for next combat
                if (sessionStats.combatTracking) {
                    sessionStats.combatTracking = { hitsAdded: 0, critsAdded: 0, fumblesAdded: 0 };
                    this._updateSessionStats(actorId, sessionStats);
                }
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
