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
                const v = tool.visible();
                if (!v) {
                    console.warn('Coffee Pub Toolbar: TOOL NOT VISIBLE (fn returned false)', {
                        name: tool.name,
                        moduleId: tool.moduleId,
                        zone: tool.zone
                    });
                }
                return v;
            } catch (error) {
                console.warn('Coffee Pub Toolbar: TOOL NOT VISIBLE (fn threw)', {
                    name: tool.name,
                    moduleId: tool.moduleId,
                    zone: tool.zone
                }, error);
                postConsoleAndNotification(MODULE.NAME, "Coffee Pub Toolbar: Error evaluating visibility", error, false, false);
                return false;
            }
        }
        
        return tool.visible;
    });
}

/**
 * Check if a tool should appear on CoffeePub toolbar
 * Supports boolean or function (like onFoundry)
 * @private
 */
function isOnCoffeePub(tool) {
    if (typeof tool.onCoffeePub === 'function') {
        try {
            return !!tool.onCoffeePub();
        } catch (error) {
            return false;
        }
    }
    return tool.onCoffeePub === true;
}

/**
 * Get tools organized by zones and ordered (CoffeePub toolbar only)
 */
function getVisibleToolsByZones() {
    const visibleTools = getVisibleTools().filter(isOnCoffeePub);
    
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
 * Note: This checks onFoundry() directly and only filters by gmOnly/leaderOnly
 * It does NOT check tool.visible() because that's for CoffeePub toolbar visibility
 */
function getFoundryToolbarTools() {
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
        
        // Check onFoundry (this controls Foundry toolbar visibility)
        if (typeof tool.onFoundry === 'function') {
            try {
                return tool.onFoundry();
            } catch (error) {
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
            return false;
        }
        
        if (!toolData || typeof toolData !== 'object') {
            return false;
        }
        
        // Store the tool with defaults
        // CRITICAL: Default name to toolId if not provided - external modules may forget to set it
        // CRITICAL: Default button to true - v13 requires explicit button: true for button tools
        const storedTool = {
            ...toolData,
            name: toolData.name || toolId, // Default name to toolId for external modules
            title: toolData.title || toolData.name || toolId, // Add fallback for title
            icon: toolData.icon || "fa-solid fa-square-question", // Add fallback for icon
            button: toolData.button ?? true, // CRITICAL: Default to true for button tools (v13 requirement)
            toggle: toolData.toggle ?? false, // Explicitly set toggle to false
            moduleId: toolData.moduleId || 'blacksmith-core',
            zone: toolData.zone || 'general',
            order: toolData.order || 999,
            gmOnly: toolData.gmOnly || false,
            leaderOnly: toolData.leaderOnly || false,
            visible: toolData.visible !== undefined ? toolData.visible : true, // Default to true if not provided
            onCoffeePub: toolData.onCoffeePub !== undefined ? toolData.onCoffeePub : true, // Default to true for backward compatibility
            onFoundry: toolData.onFoundry !== undefined ? toolData.onFoundry : false, // Preserve function if provided, default to false
            registeredAt: Date.now()
        };
        
        registeredTools.set(toolId, storedTool);
        
        return true;
    } catch (error) {
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
        onFoundry: () => {
            // Check if setting exists and return its value
            const settingKey = `${MODULE.ID}.tokenImageReplacementShowInFoundryToolbar`;
            try {
                if (game?.settings?.settings?.has(settingKey)) {
                    return game.settings.get(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar');
                }
                return false;
            } catch (error) {
                return false;
            }
        },
                onClick: async () => {
            try {
                const { TokenImageReplacementWindow } = await import('./token-image-replacement.js');
                TokenImageReplacementWindow.openWindow();
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

/**
 * Deep clone an object (for cloning controls structure)
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const cloned = {};
        Object.keys(obj).forEach(key => {
            cloned[key] = deepClone(obj[key]);
        });
        return cloned;
    }
    return obj;
}

/**
 * Safely get active tool name (wraps getter that can throw during early init)
 * @private
 */
function safeActiveToolName() {
    try {
        return ui?.controls?.tool?.name ?? null;
    } catch (e) {
        return null;
    }
}

/**
 * Safely get active control name (wraps getter that can throw during early init)
 * @private
 */
function safeActiveControlName() {
    try {
        return ui?.controls?.control?.name ?? null;
    } catch (e) {
        return null;
    }
}

/**
 * Debounced render request to prevent render loops
 * Triggers Foundry to re-prepare controls (which re-runs getSceneControlButtons)
 * @private
 */
let _renderQueued = false;
function requestControlsRender() {
    if (_renderQueued) return;
    _renderQueued = true;
    
    queueMicrotask(() => {
        _renderQueued = false;
        refreshSceneControls();
    });
}

/**
 * Refresh the SceneControls by triggering Foundry to re-prepare controls
 * v13: Use reset: true to trigger Foundry to rebuild controls and re-run getSceneControlButtons
 * This is the only way to make newly registered tools appear in the DOM
 */
function refreshSceneControls() {
    if (!ui?.controls) return false;
    
    // Scene controls are GM-only
    if (!game.user.isGM) return false;
    
    // If controls haven't rendered yet, don't poke it
    if (!ui.controls.rendered) return false;
    
    const activeControl = safeActiveControlName();
    const activeTool = safeActiveToolName();
    
    // v13: reset=true triggers Foundry to rebuild controls and call getSceneControlButtons again
    // This is the only way to make newly registered tools appear in the DOM
    try {
        ui.controls.render({
            reset: true,
            control: activeControl ?? undefined,
            tool: activeTool ?? undefined
        });
        return true;
    } catch (e) {
        console.warn(`${MODULE.NAME} | refreshSceneControls failed`, e);
        return false;
    }
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
 * Bind click handler once to an element (prevents duplicate bindings on re-render)
 * @private
 */
function bindOnce(el, event, handler, key = 'cpbBound') {
    if (el.dataset[key]) return;
    el.addEventListener(event, handler);
    el.dataset[key] = '1';
}

/**
 * Wire real click handlers to our tools after the toolbar is rendered.
 * This bypasses the v13 onClick shim entirely.
 * @param {HTMLElement|jQuery} html - The HTML root from renderSceneControls hook
 * @private
 */
function _wireToolClicks(html) {
    // v13: Use html root from renderSceneControls, not document.querySelector
    const root = html?.[0] ?? html;
    if (!root) return;
    
    // Find the toolbar container
    const toolbar = root.querySelector('#scene-controls-tools');
    if (!toolbar) return;

    const visibleTools = getVisibleToolsByZones();

    for (const tool of visibleTools) {
        // Only wire up "button" tools that actually have an onClick callback
        if (!tool.button || typeof tool.onClick !== 'function') continue;

        // v13: Foundry renders tools as button[data-tool] inside #scene-controls-tools
        const buttons = toolbar.querySelectorAll(`button[data-tool="${tool.name}"]`);
        if (!buttons.length) continue;

        buttons.forEach(btn => {
            // Remove any previous handler we attached
            if (btn._blacksmithClickHandler) {
                btn.removeEventListener('click', btn._blacksmithClickHandler);
                delete btn._blacksmithClickHandler;
            }

            const handler = event => {
                // Only respond to real user left clicks
                if (!event.isTrusted || event.button !== 0) return;

                // Keep Foundry from interpreting this as a toggle change
                event.preventDefault();
                event.stopPropagation();

                try {
                    tool.onClick(event);
                } catch (error) {
                    postConsoleAndNotification(
                        MODULE.NAME,
                        `Toolbar: Error in tool onClick for ${tool.name}`,
                        error,
                        false,
                        false
                    );
                }

                // Optional: blur so the button does not look "stuck" active
                btn.blur();
            };

            btn._blacksmithClickHandler = handler;
            // Use bindOnce to prevent duplicate bindings on re-render
            bindOnce(btn, 'click', handler, 'cpbClickBound');
        });
    }
}

/**
 * Wire click handlers for Foundry toolbar tools
 * @param {HTMLElement|jQuery} html - The HTML root from renderSceneControls hook
 * @private
 */
function _wireFoundryToolClicks(html) {
    // v13: Use html root from renderSceneControls, not document.querySelector
    const root = html?.[0] ?? html;
    if (!root) return;
    
    // Get all tools that should be in Foundry toolbar
    const foundryTools = getFoundryToolbarTools();
    
    // Wire click handlers for each Foundry toolbar tool
    foundryTools.forEach(tool => {
        if (!tool.button || typeof tool.onClick !== 'function') return;
        
        // v13-friendly: Try data-tool and data-action attributes within root
        let buttons = root.querySelectorAll(`[data-tool="${tool.name}"]`);
        if (buttons.length === 0) {
            buttons = root.querySelectorAll(`[data-action="${tool.name}"]`);
        }
        if (buttons.length === 0) {
            buttons = root.querySelectorAll(`[data-name="${tool.name}"]`);
        }
        
        buttons.forEach(btn => {
            // Remove any previous handler we attached
            if (btn._blacksmithFoundryClickHandler) {
                btn.removeEventListener('click', btn._blacksmithFoundryClickHandler);
                delete btn._blacksmithFoundryClickHandler;
            }
            
            const handler = event => {
                // Only respond to real user left clicks
                if (!event.isTrusted || event.button !== 0) return;
                
                // Keep Foundry from interpreting this as a toggle change
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    tool.onClick(event);
                } catch (error) {
                    postConsoleAndNotification(
                        MODULE.NAME,
                        `Toolbar: Error in Foundry toolbar tool onClick for ${tool.name}`,
                        error,
                        false,
                        false
                    );
                }
                
                // Optional: blur so the button does not look "stuck" active
                btn.blur();
            };
            
            btn._blacksmithFoundryClickHandler = handler;
            // Use bindOnce to prevent duplicate bindings on re-render
            bindOnce(btn, 'click', handler, 'cpbFoundryClickBound');
        });
    });
}

/**
 * Apply zone classes to toolbar tools after they're rendered
 * @param {HTMLElement|jQuery} html - The HTML root from renderSceneControls hook
 * @private
 */
function _applyZoneClasses(html) {
    // v13: Use html root from renderSceneControls, not document.querySelector
    const root = html?.[0] ?? html;
    if (!root) return;
    
    // Only apply zone classes when blacksmith-utilities control is active
    // This prevents "Tools not found" spam when other controls (Tokens, etc.) are active
    const activeControlName = safeActiveControlName();
    if (activeControlName !== "blacksmith-utilities") {
        return;
    }
    
    // Find the toolbar container - v13 uses #scene-controls-tools
    const toolbar = root.querySelector('#scene-controls-tools');
    if (!toolbar) {
        console.warn('Coffee Pub Toolbar: Toolbar container #scene-controls-tools not found in DOM');
        return;
    }
    
    // v13: Find all tool buttons - Foundry renders them as button[data-tool] or button.tool[data-tool]
    const allToolElements = toolbar.querySelectorAll('button[data-tool]');
    
    // Diagnostic: Log what Foundry actually rendered
    const domToolList = [...allToolElements].map(el => el.dataset.tool).filter(Boolean);
    console.warn('Coffee Pub Toolbar: DOM tool list (what Foundry rendered):', domToolList);
    
    // Get the tools in order
    const visibleTools = getVisibleToolsByZones();
    const expectedToolNames = visibleTools.map(t => t.name);
    console.warn('Coffee Pub Toolbar: Expected tool names:', expectedToolNames);
    
    // Always clear existing dividers and titles, then recreate them (simple approach)
    const existingDividers = toolbar.querySelectorAll('.toolbar-zone-divider');
    const existingTitles = toolbar.querySelectorAll('.toolbar-zone-title');
    existingDividers.forEach(divider => divider.remove());
    existingTitles.forEach(title => title.remove());
    
    // Apply zone classes and inject dividers
    let currentZone = null;
    const showDividers = getSettingSafely(MODULE.ID, 'toolbarShowDividers', true);
    const showLabels = getSettingSafely(MODULE.ID, 'toolbarShowLabels', false);
    const toolsFound = [];
    const toolsNotFound = [];
    
    visibleTools.forEach((tool, index) => {
        // v13: Find tool by data-tool attribute within the toolbar container
        const toolElement = toolbar.querySelector(`button[data-tool="${tool.name}"]`);
        const toolZone = tool.zone || 'general';
        
        if (toolElement) {
            toolsFound.push(tool.name);
            const zoneClass = `toolbar-zone-${toolZone}`;
            toolElement.classList.add(zoneClass);
            
            // Get the list item for inserting dividers/labels
            // v13: Tools are buttons inside <li> elements within a <menu>
            const listItem = toolElement.closest('li');
            
            // Check if we need to add a divider and title (zone change OR first tool)
            const isZoneChange = currentZone !== null && currentZone !== toolZone;
            const isFirstTool = currentZone === null;
            
            if ((isZoneChange || isFirstTool) && listItem && listItem.parentNode) {
                // Create divider element if enabled
                if (showDividers && isZoneChange) {
                    const divider = document.createElement('li');
                    divider.className = 'toolbar-zone-divider';
                    divider.setAttribute('data-zone', toolZone);
                    listItem.parentNode.insertBefore(divider, listItem);
                }
                
                // Create title element if enabled
                if (showLabels) {
                    const title = document.createElement('li');
                    title.className = 'toolbar-zone-title';
                    title.setAttribute('data-zone', toolZone);
                    const titleText = document.createElement('span');
                    titleText.textContent = _getZoneTitle(toolZone);
                    title.appendChild(titleText);
                    listItem.parentNode.insertBefore(title, listItem);
                }
            }
            
            currentZone = toolZone;
        } else {
            toolsNotFound.push({ name: tool.name, zone: toolZone, moduleId: tool.moduleId });
        }
    });
    
    // Log tools not found in DOM for debugging (only once, no retries to avoid spam)
    if (toolsNotFound.length > 0) {
        console.warn('Coffee Pub Toolbar: Tools not found in DOM', {
            notFoundCount: toolsNotFound.length,
            notFoundTools: toolsNotFound,
            foundCount: toolsFound.length,
            domToolList: domToolList,
            expectedToolNames: expectedToolNames
        });
    }
}

export async function addToolbarButton() {
    // Initialize default tools
    await registerDefaultTools();

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

    const getSceneControlButtonsHookId = HookManager.registerHook({
		name: 'getSceneControlButtons',
		description: 'Manager Toolbar: Add click handler to blacksmith utilities button and token toolbar',
		context: 'manager-toolbar-scene',
		priority: 3,
		callback: (controls) => {
			// --- BEGIN - HOOKMANAGER CALLBACK ---

            // v13: Get active control and tool - do NOT use game.activeTool/activeControl here
            // as they can crash during early initialization. Safely access ui.controls with try-catch
            // because the getter can throw during early init when internal properties don't exist yet
            let activeControl = null;
            let activeTool = null;
            try {
                activeControl = ui?.controls?.control?.name ?? null;
                activeTool = ui?.controls?.tool?.name ?? null;
            } catch (e) {
                // During early initialization, ui.controls.control getter may throw
                // when trying to access internal properties that don't exist yet
                // Just use null values - the hook will work fine without them
                activeControl = null;
                activeTool = null;
            }

            // Debug: Log toolbar state before building tools
            debugToolbarState('inside getSceneControlButtons');
            
            // Get all visible tools, organized by zones
            const visibleTools = getVisibleToolsByZones();
            
            // Debug: Log tool registration status
            const totalRegistered = registeredTools.size;
            const allVisible = getVisibleTools();
            
            // Debug: Check onCoffeePub for external modules
            const externalTools = allVisible.filter(t => t.moduleId && t.moduleId !== 'blacksmith-core');
            const externalToolsWithOnCoffeePub = externalTools.map(t => ({
                name: t.name,
                moduleId: t.moduleId,
                onCoffeePub: t.onCoffeePub,
                onCoffeePubType: typeof t.onCoffeePub,
                willPassFilter: isOnCoffeePub(t),
                visible: typeof t.visible === 'function' ? 'fn' : t.visible
            }));
            
            postConsoleAndNotification(MODULE.NAME, "Coffee Pub Toolbar: Building toolbar", {
                totalRegistered,
                visibleCount: allVisible.length,
                coffeePubCount: visibleTools.length,
                toolNames: visibleTools.map(t => t.name),
                externalToolsCount: externalTools.length,
                externalToolsWithOnCoffeePub: externalToolsWithOnCoffeePub
            }, true, false);
            
            // Convert to the format expected by FoundryVTT v13 (tools as object keyed by name)
            // IMPORTANT: Do NOT define onClick on SceneControlTool - v13 has a compatibility shim
            // that automatically calls onClick from inside onChange, which causes auto-activation issues
            // Instead, only use onChange and check if the event actually came from the tool element
            const tools = {};
            visibleTools.forEach((tool, index) => {
                tools[tool.name] = {
                    icon: tool.icon || "fa-solid fa-square-question",
                    name: tool.name,
                    title: tool.title || tool.name,
                    button: tool.button === true, // CRITICAL: Force to boolean - v13 requires explicit true for button tools
                    toggle: false, // Explicitly set toggle to false to keep them out of toggle-mode
                    visible: true, // Visibility is already filtered by getVisibleTools()
                    // v13 requires onChange but we keep it as a no-op (or light debug only)
                    // All real behavior is driven by _wireToolClicks DOM handlers
                    onChange: (_event, _active) => {
                        // No-op: onChange never calls tool.onClick anymore
                        // Optional: keep a light debug if you want to see activations
                        // postConsoleAndNotification(MODULE.NAME, `Toolbar onChange (noop): ${tool.name}`, "", true, false);
                    },
                    order: index
                };
            });
            
            // Debug: Log tool keys (no DOM access in getSceneControlButtons)
            console.warn('Coffee Pub Toolbar: BLACKSMITH TOOL KEYS:', Object.keys(tools));

            // Update or create blacksmith utilities control (v13: controls is an object keyed by control name)
            // v13 requires: activeTool must point to a valid tool key, and all tools need onChange handlers
            if (controls['blacksmith-utilities']) {
                const existingControl = controls['blacksmith-utilities'];
                const existingTools = existingControl.tools || {};
                
                // Get currently active tool name to preserve it
                // v13: Don't access ui.controls here - it may not be ready during getSceneControlButtons
                // We'll preserve the active tool from existingControl if it exists
                const existingControlActiveTool = existingControl.activeTool;
                const isOurControlActive = existingControlActiveTool && existingControl.tools[existingControlActiveTool];
                const activeToolName = isOurControlActive ? activeTool : null;
                
                // Remove tools that are no longer visible, BUT preserve the active tool
                // This prevents Foundry from trying to call onChange on an undefined tool
                Object.keys(existingTools).forEach(toolName => {
                    if (!tools[toolName] && toolName !== existingControlActiveTool) {
                        delete existingTools[toolName];
                    }
                });
                
                // If the active tool is being removed, ensure it has a valid onChange handler
                // This prevents errors when Foundry tries to deactivate it
                if (existingControlActiveTool && !tools[existingControlActiveTool] && existingTools[existingControlActiveTool]) {
                    // Keep the tool but mark it as not visible and ensure it has onChange
                    existingTools[existingControlActiveTool].visible = false;
                    if (!existingTools[existingControlActiveTool].onChange) {
                        existingTools[existingControlActiveTool].onChange = () => {
                            // Handle deactivation gracefully
                        };
                    }
                }
                
                // v13: Create a new tools object instead of modifying in place
                // This ensures Foundry detects the change and re-renders the control
                const newTools = {};
                
                // Debug: Log what tools we're working with
                const toolsFromVisibleTools = Object.keys(tools);
                const existingToolNames = Object.keys(existingTools);
                postConsoleAndNotification(MODULE.NAME, "Coffee Pub Toolbar: Building newTools", {
                    toolsFromVisibleTools: toolsFromVisibleTools,
                    existingToolNames: existingToolNames,
                    existingControlActiveTool: existingControlActiveTool
                }, true, false);
                
                // First, copy existing tools that should be preserved (e.g., active tool being removed)
                Object.keys(existingTools).forEach(toolName => {
                    // Only preserve tools that are in the new tools list OR are the active tool
                    if (tools[toolName] || toolName === existingControlActiveTool) {
                        if (tools[toolName]) {
                            // Tool exists in new list - create new tool object
                            newTools[toolName] = {
                                icon: tools[toolName].icon || "fa-solid fa-square-question",
                                name: tools[toolName].name,
                                title: tools[toolName].title || tools[toolName].name,
                                button: tools[toolName].button === true, // Force to boolean
                                toggle: false, // Explicitly set toggle to false
                                visible: tools[toolName].visible,
                                onChange: tools[toolName].onChange,
                                order: tools[toolName].order
                            };
                            // Explicitly ensure onClick is not present
                            if (newTools[toolName].onClick) {
                                delete newTools[toolName].onClick;
                            }
                        } else {
                            // Tool is being removed but is active - keep it but mark as not visible
                            newTools[toolName] = {
                                ...existingTools[toolName],
                                visible: false
                            };
                            if (!newTools[toolName].onChange) {
                                newTools[toolName].onChange = () => {
                                    // Handle deactivation gracefully
                                };
                            }
                        }
                    }
                });
                
                // Add any new tools that weren't in existingTools
                Object.keys(tools).forEach(toolName => {
                    if (!newTools[toolName]) {
                        newTools[toolName] = {
                            icon: tools[toolName].icon || "fa-solid fa-square-question",
                            name: tools[toolName].name,
                            title: tools[toolName].title || tools[toolName].name,
                            button: tools[toolName].button === true, // Force to boolean
                            toggle: false, // Explicitly set toggle to false
                            visible: tools[toolName].visible,
                            onChange: tools[toolName].onChange,
                            order: tools[toolName].order
                        };
                        // Explicitly ensure onClick is not present
                        if (newTools[toolName].onClick) {
                            delete newTools[toolName].onClick;
                        }
                    }
                });
                
                // Debug: Log final newTools
                const finalToolNames = Object.keys(newTools);
                postConsoleAndNotification(MODULE.NAME, "Coffee Pub Toolbar: Final newTools", {
                    finalToolNames: finalToolNames,
                    newToolsCount: finalToolNames.length,
                    toolsCount: toolsFromVisibleTools.length
                }, true, false);
                
                // Replace the entire tools object to trigger v13 change detection
                existingControl.tools = newTools;
                
                // v13 requirement: activeTool must point to a valid tool key (cannot be empty string)
                // Even if all tools are buttons, we must set activeTool to a valid tool key
                // We'll prevent auto-activation by ensuring the tool's onChange doesn't trigger onClick
                const toolKeys = Object.keys(newTools);
                if (!existingControl.activeTool || !newTools[existingControl.activeTool]) {
                    // Set to first available tool (must be a valid key, even if it's a button)
                    existingControl.activeTool = toolKeys.length > 0 ? toolKeys[0] : "";
                }
                // Note: We can't use empty string as activeTool - it must be a valid tool key
                // Button tools won't auto-activate if their onChange handler doesn't call onClick
                
                // v13 requirement: control needs onChange handler
                existingControl.onChange = (event, active) => {
                    // Handle control activation/deactivation
                    // This prevents errors when switching between toolbars
                };
                
                // v13 requirement: control needs onToolChange handler
                existingControl.onToolChange = (event, tool) => {
                    // Handle tool change within the control
                    // This prevents errors when switching tools
                };
            } else {
                // Create new control with v13 required structure
                const toolKeys = Object.keys(tools);
                // v13 requirement: activeTool must point to a valid tool key (cannot be empty string)
                // Even if all tools are buttons, we must set activeTool to a valid tool key
                // We'll prevent auto-activation by ensuring the tool's onChange doesn't trigger onClick
                const defaultActiveTool = toolKeys.length > 0 ? toolKeys[0] : "";
                
            controls['blacksmith-utilities'] = {
                name: "blacksmith-utilities",
                title: "Blacksmith Utilities",
                icon: "fa-solid fa-mug-hot",
                layer: "blacksmith-utilities-layer", // Ensure this matches the registration key
                    order: 99, // v13 requirement
                    visible: true, // v13 requirement
                    activeTool: defaultActiveTool, // v13 requirement: must point to valid tool key (or empty for button-only controls)
                    tools: tools, // v13 requirement: must be Record<string, SceneControlTool>
                    onChange: (event, active) => {
                        // v13 requirement: control onChange handler
                        // Handle control activation/deactivation
                    },
                    onToolChange: (event, tool) => {
                        // v13 requirement: control onToolChange handler
                        // Handle tool change within the control
                    }
                };
            }

            // Add tools to FoundryVTT native toolbars
            const foundryTools = getFoundryToolbarTools();
            
            // Check if settings are available - if not, schedule a refresh once they are
            const settingKey = `${MODULE.ID}.tokenImageReplacementShowInFoundryToolbar`;
            if (!game.settings.settings.has(settingKey)) {
                // Setting not available yet - schedule a one-time refresh
                // Use a flag to prevent multiple scheduled refreshes
                if (!window._blacksmithToolbarRefreshScheduled) {
                    window._blacksmithToolbarRefreshScheduled = true;
                    let retries = 0;
                    const maxRetries = 10;
                    // Use debounced render instead of setInterval to avoid render loops
                    const checkInterval = setInterval(() => {
                        if (game.settings.settings.has(settingKey) || retries >= maxRetries) {
                            clearInterval(checkInterval);
                            window._blacksmithToolbarRefreshScheduled = false;
                            if (game.settings.settings.has(settingKey)) {
                                requestControlsRender();
                            }
                        }
                        retries++;
                    }, 100);
                }
            }
            
            // Add tools to token toolbar (default behavior for now)
            // v13: controls is an object, access directly by key
            const tokenControl = controls.tokens;
            if (tokenControl) {
                // v13: tools is always an object keyed by tool name
                if (!tokenControl.tools) {
                    tokenControl.tools = {};
                }
                
                // Get all registered tool names for cleanup
                const registeredToolNames = new Set(registeredTools.keys());
                
                // Create a set of tools that should be shown in Foundry toolbar
                const toolsToShow = new Set();
                
                // Check visibility and add/update tools that should be shown
                const isGM = game.user.isGM;
                const isLeaderUser = isLeader();
                
                // Get base order offset from existing Foundry tools (before we add ours)
                const baseOrder = Object.keys(tokenControl.tools).length;
                
                foundryTools.forEach((tool, index) => {
                    // For Foundry toolbar tools, we only need to check GM/leader visibility
                    // The tool is already in foundryTools, which means:
                    // 1. It passed getFoundryToolbarTools() (which checks onFoundry, gmOnly, leaderOnly)
                    // So we only need to re-check gmOnly/leaderOnly in case user status changed
                    // We should NOT check tool.visible() again because that's for CoffeePub toolbar visibility
                    let shouldShow = true;
                    
                    if (tool.gmOnly && !isGM) {
                        shouldShow = false;
                    } else if (tool.leaderOnly && !isLeaderUser && !isGM) {
                        shouldShow = false;
                    }
                    // Note: We intentionally skip checking tool.visible() here because:
                    // - For Foundry toolbar, visibility is controlled by onFoundry()
                    // - tool.visible() is for CoffeePub toolbar visibility
                    // - The tool is already in foundryTools, so onFoundry() returned true
                    
                    if (shouldShow) {
                        toolsToShow.add(tool.name);
                        
                        // Add or update the tool (always update to ensure properties are current)
                        // Use baseOrder + index to ensure consistent ordering
                        // Note: Foundry v13 may require onClick property even if we wire clicks separately
                        const toolObject = {
                            icon: tool.icon,
                            name: tool.name,
                            title: tool.title,
                            button: tool.button,
                            visible: true,
                            // Include onClick for Foundry compatibility (even though we wire clicks separately)
                            onClick: tool.onClick || (() => {}),
                            onChange: () => {},
                            order: baseOrder + index
                        };
                        
                        tokenControl.tools[tool.name] = toolObject;
                    }
                });
                
                // Remove tools that should no longer be shown (only our registered tools)
                Object.keys(tokenControl.tools).forEach(toolName => {
                    if (registeredToolNames.has(toolName) && !toolsToShow.has(toolName)) {
                        delete tokenControl.tools[toolName];
                    }
                });
            }
            // --- END - HOOKMANAGER CALLBACK ---
        }
	});

    // Register renderSceneControls hook
    const renderSceneControlsHookId = HookManager.registerHook({
        name: 'renderSceneControls',
        description: 'Manager Toolbar: Reapply styling when toolbar is rendered',
        context: 'manager-toolbar-scene',
        priority: 3, // Normal priority - UI enhancement
        callback: (app, html) => {
            // v13: Pass html root to functions instead of querying document
            _applyZoneClasses(html);
            _wireToolClicks(html);
            _wireFoundryToolClicks(html);
        }
    });

    // Register ready hook for zone classes and dividers
    const readyHookId = HookManager.registerHook({
        name: 'ready',
        description: 'Manager Toolbar: Apply zone classes and dividers when UI is ready',
        context: 'manager-toolbar-ready',
        priority: 3,
        callback: async () => {
            // Wait for settings to be registered before building toolbar
            // This ensures onFoundry() functions can read setting values correctly
            const settingKey = `${MODULE.ID}.tokenImageReplacementShowInFoundryToolbar`;
            let retries = 0;
            const maxRetries = 10;
            const retryDelay = 100;
            
            while (!game.settings.settings.has(settingKey) && retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
            }
            
            // Refresh the toolbar now that settings should be available
            // Use debounced render to avoid render loops
            requestControlsRender();
            // Zone classes and click handlers will be wired by renderSceneControls hook
        }
    });

    // Register setting change hook to refresh toolbar when party leader or toolbar visibility settings change
    const settingChangeHookId = HookManager.registerHook({
        name: 'settingChange',
        description: 'Manager Toolbar: Refresh toolbar when party leader or toolbar visibility settings change',
        context: 'manager-toolbar-setting',
        priority: 3,
        callback: (module, key, value) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (module === MODULE.ID) {
                if (key === 'partyLeader') {
                    // Refresh all toolbars when party leader changes
                    // Clear active tool if it's a leader tool that might be removed
                    // v13: activeTool is deprecated, use tool?.name (safely)
                    const activeTool = safeActiveToolName();
                    if (activeTool && registeredTools.has(activeTool)) {
                        const tool = registeredTools.get(activeTool);
                        if (tool.leaderOnly && !game.user.isGM) {
                            const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                            const isLeader = leaderData?.userId === game.user.id;
                            if (!isLeader) {
                                // Clear the active tool since it's being removed
                                // v13: Setting activeTool directly may not work; Foundry will handle deactivation when tool is removed
                                // If needed, we can call ui.controls.deactivate() or let Foundry handle it automatically
                                try {
                                    ui.controls.activeTool = null;
                                } catch (e) {
                                    // v13 may not allow direct assignment; Foundry will handle deactivation
                                }
                            }
                        }
                    }
                    
                    // Rebuild and render controls using v13+ API (replaces deprecated initialize())
                    requestControlsRender();
                } else if (key === 'tokenImageReplacementShowInFoundryToolbar' || key === 'tokenImageReplacementShowInCoffeePubToolbar') {
                    // Refresh toolbar when toolbar visibility settings change
                    // Rebuild and render controls using v13+ API (replaces deprecated initialize())
                    requestControlsRender();
                }
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
            // Clear active tool if it's a leader tool that might be removed
            // v13: activeTool is deprecated, use tool?.name
            const activeTool = safeActiveToolName();
            if (activeTool && registeredTools.has(activeTool)) {
                const tool = registeredTools.get(activeTool);
                if (tool.leaderOnly && !game.user.isGM) {
                    const isLeader = leaderData?.userId === game.user.id;
                    if (!isLeader) {
                        // Clear the active tool since it's being removed
                        // v13: Setting activeTool directly may not work; Foundry will handle deactivation when tool is removed
                        // If needed, we can call ui.controls.deactivate() or let Foundry handle it automatically
                        try {
                            ui.controls.activeTool = null;
                        } catch (e) {
                            // v13 may not allow direct assignment; Foundry will handle deactivation
                        }
                    }
                }
            }
            
            // Use debounced render to avoid render loops
            requestControlsRender();
            // --- END - HOOKMANAGER CALLBACK ---
        },
        key: 'manager-toolbar-leader-change',
        options: {}
    });
    

    
}


// ================================================================== 
// ===== TOOLBAR API FOR EXTERNAL MODULES ==========================
// ================================================================== 

/**
 * Debug helper to inspect toolbar state at any point
 * @param {string} label - Label for this debug output
 */
function debugToolbarState(label = 'debug') {
    try {
        const all = Array.from(registeredTools.values());
        const vis = getVisibleTools();
        const coffee = getVisibleToolsByZones();
        console.warn(`=== Coffee Pub Toolbar: ${label} ===`);
        console.warn('registeredTools.size', registeredTools.size);
        console.warn('all', all.map(t => ({
            name: t.name, 
            moduleId: t.moduleId,
            onCoffeePub: typeof t.onCoffeePub,
            onCoffeePubPass: isOnCoffeePub(t),
            visible: typeof t.visible,
            zone: t.zone,
            button: t.button
        })));
        console.warn('visible', vis.map(t => t.name));
        console.warn('coffeePub', coffee.map(t => t.name));
        
        // Safely access ui.controls - it may not be ready during early initialization
        const activeControl = safeActiveControlName();
        const activeControlDisplay = activeControl ?? 'not ready';
        console.warn('activeControl', activeControlDisplay);
    } catch (error) {
        console.warn(`Coffee Pub Toolbar: Error in debugToolbarState(${label}):`, error);
    }
}

/**
 * Register a tool for the Blacksmith toolbar
 * @param {string} toolId - Unique identifier for the tool
 * @param {Object} toolData - Tool configuration object
 * @returns {boolean} Success status
 */
export function registerToolbarTool(toolId, toolData) {
    const success = registerTool(toolId, toolData);
    if (success) {
        postConsoleAndNotification(MODULE.NAME, `Coffee Pub Toolbar API: Registered tool "${toolId}"`, { 
            onCoffeePub: toolData.onCoffeePub !== undefined ? toolData.onCoffeePub : true,
            onFoundry: toolData.onFoundry || false,
            moduleId: toolData.moduleId || 'blacksmith-core'
        }, true, false);
        
        // Debug: Log toolbar state after registration
        debugToolbarState('after external register');
        
        // Refresh the toolbar to reflect the new tool
        // Use a small delay to ensure the tool is fully registered
        // Request a render - let Foundry handle the full lifecycle properly
        requestControlsRender();
    }
    return success;
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
            // Refresh the toolbar to reflect changes using debounced render
            requestControlsRender();
            return true;
        }
        return false;
    } catch (error) {
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
    // Refresh toolbar to apply changes using debounced render
    requestControlsRender();
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
