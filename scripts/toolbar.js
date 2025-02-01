import { MODULE_ID } from './const.js';
import { BlacksmithWindowDashboard } from './window-dashboard.js';
import { COFFEEPUB, MODULE_AUTHOR } from './global.js';
import { buildButtonEventRegent, buildButtonEventBrowser } from './blacksmith.js';
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './global.js';

export function addToolbarButton() {
    console.log("BLACKSMITH: Adding toolbar button");

    Hooks.on('getSceneControlButtons', (controls) => {
        console.log("BLACKSMITH: getSceneControlButtons hook triggered");

        const dashboardTool = {
            icon: "fa-solid fa-shield-heart",
            name: "dashboard",
            title: "Toggle Blacksmith Dashboard",
            button: true,
            visible: true,
            onClick: () => {
                console.log("Dashboard button clicked");
                const dashboard = BlacksmithWindowDashboard.getInstance();
                dashboard.toggleVisibility();
                console.log("Dashboard visibility toggled");
            }
        };

        // const browserTool = {
        //     icon: "fa-solid fa-browser",
        //     name: "browser",
        //     title: "Open the Browser",
        //     button: true,
        //     visible: true,
        //     onClick: buildButtonEventBrowser
        // };

        const regentTool = {
            icon: "fa-solid fa-crystal-ball",
            name: "regent",
            title: "Consult the Regent",
            button: true,
            visible: true,
            onClick: buildButtonEventRegent
        };

        const lookupTool = {
            icon: "fa-solid fa-bolt-lightning",
            name: "lookup",
            title: "Open Lookup Worksheet",
            button: true,
            visible: true,
            onClick: () => buildButtonEventRegent('lookup')
        };

        const characterTool = {
            icon: "fa-solid fa-helmet-battle",
            name: "character",
            title: "Open Character Worksheet",
            button: true,
            visible: game.user.isGM,
            onClick: () => buildButtonEventRegent('character')
        };

        const assistantTool = {
            icon: "fa-solid fa-hammer-brush",
            name: "assistant",
            title: "Open Assistant Worksheet",
            button: true,
            visible: game.user.isGM,
            onClick: () => buildButtonEventRegent('assistant')
        };

        const encounterTool = {
            icon: "fa-solid fa-swords",
            name: "encounter",
            title: "Open Encounter Worksheet",
            button: true,
            visible: game.user.isGM,
            onClick: () => buildButtonEventRegent('encounter')
        };

        const narrativeTool = {
            icon: "fa-solid fa-masks-theater",
            name: "narrative",
            title: "Open Narrative Worksheet",
            button: true,
            visible: game.user.isGM,
            onClick: () => buildButtonEventRegent('narrative')
        };

        controls.push({
            name: "blacksmith-utilities",
            title: "Blacksmith Utilities",
            icon: "fa-solid fa-mug-hot",
            layer: "blacksmith-utilities-layer", // Ensure this matches the registration key
            //tools: [dashboardTool, browserTool, regentTool, lookupTool, characterTool, assistantTool, encounterTool, narrativeTool]
            tools: [dashboardTool, regentTool, lookupTool, characterTool, assistantTool, encounterTool, narrativeTool]
        });
        console.log("BLACKSMITH: Toolbar buttons added to controls");
    });

    Hooks.on('renderSceneControls', () => {
        const button = document.querySelector(`[data-control="blacksmith-utilities"]`);
        if (button) {
            button.addEventListener('click', () => {
                console.log("BLACKSMITH: Toolbar button clicked");
                toggleToolbarVisibility();
                //activateBlacksmithLayer(); // Ensure this function is called
            });
        } else {
            console.error("BLACKSMITH: Toolbar button not found");
        }
    });

    console.log("BLACKSMITH: Toolbar button registration complete");
}

// Function to toggle the "active" class
function toggleToolbarVisibility() {
    console.log("BLACKSMITH: Toggling toolbar visibility");

    // Hide all toolbars first
    const allToolbars = document.querySelectorAll('.sub-controls.app.control-tools');
    allToolbars.forEach(toolbar => {
        toolbar.classList.remove('active');
    });

    // Show the selected toolbar
    const toolbar = document.querySelector('#tools-panel-blacksmith-utilities'); // Use the actual ID
    if (toolbar) {
        toolbar.classList.toggle('active');
        console.log("Toolbar visibility toggled");
    } else {
        console.error("Toolbar element not found");
    }

    // Set the Blacksmith button as active
    const allButtons = document.querySelectorAll('.scene-control');
    allButtons.forEach(button => {
        button.classList.remove('active');
    });

    const blacksmithButton = document.querySelector(`[data-control="blacksmith-utilities"]`);
    if (blacksmithButton) {
        blacksmithButton.classList.add('active');
        console.log("Blacksmith button set to active");
    } else {
        console.error("Blacksmith button not found");
    }
}

// Function to activate the Blacksmith layer
function activateBlacksmithLayer() {
    console.log("Activating Blacksmith Layer");
    const layer = canvas['blacksmith-utilities-layer'];
    if (layer) {
        layer.activate();
    } else {
        console.error("Blacksmith Layer not found");
    }
}
