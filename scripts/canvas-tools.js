// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_ID, MODULE_TITLE, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
import { COFFEEPUB } from './global.js';
// -- Load the shared GLOBAL functions --
import { postConsoleAndNotification, getTokenImage, getTokenId } from './global.js';

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
        Hooks.on('updateToken', this._updateNameplates.bind(this));
    }

    static _updateNameplates() {
        postConsoleAndNotification("Modifying Nameplates...", "", false, false, false);
        let tokens = canvas.tokens.placeables;
        let strNameplateFontsize = game.settings.get(MODULE_ID, 'nameplateFontSize') + "px";

        let strNameplateColor = game.settings.get(MODULE_ID, 'nameplateColor');
        let strNameplateOutlineSize = game.settings.get(MODULE_ID, 'nameplateOutlineSize');
        let strNameplateOutlineColor = game.settings.get(MODULE_ID, 'nameplateOutlineColor');
        let strNameplateFontFamily = game.settings.get(MODULE_ID, 'nameplateFontFamily');
        let color = parseInt((strNameplateColor.charAt(0) === '#' ? strNameplateColor.slice(1) : strNameplateColor), 16);
        let outlineColor = parseInt((strNameplateOutlineColor.charAt(0) === '#' ? strNameplateOutlineColor.slice(1) : strNameplateOutlineColor), 16);

        for (let token of tokens) {
            let nameplate = token.nameplate;
            if(nameplate) {  
                nameplate.style.fontSize = strNameplateFontsize;
                nameplate.style.fontFamily = strNameplateFontFamily; 
                nameplate.tint = color; 
                nameplate.stroke = outlineColor;
                nameplate.strokeThickness = parseInt(strNameplateOutlineSize);
            }
        }
    }

    // *** TOKEN NAMING ***
    static _initializeTokenNaming() {
        // Set the variable to track token count
        this.tokenCount = new Map();

        Hooks.on('createToken', this._onCreateToken.bind(this));
    }

    static async _onCreateToken(document, options, userId) {
        postConsoleAndNotification("Token(s) created on the scene. Modifying non-linked tokens...", "", false, false, false);
        const actorLink = document.actor?.isToken === false;
        let updatedName;
        let strTokenNameFormat = game.settings.get(MODULE_ID, 'tokenNameFormat');
        
        // Set the token name
        const tokenName = document.actor?.name || document.name;

        // String of tokens to be ignored
        const strIgnoredTokens = game.settings.get(MODULE_ID, 'ignoredTokens');
        // Boolean to determine if Fuzzy Matching is used
        const blnFuzzyMatch = game.settings.get(MODULE_ID, 'fuzzyMatch');
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
            postConsoleAndNotification("Ignored token ", tokenName + "detected per settings. Skipping token renaming.", false, false, false);
            return;
        }

        // Only modify tokens if not a linked actor. e.g a player
        if (!actorLink) {
            if (strTokenNameFormat == "name-replace" || strTokenNameFormat == "name-append-end" || strTokenNameFormat == "name-append-start" || strTokenNameFormat == "name-append-end-parenthesis" || strTokenNameFormat == "name-append-start-parenthesis" || strTokenNameFormat == "name-append-end-dash" || strTokenNameFormat == "name-append-start-dash" ) {
                // Append a name from a roll table to the token
                let strTableName = game.settings.get(MODULE_ID, 'tokenNameTable');
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
                            postConsoleAndNotification("Unable to retrieve name from roll table result", "", false, true, false);
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
                        postConsoleAndNotification("Result from name table came back empty.", "", false, true, false);
                        updatedName = document.actor.name;
                    }
                } else {
                    postConsoleAndNotification("No roll table selected in settings.", "", false, true, false);
                    updatedName = document.actor.name;
                }
            } else if (strTokenNameFormat == "number-append-end" || strTokenNameFormat == "number-append-end-parenthesis" || strTokenNameFormat == "number-append-end-dash") {
                // Append a number to the token name
                const baseName = document.actor.name;
                const count = this.tokenCount.get(baseName) || 0;
                this.tokenCount.set(baseName, count + 1);
                if (strTokenNameFormat == "number-append-end-parenthesis") {
                    updatedName = baseName + " (" + String(count + 1).padStart(2, '0') + ")";
                } else if (strTokenNameFormat == "number-append-end-dash") {
                    updatedName = baseName + " - " + String(count + 1).padStart(2, '0');
                } else {
                    updatedName = baseName + " " + String(count + 1).padStart(2, '0');
                }
            } else {
                // Do nothing
                updatedName = document.actor.name;
            }

            // Update the token
            if (document.actor && !document.actor.isToken) {
                // Update the linked actor's name
                await document.parent.update({name: updatedName});
                postConsoleAndNotification("Update the linked actor's name:", updatedName + ".", false, false, false);
            } else {
                // Update only the token's name
                await document.update({name: updatedName});
                postConsoleAndNotification("Update only the token's name:", updatedName + ".", false, false, false);
            }
            postConsoleAndNotification("The token name has been changed to ", updatedName + ".", false, false, false);
        } else {
            postConsoleAndNotification("The token is LINKED so the name has not been changed.", "", false, false, false);
        }
    }

    // *** TOKEN CONVERSION ***
    static _initializeTokenConversion() {
        // This will be implemented in the next phase
        // It will handle converting dead tokens to loot piles
    }
}
