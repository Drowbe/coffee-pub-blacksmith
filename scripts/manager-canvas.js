// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
// COFFEEPUB now available globally via window.COFFEEPUB
// -- Load the shared GLOBAL functions --
import { postConsoleAndNotification, getTokenImage, getTokenId } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { TokenImageUtilities } from './token-image-utilities.js';

// ================================================================== 
// ===== CLASS DEFINITION ===========================================
// ================================================================== 

export class CanvasTools {
    static ID = 'canvas-tools';

    static initialize() {
        // Initialize token nameplate functionality
        this._initializeNameplates();
        // Initialize token naming functionality
        this._initializeTokenNaming();
        // Initialize token conversion functionality (dead to loot)
        this._initializeTokenConversion();
    }

    // *** TOKEN NAMEPLATES ***
    static _initializeNameplates() {
        Hooks.once('ready', this._updateNameplates.bind(this));
        const createTokenHookId = HookManager.registerHook({
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
        const preCreateTokenHookId = HookManager.registerHook({
			name: 'preCreateToken',
			description: 'Canvas Tools: Apply token behavior overrides before creation',
			context: 'manager-canvas-pre-create',
			priority: 3,
			callback: this._onPreCreateToken.bind(this)
		});
		
		// Hook for token behavior overrides on updates (runs before token updates)
		const preUpdateTokenHookId = HookManager.registerHook({
			name: 'preUpdateToken',
			description: 'Canvas Tools: Apply token behavior overrides before updates',
			context: 'manager-canvas-pre-update',
			priority: 3,
			callback: this._onPreUpdateToken.bind(this)
		});
		
		// Hook for token naming and other post-creation modifications
		const createTokenHookId = HookManager.registerHook({
			name: 'createToken',
			description: 'Canvas Tools: Handle token creation for naming and modifications',
			context: 'manager-canvas-create',
			priority: 3,
			callback: this._onCreateToken.bind(this)
		});
		
		// Hook for when tokens are added to the scene (runs after token creation but before rendering)
		const tokenAddedToSceneHookId = HookManager.registerHook({
			name: 'createToken',
			description: 'Canvas Tools: Handle tokens added to scene for behavior overrides',
			context: 'manager-canvas-scene-add',
			priority: 3,
			callback: this._onTokenAddedToScene.bind(this)
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
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: Setting value = ${tokenScale}, Type = ${typeof tokenScale}`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: Original tokenData.scale = ${tokenData.scale}`, "", true, false);
        if (tokenScale !== null && tokenScale !== undefined) {
            // Use FoundryVTT v12+ texture scaling
            if (tokenData.texture) {
                tokenData.texture.scaleX = tokenScale;
                tokenData.texture.scaleY = tokenScale;
                postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: Applied texture scale ${tokenScale} to token (v12+ style)`, "", true, false);
            } else {
                // Fallback for older versions
                tokenData.scale = tokenScale;
                postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: Applied legacy scale ${tokenScale} to token (v11 style)`, "", true, false);
            }
            changesMade.push(`set scale to ${tokenScale}`);
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: Skipped scale application (value: ${tokenScale})`, "", true, false);
        }
        
        // Apply token image fit mode setting
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        if (tokenFitMode && tokenFitMode !== 'contain') {
            // Use FoundryVTT v12+ texture fit mode
            if (tokenData.texture) {
                tokenData.texture.fit = tokenFitMode;
                postConsoleAndNotification(MODULE.NAME, `Token Fit Mode Debug: Applied texture fit mode ${tokenFitMode} to token (v12+ style)`, "", true, false);
            } else {
                // Fallback for older versions
                tokenData.fit = tokenFitMode;
                postConsoleAndNotification(MODULE.NAME, `Token Fit Mode Debug: Applied legacy fit mode ${tokenFitMode} to token (v11 style)`, "", true, false);
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
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        if (tokenScale !== null && tokenScale !== undefined) {
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
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        if (tokenFitMode && tokenFitMode !== 'contain') {
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
        const tokenScale = game.settings.get(MODULE.ID, 'setTokenScale');
        postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: _onTokenAddedToScene - Current token scale = ${tokenDocument.scale}, Setting scale = ${tokenScale}`, "", true, false);
        if (tokenScale !== null && tokenScale !== undefined) {
            // Use FoundryVTT v12+ texture scaling
            if (tokenDocument.texture) {
                updates["texture.scaleX"] = tokenScale;
                updates["texture.scaleY"] = tokenScale;
                postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: _onTokenAddedToScene - Will update texture scale to ${tokenScale} (v12+ style)`, "", true, false);
            } else {
                // Fallback for older versions
                updates.scale = tokenScale;
                postConsoleAndNotification(MODULE.NAME, `Token Scale Debug: _onTokenAddedToScene - Will update legacy scale to ${tokenScale} (v11 style)`, "", true, false);
            }
            changesMade.push(`set scale to ${tokenScale}`);
        }
        
        // Apply token image fit mode setting
        const tokenFitMode = game.settings.get(MODULE.ID, 'setTokenImageFitMode');
        if (tokenFitMode && tokenFitMode !== 'contain') {
            // Use FoundryVTT v12+ texture fit mode
            if (tokenDocument.texture) {
                updates["texture.fit"] = tokenFitMode;
                postConsoleAndNotification(MODULE.NAME, `Token Fit Mode Debug: _onTokenAddedToScene - Will update texture fit mode to ${tokenFitMode} (v12+ style)`, "", true, false);
            } else {
                // Fallback for older versions
                updates.fit = tokenFitMode;
                postConsoleAndNotification(MODULE.NAME, `Token Fit Mode Debug: _onTokenAddedToScene - Will update legacy fit mode to ${tokenFitMode} (v11 style)`, "", true, false);
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
                    const result = await table.roll({async: true});
    
                    if (result && result.results && result.results.length > 0) {
                        let strName;
                        if (result.results[0].text) {
                            // For newer versions of Foundry VTT
                            strName = result.results[0].text;
                        } else if (result.results[0].data && result.results[0].data.text) {
                            // For older versions of Foundry VTT
                            strName = result.results[0].data.text;
                        } else {
                            // If we can't find the text in either place, use a default value
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

    // *** TOKEN CONVERSION ***
    static _initializeTokenConversion() {
        // Check if Item Piles is installed
        if (!game.modules.get("item-piles")?.active) {
            postConsoleAndNotification(MODULE.NAME, "Item Piles module not installed. Token conversion disabled.", "", true, false);
            return;
        }
    }

    static async _applyTokenEffect(token) {
        try {
            const params = [{
                filterType: "polymorph",
                filterId: "tokenToLootPile",
                type: 3,
                padding: 70,
                magnify: 1,
                imagePath: game.settings.get(MODULE.ID, 'tokenLootPileImage'),
                animated: {
                    progress: {
                        active: true,
                        animType: "halfCosOscillation",
                        val1: 0,
                        val2: 100,
                        loops: 1,
                        loopDuration: 1000
                    }
                }
            }];
            
            await token.TMFXaddUpdateFilters(params);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error applying token effect:", error, true, false);
        }
    }

    /**
     * Roll a loot table and add results to an actor's inventory
     * @param {string} tableName - Name of the RollTable
     * @param {number} timesToRoll - How many times to roll the table
     * @param {Actor} actor - The actor to add items to
     */
    static async _rollLootTable(tableName, timesToRoll, actor) {
        try {
            postConsoleAndNotification(MODULE.NAME, `Looking for loot table: "${tableName}"`, "", true, false);
            
            // Find the table by name
            const table = game.tables.find(t => t.name === tableName);
            if (!table) {
                postConsoleAndNotification(MODULE.NAME, `Loot table "${tableName}" not found`, "", false, false);
                return;
            }
            
            postConsoleAndNotification(MODULE.NAME, `Found table "${tableName}", rolling ${timesToRoll} times`, "", true, false);
            
            // Roll the table multiple times
            for (let i = 0; i < timesToRoll; i++) {
                const roll = await table.draw({ displayChat: false });
                postConsoleAndNotification(MODULE.NAME, `Roll ${i+1} results:`, roll, true, false);
                
                if (!roll || !roll.results || roll.results.length === 0) {
                    continue;
                }
                
                // Process each result
                for (const result of roll.results) {
                    postConsoleAndNotification(MODULE.NAME, `Processing result - type: ${result.type}, text: ${result.text}, documentCollection: ${result.documentCollection}`, "", true, false);
                    
                    // Check if this result has a document reference (item from compendium)
                    // Type can be CONST.TABLE_RESULT_TYPES.DOCUMENT (2) or 'pack' depending on version
                    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT || result.type === 'pack' || result.documentCollection) {
                        postConsoleAndNotification(MODULE.NAME, `This is a document/pack result`, "", true, false);
                        
                        // Get the item from the result
                        let item = null;
                        
                        // Try to get the item from the documentCollection
                        if (result.documentCollection && result.documentId) {
                            postConsoleAndNotification(MODULE.NAME, `Getting item from pack: ${result.documentCollection}, ID: ${result.documentId}`, "", true, false);
                            const pack = game.packs.get(result.documentCollection);
                            if (pack) {
                                item = await pack.getDocument(result.documentId);
                                postConsoleAndNotification(MODULE.NAME, `Retrieved item:`, item, true, false);
                            } else {
                                postConsoleAndNotification(MODULE.NAME, `Pack not found: ${result.documentCollection}`, "", false, false);
                            }
                        }
                        
                        // If we found an item, add it to the actor
                        if (item) {
                            // Create a copy of the item data
                            const itemData = item.toObject();
                            
                            // Set quantity if the result has a quantity range
                            if (result.range && result.range[0] !== result.range[1]) {
                                const quantity = Math.floor(Math.random() * (result.range[1] - result.range[0] + 1)) + result.range[0];
                                if (itemData.system?.quantity !== undefined) {
                                    itemData.system.quantity = quantity;
                                }
                            }
                            
                            // Add the item to the actor
                            await actor.createEmbeddedDocuments('Item', [itemData]);
                            postConsoleAndNotification(MODULE.NAME, `Added ${itemData.name} to ${actor.name}`, "", false, false);
                        } else {
                            postConsoleAndNotification(MODULE.NAME, `Could not retrieve item from result`, "", false, false);
                        }
                    } else if (result.type === CONST.TABLE_RESULT_TYPES.TEXT || result.type === 'text') {
                        // Text result - just log it
                        postConsoleAndNotification(MODULE.NAME, `Loot table text result: ${result.text}`, "", true, false);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, `Unknown result type: ${result.type}`, "", true, false);
                    }
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error rolling loot table ${tableName}:`, error, false, false);
        }
    }

    static async _addRandomCoins(actor) {
        // Only GMs can add random coins to actors
        if (!game.user.isGM) {
            return;
        }
        
        try {
            const roll = await new Roll("1d100").evaluate();
            let coinRoll;
            
            if (roll.total <= 16) {
                coinRoll = {pp: "0", gp: "0", sp: "0", cp: "1d4"};
            } else if (roll.total <= 55) {
                coinRoll = {pp: "0", gp: "0", sp: "3d4", cp: "1d8"};
            } else if (roll.total <= 79) {
                coinRoll = {pp: "0", gp: "0", sp: "4d4", cp: "2d8"};
            } else if (roll.total <= 89) {
                coinRoll = {pp: "0", gp: "0", sp: "8d4", cp: "3d8"};
            } else if (roll.total <= 94) {
                coinRoll = {pp: "0", gp: "1d4", sp: "4d6", cp: "4d8"};
            } else if (roll.total <= 97) {
                coinRoll = {pp: "0", gp: "2d4", sp: "3d6", cp: "5d8"};
            } else if (roll.total <= 99) {
                coinRoll = {pp: "0", gp: "3d4", sp: "2d6", cp: "6d8"};
            } else {
                coinRoll = {pp: "1d2", gp: "4d4", sp: "1d6", cp: "7d8"};
            }
            
            const currency = actor.system.currency;
            const rolls = {};
            
            for (const [key, formula] of Object.entries(coinRoll)) {
                rolls[key] = await new Roll(formula).evaluate();
            }
            
            await actor.update({
                "system.currency.cp": currency.cp + rolls.cp.total,
                "system.currency.sp": currency.sp + rolls.sp.total,
                "system.currency.gp": currency.gp + rolls.gp.total,
                "system.currency.pp": currency.pp + rolls.pp.total
            });
            
            postConsoleAndNotification(MODULE.NAME, "Added coins:", 
                `CP: ${rolls.cp.total}, SP: ${rolls.sp.total}, GP: ${rolls.gp.total}, PP: ${rolls.pp.total}`, 
                false, false, false);
                
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error adding coins:", error, true, false);
        }
    }
}
