// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-common.js';
import { VoteManager } from "./vote-manager.js";
import { ChatPanel } from "./chat-panel.js";

export class VoteConfig extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'vote-config',
            template: 'modules/coffee-pub-blacksmith/templates/vote-window.hbs',
            title: 'Start a Vote',
            width: 300,
            height: 'auto',
            classes: ['coffee-pub-blacksmith', 'vote-config']
        });
    }

    getData() {
        // Check if user is GM or current leader
        const isGM = game.user.isGM;
        const leaderId = game.settings.get(MODULE.ID, 'partyLeader');
        const isLeader = game.user.id === leaderId;
        const canStartVote = isGM || isLeader;

        if (!canStartVote) {
            ui.notifications.warn("Only the GM or party leader can start votes.");
            this.close();
            return {};
        }

        // Check if user is excluded
        const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsersChatPanel').split(',').map(id => id.trim());
        const isExcluded = excludedUsers.includes(game.user.id) || excludedUsers.includes(game.user.name);

        if (isExcluded && !isGM) {
            ui.notifications.warn("You are excluded from participating in votes.");
            this.close();
            return {};
        }

        return {
            fixedVoteTypes: [
                {
                    id: 'leader',
                    name: 'Select a Leader',
                    description: 'Vote for a party leader from among the active players.',
                    icon: 'fa-crown',
                    gmOnly: true // Only GM can start leader votes
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
                    name: 'Party Plan',
                    description: 'Vote on how to approach the current situation.',
                    icon: 'fa-people-arrows'
                },
                {
                    id: 'characters',
                    name: 'Character Vote',
                    description: 'Vote on characters from various sources.',
                    icon: 'fa-users'
                },
                {
                    id: 'custom',
                    name: 'Custom Vote',
                    description: 'Create your own vote with custom options.',
                    icon: 'fa-plus-circle'
                }
            ].filter(type => !type.gmOnly || isGM) // Filter out GM-only options for non-GMs
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.vote-type').click(async (event) => {
            event.preventDefault();
            const type = event.currentTarget.dataset.type;
            


            if (type === 'leader' && !game.user.isGM) {
                ui.notifications.warn("Only the GM can start leader votes.");
                return;
            }
            
            if (type === 'custom') {
                this.createCustomVote();
            } else if (type === 'characters') {
                try {
                    await VoteManager._showCharacterVoteDialog();
                    this.close();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Error starting character vote:', error, false, false);
                    ui.notifications.error("Error starting character vote. Check the console for details.");
                }
            } else {
                try {
                    await VoteManager.startVote(type);
                    this.close();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Error starting vote:', error, false, false);
                    ui.notifications.error("Error starting vote. Check the console for details.");
                }
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