import { MODULE } from './const.js';
// COFFEEPUB now available globally via window.COFFEEPUB
import { postConsoleAndNotification } from './api-common.js';
import { HookManager } from './manager-hooks.js';
import { BlacksmithToolbarManager } from './manager-blacksmith-toolbar.js';
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './api-common.js';

export function addToolbarButton() {


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
        description: 'Manager Toolbar: Add click handler to blacksmith utilities button',
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
