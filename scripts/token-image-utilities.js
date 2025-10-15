// ================================================================== 
// ===== TOKEN IMAGE UTILITIES ======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { HookManager } from './manager-hooks.js';

/**
 * Token Image Utilities
 * Handles dead token functionality and other token enhancements
 */
export class TokenImageUtilities {
    
    // Turn indicator management
    static _turnIndicator = null;
    static _currentTurnTokenId = null;
    static _pulseAnimation = null;
    static _isMoving = false;
    static _fadeAnimation = null;
    static _movementTimeout = null;
    
    // Hook IDs for cleanup
    static _updateCombatHookId = null;
    static _deleteCombatHookId = null;
    static _updateTokenHookId = null;
    
    /**
     * Get the current turn indicator settings from module config
     */
    static _getTurnIndicatorSettings() {
        // Get color as hex string and convert to PIXI color integer
        const colorHex = getSettingSafely(MODULE.ID, 'turnIndicatorColor', '#00ff00');
        const color = parseInt(colorHex.replace('#', '0x'));
        
        return {
            color: color,
            thickness: getSettingSafely(MODULE.ID, 'turnIndicatorThickness', 3),
            offset: getSettingSafely(MODULE.ID, 'turnIndicatorOffset', 8),
            pulseSpeed: getSettingSafely(MODULE.ID, 'turnIndicatorPulseSpeed', 0.05),
            pulseMin: getSettingSafely(MODULE.ID, 'turnIndicatorPulseMin', 0.3),
            pulseMax: getSettingSafely(MODULE.ID, 'turnIndicatorPulseMax', 0.8)
        };
    }
    
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

    // ================================================================== 
    // ===== TURN INDICATOR FUNCTIONALITY ===============================
    // ================================================================== 

    /**
     * Initialize turn indicator system
     */
    static initializeTurnIndicator() {
        // Check if turn indicator is enabled
        if (!getSettingSafely(MODULE.ID, 'turnIndicatorEnabled', true)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Turn indicator disabled in settings", "", true, false);
            return;
        }
        
        // Register combat update hook
        TokenImageUtilities._updateCombatHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Token Image Utilities: Monitor combat updates for turn indicator',
            context: 'token-utilities-turn-indicator',
            priority: 3,
            callback: TokenImageUtilities._onCombatUpdate
        });
        
        TokenImageUtilities._deleteCombatHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'Token Image Utilities: Clean up turn indicator on combat deletion',
            context: 'token-utilities-turn-indicator',
            priority: 3,
            callback: TokenImageUtilities._onCombatDelete
        });
        
        // Register token update hook for position tracking
        TokenImageUtilities._updateTokenHookId = HookManager.registerHook({
            name: 'updateToken',
            description: 'Token Image Utilities: Track token position for turn indicator',
            context: 'token-utilities-turn-indicator',
            priority: 3,
            callback: TokenImageUtilities._onTokenUpdate
        });
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Turn indicator hooks registered", "", true, false);
        
        // Check if combat is already active
        if (game.combat && game.combat.started) {
            TokenImageUtilities._updateTurnIndicator();
        }
    }

    /**
     * Clean up turn indicator system
     */
    static cleanupTurnIndicator() {
        TokenImageUtilities._removeTurnIndicator();
        
        // Unregister hooks using HookManager
        if (TokenImageUtilities._updateCombatHookId) {
            HookManager.unregisterHook('updateCombat', TokenImageUtilities._updateCombatHookId);
            TokenImageUtilities._updateCombatHookId = null;
        }
        
        if (TokenImageUtilities._deleteCombatHookId) {
            HookManager.unregisterHook('deleteCombat', TokenImageUtilities._deleteCombatHookId);
            TokenImageUtilities._deleteCombatHookId = null;
        }
        
        if (TokenImageUtilities._updateTokenHookId) {
            HookManager.unregisterHook('updateToken', TokenImageUtilities._updateTokenHookId);
            TokenImageUtilities._updateTokenHookId = null;
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Turn indicator hooks unregistered", "", true, false);
    }

    /**
     * Handle combat updates
     */
    static _onCombatUpdate(combat, changes, options, userId) {
        if (changes.turn !== undefined || changes.round !== undefined) {
            TokenImageUtilities._updateTurnIndicator();
        }
    }

    /**
     * Handle combat deletion
     */
    static _onCombatDelete(combat, options, userId) {
        TokenImageUtilities._removeTurnIndicator();
    }

    /**
     * Handle token updates (position changes)
     */
    static _onTokenUpdate(tokenDocument, changes, options, userId) {
        // Only care about position changes for the current turn token
        if (!TokenImageUtilities._currentTurnTokenId || tokenDocument.id !== TokenImageUtilities._currentTurnTokenId) {
            return;
        }
        
        // If position changed, update the indicator
        if (changes.x !== undefined || changes.y !== undefined) {
            const token = canvas.tokens.get(tokenDocument.id);
            if (token) {
                // Start fade out if not already moving
                if (!TokenImageUtilities._isMoving) {
                    TokenImageUtilities._startMovementFade();
                }
                
                // Pass the changes so we can use the NEW position values
                TokenImageUtilities._updateTurnIndicatorPosition(token, changes);
                
                // Fade back in after movement completes
                TokenImageUtilities._scheduleMovementComplete();
            }
        }
    }

    /**
     * Update turn indicator based on current combat state
     */
    static _updateTurnIndicator() {
        // Remove existing indicator
        TokenImageUtilities._removeTurnIndicator();

        // Check if combat is active
        if (!game.combat || !game.combat.started) {
            return;
        }

        // Get current combatant's token document
        const combatant = game.combat.combatant;
        if (!combatant || !combatant.token) {
            return;
        }

        // Get the actual token object on the canvas
        const tokenObject = canvas.tokens.get(combatant.token.id);
        if (!tokenObject) {
            return;
        }

        // Create new indicator
        TokenImageUtilities._createTurnIndicator(tokenObject);
    }

    /**
     * Create turn indicator for a token
     */
    static _createTurnIndicator(token) {
        if (!token || !token.visible) {
            return;
        }

        // Get the current settings
        const settings = TokenImageUtilities._getTurnIndicatorSettings();

        // Get token dimensions
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        const tokenRadius = Math.max(tokenWidth, tokenHeight) / 2;
        const ringRadius = tokenRadius + settings.offset;

        // Create PIXI Graphics object for the ring
        const graphics = new PIXI.Graphics();
        
        // Draw the ring using settings
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
        
        // Position at token center
        const tokenCenterX = token.x + tokenWidth / 2;
        const tokenCenterY = token.y + tokenHeight / 2;
        graphics.position.set(tokenCenterX, tokenCenterY);
        
        // Add to canvas
        canvas.interface.addChild(graphics);
        TokenImageUtilities._turnIndicator = graphics;
        TokenImageUtilities._currentTurnTokenId = token.id;
        
        // Create pulse animation using PIXI ticker with settings
        TokenImageUtilities._pulseAnimation = {
            time: 0,
            update: (delta) => {
                if (!TokenImageUtilities._turnIndicator) return;
                TokenImageUtilities._pulseAnimation.time += delta * settings.pulseSpeed;
                const pulseRange = (settings.pulseMax - settings.pulseMin) / 2;
                const pulseMid = settings.pulseMin + pulseRange;
                const opacity = pulseMid + Math.sin(TokenImageUtilities._pulseAnimation.time) * pulseRange;
                TokenImageUtilities._turnIndicator.alpha = opacity;
            }
        };
        
        canvas.app.ticker.add(TokenImageUtilities._pulseAnimation.update);

        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Turn indicator added for ${token.name}`, "", true, false);
    }

    /**
     * Remove turn indicator
     */
    static _removeTurnIndicator() {
        if (TokenImageUtilities._turnIndicator) {
            // Remove animation ticker
            if (TokenImageUtilities._pulseAnimation) {
                canvas.app.ticker.remove(TokenImageUtilities._pulseAnimation.update);
                TokenImageUtilities._pulseAnimation = null;
            }
            
            // Remove fade animation ticker
            if (TokenImageUtilities._fadeAnimation) {
                canvas.app.ticker.remove(TokenImageUtilities._fadeAnimation);
                TokenImageUtilities._fadeAnimation = null;
            }
            
            // Clear movement timeout
            if (TokenImageUtilities._movementTimeout) {
                clearTimeout(TokenImageUtilities._movementTimeout);
                TokenImageUtilities._movementTimeout = null;
            }
            
            // Remove graphics from canvas
            canvas.interface.removeChild(TokenImageUtilities._turnIndicator);
            TokenImageUtilities._turnIndicator.destroy();
            TokenImageUtilities._turnIndicator = null;
            TokenImageUtilities._currentTurnTokenId = null;
            TokenImageUtilities._isMoving = false;
        }
    }

    /**
     * Update turn indicator position (for token movement)
     */
    static _updateTurnIndicatorPosition(token, changes = null) {
        if (!TokenImageUtilities._turnIndicator || TokenImageUtilities._currentTurnTokenId !== token.id) {
            return;
        }

        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        
        // Use the NEW position from changes if available, otherwise use current token position
        const tokenX = changes?.x !== undefined ? changes.x : token.x;
        const tokenY = changes?.y !== undefined ? changes.y : token.y;
        
        const tokenCenterX = tokenX + tokenWidth / 2;
        const tokenCenterY = tokenY + tokenHeight / 2;
        
        // Update PIXI graphics position
        TokenImageUtilities._turnIndicator.x = tokenCenterX;
        TokenImageUtilities._turnIndicator.y = tokenCenterY;
    }

    /**
     * Start fade out animation when movement begins
     */
    static _startMovementFade() {
        if (!TokenImageUtilities._turnIndicator) return;
        
        TokenImageUtilities._isMoving = true;
        
        // Remove existing fade animation if any
        if (TokenImageUtilities._fadeAnimation) {
            canvas.app.ticker.remove(TokenImageUtilities._fadeAnimation);
        }
        
        // Create fade out animation
        const startAlpha = TokenImageUtilities._turnIndicator.alpha;
        const targetAlpha = 0.1;
        const duration = 150; // ms
        let elapsed = 0;
        
        TokenImageUtilities._fadeAnimation = (delta) => {
            if (!TokenImageUtilities._turnIndicator) return;
            
            elapsed += delta * 16.67; // Approximate ms per frame (60fps)
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out
            const eased = 1 - Math.pow(1 - progress, 2);
            TokenImageUtilities._turnIndicator.alpha = startAlpha + (targetAlpha - startAlpha) * eased;
            
            // Stop animation when complete
            if (progress >= 1) {
                canvas.app.ticker.remove(TokenImageUtilities._fadeAnimation);
                TokenImageUtilities._fadeAnimation = null;
            }
        };
        
        canvas.app.ticker.add(TokenImageUtilities._fadeAnimation);
    }

    /**
     * Schedule fade in animation after movement completes
     */
    static _scheduleMovementComplete() {
        // Clear existing timeout
        if (TokenImageUtilities._movementTimeout) {
            clearTimeout(TokenImageUtilities._movementTimeout);
        }
        
        // Wait for movement to complete (debounce - 1 second delay)
        TokenImageUtilities._movementTimeout = setTimeout(() => {
            TokenImageUtilities._completeMovementFade();
        }, 1000);
    }

    /**
     * Fade back in after movement completes
     */
    static _completeMovementFade() {
        if (!TokenImageUtilities._turnIndicator) return;
        
        TokenImageUtilities._isMoving = false;
        
        // Get the current settings
        const settings = TokenImageUtilities._getTurnIndicatorSettings();
        
        // Remove existing fade animation if any
        if (TokenImageUtilities._fadeAnimation) {
            canvas.app.ticker.remove(TokenImageUtilities._fadeAnimation);
        }
        
        // Create fade in animation - fade back to settings' max pulse alpha
        const startAlpha = TokenImageUtilities._turnIndicator.alpha;
        const targetAlpha = settings.pulseMax;
        const duration = 200; // ms
        let elapsed = 0;
        
        TokenImageUtilities._fadeAnimation = (delta) => {
            if (!TokenImageUtilities._turnIndicator) return;
            
            elapsed += delta * 16.67; // Approximate ms per frame
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease in
            const eased = Math.pow(progress, 2);
            TokenImageUtilities._turnIndicator.alpha = startAlpha + (targetAlpha - startAlpha) * eased;
            
            // Stop animation when complete
            if (progress >= 1) {
                canvas.app.ticker.remove(TokenImageUtilities._fadeAnimation);
                TokenImageUtilities._fadeAnimation = null;
            }
        };
        
        canvas.app.ticker.add(TokenImageUtilities._fadeAnimation);
    }
}
