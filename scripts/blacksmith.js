// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH, API_VERSION } from './const.js';

// *** BEGIN: GLOBAL IMPORTS ***
// *** These should be the same across all modules
// -- Import the shared GLOBAL variables --
import { COFFEEPUB, MODULE_AUTHOR } from './global.js';
// -- Load the shared GLOBAL functions --
import { registerBlacksmithUpdatedHook, resetModuleSettings, getOpenAIReplyAsHtml} from './global.js';
// -- Global utilities --
import { postConsoleAndNotification, rollCoffeePubDice, playSound, getActorId, getTokenImage, getPortraitImage, getTokenId, objectToString, stringToObject,trimString, generateFormattedDate, toSentenceCase, convertSecondsToRounds} from './global.js';
// *** END: GLOBAL IMPORTS ***

// -- COMMON Imports --
import { createJournalEntry, createHTMLList, buildCompendiumLinkActor } from './common.js';

// -- Import special page variables --
// Register settings so they can be loaded below.
import { registerSettings } from './settings.js';
import { BlacksmithWindowQuery } from './window-query.js';
import { BlacksmithLayer } from './canvas-layer.js';
import { addToolbarButton } from './toolbar.js';
import { CombatTimer } from './combat-timer.js';
import { PlanningTimer } from './planning-timer.js';
import { RoundTimer } from './round-timer.js';
import { CombatStats } from './combat-stats.js';
import { CPBPlayerStats } from './player-stats.js';
import { ChatPanel } from './chat-panel.js';
import { VoteManager } from './vote-manager.js';
import { WrapperManager } from './wrapper-manager.js';
import { ModuleManager } from './module-manager.js';
import { UtilsManager } from './utils-manager.js';
import { StatsAPI } from './stats-api.js';
import { CanvasTools } from './canvas-tools.js';
import { CombatTracker } from './combat-tracker.js';
import { LatencyChecker } from './latency-checker.js';
import { EncounterToolbar } from './encounter-toolbar.js';
import { CSSEditor } from './css-editor.js';

// ================================================================== 
// ===== SET UP THE MODULE ==========================================
// ================================================================== 

// ***************************************************
// ** BLACKSMITH VARIABLE UPDATE
// ***************************************************
// This must load up to to be available on the page.
BLACKSMITH.updateValue = function(key, value) {
    this[key] = value;
    // Signal to other modules that the variable has been updated
    postConsoleAndNotification("A Global Vairable has been updated.", "KEY: " + key + " | VALUE: " + value, false, true, false);
    Hooks.callAll("blacksmithUpdated", this);
}

// ***************************************************
// ** SETTINGS
// ***************************************************
// Ensure the settings are registered before anything else
// Register the Blacksmith hook
registerBlacksmithUpdatedHook();
// Register the settings
postConsoleAndNotification("Registering settings...", "", false, false, false);    
await registerSettings();

// ================================================================== 
// ===== REGISTER HOOKS =============================================
// ================================================================== 

Hooks.once('ready', () => {
    // Initialize combat stats tracking
    CombatStats.initialize();

    // Initialize player stats tracking
    CPBPlayerStats.initialize();

    // Apply any existing custom CSS
    const editor = new CSSEditor();
    const css = game.settings.get(MODULE_ID, 'customCSS');
    const transition = game.settings.get(MODULE_ID, 'cssTransition');
    if (css) {
        editor.applyCSS(css, transition);
    }
});

// ***************************************************
// ** INIT
// ***************************************************

// Function to inject BlacksmithLayer into the canvas layers list
const hookCanvas = () => {
    // Inject BlacksmithLayer into the canvas layers list
    const origLayers = CONFIG.Canvas.layers;
    CONFIG.Canvas.layers = Object.keys(origLayers).reduce((layers, key) => {
        layers[key] = origLayers[key];

        // Inject blacksmith layer after walls (or any other layer you prefer)
        if (key === 'walls') {
            layers['blacksmith-utilities-layer'] = {
                layerClass: BlacksmithLayer,
                group: "interface" // or "interface", depending on your needs
            };
        }

        return layers;
    }, {});
};

// Call the hookCanvas function during the initialization phase
Hooks.once('init', async function() {
    postConsoleAndNotification("Blacksmith | Initializing coffee-pub-blacksmith", "", false, true, false);
    
    // Initialize ModuleManager first
    ModuleManager.initialize();
    
    // Initialize UtilsManager
    UtilsManager.initialize();
    
    // Initialize socket handlers
    const socketlibModule = game.modules.get('socketlib');
    if (socketlibModule?.active) {
        const socketlib = socketlibModule.api;
        if (socketlib) {
            const socket = socketlib.registerModule(MODULE_ID);
            
            // Register skill roll handler
            socket.register('updateSkillRoll', (data) => {
                if (game.user.isGM) {
                    // Find any open BlacksmithWindowQuery instances
                    const windows = Object.values(ui.windows).filter(w => w instanceof BlacksmithWindowQuery);
                    windows.forEach(window => {
                        // Find the input field and update it
                        const inputField = window.element[0].querySelector(`#inputDiceValue-${data.workspaceId}`);
                        const skillSelect = window.element[0].querySelector(`#optionSkill-${data.workspaceId}`);
                        if (inputField) {
                            inputField.value = data.rollTotal;
                        }
                        if (skillSelect) {
                            skillSelect.value = data.skillName;
                        }
                    });
                }
            });

            // Register CSS update handler
            socket.register('updateCSS', (data) => {
                const editor = new CSSEditor();
                editor.applyCSS(data.css, data.transition);
            });

            // Store socket for use in other parts of the module
            game.modules.get(MODULE_ID).socket = socket;
        } else {
            console.warn('Blacksmith | SocketLib API not found, some features may be limited');
        }
    } else {
        console.warn('Blacksmith | SocketLib module not active, some features may be limited');
    }
    
    // Register chat message click handler for skill rolls
    Hooks.on('renderChatMessage', (message, html) => {
        if (message.flags?.['coffee-pub-blacksmith']?.type === 'skillCheck') {
            BlacksmithWindowQuery.handleChatMessageClick(message, html);
        }
    });
    
    // Expose our API on the module
    const module = game.modules.get(MODULE_ID);
    module.api = {
        ModuleManager,
        registerModule: ModuleManager.registerModule.bind(ModuleManager),
        isModuleActive: ModuleManager.isModuleActive.bind(ModuleManager),
        getModuleFeatures: ModuleManager.getModuleFeatures.bind(ModuleManager),
        utils: UtilsManager.getUtils(),
        version: API_VERSION,
        BLACKSMITH: BLACKSMITH,
        stats: StatsAPI
    };
    
    // Initialize other systems
    ChatPanel.initialize();
    hookCanvas();
    addToolbarButton();

    // Set up socket handler for CSS updates
    game.socket.on(`module.${MODULE_ID}`, data => {
        if (data.type === 'updateCSS') {
            const editor = new CSSEditor();
            editor.applyCSS(data.css, data.transition);
        }
        // Handle skill roll updates
        else if (data.type === 'updateSkillRoll' && game.user.isGM) {

            console.log("BLACKSMITH | SKILLROLLL | LOCATION CHECK: We are in blacksmith.js and in game.socket.on...");

            (async () => {
                const message = game.messages.get(data.data.messageId);
                if (!message) return;

                const flags = message.flags['coffee-pub-blacksmith'];
                if (!flags?.type === 'skillCheck') return;

                // Update the actors array with the new result
                const actors = flags.actors.map(a => ({
                    ...a,
                    result: a.id === data.data.actorId ? data.data.result : a.result
                }));

                // Update the message content
                const messageData = {
                    ...flags,
                    actors
                };

                const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
                await message.update({ 
                    content,
                    flags: {
                        'coffee-pub-blacksmith': messageData
                    }
                });

                // Play sound for individual rolls (not group rolls)
                const isGroupRoll = messageData.isGroupRoll;
                const dc = messageData.dc;
                // Find the actor who just rolled (if possible)
                let actorResult = null;
                if (Array.isArray(messageData.actors) && messageData.actors.length > 0) {
                    // Try to find the actor whose result was just updated (has a result object with total)
                    actorResult = messageData.actors.find(a => a.result && typeof a.result.total === 'number');
                }
                if (!isGroupRoll) {
                    if (dc && actorResult && typeof actorResult.result.total === 'number') {
                        if (actorResult.result.total >= Number(dc)) {
                            playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Success
                        } else {
                            playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL); // Failure
                        }
                    } else {
                        playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Default to success sound
                    }
                } else {
                    // Existing group roll sound logic (unchanged)
                    playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL);
                }

                // If this was a requested roll, update the GM's interface
                if (flags.requesterId === game.user.id) {
                    const windows = Object.values(ui.windows).filter(w => w instanceof BlacksmithWindowQuery);
                    windows.forEach(window => {
                        const inputField = window.element[0].querySelector(`input[name="diceValue"]`);
                        if (inputField) {
                            inputField.value = data.data.result.total;
                        }
                    });
                }
            })().catch(error => {
                console.error("Error handling skill roll update:", error);
            });
        }
    });
    
    postConsoleAndNotification("BLACKSMITH: Custom layer injected into canvas layers", CONFIG.Canvas.layers, false, true, false);
    postConsoleAndNotification("Canvas is ready. Initializing toolbar...", "", false, false, false);

    // COMBAT TIMER
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing CombatTimer...", "", false, true, false);
    CombatTimer.initialize();
    // PLANNING TIMER
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing PlanningTimer...", "", false, true, false);
    PlanningTimer.initialize();
    // ROUND TIMER
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing RoundTimer...", "", false, true, false);
    RoundTimer.initialize();
    // COMBAT TRACKER
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing CombatTracker...", "", false, true, false);
    CombatTracker.initialize();

    // VOTE MANAGER
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing VoteManager...", "", false, true, false);
    VoteManager.initialize();
    
    // ENCOUNTER TOOLBAR
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing EncounterToolbar...", "", false, true, false);
    EncounterToolbar.init();

    // Initialize CanvasTools
    postConsoleAndNotification("BLACKSMITH: In blacksmith.js and Initializing CanvasTools...", "", false, true, false);
    CanvasTools.initialize();
});

// Initialize WrapperManager after libWrapper is ready
Hooks.once('ready', async function() {
    postConsoleAndNotification("Blacksmith | Initializing WrapperManager", "", false, true, false);
    WrapperManager.initialize();
    
    // Initialize combat stats tracking
    CombatStats.initialize();

    // Initialize player stats tracking
    CPBPlayerStats.initialize();

    // Initialize latency checker
    postConsoleAndNotification("Initializing LatencyChecker", "", false, true, false);
    LatencyChecker.initialize();
});

// ***************************************************
// ** UTILITY Scene Clicks
// ***************************************************

Hooks.on("ready", function () {
    let blnShowIcons = game.settings.get(MODULE_ID, 'enableSceneInteractions');
    let blnCustomClicks = game.settings.get(MODULE_ID, 'enableSceneClickBehaviors');
    
    // Initial icon update if enabled
    if (blnShowIcons) {
        WrapperManager._updateSceneIcons();
    }

    // Register for scene updates
    if (blnShowIcons || blnCustomClicks) {
        // Register canvas hooks
        if (blnCustomClicks) {
            // Keep the canvasInit hook to initialize the toolbar
            Hooks.once('canvasInit', () => {
                postConsoleAndNotification("Initializing custom canvas layers", "", false, true, false);
                postConsoleAndNotification("Current Canvas Layers:", CONFIG.Canvas.layers, false, true, false);
            });

            // Keep the canvasReady hook to check for the layer
            Hooks.on('canvasReady', (canvas) => {
                postConsoleAndNotification("Canvas is ready.", "", false, false, false); 
                postConsoleAndNotification("Current Canvas CONFIG:", CONFIG.Canvas.layers, false, true, false);
                const blacksmithLayer = canvas['blacksmith-utilities-layer'];
                if (blacksmithLayer) {
                    postConsoleAndNotification("Blacksmith Layer is available:", blacksmithLayer, false, true, false); 
                } else {
                    postConsoleAndNotification("Blacksmith Layer is not available on the canvas.", "", false, true, false); 
                }
            });
        }

        // Register scene update hooks
        Hooks.on('updateScene', () => WrapperManager._updateSceneIcons());
        Hooks.on('canvasReady', () => WrapperManager._updateSceneIcons());
    }
});

// ***************************************************
// ** Customize the Token Nameplates
// ***************************************************

Hooks.once('ready', updateNameplates);
Hooks.on('updateToken', updateNameplates);

// ***************************************************
// ** ADD TOKEN NAMES
// ***************************************************

// Set the variable to track token count
let tokenCount = new Map();

Hooks.once('ready', function() {

    // RICH CONSOLE
    const blnFancyConsole = game.settings.get(MODULE_ID, 'globalFancyConsole');
    postConsoleAndNotification("Fancy console: ", blnFancyConsole, false, false, false); 
    BLACKSMITH.updateValue('blnFancyConsole', blnFancyConsole);
    COFFEEPUB.blnFancyConsole = blnFancyConsole;
    postConsoleAndNotification("Updated BLACKSMITH.blnFancyConsole to:", BLACKSMITH.blnFancyConsole, false, true, false);    

    // DEBUG ON/OFF
    const blnDebugOn = game.settings.get(MODULE_ID, 'globalDebugMode');
    postConsoleAndNotification("Debug mode: ", blnDebugOn, false, false, false); 
    BLACKSMITH.updateValue('blnDebugOn', blnDebugOn);
    postConsoleAndNotification("Updated BLACKSMITH.blnDebugOn to:", BLACKSMITH.blnDebugOn, false, true, false);    
    
    // DEBUG STYLE
    const strConsoleDebugStyle = game.settings.get(MODULE_ID, 'globalConsoleDebugStyle');
    postConsoleAndNotification("Debug style: ", strConsoleDebugStyle, false, false, false); 
    BLACKSMITH.updateValue('strConsoleDebugStyle', strConsoleDebugStyle);
    postConsoleAndNotification("Updated BLACKSMITH.strConsoleDebugStyle to:", BLACKSMITH.strConsoleDebugStyle, false, true, false);    
    
    // OPENAI SETTINGS
    // Macro
    const strOpenAIMacro = game.settings.get(MODULE_ID, 'openAIMacro');
    BLACKSMITH.updateValue('strOpenAIMacro', strOpenAIMacro);
    // API Key
    const strOpenAIAPIKey = game.settings.get(MODULE_ID, 'openAIAPIKey');
    BLACKSMITH.updateValue('strOpenAIAPIKey', strOpenAIAPIKey);
    // Model 
    const strOpenAIModel = game.settings.get(MODULE_ID, 'openAIModel');
    BLACKSMITH.updateValue('strOpenAIModel', strOpenAIModel);
    // Model 
    const strOpenAIGameSystems = game.settings.get(MODULE_ID, 'openAIGameSystems');
    BLACKSMITH.updateValue('strOpenAIGameSystems', strOpenAIGameSystems);
    // Prompt 
    const strOpenAIPrompt = game.settings.get(MODULE_ID, 'openAIPrompt');
    BLACKSMITH.updateValue('strOpenAIPrompt', strOpenAIPrompt);
    // Temperature 
    const strOpenAITemperature = game.settings.get(MODULE_ID, 'openAITemperature');
    BLACKSMITH.updateValue('strOpenAITemperature', strOpenAITemperature);

    // Update the Chat Spacing per settings
    postConsoleAndNotification("Updating chat styles...", "", false, false, false); 
    updateChatStyles();
    // Update any scene overrides
    postConsoleAndNotification("Updating scene styles...", "", false, false, false); 
    updateSceneStyles();
    // Update any link style overrides
    postConsoleAndNotification("Updating object link styles...", "", false, false, false);
    updateObjectLinkStyles();
    // Update any link style overrides
    postConsoleAndNotification("Updating window styles...", "", false, false, false);
    updateWindowStyles();
    // Update the Margin per settings
    postConsoleAndNotification("Updating card Margins...", "", false, false, false);
    updateMargins();
    // All done
    postConsoleAndNotification("All updates Complete.", "", false, false, false);
    postConsoleAndNotification("Modifying non-linked tokens...", "", false, false, false);

    Hooks.on('createToken', async (document, options, userId) => {
        postConsoleAndNotification("Token(s) created on the scene. Modifying non-linked tokens...", "", false, false, false);
        const actorLink = document.actor?.isToken === false;
        let updatedName;
        let strTokenNameFormat = game.settings.get(MODULE_ID, 'tokenNameFormat');
        
        // Set the token name
        const tokenName = document.actor?.name || document.name;
        //postConsoleAndNotification("Token name changes to ", tokenName + ".", false, false, false);
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
                const count = tokenCount.get(baseName) || 0;
                tokenCount.set(baseName, count + 1);
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
            // Update the token.
            if (document.actor && !document.actor.isToken) {
                // Update the linked actor's name
                //await document.actor.update({name: updatedName});
                // v12
                await document.parent.update({name: updatedName});
                postConsoleAndNotification("Update the linked actor's name:", updatedName + ".", false, false, false);
            } else {
                // Update only the token's name
                //await document.update({token: {name: updatedName}});
                //v12
                await document.update({name: updatedName});
                postConsoleAndNotification("Update only the token's name:", updatedName + ".", false, false, false);
            }
            postConsoleAndNotification("The token name has been changed to ", updatedName + ".", false, false, false);
        } else {
            postConsoleAndNotification("The token is LINKED so the name has not been changed.", "", false, false, false);
        }
    });

});

// ***************************************************
// ** READY Open AI
// ***************************************************

Hooks.on("ready", () => {
    // Set defaults
    let strDefaultCardTheme = game.settings.get(MODULE_ID, 'defaultCardTheme');
    BLACKSMITH.updateValue('strDefaultCardTheme', strDefaultCardTheme);

    // *** CHECK FOR MACRO BUTTONS ***
    // OPEN AI WINDOW
    var strOpenAIMacro = game.settings.get(MODULE_ID, 'openAIMacro');
    if(strOpenAIMacro) {
        let OpenAIMacro = game.macros.getName(strOpenAIMacro);
        if(OpenAIMacro) {
            OpenAIMacro.execute = async () => {
                buildButtonEventRegent();
            };
        } else {
            postConsoleAndNotification("OpenAI Macro specified is not a valid macro name. Make sure there is a macro matching the name you entered in the Blacksmith settings.", strOpenAIMacro, false, true, true);
        }
    } else {
        postConsoleAndNotification("Macro for OpenAI not set.", "", false, true, true);
    } 
});



// ***************************************************
// ** HOOKS ON: CREATE NOTE
// ***************************************************

// Flag to track if Ctrl key was active during renderNoteConfig
let ctrlKeyActiveDuringRender = false;
let shiftKeyActiveDuringRender = false;
let altKeyActiveDuringRender = false;
Hooks.on('renderNoteConfig', async (app, html, data) => {
    postConsoleAndNotification("Rendering Note Config.", app, false, false, false);
    // Define the default icon URL
    var strIconUrl = "";
    const strIconUrlDefault = "modules/coffee-pub-blacksmith/images/pins-note/icon-book.svg";
    const strIconUrlCrtl = "modules/coffee-pub-blacksmith/images/pins-note/icon-combat.svg";
    const strIconUrlShift = "modules/coffee-pub-blacksmith/images/pins-note/icon-flag.svg";
    const strIconUrlAlt = "modules/coffee-pub-blacksmith/images/pins-note/icon-king.svg"; 
    const intIconSize = 70;
    const intFontSize = 40;
    
    // Check if the Ctrl key is held down
    ctrlKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    postConsoleAndNotification("Ctrl key active during render", ctrlKeyActiveDuringRender, false, true, false);
    shiftKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    postConsoleAndNotification("Shift key active during render", shiftKeyActiveDuringRender, false, true, false);
    altKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
    postConsoleAndNotification("Alt key active during render", altKeyActiveDuringRender, false, true, false); 

    if (ctrlKeyActiveDuringRender) {
        strIconUrl = strIconUrlCrtl;
    } else if (shiftKeyActiveDuringRender) {
        strIconUrl = strIconUrlShift;
    } else if (altKeyActiveDuringRender) {
        strIconUrl = strIconUrlAlt; 
    } else {
        strIconUrl = strIconUrlDefault;
    }

    // Set the font size and icon size fields
    html.find('input[name="fontSize"]').val(intFontSize);
    html.find('input[name="iconSize"]').val(intIconSize);

    // Use FilePicker to list files in the specified folder
    const folderPath = "modules/coffee-pub-blacksmith/images/pins-note";
    try {
        const response = await FilePicker.browse("data", folderPath);
        if (response.files && response.files.length > 0) {
            const customIcons = response.files.map(file => {
                const fileName = file.split('/').pop().split('.').shift(); // Extract the file name without extension
                const words = fileName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)); // Capitalize each word
                const label = words.length > 1 ? `Blacksmith > ${words[0]} > ${words.slice(1).join(' ')}` : `Blacksmith > ${words[0]}`; // Format the label
                return { value: file, label: label };
            });

            // Add custom icons to the start of the dropdown
            const entryIconField = html.find('select[name="icon.selected"]');
            if (entryIconField.length) {
                customIcons.reverse().forEach(icon => {
                    entryIconField.prepend(new Option(icon.label, icon.value));
                });
                postConsoleAndNotification("Custom icons added to the dropdown", "", false, true, false);

                // Set the default icon
                entryIconField.val(strIconUrl);

                postConsoleAndNotification("Default icon set to", strIconUrl, false, true, false);
            } else {
                console.error("Entry Icon field not found");
            }
        } else {
            console.error("No files found in the specified folder");
        }
    } catch (error) {
        console.error("Error browsing folder:", error);
    }

    // Optional: Notify the user
    postConsoleAndNotification("Custom icons added and default icon set in NoteConfig.", "", false, false, false);
});

// Hook into the preCreateNote event to set the default icon if Ctrl was held down during renderNoteConfig
Hooks.on('preCreateNote', async (note, options, userId) => {
    postConsoleAndNotification("Pre-create Note", "", false, true, false);

    if (ctrlKeyActiveDuringRender) {
        postConsoleAndNotification("Ctrl key was active during renderNoteConfig. Doing nothing with this right now.", "", false, true, false);
    }
});



export function buildButtonEventRegent(worksheet = 'default') {
    postConsoleAndNotification(`BLACKSMITH: Opening Regent with worksheet: ${worksheet}`, "", false, true, false);
    // Logic to open the regent with the specified worksheet
    if (worksheet === 'encounter') {
        postConsoleAndNotification("Opening Encounter Worksheet", "", false, true, false);
        // Add your logic to open the encounter worksheet here
    } else if (worksheet === 'assistant') {
        postConsoleAndNotification("Opening Assistant Worksheet", "", false, true, false);
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'lookup') {
        postConsoleAndNotification("Opening Lookup Worksheet", "", false, true, false);
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'narrative') {
        postConsoleAndNotification("Opening Narrative Worksheet", "", false, true, false);
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'character') {
        postConsoleAndNotification("Opening Character Worksheet", "", false, true, false);
        // Add your logic to open the assistant worksheet here
    } else {
        postConsoleAndNotification("Opening Default Worksheet", "", false, true, false);
        // Add your logic to open the default worksheet here
    }

    postConsoleAndNotification("Clicked Button", "Regent", false, false, false);
    var queryWindow = new BlacksmithWindowQuery({}, worksheet); // Pass the worksheet as a parameter
    queryWindow.onFormSubmit = async (inputMessage, queryContext = '') => {
        postConsoleAndNotification("BLACKSMIT: buildQueryCard inputMessage:", inputMessage, false, true, false);
        await buildQueryCard(inputMessage, queryWindow, queryContext);
    };
    queryWindow.formTitle = 'Regent';

    playSound(COFFEEPUB.SOUNDNOTIFICATION01, COFFEEPUB.SOUNDVOLUMENORMAL);
    queryWindow.render(true);
    queryWindow.initialize(); // Call initialize directly after render
}

// ***************************************************
// ** UTILITY Double-click Edit Journal
// ***************************************************

Hooks.on('renderJournalSheet', (app, html, data) => {
    let blnJournalDoubleClick = game.settings.get(MODULE_ID, 'enableJournalDoubleClick');
    // See if they want to enable double-click
    if (blnJournalDoubleClick) {
        postConsoleAndNotification("Double-click enabled for journal entries.", "", false, true, false);
        // Enable the double-click
        const ENTITY_PERMISSIONS = { 
            "NONE": 0,
            "LIMITED": 1,
            "OBSERVER": 2,
            "OWNER": 3
        };
        const currentUser = game.user;
        html.on('dblclick', '.journal-entry-page', event => {
            postConsoleAndNotification("Journal entry page double-clicked.", "", false, true, false);
            event.preventDefault();
            const hasEditPermission = app.document.testUserPermission(currentUser, ENTITY_PERMISSIONS.OWNER);
            postConsoleAndNotification("User has edit permission:", hasEditPermission, false, true, false);
            if (hasEditPermission) {
                // Try to find the edit button more generally
                const editButton = html.find('.edit-container .editor-edit');
                postConsoleAndNotification("Edit button found:", editButton.length > 0, false, true, false);
                if (editButton.length > 0) {
                    postConsoleAndNotification("Opening the journal into edit mode.", "", false, true, false);
                    editButton[0].click();
                } else {
                    postConsoleAndNotification("Edit button not found on the journal.", "", false, true, false);
                }
            } else {
                postConsoleAndNotification("User does not have permission to edit.", "", false, true, false);
            }
        });
    }
});

// ***************************************************
// ** UTILITY Run Macro
// ***************************************************

async function runMacro(macroName) {
    const macro = game.macros.getName(macroName);
    postConsoleAndNotification("Executing macro.", macro, false, false, false);
    if (!macro) {
      return Promise.reject(`Macro named ${macroName} not found.`);
    }
    try {
      return await macro.execute();
    } catch (error) {
      postConsoleAndNotification("Error when executing macro " + macroName, error, false, false, false);
      throw error;
    }
}

// ***************************************************
// ** RENDER CHAT MESSAGE
// ***************************************************
// Looks for a specific span code and hides the header of that card
// <span style="visibility: visible">coffeepub-hide-header</span>

Hooks.on('renderChatMessage', (message, html, data) => {
    // console.log(data)

    let hideHeaderFlag = html.find('span:contains("coffeepub-hide-header")');
    if (hideHeaderFlag.length) { 
      // Found the "coffeepub-hide-header" flag within the message
      hideHeaderFlag.parents('.message').find('.message-header').hide()
  
      // Now remove or hide the "coffeepub-hide-header" flag itself
      hideHeaderFlag.css("display", "none");
    }
  });

// ***************************************************
// ** RENDER Import Journal Entries
// ***************************************************
// This will add the import button to the journal directory
// and wait for clicks to import the JSON

Hooks.on("renderJournalDirectory", async (app, html, data) => {
    // Look for a click on the "Import" button
    const button = $(`<button><i class="fa-solid fa-masks-theater"></i> Import JSON to Journal</button>`);
    button.click(() => {
      new Dialog({
        title: "Paste JSON",
        content:
          '<textarea id="json-input" style="width:100%;height:400px;"></textarea>',
        buttons: {
            cancel: {
                icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                label: "Cancel",
                },
            ok: {
            icon: "<i class='fa-solid fa-masks-theater'></i>",
            label: "Import JSON",
            callback: async (html) => {
                const jsonData = html.find("#json-input").val();
                try {
                    // Get the journal 
                    const journalData = JSON.parse(jsonData);
                    var strJournalType = journalData.journaltype;
                    
                    // See what kind of Journal we are creating
                    switch (strJournalType.toUpperCase()) {
                        // works for either NARRATION or ENCOUNTER
                        case "NARRATIVE":
                        case "ENCOUNTER":
                            postConsoleAndNotification("Creating an NARRATIVE or ENCOUNTER journal entry.", "", false, false, false);
                            await createJournalEntry(journalData);
                            postConsoleAndNotification("completed NARRATIVE or ENCOUNTER journal entry creation.", "", false, false, false);
                            break;
                        case "INJURY":
                            // ---------- INJURY ----------
                            postConsoleAndNotification("Creating an INJURY journal entry.", "", false, false, false);
                            await buildInjuryJournalEntry(journalData);
                            postConsoleAndNotification("completed INJURY journal entry creation.", "", false, false, false);
                            break;
                        default:
                            postConsoleAndNotification("Can't create the journal entry. The journal type was not found.", strJournalType, false, false, true);
                    }
              } catch (e) {
                console.error(e);
                ui.notifications.error("Failed to parse JSON!");
                postConsoleAndNotification("Failed to parse JSON!", e + ".", false, true, true);

              }
            },
          },
        },
        default: "ok",
      }).render(true);
    });
    $(html).find(".header-actions.action-buttons").prepend(button);
});

// ***************************************************
// ** UTILITY Build Injury Journal
// ***************************************************

async function buildInjuryJournalEntry(journalData) {
    var blnImage = true;
    var compiledHtml = "";
    let folder;
    var strJournalType = journalData.journaltype;
    var strCategory = journalData.category;
    var intOdds = journalData.odds;
    var strFolderName = toSentenceCase(journalData.foldername);
    var strTitle = toSentenceCase(journalData.title);
    var strImageTitle = toSentenceCase(journalData.imagetitle);
    var strImage = journalData.image;
    if (strImage == "none"){
        blnImage = false;
    }
    var strDescription = journalData.description;
    var strTreatment = journalData.treatment;
    var strSeverity = journalData.severity;
    var intDamage = journalData.damage;
    var strCardDamage = intDamage + " Hit Points"
    var intDuration = journalData.duration;
    var strCardDuration = convertSecondsToRounds(journalData.duration);
    var strAction = journalData.action;
    var strStatusEffect = journalData.statuseffect;
    postConsoleAndNotification("strJournalType", strJournalType, false, true, false);
    postConsoleAndNotification("strCategory", strCategory, false, true, false);
    postConsoleAndNotification("intOdds", intOdds, false, true, false);
    postConsoleAndNotification("strFolderName", strFolderName, false, true, false);
    postConsoleAndNotification("strTitle", strTitle, false, true, false);
    postConsoleAndNotification("strImageTitle", strImageTitle, false, true, false);
    postConsoleAndNotification("strImage", strImage, false, true, false);
    postConsoleAndNotification("strDescription", strDescription, false, true, false);
    postConsoleAndNotification("strTreatment", strTreatment, false, true, false);
    postConsoleAndNotification("strSeverity", strSeverity, false, true, false);
    postConsoleAndNotification("intDamage", intDamage, false, true, false);
    postConsoleAndNotification("intDuration", intDuration, false, true, false);
    postConsoleAndNotification("strAction", strAction, false, true, false);
    postConsoleAndNotification("strStatusEffect", strStatusEffect, false, true, false);
    if(strFolderName) {
        let existingFolder = game.folders.find(x => x.name === strFolderName && x.type === "JournalEntry");
        if (existingFolder) {
            folder = existingFolder;
        } else {
            folder = await Folder.create({
                name: strFolderName,
                type: "JournalEntry",
                parent: null,
            });
        }
    }
    var templatePath = BLACKSMITH.JOURNAL_INJURY_TEMPLATE;
    var response = await fetch(templatePath);
    var templateText = await response.text();
    var template = Handlebars.compile(templateText);
    var CARDDATA = {
        strJournalType: strJournalType,
        strCategory: toSentenceCase(strCategory),
        intOdds: intOdds,
        strFolderName: strFolderName,
        strTitle: strTitle,
        blnImage: blnImage,
        strImageTitle: strImageTitle,
        strImage: strImage,
        strDescription: strDescription,
        strTreatment: strTreatment,
        strSeverity: toSentenceCase(strSeverity),
        intDamage: intDamage,
        strCardDamage: strCardDamage,
        intDuration: intDuration,
        strCardDuration, strCardDuration,
        strAction: strAction,
        strStatusEffect: strStatusEffect,
    };
    playSound(COFFEEPUB.SOUNDEFFECTBOOK02,COFFEEPUB.SOUNDVOLUMENORMAL);
    compiledHtml = template(CARDDATA);
    // Create the new page
    let newPage = { type: "text", name: strTitle, text: {content: compiledHtml} };
    // See if the journal already exists.
    let existingEntry = game.journal.contents.find(x => x.name === toSentenceCase(strCategory));
    if (existingEntry) {
        // It does exist, add a page to it.
        postConsoleAndNotification("The journal entry already exists. existingEntry", existingEntry, false, true, false);
        let existingPages = Array.isArray(existingEntry.pages) ? existingEntry.pages : [];
        existingPages.push(newPage);
        await existingEntry.update({
            pages: existingPages,
            type: "html",
            img: "",
            folder: folder ? folder.id : undefined,
        });
    } else {
        // It does not exist, create it.
        postConsoleAndNotification("The journal entry does not yet exist. existingEntry", existingEntry, false, true, false);
        await JournalEntry.create({
            name: toSentenceCase(strCategory),
            pages: [newPage],
            type: "html",
            img: "",
            folder: folder ? folder.id : undefined,
        });
    }
    return;
}

// Function to check if a string is valid JSON and clean it if needed
function cleanAndValidateJSON(str) {
    try {
        // First try to parse as-is
        const parsed = JSON.parse(str);
        
        // If successful, clean up any HTML tags in the fields that shouldn't have them
        if (typeof parsed === 'object' && parsed !== null) {
            // Fields that should be plain text only (no HTML at all)
            const plainTextFields = [
                'journaltype', 'foldername', 'sceneparent', 'scenearea', 
                'sceneenvironment', 'scenelocation', 'scenetitle', 'prepencounter',
                'cardtitle', 'cardimagetitle', 'cardimage', 'contextintro',
                'carddescriptionprimary', 'carddescriptionsecondary'
            ];

            // Fields that should only contain lists with bold tags
            const listFields = [
                'prepencounterdetails', 'preprewards', 'prepsetup',
                'contextadditionalnarration', 'contextatmosphere', 'contextgmnotes'
            ];

            // Clean up plain text fields
            for (const field of plainTextFields) {
                if (parsed[field]) {
                    // Remove all HTML tags and trim
                    parsed[field] = parsed[field].replace(/<[^>]*>/g, '').trim();
                }
            }

            // Clean up list fields
            for (const field of listFields) {
                if (parsed[field]) {
                    // Keep only <ul>, <li>, and <b> tags
                    let content = parsed[field];
                    
                    // Remove any header tags
                    content = content.replace(/<h[1-6]>.*?<\/h[1-6]>/g, '');
                    
                    // Ensure content starts with <ul> and ends with </ul>
                    if (!content.startsWith('<ul>')) {
                        content = '<ul>' + content;
                    }
                    if (!content.endsWith('</ul>')) {
                        content = content + '</ul>';
                    }
                    
                    parsed[field] = content;
                }
            }

            // Special handling for cardimage
            if (parsed.cardimage) {
                // Extract src from img tag if present, otherwise use as-is
                const match = parsed.cardimage.match(/src="([^"]*)"/);
                parsed.cardimage = match ? match[1] : parsed.cardimage;
                // If empty img tag or no content, set to empty string
                if (parsed.cardimage === '<img src="" alt="">' || !parsed.cardimage) {
                    parsed.cardimage = '';
                }
            }

            // Special handling for carddialogue
            if (parsed.carddialogue) {
                if (parsed.carddialogue === '<h4></h4>' || !parsed.carddialogue.trim()) {
                    parsed.carddialogue = ' ';
                } else {
                    // Keep only <h6> and <b> tags for dialogue
                    parsed.carddialogue = parsed.carddialogue
                        .replace(/<h[1-5]>.*?<\/h[1-5]>/g, '')
                        .replace(/<(?!\/?(?:h6|b)(?:>|\s[^>]*>))\/?[a-zA-Z][^>]*>/g, '')
                        .trim();
                }
            }

            return {
                isValid: true,
                cleaned: JSON.stringify(parsed, null, 2),
                parsed: parsed
            };
        }
        return { isValid: false };
    } catch (e) {
        return { isValid: false };
    }
}

// ***************************************************
// ** UTILITY Build Query Card
// ***************************************************

async function buildQueryCard(question, queryWindow, queryContext = '') {
    var strQuestion = question;
    var strDisplayQuestion = question; // New variable to store what's shown to the user
    var strAnswer = "";
    var compiledHtml = "";
    var strQueryContext = queryContext;
    var strDateStamp = generateFormattedDate();
    // Set the template type
    const templatePath = BLACKSMITH.WINDOW_QUERY_MESSAGE;
    const response = await fetch(templatePath);
    const templateText = await response.text();
    const template = Handlebars.compile(templateText);

    if (strQueryContext) {
        postConsoleAndNotification("TRUE: strQueryContext:", strQueryContext, false, true, false); 
        strDisplayQuestion = strQueryContext; // Only change what's displayed, not what's sent to API
    }
    // Display user's question
    var CARDDATA = {
        strDateStamp: strDateStamp,
        blnProcessing: false,
        blnToolbar: false,
        strSpeakerIcon: "fa-helmet-battle",
        strHeaderStlye: "blacksmith-message-header-question",
        strSpeakerName: game.user.name,
        strMessageIntro: "",
        strMessageContent: strDisplayQuestion // Use the display version here
    };
    compiledHtml = template(CARDDATA);
    queryWindow.displayMessage(compiledHtml);
    scrollToBottom();
    playSound(COFFEEPUB.SOUNDPOP02,COFFEEPUB.SOUNDVOLUMESOFT);

    // Display processing message
    var CARDDATA = {
        strDateStamp: strDateStamp,
        blnProcessing: true,
        blnToolbar: false,
        strSpeakerIcon: "fa-crystal-ball",
        strSpeakerName: "Regent",
        strMessageIntro: "Thinking...",
        strMessageContent: "",
    };
    compiledHtml = template(CARDDATA);
    queryWindow.displayMessage(compiledHtml);
    scrollToBottom();
    playSound(COFFEEPUB.SOUNDPOP01,COFFEEPUB.SOUNDVOLUMESOFT);

    // Get the answer - using the original full question
    const openAIResponse = await getOpenAIReplyAsHtml(strQuestion);

    // Debug the answer
    postConsoleAndNotification("From OPENAI getOpenAIReplyAsHtml | strAnswer:", openAIResponse, false, true, false);

    // Check if it's JSON and clean it if needed
    const jsonCheck = cleanAndValidateJSON(openAIResponse.content || openAIResponse);
    if (jsonCheck.isValid) {
        strAnswer = jsonCheck.cleaned;
    } else {
        strAnswer = openAIResponse.content || openAIResponse;
    }

    // Display the answer
    const messageId = Date.now();
    var CARDDATA = {
        strDateStamp: strDateStamp,
        blnProcessing: false,
        blnToolbar: true,
        strSpeakerIcon: "fa-crystal-ball",
        strHeaderStlye: "blacksmith-message-header-answer",
        strSpeakerName: "Regent",
        strMessageIntro: "",
        strMessageContent: strAnswer,
        messageId: messageId,
        blnIsJSON: jsonCheck.isValid,
        tokenInfo: openAIResponse.usage ? `${openAIResponse.usage.total_tokens} Tokens` : null,
        cost: openAIResponse.cost ? openAIResponse.cost.toFixed(4) : null
    };
    compiledHtml = template(CARDDATA);
    queryWindow.displayMessage(compiledHtml);
    scrollToBottom();
    playSound(COFFEEPUB.SOUNDNOTIFICATION05,COFFEEPUB.SOUNDVOLUMESOFT);
}

// Keep the window scrolled to the bottom ala text messages
function scrollToBottom() {
    var element = document.querySelector('#coffee-pub-blacksmith-output');
    element.scrollTop = element.scrollHeight;
}

// ***************************************************
// ** UTILITY Update Token Nameplates
// ***************************************************

  function updateNameplates() {
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

// ***************************************************
// ** UTILITY Update Link Styles
// ***************************************************

function updateObjectLinkStyles() {
    // Get the settings
    const objectLinkStyle = game.settings.get(MODULE_ID, 'objectLinkStyle');
    // Set defaults
    var strAContentLinkColor = "#191814";
    var strAContentLinkBackground = "#dddddd";
    var strAContentLinkBorder = "#4b4a45";
    var strAContentLinkHoverBackground = "#dddddd";
    var strAContentLinkHoverBorder = "#4b4a45";
    var strAContentLinkBoxShadowColor = "#4f4a4a";
    var strAContentLinkBoxShadowBorder = "0px";
    var strAContentLinkIColor = "#7a7972";
    var strAContentLinkBorderRadius = "0px";
    var strAContentLinkTextTransform = "none";
    // Set the Style
	if (objectLinkStyle == "green") {
		strAContentLinkColor = "#ffffff";
        strAContentLinkIColor = "#ffffff";
        strAContentLinkBackground = "#0D551A";
        strAContentLinkBorder = "#0A4715";
        strAContentLinkHoverBackground = "#082405";
        strAContentLinkHoverBorder = "#082405";
        strAContentLinkBoxShadowColor = "#4f4a4a";
        strAContentLinkBoxShadowBorder = "3px";
        strAContentLinkBorderRadius = "3px";
        strAContentLinkTextTransform = "uppercase";
    } else if (objectLinkStyle == "dark") {
        strAContentLinkColor = "#ffffff";
        strAContentLinkIColor = "#B8AFAF";
        strAContentLinkBackground = "#121212";
        strAContentLinkBorder = "#000000";
        strAContentLinkHoverBackground = "#4F4A4A";
        strAContentLinkHoverBorder = "#4F4A4A";
        strAContentLinkBoxShadowColor = "#4f4a4a";
        strAContentLinkBoxShadowBorder = "3px";
        strAContentLinkBorderRadius = "3px";
        strAContentLinkTextTransform = "uppercase";
    } else if (objectLinkStyle == "red") {
        strAContentLinkColor = "#ffffff";
        strAContentLinkIColor = "#ffffff";
        strAContentLinkBackground = "#7B0A00";
        strAContentLinkBorder = "#2F0400";
        strAContentLinkHoverBackground = "#2F0400";
        strAContentLinkHoverBorder = "#2F0400";
        strAContentLinkBoxShadowColor = "#311210";
        strAContentLinkBoxShadowBorder = "3px";
        strAContentLinkBorderRadius = "3px";
        strAContentLinkTextTransform = "uppercase";
    } else if (objectLinkStyle == "blue") {
        strAContentLinkColor = "#ffffff";
        strAContentLinkIColor = "#B8AFAF";
        strAContentLinkBackground = "#173E56";
        strAContentLinkBorder = "#0E2737";
        strAContentLinkHoverBackground = "#0E2737";
        strAContentLinkHoverBorder = "#2F6C95";
        strAContentLinkBoxShadowColor = "#202020";
        strAContentLinkBoxShadowBorder = "3px";
        strAContentLinkBorderRadius = "3px";
        strAContentLinkTextTransform = "uppercase";
    } else if (objectLinkStyle == "text") {
        strAContentLinkColor = "#191814";
        strAContentLinkIColor = "#7a7972";
        strAContentLinkBackground = "#00000000";
        strAContentLinkBorder = "#7a797200";
        strAContentLinkHoverBackground = "#00000000";
        strAContentLinkHoverBorder = "#FF4F0F";
        strAContentLinkBoxShadowColor = "#00000000";
        strAContentLinkBoxShadowBorder = "0px";
        strAContentLinkBorderRadius = "0px";
        strAContentLinkTextTransform = "uppercase";
    } else if (objectLinkStyle == "light") {
        strAContentLinkColor = "#191814";
        strAContentLinkIColor = "#7a7972";
        strAContentLinkBackground = "#7a797240";
        strAContentLinkBorder = "#7a797259";
        strAContentLinkHoverBackground = "#7a7972A6";
        strAContentLinkHoverBorder = "#7a7972ff";
        strAContentLinkBoxShadowColor = "#00000000";
        strAContentLinkBoxShadowBorder = "0px";
        strAContentLinkBorderRadius = "0px";
        strAContentLinkTextTransform = "uppercase";
	} else {
        // DO Not Update.
	}
   
    // Update the stylesheet variables for cards and such if needed
    if (objectLinkStyle !== "none") {
        var root = document.querySelector(':root');
        root.style.setProperty('--a-content-link-color', strAContentLinkColor);
        root.style.setProperty('--a-content-link-background', strAContentLinkBackground);
        root.style.setProperty('--a-content-link-border', strAContentLinkBorder);
        root.style.setProperty('--a-content-link-hover-background', strAContentLinkHoverBackground);
        root.style.setProperty('--a-content-link-hover-border', strAContentLinkHoverBorder);
        root.style.setProperty('--a-content-link-box-shadow-color:', strAContentLinkBoxShadowColor);
        root.style.setProperty('--a-content-link-box-shadow-border', strAContentLinkBoxShadowBorder);
        root.style.setProperty('--a-content-link-i-color', strAContentLinkIColor);
        root.style.setProperty('--a-content-link-border-radius', strAContentLinkBorderRadius);
        root.style.setProperty('--a-content-link-text-transform', strAContentLinkTextTransform);
    }
    postConsoleAndNotification("Link style updates complete.", "", false, false, false);
}

// ***************************************************
// ** UTILITY Update Window Styles
// ***************************************************

function updateWindowStyles() {
    //Windows titlebar
    var root = document.querySelector(':root');
    const strTitlebarTextSize = game.settings.get(MODULE_ID, 'titlebarTextSize') + "px";
    const strTitlebarIconSize = game.settings.get(MODULE_ID, 'titlebarIconSize') + "px";
    const strTitlebarSpacing = game.settings.get(MODULE_ID, 'titlebarSpacing') + "px";
    if (strTitlebarTextSize) {
        root.style.setProperty('--blacksmith-window-header-a-font-size', strTitlebarTextSize);
    }
    if (strTitlebarIconSize) {
        root.style.setProperty('--blacksmith-window-header-a-i-font-size', strTitlebarIconSize);
    }
    if (strTitlebarSpacing) {
        root.style.setProperty('--blacksmith-window-header-a-i-margin-left', strTitlebarSpacing);
    }
    postConsoleAndNotification("Window style updates complete.", "", false, false, false);
}

// ***************************************************
// ** UTILITY Update Chat Styles
// ***************************************************

function updateChatStyles() {
    // Get the settings
    const hideRollTableIcon = game.settings.get(MODULE_ID, 'hideRollTableIcon');
    const chatSpacing = game.settings.get(MODULE_ID, 'chatSpacing');
    var intChatSpacing = 0;
    var strHideRollTableIcon = "block";
    // GLOBAL setting for space between chat messages
    if (chatSpacing > 1) {
        // split the spacing in two since we apply to the top and the bottom
        intChatSpacing = Math.round(chatSpacing / 2);
        postConsoleAndNotification("Variable intChatSpacing =", intChatSpacing, false, true, false);
    } else {
        // do nothing for now
    }
    // See if we are hiding the roll table icon
	if (hideRollTableIcon == true) {
		strHideRollTableIcon = "none";
	} else {
		strHideRollTableIcon = "block";
	}
    // Update the stylesheet variables
	var root = document.querySelector(':root');
   // postConsoleAndNotification("Before Variable: root = ", root, false, true, false);
    root.style.setProperty('--intChatSpacing', intChatSpacing +'px');
    root.style.setProperty('--strHideRollTableIcon', strHideRollTableIcon);
   // postConsoleAndNotification("After Variable: root = ", root, false, true, false);
    postConsoleAndNotification("Chat style updates complete.", "", false, false, false);
}

// ***************************************************
// ** UTILITY Update Scene 
// ***************************************************

function updateSceneStyles() {
	// Get the settings
    const sceneTextAlign = game.settings.get(MODULE_ID, 'sceneTextAlign');
    const sceneFontSize = game.settings.get(MODULE_ID, 'sceneFontSize') + "em";
    const sceneTitlePaddingLeft = game.settings.get(MODULE_ID, 'sceneTitlePadding') + "px";
    const sceneTitlePaddingRight = game.settings.get(MODULE_ID, 'sceneTitlePadding') + "px";
    const scenePanelHeight = game.settings.get(MODULE_ID, 'scenePanelHeight') + "px";
    // Update the stylesheet variables
	var root = document.querySelector(':root');
    root.style.setProperty('--strSceneTextAlign', sceneTextAlign);
    root.style.setProperty('--strSceneFontSize', sceneFontSize);
    root.style.setProperty('--strScenePaddingLeft', sceneTitlePaddingLeft);
    root.style.setProperty('--strScenePaddingRight', sceneTitlePaddingRight);
    root.style.setProperty('--intScenePanelHeight', scenePanelHeight);
    postConsoleAndNotification("Scene style updates complete.", "", false, false, false);
}

// ***************************************************
// ** UTILITY Update Margins
// ***************************************************

function updateMargins() {
	
    const cardTopMargin = game.settings.get(MODULE_ID, 'cardTopMargin');
	const cardBottomMargin = game.settings.get(MODULE_ID, 'cardBottomMargin');
	const cardLeftMargin = game.settings.get(MODULE_ID, 'cardLeftMargin');
	const cardRightMargin = game.settings.get(MODULE_ID, 'cardRightMargin');
    const cardTopOffset = game.settings.get(MODULE_ID, 'cardTopOffset');

	var root = document.querySelector(':root');
	//var rootStyles = getComputedStyle(root);
	//var marg= rootStyles.getPropertyValue('--intChatSpacing');
    root.style.setProperty('--intCardMarginTop', cardTopMargin +'px');
	root.style.setProperty('--intCardMarginBottom', cardBottomMargin +'px');
	root.style.setProperty('--intCardMarginLeft', cardLeftMargin +'px');
	root.style.setProperty('--intCardMarginRight', cardRightMargin +'px');
    root.style.setProperty('--intOffsetMarginTop', cardTopOffset +'px');
    postConsoleAndNotification("Update Margins complete.", "", false, false, false);
}

export class ThirdPartyManager {
    static socket = null;

    static registerSocketFunctions() {
        postConsoleAndNotification("Third Party Manager | Registering socket functions", "", false, true, false);
        
        // Combat Timer
        this.socket.register("syncTimerState", CombatTimer.receiveTimerSync);
        this.socket.register("combatTimerAdjusted", CombatTimer.timerAdjusted);
        
        // Planning Timer
        this.socket.register("syncPlanningTimerState", PlanningTimer.receiveTimerSync);
        this.socket.register("planningTimerAdjusted", PlanningTimer.timerAdjusted);
        this.socket.register("timerCleanup", PlanningTimer.timerCleanup);
        
        // Chat Panel
        this.socket.register("updateLeader", ChatPanel.receiveLeaderUpdate);
        this.socket.register("updateTimer", ChatPanel.receiveTimerUpdate);

        // Vote Manager
        this.socket.register("receiveVoteStart", VoteManager.receiveVoteStart.bind(VoteManager));
        this.socket.register("receiveVoteUpdate", VoteManager.receiveVoteUpdate.bind(VoteManager));
        this.socket.register("receiveVoteClose", VoteManager.receiveVoteClose.bind(VoteManager));

        // Skill Check
        this.socket.register("updateSkillRoll", async (data) => {
            // Only the GM should process this
            if (!game.user.isGM) return;

            const message = game.messages.get(data.messageId);
            if (!message) return;

            const flags = message.flags['coffee-pub-blacksmith'];
            if (!flags?.type === 'skillCheck') return;

            // Update the actors array with the new result
            const actors = flags.actors.map(a => ({
                ...a,
                result: a.id === data.actorId ? data.result : a.result
            }));

            // Update the message content
            const messageData = {
                ...flags,
                actors
            };

            const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
            await message.update({ 
                content,
                flags: {
                    'coffee-pub-blacksmith': messageData
                }
            });

            // Play sound for individual rolls (not group rolls)
            const isGroupRoll = messageData.isGroupRoll;
            const dc = messageData.dc;
            // Find the actor who just rolled (if possible)
            let actorResult = null;
            if (Array.isArray(messageData.actors) && messageData.actors.length > 0) {
                // Try to find the actor whose result was just updated (has a result object with total)
                actorResult = messageData.actors.find(a => a.result && typeof a.result.total === 'number');
            }
            if (!isGroupRoll) {
                if (dc && actorResult && typeof actorResult.result.total === 'number') {
                    if (actorResult.result.total >= Number(dc)) {
                        playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Success
                    } else {
                        playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL); // Failure
                    }
                } else {
                    playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Default to success sound
                }
            } else {
                // Existing group roll sound logic (unchanged)
                playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL);
            }

            // If this was a requested roll, update the GM's interface
            if (flags.requesterId === game.user.id) {
                const windows = Object.values(ui.windows).filter(w => w instanceof BlacksmithWindowQuery);
                windows.forEach(window => {
                    const inputField = window.element[0].querySelector(`input[name="diceValue"]`);
                    if (inputField) {
                        inputField.value = data.result.total;
                    }
                });
            }
        });
    }
}