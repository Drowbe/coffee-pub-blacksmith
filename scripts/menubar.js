// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, getSettingSafely, setSettingSafely } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { VoteConfig } from './vote-config.js';
import { ModuleManager } from './manager-modules.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { MovementConfig } from './token-movement.js';
import { HookManager } from './manager-hooks.js';

class MenuBar {
    static ID = 'menubar';
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
            'modules/coffee-pub-blacksmith/templates/menubar.hbs',
            'modules/coffee-pub-blacksmith/templates/cards-common.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-window.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs'
        ]);

        // Register Handlebars helpers
        Handlebars.registerHelper('or', function() {
            return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
        });

        // Simple DOM insertion - no complex hooks needed

        // Wait for socket to be ready
        Hooks.once('blacksmith.socketReady', () => {
    
        });

        // Load the leader and timer after Foundry is ready
        Hooks.once('ready', async () => {
            await this.loadLeader();
            await this.loadTimer();
            this.isLoading = false;
            
            // Wait a brief moment to ensure settings are fully registered
            setTimeout(() => {
                this.startTimerUpdates();
            }, 1000);

            // Render the menubar
            this.renderMenubar();
        });

        // Register for module features
        this._registerModuleFeatures();
    }

    static _registerModuleFeatures() {
        // Get all toolbar icons from registered modules
        const toolbarFeatures = ModuleManager.getFeaturesByType('menubarIcon');
        
        toolbarFeatures.forEach(feature => {
            this.toolbarIcons.set(feature.moduleId, feature.data);

        });
    }

    static async renderMenubar() {
        try {
            // Check if movement type setting exists first
            let currentMovement = 'normal-movement';
            let currentMovementData = { icon: 'fa-person-running', name: 'Free' };
            
            try {
                // Only try to get the setting if it's registered
                if (game.settings.settings.get(`${MODULE.ID}.movementType`)) {
                    currentMovement = game.settings.get(MODULE.ID, 'movementType') || 'normal-movement';
                    
                    const movementTypes = {
                        'normal-movement': { icon: 'fa-person-walking', name: 'Free' },
                        'no-movement': { icon: 'fa-person-circle-xmark', name: 'Locked' },
                        'combat-movement': { icon: 'fa-swords', name: 'Combat' },
                        'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
                        'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
                    };
                    
                    currentMovementData = movementTypes[currentMovement] || movementTypes['normal-movement'];
                }
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Movement type setting not registered yet, using default', "", false, false);
            }

            // Prepare template data
            let leaderData = { userId: '', actorId: '' };
            let isLeader = false;
            try {
                // Only try to get the setting if it's registered
                if (game.settings.settings.get(`${MODULE.ID}.partyLeader`)) {
                    leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                    isLeader = game.user.id === leaderData?.userId;
                }
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Party leader setting not registered yet, using default', "", false, false);
            }

            const templateData = {
                isGM: game.user.isGM,
                isLeader: isLeader,
                leaderText: this.getLeaderDisplayText(),
                timerText: this.getTimerText(),
                timerProgress: this.getTimerProgress(),
                currentMovement: currentMovementData
            };

            // Render the template
            const panelHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/menubar.hbs', templateData);

            // Remove any existing menubar
            document.querySelector('.blacksmith-menubar-container')?.remove();
            
            // Find the interface element and insert before it
            const interfaceElement = document.querySelector('#interface');
            if (interfaceElement) {
                interfaceElement.insertAdjacentHTML('beforebegin', panelHtml);
                
                // Add click handlers
                this.addClickHandlers();
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error rendering menubar:", error, false, false);
        }
    }

    static addClickHandlers() {
        // Add click handlers for GM only
        if (game.user.isGM) {
            const leaderSection = document.querySelector('.leader-section');
            if (leaderSection) {
                leaderSection.addEventListener('click', () => this.showLeaderDialog());
            }

            const timerSection = document.querySelector('.timer-section');
            if (timerSection) {
                timerSection.addEventListener('click', () => this.showTimerDialog());
            }
        }

        // Add vote div click handler
        const voteTool = document.querySelector('.button.vote');
        if (voteTool) {
            voteTool.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const isGM = game.user.isGM;
                const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                const isLeader = leaderData && leaderData.userId && game.user.id === leaderData.userId;
                const canStartVote = isGM || isLeader;

                if (!canStartVote) {
                    ui.notifications.warn("Only the GM or party leader can start votes.");
                    return;
                }
                
                new VoteConfig().render(true);
            });
        }


        // Add Settings div click handler
        const settingsTool = document.querySelector('.button.settings');
        if (settingsTool) {
            settingsTool.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                game.settings.sheet.render(true);
            });
        }

         // Add Refresh div click handler
         const refreshTool = document.querySelector('.button.refresh');
         if (refreshTool) {
            refreshTool.addEventListener('click', async (event) => {
                 event.preventDefault();
                 event.stopPropagation();
                 window.location.reload();
             });
         }


        // Add skill check click handler
        const skillCheckTool = document.querySelector('.button.skillcheck');
        if (skillCheckTool) {
            skillCheckTool.addEventListener('click', async (event) => {
                event.preventDefault();
                if (!game.user.isGM) return;

                const dialog = new SkillCheckDialog();
                dialog.render(true);
            });
        }

        // Add movement click handler
        const movementTool = document.querySelector('.button.movement');
        if (movementTool) {
            movementTool.addEventListener('click', async (event) => {
                event.preventDefault();
                if (!game.user.isGM) return;

                const movementConfig = new MovementConfig();
                movementConfig.render(true);
            });
        }

        // Add UI toggle handler
        const interfaceTool = document.querySelector('.button.interface');
        if (interfaceTool) {
            interfaceTool.addEventListener('click', async function() {
                const uiLeft = document.getElementById('ui-left');
                const uiBottom = document.getElementById('ui-bottom');
                const label = this.querySelector('.interface-label');

                // Check if either UI element that can be hidden is currently hidden
                const isLeftHidden = uiLeft && uiLeft.style.display === 'none';
                const isBottomHidden = uiBottom && uiBottom.style.display === 'none';
                const isEitherHidden = isLeftHidden || isBottomHidden;

                // Get the settings
                const hideLeftUI = game.settings.get(MODULE.ID, 'canvasToolsHideLeftUI');
                const hideBottomUI = game.settings.get(MODULE.ID, 'canvasToolsHideBottomUI');

                if (isEitherHidden) {
                    ui.notifications.info("Showing the Interface...");
                    if (hideLeftUI && isLeftHidden) uiLeft.style.display = 'inherit';
                    if (hideBottomUI && isBottomHidden) uiBottom.style.display = 'inherit';
                    label.textContent = 'Hide UI';
                } else {
                    ui.notifications.info("Hiding the Interface...");
                    if (hideLeftUI) uiLeft.style.display = 'none';
                    if (hideBottomUI) uiBottom.style.display = 'none';
                    label.textContent = 'Show UI';
                }
            });
        }
    }

    static getLeaderDisplayText() {
        if (this.isLoading) return "No Leader";
        return this.currentLeader || "Choose a Leader...";
    }

    static async updateLeaderDisplay() {
        const panel = document.querySelector('.blacksmith-menubar-container');
        if (!panel) {
            // If menubar doesn't exist, re-render it
            this.renderMenubar();
            return;
        }

        const leaderText = this.getLeaderDisplayText();
        const leaderElement = panel.querySelector('.party-leader');
        if (leaderElement) {
            leaderElement.textContent = leaderText;
        }
        
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
        let isLeader = false;
        try {
            const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
            isLeader = game.user.id === leaderData.userId;
        } catch (error) {
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
        const publicHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', {
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
        const privateHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', {
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

        // Get all player-owned characters that aren't excluded
        const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsersMenubar').split(',').map(id => id.trim());
        
        // Get all character actors and their owners
        const characterEntries = game.actors
            .filter(actor => 
                actor.type === 'character' && 
                actor.hasPlayerOwner
            )
            .map(actor => {
                // Find the user with highest ownership level for this actor
                const ownerEntry = Object.entries(actor.ownership)
                    .filter(([userId, level]) => 
                        level === 3 && // OWNER level
                        !excludedUsers.includes(userId) && 
                        !excludedUsers.includes(game.users.get(userId)?.name)
                    )
                    .map(([userId, level]) => ({
                        userId,
                        user: game.users.get(userId),
                        level
                    }))
                    .find(entry => entry.user && entry.user.active); // Only include active users

                if (ownerEntry) {
                    return {
                        actor,
                        owner: ownerEntry.user
                    };
                }
                return null;
            })
            .filter(entry => entry !== null); // Remove any entries where we didn't find an active owner



        // Create the dialog content
        const content = `
            <form>
                <div class="form-group">
                    <label>Select Party Leader:</label>
                    <select name="leader" id="leader-select">
                        <option value="">None</option>
                        ${characterEntries.map(entry => {
                            const isCurrentLeader = this.currentLeader === entry.actor.name;
                            return `<option value="${entry.actor.id}|${entry.owner.id}" ${isCurrentLeader ? 'selected' : ''}>
                                ${entry.actor.name} (${entry.owner.name})
                            </option>`;
                        }).join('')}
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
                
                        const selectedValue = html.find('#leader-select').val();
                        if (selectedValue) {
  
                            const [actorId, userId] = selectedValue.split('|');
                            // Send messages when selecting from dialog
                            await MenuBar.setNewLeader({ userId, actorId }, true);
                        } else {
                    
                            // Handle clearing the leader if none selected
                            await game.settings.set(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
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

        let leaderData = null;
        try {
            leaderData = game.settings.get(MODULE.ID, 'partyLeader');

        } catch (error) {
            // If we can't access the setting, assume no leader
            leaderData = { userId: '', actorId: '' };
            postConsoleAndNotification(MODULE.NAME, 'Menubar | Could not load leader data:', error, false, false);
        }
        

        
        if (leaderData && leaderData.actorId) {
            // Don't send messages during initialization
            await MenuBar.setNewLeader(leaderData, false);

        } else {
            MenuBar.currentLeader = null;
            await MenuBar.updateLeader(null);

        }
    }

    static async loadTimer() {
        try {
            const endTime = await game.settings.get(MODULE.ID, 'sessionEndTime');
            const startTime = await game.settings.get(MODULE.ID, 'sessionStartTime');
            const timerDate = await game.settings.get(MODULE.ID, 'sessionTimerDate');
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
    
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error loading timer:", error, false, false);
            this.sessionEndTime = null;
            this.sessionStartTime = null;
        }
    }

    static startTimerUpdates() {
        // For non-GM users, only start updates if we have a valid session end time
        if (!game.user.isGM && !this.sessionEndTime) {
    
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
        const timerSection = document.querySelector('.timer-section');
        if (!timerSpan || !timerSection) return;

        const timerText = this.getTimerText();
        timerSpan.textContent = timerText;

        // Calculate progress and remaining time
        const progress = this.getTimerProgress();
        const now = Date.now();
        const remaining = Math.max(0, this.sessionEndTime - now);
        const remainingMinutes = Math.ceil(remaining / (1000 * 60));

        timerSection.style.setProperty('--progress', progress);

        // Handle expired state
        if (remaining <= 0 && this.sessionEndTime !== null) {
            timerSection.classList.add('expired');
            timerSection.classList.remove('warning');
            
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
                warningThreshold = game.settings.get(MODULE.ID, 'sessionTimerWarningThreshold');
            } catch (error) {
        
            }

            const warningThresholdMs = warningThreshold * 60 * 1000;
            const previousRemainingMinutes = this.previousRemainingMinutes || Infinity;

            // If we're in or entering the warning period
            if (remainingMinutes <= warningThreshold && this.sessionEndTime !== null) {
                timerSection.classList.add('warning');
                timerSection.classList.remove('expired');
                
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
                timerSection.classList.remove('warning', 'expired');
                // Reset warning flag when we're no longer in warning state
                this.hasHandledWarning = false;
            }

            // Store the current remaining minutes for next comparison
            this.previousRemainingMinutes = remainingMinutes;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error in timer warning check", error, false, false);
            // If settings aren't registered yet, just use default styling
            timerSection.classList.remove('warning', 'expired');
        }

        // Reset expiration flag if timer is not expired
        if (remaining > 0) {
            this.hasHandledExpiration = false;
        }
    }

    static async handleTimerWarning() {
        try {
            // Play warning sound if configured (for all clients)
            const warningSound = game.settings.get(MODULE.ID, 'sessionTimerWarningSound');
            if (warningSound !== 'none') {
                playSound(warningSound, 0.8);
            }

            // Only send warning message from GM client
            if (game.user.isGM) {
                const message = game.settings.get(MODULE.ID, 'sessionTimerWarningMessage')
                    .replace('{time}', this.getTimerText());

                await this.sendTimerMessage({
                    isTimerWarning: true,
                    warningMessage: message
                });
            }
        } catch (error) {
    
        }
    }

    static async handleTimerExpired() {
        try {
            // Play expired sound if configured (for all clients)
            const expiredSound = game.settings.get(MODULE.ID, 'sessionTimerExpiredSound');
            if (expiredSound !== 'none') {
                playSound(expiredSound, 0.8);
            }

            // Only send expired message from GM client
            if (game.user.isGM) {
                const message = game.settings.get(MODULE.ID, 'sessionTimerExpiredMessage');
                await this.sendTimerMessage({
                    isTimerExpired: true,
                    expiredMessage: message
                });
            }
        } catch (error) {
    
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
            const defaultMinutes = game.settings.get(MODULE.ID, 'sessionTimerDefault');
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
                        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
                        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());

                        // If checkbox was checked, save as new default
                        if (setAsDefault) {
                            await game.settings.set(MODULE.ID, 'sessionTimerDefault', hours * 60 + minutes);
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

        const messageHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', messageData);

        await ChatMessage.create({
            content: messageHtml,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            speaker: ChatMessage.getSpeaker({ user: gmUser })
        });
    }

    // Socket receiver functions
    static async receiveLeaderUpdate(data) {

        if (!game?.user) return;
        
        MenuBar.currentLeader = data.leader;

        // Update local leader data if provided
        if (data.leaderData) {
            const success = await setSettingSafely(MODULE.ID, 'partyLeader', data.leaderData);
            if (success) {
                MenuBar.updateLeaderDisplay();
            } else {
                postConsoleAndNotification(MODULE.NAME, 'Menubar | Warning', 'Settings not yet registered, skipping leader update', false, false);
            }
        } else {
            MenuBar.updateLeaderDisplay();
        }
    }

    static receiveTimerUpdate(data) {
        if (!game?.user) return;
        
        MenuBar.sessionEndTime = data.endTime;
        MenuBar.sessionStartTime = data.startTime;
        MenuBar.updateTimerDisplay();
    }

    // Update existing socket emits to use SocketManager
    static async updateLeader(leader) {

        if (game.user.isGM) {
            const socket = SocketManager.getSocket();

            // Get the current leader data to send
            const leaderData = getSettingSafely(MODULE.ID, 'partyLeader', null);
            if (leaderData) {
                await socket.executeForOthers("updateLeader", { 
                    leader,  // for backward compatibility
                    leaderData // full leader data
                });
                this.updateLeaderDisplay();
            } else {
                postConsoleAndNotification(MODULE.NAME, 'Menubar | Warning', 'Settings not yet registered, skipping leader update', false, false);
            }
        }
    }

    static async updateTimer(endTime, startTime, sendMessage = false) {
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
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
     * @param {Object} leaderData - Object containing userId and actorId
     * @param {boolean} [sendMessages=false] - Whether to send chat messages about the new leader
     * @returns {Promise<boolean>} - True if successful, false if failed
     */
    static async setNewLeader(leaderData, sendMessages = false) {

        try {
            // Get the user and actor
            const user = game.users.get(leaderData.userId);
            const actor = game.actors.get(leaderData.actorId);
            
            if (!user || !actor) {
                postConsoleAndNotification(MODULE.NAME, 'CHAT | Failed to find user or actor:', { user, actor }, false, false);
                postConsoleAndNotification(MODULE.NAME, "Menubar | Error", 
                    `Failed to set leader: User or character not found`, 
                    true, false
                );
                return false;
            }



            // Store in settings
            const success = await setSettingSafely(MODULE.ID, 'partyLeader', leaderData);
            if (!success) {
                postConsoleAndNotification(MODULE.NAME, 'Menubar | Error', 'Settings not yet registered, cannot set leader', true, false);
                return false;
            }


            // Update the static currentLeader and display
            MenuBar.currentLeader = actor.name;
            await MenuBar.updateLeader(actor.name);


            // Update vote icon permissions
            this.updateVoteIconState();


            // Force menubar re-render to update leader status
            this.renderMenubar();

            // Send the leader messages only if requested AND we are the GM
            if (sendMessages && game.user.isGM) {
    
                
                // Play notification sound
                playSound(window.COFFEEPUB?.SOUNDNOTIFICATION09, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

                // Send public message
                const publicData = {
                    isPublic: true,
                    isLeaderChange: true,
                    leaderName: actor.name,
                    playerName: user.name
                };

                const publicHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', publicData);
                await ChatMessage.create({
                    content: publicHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: game.user })
                });

                // Send private message to new leader
                const privateData = {
                    isPublic: false,
                    isLeaderChange: true,
                    leaderName: actor.name
                };

                const privateHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', privateData);
                await ChatMessage.create({
                    content: privateHtml,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: game.user }),
                    whisper: [leaderData.userId]
                });
    
            }

            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'CHAT | Error in setNewLeader:', error, false, false);
            postConsoleAndNotification(MODULE.NAME, "Menubar | Error", 
                `Failed to set leader: ${error.message}`, 
                true, false
            );
            return false;
        }
    }

    async getData() {
        const isGM = game.user.isGM;
        const currentMovement = game.settings.get(MODULE.ID, 'movementType') || 'normal-movement';
        
        const movementTypes = {
            'normal-movement': { icon: 'fa-person-walking', name: 'Free' },
            'no-movement': { icon: 'fa-person-circle-xmark', name: 'None' },
            'combat-movement': { icon: 'fa-swords', name: 'Combat' },
            'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
            'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
        };

        const data = {
            isGM: game.user.isGM,
            leader: game.settings.get(MODULE.ID, 'partyLeader') || 'No Leader',
            timer: this._formatTime(game.settings.get(MODULE.ID, 'sessionTimer') || 0),
            progress: this._calculateProgress(),
            isWarning: this._isWarning(),
            isExpired: this._isExpired(),
            currentMovement: movementTypes[currentMovement] || movementTypes['normal-movement']
        };

        return data;
    }
}

export { MenuBar }; 
