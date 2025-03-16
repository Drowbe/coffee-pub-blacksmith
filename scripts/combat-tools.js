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
            const getHealthClass = (percent) => {
                if (percent >= 75) return 'health-ring-healthy';
                if (percent >= 50) return 'health-ring-injured';
                if (percent >= 25) return 'health-ring-bloodied';
                return 'health-ring-critical';
            };

            // Fixed dimensions for the ring
            const size = 40; // Ring size
            const strokeWidth = 2;
            const radius = 19; // (40 - 2) / 2
            const circumference = 2 * Math.PI * radius;
            const dashOffset = circumference - (healthPercent / 100) * circumference;
            const healthClass = getHealthClass(healthPercent);

            // Create container div if it doesn't exist
            let container = combatant.find('.health-ring-container');
            if (!container.length) {
                container = $('<div class="health-ring-container"></div>');
                combatant.prepend(container);
            }

            // Create SVG for health ring
            const svg = $(`
                <svg width="${size}" height="${size}" class="${healthClass}">
                    <circle
                        cx="${size/2}"
                        cy="${size/2}"
                        r="${radius}"
                        fill="none"
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