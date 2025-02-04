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
                },
                {
                    id: 'yesno',
                    name: 'Yes or No',
                    description: 'Simple yes or no vote for quick decisions.',
                    icon: 'fa-check-circle'
                },
                {
                    id: 'endtime',
                    name: 'End Time',
                    description: 'Vote on when to end the current session.',
                    icon: 'fa-hourglass-end'
                },
                {
                    id: 'engagement',
                    name: 'Engagement',
                    description: 'Vote on how to approach the current situation.',
                    icon: 'fa-people-arrows'
                },
                {
                    id: 'custom',
                    name: 'Custom Vote',
                    description: 'Create your own vote with custom options.',
                    icon: 'fa-plus-circle'
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
            
            if (type === 'custom') {
                this.createCustomVote();
            } else {
                await VoteManager.startVote(type);
                this.close();
            }
        });
    }

    async createCustomVote() {
        const dialog = new Dialog({
            title: "Create Custom Vote",
            content: `
                <div class="form-group">
                    <label>Vote Title:</label>
                    <input type="text" name="title" placeholder="Enter vote title">
                </div>
                <div class="form-group">
                    <label>Options (one per line):</label>
                    <textarea name="options" rows="5" placeholder="Enter each option on a new line"></textarea>
                </div>
            `,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create Vote",
                    callback: async (html) => {
                        const title = html.find('[name="title"]').val().trim();
                        const optionsText = html.find('[name="options"]').val().trim();
                        
                        if (!title || !optionsText) {
                            ui.notifications.warn("Please provide both a title and options.");
                            return;
                        }

                        const options = optionsText.split('\n')
                            .map(opt => opt.trim())
                            .filter(opt => opt)
                            .map((opt, index) => ({
                                id: `custom_${index}`,
                                name: opt
                            }));

                        if (options.length < 2) {
                            ui.notifications.warn("Please provide at least two options.");
                            return;
                        }

                        await VoteManager.startVote('custom', {
                            title: title,
                            options: options
                        });
                        this.close();
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "create",
            render: html => html.find('[name="title"]').focus()
        });
        dialog.render(true);
    }
} 