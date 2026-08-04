/**
 * Tier 1 & 2 statistics manager for Coffee Pub Blacksmith.
 * - Tracks round-scoped data (ephemeral) and combat-scoped aggregates.
 * - Generates round chat summaries and end-of-combat summaries for the API.
 * - Emits `blacksmith.combatSummaryReady` so lifetime consumers can update.
 */

// Import MODULE variables
import { MODULE } from './const.js';
import { getPortraitImage, isPlayerCharacter, postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { PlanningTimer } from './timer-planning.js';
import { CombatTimer } from './timer-combat.js';
import { HookManager } from './manager-hooks.js';
import { SocketManager } from './manager-sockets.js';
// No message-resolution or midi-qol imports here, and that is the point: after
// the correlation and dedupe state moved to stats-sources.js, this file uses
// none of them. The accumulator no longer knows midi-qol exists. If an import
// from either utility reappears here, event translation has leaked back in.
// (JSDoc below still names resolveAttackMessage / resolveDamageMessage when
// describing the shape of an event it receives -- that is a reference, not a
// dependency.)
import { CombatMvp, MVPDescriptionGenerator } from './stats-mvp.js';
// Static, and a deliberate cycle: stats-sources.js imports this module back.
// The handlers are needed while _registerHooks runs, which initialize() calls
// synchronously, so a lazy import would push an await into the bootstrap path.
// Safe because neither module touches the other during its own evaluation --
// see the note at the top of stats-sources.js before adding a static field
// there that references CombatStats.
import { CombatSources } from './stats-sources.js';
import { assetLookup } from './asset-lookup.js';

class CombatStats {
    static currentStats = null;
    static combatStats = null;
    static _processedCombats = new Set();
    
    // Attack resolution cache for correlating damage to attacks

    // MIDI ordering + dedupe helpers (combat stats lane)
    
    // Core chat lane dedupe (createChatMessage + updateChatMessage reprocessing)

    // Kill attribution helpers (combat stats lane)
    static _killHpCache = new Map(); // key: actor.uuid, value: { hp, ts }
    static _recentKillDamageContext = new Map(); // key: targetActorId, value: Array<{ ts, attackerId, attackerName, targetId, targetName, weaponName, round, turn }>
    static _recentKillRecorded = new Map(); // key: targetActorId, value: timestamp
    static KILL_CONTEXT_TTL_MS = 15_000;
    
    // MVP fairness helper: count "successful offensive activations" once per workflow key per round.
    
    // Persistence: keep combat stats resumable across refresh / long pauses.
    static _persistDebounced = null;
    static _flushHandlersRegistered = false;
    static _flushHandlerRefs = null;
    
    static _serializeForCombatFlag(value) {
        // Combat flags must be JSON-serializable.
        const clone = foundry.utils.deepClone(value);
        
        // Normalize Maps (Foundry won't reliably serialize Maps in flags)
        if (clone?.turnStartTimes && clone.turnStartTimes instanceof Map) {
            clone.turnStartTimes = Object.fromEntries(clone.turnStartTimes.entries());
        }
        if (clone?.turnEndTimes && clone.turnEndTimes instanceof Map) {
            clone.turnEndTimes = Object.fromEntries(clone.turnEndTimes.entries());
        }
        
        return clone;
    }
    
    static _restoreCurrentStatsRuntimeShape(stats) {
        if (!stats || typeof stats !== 'object') return stats;
        
        // Ensure Maps are properly initialized (restore from plain objects if present)
        const start = stats.turnStartTimes;
        const end = stats.turnEndTimes;
        
        if (start && !(start instanceof Map) && typeof start === 'object') {
            stats.turnStartTimes = new Map(Object.entries(start));
        } else if (!(stats.turnStartTimes instanceof Map)) {
            stats.turnStartTimes = new Map();
        }
        
        if (end && !(end instanceof Map) && typeof end === 'object') {
            stats.turnEndTimes = new Map(Object.entries(end));
        } else if (!(stats.turnEndTimes instanceof Map)) {
            stats.turnEndTimes = new Map();
        }
        
        // Ensure turnTimes is an object (not an array)
        if (Array.isArray(stats?.partyStats?.turnTimes)) {
            stats.partyStats.turnTimes = {};
        }
        
        return stats;
    }
    
    static _schedulePersistCombatStats(reason = '') {
        try {
            if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;
            if (!game.combat) return;
            
            if (!this._persistDebounced) {
                this._persistDebounced = foundry.utils.debounce(async () => {
                    try {
                        if (!game.combat) return;
                        const current = this._serializeForCombatFlag(this.currentStats);
                        const combat = this._serializeForCombatFlag(this.combatStats);
                        await game.combat.setFlag(MODULE.ID, 'stats', current);
                        await game.combat.setFlag(MODULE.ID, 'combatStats', combat);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Persist flags failed', { reason, e }, false, false);
                    }
                }, 1000);
            }
            
            this._persistDebounced();
        } catch (_) {
            // Never let persistence break combat tracking
        }
    }
    
    static _persistCombatStatsNow(reason = '') {
        try {
            if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;
            if (!game.combat) return;
            
            const current = this._serializeForCombatFlag(this.currentStats);
            const combat = this._serializeForCombatFlag(this.combatStats);
            
            // Fire-and-forget: best effort during page lifecycle events.
            Promise.resolve()
                .then(() => game.combat.setFlag(MODULE.ID, 'stats', current))
                .then(() => game.combat.setFlag(MODULE.ID, 'combatStats', combat))
                .catch((e) => {
                    postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Persist-now flags failed', { reason, e }, false, false);
                });
        } catch (_) {
            // Never let persistence break combat tracking
        }
    }
    
    static _registerPersistenceFlushHandlers() {
        try {
            if (this._flushHandlersRegistered) return;
            if (typeof window === 'undefined' || !window?.addEventListener) return;
            
            const onVisibilityChange = () => {
                try {
                    if (document?.visibilityState === 'hidden') {
                        this._persistCombatStatsNow('visibilitychange:hidden');
                    }
                } catch (_) {}
            };
            
            const onPageHide = () => this._persistCombatStatsNow('pagehide');
            const onBeforeUnload = () => this._persistCombatStatsNow('beforeunload');
            
            window.addEventListener('visibilitychange', onVisibilityChange, { capture: true });
            window.addEventListener('pagehide', onPageHide, { capture: true });
            window.addEventListener('beforeunload', onBeforeUnload, { capture: true });
            
            this._flushHandlerRefs = { onVisibilityChange, onPageHide, onBeforeUnload };
            this._flushHandlersRegistered = true;
        } catch (_) {
            // no-op
        }
    }

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
                kills: 0,
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
                kills: 0,
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

    static _ensureCombatTotals() {
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        if (!this.combatStats.totals) {
            this.combatStats.totals = foundry.utils.deepClone(this.DEFAULTS.combatStats.totals);
        } else {
            this.combatStats.totals.damage = this.combatStats.totals.damage || { dealt: 0, taken: 0 };
            this.combatStats.totals.healing = this.combatStats.totals.healing || { given: 0, received: 0 };
            this.combatStats.totals.kills = this.combatStats.totals.kills || 0;
            this.combatStats.totals.attacks = this.combatStats.totals.attacks || {
                attempts: 0,
                hits: 0,
                misses: 0,
                crits: 0,
                fumbles: 0
            };
        }
    }

    static _noteKillDamageContext({ targetActor, attackerActor, weaponName = null } = {}) {
        if (!targetActor?.id || !attackerActor?.id) return;

        const now = Date.now();
        const queue = this._recentKillDamageContext.get(targetActor.id) ?? [];
        queue.push({
            ts: now,
            attackerId: attackerActor.id,
            attackerName: attackerActor.name,
            targetId: targetActor.id,
            targetName: targetActor.name,
            weaponName: weaponName || null,
            round: game.combat?.round ?? null,
            turn: game.combat?.turn ?? null
        });

        const bounded = queue.slice(-10).filter(ctx => (now - (ctx.ts || 0)) <= this.KILL_CONTEXT_TTL_MS);
        this._recentKillDamageContext.set(targetActor.id, bounded);
    }

    static _isKillEligibleTarget(actor) {
        // Count kills only for non-player actors (monsters/NPCs/etc.); exclude player characters.
        if (!actor) return false;
        return !(actor.hasPlayerOwner || actor.type === 'character');
    }

    static _creditKill({ attackerId, targetActor, weaponName = null } = {}) {
        if (!attackerId || !targetActor?.id) return;

        const attackerActor = game.actors.get(attackerId);
        if (!attackerActor) return;

        // Only party kills are counted in party totals (PC attackers only).
        const isPartyKill = this._isPlayerCharacter(attackerActor);

        const { current: attackerRound, combat: attackerCombat } = this._ensureParticipantStats(attackerActor, {
            includeCurrent: true,
            includeCombat: true
        });

        attackerRound.kills = Number(attackerRound.kills) || 0;
        attackerCombat.kills = Number(attackerCombat.kills) || 0;
        attackerRound.kills += 1;
        attackerCombat.kills += 1;

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Kill Credited:', {
            attacker: attackerActor.name,
            attackerId,
            target: targetActor.name,
            targetId: targetActor.id,
            weapon: weaponName,
            roundKills: attackerRound.kills,
            combatKills: attackerCombat.kills,
            isPartyKill
        }, true, false);
        
        this._schedulePersistCombatStats('kill');

        if (isPartyKill) {
            this.currentStats.partyStats.kills = Number(this.currentStats.partyStats.kills) || 0;
            this.currentStats.partyStats.kills += 1;

            this._ensureCombatTotals();
            this.combatStats.totals.kills = Number(this.combatStats.totals.kills) || 0;
            this.combatStats.totals.kills += 1;
        }

        // Optionally keep the last-kill context for future narrative use.
        this.combatStats.lastKill = {
            attackerId,
            attackerName: attackerActor.name,
            targetId: targetActor.id,
            targetName: targetActor.name,
            weaponName: weaponName || null,
            round: game.combat?.round ?? null,
            ts: Date.now()
        };
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
            kills: 0,
            successfulOffenseCount: 0,
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
            kills: 0,
            successfulOffenseCount: 0,
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
            ps.kills ??= 0;
            ps.successfulOffenseCount ??= 0;
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

            const cps = this.combatStats.participantStats[actor.id];
            cps.name ??= actor.name;
            cps.kills ??= 0;
            cps.successfulOffenseCount ??= 0;
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
        // Initialize on ALL clients when tracking is enabled.
        // GM performs authoritative processing; non-GM clients act as forwarders (especially for MIDI workflows).
        if (!getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;

        postConsoleAndNotification(MODULE.NAME, "Initializing Combat Stats | trackCombatStats:", {
            trackCombatStats: getSettingSafely(MODULE.ID, 'trackCombatStats', false),
            isGM: !!game.user?.isGM
        }, true, false);

        // Check for existing stats in combat flags (supports resuming mid-combat / mid-round)
        const existingCurrentStats = game.combat?.getFlag(MODULE.ID, 'stats');
        const existingCombatStats = game.combat?.getFlag(MODULE.ID, 'combatStats');
        
        // Initialize stats objects - use existing stats if available, otherwise use defaults
        this.currentStats = existingCurrentStats || foundry.utils.deepClone(this.DEFAULTS.roundStats);
        this.combatStats = existingCombatStats || foundry.utils.deepClone(this.DEFAULTS.combatStats);
        
        // Restore runtime shapes (Maps, etc.)
        this._restoreCurrentStatsRuntimeShape(this.currentStats);
        this._ensureCombatTotals();
        
        // Ensure we flush combat stats on tab close / refresh (best effort)
        this._registerPersistenceFlushHandlers();

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats:', {
            currentStats: this.currentStats,
            combatStats: this.combatStats,
            notableMoments: this.currentStats.notableMoments,
            existingCurrentStats,
            existingCombatStats
        }, true, false);

        // Handlebars helpers are registered in `init` by utility-handlebars.js,
        // deliberately not from here: this method returns early when
        // trackCombatStats is off, and those helpers are global.

        // Register hooks
        this._registerHooks();
    }

    static async _onUpdateCombat(combat, changed, options, userId) {
        // Only process combat updates if this is the GM
        if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;

        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;

        // Detect combat ending via update (active flag turned off or started flag turned off)
        const combatEnding = (changed.active === false && combat.previous?.active !== false) ||
                            (changed.started === false && combat.previous?.started !== false);
        
        if (combatEnding) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Combat ending detected via updateCombat', {
                changed,
                combatId: combat.id,
                active: combat.active,
                started: combat.started
            }, true, false);
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
            // The per-round offense dedupe cache belongs to the adapter, which
            // owns event correlation; the round boundary is ours, so we tell it.
            CombatSources.resetRound();
            // Ensure Maps are properly initialized
            this.currentStats.turnStartTimes = new Map();
            this.currentStats.turnEndTimes = new Map();
            this.currentStats.roundStartTime = Date.now();
            this.currentStats.roundStartTimestamp = Date.now();  // Set the wall-clock start time
            this.currentStats.planningStartTime = Date.now();

            // Save the stats to combat flags. CombatStats owns this key outright — the wholesale
            // write is safe because no other subsystem stores data here. Round timing lives on the
            // separate `roundTimer` flag owned by timer-round.js; keep it that way.
            game.combat.setFlag(MODULE.ID, 'stats', this.currentStats);
            this._schedulePersistCombatStats('roundStart');

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
     * Reduce `combatStats` to the aggregate shape the end-of-combat card is built from:
     * per-participant summaries, party-only totals, top moments, and MVP rankings.
     *
     * Pure over `combatStats` and free of combat metadata, so it can run mid-combat as
     * well as at the end. That is the whole point of it existing separately: a readout
     * that wants "damage this fight" needs the same numbers the summary card reports,
     * and a second reducer would be a second definition of who counts as the party, how
     * misses are inferred, and how MVP is scored. Everything here is derived; nothing is
     * written back.
     *
     * Takes its source rather than reading `combatStats` directly, because the same
     * numbers live in two places: the GM's in-memory accumulator, and the combat flag
     * the GM mirrors it to. A player client has only the second.
     *
     * @param {Object|null} [source] Accumulator to reduce. Defaults to the in-memory one.
     * @returns {Object|null} `{participants, totals, notableMoments}`, or null if no
     *   combat is being tracked.
     */
    static _buildCombatAggregate(source = this.combatStats) {
        if (!source) return null;

        // Extract participant summaries (aggregates only, no arrays)
        // Note: participants include PCs + NPCs, but "totals" for the summary card are PARTY-ONLY.
        const participantSummaries = Object.entries(source.participantStats || {}).map(([actorId, stats]) => {
            const actorDoc = game.actors.get(actorId) ?? null;
            const isPlayer = actorDoc ? this._isPlayerCharacter(actorDoc) : false;
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
                isPlayer,
                kills: Number(stats.kills) || 0,
                successfulOffenseCount: Number.isFinite(Number(stats.successfulOffenseCount))
                    ? (Number(stats.successfulOffenseCount) || 0)
                    : hitCount,
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
        const topHits = (source.topHits || []).map(hit => ({
            attacker: hit.attacker || hit.attackerName || 'Unknown',
            attackerId: hit.attackerId,
            target: hit.targetName || 'Unknown',
            targetId: hit.targetId,
            amount: hit.amount || 0,
            weapon: hit.weapon || 'Unknown',
            isCritical: hit.isCritical || false,
            timestamp: hit.timestamp
        }));

        const topHeals = (source.topHeals || []).map(heal => ({
            healer: heal.healer || heal.healerName || 'Unknown',
            healerId: heal.healerId,
            target: heal.targetName || 'Unknown',
            targetId: heal.targetId,
            amount: heal.amount || 0,
            timestamp: heal.timestamp
        }));

        // Calculate PARTY totals (player characters only)
        const partyParticipants = participantSummaries.filter(p => p.isPlayer);
        const totalHits = partyParticipants.reduce((sum, p) => sum + (p.hits || 0), 0);
        const totalMisses = partyParticipants.reduce((sum, p) => sum + (p.misses || 0), 0);
        const totalDamage = partyParticipants.reduce((sum, p) => sum + (p.damageDealt || 0), 0);
        const totalDamageTaken = partyParticipants.reduce((sum, p) => sum + (p.damageTaken || 0), 0);
        const totalHealing = partyParticipants.reduce((sum, p) => sum + (p.healingGiven || 0), 0);
        const totalCriticals = partyParticipants.reduce((sum, p) => sum + (p.criticals || 0), 0);
        const totalFumbles = partyParticipants.reduce((sum, p) => sum + (p.fumbles || 0), 0);
        const totalKills = partyParticipants.reduce((sum, p) => sum + (p.kills || 0), 0);

        // Compute MVP rankings (party-only; NPCs excluded)
        const mvpTuning = CombatMvp._getMvpTuningSettings();
        const mvpMaxima = CombatMvp._computeMvpMaxima(partyParticipants.map(p => ({
            offenseCount: Number.isFinite(Number(p.successfulOffenseCount))
                ? (Number(p.successfulOffenseCount) || 0)
                : (p.hits || 0),
            hits: p.hits || 0,
            misses: p.misses || 0,
            attempts: p.totalAttacks || 0,
            crits: p.criticals || 0,
            fumbles: p.fumbles || 0,
            damage: p.damageDealt || 0,
            healing: p.healingGiven || 0,
            kills: p.kills || 0
        })));

        const mvpRankings = partyParticipants.map(p => {
            const score = CombatMvp._computeMvpScore({
                offenseCount: Number.isFinite(Number(p.successfulOffenseCount))
                    ? (Number(p.successfulOffenseCount) || 0)
                    : (p.hits || 0),
                hits: p.hits || 0,
                misses: p.misses || 0,
                attempts: p.totalAttacks || 0,
                crits: p.criticals || 0,
                fumbles: p.fumbles || 0,
                damage: p.damageDealt || 0,
                healing: p.healingGiven || 0,
                kills: p.kills || 0
            }, mvpMaxima, mvpTuning);

            const totalAttacks = p.totalAttacks || (p.hits || 0) + (p.misses || 0);
            const misses = (typeof p.misses === 'number') ? p.misses : Math.max(0, totalAttacks - (p.hits || 0));

            return {
                actorId: p.actorId,
                name: p.name,
                score,
                successfulOffenseCount: Number.isFinite(Number(p.successfulOffenseCount))
                    ? (Number(p.successfulOffenseCount) || 0)
                    : (p.hits || 0),
                hits: p.hits || 0,
                misses,
                totalAttacks,
                crits: p.criticals || 0,
                fumbles: p.fumbles || 0,
                kills: p.kills || 0,
                damageDealt: p.damageDealt || 0,
                damageTaken: p.damageTaken || 0,
                healingGiven: p.healingGiven || 0,
                healingReceived: p.healingReceived || 0
            };
        }).sort((a, b) => b.score - a.score);

        const mvp = mvpRankings.length ? { ...mvpRankings[0] } : null;

        return {
            // Aggregated totals
            totals: {
                hits: totalHits,
                misses: totalMisses,
                totalAttacks: totalHits + totalMisses,
                kills: totalKills,
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
                longestTurn: source.longestTurn || null,
                // "No turn timed yet" is `{duration: Infinity}` in memory, but this
                // object also arrives via a combat flag, and JSON has no Infinity — it
                // serializes to null. Testing `!== Infinity` therefore passed the
                // sentinel straight through on the flag path and returned
                // `{duration: null}` where memory returned null. Ask whether the number
                // is usable instead of comparing against one spelling of unusable.
                fastestTurn: Number.isFinite(source.fastestTurn?.duration) ? source.fastestTurn : null,
                mvp: mvp || null,
                mvpRankings
            }
        };
    }

    /**
     * Generate combat summary from combatStats
     * Creates aggregated summary with top N moments and MVP rankings (no full event arrays)
     * @param {Combat} combat - The combat object
     * @returns {Object} Combat summary with metadata, aggregates, and top moments
     */
    static _generateCombatSummary(combat) {
        const combatDuration = Date.now() - this.combatStats.startTime;
        // Try multiple ways to get the scene
        const sceneId = combat.sceneId || combat.scene || (canvas?.scene?.id);
        const scene = sceneId ? game.scenes.get(sceneId) : null;
        const sceneName = scene?.name || canvas?.scene?.name || 'Unknown Scene';

        // The aggregate is shared with the live getter, so a mid-combat readout and the
        // summary card cannot report different numbers for the same measure.
        const aggregate = this._buildCombatAggregate();
        this.combatStats.mvpRankings = aggregate.notableMoments.mvpRankings;

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

            totals: aggregate.totals,
            participants: aggregate.participants,
            notableMoments: aggregate.notableMoments,

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
     * Store combat summary in world flags (keeps all history for verification)
     * @param {Object} summary - Combat summary to store
     */
    static async _storeCombatSummary(summary) {
        try {
            // Get current history or initialize empty array
            const currentHistory = game.settings.get(MODULE.ID, 'combatHistory') || [];
            
            // Add new summary to front of array
            const updatedHistory = [summary, ...currentHistory];
            
            // Store all history - no pruning to ensure lifetime stats remain verifiable
            await game.settings.set(MODULE.ID, 'combatHistory', updatedHistory);
            
            postConsoleAndNotification(MODULE.NAME, "Combat Summary | Stored to history", {
                historySize: updatedHistory.length,
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
     * @param {number} limit - Maximum number of summaries to return (optional, for paging/display)
     * @returns {Array} Array of combat summaries
     */
    static getCombatHistory(limit = null) {
        const history = game.settings.get(MODULE.ID, 'combatHistory') || [];
        if (limit !== null && limit > 0) {
            return history.slice(0, limit);
        }
        return history;
    }

    /**
     * Clear all combat history
     * @returns {Promise<void>}
     */
    static async clearCombatHistory() {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Combat Stats: Only GMs can clear combat history", "", false, true);
            return;
        }
        await game.settings.set(MODULE.ID, 'combatHistory', []);
        postConsoleAndNotification(MODULE.NAME, "Combat History | Cleared all combat history", {}, false, false);
    }

    /**
     * Remove a specific combat from history by combatId
     * @param {string} combatId - The combat ID to remove
     * @returns {Promise<Object|null>} The removed combat summary or null if not found
     */
    static async removeCombatFromHistory(combatId) {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Combat Stats: Only GMs can remove combat history", "", false, true);
            return null;
        }
        if (!combatId) return null;

        const history = game.settings.get(MODULE.ID, 'combatHistory') || [];
        const index = history.findIndex(summary => summary.combatId === combatId);
        
        if (index === -1) {
            postConsoleAndNotification(MODULE.NAME, "Combat History | Combat not found", { combatId }, true, false);
            return null;
        }

        const removed = history[index];
        const updatedHistory = history.filter((_, i) => i !== index);
        await game.settings.set(MODULE.ID, 'combatHistory', updatedHistory);
        
        postConsoleAndNotification(MODULE.NAME, "Combat History | Removed combat from history", {
            combatId,
            remainingCount: updatedHistory.length
        }, false, false);

        return removed;
    }

    /**
     * Handle Foundry's `updateCombat` event when combat ends.
     * Generates, logs, and stores the combat summary, then emits an API hook.
     * @param {Combat} combat - The combat instance that ended.
     */
    static async _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - _onCombatEnd skipped', {
                isGM: game.user.isGM,
                trackCombatStats: game.settings.get(MODULE.ID, 'trackCombatStats')
            }, true, false);
            return;
        }
        
        // Cards are loaded lazily rather than imported at the top of the file.
        // `stats-cards.js` imports this module, so a static import here would
        // close a cycle in the bootstrap path — see the note in that file.
        const { CombatCards } = await import('./stats-cards.js');

        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !combat.id) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - _onCombatEnd skipped: no combat', {}, true, false);
            return;
        }

        if (!this._processedCombats) {
            this._processedCombats = new Set();
        }
        if (this._processedCombats.has(combat.id)) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - _onCombatEnd skipped: already processed', { combatId: combat.id }, true, false);
            return;
        }
        this._processedCombats.add(combat.id);
        
        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - _onCombatEnd called', {
            combatId: combat.id,
            round: combat.round,
            hasCombatStats: !!this.combatStats,
            hasCurrentStats: !!this.currentStats
        }, true, false);
        
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

        // Check if we're ending combat mid-round - if so, process the partial round first.
        // IMPORTANT: This must include "non-lane" stats like kills/crits/fumbles so we don't drop partial rounds.
        const participantStatsValues = Object.values(this.currentStats?.participantStats || {});
        const hasCurrentRoundData = this.currentStats && (
            (this.currentStats.hits && this.currentStats.hits.length > 0) ||
            (this.currentStats.misses && this.currentStats.misses.length > 0) ||
            (this.currentStats.partyStats && (
                this.currentStats.partyStats.hits > 0 ||
                this.currentStats.partyStats.misses > 0 ||
                this.currentStats.partyStats.damageDealt > 0 ||
                this.currentStats.partyStats.damageTaken > 0 ||
                this.currentStats.partyStats.healingDone > 0 ||
                (Number(this.currentStats.partyStats.kills) || 0) > 0
            )) ||
            participantStatsValues.some(ps =>
                (Number(ps?.kills) || 0) > 0 ||
                (Number(ps?.combat?.attacks?.crits) || 0) > 0 ||
                (Number(ps?.combat?.attacks?.fumbles) || 0) > 0
            )
        );

        if (hasCurrentRoundData && combat.round > 0) {
            // Process the partial round like a normal round end
            postConsoleAndNotification(MODULE.NAME, 'Combat End - Processing partial round data', {
                round: combat.round,
                hits: this.currentStats.hits?.length || 0,
                partyStats: this.currentStats.partyStats
            }, true, false);
            
            // Process the partial round (this will add it to combatStats.rounds)
            // Pass true to skip the started check since combat is ending
            // Pass the combat object so it can be used even if game.combat is null
            await this._onRoundEnd(combat.round, true, combat);
        }

        // Generate combat summary before resetting stats
        let combatSummary;
        try {
            combatSummary = this._generateCombatSummary(combat);
            // Report combat summary to console (debug flag enabled)
            postConsoleAndNotification(MODULE.NAME, "COMBAT SUMMARY: Object ", combatSummary, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error generating combat summary", error, false, false);
            return;
        }

        // Fire hook to expose combat summary (for stats-player.js and other consumers)
        Hooks.callAll('blacksmith.combatSummaryReady', combatSummary, combat);

        // Store the combat summary in the 'combatHistory' world setting. Deliberately unbounded —
        // every combat is kept so lifetime stats stay verifiable. See _storeCombatSummary().
        // Note: Fire-and-forget async operation, don't await
        this._storeCombatSummary(combatSummary).catch(error => {
            postConsoleAndNotification(MODULE.NAME, "Error storing combat summary", error, false, false);
        });

        // Prepare template data with damage ratios for breakdown card
        let templateData;
        try {
            templateData = await CombatCards._prepareCombatTemplateData(combatSummary);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error preparing combat template data", error, false, false);
            return;
        }

        // Send combat cards as separate chat messages (similar to round cards)
        try {
            await CombatCards._sendCombatCards(templateData);
            postConsoleAndNotification(MODULE.NAME, "Combat Stats - Combat cards sent successfully", {}, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error sending combat cards", error, false, false);
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

    /**
     * Where every client reads the running combat's accumulator: the combat flag, and
     * only the combat flag -- including the GM's own read.
     *
     * Tracking is GM-gated so that there is one writer and no conflicting updates. But
     * the GM already mirrors the accumulator to a combat flag on a debounce
     * (`_schedulePersistCombatStats`), and a combat document syncs to every client, so
     * the numbers are on every machine already. That mirror exists for reload resilience
     * -- a GM who refreshes mid-combat restores from it -- and doubles as the broadcast
     * channel for free. No socket is involved and none is wanted: a flag write already
     * fires `updateCombat` everywhere, which is what makes a readout follow along
     * without subscribing to anything.
     *
     * **The GM deliberately does not read memory here, though memory is right there and
     * fresher.** Two read paths would mean the GM's screen works when the players'
     * does not, so a broken mirror would show the whole table placeholders while the
     * person able to fix it saw perfect numbers and no error. Reading the same byte the
     * players read makes that failure mode impossible to have without seeing it. The
     * price is that the GM's figures lag by up to the debounce interval, which for a
     * readout is nothing, and the first moments of a combat show placeholders for
     * everyone until the first mirror lands -- which is the honest state, since nothing
     * has been broadcast yet.
     *
     * `_generateCombatSummary` is the exception and still reduces memory directly: the
     * stored summary has to be exact rather than current-to-within-a-second, it runs
     * only on the GM, and it is the write that everything else is derived from.
     *
     * @returns {Object|null} The mirrored accumulator, or null when nothing is tracked.
     */
    static getRunningCombatSource() {
        try {
            return game.combat?.getFlag(MODULE.ID, 'combatStats') ?? null;
        } catch (_) {
            return null;
        }
    }

    /**
     * The combat in progress, so far.
     *
     * Note the tier this sits in, because the names around it are easy to misread:
     * `getCurrentStats()` is the **round** accumulator despite reading as "now", and
     * `getCombatSummary()` is the last **finished** combat's stored summary. This is the
     * running total for the fight that is happening, which had no accessor at all --
     * `combatStats` was internal, so "damage this fight" was unanswerable from outside
     * while the fight was on.
     *
     * The shape matches the end-of-combat summary field for field where they overlap, so
     * a consumer reads `totals.damageDealt` from either and means the same thing. As
     * there, `totals` is party-only by policy while `participants` includes NPCs.
     *
     * Derived on call and not cached: it changes on essentially every combat event, so a
     * cache would need invalidating more often than it would be read. Callers that render
     * per tick should read it on their own update, not in a loop.
     *
     * Read by every client the same way, the GM included -- see
     * `getRunningCombatSource` for why the GM does not get a shortcut to memory. The
     * value trails the true state by up to the persistence debounce, and is null for
     * the first moments of a combat before the first mirror lands.
     *
     * @returns {Object|null} `{combatId, round, duration, durationSeconds, totals,
     *   participants, notableMoments}`, or null when no combat is being tracked.
     */
    static getRunningCombatStats() {
        const source = this.getRunningCombatSource();
        if (!source) return null;
        const aggregate = this._buildCombatAggregate(source);
        if (!aggregate) return null;

        const duration = Date.now() - (source.startTime || Date.now());
        return {
            combatId: game.combat?.id || null,
            round: game.combat?.round || 0,
            duration,
            durationSeconds: Math.round(duration / 1000),
            // Party damage per completed round, oldest first, for a consumer drawing a trend.
            // Normalised HERE rather than at the consumer because the stored entries carry both
            // `damageDealt` and a `damage` alias kept for template compatibility, and a reader
            // picking the wrong one gets zeros with no error. The end-of-combat summary reshapes
            // the same array into `{round, summary}`; this is the running equivalent.
            roundDamage: (Array.isArray(source.rounds) ? source.rounds : [])
                .map((round) => Number(round?.damageDealt ?? round?.damage) || 0),
            ...aggregate
        };
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

    // -------------------------------------------------------------------------
    // GM-side processors (shared by hooks + sockets)
    // -------------------------------------------------------------------------

    /**
     * Process a resolved attack event from chat message resolution.
     * This is the new source of truth for attack hit/miss determination.
     * @param {AttackResolvedEvent} attackEvent - Normalized attack event from resolveAttackMessage()
     */
    static async _processResolvedAttack(attackEvent) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // Get attacker actor
        const attackerActor = game.actors.get(attackEvent.attackerActorId);
        if (!attackerActor) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Attack Resolved: Attacker not found', {
                attackerActorId: attackEvent.attackerActorId
            }, true, false);
            return;
        }

        const { current: attackerStats, combat: attackerCombatStats } = this._ensureParticipantStats(attackerActor, {
            includeCurrent: true,
            includeCombat: true
        });

        if (!this.currentStats.hits) this.currentStats.hits = [];
        if (!this.currentStats.misses) this.currentStats.misses = [];
        this._ensureCombatTotals();
        const combatTotals = this.combatStats.totals;

        // Track attempt (one per attack, not per target)
        attackerStats.combat.attacks.attempts++;
        attackerCombatStats.combat.attacks.attempts++;
        combatTotals.attacks.attempts++;
        
        // Core-only: increment crit/fumble once per attack (MIDI increments in RollComplete)
        const isMidiAttack = typeof attackEvent?.key === "string" && attackEvent.key.startsWith("midi:");
        if (!isMidiAttack) {
            if (attackEvent.isCritical) {
                attackerStats.combat.attacks.crits++;
                attackerCombatStats.combat.attacks.crits++;
                combatTotals.attacks.crits++;
            }
            if (attackEvent.isFumble) {
                attackerStats.combat.attacks.fumbles++;
                attackerCombatStats.combat.attacks.fumbles++;
                combatTotals.attacks.fumbles++;
            }
        }

        // Process each target outcome
        let totalHits = 0;
        let totalMisses = 0;
        let totalUnknowns = 0;

        // Get item name once for all targets
        let itemName = 'Unknown';
        if (attackEvent.itemUuid) {
            try {
                const item = await fromUuid(attackEvent.itemUuid);
                itemName = item?.name ?? 'Unknown';
            } catch (e) {
                // Fallback - try to get from game.items if it's a world item
                const itemId = attackEvent.itemUuid.split('.').pop();
                const worldItem = game.items.get(itemId);
                if (worldItem) itemName = worldItem.name;
            }
        }

        // Process all targets (batching async operations for efficiency)
        const targetInfoPromises = attackEvent.targets.map(async (target) => {
            // Try to get target actor name (optional - for hitInfo)
            let targetActorName = 'Unknown Target';
            if (target.uuid) {
                try {
                    const targetDoc = await fromUuid(target.uuid);
                    const targetActorDoc = targetDoc?.actor ?? targetDoc;
                    if (targetActorDoc?.name) {
                        targetActorName = targetActorDoc.name;
                    } else if (targetDoc?.name) {
                        targetActorName = targetDoc.name;
                    }
                } catch (e) {
                    // Skip if can't resolve - not critical
                }
            }

            return {
                target,
                targetActorName
            };
        });

        const targetInfos = await Promise.all(targetInfoPromises);

        for (const { target, targetActorName } of targetInfos) {
            const hitInfo = {
                attackRoll: attackEvent.attackTotal,
                isCritical: !!attackEvent.isCritical,
                isFumble: !!attackEvent.isFumble,
                isHit: target.hit === true,
                timestamp: attackEvent.ts,
                actorId: attackerActor.id,
                actorName: attackerActor.name,
                itemName: itemName,
                targetName: targetActorName,
                targetAC: target.ac
            };

            if (target.hit === true) {
                // Hit
                this._boundedPush(this.currentStats.hits, hitInfo);
                if (Array.isArray(attackerStats.hits)) this._boundedPush(attackerStats.hits, hitInfo);

                attackerStats.combat.attacks.hits++;
                attackerCombatStats.combat.attacks.hits++;
                combatTotals.attacks.hits++;
                totalHits++;
            } else if (target.hit === false) {
                // Miss
                this._boundedPush(this.currentStats.misses, hitInfo);
                if (Array.isArray(attackerStats.misses)) this._boundedPush(attackerStats.misses, hitInfo);

                attackerStats.combat.attacks.misses++;
                attackerCombatStats.combat.attacks.misses++;
                combatTotals.attacks.misses++;
                totalMisses++;
            } else {
                // Unknown (AC not available)
                totalUnknowns++;
            }
        }

        // Update party stats if player character
        if (this._isPlayerCharacter(attackerActor)) {
            this.currentStats.partyStats.hits += totalHits;
            this.currentStats.partyStats.misses += totalMisses;
        }
        
        // Persist after applying attack results (resumable mid-round)
        this._schedulePersistCombatStats('resolvedAttack');
    }

    /**
     * Process a resolved damage event with classification (onHit vs other).
     * This replaces the assumption that "damage roll = hit".
     * @param {DamageResolvedEvent} damageEvent - Normalized damage event from resolveDamageMessage()
     */
    static async _processResolvedDamage(damageEvent) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // Get item from the cached attack event or resolve from damage event's key parts
        let item = null;
        
        // Try to get item from cached attack event first (most reliable)
        const cacheEntry = CombatSources.getCachedAttack(damageEvent.key);
        if (cacheEntry?.attackEvent?.itemUuid) {
            try {
                item = await fromUuid(cacheEntry.attackEvent.itemUuid);
            } catch (e) {
                // Fall through to try damage event's itemUuid
            }
        }
        
        // Fallback: try to get item from damage event's itemUuid
        if (!item && damageEvent.itemUuid) {
            try {
                item = await fromUuid(damageEvent.itemUuid);
            } catch (e) {
                // Skip if can't resolve
            }
        }
        
        if (!item) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Resolved: Item not found', {
                key: damageEvent.key,
                itemUuid: damageEvent.itemUuid || cacheEntry?.attackEvent?.itemUuid
            }, true, false);
            return;
        }

        const actor = item.parent;
        if (!actor) return;

        // Decide healing and moment eligibility.
        // Policy:
        // - Totals include damage buckets: onHit, other, unlinked
        // - Damage moments (topHits / biggest hit) are onHit-only
        // - Healing is counted regardless of onHit and can have healing moments
        const bucket = (damageEvent.bucket ?? null);
        const isHealingByBucket = bucket === "heal";
        const trackDamageMoments = bucket === "onHit";
        
        // Keep a conservative healing fallback for legacy items/messages.
        const itemNameLower = (item.name || "").toLowerCase();
        const actionType = (item.system?.actionType ?? "").toString().toLowerCase();
        const hasHealingActivity = item.system?.activities && Object.values(item.system.activities).some(activity => {
            const activityType = (activity.type || "").toLowerCase();
            return activityType === "heal" || activity.healing || activity.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
        });
        const hasHealingDamage = item.system?.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
        const nameIndicatesHealing = itemNameLower.includes("heal") || itemNameLower.includes("cure") || itemNameLower.includes("restore");
        const isHealingFallback = actionType === "heal" || actionType === "healing" || hasHealingActivity || hasHealingDamage || nameIndicatesHealing;
        
        const isHealing = isHealingByBucket || isHealingFallback;

        // Choose which target UUIDs this single damage/heal message should apply to.
        const msgTargets = Array.isArray(damageEvent.targetUuids) ? damageEvent.targetUuids.filter(Boolean) : [];
        const hitTargets = Array.isArray(cacheEntry?.attackEvent?.hitTargets) ? cacheEntry.attackEvent.hitTargets.filter(Boolean) : [];

        let targetUuidsToApply = [];
        if (isHealing) {
            // Healing never requires attack correlation.
            targetUuidsToApply = msgTargets;
        } else if (trackDamageMoments) {
            // On-hit damage: prefer message targets; intersect with hitTargets if possible.
            if (msgTargets.length && hitTargets.length) {
                targetUuidsToApply = msgTargets.filter(u => hitTargets.includes(u));
            } else if (msgTargets.length) {
                targetUuidsToApply = msgTargets;
            } else {
                targetUuidsToApply = hitTargets;
            }
        } else {
            // Other/unlinked damage: totals only; apply only to message targets if provided.
            targetUuidsToApply = msgTargets;
        }

        // Resolve target actors/tokens from UUIDs
        const targetActorIds = [];
        const targetTokenUuids = [];
        for (const targetUuid of targetUuidsToApply) {
            try {
                const targetDoc = await fromUuid(targetUuid);
                const targetActorDoc = targetDoc?.actor ?? targetDoc;
                if (targetActorDoc?.id) targetActorIds.push(targetActorDoc.id);
                if (targetDoc?.documentName === "Token" && targetDoc.uuid) targetTokenUuids.push(targetDoc.uuid);
            } catch (_) {}
        }

        // Crit only matters for onHit moments; for totals-only buckets, keep false.
        const isCritical = trackDamageMoments ? !!cacheEntry?.attackEvent?.isCritical : false;

        await this._processDamageOrHealing({
            item,
            amount: damageEvent.damageTotal,
            isHealing,
            isCritical,
            targetActorIds,
            targetTokenUuids,
            timestamp: damageEvent.ts,
            trackDamageMoments
        });
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

        // Hand the crit forward for the damage event that follows this attack.
        // The adapter owns that correlation; we only know the answer.
        CombatSources.noteAttackCritical(crit);

        if (this._isPlayerCharacter(actor)) {
            if (isHit) this.currentStats.partyStats.hits++;
            else this.currentStats.partyStats.misses++;
        }
        
        this._schedulePersistCombatStats('attackRoll');
    }

    static async _processDamageOrHealing({
        item,
        amount,
        isHealing = false,
        isCritical = false,
        targetActorIds = [],
        targetTokenUuids = [],
        timestamp = null,
        trackDamageMoments = true
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

            this._schedulePersistCombatStats('healing');
            return;
        }

        // Damage
        attackerStats.damage.dealt += amount;
        attackerCombatStats.damage.dealt += amount;
        combatTotals.damage.dealt += amount;

        if (trackDamageMoments) {
            this.combatStats.topHits ??= [];
        }

        // Store damage context for kill attribution - try resolved targets first, then fallback to UUIDs
        if (resolvedTargetActors.length) {
            for (const targetActor of resolvedTargetActors) {
                // Note damage context for kill attribution (HP->0) within a short TTL window.
                this._noteKillDamageContext({
                    targetActor,
                    attackerActor: actor,
                    weaponName: item?.name || null
                });

                if (trackDamageMoments) {
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
                }

                const { current: tCur, combat: tCom } = this._ensureParticipantStats(targetActor, {
                    includeCurrent: true,
                    includeCombat: true
                });

                tCur.damage ??= { dealt: 0, taken: 0 };
                tCom.damage ??= { dealt: 0, taken: 0 };

                tCur.damage.taken += amount;
                tCom.damage.taken += amount;
                combatTotals.damage.taken += amount;

                if (trackDamageMoments) {
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
        } else if (!isHealing && (targetActorIds.length || targetTokenUuids.length)) {
            // Fallback: Store damage context even if target resolution failed, using UUIDs
            // This ensures kill attribution works for spells/effects where target resolution might fail
            for (const targetId of targetActorIds) {
                const targetActor = game.actors.get(targetId);
                if (targetActor) {
                    this._noteKillDamageContext({
                        targetActor,
                        attackerActor: actor,
                        weaponName: item?.name || null
                    });
                }
            }
            // Also try resolving from token UUIDs if actor IDs didn't work
            if (!targetActorIds.length && targetTokenUuids.length) {
                for (const uuid of targetTokenUuids) {
                    try {
                        const doc = fromUuidSync?.(uuid);
                        const tokenDoc = doc?.documentName === "Token" ? doc : doc?.document ?? doc;
                        const targetActor = tokenDoc?.actor ?? doc?.actor;
                        if (targetActor) {
                            this._noteKillDamageContext({
                                targetActor,
                                attackerActor: actor,
                                weaponName: item?.name || null
                            });
                        }
                    } catch (_) {
                        // Ignore resolution errors
                    }
                }
            }
        }

        if (this._isPlayerCharacter(actor)) {
            this.currentStats.partyStats.damageDealt += amount;
        }
        
        this._schedulePersistCombatStats('damage');
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

        // Track HP changes for kill attribution (combat stats lane)
        const preUpdateActorHookId = HookManager.registerHook({
            name: 'preUpdateActor',
            description: 'Combat Stats: Cache pre-update HP for kill attribution',
            context: 'stats-combat-kills',
            priority: 3,
            callback: (actor) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                try {
                    if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;
                    if (!game.combat?.started) return;
                    const hp = actor?.system?.attributes?.hp?.value;
                    if (typeof hp !== 'number') return;
                    this._killHpCache.set(actor.uuid, { hp, ts: Date.now() });
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, 'Combat Stats | preUpdateActor kill cache error', e, false, false);
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        const updateActorHookId = HookManager.registerHook({
            name: 'updateActor',
            description: 'Combat Stats: Attribute kills when HP crosses to 0',
            context: 'stats-combat-kills',
            priority: 3,
            callback: (actor) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                try {
                    if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;
                    if (!game.combat?.started) return;

                    const pre = this._killHpCache.get(actor.uuid);
                    this._killHpCache.delete(actor.uuid);
                    if (!pre || typeof pre.hp !== 'number') return;

                    const newHp = actor?.system?.attributes?.hp?.value;
                    if (typeof newHp !== 'number') return;

                    // Only count kills for non-player targets.
                    if (!this._isKillEligibleTarget(actor)) return;

                    // Detect HP crossing to 0 (or below)
                    if (pre.hp <= 0 || newHp > 0) return;

                    // Dedupe rapid successive updates for the same target
                    const now = Date.now();
                    const last = this._recentKillRecorded.get(actor.id) || 0;
                    if ((now - last) < 1500) return;
                    this._recentKillRecorded.set(actor.id, now);

                    const queue = this._recentKillDamageContext.get(actor.id) ?? [];
                    const valid = queue.filter(ctx => (now - (ctx.ts || 0)) <= this.KILL_CONTEXT_TTL_MS);
                    if (!valid.length) return;

                    // Use most recent damage context as the kill credit.
                    const ctx = valid[valid.length - 1];
                    this._creditKill({
                        attackerId: ctx.attackerId,
                        targetActor: actor,
                        weaponName: ctx.weaponName || null
                    });
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, 'Combat Stats | updateActor kill attribution error', e, false, false);
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
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
			description: 'Combat Stats: Track crits/fumbles and forward to GM (narrowed scope - hit/miss handled by createChatMessage)',
			context: 'stats-combat-attack-rolls',
			priority: 3,
			callback: (a, b) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				CombatSources._onAttackRoll(a, b);
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
				CombatSources._onPreDamageRoll(item, config);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});
        
        const rollDamageHookId = HookManager.registerHook({
			name: 'dnd5e.rollDamage',
			description: 'Combat Stats: Forward damage to GM for non-GM clients (narrowed scope - damage tracking handled by createChatMessage)',
			context: 'stats-combat-damage-rolls',
			priority: 3,
			callback: (a, b) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				CombatSources._onDamageRoll(a, b);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        // MIDI workflow hooks (authoritative lane)
        if (game.modules.get("midi-qol")?.active) {
            const midiHitsCheckedHookId = HookManager.registerHook({
                name: 'midi-qol.hitsChecked',
                description: 'Combat Stats: Track hit/miss outcomes using MIDI workflow (authoritative)',
                context: 'stats-combat-midi-hitschecked',
                priority: 3,
                callback: async (workflow) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    try {
                        await CombatSources._onMidiHitsChecked(workflow);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI hitsChecked error', e, false, false);
                    }
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });

            const midiPreTargetDamageHookId = HookManager.registerHook({
                name: 'midi-qol.preTargetDamageApplication',
                description: 'Combat Stats: Track per-target damage/healing using MIDI workflow (authoritative)',
                context: 'stats-combat-midi-pretargdmg',
                priority: 3,
                callback: async (arg1, arg2) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    try {
                        await CombatSources._onMidiPreTargetDamageApplication(arg1, arg2);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI preTargetDamageApplication error', e, false, false);
                    }
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });

            const midiRollCompleteHookId = HookManager.registerHook({
                name: 'midi-qol.RollComplete',
                description: 'Combat Stats: Track crits/fumbles using MIDI workflow (authoritative)',
                context: 'stats-combat-midi-rollcomplete',
                priority: 3,
                callback: async (workflow) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    try {
                        await CombatSources._onMidiRollComplete(workflow);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI RollComplete error', e, false, false);
                    }
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }

        // Chat message hooks - core lane source of truth for attack/damage/healing resolution
        const createChatMessageHookId = HookManager.registerHook({
			name: 'createChatMessage',
			description: 'Combat Stats: Resolve attacks and correlate damage from chat messages',
			context: 'stats-combat-chat-messages',
			priority: 3,
			callback: (message) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				return CombatSources._onChatMessage(message);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        // MIDI (and some core flows) may add roll/flag data after creation.
        // Re-process only when rolls/flags are touched to avoid churn.
        const updateChatMessageHookId = HookManager.registerHook({
			name: 'updateChatMessage',
			description: 'Combat Stats: Re-process messages when roll/flags arrive (core lane)',
			context: 'stats-combat-chat-messages-update',
			priority: 3,
			callback: (message, changed) => {
				// --- BEGIN - HOOKMANAGER CALLBACK ---
				const changedKeys = Object.keys(changed ?? {});
				const relevant =
					changedKeys.includes("rolls") ||
					changedKeys.includes("flags") ||
					changedKeys.some(k => k.startsWith("flags."));
				if (!relevant) return;
				return CombatSources._onChatMessage(message);
				// --- END - HOOKMANAGER CALLBACK ---
			}
		});

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Hooks registered', "", true, false);
        
        // Register socket handlers for non-GM clients to forward combat data
        SocketManager.waitForReady().then(() => {
            const socket = SocketManager.getSocket();
            if (socket && socket.register) {
                socket.register("cpbTrackDamage", CombatSources._onSocketTrackDamage.bind(CombatSources));
                socket.register("cpbTrackAttack", CombatSources._onSocketTrackAttack.bind(CombatSources));
                socket.register("cpbMidiHitsChecked", CombatSources._onSocketMidiHitsChecked.bind(CombatSources));
                socket.register("cpbMidiPreTargetDamageApplication", CombatSources._onSocketMidiPreTargetDamageApplication.bind(CombatSources));
                socket.register("cpbMidiRollComplete", CombatSources._onSocketMidiRollComplete.bind(CombatSources));
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Socket handlers registered', "", true, false);
            }
        });
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
    static async _onCombatStart(combat) {
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
    
    static async _onRoundEnd(roundNumber, skipStartedCheck = false, combat = null) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;

        // Lazy for the same reason as in _onCombatEnd: stats-cards.js imports
        // this module, so a static import here would close a bootstrap cycle.
        const { CombatCards } = await import('./stats-cards.js');

        // Use provided combat object or fall back to game.combat
        const combatToUse = combat || game.combat;
        
        // Skip started check when processing partial round at combat end
        if (!skipStartedCheck && !combatToUse?.started) return;

        // Ensure currentStats is initialized
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }

        postConsoleAndNotification(MODULE.NAME, 'Round End - Starting MVP calculation', "", true, false);

        // Record the last turn's duration using the last combatant in the turns array
        // Use combatToUse instead of game.combat to handle cases where combat is being deleted
        const lastTurn = combatToUse?.turns?.length - 1;
        const lastCombatant = combatToUse?.turns?.[lastTurn];
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
            roundMvpResult = await CombatMvp._calculateMVP(playerStats);
        } else {
            const { description, themeLabel, themeKey } = MVPDescriptionGenerator.generateDescription({
                combat: { attacks: { hits: 0, misses: 0, attempts: 0, crits: 0, fumbles: 0 } },
                damage: { dealt: 0, taken: 0 },
                healing: { given: 0, received: 0 }
            });
            roundMvpResult.mvp = {
                score: 0,
                themeLabel,
                themeKey,
                description
            };
        }

        postConsoleAndNotification(MODULE.NAME, 'Round End - MVP Calculated:', roundMvpResult, true, false);

        // Calculate total round duration (real wall-clock time)
        const roundEndTimestamp = Date.now();
        const totalRoundDuration = roundEndTimestamp - this.currentStats.roundStartTimestamp;
        this.currentStats.roundDuration = totalRoundDuration;

        // Use the round number that was passed in (the round that just ended)
        // Don't use game.combat.round as that's already the new round
        const finalRoundNumber = roundNumber ?? 1;

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
            const templateData = await CombatCards._prepareTemplateData(this.currentStats.participantStats, combatToUse);

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
            await CombatCards._sendRoundCards(templateData);

            // Reset current stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            this.currentStats.partyStats.turnTimes = {};
            this.currentStats.activePlanningTime = 0;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Round End - Error', error, false, false);
        }
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
