// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ThirdPartyManager } from './third-party.js';

export class VoteManager {
    static activeVote = null;

    static initialize() {
        postConsoleAndNotification("Vote Manager | Initializing", "", false, true, false);

        // Initialize activeVote
        this.activeVote = null;

        // Register click handlers for vote cards
        Hooks.on('renderChatMessage', (message, html) => {
            if (message.flags?.['coffee-pub-blacksmith']?.isVoteCard) {
                // Vote button click handler
                html.find('.vote-button').click(async (event) => {
                    event.preventDefault();
                    const optionId = event.currentTarget.dataset.optionId;
                    await this.castVote(game.user.id, optionId);
                });

                // Close vote button click handler (GM only)
                if (game.user.isGM) {
                    html.find('.close-vote').click(async (event) => {
                        event.preventDefault();
                        await this.closeVote();
                    });
                }
            }
        });
    }

    /**
     * Start a new vote
     * @param {string} type - The type of vote (e.g., 'leader')
     * @returns {Promise<void>}
     */
    static async startVote(type) {
        postConsoleAndNotification("Vote Manager | Starting vote", `Type: ${type}, Current activeVote: ${JSON.stringify(this.activeVote)}`, false, true, false);
        
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

        // For leader vote, get all online players as options
        if (type === 'leader') {
            this.activeVote.options = game.users
                .filter(u => u.active && !u.isGM)
                .map(u => ({
                    id: u.id,
                    name: u.name
                }));
        }

        // Send vote to chat
        await this._createVoteMessage();

        // Notify other clients
        const socket = ThirdPartyManager.getSocket();
        await socket.executeForOthers("receiveVoteStart", this.activeVote);
    }

    /**
     * Cast a vote
     * @param {string} voterId - The ID of the user casting the vote
     * @param {string} choiceId - The ID of the chosen option
     */
    static async castVote(voterId, choiceId) {
        if (!this.activeVote || !this.activeVote.isActive) {
            ui.notifications.warn("No active vote to participate in.");
            return;
        }

        // Record the vote
        this.activeVote.votes[voterId] = choiceId;

        // Update the vote message in chat
        await this._updateVoteMessage();

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

        // If this was a leader vote, update the leader
        if (this.activeVote.type === 'leader' && results.winner) {
            // TODO: Update party leader through ChatPanel
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

        // Count votes
        Object.values(votes).forEach(vote => {
            tally[vote] = (tally[vote] || 0) + 1;
            if (tally[vote] > maxVotes) {
                maxVotes = tally[vote];
                winner = vote;
            }
        });

        return {
            tally: tally,
            winner: winner,
            totalVotes: Object.keys(votes).length
        };
    }

    /**
     * Create the initial vote message in chat
     */
    static async _createVoteMessage() {
        const messageData = {
            vote: this.activeVote,
            isGM: game.user.isGM,
            userId: game.user.id
        };

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData
        );

        // Store the message for later updates
        const message = await ChatMessage.create({
            content: content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            speaker: ChatMessage.getSpeaker(),
            flags: {
                'coffee-pub-blacksmith': {
                    isVoteCard: true
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
            isGM: game.user.isGM,
            userId: game.user.id
        };

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData
        );

        await message.update({ content: content });
    }

    /**
     * Handle receiving a new vote start from another client
     * @param {Object} voteData - The vote data
     */
    static async receiveVoteStart(voteData) {
        // Update our local vote state
        this.activeVote = voteData;
        
        // Create the vote message in chat
        await this._createVoteMessage();
    }

    /**
     * Handle receiving a vote update from another client
     * @param {Object} data - The update data containing votes
     */
    static async receiveVoteUpdate(data) {
        if (!this.activeVote) return;

        // Update our local vote state
        this.activeVote.votes = data.votes;
        
        // Update the vote message in chat
        await this._updateVoteMessage();
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

        // Update the vote message to show results
        await this._updateVoteMessage();

        // If this was a leader vote and we have a winner, update the leader
        if (this.activeVote.type === 'leader' && data.results.winner) {
            // TODO: Update party leader through ChatPanel
        }

        // Clear the active vote
        this.activeVote = null;
    }
} 