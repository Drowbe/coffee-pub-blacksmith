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
    
    // Targeted indicator management
    static _targetedIndicators = new Map(); // Map of tokenId -> graphics object
    static _targetedTokens = new Set(); // Set of currently targeted token IDs
    static _targetedAnimations = new Map(); // Map of tokenId -> animation object
    static _hideTargetsAnimationId = null; // ID for the continuous hiding loop
    
    // Hook IDs for cleanup
    static _updateCombatHookId = null;
    static _deleteCombatHookId = null;
    static _updateTokenHookId = null;
    static _targetingHookId = null; // Added for targeting changes
    
    /**
     * Map user-friendly speed (1-10) to animation-specific speed values
     */
    static _mapSpeedToAnimationSpeed(userSpeed, animationType) {
        // Convert 1-10 scale to appropriate speeds for different animation types
        switch (animationType) {
            case 'pulse':
                // Pulse: 1=0.005 (very slow), 10=0.1 (very fast)
                return 0.005 + (userSpeed - 1) * (0.095 / 9);
            
            case 'rotate':
                // Rotation: 1=0.001 (very slow), 10=0.05 (very fast)
                return 0.001 + (userSpeed - 1) * (0.049 / 9);
            
            case 'wobble':
                // Wobble: 1=0.005 (very slow), 10=0.08 (very fast)
                return 0.005 + (userSpeed - 1) * (0.075 / 9);
            
            default:
                // Default pulse mapping
                return 0.005 + (userSpeed - 1) * (0.095 / 9);
        }
    }

    /**
     * Get the current turn indicator settings from module config
     */
    static _getTurnIndicatorSettings() {
        // Get color as hex string and convert to PIXI color integer
        const colorHex = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentBorderColor', '#00ff00');
        const color = parseInt(colorHex.replace('#', '0x'));
        
        // Get inner fill color
        const innerColorHex = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentBackgroundColor', '#ff8100');
        const innerColor = parseInt(innerColorHex.replace('#', '0x'));
        
        // Get user speed (1-10) and map to animation speed
        const userSpeed = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentAnimationSpeed', 5);
        const animationType = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentAnimation', 'pulse');
        
        return {
            style: getSettingSafely(MODULE.ID, 'turnIndicatorCurrentStyle', 'solid'),
            animation: animationType,
            color: color,
            thickness: getSettingSafely(MODULE.ID, 'turnIndicatorThickness', 3),
            offset: getSettingSafely(MODULE.ID, 'turnIndicatorOffset', 8),
            pulseSpeed: TokenImageUtilities._mapSpeedToAnimationSpeed(userSpeed, animationType),
            pulseMin: getSettingSafely(MODULE.ID, 'turnIndicatorOpacityMin', 0.3),
            pulseMax: getSettingSafely(MODULE.ID, 'turnIndicatorOpacityMax', 0.8),
            innerColor: innerColor,
            innerOpacity: getSettingSafely(MODULE.ID, 'turnIndicatorInnerOpacity', 0.3)
        };
    }
    
    /**
     * Get the targeted turn indicator settings from module config
     */
    static _getTargetedIndicatorSettings() {
        // Get color as hex string and convert to PIXI color integer
        const colorHex = getSettingSafely(MODULE.ID, 'turnIndicatorTargetedBorderColor', '#a51214');
        const color = parseInt(colorHex.replace('#', '0x'));
        
        // Get inner fill color
        const innerColorHex = getSettingSafely(MODULE.ID, 'turnIndicatorTargetedBackgroundColor', '#a51214');
        const innerColor = parseInt(innerColorHex.replace('#', '0x'));
        
        // Get user speed (1-10) and map to animation speed
        const userSpeed = getSettingSafely(MODULE.ID, 'turnIndicatorTargetedAnimationSpeed', 5);
        const animationType = getSettingSafely(MODULE.ID, 'turnIndicatorTargetedAnimation', 'pulse');
        
        return {
            style: getSettingSafely(MODULE.ID, 'turnIndicatorTargetedStyle', 'solid'),
            animation: animationType,
            color: color,
            thickness: getSettingSafely(MODULE.ID, 'turnIndicatorThickness', 3),
            offset: getSettingSafely(MODULE.ID, 'turnIndicatorOffset', 8),
            pulseSpeed: TokenImageUtilities._mapSpeedToAnimationSpeed(userSpeed, animationType),
            pulseMin: getSettingSafely(MODULE.ID, 'turnIndicatorOpacityMin', 0.3),
            pulseMax: getSettingSafely(MODULE.ID, 'turnIndicatorOpacityMax', 0.8),
            innerColor: innerColor,
            innerOpacity: getSettingSafely(MODULE.ID, 'turnIndicatorInnerOpacity', 0.3)
        };
    }
    
    /**
     * Draw the turn indicator based on the selected style
     */
    static _drawTurnIndicatorCurrentStyle(graphics, settings, ringRadius) {
        switch (settings.style) {
            case 'dashed':
                TokenImageUtilities._drawDashedCircle(graphics, settings, ringRadius);
                break;
            case 'spikes':
                TokenImageUtilities._drawSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'spikesIn':
                TokenImageUtilities._drawInwardSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'solid':
            default:
                TokenImageUtilities._drawSolidCircle(graphics, settings, ringRadius);
                break;
        }
    }
    
    /**
     * Draw the targeted turn indicator based on the selected style
     */
    static _drawTurnIndicatorTargetedStyle(graphics, settings, ringRadius) {
        switch (settings.style) {
            case 'dashed':
                TokenImageUtilities._drawDashedCircle(graphics, settings, ringRadius);
                break;
            case 'spikes':
                TokenImageUtilities._drawSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'spikesIn':
                TokenImageUtilities._drawInwardSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'solid':
            default:
                TokenImageUtilities._drawSolidCircle(graphics, settings, ringRadius);
                break;
        }
    }
    
    /**
     * Draw a solid circle with inner fill
     */
    static _drawSolidCircle(graphics, settings, ringRadius) {
        // Draw inner fill first (behind the ring)
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw the ring on top
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
    }
    
    /**
     * Draw a dashed circle with inner fill
     */
    static _drawDashedCircle(graphics, settings, ringRadius) {
        // Draw inner fill first (behind the ring)
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw the dashed ring on top with rounded ends
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax, 0.5, true); // rounded caps
        
        const dashCount = 8; // Number of dashes
        const dashAngle = (Math.PI * 2) / dashCount;
        const dashLength = dashAngle * 0.8; // 60% dash, 40% gap
        
        for (let i = 0; i < dashCount; i++) {
            const startAngle = i * dashAngle;
            const endAngle = startAngle + dashLength;
            
            // Move to start of each dash (important!)
            const startX = Math.cos(startAngle) * ringRadius;
            const startY = Math.sin(startAngle) * ringRadius;
            graphics.moveTo(startX, startY);
            
            // Draw the arc
            graphics.arc(0, 0, ringRadius, startAngle, endAngle);
        }
    }
    
    /**
     * Draw a circle with spikes as a proper ring (donut shape) with inner fill
     */
    static _drawSpikedCircle(graphics, settings, ringRadius) {
        const spikeCount = 8;
        const spikeLength = settings.thickness * 2.0; // Scale spike length with ring thickness
        const spikeWidth = settings.thickness * 1.6;
        
        // Draw inner fill first (behind everything)
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw the base ring
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
        
        // Draw triangular spikes extending from the ring
        graphics.lineStyle(0); // No stroke for filled spikes
        graphics.beginFill(settings.color, settings.pulseMax);
        
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i * Math.PI * 2) / spikeCount;
            
            // Calculate spike positions
            const baseX = Math.cos(angle) * ringRadius;
            const baseY = Math.sin(angle) * ringRadius;
            const tipX = Math.cos(angle) * (ringRadius + spikeLength);
            const tipY = Math.sin(angle) * (ringRadius + spikeLength);
            
            // Calculate spike width points (perpendicular to spike direction)
            const spikeAngle = angle + Math.PI / 2; // Perpendicular
            const halfWidth = spikeWidth / 2;
            const leftX = baseX + Math.cos(spikeAngle) * halfWidth;
            const leftY = baseY + Math.sin(spikeAngle) * halfWidth;
            const rightX = baseX - Math.cos(spikeAngle) * halfWidth;
            const rightY = baseY - Math.sin(spikeAngle) * halfWidth;
            
            // Draw triangular spike
            graphics.moveTo(leftX, leftY);
            graphics.lineTo(tipX, tipY);
            graphics.lineTo(rightX, rightY);
            graphics.lineTo(leftX, leftY);
        }
        
        graphics.endFill();
    }
    
    /**
     * Draw a circle with inward-pointing spikes
     */
    static _drawInwardSpikedCircle(graphics, settings, ringRadius) {
        const spikeCount = 8;
        const spikeLength = settings.thickness * 1.2; // Scale spike length with ring thickness
        const spikeWidth = settings.thickness * 1.6;
        const innerRadius = ringRadius - settings.thickness;
        
        // Draw inner fill first (behind everything)
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw the base ring
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
        
        // Draw triangular spikes pointing inward
        graphics.lineStyle(0); // No stroke for filled spikes
        graphics.beginFill(settings.color, settings.pulseMax);
        
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i * Math.PI * 2) / spikeCount;
            
            // Calculate spike positions (pointing inward)
            const baseX = Math.cos(angle) * ringRadius;
            const baseY = Math.sin(angle) * ringRadius;
            const tipX = Math.cos(angle) * (innerRadius - spikeLength);
            const tipY = Math.sin(angle) * (innerRadius - spikeLength);
            
            // Calculate spike width points (perpendicular to spike direction)
            const spikeAngle = angle + Math.PI / 2; // Perpendicular
            const halfWidth = spikeWidth / 2;
            const leftX = baseX + Math.cos(spikeAngle) * halfWidth;
            const leftY = baseY + Math.sin(spikeAngle) * halfWidth;
            const rightX = baseX - Math.cos(spikeAngle) * halfWidth;
            const rightY = baseY - Math.sin(spikeAngle) * halfWidth;
            
            // Draw triangular spike pointing inward
            graphics.moveTo(leftX, leftY);
            graphics.lineTo(tipX, tipY);
            graphics.lineTo(rightX, rightY);
            graphics.lineTo(leftX, leftY);
        }
        
        graphics.endFill();
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
        if (!getSettingSafely(MODULE.ID, 'turnIndicatorCurrentEnabled', true)) {
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
        TokenImageUtilities._targetingHookId = HookManager.registerHook({
            name: 'targetToken',
            description: 'Token Image Utilities: Monitor targeting changes for targeted indicators',
            context: 'token-utilities-targeted-indicator',
            priority: 3,
            callback: TokenImageUtilities._onTargetingChange
        });
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Turn indicator hooks registered", "", true, false);
        
        // Hide Foundry's default target indicators if enabled
        TokenImageUtilities._hideDefaultTargetIndicators();
        
        // Check if combat is already active
        if (game.combat && game.combat.started) {
            TokenImageUtilities._updateTurnIndicator();
        }
    }

    /**
     * Hide Foundry's default target indicators using a more aggressive approach
     */
    static _hideDefaultTargetIndicators() {
        if (!getSettingSafely(MODULE.ID, 'hideDefaultTargetIndicators', false)) {
            return;
        }
        
        // Use a continuous loop to hide target indicators every frame
        Hooks.on('canvasReady', () => {
            const hideTargets = () => {
                if (canvas.tokens) {
                    for (const token of canvas.tokens.placeables) {
                        if (token.target) {
                            // Hide the entire target object - this is more reliable
                            token.target.visible = false;
                        }
                    }
                }
                TokenImageUtilities._hideTargetsAnimationId = requestAnimationFrame(hideTargets);
            };
            hideTargets();
        });
        
        // Also hook into token refresh as backup
        Hooks.on('refreshToken', (token) => {
            if (token.target) {
                token.target.visible = false;
            }
        });
        
        // Apply to all existing tokens immediately
        if (canvas.tokens) {
            for (const token of canvas.tokens.placeables) {
                if (token.target) {
                    token.target.visible = false;
                }
            }
        }
    }

    /**
     * Clean up turn indicator system
     */
    static cleanupTurnIndicator() {
        TokenImageUtilities._removeTurnIndicator();
        TokenImageUtilities._removeAllTargetedIndicators();
        
        // Stop the continuous hiding loop
        if (TokenImageUtilities._hideTargetsAnimationId) {
            cancelAnimationFrame(TokenImageUtilities._hideTargetsAnimationId);
            TokenImageUtilities._hideTargetsAnimationId = null;
        }
        
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
        
        if (TokenImageUtilities._targetingHookId) {
            HookManager.unregisterHook('targetToken', TokenImageUtilities._targetingHookId);
            TokenImageUtilities._targetingHookId = null;
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Turn indicator hooks unregistered", "", true, false);
    }

    /**
     * Handle combat updates
     */
    static _onCombatUpdate(combat, changes, options, userId) {
        if (changes.turn !== undefined || changes.round !== undefined) {
            TokenImageUtilities._updateTurnIndicator();
            
            // Clear targets after turn change - check each user's individual setting
            TokenImageUtilities._clearTargetsForUsersWithSetting();
        }
    }

    /**
     * Handle combat deletion
     */
    static _onCombatDelete(combat, options, userId) {
        TokenImageUtilities._removeTurnIndicator();
    }

    /**
     * Clear all targets when turn changes
     */
    static _clearAllTargets() {
        // Clear Foundry's targeting system
        if (game.user.targets) {
            game.user.targets.clear();
        }
        
        // Also clear our custom targeted indicators
        TokenImageUtilities._removeAllTargetedIndicators();
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Cleared all targets after turn change", "", true, false);
    }

    /**
     * Clear targets for users who have the setting enabled
     */
    static _clearTargetsForUsersWithSetting() {
        // Check if the current user has the setting enabled
        if (getSettingSafely(MODULE.ID, 'clearTargetsAfterTurn', false)) {
            TokenImageUtilities._clearAllTargets();
        }
    }

    /**
     * Handle token updates (position changes)
     */
    static _onTokenUpdate(tokenDocument, changes, options, userId) {
        const tokenId = tokenDocument.id;
        
        // Handle current turn indicator movement
        if (TokenImageUtilities._currentTurnTokenId && tokenId === TokenImageUtilities._currentTurnTokenId) {
            if (changes.x !== undefined || changes.y !== undefined) {
                const token = canvas.tokens.get(tokenId);
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
        
        // Handle targeted indicator movement
        if (TokenImageUtilities._targetedTokens.has(tokenId)) {
            if (changes.x !== undefined || changes.y !== undefined) {
                TokenImageUtilities._updateTargetedIndicatorPosition(tokenId, changes);
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
        
        // Draw the ring using the selected style
        TokenImageUtilities._drawTurnIndicatorCurrentStyle(graphics, settings, ringRadius);
        
        // Position at token center
        const tokenCenterX = token.x + tokenWidth / 2;
        const tokenCenterY = token.y + tokenHeight / 2;
        graphics.position.set(tokenCenterX, tokenCenterY);
        
        // Add to canvas
        canvas.interface.addChild(graphics);
        TokenImageUtilities._turnIndicator = graphics;
        TokenImageUtilities._currentTurnTokenId = token.id;
        
        // Create animation based on selected style
        TokenImageUtilities._createTurnIndicatorCurrentAnimation(settings);

        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Turn indicator (${settings.style}, ${settings.animation}) added for ${token.name}`, "", true, false);
    }
    
    /**
     * Create animation for the turn indicator based on settings
     */
    static _createTurnIndicatorCurrentAnimation(settings) {
        switch (settings.animation) {
            case 'pulse':
                TokenImageUtilities._createPulseAnimation(settings);
                break;
            case 'rotate':
                TokenImageUtilities._createRotateAnimation(settings);
                break;
            case 'wobble':
                TokenImageUtilities._createWobbleAnimation(settings);
                break;
            case 'fixed':
            default:
                // No animation
                break;
        }
    }
    
    /**
     * Create animation for a specific targeted indicator based on settings
     */
    static _createTargetedIndicatorAnimation(tokenId, graphics, settings) {
        // Remove existing animation if any
        const existingAnimation = TokenImageUtilities._targetedAnimations.get(tokenId);
        if (existingAnimation) {
            canvas.app.ticker.remove(existingAnimation.update);
        }
        
        let animation = null;
        
        switch (settings.animation) {
            case 'pulse':
                animation = {
                    time: 0,
                    update: (delta) => {
                        if (!graphics || graphics.destroyed) return;
                        
                        animation.time += delta * settings.pulseSpeed;
                        
                        // Heartbeat pattern: Stay at max opacity, then quick fade out/in
                        const pulseCycle = 6; // Base cycle time (adjusted by speed)
                        const pulseDuration = 1.2; // How long the pulse lasts (doubled for slower fade)
                        
                        const cycleTime = animation.time % pulseCycle;
                        
                        if (cycleTime < pulseDuration) {
                            // During pulse: fade out then back in quickly
                            const pulseProgress = cycleTime / pulseDuration;
                            // Use sine wave for smooth fade out/in within the pulse duration
                            const opacity = settings.pulseMax - (Math.sin(pulseProgress * Math.PI) * (settings.pulseMax - settings.pulseMin));
                            graphics.alpha = opacity;
                        } else {
                            // Between pulses: stay at max opacity
                            graphics.alpha = settings.pulseMax;
                        }
                    }
                };
                canvas.app.ticker.add(animation.update);
                break;
            case 'rotate':
                animation = {
                    time: 0,
                    update: (delta) => {
                        if (!graphics || graphics.destroyed) return;
                        animation.time += delta * settings.pulseSpeed;
                        graphics.rotation = animation.time;
                    }
                };
                canvas.app.ticker.add(animation.update);
                break;
            case 'wobble':
                animation = {
                    time: 0,
                    update: (delta) => {
                        if (!graphics || graphics.destroyed) return;
                        animation.time += delta * settings.pulseSpeed;
                        // Wobble scale between 0.95 and 1.05 (10% size variation)
                        const wobbleAmount = 0.05;
                        const scaleFactor = 1.0 + Math.sin(animation.time) * wobbleAmount;
                        graphics.scale.set(scaleFactor);
                    }
                };
                canvas.app.ticker.add(animation.update);
                break;
            case 'fixed':
            default:
                // No animation
                break;
        }
        
        // Store animation reference if created
        if (animation) {
            TokenImageUtilities._targetedAnimations.set(tokenId, animation);
        }
    }
    
    /**
     * Create pulse animation (opacity)
     */
    static _createPulseAnimation(settings) {
        TokenImageUtilities._pulseAnimation = {
            time: 0,
            phase: 'visible', // 'visible' or 'pulsing'
            pulseStartTime: 0,
            update: (delta) => {
                if (!TokenImageUtilities._turnIndicator) return;
                
                TokenImageUtilities._pulseAnimation.time += delta * settings.pulseSpeed;
                
                // Heartbeat pattern: Stay at max opacity, then quick fade out/in
                // Pulse every 2 seconds (adjustable by speed)
                const pulseCycle = 6; // Base cycle time (adjusted by speed)
                const pulseDuration = 1.2; // How long the pulse lasts (doubled for slower fade)
                
                const cycleTime = TokenImageUtilities._pulseAnimation.time % pulseCycle;
                
                if (cycleTime < pulseDuration) {
                    // During pulse: fade out then back in quickly
                    const pulseProgress = cycleTime / pulseDuration;
                    // Use sine wave for smooth fade out/in within the pulse duration
                    const opacity = settings.pulseMax - (Math.sin(pulseProgress * Math.PI) * (settings.pulseMax - settings.pulseMin));
                    TokenImageUtilities._turnIndicator.alpha = opacity;
                } else {
                    // Between pulses: stay at max opacity
                    TokenImageUtilities._turnIndicator.alpha = settings.pulseMax;
                }
            }
        };
        canvas.app.ticker.add(TokenImageUtilities._pulseAnimation.update);
    }
    
    /**
     * Create rotate animation
     */
    static _createRotateAnimation(settings) {
        TokenImageUtilities._pulseAnimation = {
            time: 0,
            update: (delta) => {
                if (!TokenImageUtilities._turnIndicator) return;
                // Rotate based on pulse speed setting (faster speed = faster rotation)
                TokenImageUtilities._pulseAnimation.time += delta * settings.pulseSpeed;
                TokenImageUtilities._turnIndicator.rotation = TokenImageUtilities._pulseAnimation.time;
            }
        };
        canvas.app.ticker.add(TokenImageUtilities._pulseAnimation.update);
    }

    /**
     * Create wobble animation (scale)
     */
    static _createWobbleAnimation(settings) {
        TokenImageUtilities._pulseAnimation = {
            time: 0,
            update: (delta) => {
                if (!TokenImageUtilities._turnIndicator) return;
                // Wobble based on pulse speed setting
                TokenImageUtilities._pulseAnimation.time += delta * settings.pulseSpeed;
                // Wobble scale between 0.95 and 1.05 (10% size variation)
                const wobbleAmount = 0.05;
                const scaleFactor = 1.0 + Math.sin(TokenImageUtilities._pulseAnimation.time) * wobbleAmount;
                TokenImageUtilities._turnIndicator.scale.set(scaleFactor);
            }
        };
        canvas.app.ticker.add(TokenImageUtilities._pulseAnimation.update);
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
    
    // ==================================================================
    // ===== TARGETED INDICATOR FUNCTIONALITY ===========================
    // ==================================================================
    
    /**
     * Handle targeting changes
     */
    static _onTargetingChange(user, token, targeted) {
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Targeting change - User: ${user.name}, Token: ${token.name}, Targeted: ${targeted}`, "", true, false);
        
        if (!getSettingSafely(MODULE.ID, 'turnIndicatorTargetedEnabled', true)) {
            postConsoleAndNotification(MODULE.NAME, "DEBUG: Targeted indicator disabled in settings", "", true, false);
            return;
        }
        
        const tokenId = token.id;
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Token ID: ${tokenId}, Already targeted: ${TokenImageUtilities._targetedTokens.has(tokenId)}`, "", true, false);
        
        if (targeted) {
            // Token was targeted - add indicator
            if (!TokenImageUtilities._targetedTokens.has(tokenId)) {
                postConsoleAndNotification(MODULE.NAME, `DEBUG: Adding targeted indicator for ${token.name}`, "", true, false);
                TokenImageUtilities._addTargetedIndicator(token);
                TokenImageUtilities._targetedTokens.add(tokenId);
            } else {
                postConsoleAndNotification(MODULE.NAME, `DEBUG: Token ${token.name} already has targeted indicator`, "", true, false);
            }
        } else {
            // Token was untargeted - remove indicator
            if (TokenImageUtilities._targetedTokens.has(tokenId)) {
                postConsoleAndNotification(MODULE.NAME, `DEBUG: Removing targeted indicator for ${token.name}`, "", true, false);
                TokenImageUtilities._removeTargetedIndicator(tokenId);
                TokenImageUtilities._targetedTokens.delete(tokenId);
            } else {
                postConsoleAndNotification(MODULE.NAME, `DEBUG: Token ${token.name} was not targeted`, "", true, false);
            }
        }
    }
    
    /**
     * Add targeted indicator to a token
     */
    static _addTargetedIndicator(tokenDocument) {
        postConsoleAndNotification(MODULE.NAME, `DEBUG: _addTargetedIndicator called for ${tokenDocument.name}`, "", true, false);
        
        // Get the actual Token object from the canvas
        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) {
            postConsoleAndNotification(MODULE.NAME, `DEBUG: Token not found on canvas for ${tokenDocument.name}`, "", true, false);
            return;
        }
        if (!token.visible) {
            postConsoleAndNotification(MODULE.NAME, `DEBUG: Token ${token.name} is not visible`, "", true, false);
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Token found - ${token.name}, Position: ${token.x}, ${token.y}`, "", true, false);
        
        const settings = TokenImageUtilities._getTargetedIndicatorSettings();
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Settings - Style: ${settings.style}, Color: ${settings.color}, Thickness: ${settings.thickness}`, "", true, false);
        
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        const tokenRadius = Math.max(tokenWidth, tokenHeight) / 2;
        const ringRadius = tokenRadius + settings.offset;
        
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Dimensions - Width: ${tokenWidth}, Height: ${tokenHeight}, Ring Radius: ${ringRadius}`, "", true, false);
        
        const graphics = new PIXI.Graphics();
        TokenImageUtilities._drawTurnIndicatorTargetedStyle(graphics, settings, ringRadius);
        
        const tokenCenterX = token.x + tokenWidth / 2;
        const tokenCenterY = token.y + tokenHeight / 2;
        graphics.position.set(tokenCenterX, tokenCenterY);
        
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Adding graphics to canvas at position ${tokenCenterX}, ${tokenCenterY}`, "", true, false);
        
        canvas.interface.addChild(graphics);
        TokenImageUtilities._targetedIndicators.set(tokenDocument.id, graphics);
        
        // Create animation for this specific targeted indicator
        TokenImageUtilities._createTargetedIndicatorAnimation(tokenDocument.id, graphics, settings);
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Targeted indicator (${settings.style}, ${settings.animation}) added for ${token.name}`, "", true, false);
    }
    
    /**
     * Remove targeted indicator from a token
     */
    static _removeTargetedIndicator(tokenId) {
        const graphics = TokenImageUtilities._targetedIndicators.get(tokenId);
        if (graphics) {
            canvas.interface.removeChild(graphics);
            graphics.destroy();
            TokenImageUtilities._targetedIndicators.delete(tokenId);
        }
        
        // Remove animation if exists
        const animation = TokenImageUtilities._targetedAnimations.get(tokenId);
        if (animation) {
            canvas.app.ticker.remove(animation.update);
            TokenImageUtilities._targetedAnimations.delete(tokenId);
        }
    }
    
    /**
     * Remove all targeted indicators
     */
    static _removeAllTargetedIndicators() {
        for (const [tokenId, graphics] of TokenImageUtilities._targetedIndicators) {
            canvas.interface.removeChild(graphics);
            graphics.destroy();
        }
        TokenImageUtilities._targetedIndicators.clear();
        TokenImageUtilities._targetedTokens.clear();
        
        // Clean up all animations
        for (const [tokenId, animation] of TokenImageUtilities._targetedAnimations) {
            canvas.app.ticker.remove(animation.update);
        }
        TokenImageUtilities._targetedAnimations.clear();
    }
    
    /**
     * Update targeted indicator position (for token movement)
     */
    static _updateTargetedIndicatorPosition(tokenId, changes = null) {
        const graphics = TokenImageUtilities._targetedIndicators.get(tokenId);
        if (!graphics) return;
        
        const token = canvas.tokens.get(tokenId);
        if (!token) return;
        
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        
        const tokenX = changes?.x !== undefined ? changes.x : token.x;
        const tokenY = changes?.y !== undefined ? changes.y : token.y;
        
        const tokenCenterX = tokenX + tokenWidth / 2;
        const tokenCenterY = tokenY + tokenHeight / 2;
        
        graphics.x = tokenCenterX;
        graphics.y = tokenCenterY;
    }
}
