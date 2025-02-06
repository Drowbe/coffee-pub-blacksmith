import { MODULE_ID, COFFEE_PUB_MODULES } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class ModuleManager {
    static registeredModules = new Map();
    static features = new Map();

    static initialize() {
        postConsoleAndNotification("Coffee Pub Blacksmith | ModuleManager initializing", "", false, true, false);
        this._detectInstalledModules();
    }

    static _detectInstalledModules() {
        // Check for each Coffee Pub module
        Object.entries(COFFEE_PUB_MODULES).forEach(([key, moduleId]) => {
            const module = game.modules.get(moduleId);
            if (module?.active) {
                postConsoleAndNotification(`Coffee Pub Blacksmith | Detected active module: ${moduleId}`, "", false, true, false);
                this.registeredModules.set(moduleId, {
                    id: moduleId,
                    name: module.title,
                    version: module.version,
                    features: new Set()
                });
            }
        });
    }

    /**
     * Register a Coffee Pub module and its features with Blacksmith
     * @param {string} moduleId - The module ID
     * @param {Object} config - Configuration object
     * @param {string} config.name - Display name of the module
     * @param {string} config.version - Module version
     * @param {Array} config.features - Array of feature objects the module provides
     */
    static registerModule(moduleId, config) {
        if (!this.registeredModules.has(moduleId)) {
            postConsoleAndNotification(`Coffee Pub Blacksmith | Error: Module ${moduleId} not found or not active`, "", true, true, false);
            return false;
        }

        const moduleInfo = this.registeredModules.get(moduleId);
        
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

        postConsoleAndNotification(`Coffee Pub Blacksmith | Registered module: ${moduleId}`, "", false, true, false);
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