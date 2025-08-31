// ================================================================== 
// ===== ASSET LOOKUP TOOL ==========================================
// ================================================================== 
// Purpose: Provide flexible access to assets using tags, types, and categories
// This tool will replace hardcoded constants with smart lookups

import { MODULE } from './const.js';
import { 
    dataTheme, 
    dataBackgroundImages, 
    dataIcons, 
    dataNameplate, 
    dataSounds,
    dataVolume,
    dataBanners,
    dataBackgrounds
} from './data-collections.js';

export class AssetLookup {
    
    constructor() {
        console.log(`${MODULE.TITLE} | AssetLookup: Constructor called`);
        
        this.dataCollections = {
            themes: dataTheme.themes,
            backgroundImages: dataBackgroundImages.images,
            icons: dataIcons.icons,
            nameplates: dataNameplate.names,
            sounds: dataSounds.sounds,
            volumes: dataVolume.volumes,
            banners: dataBanners.banners,
            backgrounds: dataBackgrounds.backgrounds
        };
        
        console.log(`${MODULE.TITLE} | AssetLookup: Data collections loaded:`, Object.keys(this.dataCollections));
        
        // Validate data collections
        Object.keys(this.dataCollections).forEach(key => {
            const collection = this.dataCollections[key];
            if (!collection) {
                console.warn(`${MODULE.TITLE} | AssetLookup: Collection ${key} is undefined`);
            } else if (!Array.isArray(collection)) {
                console.warn(`${MODULE.TITLE} | AssetLookup: Collection ${key} is not an array:`, typeof collection);
            } else {
                console.log(`${MODULE.TITLE} | AssetLookup: Collection ${key} has ${collection.length} items`);
            }
        });
        
        this.generatedConstants = {};
        this.generateConstants();
        
        console.log(`${MODULE.TITLE} | AssetLookup: Constructor completed`);
    }
    
    /**
     * Generate constants from data collections
     * This maintains backward compatibility
     */
    generateConstants() {
        try {
            console.log(`${MODULE.TITLE} | AssetLookup: Starting constants generation...`);
            
            // Generate constants for each collection
            Object.keys(this.dataCollections).forEach(collectionKey => {
                const collection = this.dataCollections[collectionKey];
                if (Array.isArray(collection)) {
                    console.log(`${MODULE.TITLE} | AssetLookup: Processing collection ${collectionKey} with ${collection.length} items`);
                    let constantsGenerated = 0;
                    collection.forEach(item => {
                        if (item.constantname) {
                            const value = item.path || item.id;
                            this.generatedConstants[item.constantname] = value;
                            constantsGenerated++;
                            if (constantsGenerated <= 3) { // Log first 3 constants from each collection
                                console.log(`${MODULE.TITLE} | AssetLookup: Generated ${item.constantname} = ${value}`);
                            }
                        }
                    });
                    console.log(`${MODULE.TITLE} | AssetLookup: Generated ${constantsGenerated} constants from ${collectionKey}`);
                } else {
                    console.warn(`${MODULE.TITLE} | AssetLookup: Collection ${collectionKey} is not an array, skipping`);
                }
            });
            
            // Expose constants globally for backward compatibility
            if (typeof window !== 'undefined') {
                console.log(`${MODULE.TITLE} | AssetLookup: Window available, exposing constants...`);
                
                Object.keys(this.generatedConstants).forEach(constantName => {
                    window[constantName] = this.generatedConstants[constantName];
                });
                
                // Merge with existing COFFEEPUB object for backward compatibility
                if (!window.COFFEEPUB) {
                    window.COFFEEPUB = {};
                }
                Object.keys(this.generatedConstants).forEach(constantName => {
                    window.COFFEEPUB[constantName] = this.generatedConstants[constantName];
                });

                // Also try a delayed merge in case COFFEEPUB gets recreated
                setTimeout(() => {
                    if (window.COFFEEPUB) {
                        console.log(`${MODULE.TITLE} | AssetLookup: Delayed merge - COFFEEPUB keys before:`, Object.keys(window.COFFEEPUB).length);
                        Object.keys(this.generatedConstants).forEach(constantName => {
                            window.COFFEEPUB[constantName] = this.generatedConstants[constantName];
                        });
                        console.log(`${MODULE.TITLE} | AssetLookup: Delayed merge - COFFEEPUB keys after:`, Object.keys(window.COFFEEPUB).length);
                        console.log(`${MODULE.TITLE} | AssetLookup: Delayed merge - Sample constants:`, {
                            BACKSKILLCHECK: window.COFFEEPUB.BACKSKILLCHECK,
                            SOUNDDICEROLL: window.COFFEEPUB.SOUNDDICEROLL
                        });
                    }
                }, 1000);
                
                console.log(`${MODULE.TITLE} | AssetLookup: Exposed ${Object.keys(this.generatedConstants).length} constants globally and via COFFEEPUB`);
                console.log(`${MODULE.TITLE} | AssetLookup: Sample constants:`, {
                    BACKSKILLCHECK: window.COFFEEPUB.BACKSKILLCHECK,
                    BACKABILITYCHECK: window.COFFEEPUB.BACKABILITYCHECK,
                    SOUNDDICEROLL: window.COFFEEPUB.SOUNDDICEROLL
                });
                
                // Verify COFFEEPUB is accessible and show what was merged
                console.log(`${MODULE.TITLE} | AssetLookup: COFFEEPUB object verification:`, {
                    exists: !!window.COFFEEPUB,
                    totalKeys: Object.keys(window.COFFEEPUB || {}).length,
                    newConstantsAdded: Object.keys(this.generatedConstants).length,
                    sampleValue: window.COFFEEPUB?.BACKSKILLCHECK,
                    oldProperties: Object.keys(window.COFFEEPUB || {}).filter(key => !this.generatedConstants[key]).slice(0, 5)
                });
            } else {
                console.warn(`${MODULE.TITLE} | AssetLookup: Window not available, cannot expose constants`);
            }
            
            console.log(`${MODULE.TITLE} | AssetLookup: Generated ${Object.keys(this.generatedConstants).length} constants`);
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error generating constants:`, error);
        }
    }
    
    /**
     * Get assets by type and tags
     * @param {string} type - Asset type (sound, image, theme, etc.)
     * @param {string} category - Asset category (interface, background, etc.)
     * @param {Array} tags - Array of tags to match
     * @returns {Array} Array of matching assets
     */
    getByTypeAndTags(type, category, tags = []) {
        try {
            const results = [];
            
            Object.keys(this.dataCollections).forEach(collectionKey => {
                const collection = this.dataCollections[collectionKey];
                if (Array.isArray(collection)) {
                    collection.forEach(item => {
                        if (item.type === type && item.category === category) {
                            // Check if all tags match
                            const hasAllTags = tags.every(tag => 
                                item.tags && item.tags.includes(tag)
                            );
                            
                            if (hasAllTags) {
                                results.push({
                                    ...item,
                                    collection: collectionKey
                                });
                            }
                        }
                    });
                }
            });
            
            return results;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error in getByTypeAndTags:`, error);
            return [];
        }
    }
    
    /**
     * Get assets by category
     * @param {string} category - Asset category
     * @returns {Array} Array of assets in category
     */
    getByCategory(category) {
        try {
            const results = [];
            
            Object.keys(this.dataCollections).forEach(collectionKey => {
                const collection = this.dataCollections[collectionKey];
                if (Array.isArray(collection)) {
                    collection.forEach(item => {
                        if (item.category === category) {
                            results.push({
                                ...item,
                                collection: collectionKey
                            });
                        }
                    });
                }
            });
            
            return results;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error in getByCategory:`, error);
            return [];
        }
    }
    
    /**
     * Get assets by type
     * @param {string} type - Asset type
     * @returns {Array} Array of assets of type
     */
    getByType(type) {
        try {
            const results = [];
            
            Object.keys(this.dataCollections).forEach(collectionKey => {
                const collection = this.dataCollections[collectionKey];
                if (Array.isArray(collection)) {
                    collection.forEach(item => {
                        if (item.type === type) {
                            results.push({
                                ...item,
                                collection: collectionKey
                            });
                        }
                    });
                }
            });
            
            return results;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error in getByType:`, error);
            return [];
        }
    }
    
    /**
     * Search assets by criteria
     * @param {Object} criteria - Search criteria
     * @param {string} criteria.name - Name contains
     * @param {Array} criteria.tags - Must have tags
     * @param {string} criteria.type - Asset type
     * @param {string} criteria.category - Asset category
     * @returns {Array} Array of matching assets
     */
    searchByCriteria(criteria = {}) {
        try {
            const results = [];
            
            Object.keys(this.dataCollections).forEach(collectionKey => {
                const collection = this.dataCollections[collectionKey];
                if (Array.isArray(collection)) {
                    collection.forEach(item => {
                        let matches = true;
                        
                        // Check name
                        if (criteria.name && !item.name.toLowerCase().includes(criteria.name.toLowerCase())) {
                            matches = false;
                        }
                        
                        // Check tags
                        if (criteria.tags && Array.isArray(criteria.tags)) {
                            const hasAllTags = criteria.tags.every(tag => 
                                item.tags && item.tags.includes(tag)
                            );
                            if (!hasAllTags) matches = false;
                        }
                        
                        // Check type
                        if (criteria.type && item.type !== criteria.type) {
                            matches = false;
                        }
                        
                        // Check category
                        if (criteria.category && item.category !== criteria.category) {
                            matches = false;
                        }
                        
                        if (matches) {
                            results.push({
                                ...item,
                                collection: collectionKey
                            });
                        }
                    });
                }
            });
            
            return results;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error in searchByCriteria:`, error);
            return [];
        }
    }
    
    /**
     * Get constant value by name
     * @param {string} constantname - Name of constant
     * @returns {string|null} Constant value or null if not found
     */
    getConstant(constantname) {
        return this.generatedConstants[constantname] || null;
    }
    
    /**
     * Get all generated constants
     * @returns {Object} Object with all constants
     */
    getAllConstants() {
        return { ...this.generatedConstants };
    }
    
    /**
     * Get choices for UI dropdowns
     * @param {string} type - Asset type
     * @param {string} category - Asset category
     * @returns {Object} Choices object for dropdowns
     */
    getChoices(type, category) {
        try {
            const assets = this.getByTypeAndTags(type, category);
            const choices = {};
            
            assets.forEach(asset => {
                choices[asset.id] = asset.name;
            });
            
            return choices;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error getting choices:`, error);
            return {};
        }
    }
    
    /**
     * Get random asset from category
     * @param {string} type - Asset type
     * @param {string} category - Asset category
     * @param {Array} tags - Optional tags to filter by
     * @returns {Object|null} Random asset or null
     */
    getRandom(type, category, tags = []) {
        try {
            const assets = tags.length > 0 
                ? this.getByTypeAndTags(type, category, tags)
                : this.getByTypeAndTags(type, category);
            
            if (assets.length === 0) return null;
            
            const randomIndex = Math.floor(Math.random() * assets.length);
            return assets[randomIndex];
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | AssetLookup: Error getting random asset:`, error);
            return null;
        }
    }

    /**
     * Check if constants are ready
     * @returns {boolean} True if constants are generated and exposed
     */
    areConstantsReady() {
        return typeof window !== 'undefined' && 
               window.COFFEEPUB && 
               Object.keys(this.generatedConstants).length > 0;
    }

    /**
     * Wait for constants to be ready
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} Promise that resolves when constants are ready
     */
    async waitForConstants(timeout = 5000) {
        const startTime = Date.now();
        
        while (!this.areConstantsReady() && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return this.areConstantsReady();
    }
}

// Create global instance
export const assetLookup = new AssetLookup();
