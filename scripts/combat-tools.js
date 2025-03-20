// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';




// Register hooks after settings are initialized
Hooks.once('ready', () => {
    postConsoleAndNotification("CombatTools | Ready", "", false, true, false);
    
    // Add style for non-GM users
    if (!game.user.isGM) {
        const style = document.createElement('style');
        style.textContent = `
            #combat-tracker .combatant {
                cursor: default !important;
            }
        `;
        document.head.appendChild(style);
    } else {
        // Add drag and drop styles for GM
        const style = document.createElement('style');
        style.textContent = `
            #combat-tracker .combatant {
                position: relative;
                transition: all 0.2s ease-out;
            }
            #combat-tracker.dragging-active .directory-list > .combatant {
                padding: 8px 0;
                border-top: 4px solid transparent;
                border-bottom: 4px solid transparent;
            }
            #combat-tracker.dragging-active .directory-list > .combatant.dragging {
                background: rgba(0, 0, 0, 0.1);
            }
            #combat-tracker .drop-zone {
                position: absolute;
                height: 8px;
                left: 0;
                right: 0;
                background: transparent;
                transition: all 0.2s;
                z-index: 1;
            }
            #combat-tracker.dragging-active .drop-zone {
                height: 16px;
            }
            #combat-tracker .drop-zone.top {
                top: -4px;
                border-top: 2px solid transparent;
            }
            #combat-tracker.dragging-active .drop-zone.top {
                top: -8px;
            }
            #combat-tracker .drop-zone.bottom {
                bottom: -4px;
                border-bottom: 2px solid transparent;
            }
            #combat-tracker.dragging-active .drop-zone.bottom {
                bottom: -8px;
            }
            #combat-tracker .drop-zone.drag-over {
                background: rgba(0, 255, 0, 0.15);
                box-shadow: 0 0 3px #00ff00;
            }
            #combat-tracker .drop-zone.drag-over.top {
                border-top: 2px solid #00ff00;
            }
            #combat-tracker .drop-zone.drag-over.bottom {
                border-bottom: 2px solid #00ff00;
            }
            #combat-tracker .combatant.dragging {
                opacity: 0.5;
                cursor: grabbing;
            }
            #combat-tracker .combatant:not(.dragging) {
                cursor: grab;
            }
            /* Handle group spacing */
            #combat-tracker.dragging-active .combatant-group {
                padding: 8px 0;
                border-top: 4px solid transparent;
                border-bottom: 4px solid transparent;
            }
            #combat-tracker.dragging-active .group-children .combatant {
                padding: 4px 0;
                border-top: 2px solid transparent;
                border-bottom: 2px solid transparent;
            }
        `;
        document.head.appendChild(style);
    }

    // Move the renderCombatTracker hook inside the ready hook to ensure settings are registered
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
        // Only GM can drag and drop
        if (!game.user.isGM) return;

        html.find('.combatant').each((i, element) => {
            // Add drop zones to each combatant
            const topZone = $('<div class="drop-zone top"></div>');
            const bottomZone = $('<div class="drop-zone bottom"></div>');
            $(element).append(topZone, bottomZone);

            element.draggable = true;
            element.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData('text/plain', ev.target.dataset.combatantId);
                ev.target.classList.add('dragging');
                // Add class to combat tracker to expand spacing
                html.closest('#combat-tracker').addClass('dragging-active');
            });
            element.addEventListener('dragend', (ev) => {
                ev.target.classList.remove('dragging');
                html.find('.drag-over').removeClass('drag-over');
                // Remove expanded spacing
                html.closest('#combat-tracker').removeClass('dragging-active');
            });

            // Handle drop zones
            [topZone, bottomZone].forEach(zone => {
                zone[0].addEventListener('dragover', (ev) => {
                    ev.preventDefault();
                    const draggingElement = html.find('.dragging')[0];
                    if (draggingElement && draggingElement !== element) {
                        html.find('.drag-over').removeClass('drag-over');
                        zone.addClass('drag-over');
                    }
                });

                zone[0].addEventListener('dragleave', (ev) => {
                    zone.removeClass('drag-over');
                });

                zone[0].addEventListener('drop', async (ev) => {
                    ev.preventDefault();
                    const draggedId = ev.dataTransfer.getData('text/plain');
                    const dropTarget = $(element);
                    
                    if (!draggedId || !dropTarget.length) return;
                    
                    // Remove drag-over styling
                    html.find('.drag-over').removeClass('drag-over');
                    
                    // Get all combatants in current order
                    const combatants = game.combat.turns.map(t => t);
                    const draggedIndex = combatants.findIndex(c => c.id === draggedId);
                    const dropIndex = combatants.findIndex(c => c.id === dropTarget.data('combatantId'));
                    
                    if (draggedIndex === dropIndex) return;
                    
                    // Adjust drop index based on whether it's the top or bottom zone
                    const adjustedDropIndex = zone.hasClass('top') ? dropIndex : dropIndex + 1;
                    
                    // Calculate new initiative
                    const newInitiative = calculateNewInitiative(
                        combatants,
                        adjustedDropIndex,
                        draggedId
                    );
                    
                    // Update the initiative
                    await game.combat.updateEmbeddedDocuments("Combatant", [{
                        _id: draggedId,
                        initiative: newInitiative
                    }]);
                });
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
                
                // Get health color based on percentage
                const getHealthClass = (percent, currentHP) => {
                    if (currentHP <= 0) return 'health-ring-dead';
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
                
                // When dead (HP <= 0), show full ring, otherwise calculate normally
                const healthPercent = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
                const dashOffset = currentHP <= 0 ? 0 : circumference - (healthPercent / 100) * circumference;
                
                const healthClass = getHealthClass(healthPercent, currentHP);

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
                            ${currentHP > 0 ? 'style="transition: stroke-dashoffset 0.3s ease-in-out, stroke 0.3s ease-in-out"' : ''}
                        />
                    </svg>
                `);

                // Update the ring and handle dead state
                container.empty().append(svg);

                // Add dead class and skull overlay if HP is 0 or less
                if (currentHP <= 0 && game.settings.get(MODULE_ID, 'combatTrackerShowPortraits')) {
                    combatant.addClass('portrait-dead');
                    // Add skull overlay to the initiative div if it doesn't exist
                    const initiativeDiv = combatant.find('.token-initiative');
                    if (initiativeDiv.length && !initiativeDiv.find('.portrait-dead-overlay').length) {
                        const skullOverlay = $('<i class="fas fa-skull portrait-dead-overlay"></i>');
                        initiativeDiv.append(skullOverlay);
                    }
                } else {
                    combatant.removeClass('portrait-dead');
                    combatant.find('.portrait-dead-overlay').remove();
                }
            }
        });
    });
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

postConsoleAndNotification("CombatTools | Module loaded", "", false, true, false); 