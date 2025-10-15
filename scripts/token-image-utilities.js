// ================================================================== 
// ===== TOKEN IMAGE UTILITIES ======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { ImageCacheManager } from './manager-image-cache.js';

/**
 * Token Image Utilities
 * Handles dead token functionality and other token enhancements
 */
export class TokenImageUtilities {
    
    /**
     * Store the original image for a token before any updates
     */
    static async storeOriginalImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        
        const originalImage = {
            path: tokenDocument.texture.src,
            name: tokenDocument.texture.src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'originalImage', originalImage);
    }

    /**
     * Get the original image for a token
     */
    static getOriginalImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'originalImage') || null;
    }

    /**
     * Store the previous image for a token before applying dead token
     * This allows restoration to the replaced image (not original) when revived
     */
    static async storePreviousImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        
        const previousImage = {
            path: tokenDocument.texture.src,
            name: tokenDocument.texture.src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'previousImage', previousImage);
    }

    /**
     * Get the previous image for a token (image before dead token was applied)
     */
    static getPreviousImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'previousImage') || null;
    }

    /**
     * Restore the previous token image (used when token is revived)
     */
    static async restorePreviousTokenImage(tokenDocument) {
        if (!tokenDocument) {
            return;
        }
        
        const previousImage = TokenImageUtilities.getPreviousImage(tokenDocument);
        if (previousImage) {
            try {
                await tokenDocument.update({ 'texture.src': previousImage.path });
                await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Restored previous image for ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error restoring previous image: ${error.message}`, "", true, false);
            }
        }
    }

    /**
     * Get the dead token image path (single image for all dead tokens)
     */
    static getDeadTokenImagePath() {
        const deadTokenPath = getSettingSafely(MODULE.ID, 'deadTokenImagePath', 'assets/images/tokens/dead_token.png');
        
        // Check if the file exists in our cache (only if cache is available)
        if (ImageCacheManager.cache && ImageCacheManager.cache.files) {
            const fileName = deadTokenPath.split('/').pop();
            const cachedFile = ImageCacheManager.cache.files.get(fileName.toLowerCase());
            
            if (cachedFile) {
                return cachedFile.fullPath;
            }
        }
        
        // If not in cache or cache not available, return the path as-is (might be a custom path)
        return deadTokenPath;
    }

    /**
     * Apply dead token image to a token
     */
    static async applyDeadTokenImage(tokenDocument, actor) {
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false)) {
            return;
        }
        
        // Check if dead token is already applied
        if (tokenDocument.getFlag(MODULE.ID, 'isDeadTokenApplied')) {
            return;
        }
        
        // Check creature type filter
        const creatureType = actor?.system?.details?.type?.value?.toLowerCase() || '';
        const allowedTypes = getSettingSafely(MODULE.ID, 'deadTokenCreatureTypeFilter', '');
        
        if (allowedTypes && allowedTypes.trim() !== '') {
            const types = allowedTypes.split(',').map(t => t.trim().toLowerCase());
            if (!types.includes(creatureType)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping dead token for ${tokenDocument.name} - creature type ${creatureType} not in filter`, "", true, false);
                return;
            }
        }
        
        // Store current image as "previous" before applying dead token
        await TokenImageUtilities.storePreviousImage(tokenDocument);
        
        // Get the dead token image path
        const deadTokenPath = TokenImageUtilities.getDeadTokenImagePath();
        
        if (deadTokenPath) {
            try {
                await tokenDocument.update({ 'texture.src': deadTokenPath });
                await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', true);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied dead token to ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying dead token: ${error.message}`, "", true, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Dead token image path not configured for ${tokenDocument.name}`, "", true, false);
        }
    }

    /**
     * Hook for actor updates - monitor HP changes for dead token replacement
     */
    static async onActorUpdateForDeadToken(actor, changes, options, userId) {
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - onActorUpdateForDeadToken called for ${actor.name}`, "", true, false);
        
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG - Dead token replacement disabled", "", true, false);
            return;
        }
        
        // Only GMs can update tokens
        if (!game.user.isGM) {
            return;
        }
        
        // Check if HP changed
        if (!changes.system?.attributes?.hp) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG - No HP change detected", "", true, false);
            return;
        }
        
        // Get current HP
        const currentHP = actor.system.attributes.hp.value;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - HP changed to ${currentHP}`, "", true, false);
        
        // Find all tokens for this actor on current scene
        if (!canvas.scene) {
            return;
        }
        
        const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
        
        for (const token of tokens) {
            if (currentHP <= 0) {
                // Token died - apply dead image
                await TokenImageUtilities.applyDeadTokenImage(token.document, actor);
            } else if (token.document.getFlag(MODULE.ID, 'isDeadTokenApplied')) {
                // Token was revived - restore previous image
                await TokenImageUtilities.restorePreviousTokenImage(token.document);
            }
        }
    }
}
