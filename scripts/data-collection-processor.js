// ================================================================== 
// ===== DATA COLLECTION PROCESSOR ==================================
// ================================================================== 
// Purpose: Centralized processing of data collections for generating UI choices and constants
// This class replaces the repetitive processing logic in settings.js

import { MODULE } from './const.js';

export class DataCollectionProcessor {
    
    /**
     * Process any data collection automatically to generate choices for UI dropdowns
     * @param {Object} dataCollection - The data collection object (e.g., dataTheme, dataBackgroundImages)
     * @param {Object} options - Processing options
     * @param {string} options.collectionKey - Key for the collection array (e.g., 'themes', 'images')
     * @param {string} options.idKey - Property to use as the key (default: 'id')
     * @param {string} options.nameKey - Property to use as the display name (default: 'name')
     * @param {string} options.sortBy - Property to sort by (default: 'name')
     * @param {Array} options.priorityItems - Items to move to front (default: [])
     * @param {boolean} options.filterEnabled - Whether to filter by enabled status (default: false)
     * @param {string} options.settingKey - Setting key for filtering (default: null)
     * @param {string} options.blacksmithKey - Key to update in BLACKSMITH object (default: null)
     * @returns {Object} Choices object for UI dropdowns
     */
    static processCollection(dataCollection, options = {}) {
        const {
            collectionKey,
            idKey = 'id',
            nameKey = 'name',
            sortBy = 'name',
            priorityItems = [],
            filterEnabled = false,
            settingKey = null,
            blacksmithKey = null
        } = options;

        if (!dataCollection || !dataCollection[collectionKey]) {
            console.warn(`${MODULE.TITLE} | DataCollectionProcessor: Invalid data collection or missing collection key: ${collectionKey}`);
            return {};
        }

        try {
            // Get the collection array
            let items = [...dataCollection[collectionKey]];

            // Filter by enabled status if requested
            if (filterEnabled && settingKey) {
                items = this.filterByEnabledStatus(items, settingKey);
            }

            // Sort items
            items = this.sortItems(items, sortBy, priorityItems);

            // Build choices object
            const choices = this.buildChoices(items, idKey, nameKey);

            // Update BLACKSMITH object if requested
            if (blacksmithKey && window.BlacksmithConstants) {
                this.updateBlacksmithConstants(blacksmithKey, choices);
            }

            return choices;

        } catch (error) {
            console.error(`${MODULE.TITLE} | DataCollectionProcessor: Error processing collection:`, error);
            return {};
        }
    }

    /**
     * Filter items by enabled status using a setting
     * @param {Array} items - Array of items to filter
     * @param {string} settingKey - Setting key to check for enabled status
     * @returns {Array} Filtered items
     */
    static filterByEnabledStatus(items, settingKey) {
        try {
            const enabledItems = game.settings.get(MODULE.ID, settingKey) || [];
            return items.filter(item => enabledItems.includes(item.id));
        } catch (error) {
            console.warn(`${MODULE.TITLE} | DataCollectionProcessor: Could not filter by enabled status:`, error);
            return items;
        }
    }

    /**
     * Sort items with priority items moved to front
     * @param {Array} items - Array of items to sort
     * @param {string} sortBy - Property to sort by
     * @param {Array} priorityItems - Items to move to front
     * @returns {Array} Sorted items
     */
    static sortItems(items, sortBy, priorityItems) {
        try {
            // Move priority items to front
            const priority = items.filter(item => priorityItems.includes(item[sortBy]));
            const regular = items.filter(item => !priorityItems.includes(item[sortBy]));

            // Sort regular items
            regular.sort((a, b) => {
                const aVal = a[sortBy] || '';
                const bVal = b[sortBy] || '';
                return aVal.localeCompare(bVal);
            });

            return [...priority, ...regular];
        } catch (error) {
            console.warn(`${MODULE.TITLE} | DataCollectionProcessor: Could not sort items:`, error);
            return items;
        }
    }

    /**
     * Build choices object for UI dropdowns
     * @param {Array} items - Array of items to process
     * @param {string} idKey - Property to use as the key
     * @param {string} nameKey - Property to use as the display name
     * @returns {Object} Choices object { id: name, ... }
     */
    static buildChoices(items, idKey, nameKey) {
        const choices = {};
        
        items.forEach(item => {
            const id = item[idKey];
            const name = item[nameKey];
            
            if (id && name) {
                choices[id] = name;
            }
        });

        return choices;
    }

    /**
     * Update BLACKSMITH constants object
     * @param {string} key - Key to update
     * @param {*} value - Value to set
     */
    static updateBlacksmithConstants(key, value) {
        try {
            if (window.BlacksmithConstants && typeof window.BlacksmithConstants.updateValue === 'function') {
                window.BlacksmithConstants.updateValue(key, value);
            }
        } catch (error) {
            console.warn(`${MODULE.TITLE} | DataCollectionProcessor: Could not update BLACKSMITH constants:`, error);
        }
    }

    /**
     * Generate constants object from data collections
     * @param {Object} dataCollections - Object containing all data collections
     * @returns {Object} Generated constants object
     */
    static generateConstants(dataCollections) {
        const constants = {};

        try {
            // Process each data collection
            Object.entries(dataCollections).forEach(([collectionName, collection]) => {
                if (collection && typeof collection === 'object') {
                    // Look for items with constantname property
                    const items = collection.themes || collection.images || collection.sounds || collection.icons || collection.names || [];
                    
                    items.forEach(item => {
                        if (item.constantname && item.id) {
                            constants[item.constantname] = item.id;
                        }
                    });
                }
            });

            return constants;

        } catch (error) {
            console.error(`${MODULE.TITLE} | DataCollectionProcessor: Error generating constants:`, error);
            return {};
        }
    }

    /**
     * Get all available constant names from data collections
     * @param {Object} dataCollections - Object containing all data collections
     * @returns {Array} Array of constant names
     */
    static getconstantnames(dataCollections) {
        const constantnames = [];

        try {
            Object.entries(dataCollections).forEach(([collectionName, collection]) => {
                if (collection && typeof collection === 'object') {
                    const items = collection.themes || collection.images || collection.sounds || collection.icons || collection.names || [];
                    
                    items.forEach(item => {
                        if (item.constantname) {
                            constantnames.push(item.constantname);
                        }
                    });
                }
            });

            return constantnames.sort();

        } catch (error) {
            console.error(`${MODULE.TITLE} | DataCollectionProcessor: Error getting constant names:`, error);
            return [];
        }
    }
}
