// ================================================================== 
// ===== TOKEN IMAGE UTILITIES ======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, playSound } from './api-core.js';
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
    
    // Death save overlay management
    static _deathSaveOverlays = new Map(); // Map of tokenId -> graphics object
    static _deathSaveStates = new Map(); // Map of actorId -> {wasStable: bool, wasHealed: bool} for tracking state changes
    
    // Hook IDs for cleanup
    static _updateCombatHookId = null;
    static _deleteCombatHookId = null;
    static _updateTokenHookId = null;
    static _targetingHookId = null; // Added for targeting changes
    static _canvasReadyHookId = null; // For hiding default target indicators
    static _refreshTokenHookId = null; // For hiding default target indicators
    
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
            case 'roundedSquare':
                TokenImageUtilities._drawRoundedSquare(graphics, settings, ringRadius);
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
            case 'roundedSquare':
                TokenImageUtilities._drawRoundedSquare(graphics, settings, ringRadius);
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
     * Draw a rounded square with inner fill
     */
    static _drawRoundedSquare(graphics, settings, ringRadius) {
        // Calculate square size based on ring radius
        // For a square to encompass the same area, use side = radius * sqrt(2)
        const squareSize = ringRadius * 2;
        const halfSize = squareSize / 2;
        const cornerRadius = squareSize * 0.15; // 15% of size for nice rounded corners
        
        // Draw inner fill first (behind the ring)
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawRoundedRect(-halfSize, -halfSize, squareSize, squareSize, cornerRadius);
        graphics.endFill();
        
        // Draw the rounded square border on top
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawRoundedRect(-halfSize, -halfSize, squareSize, squareSize, cornerRadius);
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
                // Clear dead token flag
                await tokenDocument.unsetFlag(MODULE.ID, 'isDeadTokenApplied');
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Restored previous image for ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error restoring previous image: ${error.message}`, "", true, false);
            }
        }
    }

    /**
     * Get the dead token image path based on character type
     * @param {boolean} isPlayerCharacter - Whether this is a player character
     * @returns {string} Path to the appropriate dead token image
     */
    static getDeadTokenImagePath(isPlayerCharacter = false) {
        let deadTokenPath;
        
        if (isPlayerCharacter) {
            // PC has failed 3 death saves - use PC-specific dead token from setting
            deadTokenPath = getSettingSafely(MODULE.ID, 'deadTokenImagePathPC', 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp');
        } else {
            // NPC/Monster - use existing setting
            deadTokenPath = getSettingSafely(MODULE.ID, 'deadTokenImagePath', 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp');
        }
        
        // Check if the file exists in our cache (only if cache is available)
        if (ImageCacheManager.cache && ImageCacheManager.cache.files) {
            const fileName = deadTokenPath.split('/').pop();
            const cachedFile = ImageCacheManager.cache.files.get(fileName.toLowerCase());
            
            if (cachedFile) {
                return cachedFile.fullPath;
            }
        }
        
        // If not in cache or cache not available, return the path as-is
        return deadTokenPath;
    }

    /**
     * Unified token image management - based on working dead token code
     * @param {TokenDocument} tokenDocument - The token document
     * @param {string} mode - 'dead', 'loot', or 'restore'
     * @param {object} options - Additional options (actor, isPlayerCharacter)
     */
    static async updateTokenImage(tokenDocument, mode, options = {}) {
        if (!tokenDocument) return;
        
        // RESTORE MODE
        if (mode === 'restore') {
            const currentImage = tokenDocument.getFlag(MODULE.ID, 'currentImage');
            if (currentImage) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - BEFORE update - current texture: ${tokenDocument.texture.src}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - Attempting to restore to: ${currentImage}`, "", true, false);
                
                try {
                    // Use the object form for the update to ensure it works with unlinked tokens
                    const updateData = { 'texture.src': currentImage };
                    await tokenDocument.update(updateData, { render: true, diff: false });
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - AFTER update - new texture: ${tokenDocument.texture.src}`, "", true, false);
                    
                    // Clear all flags
                    await tokenDocument.unsetFlag(MODULE.ID, 'currentImage');
                    await tokenDocument.unsetFlag(MODULE.ID, 'currentImageStored');
                    await tokenDocument.unsetFlag(MODULE.ID, 'imageState');
                    await tokenDocument.unsetFlag(MODULE.ID, 'isDeadTokenApplied');
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - Restored current image for ${tokenDocument.name} to: ${currentImage}`, "", true, false);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - ERROR restoring image: ${error.message}`, "", false, false);
                }
            }
            return;
        }
        
        // STORE CURRENT IMAGE (only once)
        const alreadyStored = tokenDocument.getFlag(MODULE.ID, 'currentImageStored');
        if (!alreadyStored) {
            const currentImage = tokenDocument.texture.src;
            await tokenDocument.setFlag(MODULE.ID, 'currentImage', currentImage);
            await tokenDocument.setFlag(MODULE.ID, 'currentImageStored', true);
            postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Stored current image for ${tokenDocument.name}: ${currentImage}`, "", true, false);
        } else {
            const storedImage = tokenDocument.getFlag(MODULE.ID, 'currentImage');
            postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Current image already stored for ${tokenDocument.name}: ${storedImage}`, "", false, false);
        }
        
        // DEAD MODE
        if (mode === 'dead') {
            const isPlayerCharacter = options.isPlayerCharacter || false;
            
            // Check if dead token is already applied
            const isDeadTokenApplied = tokenDocument.getFlag(MODULE.ID, 'isDeadTokenApplied');
            if (isDeadTokenApplied) {
                return; // Already showing dead token
            }
            
            // Get the appropriate token image path
            const deadTokenPath = TokenImageUtilities.getDeadTokenImagePath(isPlayerCharacter);
            
            if (deadTokenPath) {
                try {
                    await tokenDocument.update({ 'texture.src': deadTokenPath });
                    await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', true);
                    await tokenDocument.setFlag(MODULE.ID, 'imageState', 'dead');
                   
                    // Play death sound based on character type
                    const soundSetting = isPlayerCharacter ? 'deadTokenSoundPC' : 'deadTokenSoundNPC';
                    const sound = getSettingSafely(MODULE.ID, soundSetting, 'none');
                    if (sound && sound !== 'none') {
                        await playSound(sound, 0.7, false, true);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Error applying dead token: ${error.message}`, "", false, false);
                }
            }
        }
        
        // LOOT MODE
        if (mode === 'loot') {
            const lootImagePath = getSettingSafely(MODULE.ID, 'tokenLootPileImage', 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp');
            postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: LOOT MODE - updating ${tokenDocument.name} to: ${lootImagePath}`, "", true, false);
            
            try {
                await tokenDocument.update({ 'texture.src': lootImagePath });
                await tokenDocument.setFlag(MODULE.ID, 'imageState', 'loot');
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Error applying loot token: ${error.message}`, "", false, false);
            }
        }
    }

    /**
     * Convert token to dead (handles creature type filtering and image change)
     * @param {TokenDocument} tokenDocument - The token document
     * @param {Actor} actor - The actor
     */
    static async _convertTokenToDead(tokenDocument, actor) {
        // Determine if this is a player character
        const isPlayerCharacter = actor.type === 'character';
        
        // Check creature type filter (skip for player characters)
        if (!isPlayerCharacter) {
            const creatureType = actor?.system?.details?.type?.value?.toLowerCase() || '';
            const allowedTypes = getSettingSafely(MODULE.ID, 'deadTokenCreatureTypeFilter', '');
            
            if (allowedTypes && allowedTypes.trim() !== '') {
                const types = allowedTypes.split(',').map(t => t.trim().toLowerCase());
                if (!types.includes(creatureType)) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Skipping dead token for ${tokenDocument.name} - creature type ${creatureType} not in filter`, "", true, false);
                    return;
                }
            }
        }
        
        // Use unified function
        await TokenImageUtilities.updateTokenImage(tokenDocument, 'dead', { isPlayerCharacter });
    }

    /**
     * Convert token to loot pile (moved from manager-canvas.js)
     */
    static async _convertTokenToLoot(token) {
        try {
            // Check if user has permission to update tokens
            if (!game.user.isGM) {
                postConsoleAndNotification(MODULE.NAME, "Only Game Masters can convert tokens to loot.", "", true, false);
                return;
            }
            
            // Check if Item Piles module is installed and active
            if (!game.modules.get("item-piles")?.active) {
                postConsoleAndNotification(MODULE.NAME, "Item Piles module not installed. Cannot convert token to loot.", "", true, false);
                return;
            }
            
            // Import CanvasTools for helper functions
            const { CanvasTools } = await import('./manager-canvas.js');
            
            // Check if loot has already been added to this token
            const lootAlreadyAdded = token.document.getFlag(MODULE.ID, 'blnLootAdded');
            
            if (!lootAlreadyAdded) {
                // Add loot from tables if configured
                const tables = [
                    {setting: 'tokenLootTableTreasure', amount: 'tokenLootTableTreasureAmount'},
                    {setting: 'tokenLootTableGear', amount: 'tokenLootTableGearAmount'},
                    {setting: 'tokenLootTableGeneral', amount: 'tokenLootTableGeneralAmount'}
                ];
                
                // Roll loot from each configured table
                for (const table of tables) {
                    const tableName = game.settings.get(MODULE.ID, table.setting);
                    if (tableName && tableName !== "none" && !tableName.startsWith('--')) {
                        const amount = game.settings.get(MODULE.ID, table.amount);
                        if (amount > 0) {
                            await CanvasTools._rollLootTable(tableName, amount, token.actor);
                        }
                    }
                }
                
                // Add random coins
                await CanvasTools._addRandomCoins(token.actor);
                
                // Mark that loot has been added
                await token.document.setFlag(MODULE.ID, 'blnLootAdded', true);
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Added loot to ${token.name}`, "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Loot already added to ${token.name}, skipping loot generation`, "", true, false);
            }

            // Set up proper permissions before converting to item pile
            const updates = {
                "permission.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
                "flags.item-piles": {
                    "enabled": true,
                    "interactable": true,
                    "lootable": true
                }
            };
            
            // Update token permissions
            await token.document.update(updates);
            
            // Convert to item pile with proper configuration
            await game.itempiles.API.turnTokensIntoItemPiles([token], {
                pileSettings: {
                    enabled: true,
                    interactable: true,
                    lootable: true,
                    closed: false,
                    shareItemsWithPlayers: true,
                    displayOne: false
                }
            });
            
           
            // Play sound
            const sound = game.settings.get(MODULE.ID, 'tokenLootSound');
            if (sound) {
                AudioHelper.play({src: sound, volume: 0.5, autoplay: true, loop: false}, true);
            }
            
            // Send chat message if enabled
            if (game.settings.get(MODULE.ID, 'tokenLootChatMessage')) {
                const messageData = {
                    isPublic: true,
                    theme: 'default',
                    isLootDrop: true,
                    tokenName: token.name
                };

                const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', messageData);

                await ChatMessage.create({
                    content: messageHtml,
                    speaker: ChatMessage.getSpeaker()
                });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error converting token to loot: ${error.message}`, "", true, false);
        }
    }

    /**
     * Centralized HP monitoring function - handles all HP-related state changes
     */
    static async onActorHPChange(actor, changes, options, userId) {
        // Only GMs can update tokens
        if (!game.user.isGM) {
            return;
        }
        
        // Check if HP or death saves changed
        const hpChanged = changes.system?.attributes?.hp !== undefined;
        const deathSavesChanged = changes.system?.attributes?.death !== undefined;
        
        if (!hpChanged && !deathSavesChanged) {
            return;
        }
        
        // Get current HP
        const currentHP = actor.system.attributes.hp.value;
        
        // Determine if this is a player character
        const isPlayerCharacter = actor.type === 'character';
        
        // Find all tokens for this actor on current scene
        if (!canvas.scene) {
            return;
        }
        
        const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
        
        // CRITICAL FIX: Only process tokens that actually have the updated HP value
        // This prevents all tokens of the same actor from getting updated when only one changes
        const updatedTokens = tokens.filter(token => {
            const tokenHP = token.actor?.system?.attributes?.hp?.value;
            return tokenHP === currentHP;
        });
        
        // If no tokens match the current HP, fall back to all tokens (for safety)
        const tokensToProcess = updatedTokens.length > 0 ? updatedTokens : tokens;
        
        
        for (const token of tokensToProcess) {
            if (currentHP <= 0) {
                // Token at 0 HP or below - check dead token settings
                const deadTokenMode = getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', 'disabled');
                if (deadTokenMode !== 'disabled') {
                    // For player characters, check death saves
                    let hasFailed3DeathSaves = false;
                    if (isPlayerCharacter) {
                        const deathSaves = actor.system.attributes.death;
                        if (deathSaves) {
                            hasFailed3DeathSaves = (deathSaves.failure >= 3);
                        }
                    }
                    
                    // Apply dead token based on character type and death save
                    if (isPlayerCharacter) {
                        if (hasFailed3DeathSaves) {
                            // PC has failed 3 death saves - apply dead token
                            await TokenImageUtilities._convertTokenToDead(token.document, actor);
                        }
                        // Otherwise: PC is unconscious but not dead - DO NOT change token (keep original)
                    } else {
                        // NPC at 0 HP - apply dead token immediately
                        await TokenImageUtilities._convertTokenToDead(token.document, actor);
                    }
                }
                
                // Check if loot conversion is enabled (NPCs only)
                const lootEnabled = getSettingSafely(MODULE.ID, 'tokenConvertDeadToLoot', false);
                
                if (!isPlayerCharacter && lootEnabled) {
                    // Apply loot image immediately
                    await TokenImageUtilities.updateTokenImage(token.document, 'loot');
                    
                    // Schedule loot actions after delay
                    const delay = getSettingSafely(MODULE.ID, 'tokenConvertDelay', 5) * 1000;
                    const tokenId = token.id; // Capture the specific token ID
                    
                    setTimeout(async () => {
                        // Find the SPECIFIC token by ID, not just any token with the same actor
                        const lootToken = canvas.tokens.placeables.find(t => t.id === tokenId);
                        
                        if (lootToken) {
                            const tokenHP = lootToken.actor.system.attributes.hp.value;
                            
                            if (tokenHP <= 0) {
                                await TokenImageUtilities._convertTokenToLoot(lootToken);
                            }
                        }
                    }, delay);
                }
            } else {
                // Token was revived (HP > 0) - restore current image if any state was applied
                const imageState = token.document.getFlag(MODULE.ID, 'imageState');
                const storedImage = token.document.getFlag(MODULE.ID, 'currentImage');
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: RESTORATION CHECK - TOKEN NAME: ${token.name}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: RESTORATION CHECK - imageState=${imageState}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: RESTORATION CHECK - storedImage=${storedImage}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: RESTORATION CHECK - currentTexture=${token.document.texture.src}`, "", true, false);
                
                if (imageState && (imageState === 'dead' || imageState === 'loot')) {
                    // Get fresh document reference after Item Piles reversion
                    const freshToken = canvas.tokens.get(token.id);
                    if (freshToken) {
                        // Restore the current image using unified function with fresh reference
                        await TokenImageUtilities.updateTokenImage(freshToken.document, 'restore');
                    }
                }

                // If it was converted to loot pile, revert it to a token
                if (imageState === 'loot' && game.modules.get("item-piles")?.active) {
                    try {
                        await game.itempiles.API.revertTokensFromItemPiles([token]);
                        postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: AFTER ITEM PILES REVERT - texture: ${token.document.texture.src}`, "", true, false);
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: ERROR reverting from item pile: ${error.message}`, "", false, false);
                    }
                }

            }
        }
        
        // Update death save overlays for all tokens
        TokenImageUtilities.updateDeathSaveOverlays();
    }

    // ================================================================== 
    // ===== DEATH SAVE OVERLAY FUNCTIONALITY ===========================
    // ==================================================================
    
    /**
     * Update death save overlays for all tokens at 0 HP
     */
    static updateDeathSaveOverlays() {
        if (!canvas.scene) return;
        
        // Check all tokens in the scene
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            if (!actor) continue;
            
            // Only show for player characters
            if (actor.type !== 'character') {
                // Remove overlay if it exists for non-PCs
                this._removeDeathSaveOverlay(token.id);
                continue;
            }
            
            const currentHP = actor.system?.attributes?.hp?.value || 0;
            const deathSaves = actor.system?.attributes?.death;
            const isStable = actor.system?.attributes?.hp?.stable || false;
            
            // Get previous state for this actor
            const previousState = this._deathSaveStates.get(actor.id) || { wasStable: false, wasAt0HP: false };
            
            if (currentHP <= 0 && deathSaves) {
                const successes = deathSaves.success || 0;
                const failures = deathSaves.failure || 0;
                
                // Check if they're stable (either by flag OR by 3 successes) or have 3 failures (dead)
                const isActuallyStable = isStable || successes >= 3;
                
                // Debug logging
                postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: ${actor.name} - successes: ${successes}, failures: ${failures}, isStable: ${isStable}, isActuallyStable: ${isActuallyStable}`, "", true, false);
                
                if (failures >= 3) {
                    // Remove overlay - they're dead
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Removing overlay for ${actor.name} - dead`, "", true, false);
                    this._removeDeathSaveOverlay(token.id);
                    // Update state
                    this._deathSaveStates.set(actor.id, { wasStable: false, wasAt0HP: true });
                } else {
                    // Check if they just became stable (wasn't stable before, is stable now)
                    if (isActuallyStable && !previousState.wasStable) {
                        // Play stable sound
                        const stableSound = getSettingSafely(MODULE.ID, 'deadTokenSoundStable', 'none');
                        if (stableSound && stableSound !== 'none') {
                            playSound(stableSound, 0.7, false, true);
                        }
                    }
                    
                    // Show/update overlay (either dying or stable)
                    postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Showing overlay for ${actor.name} - ${isActuallyStable ? 'stable' : 'dying'}`, "", true, false);
                    this._createOrUpdateDeathSaveOverlay(token, successes, failures, isActuallyStable);
                    
                    // Update state
                    this._deathSaveStates.set(actor.id, { wasStable: isActuallyStable, wasAt0HP: true });
                }
            } else {
                // Check if they were just healed (was at 0 HP, now > 0)
                if (previousState.wasAt0HP && currentHP > 0) {
                    // Play stable/heal sound
                    const stableSound = getSettingSafely(MODULE.ID, 'deadTokenSoundStable', 'none');
                    if (stableSound && stableSound !== 'none') {
                        playSound(stableSound, 0.7, false, true);
                    }
                }
                
                // Remove overlay if HP > 0
                this._removeDeathSaveOverlay(token.id);
                // Update state
                this._deathSaveStates.set(actor.id, { wasStable: false, wasAt0HP: false });
            }
        }
    }
    
    /**
     * Create or update death save overlay for a token
     */
    static _createOrUpdateDeathSaveOverlay(token, successes, failures, isStable) {
        // Remove existing overlay if present
        this._removeDeathSaveOverlay(token.id);
        
        const graphics = new PIXI.Graphics();
        // Configuration
        const ringOutterRadius = 8;
        const ringOpacity = 0.4;
        const ringBackgroundOpacity = 0.4;
        const dotRadius = 2; // Dot radius
        const dotSpacingNumSegments = 18;
        const dotColorBorder = 0xFBF8DA;
        const dotBorderThickness = 1;
        const dotBorderOpacity = 0.7;
        const dotColorSuccess = 0x03C602;
        const dotColorFailure = 0xCB1B1C;
        const dotColorEmpty = 0xFBF8DA;
        const dotColorOpacity = 0.7;
        
        // Animation settings
        const heartbeatSpeed = 0.003; // Animation speed multiplier (lower = slower)
        const heartbeatCycleDuration = 10; // Total cycle duration in seconds
        const heartbeatFirstPulseDuration = 0.9; // First pulse duration
        const heartbeatSecondPulseDuration = 0.9; // Second pulse duration
        const heartbeatRestDuration = heartbeatCycleDuration - heartbeatFirstPulseDuration - heartbeatSecondPulseDuration; // Rest duration
        const heartbeatMinOpacity = 0.3; // Minimum background opacity
        const heartbeatMaxOpacity = 1.0; // Maximum background opacity
        
        // Death save state colors
        const dyingRingColor = 0x240B0B; // Red for dying
        const dyingBackgroundColor = 0x9B1819; // Red background for dying
        const stableRingColor = 0x0B240B; // Green for stable
        const stableBackgroundColor = 0x189B18; // Green background for stable
        
        const ringRadius = Math.max(token.document.width, token.document.height) * canvas.grid.size / 2 + ringOutterRadius; // Ring around token
        const dotDistance = ringRadius + 0; // Distance from token center to dots
        
        // Calculate token center
        const center = this._calculateTokenCenter(token);
        
        // Determine death save state
        let currentRingColor, currentBackgroundColor, shouldAnimate, shouldShowDots;
        if (isStable) {
            // Stable - actor.system.attributes.hp.stable = true
            currentRingColor = stableRingColor;
            currentBackgroundColor = stableBackgroundColor;
            shouldAnimate = true; // Keep heartbeat animation for stable
            shouldShowDots = false; // No dots for stable
        } else {
            // Dying - still making death saves (failures >= 3 case is handled by removing overlay)
            currentRingColor = dyingRingColor;
            currentBackgroundColor = dyingBackgroundColor;
            shouldAnimate = true; // Animate for dying
            shouldShowDots = true; // Show dots for dying
        }
        
        // Draw ring around token (at 0,0 - will be positioned later)
        graphics.lineStyle(ringOutterRadius, currentRingColor, ringOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        
        // Fill the center with semi-transparent color
        graphics.beginFill(currentBackgroundColor, ringBackgroundOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw dots only if not stable
        if (shouldShowDots) {
            // Draw success dots (top half of ring) - center dot at top, others on sides
        for (let i = 0; i < 3; i++) {
            let angle;
            if (i === 0) {
                angle = Math.PI / 2; // 90° - directly at top
            } else if (i === 1) {
                angle = Math.PI / 2 + Math.PI / dotSpacingNumSegments; // 120° - top right
            } else {
                angle = Math.PI / 2 - Math.PI / dotSpacingNumSegments; // 60° - top left
            }
            const dotX = Math.cos(angle) * dotDistance;
            const dotY = Math.sin(angle) * dotDistance;
            
            graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity); 
            if (i < successes) {
                graphics.beginFill(dotColorSuccess, dotColorOpacity);
            } else {
                graphics.beginFill(dotColorEmpty, dotColorOpacity); 
            }
            graphics.drawCircle(dotX, dotY, dotRadius);
            graphics.endFill();
        }
        
        // Draw failure dots (bottom half of ring) - center dot at bottom, others on sides
        for (let i = 0; i < 3; i++) {
            let angle;
            if (i === 0) {
                angle = Math.PI / 2 + Math.PI; // 270° - directly at bottom
            } else if (i === 1) {
                angle = Math.PI / 2 + Math.PI + Math.PI / dotSpacingNumSegments; // 300° - bottom right
            } else {
                angle = Math.PI / 2 + Math.PI - Math.PI / dotSpacingNumSegments; // 240° - bottom left
            }
            const dotX = Math.cos(angle) * dotDistance;
            const dotY = Math.sin(angle) * dotDistance;
            
            graphics.lineStyle(dotBorderThickness, dotColorBorder, 1);
            if (i < failures) {
                graphics.beginFill(dotColorFailure, dotColorOpacity);
            } else {
                graphics.beginFill(dotColorEmpty, dotColorOpacity);
            }
            graphics.drawCircle(dotX, dotY, dotRadius);
            graphics.endFill();
        }
        } // Close shouldShowDots conditional
        
        // Add heartbeat animation to the background (only for dying state)
        const heartbeatAnimation = (delta) => {
            // Only animate if character is dying
            if (!shouldAnimate) {
                return;
            }
            
            const time = Date.now() * heartbeatSpeed; // Use configurable speed
            // Heartbeat pattern: quick pulse, pause, quick pulse, longer pause
            let heartbeat;
            const cycle = time % heartbeatCycleDuration; // Use configurable cycle duration
            if (cycle < heartbeatFirstPulseDuration) {
                // First quick pulse
                heartbeat = heartbeatMinOpacity + (heartbeatMaxOpacity - heartbeatMinOpacity) * Math.sin(cycle * Math.PI / heartbeatFirstPulseDuration);
            } else if (cycle < heartbeatFirstPulseDuration + heartbeatSecondPulseDuration) {
                // Second quick pulse
                const pulseTime = (cycle - heartbeatFirstPulseDuration) / heartbeatSecondPulseDuration;
                heartbeat = heartbeatMinOpacity + (heartbeatMaxOpacity - heartbeatMinOpacity) * Math.sin(pulseTime * Math.PI);
            } else if (cycle < heartbeatFirstPulseDuration + heartbeatSecondPulseDuration + heartbeatRestDuration) {
                // Rest period
                heartbeat = heartbeatMinOpacity;
            } else {
                // Should never reach here, but fallback to rest
                heartbeat = heartbeatMinOpacity;
            }
            
            // Clear and redraw with animated background opacity
            graphics.clear();
            
            // Redraw ring (at 0,0 - graphics object is positioned at center)
            graphics.lineStyle(ringOutterRadius, currentRingColor, ringOpacity);
            graphics.drawCircle(0, 0, ringRadius);
            
            // Redraw background with heartbeat animation
            graphics.beginFill(currentBackgroundColor, ringBackgroundOpacity * heartbeat);
            graphics.drawCircle(0, 0, ringRadius);
            graphics.endFill();
            
            // Redraw dots only if not stable
            if (shouldShowDots) {
                // Redraw success dots
                for (let i = 0; i < 3; i++) {
                let angle;
                if (i === 0) {
                    angle = Math.PI / 2; // 90° - directly at top
                } else if (i === 1) {
                    angle = Math.PI / 2 + Math.PI / dotSpacingNumSegments; // 120° - top right
                } else {
                    angle = Math.PI / 2 - Math.PI / dotSpacingNumSegments; // 60° - top left
                }
                const dotX = Math.cos(angle) * dotDistance;
                const dotY = Math.sin(angle) * dotDistance;
                
                graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity); 
                if (i < successes) {
                    graphics.beginFill(dotColorSuccess, dotColorOpacity);
                } else {
                    graphics.beginFill(dotColorEmpty, dotColorOpacity); 
                }
                graphics.drawCircle(dotX, dotY, dotRadius);
                graphics.endFill();
            }
            
            // Redraw failure dots
            for (let i = 0; i < 3; i++) {
                let angle;
                if (i === 0) {
                    angle = Math.PI / 2 + Math.PI; // 270° - directly at bottom
                } else if (i === 1) {
                    angle = Math.PI / 2 + Math.PI + Math.PI / dotSpacingNumSegments; // 300° - bottom right
                } else {
                    angle = Math.PI / 2 + Math.PI - Math.PI / dotSpacingNumSegments; // 240° - bottom left
                }
                const dotX = Math.cos(angle) * dotDistance;
                const dotY = Math.sin(angle) * dotDistance;
                
                graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity);
                if (i < failures) {
                    graphics.beginFill(dotColorFailure, dotColorOpacity);
                } else {
                    graphics.beginFill(dotColorEmpty, dotColorOpacity);
                }
                graphics.drawCircle(dotX, dotY, dotRadius);
                graphics.endFill();
            }
            } // Close shouldShowDots conditional in animation
        }; // Close the heartbeatAnimation function
        
        // Start the heartbeat animation
        canvas.app.ticker.add(heartbeatAnimation);
        
        // Store animation reference for cleanup
        graphics._heartbeatAnimation = heartbeatAnimation;
        
        // Position at token center
        graphics.position.set(center.x, center.y);
        
        // Set zIndex to render above turn indicator (higher = on top)
        graphics.zIndex = 100;
        
        // Add to canvas
        canvas.interface.addChild(graphics);
        this._deathSaveOverlays.set(token.id, graphics);
    } // Close _createOrUpdateDeathSaveOverlay function
    
    /**
     * Remove death save overlay for a token
     */
    static _removeDeathSaveOverlay(tokenId) {
        const graphics = this._deathSaveOverlays.get(tokenId);
        if (graphics) {
            // Remove heartbeat animation if it exists
            if (graphics._heartbeatAnimation) {
                canvas.app.ticker.remove(graphics._heartbeatAnimation);
            }
            
            canvas.interface.removeChild(graphics);
            graphics.destroy();
            this._deathSaveOverlays.delete(tokenId);
        }
    }
    
    /**
     * Remove all death save overlays
     */
    static _removeAllDeathSaveOverlays() {
        for (const [tokenId, graphics] of this._deathSaveOverlays) {
            canvas.interface.removeChild(graphics);
            graphics.destroy();
        }
        this._deathSaveOverlays.clear();
    }
    
    /**
     * Update death save overlay position (for token movement)
     */
    static _updateDeathSaveOverlayPosition(tokenId, changes = null) {
        const graphics = this._deathSaveOverlays.get(tokenId);
        if (!graphics) return;
        
        const token = canvas.tokens.get(tokenId);
        if (!token) return;
        
        // Calculate new center position using the same helper as turn indicator
        const center = TokenImageUtilities._calculateTokenCenter(token, changes);
        
        // Update PIXI graphics position (smooth movement, no recreation)
        graphics.x = center.x;
        graphics.y = center.y;
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
        
        // Enable sortable children for canvas.interface to support zIndex
        if (canvas?.interface) {
            canvas.interface.sortableChildren = true;
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
        
        // Initialize death save overlays for any tokens at 0 HP
        TokenImageUtilities.updateDeathSaveOverlays();
        
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
        
        // Register canvasReady hook via HookManager
        TokenImageUtilities._canvasReadyHookId = HookManager.registerHook({
            name: 'canvasReady',
            description: 'Token Image Utilities: Start continuous loop to hide default target indicators',
            context: 'token-utilities-hide-targets',
            priority: 3,
            callback: TokenImageUtilities._onCanvasReadyForHiding
        });
        
        // Register refreshToken hook via HookManager as backup
        TokenImageUtilities._refreshTokenHookId = HookManager.registerHook({
            name: 'refreshToken',
            description: 'Token Image Utilities: Hide target indicators on token refresh',
            context: 'token-utilities-hide-targets',
            priority: 3,
            callback: TokenImageUtilities._onRefreshTokenForHiding
        });
        
        // Apply to all existing tokens immediately
        TokenImageUtilities._hideAllTargetIndicators();
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Target hiding hooks registered", "", true, false);
    }
    
    /**
     * Canvas ready callback - starts the continuous hiding loop
     */
    static _onCanvasReadyForHiding() {
        const hideTargets = () => {
            TokenImageUtilities._hideAllTargetIndicators();
            TokenImageUtilities._hideTargetsAnimationId = requestAnimationFrame(hideTargets);
        };
        hideTargets();
    }
    
    /**
     * Refresh token callback - hide target indicators on token refresh
     */
    static _onRefreshTokenForHiding(token) {
        if (token.target) {
            token.target.visible = false;
        }
    }
    
    /**
     * Hide all target indicators on all tokens
     */
    static _hideAllTargetIndicators() {
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
        TokenImageUtilities._removeAllDeathSaveOverlays();
        
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
        
        // Unregister target hiding hooks
        if (TokenImageUtilities._canvasReadyHookId) {
            HookManager.unregisterHook('canvasReady', TokenImageUtilities._canvasReadyHookId);
            TokenImageUtilities._canvasReadyHookId = null;
        }
        
        if (TokenImageUtilities._refreshTokenHookId) {
            HookManager.unregisterHook('refreshToken', TokenImageUtilities._refreshTokenHookId);
            TokenImageUtilities._refreshTokenHookId = null;
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: All hooks unregistered and cleaned up", "", true, false);
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
        
        // Handle death save overlay movement
        if (TokenImageUtilities._deathSaveOverlays.has(tokenId)) {
            if (changes.x !== undefined || changes.y !== undefined) {
                TokenImageUtilities._updateDeathSaveOverlayPosition(tokenId, changes);
            }
        }
        
        // Handle token facing direction
        TokenImageUtilities._handleTokenFacing(tokenDocument, changes);
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
        const center = TokenImageUtilities._calculateTokenCenter(token);
        graphics.position.set(center.x, center.y);
        
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
     * Calculate token center position, handling changes if provided
     * @param {Token} token - The token to calculate position for
     * @param {Object} changes - Optional changes object with x/y coordinates
     * @returns {Object} - Object with x and y center coordinates
     */
    static _calculateTokenCenter(token, changes = null) {
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        
        const tokenX = changes?.x !== undefined ? changes.x : token.x;
        const tokenY = changes?.y !== undefined ? changes.y : token.y;
        
        return {
            x: tokenX + tokenWidth / 2,
            y: tokenY + tokenHeight / 2
        };
    }

    /**
     * Update turn indicator position (for token movement)
     */
    static _updateTurnIndicatorPosition(token, changes = null) {
        if (!TokenImageUtilities._turnIndicator || TokenImageUtilities._currentTurnTokenId !== token.id) {
            return;
        }

        const center = TokenImageUtilities._calculateTokenCenter(token, changes);
        
        // Update PIXI graphics position
        TokenImageUtilities._turnIndicator.x = center.x;
        TokenImageUtilities._turnIndicator.y = center.y;
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
        
        const center = TokenImageUtilities._calculateTokenCenter(token);
        graphics.position.set(center.x, center.y);
        
        postConsoleAndNotification(MODULE.NAME, `DEBUG: Adding graphics to canvas at position ${center.x}, ${center.y}`, "", true, false);
        
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
        
        const center = TokenImageUtilities._calculateTokenCenter(token, changes);
        
        graphics.x = center.x;
        graphics.y = center.y;
    }

    /**
     * Handle token facing direction based on movement
     */
    static async _handleTokenFacing(tokenDocument, changes) {
        // Check if token facing is enabled
        if (!getSettingSafely(MODULE.ID, 'enableTokenFacing', false)) {
            return;
        }

        // Only process if position changed
        if (changes.x === undefined && changes.y === undefined) {
            return;
        }

        // Get the token object
        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) return;

        // Respect the lock rotation setting
        if (tokenDocument.lockRotation) {
            return;
        }

        // Check facing mode
        const facingMode = getSettingSafely(MODULE.ID, 'tokenFacingMode', 'all');
        if (!TokenImageUtilities._shouldApplyFacing(token, facingMode)) {
            return;
        }

        // Calculate movement distance
        const oldX = token.x;
        const oldY = token.y;
        const newX = changes.x !== undefined ? changes.x : oldX;
        const newY = changes.y !== undefined ? changes.y : oldY;

        const deltaX = newX - oldX;
        const deltaY = newY - oldY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Check minimum distance threshold
        const minDistance = getSettingSafely(MODULE.ID, 'tokenFacingMinDistance', 0.5);
        const gridSize = canvas.grid.size;
        const minDistancePixels = minDistance * gridSize;

        if (distance < minDistancePixels) {
            return;
        }

        // Calculate rotation angle
        // Foundry uses degrees where 0 = right, 90 = down, 180 = left, 270 = up
        const angleRadians = Math.atan2(deltaY, deltaX);
        const angleDegrees = (angleRadians * 180 / Math.PI) - 90; // -90 to face the direction instead of showing back
        
        // Normalize to 0-360 range
        const normalizedAngle = ((angleDegrees % 360) + 360) % 360;

        // Apply rotation
        try {
            await tokenDocument.update({ rotation: normalizedAngle });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Token Facing Error", `Failed to rotate ${token.name}: ${error.message}`, false, false);
        }
    }

    /**
     * Check if token should have facing applied based on mode
     */
    static _shouldApplyFacing(token, facingMode) {
        switch (facingMode) {
            case 'all':
                return true;
            case 'playerOnly':
                return token.actor?.hasPlayerOwner || false;
            case 'npcOnly':
                return token.actor?.type === 'npc';
            case 'combatOnly':
                return game.combat?.getCombatantByToken(token.id) !== undefined;
            default:
                return true;
        }
    }
}
