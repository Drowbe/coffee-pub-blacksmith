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
import { registerSettings, buildSelectedCompendiumArrays, getTokenImageReplacementCacheStats, reorderCompendiumsForType, extractTypeFromCompendiumSetting } from './settings.js';
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
import { BroadcastManager } from './manager-broadcast.js';
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
import { JournalPagePins } from './journal-page-pins.js';
import { CSSEditor } from './window-gmtools.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { XpManager } from './xp-manager.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';
import { ConstantsGenerator } from './constants-generator.js';
import { assetLookup } from './asset-lookup.js';
import { UIContextMenu } from './ui-context-menu.js';
import { registerWindowQueryPartials } from './window-query-registration.js';
import { SidebarPin } from './sidebar-pin.js';
import { SidebarStyle } from './sidebar-style.js';
import { LoadingProgressManager } from './manager-loading-progress.js';
import { PinManager } from './manager-pins.js';
import { PinsAPI } from './api-pins.js';
import { ChatCardsAPI } from './api-chat-cards.js';
import { ImageCacheManager } from './manager-image-cache.js';
import './sidebar-combat.js';
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
/**
 * Convert renderChatMessage html parameter to native DOM element
 * Handles jQuery objects, DocumentFragments, and HTMLElements
 * @param {*} html - The html parameter from renderChatMessage hook
 * @returns {HTMLElement|null} Native DOM element or null
 */
function getChatMessageElement(html) {
    if (!html) return null;
    
    // If it's already a native DOM element with querySelectorAll, use it
    if (typeof html.querySelectorAll === 'function') {
        return html;
    }
    
    // If it's a jQuery object, extract the first element
    if (html.jquery || typeof html.find === 'function') {
        const element = html[0] || html.get?.(0);
        if (element && typeof element.querySelectorAll === 'function') {
            return element;
        }
    }
    
    // If it's a DocumentFragment, return it (has querySelectorAll)
    if (html instanceof DocumentFragment) {
        return html;
    }
    
    // If it's an array-like object, try first element
    if (html.length && html[0]) {
        const element = html[0];
        if (element && typeof element.querySelectorAll === 'function') {
            return element;
        }
    }
    
    // Last resort: try to use it directly if it has nodeType
    if (html.nodeType === Node.ELEMENT_NODE || html.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return html;
    }
    
    return null;
}

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
        // v13: FilePicker is now namespaced
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
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
// Track setup phase
Hooks.once('setup', () => {
    LoadingProgressManager.setPhase(3, "Setting up game data...");
});

// Track canvas ready phase
Hooks.once('canvasReady', () => {
    LoadingProgressManager.setPhase(4, "Preparing canvas...");
});

Hooks.once('ready', async () => {
    postConsoleAndNotification(MODULE.NAME, "BLACKSMITH: Ready hook started", "", false, false);
    
    // Update progress to final phase
    LoadingProgressManager.setPhase(5, "Finalizing...");
    LoadingProgressManager.logActivity("Initializing modules...");
    
    try {
        // Register settings FIRST during the ready phase
        LoadingProgressManager.logActivity("Registering settings...");
        registerSettings();
        
        // Initialize HookManager (infrastructure layer)
        LoadingProgressManager.logActivity("Initializing hook system...");
        HookManager.initialize();
        
        // Initialize OpenAI Memory System
        LoadingProgressManager.logActivity("Initializing AI memory...");
        OpenAIAPI.initializeMemory();
        
        // Register the Blacksmith hook (after HookManager is initialized)
        LoadingProgressManager.logActivity("Registering hooks...");
        registerBlacksmithUpdatedHook();
        
        // Register window-query partials early to prevent template errors
        LoadingProgressManager.logActivity("Loading templates...");
        await registerWindowQueryPartials();
        
        // Wait a bit to ensure settings are fully processed
        LoadingProgressManager.logActivity("Verifying settings...");
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
            LoadingProgressManager.forceHide();
            return;
        }

        // Initialize combat stats tracking
        LoadingProgressManager.logActivity("Initializing combat stats...");
        CombatStats.initialize();

        // Initialize player stats tracking
        LoadingProgressManager.logActivity("Initializing player stats...");
        CPBPlayerStats.initialize();

        // Initialize XP manager
        LoadingProgressManager.logActivity("Initializing XP system...");
        XpManager.initialize();

        // Apply any existing custom CSS
        LoadingProgressManager.logActivity("Applying custom styles...");
        const editor = new CSSEditor();
        const css = getSettingSafely(MODULE.ID, 'customCSS', null);
        const transition = getSettingSafely(MODULE.ID, 'cssTransition', null);
        if (css) {
            editor.applyCSS(css, transition);
        }

        // Initialize other components that depend on settings
        LoadingProgressManager.logActivity("Initializing wrappers...");
        WrapperManager.initialize();
        
        // Initialize scene navigation
        LoadingProgressManager.logActivity("Setting up navigation...");
        console.log('BLACKSMITH: About to call NavigationManager.initialize()');
        NavigationManager.initialize();
        console.log('BLACKSMITH: NavigationManager.initialize() completed');
        
        // Initialize latency checker
        LoadingProgressManager.logActivity("Initializing latency monitor...");
        LatencyChecker.initialize();
        
        // Initialize CanvasTools
        LoadingProgressManager.logActivity("Initializing canvas tools...");
        CanvasTools.initialize();

        // Initialize PinManager (canvas pins API)
        PinManager.initialize();
        
        // No longer needed - cache management is now handled by the new simplified system

        // Initialize ImageCacheManager (GM only)
        if (game.user.isGM) {
            LoadingProgressManager.logActivity("Initializing image cache...");
            try {
                const { ImageCacheManager } = await import('./manager-image-cache.js');
                await ImageCacheManager.initialize();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Error importing ImageCacheManager", error, true, false);
            }
        }

        // Initialize Token Image Utilities (turn indicators, etc.)
        LoadingProgressManager.logActivity("Loading token utilities...");
        try {
            const { TokenImageUtilities } = await import('./token-image-utilities.js');
            TokenImageUtilities.initializeTurnIndicator();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error importing TokenImageUtilities", error, true, false);
        }

        // Update nameplates
        LoadingProgressManager.logActivity("Updating nameplates...");
        updateNameplates();

        // Initialize other settings-dependent features
        LoadingProgressManager.logActivity("Configuring features...");
        initializeSettingsDependentFeatures();

        // Initialize scene interactions
        LoadingProgressManager.logActivity("Setting up scene interactions...");
        initializeSceneInteractions();
        
        // Initialize the unified roll system API
        LoadingProgressManager.logActivity("Loading roll system...");
        const { executeRoll } = await import('./manager-rolls.js');
        BLACKSMITH.rolls.execute = executeRoll;

        // JOURNAL TOOLS
        LoadingProgressManager.logActivity("Initializing journal tools...");
        JournalTools.init();
        
        // JOURNAL PAGE PINS
        LoadingProgressManager.logActivity("Enabling journal page pins...");
        JournalPagePins.init();
        
        // ENCOUNTER TOOLBAR
        LoadingProgressManager.logActivity("Setting up encounter toolbar...");
        EncounterToolbar.init();

        // SIDEBAR PIN
        LoadingProgressManager.logActivity("Configuring sidebar...");
        SidebarPin.initialize();

        // SIDEBAR STYLE
        SidebarStyle.initialize();

        // SIDEBAR STYLE (duplicate call - keeping for compatibility)
        SidebarStyle.initialize();
        
        LoadingProgressManager.logActivity("Almost ready...");

        // Hide progress indicator when complete
        LoadingProgressManager.hide();

    } catch (error) {
        console.error('Error during Blacksmith initialization:', error);
        LoadingProgressManager.forceHide();
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

                // Register canvasReady hook for layer checking and API exposure
                const canvasReadyLayerHookId = HookManager.registerHook({
                    name: 'canvasReady',
                    description: 'Blacksmith: Check for blacksmith utilities layer availability and expose to API',
                    context: 'blacksmith-canvas-layer-check',
                    priority: 3, // Normal priority - layer verification
                    callback: async (canvas) => {
                        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                        
                        const blacksmithLayer = canvas['blacksmith-utilities-layer'];
                        if (blacksmithLayer) {
                            // Expose BlacksmithLayer to API
                            const module = game.modules.get(MODULE.ID);
                            if (module?.api) {
                                module.api.CanvasLayer = blacksmithLayer;
                                module.api.getCanvasLayer = () => {
                                    return canvas['blacksmith-utilities-layer'] || null;
                                };
                                postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer exposed to API", "", true, false);
                            }
                            
                            // Load pins for current scene (renderer should be initialized by now via _draw)
                            if (canvas.scene) {
                                const { PinRenderer } = await import('./pins-renderer.js');
                                const { PinManager } = await import('./manager-pins.js');
                                const pins = PinManager.list({ sceneId: canvas.scene.id });
                                if (pins.length > 0) {
                                    // Ensure layer is active to show pins
                                    if (!blacksmithLayer.active) {
                                        blacksmithLayer.activate();
                                    }
                                    // Load pins - container should be ready after _draw
                                    await PinRenderer.loadScenePins(canvas.scene.id, pins);
                                }
                            }
                        }
                        
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

            // Register updateScene hook for pins reload when scene activates
            const updateScenePinsHookId = HookManager.registerHook({
                name: 'updateScene',
                description: 'Blacksmith: Reload pins when scene is activated',
                context: 'blacksmith-pins-scene-change',
                priority: 3, // Normal priority
                callback: async (scene, data) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    // If scene was activated, reload its pins
                    if (data.active === true && scene.id === canvas?.scene?.id) {
                        const layer = canvas?.['blacksmith-utilities-layer'];
                        const { PinRenderer } = await import('./pins-renderer.js');
                        const { PinManager } = await import('./manager-pins.js');
                        const pins = PinManager.list({ sceneId: scene.id });
                        if (pins.length > 0 && layer && !layer.active) {
                            layer.activate();
                        }
                        await PinRenderer.loadScenePins(scene.id, pins);
                    }
                    
                    //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
                }
            });

            // Register dropCanvasData hook for pin creation via drag-and-drop
            const dropCanvasDataPinsHookId = HookManager.registerHook({
                name: 'dropCanvasData',
                description: 'Blacksmith: Create pins when data is dropped on canvas',
                context: 'blacksmith-pins-drop',
                priority: 3, // Normal priority
                callback: async (canvas, data) => {
                    //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                    
                    // Only handle 'blacksmith-pin' type drops
                    if (data.type !== 'blacksmith-pin') {
                        return;
                    }

                    // Check permissions
                    const { PinManager } = await import('./manager-pins.js');
                    if (!PinManager._canCreate()) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Permission denied: only GMs can create pins via drop', '', false, false);
                        return;
                    }

                    // Get drop position in scene coordinates (data.x and data.y are already scene coordinates)
                    const sceneX = data.x;
                    const sceneY = data.y;

                    // Extract pin data from drop data
                    const pinData = {
                        id: data.pinId || crypto.randomUUID(),
                        x: sceneX,
                        y: sceneY,
                        moduleId: data.moduleId || 'unknown',
                        text: data.text,
                        image: data.image || '<i class="fa-solid fa-star"></i>',
                        size: data.size,
                        style: data.style,
                        config: data.config || {},
                        ownership: data.ownership || { default: 0 }
                    };

                    // Create the pin
                    try {
                        await PinManager.create(pinData);
                        postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Pin created via drop: ${pinData.id}`, '', true, false);
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error creating pin via drop', err?.message || err, false, true);
                    }
                    
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
    // Show loading progress indicator as early as possible
    LoadingProgressManager.show();
    LoadingProgressManager.setPhase(1, "Loading modules...");

    // ===== INITIALIZE SYSTEMS =============================================

    // Initialize ModuleManager first
    ModuleManager.initialize();
    
    // Initialize UtilsManager
    UtilsManager.initialize();
    
    // Socket initialization moved to 'ready' hook for proper SocketLib integration
    
    // Register chat message click handler for skill rolls
    // v13: renderChatMessage is deprecated, use renderChatMessageHTML instead
    const skillCheckChatHookId = HookManager.registerHook({
        name: 'renderChatMessageHTML',
        description: 'Blacksmith: Handle skill check chat message clicks',
        context: 'blacksmith-skill-check',
        priority: 3, // Normal priority - UI interaction
        callback: (message, html) => {
            // v13: renderChatMessageHTML always passes HTMLElement (not jQuery)
            const htmlElement = getChatMessageElement(html);
            if (!htmlElement) {
                return;
            }
            
            if (message.flags?.['coffee-pub-blacksmith']?.type === 'skillCheck') {
                // Check ownership and disable buttons for non-owners
                const skillCheckActors = htmlElement.querySelectorAll('.cpb-skill-check-actor');
                
                skillCheckActors.forEach((actorDiv) => {
                    const actorId = actorDiv.getAttribute('data-actor-id');
                    const isGM = game.user.isGM;
                    
                    if (actorId) {
                        const actor = game.actors.get(actorId);
                        const isOwner = actor?.isOwner || false;
                        
                        // Disable if not owner and not GM
                        if (!isOwner && !isGM) {
                            actorDiv.classList.add('disabled');
                        }
                    }
                });
                
                SkillCheckDialog.handleChatMessageClick(message, htmlElement);
            }
        }
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessageHTML", "blacksmith-skill-check", true, false);
    
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
        callback: async (moduleId, settingKey, value) => {
            //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
            
            if (moduleId === MODULE.ID) {
                clearSettingsCache();
                
                // Update scene styles when scene-related settings change
                const sceneSettingPattern = /^(sceneTextAlign|sceneFontSize|sceneTitlePadding|scenePanelHeight)$/;
                if (sceneSettingPattern.test(settingKey)) {
                    updateSceneStyles();
                }
                
                // Rebuild selected compendium arrays if compendium settings changed
                // Match any numCompendiums* setting, any *Compendium{number} setting, or searchWorld*First/Last settings
                const compendiumSettingPattern = /^(numCompendiums|.+Compendium\d+|searchWorld.+First|searchWorld.+Last)$/;
                if (compendiumSettingPattern.test(settingKey)) {
                    // If this is a compendium priority setting (e.g., "actorCompendium1"), trigger reordering
                    const type = extractTypeFromCompendiumSetting(settingKey);
                    if (type) {
                        // Use setTimeout to avoid race conditions and ensure setting is saved
                        setTimeout(async () => {
                            await reorderCompendiumsForType(type);
                        }, 200);
                    }
                    buildSelectedCompendiumArrays();
                }
                
                // Update cache stats heading when display cache status changes
                if (settingKey === 'tokenImageReplacementDisplayCacheStatus') {
                    const statsSetting = game.settings.settings.get(`${MODULE.ID}.headingH4tokenImageReplacementCacheStats`);
                    if (statsSetting) {
                        statsSetting.hint = getTokenImageReplacementCacheStats() + ". (Updated on client load and cache operations)";
                    }
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
    // BROADCAST MANAGER
    BroadcastManager.initialize();
    // QUICK VIEW UTILITY
    import('./utility-quickview.js').then(({ QuickViewUtility }) => {
        QuickViewUtility.initialize();
    });

    // BLACKSMITH TOOLBAR MANAGER
    // Register toolbar button and expose API
    await addToolbarButton();
    
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
        module.api.registerSecondaryBarItem = MenuBar.registerSecondaryBarItem.bind(MenuBar);
        module.api.unregisterSecondaryBarItem = MenuBar.unregisterSecondaryBarItem.bind(MenuBar);
        module.api.updateSecondaryBarItemActive = MenuBar.updateSecondaryBarItemActive.bind(MenuBar);
        module.api.getSecondaryBarItems = MenuBar.getSecondaryBarItems.bind(MenuBar);
        module.api.openSecondaryBar = MenuBar.openSecondaryBar.bind(MenuBar);
        module.api.updateMenubarToolActive = MenuBar.updateMenubarToolActive.bind(MenuBar);
        module.api.closeSecondaryBar = MenuBar.closeSecondaryBar.bind(MenuBar);
        module.api.toggleSecondaryBar = MenuBar.toggleSecondaryBar.bind(MenuBar);
        module.api.updateSecondaryBar = MenuBar.updateSecondaryBar.bind(MenuBar);
        module.api.registerSecondaryBarTool = MenuBar.registerSecondaryBarTool.bind(MenuBar);
        
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
        uiContextMenu: UIContextMenu,  // ✅ NEW: Shared context menu with flyouts
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
        
        // ✅ NEW: Socket API for external modules (set after SocketManager initializes)
        sockets: null,
        toggleSecondaryBar: null,
        updateSecondaryBar: null,
        // ✅ NEW: Combat Bar API for external modules
        openCombatBar: null,
        closeCombatBar: null,
        updateCombatBar: null,
        testNotificationSystem: null,
        // ✅ NEW: Canvas Layer API for external modules
        CanvasLayer: null,  // BlacksmithLayer instance (available after canvasReady)
        getCanvasLayer: null,  // Helper function to get BlacksmithLayer

        // ✅ NEW: Canvas Pins API for external modules
        pins: PinsAPI,

        // ✅ NEW: Image Replacement context menu API for external modules
        imageReplacement: {
            registerContextMenuItem: ImageCacheManager.registerImageTileContextMenuItem.bind(ImageCacheManager),
            unregisterContextMenuItem: ImageCacheManager.unregisterImageTileContextMenuItem.bind(ImageCacheManager)
        },
        
        // ✅ NEW: Chat Cards API for external modules
        chatCards: ChatCardsAPI,

        // ✅ Combat assessment API (party CR, monster CR, encounter difficulty) from encounter toolbar
        getPartyCR: EncounterToolbar.getPartyCR.bind(EncounterToolbar),
        getMonsterCR: EncounterToolbar.getMonsterCR.bind(EncounterToolbar),
        calculateEncounterDifficulty: EncounterToolbar.calculateEncounterDifficulty.bind(EncounterToolbar),
        getCombatAssessment: EncounterToolbar.getCombatAssessment.bind(EncounterToolbar),
        parseCR: EncounterToolbar.parseCR.bind(EncounterToolbar),
        formatCR: EncounterToolbar.formatCR.bind(EncounterToolbar),

        // ✅ Monster deployment API (same as journal encounter toolbar)
        deployMonsters: EncounterToolbar.deployMonsters.bind(EncounterToolbar),

        // ✅ Request a Roll (Skill Check) dialog – open with optional parameters
        openRequestRollDialog: (options = {}) => {
            if (options.silent === true) {
                return SkillCheckDialog.createRequestRoll(options).catch((err) => {
                    if (err?.message?.includes('no actors found')) {
                        const dialog = new SkillCheckDialog({ ...options, _api: true });
                        dialog.render(true);
                        return { message: null, messageId: null, fallbackDialog: dialog };
                    }
                    throw err;
                });
            }
            const dialog = new SkillCheckDialog({ ...options, _api: true });
            dialog.render(true);
            return dialog;
        },

        // ✅ NEW: Socket API for external modules (set after SocketManager initializes)
        sockets: null
    };
    
    // Set up Socket API after module.api is defined
    // Use the same dynamic import that initializes SocketManager
    import('./manager-sockets.js').then(({ SocketManager }) => {
        // Expose SocketManager API methods for external modules
        module.api.sockets = {
            // Wait for socket to be ready
            waitForReady: SocketManager.waitForReady.bind(SocketManager),
            
            // Register a socket event handler
            register: (eventName, handler) => {
                return SocketManager.waitForReady().then(() => {
                    const socket = SocketManager.getSocket();
                    if (!socket) {
                        throw new Error('Socket not available');
                    }
                    
                    // For SocketLib, we store handlers in a map and route through the generic handler
                    // For native sockets, we use register directly
                    if (SocketManager.isUsingSocketLib && SocketManager.isUsingSocketLib()) {
                        // Store handler in the external handlers map
                        if (!SocketManager._externalEventHandlers) {
                            SocketManager._externalEventHandlers = new Map();
                        }
                        SocketManager._externalEventHandlers.set(eventName, handler);
                        // Removed verbose logging - only log on first registration per event
                        if (!SocketManager._registeredEvents) SocketManager._registeredEvents = new Set();
                        if (!SocketManager._registeredEvents.has(eventName)) {
                            SocketManager._registeredEvents.add(eventName);
                            postConsoleAndNotification(MODULE.NAME, `Socket API: Registered event '${eventName}' (SocketLib)`, "", true, false);
                        }
                    } else if (typeof socket.register === 'function') {
                        // Native socket fallback - register directly
                        socket.register(eventName, handler);
                        // Removed verbose logging - only log on first registration per event
                        if (!SocketManager._registeredEvents) SocketManager._registeredEvents = new Set();
                        if (!SocketManager._registeredEvents.has(eventName)) {
                            SocketManager._registeredEvents.add(eventName);
                            postConsoleAndNotification(MODULE.NAME, `Socket API: Registered event '${eventName}' (native)`, "", true, false);
                        }
                    } else {
                        throw new Error('Socket register method not found');
                    }
                    return true;
                });
            },
            
            // Emit a socket message
            emit: (eventName, data, options = {}) => {
                return SocketManager.waitForReady().then(() => {
                    const socket = SocketManager.getSocket();
                    if (!socket) {
                        postConsoleAndNotification(MODULE.NAME, "Socket API: getSocket() returned null", 
                            `isSocketReady: ${SocketManager.isSocketReady}, isInitialized: ${SocketManager.isInitialized}, usingSocketLib: ${SocketManager.isUsingSocketLib?.()}`, false, true);
                        throw new Error('Socket not available - getSocket() returned null');
                    }
                    if (typeof socket.emit !== 'function') {
                        // Try to get more info about the socket object
                        const socketInfo = {
                            type: typeof socket,
                            constructor: socket?.constructor?.name,
                            keys: Object.keys(socket || {}),
                            hasEmit: 'emit' in socket,
                            emitType: typeof socket.emit,
                            hasRegister: 'register' in socket,
                            registerType: typeof socket.register
                        };
                        postConsoleAndNotification(MODULE.NAME, "Socket API: socket object missing emit method", 
                            JSON.stringify(socketInfo, null, 2), false, true);
                        throw new Error(`Socket emit method not found. Socket info: ${JSON.stringify(socketInfo)}`);
                    }
                    // SocketLib emit signature: emit(eventName, data, options)
                    // Native fallback also uses emit(eventName, data, options)
                    try {
                        socket.emit(eventName, data, options);
                        return true;
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, "Socket API: Error calling socket.emit", 
                            `eventName: ${eventName}, error: ${error.message}`, false, true);
                        throw error;
                    }
                });
            },
            
            // Check if socket is ready
            isReady: () => {
                return SocketManager.isSocketReady || false;
            },
            
            // Check if using SocketLib (vs native fallback)
            isUsingSocketLib: SocketManager.isUsingSocketLib.bind(SocketManager),
            
            // Get the underlying socket instance (advanced use only)
            getSocket: () => {
                return SocketManager.getSocket();
            }
        };
        
        // Also expose on global Blacksmith object if it exists (for backward compatibility)
        if (typeof window !== 'undefined' && !window.Blacksmith) {
            window.Blacksmith = {};
        }
        if (typeof window !== 'undefined' && window.Blacksmith) {
            window.Blacksmith.socket = module.api.sockets;
        }
        
        postConsoleAndNotification(MODULE.NAME, "Socket API: Exposed for external modules", "", true, false);
    }).catch(error => {
        postConsoleAndNotification(MODULE.NAME, "Failed to expose Socket API", error, false, false);
    });
    
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
        const fontSizeInput = html.querySelector('input[name="fontSize"]');
        const iconSizeInput = html.querySelector('input[name="iconSize"]');
        if (fontSizeInput) fontSizeInput.value = intFontSize;
        if (iconSizeInput) iconSizeInput.value = intIconSize;

        // Use cached note config icons to avoid repeated file system operations
        try {
            const customIcons = await getNoteConfigIcons();
            
            if (customIcons.length > 0) {
                // Add custom icons to the start of the dropdown
                const entryIconField = html.querySelector('select[name="icon.selected"]');
                if (entryIconField) {
                    customIcons.reverse().forEach(icon => {
                        const option = new Option(icon.label, icon.value);
                        entryIconField.insertBefore(option, entryIconField.firstChild);
                    });

                    // Set the default icon
                    entryIconField.value = strIconUrl;
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

// Unified callback for journal double-click editing (used by both hooks)
function _onRenderJournalDoubleClick(app, html, data) {
    // BEGIN - HOOKMANAGER CALLBACK
        // Only log when called from hooks (not periodic checker) - hooks pass data object
        const isFromHook = data !== undefined && Object.keys(data || {}).length > 0;
        if (isFromHook) {
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Hook called", 
                `App: ${app?.constructor?.name || 'none'}`, true, false);
        }
        
        // Only GMs can enable journal double-click editing
        if (!game.user.isGM) return;
        
        let blnJournalDoubleClick = game.settings.get(MODULE.ID, 'enableJournalDoubleClick');
        
        // See if they want to enable double-click
        if (!blnJournalDoubleClick) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        const wasJQuery = html && (html.jquery || typeof html.find === 'function');
        if (wasJQuery) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // In v13 ApplicationV2, renderJournalPageSheet may pass just the page element (article)
        // We need to find the parent journal sheet element
        if (nativeHtml && (nativeHtml.tagName === 'ARTICLE' || nativeHtml.classList?.contains('journal-entry-page'))) {
            // Try to get the sheet element from the app
            if (app && app.element) {
                let appElement = app.element;
                if (appElement && (appElement.jquery || typeof appElement.find === 'function')) {
                    appElement = appElement[0] || appElement.get?.(0) || appElement;
                }
                if (appElement && (appElement.classList?.contains('journal-sheet') || appElement.classList?.contains('journal-entry'))) {
                    nativeHtml = appElement;
                } else {
                    // Try traversing up the DOM tree
                    let parent = nativeHtml.parentElement;
                    let depth = 0;
                    while (parent && !parent.classList?.contains('journal-sheet') && !parent.classList?.contains('journal-entry') && depth < 10) {
                        parent = parent.parentElement;
                        depth++;
                    }
                    if (parent) {
                        nativeHtml = parent;
                    }
                }
            }
        }
        
        if (!nativeHtml || typeof nativeHtml.addEventListener !== 'function') {
            console.error(`[${MODULE.NAME}] Journal Double-Click: Invalid HTML element`, nativeHtml?.constructor?.name);
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Invalid HTML element", 
                `Type: ${nativeHtml?.constructor?.name}`, false, true);
            return;
        }
        
        // Check if already in edit mode
        const isEditMode = nativeHtml.querySelector('.editor-container');
        
        // Find the content area - this is where users actually click to edit
        const contentArea = nativeHtml.querySelector('.journal-entry-content, .journal-entry-page-content, .editor-content, .prosemirror-editor, [contenteditable="true"]');
        const targetElement = contentArea || nativeHtml; // Use content area if found, otherwise use the whole sheet
        
        // If in edit mode, attach a handler specifically for image double-clicks
        // Prosemirror may not have built-in image double-click handling, so we'll add it
        if (isEditMode) {
            const editModeImageHandler = (event) => {
                // Check if double-clicking an image
                let clickedImage = null;
                
                if (event.target.tagName === 'IMG') {
                    clickedImage = event.target;
                } else {
                    clickedImage = event.target.closest('img');
                }
                
                // If still not found, try searching from the event point
                if (!clickedImage && event.clientX && event.clientY) {
                    const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
                    if (elementAtPoint?.tagName === 'IMG') {
                        clickedImage = elementAtPoint;
                    } else {
                        clickedImage = elementAtPoint?.closest('img');
                    }
                }
                
                if (!clickedImage) {
                    return; // Not an image, ignore
                }
                
                // The image is already selected (ProseMirror-selectednode class means prosemirror has it selected)
                // Simply click the image toolbar button to open the config dialog
                try {
                    // Find the image button in the editor toolbar
                    const imageButton = nativeHtml.querySelector('button[data-action="image"]');
                    if (imageButton) {
                        imageButton.click();
                        return;
                    }
                    
                    // Try searching more broadly for the button if not found
                    const toolbar = nativeHtml.querySelector('.editor-toolbar, .prosemirror-menubar, [class*="toolbar"]');
                    if (toolbar) {
                        const button = toolbar.querySelector('button[data-action="image"], button[data-tooltip*="Image"], button[data-tooltip*="image"]');
                        if (button) {
                            button.click();
                            return;
                        }
                    }
                } catch (e) {
                    console.error(`[${MODULE.NAME}] Journal Double-Click: Error clicking image button`, e);
                }
            };
            
            // Find the editor container where images actually are
            const editorContainer = nativeHtml.querySelector('.editor-container, .prosemirror-editor, [contenteditable="true"]');
            const attachTarget = editorContainer || targetElement;
            
            // Check if handler already attached
            if (attachTarget._journalEditModeImageHandler) {
                attachTarget.removeEventListener('dblclick', attachTarget._journalEditModeImageHandler, { capture: false });
            }
            
            // Attach handler to the editor container where images are
            attachTarget.addEventListener('dblclick', editModeImageHandler, { capture: false });
            attachTarget._journalEditModeImageHandler = editModeImageHandler;
            
            // Also attach to targetElement as fallback
            if (attachTarget !== targetElement && targetElement._journalEditModeImageHandler !== editModeImageHandler) {
                if (targetElement._journalEditModeImageHandler) {
                    targetElement.removeEventListener('dblclick', targetElement._journalEditModeImageHandler, { capture: false });
                }
                targetElement.addEventListener('dblclick', editModeImageHandler, { capture: false });
                targetElement._journalEditModeImageHandler = editModeImageHandler;
            }
            
            // Also attach to nativeHtml as fallback
            if (nativeHtml !== attachTarget && nativeHtml !== targetElement && nativeHtml._journalEditModeImageHandler !== editModeImageHandler) {
                if (nativeHtml._journalEditModeImageHandler) {
                    nativeHtml.removeEventListener('dblclick', nativeHtml._journalEditModeImageHandler, { capture: false });
                }
                nativeHtml.addEventListener('dblclick', editModeImageHandler, { capture: false });
                nativeHtml._journalEditModeImageHandler = editModeImageHandler;
            }
            
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit mode detected - image double-click handler attached", 
                `Editor container: ${attachTarget.tagName}.${attachTarget.className}, Target: ${targetElement.tagName}, Has handler: ${!!attachTarget._journalEditModeImageHandler}`, true, false);
            return;
        }
        
            // Enable the double-click
            const ENTITY_PERMISSIONS = { 
                "NONE": 0,
                "LIMITED": 1,
                "OBSERVER": 2,
                "OWNER": 3
            };
            const currentUser = game.user;
            
        // Get the journal document from app (handles both ApplicationV1 and ApplicationV2)
        let journalDocument = null;
        
        if (app && typeof app === 'object' && 'document' in app) {
            // app is an Application instance
                journalDocument = app.document || app.object;
        }
        
        // If no document from app, try to find it from the DOM element
        if (!journalDocument && nativeHtml) {
            // Try data attributes
            const journalId = nativeHtml.dataset?.documentId || 
                             nativeHtml.querySelector('[data-document-id]')?.dataset?.documentId ||
                             nativeHtml.closest('[data-document-id]')?.dataset?.documentId;
            
            if (journalId) {
                journalDocument = game.journal?.get(journalId);
            }
            
            // Try to find journal that has this element as its sheet element
            if (!journalDocument) {
                for (const journal of game.journal || []) {
                    if (journal.sheet?.element) {
                        const journalElement = journal.sheet.element?.jquery ? journal.sheet.element[0] : journal.sheet.element;
                        if (journalElement === nativeHtml || journalElement?.contains?.(nativeHtml)) {
                            journalDocument = journal;
                            break;
                        }
                    }
                }
            }
        }
        
        if (!journalDocument) {
            // Only log error if called from hook (not periodic checker)
            if (isFromHook) {
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: No journal document found", 
                    `App: ${app?.constructor?.name || 'none'}, Element: ${nativeHtml?.tagName}`, false, true);
            }
            return;
        }
        
        // Remove any existing handler to prevent accumulation
        if (targetElement._journalDoubleClickHandler) {
            targetElement.removeEventListener('dblclick', targetElement._journalDoubleClickHandler);
        }
        
        // Also remove from nativeHtml if it exists there
        if (nativeHtml._journalDoubleClickHandler && nativeHtml !== targetElement) {
            nativeHtml.removeEventListener('dblclick', nativeHtml._journalDoubleClickHandler);
        }
        
        // Create and store the handler
        targetElement._journalDoubleClickHandler = (event) => {
            // Check if we're in edit mode FIRST - if so, don't interfere at all
            const isEditMode = nativeHtml.querySelector('.editor-container');
            if (isEditMode) {
                // In edit mode - let prosemirror handle everything, don't interfere
                return; // Don't prevent default, don't stop propagation, just get out of the way
            }
            
            // Only log if double-click actually happens (user action) and we're not in edit mode
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Double-click detected", 
                `Target: ${event.target?.tagName}`, true, false);
            
            // Don't trigger on interactive elements (buttons, links, etc.)
            if (event.target.closest('button, a, input, select, textarea')) {
                return;
            }
            
            // Not in edit mode - activate editor
            event.preventDefault();
            event.stopPropagation();
            
            // Check edit permissions
            const hasEditPermission = journalDocument.testUserPermission(currentUser, ENTITY_PERMISSIONS.OWNER);
            if (!hasEditPermission) {
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: No edit permission", 
                    `Permission: ${journalDocument.testUserPermission(currentUser, ENTITY_PERMISSIONS.OWNER)}`, true, false);
                return;
            }
            
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit permission confirmed", "", true, false);
            
            // Method 1: Try using the app's built-in methods (v13 ApplicationV2 approach)
            if (app) {
              // Try activateEditor if it exists
              if (typeof app.activateEditor === 'function') {
                  postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Using app.activateEditor() method", "", true, false);
                  try {
                      app.activateEditor();
                      return;
                  } catch (error) {
                      console.error(`[${MODULE.NAME}] Journal Double-Click: Error calling app.activateEditor()`, error);
                  }
              }
              
              // Try accessing current page and activating editor
              if (app.currentPage && typeof app.currentPage.activateEditor === 'function') {
                  postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Using app.currentPage.activateEditor() method", "", true, false);
                  try {
                      app.currentPage.activateEditor();
                      return;
                  } catch (error) {
                      console.error(`[${MODULE.NAME}] Journal Double-Click: Error calling app.currentPage.activateEditor()`, error);
                  }
              }
              
              // Try document's sheet activateEditor
              if (journalDocument && journalDocument.sheet && typeof journalDocument.sheet.activateEditor === 'function') {
                  postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Using document.sheet.activateEditor() method", "", true, false);
                  try {
                      journalDocument.sheet.activateEditor();
                      return;
                  } catch (error) {
                      console.error(`[${MODULE.NAME}] Journal Double-Click: Error calling document.sheet.activateEditor()`, error);
                  }
              }
            }
            
            // Method 2: Try to find edit button using common selectors
            let editButton = null;
            let selectorUsed = '';
            
            const selectors = [
                '.edit-container button[data-action="editPage"]',
                '.edit-container .editor-edit',
                'button[data-action="editPage"]',
                '.editor-edit',
                '.edit-container button',
                'header button[data-action="editPage"]',
                '.window-header button[data-action="editPage"]',
                '.editor button[data-action="editPage"]'
            ];
            
            for (const selector of selectors) {
                editButton = nativeHtml.querySelector(selector);
                if (editButton) {
                    selectorUsed = selector;
                    break;
                }
            }
            
            if (editButton) {
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit button found", 
                    `Selector: ${selectorUsed}, Button: ${editButton.className}`, true, false);
                editButton.click();
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit button clicked", "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit button NOT found", 
                    `Tried selectors: ${selectors.join(', ')}`, false, true);
                
                // Debug: log what buttons exist in the journal sheet
                const allButtons = nativeHtml.querySelectorAll('button');
                postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Debug - all buttons", 
                    `Found ${allButtons.length} button(s)`, true, false);
                
                allButtons.forEach((btn, idx) => {
                    const action = btn.getAttribute('data-action');
                    const classes = btn.className;
                    postConsoleAndNotification(MODULE.NAME, `Journal Double-Click: Button ${idx}`, 
                        `data-action: ${action}, classes: ${classes}`, true, false);
                });
    }
        };
        
        // Attach the event listener to the target element (content area or sheet)
        // Use capture: false (bubble phase) so prosemirror's handlers can run first if needed
        targetElement.addEventListener('dblclick', targetElement._journalDoubleClickHandler, { capture: false });
        
        // Also attach to the sheet element if different, for fallback
        if (nativeHtml !== targetElement) {
            nativeHtml.addEventListener('dblclick', targetElement._journalDoubleClickHandler, { capture: false });
        }
        
        // Also mark the sheet element so we can detect it's been processed
        nativeHtml._journalDoubleClickHandler = targetElement._journalDoubleClickHandler; // Reference the same handler
        
        // Watch for when edit mode is activated - remove view mode handler and attach edit mode handler
        const editModeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || (mutation.type === 'attributes' && mutation.attributeName === 'class')) {
                    const hasEditor = nativeHtml.querySelector('.editor-container');
                    if (hasEditor) {
                        // Edit mode activated - remove view mode handler
                        if (targetElement._journalDoubleClickHandler) {
                            targetElement.removeEventListener('dblclick', targetElement._journalDoubleClickHandler, { capture: false });
                            delete targetElement._journalDoubleClickHandler;
                        }
                        if (nativeHtml !== targetElement && nativeHtml._journalDoubleClickHandler) {
                            nativeHtml.removeEventListener('dblclick', nativeHtml._journalDoubleClickHandler, { capture: false });
                            delete nativeHtml._journalDoubleClickHandler;
                        }
                        
                        editModeObserver.disconnect();
                        postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Edit mode activated - switching to image double-click handler", "", true, false);
                        
                        // Attach edit mode handler for image double-clicks
                        // Use setTimeout to ensure editor is fully initialized
                        setTimeout(() => {
                            _onRenderJournalDoubleClick(app, nativeHtml, data || {});
                        }, 100);
                    }
                }
            }
        });
        
        // Watch for editor-container being added
        editModeObserver.observe(nativeHtml, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        
        // Only log when called from hook (not periodic checker)
        if (isFromHook) {
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Event listener attached", 
                `Element: ${targetElement.tagName}`, true, false);
        }
    // END - HOOKMANAGER CALLBACK
    }

// Set up periodic checker and click listener for page navigation (since hooks don't fire reliably)
Hooks.once('ready', () => {
    // Register renderJournalSheet hook (fires on initial journal sheet render)
    // Use both HookManager and direct Hooks.on for maximum compatibility
    HookManager.registerHook({
        name: 'renderJournalSheet',
        description: 'Blacksmith: Enable journal double-click editing for GMs',
        context: 'blacksmith-journal-double-click',
        priority: 3,
        callback: _onRenderJournalDoubleClick
    });

    // Also register direct hook as fallback (in case HookManager doesn't fire)
    Hooks.on('renderJournalSheet', (app, html, data) => {
        _onRenderJournalDoubleClick(app, html, data);
    });

    // Register renderJournalPageSheet hook (fires when journal pages are switched in v13 ApplicationV2)
    HookManager.registerHook({
        name: 'renderJournalPageSheet',
        description: 'Blacksmith: Enable journal double-click editing for GMs (page-level)',
        context: 'blacksmith-journal-double-click-page',
        priority: 3,
        callback: _onRenderJournalDoubleClick
    });

    // Also register direct hook as fallback
    Hooks.on('renderJournalPageSheet', (app, html, data) => {
        _onRenderJournalDoubleClick(app, html, data);
    });
    
    // TEST: Add a simple test hook to see if ANY renderJournalSheet hook fires
    Hooks.on('renderJournalSheet', (app, html, data) => {
        console.log(`[${MODULE.NAME}] Journal: renderJournalSheet hook fired!`, app?.constructor?.name);
    });
    
    // Track processed journal sheets to avoid duplicate handlers
    const processedSheetElements = new WeakSet();
    
    // Function to process a single journal sheet element
    const processJournalSheet = (sheetElement) => {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'enableJournalDoubleClick')) return;
        if (!sheetElement || processedSheetElements.has(sheetElement)) return;
        
        // Note: We now process both edit mode and view mode sheets
        // Edit mode sheets get handlers for image double-clicks
        // View mode sheets get handlers to activate edit mode
        
        // Check if handler already attached (most reliable check)
        const contentArea = sheetElement.querySelector('.journal-entry-content, .journal-entry-page-content');
        const targetElement = contentArea || sheetElement;
        if (targetElement._journalDoubleClickHandler) {
            processedSheetElements.add(sheetElement);
            return;
        }
        
        // Try to find the actual Application instance for this element
        let actualApp = null;
        const allApps = Object.values(ui.applications || {});
        actualApp = allApps.find(app => {
            if (!app || !app.element) return false;
            const appElement = app.element?.jquery ? app.element[0] : app.element;
            return appElement === sheetElement || appElement?.contains?.(sheetElement);
        });
        
        // If still no app, try to find via journal.sheet.element
        if (!actualApp) {
            for (const journal of game.journal || []) {
                if (journal.sheet?.element) {
                    const journalElement = journal.sheet.element?.jquery ? journal.sheet.element[0] : journal.sheet.element;
                    if (journalElement === sheetElement || journalElement?.contains?.(sheetElement)) {
                        actualApp = journal.sheet;
                        break;
                    }
                }
            }
        }
        
        // Process the sheet
        _onRenderJournalDoubleClick(actualApp || null, sheetElement, {});
        processedSheetElements.add(sheetElement);
    };
    
    // Setup MutationObserver to watch for journal sheets (same approach as Encounter Toolbar)
    // This is the ACTUAL solution - hooks don't fire in v13 ApplicationV2, so we watch the DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Watch for added nodes (new journal sheets)
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if this is a journal sheet
                    let journalSheet = null;
                    
                    // Try direct class check
                    if (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry')) {
                        journalSheet = node;
                    }
                    // Try querySelector for nested sheets
                    if (!journalSheet) {
                        journalSheet = node.querySelector?.('.journal-sheet') || 
                                      node.querySelector?.('.journal-entry');
                    }
                    // Try checking if it's a form with journal classes
                    if (!journalSheet && node.tagName === 'FORM') {
                        if (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry')) {
                            journalSheet = node;
                        }
                    }
                    
                    if (journalSheet) {
                        // Small delay to ensure DOM is fully rendered
                        setTimeout(() => {
                            processJournalSheet(journalSheet);
                        }, 50);
                    }
                }
            }
            
            // Watch for attribute changes on journal page articles (page navigation)
            if (mutation.type === 'attributes' && mutation.target) {
                const target = mutation.target;
                
                // Check for journal page navigation
                if (target.tagName === 'ARTICLE' && target.classList?.contains('journal-entry-page')) {
                    const journalSheet = target.closest('.journal-sheet, .journal-entry');
                    if (journalSheet) {
                        // Debounce rapid page changes
                        if (journalSheet._pageChangeTimer) {
                            clearTimeout(journalSheet._pageChangeTimer);
                        }
                        journalSheet._pageChangeTimer = setTimeout(() => {
                            processJournalSheet(journalSheet);
                        }, 100);
                    }
                }
            }
        }
    });
    
    // Observe the document body for new journal sheets and page navigation
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-page-id'] // Watch for class changes (active page) and page ID changes
    });
    
    // Also check existing journal sheets on ready
    const checkExistingSheets = () => {
        const domJournalSheets = document.querySelectorAll('.journal-sheet, .journal-entry');
        for (const sheetElement of domJournalSheets) {
            processJournalSheet(sheetElement);
        }
    };
    
    if (game.ready) {
        checkExistingSheets();
    } else {
        Hooks.once('ready', checkExistingSheets);
    }
    
    // Listen for clicks on journal page navigation
    document.addEventListener('click', (event) => {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'enableJournalDoubleClick')) return;
        
        // Check if click is on a journal page navigation button/tab
        const target = event.target.closest('a[data-page-id], .journal-page-nav a, .journal-entry-page-header a');
        if (target && target.getAttribute('data-page-id')) {
            postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Page navigation clicked", 
                `Page ID: ${target.getAttribute('data-page-id')}`, true, false);
            
            // Find the journal sheet containing this navigation
            const journalSheet = target.closest('.journal-sheet, .journal-entry');
            if (journalSheet) {
                // Find the corresponding app
                const sheet = Object.values(ui.windows).find(w => {
                    if (!w || !w.element) return false;
                    const wElement = w.element.jquery ? w.element[0] : w.element;
                    return wElement === journalSheet || wElement?.contains?.(journalSheet);
                });
                
                if (sheet) {
                    // Small delay to let the page render
                    setTimeout(() => {
                        postConsoleAndNotification(MODULE.NAME, "Journal Double-Click: Processing after page navigation", 
                            `Page ID: ${target.getAttribute('data-page-id')}`, true, false);
                        _onRenderJournalDoubleClick(sheet, journalSheet, {});
                    }, 200);
                }
            }
        }
    }, true); // Use capture phase to catch early
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
              postConsoleAndNotification(MODULE.NAME, "Error when executing macro " + macroName, error, false, false);
      throw error;
    }
}

// ***************************************************
// ** RENDER CHAT MESSAGE
// ***************************************************
// Looks for a specific span code and hides the header of that card
// <span style="visibility: visible">coffeepub-hide-header</span>

// v13: renderChatMessage is deprecated, use renderChatMessageHTML instead
const hideHeaderChatHookId = HookManager.registerHook({
    name: 'renderChatMessageHTML',
    description: 'Blacksmith: Hide chat message headers based on coffeepub-hide-header flag',
    context: 'blacksmith-hide-header',
    priority: 3, // Normal priority - UI enhancement
    callback: (message, html, data) => {
        // v13: renderChatMessageHTML always passes HTMLElement (not jQuery)
        const htmlElement = getChatMessageElement(html);
        if (!htmlElement) {
            return;
        }

        // Find span containing "coffeepub-hide-header" text
        const spans = htmlElement.querySelectorAll('span');
        let hideHeaderFlag = null;
        for (const span of spans) {
            if (span.textContent.includes('coffeepub-hide-header')) {
                hideHeaderFlag = span;
                break;
            }
        }
        if (hideHeaderFlag) { 
          // Found the "coffeepub-hide-header" flag within the message
          const message = hideHeaderFlag.closest('.message');
          if (message) {
              const messageHeader = message.querySelector('.message-header');
              if (messageHeader) messageHeader.style.display = 'none';
          }
      
          // Now remove or hide the "coffeepub-hide-header" flag itself
          hideHeaderFlag.style.display = "none";
        }
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessageHTML", "blacksmith-hide-header", true, false);

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
    { placeholder: '[ADD-SCENE-AREA-HERE]', key: 'defaultCampaignArea' },
    { placeholder: '[ADD-SCENE-ENVIRONMENT-HERE]', key: 'defaultCampaignSite' },
    { placeholder: '[ADD-SCENE-LOCATION-HERE]', key: 'defaultCampaignRealm' },
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
    { placeholder: '[ADD-FOLDER-NAME-HERE]', key: 'encounterFolder' },
    { placeholder: '[ADD-SCENE-AREA-HERE]', key: 'defaultCampaignArea' },
    { placeholder: '[ADD-SCENE-ENVIRONMENT-HERE]', key: 'defaultCampaignSite' },
    { placeholder: '[ADD-SCENE-LOCATION-HERE]', key: 'defaultCampaignRealm' },
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

        // Build dialog content with template, file select, and paste textbox
        const dialogContent = `
        <div class="form-group">
            <label><strong>Base Prompt Template</strong></label>
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <select id="template-type" style="flex: 0 0 auto;">
                    <option value="narrative">Narrative</option>
                    <option value="encounter">Encounter</option>
                    <option value="injury">Injury</option>
                </select>
                <button id="copy-template-btn" type="button" class="file-picker-button"><i class="fa-solid fa-clipboard"></i> Copy to Clipboard</button>
            </div>
        </div>
        <div class="form-group">
            <label><strong>Select or Paste JSON</strong></label>
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <input type="file" id="journal-json-file-input" accept=".json,application/json" style="display:none">
                <button id="select-journal-json-btn" type="button" class="file-picker-button" style="background: #2d5c27; color: white;"><i class="fa-solid fa-folder-open"></i> Select JSON File</button>
            </div>
            <textarea id="json-input" style="width:100%;height:400px;" placeholder="Paste JSON here or select a file above..."></textarea>
        </div>
        `;

        const button = document.createElement('button');
        button.innerHTML = '<i class="fa-solid fa-masks-theater"></i> Import';
        button.addEventListener('click', () => {
        new Dialog({
            title: "Import Journal Entries from JSON",
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
                    // v13: html may be a jQuery object, convert to native DOM
                    let nativeHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeHtml = html[0] || html.get?.(0) || html;
                    }
                    const jsonInput = nativeHtml.querySelector("#json-input");
                    const jsonData = jsonInput ? jsonInput.value : '';
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
            // v13: htmlDialog may be a jQuery object, convert to native DOM
            let nativeHtmlDialog = htmlDialog;
            if (htmlDialog && (htmlDialog.jquery || typeof htmlDialog.find === 'function')) {
                nativeHtmlDialog = htmlDialog[0] || htmlDialog.get?.(0) || htmlDialog;
            }
            // Select JSON File button - trigger file input and load into textarea
            const selectJsonBtn = nativeHtmlDialog.querySelector("#select-journal-json-btn");
            const fileInput = nativeHtmlDialog.querySelector("#journal-json-file-input");
            const jsonInput = nativeHtmlDialog.querySelector("#json-input");
            if (selectJsonBtn && fileInput && jsonInput) {
                selectJsonBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        jsonInput.value = ev.target?.result || '';
                        fileInput.value = '';
                    };
                    reader.readAsText(file);
                });
            }
            // Attach event listeners for template copy
            const copyTemplateBtn = nativeHtmlDialog.querySelector("#copy-template-btn");
            if (copyTemplateBtn) {
                copyTemplateBtn.addEventListener('click', async () => {
                    const templateTypeSelect = nativeHtmlDialog.querySelector("#template-type");
                    const type = templateTypeSelect ? templateTypeSelect.value : '';
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
            }
        }).render(true);
        });
        const headerActions = html.querySelector(".header-actions.action-buttons");
        if (headerActions) {
            headerActions.insertBefore(button, headerActions.firstChild);
        }
        
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
    if (flags?.type !== 'skillCheck') return;

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

    const content = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/card-skill-check.hbs', updatedMessageData);
    await message.update({
        content,
        flags: {
            'coffee-pub-blacksmith': updatedMessageData
        }
    });

    // Notify API callers that opened the dialog with onRollComplete
    const allComplete = (updatedMessageData.actors || []).length > 0 &&
        (updatedMessageData.actors || []).every(a => a.result);
    SkillCheckDialog._invokeRollCompleteCallback(messageId, {
        message,
        messageData: updatedMessageData,
        tokenId,
        result,
        allComplete
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
    { placeholder: '[ADD-ITEM-SOURCE-HERE]', key: 'defaultCampaignName' },
    { placeholder: '[ADD-ACTORS-SOURCE-HERE]', key: 'defaultCampaignName' }
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

// Helper to get comma-delimited list of selected item compendium IDs
function getItemCompendiumsList() {
  try {
    const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsItem') ?? 1;
    const compendiums = [];
    
    for (let i = 1; i <= numCompendiums; i++) {
      const compendiumSetting = game.settings.get(MODULE.ID, `itemCompendium${i}`);
      if (compendiumSetting && compendiumSetting !== 'none') {
        compendiums.push(compendiumSetting);
      }
    }
    
    return compendiums.join(', ');
  } catch (e) {
    postConsoleAndNotification(MODULE.NAME, "Error getting item compendiums list", e, false, false);
    return 'No compendiums configured';
  }
}

// Helper to get comma-delimited list of selected actor compendium IDs
function getActorCompendiumsList() {
  try {
    const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsActor') ?? 1;
    const compendiums = [];
    
    for (let i = 1; i <= numCompendiums; i++) {
      const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
      if (compendiumSetting && compendiumSetting !== 'none') {
        compendiums.push(compendiumSetting);
      }
    }
    
    return compendiums.join(', ');
  } catch (e) {
    postConsoleAndNotification(MODULE.NAME, "Error getting actor compendiums list", e, false, false);
    return 'No compendiums configured';
  }
}

// D&D 5e item rarity display order (missing/other last)
const ITEM_RARITY_ORDER = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];

function getItemRarityKey(item) {
  const r = item?.system?.rarity;
  if (!r || typeof r !== 'string') return 'other';
  return r.trim().toLowerCase();
}

function formatRarityLabel(rarityKey) {
  if (rarityKey === 'other') return 'Other';
  return rarityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Helper to get formatted list of items from all selected item compendiums, grouped by rarity
async function getCompendiumItemsList() {
  try {
    const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsItem') ?? 1;
    const compendiumBlocks = [];

    for (let i = 1; i <= numCompendiums; i++) {
      const compendiumId = game.settings.get(MODULE.ID, `itemCompendium${i}`);
      if (!compendiumId || compendiumId === 'none') {
        continue;
      }

      try {
        const compendium = game.packs.get(compendiumId);
        if (!compendium) {
          postConsoleAndNotification(MODULE.NAME, "Configured compendium not found", compendiumId, false, false);
          continue;
        }

        const documents = await compendium.getDocuments();
        if (!documents?.length) {
          continue;
        }

        // Group by rarity (D&D 5e: item.system.rarity)
        const byRarity = new Map();
        for (const doc of documents) {
          const key = getItemRarityKey(doc);
          if (!byRarity.has(key)) byRarity.set(key, []);
          byRarity.get(key).push(doc.name);
        }

        // Sort rarities: standard order then "other"
        const sortedRarityKeys = [...byRarity.keys()].sort((a, b) => {
          const ia = ITEM_RARITY_ORDER.indexOf(a);
          const ib = ITEM_RARITY_ORDER.indexOf(b);
          if (ia === -1 && ib === -1) return a.localeCompare(b);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });

        const rarityLines = sortedRarityKeys.map(rarityKey => {
          const names = byRarity.get(rarityKey).join(', ');
          return `RARITY: ${formatRarityLabel(rarityKey)}\n${names}`;
        });

        compendiumBlocks.push(`${compendiumId}\n\n${rarityLines.join('\n\n')}`);
      } catch (e) {
        postConsoleAndNotification(MODULE.NAME, `Error getting items from compendium ${compendiumId}`, e, false, false);
        continue;
      }
    }

    return compendiumBlocks.join('\n\n');
  } catch (e) {
    postConsoleAndNotification(MODULE.NAME, "Error getting compendium items list", e, false, false);
    return 'Error retrieving compendium items';
  }
}

// D&D 5e CR numeric values for sorting (fractional CRs)
const CR_SORT_OTHER = -1;

function getActorCr(actor) {
  let cr = null;
  if (actor?.system?.details?.cr?.value !== undefined) {
    cr = actor.system.details.cr.value;
  } else if (actor?.system?.details?.cr !== undefined) {
    cr = actor.system.details.cr;
  } else if (actor?.system?.cr !== undefined) {
    cr = actor.system.cr;
  }
  const num = parseCrToNumber(cr);
  const sortKey = num !== null ? num : CR_SORT_OTHER;
  const label = num !== null ? formatCrLabel(num) : 'Other';
  return { sortKey, label };
}

function parseCrToNumber(cr) {
  if (typeof cr === 'number' && !Number.isNaN(cr)) return cr;
  if (typeof cr === 'string' && cr.trim() !== '') {
    const lower = cr.trim().toLowerCase();
    if (lower === '1/8') return 0.125;
    if (lower === '1/4') return 0.25;
    if (lower === '1/2') return 0.5;
    const n = Number(cr);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function formatCrLabel(num) {
  if (num === 0) return '0';
  if (num === 0.125) return '1/8';
  if (num === 0.25) return '1/4';
  if (num === 0.5) return '1/2';
  return String(num);
}

// Helper to get formatted list of actors from all selected actor compendiums, grouped by CR
async function getCompendiumActorsList() {
  try {
    const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsActor') ?? 1;
    const compendiumBlocks = [];

    for (let i = 1; i <= numCompendiums; i++) {
      const compendiumId = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
      if (!compendiumId || compendiumId === 'none') {
        continue;
      }

      try {
        const compendium = game.packs.get(compendiumId);
        if (!compendium) {
          postConsoleAndNotification(MODULE.NAME, "Configured compendium not found", compendiumId, false, false);
          continue;
        }

        const documents = await compendium.getDocuments();
        if (!documents?.length) {
          continue;
        }

        // Group by CR (D&D 5e: actor.system.details.cr or .value)
        const byCr = new Map();
        for (const doc of documents) {
          const { label } = getActorCr(doc);
          if (!byCr.has(label)) byCr.set(label, []);
          byCr.get(label).push(doc.name);
        }

        // Sort CR groups: numeric CRs ascending, then "Other"
        const crSortKeys = new Map();
        for (const doc of documents) {
          const { sortKey, label } = getActorCr(doc);
          if (!crSortKeys.has(label)) crSortKeys.set(label, sortKey);
        }
        const sortedCrLabels = [...byCr.keys()].sort((a, b) => {
          const sa = crSortKeys.get(a) ?? CR_SORT_OTHER;
          const sb = crSortKeys.get(b) ?? CR_SORT_OTHER;
          if (sa === CR_SORT_OTHER && sb === CR_SORT_OTHER) return a.localeCompare(b);
          if (sa === CR_SORT_OTHER) return 1;
          if (sb === CR_SORT_OTHER) return -1;
          return sa - sb;
        });

        const crLines = sortedCrLabels.map(crLabel => {
          const names = byCr.get(crLabel).join(', ');
          return `CR: ${crLabel}\n${names}`;
        });

        compendiumBlocks.push(`${compendiumId}\n\n${crLines.join('\n\n')}`);
      } catch (e) {
        postConsoleAndNotification(MODULE.NAME, `Error getting actors from compendium ${compendiumId}`, e, false, false);
        continue;
      }
    }

    return compendiumBlocks.join('\n\n');
  } catch (e) {
    postConsoleAndNotification(MODULE.NAME, "Error getting compendium actors list", e, false, false);
    return 'Error retrieving compendium actors';
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
    // v13: FilePicker is now namespaced
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
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
  const lootType = (item.itemSubType || '').toLowerCase();

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
    itemSubType: 'treasure'
  };
  const result = await guessIconPath(testItem);
  return result;
}

/**
 * Parse itemPrice string (e.g. "50 GP", "0 GP", "10 SP") into a normalized price string for D&D 5e system.
 * @param {string} itemPrice - Raw price from prompt (e.g. "50 GP", "0 GP").
 * @returns {string} Normalized price (e.g. "50 gp", "0 gp", "10 sp").
 */
function parseItemPrice(itemPrice) {
  if (itemPrice == null || String(itemPrice).trim() === '') return '0 gp';
  const s = String(itemPrice).trim();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|ep|pp)?$/i);
  if (match) {
    const num = match[1];
    const denom = (match[2] || 'gp').toLowerCase();
    return `${num} ${denom}`;
  }
  return s;
}

/**
 * Build shared system fields for item import (description, rarity, weight, price, source).
 * @param {object} flat - Flat item from prompt.
 * @returns {object} system fragment.
 */
function _sharedItemSystem(flat) {
  return {
    description: {
      value: flat.itemDescription || "",
      unidentified: flat.itemDescriptionUnidentified || "",
      chat: flat.itemDescriptionChat || ""
    },
    rarity: flat.itemRarity || "common",
    weight: flat.itemWeight,
    price: parseItemPrice(flat.itemPrice),
    source: { custom: flat.itemSource || "Artificer", license: flat.itemLicense || "" },
    quantity: flat.itemQuantity ?? 1,
    identified: flat.itemIdentified !== false
  };
}

/**
 * Parse a flat item JSON (Artificer prompt template) into FoundryVTT D&D 5e item data.
 * Uses only canonical keys: itemType, itemSubType, itemSubTypeNuance, itemName, itemPrice, itemIsMagical, destroyOnEmpty, etc.
 * @param {object} flat - The flat item JSON from the prompt.
 * @returns {object} The FoundryVTT item data object.
 */
async function parseFlatItemToFoundry(flat) {
  const type = (flat.itemType || "loot").toLowerCase();
  let img = flat.itemImagePath;
  if (!img) {
    img = await guessIconPath(flat);
  }
  const shared = _sharedItemSystem(flat);
  let data = {};

  if (type === "loot") {
    data = {
      type: "loot",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        type: { value: flat.itemSubType || "trinket" },
        properties: { magical: !!flat.itemIsMagical }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "" } }
    };
  } else if (type === "consumable") {
    const consumableValue = (flat.itemSubType || "potion").toLowerCase().replace(/\s+/g, "-");
    const consumableSubtype = (flat.itemSubTypeNuance || "").trim();
    data = {
      type: "consumable",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        consumableType: { value: consumableValue, subtype: consumableSubtype },
        type: { value: consumableValue, subtype: consumableSubtype },
        properties: { mgc: !!flat.itemIsMagical },
        uses: {
          spent: flat.limitedUsesSpent ?? 0,
          max: flat.limitedUsesMax ?? flat.itemLimitedUses ?? 1,
          recovery: flat.recoveryPeriod && String(flat.recoveryPeriod).toLowerCase() !== "none"
            ? [{ period: String(flat.recoveryPeriod).toLowerCase().replace(/\s+/g, '').replace('rest', ''), formula: String(flat.limitedUsesMax ?? flat.itemLimitedUses ?? 1) }]
            : [],
          autoDestroy: !!flat.destroyOnEmpty
        },
        consume: { type: flat.destroyOnEmpty ? "destroy" : "none", target: null, amount: null },
        recharge: { value: flat.recoveryPeriod || "none", formula: flat.recoveryAmount || "recover all uses" }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "", consumableSubtype: consumableSubtype } }
    };
    if (flat.itemIsMagical && flat.magicalAttunementRequired) {
      data.system.attunement = flat.magicalAttunementRequired;
    }
    if (flat.activities && Array.isArray(flat.activities)) {
      data.system.activities = {};
      flat.activities.forEach((activity, index) => {
        const activityId = `activity${index}`;
        data.system.activities[activityId] = {
          type: (activity.activityType || "util").toLowerCase(),
          name: activity.activityName || activity.activityType || "Use",
          img: activity.activityIcon || "",
          activation: { type: "action", value: 1, condition: "" },
          consumption: { targets: [], scaling: { allowed: false, max: "" } },
          description: { chatFlavor: activity.activityFlavorText || "" },
          duration: { value: "", units: "" },
          range: {},
          target: {},
          uses: { spent: 0, max: "", recovery: [] },
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
  } else if (type === "container") {
    data = {
      type: "container",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        type: { value: flat.itemSubType || "other" },
        properties: { magical: !!flat.itemIsMagical }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "" } }
    };
  } else if (type === "equipment") {
    data = {
      type: "equipment",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        type: { value: (flat.itemSubType || "trinket").toLowerCase().replace(/\s+/g, "-") },
        properties: { magical: !!flat.itemIsMagical }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "" } }
    };
    if (flat.itemIsMagical && flat.magicalAttunementRequired) {
      data.system.attunement = flat.magicalAttunementRequired;
    }
  } else if (type === "tool") {
    data = {
      type: "tool",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        type: { value: (flat.itemSubType || "artisans-tools").toLowerCase().replace(/\s+/g, "-") },
        ability: { value: "int", proficient: false }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "" } }
    };
  } else if (type === "weapon") {
    data = {
      type: "weapon",
      name: flat.itemName,
      img,
      system: {
        ...shared,
        type: { value: (flat.itemSubType || "simpleM").toLowerCase().replace(/\s+/g, "-") },
        properties: { magical: !!flat.itemIsMagical }
      },
      flags: { "coffee-pub": { source: flat.itemSource, license: flat.itemLicense || "" } }
    };
  }

  if (!data.name || !data.type) {
    data = {
      type: "loot",
      name: flat.itemName || "Imported Item",
      img: data.img || img,
      system: {
        ..._sharedItemSystem(flat),
        type: { value: flat.itemSubType || "trinket" },
        properties: { magical: !!flat.itemIsMagical }
      },
      flags: data.flags || {}
    };
  }

  if (flat.flags && typeof flat.flags === "object") {
    data.flags = data.flags || {};
    for (const [namespace, flagData] of Object.entries(flat.flags)) {
      if (namespace && flagData != null && typeof flagData === "object") {
        data.flags[namespace] = foundry.utils.mergeObject(data.flags[namespace] || {}, flagData, { inplace: true });
      }
    }
  }
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
    formula: "1d1", // Will be updated based on actual range
    replacement: flat.drawWithReplacement !== false, // Default to true
    displayRoll: flat.displayRollFormula === true, // Default to false
    results: []
  };

  // Process results
  if (flat.results && Array.isArray(flat.results)) {
    let currentRange = 1;
    let maxRange = 0;
    
    for (const result of flat.results) {
      const weight = result.resultWeight || 1;
      let rangeLower, rangeUpper;
      
      // Determine range based on what's provided
      if (result.resultRangeLower !== undefined && result.resultRangeUpper !== undefined) {
        // Both bounds provided - use them directly
        rangeLower = result.resultRangeLower;
        rangeUpper = result.resultRangeUpper;
        // Update currentRange to be after this range for next iteration
        currentRange = rangeUpper + 1;
      } else if (result.resultRangeLower !== undefined) {
        // Only lower bound provided - calculate upper from weight
        rangeLower = result.resultRangeLower;
        rangeUpper = rangeLower + weight - 1;
        currentRange = rangeUpper + 1;
      } else {
        // No bounds provided - use currentRange and weight
        rangeLower = currentRange;
        rangeUpper = currentRange + weight - 1;
        currentRange = rangeUpper + 1;
      }
      
      // Validate range
      if (rangeLower > rangeUpper) {
        throw new Error(`Invalid range: lower bound (${rangeLower}) is greater than upper bound (${rangeUpper})`);
      }
      
      // Track maximum range for formula calculation
      if (rangeUpper > maxRange) {
        maxRange = rangeUpper;
      }
      
      // Map resultType to FoundryVTT type (Compendium -> pack, Document -> document, Text -> text)
      let foundryType = (result.resultType || "text").toLowerCase();
      if (foundryType === "compendium") {
        foundryType = "pack";
      }
      
      const tableResult = {
        type: foundryType,
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
      
      // For compendium (pack) results, look up the documentId from the compendium index
      if (tableResult.type === "pack" && result.resultCompendium && result.resultText) {
        tableResult.documentCollection = result.resultCompendium;
        
        try {
          const pack = game.packs.get(result.resultCompendium);
          if (pack) {
            const index = await pack.getIndex();
            // Find exact match (case-insensitive)
            const entry = index.find(e => e.name.toLowerCase() === result.resultText.toLowerCase());
            if (entry) {
              tableResult.documentId = entry._id;
            } else {
              postConsoleAndNotification(MODULE.NAME, `Table Import: Item not found in compendium`, 
                `${result.resultText} not found in ${result.resultCompendium}`, false, false);
            }
          } else {
            postConsoleAndNotification(MODULE.NAME, `Table Import: Compendium pack not found`, 
              result.resultCompendium, false, false);
          }
        } catch (error) {
          postConsoleAndNotification(MODULE.NAME, `Table Import: Error looking up compendium item`, 
            `${result.resultCompendium}: ${error.message}`, false, false);
        }
      }

      data.results.push(tableResult);
    }
    
    // Set formula based on maximum range (minimum 1 to avoid invalid formula)
    data.formula = `1d${Math.max(1, maxRange)}`;
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
    const artificerPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-artificer-item.txt')).text();

    // Build dialog content with template, file select, and paste textbox
    const dialogContent = `
      <div class="form-group">
        <label><strong>Base Prompt Template</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <select id="item-template-type" style="flex: 0 0 auto;">
            <option value="loot">Loot</option>
            <option value="consumable">Consumables</option>
            <option value="artificer">Artificer</option>
          </select>
          <button id="copy-item-template-btn" type="button" class="file-picker-button"><i class="fa-solid fa-clipboard"></i> Copy to Clipboard</button>
        </div>
      </div>
      <div class="form-group">
        <label><strong>Select or Paste JSON</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <input type="file" id="item-json-file-input" accept=".json,application/json" style="display:none">
          <button id="select-item-json-btn" type="button" class="file-picker-button" style="background: #2d5c27; color: white;"><i class="fa-solid fa-folder-open"></i> Select JSON File</button>
        </div>
        <textarea id="item-json-input" style="width:100%;height:400px;" placeholder="Paste JSON here or select a file above..."></textarea>
      </div>
    `;

    const button = document.createElement('button');
    button.innerHTML = '<i class="fa-solid fa-boxes-stacked"></i> Import';
    button.addEventListener('click', () => {
      new Dialog({
        title: "Import Items from JSON",
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
                    // v13: html may be a jQuery object, convert to native DOM
                    let nativeHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeHtml = html[0] || html.get?.(0) || html;
                    }
                    const jsonInput = nativeHtml.querySelector("#item-json-input");
                    const jsonData = jsonInput ? jsonInput.value : '';
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
          // v13: htmlDialog may be a jQuery object, convert to native DOM
          let nativeHtmlDialog = htmlDialog;
          if (htmlDialog && (htmlDialog.jquery || typeof htmlDialog.find === 'function')) {
              nativeHtmlDialog = htmlDialog[0] || htmlDialog.get?.(0) || htmlDialog;
          }
          // Select JSON File button - trigger file input and load into textarea
          const selectItemJsonBtn = nativeHtmlDialog.querySelector("#select-item-json-btn");
          const itemFileInput = nativeHtmlDialog.querySelector("#item-json-file-input");
          const itemJsonInput = nativeHtmlDialog.querySelector("#item-json-input");
          if (selectItemJsonBtn && itemFileInput && itemJsonInput) {
              selectItemJsonBtn.addEventListener('click', () => itemFileInput.click());
              itemFileInput.addEventListener('change', (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                      itemJsonInput.value = ev.target?.result || '';
                      itemFileInput.value = '';
                  };
                  reader.readAsText(file);
              });
          }
          // Attach event listeners for template copy
          const copyItemTemplateBtn = nativeHtmlDialog.querySelector("#copy-item-template-btn");
          if (copyItemTemplateBtn) {
              copyItemTemplateBtn.addEventListener('click', async () => {
                  const itemTemplateTypeSelect = nativeHtmlDialog.querySelector("#item-template-type");
                  const type = itemTemplateTypeSelect ? itemTemplateTypeSelect.value : '';
            if (type === "loot") {
              const promptWithDefaults = await getItemPromptWithDefaults(lootPrompt);
              copyToClipboard(promptWithDefaults);
            } else if (type === "consumable") {
              const promptWithDefaults = await getItemPromptWithDefaults(consumablePrompt);
              copyToClipboard(promptWithDefaults);
            } else if (type === "artificer") {
              const promptWithDefaults = await getItemPromptWithDefaults(artificerPrompt);
              copyToClipboard(promptWithDefaults);
            }
              });
          }
        }
      }).render(true);
    });
        const headerActions = html.querySelector(".header-actions.action-buttons");
        if (headerActions) {
            headerActions.insertBefore(button, headerActions.firstChild);
        }
        
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
    const tableCompendiumItemPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-compendium-items.txt')).text();
    const tableCompendiumActorPrompt = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-rolltable-compendium-actors.txt')).text();

    // Build dialog content with template, file select, and paste textbox
    const dialogContent = `
      <div class="form-group">
        <label><strong>Base Prompt Template</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <select id="table-template-type" style="flex: 0 0 auto;">
            <option value="text">Simple Text</option>
            <option value="document-custom">Custom</option>
            <option value="document-item">World Items</option>
            <option value="document-actor">World Actors</option>
            <option value="compendium-item">Compendium Items</option>
            <option value="compendium-actor">Compendium Actors</option>
          </select>
          <button id="copy-table-template-btn" type="button" class="file-picker-button"><i class="fa-solid fa-clipboard"></i> Copy to Clipboard</button>
        </div>
      </div>
      <div class="form-group">
        <label><strong>Select or Paste JSON</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <input type="file" id="table-json-file-input" accept=".json,application/json" style="display:none">
          <button id="select-table-json-btn" type="button" class="file-picker-button" style="background: #2d5c27; color: white;"><i class="fa-solid fa-folder-open"></i> Select JSON File</button>
        </div>
        <textarea id="table-json-input" style="width:100%;height:400px;" placeholder="Paste JSON here or select a file above..."></textarea>
      </div>
    `;

    const button = document.createElement('button');
    button.innerHTML = '<i class="fa-solid fa-dice-d20"></i> Import';
    button.addEventListener('click', () => {
      new Dialog({
        title: "Import Roll Tables from JSON",
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
                    // v13: html may be a jQuery object, convert to native DOM
                    let nativeHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeHtml = html[0] || html.get?.(0) || html;
                    }
                    const jsonInput = nativeHtml.querySelector("#table-json-input");
                    const jsonData = jsonInput ? jsonInput.value : '';
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
                    }
                }
            }
        },
        default: "ok",
        render: (htmlDialog) => {
          // v13: htmlDialog may be a jQuery object, convert to native DOM
          let nativeHtmlDialog = htmlDialog;
          if (htmlDialog && (htmlDialog.jquery || typeof htmlDialog.find === 'function')) {
              nativeHtmlDialog = htmlDialog[0] || htmlDialog.get?.(0) || htmlDialog;
          }
          // Select JSON File button - trigger file input and load into textarea
          const selectTableJsonBtn = nativeHtmlDialog.querySelector("#select-table-json-btn");
          const tableFileInput = nativeHtmlDialog.querySelector("#table-json-file-input");
          const tableJsonInput = nativeHtmlDialog.querySelector("#table-json-input");
          if (selectTableJsonBtn && tableFileInput && tableJsonInput) {
              selectTableJsonBtn.addEventListener('click', () => tableFileInput.click());
              tableFileInput.addEventListener('change', (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                      tableJsonInput.value = ev.target?.result || '';
                      tableFileInput.value = '';
                  };
                  reader.readAsText(file);
              });
          }
          // Attach event listeners for template copy
          const copyTableTemplateBtn = nativeHtmlDialog.querySelector("#copy-table-template-btn");
          if (copyTableTemplateBtn) {
              copyTableTemplateBtn.addEventListener('click', async () => {
                  const tableTemplateTypeSelect = nativeHtmlDialog.querySelector("#table-template-type");
                  const type = tableTemplateTypeSelect ? tableTemplateTypeSelect.value : '';
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
            } else if (type === "compendium-item") {
              promptWithDefaults = await getTablePromptWithDefaults(tableCompendiumItemPrompt);
              // Replace [ADD-COMPENDIUMS-HERE] with selected compendium IDs
              const compendiumsList = getItemCompendiumsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUMS-HERE]').join(compendiumsList);
              // Replace [ADD-COMPENDIUM-ITEMS-HERE] with formatted items from compendiums
              const compendiumItemsList = await getCompendiumItemsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUM-ITEMS-HERE]').join(compendiumItemsList);
            } else if (type === "compendium-actor") {
              promptWithDefaults = await getTablePromptWithDefaults(tableCompendiumActorPrompt);
              // Replace [ADD-COMPENDIUMS-HERE] with selected actor compendium IDs
              const compendiumsList = getActorCompendiumsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUMS-HERE]').join(compendiumsList);
              // Replace [ADD-COMPENDIUM-ACTORS-HERE] with formatted actors from compendiums
              const compendiumActorsList = await getCompendiumActorsList();
              promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUM-ACTORS-HERE]').join(compendiumActorsList);
            }
            
            copyToClipboard(promptWithDefaults);
              });
          }
        }
      }).render(true);
    });
        const headerActions = html.querySelector(".header-actions.action-buttons");
        if (headerActions) {
            headerActions.insertBefore(button, headerActions.firstChild);
        }
        
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

    // Build dialog content with template, file select, and paste textbox
    const dialogContent = `
      <div class="form-group">
        <label><strong>Base Prompt Template</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <select id="actor-template-type" style="flex: 0 0 auto;">
            <option value="npc">NPC/Monster</option>
          </select>
          <button id="copy-actor-template-btn" type="button" class="file-picker-button"><i class="fa-solid fa-clipboard"></i> Copy to Clipboard</button>
        </div>
      </div>
      <div class="form-group">
        <label><strong>Select or Paste JSON</strong></label>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <input type="file" id="actor-json-file-input" accept=".json,application/json" style="display:none">
          <button id="select-actor-json-btn" type="button" class="file-picker-button" style="background: #2d5c27; color: white;"><i class="fa-solid fa-folder-open"></i> Select JSON File</button>
        </div>
        <textarea id="actor-json-input" style="width:100%;height:400px;" placeholder="Paste JSON here or select a file above..."></textarea>
      </div>
    `;

    const button = document.createElement('button');
    button.innerHTML = '<i class="fa-solid fa-user-plus"></i> Import';
    button.addEventListener('click', () => {
      new Dialog({
        title: "Import Actors/NPCs from JSON",
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
                    // v13: html may be a jQuery object, convert to native DOM
                    let nativeHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeHtml = html[0] || html.get?.(0) || html;
                    }
                    const jsonInput = nativeHtml.querySelector("#actor-json-input");
                    const jsonData = jsonInput ? jsonInput.value : '';
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
          // v13: htmlDialog may be a jQuery object, convert to native DOM
          let nativeHtmlDialog = htmlDialog;
          if (htmlDialog && (htmlDialog.jquery || typeof htmlDialog.find === 'function')) {
              nativeHtmlDialog = htmlDialog[0] || htmlDialog.get?.(0) || htmlDialog;
          }
          // Select JSON File button - trigger file input and load into textarea
          const selectActorJsonBtn = nativeHtmlDialog.querySelector("#select-actor-json-btn");
          const actorFileInput = nativeHtmlDialog.querySelector("#actor-json-file-input");
          const actorJsonInput = nativeHtmlDialog.querySelector("#actor-json-input");
          if (selectActorJsonBtn && actorFileInput && actorJsonInput) {
              selectActorJsonBtn.addEventListener('click', () => actorFileInput.click());
              actorFileInput.addEventListener('change', (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                      actorJsonInput.value = ev.target?.result || '';
                      actorFileInput.value = '';
                  };
                  reader.readAsText(file);
              });
          }
          // Attach event listeners for template copy
          const copyActorTemplateBtn = nativeHtmlDialog.querySelector("#copy-actor-template-btn");
          if (copyActorTemplateBtn) {
              copyActorTemplateBtn.addEventListener('click', async () => {
                  const actorTemplateTypeSelect = nativeHtmlDialog.querySelector("#actor-template-type");
                  const type = actorTemplateTypeSelect ? actorTemplateTypeSelect.value : '';
                  if (type === "npc") {
                      const promptWithDefaults = await getActorPromptWithDefaults(characterPrompt);
                      copyToClipboard(promptWithDefaults);
                  }
              });
          }
        }
      }).render(true);
    });
        const headerActions = html.querySelector(".header-actions.action-buttons");
        if (headerActions) {
            headerActions.insertBefore(button, headerActions.firstChild);
        }
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }
});

// Log hook registration
postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderActorDirectory", "blacksmith-actor-directory", true, false);

// Removed obsolete handleCacheManagementSettings function - cache management is now handled by the simplified system

// ================================================================== 
// ===== WINDOW-QUERY PARTIAL REGISTRATION ==========================
