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
        const createCombatHookId = HookManager.registerHook({
			name: 'createCombat',
			description: 'Player Stats: Track combat start for player character statistics',
			context: 'stats-player-combat-start',
			priority: 3,
			callback: this._onCombatStart.bind(this)
		});
        const deleteCombatHookId = HookManager.registerHook({
			name: 'deleteCombat',
			description: 'Player Stats: Track combat end for player character statistics',
			context: 'stats-player-combat-end',
			priority: 3,
			callback: this._onCombatEnd.bind(this)
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

        const newStats = foundry.utils.mergeObject(currentStats, updates);
        newStats.lifetime.lastUpdated = new Date().toISOString();
        
        await actor.setFlag(MODULE.ID, 'playerStats', newStats);
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

        const actor = item.actor;
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
            const stats = await this.getPlayerStats(actor.id);
            if (!stats) return;

            const updates = { lifetime: { attacks: {...stats.lifetime.attacks} } };

            if (isCritical) {
                updates.lifetime.attacks.criticals = (stats.lifetime.attacks.criticals || 0) + 1;
            }
            if (isFumble) {
                updates.lifetime.attacks.fumbles = (stats.lifetime.attacks.fumbles || 0) + 1;
            }

            if (Object.keys(updates.lifetime.attacks).length > 0) {
                await this.updatePlayerStats(actor.id, updates);
            }

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error processing attack roll:`, error, false, false);
        }
    }

    // Damage roll handler
    static async _onDamageRoll(item, roll) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        const actor = item.actor;
        if (!actor || !actor.hasPlayerOwner || actor.isToken) return;

        try {
            const rollTotal = roll.total;
            const isHealing = item.system.actionType === 'heal';

            // Get current stats
            const stats = await this.getPlayerStats(actor.id);
            if (!stats) return;

            const updates = { lifetime: {} };
            const sessionStats = this._getSessionStats(actor.id);

            // Get the current combat
            const combat = game.combat;
            if (combat?.active && game.combats.has(combat.id)) {
                let combatStats = await combat.getFlag(MODULE.ID, 'combatStats');
                if (!combatStats) {
                    // Initialize if not exists
                    combatStats = {
                        startTime: Date.now(),
                        rounds: [],
                        hits: [],
                        criticals: [],
                        fumbles: [],
                        healing: [],
                        participants: {}
                    };
                }

                // Ensure participants object exists
                combatStats.participants = combatStats.participants || {};
                
                if (isHealing) {
                    // Record healing in combat stats
                    const healingEvent = {
                        amount: rollTotal,
                        healer: actor.name,
                        healerId: actor.id,
                        timestamp: Date.now(),
                        round: combat.round,
                        turn: combat.turn,
                        targets: Array.from(game.user.targets).map(t => ({
                            id: t.actor?.id,
                            name: t.name
                        }))
                    };
                    
                    combatStats.healing = combatStats.healing || [];
                    this._boundedPush(combatStats.healing, healingEvent);
                    
                    // Initialize participant if needed
                    if (!combatStats.participants[actor.id]) {
                        combatStats.participants[actor.id] = {
                            name: actor.name,
                            healing: { given: 0, received: 0 },
                            damage: { dealt: 0, taken: 0 },
                            hits: []
                        };
                    }
                    combatStats.participants[actor.id].healing.given += rollTotal;
                    
                    // Update healing stats for targets
                    healingEvent.targets.forEach(target => {
                        if (target.id && !combatStats.participants[target.id]) {
                            combatStats.participants[target.id] = {
                                name: target.name,
                                healing: { given: 0, received: 0 },
                                damage: { dealt: 0, taken: 0 },
                                hits: []
                            };
                        }
                        if (target.id) {
                            combatStats.participants[target.id].healing.received += rollTotal;
                        }
                    });
                } else {
                    // Find the matching attack roll
                    let attackInfo = null;
                    for (const [id, attack] of sessionStats.pendingAttacks) {
                        if (Date.now() - attack.timestamp < 10000) {
                            attackInfo = attack;
                            sessionStats.pendingAttacks.delete(id);
                            break;
                        }
                    }

                    // Record hit in combat stats
                    const hitEvent = {
                        amount: rollTotal,
                        attacker: actor.name,
                        attackerId: actor.id,
                        weapon: item.name,
                        attackRoll: attackInfo?.attackRoll,
                        isCritical: attackInfo?.isCritical,
                        targetName: attackInfo?.targetActor?.name || 'Unknown Target',
                        targetId: attackInfo?.targetActor?.id,
                        targetAC: attackInfo?.targetActor?.system?.attributes?.ac?.value,
                        timestamp: Date.now(),
                        round: combat.round,
                        turn: combat.turn
                    };

                    combatStats.hits = combatStats.hits || [];
                    this._boundedPush(combatStats.hits, hitEvent);

                    // Initialize participant if needed
                    if (!combatStats.participants[actor.id]) {
                        combatStats.participants[actor.id] = {
                            name: actor.name,
                            hits: [],
                            damage: { dealt: 0, taken: 0 },
                            healing: { given: 0, received: 0 }
                        };
                    }
                    
                    this._boundedPush(combatStats.participants[actor.id].hits, hitEvent);
                    combatStats.participants[actor.id].damage.dealt += rollTotal;

                    // Update target's stats if it exists
                    if (hitEvent.targetId) {
                        if (!combatStats.participants[hitEvent.targetId]) {
                            combatStats.participants[hitEvent.targetId] = {
                                name: hitEvent.targetName,
                                damage: { dealt: 0, taken: 0 },
                                healing: { given: 0, received: 0 },
                                hits: []
                            };
                        }
                        combatStats.participants[hitEvent.targetId].damage.taken += rollTotal;
                    }
                }

                // Save combat stats
                await combat.setFlag(MODULE.ID, 'combatStats', combatStats);
            }

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

                updates.lifetime.attacks = {...stats.lifetime.attacks};
                
                // Record the hit and update totals
                updates.lifetime.attacks.totalHits = (stats.lifetime.attacks.totalHits || 0) + 1;
                updates.lifetime.attacks.totalDamage = (stats.lifetime.attacks.totalDamage || 0) + rollTotal;

                // Track damage by weapon
                const weaponName = item.name || 'Unknown Weapon';
                updates.lifetime.attacks.damageByWeapon = {...stats.lifetime.attacks.damageByWeapon};
                updates.lifetime.attacks.damageByWeapon[weaponName] = (updates.lifetime.attacks.damageByWeapon[weaponName] || 0) + rollTotal;

                // Track damage by type
                const damageType = item.system.damage?.parts?.[0]?.[1] || 'unspecified';
                updates.lifetime.attacks.damageByType = {...stats.lifetime.attacks.damageByType};
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

                if (!stats.lifetime.attacks.biggest || rollTotal > stats.lifetime.attacks.biggest.amount) {
                    updates.lifetime.attacks.biggest = hitDetails;
                }
                if (!stats.lifetime.attacks.weakest || rollTotal < stats.lifetime.attacks.weakest.amount) {
                    updates.lifetime.attacks.weakest = hitDetails;
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

    static async _onCombatStart(combat, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;

        // Initialize combat-wide statistics
        await combat.setFlag(MODULE.ID, 'combatStats', {
            startTime: Date.now(),
            rounds: [],
            hits: [],
            criticals: [],
            fumbles: [],
            healing: [],
            participants: {}
        });
    }

    static async _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackPlayerStats')) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        const combatStats = await combat.getFlag(MODULE.ID, 'combatStats');
        if (!combatStats) return;

        // Calculate final statistics
        const duration = (Date.now() - combatStats.startTime) / 1000;
        const participants = Object.values(combatStats.participants)
            .filter(p => p.hits?.length > 0 || p.healing?.given > 0);

        // Generate interesting statistics
        const stats = {
            duration,
            rounds: combat.round,
            participants: participants.map(p => ({
                name: p.name,
                damageDealt: p.damage?.dealt || 0,
                damageTaken: p.damage?.taken || 0,
                healingGiven: p.healing?.given || 0,
                healingReceived: p.healing?.received || 0,
                hits: p.hits?.length || 0
            })),
            mostDamage: participants.reduce((max, p) => 
                (p.damage?.dealt > (max?.damage?.dealt || 0)) ? p : max, null),
            mostHealing: participants.reduce((max, p) => 
                (p.healing?.given > (max?.healing?.given || 0)) ? p : max, null),
            biggestHit: combatStats.hits.reduce((max, hit) => 
                (hit.amount > (max?.amount || 0)) ? hit : max, null),
            criticals: combatStats.hits.filter(h => h.isCritical).length
        };

        // Store these stats somewhere if needed
        // Could be added to a combat log journal, sent to chat, etc.
        
        // Clear combat flag to prevent persistence leak
        await combat.unsetFlag(MODULE.ID, 'combatStats');
    }
}

export { CPBPlayerStats, CPB_STATS_DEFAULTS }; 
