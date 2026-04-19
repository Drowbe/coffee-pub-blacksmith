// ==================================================================
// ===== IMPORTS ====================================================
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, isCurrentUserPartyLeader } from './api-core.js';
import { VoteManager } from "./manager-vote.js";
import { MenuBar } from "./api-menubar.js";
import { BlacksmithWindowBaseV2 } from './window-base.js';

export class VoteConfig extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'vote-config';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'vote-config',
            classes: ['coffee-pub-blacksmith', 'vote-config'],
            position: { width: 300, height: 'auto' },
            window: { title: 'Start a Vote', resizable: false, minimizable: false }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/vote-window.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    getData() {
        const isGM = game.user.isGM;
        const isLeader = isCurrentUserPartyLeader();
        const canStartVote = isGM || isLeader;

        if (!canStartVote) {
            ui.notifications.warn("Only the GM or party leader can start votes.");
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
                    gmOnly: true
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
            ].filter(type => !type.gmOnly || isGM)
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const nativeHtml = this.element;

        nativeHtml.querySelectorAll('.vote-type').forEach(button => {
            button.addEventListener('click', async (event) => {
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
                        let nativeDialogHtml = html;
                        if (html && (html.jquery || typeof html.find === 'function')) {
                            nativeDialogHtml = html[0] || html.get?.(0) || html;
                        }
                        const titleInput = nativeDialogHtml.querySelector('[name="title"]');
                        const optionsTextarea = nativeDialogHtml.querySelector('[name="options"]');
                        const title = titleInput ? titleInput.value.trim() : '';
                        const optionsText = optionsTextarea ? optionsTextarea.value.trim() : '';

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
            render: html => {
                let nativeDialogHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) {
                    nativeDialogHtml = html[0] || html.get?.(0) || html;
                }
                const titleInput = nativeDialogHtml.querySelector('[name="title"]');
                if (titleInput) {
                    titleInput.focus();
                }
            }
        });
        dialog.render(true);
    }
}
