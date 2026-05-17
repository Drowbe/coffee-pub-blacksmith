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
} from './utility-common.js';
// -- Import special page variables --
import { registerSettings, buildSelectedCompendiumArrays, buildSelectedCampaignArrays, reorderCompendiumsForType, extractTypeFromCompendiumSetting, refreshAssetDerivedChoices, primeCoreChoiceCaches } from './settings.js';
import { BlacksmithLayer } from './canvas-layer.js';
import { addToolbarButton } from './manager-toolbar.js';
import { CombatTimer } from './timer-combat.js';
import { PlanningTimer } from './timer-planning.js';
import { RoundTimer } from './timer-round.js';
import { CombatStats } from './stats-combat.js';
import { CPBPlayerStats } from './stats-player.js';
import { MenuBar } from './api-menubar.js';
import { CombatBarManager } from './manager-combatbar.js';
import { VoteManager } from './manager-vote.js';
import { WrapperManager } from './manager-libwrapper.js';
import { NavigationManager } from './manager-navigation.js';
import { ModuleManager } from './manager-modules.js';
import { UtilsManager } from './manager-utilities.js';
import { StatsAPI } from './api-stats.js';
import { CanvasTools } from './manager-canvas.js';
import { CombatTracker } from './ui-combat-tracker.js';
import { LatencyChecker } from './manager-latency-checker.js';
import { EncounterToolbar } from './ui-journal-encounter.js';
import { EncounterManager } from './manager-encounter.js';
import { PartyManager } from './manager-party.js';
import { ReputationManager } from './manager-reputation.js';
import { JournalTools } from './manager-journal-tools.js';
import { JournalPagePins } from './ui-journal-pins.js';
import { JournalDomWatchdog } from './manager-journal-dom.js';
import { CSSEditor } from './window-gmtools.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { JsonImportWindow } from './window-json-import.js';
import { attachJsonImportButton } from './registry-json-import.js';
import { ITEM_JSON_IMPORT_KIND_ID } from './registry-json-import-items.js';
import { XpManager } from './xp-manager.js';
import { SocketManager } from './manager-sockets.js';
import { HookManager } from './manager-hooks.js';
import { ConstantsGenerator } from './constants-generator.js';
import { assetLookup, initializeAssetLookupInstance } from './asset-lookup.js';
import { loadAssetBundlesWithOverrides, loadDefaultAssetBundlesFromJson } from './asset-loader.js';
import { UIContextMenu } from './ui-context-menu.js';
import { SidebarPin } from './ui-sidebar-pin.js';
import { SidebarStyle } from './ui-sidebar-style.js';
import { LoadingProgressManager } from './manager-loading-progress.js';
import { PinManager } from './manager-pins.js';
import { PinsAPI } from './api-pins.js';
import { TagsAPI } from './api-tags.js';
import { TagManager } from './manager-tags.js';
import { TagWidget } from './widget-tags.js';
import { ChatCardsAPI } from './api-chat-cards.js';
import { TokenIndicatorManager } from './manager-token-indicators.js';
import { CampaignManager } from './manager-campaign.js';
import { CampaignAPI } from './api-campaign.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import './sidebar-combat.js';
import './ui-combat-tools.js';

// Expose Application V2 base as soon as this module script runs (before hooks), so dependent modules
// that resolve a superclass at load time (e.g. Regent window-query.js) see api.BlacksmithWindowBaseV2
// without waiting for ready. Registry methods (registerWindow / openWindow) still attach in ready.
try {
    const _bsMod = typeof game !== 'undefined' && game?.modules?.get?.(MODULE.ID);
    if (_bsMod) {
        if (!_bsMod.api) _bsMod.api = {};
        _bsMod.api.BlacksmithWindowBaseV2 = BlacksmithWindowBaseV2;
        _bsMod.api.getWindowBaseV2 = () => BlacksmithWindowBaseV2;
    }
} catch {
    /* non-Foundry / test */
}
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

    // Before any await: compendiums / roll tables / macros must exist for other modules' ready hooks and BlacksmithAPI readiness.
    primeCoreChoiceCaches();
    
    // Bind menubar API synchronously so it is available to all ready callbacks (internal and external)
    const mod = game.modules.get(MODULE.ID);
    if (mod && MenuBar) {
        if (!mod.api) mod.api = {};
        Object.assign(mod.api, {
            registerMenubarTool: MenuBar.registerMenubarTool.bind(MenuBar),
            unregisterMenubarTool: MenuBar.unregisterMenubarTool.bind(MenuBar),
            getRegisteredMenubarTools: MenuBar.getRegisteredMenubarTools.bind(MenuBar),
            getMenubarToolsByModule: MenuBar.getMenubarToolsByModule.bind(MenuBar),
            isMenubarToolRegistered: MenuBar.isMenubarToolRegistered.bind(MenuBar),
            getMenubarToolsByZone: MenuBar.getMenubarToolsByZone.bind(MenuBar),
            testMenubarAPI: MenuBar.testMenubarAPI.bind(MenuBar),
            testRefactoredMenubar: MenuBar.testRefactoredMenubar.bind(MenuBar),
            testInterfaceTool: MenuBar.testInterfaceTool.bind(MenuBar),
            testSettingsTool: MenuBar.testSettingsTool.bind(MenuBar),
            testMovementTool: MenuBar.testMovementTool.bind(MenuBar),
            addNotification: MenuBar.addNotification.bind(MenuBar),
            updateNotification: MenuBar.updateNotification.bind(MenuBar),
            removeNotification: MenuBar.removeNotification.bind(MenuBar),
            clearNotificationsByModule: MenuBar.clearNotificationsByModule.bind(MenuBar),
            getActiveNotifications: MenuBar.getActiveNotifications.bind(MenuBar),
            clearAllNotifications: MenuBar.clearAllNotifications.bind(MenuBar),
            getNotificationIdsByModule: MenuBar.getNotificationIdsByModule.bind(MenuBar),
            registerSecondaryBarType: MenuBar.registerSecondaryBarType.bind(MenuBar),
            registerSecondaryBarItem: MenuBar.registerSecondaryBarItem.bind(MenuBar),
            unregisterSecondaryBarItem: MenuBar.unregisterSecondaryBarItem.bind(MenuBar),
            updateSecondaryBarItemActive: MenuBar.updateSecondaryBarItemActive.bind(MenuBar),
            updateSecondaryBarItemInfo: MenuBar.updateSecondaryBarItemInfo.bind(MenuBar),
            getSecondaryBarItems: MenuBar.getSecondaryBarItems.bind(MenuBar),
            openSecondaryBar: MenuBar.openSecondaryBar.bind(MenuBar),
            updateMenubarToolActive: MenuBar.updateMenubarToolActive.bind(MenuBar),
            closeSecondaryBar: MenuBar.closeSecondaryBar.bind(MenuBar),
            toggleSecondaryBar: MenuBar.toggleSecondaryBar.bind(MenuBar),
            updateSecondaryBar: MenuBar.updateSecondaryBar.bind(MenuBar),
            registerSecondaryBarTool: MenuBar.registerSecondaryBarTool.bind(MenuBar),
            openCombatBar: (combatData = null) => CombatBarManager.openCombatBar(MenuBar, combatData),
            closeCombatBar: () => CombatBarManager.closeCombatBar(MenuBar),
            updateCombatBar: (combatData = null) => CombatBarManager.updateCombatBar(MenuBar, combatData),
            createCombat: MenuBar.createCombat?.bind(MenuBar),
            toggleCombatTracker: () => CombatBarManager.toggleCombatTracker(),
            hasQuickEncounterTool: MenuBar.hasQuickEncounterTool?.bind(MenuBar),
            openQuickEncounterWindow: MenuBar.openQuickEncounterWindow?.bind(MenuBar),
            testNotificationSystem: MenuBar.testNotificationSystem.bind(MenuBar),
            testSecondaryBarSystem: MenuBar.testSecondaryBarSystem.bind(MenuBar),
            renderMenubar: MenuBar.renderMenubar.bind(MenuBar),
            showMenubarContextMenu: MenuBar.showMenubarContextMenu.bind(MenuBar),
            registerMenubarVisibilityOverride: MenuBar.registerMenubarVisibilityOverride.bind(MenuBar),
            unregisterMenubarVisibilityOverride: MenuBar.unregisterMenubarVisibilityOverride.bind(MenuBar)
        });
    }

    // Defaults load only from shipped `resources/asset-defaults/*.json` (fetch). No separate sync bundle or Node build.
    let baseBundles;
    try {
        baseBundles = await loadDefaultAssetBundlesFromJson();
    } catch (e) {
        console.error(`${MODULE.ID}: loadDefaultAssetBundlesFromJson failed (early ready)`, e);
        LoadingProgressManager.forceHide();
        return;
    }

    // Build AssetLookup before registerSettings() (dropdown sources read assetLookup).
    // Other modules' `ready` hooks run during awaits; they must never see `assetLookup === null` (getAllConstants, etc.).
    try {
        initializeAssetLookupInstance(baseBundles);
        refreshAssetDerivedChoices();
        if (mod?.api) mod.api.assetLookup = assetLookup;
    } catch (e) {
        console.error(`${MODULE.ID}: initializeAssetLookupInstance failed (early ready)`, e);
        LoadingProgressManager.forceHide();
        return;
    }

    // Register settings so Asset Mapping paths exist before we fetch optional JSON overrides.
    // Must not throw: this runs before the main init try/catch, so a throw would stall loading at "Finalizing...".
    try {
        registerSettings();
    } catch (e) {
        console.error(`${MODULE.ID}: registerSettings failed (early ready)`, e);
        LoadingProgressManager.forceHide();
        return;
    }

    // Menubar secondary bars read world settings (e.g. encounterToolbarDeploymentPattern) — must run after registerSettings().
    try {
        MenuBar.initialize();
        await MenuBar.runReadySetup();
    } catch (e) {
        console.error(`${MODULE.ID}: MenuBar.runReadySetup failed`, e);
        LoadingProgressManager.forceHide();
        return;
    }

    // Optional per-category Asset Mapping overrides (fetch; merge after default JSON baseline is live).
    const { BlacksmithAPI } = await import('../api/blacksmith-api.js');
    try {
        const mergedBundles = await loadAssetBundlesWithOverrides(baseBundles);
        initializeAssetLookupInstance(mergedBundles);
        refreshAssetDerivedChoices();
        if (mod?.api) mod.api.assetLookup = assetLookup;
    } catch (e) {
        console.error(`${MODULE.ID}: loadAssetBundlesWithOverrides / merge failed`, e);
        LoadingProgressManager.forceHide();
        BlacksmithAPI.markReadyForConsumers();
        return;
    }

    BlacksmithAPI.markReadyForConsumers();
    MenuBar.renderMenubar(true);

    CombatBarManager.initialize(MenuBar);
    // CombatBarManager replaces several MenuBar statics; re-bind so module.api always calls patched methods.
    if (mod?.api) {
        mod.api.toggleSecondaryBar = MenuBar.toggleSecondaryBar.bind(MenuBar);
        mod.api.openSecondaryBar = MenuBar.openSecondaryBar.bind(MenuBar);
        mod.api.closeSecondaryBar = MenuBar.closeSecondaryBar.bind(MenuBar);
        mod.api.updateSecondaryBar = MenuBar.updateSecondaryBar.bind(MenuBar);
        mod.api.renderMenubar = MenuBar.renderMenubar.bind(MenuBar);
    }

    // Update progress to final phase
    LoadingProgressManager.setPhase(5, "Finalizing...");
    LoadingProgressManager.logActivity("Initializing modules...");
    
    try {
        // Settings already registered at start of ready (before asset merge).
        LoadingProgressManager.logActivity("Registering settings...");
        
        // Initialize HookManager (infrastructure layer)
        LoadingProgressManager.logActivity("Initializing hook system...");
        HookManager.initialize();
        
        // Register the Blacksmith hook (after HookManager is initialized)
        LoadingProgressManager.logActivity("Registering hooks...");
        registerBlacksmithUpdatedHook();
        
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
        TokenIndicatorManager.initialize();

        // Initialize PinManager (canvas pins API)
        PinManager.initialize();
        
        // Image replacement / dead tokens – provided by Coffee Pub Curator when installed

        // Initialize other settings-dependent features
        LoadingProgressManager.logActivity("Configuring features...");
        initializeSettingsDependentFeatures();

        // Initialize the unified roll system API
        LoadingProgressManager.logActivity("Loading roll system...");
        await _registerUnifiedHeaderPartial();
        await TagWidget.registerPartial();

        // Initialize the Tags system: load taxonomy, register GM proxy, run migration
        LoadingProgressManager.logActivity("Initializing tags system...");
        await TagManager.ensureTaxonomyLoaded();
        TagManager.registerGMProxy().catch(() => {});
        TagManager.runMigration().catch(() => {});
        PinManager.backfillFlagAssignments().catch(() => {});

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

        // Tear down journal/encounter DOM watchers on world exit (reduces duplicate intervals if session restarts without full reload)
        Hooks.once('closeGame', () => {
            try {
                EncounterToolbar.dispose();
                JournalPagePins.dispose();
            } catch (e) {
                console.warn(`${MODULE.ID}: closeGame journal lifecycle dispose`, e);
            }
        });

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
    
    // OPENAI / REGENT: AI settings and macro are in coffee-pub-regent when that module is enabled.

    // Update the Chat Spacing per settings
    updateChatStyles();
    // Update any scene overrides
    updateSceneStyles();
    // Update any link style overrides
    updateObjectLinkStyles();
    // Set default card theme
    let strDefaultCardTheme = getSettingSafely(MODULE.ID, 'defaultCardTheme', 'default');
    BLACKSMITH.updateValue('strDefaultCardTheme', strDefaultCardTheme);

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
                        size: (() => {
                            const s = data.size;
                            if (!s || typeof s.w !== 'number') return undefined;
                            const shape = data.shape || 'circle';
                            // circle and square must be square; rectangle and none may have free aspect ratio
                            const freeAspect = shape === 'rectangle' || shape === 'none';
                            return { w: s.w, h: freeAspect ? (s.h ?? s.w) : s.w };
                        })(),
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

    // Run scene interactions setup (hooks, canvas, etc.)
    LoadingProgressManager.logActivity("Setting up scene interactions...");
    initializeSceneInteractions();

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

/**
 * Register the unified-header Handlebars partial as "partial-unified-header" for RollWindow and SkillCheckDialog.
 * File lives at templates/partials/unified-header.hbs; templates reference {{> "partial-unified-header" }}.
 * @private
 */
async function _registerUnifiedHeaderPartial() {
    try {
        const path = `modules/${MODULE.ID}/templates/partials/unified-header.hbs`;
        const template = await fetch(path).then(r => r.text());
        if (template) {
            Handlebars.registerPartial('partial-unified-header', template);
        }
    } catch (e) {
        console.error(`${MODULE.NAME}: Failed to register partial-unified-header`, e);
    }
}

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
    CampaignManager.initialize();

    // Expose module.api before any await in init — other modules' `ready` hooks may run while this
    // async init is suspended (e.g. at await addToolbarButton), so the public API must exist first.
    // =========================================================================
    // ===== BEGIN: EXPOSE API (early, before any await) ======================
    // =========================================================================
    const module = game.modules.get(MODULE.ID);
    const generatedConstants = assetLookup?.getAllConstants?.() ?? {};
    if (generatedConstants && typeof generatedConstants === 'object') {
        Object.assign(BLACKSMITH, generatedConstants);
    }
    if (!module.api) module.api = {};
    Object.assign(module.api, {
        ModuleManager,
        registerModule: ModuleManager.registerModule.bind(ModuleManager),
        isModuleActive: ModuleManager.isModuleActive.bind(ModuleManager),
        getModuleFeatures: ModuleManager.getModuleFeatures.bind(ModuleManager),
        utils: UtilsManager.getUtils(),
        version: MODULE.APIVERSION,
        BLACKSMITH: BLACKSMITH,
        stats: StatsAPI,
        HookManager,
        ConstantsGenerator,
        assetLookup,
        uiContextMenu: UIContextMenu,
        registerToolbarTool: null,
        unregisterToolbarTool: null,
        getRegisteredTools: null,
        getToolsByModule: null,
        isToolRegistered: null,
        getToolbarSettings: null,
        setToolbarSettings: null,
        registerWindow: null,
        unregisterWindow: null,
        openWindow: null,
        getRegisteredWindows: null,
        isWindowRegistered: null,
        /** @see documentation/api-window.md — available from module load; same references re-applied here. */
        BlacksmithWindowBaseV2,
        getWindowBaseV2: () => BlacksmithWindowBaseV2,
        registerMenubarTool: null,
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
        addNotification: null,
        updateNotification: null,
        removeNotification: null,
        clearNotificationsByModule: null,
        getActiveNotifications: null,
        clearAllNotifications: null,
        getNotificationIdsByModule: null,
        registerSecondaryBarType: null,
        openSecondaryBar: null,
        closeSecondaryBar: null,
        sockets: null,
        toggleSecondaryBar: null,
        updateSecondaryBar: null,
        openCombatBar: null,
        closeCombatBar: null,
        updateCombatBar: null,
        testNotificationSystem: null,
        CanvasLayer: null,
        getCanvasLayer: null,
        pins: PinsAPI,
        tags: TagsAPI,
        chatCards: ChatCardsAPI,
        campaign: CampaignAPI,
        getPartyCR: EncounterManager.getPartyCR.bind(EncounterManager),
        getMonsterCR: EncounterManager.getMonsterCR.bind(EncounterManager),
        calculateEncounterDifficulty: EncounterManager.calculateEncounterDifficulty.bind(EncounterManager),
        getCombatAssessment: EncounterManager.getCombatAssessment.bind(EncounterManager),
        parseCR: EncounterManager.parseCR.bind(EncounterManager),
        formatCR: EncounterManager.formatCR.bind(EncounterManager),
        getPartyHealthSummary: PartyManager.getPartyHealthSummary.bind(PartyManager),
        getPartyActorHp: PartyManager.getActorHp.bind(PartyManager),
        getPartyReputation: ReputationManager.getPartyReputation.bind(ReputationManager),
        setPartyReputation: ReputationManager.setPartyReputation.bind(ReputationManager),
        getReputationScaleEntry: ReputationManager.getScaleEntry.bind(ReputationManager),
        postCurrentReputationCard: ReputationManager.postCurrentReputationCard.bind(ReputationManager),
        postNewReputationCard: ReputationManager.postNewReputationCard.bind(ReputationManager),
        deployMonsters: EncounterToolbar.deployMonsters.bind(EncounterToolbar),
        createJournalEntry,
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
        }
    });
    if (MenuBar) {
        Object.assign(module.api, {
            registerMenubarTool: MenuBar.registerMenubarTool.bind(MenuBar),
            unregisterMenubarTool: MenuBar.unregisterMenubarTool.bind(MenuBar),
            getRegisteredMenubarTools: MenuBar.getRegisteredMenubarTools.bind(MenuBar),
            getMenubarToolsByModule: MenuBar.getMenubarToolsByModule.bind(MenuBar),
            isMenubarToolRegistered: MenuBar.isMenubarToolRegistered.bind(MenuBar),
            getMenubarToolsByZone: MenuBar.getMenubarToolsByZone.bind(MenuBar),
            renderMenubar: MenuBar.renderMenubar.bind(MenuBar),
            addNotification: MenuBar.addNotification.bind(MenuBar),
            updateNotification: MenuBar.updateNotification.bind(MenuBar),
            removeNotification: MenuBar.removeNotification.bind(MenuBar),
            clearNotificationsByModule: MenuBar.clearNotificationsByModule.bind(MenuBar),
            getActiveNotifications: MenuBar.getActiveNotifications.bind(MenuBar),
            clearAllNotifications: MenuBar.clearAllNotifications.bind(MenuBar),
            getNotificationIdsByModule: MenuBar.getNotificationIdsByModule.bind(MenuBar),
            registerSecondaryBarType: MenuBar.registerSecondaryBarType.bind(MenuBar),
            registerSecondaryBarItem: MenuBar.registerSecondaryBarItem.bind(MenuBar),
            unregisterSecondaryBarItem: MenuBar.unregisterSecondaryBarItem.bind(MenuBar),
            updateSecondaryBarItemActive: MenuBar.updateSecondaryBarItemActive.bind(MenuBar),
            updateSecondaryBarItemInfo: MenuBar.updateSecondaryBarItemInfo.bind(MenuBar),
            getSecondaryBarItems: MenuBar.getSecondaryBarItems.bind(MenuBar),
            openSecondaryBar: MenuBar.openSecondaryBar.bind(MenuBar),
            updateMenubarToolActive: MenuBar.updateMenubarToolActive.bind(MenuBar),
            closeSecondaryBar: MenuBar.closeSecondaryBar.bind(MenuBar),
            toggleSecondaryBar: MenuBar.toggleSecondaryBar.bind(MenuBar),
            updateSecondaryBar: MenuBar.updateSecondaryBar.bind(MenuBar),
            registerSecondaryBarTool: MenuBar.registerSecondaryBarTool.bind(MenuBar),
            openCombatBar: (combatData = null) => CombatBarManager.openCombatBar(MenuBar, combatData),
            closeCombatBar: () => CombatBarManager.closeCombatBar(MenuBar),
            updateCombatBar: (combatData = null) => CombatBarManager.updateCombatBar(MenuBar, combatData),
            createCombat: MenuBar.createCombat?.bind(MenuBar),
            toggleCombatTracker: () => CombatBarManager.toggleCombatTracker(),
            hasQuickEncounterTool: MenuBar.hasQuickEncounterTool?.bind(MenuBar),
            openQuickEncounterWindow: MenuBar.openQuickEncounterWindow?.bind(MenuBar),
            registerMenubarVisibilityOverride: MenuBar.registerMenubarVisibilityOverride.bind(MenuBar),
            unregisterMenubarVisibilityOverride: MenuBar.unregisterMenubarVisibilityOverride.bind(MenuBar)
        });
    }
    
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
                    const type = settingKey.startsWith('rulebookCompendium')
                        ? null
                        : extractTypeFromCompendiumSetting(settingKey);
                    if (type) {
                        // Use setTimeout to avoid race conditions and ensure setting is saved
                        setTimeout(async () => {
                            await reorderCompendiumsForType(type);
                        }, 200);
                    }
                    buildSelectedCompendiumArrays();
                }

                const campaignSettingPattern = /^(defaultPartySize|partyMember\d+|numRulebooks|rulebookCompendium\d+)$/;
                if (campaignSettingPattern.test(settingKey)) {
                    buildSelectedCampaignArrays();
                }
            }
            
            //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
        }
    });

    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | settingChange", "blacksmith-settings-cache", true, false);
    
    // Initialize other systems
    // MenuBar.initialize() already called at start of ready (registers its ready callback)
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
    // QUICK VIEW — load only when the Vision load gate is on (see enableQuickViewFeature)
    if (getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) {
        import('./utility-quickview.js').then(({ QuickViewUtility }) => {
            QuickViewUtility.initialize();
        });
    }

    // PERFORMANCE MONITOR — loaded only via dynamic import when the hamburger menu is opened (see enablePerformanceMonitor in utility-core)

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

    // Import and expose Window API (Application V2 window registry)
    import('./api-windows.js').then(({
        registerWindow,
        unregisterWindow,
        openWindow,
        getRegisteredWindows,
        isWindowRegistered
    }) => {
        module.api.registerWindow = registerWindow;
        module.api.unregisterWindow = unregisterWindow;
        module.api.openWindow = openWindow;
        module.api.getRegisteredWindows = getRegisteredWindows;
        module.api.isWindowRegistered = isWindowRegistered;
        postConsoleAndNotification(MODULE.NAME, "Window API: Exposed for external modules", "", false, false);
    }).catch(error => {
        postConsoleAndNotification(MODULE.NAME, "Failed to load Window API", error, false, false);
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
        module.api.updateSecondaryBarItemInfo = MenuBar.updateSecondaryBarItemInfo.bind(MenuBar);
        module.api.getSecondaryBarItems = MenuBar.getSecondaryBarItems.bind(MenuBar);
        module.api.openSecondaryBar = MenuBar.openSecondaryBar.bind(MenuBar);
        module.api.updateMenubarToolActive = MenuBar.updateMenubarToolActive.bind(MenuBar);
        module.api.closeSecondaryBar = MenuBar.closeSecondaryBar.bind(MenuBar);
        module.api.toggleSecondaryBar = MenuBar.toggleSecondaryBar.bind(MenuBar);
        module.api.updateSecondaryBar = MenuBar.updateSecondaryBar.bind(MenuBar);
        module.api.registerSecondaryBarTool = MenuBar.registerSecondaryBarTool.bind(MenuBar);
        
        // Combat Bar API
        module.api.openCombatBar = (combatData = null) => CombatBarManager.openCombatBar(MenuBar, combatData);
        module.api.closeCombatBar = () => CombatBarManager.closeCombatBar(MenuBar);
        module.api.updateCombatBar = (combatData = null) => CombatBarManager.updateCombatBar(MenuBar, combatData);
        module.api.testNotificationSystem = MenuBar.testNotificationSystem.bind(MenuBar);
        module.api.testSecondaryBarSystem = MenuBar.testSecondaryBarSystem.bind(MenuBar);
        module.api.renderMenubar = MenuBar.renderMenubar.bind(MenuBar);
        module.api.registerMenubarVisibilityOverride = MenuBar.registerMenubarVisibilityOverride.bind(MenuBar);
        module.api.unregisterMenubarVisibilityOverride = MenuBar.unregisterMenubarVisibilityOverride.bind(MenuBar);

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
        const KM = foundry?.helpers?.interaction?.KeyboardManager;
        ctrlKeyActiveDuringRender = !!(KM && game.keyboard.isModifierActive(KM.MODIFIER_KEYS.CONTROL));
        shiftKeyActiveDuringRender = !!(KM && game.keyboard.isModifierActive(KM.MODIFIER_KEYS.SHIFT));
        altKeyActiveDuringRender = !!(KM && game.keyboard.isModifierActive(KM.MODIFIER_KEYS.ALT)); 

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

// Set up periodic checker for journal page navigation (hooks are still inconsistent across v13 journal renders)
Hooks.once('ready', () => {
    // Register journal hooks through HookManager only (avoids duplicate callbacks).
    HookManager.registerHook({
        name: 'renderJournalSheet',
        description: 'Blacksmith: Enable journal double-click editing for GMs',
        context: 'blacksmith-journal-double-click',
        priority: 3,
        callback: _onRenderJournalDoubleClick
    });

    // Register renderJournalPageSheet hook (fires when journal pages are switched in v13 ApplicationV2)
    HookManager.registerHook({
        name: 'renderJournalPageSheet',
        description: 'Blacksmith: Enable journal double-click editing for GMs (page-level)',
        context: 'blacksmith-journal-double-click-page',
        priority: 3,
        callback: _onRenderJournalDoubleClick
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
    
    // Use shared DOM watchdog to reduce duplicate MutationObserver pipelines.
    const sheetHandler = (sheetEl) => {
        // Small delay to ensure DOM is fully rendered (keeps behavior close to the old observer)
        setTimeout(() => processJournalSheet(sheetEl), 50);
    };
    JournalDomWatchdog.registerSheetHandler(sheetHandler);
    JournalDomWatchdog.registerPageHandler(sheetHandler);
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

const coffeePubChatCardPaddingHookId = HookManager.registerHook({
    name: 'renderChatMessageHTML',
    description: 'Blacksmith: Mark Coffee Pub chat cards for wrapper padding removal',
    context: 'blacksmith-chat-card-padding',
    priority: 3,
    callback: (message, html) => {
        const htmlElement = getChatMessageElement(html);
        if (!htmlElement) {
            return;
        }

        const chatMessageElement = htmlElement.closest?.('.chat-message') || htmlElement;
        if (!chatMessageElement?.classList) {
            return;
        }

        const isCoffeePubCard = message.flags?.[MODULE.ID]?.isCoffeePubCard === true
            || htmlElement.querySelector('.blacksmith-card, .cpb-chat-card, .vote-card') !== null;
        if (!isCoffeePubCard) {
            return;
        }

        chatMessageElement.classList.add('cpb-chat-message');

        const removePadding = message.flags?.[MODULE.ID]?.removeChatCardPadding
            ?? getSettingSafely(MODULE.ID, 'removeChatCardPadding', false);
        chatMessageElement.classList.toggle('cpb-chat-message-no-padding', removePadding);
    }
});

postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessageHTML", "blacksmith-chat-card-padding", true, false);

const coffeePubDefaultThemeHookId = HookManager.registerHook({
    name: 'renderChatMessageHTML',
    description: 'Blacksmith: Apply configured default theme to Coffee Pub chat cards',
    context: 'blacksmith-default-card-theme',
    priority: 3,
    callback: (_message, html) => {
        const htmlElement = getChatMessageElement(html);
        if (!htmlElement) {
            return;
        }

        const selectedTheme = getSettingSafely(MODULE.ID, 'defaultCardTheme', 'default');
        const themeClassName = ChatCardsAPI.getThemeClassName(selectedTheme);
        if (!themeClassName || themeClassName === 'theme-default') {
            return;
        }

        const defaultCards = htmlElement.querySelectorAll('.blacksmith-card.theme-default');
        for (const card of defaultCards) {
            card.classList.remove('theme-default');
            card.classList.add(themeClassName);
        }
    }
});

postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessageHTML", "blacksmith-default-card-theme", true, false);

// ***************************************************
// ** RENDER Import Journal Entries
// ***************************************************
// This will add the import button to the journal directory
// and wait for clicks to import the JSON

// Helper to replace placeholders in the narrative template with settings values
async function getNarrativeTemplateWithDefaults(narrativeTemplate) {
  const context = CampaignManager.getPromptContext();
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
    { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
    { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
    { placeholder: '[ADD-PARTY-NAME-HERE]', value: context.partyName },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', value: context.partySize },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', value: context.partyLevel },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', value: context.partyMakeup },
    { placeholder: '[ADD-PARTY-CLASSES-HERE]', value: context.partyClasses },
    { placeholder: '[ADD-FOLDER-NAME-HERE]', value: context.narrativeFolder },
    { placeholder: '[ADD-REGION-HERE]', value: context.region },
    { placeholder: '[ADD-AREA-HERE]', value: context.area },
    { placeholder: '[ADD-SITE-HERE]', value: context.site },
    { placeholder: '[ADD-REALM-HERE]', value: context.realm },
    { placeholder: '[ADD-IMAGE-PATH-HERE]', value: context.narrativeCardImage }
  ];
  let result = narrativeTemplate;
  for (const { placeholder, value: initialValue } of settings) {
    let value = initialValue;
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
          value = context.narrativeImagePath;
      }
    }
    if (!value) continue; // leave placeholder if not set
    result = result.split(placeholder).join(value);
  }
  return result;
}

async function getEncounterTemplateWithDefaults(encounterTemplate) {
  const context = CampaignManager.getPromptContext();
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
    { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
    { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
    { placeholder: '[ADD-PARTY-NAME-HERE]', value: context.partyName },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', value: context.partySize },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', value: context.partyLevel },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', value: context.partyMakeup },
    { placeholder: '[ADD-PARTY-CLASSES-HERE]', value: context.partyClasses },
    { placeholder: '[ADD-FOLDER-NAME-HERE]', value: context.encounterFolder },
    { placeholder: '[ADD-REGION-HERE]', value: context.region },
    { placeholder: '[ADD-AREA-HERE]', value: context.area },
    { placeholder: '[ADD-SITE-HERE]', value: context.site },
    { placeholder: '[ADD-REALM-HERE]', value: context.realm },
    { placeholder: '[ADD-IMAGE-PATH-HERE]', value: context.encounterCardImage }
  ];
  let result = encounterTemplate;
  for (const { placeholder, value: initialValue } of settings) {
    let value = initialValue;
    // Special logic for image path
    if (placeholder === '[ADD-IMAGE-PATH-HERE]') {
      if (value === 'custom') {
          value = context.encounterImagePath;
      }
    }
    if (!value) continue; // leave placeholder if not set
    result = result.split(placeholder).join(value);
  }
  return result;
}

async function getLocationTemplateWithDefaults(locationTemplate) {
  const context = CampaignManager.getPromptContext();
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
    { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
    { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
    { placeholder: '[ADD-REALM-HERE]', value: context.realm },
    { placeholder: '[ADD-REGION-HERE]', value: context.region },
    { placeholder: '[ADD-SITE-HERE]', value: context.site },
    { placeholder: '[ADD-AREA-HERE]', value: context.area }
  ];

  let result = locationTemplate;
  for (const setting of settings) {
    const value = setting.value || '';
    if (value) {
      result = result.split(setting.placeholder).join(value);
    }
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
        const locationTemplate = await (await fetch('modules/coffee-pub-blacksmith/prompts/prompt-location.txt')).text();

        const button = document.createElement('button');
        button.innerHTML = '<i class="fa-solid fa-masks-theater"></i> Import';
        button.addEventListener('click', () => {
            void JsonImportWindow.open({
                idSuffix: 'journal',
                windowTitle: 'Import JSON',
                headerTitle: 'Import Journal',
                windowIcon: 'fa-solid fa-masks-theater',
                position: { width: 920, height: 680 },
                templateOptions: [
                    { value: 'narrative', label: 'Narrative' },
                    { value: 'encounter', label: 'Encounter' },
                    { value: 'injury', label: 'Injury' },
                    { value: 'location', label: 'Location' }
                ],
                onCopyTemplate: async (type) => {
                    if (type === 'injury') {
                        copyToClipboard(injuryTemplate);
                    } else if (type === 'encounter') {
                        const templateWithDefaults = await getEncounterTemplateWithDefaults(encounterTemplate);
                        copyToClipboard(templateWithDefaults);
                    } else if (type === 'location') {
                        const templateWithDefaults = await getLocationTemplateWithDefaults(locationTemplate);
                        copyToClipboard(templateWithDefaults);
                    } else {
                        const templateWithDefaults = await getNarrativeTemplateWithDefaults(narrativeTemplate);
                        copyToClipboard(templateWithDefaults);
                    }
                },
                onImport: async (jsonData) => {
                    try {
                        const journalData = JSON.parse(jsonData);
                        const strJournalType = journalData.journaltype;
                        if (!strJournalType) {
                            throw new Error("Missing 'journaltype' field in JSON data");
                        }
                        switch (strJournalType.toUpperCase()) {
                            case 'NARRATIVE':
                            case 'ENCOUNTER':
                            case 'LOCATION':
                                await createJournalEntry(journalData);
                                break;
                            case 'INJURY':
                                await buildInjuryJournalEntry(journalData);
                                break;
                            default:
                                postConsoleAndNotification(
                                    MODULE.NAME,
                                    "Can't create the journal entry. The journal type was not found.",
                                    strJournalType,
                                    false,
                                    true
                                );
                        }
                        return true;
                    } catch (e) {
                        postConsoleAndNotification(MODULE.NAME, 'Failed to parse JSON', e, false, true);
                        return false;
                    }
                }
            });
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

/**
 * Open Request a Roll ({@link SkillCheckDialog}) windows, for optional UI sync after chat updates.
 */
function getBlacksmithWindows() {
    if (!ui?.windows) return [];
    return Object.values(ui.windows).filter((w) => w instanceof SkillCheckDialog);
}

function _applicationDomElement(app) {
    if (!app?.element) return null;
    const el = app.element;
    return typeof el.jquery !== 'undefined' ? el[0] ?? el.get?.(0) : el;
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

    const allComplete = (updatedMessageData.actors || []).length > 0 &&
        (updatedMessageData.actors || []).every(a => a.result);
    const completionPayload = {
        messageId: message.id,
        message,
        messageData: updatedMessageData,
        tokenId,
        result,
        allComplete,
        requesterId: updatedMessageData.requesterId ?? null,
        rollerUserId: data.rollerUserId ?? null
    };

    // Notify the local GM immediately (supports GM-authoritative workflows)
    SkillCheckDialog._notifyRequestRollComplete(completionPayload);

    // Scroll chat to bottom to show the updated group results (with delay to ensure DOM is updated)
    setTimeout(() => {
        _scrollChatToBottom();
    }, 100);

    // Broadcast the final result to other clients for synchronized callbacks/hooks and UI updates
    const socket = SocketManager.getSocket();
    if (socket) {
        await socket.executeForOthers("skillRollFinalized", {
            type: "skillRollFinalized",  // Add type property
            messageId: message.id,
            flags: updatedMessageData,
            rollData: data, // Pass along the specific roll data (tokenId, result)
            completionPayload
        });
    }

    // Cinema overlay updates are now handled by the new system in deliverRollResults()

    // If this was a requested roll, update the GM's interface
    if (flags.requesterId === game.user.id) {
        const windows = getBlacksmithWindows();
        windows.forEach((win) => {
            const root = _applicationDomElement(win);
            const inputField = root?.querySelector?.('input[name="diceValue"]');
            if (inputField) {
                inputField.value = result.total;
            }
        });
    }
}

// Helper to replace placeholders in the table prompt with settings values
async function getTablePromptWithDefaults(tablePrompt) {
  const context = CampaignManager.getPromptContext();
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
    { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
    { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
    { placeholder: '[ADD-ITEM-SOURCE-HERE]', value: context.campaignName },
    { placeholder: '[ADD-ACTORS-SOURCE-HERE]', value: context.campaignName }
  ];

  let result = tablePrompt;
  for (const setting of settings) {
    const value = setting.value || '';
    if (value) {
      result = result.split(setting.placeholder).join(value);
    }
  }
  return result;
}

// Helper to replace placeholders in the actor prompt with settings values
async function getActorPromptWithDefaults(actorPrompt) {
  const context = CampaignManager.getPromptContext();
  const settings = [
    { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: context.campaignName },
    { placeholder: '[ADD-RULES-VERSION-HERE]', value: context.rulesVersion },
    { placeholder: '[ADD-RULEBOOKS-HERE]', value: context.rulebooks },
    { placeholder: '[ADD-NPC-SOURCE-HERE]', value: context.campaignName },
    { placeholder: '[ADD-PARTY-NAME-HERE]', value: context.partyName },
    { placeholder: '[ADD-PARTY-SIZE-HERE]', value: context.partySize },
    { placeholder: '[ADD-PARTY-LEVEL-HERE]', value: context.partyLevel },
    { placeholder: '[ADD-PARTY-MAKEUP-HERE]', value: context.partyMakeup },
    { placeholder: '[ADD-PARTY-CLASSES-HERE]', value: context.partyClasses }
  ];

  let result = actorPrompt;
  for (const setting of settings) {
    const value = setting.value || '';
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
        attachJsonImportButton(html, ITEM_JSON_IMPORT_KIND_ID);
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

    const button = document.createElement('button');
    button.innerHTML = '<i class="fa-solid fa-dice-d20"></i> Import';
    button.addEventListener('click', () => {
        void JsonImportWindow.open({
            idSuffix: 'rolltable',
            windowTitle: 'Import JSON',
            headerTitle: 'Import Roll Table',
            windowIcon: 'fa-solid fa-dice-d20',
            position: { width: 920, height: 680 },
            templateOptions: [
                { value: 'text', label: 'Simple Text' },
                { value: 'document-custom', label: 'Custom' },
                { value: 'document-item', label: 'World Items' },
                { value: 'document-actor', label: 'World Actors' },
                { value: 'compendium-item', label: 'Compendium Items' },
                { value: 'compendium-actor', label: 'Compendium Actors' }
            ],
            onCopyTemplate: async (type) => {
                let promptWithDefaults = '';
                if (type === 'text') {
                    promptWithDefaults = await getTablePromptWithDefaults(tablePrompt);
                } else if (type === 'document-custom') {
                    promptWithDefaults = await getTablePromptWithDefaults(tableDocumentCustomPrompt);
                } else if (type === 'document-actor') {
                    promptWithDefaults = await getTablePromptWithDefaults(tableDocumentActorPrompt);
                    const actorsList = getWorldActorsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-ACTORS-HERE]').join(actorsList);
                } else if (type === 'document-item') {
                    promptWithDefaults = await getTablePromptWithDefaults(tableDocumentItemPrompt);
                    const itemsList = getWorldItemsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-ITEMS-HERE]').join(itemsList);
                } else if (type === 'compendium-item') {
                    promptWithDefaults = await getTablePromptWithDefaults(tableCompendiumItemPrompt);
                    const compendiumsList = getItemCompendiumsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUMS-HERE]').join(compendiumsList);
                    const compendiumItemsList = await getCompendiumItemsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUM-ITEMS-HERE]').join(compendiumItemsList);
                } else if (type === 'compendium-actor') {
                    promptWithDefaults = await getTablePromptWithDefaults(tableCompendiumActorPrompt);
                    const compendiumsList = getActorCompendiumsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUMS-HERE]').join(compendiumsList);
                    const compendiumActorsList = await getCompendiumActorsList();
                    promptWithDefaults = promptWithDefaults.split('[ADD-COMPENDIUM-ACTORS-HERE]').join(compendiumActorsList);
                }
                copyToClipboard(promptWithDefaults);
            },
            onImport: async (jsonData) => {
                try {
                    const parsed = JSON.parse(jsonData);
                    let tablesToImport = [];
                    if (Array.isArray(parsed)) {
                        tablesToImport = await Promise.all(parsed.map(parseTableToFoundry));
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        tablesToImport = [await parseTableToFoundry(parsed)];
                    } else {
                        throw new Error('JSON must be an array or object');
                    }
                    const created = await RollTable.createDocuments(tablesToImport, { keepId: false });
                    postConsoleAndNotification(
                        MODULE.NAME,
                        `Imported ${created.length} table(s) successfully.`,
                        '',
                        false,
                        true
                    );
                    return true;
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, 'Failed to import tables', e, false, true);
                    return false;
                }
            }
        });
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

    const button = document.createElement('button');
    button.innerHTML = '<i class="fa-solid fa-user-plus"></i> Import';
    button.addEventListener('click', () => {
        void JsonImportWindow.open({
            idSuffix: 'actor',
            windowTitle: 'Import JSON',
            headerTitle: 'Import Actor',
            windowIcon: 'fa-solid fa-user-plus',
            position: { width: 920, height: 680 },
            templateOptions: [{ value: 'npc', label: 'NPC/Monster' }],
            onCopyTemplate: async () => {
                const promptWithDefaults = await getActorPromptWithDefaults(characterPrompt);
                copyToClipboard(promptWithDefaults);
            },
            onImport: async (jsonData) => {
                try {
                    const parsed = JSON.parse(jsonData);
                    let actorsToImport = [];
                    if (Array.isArray(parsed)) {
                        actorsToImport = await Promise.all(parsed.map(parseActorJSONToFoundry));
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        actorsToImport = [await parseActorJSONToFoundry(parsed)];
                    } else {
                        throw new Error('JSON must be an array or object');
                    }
                    const created = await Actor.createDocuments(actorsToImport, { keepId: false });
                    for (let i = 0; i < created.length; i++) {
                        const actor = created[i];
                        const originalData = actorsToImport[i];
                        await compendiumManager.addItemsToActor(actor, originalData);
                    }
                    postConsoleAndNotification(
                        MODULE.NAME,
                        `Imported ${created.length} actor(s) successfully.`,
                        '',
                        false,
                        true
                    );
                    return true;
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, 'Failed to import actors', e, false, true);
                    ui.notifications.error('Failed to import actors: ' + e.message);
                    return false;
                }
            }
        });
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
