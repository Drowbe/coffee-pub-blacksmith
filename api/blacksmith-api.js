/**
 * Blacksmith API Bridge - Drop-in file for other Coffee Pub modules
 * This file provides robust access to Blacksmith's API without internal dependencies
 * 
 * Usage:
 * import { BlacksmithAPI } from 'coffee-pub-blacksmith/scripts/blacksmith-api.js';
 * 
 * const hookManager = await BlacksmithAPI.getHookManager();
 * const utils = await BlacksmithAPI.getUtils();
 */

/**
 * BlacksmithAPI - Bridge class providing robust access to Blacksmith's API
 * This is a standalone bridge that accesses Blacksmith through the module system
 */
export class BlacksmithAPI {
    
    /**
     * Get the Blacksmith module API
     * @returns {Object|null} Blacksmith API object or null if not available
     */
    static getAPI() {
        const module = game.modules.get('coffee-pub-blacksmith');
        return module?.api || null;
    }
    
    /**
     * Check if Blacksmith is ready
     * @returns {boolean} True if Blacksmith is loaded and ready
     */
    static isReady() {
        const api = this.getAPI();
        return !!api && !!api.HookManager;
    }
    
    /**
     * Wait for Blacksmith to be ready
     * @param {number} maxRetries - Maximum retry attempts
     * @param {number} delay - Delay between retries in ms
     * @returns {Promise<Object>} Blacksmith API object
     */
    static async waitForReady(maxRetries = 50, delay = 100) {
        for (let i = 0; i < maxRetries; i++) {
            if (this.isReady()) {
                return this.getAPI();
            }
            
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error('Blacksmith module not ready after retries');
    }
    
    /**
     * Get HookManager instance (waits for Blacksmith to be ready)
     * @returns {Promise<Object>} HookManager instance
     */
    static async getHookManager() {
        const api = await this.waitForReady();
        return api.HookManager;
    }
    
    /**
     * Get utilities (console, sound, settings, etc.) - waits for Blacksmith to be ready
     * @returns {Promise<Object>} Utilities object
     */
    static async getUtils() {
        const api = await this.waitForReady();
        return api.utils;
    }
    
    /**
     * Get ModuleManager instance (waits for Blacksmith to be ready)
     * @returns {Promise<Object>} ModuleManager instance
     */
    static async getModuleManager() {
        const api = await this.waitForReady();
        return api.ModuleManager;
    }
    
    /**
     * Get Stats API instance (waits for Blacksmith to be ready)
     * @returns {Promise<Object>} Stats API instance
     */
    static async getStats() {
        const api = await this.waitForReady();
        return api.stats;
    }
    
    /**
     * Get the full Blacksmith API object (waits for Blacksmith to be ready)
     * @returns {Promise<Object>} Full API object
     */
    static async getFullAPI() {
        return await this.waitForReady();
    }
    
    /**
     * Get API version (waits for Blacksmith to be ready)
     * @returns {Promise<string>} API version
     */
    static async getVersion() {
        const api = await this.waitForReady();
        return api.version || 'unknown';
    }
    
    /**
     * Check if a specific feature is available (waits for Blacksmith to be ready)
     * @param {string} feature - Feature name to check
     * @returns {Promise<boolean>} True if feature is available
     */
    static async hasFeature(feature) {
        const api = await this.waitForReady();
        return !!api && !!api[feature];
    }
    
    /**
     * Get API with retry logic
     * @param {number} maxRetries - Maximum retry attempts
     * @param {number} delay - Delay between retries in ms
     * @returns {Promise<Object>} Blacksmith API object
     */
    static async get(maxRetries = 50, delay = 100) {
        try {
            return await this.waitForReady(maxRetries, delay);
        } catch (error) {
            console.warn('Failed to get Blacksmith API:', error);
            return null;
        }
    }
    
    /**
     * Reset the API instance (useful for testing or module reloads)
     */
    static reset() {
        // This is a stateless bridge, no internal state to reset
        // But we can clear any cached references if needed
    }
}

// Export individual APIs for direct access (these will be null until Blacksmith is ready)
// Note: These exports are for backward compatibility but will be null initially
export const HookManager = null; // Will be null until Blacksmith is ready
export const ModuleManager = null; // Will be null until Blacksmith is ready
export const StatsAPI = null; // Will be null until Blacksmith is ready

// Also expose globally for non-module usage
if (typeof window !== 'undefined') {
    window.BlacksmithAPI = BlacksmithAPI;
    
    // Add convenience global accessors
    window.BlacksmithHookManager = () => BlacksmithAPI.getHookManager();
    window.BlacksmithUtils = () => BlacksmithAPI.getUtils();
    window.BlacksmithModuleManager = () => BlacksmithAPI.getModuleManager();
}
