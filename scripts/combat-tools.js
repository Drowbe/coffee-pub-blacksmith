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

// Add our control button to the combat tracker
Hooks.on('renderCombatTracker', (app, html, data) => {
    console.log("COMBAT TOOLS | Combat Tracker rendered");

    // Find all combatant control groups
    const controlGroups = html.find('.combatant-controls');
    if (!controlGroups.length) {
        console.log("COMBAT TOOLS | No combatant controls found");
        return;
    }

    // Add our button to each control group
    controlGroups.each((i, div) => {
        const controls = $(div);
        const combatant = controls.closest('.combatant');
        const combatantId = combatant.data('combatantId');

        // Only add the button for GMs
        if (!game.user.isGM) return;

        // Create our control button
        const button = $(`
            <a class="combatant-control" 
               aria-label="Set as Current" 
               role="button" 
               data-tooltip="Set as Current Combatant" 
               data-control="setAsCurrent">
                <i class="fas fa-bullseye"></i>
            </a>
        `);

        // Add click handler
        button.on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const combatant = game.combat?.combatants.get(combatantId);
            if (combatant && game.combat) {
                console.log("COMBAT TOOLS | Setting current combatant:", combatant);
                await game.combat.update({turn: game.combat.turns.findIndex(t => t.id === combatant.id)});
            }
        });

        // Insert our button before the token-effects div
        controls.find('.token-effects').before(button);
    });
});

console.log("COMBAT TOOLS: HOOKS REGISTERED");
console.log("COMBAT TOOLS: MODULE LOADED");
postConsoleAndNotification("CombatTools | Module loaded", "", false, true, false); 