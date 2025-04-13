// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

export class MovementConfig extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'movement-config',
            template: 'modules/coffee-pub-blacksmith/templates/movement-window.hbs',
            title: 'Configure Movement',
            width: 300,
            height: 'auto',
            classes: ['coffee-pub-blacksmith', 'movement-config']
        });
    }

    getData() {
        // Check if user is GM or current leader
        const isGM = game.user.isGM;

        return {
            MovementTypes: [
                {
                    id: 'normal-movement',
                    name: 'Normal Movement',
                    description: 'Players can move their tokens on the canvas at will',
                    icon: 'fa-crown',
                },
                {
                    id: 'no-movement',
                    name: 'No Movement',
                    description: '{Players can not move toekns at all on the canvas.}',
                    icon: 'fa-check-circle'
                },
                {
                    id: 'combat-movement',
                    name: 'Combat Movement',
                    description: 'Players can only move their tokens during their turn in combat.',
                    icon: 'fa-hourglass-end'
                }
            ].filter(type => !type.gmOnly || isGM) // Filter out GM-only options for non-GMs
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add click handler for movement types
        html.find('.movement-type').click(async (event) => {
            const movementId = event.currentTarget.dataset.movementId;
            await this._handleMovementChange(movementId);
        });
    }

    async _handleMovementChange(movementId) {
        // Only GM can change movement
        if (!game.user.isGM) return;

        // Store the movement type in game settings
        await game.settings.set(MODULE_ID, 'movementType', movementId);

        // Get the movement type name for the notification
        const movementType = this.getData().MovementTypes.find(t => t.id === movementId);
        if (!movementType) return;

        // Post notification
        ui.notifications.info(`Movement type changed to: ${movementType.name}`);

        // Close the config window
        this.close();
    }

    // Helper method to get current movement type
    static getCurrentMovementType() {
        return game.settings.get(MODULE_ID, 'movementType') || 'normal-movement';
    }
} 

// Add hook to initialize movement restrictions
Hooks.once('init', () => {
    // Register hook for token movement
    Hooks.on('preUpdateToken', (token, changes, options, userId) => {
        // Skip if user is GM
        if (game.user.isGM) return true;

        const currentMovement = game.settings.get(MODULE_ID, 'movementType');
        
        // If no movement is allowed
        if (currentMovement === 'no-movement') {
            ui.notifications.warn("Token movement is currently disabled.");
            return false;
        }
        
        // If combat movement is enabled
        if (currentMovement === 'combat-movement') {
            const combat = game.combat;
            if (!combat?.started) {
                ui.notifications.warn("Token movement is only allowed during combat.");
                return false;
            }
            
            const currentCombatant = combat.current.tokenId;
            if (token.id !== currentCombatant) {
                ui.notifications.warn("You can only move tokens during your turn in combat.");
                return false;
            }
        }
        
        // Allow movement in all other cases
        return true;
    });
}); 