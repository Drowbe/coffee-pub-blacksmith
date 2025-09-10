// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, getSettingSafely } from './api-common.js';
import { SocketManager } from './manager-sockets.js';
import { ChatPanel } from './chat-panel.js';
import { HookManager } from './manager-hooks.js';

export class VoteManager {
    static activeVote = null;

    /**
     * Check if a user is excluded from voting
     * @param {string} userId - The ID of the user to check
     * @returns {boolean} True if the user is excluded
     */
    static _isUserExcluded(userId) {
        const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsersChatPanel').split(',').map(id => id.trim());
        const user = game.users.get(userId);
        return excludedUsers.includes(userId) || excludedUsers.includes(user?.name);
    }

    static initialize() {


        // Initialize activeVote
        this.activeVote = null;

        // Register Handlebars helper for checking current user's GM status
        Handlebars.registerHelper('isCurrentUserGM', function() {
            const isGM = game.user.isGM;
            postConsoleAndNotification(MODULE.NAME, "Vote Manager | Checking GM Status", 
                `Current User: ${game.user.name}\nIs GM: ${isGM}`, 
                true, false
            );
            return isGM;
        });

        // Register helper to get list of voters
        Handlebars.registerHelper('getVoterList', function(votes) {
            if (!votes) return '';

            // Get all active non-GM players who aren't excluded
            const allPlayers = game.users.filter(u => u.active && !u.isGM && !VoteManager._isUserExcluded(u.id));
            
            // Split into voted and not voted
            const votedPlayers = allPlayers.filter(u => votes[u.id]);
            const notVotedPlayers = allPlayers.filter(u => !votes[u.id]);

            let html = '<div style="text-align: left;">';
            
            // Add voted players section if any have voted
            if (votedPlayers.length > 0) {
                html += '<b>Voted:</b><ul style="margin: 0; padding-left: 15px;">';
                html += votedPlayers.map(u => `<li>${u.name}</li>`).join('');
                html += '</ul>';
            }

            // Add not voted players section if any haven't voted
            if (notVotedPlayers.length > 0) {
                if (votedPlayers.length > 0) html += '<br>'; // Add spacing if there were voters
                html += '<b>Not Voted:</b><ul style="margin: 0; padding-left: 15px;">';
                html += notVotedPlayers.map(u => `<li>${u.name}</li>`).join('');
                html += '</ul>';
            }

            html += '</div>';
            return html;
        });

        // Register helper to get vote details for completed votes
        Handlebars.registerHelper('getVoteDetails', function(votes, options) {
            if (!votes || !options) return '';
            
            // Create a map of option IDs to names
            const optionNames = {};
            options.forEach(opt => optionNames[opt.id] = opt.name);
            
            // Get vote details for each voter
            const voteDetails = Object.entries(votes)
                .filter(([userId]) => !game.users.get(userId)?.isGM)
                .map(([userId, voteId]) => {
                    const userName = game.users.get(userId)?.name;
                    const voteName = optionNames[voteId];
                    return `<li><b>${userName}</b>: ${voteName}</li></li>`;
                })
                .filter(Boolean);
            
            return '<div style="text-align: left;"><b>RESULTS</b><br><br><ul>' + voteDetails.join('<br>') + '</ul></div>';
        });

        // Register click handlers for vote cards
        const renderChatMessageHookId = HookManager.registerHook({
            name: 'renderChatMessage',
            description: 'Vote Manager: Handle vote card interactions and button styling',
            context: 'vote-manager-chat',
            priority: 3, // Normal priority - UI interaction
            callback: (message, html) => {
                if (message.flags?.['coffee-pub-blacksmith']?.isVoteCard) {
                    // Vote button click handler
                    html.find('.vote-button').click(async (event) => {
                        event.preventDefault();
                        // Prevent GMs from voting
                        if (game.user.isGM) {
                            ui.notifications.warn("GMs cannot participate in voting.");
                            return;
                        }
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

                    // Add visual indicators for votes and GM status
                    if (this.activeVote?.votes) {
                        const userVote = this.activeVote.votes[game.user.id];
                        html.find('.vote-button').each((i, button) => {
                            const $button = $(button);
                            const optionId = $button.data('optionId');
                            
                            // Disable buttons for GMs
                            if (game.user.isGM) {
                                $button.prop('disabled', true);
                                $button.css({
                                    'opacity': '0.6',
                                    'cursor': 'not-allowed',
                                    'pointer-events': 'none'
                                });
                            } else if (userVote === optionId) {
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
            }
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderChatMessage", "vote-manager-chat", true, false);
    }

    /**
     * Start a new vote
     * @param {string} type - The type of vote (e.g., 'leader')
     * @param {Object} [customData] - Custom vote data for custom votes
     * @returns {Promise<void>}
     */
    static async startVote(type, customData = null) {
        // Check if user is GM or current leader
        const isGM = game.user.isGM;
        const leaderId = getSettingSafely(MODULE.ID, 'partyLeader', null);
        const isLeader = leaderId ? game.user.id === leaderId : false;
        const canStartVote = isGM || isLeader;

        postConsoleAndNotification(MODULE.NAME, 'Vote Manager | Starting Vote:', {
            type,
            userId: game.user.id,
            isGM,
            leaderId,
            isLeader,
            canStartVote,
            activeVote: this.activeVote
        }, true, false);

        if (!canStartVote) {
            ui.notifications.warn("Only the GM or party leader can start votes.");
            return;
        }

        // Only GM can start leader votes
        if (type === 'leader' && !isGM) {
            ui.notifications.warn("Only the GM can start leader votes.");
            return;
        }

        if (this.activeVote) {
            ui.notifications.warn("There is already an active vote in progress.");
            return;
        }

        // If this is a character vote, show the setup dialog first
        if (type === 'characters' && !customData) {
            await this._showCharacterVoteDialog();
            return;
        }

        this.activeVote = {
            id: foundry.utils.randomID(),
            type: type,
            startTime: Date.now(),
            votes: {},
            isActive: true,
            initiator: game.user.id,
            initiatedByLeader: isLeader && !isGM
        };

        // Set options based on vote type
        if (type === 'leader') {
            this.activeVote.options = game.users
                .filter(u => u.active && !u.isGM && !this._isUserExcluded(u.id))
                .map(u => {
                    const character = this._getUserCharacter(u.id);
                    return {
                        id: u.id,
                        name: character ? character.name : u.name,
                        characterId: character?.id || null
                    };
                });
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
        } else if (type === 'characters' && customData) {
            this.activeVote.options = customData.options;
            this.activeVote.title = customData.title;
            this.activeVote.description = customData.description;
        } else if (type === 'custom' && customData) {
            this.activeVote.options = customData.options;
            this.activeVote.title = customData.title;
        }

        // Create the chat message first
        await this._createVoteMessage();

        // Then notify other clients with the complete vote data
        const socket = SocketManager.getSocket();
        await socket.executeForOthers("receiveVoteStart", {
            voteData: this.activeVote,
            messageId: this.activeVote.messageId
        });
    }

    /**
     * Show dialog for setting up a character vote
     * @private
     * @returns {Promise} Resolves when the vote is created
     */
    static async _showCharacterVoteDialog() {
        // Get available character sources
        const sources = await this._getCharacterSources();

        const dialog = new Dialog({
            title: "Create Character Vote",
            content: `
                <form>
                    <div class="form-group">
                        <label>Vote Title:</label>
                        <input type="text" name="title" required>
                    </div>
                    <div class="form-group">
                        <label>Description:</label>
                        <textarea name="description" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Character Source:</label>
                        <select name="source" required>
                            ${Object.entries(sources).map(([key, source]) => 
                                source.available ? 
                                `<option value="${key}">${source.label}</option>` : 
                                `<option value="${key}" disabled>${source.label} (${source.unavailableMessage || 'Not Available'})</option>`
                            ).join('')}
                        </select>
                    </div>
                </form>
            `,
            buttons: {
                submit: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create Vote",
                    callback: async (html) => {
                        const form = html.find('form')[0];
                        const title = form.title.value;
                        const description = form.description.value;
                        const source = form.source.value;
                        
                        if (!title) {
                            ui.notifications.error("Please enter a title for the vote.");
                            return;
                        }

                        const characters = await this._getCharactersFromSource(source);
                        if (!characters.length) {
                            ui.notifications.error("No characters available from selected source.");
                            return;
                        }

                        // Start the vote with the gathered data
                        await this.startVote('characters', {
                            title: title,
                            description: description,
                            options: characters.map(char => ({
                                id: char.id,
                                name: char.name,
                                img: char.img
                            }))
                        });
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "submit"
        });
        dialog.render(true);
    }

    /**
     * Get available character sources and their availability
     * @private
     */
    static async _getCharacterSources() {
        const inCombat = game.combat != null;
        return {
            selected: {
                label: "Selected Tokens",
                available: canvas.tokens?.controlled?.length > 0,
                unavailableMessage: "None Selected"
            },
            targeted: {
                label: "Targeted Tokens",
                available: game.user.targets?.size > 0,
                unavailableMessage: "None Targeted"
            },
            canvas: {
                label: "Heroes on the Canvas",
                available: canvas.tokens?.placeables?.length > 0,
                unavailableMessage: "No Heroes Found"
            },
            party: {
                label: "Heroes in the Party",
                available: true, // Always available as we'll check for character actors
                unavailableMessage: "No Heroes in Party"
            },
            players: {
                label: "Current Players",
                available: game.users.filter(u => u.active).length > 0,
                unavailableMessage: "No Players Online"
            },
            combat: {
                label: "Monster Combatants",
                available: inCombat && game.combat.combatants.filter(c => c.actor?.type === "npc").length > 0,
                unavailableMessage: "Not in Combat"
            },
        };
    }

    /**
     * Get characters based on the selected source
     * @private
     */
    static async _getCharactersFromSource(source) {
        switch (source) {
            case 'selected':
                return canvas.tokens.controlled
                    .map(t => ({
                        id: t.id,
                        name: t.name,
                        img: t.document.texture.src
                    }));

            case 'targeted':
                return Array.from(game.user.targets)
                    .map(t => ({
                        id: t.id,
                        name: t.name,
                        img: t.document.texture.src
                    }));

            case 'canvas':
                return canvas.tokens.placeables
                    .filter(t => t.actor?.type === "character")
                    .map(t => ({
                        id: t.id,
                        name: t.name,
                        img: t.document.texture.src
                    }));

            case 'party':
                return game.actors
                    .filter(a => a.type === "character" && a.hasPlayerOwner)
                    .map(a => ({
                        id: a.id,
                        name: a.name,
                        img: a.img
                    }));

            case 'players':
                return game.users
                    .filter(u => u.active && !u.isGM && !this._isUserExcluded(u.id))
                    .map(u => ({
                        id: u.id,
                        name: u.name,
                        img: u.avatar
                    }));

            case 'combat':
                if (!game.combat) return [];
                return game.combat.combatants
                    .filter(c => c.actor?.type === "npc")
                    .map(c => ({
                        id: c.id,
                        name: c.name,
                        img: c.img
                    }));

            default:
                return [];
        }
    }

    /**
     * Check if all eligible players have voted
     * @returns {boolean} True if all eligible players have voted
     */
    static _haveAllPlayersVoted() {
        // Get all active non-GM players who aren't excluded
        const eligibleVoters = game.users.filter(u => u.active && !u.isGM && !VoteManager._isUserExcluded(u.id));
        const totalVoters = eligibleVoters.length;
        
        // Count actual votes from eligible voters
        const actualVotes = Object.keys(this.activeVote.votes)
            .filter(id => !VoteManager._isUserExcluded(id))
            .length;
        
        return actualVotes >= totalVoters;
    }

    /**
     * Cast a vote
     * @param {string} voterId - The ID of the user casting the vote
     * @param {string} choiceId - The ID of the chosen option
     */
    static async castVote(voterId, choiceId) {
        // Check if there's an active vote
        if (!this.activeVote) {
            ui.notifications.warn("No active vote to participate in.");
            return;
        }

        // Check if the user is excluded
        if (this._isUserExcluded(voterId)) {
            ui.notifications.warn("You are excluded from participating in votes.");
            return;
        }

        // Check if the vote is still active
        if (!this.activeVote.isActive) {
            ui.notifications.warn("This vote has already ended.");
            return;
        }

        // Check if there are any active players to vote
        const activePlayers = game.users.filter(u => u.active && !u.isGM && !this._isUserExcluded(u.id));
        if (activePlayers.length === 0) {
            ui.notifications.warn("There are no active players eligible to vote.");
            return;
        }

        // Initialize votes object if it doesn't exist
        if (!this.activeVote.votes) {
            this.activeVote.votes = {};
        }

        // Record the vote
        this.activeVote.votes[voterId] = choiceId;

        // Play button sound when vote is cast
        playSound(window.COFFEEPUB?.SOUNDBUTTON07, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

        // Allow both GM and leader who initiated the vote to update the message
        const isInitiator = game.user.id === this.activeVote.initiator;
        const isGM = game.user.isGM;
        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        const isLeader = leaderData && leaderData.userId && game.user.id === leaderData.userId;

        if ((isGM || isLeader) && isInitiator) {
            await this._updateVoteMessage();
            
            // Check if everyone has voted and close automatically if they have
            if (this._haveAllPlayersVoted()) {
                await this.closeVote();
            }
        }

        // Notify other clients
        const socket = SocketManager.getSocket();
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
            await ChatPanel.setNewLeader(results.winner, true);
        }

        // Play completion sound
        playSound(window.COFFEEPUB?.SOUNDNOTIFICATION15, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

        // Notify other clients
        const socket = SocketManager.getSocket();
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

        // First, create a map of option IDs to names and initialize all options with 0 votes
        const optionNames = {};
        const optionData = {};  // Store full option data
        this.activeVote.options.forEach(option => {
            optionNames[option.id] = option.name;
            optionData[option.id] = option;  // Store the full option data
            tally[option.id] = {
                count: 0,
                name: option.name
            };
        });

        // Count votes and include names
        Object.values(votes).forEach(vote => {
            if (tally[vote]) {
                tally[vote].count += 1;
                if (tally[vote].count > maxVotes) {
                    maxVotes = tally[vote].count;
                    // For leader votes, format winner with both userId and actorId
                    if (this.activeVote.type === 'leader') {
                        winner = {
                            userId: vote,
                            actorId: optionData[vote].characterId || ''
                        };
                    } else {
                        winner = vote;
                    }
                    tiedWinners = [vote];
                } else if (tally[vote].count === maxVotes) {
                    tiedWinners.push(vote);
                    // Only clear winner for non-leader votes
                    if (this.activeVote.type !== 'leader') {
                        winner = null;
                    }
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
                        ${tiedCandidates.map(c => {
                            const character = this._getUserCharacter(c.id);
                            const displayName = character ? character.name : c.name;
                            return `<option value="${c.id}|${character ? character.id : ''}">${displayName}</option>`;
                        }).join('')}
                    </select>
                </div>
            `,
            buttons: {
                choose: {
                    icon: '<i class="fas fa-crown"></i>',
                    label: "Choose Leader",
                    callback: async (html) => {
                        const selectedValue = html.find('#tie-breaker-select').val();
                        const [userId, actorId] = selectedValue.split('|');
                        
                        // Initialize results if they don't exist
                        if (!this.activeVote.results) {
                            this.activeVote.results = {};
                        }
                        this.activeVote.results.winner = { userId, actorId };
                        
                        await ChatPanel.setNewLeader({ userId, actorId }, true);
                        await this._updateVoteMessage();
                    },
                },
            },
            default: "choose",
        });
        dialog.render(true);
    }

    /**
     * Get the current voting progress
     * @returns {Object} Object containing current and total voter counts
     */
    static _getVotingProgress() {
        const eligibleVoters = game.users.filter(u => u.active && !u.isGM && !VoteManager._isUserExcluded(u.id));
        const nonGMVotes = Object.entries(this.activeVote.votes || {})
            .filter(([userId]) => {
                const user = game.users.get(userId);
                return user && !user.isGM && !VoteManager._isUserExcluded(userId);
            })
            .length;
        return {
            current: nonGMVotes,
            total: eligibleVoters.length
        };
    }

    /**
     * Create the initial vote message in chat
     */
    static async _createVoteMessage() {
        // Get the GM user for the speaker (messages always appear from GM)
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

        // Play notification sound
        playSound(window.COFFEEPUB?.SOUNDNOTIFICATION02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

        const messageData = {
            vote: this.activeVote,
            userId: game.user.id,
            progress: this._getVotingProgress(),
            currentUserIsGM: game.user.isGM
        };

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData,
        );
        
        // Create a single message from the GM
        const message = await ChatMessage.create({
            content: content,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
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

        const content = await renderTemplate(
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs',
            messageData,
        );

        await message.update({ content: content });
    }

    /**
     * Handle receiving a new vote start from another client
     * @param {Object} data - The vote data and message ID
     */
    static async receiveVoteStart(data) {

        
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
        
        // Allow both GM and leader who initiated the vote to update the message
        const isInitiator = game.user.id === this.activeVote.initiator;
        const isGM = game.user.isGM;
        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        const isLeader = leaderData && leaderData.userId && game.user.id === leaderData.userId;
        
        if ((isGM || isLeader) && isInitiator) {
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

        // Allow both GM and leader who initiated the vote to update the message
        const isInitiator = game.user.id === this.activeVote.initiator;
        const isGM = game.user.isGM;
        const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        const isLeader = leaderData && leaderData.userId && game.user.id === leaderData.userId;

        if ((isGM || isLeader) && isInitiator) {
            await this._updateVoteMessage();

            // If this was a leader vote and we have a winner, update the leader
            if (this.activeVote.type === 'leader' && data.results.winner) {
                await ChatPanel.setNewLeader(data.results.winner);
            }
        }

        // Clear the active vote
        this.activeVote = null;
    }

    /**
     * Get the primary character for a user
     * @param {string} userId - The ID of the user
     * @returns {Actor|null} The user's primary character or null if none found
     * @private
     */
    static _getUserCharacter(userId) {
        // Find all characters owned by this user
        const userCharacters = game.actors.filter(actor => 
            actor.type === 'character' && 
            actor.ownership[userId] === 3 // OWNER level
        );
        
        // Return the first character or null if none found
        return userCharacters[0] || null;
    }
} 