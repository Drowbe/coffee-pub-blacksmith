// ================================================================== 
// ===== CONSTANTS GENERATOR ========================================
// ================================================================== 
// Purpose: Generate constants from data collections using DataCollectionProcessor
// This module will eventually replace the manual COFFEEPUB constants

import { MODULE } from './const.js';
import { DataCollectionProcessor } from './data-collection-processor.js';
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

export class ConstantsGenerator {
    
    /**
     * Generate all constants from data collections
     * @returns {Object} Generated constants object
     */
    static generateAllConstants() {
        try {
            const constants = {};
            
            // Generate theme constants
            constants.themes = this.generateThemeConstants();
            
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
            
            // Generate background constants
            constants.backgrounds = this.generateBackgroundConstants();
            
            return constants;
            
        } catch (error) {
            console.error(`${MODULE.TITLE} | ConstantsGenerator: Error generating constants:`, error);
            return {};
        }
    }

    /**
     * Generate theme constants
     * @returns {Object} Theme constants
     */
    static generateThemeConstants() {
        const themeConstants = {};
        
        try {
            dataTheme.themes.forEach(theme => {
                if (theme.constantname && theme.id) {
                    themeConstants[theme.constantname] = theme.id;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating theme constants:`, error);
        }
        
        return themeConstants;
    }

    /**
     * Generate background image constants
     * @returns {Object} Background image constants
     */
    static generateBackgroundImageConstants() {
        const backgroundConstants = {};
        
        try {
            dataBackgroundImages.images.forEach(image => {
                if (image.constantname && image.id) {
                    backgroundConstants[image.constantname] = image.id;
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
            dataIcons.icons.forEach(icon => {
                if (icon.constantname && icon.id) {
                    iconConstants[icon.constantname] = icon.id;
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
            dataVolume.volumes.forEach(volume => {
                if (volume.constantname && volume.path) {
                    volumeConstants[volume.constantname] = volume.path;
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
     * Generate background constants
     * @returns {Object} Background constants
     */
    static generateBackgroundConstants() {
        const backgroundConstants = {};
        
        try {
            dataBackgrounds.backgrounds.forEach(background => {
                if (background.constantname && background.path) {
                    backgroundConstants[background.constantname] = background.path;
                }
            });
        } catch (error) {
            console.warn(`${MODULE.TITLE} | ConstantsGenerator: Error generating background constants:`, error);
        }
        
        return backgroundConstants;
    }

    /**
     * Generate choices for UI dropdowns using DataCollectionProcessor
     * @returns {Object} All choices for settings
     */
    static generateAllChoices() {
        try {
            const choices = {};
            
            // Generate theme choices
            choices.themes = DataCollectionProcessor.processCollection(dataTheme, {
                collectionKey: 'themes',
                blacksmithKey: 'arrThemeChoices'
            });
            
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
            const dataCollections = {
                dataTheme,
                dataBackgroundImages,
                dataIcons,
                dataNameplate,
                dataSounds,
                dataVolume,
                dataBanners,
                dataBackgrounds
            };
            
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
                    !constants.banners[constantname] &&
                    !constants.backgrounds[constantname]) {
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
