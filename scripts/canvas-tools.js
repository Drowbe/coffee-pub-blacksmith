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
        Hooks.on('createToken', this._onCreateToken.bind(this));
    }

    static async _onCreateToken(document, options, userId) {
        // Check if user has permission to update tokens
        if (!game.user.isGM) {
            return;
        }
        
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
        // Check if Item Piles is installed
        if (!game.modules.get("item-piles")?.active) {
            postConsoleAndNotification("Item Piles module not installed. Token conversion disabled.", "", false, true, false);
            return;
        }
        
        // Watch for token HP changes
        Hooks.on("updateActor", this._checkTokenDeath.bind(this));
    }

    static async _checkTokenDeath(actor, changes) {
        // Exit if feature is disabled
        if (!game.settings.get(MODULE_ID, 'tokenConvertDeadToLoot')) return;
        
        try {
            // Check if HP changed to 0 or below
            const newHP = changes.system?.attributes?.hp?.value;
            if (newHP === undefined || newHP > 0) return;
            
            // Only convert non-player characters
            if (actor.type === "character") return;
            
            // Get the token
            const token = actor.getActiveTokens()[0];
            if (!token) return;
            
            // Start the conversion delay
            const delay = game.settings.get(MODULE_ID, 'tokenConvertDelay') * 1000;
            setTimeout(() => this._convertTokenToLoot(token), delay);
        } catch (error) {
            postConsoleAndNotification("Error checking token death:", error, false, true, false);
        }
    }

    static async _convertTokenToLoot(token) {
        try {
            // Check if user has permission to update tokens
            if (!game.user.isGM) {
                postConsoleAndNotification("Only Game Masters can convert tokens to loot.", "", false, true, false);
                return;
            }
            
            // Add loot from tables if configured
            const tables = [
                {setting: 'tokenLootTableTreasure', amount: 'tokenLootTableTreasureAmount'},
                {setting: 'tokenLootTableGear', amount: 'tokenLootTableGearAmount'},
                {setting: 'tokenLootTableGeneral', amount: 'tokenLootTableGeneralAmount'}
            ];
            
            // Roll loot from each configured table
            for (const table of tables) {
                const tableName = game.settings.get(MODULE_ID, table.setting);
                if (tableName && tableName !== "none") {
                    const amount = game.settings.get(MODULE_ID, table.amount);
                    try {
                        await game.itempiles.API.rollItemTable(tableName, {
                            timesToRoll: amount,
                            targetActor: token.actor,
                            options: {
                                suppressWarnings: true
                            }
                        });
                    } catch (error) {
                        postConsoleAndNotification(`Error rolling loot table ${tableName}:`, error, false, true, false);
                        continue; // Continue with next table even if this one fails
                    }
                }
            }
            
            // Add random coins
            await this._addRandomCoins(token.actor);

            // Set up proper permissions before converting to item pile
            const updates = {
                "permission.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, // Allow players to see
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
            
            // Update the image
            const newImage = game.settings.get(MODULE_ID, 'tokenLootPileImage');
            await token.document.update({img: newImage});
            
            // Apply TokenFX if available
            if (game.modules.get("tokenmagic")?.active) {
                await this._applyTokenEffect(token);
            }
            
            // Play sound
            const sound = game.settings.get(MODULE_ID, 'tokenLootSound');
            if (sound) {
                AudioHelper.play({src: sound, volume: 0.5, autoplay: true, loop: false}, true);
            }
            
            // Send chat message if enabled
            if (game.settings.get(MODULE_ID, 'tokenLootChatMessage')) {
                const messageData = {
                    isPublic: true,
                    theme: 'default',
                    isLootDrop: true,
                    tokenName: token.name
                };

                const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', messageData);

                await ChatMessage.create({
                    content: messageHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ alias: 'System' })
                });
            }
        } catch (error) {
            postConsoleAndNotification("Error converting token to loot:", error, false, true, false);
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
                imagePath: game.settings.get(MODULE_ID, 'tokenLootPileImage'),
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
            postConsoleAndNotification("Error applying token effect:", error, false, true, false);
        }
    }

    static async _addRandomCoins(actor) {
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
            
            postConsoleAndNotification("Added coins:", 
                `CP: ${rolls.cp.total}, SP: ${rolls.sp.total}, GP: ${rolls.gp.total}, PP: ${rolls.pp.total}`, 
                false, false, false);
                
        } catch (error) {
            postConsoleAndNotification("Error adding coins:", error, false, true, false);
        }
    }
}
