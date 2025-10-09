/**
 * Manager Compendiums - Unified Compendium Lookup System
 * 
 * This module provides a centralized system for searching and linking items, spells, features, and actors
 * across multiple compendiums based on user-configured settings. It consolidates the existing patterns
 * from common.js and journal-tools.js into a reusable system.
 * 
 * Features:
 * - Unified search across multiple compendiums
 * - Configurable search order via settings
 * - Support for world items/actors/features first/last
 * - Automatic UUID generation for found items
 * - Fallback handling for missing compendiums
 * - Debug logging for troubleshooting
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Compendium Manager Class
 * Handles all compendium lookups and provides a unified interface
 */
export class CompendiumManager {
    constructor() {
        // No initialization needed
    }

    /**
     * Get compendium settings for a specific type
     * @param {string} type - The type of compendium (item, spell, features, monster/actor)
     * @returns {Object} Object containing compendium settings
     */
    getCompendiumSettings(type) {
        const settings = {};
        
        // Map type to setting name format
        // Compendium settings use singular: itemCompendium1, spellCompendium1, featuresCompendium1, monsterCompendium1
        // Search world settings use plural: searchWorldItemsFirst, searchWorldSpellsFirst, searchWorldFeaturesFirst, searchWorldActorsFirst
        const typeMap = {
            'item': { compendium: 'item', searchWorld: 'Items' },
            'spell': { compendium: 'spell', searchWorld: 'Spells' },
            'feature': { compendium: 'features', searchWorld: 'Features' },
            'actor': { compendium: 'monster', searchWorld: 'Actors' }
        };
        
        const mappedType = typeMap[type];
        if (!mappedType) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Unknown type: ${type}`, "", false, false);
            return settings;
        }
        
        // Get compendium mappings (1-8 for each type)
        for (let i = 1; i <= 8; i++) {
            const settingKey = `${mappedType.compendium}Compendium${i}`;
            try {
                const compendiumName = game.settings.get(MODULE.ID, settingKey);
                if (compendiumName && compendiumName !== '') {
                    settings[`compendium${i}`] = compendiumName;
                }
            } catch (e) {
                // Setting doesn't exist, skip
            }
        }
        
        // Get search order settings
        try {
            settings.searchWorldFirst = game.settings.get(MODULE.ID, `searchWorld${mappedType.searchWorld}First`);
        } catch (e) {
            settings.searchWorldFirst = false;
        }
        
        try {
            settings.searchWorldLast = game.settings.get(MODULE.ID, `searchWorld${mappedType.searchWorld}Last`);
        } catch (e) {
            settings.searchWorldLast = false;
        }
        
        return settings;
    }

    /**
     * Search for an item across compendiums
     * @param {string} itemName - The name of the item to search for
     * @param {string} itemType - The type of item (weapon, armor, etc.)
     * @returns {Promise<string|null>} UUID of the found item or null
     */
    async searchItem(itemName, itemType = null) {
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Searching for item: ${itemName}`, `type: ${itemType}`, true, false);
        
        const settings = this.getCompendiumSettings('item');
        const searchOrder = this.getSearchOrder(settings, 'item');
        
        for (const source of searchOrder) {
            const result = await this.searchInSource(source, itemName, 'item', itemType);
            if (result) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Found item ${itemName}`, source, true, false);
                return result;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Item not found: ${itemName}`, "", true, false);
        return null;
    }

    /**
     * Search for a spell across compendiums
     * @param {string} spellName - The name of the spell to search for
     * @returns {Promise<string|null>} UUID of the found spell or null
     */
    async searchSpell(spellName) {
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Searching for spell: ${spellName}`, "", true, false);
        
        const settings = this.getCompendiumSettings('spell');
        const searchOrder = this.getSearchOrder(settings, 'spell');
        
        for (const source of searchOrder) {
            const result = await this.searchInSource(source, spellName, 'spell');
            if (result) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Found spell ${spellName}`, source, true, false);
                return result;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Spell not found: ${spellName}`, "", true, false);
        return null;
    }

    /**
     * Search for a feature across compendiums
     * @param {string} featureName - The name of the feature to search for
     * @returns {Promise<string|null>} UUID of the found feature or null
     */
    async searchFeature(featureName) {
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Searching for feature: ${featureName}`, "", true, false);
        
        const settings = this.getCompendiumSettings('feature');
        const searchOrder = this.getSearchOrder(settings, 'feature');
        
        for (const source of searchOrder) {
            const result = await this.searchInSource(source, featureName, 'feature');
            if (result) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Found feature ${featureName}`, source, true, false);
                return result;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Feature not found: ${featureName}`, "", true, false);
        return null;
    }

    /**
     * Search for an actor across compendiums
     * @param {string} actorName - The name of the actor to search for
     * @returns {Promise<string|null>} UUID of the found actor or null
     */
    async searchActor(actorName) {
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Searching for actor: ${actorName}`, "", true, false);
        
        const settings = this.getCompendiumSettings('actor');
        const searchOrder = this.getSearchOrder(settings, 'actor');
        
        for (const source of searchOrder) {
            const result = await this.searchInSource(source, actorName, 'actor');
            if (result) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Found actor ${actorName}`, source, true, false);
                return result;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Actor not found: ${actorName}`, "", true, false);
        return null;
    }

    /**
     * Get the search order based on settings
     * @param {Object} settings - The compendium settings
     * @param {string} type - The type of compendium
     * @returns {Array} Array of sources to search in order
     */
    getSearchOrder(settings, type) {
        const searchOrder = [];
        
        // Add world search if enabled
        if (settings.searchWorldFirst) {
            searchOrder.push('world');
        }
        
        // Add compendiums in order
        for (let i = 1; i <= 8; i++) {
            const compendiumKey = `compendium${i}`;
            if (settings[compendiumKey]) {
                searchOrder.push(settings[compendiumKey]);
            }
        }
        
        // Add world search if enabled for last
        if (settings.searchWorldLast) {
            searchOrder.push('world');
        }
        
        return searchOrder;
    }

    /**
     * Search in a specific source (world or compendium)
     * @param {string} source - The source to search in
     * @param {string} name - The name to search for
     * @param {string} type - The type of item to search for
     * @param {string} itemType - Optional item type for items
     * @returns {Promise<string|null>} UUID of the found item or null
     */
    async searchInSource(source, name, type, itemType = null) {
        try {
            if (source === 'world') {
                return await this.searchInWorld(name, type, itemType);
            } else {
                return await this.searchInCompendium(source, name, type, itemType);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error searching in ${source}`, error, false, false);
            return null;
        }
    }

    /**
     * Search in the world collection
     * @param {string} name - The name to search for
     * @param {string} type - The type of item to search for
     * @param {string} itemType - Optional item type for items
     * @returns {Promise<string|null>} UUID of the found item or null
     */
    async searchInWorld(name, type, itemType = null) {
        let collection;
        
        switch (type) {
            case 'item':
                collection = game.items;
                break;
            case 'spell':
                collection = game.items.filter(item => item.type === 'spell');
                break;
            case 'feature':
                collection = game.items.filter(item => item.type === 'feat');
                break;
            case 'actor':
                collection = game.actors;
                break;
            default:
                return null;
        }
        
        // Search for exact match first
        let found = collection.find(item => item.name.toLowerCase() === name.toLowerCase());
        
        // If not found and it's an item, search by type
        if (!found && type === 'item' && itemType) {
            found = collection.find(item => 
                item.name.toLowerCase() === name.toLowerCase() && 
                item.type === itemType
            );
        }
        
        // If still not found, try partial match
        if (!found) {
            found = collection.find(item => 
                item.name.toLowerCase().includes(name.toLowerCase())
            );
        }
        
        return found ? found.uuid : null;
    }

    /**
     * Search in a specific compendium
     * @param {string} compendiumName - The name of the compendium
     * @param {string} name - The name to search for
     * @param {string} type - The type of item to search for
     * @param {string} itemType - Optional item type for items
     * @returns {Promise<string|null>} UUID of the found item or null
     */
    async searchInCompendium(compendiumName, name, type, itemType = null) {
        try {
            const compendium = game.packs.get(compendiumName);
            if (!compendium) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Compendium not found: ${compendiumName}`, "", true, false);
                return null;
            }
            
            const index = await compendium.getIndex();
            
            // Search for exact match first
            let found = index.find(item => item.name.toLowerCase() === name.toLowerCase());
            
            // If not found and it's an item, search by type
            if (!found && type === 'item' && itemType) {
                found = index.find(item => 
                    item.name.toLowerCase() === name.toLowerCase() && 
                    item.type === itemType
                );
            }
            
            // If still not found, try partial match
            if (!found) {
                found = index.find(item => 
                    item.name.toLowerCase().includes(name.toLowerCase())
                );
            }
            
            if (found) {
                return `@Compendium[${compendiumName}.${found._id}]`;
            }
            
            return null;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error searching in compendium ${compendiumName}`, error, false, false);
            return null;
        }
    }

    /**
     * Process a list of items and return their UUIDs
     * @param {Array} items - Array of item names/objects
     * @param {string} type - The type of items (item, spell, feature)
     * @returns {Promise<Array>} Array of UUIDs for found items
     */
    async processItemList(items, type) {
        if (!Array.isArray(items) || items.length === 0) {
            return [];
        }
        
        const results = [];
        
        for (const item of items) {
            let itemName;
            let itemType = null;
            
            if (typeof item === 'string') {
                itemName = item;
            } else if (item.name) {
                itemName = item.name;
                itemType = item.type || null;
            } else {
                continue;
            }
            
            let uuid = null;
            
            switch (type) {
                case 'item':
                    uuid = await this.searchItem(itemName, itemType);
                    break;
                case 'spell':
                    uuid = await this.searchSpell(itemName);
                    break;
                case 'feature':
                    uuid = await this.searchFeature(itemName);
                    break;
            }
            
            if (uuid) {
                results.push(uuid);
            }
        }
        
        return results;
    }

    /**
     * Process character data and prepare for actor creation
     * @param {Object} characterData - The character data object
     * @returns {Promise<Object>} Updated character data without items (items will be added after creation)
     */
    async processCharacterData(characterData) {
        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing character data', 'items, spells, features', false, false);
        
        const processedData = { ...characterData };
        
        // Store the original item lists for later processing
        processedData._originalItems = characterData.items || [];
        processedData._originalSpells = characterData.spells || [];
        processedData._originalFeatures = characterData.features || [];
        processedData._originalCurrency = characterData.currency || [];
        
        // Remove items array for initial actor creation
        delete processedData.items;
        delete processedData.spells;
        delete processedData.features;
        delete processedData.currency;
        
        return processedData;
    }
    
    /**
     * Add items, spells, and features to an existing actor
     * @param {Actor} actor - The actor to add items to
     * @param {Object} characterData - The original character data with item lists
     * @returns {Promise<void>}
     */
    async addItemsToActor(actor, characterData) {
        if (!actor) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No actor provided for item addition', "", false, false);
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Adding items to actor', actor.name, false, false);
        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Original data check', {
            items: characterData._originalItems?.length || 0,
            spells: characterData._originalSpells?.length || 0,
            features: characterData._originalFeatures?.length || 0,
            currency: characterData._originalCurrency?.length || 0
        }, true, false);
        
        const allItems = [];
        
        // Process items
        if (characterData._originalItems && Array.isArray(characterData._originalItems)) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing items', characterData._originalItems, true, false);
            const items = await this.fetchItemDocuments(characterData._originalItems, 'item');
            allItems.push(...items);
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Items fetched', items.length, true, false);
        }
        
        // Process spells
        if (characterData._originalSpells && Array.isArray(characterData._originalSpells)) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing spells', characterData._originalSpells, true, false);
            const spells = await this.fetchItemDocuments(characterData._originalSpells, 'spell');
            allItems.push(...spells);
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Spells fetched', spells.length, true, false);
        }
        
        // Process features
        if (characterData._originalFeatures && Array.isArray(characterData._originalFeatures)) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing features', characterData._originalFeatures, true, false);
            const features = await this.fetchItemDocuments(characterData._originalFeatures, 'feature');
            allItems.push(...features);
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Features fetched', features.length, true, false);
        }
        
        // Process currency
        if (characterData._originalCurrency && Array.isArray(characterData._originalCurrency)) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Processing currency', characterData._originalCurrency, true, false);
            const currencyItems = await this.processCurrency(characterData._originalCurrency);
            allItems.push(...currencyItems);
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Currency processed', currencyItems.length, true, false);
        }
        
        postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | Total items to add', allItems.length, false, false);
        
        // Add all items to the actor
        if (allItems.length > 0) {
            try {
                await actor.createEmbeddedDocuments('Item', allItems);
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Added ${allItems.length} items to ${actor.name}`, "", false, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error adding items to ${actor.name}`, error, false, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Manager | No items to add', "", false, false);
        }
    }
    
    /**
     * Fetch actual item documents from UUIDs
     * @param {Array} itemNames - Array of item names
     * @param {string} type - The type of items
     * @returns {Promise<Array>} Array of item data objects
     */
    async fetchItemDocuments(itemNames, type) {
        if (!Array.isArray(itemNames) || itemNames.length === 0) {
            return [];
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | fetchItemDocuments called`, {type, count: itemNames.length}, true, false);
        
        const items = [];
        
        for (const itemName of itemNames) {
            let name = itemName;
            let itemType = null;
            
            if (typeof itemName === 'object') {
                name = itemName.name;
                itemType = itemName.type || null;
            }
            
            let uuid = null;
            
            switch (type) {
                case 'item':
                    uuid = await this.searchItem(name, itemType);
                    break;
                case 'spell':
                    uuid = await this.searchSpell(name);
                    break;
                case 'feature':
                    uuid = await this.searchFeature(name);
                    break;
            }
            
            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | UUID for ${name}`, uuid, true, false);
            
            if (uuid) {
                try {
                    // Extract compendium and ID from UUID format @Compendium[pack.id]
                    const match = uuid.match(/@Compendium\[([^\]]+)\]/);
                    if (match) {
                        const fullPath = match[1];
                        const lastDotIndex = fullPath.lastIndexOf('.');
                        const packName = fullPath.substring(0, lastDotIndex);
                        const itemId = fullPath.substring(lastDotIndex + 1);
                        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Parsed UUID`, {packName, itemId}, true, false);
                        
                        const pack = game.packs.get(packName);
                        if (pack) {
                            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Found pack`, packName, true, false);
                            const document = await pack.getDocument(itemId);
                            if (document) {
                                // Get the item data without the _id to allow Foundry to create new embedded items
                                const itemData = document.toObject();
                                delete itemData._id;
                                items.push(itemData);
                                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Fetched document: ${name}`, packName, true, false);
                            } else {
                                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Document not found`, {packName, itemId}, true, false);
                            }
                        } else {
                            postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Pack not found`, packName, true, false);
                        }
                    } else {
                        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | UUID format invalid`, uuid, true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Error fetching document: ${name}`, error, false, false);
                }
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | fetchItemDocuments returning`, items.length, true, false);
        return items;
    }
    
    /**
     * Process currency data into item objects
     * @param {Array} currencyData - Array of currency objects
     * @returns {Promise<Array>} Array of currency item data objects
     */
    async processCurrency(currencyData) {
        if (!Array.isArray(currencyData) || currencyData.length === 0) {
            return [];
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | processCurrency called`, {count: currencyData.length}, true, false);
        
        const currencyItems = [];
        
        for (const currency of currencyData) {
            if (currency && typeof currency === 'object' && currency.type && currency.value) {
                // Create a currency item object
                const currencyItem = {
                    name: `${currency.value} ${currency.type.toUpperCase()}`,
                    type: 'loot',
                    system: {
                        description: { value: `Currency: ${currency.value} ${currency.type.toUpperCase()}` },
                        quantity: currency.value,
                        weight: 0,
                        price: { value: currency.value, denomination: currency.type },
                        rarity: 'common'
                    },
                    flags: {
                        'coffee-pub-blacksmith': {
                            currencyType: currency.type,
                            currencyValue: currency.value
                        }
                    }
                };
                
                currencyItems.push(currencyItem);
                postConsoleAndNotification(MODULE.NAME, `Compendium Manager | Created currency item`, `${currency.value} ${currency.type}`, true, false);
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Compendium Manager | processCurrency returning`, currencyItems.length, true, false);
        return currencyItems;
    }
}

// Create a singleton instance
export const compendiumManager = new CompendiumManager();

// Export the class for custom instances if needed
export default CompendiumManager;
