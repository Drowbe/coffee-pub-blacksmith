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
        if (this.isReady) return Promise.resolve();
        
        return new Promise((resolve) => {
            this.readyCallbacks.push(resolve);
        });
    }

    /**
     * Get the HookManager API
     * @returns {Promise<Object>} HookManager instance
     */
    static getHookManager() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().HookManager;
            } catch (error) {
                throw new Error(`Failed to get HookManager: ${error.message}`);
            }
        });
    }

    /**
     * Get the Utils API
     * @returns {Promise<Object>} Utils instance
     */
    static getUtils() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().utils;
            } catch (error) {
                throw new Error(`Failed to get Utils: ${error.message}`);
            }
        });
    }

    /**
     * Get the ModuleManager API
     * @returns {Promise<Object>} ModuleManager instance
     */
    static getModuleManager() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().ModuleManager;
            } catch (error) {
                throw new Error(`Failed to get ModuleManager: ${error.message}`);
            }
        });
    }

    /**
     * Get the Stats API
     * @returns {Promise<Object>} Stats API instance
     */
    static getStats() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().stats;
            } catch (error) {
                throw new Error(`Failed to get Stats: ${error.message}`);
            }
        });
    }

    /**
     * Get the BLACKSMITH constants
     * @returns {Promise<Object>} BLACKSMITH constants object
     */
    static getBLACKSMITH() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().BLACKSMITH;
            } catch (error) {
                throw new Error(`Failed to get BLACKSMITH constants: ${error.message}`);
            }
        });
    }

    /**
     * Get the BlacksmithCanvasLayer (available after canvasReady)
     * @returns {Promise<Object|null>} BlacksmithLayer instance or null if not available
     */
    static getCanvasLayer() {
        return this.waitForReady().then(() => {
            try {
                const api = this._getAPI();
                // Try API first
                if (api.getCanvasLayer) {
                    return api.getCanvasLayer();
                }
                // Fallback to direct canvas access
                if (typeof canvas !== 'undefined' && canvas['blacksmith-utilities-layer']) {
                    return canvas['blacksmith-utilities-layer'];
                }
                return null;
            } catch (error) {
                // Layer might not be ready yet, return null
                return null;
            }
        });
    }

    /**
     * Get the Socket API
     * @returns {Promise<Object>} Socket API instance
     */
    static getSockets() {
        return this.waitForReady().then(async () => {
            try {
                const api = this._getAPI();
                
                // If sockets isn't set yet, wait for it (it's initialized asynchronously)
                if (!api.sockets) {
                    // Wait up to 2 seconds for socket API to be exposed
                    let attempts = 0;
                    while (!api.sockets && attempts < 20) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        attempts++;
                    }
                    
                    if (!api.sockets) {
                        throw new Error('Socket API not yet initialized. It may still be loading. Try again in a moment.');
                    }
                }
                return api.sockets;
            } catch (error) {
                throw new Error(`Failed to get Socket API: ${error.message}`);
            }
        });
    }

    /**
     * Get the API version
     * @returns {Promise<string>} API version string
     */
    static getVersion() {
        return this.waitForReady().then(() => {
            try {
                return this._getAPI().version;
            } catch (error) {
                throw new Error(`Failed to get API version: ${error.message}`);
            }
        });
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
        try {
            const api = this._getAPI();
            
            // Assign global objects for direct access
            if (typeof window !== 'undefined') {
                window.BlacksmithUtils = api.utils;
                window.BlacksmithHookManager = api.HookManager;
                window.BlacksmithModuleManager = api.ModuleManager;
                window.BlacksmithStats = api.stats;
                window.BlacksmithConstants = api.BLACKSMITH;
                
                // Create global Blacksmith object if it doesn't exist
                if (!window.Blacksmith) {
                    window.Blacksmith = {};
                }
                // Expose socket API on global Blacksmith object (may be set asynchronously later)
                if (api.sockets) {
                    window.Blacksmith.socket = api.sockets;
                }
                
                // CanvasLayer is available after canvasReady
                if (api.CanvasLayer) {
                    window.BlacksmithCanvasLayer = api.CanvasLayer;
                }
            }
            
            this.readyCallbacks.forEach(callback => callback(api));
        } catch (error) {
            console.error('🔧 Blacksmith API: Error getting API during ready callback:', error);
            // Still resolve callbacks with null to prevent hanging
            this.readyCallbacks.forEach(callback => callback(null));
        }
        this.readyCallbacks = [];
    }
}

// ================================================================== 
// ===== INITIALIZATION & READY CHECKING ===========================
// ================================================================== 

// Simple readiness checking using FoundryVTT hooks
function initializeReadyChecking() {
    if (typeof Hooks !== 'undefined') {
        // Wait for FoundryVTT to be ready
        Hooks.once('ready', () => {
            console.log('🔧 Blacksmith API: FoundryVTT ready, checking Blacksmith...');
            checkBlacksmithReady();
        });
    } else {
        // Wait for Hooks to be available
        setTimeout(initializeReadyChecking, 100);
    }
}

// Check if Blacksmith is ready
function checkBlacksmithReady() {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (module?.api && module.api.version) {
            if (!BlacksmithAPI.isReady) {
                console.log('🔧 Blacksmith API: Ready detected');
                BlacksmithAPI._markReady();
            }
            return true;
        }
    } catch (e) {
        console.log('🔧 Blacksmith API: Error during readiness check:', e);
    }
    return false;
}

// Start the readiness checking
initializeReadyChecking();

// ================================================================== 
// ===== GLOBAL EXPOSURE ===========================================
// ================================================================== 

// Expose the API globally for easy access
if (typeof window !== 'undefined') {
    window.BlacksmithAPI = BlacksmithAPI;
    
    // Declare global objects (will be assigned when ready)
    window.BlacksmithHookManager = null;
    window.BlacksmithUtils = null;
    window.BlacksmithModuleManager = null;
    window.BlacksmithStats = null;
    window.BlacksmithConstants = null;
}

// BlacksmithAPIStatus - Check if API is fully ready
window.BlacksmithAPIStatus = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        const hasApi = !!module?.api && !!module.api.version;
        const isReady = BlacksmithAPI.isAPIOpen();
        
        console.log('🔧 Blacksmith API Status:', {
            hasApi: hasApi,
            isReady: isReady,
            status: hasApi ? '✅ READY' : '⏳ NOT READY'
        });
        
        return hasApi;
    } catch (error) {
        console.error('❌ Failed to check Blacksmith API status:', error);
        return false;
    }
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
            hookCount: api.HookManager?.hooks?.size || 0
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

// BlacksmithAPIGenerateConstants - Test the new constants generation system
window.BlacksmithAPIGenerateConstants = async () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.ConstantsGenerator) {
            console.error('❌ ConstantsGenerator not available');
            return null;
        }
        
        console.log('🔧 Testing Constants Generation System...');
        
        // Generate all constants
        const constants = module.api.ConstantsGenerator.generateAllConstants();
        console.log('🔧 Generated Constants:', constants);
        
        // Generate all constants
        const choices = module.api.ConstantsGenerator.generateAllChoices();
        console.log('🔧 Generated Choices:', choices);
        
        // Get constant names
        const constantnames = module.api.ConstantsGenerator.getAllconstantnames();
        console.log('🔧 Available Constant Names:', constantnames);
        
        // Validate constants
        const validation = module.api.ConstantsGenerator.validateConstants();
        console.log('🔧 Constants Validation:', validation);
        
        return { constants, choices, constantnames, validation };
        
    } catch (error) {
        console.error('❌ Failed to test constants generation:', error);
        return null;
    }
};

// BlacksmithAPIAssetLookup - Test the new Asset Lookup Tool
window.BlacksmithAPIAssetLookup = async () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.assetLookup) {
            console.error('❌ AssetLookup not available');
            return null;
        }
        
        console.log('🔍 Testing Asset Lookup Tool...');
        
        // Test getByTypeAndTags
        const errorSounds = module.api.assetLookup.getByTypeAndTags('sound', 'interface', ['error']);
        console.log('🔍 Error Sounds:', errorSounds);
        
        // Test getByCategory
        const interfaceSounds = module.api.assetLookup.getByCategory('interface');
        console.log('🔍 Interface Sounds:', interfaceSounds);
        
        // Test searchByCriteria
        const notificationSounds = module.api.assetLookup.searchByCriteria({
            type: 'sound',
            category: 'interface',
            tags: ['notification']
        });
        console.log('🔍 Notification Sounds:', notificationSounds);
        
        // Test getChoices
        const soundChoices = module.api.assetLookup.getChoices('sound', 'interface');
        console.log('🔍 Sound Choices:', soundChoices);
        
        // Test getRandom
        const randomErrorSound = module.api.assetLookup.getRandom('sound', 'interface', ['error']);
        console.log('🔍 Random Error Sound:', randomErrorSound);
        
        // Test constants
        const allConstants = module.api.assetLookup.getAllConstants();
        console.log('🔍 Generated Constants:', allConstants);
        
        return { 
            errorSounds, 
            interfaceSounds, 
            notificationSounds, 
            soundChoices, 
            randomErrorSound, 
            allConstants 
        };
        
    } catch (error) {
        console.error('❌ Failed to test Asset Lookup Tool:', error);
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

// BlacksmithAPIManualReady - Manually trigger readiness check
window.BlacksmithAPIManualReady = () => {
    try {
        console.log('🔧 Blacksmith API: Manual readiness check triggered');
        return checkBlacksmithReady();
    } catch (error) {
        console.error('❌ Failed to trigger manual readiness check:', error);
        return false;
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
        
        const hookManager = module.api.HookManager;
        const hooks = hookManager.hooks;
        const hookCount = hooks.size;
        const hookNames = Array.from(hooks.keys()).join(', ');
        
        console.log(`🔧 Blacksmith Hooks: ${hookCount} total`);
        console.log('🔧 Hook Names:', hookNames);
        
        return { count: hookCount, names: hookNames, hooks: Array.from(hooks.entries()) };
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
        
        const hookManager = module.api.HookManager;
        const hooks = hookManager.hooks;
        const hooksByPriority = {};
        
        // Group hooks by priority
        for (const [hookName, hookData] of hooks.entries()) {
            const callbacks = hookData.callbacks;
            callbacks.forEach(callback => {
                const priority = callback.priority || 'default';
                if (!hooksByPriority[priority]) {
                    hooksByPriority[priority] = [];
                }
                hooksByPriority[priority].push({
                    name: hookName,
                    description: callback.description || '',
                    context: callback.context || '',
                    key: callback.key || ''
                });
            });
        }
        
        console.log('🔧 Blacksmith Hook Details by Priority:', hooksByPriority);
        return hooksByPriority;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith hook details:', error);
        return null;
    }
};

// BlacksmithAPIHookExpandedDetails - Show detailed hook information with full formatting
window.BlacksmithAPIHookExpandedDetails = () => {
    try {
        const module = game.modules.get('coffee-pub-blacksmith');
        if (!module?.api?.HookManager) {
            console.error('❌ Blacksmith HookManager not available');
            return null;
        }
        
        // Call the detailed showHookDetails method directly
        module.api.HookManager.showHookDetails();
        return true;
    } catch (error) {
        console.error('❌ Failed to show Blacksmith hook expanded details:', error);
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
        
        const hookManager = module.api.HookManager;
        const hooks = hookManager.hooks;
        const stats = {
            totalHooks: hooks.size,
            hooksByPriority: {},
            hooksByContext: {},
            hooksByName: {}
        };
        
        // Calculate statistics
        for (const [hookName, hookData] of hooks.entries()) {
            const callbacks = hookData.callbacks;
            callbacks.forEach(callback => {
                const priority = callback.priority || 'default';
                const context = callback.context || 'default';
                const name = hookName;
                
                // Count by priority
                stats.hooksByPriority[priority] = (stats.hooksByPriority[priority] || 0) + 1;
                
                // Count by context
                if (!stats.hooksByContext[context]) {
                    stats.hooksByContext[context] = [];
                }
                stats.hooksByContext[context].push(name);
                
                // Count by name
                if (!stats.hooksByName[name]) {
                    stats.hooksByName[name] = [];
                }
                stats.hooksByName[name].push({
                    context: callback.context || '',
                    priority: callback.priority || 'default',
                    description: callback.description || ''
                });
            });
        }
        
        console.log('🔧 Blacksmith Hook Statistics:', stats);
        return stats;
    } catch (error) {
        console.error('❌ Failed to get Blacksmith hook stats:', error);
        return null;
    }
};

