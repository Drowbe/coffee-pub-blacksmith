import { MODULE_ID } from './const.js';
import { COFFEEPUB, MODULE_AUTHOR, postConsoleAndNotification } from './global.js';
import { buildButtonEventRegent } from './blacksmith.js';
import { CSSEditor } from './css-editor.js';
// -- Global utilities --
import { rollCoffeePubDice, playSound } from './global.js';

export function addToolbarButton() {
    postConsoleAndNotification("Adding toolbar button", "", false, true, false);

    Hooks.on('getSceneControlButtons', (controls) => {
        postConsoleAndNotification("getSceneControlButtons hook triggered", "", false, true, false);

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
            visible: true,
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

        const cssTool = {
            icon: "fa-solid fa-paint-brush",
            name: "css",
            title: "Open GM Tools",
            button: true,
            visible: game.user.isGM,
            onClick: () => {
                const editor = new CSSEditor();
                editor.render(true);
            }
        };

        controls.push({
            name: "blacksmith-utilities",
            title: "Blacksmith Utilities",
            icon: "fa-solid fa-mug-hot",
            layer: "blacksmith-utilities-layer", // Ensure this matches the registration key
            tools: [regentTool, lookupTool, characterTool, assistantTool, encounterTool, narrativeTool, cssTool]
        });
        postConsoleAndNotification("Toolbar buttons added to controls", "", false, true, false);
    });

    Hooks.on('renderSceneControls', () => {
        const button = document.querySelector(`[data-control="blacksmith-utilities"]`);
        if (button) {
            button.addEventListener('click', () => {
                postConsoleAndNotification("Toolbar button clicked", "", false, true, false);
                toggleToolbarVisibility();
                //activateBlacksmithLayer(); // Ensure this function is called
            });
        } else {
            console.error("BLACKSMITH: Toolbar button not found");
        }
    });

    postConsoleAndNotification("Toolbar button registration complete", "", false, true, false);
}

// Function to toggle the "active" class
function toggleToolbarVisibility() {
    postConsoleAndNotification("Toggling toolbar visibility", "", false, true, false);

    // Hide all toolbars first
    const allToolbars = document.querySelectorAll('.sub-controls.app.control-tools');
    allToolbars.forEach(toolbar => {
        toolbar.classList.remove('active');
    });

    // Show the selected toolbar
    const toolbar = document.querySelector('#tools-panel-blacksmith-utilities'); // Use the actual ID
    if (toolbar) {
        toolbar.classList.toggle('active');
        postConsoleAndNotification("Toolbar visibility toggled", "", false, true, false);
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
        postConsoleAndNotification("Blacksmith button set to active", "", false, true, false);
    } else {
        console.error("Blacksmith button not found");
    }
}

// Function to activate the Blacksmith layer
function activateBlacksmithLayer() {
    postConsoleAndNotification("Activating Blacksmith Layer", "", false, true, false);
    const layer = canvas['blacksmith-utilities-layer'];
    if (layer) {
        layer.activate();
    } else {
        console.error("Blacksmith Layer not found");
    }
}
