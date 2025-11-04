// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// Register hooks after settings are initialized
Hooks.once('ready', () => {
    postConsoleAndNotification(MODULE.NAME, "CombatTools | Ready", "", true, false);

    // Register renderCombatTracker hook using HookManager for centralized control
    const hookId = HookManager.registerHook({
        name: 'renderCombatTracker',
        description: 'Adds health rings, portraits, drag & drop to combat tracker',
        context: 'combat-tools',
        priority: 3, // Normal priority - UI enhancements
        callback: (app, html, data) => {
        // Apply resizable functionality if enabled
        CombatTools.applyResizableSettings(html);
        
        // Find all combatant control groups
        const controlGroups = html.find('.combatant-controls');
        if (!controlGroups.length) return;

        // Set up observer for portrait changes if enabled
        if (getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
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

        // Make combatants draggable for GM only
        if (game.user.isGM) {
            const directoryList = html.find('.directory-list');
            const combatants = html.find('.combatant');

        // First, clear any existing drop targets
        html.find('.drop-target').remove();

        // Add drop targets between combatants
        combatants.each((i, element) => {
            const dropTarget = $('<li class="drop-target"></li>');
            $(element).before(dropTarget);
        });
        // Add final drop target at the end
        directoryList.append($('<li class="drop-target"></li>'));

        // Make combatants draggable
        combatants.each((i, element) => {
            element.setAttribute('draggable', 'true');
            element.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData('text/plain', ev.target.dataset.combatantId);
                ev.target.classList.add('dragging');
                
                html.find('#combat-tracker').addClass('dragging-active');
            });

            element.addEventListener('dragend', (ev) => {
                ev.target.classList.remove('dragging');
                html.find('.drag-over').removeClass('drag-over');
                
                html.find('#combat-tracker').removeClass('dragging-active');
            });
        });

        // Add drop handlers to drop targets
        html.find('.drop-target').each((i, element) => {
            element.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const draggingElement = html.find('.dragging')[0];
                if (draggingElement) {
                    html.find('.drag-over').removeClass('drag-over');
                    $(element).addClass('drag-over');
                }
            });

            element.addEventListener('dragenter', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
            });

            element.addEventListener('dragleave', (ev) => {
                $(element).removeClass('drag-over');
            });

            element.addEventListener('drop', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const draggedId = ev.dataTransfer.getData('text/plain');
                
                if (!draggedId) return;
                
                // Remove drag-over styling
                html.find('.drag-over').removeClass('drag-over');
                
                // Get all combatants in current order
                // Skip if combat doesn't exist (combat might have been deleted)
                if (!game.combat || !game.combats.has(game.combat.id)) return;
                
                const combatants = game.combat.turns;
                if (!combatants) return;

                const draggedIndex = combatants.findIndex(c => c.id === draggedId);
                if (draggedIndex === -1) return;

                // Calculate drop index based on the drop target's position
                const dropTargets = html.find('.drop-target');
                const dropIndex = dropTargets.index(element);
                
                // Calculate new initiative
                let newInitiative;
                if (dropIndex === 0) {
                    // Dropping at the top
                    newInitiative = combatants[0].initiative + 2;
                } else if (dropIndex >= combatants.length) {
                    // Dropping at the bottom
                    newInitiative = combatants[combatants.length - 1].initiative - 1;
                } else {
                    // Dropping between combatants
                    const above = combatants[dropIndex - 1];
                    const below = combatants[dropIndex];
                    newInitiative = above.initiative - ((above.initiative - below.initiative) / 2);
                }

                // Update the initiative
                await game.combat.updateEmbeddedDocuments("Combatant", [{
                    _id: draggedId,
                    initiative: newInitiative
                }]);
            });
        });
        } // End GM-only drag and drop section

        // Process each combatant (for all users)
        html.find('.combatant').each((i, element) => {
            const combatant = $(element);
            const combatantId = combatant.data('combatantId');
            const actor = game.combat?.combatants.get(combatantId)?.actor;

            // Only proceed if we have a valid actor
            if (!actor) return;

            // Handle portrait vs token image
            if (getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
                updatePortrait(element);
            }

            // Add our button for GMs
            if (game.user.isGM && getSettingSafely(MODULE.ID, 'combatTrackerSetCurrentCombatant', false)) {
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
            if (getSettingSafely(MODULE.ID, 'combatTrackerShowHealthBar', false)) {
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
                if (currentHP <= 0 && getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
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
        },
        context: 'combat-tools' // For cleanup
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderCombatTracker", "combat-tools", true, false);
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

// ================================================================== 
// ===== COMBAT TOOLS CLASS ========================================
// ================================================================== 

class CombatTools {
    /**
     * Apply resizable settings to the combat tracker
     * @param {jQuery} html - The combat tracker HTML
     */
    static applyResizableSettings(html) {
        const combatPopout = document.querySelector('#combat-popout');
        if (!combatPopout) return;

        const isResizable = getSettingSafely(MODULE.ID, 'combatTrackerResizable', false);

        if (isResizable) {
            document.body.classList.add('combat-tracker-resizable');

            // Add resize handle if it doesn't exist
            if (!combatPopout.querySelector('.window-resizable-handle')) {
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'window-resizable-handle';
                resizeHandle.innerHTML = '<i class="fas fa-arrows-alt-h"></i>';
                combatPopout.appendChild(resizeHandle);
            }
        } else {
            document.body.classList.remove('combat-tracker-resizable');
            // Remove resize handle if it exists
            const existingHandle = combatPopout.querySelector('.window-resizable-handle');
            if (existingHandle) {
                existingHandle.remove();
            }
        }
    }
} 
