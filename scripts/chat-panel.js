// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification, playSound } from './global.js';
import { ThirdPartyManager } from './third-party.js';
import { VoteConfig } from './vote-config.js';
import { ModuleManager } from './module-manager.js';

class ChatPanel {
    static ID = 'chat-panel';
    static currentLeader = null;
    static isLoading = true;
    static sessionEndTime = null;
    static sessionStartTime = null;
    static hasHandledExpiration = false;
    static hasHandledWarning = false;
    static toolbarIcons = new Map();

    static initialize() {
        // Load the templates
        loadTemplates([
            'modules/coffee-pub-blacksmith/templates/chat-panel.hbs',
            'modules/coffee-pub-blacksmith/templates/chat-cards.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-config.hbs',
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

            // Prepare template data
            const templateData = {
                isGM: game.user.isGM,
                leaderText: this.getLeaderDisplayText(),
                timerText: this.getTimerText(),
                timerProgress: this.getTimerProgress()
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

            // Add vote icon click handler
            html.find('.vote-icon').click(async (event) => {
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
        if (this.isLoading) return "Loading...";
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
        const isLeader = game.user.id === game.settings.get(MODULE_ID, 'partyLeader');
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
                            await ChatPanel.setNewLeader(selectedId);
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
        const leaderId = game.settings.get(MODULE_ID, 'partyLeader');
        postConsoleAndNotification("Chat Panel: Loading leader, found ID:", leaderId, false, true, false);
        
        if (leaderId) {
            await ChatPanel.setNewLeader(leaderId);
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
                    this.updateTimer(this.sessionEndTime, this.sessionStartTime);
                }
            }, 30000); // 30 second intervals
        }
    }

    static getTimerText() {
        if (this.isLoading) return "Loading...";
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

        // Handle expired state first
        if (remaining <= 0) {
            timerInfo.classList.add('expired');
            timerInfo.classList.remove('warning');
            if (game.user.isGM && !this.hasHandledExpiration) {
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
            if (remainingMinutes <= warningThreshold) {
                timerInfo.classList.add('warning');
                timerInfo.style.setProperty('--progress-color', 'hsl(9, 94%, 20%)');
                if (game.user.isGM && !this.hasHandledWarning) {
                    this.hasHandledWarning = true;
                    this.handleTimerWarning();
                }
            } else {
                timerInfo.classList.remove('warning', 'expired');
                timerInfo.style.setProperty('--progress-color', '#c1bfb5');
                // Reset warning flag when we're no longer in warning state
                this.hasHandledWarning = false;
            }
        } catch (error) {
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
            // Play warning sound if configured
            const warningSound = game.settings.get(MODULE_ID, 'sessionTimerWarningSound');
            if (warningSound !== 'none') {
                playSound(warningSound, 0.8);
            }

            // Send warning message
            const message = game.settings.get(MODULE_ID, 'sessionTimerWarningMessage')
                .replace('{time}', this.getTimerText());

            await this.sendTimerMessage({
                isTimerWarning: true,
                warningMessage: message
            });
        } catch (error) {
            postConsoleAndNotification("Chat Panel: Settings not yet registered, skipping warning notification", "", false, true, false);
        }
    }

    static async handleTimerExpired() {
        try {
            // Play expired sound if configured
            const expiredSound = game.settings.get(MODULE_ID, 'sessionTimerExpiredSound');
            if (expiredSound !== 'none') {
                playSound(expiredSound, 0.8);
            }

            // Send expired message
            const message = game.settings.get(MODULE_ID, 'sessionTimerExpiredMessage');
            await this.sendTimerMessage({
                isTimerExpired: true,
                expiredMessage: message
            });
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
                        
                        // Update all clients
                        await this.updateTimer(this.sessionEndTime, this.sessionStartTime);
                        
                        // Send timer set message
                        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        await this.sendTimerMessage({
                            isTimerSet: true,
                            timeString: timeString
                        });
                        
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

    static async updateTimer(endTime, startTime) {
        if (game.user.isGM) {
            const socket = ThirdPartyManager.getSocket();
            await socket.executeForOthers("updateTimer", { endTime, startTime });
            this.updateTimerDisplay();
        }
    }

    /**
     * Set a new party leader and handle all related updates
     * @param {string} userId - The user ID of the new leader
     * @returns {Promise<boolean>} - True if successful, false if failed
     */
    static async setNewLeader(userId) {
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

            // Send the leader messages
            const gmUser = game.users.find(u => u.isGM);
            if (gmUser) {
                const messageData = {
                    isPublic: true,
                    isLeader: true,
                    leaderName: user.name,
                    leaderId: userId
                };

                const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', messageData);
                await ChatMessage.create({
                    content: messageHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: gmUser })
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
}

export { ChatPanel }; 