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

// BlacksmithAPIStatus - Check if API is fully ready
window.BlacksmithAPIStatus = () => {
    const isReady = BlacksmithAPI.isAPIOpen();
    console.log('🔧 Blacksmith API Status:', isReady ? '✅ READY' : '⏳ NOT READY');
    return isReady;
};

// BlacksmithAPIVersion - Show current API version
window.BlacksmithAPIVersion = async () => {
    try {
        const version = await BlacksmithAPI.getVersion();
        console.log('🔧 Blacksmith API Version:', version);
        return version;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith API version:', error);
        return null;
    }
};

// BlacksmithAPICheck - Module registration status
window.BlacksmithAPICheck = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.ModuleManager) {
            console.error('❌ Blacksmith ModuleManager not available');
            return null;
        }
        
        const registeredModules = module.api.ModuleManager.registeredModules;
        const moduleCount = registeredModules.size;
        const modulesList = [];
        
        // Get basic module info
        for (const [moduleId, moduleInfo] of registeredModules) {
            modulesList.push({
                id: moduleId,
                name: moduleInfo.name,
                version: moduleInfo.version,
                featureCount: moduleInfo.features.size
            });
        }
        
        console.log(`🔧 Blacksmith Module Registration: ${moduleCount} modules registered`);
        console.log('🔧 Registered Modules:', modulesList);
        
        return { count: moduleCount, modules: modulesList };
    } catch (error) {
        console.error('❌ Failed to check Blacksmith module registration:', error);
        return null;
    }
};

// BlacksmithAPIDetails - Aggregation of debug information
window.BlacksmithAPIDetails = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api) {
            console.error('❌ Blacksmith API not available');
            return null;
        }
        
        const api = module.api;
        const details = {
            version: api.version || 'Unknown',
            modules: {
                HookManager: !!api.HookManager,
                ModuleManager: !!api.ModuleManager,
                Utils: !!api.utils,
                Stats: !!api.stats,
                BLACKSMITH: !!api.BLACKSMITH
            },
            moduleCount: api.ModuleManager?.registeredModules?.size || 0,
            hookCount: api.HookManager?.getHooks?.()?.length || 0
        };
        
        console.log('🔧 Blacksmith API Details:', details);
        return details;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith API details:', error);
        return null;
    }
};

// BlacksmithAPISettings - Show current Blacksmith settings
window.BlacksmithAPISettings = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module) {
            console.error('❌ Blacksmith module not found');
            return null;
        }
        
        const settings = game.settings.settings;
        const blacksmithSettings = {};
        
        // Filter for Blacksmith settings
        for (const [key, setting] of settings) {
            if (key.startsWith('coffee-pub-blacksmith.')) {
                const settingKey = key.replace('coffee-pub-blacksmith.', '');
                blacksmithSettings[settingKey] = game.settings.get('coffee-pub-blacksmith', settingKey);
            }
        }
        
        console.log('🔧 Blacksmith Settings:', blacksmithSettings);
        return blacksmithSettings;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith settings:', error);
        return null;
    }
};

// BlacksmithAPIFeatures - Show available features by module
window.BlacksmithAPIFeatures = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.ModuleManager) {
            console.error('❌ Blacksmith ModuleManager not available');
            return null;
        }
        
        const features = module.api.ModuleManager.features;
        const featuresByModule = {};
        
        // Group features by module
        for (const [key, feature] of features) {
            const moduleId = feature.moduleId;
            if (!featuresByModule[moduleId]) {
                featuresByModule[moduleId] = [];
            }
            featuresByModule[moduleId].push({
                type: feature.type,
                data: feature.data
            });
        }
        
        console.log('🔧 Blacksmith Features by Module:', featuresByModule);
        return featuresByModule;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith features:', error);
        return null;
    }
};

// BlacksmithAPIModules - Show currently registered modules and basic details
window.BlacksmithAPIModules = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.ModuleManager) {
            console.error('❌ Blacksmith ModuleManager not available');
            return null;
        }
        
        const registeredModules = module.api.ModuleManager.registeredModules;
        const modulesList = {};
        
        // Convert Map to object for display
        for (const [moduleId, moduleInfo] of registeredModules) {
            modulesList[moduleId] = {
                name: moduleInfo.name,
                version: moduleInfo.version,
                features: Array.from(moduleInfo.features)
            };
        }
        
        console.log('🔧 Blacksmith Registered Modules:', modulesList);
        return modulesList;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith modules:', error);
        return null;
    }
};

// BlacksmithAPIConstants - Show all available constants/themes/sounds
window.BlacksmithAPIConstants = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.BLACKSMITH) {
            console.error('❌ Blacksmith constants not available');
            return null;
        }
        
        const constants = module.api.BLACKSMITH;
        console.log('🔧 Blacksmith Constants:', constants);
        return constants;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith constants:', error);
        return null;
    }
};

// BlacksmithAPIUtils - Show all available utility functions
window.BlacksmithAPIUtils = async () => {
    try {
        const utils = await BlacksmithAPI.getUtils();
        console.log('🔧 Blacksmith Utilities:', utils);
        return utils;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith utilities:', error);
        return null;
    }
};

// BlacksmithAPIHooks - Show hook counts and comma-delimited names of all registered hooks
window.BlacksmithAPIHooks = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.HookManager) {
            console.error('❌ Blacksmith HookManager not available');
            return null;
        }
        
        const hooks = module.api.HookManager.getHooks();
        const hookCount = hooks.length;
        const hookNames = hooks.map(hook => hook.name).join(', ');
        
        console.log(`🔧 Blacksmith Hooks: ${hookCount} total`);
        console.log('🔧 Hook Names:', hookNames);
        
        return { count: hookCount, names: hookNames, hooks: hooks };
    } catch (error) {
        console.error('❌ Failed to get Blacksmith hooks:', error);
        return null;
    }
};

// BlacksmithAPIHookDetails - Show detailed hook information with priority grouping
window.BlacksmithAPIHookDetails = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.HookManager) {
            console.error('❌ Blacksmith HookManager not available');
            return null;
        }
        
        const hooks = module.api.HookManager.getHooks();
        const hooksByPriority = {};
        
        // Group hooks by priority
        hooks.forEach(hook => {
            const priority = hook.priority || 'default';
            if (!hooksByPriority[priority]) {
                hooksByPriority[priority] = [];
            }
            hooksByPriority[priority].push({
                name: hook.name,
                description: hook.description,
                context: hook.context,
                key: hook.key
            });
        });
        
        console.log('🔧 Blacksmith Hook Details by Priority:', hooksByPriority);
        return hooksByPriority;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith hook details:', error);
        return null;
    }
};

// BlacksmithAPIHookStats - Get raw hook statistics as an object
window.BlacksmithAPIHookStats = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.HookManager) {
            console.error('❌ Blacksmith HookManager not available');
            return null;
        }
        
        const hooks = module.api.HookManager.getHooks();
        const stats = {
            totalHooks: hooks.length,
            hooksByPriority: {},
            hooksByContext: {},
            hooksByName: {}
        };
        
        // Calculate statistics
        hooks.forEach(hook => {
            const priority = hook.priority || 'default';
            const context = hook.context || 'default';
            const name = hook.name;
            
            // Count by priority
            stats.hooksByPriority[priority] = (stats.hooksByPriority[priority] || 0) + 1;
            
            // Count by context
            if (!stats.hooksByContext[context]) {
                stats.hooksByContext[context] = [];
            }
            stats.hooksByContext[context].push(hook.name);
            
            // Count by name
            if (!stats.hooksByName[name]) {
                stats.hooksByName[name] = [];
            }
            stats.hooksByName[name].push({
                context: hook.context,
                priority: hook.priority,
                description: hook.description
            });
        });
        
        console.log('🔧 Blacksmith Hook Statistics:', stats);
        return stats;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith hook stats:', error);
        return null;
    }
};

