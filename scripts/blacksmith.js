// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';

// *** BEGIN: GLOBAL IMPORTS ***
// *** These should be the same across all modules
// -- Import the shared GLOBAL variables --
import { COFFEEPUB, MODULE_AUTHOR } from './global.js';
// -- Load the shared GLOBAL functions --
import { registerBlacksmithUpdatedHook, resetModuleSettings, getOpenAIReplyAsHtml} from './global.js';
// -- Global utilities --
import { postConsoleAndNotification, rollCoffeePubDice, playSound, getActorId, getTokenImage, getPortraitImage, getTokenId, objectToString, stringToObject,trimString, generateFormattedDate, toSentenceCase, convertSecondsToString} from './global.js';
// *** END: GLOBAL IMPORTS ***

// -- COMMON Imports --
import { createJournalEntry, createHTMLList, buildCompendiumLinkActor } from './common.js';


// -- Import special page variables --
// Register settings so they can be loaded below.
import { registerSettings } from './settings.js';
import { BlacksmithWindowBrowser } from './window-browser.js';
import { BlacksmithWindowQuery } from './window-query.js';
import { BlacksmithWindowDashboard } from './window-dashboard.js';
import { BlacksmithLayer } from './canvas-layer.js';
import { addToolbarButton } from './toolbar.js';
import { CombatTimer } from './combat-timer.js';
import { PlanningTimer } from './planning-timer.js';
import { RoundTimer } from './round-timer.js';
import { CombatStats } from './combat-stats.js';
import { CPBPlayerStats } from './player-stats.js';
import { ChatPanel } from './chat-panel.js';

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


// LOAD THE DASHBOARD
// dashboard.setGridDimensions('left', 4, 8); // Changes left grid to 4 rows and 8 columns
// dashboard.setGridDimensions('right', 5, 6); // Changes right grid to 5 rows and 6 columns

Hooks.once('ready', () => {
    postConsoleAndNotification("Readying the Dashboard.", "", false, false, false); 
    const dashboard = BlacksmithWindowDashboard.getInstance();
    let blnShowDashboard = game.settings.get(MODULE_ID, 'showDashboard');
    if (blnShowDashboard) {
        dashboard.render(true);
    }
    
    // Initialize combat stats tracking
    CombatStats.initialize();

    // Initialize player stats tracking
    CPBPlayerStats.initialize();
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
    console.log('Blacksmith | Initializing coffee-pub-blacksmith');
    
    // Initialize modules
    ChatPanel.initialize();

    console.log("BLACKSMITH: Initializing module");
    hookCanvas(); // Call the function to inject the layer
    console.log("BLACKSMITH: Custom layer injected into canvas layers", CONFIG.Canvas.layers);
    postConsoleAndNotification("Canvas is ready. Initializing toolbar...", "", false, false, false);
    addToolbarButton();
    postConsoleAndNotification("Dashboard and Toolbar ready.", "", false, false, false); 

    // COMBAT TIMER
    console.log("BLACKSMITH: In blacksmith.js and Initializing CombatTimer...");
    CombatTimer.initialize();
    // PLANNING TIMER
    console.log("BLACKSMITH: In blacksmith.js and Initializing PlanningTimer...");
    PlanningTimer.initialize();
    // ROUND TIMER
    console.log("BLACKSMITH: In blacksmith.js and Initializing RoundTimer...");
    RoundTimer.initialize();

});

// Keep the canvasInit hook to initialize the toolbar
Hooks.once('canvasInit', () => {
    console.log("Initializing custom canvas layers");
    console.log("Current Canvas Layers:", CONFIG.Canvas.layers);

});

// Keep the canvasReady hook to check for the layer
Hooks.on('canvasReady', (canvas) => {
    postConsoleAndNotification("Canvas is ready.", "", false, false, false); 
    console.log("Current Canvas CONFIG:", CONFIG.Canvas.layers);
    const blacksmithLayer = canvas['blacksmith-utilities-layer'];
    if (blacksmithLayer) {
        postConsoleAndNotification("Blacksmith Layer is available:", blacksmithLayer, false, true, false); 
    } else {
        postConsoleAndNotification("Blacksmith Layer is not available on the canvas.", "", false, true, false); 
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


    // if (!game.modules[MODULE_ID]) {
    //     console.error(`Module with ID ${MODULE_ID} is not loaded.`);
    // } else {
        // REMOVING OLD TOOLBAR
    //    buildBlacksmithToolbar(); // Call the function to create the toolbar and add initial buttons
    // }



    // RICH CONSOLE
    const blnFancyConsole = game.settings.get(MODULE_ID, 'globalFancyConsole');
    postConsoleAndNotification("Fancy console: ", blnFancyConsole, false, false, false); 
    BLACKSMITH.updateValue('blnFancyConsole', blnFancyConsole);
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
    // OPEN BROWSER WINDOW 
    var strBrowserURL = game.settings.get(MODULE_ID, 'browserURL');
    var strOpenBrowserMacro = game.settings.get(MODULE_ID, 'browserMacro');
    if(strOpenBrowserMacro) {
        let OpenBrowserMacro = game.macros.getName(strOpenBrowserMacro);
        if(OpenBrowserMacro) {
            OpenBrowserMacro.execute = async () => {
                buildButtonEventBrowser()
            };
        } else {
            postConsoleAndNotification("Browser Macro specified is not a valid macro name. Make sure there is a macro matching the name you entered in the Blacksmith settings.", strOpenBrowserMacro, false, true, true);
        }
    } else {
        postConsoleAndNotification("Macro for Browser not set.", "", false, true, true);
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
    console.log("Ctrl key active during render:", ctrlKeyActiveDuringRender);
    shiftKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    console.log("Shift key active during render:", shiftKeyActiveDuringRender);
    altKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
    console.log("Alt key active during render:", altKeyActiveDuringRender); 

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
                console.log("Custom icons added to the dropdown");

                // Set the default icon
                entryIconField.val(strIconUrl);
                console.log("Default icon set to:", strIconUrl);
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
    console.log("Pre-create Note");

    if (ctrlKeyActiveDuringRender) {
        console.log("Ctrl key was active during renderNoteConfig. Doing nothing with this right now.");

        // // Set the default icon
        // note.updateSource({ "texture.src": strIconUrl });
        // console.log("Note icon set to default:", strIconUrl);

        // // Prevent the configuration window from opening
        // options.renderSheet = false;

        // // Optional: Notify the user
        // postConsoleAndNotification("CTRL Note created with default icon.", "", false, false, false);

        // // Reset the flag
        // ctrlKeyActiveDuringRender = false;
    }
});



// Browser Button
export function buildButtonEventBrowser() {
    postConsoleAndNotification("Clicked Button", "Browser", false, false, false);
    
    // Get the URL from your module settings
    const browserURL = game.settings.get(MODULE_ID, 'browserURL');
    
    // Create the browser window with the URL
    var browserWindow = new BlacksmithWindowBrowser(browserURL);
    browserWindow.formTitle = 'Browser';
    playSound(COFFEEPUB.SOUNDBUTTON06,COFFEEPUB.SOUNDVOLUMESOFT);
    browserWindow.render(true); 
}


export function buildButtonEventRegent(worksheet = 'default') {
    console.log(`BLACKSMITH: Opening Regent with worksheet: ${worksheet}`);
    // Logic to open the regent with the specified worksheet
    if (worksheet === 'encounter') {
        console.log("Opening Encounter Worksheet");
        // Add your logic to open the encounter worksheet here
    } else if (worksheet === 'assistant') {
        console.log("Opening Assistant Worksheet");
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'lookup') {
        console.log("Opening Lookup Worksheet");
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'narrative') {
        console.log("Opening Narrative Worksheet");
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'character') {
        console.log("Opening Character Worksheet");
        // Add your logic to open the assistant worksheet here
    } else {
        console.log("Opening Default Worksheet");
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
        console.log("Double-click enabled for journal entries.");
        // Enable the double-click
        const ENTITY_PERMISSIONS = { 
            "NONE": 0,
            "LIMITED": 1,
            "OBSERVER": 2,
            "OWNER": 3
        };
        const currentUser = game.user;
        html.on('dblclick', '.journal-entry-page', event => {
            console.log("Journal entry page double-clicked.");
            event.preventDefault();
            const hasEditPermission = app.document.testUserPermission(currentUser, ENTITY_PERMISSIONS.OWNER);
            console.log("User has edit permission:", hasEditPermission);
            if (hasEditPermission) {
                // Try to find the edit button more generally
                const editButton = html.find('.edit-container .editor-edit');
                console.log("Edit button found:", editButton.length > 0);
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
// ** UTILITY Scene Clicks
// ***************************************************

Hooks.on("ready", function () {
    let blnShowIcons = game.settings.get(MODULE_ID, 'enableSceneInteractions');
    let blnCustomClicks = game.settings.get(MODULE_ID, 'enableSceneClickBehaviors');
    
    let timeout;

    function updateSceneIcons(sceneId) {
        setTimeout(() => {
            const scene = game.scenes.get(sceneId);
            const sceneElement = $(`.directory-list .scene[data-entry-id=${sceneId}]`);
            const sceneNameElement = $(sceneElement).find("a");
            const strIconActive = "<i class='fa-solid fa-bow-arrow'></i> ";
            const strIconViewing = "<i class='fa-solid fa-eye'></i> ";
            $(sceneNameElement).find('.fa-solid').remove();
            if (scene._id === game.scenes.active._id) {
                $(sceneNameElement).prepend(strIconActive);
            } else if (scene._id === game.scenes.current._id) {
                $(sceneNameElement).prepend(strIconViewing);
            }
        }, 0)
    }

    function updateIcons() {
        // if they enables icons, process them
        if (blnShowIcons){
            for (let scene of game.scenes.values()) {
                updateSceneIcons(scene._id);
            }
        }
    }
    if (blnCustomClicks){
        SceneDirectory.prototype._onClickEntryName = function (event) {
            // if they enable mouse-clicks
            
                event.preventDefault();
                const sceneId = event.currentTarget.closest(".directory-item").dataset.entryId;
                const activateScene = () => {
                    const scene = game.scenes.get(sceneId);
                    scene.activate().then(() => {
                        updateIcons();
                    });
                };
                const viewScene = () => {
                    const scene = game.scenes.get(sceneId);
                    scene.view().then(() => {
                        updateIcons();
                    });
                };
                const viewAndConfigureScene = () => {
                    const scene = game.scenes.get(sceneId);
                    scene.view().then(() => {
                        scene.sheet.render(true);
                        updateIcons();
                    });
                };
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(() => {
                    timeout = null;
                    if (event.shiftKey) {
                        viewAndConfigureScene();
                    } else if (event.detail === 2) {
                        activateScene();
                    } else {
                        viewScene();
                    }
                }, 300);
            
        };
    }
    Hooks.on('canvasReady', updateIcons);
    updateIcons(); // Call updateIcons when Foundry first loads
});


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
    var strCardDuration = convertSecondsToString(journalData.duration);
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




// ***************************************************
// ** UTILITY Build Query Card
// ***************************************************

async function buildQueryCard(question, queryWindow, queryContext = '') {
    var strQuestion = question;
    var strAnswer = "";
    var compiledHtml = "";
    var strQueryContext = queryContext;
    //postConsoleAndNotification("buildQueryCard question...", question, false, true, false); 
    var strDateStamp = generateFormattedDate();
    // Set the template type
    const templatePath = BLACKSMITH.WINDOW_QUERY_MESSAGE;
    const response = await fetch(templatePath);
    const templateText = await response.text();
    const template = Handlebars.compile(templateText);

    if (strQueryContext) {
        postConsoleAndNotification("TRUE: strQueryContext:", strQueryContext, false, true, false); 
        strQuestion = strQueryContext;
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
        strMessageContent: strQuestion
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

    // Get the answer
    strAnswer = await getOpenAIReplyAsHtml(strQuestion);

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
        messageId: messageId
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
    // Update the stylesheet variables
	var root = document.querySelector(':root');
    root.style.setProperty('--strSceneTextAlign', sceneTextAlign);
    root.style.setProperty('--strSceneFontSize', sceneFontSize);
    root.style.setProperty('--strScenePaddingLeft', sceneTitlePaddingLeft);
    root.style.setProperty('--strScenePaddingRight', sceneTitlePaddingRight);
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





// ***************************************************
// ** CLASS Floating Toolbar
// ***************************************************
// REMOVING OLD TOOLBAR
// class CoffeePubToolbar {
//     constructor() {

//         let intBlacksmithToolbarLeft = localStorage.getItem('toolbarLeft') || "200px";
//         let intBlacksmithToolbarTop = localStorage.getItem('toolbarTop') || "200px";
//         postConsoleAndNotification("Getting the toolbar location.", "Left: "+ intBlacksmithToolbarLeft + " Top: " + intBlacksmithToolbarTop, false, false, false);
//         this.tools = [];
//         this.toolbar = document.createElement("div");
//         this.toolbar.id = "blacksmith-toolbar-wrapper";
//         this.toolbar.setAttribute("style", "left: " + intBlacksmithToolbarLeft + "; top: " + intBlacksmithToolbarTop + ";");
//         document.body.appendChild(this.toolbar);
//         const gripDiv = document.createElement("div");
//         gripDiv.id = "blacksmith-toolbar-grip";

//         this.grip = document.createElement("i");
//         this.grip.className = "fa-solid fa-square blacksmith-toolbar-grip-icon";
//         gripDiv.appendChild(this.grip);
//         this.toolbar.appendChild(gripDiv);

//         this.buttonWrapper = document.createElement("div");
//         this.buttonWrapper.id = "blacksmith-button-wrapper-bar";
//         this.toolbar.appendChild(this.buttonWrapper);
//         this.pos1 = 0;
//         this.pos2 = 0;
//         this.pos3 = 0;
//         this.pos4 = 0;
//         this.grip.onmousedown = this.dragMouseDown.bind(this);

//         gripDiv.addEventListener('contextmenu', (e) => {
//             e.preventDefault();
//             updateRotateToolbar();
//             return false;
//         }, false);
//     }


//     dragMouseDown(e) {
//         e = e || window.event;
//         e.preventDefault();
//         this.pos3 = e.clientX;
//         this.pos4 = e.clientY;
//         document.onmouseup = this.closeDragElement.bind(this);
//         document.onmousemove = this.elementDrag.bind(this);
//         playSound(COFFEEPUB.SOUNDBUTTON03,COFFEEPUB.SOUNDVOLUMESOFT);
//     }

//     elementDrag(e) {
//         e = e || window.event;
//         e.preventDefault();
//         this.pos1 = this.pos3 - e.clientX;
//         this.pos2 = this.pos4 - e.clientY;
//         this.pos3 = e.clientX;
//         this.pos4 = e.clientY;
//         this.toolbar.style.left = (this.toolbar.offsetLeft - this.pos1) + "px";
//         this.toolbar.style.top = (this.toolbar.offsetTop - this.pos2) + "px";
//     }

//     closeDragElement() {
//         postConsoleAndNotification("Saving the new toolbar location.", "Left: "+ this.toolbar.style.left + " Top: " + this.toolbar.style.top, false, false, false);
//         localStorage.setItem('toolbarLeft', this.toolbar.style.left);
//         localStorage.setItem('toolbarTop', this.toolbar.style.top);
//         document.onmouseup = null;
//         document.onmousemove = null;
//         playSound(COFFEEPUB.SOUNDBUTTON09,COFFEEPUB.SOUNDVOLUMESOFT);
//     }

//     addButton(id, layout, type, title, icon, action) {
//         const button = document.createElement("button");
//         const div = document.createElement('div');
//         button.id = id;
//         button.className = this.getClassForType(type);
//         this.modifyWrapperForLayout(layout);
    
//         // -- Process Spacers --
//         if (type === "spacer") {
//             if (icon === "spacer" || icon === "") {
//                 // if the icon is "spacer" or empty
//                 div.className = "blacksmith-spacer";
                
//             } else if(icon.includes("fas")) {
//                 // if icon contains "fas"
//                 div.className = "blacksmith-spacer";
//                 div.innerHTML = `<i class="${icon}"></i>`;
//                 div.dataset.tooltip = "";
                
//             } else {
//                 // if the icon is something unexpected
//                 div.className = "blacksmith-spacer";
//             }
            
//             //appending the spacer div to wrapper if type is "spacer"
//             this.buttonWrapper.appendChild(div);
//             return; // exit early for spacer
          
//         } 
    
//         // -- Process Buttons --
//         let buttonIcon;
        
//         if (icon.includes('.')) {
//             buttonIcon = document.createElement("img");
//             buttonIcon.src = icon;
//             buttonIcon.className = "blacksmith-button-image"; // apply class to img
//         } else {
//             buttonIcon = document.createElement("i");
//             buttonIcon.className = icon;
//         }
        
//         button.appendChild(buttonIcon);
//         button.onclick = action;
//         button.setAttribute('data-tooltip', title);
//         this.buttonWrapper.appendChild(button);
//         this.tools.push(button);
//     }

//     modifyWrapperForLayout(layout) {
//         if(layout === "block") {
//             this.buttonWrapper.id = "blacksmith-button-wrapper-block";
//         } else {
//             this.buttonWrapper.id = "blacksmith-button-wrapper-bar";
//         }
//     }

//     getClassForType(type) {
//         let className;
//         switch(type) {
//             case "spacer":
//                 className = "blacksmith-spacer";
//                 break;
//             case "button-1x1":
//                 className = "blacksmith-button-1x1";
//                 break;
//             case "button-2x2":
//                 className = "blacksmith-button-2x2";
//                 break;
//             case "button-4x4":
//                 className = "blacksmith-button-4x4";
//                 break;
//             case "panel-1x1":
//                 className = "blacksmith-panel-1x1";
//                 break;
//             case "panel-2x2":
//                 className = "blacksmith-panel-2x2";
//                 break;
//             case "panel-4x4":
//                 className = "blacksmith-panel-4x4";
//                 break;
//             case "panel-1x2":
//                 className = "blacksmith-panel-1x2";
//                 break;
//             case "panel-2x4":
//                 className = "blacksmith-panel-2x4";
//                 break;
//             case "panel-4x8":
//                 className = "blacksmith-panel-4x8";
//                 break;
//             default:
//                 className = "blacksmith-button-1x1";
//         }

//         return className;
//     }

//     addCustomButton(id, layout, type, title, icon, action) {
//         this.addButton(id, layout, type, title, icon, action);
//     }
// }

// ***************************************************
// ** UTILITY Rotate toolbar and buttons
// ***************************************************
// REMOVING OLD TOOLBAR
// function updateRotateToolbar() {
//     //postConsoleAndNotification("RIGHT CLICK", "", false, false, true);
//     // Toggle these
//     let toolbarWrapperFlexDirection = document.getElementById('blacksmith-toolbar-wrapper');
//     let strOrientationToolbar;
//     if (toolbarWrapperFlexDirection) {
//         let style = window.getComputedStyle(toolbarWrapperFlexDirection);
//         strOrientationToolbar = style.getPropertyValue('flex-direction');
//     } else {
//         postConsoleAndNotification("No element with id blacksmith-toolbar-wrapper found", "", false, true, false);
//     }
//     // #blacksmith-toolbar-wrapper
//     // flex-direction: column; /* row | column */
//     // // #blacksmith-toolbar-grip
//     // // transform: translate( -8%, 0%);/* row: -60%, 60% | column: -8%, 0% */
//     let toolbarGripTranslate = document.getElementById('blacksmith-toolbar-grip');

//     // // #blacksmith-toolbar-grip .blacksmith-toolbar-grip-icon
//     // // transform: rotate(90deg);/* 0deg | 90deg */
//     let toolbarGripRotate = document.getElementsByClassName('blacksmith-toolbar-grip-icon');


//     let toolbarSpacerRotate = document.getElementsByClassName('blacksmith-spacer');

//     // // #blacksmith-button-wrapper
//     // // flex-direction: column; /* row | column */
//     let toolbarButtonWrapperFlex = document.getElementById('blacksmith-button-wrapper-bar');
    
//     if (toolbarWrapperFlexDirection && toolbarGripTranslate && toolbarGripRotate &&  toolbarSpacerRotate && toolbarButtonWrapperFlex) {
//         //postConsoleAndNotification("ROTATE current toolbarWrapperFlexDirection", toolbarWrapperFlexDirection, false, true, false);
//         if (strOrientationToolbar == "row") {
//             // Make it a COLUMN
//             //postConsoleAndNotification("ROTATE IT", toolbarWrapperFlexDirection, false, false, true);
//             toolbarWrapperFlexDirection.style.flexDirection = "column";
//             toolbarGripTranslate.style.transform = "translate(-8%, 0%)";
//             toolbarButtonWrapperFlex.style.flexDirection = "column";
//             for (let i = 0; i < toolbarGripRotate.length; i++) {
//                 toolbarGripRotate[i].style.transform = "rotate(90deg)";
//             }
//             for (let i = 0; i < toolbarSpacerRotate.length; i++) {
//                 toolbarSpacerRotate[i].style.transform = "rotate(90deg)";
//             }

//         } else {
//             // Make it a ROW
//             //postConsoleAndNotification("ROTATE IT", toolbarWrapperFlexDirection, false, false, true);
//             toolbarWrapperFlexDirection.style.flexDirection = "row";
//             toolbarGripTranslate.style.transform = "translate( -60%, 60%)";
//             toolbarButtonWrapperFlex.style.flexDirection = "row";
//             for (let i = 0; i < toolbarGripRotate.length; i++) {
//                 toolbarGripRotate[i].style.transform = "rotate(0deg)";
//             }
//             for (let i = 0; i < toolbarSpacerRotate.length; i++) {
//                 toolbarSpacerRotate[i].style.transform = "rotate(0deg)";
//             }
//         }
//         playSound(COFFEEPUB.SOUNDNOTIFICATION05,COFFEEPUB.SOUNDVOLUMESOFT);
//     } else {
//         postConsoleAndNotification("One or more elements not found.", "updateRotateToolbar", false, true, true);
//         if (!toolbarWrapperFlexDirection) {
//             postConsoleAndNotification("toolbarWrapperFlexDirection", toolbarWrapperFlexDirection, false, true, true);
//         }
//         if (!toolbarGripTranslate) {
//             postConsoleAndNotification("toolbarGripTranslate", toolbarGripTranslate, false, true, true);
//         }
//         if (!toolbarGripRotate) {
//             postConsoleAndNotification("toolbarGripRotate", toolbarGripRotate, false, true, true);
//         }
//         if (!toolbarSpacerRotate) {
//             postConsoleAndNotification("toolbarSpacerRotate", toolbarSpacerRotate, false, true, true);
//         }
//         if (!toolbarButtonWrapperFlex) {
//             postConsoleAndNotification("toolbarButtonWrapperFlex", toolbarButtonWrapperFlex, false, true, true);
//         }
//     }
// }

// ***************************************************
// ** UTILITY Add toolbar and buttons
// ***************************************************
// REMOVING OLD TOOLBAR
// function buildBlacksmithToolbar() {
//     // Add the buttons
//     //let toolbar = game.modules[MODULE_ID].toolbar || new CoffeePubToolbar(); // Create a new instance only if it doesn't exist
    
//     if (game.user.isGM) {
//         postConsoleAndNotification("Building toolbar for GM", game.user.isGM, false, false, false);
//         let toolbarUtilities = new CoffeePubToolbar(); // Create a new instance only if it doesn't exist
//         //let toolbarEncounters = new CoffeePubToolbar(); // Create a new instance only if it doesn't exist
//         //let toolbarSoundboard = new CoffeePubToolbar(); // Create a new instance only if it doesn't exist
//         // id, layout, type, title, icon, action
//         //var strSpacer = "fa-solid fa-pipe";
//         var strSpacer = "fas fa-circle-small";
//         // Tools
//         toolbarUtilities.addButton("btnRegent", "bar", "button-1x1", "Consult the Regent", "icons/sundries/scrolls/scroll-runed-brown-blue.webp", () => { buildButtonEventRegent(); });
//         toolbarUtilities.addButton("btnBrowser", "bar", "button-1x1",  "GM Notes", "icons/sundries/books/book-tooled-eye-gold-red.webp", () => { buildButtonEventBrowser(); });
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Injuries
//         toolbarUtilities.addButton("btnInjury", "bar", "button-1x1",  "Apply Injury", "icons/commodities/bones/bone-broken-grey-red.webp", () => { runMacro("Injuries"); });
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Encounters
//         toolbarUtilities.addButton("btnEncDungeon", "bar", "button-1x1",  "Encounter: Dungeon", "icons/environment/wilderness/tomb-entrance.webp", () => { runMacro("Encounter: Dungeon"); });
//         toolbarUtilities.addButton("btnEncDesert", "bar", "button-1x1",  "Encounter: Desert", "icons/environment/wilderness/terrain-rocks-brown.webp", () => { runMacro("Encounter: Desert"); });
//         toolbarUtilities.addButton("btnEncForest", "bar", "button-1x1",  "Encounter: Forest", "icons/environment/wilderness/tree-ash.webp", () => { runMacro("Encounter: Forest"); });
//         toolbarUtilities.addButton("btnEncMountain", "bar", "button-1x1",  "Encounter: Mountain", "icons/environment/wilderness/carved-standing-stone.webp", () => { runMacro("Encounter: Mountain"); });
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Chat
//         toolbarUtilities.addButton("btnPartyMessage", "bar", "button-1x1",  "Party Message", "icons/creatures/abilities/mouth-teeth-human.webp", () => { runMacro("Party Message"); });
//         toolbarUtilities.addButton("btnPrivateMessage", "bar", "button-1x1",  "Private Message", "icons/tools/scribal/ink-quill-pink.webp", () => { runMacro("Private Message"); });
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Item Piles
//         toolbarUtilities.addButton("btnItemPileToToken", "bar", "button-1x1",  "Item Pile to Token", "icons/commodities/treasure/figurine-idol.webp", () => { runMacro("Item Pile to Token"); });
//         toolbarUtilities.addButton("btnTokenToItemPile", "bar", "button-1x1",  "Token to Item Pile", "icons/commodities/currency/coins-plain-pouch-gold.webp", () => { runMacro("Token to Item Pile"); });
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Soundboard
//         toolbarUtilities.addButton("btnSoundTrumpetBoing", "bar", "button-1x1",  "Sound: Trumpet Boing", "icons/tools/instruments/horn-red-grey.webp", () => { runMacro("Sound: Trumpet Boing"); });
//         toolbarUtilities.addButton("btnSoundBongoFeet", "bar", "button-1x1",  "Sound: Bongo Feet", "icons/tools/instruments/drum-brown-red.webp", () => { runMacro("Sound: Bongo Feet"); });
//         toolbarUtilities.addButton("btnSoundKabong", "bar", "button-1x1",  "Sound: Kabong", "icons/tools/instruments/lute-gold-brown.webp", () => { runMacro("Sound: Kabong"); });
//     } else {
//         postConsoleAndNotification("Building toolbar for Player", game.user.isGM, false, false, false);
//         let toolbarUtilities = new CoffeePubToolbar(); // Create a new instance only if it doesn't exist
//         // Tools
//         toolbarUtilities.addButton("btnRegent", "bar", "button-1x1",  "Consult the Regent", "icons/sundries/scrolls/scroll-runed-brown-blue.webp", () => { buildButtonEventRegent(); });
//         toolbarUtilities.addButton("btnBrowser", "bar", "button-1x1",  "Player Handbook", "icons/sundries/books/book-tooled-eye-gold-red.webp", "icons/sundries/books/book-tooled-eye-gold-red.webp", () => { buildButtonEventBrowser(); });  
//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Chat
//         toolbarUtilities.addButton("btnPartyMessage", "bar", "button-1x1",  "Party Message", "icons/creatures/abilities/mouth-teeth-human.webp", () => { runMacro("Party Message"); });
//         toolbarUtilities.addButton("btnPrivateMessage", "bar", "button-1x1",  "Private Message", "icons/tools/scribal/ink-quill-pink.webp", () => { runMacro("Private Message"); });

//         toolbarUtilities.addButton("btnSpacer", "bar", "spacer",  "", strSpacer, () => { });
//         // Soundboard
//         toolbarUtilities.addButton("btnSoundTrumpetBoing", "bar", "button-1x1",  "Sound: Trumpet Boing", "icons/tools/instruments/horn-red-grey.webp", () => { runMacro("Sound: Trumpet Boing"); });
//         toolbarUtilities.addButton("btnSoundBongoFeet", "bar", "button-1x1",  "Sound: Bongo Feet", "icons/tools/instruments/drum-brown-red.webp", () => { runMacro("Sound: Bongo Feet"); });
//         toolbarUtilities.addButton("btnSoundKabong", "bar", "button-1x1",  "Sound: Kabong", "icons/tools/instruments/lute-gold-brown.webp", () => { runMacro("Sound: Kabong"); });
//     }


//     // Expose the toolbarUtilities instance
//     // TURNING OFF UNTIL EVERYTHIN ESLE WORKS
//     //postConsoleAndNotification("BEFORE Gloabl toolbarUtilities Create...", game.modules, false, true, false);
//     //game.modules[MODULE_ID].toolbarUtilities = toolbarUtilities;
//     //postConsoleAndNotification("AFTER Gloabl toolbarUtilities Create...", game.modules, false, true, false);
//     //postConsoleAndNotification("AFTER game.modules[MODULE_ID].toolbarUtilities...", game.modules[MODULE_ID].toolbarUtilities, false, true, false);

// }

// REMOVING OLD TOOLBAR   
// Process the button array
// Hooks.on('getSceneControlButtons', (controls) => {

//     // Define your buttons
//     const buttonToolbarHideShow = {
//         icon: "fa-solid fa-coffee-pot",
//         name: "btnToolbarHideShow",
//         title: "Toggle the Coffee Pub Toolbar",
//         visible: true,
//         onClick: () => { updateHideShowToolbar(); }
//     };

//     // Add them into an array
//     const buttons = [ buttonToolbarHideShow ];

//     const tokenControls = controls.find(c => c.name === "token");
//     buttons.forEach(button => {
//         if (!tokenControls.tools.find(c => c.name === button.name)) {
//             tokenControls.tools.push(button);
//         }
//     });
// });

// ***************************************************
// ** UTILITY Toolbar Button Functions
// ***************************************************
// REMOVING OLD TOOLBAR
// Hide or Show the Coffee Pub toolbar
// function updateHideShowToolbar() {
//     postConsoleAndNotification("Clicked Button", "Toggle the Coffee Pub Toolbar", false, false, false);
//     let toolbar = document.getElementById('blacksmith-toolbar-wrapper');
//     postConsoleAndNotification("TOOLBAR", toolbar, false, true, false);
//     if (toolbar) {
//         if (toolbar.style.display === "none") {
//             postConsoleAndNotification("Showing the toolbar.", toolbar, false, false, false);
//             toolbar.style.display = "flex";
//         } else {
//             postConsoleAndNotification("Hiding the toolbar.", toolbar, false, false, false);
//             toolbar.style.display = "none";
//         }
//     } else {
//         postConsoleAndNotification("No toolbar found.", "", false, false, false);
//     }
// }