// ================================================================== 
// ===== BLACKSMITH API - DROP-IN BRIDGE ===========================
// ================================================================== 

/**
 * BlacksmithAPI - Drop-in bridge for accessing Blacksmith's API
 * 
 * This file provides a robust, timing-safe way to access Blacksmith's features
 * from other modules. It handles module availability, timing issues, and provides
 * a clean interface to all Blacksmith APIs.
 * 
 * USAGE:
 * 1. Import this file: import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'
 * 2. Use the API: const blacksmith = await BlacksmithAPI.get()
 * 3. Register your module manually (see documentation for pattern)
 */

// ================================================================== 
// ===== CORE API CLASS =============================================
// ================================================================== 

export class BlacksmithAPI {
    static instance = null;
    static isReady = false;
    static readyCallbacks = [];

    constructor() {
        if (BlacksmithAPI.instance) {
            return BlacksmithAPI.instance;
        }
        BlacksmithAPI.instance = this;
    }

    /**
     * Get the main Blacksmith API instance
     * @returns {Promise<Object>} The Blacksmith API object
     */
    static async get() {
        if (this.isReady) {
            return this._getAPI();
        }
        
        return new Promise((resolve) => {
            this.readyCallbacks.push(resolve);
        });
    }

    /**
     * Wait for Blacksmith to be ready
     * @returns {Promise<void>}
     */
    static async waitForReady() {
        if (this.isReady) return;
        
        return new Promise((resolve) => {
            this.readyCallbacks.push(resolve);
        });
    }

    /**
     * Get the HookManager API
     * @returns {Promise<Object>} HookManager instance
     */
    static getHookManager() {
        return this.waitForReady().then(() => this._getAPI().HookManager);
    }

    /**
     * Get the Utils API
     * @returns {Promise<Object>} Utils instance
     */
    static getUtils() {
        return this.waitForReady().then(() => this._getAPI().utils);
    }

    /**
     * Get the ModuleManager API
     * @returns {Promise<Object>} ModuleManager instance
     */
    static getModuleManager() {
        return this.waitForReady().then(() => this._getAPI().ModuleManager);
    }

    /**
     * Get the Stats API
     * @returns {Promise<Object>} Stats API instance
     */
    static getStats() {
        return this.waitForReady().then(() => this._getAPI().stats);
    }

    /**
     * Get the BLACKSMITH constants
     * @returns {Promise<Object>} BLACKSMITH constants object
     */
    static getBLACKSMITH() {
        return this.waitForReady().then(() => this._getAPI().BLACKSMITH);
    }

    /**
     * Get the API version
     * @returns {Promise<string>} API version string
     */
    static getVersion() {
        return this.waitForReady().then(() => this._getAPI().version);
    }

    /**
     * Check if Blacksmith is ready
     * @returns {boolean} True if ready
     */
    static isAPIOpen() {
        return this.isReady;
    }

    /**
     * Get the internal API object
     * @returns {Object} The API object
     */
    static _getAPI() {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api) {
            throw new Error('Blacksmith API not available');
        }
        return module.api;
    }

    /**
     * Mark the API as ready and resolve all waiting callbacks
     */
    static _markReady() {
        this.isReady = true;
        this.readyCallbacks.forEach(callback => callback(this._getAPI()));
        this.readyCallbacks = [];
    }
}

// ================================================================== 
// ===== INITIALIZATION & READY CHECKING ===========================
// ================================================================== 

// Check if Blacksmith is already ready
function checkBlacksmithReady() {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (module?.api) {
            BlacksmithAPI._markReady();
            return true;
        }
    } catch (e) {
        // Module not ready yet
    }
    return false;
}

// Set up ready checking
if (typeof game !== 'undefined' && game.modules) {
    // Check immediately
    if (!checkBlacksmithReady()) {
        // Set up polling
        const checkInterval = setInterval(() => {
            if (checkBlacksmithReady()) {
                clearInterval(checkInterval);
            }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!BlacksmithAPI.isReady) {
                console.error('❌ Blacksmith API: Timeout waiting for Blacksmith to be ready');
            }
        }, 10000);
    }
}

// ================================================================== 
// ===== GLOBAL EXPOSURE ===========================================
// ================================================================== 

// Expose the API globally for easy access
if (typeof window !== 'undefined') {
    window.BlacksmithAPI = BlacksmithAPI;
    window.BlacksmithHookManager = () => BlacksmithAPI.getHookManager();
    window.BlacksmithUtils = () => BlacksmithAPI.getUtils();
    window.BlacksmithModuleManager = () => BlacksmithAPI.getModuleManager();
    window.BlacksmithStats = () => BlacksmithAPI.getStats();
}

