// ================================================================== 
// ===== CONSTANTS GENERATOR ========================================
// ================================================================== 
// Purpose: Generate constants from data collections using DataCollectionProcessor
// This module will eventually replace the manual COFFEEPUB constants

import { MODULE } from './const.js';
import { DataCollectionProcessor } from './manager-data-collection.js';
import { assetLookup } from './asset-lookup.js';

/** Same shape as bundled asset modules; driven by AssetLookup (JSON / sync-generated baseline + overrides). */
function getBundlesFromLookup() {
    const a = assetLookup;
    if (!a) {
        return {
            dataBackgroundImages: { images: [] },
            dataIcons: { icons: [] },
            dataNameplate: { names: [] },
            dataSounds: { sounds: [] },
            dataVolume: { volumes: [] },
            dataBanners: { banners: [] }
        };
    }
    return {
        dataBackgroundImages: { images: a.dataCollections.backgroundImages },
        dataIcons: { icons: a.dataCollections.icons },
        dataNameplate: { names: a.dataCollections.nameplates },
        dataSounds: { sounds: a.dataCollections.sounds },
        dataVolume: { volumes: a.dataCollections.volumes },
        dataBanners: { banners: a.dataCollections.banners }
    };
}

export class ConstantsGenerator {
    
    /**
     * Generate all constants from data collections
     * @returns {Object} Generated constants object
     */
    static generateAllConstants() {
        try {
            const constants = {};
            
            constants.themes = {};
            
            // Generate background image constants
            constants.backgroundImages = this.generateBackgroundImageConstants();
            
            // Generate icon constants
            constants.icons = this.generateIconConstants();
            
            // Generate nameplate constants
            constants.nameplates = this.generateNameplateConstants();
            
            // Generate sound constants
            constants.sounds = this.generateSoundConstants();
            
            // Generate volume constants
            constants.volumes = this.generateVolumeConstants();
            
            // Generate banner constants
            constants.banners = this.generateBannerConstants();
            
            return constants;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | ConstantsGenerator: Error generating constants:`, error);
            return {};
        }
    }

    /**
     * Generate background image constants
     * @returns {Object} Background image constants
     */
    static generateBackgroundImageConstants() {
        const backgroundConstants = {};
        
        try {
            const { dataBackgroundImages } = getBundlesFromLookup();
            dataBackgroundImages.images.forEach(image => {
                if (image.constantname && image.value) {
                    backgroundConstants[image.constantname] = image.value;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating background image constants:`, error);
        }
        
        return backgroundConstants;
    }

    /**
     * Generate icon constants
     * @returns {Object} Icon constants
     */
    static generateIconConstants() {
        const iconConstants = {};
        
        try {
            const { dataIcons } = getBundlesFromLookup();
            dataIcons.icons.forEach(icon => {
                if (icon.constantname && icon.value) {
                    iconConstants[icon.constantname] = icon.value;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating icon constants:`, error);
        }
        
        return iconConstants;
    }

    /**
     * Generate nameplate constants
     * @returns {Object} Nameplate constants
     */
    static generateNameplateConstants() {
        const nameplateConstants = {};
        
        try {
            const { dataNameplate } = getBundlesFromLookup();
            dataNameplate.names.forEach(nameplate => {
                if (nameplate.constantname && nameplate.id) {
                    nameplateConstants[nameplate.constantname] = nameplate.id;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating nameplate constants:`, error);
        }
        
        return nameplateConstants;
    }

    /**
     * Generate sound constants
     * @returns {Object} Sound constants
     */
    static generateSoundConstants() {
        const soundConstants = {};
        
        try {
            const { dataSounds } = getBundlesFromLookup();
            dataSounds.sounds.forEach(sound => {
                if (sound.constantname && sound.path) {
                    soundConstants[sound.constantname] = sound.path;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating sound constants:`, error);
        }
        
        return soundConstants;
    }

    /**
     * Generate volume constants
     * @returns {Object} Volume constants
     */
    static generateVolumeConstants() {
        const volumeConstants = {};
        
        try {
            const { dataVolume } = getBundlesFromLookup();
            dataVolume.volumes.forEach(volume => {
                if (volume.constantname && volume.value) {
                    volumeConstants[volume.constantname] = volume.value;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating volume constants:`, error);
        }
        
        return volumeConstants;
    }

    /**
     * Generate banner constants
     * @returns {Object} Banner constants
     */
    static generateBannerConstants() {
        const bannerConstants = {};
        
        try {
            const { dataBanners } = getBundlesFromLookup();
            dataBanners.banners.forEach(banner => {
                if (banner.constantname && banner.path) {
                    bannerConstants[banner.constantname] = banner.path;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating banner constants:`, error);
        }
        
        return bannerConstants;
    }

    /**
     * Generate choices for UI dropdowns using DataCollectionProcessor
     * @returns {Object} All choices for settings
     */
    static generateAllChoices() {
        try {
            const choices = {};
            const {
                dataBackgroundImages,
                dataIcons,
                dataNameplate,
                dataSounds,
                dataVolume,
                dataBanners
            } = getBundlesFromLookup();
            
            choices.themes = {};
            
            // Generate background image choices
            choices.backgroundImages = DataCollectionProcessor.processCollection(dataBackgroundImages, {
                collectionKey: 'images',
                priorityItems: ['themecolor'],
                blacksmithKey: 'arrBackgroundImageChoices'
            });
            
            // Generate icon choices
            choices.icons = DataCollectionProcessor.processCollection(dataIcons, {
                collectionKey: 'icons',
                blacksmithKey: 'arrIconChoices'
            });
            
            // Generate nameplate choices
            choices.nameplates = DataCollectionProcessor.processCollection(dataNameplate, {
                collectionKey: 'names',
                blacksmithKey: 'arrNameplateChoices'
            });
            
            // Generate sound choices
            choices.sounds = DataCollectionProcessor.processCollection(dataSounds, {
                collectionKey: 'sounds',
                idKey: 'value',
                blacksmithKey: 'arrSoundChoices'
            });
            
            // Generate volume choices
            choices.volumes = DataCollectionProcessor.processCollection(dataVolume, {
                collectionKey: 'volumes',
                blacksmithKey: 'arrVolumeChoices'
            });
            
            // Generate banner choices
            choices.banners = DataCollectionProcessor.processCollection(dataBanners, {
                collectionKey: 'banners',
                blacksmithKey: 'arrBannerChoices'
            });
            
            return choices;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | ConstantsGenerator: Error generating choices:`, error);
            return {};
        }
    }

    /**
     * Get all available constant names
     * @returns {Array} Array of constant names
     */
    static getAllconstantnames() {
        try {
            const dataCollections = getBundlesFromLookup();
            
            return DataCollectionProcessor.getconstantnames(dataCollections);
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | ConstantsGenerator: Error getting constant names:`, error);
            return [];
        }
    }

    /**
     * Validate that all constants are properly generated
     * @returns {Object} Validation results
     */
    static validateConstants() {
        try {
            const constants = this.generateAllConstants();
            const constantnames = this.getAllconstantnames();
            
            const validation = {
                success: true,
                totalConstants: constantnames.length,
                missingConstants: [],
                errors: []
            };
            
            // Check that all constant names have values
            constantnames.forEach(constantname => {
                if (!constants.themes[constantname] && 
                    !constants.backgroundImages[constantname] && 
                    !constants.icons[constantname] && 
                    !constants.nameplates[constantname] && 
                    !constants.sounds[constantname] && 
                    !constants.volumes[constantname] &&
                    !constants.banners[constantname]) {
                    validation.missingConstants.push(constantname);
                    validation.success = false;
                }
            });
            
            return validation;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | ConstantsGenerator: Error validating constants:`, error);
            return {
                success: false,
                totalConstants: 0,
                missingConstants: [],
                errors: [error.message]
            };
        }
    }
}
