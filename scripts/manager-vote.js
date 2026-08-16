// ==================================================================
// ===== IMPORTS ====================================================
// ==================================================================

import { MODULE } from './const.js';
import { ChatCardsAPI } from './api-chat-cards.js';
import { composeVoteCard, VOTE_CARD_TYPE, VOTE_CAST_ACTION } from './cards-vote.js';
import { postConsoleAndNotification, playSound, getSettingSafely, isCurrentUserPartyLeader, ownsAnyCharacter } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { MenuBar } from './api-menubar.js';
import { HookManager } from './manager-hooks.js';

export class VoteManager {
    static activeVote = null;

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

        // Register helper to get list of voters (eligible = snapshot when vote started)
        Handlebars.registerHelper('getVoterList', function(vote) {
            if (!vote?.votes) return '';

            const allPlayers = [...VoteManager._getEligibleIds(vote)]
                .map((id) => game.users.get(id))
                .filter((u) => u && u.active && !u.isGM);

            const votes = vote.votes;
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

        // Mark the reader's OWN vote, per client.
        //
        // A REGISTERED RENDER PASS, not a renderChatMessageHTML hook. A parts card
        // re-renders from its composition a tick after Foundry paints it, and that
        // swap replaces the element -- so anything a hook decorated is discarded.
        // The first version of this WAS a hook, and the symptom was exactly that: a
        // player voted and their own option never changed, because the class was
        // added to markup that was about to be thrown away.
        //
        // What it decides cannot be composed: which option belongs to the person
        // looking at it. The composition is written once and read by everyone.
        ChatCardsAPI.registerRenderPass(MODULE.ID, 'vote-own-choice', ({ message, root }) => {
            if (!message?.flags?.[MODULE.ID]?.isVoteCard) return;

            const rows = root.querySelectorAll(`.blacksmith-row-clickable[data-blacksmith-action="${VOTE_CAST_ACTION}"]`);
            if (!rows.length) return;

            // A GM may not vote, so every option is inert for them.
            if (game.user.isGM) {
                rows.forEach((row) => row.classList.add('blacksmith-row-not-yours'));
                return;
            }

            const myVote = VoteManager.activeVote?.votes?.[game.user.id];
            if (!myVote) return;

            rows.forEach((row) => {
                if (row.dataset.blacksmithValue === myVote) {
                    row.classList.add('blacksmith-row-chosen');
                    // A tick, not just a tint. Colour on its own does not tell a
                    // reader who cannot separate red from green which row is theirs.
                    // Guarded because a pass may run more than once on the same card.
                    if (!row.querySelector('.blacksmith-row-chosen-mark')) {
                        const mark = document.createElement('i');
                        mark.className = 'fa-solid fa-check blacksmith-row-chosen-mark';
                        mark.dataset.tooltip = 'Your vote';
                        row.appendChild(mark);
                    }
                } else {
                    // Voted already, so the others are no longer offers.
                    row.classList.add('blacksmith-row-not-yours');
                }
            });
        });
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
        const isLeader = isCurrentUserPartyLeader();
        const canStartVote = isGM || isLeader;

        postConsoleAndNotification(MODULE.NAME, 'Vote Manager | Starting Vote:', {
            type,
            userId: game.user.id,
            isGM,
            leaderData: getSettingSafely(MODULE.ID, 'partyLeader', null),
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

        const eligibleVoters = VoteManager._getEligibleVoters();
        if (!eligibleVoters.length) {
            ui.notifications.warn('No eligible voters: players must be logged in and own a character.');
            return;
        }

        this.activeVote = {
            id: foundry.utils.randomID(),
            type: type,
            startTime: Date.now(),
            votes: {},
            isActive: true,
            initiator: game.user.id,
            initiatedByLeader: isLeader && !isGM,
            eligibleUserIds: eligibleVoters.map((u) => u.id)
        };

        // Set options based on vote type
        if (type === 'leader') {
            this.activeVote.options = eligibleVoters.map((u) => {
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

        const DialogV2 = foundry.applications.api.DialogV2;
        const content = `
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
        `;

        let dlg;
        dlg = new DialogV2({
            window: { title: 'Create Character Vote' },
            position: { width: 420 },
            content,
            buttons: [
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fa-solid fa-xmark',
                    callback: () => {
                        void dlg.close();
                    }
                },
                {
                    action: 'submit',
                    label: 'Create Vote',
                    icon: 'fa-solid fa-check',
                    default: true,
                    callback: async (event, button, dialog) => {
                        const form = button?.form ?? dialog.form;
                        if (!form) return;
                        const title = form.elements.title?.value ?? '';
                        const description = form.elements.description?.value ?? '';
                        const source = form.elements.source?.value ?? '';

                        if (!title) {
                            ui.notifications.error('Please enter a title for the vote.');
                            return;
                        }

                        const characters = await this._getCharactersFromSource(source);
                        if (!characters.length) {
                            ui.notifications.error('No characters available from selected source.');
                            return;
                        }

                        await this.startVote('characters', {
                            title,
                            description,
                            options: characters.map(char => ({
                                id: char.id,
                                name: char.name,
                                img: char.img
                            }))
                        });
                        void dialog.close();
                    }
                }
            ]
        });
        await dlg.render({ force: true });
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
                // Same set the option list is built from, or the entry offers itself and then
                // yields nothing -- `game.users.filter(u => u.active)` counts the GM and any
                // characterless account, neither of which appears as an option.
                available: VoteManager._getEligibleVoters().length > 0,
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
                return VoteManager._getEligibleVoters().map((u) => ({
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
     * Who may vote: a logged-in non-GM player who owns at least one character.
     *
     * ALL THREE CONDITIONS ARE REQUIRED. Being connected is not standing -- a camera or stream
     * account is logged in and owns nothing, and counting it means a vote can never reach
     * unanimity because a spectator never votes. Ownership alone is not standing either: a dnd5e
     * `group` actor is routinely shared with the whole table, so testing ownership without the
     * character-type check lets anyone holding the group actor vote.
     *
     * @returns {User[]} Eligible users, sorted by name
     */
    static _getEligibleVoters() {
        return game.users
            .filter((u) => u?.active && !u.isGM && ownsAnyCharacter(u))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    }

    /**
     * The eligible set for a vote in progress.
     *
     * A vote SNAPSHOTS its eligible users at the moment it starts (`eligibleUserIds`), so that a
     * player logging in or out midway cannot change what unanimity means. The recompute is only
     * a fallback for a vote already in flight when the client updated; it deliberately applies
     * today's rule rather than the canvas-token rule this used to fall back to, which contradicted
     * the eligibility actually being enforced and told rejected players to go place a token.
     *
     * @param {Object} [vote] - Defaults to the active vote
     * @returns {Set<string>} Eligible user ids
     */
    static _getEligibleIds(vote = this.activeVote) {
        const ids = vote?.eligibleUserIds;
        return new Set(
            Array.isArray(ids) && ids.length ? ids : VoteManager._getEligibleVoters().map((u) => u.id)
        );
    }

    /**
     * Check if all eligible players have voted
     * @returns {boolean} True if all eligible players have voted
     */
    static _haveAllPlayersVoted() {
        const eligibleIds = this._getEligibleIds();
        const totalVoters = eligibleIds.size;
        const actualVotes = Object.keys(this.activeVote.votes).filter((id) => eligibleIds.has(id)).length;

        return totalVoters > 0 && actualVotes >= totalVoters;
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

        // Check if the vote is still active
        if (!this.activeVote.isActive) {
            ui.notifications.warn("This vote has already ended.");
            return;
        }

        const eligibleIds = this._getEligibleIds();
        if (!eligibleIds.has(voterId)) {
            ui.notifications.warn(
                'You are not eligible to vote. Voting is open to logged-in players who own a character.'
            );
            return;
        }

        if (eligibleIds.size === 0) {
            ui.notifications.warn('There are no eligible voters for this vote.');
            return;
        }

        // Initialize votes object if it doesn't exist
        if (!this.activeVote.votes) {
            this.activeVote.votes = {};
        }

        // Record the vote (capture reference before any await-closeVote() may set activeVote to null)
        this.activeVote.votes[voterId] = choiceId;
        const votesToSync = this.activeVote.votes;

        // Play button sound when vote is cast
        playSound(window.COFFEEPUB?.SOUNDBUTTON07, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

        // Allow both GM and leader who initiated the vote to update the message
        const isInitiator = game.user.id === this.activeVote.initiator;
        const isGM = game.user.isGM;
        const isLeader = isCurrentUserPartyLeader();

        if ((isGM || isLeader) && isInitiator) {
            await this._updateVoteMessage();
            // Check if everyone has voted and close automatically if they have
            if (this._haveAllPlayersVoted()) {
                await this.closeVote();
            }
        }

        // Notify other clients (use captured reference-activeVote may be null if vote just closed)
        const socket = SocketManager.getSocket();
        await socket.executeForOthers("receiveVoteUpdate", {
            votes: votesToSync
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
            await MenuBar.setNewLeader(results.winner, true);
        }

        // Play completion sound
        playSound(window.COFFEEPUB?.SOUNDNOTIFICATION15, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

        const pendingLeaderTieBreaker =
            this.activeVote.type === 'leader' &&
            Array.isArray(results.tiedWinners) &&
            results.tiedWinners.length > 1 &&
            !results.winner;

        // Notify other clients (keep activeVote until GM resolves a leader tie — tie dialog opens after this)
        const socket = SocketManager.getSocket();
        await socket.executeForOthers('receiveVoteClose', {
            results,
            pendingLeaderTieBreaker
        });

        if (!pendingLeaderTieBreaker) {
            this.activeVote = null;
        }
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

        const DialogV2 = foundry.applications.api.DialogV2;
        const content = `
            <p class="blacksmith-tie-breaker-intro">There was a tie for leader. Please select the winner:</p>
            <div class="form-group">
                <label for="tie-breaker-select">Winner</label>
                <select id="tie-breaker-select" name="tieBreaker">
                    ${tiedCandidates.map(c => {
                        const character = this._getUserCharacter(c.id);
                        const displayName = character ? character.name : c.name;
                        return `<option value="${c.id}|${character ? character.id : ''}">${displayName}</option>`;
                    }).join('')}
                </select>
            </div>
        `;

        const dlg = new DialogV2({
            classes: ['coffee-pub-blacksmith', 'blacksmith-leader-tie-breaker'],
            window: { title: 'Leader Vote Tie' },
            position: { width: 420 },
            content,
            buttons: [
                {
                    action: 'choose',
                    label: 'Choose Leader',
                    icon: 'fa-solid fa-crown',
                    default: true,
                    callback: async (event, button, dialog) => {
                        // DialogV2: prefer the clicked button's owning form — dialog.form is often null here.
                        const form = button?.form ?? dialog.form;
                        const tieBreakerSelect = form?.querySelector?.('#tie-breaker-select')
                            ?? dialog.element?.querySelector?.('#tie-breaker-select');
                        const selectedValue = tieBreakerSelect?.value ?? '';
                        const [userId, actorId] = selectedValue.split('|');

                        try {
                            if (!VoteManager.activeVote) {
                                postConsoleAndNotification(
                                    MODULE.NAME,
                                    'Leader tie-breaker: no active vote (state may have been cleared elsewhere).',
                                    null,
                                    false,
                                    false
                                );
                                return;
                            }
                            if (!VoteManager.activeVote.results) {
                                VoteManager.activeVote.results = {};
                            }
                            VoteManager.activeVote.results.winner = { userId, actorId };

                            await MenuBar.setNewLeader({ userId, actorId }, true);
                            await VoteManager._updateVoteMessage();

                            VoteManager.activeVote.isActive = false;
                            VoteManager.activeVote.endTime = Date.now();

                            playSound(window.COFFEEPUB?.SOUNDNOTIFICATION15, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

                            const socket = SocketManager.getSocket();
                            await socket.executeForOthers('receiveVoteClose', {
                                results: VoteManager.activeVote.results
                            });

                            VoteManager.activeVote = null;
                        } catch (err) {
                            postConsoleAndNotification(MODULE.NAME, 'Leader tie-breaker failed', err, false, true);
                            ui.notifications.error('Could not apply tie-breaker. See console for details.');
                        } finally {
                            void dialog.close();
                        }
                    }
                }
            ]
        });
        await dlg.render({ force: true });
    }

    /**
     * Get the current voting progress
     * @returns {Object} Object containing current and total voter counts
     */
    static _getVotingProgress() {
        const eligibleIds = this._getEligibleIds();
        const cast = new Set(Object.keys(this.activeVote.votes || {}).filter((id) => eligibleIds.has(id)));

        // WHO HAS NOT VOTED, by name. This is safe to put on the card and the
        // detail it replaced was not: a name here says only that someone has yet to
        // act, never what anybody chose. "Who voted for what" is the secret, and it
        // stays out of the message entirely -- see cards-vote.js.
        //
        // The GM needs this to chase people, which is what the old GM-only tooltip
        // was really for. Removing that tooltip took the chasing away with the leak.
        const waitingOn = [...eligibleIds]
            .filter((id) => !cast.has(id))
            .map((id) => game.users.get(id)?.name)
            .filter(Boolean)
            .sort();

        return {
            current: cast.size,
            total: eligibleIds.size,
            waitingOn
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

        // No `userId` and no `currentUserIsGM` in here any more. Both were the
        // INITIATOR's, baked into one string every client shares, which is what made
        // the GM-only voter detail readable by every player. The card is composed
        // once and rendered per client now; anything that differs by reader is
        // decided in the reader's own browser.
        const message = await ChatCardsAPI.post({
            moduleId: MODULE.ID,
            type: VOTE_CARD_TYPE,
            parts: composeVoteCard(this.activeVote, this._getVotingProgress()),
            speaker: ChatMessage.getSpeaker({ user: gmUser }),
            flags: {
                isVoteCard: true,
                voteId: this.activeVote.id
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

        // Rebuild the composition and the baked snapshot together. Still only the
        // initiator runs this -- that guard is unchanged and is about who may WRITE
        // to the message -- but it no longer decides what anyone SEES, because each
        // client renders the stored composition for itself.
        //
        // Goes through the public API deliberately. This used to hand-build the card
        // object and call renderCard directly, which worked only because it is inside
        // Blacksmith: no consumer can reach renderCard or resolveThemeId, so the vote
        // card was built with a capability the API withheld. Bibliosoph pointed that
        // out, and Crier had already copied the workaround by writing our flag
        // namespace by hand. A rule its author steps outside of does not hold.
        //
        // Passing no theme also fixes a bug the old code had: it re-resolved the world
        // default on every update, so a vote card pinned to a theme reverted the first
        // time anybody voted.
        await ChatCardsAPI.update(message, {
            parts: composeVoteCard(this.activeVote, this._getVotingProgress()),
            flags: { isVoteCard: true, voteId: this.activeVote.id }
        });
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
        const isLeader = isCurrentUserPartyLeader();

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
        const isLeader = isCurrentUserPartyLeader();

        if ((isGM || isLeader) && isInitiator) {
            await this._updateVoteMessage();

            // If this was a leader vote and we have a winner, update the leader
            if (this.activeVote.type === 'leader' && data.results.winner) {
                await MenuBar.setNewLeader(data.results.winner);
            }
        }

        if (!data.pendingLeaderTieBreaker) {
            this.activeVote = null;
        }
    }

    /**
     * Get the primary character for a user
     * @param {string} userId - The ID of the user
     * @returns {Actor|null} The user's primary character or null if none found
     * @private
     */
    static _getUserCharacter(userId) {
        const user = game.users.get(userId);
        if (!user) return null;
        // Use the player's ASSIGNED character (set in User Configuration), regardless of how many
        // actors they own. This previously returned the first OWNED character, so a player who owns
        // several got an arbitrary one instead of the character they actually play.
        return user.character || null;
    }
}

