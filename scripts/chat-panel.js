// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification, playSound } from './global.js';
import { ThirdPartyManager } from './third-party.js';

class ChatPanel {
    static ID = 'chat-panel';
    static currentLeader = null;
    static isLoading = true;
    static sessionEndTime = null;
    static sessionStartTime = null;
    static hasHandledExpiration = false;
    static hasHandledWarning = false;

    static initialize() {
        // Load the templates
        loadTemplates([
            'modules/coffee-pub-blacksmith/templates/chat-panel.hbs',
            'modules/coffee-pub-blacksmith/templates/chat-cards.hbs'
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
                        await this.updateLeader(this.currentLeader);
                        
                        // Send messages if a leader was selected
                        if (selectedId) {
                            await this.sendLeaderMessages(selectedUser.name, selectedId);
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
        try {
            const leaderId = await game.settings.get(MODULE_ID, 'partyLeader');
            postConsoleAndNotification("Chat Panel: Loading leader, found ID:", leaderId, false, true, false);
            
            if (leaderId) {
                const leader = game.users.get(leaderId);
                if (leader) {
                    this.currentLeader = leader.name;
                    postConsoleAndNotification("Chat Panel: Set current leader to:", this.currentLeader, false, true, false);
                    // Only send messages if user is GM
                    if (game.user.isGM) {
                        await this.sendLeaderMessages(leader.name, leaderId);
                    }
                } else {
                    postConsoleAndNotification("Chat Panel: Could not find user with ID:", leaderId, false, true, false);
                    this.currentLeader = null;
                }
            } else {
                postConsoleAndNotification("Chat Panel: No leader ID found in settings", "", false, true, false);
                this.currentLeader = null;
            }
        } catch (error) {
            console.error("Blacksmith | Chat Panel: Error loading leader:", error);
            this.currentLeader = null;
        }
    }

    static async loadTimer() {
        try {
            const endTime = await game.settings.get(MODULE_ID, 'sessionEndTime');
            const startTime = await game.settings.get(MODULE_ID, 'sessionStartTime');
            postConsoleAndNotification("Chat Panel: Loading timer, found end time:", endTime, false, true, false);
            this.sessionEndTime = endTime;
            this.sessionStartTime = startTime;
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
        // Calculate current values if timer exists
        let currentHours = 0;
        let currentMinutes = 0;
        if (this.sessionEndTime) {
            const remaining = this.sessionEndTime - Date.now();
            if (remaining > 0) {
                currentHours = Math.floor(remaining / (1000 * 60 * 60));
                currentMinutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            }
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
                        const duration = (hours * 60 + minutes) * 60 * 1000; // Convert to milliseconds
                        
                        this.sessionStartTime = Date.now();
                        this.sessionEndTime = this.sessionStartTime + duration;
                        
                        // Store both start and end time in settings
                        await game.settings.set(MODULE_ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE_ID, 'sessionStartTime', this.sessionStartTime);
                        
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
            user: gmUser.id,
            speaker: { alias: gmUser.name }
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
}

export { ChatPanel }; 