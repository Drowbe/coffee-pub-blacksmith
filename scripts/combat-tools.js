// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

// Register hooks
Hooks.once('ready', () => {
    postConsoleAndNotification("CombatTools | Ready", "", false, true, false);
});

// Add our control button and health rings to the combat tracker
Hooks.on('renderCombatTracker', (app, html, data) => {
    // Find all combatant control groups
    const controlGroups = html.find('.combatant-controls');
    if (!controlGroups.length) return;

    // Add global styles once
    if (!html.find('#combat-tools-styles').length) {
        const globalStyles = $(`
            <style id="combat-tools-styles">
                .combatant {
                    position: relative;
                }
                .health-ring-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 48px;
                    height: 48px;
                    pointer-events: none;
                    z-index: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .token-image {
                    position: relative;
                    z-index: 2;
                    width: 32px !important;
                    height: 32px !important;
                    min-width: 32px !important;
                    min-height: 32px !important;
                    max-width: 32px !important;
                    max-height: 32px !important;
                    margin: 8px !important;
                    border-radius: 50% !important;
                    object-fit: cover !important;
                }
                .health-ring-container svg {
                    position: absolute;
                    top: 4px;
                    left: 4px;
                    width: 40px;
                    height: 40px;
                }
            </style>
        `);
        html.prepend(globalStyles);
    }

    // Process each combatant
    html.find('.combatant').each((i, element) => {
        const combatant = $(element);
        const combatantId = combatant.data('combatantId');
        const actor = game.combat?.combatants.get(combatantId)?.actor;

        // Only proceed if we have a valid actor
        if (!actor) return;

        // Add our button for GMs
        if (game.user.isGM) {
            const controls = combatant.find('.combatant-controls');
            const button = $(`
                <a class="combatant-control" 
                   aria-label="Set as Current" 
                   role="button" 
                   data-tooltip="Set as Current Combatant" 
                   data-control="setAsCurrent">
                    <i class="fas fa-bullseye"></i>
                </a>
            `);

            button.on('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (game.combat) {
                    await game.combat.update({turn: game.combat.turns.findIndex(t => t.id === combatantId)});
                }
            });

            controls.prepend(button);
        }

        // Calculate health percentage
        const hp = actor.system.attributes.hp;
        const currentHP = hp.value;
        const maxHP = hp.max;
        const healthPercent = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));

        // Get health color based on percentage
        const getHealthColor = (percent) => {
            if (percent >= 75) return '#2ecc71'; // Green
            if (percent >= 50) return '#f1c40f'; // Yellow
            if (percent >= 25) return '#e67e22'; // Orange
            return '#e74c3c'; // Red
        };

        // Fixed dimensions for the ring
        const size = 40; // Ring size
        const strokeWidth = 2;
        const radius = 19; // (40 - 2) / 2
        const circumference = 2 * Math.PI * radius;
        const dashOffset = circumference - (healthPercent / 100) * circumference;
        const healthColor = getHealthColor(healthPercent);

        // Create container div if it doesn't exist
        let container = combatant.find('.health-ring-container');
        if (!container.length) {
            container = $('<div class="health-ring-container"></div>');
            combatant.prepend(container);
        }

        // Create SVG for health ring
        const svg = $(`
            <svg width="${size}" height="${size}">
                <circle
                    cx="${size/2}"
                    cy="${size/2}"
                    r="${radius}"
                    fill="none"
                    stroke="${healthColor}"
                    stroke-width="${strokeWidth}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashOffset}"
                    transform="rotate(-90, ${size/2}, ${size/2})"
                    style="transition: stroke-dashoffset 0.3s ease-in-out, stroke 0.3s ease-in-out"
                />
            </svg>
        `);

        // Update the ring
        container.empty().append(svg);
    });
});

postConsoleAndNotification("CombatTools | Module loaded", "", false, true, false); 