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
        
        // Find all combatant control groups (v13: html is native DOM element)
        const controlGroups = html.querySelectorAll('.combatant-controls');
        if (!controlGroups.length) return;

        // Set up observer for portrait changes if enabled
        if (getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' || mutation.type === 'attributes') {
                        // v13: Use native DOM closest() instead of jQuery
                        const combatant = mutation.target.closest('.combatant');
                        if (combatant) {
                            updatePortrait(combatant);
                        }
                    }
                });
            });

            // Observe the combat tracker for changes (v13: html is native DOM)
            // v13: Changed from .directory-list to .combat-tracker
            const combatTracker = html.querySelector('.combat-tracker') || html.querySelector('.directory-list');
            if (combatTracker) {
                observer.observe(combatTracker, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src']
                });
            }
        }

        // Make combatants draggable for GM only
        if (game.user.isGM) {
            // v13: Changed from .directory-list to .combat-tracker (ol.combat-tracker.plain)
            const directoryList = html.querySelector('.combat-tracker') || html.querySelector('.directory-list');
            const combatants = html.querySelectorAll('.combatant');

        // First, clear any existing drop targets (v13: native DOM)
        html.querySelectorAll('.drop-target').forEach(target => target.remove());

        // Add drop targets between combatants (v13: native DOM)
        combatants.forEach((element) => {
            const dropTarget = document.createElement('li');
            dropTarget.className = 'drop-target';
            element.insertAdjacentElement('beforebegin', dropTarget);
        });
        // Add final drop target at the end
        if (directoryList) {
            const finalDropTarget = document.createElement('li');
            finalDropTarget.className = 'drop-target';
            directoryList.appendChild(finalDropTarget);
        }

        // Make combatants draggable (v13: native DOM forEach)
        combatants.forEach((element) => {
            element.setAttribute('draggable', 'true');
            element.addEventListener('dragstart', (ev) => {
                // v13: Use currentTarget to get the combatant element, not the child that was clicked
                const combatantElement = ev.currentTarget;
                const combatantId = combatantElement.dataset.combatantId;
                if (!combatantId) return;
                
                ev.dataTransfer.setData('text/plain', combatantId);
                combatantElement.classList.add('dragging');
                
                // v13: Find combat tracker by class or ID
                const combatTracker = html.querySelector('.combat-tracker') || html.querySelector('#combat-tracker');
                if (combatTracker) combatTracker.classList.add('dragging-active');
            });

            element.addEventListener('dragend', (ev) => {
                ev.currentTarget.classList.remove('dragging');
                html.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                
                // v13: Find combat tracker by class or ID
                const combatTracker = html.querySelector('.combat-tracker') || html.querySelector('#combat-tracker');
                if (combatTracker) combatTracker.classList.remove('dragging-active');
            });
        });

        // Add drop handlers to drop targets (v13: native DOM)
        html.querySelectorAll('.drop-target').forEach((element) => {
            element.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const draggingElement = html.querySelector('.dragging');
                if (draggingElement) {
                    html.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    element.classList.add('drag-over');
                }
            });

            element.addEventListener('dragenter', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
            });

            element.addEventListener('dragleave', (ev) => {
                element.classList.remove('drag-over');
            });

            element.addEventListener('drop', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const draggedId = ev.dataTransfer.getData('text/plain');
                
                if (!draggedId) return;
                
                // Remove drag-over styling
                html.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                
                // Get all combatants in current order
                // Skip if combat doesn't exist (combat might have been deleted)
                if (!game.combat || !game.combats.has(game.combat.id)) return;
                
                const combatants = game.combat.turns;
                if (!combatants) return;

                const draggedIndex = combatants.findIndex(c => c.id === draggedId);
                if (draggedIndex === -1) return;

                // Calculate drop index based on the drop target's position (v13: native DOM)
                const dropTargets = Array.from(html.querySelectorAll('.drop-target'));
                const dropIndex = dropTargets.indexOf(element);
                
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

        // Process each combatant (for all users) (v13: native DOM)
        html.querySelectorAll('.combatant').forEach((element) => {
            // v13: Use dataset instead of jQuery data()
            const combatantId = element.dataset.combatantId;
            const actor = game.combat?.combatants.get(combatantId)?.actor;

            // Only proceed if we have a valid actor
            if (!actor) return;

            // Handle portrait vs token image
            if (getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
                updatePortrait(element);
            }

            // Add our button for GMs (v13: native DOM)
            if (game.user.isGM && getSettingSafely(MODULE.ID, 'combatTrackerSetCurrentCombatant', false)) {
                const controls = element.querySelector('.combatant-controls');
                if (controls) {
                    const button = document.createElement('a');
                    button.className = 'combatant-control';
                    button.setAttribute('aria-label', 'Set as Current');
                    button.setAttribute('role', 'button');
                    button.setAttribute('data-tooltip', 'Set as Current Combatant');
                    button.setAttribute('data-control', 'setAsCurrent');
                    button.innerHTML = '<i class="fas fa-bullseye"></i>';

                    button.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (game.combat) {
                            await game.combat.update({turn: game.combat.turns.findIndex(t => t.id === combatantId)});
                        }
                    });

                    controls.insertBefore(button, controls.firstChild);
                }
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

                // Create container div if it doesn't exist (v13: native DOM)
                // Insert it right before the token image to ensure proper stacking
                let container = element.querySelector('.health-ring-container');
                const tokenImage = element.querySelector('.token-image');
                if (!container) {
                    container = document.createElement('div');
                    container.className = 'health-ring-container';
                    if (tokenImage && tokenImage.parentNode) {
                        tokenImage.parentNode.insertBefore(container, tokenImage);
                    } else {
                        element.insertBefore(container, element.firstChild);
                    }
                }

                // Create SVG for health ring (v13: native DOM)
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', size);
                svg.setAttribute('height', size);
                // SVG elements use setAttribute for class, not className property
                svg.setAttribute('class', healthClass);
                
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', size/2);
                circle.setAttribute('cy', size/2);
                circle.setAttribute('r', radius);
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke-width', strokeWidth);
                circle.setAttribute('stroke-dasharray', circumference);
                circle.setAttribute('stroke-dashoffset', dashOffset);
                circle.setAttribute('transform', `rotate(-90, ${size/2}, ${size/2})`);
                if (currentHP > 0) {
                    circle.setAttribute('style', 'transition: stroke-dashoffset 0.3s ease-in-out, stroke 0.3s ease-in-out');
                }
                svg.appendChild(circle);

                // Update the ring and handle dead state (v13: native DOM)
                container.innerHTML = '';
                container.appendChild(svg);

                // Add dead class and skull overlay if HP is 0 or less (v13: native DOM)
                if (currentHP <= 0 && getSettingSafely(MODULE.ID, 'combatTrackerShowPortraits', false)) {
                    element.classList.add('portrait-dead');
                    // Add skull overlay to the initiative div if it doesn't exist
                    const initiativeDiv = element.querySelector('.token-initiative');
                    if (initiativeDiv && !initiativeDiv.querySelector('.portrait-dead-overlay')) {
                        const skullOverlay = document.createElement('i');
                        skullOverlay.className = 'fas fa-skull portrait-dead-overlay';
                        initiativeDiv.appendChild(skullOverlay);
                    }
                } else {
                    element.classList.remove('portrait-dead');
                    const overlay = element.querySelector('.portrait-dead-overlay');
                    if (overlay) overlay.remove();
                }
            }
        });
        },
        context: 'combat-tools' // For cleanup
    });
    
    // Log hook registration
    postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderCombatTracker", "combat-tools", true, false);
});


// Function to update portrait (v13: native DOM)
const updatePortrait = (element) => {
    // v13: element is already a native DOM element
    const combatantId = element.dataset.combatantId;
    const actor = game.combat?.combatants.get(combatantId)?.actor;
    
    if (!actor) return;
    
    const img = element.querySelector('img.token-image');
    if (img) {
        const portraitPath = actor.img || actor.prototypeToken.texture.src;
        if (portraitPath && img.getAttribute('src') !== portraitPath) {
            img.setAttribute('src', portraitPath);
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
        const isResizable = getSettingSafely(MODULE.ID, 'combatTrackerResizable', false);
        
        // Always check for popout in document, regardless of html parameter
        // The popout might exist even if the hook is running for the sidebar
        let combatPopout = document.querySelector('#combat-popout');
        
        // If popout exists, apply settings to it
        if (combatPopout) {
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
        } else {
            // No popout found - remove class and handle if setting is disabled
            if (!isResizable) {
                document.body.classList.remove('combat-tracker-resizable');
            }
        }
    }
} 
