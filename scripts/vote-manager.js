// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ThirdPartyManager } from './third-party.js';
import { ChatPanel } from './chat-panel.js';

export class VoteManager {
    static activeVote = null;

    static initialize() {
        postConsoleAndNotification("Vote Manager | Initializing", "", false, true, false);

        // Initialize activeVote
        this.activeVote = null;

        // Register Handlebars helper for checking current user's GM status
        Handlebars.registerHelper('isCurrentUserGM', function() {
            const isGM = game.user.isGM;
            postConsoleAndNotification("Vote Manager | Checking GM Status", 
                `Current User: ${game.user.name}\nIs GM: ${isGM}`, 
                false, true, false
            );
            return isGM;
        });

        // Register click handlers for vote cards
        Hooks.on('renderChatMessage', (message, html) => {
            if (message.flags?.['coffee-pub-blacksmith']?.isVoteCard) {
                // Vote button click handler
                html.find('.vote-button').click(async (event) => {
                    event.preventDefault();
                    const optionId = event.currentTarget.dataset.optionId;
                    await this.castVote(game.user.id, optionId);
                });

                // Handle close button visibility and click event
                const closeButton = html.find('.vote-controls');
                if (!game.user.isGM) {
                    closeButton.hide();
                } else {
                    closeButton.find('.close-vote').click(async (event) => {
                        event.preventDefault();
                        await this.closeVote();
                    });
                }

                // Add visual indicators for votes
                if (this.activeVote?.votes) {
                    const userVote = this.activeVote.votes[game.user.id];
                    html.find('.vote-button').each((i, button) => {
                        const $button = $(button);
                        const optionId = $button.data('optionId');
                        
                        if (userVote === optionId) {
                            // Add check mark to voted option
                            const $icon = $('<i class="fas fa-check" style="margin-left: 10px; color: #2d8a45;"></i>');
                            $button.append($icon);
                            $button.css({
                                'background': 'rgba(45, 138, 69, 0.1)',
                                'border-color': '#2d8a45',
                                'color': '#2d8a45',
                                'pointer-events': 'none'
                            });
                        } else if (userVote) {
                            // Style non-selected options when user has voted
                            $button.css({
                                'opacity': '0.6',
                                'cursor': 'not-allowed',
                                'pointer-events': 'none'
                            });
                        }
                    });
                }
            }
        });
    }

    /**
     * Start a new vote
     * @param {string} type - The type of vote (e.g., 'leader')
     * @param {Object} [customData] - Custom vote data for custom votes
     * @returns {Promise<void>}
     */
    static async startVote(type, customData = null) {
        postConsoleAndNotification("Vote Manager | Starting vote", `Type: ${type}, Current activeVote: ${JSON.stringify(this.activeVote)}`, false, true, false);
        
        // Only GM can start votes for now
        if (!game.user.isGM) {
            ui.notifications.warn("Only the GM can start votes at this time.");
            return;
        }

        if (this.activeVote) {
            ui.notifications.warn("There is already an active vote in progress.");
            return;
        }

        this.activeVote = {
            id: randomID(),
            type: type,
            startTime: Date.now(),
            votes: {},
            isActive: true,
            initiator: game.user.id
        };

        // Set options based on vote type
        if (type === 'leader') {
            this.activeVote.options = game.users
                .filter(u => u.active && !u.isGM)
                .map(u => ({
                    id: u.id,
                    name: u.name
                }));
        } else if (type === 'yesno') {
            this.activeVote.options = [
                { id: 'yes', name: 'Yes' },
                { id: 'no', name: 'No' }
            ];
        } else if (type === 'endtime') {
            this.activeVote.options = [
                { id: 'now', name: 'Stop now' },
                { id: 'endround', name: 'End of this round' },
                { id: 'endcombat', name: 'End of combat' },
                { id: '30min', name: '30 more minutes' },
                { id: 'passout', name: 'Only if I pass out' }
            ];
        } else if (type === 'engagement') {
            this.activeVote.options = [
                { id: 'combat', name: 'I want to hit stuff' },
                { id: 'talk', name: 'Let\'s talk to them' },
                { id: 'avoid', name: 'I prefer to avoid this' },
                { id: 'flexible', name: 'I can roll with whatever' }
            ];
        } else if (type === 'custom' && customData) {
            this.activeVote.options = customData.options;
            this.activeVote.title = customData.title;
        }

        // Create the chat message first
        await this._createVoteMessage();

        // Then notify other clients with the complete vote data
        const socket = ThirdPartyManager.getSocket();
        await socket.executeForOthers("receiveVoteStart", {
            voteData: this.activeVote,
            messageId: this.activeVote.messageId
        });
    }

    /**
     * Check if all eligible players have voted
     * @returns {boolean} True if all eligible players have voted
     */
    static _haveAllPlayersVoted() {
        // Get all active non-GM players
        const eligibleVoters = game.users.filter(u => u.active && !u.isGM);
        const totalVoters = eligibleVoters.length;
        
        // Count actual votes
        const actualVotes = Object.keys(this.activeVote.votes).length;
        
        return actualVotes >= totalVoters;
    }

    /**
     * Cast a vote
     * @param {string} voterId - The ID of the user casting the vote
     * @param {string} choiceId - The ID of the chosen option
     */
    static async castVote(voterId, choiceId) {
        if (!this.activeVote?.isActive) {
            ui.notifications.warn("No active vote to participate in.");
            return;
        }

        // Record the vote
        this.activeVote.votes[voterId] = choiceId;

        // If this is the GM who created the vote, update the message
        if (game.user.isGM && game.user.id === this.activeVote.initiator) {
            await this._updateVoteMessage();
            
            // Check if everyone has voted and close automatically if they have
            if (this._haveAllPlayersVoted()) {
                await this.closeVote();
            }
        }

        // Notify other clients
        const socket = ThirdPartyManager.getSocket();
        await socket.executeForOthers("receiveVoteUpdate", {
            votes: this.activeVote.votes
        });
    }

    /**
     * Close the current vote and display results
     */
    static async closeVote() {
        if (!this.activeVote || !this.activeVote.isActive) {
            ui.notifications.warn("No active vote to close.");
            return;
        }

        this.activeVote.isActive = false;
        this.activeVote.endTime = Date.now();

        // Calculate results
        const results = this._calculateResults();
        this.activeVote.results = results;

        // Update the vote message to show results
        await this._updateVoteMessage();

        // If this was a leader vote and we have a winner, update the leader
        if (this.activeVote.type === 'leader' && results.winner) {
            await ChatPanel.setNewLeader(results.winner);
        }

        // Notify other clients
        const socket = ThirdPartyManager.getSocket();
        await socket.executeForOthers("receiveVoteClose", {
            results: results
        });

        // Clear the active vote
        this.activeVote = null;
    }

    /**
     * Calculate the results of the current vote
     * @returns {Object} The vote results
     */
    static _calculateResults() {
        const votes = this.activeVote.votes;
        const tally = {};
        let maxVotes = 0;
        let winner = null;
        let tiedWinners = [];
        const totalVotes = Object.keys(votes).length;

        // First, create a map of option IDs to names
        const optionNames = {};
        this.activeVote.options.forEach(option => {
            optionNames[option.id] = option.name;
        });

        // Count votes and include names
        Object.values(votes).forEach(vote => {
            if (!tally[vote]) {
                tally[vote] = {
                    count: 0,
                    name: optionNames[vote]
                };
            }
            tally[vote].count += 1;
            if (tally[vote].count > maxVotes) {
                maxVotes = tally[vote].count;
                winner = vote;
                tiedWinners = [vote];
            } else if (tally[vote].count === maxVotes) {
                tiedWinners.push(vote);
                // Only clear winner for non-leader votes
                if (this.activeVote.type !== 'leader') {
                    winner = null;
                }
            }
        });

        // For leader votes, if there's a tie, prompt GM to choose
        if (this.activeVote.type === 'leader' && tiedWinners.length > 1) {
            this._promptGMForTieBreaker(tiedWinners.map(id => ({
                id,
                name: optionNames[id]
            })));
            winner = null; // Clear winner until GM chooses
        }

        return {
            tally: tally,
            winner: winner,
            totalVotes: totalVotes,
            tiedWinners: tiedWinners.length > 1 ? tiedWinners : null
        };
    }

    /**
     * Prompt the GM to choose between tied leaders
     * @param {Array} tiedCandidates - Array of tied candidates with their IDs and names
     * @private
     */
    static async _promptGMForTieBreaker(tiedCandidates) {
        if (!game.user.isGM) return;

        const dialog = new Dialog({
            title: "Leader Vote Tie",
            content: `
                <h3>There was a tie for leader. Please select the winner:</h3>
                <div class="form-group">
                    <select id="tie-breaker-select">
                        ${tiedCandidates.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
            `,
            buttons: {
                choose: {
                    icon: '<i class="fas fa-crown"></i>',
                    label: "Choose Leader",
                    callback: async (html) => {
                        const selectedId = html.find('#tie-breaker-select').val();
                        await ChatPanel.setNewLeader(selectedId);
                        this.activeVote.results.winner = selectedId;
                        await this._updateVoteMessage();
                    }
                }
            },
            default: "choose"
        });
        dialog.render(true);
    }

    /**
     * Get the current voting progress
     * @returns {Object} Object containing current and total voter counts
     */
    static _getVotingProgress() {
        const eligibleVoters = game.users.filter(u => u.active && !u.isGM);
        return {
            current: Object.keys(this.activeVote.votes).length,
            total: eligibleVoters.length
        };
    }

    /**
     * Create the initial vote message in chat
     */
    static async _createVoteMessage() {
        // Only GM should create messages
        if (!game.user.isGM) return;

        const messageData = {
            vote: this.activeVote,
            userId: game.user.id,
            progress: this._getVotingProgress(),
            currentUserIsGM: game.user.isGM
        };

        postConsoleAndNotification("Vote Manager | Template Data", 
            `Template Variables:\n` +
            `-------------------\n` +
            `userId: ${messageData.userId}\n` +
            `currentUserIsGM: ${messageData.currentUserIsGM}\n` +
            `vote.type: ${messageData.vote.type}\n` +
            `vote.votes: ${JSON.stringify(messageData.vote.votes, null, 2)}\n` +
            `vote.options: ${JSON.stringify(messageData.vote.options, null, 2)}`,
            false, true, false
        );

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData
        );

        // Get the GM user for the speaker
        const gmUser = game.users.find(u => u.isGM);
        
        // Create a single message from the GM
        const message = await ChatMessage.create({
            content: content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            speaker: ChatMessage.getSpeaker({ user: gmUser }),
            whisper: [], // Empty array means visible to all
            flags: {
                'coffee-pub-blacksmith': {
                    isVoteCard: true,
                    voteId: this.activeVote.id
                }
            }
        });

        this.activeVote.messageId = message.id;
    }

    /**
     * Update the vote message in chat
     */
    static async _updateVoteMessage() {
        if (!this.activeVote?.messageId) return;

        const message = game.messages.get(this.activeVote.messageId);
        if (!message) return;

        const messageData = {
            vote: this.activeVote,
            userId: game.user.id,
            progress: this._getVotingProgress(),
            currentUserIsGM: game.user.isGM
        };

        postConsoleAndNotification("Vote Manager | Template Data", 
            `Template Variables:\n` +
            `-------------------\n` +
            `userId: ${messageData.userId}\n` +
            `currentUserIsGM: ${messageData.currentUserIsGM}\n` +
            `vote.type: ${messageData.vote.type}\n` +
            `vote.votes: ${JSON.stringify(messageData.vote.votes, null, 2)}\n` +
            `vote.options: ${JSON.stringify(messageData.vote.options, null, 2)}`,
            false, true, false
        );

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData
        );

        await message.update({ content: content });
    }

    /**
     * Handle receiving a new vote start from another client
     * @param {Object} data - The vote data and message ID
     */
    static async receiveVoteStart(data) {
        postConsoleAndNotification("Vote Manager | Receiving vote start", data, false, true, false);
        
        // Update our local vote state with the complete data
        this.activeVote = data.voteData;
        
        // No need to create or update messages - just use the GM's message
    }

    /**
     * Handle receiving a vote update from another client
     * @param {Object} data - The update data containing votes
     */
    static async receiveVoteUpdate(data) {
        if (!this.activeVote) return;

        // Update our local vote state
        this.activeVote.votes = data.votes;
        
        // Only the GM who created the vote updates the message
        if (game.user.isGM && game.user.id === this.activeVote.initiator) {
            await this._updateVoteMessage();
            
            // Check if everyone has voted and close automatically if they have
            if (this._haveAllPlayersVoted()) {
                await this.closeVote();
            }
        }
    }

    /**
     * Handle receiving a vote close from another client
     * @param {Object} data - The close data containing results
     */
    static async receiveVoteClose(data) {
        if (!this.activeVote) return;

        this.activeVote.isActive = false;
        this.activeVote.endTime = Date.now();
        this.activeVote.results = data.results;

        // Only the GM who created the vote updates the message
        if (game.user.isGM && game.user.id === this.activeVote.initiator) {
            await this._updateVoteMessage();

            // If this was a leader vote and we have a winner, update the leader
            if (this.activeVote.type === 'leader' && data.results.winner) {
                // TODO: Update party leader through ChatPanel
            }
        }

        // Clear the active vote
        this.activeVote = null;
    }
} 