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
import { createJournalEntry, createHTMLList, buildCompendiumLinkActor, copyToClipboard } from './common.js';

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
import { JournalTools } from './journal-tools.js';
import { CSSEditor } from './css-editor.js';
import { SkillCheckDialog } from './skill-check-dialog.js';
import { XpManager } from './xp-manager.js';

// ================================================================== 
// ===== SET UP THE MODULE ==========================================
// ================================================================== 

// Cache for root element to avoid repeated DOM queries
let cachedRootElement = null;

// Cache for note config icons to avoid repeated file system operations
let noteConfigIconsCache = null;
let noteConfigIconsCacheTimestamp = 0;
const NOTE_CONFIG_CACHE_EXPIRATION = 10 * 60 * 1000; // 10 minutes

// Cache for compiled Handlebars templates to avoid repeated compilation
let templateCache = new Map();
const TEMPLATE_CACHE_EXPIRATION = 30 * 60 * 1000; // 30 minutes

// Window registry for efficient BlacksmithWindowQuery lookups
let blacksmithWindowRegistry = new Set();

// Settings cache for frequently accessed settings
let settingsCache = new Map();
const SETTINGS_CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes

// Helper function to get cached root element
function getRootElement() {
    if (!cachedRootElement) {
        cachedRootElement = document.querySelector(':root');
    }
    return cachedRootElement;
}

// Helper function to get cached note config icons
async function getNoteConfigIcons() {
    const now = Date.now();
    
    // Check if cache exists and is still valid
    if (noteConfigIconsCache && (now - noteConfigIconsCacheTimestamp) < NOTE_CONFIG_CACHE_EXPIRATION) {
        return noteConfigIconsCache;
    }
    
    // Cache expired or doesn't exist, rebuild it
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
            
            // Store cache with timestamp
            noteConfigIconsCache = customIcons;
            noteConfigIconsCacheTimestamp = now;
            
            return customIcons;
        }
    } catch (error) {
        postConsoleAndNotification("Error browsing folder", error, false, false, true);
    }
    
    return [];
}

// Helper function to get cached compiled template
export async function getCachedTemplate(templatePath) {
    const now = Date.now();
    
    // Check if template is cached and still valid
    if (templateCache.has(templatePath)) {
        const cached = templateCache.get(templatePath);
        if ((now - cached.timestamp) < TEMPLATE_CACHE_EXPIRATION) {
            return cached.template;
        }
    }
    
    // Template not cached or expired, compile it
    try {
        const response = await fetch(templatePath);
        const templateText = await response.text();
        const template = Handlebars.compile(templateText);
        
        // Store in cache with timestamp
        templateCache.set(templatePath, {
            template: template,
            timestamp: now
        });
        
        return template;
    } catch (error) {
        postConsoleAndNotification(`Error loading template ${templatePath}`, error, false, false, true);
        throw error;
    }
}

// Helper functions for window registry management
function registerBlacksmithWindow(window) {
    if (window instanceof BlacksmithWindowQuery) {
        blacksmithWindowRegistry.add(window);
    }
}

function unregisterBlacksmithWindow(window) {
    blacksmithWindowRegistry.delete(window);
}

function getBlacksmithWindows() {
    return Array.from(blacksmithWindowRegistry);
}

// Helper function to get cached setting value
export function getCachedSetting(settingKey, defaultValue = null) {
    const now = Date.now();
    
    // Check if setting is cached and still valid
    if (settingsCache.has(settingKey)) {
        const cached = settingsCache.get(settingKey);
        if ((now - cached.timestamp) < SETTINGS_CACHE_EXPIRATION) {
            return cached.value;
        }
    }
    
    // Setting not cached or expired, retrieve it
    const value = game.settings.get(MODULE_ID, settingKey);
    
    // Store in cache with timestamp
    settingsCache.set(settingKey, {
        value: value,
        timestamp: now
    });
    
    return value;
}

// Helper function to clear settings cache (call when settings change)
function clearSettingsCache() {
    settingsCache.clear();
}

// ***************************************************
// ** BLACKSMITH VARIABLE UPDATE
// ***************************************************
// This must load up to to be available on the page.
BLACKSMITH.updateValue = function(key, value) {
    this[key] = value;
    // Signal to other modules that the variable has been updated

    Hooks.callAll("blacksmithUpdated", this);
}

// ***************************************************
// ** SETTINGS
// ***************************************************
// Ensure the settings are registered before anything else
// Register the Blacksmith hook
registerBlacksmithUpdatedHook();
// Register the settings
    
await registerSettings();

// ================================================================== 
// ===== REGISTER HOOKS =============================================
// ================================================================== 

Hooks.once('ready', () => {
    // Initialize combat stats tracking
    CombatStats.initialize();

    // Initialize player stats tracking
    CPBPlayerStats.initialize();

    // Initialize XP manager
    XpManager.initialize();

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
                    // Use efficient window registry lookup
                    const windows = getBlacksmithWindows();
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
            postConsoleAndNotification('Blacksmith | SocketLib API not found, some features may be limited', "", false, false, false);
        }
    } else {
        postConsoleAndNotification('Blacksmith | SocketLib module not active, some features may be limited', "", false, false, false);
    }
    
    // Register chat message click handler for skill rolls
    Hooks.on('renderChatMessage', (message, html) => {
        if (message.flags?.['coffee-pub-blacksmith']?.type === 'skillCheck') {
            SkillCheckDialog.handleChatMessageClick(message, html);
        }
    });
    
    // Register window lifecycle hooks for efficient lookups
    Hooks.on('renderApplication', (app, html, data) => {
        if (app instanceof BlacksmithWindowQuery) {
            registerBlacksmithWindow(app);
        }
    });
    
    Hooks.on('closeApplication', (app) => {
        if (app instanceof BlacksmithWindowQuery) {
            unregisterBlacksmithWindow(app);
        }
    });
    
    // Clear settings cache when settings change
    Hooks.on('settingChange', (moduleId, settingKey, value) => {
        if (moduleId === MODULE_ID) {
            clearSettingsCache();
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
        switch (data.type) {
            case 'updateCSS':
                const editor = new CSSEditor();
                editor.applyCSS(data.css, data.transition);
                break;
            case 'updateSkillRoll':
                if (game.user.isGM) {
                    handleSkillRollUpdate(data.data);
                }
                break;
            case 'skillRollFinalized':
                const { messageId, flags, rollData } = data.data;
                // Check if cinematic display is active for this message
                if (flags.isCinematic) {
                    const cinematicOverlay = $('#cpb-cinematic-overlay');
                    if (cinematicOverlay.length && cinematicOverlay.data('messageId') === messageId) {
                        SkillCheckDialog._updateCinematicDisplay(rollData.tokenId, rollData.result, flags);
                    }
                }
                break;
            case 'showCinematicOverlay':
                SkillCheckDialog._showCinematicDisplay(data.data.messageData, data.data.messageId);
                break;
            case 'closeCinematicOverlay':
                SkillCheckDialog._hideCinematicDisplay();
                break;
        }
    });
    

    postConsoleAndNotification("Canvas is ready. Initializing toolbar...", "", false, false, false);

    // COMBAT TIMER
    CombatTimer.initialize();
    // PLANNING TIMER
    PlanningTimer.initialize();
    // ROUND TIMER
    RoundTimer.initialize();
    // COMBAT TRACKER
    CombatTracker.initialize();

    // VOTE MANAGER
    VoteManager.initialize();

    // Initialize CanvasTools
    CanvasTools.initialize();
});

// Initialize WrapperManager after libWrapper is ready
Hooks.once('ready', async function() {

    WrapperManager.initialize();
    
    // Initialize combat stats tracking
    CombatStats.initialize();

    // Initialize player stats tracking
    CPBPlayerStats.initialize();

    // Initialize latency checker
    LatencyChecker.initialize();
    
    // ENCOUNTER TOOLBAR
    EncounterToolbar.init();
    
    // JOURNAL TOOLS
    JournalTools.init();
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
                // Canvas initialization complete
            });

            // Keep the canvasReady hook to check for the layer
            Hooks.on('canvasReady', (canvas) => {
             
                const blacksmithLayer = canvas['blacksmith-utilities-layer'];
                // Layer availability checked silently
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

Hooks.once('ready', function() {

    // RICH CONSOLE
    const blnFancyConsole = getCachedSetting('globalFancyConsole');
 
    BLACKSMITH.updateValue('blnFancyConsole', blnFancyConsole);
    COFFEEPUB.blnFancyConsole = blnFancyConsole;

    // DEBUG ON/OFF
    const blnDebugOn = getCachedSetting('globalDebugMode');
 
    BLACKSMITH.updateValue('blnDebugOn', blnDebugOn);
    
    // DEBUG STYLE
    const strConsoleDebugStyle = getCachedSetting('globalConsoleDebugStyle');
 
    BLACKSMITH.updateValue('strConsoleDebugStyle', strConsoleDebugStyle);    
    
    // OPENAI SETTINGS
    // Macro
    const strOpenAIMacro = getCachedSetting('openAIMacro');
    BLACKSMITH.updateValue('strOpenAIMacro', strOpenAIMacro);
    // API Key
    const strOpenAIAPIKey = getCachedSetting('openAIAPIKey');
    BLACKSMITH.updateValue('strOpenAIAPIKey', strOpenAIAPIKey);
    // Model 
    const strOpenAIModel = getCachedSetting('openAIModel');
    BLACKSMITH.updateValue('strOpenAIModel', strOpenAIModel);
    // Model 
    const strOpenAIGameSystems = getCachedSetting('openAIGameSystems');
    BLACKSMITH.updateValue('strOpenAIGameSystems', strOpenAIGameSystems);
    // Prompt 
    const strOpenAIPrompt = getCachedSetting('openAIPrompt');
    BLACKSMITH.updateValue('strOpenAIPrompt', strOpenAIPrompt);
    // Temperature 
    const strOpenAITemperature = getCachedSetting('openAITemperature');
    BLACKSMITH.updateValue('strOpenAITemperature', strOpenAITemperature);

    // Update the Chat Spacing per settings
    updateChatStyles();
    // Update any scene overrides
    updateSceneStyles();
    // Update any link style overrides
    updateObjectLinkStyles();
    // Update any link style overrides
    updateWindowStyles();
    // Update the Margin per settings
    updateMargins();
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
    var strOpenAIMacro = getCachedSetting('openAIMacro');
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
    shiftKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    altKeyActiveDuringRender = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT); 

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

    // Use cached note config icons to avoid repeated file system operations
    try {
        const customIcons = await getNoteConfigIcons();
        
        if (customIcons.length > 0) {
            // Add custom icons to the start of the dropdown
            const entryIconField = html.find('select[name="icon.selected"]');
            if (entryIconField.length) {
                customIcons.reverse().forEach(icon => {
                    entryIconField.prepend(new Option(icon.label, icon.value));
                });

                // Set the default icon
                entryIconField.val(strIconUrl);
            } else {
                postConsoleAndNotification("Entry Icon field not found", "", false, false, true);
            }
        }
    } catch (error) {
        postConsoleAndNotification("Error loading note config icons", error, false, false, true);
    }


});

// Hook into the preCreateNote event to set the default icon if Ctrl was held down during renderNoteConfig
Hooks.on('preCreateNote', async (note, options, userId) => {
    // Note creation hook - silent operation
});



export function buildButtonEventRegent(worksheet = 'default') {

    // Logic to open the regent with the specified worksheet
    if (worksheet === 'encounter') {
        // Add your logic to open the encounter worksheet here
    } else if (worksheet === 'assistant') {
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'lookup') {
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'narrative') {
        // Add your logic to open the assistant worksheet here
    } else if (worksheet === 'character') {
        // Add your logic to open the assistant worksheet here
    } else {
        // Add your logic to open the default worksheet here
    }


    var queryWindow = new BlacksmithWindowQuery({}, worksheet); // Pass the worksheet as a parameter
    queryWindow.onFormSubmit = async (inputMessage, queryContext = '') => {

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
        // Enable the double-click
        const ENTITY_PERMISSIONS = { 
            "NONE": 0,
            "LIMITED": 1,
            "OBSERVER": 2,
            "OWNER": 3
        };
        const currentUser = game.user;
        html.on('dblclick', '.journal-entry-page', event => {
            event.preventDefault();
            const hasEditPermission = app.document.testUserPermission(currentUser, ENTITY_PERMISSIONS.OWNER);
            if (hasEditPermission) {
                // Try to find the edit button more generally
                const editButton = html.find('.edit-container .editor-edit');
                if (editButton.length > 0) {
                    editButton[0].click();
                }
            }
        });
    }
});

// ***************************************************
// ** UTILITY Run Macro
// ***************************************************

async function runMacro(macroName) {
    const macro = game.macros.getName(macroName);

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

// Helper to replace placeholders in the narrative template with settings values
async function getNarrativeTemplateWithDefaults(narrativeTemplate) {
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-RULEBOOKS-HERE]', key: 'defaultRulebooks' },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', key: 'defaultPartySize' },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', key: 'defaultPartyLevel' },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', key: 'defaultPartyMakeup' },
    { placeholder: '[ADD-FOLDER-NAME-HERE]', key: 'defaultNarrativeFolder' },
    { placeholder: '[ADD-SCENE-AREA-HERE]', key: 'defaultSceneArea' },
    { placeholder: '[ADD-SCENE-ENVIRONMENT-HERE]', key: 'defaultSceneEnvironment' },
    { placeholder: '[ADD-SCENE-LOCATION-HERE]', key: 'defaultSceneLocation' },
    { placeholder: '[ADD-IMAGE-PATH-HERE]', key: 'narrativeDefaultCardImage' }
  ];
  let result = narrativeTemplate;
  for (const { placeholder, key } of settings) {
    let value = undefined;
    try {
      value = game.settings.get(MODULE_ID, key);
    } catch (e) {}
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
        try {
          value = game.settings.get(MODULE_ID, 'narrativeDefaultImagePath');
        } catch (e) {}
      }
    }
    if (!value) continue; // leave placeholder if not set
    result = result.split(placeholder).join(value);
  }
  return result;
}

async function getEncounterTemplateWithDefaults(encounterTemplate) {
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-RULEBOOKS-HERE]', key: 'defaultRulebooks' },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', key: 'defaultPartySize' },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', key: 'defaultPartyLevel' },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', key: 'defaultPartyMakeup' },
    { placeholder: '[ADD-FOLDER-NAME-HERE]', key: 'defaultEncounterFolder' },
    { placeholder: '[ADD-SCENE-AREA-HERE]', key: 'defaultSceneArea' },
    { placeholder: '[ADD-SCENE-ENVIRONMENT-HERE]', key: 'defaultSceneEnvironment' },
    { placeholder: '[ADD-SCENE-LOCATION-HERE]', key: 'defaultSceneLocation' },
    { placeholder: '[ADD-IMAGE-PATH-HERE]', key: 'encounterDefaultCardImage' }
  ];
  let result = encounterTemplate;
  for (const { placeholder, key } of settings) {
    let value = undefined;
    try {
      value = game.settings.get(MODULE_ID, key);
    } catch (e) {}
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
        try {
          value = game.settings.get(MODULE_ID, 'encounterDefaultImagePath');
        } catch (e) {}
      }
    }
    if (!value) continue; // leave placeholder if not set
    result = result.split(placeholder).join(value);
  }
  return result;
}

Hooks.on("renderJournalDirectory", async (app, html, data) => {
    // Fetch template files at runtime
    const narrativeTemplate = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-narratives.txt')).text();
    const injuryTemplate = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-injuries.txt')).text();
    const encounterTemplate = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-encounter.txt')).text();

    // Build dialog content with dropdown and button
    const dialogContent = `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <select id="template-type" style="flex: 0 0 auto;">
          <option value="narrative">Narrative</option>
          <option value="encounter">Encounter</option>
          <option value="injury">Injury</option>
        </select>
        <button id="copy-template-btn" type="button">Copy Template to Clipboard</button>
      </div>
      <textarea id="json-input" style="width:100%;height:400px;"></textarea>
    `;

    const button = $(`<button><i class="fa-solid fa-masks-theater"></i> Import JSON to Journal</button>`);
    button.click(() => {
      new Dialog({
        title: "Paste JSON",
        width: 800,
        content: dialogContent,
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
                    
                    // Check if journaltype exists
                    if (!strJournalType) {
                        throw new Error("Missing 'journaltype' field in JSON data");
                    }
                    
                    // See what kind of Journal we are creating
                    switch (strJournalType.toUpperCase()) {
                        // works for either NARRATION or ENCOUNTER
                        case "NARRATIVE":
                        case "ENCOUNTER":
                                await createJournalEntry(journalData);
    break;
case "INJURY":
    // ---------- INJURY ----------
    await buildInjuryJournalEntry(journalData);
                            break;
                        default:
                            postConsoleAndNotification("Can't create the journal entry. The journal type was not found.", strJournalType, false, false, true);
                    }
              } catch (e) {
                postConsoleAndNotification("Failed to parse JSON", e, false, false, true);
              }
            },
          },
        },
        default: "ok",
        render: (htmlDialog) => {
          // Attach event listeners for template copy
          htmlDialog.find("#copy-template-btn").click(async () => {
            const type = htmlDialog.find("#template-type").val();
            if (type === "injury") {
              copyToClipboard(injuryTemplate);
            } else if (type === "encounter") {
              const templateWithDefaults = await getEncounterTemplateWithDefaults(encounterTemplate);
              copyToClipboard(templateWithDefaults);
            } else {
              const templateWithDefaults = await getNarrativeTemplateWithDefaults(narrativeTemplate);
              copyToClipboard(templateWithDefaults);
            }
          });
        }
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
    // Injury journal data processed silently
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
    var template = await getCachedTemplate(templatePath);
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
    const template = await getCachedTemplate(templatePath);

    if (strQueryContext) {
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

    // Process OpenAI response

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

    let tokens = canvas.tokens.placeables;
    let strNameplateFontsize = getCachedSetting('nameplateFontSize') + "px";

    let strNameplateColor = getCachedSetting('nameplateColor');
    let strNameplateOutlineSize = getCachedSetting('nameplateOutlineSize');
    let strNameplateOutlineColor = getCachedSetting('nameplateOutlineColor');
    let strNameplateFontFamily = getCachedSetting('nameplateFontFamily');
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
    const objectLinkStyle = getCachedSetting('objectLinkStyle');
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
        const root = getRootElement();
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

}

// ***************************************************
// ** UTILITY Update Window Styles
// ***************************************************

function updateWindowStyles() {
    //Windows titlebar
    const root = getRootElement();
    const strTitlebarTextSize = getCachedSetting('titlebarTextSize') + "px";
    const strTitlebarIconSize = getCachedSetting('titlebarIconSize') + "px";
    const strTitlebarSpacing = getCachedSetting('titlebarSpacing') + "px";
    if (strTitlebarTextSize) {
        root.style.setProperty('--blacksmith-window-header-a-font-size', strTitlebarTextSize);
    }
    if (strTitlebarIconSize) {
        root.style.setProperty('--blacksmith-window-header-a-i-font-size', strTitlebarIconSize);
    }
    if (strTitlebarSpacing) {
        root.style.setProperty('--blacksmith-window-header-a-i-margin-left', strTitlebarSpacing);
    }

}

// ***************************************************
// ** UTILITY Update Chat Styles
// ***************************************************

function updateChatStyles() {
    // Get the settings
    const hideRollTableIcon = getCachedSetting('hideRollTableIcon');
    const chatSpacing = getCachedSetting('chatSpacing');
    var intChatSpacing = 0;
    var strHideRollTableIcon = "block";
    // GLOBAL setting for space between chat messages
    if (chatSpacing > 1) {
        // split the spacing in two since we apply to the top and the bottom
        intChatSpacing = Math.round(chatSpacing / 2);
        // Chat spacing calculated
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
	const root = getRootElement();
    root.style.setProperty('--intChatSpacing', intChatSpacing +'px');
    root.style.setProperty('--strHideRollTableIcon', strHideRollTableIcon);

}

// ***************************************************
// ** UTILITY Update Scene 
// ***************************************************

function updateSceneStyles() {
	// Get the settings
    const sceneTextAlign = getCachedSetting('sceneTextAlign');
    const sceneFontSize = getCachedSetting('sceneFontSize') + "em";
    const sceneTitlePaddingLeft = getCachedSetting('sceneTitlePadding') + "px";
    const sceneTitlePaddingRight = getCachedSetting('sceneTitlePadding') + "px";
    const scenePanelHeight = getCachedSetting('scenePanelHeight') + "px";
    // Update the stylesheet variables
	const root = getRootElement();
    root.style.setProperty('--strSceneTextAlign', sceneTextAlign);
    root.style.setProperty('--strSceneFontSize', sceneFontSize);
    root.style.setProperty('--strScenePaddingLeft', sceneTitlePaddingLeft);
    root.style.setProperty('--strScenePaddingRight', sceneTitlePaddingRight);
    root.style.setProperty('--intScenePanelHeight', scenePanelHeight);

}

// ***************************************************
// ** UTILITY Update Margins
// ***************************************************

function updateMargins() {
	
    const cardTopMargin = getCachedSetting('cardTopMargin');
	const cardBottomMargin = getCachedSetting('cardBottomMargin');
	const cardLeftMargin = getCachedSetting('cardLeftMargin');
	const cardRightMargin = getCachedSetting('cardRightMargin');
    const cardTopOffset = getCachedSetting('cardTopOffset');

	const root = getRootElement();
    root.style.setProperty('--intCardMarginTop', cardTopMargin +'px');
	root.style.setProperty('--intCardMarginBottom', cardBottomMargin +'px');
	root.style.setProperty('--intCardMarginLeft', cardLeftMargin +'px');
	root.style.setProperty('--intCardMarginRight', cardRightMargin +'px');
    root.style.setProperty('--intOffsetMarginTop', cardTopOffset +'px');

}

export class ThirdPartyManager {
    static socket = null;

    static registerSocketFunctions() {
        // Registering socket functions
        
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

            // Use centralized logic from SkillCheckDialog - now expects token ID
            const updatedMessageData = SkillCheckDialog.processRollResult(flags, data.data.tokenId, data.data.result);
            const content = await SkillCheckDialog.formatChatMessage(updatedMessageData);
            await message.update({ 
                content,
                flags: { 'coffee-pub-blacksmith': updatedMessageData }
            });

            // Broadcast the final result to all clients for UI updates (like cinematic mode)
            game.socket.emit(`module.${MODULE_ID}`, {
                type: 'skillRollFinalized',
                data: {
                    messageId: message.id,
                    flags: updatedMessageData,
                    rollData: data // Pass along the specific roll data (tokenId, result)
                }
            });

            // Directly update the GM's cinematic UI if it's open
            if (updatedMessageData.isCinematic) {
                const cinematicOverlay = $('#cpb-cinematic-overlay');
                if (cinematicOverlay.length && cinematicOverlay.data('messageId') === message.id) {
                    SkillCheckDialog._updateCinematicDisplay(data.tokenId, data.result, updatedMessageData);
                }
            }

            // If this was a requested roll, update the GM's interface
            if (flags.requesterId === game.user.id) {
                const windows = getBlacksmithWindows();
                windows.forEach(window => {
                    const inputField = window.element[0].querySelector(`input[name="diceValue"]`);
                    if (inputField) {
                        inputField.value = data.result.total;
                    }
                });
            }
        });

        // This is received by all clients to update the chat card
        this.socket.on("skillRollUpdated", (data) => {
            const message = game.messages.get(data.messageId);
            if (message) {
                // We update the content directly to avoid re-rendering chat log
                const messageElement = $(`#chat-log .message[data-message-id="${data.messageId}"] .message-content`);
                if (messageElement.length) {
                    messageElement.html(data.content);
                }
                // Update message flags silently in the background
                message.flags['coffee-pub-blacksmith'] = data.flags;

                // Handle cinematic update
                if (data.flags.isCinematic && data.rollData) {
                    SkillCheckDialog._updateCinematicDisplay(data.rollData.tokenId, data.rollData.result, data.flags);
                }
            }
        });

        // Latency checker
        this.socket.register("checkLatency", (data) => {
            // Implementation of checkLatency function
        });

        // Show cinematic roll display
        this.socket.register("showCinematicRoll", (data) => {
            SkillCheckDialog._showCinematicDisplay(data.messageData, data.messageId);
        });
    }
}

export async function handleSkillRollUpdate(data) {
    const { messageId, tokenId, result } = data;
    const message = game.messages.get(messageId);
    if (!message) return;

    const flags = message.flags['coffee-pub-blacksmith'] || {};
    if (!flags?.type === 'skillCheck') return;

    // --- Always recalculate group roll summary on the GM side ---
    // 1. Update the correct actor's result with the new, plain result object
    const actors = (flags.actors || []).map(a => ({
        ...a,
        result: a.id === tokenId ? result : a.result 
    }));

    // 2. Recalculate group roll summary
    let groupRollData = {};
    if (flags.isGroupRoll) {
        const completedRolls = actors.filter(a => a.result);
        const allRollsComplete = completedRolls.length === actors.length;
        groupRollData = {
            isGroupRoll: true,
            allRollsComplete
        };
        if (allRollsComplete && flags.dc) {
            const successCount = actors.filter(a => a.result && a.result.total >= flags.dc).length;
            const totalCount = actors.length;
            const groupSuccess = successCount > (totalCount / 2);
            Object.assign(groupRollData, {
                successCount,
                totalCount,
                groupSuccess
            });
        }
    }

    // 3. Recalculate contested roll results if needed
    let contestedRoll;
    if (flags.hasMultipleGroups && actors.every(a => a.result)) {
        const group1 = actors.filter(a => a.group === 1);
        const group2 = actors.filter(a => a.group === 2);
        const group1Highest = Math.max(...group1.map(a => a.result.total));
        const group2Highest = Math.max(...group2.map(a => a.result.total));
        if (flags.dc && group1Highest < flags.dc && group2Highest < flags.dc) {
            contestedRoll = {
                winningGroup: 0,
                group1Highest,
                group2Highest,
                isTie: true
            };
        } else {
            const isGroup1Winner = group1Highest > group2Highest;
            contestedRoll = {
                winningGroup: isGroup1Winner ? 1 : 2,
                group1Highest,
                group2Highest,
                isTie: group1Highest === group2Highest
            };
        }
    }

    // 4. Update the message data
    const updatedMessageData = {
        ...flags,
        ...groupRollData,
        actors,
        contestedRoll
    };

    const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', updatedMessageData);
    await message.update({ 
        content,
        flags: {
            'coffee-pub-blacksmith': updatedMessageData
        }
    });

    // Broadcast the final result to all clients for UI updates (like cinematic mode)
    game.socket.emit(`module.${MODULE_ID}`, {
        type: 'skillRollFinalized',
        data: {
            messageId: message.id,
            flags: updatedMessageData,
            rollData: data // Pass along the specific roll data (tokenId, result)
        }
    });

    // Directly update the GM's cinematic UI if it's open
    if (updatedMessageData.isCinematic) {
        const cinematicOverlay = $('#cpb-cinematic-overlay');
        if (cinematicOverlay.length && cinematicOverlay.data('messageId') === message.id) {
            SkillCheckDialog._updateCinematicDisplay(tokenId, result, updatedMessageData);
        }
    }

    // If this was a requested roll, update the GM's interface
    if (flags.requesterId === game.user.id) {
        const windows = getBlacksmithWindows();
        windows.forEach(window => {
            const inputField = window.element[0].querySelector(`input[name="diceValue"]`);
            if (inputField) {
                inputField.value = result.total;
            }
        });
    }
}

// Helper to replace placeholders in the item prompt with settings values
async function getItemPromptWithDefaults(itemPrompt) {
  let value = '';
  try {
    value = game.settings.get(MODULE_ID, 'defaultCampaignName');
  } catch (e) {}
  if (value) {
    return itemPrompt.split('[ADD-ITEM-SOURCE-HERE]').join(value);
  }
  return itemPrompt;
}

// Cache for icon paths with expiration
let iconPathsCache = null;

// Recursively collect all image files in icons/ and subdirectories
async function getIconPaths() {
  const now = Date.now();
  const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  // Check if cache exists and is still valid
  if (iconPathsCache && (now - iconPathsCache.timestamp) < CACHE_EXPIRATION) {
    return iconPathsCache.paths;
  }
  
  // Cache expired or doesn't exist, rebuild it
  const paths = [];
  async function collect(dir) {
    const result = await FilePicker.browse('public', dir);
    for (const file of result.files) {
      if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
        paths.push(file);
      }
    }
    for (const subdir of result.dirs) {
      await collect(subdir);
    }
  }
  await collect('icons/');
  
  // Store cache with timestamp
  iconPathsCache = {
    paths: paths,
    timestamp: now
  };
  
  return paths;
}

// Heuristic image guesser using prioritized synonym matching and itemImageTerms support
async function guessIconPath(item) {
  const paths = await getIconPaths();
  const name = (item.itemName || '').toLowerCase();
  const description = (item.itemDescription || '').toLowerCase();
  const lootType = (item.itemLootType || '').toLowerCase();

  // Check if enhanced image guessing is enabled
  const enhancedEnabled = game.settings.get(MODULE_ID, 'enableEnhancedImageGuessing');

  // Load the comprehensive synonym mapping
  let synonymMapping = {};
  if (enhancedEnabled) {
    try {
      const response = await fetch('modules/coffee-pub-blacksmith/resources/item-mapping.json');
      synonymMapping = await response.json();
      console.log('BLACKSMITH | Item Import | Loaded comprehensive synonym mapping with', Object.keys(synonymMapping).length, 'entries');
    } catch (error) {
      console.warn('BLACKSMITH | Item Import | Could not load item-mapping.json, falling back to basic mapping');
      synonymMapping = {
        ring: ['commodities/treasure', 'commodities/gems', 'commodities/misc', 'sundries/misc'],
        key: ['tools/hand', 'commodities/metal', 'commodities/misc'],
        gem: ['commodities/gems', 'commodities/treasure'],
        book: ['sundries/books'],
        potion: ['consumables/potions'],
        scroll: ['sundries/scrolls'],
        mask: ['commodities/treasure', 'commodities/misc'],
        cube: ['commodities/treasure', 'commodities/misc']
      };
    }
  } else {
    synonymMapping = {
      ring: ['commodities/treasure', 'commodities/gems', 'commodities/misc', 'sundries/misc'],
      key: ['tools/hand', 'commodities/metal', 'commodities/misc'],
      gem: ['commodities/gems', 'commodities/treasure'],
      book: ['sundries/books'],
      potion: ['consumables/potions'],
      scroll: ['sundries/scrolls'],
      mask: ['commodities/treasure', 'commodities/misc'],
      cube: ['commodities/treasure', 'commodities/misc']
    };
  }

  // 0. Check itemImageTerms array (if present)
  if (Array.isArray(item.itemImageTerms)) {
    for (const termRaw of item.itemImageTerms) {
      const term = (termRaw || '').toLowerCase().trim();
      if (!term) continue;
      // Exact match in mapping
      if (synonymMapping[term]) {
        for (const folder of synonymMapping[term]) {
          const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
          if (folderImages.length > 0) {
            const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
            console.log(`BLACKSMITH | Item Import | [IMAGE-TERMS-EXACT] Matched itemImageTerms '${term}' to folder '${folder}' -> '${chosen}'`);
            return chosen;
          }
        }
      }
      // Partial match in mapping keys
      for (const [synonym, folders] of Object.entries(synonymMapping)) {
        if (synonym.includes(term) || term.includes(synonym)) {
          for (const folder of folders) {
            const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
            if (folderImages.length > 0) {
              const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
              console.log(`BLACKSMITH | Item Import | [IMAGE-TERMS-PARTIAL] Matched itemImageTerms '${term}' (partial: '${synonym}') to folder '${folder}' -> '${chosen}'`);
              return chosen;
            }
          }
        }
      }
    }
  }

  // 1. Exact synonym match in item name (word boundary)
  for (const [synonym, folders] of Object.entries(synonymMapping)) {
    const regex = new RegExp(`\\b${synonym}\\b`);
    if (regex.test(name)) {
      for (const folder of folders) {
        const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
        if (folderImages.length > 0) {
          const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
          console.log(`BLACKSMITH | Item Import | [NAME-EXACT] Matched synonym '${synonym}' to folder '${folder}' -> '${chosen}'`);
          return chosen;
        }
      }
    }
  }

  // 2. Partial synonym match in item name
  for (const [synonym, folders] of Object.entries(synonymMapping)) {
    if (name.includes(synonym)) {
      for (const folder of folders) {
        const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
        if (folderImages.length > 0) {
          const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
          console.log(`BLACKSMITH | Item Import | [NAME-PARTIAL] Matched partial synonym '${synonym}' to folder '${folder}' -> '${chosen}'`);
          return chosen;
        }
      }
    }
  }

  // 3. Exact synonym match in description (word boundary)
  for (const [synonym, folders] of Object.entries(synonymMapping)) {
    const regex = new RegExp(`\\b${synonym}\\b`);
    if (regex.test(description)) {
      for (const folder of folders) {
        const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
        if (folderImages.length > 0) {
          const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
          console.log(`BLACKSMITH | Item Import | [DESC-EXACT] Matched synonym '${synonym}' to folder '${folder}' -> '${chosen}'`);
          return chosen;
        }
      }
    }
  }

  // 4. Partial synonym match in description
  for (const [synonym, folders] of Object.entries(synonymMapping)) {
    if (description.includes(synonym)) {
      for (const folder of folders) {
        const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
        if (folderImages.length > 0) {
          const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
          console.log(`BLACKSMITH | Item Import | [DESC-PARTIAL] Matched partial synonym '${synonym}' to folder '${folder}' -> '${chosen}'`);
          return chosen;
        }
      }
    }
  }

  // 5. Try loot type as folder
  if (lootType) {
    const lootTypeMatch = paths.find(path => path.toLowerCase().includes(`/${lootType}/`));
    if (lootTypeMatch) {
      console.log(`BLACKSMITH | Item Import | Matched loot type '${lootType}' -> '${lootTypeMatch}'`);
      return lootTypeMatch;
    }
  }

  // 6. Try filename match for any synonym in any folder
  for (const synonym of Object.keys(synonymMapping)) {
    const fileMatch = paths.find(path =>
      path.toLowerCase().match(new RegExp(`(^|/|_|-)${synonym}(-|_|\.|$)`, 'i'))
    );
    if (fileMatch) {
      console.log(`BLACKSMITH | Item Import | Matched filename for synonym '${synonym}' -> '${fileMatch}'`);
      return fileMatch;
    }
  }

  // 7. Fallback to treasure/misc images
  const fallbackFolders = ['commodities/treasure', 'commodities/misc', 'sundries/misc'];
  for (const folder of fallbackFolders) {
    const folderImages = paths.filter(path =>
      path.toLowerCase().includes(`/${folder}/`)
    );
    if (folderImages.length > 0) {
      const chosen = folderImages[Math.floor(Math.random() * folderImages.length)];
      console.log(`BLACKSMITH | Item Import | Using fallback folder '${folder}' -> '${chosen}'`);
      return chosen;
    }
  }

  // 8. Ultimate fallback
  console.log('BLACKSMITH | Item Import | No suitable image found, using default');
  return "icons/commodities/treasure/mask-jeweled-gold.webp";
}

// Utility function to get available synonyms for debugging
async function getAvailableSynonyms() {
  try {
    const response = await fetch('modules/coffee-pub-blacksmith/resources/item-mapping.json');
    const mapping = await response.json();
    return Object.keys(mapping).sort();
  } catch (error) {
    console.warn('BLACKSMITH | Item Import | Could not load synonym mapping for debugging');
    return [];
  }
}

// Utility function to test image guessing for a specific item
async function testImageGuessing(itemName, itemDescription = '') {
  const testItem = {
    itemName: itemName,
    itemDescription: itemDescription,
    itemLootType: 'treasure'
  };
  
  console.log(`BLACKSMITH | Item Import | Testing image guessing for: "${itemName}"`);
  console.log(`BLACKSMITH | Item Import | Description: "${itemDescription}"`);
  
  const result = await guessIconPath(testItem);
  console.log(`BLACKSMITH | Item Import | Result: ${result}`);
  
  return result;
}

/**
 * Parse a flat item JSON (from prompt) into FoundryVTT D&D5E item data.
 * @param {object} flat - The flat item JSON from the prompt.
 * @returns {object} - The FoundryVTT item data object.
 */
async function parseFlatItemToFoundry(flat) {
  const type = flat.itemType?.toLowerCase() || "loot";
  let img = flat.itemImagePath;
  if (!img) {
    img = await guessIconPath(flat);
  }
  let data = {};
  if (type === "loot") {
    data = {
      type: "loot",
      name: flat.itemName,
      img: img,
      system: {
        description: {
          value: flat.itemDescription || "",
          unidentified: flat.itemDescriptionUnidentified || "",
          chat: flat.itemDescriptionChat || ""
        },
        rarity: flat.itemRarity,
        weight: flat.itemWeight,
        price: flat.itemPrice,
        type: { value: flat.itemLootType },
        properties: { magical: flat.itemIsMagical },
        source: { custom: flat.itemSource },
        quantity: flat.itemQuantity,
        identified: flat.itemIdentified
      },
      flags: {
        "coffee-pub": {
          source: flat.itemSource
        }
      }
    };
  }
  // Future: Add more item type mappings here
  return data;
}

// ITEM IMPORT TOOL
Hooks.on("renderItemDirectory", async (app, html, data) => {
    // Fetch the loot item prompt template at runtime
    const lootPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-items-loot.txt')).text();

    // Build dialog content with dropdown and button
    const dialogContent = `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <select id="item-template-type" style="flex: 0 0 auto;">
          <option value="loot">Loot Item</option>
        </select>
        <button id="copy-item-template-btn" type="button">Copy Template to Clipboard</button>
      </div>
      <textarea id="item-json-input" style="width:100%;height:400px;"></textarea>
    `;

    const button = $(`<button><i class="fa-solid fa-boxes-stacked"></i> Import JSON to Items</button>`);
    button.click(() => {
      new Dialog({
        title: "Paste JSON for Items",
        content: dialogContent,
        width: 800,
        height: 800,
        buttons: {
            cancel: {
                icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                label: "Cancel",
            },
            ok: {
                icon: "<i class='fa-solid fa-boxes-stacked'></i>",
                label: "Import JSON",
                callback: async (html) => {
                    const jsonData = html.find("#item-json-input").val();
                    let itemsToImport = [];
                    try {
                        let parsed = JSON.parse(jsonData);
                        if (Array.isArray(parsed)) {
                            itemsToImport = await Promise.all(parsed.map(parseFlatItemToFoundry));
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            itemsToImport = [await parseFlatItemToFoundry(parsed)];
                        } else {
                            throw new Error("JSON must be an array or object");
                        }
                        // Validate and create items
                        const created = await Item.createDocuments(itemsToImport, {keepId: false});
                        postConsoleAndNotification(`Imported ${created.length} item(s) successfully.`, "", false, false, true);
                    } catch (e) {
                        postConsoleAndNotification("Failed to import items", e, false, false, true);
                        ui.notifications.error("Failed to import items: " + e.message);
                    }
                }
            }
        },
        default: "ok",
        render: (htmlDialog) => {
          // Attach event listeners for template copy
          htmlDialog.find("#copy-item-template-btn").click(async () => {
            const type = htmlDialog.find("#item-template-type").val();
            // Only loot for now, but extensible
            if (type === "loot") {
              const promptWithDefaults = await getItemPromptWithDefaults(lootPrompt);
              copyToClipboard(promptWithDefaults);
            }
          });
        }
      }).render(true);
    });
    $(html).find(".header-actions.action-buttons").prepend(button);
});