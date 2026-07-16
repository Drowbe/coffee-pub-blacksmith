import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

// Coffee Pub modules are identified by their id prefix.
const MODULE_PREFIX = 'coffee-pub-';

export class ModuleManager {
    static registeredModules = new Map();
    static features = new Map();

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, "ModuleManager initializing", "", true, false);
        this._detectInstalledModules();
    }

    static _detectInstalledModules() {
        // Discover active Coffee Pub modules straight from Foundry's registry.
        // This previously read `window.COFFEEPUB.MODULES`, which nothing ever populated, so the
        // registry stayed empty and every registerModule() call failed its lookup and returned false.
        for (const module of game.modules) {
            if (!module.active || !module.id.startsWith(MODULE_PREFIX)) continue;
            postConsoleAndNotification(MODULE.NAME, `Detected active module: ${module.id}`, "", true, false);
            this._addModuleInfo(module);
        }
    }

    /**
     * Create (or return) the registry entry for an active Foundry module.
     * @param {Module} module - A Foundry module from game.modules
     * @returns {Object} The registry entry
     */
    static _addModuleInfo(module) {
        const existing = this.registeredModules.get(module.id);
        if (existing) return existing;

        const moduleInfo = {
            id: module.id,
            name: module.title,
            version: module.version,
            features: new Set()
        };
        this.registeredModules.set(module.id, moduleInfo);
        return moduleInfo;
    }

    /**
     * Register a Coffee Pub module and its features with Blacksmith
     * @param {string} moduleId - The module ID
     * @param {Object} config - Configuration object
     * @param {string} config.name - Display name of the module
     * @param {string} config.version - Module version
     * @param {Array} config.features - Array of feature objects the module provides
     * @returns {boolean} True if the module is active and now registered
     */
    static registerModule(moduleId, config = {}) {
        // Self-register on demand: a caller must not depend on having been auto-detected first.
        let moduleInfo = this.registeredModules.get(moduleId);
        if (!moduleInfo) {
            const module = game.modules.get(moduleId);
            if (!module?.active) {
                postConsoleAndNotification(MODULE.NAME, `Error: Module ${moduleId} not found or not active`, "", true, false);
                return false;
            }
            moduleInfo = this._addModuleInfo(module);
        }

        // Caller-supplied identity wins over what Foundry reports.
        if (config.name) moduleInfo.name = config.name;
        if (config.version) moduleInfo.version = config.version;

        // Register each feature
        config.features?.forEach(feature => {
            if (feature.type && feature.data) {
                this.features.set(`${moduleId}.${feature.type}`, {
                    moduleId,
                    ...feature
                });
                moduleInfo.features.add(feature.type);
            }
        });

        postConsoleAndNotification(MODULE.NAME, `Registered module: ${moduleId}`, "", true, false);
        return true;
    }

    /**
     * Get all registered features of a specific type
     * @param {string} featureType - Type of feature to retrieve
     * @returns {Array} Array of matching features
     */
    static getFeaturesByType(featureType) {
        const results = [];
        this.features.forEach((feature, key) => {
            if (feature.type === featureType) {
                results.push(feature);
            }
        });
        return results;
    }

    /**
     * Check if a specific module is installed and active
     * @param {string} moduleId - The module ID to check
     * @returns {boolean} True if module is installed and active
     */
    static isModuleActive(moduleId) {
        return this.registeredModules.has(moduleId);
    }

    /**
     * Get all features registered by a specific module
     * @param {string} moduleId - The module ID
     * @returns {Set} Set of feature types provided by the module
     */
    static getModuleFeatures(moduleId) {
        return this.registeredModules.get(moduleId)?.features || new Set();
    }
} 
