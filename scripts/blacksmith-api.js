/**
 * Blacksmith API Bridge - Drop-in file for other Coffee Pub modules
 * This file provides robust access to Blacksmith's existing APIs
 * 
 * Usage:
 * import { BlacksmithAPI } from 'coffee-pub-blacksmith/scripts/blacksmith-api.js';
 * 
 * const hookManager = BlacksmithAPI.getHookManager();
 * const utils = BlacksmithAPI.getUtils();
 */

// Import from Blacksmith's existing APIs (no circular dependencies)
import { HookManager } from './manager-hooks.js';
import { postConsoleAndNotification, playSound, COFFEEPUB, getSettingSafely, setSettingSafely } from './api-common.js';
import { ModuleManager } from './manager-modules.js';
import { StatsAPI } from './api-stats.js';

/**
 * BlacksmithAPI - Bridge class providing robust access to Blacksmith's APIs
 * This is a thin wrapper around Blacksmith's existing functionality
 */
export class BlacksmithAPI {
    
    /**
     * Get HookManager instance
     * @returns {Object} HookManager instance
     */
    static getHookManager() {
        return HookManager;
    }
    
    /**
     * Get utilities (console, sound, settings, etc.)
     * @returns {Object} Utilities object
     */
    static getUtils() {
        return {
            postConsoleAndNotification,
            playSound,
            COFFEEPUB,
            getSettingSafely,
            setSettingSafely
        };
    }
    
    /**
     * Get ModuleManager instance
     * @returns {Object} ModuleManager instance
     */
    static getModuleManager() {
        return ModuleManager;
    }
    
    /**
     * Get Stats API instance
     * @returns {Object} Stats API instance
     */
    static getStats() {
        return StatsAPI;
    }
    
    /**
     * Get the full Blacksmith API object
     * @returns {Object} Full API object
     */
    static getFullAPI() {
        return {
            HookManager,
            ModuleManager,
            utils: this.getUtils(),
            stats: StatsAPI,
            COFFEEPUB
        };
    }
    
    /**
     * Check if Blacksmith is ready
     * @returns {boolean} True if Blacksmith is loaded and ready
     */
    static isReady() {
        return !!HookManager && !!ModuleManager;
    }
    
    /**
     * Get API version from COFFEEPUB
     * @returns {string} API version
     */
    static getVersion() {
        return COFFEEPUB?.VERSION || 'unknown';
    }
    
    /**
     * Check if a specific feature is available
     * @param {string} feature - Feature name to check
     * @returns {boolean} True if feature is available
     */
    static hasFeature(feature) {
        const api = this.getFullAPI();
        return !!api[feature];
    }
}

// Export individual APIs for direct access
export { HookManager, ModuleManager, StatsAPI, COFFEEPUB };

// Also expose globally for non-module usage
if (typeof window !== 'undefined') {
    window.BlacksmithAPI = BlacksmithAPI;
    window.BlacksmithHookManager = HookManager;
    window.BlacksmithUtils = BlacksmithAPI.getUtils();
}
