// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { VoteManager } from "./vote-manager.js";

export class VoteConfig extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'vote-config',
            template: 'modules/coffee-pub-blacksmith/templates/vote-config.hbs',
            title: 'Start a Vote',
            width: 300,
            height: 'auto',
            classes: ['coffee-pub-blacksmith', 'vote-config']
        });
    }

    getData() {
        return {
            fixedVoteTypes: [
                {
                    id: 'leader',
                    name: 'Select a Leader',
                    description: 'Vote for a party leader from among the active players.',
                    icon: 'fa-crown'
                }
                // Add more vote types here as needed
            ]
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.vote-type').click(async (event) => {
            event.preventDefault();
            const type = event.currentTarget.dataset.type;
            await VoteManager.startVote(type);
            this.close();
        });
    }
} 