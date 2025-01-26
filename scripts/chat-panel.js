// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_ID } from './const.js';

class ChatPanel {
    static ID = 'chat-panel';
    static currentLeader = null;
    static isLoading = true;

    static initialize() {
        // Load the template
        loadTemplates(['modules/coffee-pub-blacksmith/templates/chat-panel.hbs']);

        // Set up socket listener for leader updates
        game.socket.on(`module.${MODULE_ID}`, (data) => {
            if (data.type === 'updateLeader') {
                console.log("Blacksmith | Chat Panel: Received leader update:", data.leader);
                this.currentLeader = data.leader;
                this.updateLeaderDisplay();
            }
        });

        // Set up the render hook for the panel
        Hooks.on('renderChatLog', (app, html, data) => {
            this._onRenderChatLog(app, html, data);
        });

        // Load the leader after Foundry is ready
        Hooks.once('ready', async () => {
            await this.loadLeader();
            this.isLoading = false;
            this.updateLeaderDisplay();
        });
    }

    static async _onRenderChatLog(app, html, data) {
        try {
            console.log("Blacksmith | Chat Panel: Rendering chat panel");
            
            // Find the chat log element
            const chatLog = html.find('#chat-log');
            if (!chatLog.length) return;

            // Prepare template data
            const templateData = {
                isGM: game.user.isGM,
                leaderText: this.getLeaderDisplayText()
            };

            // Render the template
            const panelHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-panel.hbs', templateData);

            // Remove any existing panel before adding the new one
            html.find('.blacksmith-chat-panel').remove();
            
            // Insert before the chat log
            chatLog.before(panelHtml);

            // Add click handler for GM only
            if (game.user.isGM) {
                const crownIcon = html.find('.leader-icon');
                crownIcon.on('click', () => this.showLeaderDialog());
            }

        } catch (error) {
            console.error("Blacksmith | Chat Panel: Error rendering panel:", error);
        }
    }

    static getLeaderDisplayText() {
        if (this.isLoading) return "Loading...";
        return this.currentLeader || "Choose a Leader...";
    }

    static updateLeaderDisplay() {
        const leaderSpan = document.querySelector('.party-leader');
        if (leaderSpan) {
            leaderSpan.textContent = this.getLeaderDisplayText();
        }
    }

    static async showLeaderDialog() {
        // Get all connected players (excluding GM)
        const players = game.users.filter(user => !user.isGM);
        
        // Create the dialog content
        const content = `
            <form>
                <div class="form-group">
                    <label>Select Party Leader:</label>
                    <select name="leader" id="leader-select">
                        <option value="">None</option>
                        ${players.map(p => `<option value="${p.id}" ${this.currentLeader === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
            </form>
        `;

        // Show the dialog
        new Dialog({
            title: "Set Party Leader",
            content: content,
            buttons: {
                set: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Set Leader",
                    callback: async (html) => {
                        const selectedId = html.find('#leader-select').val();
                        const selectedUser = game.users.get(selectedId);
                        this.currentLeader = selectedId ? selectedUser.name : null;
                        
                        // Store the selection in settings
                        await game.settings.set(MODULE_ID, 'partyLeader', selectedId);
                        
                        // Update all clients
                        game.socket.emit(`module.${MODULE_ID}`, {
                            type: 'updateLeader',
                            leader: this.currentLeader
                        });
                        
                        // Update the display without full re-render
                        this.updateLeaderDisplay();
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "set"
        }).render(true);
    }

    static async loadLeader() {
        try {
            const leaderId = await game.settings.get(MODULE_ID, 'partyLeader');
            console.log("Blacksmith | Chat Panel: Loading leader, found ID:", leaderId);
            
            if (leaderId) {
                const leader = game.users.get(leaderId);
                if (leader) {
                    this.currentLeader = leader.name;
                    console.log("Blacksmith | Chat Panel: Set current leader to:", this.currentLeader);
                } else {
                    console.log("Blacksmith | Chat Panel: Could not find user with ID:", leaderId);
                    this.currentLeader = null;
                }
            } else {
                console.log("Blacksmith | Chat Panel: No leader ID found in settings");
                this.currentLeader = null;
            }
        } catch (error) {
            console.error("Blacksmith | Chat Panel: Error loading leader:", error);
            this.currentLeader = null;
        }
    }
}

export { ChatPanel }; 