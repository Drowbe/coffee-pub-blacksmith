// Import required modules
import { MODULE } from './const.js';
import { CPBPlayerStats } from './stats-player.js';
import { CombatStats } from './stats-combat.js';

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
        }
    };

    /**
     * Combat Statistics API Methods
     */
    static combat = {
        /**
         * Get current combat statistics
         * @returns {Object} Current combat stats
         */
        getCurrentStats: () => {
            return CombatStats.getCurrentStats();
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
         * Subscribe to combat stat updates
         * @param {Function} callback - Function to call when stats update
         * @returns {string} Subscription ID
         */
        subscribeToUpdates: (callback) => {
            return CombatStats.subscribeToUpdates(callback);
        },

        /**
         * Unsubscribe from combat stat updates
         * @param {string} subscriptionId - The ID returned from subscribeToUpdates
         */
        unsubscribeFromUpdates: (subscriptionId) => {
            CombatStats.unsubscribeFromUpdates(subscriptionId);
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
         * Check if an actor is a player character
         * @param {Object|string} input - Actor object, ID, or name
         * @returns {boolean} True if actor is a player character
         */
        isPlayerCharacter: (input) => {
            return CombatStats._isPlayerCharacter(input);
        }
    };
} 
