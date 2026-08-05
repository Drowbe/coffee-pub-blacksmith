// Import required modules
import { MODULE } from './const.js';
import { isPlayerCharacter } from './api-core.js';
import { CPBPlayerStats } from './stats-player.js';
import { CombatStats } from './stats-combat.js';
import { PartyStats } from './stats-party.js';

/**
 * StatsAPI - Provides access to Blacksmith's statistics systems
 */
export class StatsAPI {
    /**
     * Player Statistics API Methods
     */
    static player = {
        /**
         * Get complete stats for a player
         * @param {string} actorId - The ID of the actor
         * @returns {Promise<Object>} The player's complete stats
         */
        getStats: async (actorId) => {
            return await CPBPlayerStats.getPlayerStats(actorId);
        },

        /**
         * Get lifetime statistics for a player
         * @param {string} actorId - The ID of the actor
         * @returns {Promise<Object>} The player's lifetime stats
         */
        getLifetimeStats: async (actorId) => {
            const stats = await CPBPlayerStats.getPlayerStats(actorId);
            return stats?.lifetime || null;
        },

        /**
         * Get current session statistics for a player
         * @param {string} actorId - The ID of the actor
         * @returns {Object} The player's session stats
         */
        getSessionStats: (actorId) => {
            return CPBPlayerStats._getSessionStats(actorId);
        },

        /**
         * Get specific stat category for a player
         * @param {string} actorId - The ID of the actor
         * @param {string} category - The category to retrieve (attacks, healing, turnStats)
         * @returns {Promise<Object>} The requested stat category
         */
        getStatCategory: async (actorId, category) => {
            const stats = await CPBPlayerStats.getPlayerStats(actorId);
            return stats?.lifetime?.[category] || null;
        },

        /**
         * Clear all statistics for a specific player
         * @param {string} actorId - The ID of the actor
         * @returns {Promise<void>}
         */
        clearStats: async (actorId) => {
            return await CPBPlayerStats.clearPlayerStats(actorId);
        },

        /**
         * Clear all statistics for all players
         * @returns {Promise<void>}
         */
        clearAllStats: async () => {
            return await CPBPlayerStats.clearAllPlayerStats();
        }
    };

    /**
     * Party Statistics API Methods
     *
     * Party-wide aggregates over per-actor lifetime stats and stored combat
     * history. Both sources are per-actor or per-combat, so anything
     * party-wide has to be reduced; this namespace is the only place that
     * happens, and the result is cached rather than recomputed per read.
     */
    static party = {
        /**
         * Get the party aggregate, building it if the cache is cold.
         * @returns {Promise<Object>} tiles, totals, and the ranked leaderboard
         */
        getAggregate: async () => {
            return await PartyStats.getAggregate();
        },

        /**
         * Get the party aggregate only if it is already built.
         * For callers that render synchronously and cannot await — returns
         * null and starts a rebuild, so the caller draws what it has and picks
         * the rest up next render.
         * @returns {Object|null}
         */
        getAggregateSync: () => {
            return PartyStats.getAggregateSync();
        },

        /**
         * The actors counted as the party: player-owned, excluding
         * token-synthetic actors.
         * @returns {Actor[]}
         */
        getPartyActors: () => {
            return PartyStats.getPartyActors();
        },

        /**
         * Drop the cached aggregate so the next read rebuilds it. Rarely
         * needed — the cache invalidates itself on combat end and actor
         * changes.
         * @returns {void}
         */
        refresh: () => {
            return PartyStats.invalidate();
        }
    };

    /**
     * Combat Statistics API Methods
     */
    static combat = {
        /**
         * Get the current ROUND's statistics. Despite the name this is the round
         * accumulator, not the running combat — use getRunningStats() for that.
         * @returns {Object} Current round stats
         */
        getCurrentStats: () => {
            return CombatStats.getCurrentStats();
        },

        /**
         * Get the running totals for the combat in progress: party totals, per-participant
         * summaries, top moments, and live MVP rankings. Shaped like the end-of-combat
         * summary, so the same field means the same thing before and after the fight ends.
         * @returns {Object|null} Running combat stats, or null when no combat is tracked
         */
        getRunningStats: () => {
            return CombatStats.getRunningCombatStats();
        },

        /**
         * Get statistics for a specific combat participant
         * @param {string} participantId - The ID of the participant
         * @returns {Object} Participant's combat stats
         */
        getParticipantStats: (participantId) => {
            return CombatStats.getParticipantStats(participantId);
        },

        /**
         * Get notable moments from the current combat
         * @returns {Object} Notable moments from the combat
         */
        getNotableMoments: () => {
            return CombatStats.getNotableMoments();
        },

        /**
         * Get round summary for the specified round
         * @param {number} round - The round number (defaults to current round)
         * @returns {Object} Round summary
         */
        getRoundSummary: (round = null) => {
            return CombatStats.getRoundSummary(round);
        },

        /**
         * Get the most recent combat summary
         * @returns {Object|null} Most recent combat summary or null
         */
        getCombatSummary: () => {
            return CombatStats.getCombatSummary();
        },

        /**
         * Get combat history (stored summaries)
         * @param {number} limit - Maximum number of summaries to return (default: 20)
         * @returns {Array} Array of combat summaries
         */
        getCombatHistory: (limit = 20) => {
            return CombatStats.getCombatHistory(limit);
        },

        /**
         * Clear all combat history
         * @returns {Promise<void>}
         */
        clearHistory: async () => {
            return await CombatStats.clearCombatHistory();
        },

        /**
         * Remove a specific combat from history
         * @param {string} combatId - The combat ID to remove
         * @returns {Promise<Object|null>} The removed combat summary or null if not found
         */
        removeCombat: async (combatId) => {
            return await CombatStats.removeCombatFromHistory(combatId);
        }
    };

    /**
     * Direct access to CombatStats class (for advanced usage/testing)
     * @type {typeof CombatStats}
     */
    static CombatStats = CombatStats;

    /**
     * Utility Methods
     */
    static utils = {
        /**
         * Format time values consistently
         * @param {number} ms - Time in milliseconds
         * @returns {string} Formatted time string
         */
        formatTime: (ms) => {
            return CombatStats.formatTime(ms);
        },

        /**
         * Check if an actor is a player character -- a player-owned `character` sheet.
         * This is the definition of party membership used throughout statistics. NPCs are
         * never party, including summons and permanently player-owned companions.
         * @param {Object|string} input - Combatant, token, actor, ID, or name
         * @returns {boolean} True if the actor is a player character
         */
        isPlayerCharacter: (input) => {
            return isPlayerCharacter(input);
        }
    };
} 
