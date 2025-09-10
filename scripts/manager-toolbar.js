import { MODULE } from './const.js';
// COFFEEPUB now available globally via window.COFFEEPUB
import { postConsoleAndNotification, getSettingSafely } from './api-common.js';
import { HookManager } from './manager-hooks.js';
import { BlacksmithToolbarManager } from './manager-blacksmith-toolbar.js';
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './api-common.js';

export function addToolbarButton() {

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
            
            // Get the tools in order from BlacksmithToolbarManager
            const visibleTools = BlacksmithToolbarManager.getVisibleToolsByZones();
            
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
		description: 'Manager Toolbar: Add click handler to blacksmith utilities button',
		context: 'manager-toolbar-scene',
		priority: 3,
		callback: (controls) => {
			// --- BEGIN - HOOKMANAGER CALLBACK ---

            // Get all visible tools from the BlacksmithToolbarManager, organized by zones
            const visibleTools = BlacksmithToolbarManager.getVisibleToolsByZones();
            
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
            // Apply zone classes to toolbar tools
            _applyZoneClasses();
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
