// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

export class VoteConfig extends Application {
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

        
    }

} 