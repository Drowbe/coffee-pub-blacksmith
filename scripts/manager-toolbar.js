import { MODULE } from './const.js';
// COFFEEPUB now available globally via window.COFFEEPUB
import { postConsoleAndNotification, getSettingSafely } from './api-common.js';
import { HookManager } from './manager-hooks.js';
// Tool management will be handled directly in this file
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './api-common.js';

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
            postConsoleAndNotification(MODULE.NAME, "Toolbar | Leader check", "Setting not registered yet", true, false);
            return false;
        }
        
        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        const isLeader = !!(leaderData && leaderData.userId && game.user.id === leaderData.userId);
        postConsoleAndNotification(MODULE.NAME, "Toolbar | Leader check", `leaderData: ${JSON.stringify(leaderData)}, userId: ${game.user.id}, isLeader: ${isLeader}`, true, false);
        return isLeader;
    } catch (error) {
        // If setting doesn't exist yet, return false (not an error)
        if (error.message && error.message.includes('not a registered game setting')) {
            postConsoleAndNotification(MODULE.NAME, "Toolbar | Leader check", "Setting not registered (catch)", true, false);
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
 * Get tools organized by zones and ordered
 */
function getVisibleToolsByZones() {
    const visibleTools = getVisibleTools();
    
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
        onClick: () => buildButtonEventRegent('assistant'),
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 10
    });
    
    registerTool('encounter', {
        icon: "fa-solid fa-sword",
                name: "encounter",
                title: "Open Encounter Worksheet",
                button: true,
        visible: true,
        gmOnly: true,
        onClick: () => buildButtonEventRegent('encounter'),
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 20
    });
    
    registerTool('narrative', {
        icon: "fa-solid fa-book-open-reader",
                name: "narrative",
                title: "Open Narrative Worksheet",
                button: true,
        visible: true,
        gmOnly: true,
        onClick: () => buildButtonEventRegent('narrative'),
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 30
    });
    
    registerTool('css', {
        icon: "fa-solid fa-palette",
                name: "css",
        title: "Open CSS Editor",
                button: true,
        visible: true,
        gmOnly: true,
                onClick: () => {
            const cssEditor = new CSSEditor();
            cssEditor.render(true);
        },
        moduleId: 'blacksmith-core',
        zone: 'gmtools',
        order: 10
    });
    
    registerTool('journal-tools', {
                icon: "fa-solid fa-book-open",
                name: "journal-tools",
                title: "Journal Tools",
                button: true,
        visible: true,
        gmOnly: true,
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

            // Add Request Roll tool to the default token toolbar
            const tokenControl = controls.find(control => control.name === "token");
            if (tokenControl) {
                // Check if request-roll tool already exists
                const existingRequestRoll = tokenControl.tools.find(tool => tool.name === "request-roll");
                if (!existingRequestRoll) {
                    // Find the request-roll tool from our registered tools
                    const requestRollTool = registeredTools.get('request-roll');
                    if (requestRollTool) {
                        // Check visibility using the same logic as our toolbar
                        const isGM = game.user.isGM;
                        const isLeaderUser = isLeader();
                        let shouldShow = true;
                        
                        postConsoleAndNotification(MODULE.NAME, "Token Toolbar | Request Roll Check", `isGM: ${isGM}, isLeader: ${isLeaderUser}, gmOnly: ${requestRollTool.gmOnly}, leaderOnly: ${requestRollTool.leaderOnly}`, true, false);
                        
                        if (requestRollTool.gmOnly && !isGM) {
                            shouldShow = false;
                            postConsoleAndNotification(MODULE.NAME, "Token Toolbar | Request Roll Check", "Blocked: GM only tool, user not GM", true, false);
                        } else if (requestRollTool.leaderOnly && !isLeaderUser && !isGM) {
                            shouldShow = false;
                            postConsoleAndNotification(MODULE.NAME, "Token Toolbar | Request Roll Check", "Blocked: Leader only tool, user not leader or GM", true, false);
                        } else if (typeof requestRollTool.visible === 'function') {
                            try {
                                shouldShow = requestRollTool.visible();
                            } catch (error) {
                                shouldShow = false;
                            }
                        } else {
                            shouldShow = requestRollTool.visible;
                        }
                        
                        postConsoleAndNotification(MODULE.NAME, "Token Toolbar | Request Roll Check", `Final decision: shouldShow = ${shouldShow}`, true, false);
                        
                        if (shouldShow) {
                            tokenControl.tools.push({
                                icon: requestRollTool.icon,
                                name: requestRollTool.name,
                                title: requestRollTool.title,
                                button: requestRollTool.button,
                                visible: true,
                                onClick: requestRollTool.onClick
                            });
                        }
                    }
                }
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
                // Refresh the toolbar when party leader changes
                ui.controls.render();
            }
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderSceneControls", "manager-toolbar-scene", true, false);

    
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
