// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification, playSound } from './global.js';
import { ThirdPartyManager } from './third-party.js';
import { VoteConfig } from './vote-config.js';
import { ModuleManager } from './module-manager.js';
import { SkillCheckDialog } from './skill-check-dialog.js';
import { MovementConfig } from './movement.js';

class ChatPanel {
    static ID = 'chat-panel';
    static currentLeader = null;
    static isLoading = true;
    static sessionEndTime = null;
    static sessionStartTime = null;
    static hasHandledExpiration = false;
    static hasHandledWarning = false;
    static toolbarIcons = new Map();
    static previousRemainingMinutes = null;
    static activeContextMenu = null;

    static initialize() {
        // Load the templates
        loadTemplates([
            'modules/coffee-pub-blacksmith/templates/chat-panel.hbs',
            'modules/coffee-pub-blacksmith/templates/chat-cards.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-window.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs'
        ]);

        // Set up the render hook for the panel
        Hooks.on('renderChatLog', (app, html, data) => {
            this._onRenderChatLog(app, html, data);
        });

        // Wait for socket to be ready
        Hooks.once('blacksmith.socketReady', () => {
            postConsoleAndNotification("Chat Panel | Socket is ready", "", false, true, false);
        });

        // Load the leader and timer after Foundry is ready
        Hooks.once('ready', async () => {
            await this.loadLeader();
            await this.loadTimer();
            this.isLoading = false;
            this.updateLeaderDisplay();
            
            // Wait a brief moment to ensure settings are fully registered
            setTimeout(() => {
                this.startTimerUpdates();
            }, 1000);
        });

        // Register for module features
        this._registerModuleFeatures();
    }

    static _registerModuleFeatures() {
        // Get all toolbar icons from registered modules
        const toolbarFeatures = ModuleManager.getFeaturesByType('chatPanelIcon');
        
        toolbarFeatures.forEach(feature => {
            this.toolbarIcons.set(feature.moduleId, feature.data);
            postConsoleAndNotification(`Coffee Pub Blacksmith | Registered chat panel icon for ${feature.moduleId}`, "", false, true, false);
        });
    }

    static async _onRenderChatLog(app, html, data) {
        try {
            // Find the chat log element
            const chatLog = html.find('#chat-log');
            if (!chatLog.length) return;

            // Check if movement type setting exists first
            let currentMovement = 'normal-movement';
            let currentMovementData = { icon: 'fa-person-running', name: 'Free' };
            
            try {
                // Only try to get the setting if it's registered
                if (game.settings.settings.get(`${MODULE_ID}.movementType`)) {
                    currentMovement = game.settings.get(MODULE_ID, 'movementType') || 'normal-movement';
                    
                    const movementTypes = {
                        'normal-movement': { icon: 'fa-person-walking', name: 'Free' },
                        'no-movement': { icon: 'fa-person-circle-xmark', name: 'None' },
                        'combat-movement': { icon: 'fa-swords', name: 'Combat' },
                        'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
                        'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
                    };
                    
                    currentMovementData = movementTypes[currentMovement] || movementTypes['normal-movement'];
                }
            } catch (err) {
                console.warn('Blacksmith | Movement type setting not registered yet, using default');
            }

            // Prepare template data
            const templateData = {
                isGM: game.user.isGM,
                leaderText: this.getLeaderDisplayText(),
                timerText: this.getTimerText(),
                timerProgress: this.getTimerProgress(),
                currentMovement: currentMovementData
            };

            // Render the template
            const panelHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-panel.hbs', templateData);

            // Remove any existing panel before adding the new one
            html.find('.blacksmith-chat-panel').remove();
            
            // Insert before the chat log
            chatLog.before(panelHtml);

            // Add click handlers for GM only
            if (game.user.isGM) {
                const leaderSection = html.find('.leader-section');
                leaderSection.on('click', () => this.showLeaderDialog());

                const timerSection = html.find('.timer-section');
                timerSection.on('click', () => this.showTimerDialog());
            }

            // Add vote div click handler
            html.find('.tool.vote').click(async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const isGM = game.user.isGM;
                const leaderId = game.settings.get(MODULE_ID, 'partyLeader');
                const isLeader = game.user.id === leaderId;
                const canStartVote = isGM || isLeader;

                if (!canStartVote) {
                    ui.notifications.warn("Only the GM or party leader can start votes.");
                    return;
                }
                
                postConsoleAndNotification("Chat Panel | Opening vote config", "", false, true, false);
                new VoteConfig().render(true);
            });

            // Track active context menu instance
            let activeContextMenu;

            html.find('.tool.skillcheck').click(async (event) => {
                event.preventDefault();
                if (!game.user.isGM) return;

                const dialog = new SkillCheckDialog();
                dialog.render(true);
            }).contextmenu(async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;

                // Quick roll options matching the ones in skill-check-window.hbs
                const quickRolls = [
                    { label: 'Party Perception', value: 'perception', icon: 'fa-magnifying-glass-waveform', skill: 'prc' },
                    { label: 'Party Insight', value: 'insight', icon: 'fa-brain', skill: 'ins' },
                    { label: 'Party Investigation', value: 'investigation', icon: 'fa-magnifying-glass', skill: 'inv' },
                    { label: 'Party Nature', value: 'nature', icon: 'fa-sheep', skill: 'nat' },
                    { label: 'Party Stealth', value: 'stealth', icon: 'fa-burst', skill: 'ste' }
                ];

                // Create context menu items
                const menuItems = quickRolls.map(roll => ({
                    name: roll.label,
                    icon: `<i class="fas ${roll.icon}"></i>`,
                    callback: async () => {
                        // Get all party members (characters with player owners)
                        const partyMembers = game.actors.filter(actor => 
                            actor.type === 'character' && actor.hasPlayerOwner
                        );

                        if (partyMembers.length === 0) {
                            ui.notifications.warn("No party members found.");
                            return;
                        }

                        // Get skill data from CONFIG
                        const skillData = CONFIG.DND5E.skills[roll.skill];
                        if (!skillData) {
                            ui.notifications.error(`Invalid skill: ${roll.skill}`);
                            return;
                        }

                        // Create message data for the quick roll
                        const messageData = {
                            skillName: roll.label,
                            actors: partyMembers.map(actor => ({
                                id: actor.id,
                                name: actor.name,
                                group: 1 // All party members are challengers
                            })),
                            requesterId: game.user.id,
                            type: 'skillCheck',
                            rollType: 'skill',
                            skillAbbr: roll.skill,
                            isGroupRoll: true,
                            rollMode: 'roll', // Default to public roll
                            showDC: true,
                            showRollExplanation: true,
                            showRollExplanationLink: true,
                            skillDescription: skillData.description,
                            skillLink: `@UUID[${skillData.reference}]{${game.i18n.localize(skillData.label)}}`
                        };

                        // Create the chat message
                        const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
                        await ChatMessage.create({
                            content: content,
                            speaker: ChatMessage.getSpeaker(),
                            flags: {
                                'coffee-pub-blacksmith': messageData
                            }
                        });
                    }
                }));

                // Create and show the context menu
                const menu = new ContextMenu($(event.currentTarget), '.tool.skillcheck', menuItems);
                menu.render(true);
                
                // Track the active menu
                this.activeContextMenu = menu;
                
                // Add event listener to close the menu when clicking outside
                const closeHandler = (e) => {
                    if (!$(e.target).closest('.context-menu').length && !$(e.target).closest('.tool.skillcheck').length) {
                        menu.close();
                        $(document).off('click', closeHandler);
                        this.activeContextMenu = null;
                    }
                };
                
                // Add the close handler after a small delay to prevent immediate closing
                setTimeout(() => {
                    $(document).on('click', closeHandler);
                }, 100);
            });

            html.find('.tool.movement').click(async (event) => {
                event.preventDefault();
                if (!game.user.isGM) return;

                const movementConfig = new MovementConfig();
                movementConfig.render(true);
            });

            // Add module toolbar icons
            const toolbarSection = html.find('.toolbar-icons');
            this.toolbarIcons.forEach((iconData, moduleId) => {
                const icon = $(`<i class="${iconData.icon}" title="${iconData.tooltip}"></i>`);
                icon.css('cursor', 'pointer');
                
                // Add click handler
                icon.click(async (event) => {
                    event.preventDefault();
                    if (iconData.onClick) {
                        await iconData.onClick(event);
                    }
                });

                toolbarSection.append(icon);
            });

        } catch (error) {
            console.error("Blacksmith | Chat Panel: Error rendering panel:", error);
        }
    }

    static getLeaderDisplayText() {
        if (this.isLoading) return "No Leader";
        return this.currentLeader || "Choose a Leader...";
    }

    static updateLeaderDisplay() {
        const panel = document.querySelector('.blacksmith-chat-panel');
        if (!panel) return;

        const leaderText = this.getLeaderDisplayText();
        panel.querySelector('.party-leader').textContent = leaderText;
        
        // Update vote icon state
        this.updateVoteIconState();
    }

    /**
     * Update the vote icon state based on user permissions
     */
    static updateVoteIconState() {
        const voteIcon = document.querySelector('.vote-icon');
        if (!voteIcon) return;

        const isGM = game.user.isGM;
        // Add a try-catch block to handle cases where the setting might not be available
        let isLeader = false;
        try {
            const leaderId = game.settings.get(MODULE_ID, 'partyLeader');
            isLeader = game.user.id === leaderId;
        } catch (error) {
            // If we can't access the setting, assume not leader
            isLeader = false;
        }
        const canVote = isGM || isLeader;

        if (canVote) {
            voteIcon.style.cursor = 'pointer';
            voteIcon.style.opacity = '1';
            voteIcon.classList.remove('disabled');
        } else {
            voteIcon.style.cursor = 'not-allowed';
            voteIcon.style.opacity = '0.5';
            voteIcon.classList.add('disabled');
        }
    }

    static async sendLeaderMessages(leaderName, leaderId) {
        // Get the GM user to send messages from
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

        // Render public message
        const publicHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', {
            isPublic: true,
            leaderName: leaderName
        });
        
        await ChatMessage.create({
            content: publicHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            user: gmUser.id,
            speaker: { alias: gmUser.name }
        });

        // Render private message
        const privateHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', {
            isPublic: false,
            leaderName: leaderName
        });

        await ChatMessage.create({
            content: privateHtml,
            user: gmUser.id,
            speaker: { alias: gmUser.name },
            whisper: [leaderId]
        });
    }

    static async showLeaderDialog() {
        // Get all connected players (excluding GM) who are online
        const players = game.users.filter(user => !user.isGM && user.active);
        
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
                        if (selectedId) {
                            // Send messages when selecting from dialog
                            await ChatPanel.setNewLeader(selectedId, true);
                        } else {
                            // Handle clearing the leader if none selected
                            await game.settings.set(MODULE_ID, 'partyLeader', null);
                            this.currentLeader = null;
                            await this.updateLeader(null);
                        }
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
        let leaderId = null;
        try {
            leaderId = game.settings.get(MODULE_ID, 'partyLeader');
        } catch (error) {
            // If we can't access the setting, assume no leader
            leaderId = null;
        }
        
        postConsoleAndNotification("Chat Panel: Loading leader, found ID:", leaderId, false, true, false);
        
        if (leaderId) {
            // Don't send messages during initialization
            await ChatPanel.setNewLeader(leaderId, false);
        } else {
            ChatPanel.currentLeader = null;
            await ChatPanel.updateLeader(null);
        }
    }

    static async loadTimer() {
        try {
            const endTime = await game.settings.get(MODULE_ID, 'sessionEndTime');
            const startTime = await game.settings.get(MODULE_ID, 'sessionStartTime');
            const timerDate = await game.settings.get(MODULE_ID, 'sessionTimerDate');
            const today = new Date().toDateString();

            if (timerDate === today && endTime > Date.now()) {
                // Use existing timer if it's from today and hasn't expired
                this.sessionEndTime = endTime;
                this.sessionStartTime = startTime;
            } else {
                // Use default time if timer is from a different day or expired
                this.sessionEndTime = null;
                this.sessionStartTime = null;
            }
            postConsoleAndNotification("Chat Panel: Loading timer, found end time:", this.sessionEndTime, false, true, false);
        } catch (error) {
            console.error("Blacksmith | Chat Panel: Error loading timer:", error);
            this.sessionEndTime = null;
            this.sessionStartTime = null;
        }
    }

    static startTimerUpdates() {
        // For non-GM users, only start updates if we have a valid session end time
        if (!game.user.isGM && !this.sessionEndTime) {
            postConsoleAndNotification("Chat Panel: No session end time set, skipping timer updates for player", "", false, true, false);
            return;
        }

        // Update timer display every second locally
        setInterval(() => this.updateTimerDisplay(), 1000);
        
        // If GM, sync to other clients every 30 seconds
        if (game.user.isGM) {
            setInterval(() => {
                if (this.sessionEndTime) {
                    this.updateTimer(this.sessionEndTime, this.sessionStartTime, false);
                }
            }, 30000); // 30 second intervals
        }
    }

    static getTimerText() {
        if (this.isLoading) return "Not Set";
        if (!this.sessionEndTime) return "Set Time";
        
        const now = Date.now();
        if (now >= this.sessionEndTime) return "Time's Up!";
        
        const remaining = this.sessionEndTime - now;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    static getTimerProgress() {
        if (!this.sessionEndTime) return "100%";
        
        const now = Date.now();
        const total = this.sessionEndTime - this.sessionStartTime;
        const elapsed = now - this.sessionStartTime;
        
        const progress = Math.max(0, Math.min(100, (1 - elapsed / total) * 100));
        return `${progress}%`;
    }

    static updateTimerDisplay() {
        const timerSpan = document.querySelector('.session-timer');
        const timerInfo = document.querySelector('.timer-info');
        if (!timerSpan || !timerInfo) return;

        const timerText = this.getTimerText();
        timerSpan.textContent = timerText;

        // Calculate progress and remaining time
        const progress = this.getTimerProgress();
        const now = Date.now();
        const remaining = Math.max(0, this.sessionEndTime - now);
        const remainingMinutes = Math.ceil(remaining / (1000 * 60));

        timerInfo.style.setProperty('--progress', progress);

        // Handle expired state
        if (remaining <= 0 && this.sessionEndTime !== null) {
            timerInfo.classList.add('expired');
            timerInfo.classList.remove('warning');
            
            // Send expiration message if:
            // 1. We haven't handled this expiration yet
            // 2. The timer actually just expired (current time is close to the end time)
            if (!this.hasHandledExpiration && (now - this.sessionEndTime) < 2000) {
                this.hasHandledExpiration = true;
                this.handleTimerExpired();
            }
            return;
        }

        try {
            // Check if we're in warning state
            let warningThreshold = 15; // Default value
            try {
                warningThreshold = game.settings.get(MODULE_ID, 'sessionTimerWarningThreshold');
            } catch (error) {
                postConsoleAndNotification("Chat Panel: Warning threshold setting not registered yet, using default", "", false, true, false);
            }

            const warningThresholdMs = warningThreshold * 60 * 1000;
            const previousRemainingMinutes = this.previousRemainingMinutes || Infinity;

            // If we're in or entering the warning period
            if (remainingMinutes <= warningThreshold && this.sessionEndTime !== null) {
                timerInfo.classList.add('warning');
                timerInfo.style.setProperty('--progress-color', 'hsl(9, 94%, 20%)');
                
                // Detect when we first cross the warning threshold
                const justEnteredWarning = previousRemainingMinutes > warningThreshold && 
                                         remainingMinutes <= warningThreshold;

                // Send warning message if:
                // 1. We haven't handled this warning yet
                // 2. We just crossed into warning territory
                if (!this.hasHandledWarning && justEnteredWarning) {
                    this.hasHandledWarning = true;
                    this.handleTimerWarning();
                }
            } else {
                timerInfo.classList.remove('warning', 'expired');
                timerInfo.style.setProperty('--progress-color', '#c1bfb5');
                // Reset warning flag when we're no longer in warning state
                this.hasHandledWarning = false;
            }

            // Store the current remaining minutes for next comparison
            this.previousRemainingMinutes = remainingMinutes;

        } catch (error) {
            console.error("Error in timer warning check:", error);
            // If settings aren't registered yet, just use default styling
            timerInfo.classList.remove('warning', 'expired');
            timerInfo.style.setProperty('--progress-color', '#c1bfb5');
        }

        // Reset expiration flag if timer is not expired
        if (remaining > 0) {
            this.hasHandledExpiration = false;
        }
    }

    static async handleTimerWarning() {
        try {
            // Play warning sound if configured (for all clients)
            const warningSound = game.settings.get(MODULE_ID, 'sessionTimerWarningSound');
            if (warningSound !== 'none') {
                playSound(warningSound, 0.8);
            }

            // Only send warning message from GM client
            if (game.user.isGM) {
                const message = game.settings.get(MODULE_ID, 'sessionTimerWarningMessage')
                    .replace('{time}', this.getTimerText());

                await this.sendTimerMessage({
                    isTimerWarning: true,
                    warningMessage: message
                });
            }
        } catch (error) {
            postConsoleAndNotification("Chat Panel: Settings not yet registered, skipping warning notification", "", false, true, false);
        }
    }

    static async handleTimerExpired() {
        try {
            // Play expired sound if configured (for all clients)
            const expiredSound = game.settings.get(MODULE_ID, 'sessionTimerExpiredSound');
            if (expiredSound !== 'none') {
                playSound(expiredSound, 0.8);
            }

            // Only send expired message from GM client
            if (game.user.isGM) {
                const message = game.settings.get(MODULE_ID, 'sessionTimerExpiredMessage');
                await this.sendTimerMessage({
                    isTimerExpired: true,
                    expiredMessage: message
                });
            }
        } catch (error) {
            postConsoleAndNotification("Chat Panel: Settings not yet registered, skipping expiration notification", "", false, true, false);
        }
    }

    static async showTimerDialog() {
        // Calculate current values if timer exists, otherwise use default
        let currentHours = 0;
        let currentMinutes = 0;
        
        if (this.sessionEndTime) {
            const remaining = this.sessionEndTime - Date.now();
            if (remaining > 0) {
                currentHours = Math.floor(remaining / (1000 * 60 * 60));
                currentMinutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            }
        } else {
            // Use default session time from settings
            const defaultMinutes = game.settings.get(MODULE_ID, 'sessionTimerDefault');
            currentHours = Math.floor(defaultMinutes / 60);
            currentMinutes = defaultMinutes % 60;
        }

        const content = `
            <form>
                <div class="form-group">
                    <label>Session Duration:</label>
                    <div style="display: flex; gap: 10px;">
                        <select name="hours" id="hours-select">
                            ${Array.from({length: 13}, (_, i) => 
                                `<option value="${i}" ${i === currentHours ? 'selected' : ''}>${i.toString().padStart(2, '0')} hours</option>`
                            ).join('')}
                        </select>
                        <select name="minutes" id="minutes-select">
                            ${Array.from({length: 60}, (_, i) => 
                                `<option value="${i}" ${i === currentMinutes ? 'selected' : ''}>${i.toString().padStart(2, '0')} minutes</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="set-default" name="set-default">
                        Set as new default time
                    </label>
                </div>
            </form>
        `;

        new Dialog({
            title: "Set Session Time",
            content: content,
            buttons: {
                set: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Set Timer",
                    callback: async (html) => {
                        const hours = parseInt(html.find('#hours-select').val());
                        const minutes = parseInt(html.find('#minutes-select').val());
                        const setAsDefault = html.find('#set-default').prop('checked');
                        const duration = (hours * 60 + minutes) * 60 * 1000; // Convert to milliseconds
                        
                        this.sessionStartTime = Date.now();
                        this.sessionEndTime = this.sessionStartTime + duration;
                        
                        // Store both start and end time in settings
                        await game.settings.set(MODULE_ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE_ID, 'sessionStartTime', this.sessionStartTime);
                        await game.settings.set(MODULE_ID, 'sessionTimerDate', new Date().toDateString());

                        // If checkbox was checked, save as new default
                        if (setAsDefault) {
                            await game.settings.set(MODULE_ID, 'sessionTimerDefault', hours * 60 + minutes);
                        }
                        
                        // Update all clients and send message since this is an explicit timer set
                        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, true);
                        
                        this.updateTimerDisplay();
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

    // Helper method for sending chat messages
    static async sendTimerMessage(data) {
        // Get the GM user to send messages from
        const gmUser = game.users.find(u => u.isGM);
        if (!gmUser) return;

        // Prepare the message data with timer info
        const messageData = {
            isPublic: true,
            isTimer: true,
            timerLabel: 'Session',
            theme: data.isTimerWarning ? 'orange' : 
                   data.isTimerExpired ? 'red' : 
                   (data.isTimerStart || data.isTimerSet) ? 'blue' : 'default',
            ...data
        };

        const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', messageData);

        await ChatMessage.create({
            content: messageHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            speaker: ChatMessage.getSpeaker({ user: gmUser })
        });
    }

    // Socket receiver functions
    static receiveLeaderUpdate(data) {
        if (!game?.user) return;
        
        postConsoleAndNotification("Chat Panel: Received leader update:", data.leader, false, true, false);
        ChatPanel.currentLeader = data.leader;
        ChatPanel.updateLeaderDisplay();
    }

    static receiveTimerUpdate(data) {
        if (!game?.user) return;
        
        ChatPanel.sessionEndTime = data.endTime;
        ChatPanel.sessionStartTime = data.startTime;
        ChatPanel.updateTimerDisplay();
    }

    // Update existing socket emits to use ThirdPartyManager
    static async updateLeader(leader) {
        if (game.user.isGM) {
            const socket = ThirdPartyManager.getSocket();
            await socket.executeForOthers("updateLeader", { leader });
            this.updateLeaderDisplay();
        }
    }

    static async updateTimer(endTime, startTime, sendMessage = false) {
        if (game.user.isGM) {
            const socket = ThirdPartyManager.getSocket();
            await socket.executeForOthers("updateTimer", { endTime, startTime });
            this.updateTimerDisplay();

            // Only send the timer message if explicitly requested
            if (sendMessage) {
                const hours = Math.floor((endTime - startTime) / (1000 * 60 * 60));
                const minutes = Math.floor(((endTime - startTime) % (1000 * 60 * 60)) / (1000 * 60));
                const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                await this.sendTimerMessage({
                    isTimerSet: true,
                    timeString: timeString
                });
            }
        }
    }

    /**
     * Set a new party leader and handle all related updates
     * @param {string} userId - The user ID of the new leader
     * @param {boolean} [sendMessages=false] - Whether to send chat messages about the new leader
     * @returns {Promise<boolean>} - True if successful, false if failed
     */
    static async setNewLeader(userId, sendMessages = false) {
        try {
            // Get the user
            const user = game.users.get(userId);
            if (!user) {
                postConsoleAndNotification("Chat Panel | Error", 
                    `Failed to set leader: User ${userId} not found`, 
                    false, true, false
                );
                return false;
            }

            // Store in settings
            await game.settings.set(MODULE_ID, 'partyLeader', userId);

            // Update the static currentLeader and display
            ChatPanel.currentLeader = user.name;
            await ChatPanel.updateLeader(user.name);

            // Update vote icon permissions
            this.updateVoteIconState();

            // Send the leader messages only if requested AND we are the GM
            if (sendMessages && game.user.isGM) {
                // Send public message
                const publicData = {
                    isPublic: true,
                    isLeaderChange: true,
                    leaderName: user.name,
                    leaderId: userId
                };

                const publicHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', publicData);
                await ChatMessage.create({
                    content: publicHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: game.user })
                });

                // Send private message to new leader
                const privateData = {
                    isPublic: false,
                    isLeaderChange: true,
                    leaderName: user.name
                };

                const privateHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', privateData);
                await ChatMessage.create({
                    content: privateHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: game.user }),
                    whisper: [userId]
                });
            }

            return true;
        } catch (error) {
            postConsoleAndNotification("Chat Panel | Error", 
                `Failed to set leader: ${error.message}`, 
                false, true, false
            );
            return false;
        }
    }

    async getData() {
        const isGM = game.user.isGM;
        const currentMovement = game.settings.get(MODULE_ID, 'movementType') || 'normal-movement';
        
        const movementTypes = {
            'normal-movement': { icon: 'fa-person-walking', name: 'Free' },
            'no-movement': { icon: 'fa-person-circle-xmark', name: 'None' },
            'combat-movement': { icon: 'fa-swords', name: 'Combat' },
            'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
            'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
        };

        const data = {
            isGM: game.user.isGM,
            leader: game.settings.get(MODULE_ID, 'partyLeader') || 'No Leader',
            timer: this._formatTime(game.settings.get(MODULE_ID, 'sessionTimer') || 0),
            progress: this._calculateProgress(),
            isWarning: this._isWarning(),
            isExpired: this._isExpired(),
            currentMovement: movementTypes[currentMovement] || movementTypes['normal-movement']
        };

        return data;
    }
}

export { ChatPanel }; 