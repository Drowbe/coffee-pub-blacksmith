import { MODULE } from './const.js';
// COFFEEPUB now available globally via window.COFFEEPUB
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { SocketManager } from './manager-sockets.js';
// Tool management will be handled directly in this file
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './api-core.js';

// ================================================================== 
// ===== TOOL MANAGEMENT ===========================================
// ================================================================== 

// Map to store registered tools: toolId -> toolData
const registeredTools = new Map();

/**
 * Check if current user is the party leader
 */
function isLeader() {
    try {
        // Check if the setting is registered first
        if (!game.settings.settings.has(`${MODULE.ID}.partyLeader`)) {
            return false;
        }
        
        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        return !!(leaderData && leaderData.userId && game.user.id === leaderData.userId);
    } catch (error) {
        // If setting doesn't exist yet, return false (not an error)
        if (error.message && error.message.includes('not a registered game setting')) {
            return false;
        }
        postConsoleAndNotification(MODULE.NAME, "Toolbar | Leader check error", error, false, false);
        return false;
    }
}

/**
 * Get tools that should be visible (evaluate visibility conditions)
 */
function getVisibleTools() {
    const isGM = game.user.isGM;
    const isLeaderUser = isLeader();
    
    return Array.from(registeredTools.values()).filter(tool => {
        // Check GM-only visibility
        if (tool.gmOnly && !isGM) {
            return false;
        }
        
        // Check leader-only visibility (GMs can see leader tools too)
        if (tool.leaderOnly && !isLeaderUser && !isGM) {
            return false;
        }
        
        // Check custom visibility function or boolean
        if (typeof tool.visible === 'function') {
            try {
                return tool.visible();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Toolbar Manager: Error evaluating visibility", error, false, false);
                return false;
            }
        }
        return tool.visible;
    });
}

/**
 * Get tools organized by zones and ordered (CoffeePub toolbar only)
 */
function getVisibleToolsByZones() {
    const visibleTools = getVisibleTools().filter(tool => tool.onCoffeePub === true);
    
    // Group tools by zone
    const toolsByZone = {};
    visibleTools.forEach(tool => {
        const zone = tool.zone || 'general';
        if (!toolsByZone[zone]) {
            toolsByZone[zone] = [];
        }
        toolsByZone[zone].push(tool);
    });
    
    // Sort tools within each zone by order
    Object.keys(toolsByZone).forEach(zone => {
        toolsByZone[zone].sort((a, b) => a.order - b.order);
    });
    
    // Define zone order
    const zoneOrder = ['general', 'rolls', 'communication', 'utilities', 'leadertools', 'gmtools'];
    
    // Flatten tools in zone order
    const result = [];
    zoneOrder.forEach(zone => {
        if (toolsByZone[zone]) {
            result.push(...toolsByZone[zone]);
        }
    });
    
    return result;
}

/**
 * Get tools that should appear in FoundryVTT native toolbars
 */
function getFoundryToolbarTools() {
    return getVisibleTools().filter(tool => {
        if (typeof tool.onFoundry === 'function') {
            try {
                return tool.onFoundry();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Toolbar Manager: Error evaluating onFoundry", error, false, false);
                return false;
            }
        }
        return tool.onFoundry === true;
    });
}

/**
 * Register a tool for the toolbar
 */
function registerTool(toolId, toolData) {
    try {
        // Basic validation
        if (!toolId || typeof toolId !== 'string') {
            postConsoleAndNotification(MODULE.NAME, "Toolbar Manager: toolId must be a non-empty string", "", false, false);
            return false;
        }
        
        if (!toolData || typeof toolData !== 'object') {
            postConsoleAndNotification(MODULE.NAME, "Toolbar Manager: toolData must be an object", "", false, false);
            return false;
        }
        
        // Store the tool with defaults
        registeredTools.set(toolId, {
            ...toolData,
            moduleId: toolData.moduleId || 'blacksmith-core',
            zone: toolData.zone || 'general',
            order: toolData.order || 999,
            gmOnly: toolData.gmOnly || false,
            leaderOnly: toolData.leaderOnly || false,
            onCoffeePub: toolData.onCoffeePub !== undefined ? toolData.onCoffeePub : true, // Default to true for backward compatibility
            onFoundry: toolData.onFoundry || false, // Default to false
            registeredAt: Date.now()
        });
        
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Toolbar Manager: Error registering tool", error, false, false);
        return false;
    }
}

/**
 * Register default tools
 */
async function registerDefaultTools() {
    // Import required modules
    const { buildButtonEventRegent } = await import('./blacksmith.js');
    const { CSSEditor } = await import('./window-gmtools.js');
    const { JournalToolsWindow } = await import('./journal-tools.js');
    const { SkillCheckDialog } = await import('./window-skillcheck.js');
    const { VoteConfig } = await import('./vote-config.js');
    
    // Register all the default tools
    registerTool('regent', {
                icon: "fa-solid fa-crystal-ball",
                name: "regent",
                title: "Consult the Regent",
                button: true,
                visible: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: buildButtonEventRegent,
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 10
    });
    
    registerTool('lookup', {
                icon: "fa-solid fa-bolt-lightning",
                name: "lookup",
                title: "Open Lookup Worksheet",
                button: true,
                visible: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => buildButtonEventRegent('lookup'),
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 20
    });
    
    registerTool('character', {
                icon: "fa-solid fa-helmet-battle",
                name: "character",
                title: "Open Character Worksheet",
                button: true,
                visible: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => buildButtonEventRegent('character'),
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 30
    });
    
    registerTool('assistant', {
                icon: "fa-solid fa-hammer-brush",
                name: "assistant",
                title: "Open Assistant Worksheet",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => buildButtonEventRegent('assistant'),
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 10
    });
    
    registerTool('encounter', {
        icon: "fa-solid fa-sword",
                name: "encounter",
                title: "Open Encounter Worksheet",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => buildButtonEventRegent('encounter'),
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 20
    });
    
    registerTool('narrative', {
        icon: "fa-solid fa-book-open-reader",
                name: "narrative",
                title: "Open Narrative Worksheet",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => buildButtonEventRegent('narrative'),
        moduleId: 'blacksmith-core',
        zone: 'utilities',
        order: 30
    });
    
    registerTool('css', {
        icon: "fa-solid fa-palette",
                name: "css",
        title: "Open CSS Editor",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
                onClick: () => {
            const cssEditor = new CSSEditor();
            cssEditor.render(true);
        },
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 10
    });
    
    registerTool('token-replacement', {
        icon: "fa-solid fa-images",
                name: "token-replacement",
        title: "Token Image Replacement",
                button: true,
        visible: () => getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', true),
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: () => getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', false),
                onClick: async () => {
            try {
                const { TokenImageReplacement } = await import('./token-image-replacement.js');
                TokenImageReplacement.openWindow();
            } catch (error) {
                ui.notifications.error('Failed to open Token Image Replacement window');
                postConsoleAndNotification(MODULE.NAME, 'Failed to open Token Image Replacement window', error, false, true);
            }
        },
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 20
    });
    
    registerTool('journal-tools', {
                icon: "fa-solid fa-book-open",
                name: "journal-tools",
                title: "Journal Tools",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
                onClick: () => {
                    const dummyJournal = { id: null, name: "Select Journal" };
                    const journalTools = new JournalToolsWindow(dummyJournal);
                    journalTools.render(true);
        },
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 20
    });
    
    registerTool('refresh', {
                icon: "fa-solid fa-sync-alt",
                name: "refresh",
                title: "Refresh Client",
                button: true,
        visible: true,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
                onClick: () => {
                    window.location.reload();
        },
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 30
    });
    
    registerTool('request-roll', {
        icon: "fa-solid fa-dice",
        name: "request-roll",
        title: "Request a Roll",
        button: true,
        visible: true,
        gmOnly: true, // Only GMs can request rolls
        onCoffeePub: true, // Show in Blacksmith toolbar
        onFoundry: true, // Show in FoundryVTT toolbar
        onClick: () => {
            const dialog = new SkillCheckDialog();
            dialog.render(true);
        },
        moduleId: 'blacksmith-core',
        zone: 'rolls',
        order: 10
    });
    
    registerTool('vote', {
        icon: "fa-solid fa-vote-yea",
        name: "vote",
        title: "Start Vote",
        button: true,
        visible: true,
        leaderOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => {
            new VoteConfig().render(true);
        },
        moduleId: 'blacksmith-core',
        zone: 'leadertools',
        order: 10
    });
}

export function addToolbarButton() {
    // Initialize default tools
    registerDefaultTools();

    // Debounce timer for divider updates
    let dividerUpdateTimer = null;
    
    // Flag to prevent infinite loops
    let isUpdatingDividers = false;

    /**
     * Count how many dividers should exist based on zone changes
     * @private
     */
    function _countExpectedDividers(visibleTools) {
        let dividerCount = 0;
        let currentZone = null;
        
        visibleTools.forEach(tool => {
            if (currentZone !== null && currentZone !== tool.zone) {
                dividerCount++;
            }
            currentZone = tool.zone || 'general';
        });
        
        return dividerCount;
    }

    /**
     * Get the display title for a zone
     * @private
     */
    function _getZoneTitle(zone) {
        const zoneTitles = {
            'general': 'gen',
            'rolls': 'rolls',
            'communication': 'comms',
            'utilities': 'utils',
            'leadertools': 'leader',
            'gmtools': 'gm'
        };
        return zoneTitles[zone] || 'General';
    }

    /**
     * Apply zone classes to toolbar tools after they're rendered
     * @private
     */
    function _applyZoneClasses() {
        // Wait a bit for the toolbar to be fully rendered
        setTimeout(() => {
            const toolbar = document.querySelector('#tools-panel-blacksmith-utilities');
            if (!toolbar) return;
            
            // Get the tools in order
            const visibleTools = getVisibleToolsByZones();
            
            // Always clear existing dividers and titles, then recreate them (simple approach)
            const existingDividers = toolbar.querySelectorAll('.toolbar-zone-divider');
            const existingTitles = toolbar.querySelectorAll('.toolbar-zone-title');
            existingDividers.forEach(divider => divider.remove());
            existingTitles.forEach(title => title.remove());
            
            // Apply zone classes and inject dividers
            let currentZone = null;
            visibleTools.forEach((tool, index) => {
                const toolElement = toolbar.querySelector(`[data-tool="${tool.name}"]`);
                if (toolElement) {
                    const zoneClass = `toolbar-zone-${tool.zone || 'general'}`;
                    toolElement.classList.add(zoneClass);
                    
                    // Check if we need to add a divider and title (zone change)
                    if (currentZone !== null && currentZone !== tool.zone) {
                        // Get settings
                        const showDividers = getSettingSafely(MODULE.ID, 'toolbarShowDividers', true);
                        const showLabels = getSettingSafely(MODULE.ID, 'toolbarShowLabels', false);
                        
                        // Create divider element if enabled
                        if (showDividers) {
                            const divider = document.createElement('div');
                            divider.className = 'toolbar-zone-divider';
                            divider.setAttribute('data-zone', tool.zone || 'general');
                            toolElement.parentNode.insertBefore(divider, toolElement);
                        }
                        
                        // Create title element if enabled
                        if (showLabels) {
                            const title = document.createElement('div');
                            title.className = 'toolbar-zone-title';
                            title.setAttribute('data-zone', tool.zone || 'general');
                            title.textContent = _getZoneTitle(tool.zone || 'general');
                            toolElement.parentNode.insertBefore(title, toolElement);
                        }
                    }
                    
                    currentZone = tool.zone || 'general';
                }
            });
            
            // postConsoleAndNotification(MODULE.NAME, `Toolbar | Applied zone classes and dividers to ${visibleTools.length} tools`, "", true, false);
        }, 50); // Very short delay to ensure toolbar is rendered
    }

    const getSceneControlButtonsHookId = HookManager.registerHook({
		name: 'getSceneControlButtons',
		description: 'Manager Toolbar: Add click handler to blacksmith utilities button and token toolbar',
		context: 'manager-toolbar-scene',
		priority: 3,
		callback: (controls) => {
			// --- BEGIN - HOOKMANAGER CALLBACK ---

            // Get all visible tools, organized by zones
            const visibleTools = getVisibleToolsByZones();
            
            // Remove existing blacksmith toolbar if it exists
            const existingIndex = controls.findIndex(control => control.name === "blacksmith-utilities");
            if (existingIndex !== -1) {
                controls.splice(existingIndex, 1);
            }
            
            // Convert to the format expected by FoundryVTT
            const tools = visibleTools.map(tool => ({
                icon: tool.icon,
                name: tool.name,
                title: tool.title,
                button: tool.button,
                visible: true, // Visibility is already filtered by getVisibleTools()
                onClick: tool.onClick
            }));

            controls.push({
                name: "blacksmith-utilities",
                title: "Blacksmith Utilities",
                icon: "fa-solid fa-mug-hot",
                layer: "blacksmith-utilities-layer", // Ensure this matches the registration key
                tools: tools
            });

            // Add tools to FoundryVTT native toolbars
            const foundryTools = getFoundryToolbarTools();
            
            // Add tools to token toolbar (default behavior for now)
            const tokenControl = controls.find(control => control.name === "token");
            if (tokenControl && foundryTools.length > 0) {
                foundryTools.forEach(tool => {
                    // Check if tool already exists
                    const existingTool = tokenControl.tools.find(existing => existing.name === tool.name);
                    if (!existingTool) {
                        // Check visibility using the same logic as our toolbar
                        const isGM = game.user.isGM;
                        const isLeaderUser = isLeader();
                        let shouldShow = true;
                        
                        if (tool.gmOnly && !isGM) {
                            shouldShow = false;
                        } else if (tool.leaderOnly && !isLeaderUser && !isGM) {
                            shouldShow = false;
                        } else if (typeof tool.visible === 'function') {
                            try {
                                shouldShow = tool.visible();
                            } catch (error) {
                                shouldShow = false;
                            }
                        } else {
                            shouldShow = tool.visible;
                        }
                        
                        if (shouldShow) {
                            tokenControl.tools.push({
                                icon: tool.icon,
                                name: tool.name,
                                title: tool.title,
                                button: tool.button,
                                visible: true,
                                onClick: tool.onClick
                            });
                        }
                    }
                });
            }
            // --- END - HOOKMANAGER CALLBACK ---
        }
	});

    // Register renderSceneControls hook
    const renderSceneControlsHookId = HookManager.registerHook({
        name: 'renderSceneControls',
        description: 'Manager Toolbar: Add click handler and reapply styling when toolbar is rendered',
        context: 'manager-toolbar-scene',
        priority: 3, // Normal priority - UI enhancement
        callback: () => {
            const button = document.querySelector(`[data-control="blacksmith-utilities"]`);
            if (button) {
                button.addEventListener('click', () => {
                    toggleToolbarVisibility();
                    //activateBlacksmithLayer(); // Ensure this function is called
                });
            } else {
                postConsoleAndNotification(MODULE.NAME, "Toolbar button not found", "", false, false);
            }

            // Reapply styling when toolbar is rendered (handles click away/back)
            _applyZoneClasses();
        }
    });

    // Register ready hook for zone classes and dividers
    const readyHookId = HookManager.registerHook({
        name: 'ready',
        description: 'Manager Toolbar: Apply zone classes and dividers when UI is ready',
        context: 'manager-toolbar-ready',
        priority: 3,
        callback: () => {
            postConsoleAndNotification(MODULE.NAME, "Toolbar | Ready hook called", "Applying zone classes and refreshing toolbar", true, false);
            
            // Apply zone classes to toolbar tools
            _applyZoneClasses();
            
            // Also refresh the toolbar after a short delay to ensure all settings are loaded
            setTimeout(() => {
                postConsoleAndNotification(MODULE.NAME, "Toolbar | Delayed refresh", "Refreshing toolbar after delay", true, false);
                // Force re-run the getSceneControlButtons hook to rebuild toolbar with current leader status
                Hooks.callAll('getSceneControlButtons', ui.controls.controls);
                ui.controls.render();
            }, 100);
        }
    });

    // Register setting change hook to refresh toolbar when party leader changes
    const settingChangeHookId = HookManager.registerHook({
        name: 'settingChange',
        description: 'Manager Toolbar: Refresh toolbar when party leader changes',
        context: 'manager-toolbar-setting',
        priority: 3,
        callback: (module, key, value) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (module === MODULE.ID && key === 'partyLeader') {
                // Refresh all toolbars when party leader changes
                postConsoleAndNotification(MODULE.NAME, "Toolbar | Leader change detected", "Refreshing all toolbars for leader change", true, false);
                
                // Clear active tool if it's a leader tool that might be removed
                const activeTool = ui.controls.activeTool;
                if (activeTool && registeredTools.has(activeTool)) {
                    const tool = registeredTools.get(activeTool);
                    if (tool.leaderOnly && !game.user.isGM) {
                        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                        const isLeader = leaderData?.userId === game.user.id;
                        if (!isLeader) {
                            // Clear the active tool since it's being removed
                            ui.controls.activeTool = null;
                        }
                    }
                }
                
                // Rebuild the controls list (fires getSceneControlButtons for all tools)
                ui.controls.initialize();
                
                // Re-render the toolbar
                ui.controls.render(true);
            }
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });

    // Register custom hook to refresh toolbar when leader changes via socket
    const leaderChangeHookId = HookManager.registerHook({
        name: 'blacksmith.leaderChanged',
        description: 'Manager Toolbar: Refresh toolbar when leader changes via socket',
        context: 'manager-toolbar-leader-change',
        priority: 3,
        callback: (leaderData) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            postConsoleAndNotification(MODULE.NAME, "Toolbar | Socket leader change detected", "Refreshing toolbar from socket", true, false);
            
            // Clear active tool if it's a leader tool that might be removed
            const activeTool = ui.controls.activeTool;
            if (activeTool && registeredTools.has(activeTool)) {
                const tool = registeredTools.get(activeTool);
                if (tool.leaderOnly && !game.user.isGM) {
                    const isLeader = leaderData?.userId === game.user.id;
                    if (!isLeader) {
                        // Clear the active tool since it's being removed
                        ui.controls.activeTool = null;
                    }
                }
            }
            
            // Rebuild the controls list (fires getSceneControlButtons for all tools)
            ui.controls.initialize();
            
            // Re-render the toolbar
            ui.controls.render(true);
            // --- END - HOOKMANAGER CALLBACK ---
        },
        key: 'manager-toolbar-leader-change',
        options: {}
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderSceneControls", "manager-toolbar-scene", true, false);

    
}


// ================================================================== 
// ===== TOOLBAR API FOR EXTERNAL MODULES ==========================
// ================================================================== 

/**
 * Register a tool for the Blacksmith toolbar
 * @param {string} toolId - Unique identifier for the tool
 * @param {Object} toolData - Tool configuration object
 * @returns {boolean} Success status
 */
export function registerToolbarTool(toolId, toolData) {
    return registerTool(toolId, toolData);
}

/**
 * Unregister a tool from the Blacksmith toolbar
 * @param {string} toolId - Unique identifier for the tool
 * @returns {boolean} Success status
 */
export function unregisterToolbarTool(toolId) {
    try {
        if (registeredTools.has(toolId)) {
            registeredTools.delete(toolId);
            // Refresh the toolbar to reflect changes
            ui.controls.render();
            return true;
        }
        return false;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Toolbar API: Error unregistering tool", error, false, false);
        return false;
    }
}

/**
 * Get all registered tools
 * @returns {Map} Map of all registered tools
 */
export function getRegisteredTools() {
    return new Map(registeredTools);
}

/**
 * Get tools by module ID
 * @param {string} moduleId - Module identifier
 * @returns {Array} Array of tools registered by the module
 */
export function getToolsByModule(moduleId) {
    return Array.from(registeredTools.values()).filter(tool => tool.moduleId === moduleId);
}

/**
 * Check if a tool is registered
 * @param {string} toolId - Unique identifier for the tool
 * @returns {boolean} Whether the tool is registered
 */
export function isToolRegistered(toolId) {
    return registeredTools.has(toolId);
}

/**
 * Get toolbar settings
 * @returns {Object} Current toolbar settings
 */
export function getToolbarSettings() {
    return {
        showDividers: game.settings.get(MODULE.ID, 'toolbarShowDividers'),
        showLabels: game.settings.get(MODULE.ID, 'toolbarShowLabels')
    };
}

/**
 * Set toolbar settings
 * @param {Object} settings - Settings object
 * @param {boolean} settings.showDividers - Whether to show toolbar dividers
 * @param {boolean} settings.showLabels - Whether to show toolbar labels
 */
export function setToolbarSettings(settings) {
    if (settings.showDividers !== undefined) {
        game.settings.set(MODULE.ID, 'toolbarShowDividers', settings.showDividers);
    }
    if (settings.showLabels !== undefined) {
        game.settings.set(MODULE.ID, 'toolbarShowLabels', settings.showLabels);
    }
    // Refresh toolbar to apply changes
    ui.controls.render();
}

// Function to toggle the "active" class
function toggleToolbarVisibility() {


    // Hide all toolbars first
    const allToolbars = document.querySelectorAll('.sub-controls.app.control-tools');
    allToolbars.forEach(toolbar => {
        toolbar.classList.remove('active');
    });

    // Show the selected toolbar
    const toolbar = document.querySelector('#tools-panel-blacksmith-utilities'); // Use the actual ID
    if (toolbar) {
        toolbar.classList.toggle('active');

    } else {
        postConsoleAndNotification(MODULE.NAME, "Toolbar element not found", "", false, false);
    }

    // Set the Blacksmith button as active
    const allButtons = document.querySelectorAll('.scene-control');
    allButtons.forEach(button => {
        button.classList.remove('active');
    });

    const blacksmithButton = document.querySelector(`[data-control="blacksmith-utilities"]`);
    if (blacksmithButton) {
        blacksmithButton.classList.add('active');

    } else {
        postConsoleAndNotification(MODULE.NAME, "Blacksmith button not found", "", false, false);
    }
}

// Function to activate the Blacksmith layer
function activateBlacksmithLayer() {

    const layer = canvas['blacksmith-utilities-layer'];
    if (layer) {
        layer.activate();
    } else {
        postConsoleAndNotification(MODULE.NAME, "Blacksmith Layer not found", "", false, false);
    }
}
