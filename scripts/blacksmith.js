// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
// -- Import compendium manager --
import { compendiumManager } from './manager-compendiums.js';
// -- Import the shared GLOBAL variables --
// COFFEEPUB is now provided by AssetLookup for backward compatibility
// -- Load the shared GLOBAL functions --
import { 
    registerBlacksmithUpdatedHook, 
    resetModuleSettings
} from './api-core.js';
import { OpenAIAPI } from './api-openai.js';
// -- Global utilities --
import { 
    postConsoleAndNotification, 
    rollCoffeePubDice, 
    playSound, 
    getActorId, 
    getTokenImage, 
    getPortraitImage, 
    getTokenId, 
    objectToString, 
    stringToObject, 
    trimString, 
    generateFormattedDate, 
    toSentenceCase, 
    convertSecondsToRounds, 
    getSettingSafely
} from './api-core.js';
// -- Common Imports --
import { 
    createJournalEntry, 
    createHTMLList, 
    buildCompendiumLinkActor, 
    copyToClipboard 
} from './common.js';
// -- Import special page variables --
import { registerSettings, buildSelectedCompendiumArrays } from './settings.js';
import { BlacksmithWindowQuery } from './window-query.js';
import { BlacksmithLayer } from './canvas-layer.js';
import { addToolbarButton } from './manager-toolbar.js';
import { CombatTimer } from './timer-combat.js';
import { PlanningTimer } from './timer-planning.js';
import { RoundTimer } from './timer-round.js';
import { CombatStats } from './stats-combat.js';
import { CPBPlayerStats } from './stats-player.js';
import { MenuBar } from './api-menubar.js';
import { VoteManager } from './vote-manager.js';
import { WrapperManager } from './manager-libwrapper.js';
import { NavigationManager } from './manager-navigation.js';
import { ModuleManager } from './manager-modules.js';
import { UtilsManager } from './manager-utilities.js';
import { StatsAPI } from './api-stats.js';
import { CanvasTools } from './manager-canvas.js';
import { CombatTracker } from './combat-tracker.js';
import { LatencyChecker } from './latency-checker.js';
import { EncounterToolbar } from './encounter-toolbar.js';
import { JournalTools } from './journal-tools.js';
import { CSSEditor } from './window-gmtools.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { XpManager } from './xp-manager.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';
import { ConstantsGenerator } from './constants-generator.js';
import { assetLookup } from './asset-lookup.js';
import { registerWindowQueryPartials } from './window-query-registration.js';
import './combat-tools.js'; 
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
    // Only GMs need this cache for token image replacement
    if (!game.user.isGM) {
        return [];
    }
    
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
        postConsoleAndNotification(MODULE.NAME, "Error browsing folder", error, false, true);
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
        postConsoleAndNotification(MODULE.NAME, `Error loading template ${templatePath}`, error, false, false);
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
    
    // Setting not cached or expired, retrieve it safely
    let value;
    try {
        if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
            value = game.settings.get(MODULE.ID, settingKey);
        } else {
            value = defaultValue;
        }
    } catch (error) {
        console.warn(`Blacksmith: Error accessing setting ${settingKey}:`, error);
        value = defaultValue;
    }
    
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


// ================================================================== 
// ===== REGISTER HOOKS =============================================
// ================================================================== 


// Consolidate all settings-dependent initialization into a single ready hook
Hooks.once('ready', async () => {
    postConsoleAndNotification(MODULE.NAME, "BLACKSMITH: Ready hook started", "", false, false);
    try {
        // Register settings FIRST during the ready phase
        await registerSettings();
        
        // Initialize HookManager (infrastructure layer)
        HookManager.initialize();
        
        // Initialize OpenAI Memory System
        OpenAIAPI.initializeMemory();
        
        // Register the Blacksmith hook (after HookManager is initialized)
        registerBlacksmithUpdatedHook();
        
        // Register window-query partials early to prevent template errors
        await registerWindowQueryPartials();
        
        // Wait a bit to ensure settings are fully processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Double-check that settings are ready
        let retries = 0;
        while (!game.settings.settings.has(`${MODULE.ID}.trackCombatStats`) && retries < 10) {
            console.warn(`Blacksmith: Settings not fully ready, waiting... (attempt ${retries + 1}/10)`);
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
        }
        
        if (!game.settings.settings.has(`${MODULE.ID}.trackCombatStats`)) {
            console.error('Blacksmith: Settings failed to load after multiple attempts, skipping initialization');
            return;
        }

        // Initialize combat stats tracking
        CombatStats.initialize();

        // Initialize player stats tracking
        CPBPlayerStats.initialize();

        // Initialize XP manager
        XpManager.initialize();

        // Apply any existing custom CSS
        const editor = new CSSEditor();
        const css = getSettingSafely(MODULE.ID, 'customCSS', null);
        const transition = getSettingSafely(MODULE.ID, 'cssTransition', null);
        if (css) {
            editor.applyCSS(css, transition);
        }

        // Initialize other components that depend on settings
        WrapperManager.initialize();
        
        // Initialize scene navigation
        console.log('BLACKSMITH: About to call NavigationManager.initialize()');
        NavigationManager.initialize();
        console.log('BLACKSMITH: NavigationManager.initialize() completed');
        
        // Initialize latency checker
        LatencyChecker.initialize();
        
      
        // Initialize CanvasTools
        CanvasTools.initialize();
        
        // No longer needed - cache management is now handled by the new simplified system

        // Initialize ImageCacheManager (GM only)
        if (game.user.isGM) {
            try {
                const { ImageCacheManager } = await import('./manager-image-cache.js');
                await ImageCacheManager.initialize();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Error importing ImageCacheManager", error, true, false);
            }
        }

        // Initialize Token Image Utilities (turn indicators, etc.)
        try {
            const { TokenImageUtilities } = await import('./token-image-utilities.js');
            TokenImageUtilities.initializeTurnIndicator();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error importing TokenImageUtilities", error, true, false);
        }


        // Update nameplates
        updateNameplates();

        // Initialize other settings-dependent features
        initializeSettingsDependentFeatures();

        // Initialize scene interactions
        initializeSceneInteractions();
        
        // Initialize the unified roll system API
        const { executeRoll } = await import('./manager-rolls.js');
        BLACKSMITH.rolls.execute = executeRoll;

        // JOURNAL TOOLS
        JournalTools.init();
        
        // ENCOUNTER TOOLBAR
        EncounterToolbar.init();

    } catch (error) {
        console.error('Error during Blacksmith initialization:', error);
    }
});

// Function to initialize all settings-dependent features
function initializeSettingsDependentFeatures() {
    // RICH CONSOLE
            // Console styling now handled internally in postConsoleAndNotification

    // DEBUG ON/OFF
    const blnDebugOn = getCachedSetting('globalDebugMode');
    BLACKSMITH.updateValue('blnDebugOn', blnDebugOn);
    
    // DEBUG STYLE
            // Console styling now handled internally in postConsoleAndNotification    
    
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
    // Game Systems
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
    
    // Set default card theme
    let strDefaultCardTheme = getSettingSafely(MODULE.ID, 'defaultCardTheme', 'default');
    BLACKSMITH.updateValue('strDefaultCardTheme', strDefaultCardTheme);

    // *** CHECK FOR MACRO BUTTONS ***
    // OPEN AI WINDOW
    if(strOpenAIMacro) {
        let OpenAIMacro = game.macros.getName(strOpenAIMacro);
        if(OpenAIMacro) {
            OpenAIMacro.execute = async () => {
                buildButtonEventRegent();
            };
        } else {
            postConsoleAndNotification(MODULE.NAME, "OpenAI Macro specified is not a valid macro name. Make sure there is a macro matching the name you entered in the Blacksmith settings.", strOpenAIMacro, true, true);
        }
            } else {
            postConsoleAndNotification(MODULE.NAME, "Macro for OpenAI not set.", "", true, true);
        }
    }

    // Function to initialize scene interactions
    function initializeSceneInteractions() {
        const blnShowIcons = getSettingSafely(MODULE.ID, 'enableSceneInteractions', false);
        const blnCustomClicks = getSettingSafely(MODULE.ID, 'enableSceneClickBehaviors', false);
        
        // Initial icon update if enabled
        if (blnShowIcons) {
            NavigationManager._updateSceneIcons();
        }

        // Register for scene updates
        if (blnShowIcons || blnCustomClicks) {
            // Register canvas hooks
            if (blnCustomClicks) {
                // Register canvasInit hook
                const canvasInitHookId = HookManager.registerHook({
                    name: 'canvasInit',
                    description: 'Blacksmith: Initialize canvas toolbar',
                    context: 'blacksmith-canvas-init',
                    priority: 3, // Normal priority - canvas initialization
                    callback: () => {
                        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                        
                        // Canvas initialization complete
                        
                        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                    }
                });

                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | canvasInit", "blacksmith-canvas-init", true, false);

                // Register canvasReady hook for layer checking
                const canvasReadyLayerHookId = HookManager.registerHook({
                    name: 'canvasReady',
                    description: 'Blacksmith: Check for blacksmith utilities layer availability',
                    context: 'blacksmith-canvas-layer-check',
                    priority: 3, // Normal priority - layer verification
                    callback: (canvas) => {
                        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                        
                        const blacksmithLayer = canvas['blacksmith-utilities-layer'];
                        // Layer availability checked silently
                        
                        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                    }
                });

                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | canvasReady (layer)", "blacksmith-canvas-layer-check", true, false);
            }

            // Register updateScene hook for scene icon updates
            const updateSceneHookId = HookManager.registerHook({
                name: 'updateScene',
                description: 'Blacksmith: Update scene icons when scene changes',
                context: 'blacksmith-scene-icons',
                priority: 3, // Normal priority - UI updates
                callback: () => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    NavigationManager._updateSceneIcons();
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                }
            });

            // Log hook registration
            postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateScene", "blacksmith-scene-icons", true, false);
            
            // Register canvasReady hook for scene icon updates
            const canvasReadyIconsHookId = HookManager.registerHook({
                name: 'canvasReady',
                description: 'Blacksmith: Update scene icons when canvas is ready',
                context: 'blacksmith-canvas-icons',
                priority: 3, // Normal priority - UI updates
                callback: () => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    NavigationManager._updateSceneIcons();
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                }
            });

            // Log hook registration
            postConsoleAndNotification(MODULE.NAME, "Hook Manager | canvasReady (icons)", "blacksmith-canvas-icons", true, false);
        }
    }

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

// ***************************************************
// ** INIT
// ***************************************************

// Call the hookCanvas function during the initialization phase
Hooks.once('init', async function() {

    // ===== INITIALIZE SYSTEMS =============================================

    // Initialize ModuleManager first
    ModuleManager.initialize();
    
    // Initialize UtilsManager
    UtilsManager.initialize();
    
    // Socket initialization moved to 'ready' hook for proper SocketLib integration
    
    // Register chat message click handler for skill rolls
    const skillCheckChatHookId = HookManager.registerHook({
        name: 'renderChatMessage',
        description: 'Blacksmith: Handle skill check chat message clicks',
        context: 'blacksmith-skill-check',
        priority: 3, // Normal priority - UI interaction
        callback: (message, html) => {
            if (message.flags?.['coffee-pub-blacksmith']?.type === 'skillCheck') {
                // Check ownership and disable buttons for non-owners
                const skillCheckActors = html.find('.cpb-skill-check-actor');
                
                skillCheckActors.each(function() {
                    const actorDiv = $(this);
                    const actorId = actorDiv.data('actor-id');
                    const isGM = game.user.isGM;
                    
                    if (actorId) {
                        const actor = game.actors.get(actorId);
                        const isOwner = actor?.isOwner || false;
                        
                        // Disable if not owner and not GM
                        if (!isOwner && !isGM) {
                            actorDiv.addClass('disabled');
                        }
                    }
                });
                
                SkillCheckDialog.handleChatMessageClick(message, html);
            }
        }
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessage", "blacksmith-skill-check", true, false);
    
    // Register window lifecycle hooks for efficient lookups
    const renderApplicationHookId = HookManager.registerHook({
        name: 'renderApplication',
        description: 'Blacksmith: Register blacksmith windows on render',
        context: 'blacksmith-window-registration',
        priority: 3, // Normal priority - window management
        callback: (app, html, data) => {
            if (app instanceof BlacksmithWindowQuery) {
                registerBlacksmithWindow(app);
            }
        }
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderApplication", "blacksmith-window-registration", true, false);
    
    // Register closeApplication hook for window cleanup
    const closeApplicationHookId = HookManager.registerHook({
        name: 'closeApplication',
        description: 'Blacksmith: Unregister blacksmith windows on close',
        context: 'blacksmith-window-cleanup',
        priority: 3, // Normal priority - window management
        callback: (app) => {
            //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
            
            if (app instanceof BlacksmithWindowQuery) {
                unregisterBlacksmithWindow(app);
            }
            
            //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
        }
    });

    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | closeApplication", "blacksmith-window-cleanup", true, false);
    
    // Register settingChange hook for cache management
    const settingChangeHookId = HookManager.registerHook({
        name: 'settingChange',
        description: 'Blacksmith: Clear settings cache when settings change',
        context: 'blacksmith-settings-cache',
        priority: 3, // Normal priority - cache management
        callback: (moduleId, settingKey, value) => {
            //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
            
            if (moduleId === MODULE.ID) {
                clearSettingsCache();
                
                // Rebuild selected compendium arrays if compendium settings changed
                // Match any numCompendiums* setting or any *Compendium{number} setting
                const compendiumSettingPattern = /^(numCompendiums|.+Compendium\d+)$/;
                if (compendiumSettingPattern.test(settingKey)) {
                    buildSelectedCompendiumArrays();
                }
            }
            
            //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
        }
    });

    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | settingChange", "blacksmith-settings-cache", true, false);
    
    // Initialize other systems
    await MenuBar.initialize();
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

    // BLACKSMITH TOOLBAR MANAGER
    // Register toolbar button and expose API
    addToolbarButton();
    
    // Import and expose toolbar API functions
    import('./manager-toolbar.js').then(({ 
        registerToolbarTool, 
        unregisterToolbarTool, 
        getRegisteredTools, 
        getToolsByModule, 
        isToolRegistered, 
        getToolbarSettings, 
        setToolbarSettings 
    }) => {
        module.api.registerToolbarTool = registerToolbarTool;
        module.api.unregisterToolbarTool = unregisterToolbarTool;
        module.api.getRegisteredTools = getRegisteredTools;
        module.api.getToolsByModule = getToolsByModule;
        module.api.isToolRegistered = isToolRegistered;
        module.api.getToolbarSettings = getToolbarSettings;
        module.api.setToolbarSettings = setToolbarSettings;
        
        postConsoleAndNotification(MODULE.NAME, "Toolbar API: Exposed for external modules", "", true, false);
    }).catch(error => {
        postConsoleAndNotification(MODULE.NAME, "Failed to load toolbar API", error, false, false);
    });

    // Import and expose menubar API functions
    import('./api-menubar.js').then(({ MenuBar }) => {
        module.api.registerMenubarTool = MenuBar.registerMenubarTool.bind(MenuBar);
        module.api.unregisterMenubarTool = MenuBar.unregisterMenubarTool.bind(MenuBar);
        module.api.getRegisteredMenubarTools = MenuBar.getRegisteredMenubarTools.bind(MenuBar);
        module.api.getMenubarToolsByModule = MenuBar.getMenubarToolsByModule.bind(MenuBar);
        module.api.isMenubarToolRegistered = MenuBar.isMenubarToolRegistered.bind(MenuBar);
        module.api.getMenubarToolsByZone = MenuBar.getMenubarToolsByZone.bind(MenuBar);
        module.api.testMenubarAPI = MenuBar.testMenubarAPI.bind(MenuBar);
        module.api.testRefactoredMenubar = MenuBar.testRefactoredMenubar.bind(MenuBar);
        module.api.testInterfaceTool = MenuBar.testInterfaceTool.bind(MenuBar);
        module.api.testSettingsTool = MenuBar.testSettingsTool.bind(MenuBar);
        module.api.testMovementTool = MenuBar.testMovementTool.bind(MenuBar);
        
        // Notification API
        module.api.addNotification = MenuBar.addNotification.bind(MenuBar);
        module.api.updateNotification = MenuBar.updateNotification.bind(MenuBar);
        module.api.removeNotification = MenuBar.removeNotification.bind(MenuBar);
        module.api.clearNotificationsByModule = MenuBar.clearNotificationsByModule.bind(MenuBar);
        module.api.getActiveNotifications = MenuBar.getActiveNotifications.bind(MenuBar);
        module.api.clearAllNotifications = MenuBar.clearAllNotifications.bind(MenuBar);
        module.api.getNotificationIdsByModule = MenuBar.getNotificationIdsByModule.bind(MenuBar);
        
        // Secondary Bar API
        module.api.registerSecondaryBarType = MenuBar.registerSecondaryBarType.bind(MenuBar);
        module.api.openSecondaryBar = MenuBar.openSecondaryBar.bind(MenuBar);
        module.api.closeSecondaryBar = MenuBar.closeSecondaryBar.bind(MenuBar);
        module.api.toggleSecondaryBar = MenuBar.toggleSecondaryBar.bind(MenuBar);
        module.api.updateSecondaryBar = MenuBar.updateSecondaryBar.bind(MenuBar);
        
        // Combat Bar API
        module.api.openCombatBar = MenuBar.openCombatBar.bind(MenuBar);
        module.api.closeCombatBar = MenuBar.closeCombatBar.bind(MenuBar);
        module.api.updateCombatBar = MenuBar.updateCombatBar.bind(MenuBar);
        module.api.testNotificationSystem = MenuBar.testNotificationSystem.bind(MenuBar);
        module.api.testSecondaryBarSystem = MenuBar.testSecondaryBarSystem.bind(MenuBar);
        
        postConsoleAndNotification(MODULE.NAME, "Menubar API: Exposed for external modules", "", true, false);
    }).catch(error => {
        postConsoleAndNotification(MODULE.NAME, "Failed to load menubar API", error, false, false);
    });

    hookCanvas();

    // Initialize SocketManager at 'ready' instead of 'init' for proper SocketLib integration
    // Use dynamic import to ensure SocketManager is loaded
    import('./manager-sockets.js').then(({ SocketManager }) => {
        SocketManager.initialize();
    }).catch(error => {
        postConsoleAndNotification(MODULE.NAME, "Failed to initialize SocketManager", error, false, false);
    });






    // =========================================================================
    // ===== BEGIN: EXPOSE API =================================================
    // =========================================================================
    // Expose our API on the module
    const module = game.modules.get(MODULE.ID);
    module.api = {
        ModuleManager,
        registerModule: ModuleManager.registerModule.bind(ModuleManager),
        isModuleActive: ModuleManager.isModuleActive.bind(ModuleManager),
        getModuleFeatures: ModuleManager.getModuleFeatures.bind(ModuleManager),
        utils: UtilsManager.getUtils(),
        version: MODULE.APIVERSION,
        BLACKSMITH: BLACKSMITH,
        stats: StatsAPI,
        HookManager,  // ✅ NEW: Expose HookManager for other Coffee Pub modules
        ConstantsGenerator,  // ✅ NEW: Expose ConstantsGenerator for constants generation
        assetLookup,  // ✅ NEW: Expose AssetLookup for flexible asset access
        openai: OpenAIAPI,  // ✅ NEW: Expose OpenAI API for AI functionality
        // ✅ NEW: Toolbar API for external modules
        registerToolbarTool: null,  // Will be set after toolbar manager loads
        unregisterToolbarTool: null,
        getRegisteredTools: null,
        getToolsByModule: null,
        isToolRegistered: null,
        getToolbarSettings: null,
        setToolbarSettings: null,
        // ✅ NEW: Menubar API for external modules
        registerMenubarTool: null,  // Will be set after menubar loads
        unregisterMenubarTool: null,
        getRegisteredMenubarTools: null,
        getMenubarToolsByModule: null,
        isMenubarToolRegistered: null,
        getMenubarToolsByZone: null,
        testMenubarAPI: null,
        testRefactoredMenubar: null,
        testInterfaceTool: null,
        testSettingsTool: null,
        testMovementTool: null,
        
        // Notification API
        addNotification: null,
        updateNotification: null,
        removeNotification: null,
        clearNotificationsByModule: null,
        getActiveNotifications: null,
        clearAllNotifications: null,
        getNotificationIdsByModule: null,
        // ✅ NEW: Secondary Bar API for external modules
        registerSecondaryBarType: null,
        openSecondaryBar: null,
        closeSecondaryBar: null,
        toggleSecondaryBar: null,
        updateSecondaryBar: null,
        // ✅ NEW: Combat Bar API for external modules
        openCombatBar: null,
        closeCombatBar: null,
        updateCombatBar: null,
        testNotificationSystem: null
    };
    
    // Toolbar management is now handled directly in manager-toolbar.js
    // =========================================================================
    // ===== END: EXPOSE API =================================================
    // =========================================================================


});



// ***************************************************
// ** Customize the Token Nameplates
// ***************************************************

// Nameplates are now updated only when tokens are created (dropped on canvas)
const createTokenHookId = HookManager.registerHook({
    name: 'createToken',
    description: 'Blacksmith: Update token nameplates on creation',
    context: 'blacksmith-nameplates',
    priority: 3, // Normal priority - UI enhancement
    callback: updateNameplates
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | createToken", "blacksmith-nameplates", true, false);



// ***************************************************
// ** HOOKS ON: CREATE NOTE
// ***************************************************

// Flag to track if Ctrl key was active during renderNoteConfig
let ctrlKeyActiveDuringRender = false;
let shiftKeyActiveDuringRender = false;
let altKeyActiveDuringRender = false;
// Register renderNoteConfig hook
const renderNoteConfigHookId = HookManager.registerHook({
    name: 'renderNoteConfig',
    description: 'Blacksmith: Configure note icons and settings',
    context: 'blacksmith-note-config',
    priority: 3, // Normal priority - UI enhancement
    callback: async (app, html, data) => {
        // Only GMs can configure note icons
        if (!game.user.isGM) {
            return;
        }

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
                    postConsoleAndNotification(MODULE.NAME, "Entry Icon field not found", "", false, false);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error loading note config icons", error, false, false);
        }

    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderNoteConfig", "blacksmith-note-config", true, false);

// Register preCreateNote hook
const preCreateNoteHookId = HookManager.registerHook({
    name: 'preCreateNote',
    description: 'Blacksmith: Handle note creation events',
    context: 'blacksmith-note-creation',
    priority: 3, // Normal priority - UI enhancement
    callback: async (note, options, userId) => {
        // Only GMs can set default note icons
        if (!game.user.isGM) {
            return;
        }
        // Note creation hook - silent operation
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | preCreateNote", "blacksmith-note-creation", true, false);



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

const journalDoubleClickHookId = HookManager.registerHook({
    name: 'renderJournalSheet',
    description: 'Blacksmith: Enable journal double-click editing for GMs',
    context: 'blacksmith-journal-double-click',
    priority: 3, // Normal priority - UI enhancement
    callback: (app, html, data) => {
        // Only GMs can enable journal double-click editing
        if (!game.user.isGM) {
            return;
        }
        
        let blnJournalDoubleClick = game.settings.get(MODULE.ID, 'enableJournalDoubleClick');
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
            
            // Remove any existing handler first to prevent accumulation
            html.off('dblclick', '.journal-entry-page');
            
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
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderJournalSheet", "blacksmith-journal-double-click", true, false);

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
              postConsoleAndNotification(MODULE.NAME, "Error when executing macro " + macroName, error, false, false);
      throw error;
    }
}

// ***************************************************
// ** RENDER CHAT MESSAGE
// ***************************************************
// Looks for a specific span code and hides the header of that card
// <span style="visibility: visible">coffeepub-hide-header</span>

const hideHeaderChatHookId = HookManager.registerHook({
    name: 'renderChatMessage',
    description: 'Blacksmith: Hide chat message headers based on coffeepub-hide-header flag',
    context: 'blacksmith-hide-header',
    priority: 3, // Normal priority - UI enhancement
    callback: (message, html, data) => {

        let hideHeaderFlag = html.find('span:contains("coffeepub-hide-header")');
        if (hideHeaderFlag.length) { 
          // Found the "coffeepub-hide-header" flag within the message
          hideHeaderFlag.parents('.message').find('.message-header').hide()
      
          // Now remove or hide the "coffeepub-hide-header" flag itself
          hideHeaderFlag.css("display", "none");
        }
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessage", "blacksmith-hide-header", true, false);

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
      value = game.settings.get(MODULE.ID, key);
    } catch (e) {}
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
        try {
          value = game.settings.get(MODULE.ID, 'narrativeDefaultImagePath');
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
      value = game.settings.get(MODULE.ID, key);
    } catch (e) {}
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
        try {
          value = game.settings.get(MODULE.ID, 'encounterDefaultImagePath');
        } catch (e) {}
      }
    }
    if (!value) continue; // leave placeholder if not set
    result = result.split(placeholder).join(value);
  }
  return result;
}

// Register renderJournalDirectory hook
const renderJournalDirectoryHookId = HookManager.registerHook({
    name: 'renderJournalDirectory',
    description: 'Blacksmith: Add JSON import functionality to journal directory',
    context: 'blacksmith-journal-directory',
    priority: 3, // Normal priority - UI enhancement
    callback: async (app, html, data) => {
        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
        
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
                                postConsoleAndNotification(MODULE.NAME, "Can't create the journal entry. The journal type was not found.", strJournalType, false, true);
                        }
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, "Failed to parse JSON", e, false, true);
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
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderJournalDirectory", "blacksmith-journal-directory", true, false);

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
    const openAIResponse = await OpenAIAPI.getOpenAIReplyAsHtml(strQuestion);

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

/**
 * Scroll the Foundry chat log to the bottom
 */
function _scrollChatToBottom() {
    try {
        // Find the chat log container
        const chatLog = document.querySelector('#chat-log');
        if (chatLog) {
            chatLog.scrollTop = chatLog.scrollHeight;
        }
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `_scrollChatToBottom error:`, error, true, false);
    }
}

// ***************************************************
// ** UTILITY Update Token Nameplates
// ***************************************************

  function updateNameplates(tokenDocument, options, userId) {
    // Only process if we have a specific token (from createToken hook)
    if (!tokenDocument) {
        // Fallback: process all tokens (for ready hook)
        let tokens = canvas.tokens.placeables;
        for (let token of tokens) {
            updateSingleTokenNameplate(token);
        }
        return;
    }

    // Process only the newly created token
    const token = canvas.tokens.get(tokenDocument.id);
    if (token) {
        updateSingleTokenNameplate(token);
    }
  }

  function updateSingleTokenNameplate(token) {
    let strNameplateFontsize = getCachedSetting('nameplateFontSize') + "px";
    let strNameplateColor = getCachedSetting('nameplateColor');
    let strNameplateOutlineSize = getCachedSetting('nameplateOutlineSize');
    let strNameplateOutlineColor = getCachedSetting('nameplateOutlineColor');
    let strNameplateFontFamily = getCachedSetting('nameplateFontFamily');
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

/**
 * Detect the active d20 roll result from a roll object
 * @param {object} result - The roll result object
 * @returns {number|null} The active d20 roll value or null if not found
 */
function detectD20Roll(result) {
    // First try the terms structure (newer Foundry format)
    if (result?.terms) {
        for (const term of result.terms) {
            if ((term.class === 'D20Die' || (term.class === 'Die' && term.faces === 20)) && term.results && term.results.length > 0) {
                // For advantage/disadvantage, find the active result
                if (term.results.length === 2) {
                    // This is advantage/disadvantage - find the active result
                    const activeResult = term.results.find(r => r.active === true);
                    if (activeResult) {
                        return activeResult.result;
                    } else {
                        // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                        const isDisadvantage = term.modifiers && term.modifiers.includes('kl');
                        return isDisadvantage ? term.results[0].result : term.results[term.results.length - 1].result;
                    }
                } else {
                    // Single d20 roll
                    return term.results[0].result;
                }
            }
        }
    }
    
    // Fallback to dice structure (older format)
    if (result?.dice) {
        for (const die of result.dice) {
            if (die.faces === 20 && die.results && die.results.length > 0) {
                // For advantage/disadvantage, find the active result
                if (die.results.length === 2) {
                    // This is advantage/disadvantage - find the active result
                    const activeResult = die.results.find(r => r.active === true);
                    if (activeResult) {
                        return activeResult.result;
                    } else {
                        // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                        const isDisadvantage = die.modifiers && die.modifiers.includes('kl');
                        return isDisadvantage ? die.results[0].result : die.results[die.results.length - 1].result;
                    }
                } else {
                    // Single d20 roll
                    return die.results[0].result;
                }
            }
        }
    }
    
    return null;
}

export async function handleSkillRollUpdate(data) {
    const { messageId, tokenId, result } = data;
    const message = game.messages.get(messageId);
    if (!message) return;

    const flags = message.flags['coffee-pub-blacksmith'] || {};
    if (!flags?.type === 'skillCheck') return;

    // --- Always recalculate group roll summary on the GM side ---
    // 1. Update the correct actor's result with the new, plain result object
    const actors = (flags.actors || []).map(a => {
        const actorResult = a.id === tokenId ? result : a.result;
        
        // Add crit/fumble detection to the result
        if (actorResult) {
            const d20Roll = detectD20Roll(actorResult);
            if (d20Roll === 20) {
                actorResult.isCritical = true;
            } else if (d20Roll === 1) {
                actorResult.isFumble = true;
            }
        }
        
        return {
            ...a,
            result: actorResult
        };
    });

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
    
    // Scroll chat to bottom to show the updated group results (with delay to ensure DOM is updated)
    setTimeout(() => {
        _scrollChatToBottom();
    }, 100);

    // Broadcast the final result to all clients for UI updates (like cinematic mode)
    const socket = SocketManager.getSocket();
    if (socket) {
        await socket.executeForEveryone("skillRollFinalized", {
            type: "skillRollFinalized",  // Add type property
            messageId: message.id,
            flags: updatedMessageData,
            rollData: data // Pass along the specific roll data (tokenId, result)
        });
    }

    // Cinema overlay updates are now handled by the new system in deliverRollResults()

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
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-RULEBOOKS-HERE]', key: 'defaultRulebooks' },
    { placeholder: '[ADD-ITEM-SOURCE-HERE]', key: 'defaultCampaignName' }
  ];

  let result = itemPrompt;
  for (const setting of settings) {
    let value = '';
    try {
      value = game.settings.get(MODULE.ID, setting.key);
    } catch (e) {}
    if (value) {
      result = result.split(setting.placeholder).join(value);
    }
  }
  return result;
}

// Helper to replace placeholders in the table prompt with settings values
async function getTablePromptWithDefaults(tablePrompt) {
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-RULEBOOKS-HERE]', key: 'defaultRulebooks' },
    { placeholder: '[ADD-ITEM-SOURCE-HERE]', key: 'defaultCampaignName' }
  ];

  let result = tablePrompt;
  for (const setting of settings) {
    let value = '';
    try {
      value = game.settings.get(MODULE.ID, setting.key);
    } catch (e) {}
    if (value) {
      result = result.split(setting.placeholder).join(value);
    }
  }
  return result;
}

// Helper to replace placeholders in the actor prompt with settings values
async function getActorPromptWithDefaults(actorPrompt) {
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-RULEBOOKS-HERE]', key: 'defaultRulebooks' },
    { placeholder: '[ADD-NPC-SOURCE-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', key: 'defaultPartySize' },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', key: 'defaultPartyLevel' },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', key: 'defaultPartyMakeup' }
  ];

  let result = actorPrompt;
  for (const setting of settings) {
    let value = '';
    try {
      value = game.settings.get(MODULE.ID, setting.key);
    } catch (e) {}
    if (value) {
      result = result.split(setting.placeholder).join(value);
    }
  }
  return result;
}

// Helper to get comma-delimited list of world actors
function getWorldActorsList() {
  try {
    const actors = game.actors.contents.filter(actor => !actor.isToken);
    return actors.map(actor => actor.name).join(', ');
  } catch (e) {
    return 'No actors found';
  }
}

// Helper to get comma-delimited list of world items
function getWorldItemsList() {
  try {
    const items = game.items.contents;
    return items.map(item => item.name).join(', ');
  } catch (e) {
    return 'No items found';
  }
}

// Cache for icon paths with expiration
let iconPathsCache = null;

// Recursively collect all image files in icons/ and subdirectories
async function getIconPaths() {
  // Only GMs need this cache for item import operations
  if (!game.user.isGM) {
    return [];
  }
  
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
  // Only GMs need this for item import operations
  if (!game.user.isGM) {
    return '';
  }
  
  const paths = await getIconPaths();
  const name = (item.itemName || '').toLowerCase();
  const description = (item.itemDescription || '').toLowerCase();
  const lootType = (item.itemLootType || '').toLowerCase();

  // Check if enhanced image guessing is enabled
  const enhancedEnabled = game.settings.get(MODULE.ID, 'enableEnhancedImageGuessing');

  // Load the comprehensive synonym mapping
  let synonymMapping = {};
  if (enhancedEnabled) {
    try {
      const response = await fetch('modules/coffee-pub-blacksmith/resources/taxonomy.json');
      synonymMapping = await response.json();
    } catch (error) {
      console.warn('BLACKSMITH | Item Import | Could not load taxonomy.json, falling back to basic mapping');
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
          return chosen;
        }
      }
    }
  }

  // 5. Try loot type as folder
  if (lootType) {
    const lootTypeMatch = paths.find(path => path.toLowerCase().includes(`/${lootType}/`));
    if (lootTypeMatch) {
      return lootTypeMatch;
    }
  }

  // 6. Try filename match for any synonym in any folder
  for (const synonym of Object.keys(synonymMapping)) {
    const fileMatch = paths.find(path =>
      path.toLowerCase().match(new RegExp(`(^|/|_|-)${synonym}(-|_|\.|$)`, 'i'))
    );
    if (fileMatch) {
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
      return chosen;
    }
  }

  // 8. Ultimate fallback
  return "icons/commodities/treasure/mask-jeweled-gold.webp";
}

// Utility function to get available synonyms for debugging
async function getAvailableSynonyms() {
  try {
    const response = await fetch('modules/coffee-pub-blacksmith/resources/taxonomy.json');
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
  
  const result = await guessIconPath(testItem);
  
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
  } else if (type === "consumable") {
    data = {
      type: "consumable",
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
        consumableType: { value: flat.consumableType || flat.itemConsumableType || "potion" },
        type: { value: flat.consumableType || flat.itemConsumableType || "potion" },
        properties: { 
          mgc: flat.consumptionMagical !== undefined ? flat.consumptionMagical : flat.itemIsMagical 
        },
        source: { custom: flat.itemSource },
        quantity: flat.itemQuantity,
        identified: flat.itemIdentified,
        uses: {
          spent: flat.limitedUsesSpent || 0,
          max: flat.limitedUsesMax || flat.itemLimitedUses || 1,
          recovery: flat.recoveryPeriod && flat.recoveryPeriod.toLowerCase() !== "none" ? [{ 
            period: flat.recoveryPeriod.toLowerCase().replace(' ', '').replace('rest', ''), 
            formula: String(flat.limitedUsesMax || flat.itemLimitedUses || 1)
          }] : [],
          autoDestroy: flat.destroyOnEmpty !== undefined ? flat.destroyOnEmpty : flat.itemDestroyOnEmpty
        },
        consume: {
          type: flat.destroyOnEmpty !== undefined ? (flat.destroyOnEmpty ? "destroy" : "none") : (flat.itemDestroyOnEmpty ? "destroy" : "none"),
          target: null,
          amount: null
        },
        recharge: {
          value: flat.recoveryPeriod || "none",
          formula: flat.recoveryAmount || "recover all uses"
        }
      },
      flags: {
        "coffee-pub": {
          source: flat.itemSource
        }
      }
    };
    
    // Add attunement if magical
    if (flat.consumptionMagical && flat.magicalAttunementRequired) {
      data.system.attunement = flat.magicalAttunementRequired;
    }
    
    // Add activities if present
    if (flat.activities && Array.isArray(flat.activities)) {
      data.system.activities = {};
      flat.activities.forEach((activity, index) => {
        // Let FoundryVTT generate the ID automatically
        const activityId = `activity${index}`;
        data.system.activities[activityId] = {
          type: (activity.activityType || "util").toLowerCase(),
          name: activity.activityName || activity.activityType || "Use",
          img: activity.activityIcon || "",
          activation: {
            type: "action",
            value: 1,
            condition: ""
          },
          consumption: {
            targets: [],
            scaling: { allowed: false, max: "" }
          },
          description: {
            chatFlavor: activity.activityFlavorText || ""
          },
          duration: {
            value: "",
            units: ""
          },
          range: {},
          target: {},
          uses: {
            spent: 0,
            max: "",
            recovery: []
          },
          // Add effect configuration based on activity type
          ...(activity.activityType && activity.activityType.toLowerCase() === "heal" ? {
            healing: {
              number: activity.activityEffectValue || 0,
              denomination: activity.activityEffectDie ? activity.activityEffectDie.replace('d', '') : "",
              bonus: activity.activityEffectBonus || 0,
              types: activity.activityEffectType || "healing"
            }
          } : {}),
          ...(activity.activityType && activity.activityType.toLowerCase() === "attack" ? {
            damage: {
              formula: activity.activityFormula || "",
              parts: [[activity.activityFormula || "", activity.activityEffectType || "damage"]]
            }
          } : {})
        };
      });
    }
  }
  // Future: Add more item type mappings here
  return data;
}

/**
 * Parse actor JSON (NPC/Monster) into FoundryVTT D&D5E actor data.
 * @param {object} actorData - The actor JSON data.
 * @returns {object} - The FoundryVTT actor data object.
 */
async function parseActorJSONToFoundry(actorData) {
  // Validate required fields
  if (!actorData.name) {
    throw new Error("Actor name is required");
  }
  
  // Ensure type is npc (we don't support character imports yet)
  const data = { ...actorData };
  if (data.type && data.type !== "npc") {
    data.type = "npc";
  } else if (!data.type) {
    data.type = "npc";
  }
  
  // Process items, spells, and features using compendium manager
  const processedData = await compendiumManager.processCharacterData(data);
  
  // Ensure prototypeToken is present (v13 compatibility)
  if (!processedData.prototypeToken) {
    processedData.prototypeToken = {};
  }
  
  // Set default ownership (GM only)
  if (!processedData.ownership) {
    processedData.ownership = { default: 0 };
  }
  
  // Ensure folder is null (root folder)
  processedData.folder = null;
  
  // Just preserve the data as-is - no modifications needed
  
  // Ensure token has proper texture settings
  if (processedData.token) {
    if (!processedData.token.texture) {
      processedData.token.texture = {
        "src": "icons/svg/mystery-man.svg",
        "scaleX": 1,
        "scaleY": 1
      };
    } else if (!processedData.token.texture.src) {
      processedData.token.texture.src = "icons/svg/mystery-man.svg";
    }
  }
  
  return processedData;
}

// Helper to convert flat table data to Foundry RollTable format
async function parseTableToFoundry(flat) {
  const data = {
    name: flat.tableName || "Imported Table",
    description: flat.tableDescription || "",
    img: flat.tableImagePath || "",
    formula: "1d100",
    replacement: flat.drawWithReplacement !== false, // Default to true
    displayRoll: flat.displayRollFormula === true, // Default to false
    results: []
  };

  // Process results
  if (flat.results && Array.isArray(flat.results)) {
    let currentRange = 1;
    
    for (const result of flat.results) {
      const weight = result.resultWeight || 1;
      const rangeLower = result.resultRangeLower || currentRange;
      const rangeUpper = result.resultRangeUpper || (currentRange + weight - 1);
      
      const tableResult = {
        type: (result.resultType || "text").toLowerCase(),
        text: result.resultText || "",
        img: result.resultImagePath || "",
        weight: weight,
        range: [rangeLower, rangeUpper],
        drawn: false
      };

      // Add type-specific fields
      if (tableResult.type === "document" && result.resultDocumentType) {
        // Use documentCollection field and capitalize for FoundryVTT compatibility
        tableResult.documentCollection = result.resultDocumentType.charAt(0).toUpperCase() + result.resultDocumentType.slice(1);
      }
      
      if (tableResult.type === "compendium" && result.resultCompendium) {
        tableResult.collection = result.resultCompendium;
      }

      data.results.push(tableResult);
      currentRange = rangeUpper + 1;
    }
  }

  return data;
}

// Register renderItemDirectory hook for item import functionality
const renderItemDirectoryHookId = HookManager.registerHook({
    name: 'renderItemDirectory',
    description: 'Blacksmith: Add JSON import functionality to item directory',
    context: 'blacksmith-item-directory',
    priority: 3, // Normal priority - UI enhancement
    callback: async (app, html, data) => {
        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
    // Only GMs can import items
    if (!game.user.isGM) {
        return;
    }
    
    // Fetch the item prompt templates at runtime
    const lootPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-items-loot.txt')).text();
    const consumablePrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-items-consumables.txt')).text();

    // Build dialog content with dropdown and button
    const dialogContent = `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <select id="item-template-type" style="flex: 0 0 auto;">
          <option value="loot">Loot</option>
          <option value="consumable">Consumables</option>
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
                        postConsoleAndNotification(MODULE.NAME, `Imported ${created.length} item(s) successfully.`, "", false, true);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, "Failed to import items", e, false, true);
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
            if (type === "loot") {
              const promptWithDefaults = await getItemPromptWithDefaults(lootPrompt);
              copyToClipboard(promptWithDefaults);
            } else if (type === "consumable") {
              const promptWithDefaults = await getItemPromptWithDefaults(consumablePrompt);
              copyToClipboard(promptWithDefaults);
            }
          });
        }
      }).render(true);
    });
        $(html).find(".header-actions.action-buttons").prepend(button);
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderItemDirectory", "blacksmith-item-directory", true, false);

// Register renderRollTableDirectory hook for table import functionality
const renderRollTableDirectoryHookId = HookManager.registerHook({
    name: 'renderRollTableDirectory',
    description: 'Blacksmith: Add JSON import functionality to rolltable directory',
    context: 'blacksmith-rolltable-directory',
    priority: 3, // Normal priority - UI enhancement
    callback: async (app, html, data) => {
        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
    // Only GMs can import tables
    if (!game.user.isGM) {
        return;
    }
    
    // Fetch the table prompt templates at runtime
    const tablePrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-text.txt')).text();
    const tableDocumentCustomPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-document-custom.txt')).text();
    const tableDocumentActorPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-document-actor.txt')).text();
    const tableDocumentItemPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-document-items.txt')).text();

    // Build dialog content with dropdown and button
    const dialogContent = `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <select id="table-template-type" style="flex: 0 0 auto;">
          <option value="text">Simple Text Rollable Table</option>
          <option value="document-custom">Document: Custom</option>
          <option value="document-actor">Document: Actor</option>
          <option value="document-item">Document: Item</option>
        </select>
        <button id="copy-table-template-btn" type="button">Copy Template to Clipboard</button>
      </div>
      <textarea id="table-json-input" style="width:100%;height:400px;"></textarea>
    `;

    const button = $(`<button><i class="fa-solid fa-dice-d20"></i> Import JSON to Tables</button>`);
    button.click(() => {
      new Dialog({
        title: "Paste JSON for Tables",
        content: dialogContent,
        width: 800,
        height: 800,
        buttons: {
            cancel: {
                icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                label: "Cancel",
            },
            ok: {
                icon: "<i class='fa-solid fa-dice-d20'></i>",
                label: "Import JSON",
                callback: async (html) => {
                    const jsonData = html.find("#table-json-input").val();
                    let tablesToImport = [];
                    try {
                        let parsed = JSON.parse(jsonData);
                        if (Array.isArray(parsed)) {
                            tablesToImport = await Promise.all(parsed.map(parseTableToFoundry));
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            tablesToImport = [await parseTableToFoundry(parsed)];
                        } else {
                            throw new Error("JSON must be an array or object");
                        }
                        // Validate and create tables
                        const created = await RollTable.createDocuments(tablesToImport, {keepId: false});
                        postConsoleAndNotification(MODULE.NAME, `Imported ${created.length} table(s) successfully.`, "", false, true);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, "Failed to import tables", e, false, true);
                        ui.notifications.error("Failed to import tables: " + e.message);
                    }
                }
            }
        },
        default: "ok",
        render: (htmlDialog) => {
          // Attach event listeners for template copy
          htmlDialog.find("#copy-table-template-btn").click(async () => {
            const type = htmlDialog.find("#table-template-type").val();
            let promptWithDefaults = '';
            
            if (type === "text") {
              promptWithDefaults = await getTablePromptWithDefaults(tablePrompt);
            } else if (type === "document-custom") {
              promptWithDefaults = await getTablePromptWithDefaults(tableDocumentCustomPrompt);
            } else if (type === "document-actor") {
              promptWithDefaults = await getTablePromptWithDefaults(tableDocumentActorPrompt);
              // Replace [ADD-ACTORS-HERE] with actual actor list
              const actorsList = getWorldActorsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-ACTORS-HERE]').join(actorsList);
            } else if (type === "document-item") {
              promptWithDefaults = await getTablePromptWithDefaults(tableDocumentItemPrompt);
              // Replace [ADD-ITEMS-HERE] with actual item list
              const itemsList = getWorldItemsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-ITEMS-HERE]').join(itemsList);
            }
            
            copyToClipboard(promptWithDefaults);
          });
        }
      }).render(true);
    });
        $(html).find(".header-actions.action-buttons").prepend(button);
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderRollTableDirectory", "blacksmith-rolltable-directory", true, false);

// Register renderActorDirectory hook for actor import functionality
const renderActorDirectoryHookId = HookManager.registerHook({
    name: 'renderActorDirectory',
    description: 'Blacksmith: Add JSON import functionality to actor directory',
    context: 'blacksmith-actor-directory',
    priority: 3, // Normal priority - UI enhancement
    callback: async (app, html, data) => {
        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
    // Only GMs can import actors
    if (!game.user.isGM) {
        return;
    }
    
    // Fetch the character prompt template at runtime
    const characterPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-characters.txt')).text();

    // Build dialog content with dropdown and button
    const dialogContent = `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <select id="actor-template-type" style="flex: 0 0 auto;">
          <option value="npc">NPC/Monster</option>
        </select>
        <button id="copy-actor-template-btn" type="button">Copy Template to Clipboard</button>
      </div>
      <textarea id="actor-json-input" style="width:100%;height:400px;"></textarea>
    `;

    const button = $(`<button><i class="fa-solid fa-user-plus"></i> Import JSON to Actors</button>`);
    button.click(() => {
      new Dialog({
        title: "Paste JSON for Actors/NPCs",
        content: dialogContent,
        width: 800,
        height: 800,
        buttons: {
            cancel: {
                icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                label: "Cancel",
            },
            ok: {
                icon: "<i class='fa-solid fa-user-plus'></i>",
                label: "Import JSON",
                callback: async (html) => {
                    const jsonData = html.find("#actor-json-input").val();
                    let actorsToImport = [];
                    try {
                        let parsed = JSON.parse(jsonData);
                        if (Array.isArray(parsed)) {
                            actorsToImport = await Promise.all(parsed.map(parseActorJSONToFoundry));
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            actorsToImport = [await parseActorJSONToFoundry(parsed)];
                        } else {
                            throw new Error("JSON must be an array or object");
                        }
                        
                        // Create actors first (without items)
                        const created = await Actor.createDocuments(actorsToImport, {keepId: false});
                        
                        // Add items to each created actor
                        for (let i = 0; i < created.length; i++) {
                            const actor = created[i];
                            const originalData = actorsToImport[i];
                            await compendiumManager.addItemsToActor(actor, originalData);
                        }
                        
                        postConsoleAndNotification(MODULE.NAME, `Imported ${created.length} actor(s) successfully.`, "", false, true);
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, "Failed to import actors", e, false, true);
                        ui.notifications.error("Failed to import actors: " + e.message);
                    }
                }
            }
        },
        default: "ok",
        render: (htmlDialog) => {
          // Attach event listeners for template copy
          htmlDialog.find("#copy-actor-template-btn").click(async () => {
            const type = htmlDialog.find("#actor-template-type").val();
            if (type === "npc") {
              const promptWithDefaults = await getActorPromptWithDefaults(characterPrompt);
              copyToClipboard(promptWithDefaults);
            }
          });
        }
      }).render(true);
    });
        $(html).find(".header-actions.action-buttons").prepend(button);
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderActorDirectory", "blacksmith-actor-directory", true, false);

// Removed obsolete handleCacheManagementSettings function - cache management is now handled by the simplified system

// ================================================================== 
// ===== WINDOW-QUERY PARTIAL REGISTRATION ==========================


