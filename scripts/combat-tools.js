// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

// Register hooks
Hooks.once('ready', () => {
    postConsoleAndNotification("CombatTools | Ready", "", false, true, false);
});

// Function to update portrait
const updatePortrait = (element) => {
    const combatant = $(element);
    const combatantId = combatant.data('combatantId');
    const actor = game.combat?.combatants.get(combatantId)?.actor;
    
    if (!actor) return;
    
    const img = combatant.find('img.token-image');
    if (img.length) {
        const portraitPath = actor.img || actor.prototypeToken.texture.src;
        if (portraitPath && img.attr('src') !== portraitPath) {
            img.attr('src', portraitPath);
        }
    }
};

// Function to calculate new initiative value
const calculateNewInitiative = (combatants, dropIndex, draggedId) => {
    const above = combatants[dropIndex - 1];
    const below = combatants[dropIndex];
    
    // If dropping at the top
    if (!above) {
        return below.initiative + 2;
    }
    // If dropping at the bottom
    if (!below) {
        return above.initiative - 1;
    }
    // Drop between two combatants
    return above.initiative - ((above.initiative - below.initiative) / 2);
};

// Add our control button and health rings to the combat tracker
Hooks.on('renderCombatTracker', (app, html, data) => {
    // Find all combatant control groups
    const controlGroups = html.find('.combatant-controls');
    if (!controlGroups.length) return;

    // Set up observer for portrait changes if enabled
    if (game.settings.get(MODULE_ID, 'combatTrackerShowPortraits')) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    const combatant = $(mutation.target).closest('.combatant');
                    if (combatant.length) {
                        updatePortrait(combatant[0]);
                    }
                }
            });
        });

        // Observe the combat tracker for changes
        html.find('.directory-list').each((i, el) => {
            observer.observe(el, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
        });
    }

    // Make combatants draggable
    html.find('.combatant').each((i, element) => {
        element.draggable = true;
        element.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/plain', ev.target.dataset.combatantId);
            ev.target.classList.add('dragging');
        });
        element.addEventListener('dragend', (ev) => {
            ev.target.classList.remove('dragging');
        });
        element.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            const draggingElement = html.find('.dragging')[0];
            if (draggingElement && draggingElement !== ev.target) {
                ev.target.classList.add('drag-over');
            }
        });
        element.addEventListener('dragleave', (ev) => {
            ev.target.classList.remove('drag-over');
        });
        element.addEventListener('drop', async (ev) => {
            ev.preventDefault();
            const draggedId = ev.dataTransfer.getData('text/plain');
            const dropTarget = $(ev.target).closest('.combatant');
            
            if (!draggedId || !dropTarget.length) return;
            
            // Remove drag-over styling
            html.find('.drag-over').removeClass('drag-over');
            
            // Get all combatants in current order
            const combatants = game.combat.turns.map(t => t);
            const draggedIndex = combatants.findIndex(c => c.id === draggedId);
            const dropIndex = combatants.findIndex(c => c.id === dropTarget.data('combatantId'));
            
            if (draggedIndex === dropIndex) return;
            
            // Calculate new initiative
            const newInitiative = calculateNewInitiative(
                combatants,
                dropIndex > draggedIndex ? dropIndex + 1 : dropIndex,
                draggedId
            );
            
            // Update the initiative
            await game.combat.updateEmbeddedDocuments("Combatant", [{
                _id: draggedId,
                initiative: newInitiative
            }]);
        });
    });

    // Add global styles once
    if (!html.find('#combat-tools-styles').length) {
        const globalStyles = $(`
            <style id="combat-tools-styles">
                .combatant {
                    position: relative;
                    cursor: grab;
                }
                .combatant.dragging {
                    opacity: 0.5;
                    cursor: grabbing;
                }
                .combatant.drag-over {
                    border-top: 2px solid var(--color-border-highlight);
                }
                ${game.settings.get(MODULE_ID, 'combatTrackerShowHealthBar') ? `
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
                ` : ''}
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

        // Handle portrait vs token image
        if (game.settings.get(MODULE_ID, 'combatTrackerShowPortraits')) {
            updatePortrait(element);
        }

        // Add our button for GMs
        if (game.user.isGM && game.settings.get(MODULE_ID, 'combatTrackerSetCurrentCombatant')) {
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

        // Only create health ring if the setting is enabled
        if (game.settings.get(MODULE_ID, 'combatTrackerShowHealthBar')) {
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
        }
    });
});

postConsoleAndNotification("CombatTools | Module loaded", "", false, true, false); 