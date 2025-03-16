// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

console.log("COMBAT TOOLS: MODULE LOADING");

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

console.log("COMBAT TOOLS: IMPORTS COMPLETE");

// Register hooks
Hooks.once('ready', () => {
    postConsoleAndNotification("COMBAT TOOLS | Ready hook triggered", "", false, true, false);
});

// Add our option to the combat tracker context menu
Hooks.on('renderCombatTracker', (app, html, data) => {
    console.log("COMBAT TOOLS | Combat Tracker rendered, setting up context menu");

    // Find all combatant elements
    const combatants = html.find('.combatant');
    if (!combatants.length) {
        console.log("COMBAT TOOLS | No combatants found to register context menu");
        return;
    }

    // Create our menu items
    const menuItems = [{
        name: "Set as Current Combatant",
        icon: '<i class="fas fa-bullseye"></i>',
        condition: target => {
            const combatantId = target.closest('.combatant').dataset.combatantId;
            const combatant = game.combat?.combatants.get(combatantId);
            console.log("COMBAT TOOLS | Checking condition for combatant:", {
                combatantId,
                combatant,
                isGM: game.user.isGM
            });
            return game.user.isGM && combatant;
        },
        callback: target => {
            const combatantId = target.closest('.combatant').dataset.combatantId;
            const combatant = game.combat?.combatants.get(combatantId);
            if (combatant && game.combat) {
                console.log("COMBAT TOOLS | Setting current combatant:", combatant);
                return game.combat.update({turn: game.combat.turns.findIndex(t => t.id === combatant.id)});
            }
        }
    }];

    // Create context menu
    const menu = new ContextMenu(html, ".combatant", menuItems);
    console.log("COMBAT TOOLS | Context menu created:", menu);
});

console.log("COMBAT TOOLS: HOOKS REGISTERED");
console.log("COMBAT TOOLS: MODULE LOADED");
postConsoleAndNotification("CombatTools | Module loaded", "", false, true, false); 