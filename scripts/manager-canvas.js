// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
// COFFEEPUB now available globally via window.COFFEEPUB
// -- Load the shared GLOBAL functions --
import { postConsoleAndNotification, getTokenImage, getTokenId, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// ================================================================== 
// ===== CLASS DEFINITION ===========================================
// ================================================================== 

export class CanvasTools {
    static ID = 'canvas-tools';
    
    // Hook IDs for cleanup
    static _nameplateCreateTokenHookId = null;
    static _preCreateTokenHookId = null;
    static _preUpdateTokenHookId = null;
    static _createTokenHookId = null;
    static _tokenAddedToSceneHookId = null;
    static _updateTokenRotationHookId = null;

    static initialize() {
        // Initialize token nameplate functionality
        this._initializeNameplates();
        // Initialize token naming functionality
        this._initializeTokenNaming();
        // Initialize token conversion functionality (dead to loot)
        this._initializeTokenConversion();
        
        // Register cleanup hook for module unload
        Hooks.once('ready', () => {
            HookManager.registerHook({
                name: 'unloadModule',
                description: 'CanvasTools: Cleanup on module unload',
                context: 'canvas-tools-cleanup',
                priority: 3,
                callback: (moduleId) => {
                    if (moduleId === MODULE.ID) {
                        CanvasTools.cleanup();
                    }
                }
            });
        });
    }

    // *** TOKEN NAMEPLATES ***
    static _initializeNameplates() {
        Hooks.once('ready', this._updateNameplates.bind(this));
        CanvasTools._nameplateCreateTokenHookId = HookManager.registerHook({
			name: 'createToken',
			description: 'Canvas Tools: Update nameplates when tokens are created',
			context: 'manager-canvas-nameplates',
			priority: 3,
			callback: this._updateNameplates.bind(this)
		});
    }

    static _updateNameplates(tokenDocument, options, userId) {
        // Only GMs can modify token nameplates
        if (!game.user.isGM) {
            return;
        }
        
        // Only process if we have a specific token (from createToken hook)
        if (!tokenDocument) {
            // Fallback: process all tokens (for ready hook)
            let tokens = canvas.tokens.placeables;
            for (let token of tokens) {
                this._updateSingleTokenNameplate(token);
            }
            return;
        }

        // Process only the newly created token
        const token = canvas.tokens.get(tokenDocument.id);
        if (token) {
            this._updateSingleTokenNameplate(token);
        }
    }

    static _updateSingleTokenNameplate(token) {
        if (!game.settings.get(MODULE.ID, 'nameplateStyleEnabled')) {
            return;
        }

        let strNameplateFontsize = game.settings.get(MODULE.ID, 'nameplateFontSize') + "px";
        let strNameplateColor = game.settings.get(MODULE.ID, 'nameplateColor');
        let strNameplateOutlineSize = game.settings.get(MODULE.ID, 'nameplateOutlineSize');
        let strNameplateOutlineColor = game.settings.get(MODULE.ID, 'nameplateOutlineColor');
        let strNameplateFontFamily = game.settings.get(MODULE.ID, 'nameplateFontFamily');
        let color = parseInt((strNameplateColor.charAt(0) === '#' ? strNameplateColor.slice(1) : strNameplateColor), 16);
        let outlineColor = parseInt((strNameplateOutlineColor.charAt(0) === '#' ? strNameplateOutlineColor.slice(1) : strNameplateOutlineColor), 16);

        let nameplate = token.nameplate;
        if(nameplate) {  
            nameplate.style.fontSize = strNameplateFontsize;
            nameplate.style.fontFamily = strNameplateFontFamily; 
            nameplate.tint = color; 
            nameplate.stroke = outlineColor;
            nameplate.strokeThickness = parseInt(strNameplateOutlineSize);
        }
    }

    // *** TOKEN NAMING ***
    static _initializeTokenNaming() {
        // Hook for token behavior overrides (runs before token creation)
        CanvasTools._preCreateTokenHookId = HookManager.registerHook({
			name: 'preCreateToken',
			description: 'Canvas Tools: Apply token behavior overrides before creation',
			context: 'manager-canvas-pre-create',
			priority: 3,
			callback: this._onPreCreateToken.bind(this)
		});
		
		// Hook for token behavior overrides on updates (runs before token updates)
		CanvasTools._preUpdateTokenHookId = HookManager.registerHook({
			name: 'preUpdateToken',
			description: 'Canvas Tools: Apply token behavior overrides before updates',
			context: 'manager-canvas-pre-update',
			priority: 3,
			callback: this._onPreUpdateToken.bind(this)
		});
		
		// Hook for token naming and other post-creation modifications
		CanvasTools._createTokenHookId = HookManager.registerHook({
			name: 'createToken',
			description: 'Canvas Tools: Handle token creation for naming and modifications',
			context: 'manager-canvas-create',
			priority: 3,
			callback: this._onCreateToken.bind(this)
		});
		
		// Hook for when tokens are added to the scene (runs after token creation but before rendering)
        CanvasTools._tokenAddedToSceneHookId = HookManager.registerHook({
			name: 'createToken',
			description: 'Canvas Tools: Handle tokens added to scene for behavior overrides',
			context: 'manager-canvas-scene-add',
			priority: 3,
			callback: this._onTokenAddedToScene.bind(this)
		});

        CanvasTools._updateTokenRotationHookId = HookManager.registerHook({
			name: 'updateToken',
			description: 'Canvas Tools: Apply token facing rotation after movement',
			context: 'manager-canvas-token-rotation',
			priority: 3,
			callback: this._onUpdateTokenRotation.bind(this)
		});
    }

    // *** TOKEN BEHAVIOR OVERRIDES ***
    // These methods apply token behavior overrides based on settings:
    // - unlockTokenRotation: Unlocks token rotation for all new tokens
    // - disableTokenRing: Disables token ring display for all new tokens  
    // - setTokenScale: Sets the scale size for all new tokens
    // - setTokenImageFitMode: Sets the image fit mode for all new tokens
    static _onPreCreateToken(tokenData, options, userId) {
        // Apply token behavior overrides based on settings
        let changesMade = [];
        
        if (game.settings.get(MODULE.ID, 'unlockTokenRotation')) {
            tokenData.lockRotation = false;
            changesMade.push('unlocked rotation');
        }
        if (game.settings.get(MODULE.ID, 'disableTokenRing')) {
            // Ensure ring object exists and set enabled to false
            if (!tokenData.ring) {
                tokenData.ring = {};
            }
            tokenData.ring.enabled = false;
            changesMade.push('disabled ring');
        }
        
        // Apply token scale setting
        const tokenScaleEnabled = game.settings.get(MODULE.ID, 'setTokenScaleEnabled');
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        if (tokenScaleEnabled && tokenScale !== null && tokenScale !== undefined) {
            // Use FoundryVTT v12+ texture scaling
            if (tokenData.texture) {
                tokenData.texture.scaleX = tokenScale;
                tokenData.texture.scaleY = tokenScale;
            } else {
                // Fallback for older versions
                tokenData.scale = tokenScale;
            }
            changesMade.push(`set scale to ${tokenScale}`);
        }
        
        // Apply token image fit mode setting
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        const tokenFitModeEnabled = game.settings.get(MODULE.ID, 'setTokenImageFitModeEnabled');
        if (tokenFitModeEnabled && tokenFitMode) {
            // Use FoundryVTT v12+ texture fit mode
            if (tokenData.texture) {
                tokenData.texture.fit = tokenFitMode;
            } else {
                // Fallback for older versions
                tokenData.fit = tokenFitMode;
            }
            changesMade.push(`set fit mode to ${tokenFitMode}`);
        }
        
        // Log changes if any were made
        if (changesMade.length > 0) {
            const tokenName = tokenData.name || 'Unknown Token';
            postConsoleAndNotification(MODULE.NAME, `Applied token overrides for ${tokenName}: ${changesMade.join(', ')}`, "", true, false);
        }
        
        return true;
    }

    static _onPreUpdateToken(tokenDocument, changes, options, userId) {
        // Only GMs can apply token behavior overrides
        if (!game.user.isGM) {
            return;
        }
        
        // Apply token behavior overrides on updates to maintain settings
        let changesMade = [];
        
        if (game.settings.get(MODULE.ID, 'unlockTokenRotation') && changes.lockRotation === true) {
            changes.lockRotation = false;
            changesMade.push('maintained unlocked rotation');
        }
        if (game.settings.get(MODULE.ID, 'disableTokenRing') && changes.ring?.enabled === true) {
            if (!changes.ring) {
                changes.ring = {};
            }
            changes.ring.enabled = false;
            changesMade.push('maintained disabled ring');
        }
        
        // Apply token scale setting on updates
        const tokenScaleEnabled = game.settings.get(MODULE.ID, 'setTokenScaleEnabled');
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        if (tokenScaleEnabled && tokenScale !== null && tokenScale !== undefined) {
            // Use FoundryVTT v12+ texture scaling
            if (tokenDocument.texture) {
                changes["texture.scaleX"] = tokenScale;
                changes["texture.scaleY"] = tokenScale;
            } else {
                // Fallback for older versions
                changes.scale = tokenScale;
            }
            changesMade.push(`maintained scale at ${tokenScale}`);
        }
        
        // Apply token image fit mode setting on updates
        const tokenFitModeEnabled = game.settings.get(MODULE.ID, 'setTokenImageFitModeEnabled');
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        if (tokenFitModeEnabled && tokenFitMode) {
            // Use FoundryVTT v12+ texture fit mode
            if (tokenDocument.texture) {
                changes["texture.fit"] = tokenFitMode;
            } else {
                // Fallback for older versions
                changes.fit = tokenFitMode;
            }
            changesMade.push(`maintained fit mode at ${tokenFitMode}`);
        }
        
        // Log changes if any were made
        if (changesMade.length > 0) {
            const tokenName = tokenDocument.name || 'Unknown Token';
            // Debug message removed for cleaner console output
        }
        
        return true;
    }

    // *** TOKEN SCENE OVERRIDES ***
    static async _onTokenAddedToScene(tokenDocument, options, userId) {
        // Only GMs can apply token behavior overrides
        if (!game.user.isGM) {
            return;
        }
        
        // Apply token behavior overrides after token is created but before it's fully rendered
        let changesMade = [];
        let updates = {};
        
        if (game.settings.get(MODULE.ID, 'unlockTokenRotation') && tokenDocument.lockRotation === true) {
            updates.lockRotation = false;
            changesMade.push('unlocked rotation');
        }
        if (game.settings.get(MODULE.ID, 'disableTokenRing') && tokenDocument.ring?.enabled === true) {
            if (!updates.ring) {
                updates.ring = { ...tokenDocument.ring };
            }
            updates.ring.enabled = false;
            changesMade.push('disabled ring');
        }
        
        // Apply token scale setting
        const tokenScaleEnabled = game.settings.get(MODULE.ID, 'setTokenScaleEnabled');
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        if (tokenScaleEnabled && tokenScale !== null && tokenScale !== undefined) {
            // Use FoundryVTT v12+ texture scaling
            if (tokenDocument.texture) {
                updates["texture.scaleX"] = tokenScale;
                updates["texture.scaleY"] = tokenScale;
            } else {
                // Fallback for older versions
                updates.scale = tokenScale;
            }
            changesMade.push(`set scale to ${tokenScale}`);
        }
        
        // Apply token image fit mode setting
        const tokenFitModeEnabled = game.settings.get(MODULE.ID, 'setTokenImageFitModeEnabled');
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        if (tokenFitModeEnabled && tokenFitMode) {
            // Use FoundryVTT v12+ texture fit mode
            if (tokenDocument.texture) {
                updates["texture.fit"] = tokenFitMode;
            } else {
                // Fallback for older versions
                updates.fit = tokenFitMode;
            }
            changesMade.push(`set fit mode to ${tokenFitMode}`);
        }
        
        // Apply updates if any changes were made
        if (changesMade.length > 0) {
            try {
                await tokenDocument.update(updates);
                const tokenName = tokenDocument.name || 'Unknown Token';
                postConsoleAndNotification(MODULE.NAME, `Applied token overrides for ${tokenName}: ${changesMade.join(', ')}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Error applying token overrides: ${error}`, "", false, false);
            }
        }
    }

    static async _onCreateToken(document, options, userId) {
        // Check if user has permission to update tokens
        if (!game.user.isGM) {
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token(s) created on the scene. Modifying non-linked tokens...", "", true, false);
        const actorLink = document.actor?.isToken === false;
        let updatedName;
        let strTokenNameFormat = game.settings.get(MODULE.ID, 'tokenNameFormat');
        
        // Set the token name
        const tokenName = document.actor?.name || document.name;

        // String of tokens to be ignored
        const strIgnoredTokens = game.settings.get(MODULE.ID, 'ignoredTokens');
        // Boolean to determine if Fuzzy Matching is used
        const blnFuzzyMatch = game.settings.get(MODULE.ID, 'fuzzyMatch');
        // Split the string into an array
        const arrIgnoredTokens = strIgnoredTokens.split(',');
        // Check to see if ignored
        const isIgnoredToken = arrIgnoredTokens.some(ignoredToken => {
            ignoredToken = ignoredToken.trim().toLowerCase(); // Convert to lower case
            // If fuzzy match, check if token contains ignoredToken
            if (blnFuzzyMatch) return tokenName.toLowerCase().includes(ignoredToken); // Convert to lower case and check
            // If exact match, check if token equals ignoredToken
            return tokenName.toLowerCase() === ignoredToken; // Convert to lower case and check
        });

        // if it is ignored, exit the function
        if (isIgnoredToken) {
            postConsoleAndNotification(MODULE.NAME, "Ignored token " + tokenName + " detected per settings. Skipping token renaming.", "", true, false);
            return;
        }

        // Only modify tokens if not a linked actor. e.g a player
        if (!actorLink) {
            if (strTokenNameFormat == "name-replace" || strTokenNameFormat == "name-append-end" || strTokenNameFormat == "name-append-start" || strTokenNameFormat == "name-append-end-parenthesis" || strTokenNameFormat == "name-append-start-parenthesis" || strTokenNameFormat == "name-append-end-dash" || strTokenNameFormat == "name-append-start-dash" ) {
                // Append a name from a roll table to the token
                let strTableName = game.settings.get(MODULE.ID, 'tokenNameTable');
                if (strTableName) {
                    const table = game.tables.getName(strTableName);
                    if (!table) {
                        postConsoleAndNotification(MODULE.NAME, `Roll table "${strTableName}" not found. Skipping token name modification.`, "", false, false);
                        updatedName = document.actor.name;
                    } else {
                        const result = await table.roll();
    
                    if (result && result.results && result.results.length > 0) {
                        let strName;
                        const firstResult = result.results[0];
                        // v13: TableResult#text is deprecated, use name or description instead
                        if (firstResult.name) {
                            strName = firstResult.name;
                        } else if (firstResult.description) {
                            strName = firstResult.description;
                        } else {
                            // If we can't find the name, use a default value
                            strName = "Unknown";
                            postConsoleAndNotification(MODULE.NAME, "Unable to retrieve name from roll table result", "", true, false);
                        }
                        let strToken = document.actor.name;
                        if (strTokenNameFormat == "name-append-start") {
                            updatedName = strName + " " + strToken ;
                        } else if(strTokenNameFormat == "name-append-end-parenthesis") {
                            updatedName = strToken + " (" + strName + ")";
                        } else if(strTokenNameFormat == "name-append-start-parenthesis") {
                            updatedName = strName + " (" + strToken + ")";
                        } else if(strTokenNameFormat == "name-append-end-dash") {
                            updatedName = strToken + " - " + strName;
                        } else if(strTokenNameFormat == "name-append-start-dash") {
                            updatedName = strName + " - " + strToken;
                        } else if(strTokenNameFormat == "name-replace") {
                            updatedName = strName;
                        } else {
                            updatedName = strToken + " " + strName;
                        }
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "Result from name table came back empty.", "", true, false);
                        updatedName = document.actor.name;
                    }
                    }
                } else {
                    postConsoleAndNotification(MODULE.NAME, "No roll table selected in settings.", "", true, false);
                    updatedName = document.actor.name;
                }
            } else if (strTokenNameFormat == "number-append-end" || strTokenNameFormat == "number-append-end-parenthesis" || strTokenNameFormat == "number-append-end-dash") {
                // Append a number to the token name
                const baseName = document.actor.name;
                // Count existing tokens with the same base name on the current scene
                const existingTokens = canvas.tokens.placeables.filter(token => {
                    if (token.id === document.id) return false;
                    // Check if token name starts with base name followed by number patterns
                    const tokenName = token.name;
                    const actorName = token.actor?.name;
                    
                    // Exact match for base name
                    if (actorName === baseName || tokenName === baseName) return true;
                    
                    // Check for number patterns: "Goblin 01", "Goblin (01)", "Goblin - 01"
                    const numberPatterns = [
                        new RegExp(`^${baseName}\\s+\\d+$`), // "Goblin 01"
                        new RegExp(`^${baseName}\\s+\\(\\d+\\)$`), // "Goblin (01)"
                        new RegExp(`^${baseName}\\s+-\\s+\\d+$`) // "Goblin - 01"
                    ];
                    
                    return numberPatterns.some(pattern => pattern.test(tokenName));
                });
                const count = existingTokens.length + 1;
                if (strTokenNameFormat == "number-append-end-parenthesis") {
                    updatedName = baseName + " (" + String(count).padStart(2, '0') + ")";
                } else if (strTokenNameFormat == "number-append-end-dash") {
                    updatedName = baseName + " - " + String(count).padStart(2, '0');
                } else {
                    updatedName = baseName + " " + String(count).padStart(2, '0');
                }
            } else {
                // Do nothing
                updatedName = document.actor.name;
            }

            // Update the token
            if (document.actor && !document.actor.isToken) {
                // Update the linked actor's name
                await document.parent.update({name: updatedName});
                postConsoleAndNotification(MODULE.NAME, "Update the linked actor's name: " + updatedName, "", true, false);
            } else {
                // Update only the token's name
                await document.update({name: updatedName});
                postConsoleAndNotification(MODULE.NAME, "Update only the token's name: " + updatedName, "", true, false);
            }
            postConsoleAndNotification(MODULE.NAME, "The token name has been changed to " + updatedName, "", true, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, "The token is LINKED so the name has not been changed.", "", true, false);
        }
    }

    static async _onUpdateTokenRotation(tokenDocument, changes, options, userId) {
        if (!game.settings.get(MODULE.ID, 'enableTokenRotation')) {
            return;
        }

        if (changes.x === undefined && changes.y === undefined) {
            return;
        }

        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) {
            return;
        }

        if (!game.user.isGM) {
            const hasOwner = token.actor?.hasPlayerOwner;
            const canControl = token.actor?.testUserPermission(game.user, 'OWNER');
            if (!hasOwner || !canControl) {
                return;
            }
        }

        if (tokenDocument.lockRotation) {
            return;
        }

        const facingMode = game.settings.get(MODULE.ID, 'tokenRotationMode');
        if (!this._shouldApplyTokenRotation(token, facingMode)) {
            return;
        }

        const oldX = token.x;
        const oldY = token.y;
        const newX = changes.x !== undefined ? changes.x : oldX;
        const newY = changes.y !== undefined ? changes.y : oldY;
        const deltaX = newX - oldX;
        const deltaY = newY - oldY;
        const distance = Math.hypot(deltaX, deltaY);

        const minDistance = game.settings.get(MODULE.ID, 'tokenRotationMinDistance');
        const minDistancePixels = minDistance * canvas.grid.size;
        if (distance < minDistancePixels) {
            return;
        }

        const angleRadians = Math.atan2(deltaY, deltaX);
        const angleDegrees = (angleRadians * 180 / Math.PI) - 90;
        const normalizedAngle = ((angleDegrees % 360) + 360) % 360;

        try {
            await tokenDocument.update({ rotation: normalizedAngle });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token rotation failed for ${token.name}`, error, false, false);
        }
    }

    static _shouldApplyTokenRotation(token, facingMode) {
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

    // *** TOKEN CONVERSION ***
    static _initializeTokenConversion() {
        // Check if Item Piles is installed
        if (!game.modules.get("item-piles")?.active) {
            postConsoleAndNotification(MODULE.NAME, "Item Piles module not installed. Token conversion disabled.", "", true, false);
            return;
        }
    }

    /**
     * Clean up all hooks and resources
     */
    static cleanup() {
        // Unregister nameplate hooks
        if (CanvasTools._nameplateCreateTokenHookId) {
            HookManager.unregisterHook({
                name: 'createToken',
                callbackId: CanvasTools._nameplateCreateTokenHookId
            });
            CanvasTools._nameplateCreateTokenHookId = null;
        }
        
        // Unregister token naming hooks
        if (CanvasTools._preCreateTokenHookId) {
            HookManager.unregisterHook({
                name: 'preCreateToken',
                callbackId: CanvasTools._preCreateTokenHookId
            });
            CanvasTools._preCreateTokenHookId = null;
        }
        
        if (CanvasTools._preUpdateTokenHookId) {
            HookManager.unregisterHook({
                name: 'preUpdateToken',
                callbackId: CanvasTools._preUpdateTokenHookId
            });
            CanvasTools._preUpdateTokenHookId = null;
        }
        
        if (CanvasTools._createTokenHookId) {
            HookManager.unregisterHook({
                name: 'createToken',
                callbackId: CanvasTools._createTokenHookId
            });
            CanvasTools._createTokenHookId = null;
        }
        
        if (CanvasTools._tokenAddedToSceneHookId) {
            HookManager.unregisterHook({
                name: 'createToken',
                callbackId: CanvasTools._tokenAddedToSceneHookId
            });
            CanvasTools._tokenAddedToSceneHookId = null;
        }

        if (CanvasTools._updateTokenRotationHookId) {
            HookManager.unregisterHook({
                name: 'updateToken',
                callbackId: CanvasTools._updateTokenRotationHookId
            });
            CanvasTools._updateTokenRotationHookId = null;
        }
        
        postConsoleAndNotification(MODULE.NAME, "CanvasTools: All hooks unregistered and cleaned up", "", true, false);
    }
}
