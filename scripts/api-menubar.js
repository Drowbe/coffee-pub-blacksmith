import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, setSettingSafely, playSound, isCurrentUserPartyLeader } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { ModuleManager } from './manager-modules.js';
import { HookManager } from './manager-hooks.js';
import { MovementConfig } from './token-movement.js';
import { CoreUIUtility } from './utility-core.js';
import { VoteConfig } from './window-vote-config.js';
import { XpManager } from './xp-manager.js';
import { CSSEditor } from './window-gmtools.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { StatsWindow } from './window-stats-party.js';
import { deployParty, clearPartyFromCanvas } from './utility-party.js';
import { getDeploymentPatternName } from './api-tokens.js';
import { EncounterToolbar } from './ui-journal-encounter.js';
import { PartyManager } from './manager-party.js';
import { ReputationManager } from './manager-reputation.js';
import { UIContextMenu } from './ui-context-menu.js';
import { PinManager } from './manager-pins.js';
import { CombatBarManager } from './manager-combatbar.js';

class MenuBar {
    static ID = 'menubar';
    static currentLeader = null;
    
    // Group order constants - Blacksmith groups take precedence
    static GROUP_ORDER = {
        COMBAT: 1,
        UTILITY: 2,
        PARTY: 3,
        GENERAL: 999  // Always last
    };
    
    static BLACKSMITH_MODULE_ID = 'blacksmith-core';
    static MAX_GROUP_ORDER = 999;  // Maximum supported group order
    static notifications = new Map(); // Store active notifications;
    static isLoading = true;
    static sessionEndTime = null;
    static sessionStartTime = null;
    static hasHandledExpiration = false;
    static hasHandledWarning = false;
    static toolbarIcons = new Map();
    static previousRemainingMinutes = null;
    static activeContextMenu = null;

    // Secondary bar system
    static secondaryBar = {
        isOpen: false,
        type: null,
        height: 50,
        persistence: 'manual', // 'manual' or 'auto'
        autoCloseTimeout: null,
        autoCloseDelay: 10000, // 10 seconds default
        data: {}
    };
    static secondaryBarTypes = new Map();
    static secondaryBarItems = new Map(); // Map<typeId, Map<itemId, itemData>> - stores items for default tool system
    static secondaryBarGroups = new Map(); // Map<typeId, Map<groupId, groupConfig>> - stores group configurations
    static secondaryBarActiveStates = new Map(); // Map<typeId, Map<groupId, itemId>> - tracks active items per group (for switch mode)
    static pendingSecondaryBarItems = new Map(); // Map<typeId, Map<itemId, itemData>> - items registered before bar type exists
    static secondaryBarToolMapping = new Map(); // Map<typeId, toolId> - maps secondary bar types to their toggle tool IDs
    /** @type {Map<string, Map<string, { value?: string, label?: string }>>} - Live updates for info items: barTypeId -> itemId -> { value, label } */
    static secondaryBarInfoUpdates = new Map();
    static renderTimeout = null;
    
    // Timer interval tracking for cleanup
    static _timerDisplayInterval = null;
    static _timerSyncInterval = null;
    
    // Event listener reference tracking for cleanup
    static _clickHandler = null;
    static _clickHandlerContainer = null;
    static _contextMenuHandler = null;
    static _contextMenuHandlerContainer = null;
    static _middleZoneOverflowItems = [];  // Items moved to overflow menu when middle zone overflows
    static _middleZoneResizeObserver = null;  // ResizeObserver for overflow detection

    /** @type {Map<string, (user: User) => { hide?: boolean }>} - Module visibility overrides (moduleId -> callback) */
    static _menubarVisibilityOverrides = new Map();

    /** Fingerprint of last full menubar HTML build (excludes timer tick text); used to skip remove/rebuild when unchanged. */
    static _menubarStructureFingerprint = null;

    /** Last known party-leader role for this user (undefined until first menubar render path sets it). */
    static _lastMenubarIsLeader = undefined;

    static async initialize() {
        // Load the templates
        foundry.applications.handlebars.loadTemplates([
            'modules/coffee-pub-blacksmith/templates/menubar.hbs',
            'modules/coffee-pub-blacksmith/templates/cards-common.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-window.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs'
        ]);

        // (Menubar ready logic is registered at module load — see bottom of this file — so it runs when Foundry emits ready.)
        
        // Register Handlebars helpers
        Handlebars.registerHelper('or', function() {
            return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
        });
        
        Handlebars.registerHelper('eq', function(a, b) {
            return a === b;
        });
        
        Handlebars.registerHelper('gt', function(a, b) {
            return a > b;
        });
        
        Handlebars.registerHelper('and', function(a, b) {
            return a && b;
        });
        
        // Helper to check if a string is an image URL
        Handlebars.registerHelper('isImageUrl', function(str) {
            if (!str || typeof str !== 'string') return false;
            // Check if it looks like a URL/path (starts with http://, https://, /, or contains common image extensions)
            const urlPattern = /^(https?:\/\/|\/|\.\/|modules\/|data\/|assets\/)/i;
            const imageExtPattern = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?.*)?$/i;
            return urlPattern.test(str) || imageExtPattern.test(str);
        });

        // Simple DOM insertion - no complex hooks needed

        // Wait for socket to be ready
        Hooks.once('blacksmith.socketReady', () => {
    
        });

        // Register for module features
        this._registerModuleFeatures();
        
        // Register setting change hook to refresh menubar when party leader changes
        this._registerLeaderChangeHook();

        // When the canvas becomes ready (including after scene switch), refresh menubar so tool visibility
        // (e.g. combat bar when combat is active) and party bar data (reputation, health) reflect the new scene.
        // If the combat bar is open but the new scene has no active combat, close the combat bar.
        HookManager.registerHook({
            name: 'canvasReady',
            description: 'MenuBar: Refresh menubar when scene changes so combat bar and party bar update',
            context: 'menubar-party-bar-scene-change',
            priority: 3,
            callback: () => {
                if (this.secondaryBar?.isOpen && this.secondaryBar?.type === 'combat') {
                    const activeCombat = game.combats?.active;
                    const hasCombat = activeCombat != null && activeCombat.combatants?.size > 0;
                    if (!hasCombat) CombatBarManager.closeCombatBar(this);
                }
                if (this.secondaryBar?.isOpen && this.secondaryBar?.type === 'party') {
                    this._refreshPartyBarInfo();
                }
                this.renderMenubar(true);
            }
        });

        // Encounter bar refresh: ui-journal-encounter.js calls api.updateSecondaryBarItemInfo directly when tokens change
    }

    static async _registerPartials() {
        try {
            // Load and register the default secondary bar template
            const defaultBarTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partials/menubar-secondary-default.hbs').then(response => response.text());
            Handlebars.registerPartial('menubar-secondary-default', defaultBarTemplate);
            
            postConsoleAndNotification(MODULE.NAME, "Menubar: Partials registered successfully", "", false, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error registering partials", error.message, true, false);
        }
    }

    static _registerModuleFeatures() {
        // Get all toolbar icons from registered modules
        const toolbarFeatures = ModuleManager.getFeaturesByType('menubarIcon');
        
        toolbarFeatures.forEach(feature => {
            this.toolbarIcons.set(feature.moduleId, feature.data);
        });
    }

    static _registerLeaderChangeHook() {
        // Register setting change hook to refresh menubar when party leader changes
        const settingChangeHookId = HookManager.registerHook({
            name: 'settingChange',
            description: 'MenuBar: Refresh menubar on party leader changes',
            context: 'menubar-settings-change',
            priority: 3,
            callback: (module, key, value) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (module === MODULE.ID && key === 'partyLeader') {
                    
                    // Update the current leader display
                    if (value && value.userId) {
                        // Find the actor for the new leader
                        const actor = game.actors.get(value.actorId);
                        if (actor) {
                            MenuBar.currentLeader = actor.name;
                        }
                    } else {
                        MenuBar.currentLeader = null;
                    }
                    
                    // Refresh the menubar to update tool visibility
                    MenuBar.updateLeaderDisplay();
                }
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, "MenuBar: Leader change hook registered", "", true, false);
    }

    /**
     * Register default menubar tools using the API
     */
    static registerDefaultTools() {
        // Prevent duplicate tool registration
        if (MenuBar._defaultToolsRegistered) {
            return;
        }
        MenuBar._defaultToolsRegistered = true;
        
        // Prevent renders during tool registration
        MenuBar._isRegisteringTools = true; 

        // **************** LEFT ZONE ****************
        // (Start menu, settings, refresh registered via API from utility-core.js)

        // **************** MIDDLE ZONE ****************


        // *** GROUP: COMBAT ***
        // (encounter and related tools are registered via their own modules)

        // REPLACE IMAGE – registered by Coffee Pub Curator when present

        // *** GROUP: UTILITY ***
        // (skillcheck registered via API from window-skillcheck.js)


        // *** GROUP: PARTY ***


        // PARTY
        this.registerMenubarTool('party', {
            icon: "fas fa-users",
            name: "party",
            title: () => {
                return "Party";
            },
            tooltip: () => {
                // Dynamic tooltip based on party bar state
                const isPartyBarOpen = this.secondaryBar.isOpen && this.secondaryBar.type === 'party';
                return isPartyBarOpen ? "Hide party tools secondary bar" : "Show party tools secondary bar";
            },
            onClick: () => {
                // Toggle the party bar
                this.toggleSecondaryBar('party');
            },
            zone: "middle",
            group: "party",
            groupOrder: this.GROUP_ORDER.PARTY,
            order: 1,
            moduleId: "blacksmith-core",
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            toggleable: true,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null
        });

        // *** GROUP: GENERAL (Default/overflow group)***


        // nothing in blacksmith yet


        // *** GROUP: NOTIFICATION ***


        // Always last


        // Map secondary bars to their toggle tools for button state syncing
        this.secondaryBarToolMapping.set('encounter', 'encounter');
        this.secondaryBarToolMapping.set('party', 'party');

        // **************** RIGHT ZONE ****************
        
        // SELECT LEADER
        this.registerMenubarTool('leader-section', {
            icon: "fa-solid fa-crown",
            name: "leader-section",
            title: "Party Leader",
            tooltip: null,
            onClick: (event) => {
                if (game.user.isGM) {
                    this.showLeaderMenu(event);
                }
            },
            zone: "right",
            group: "general",
            groupOrder: this.GROUP_ORDER.GENERAL,
            order: 1,
            moduleId: "blacksmith-core",
            gmOnly: false,
            leaderOnly: false,
            visible: false,
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null
        });

        // CHANGE MOVEMENT
        this.registerMenubarTool('movement', {
            icon: "fa-solid fa-person-walking",
            name: "movement",
            title: "Change Party Movement",
            tooltip: null,
            onClick: (event) => {
                if (!game.user.isGM) return;
                if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
                    new MovementConfig().render(true);
                    return;
                }
                this.showMovementMenu(event);
            },
            zone: "right",
            group: "general",
            groupOrder: this.GROUP_ORDER.GENERAL,
            order: 2,
            moduleId: "blacksmith-core",
            gmOnly: false,
            leaderOnly: false,
            visible: false,
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null,
            contextMenuItems: [
                { name: 'Movement Settings', icon: 'fa-solid fa-gear', onClick: () => new MovementConfig().render(true) }
            ]
        });

        // SESSION TIMER
        this.registerMenubarTool('timer-section', {
            icon: "fa-solid fa-eclipse",
            name: "timer-section",
            title: "Session Timer",
            tooltip: null,
            onClick: (event) => {
                if (!game.user.isGM) return;
                if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
                    this.showTimerDialog();
                    return;
                }
                this.showTimerMenu(event);
            },
            zone: "right",
            group: "general",
            groupOrder: this.GROUP_ORDER.GENERAL,
            order: 3,
            moduleId: "blacksmith-core",
            gmOnly: false,
            leaderOnly: false,
            visible: false,
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null
        });
        
        // Reset flag and render once after all tools are registered
        MenuBar._isRegisteringTools = false;
        this.renderMenubar();

        postConsoleAndNotification(MODULE.NAME, "Menubar: Default tools registered using API", "", true, false);
    }

    /**
     * Get the appropriate height variable for a secondary bar type
     */
    static getSecondaryBarHeight(typeId) {
        const heightVar = `--blacksmith-menubar-secondary-${typeId}-height`;
        const height = parseInt(getComputedStyle(document.documentElement).getPropertyValue(heightVar));
        return height || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-default-height')) || 30;
    }

    /**
     * Register secondary bar types
     */
    /**
     * Partials, leader/timer, default tools, secondary bar types, first render — must run after
     * `registerSettings()` (e.g. encounterToolbarDeploymentPattern). Invoked from blacksmith.js `ready`.
     */
    static async runReadySetup() {
        await this._registerPartials();
        await this.loadLeader();
        await this.loadTimer();
        this.isLoading = false;
        setTimeout(() => this.startTimerUpdates(), 1000);
        this.registerDefaultTools();
        await this.registerSecondaryBarTypes();
        this.renderMenubar();
    }

    static async registerSecondaryBarTypes() {
        // Register encounter secondary bar (default tool system – items registered from ui-journal-encounter.js)
        // Encounter bar type is registered by ui-journal-encounter.js with info items + buttons

        // Register party secondary bar (default tool system)
        await this.registerSecondaryBarType('party', {
            height: this.getSecondaryBarHeight('party'),
            persistence: 'manual'
        });

        // Register party tools (must be called after party bar type is registered)
        this._registerPartyTools();

        postConsoleAndNotification(MODULE.NAME, "Menubar: Secondary bar types registered", "", true, false);
    }


    /**
     * Refresh party bar info items (e.g. party health progressbar). Called on register, when party bar opens, and on updateActor.
     * @private
     */
    static _refreshPartyBarInfo() {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.updateSecondaryBarItemInfo) return;
        const health = PartyManager.getPartyHealthSummary();
        api.updateSecondaryBarItemInfo('party', 'party-health', {
            percentProgress: health.percent,
            leftLabel: health.currentDisplay,
            rightLabel: health.maxDisplay
        });
        ReputationManager.refreshPartyBarReputation(api);
    }

    /**
     * Register party tools in the party secondary bar.
     * Layout: middle zone = action buttons (Deployment, Deploy Party, Vote, Statistics, Experience); right zone = party health progressbar.
     * @private
     */
    static _registerPartyTools() {
        // Helper function to get current deployment pattern name
        const getCurrentPatternName = () => {
            const currentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
            return getDeploymentPatternName(currentPattern);
        };
        
        // Register Deployment Pattern button (cycles through patterns) — middle zone
        this.registerSecondaryBarItem('party', 'deployment-pattern', {
            zone: 'middle',
            icon: 'fas fa-grid-2-plus',
            label: getCurrentPatternName(),
            tooltip: `Click to cycle deployment pattern (Current: ${getCurrentPatternName()})`,
            group: 'default',
            order: 0,
            visible: () => game.user.isGM,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "Party Tools: Cycling deployment pattern", "", true, false);
                try {
                    // Use the same cycle function from encounter toolbar
                    await EncounterToolbar._cycleDeploymentPattern();
                    
                    // Update the button label to show new pattern
                    const items = this.secondaryBarItems.get('party');
                    if (items) {
                        const patternItem = items.get('deployment-pattern');
                        if (patternItem) {
                            patternItem.label = getCurrentPatternName();
                            patternItem.tooltip = `Click to cycle deployment pattern (Current: ${getCurrentPatternName()})`;
                            // Re-render if party bar is open
                            if (this.secondaryBar.isOpen && this.secondaryBar.type === 'party') {
                                this.renderMenubar(true);
                            }
                        }
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Party Tools: Error cycling deployment pattern", error.message, false, false);
                }
            }
        });
        
        // Register Deploy Party tool — middle zone
        this.registerSecondaryBarItem('party', 'deploy-party', {
            zone: 'middle',
            icon: 'fas fa-map-marker-alt',
            label: 'Deploy Party',
            tooltip: 'Deploy all party members to the canvas',
            group: 'default',
            order: 1,
            visible: () => game.user.isGM,
            onClick: async () => {
                postConsoleAndNotification(MODULE.NAME, "Party Tools: Deploy Party button clicked", "", true, false);
                try {
                    await deployParty();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Party Tools: Error in deployParty", error.message, false, false);
                }
            }
        });

        // Vote (visible to GM or current session leader only) — middle zone
        this.registerSecondaryBarItem('party', 'vote', {
            zone: 'middle',
            icon: 'fa-solid fa-check-to-slot',
            label: 'Vote',
            tooltip: 'Vote',
            group: 'default',
            order: 2,
            visible: () => game.user.isGM || isCurrentUserPartyLeader(),
            onClick: () => {
                new VoteConfig().render(true);
            }
        });

        // Party Statistics — middle zone
        this.registerSecondaryBarItem('party', 'party-stats', {
            zone: 'middle',
            icon: 'fas fa-chart-line',
            label: 'Statistics',
            tooltip: 'Open combat statistics, history, and leaderboard',
            group: 'default',
            order: 3,
            onClick: () => {
                this.openStatsWindow();
            }
        });

        // Experience (GM only) — middle zone
        this.registerSecondaryBarItem('party', 'xp-distribution', {
            zone: 'middle',
            icon: 'fas fa-star',
            label: 'Experience',
            tooltip: 'Open Experience Points Distribution Worksheet',
            group: 'default',
            order: 4,
            visible: () => game.user.isGM,
            onClick: () => {
                this.openXpDistribution();
            }
        });

        // Clear Party (GM only) — middle zone
        this.registerSecondaryBarItem('party', 'clear-party', {
            zone: 'middle',
            icon: 'fas fa-users-slash',
            label: 'Clear Party',
            tooltip: 'Remove all party member tokens from the canvas',
            group: 'default',
            order: 5,
            visible: () => game.user.isGM,
            onClick: async () => {
                try {
                    await clearPartyFromCanvas();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Party Tools: Error clearing party", error.message, false, false);
                }
            }
        });

        // Party health progressbar — right zone (sum of party HP current/max, 100% = total max)
        const initialHealth = PartyManager.getPartyHealthSummary();
        this.registerSecondaryBarItem('party', 'party-health', {
            kind: 'progressbar',
            zone: 'right',
            icon: '',
            title: '',
            width: 300,
            height: 20,
            borderColor: 'rgba(0,0,0,0.5)',
            barColor: '#2d5016',
            progressColor: '#4a7c23',
            leftIcon: 'fa-solid fa-skull',
            rightIcon: 'fa-solid fa-heart',
            percentProgress: initialHealth.percent,
            leftLabel: initialHealth.currentDisplay,
            rightLabel: initialHealth.maxDisplay,
            group: 'health',
            order: 0,
            tooltip: 'Party total HP'
        });

        ReputationManager.registerPartyBarItem(game.modules.get(MODULE.ID)?.api);

        // Initial refresh of party health progressbar
        this._refreshPartyBarInfo();

        // Listen for deployment pattern setting changes to update the button label
        HookManager.registerHook({
            name: 'settingChange',
            description: 'Party Tools: Update deployment pattern button label when pattern changes',
            context: 'party-deployment-pattern',
            priority: 5,
            key: 'encounterToolbarDeploymentPattern',
            callback: async (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'encounterToolbarDeploymentPattern') {
                    const items = this.secondaryBarItems.get('party');
                    if (items) {
                        const patternItem = items.get('deployment-pattern');
                        if (patternItem) {
                            patternItem.label = getCurrentPatternName();
                            patternItem.tooltip = `Click to cycle deployment pattern (Current: ${getCurrentPatternName()})`;
                            // Re-render if party bar is open
                            if (this.secondaryBar.isOpen && this.secondaryBar.type === 'party') {
                                this.renderMenubar(true);
                            }
                        }
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK -------------------
            }
        });

        postConsoleAndNotification(MODULE.NAME, "Menubar: Party tools registered", "", true, false);
    }

    // MENUBAR API METHODS 

    /**
     * Register a tool with the menubar system
     * @param {string} toolId - Unique identifier for the tool
     * @param {Object} toolData - Tool configuration object
     * @param {string} toolData.icon - FontAwesome icon class
     * @param {string} toolData.name - Tool name (used for data-tool attribute)
     * @param {string|Function} [toolData.title] - Optional: Tooltip text and label displayed on hover. Can be a function that returns a string for dynamic tooltips. Defaults to `name` if omitted. Can be an empty string or null for icon-only buttons.
     * @param {Function} toolData.onClick - Function to execute when tool is clicked
     * @param {string} toolData.zone - Zone placement (left, middle, right)
     * @param {number} toolData.order - Order within zone (lower numbers appear first)
     * @param {string} toolData.moduleId - Module identifier
     * @param {boolean} toolData.gmOnly - Whether tool is GM-only
     * @param {boolean} toolData.leaderOnly - Whether tool is leader-only
     * @param {boolean} toolData.visible - Whether tool is visible (can be function)
     * @param {Array|Function} [toolData.contextMenuItems] - Optional: right-click context menu. Array of { name, icon, onClick } or function (toolId, tool) => array. If present, right-click on the tool shows this menu instead of browser default.
     * @returns {boolean} Success status
     */
    static registerMenubarTool(toolId, toolData) {
        try {
            // Validate required parameters
            if (!toolId || typeof toolId !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Invalid toolId provided", { toolId }, false, false);
                return false;
            }

            if (!toolData || typeof toolData !== 'object') {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Invalid toolData provided", { toolData }, false, false);
                return false;
            }

            // Validate required fields - check for undefined specifically (allow null, empty strings, and functions)
            const requiredFields = ['icon', 'name', 'onClick'];
            for (const field of requiredFields) {
                if (toolData[field] === undefined) {
                    postConsoleAndNotification(MODULE.NAME, `Menubar API: Missing required field '${field}'`, { toolId, toolData }, false, false);
                    return false;
                }
            }
            
            // Title is optional - default to name if not provided
            // This allows tools without visible labels (icon-only buttons)

            // Check for duplicate toolId
            if (this.toolbarIcons.has(toolId)) {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool ID already exists", { toolId }, false, false);
                return false;
            }

            // Determine group and groupOrder with Blacksmith priority
            const group = toolData.group || 'general';
            let groupOrder = toolData.groupOrder;
            
            // If groupOrder not specified, use defaults based on group name
            if (groupOrder === undefined) {
                const groupLower = group.toLowerCase();
                if (groupLower === 'combat') groupOrder = this.GROUP_ORDER.COMBAT;
                else if (groupLower === 'utility') groupOrder = this.GROUP_ORDER.UTILITY;
                else if (groupLower === 'party') groupOrder = this.GROUP_ORDER.PARTY;
                else if (groupLower === 'general') groupOrder = this.GROUP_ORDER.GENERAL;
                else groupOrder = this.MAX_GROUP_ORDER; // Unknown groups default to 999
            }
            
            // Clamp groupOrder minimum to 1
            // Values > 999 will be auto-assigned to first free slot during sorting phase
            if (groupOrder < 1) {
                groupOrder = 1;
            }
            // Don't clamp > 999 here - preserve it for sorting phase to handle
            
            // Enforce "general" always last (999)
            if (group === 'general') {
                groupOrder = this.GROUP_ORDER.GENERAL; // Force to 999 (last)
            }
            
            // Set defaults (contextMenuItems optional: array or function(toolId, tool) => array of { name, icon, onClick })
            const tool = {
                icon: toolData.icon,
                name: toolData.name,
                title: toolData.title !== undefined ? toolData.title : (toolData.name || ''),
                onClick: toolData.onClick,
                zone: toolData.zone || 'left',
                group: group,
                groupOrder: groupOrder,
                order: toolData.order || 999,
                moduleId: toolData.moduleId || 'unknown',
                gmOnly: toolData.gmOnly || false,  // Visibility only, not for grouping
                leaderOnly: toolData.leaderOnly || false,  // Visibility only, not for grouping
                visible: toolData.visible !== undefined ? toolData.visible : true,
                toggleable: toolData.toggleable || false,
                active: toolData.active || false,
                iconColor: toolData.iconColor || null,  // Any valid CSS color (e.g., "#ff0000", "rgba(255, 0, 0, 0.8)", "red")
                buttonNormalTint: toolData.buttonNormalTint || null,  // Any valid CSS color (e.g., "#ff0000", "rgba(255, 0, 0, 0.8)", "red")
                buttonSelectedTint: toolData.buttonSelectedTint || null,  // Any valid CSS color (e.g., "#ff0000", "rgba(255, 0, 0, 0.8)", "red")
                contextMenuItems: toolData.contextMenuItems !== undefined ? toolData.contextMenuItems : null  // Optional: array or (toolId, tool) => array of { name, icon, onClick }
            };

            // Register the tool
            this.toolbarIcons.set(toolId, tool);

            // Skip render during batch tool registration
            if (MenuBar._isRegisteringTools) {
                return true;
            }

            // Re-render the menubar to show the new tool
            this.renderMenubar();

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar API: Error registering tool", { toolId, error }, false, false);
            return false;
        }
    }

    /**
     * Update a tool's active state (for toggleable tools)
     * @param {string} toolId - The tool ID to update
     * @param {boolean} active - The active state
     * @returns {boolean} Success status
     */
    static updateMenubarToolActive(toolId, active) {
        try {
            const tool = this.toolbarIcons.get(toolId);
            if (!tool) {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool not found", { toolId }, false, false);
                return false;
            }

            if (!tool.toggleable) {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool is not toggleable", { toolId }, false, false);
                return false;
            }

            tool.active = !!active;
            this.renderMenubar(true);

            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar API: Error updating tool active state", { toolId, error }, false, false);
            return false;
        }
    }

    /**
     * Unregister a tool from the menubar system
     * @param {string} toolId - Unique identifier for the tool
     * @returns {boolean} Success status
     */
    static unregisterMenubarTool(toolId) {
        try {
            if (!toolId || typeof toolId !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Invalid toolId provided for unregistration", { toolId }, false, false);
                return false;
            }

            if (!this.toolbarIcons.has(toolId)) {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool ID not found for unregistration", { toolId }, false, false);
                return false;
            }

            this.toolbarIcons.delete(toolId);

            postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool unregistered successfully", { toolId }, true, false);

            // Re-render the menubar to remove the tool
            this.renderMenubar();

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar API: Error unregistering tool", { toolId, error }, false, false);
            return false;
        }
    }

    /**
     * Get all registered menubar tools
     * @returns {Map} Map of all registered tools (toolId -> toolData)
     */
    static getRegisteredMenubarTools() {
        return new Map(this.toolbarIcons);
    }

    /**
     * Get all tools registered by a specific module
     * @param {string} moduleId - Module identifier
     * @returns {Array} Array of tools registered by the module
     */
    static getMenubarToolsByModule(moduleId) {
        const tools = [];
        this.toolbarIcons.forEach((tool, toolId) => {
            if (tool.moduleId === moduleId) {
                tools.push({ toolId, ...tool });
            }
        });
        return tools;
    }

    /**
     * Check if a tool is registered
     * @param {string} toolId - Unique identifier for the tool
     * @returns {boolean} Whether the tool is registered
     */
    static isMenubarToolRegistered(toolId) {
        return this.toolbarIcons.has(toolId);
    }

    /**
     * Get tools organized by zone, then by group, then by module, then by order
     * @returns {Object} Object with zone objects containing group objects containing module arrays
     */
    static getMenubarToolsByZone() {
        // Structure: zones[zone][group][moduleId] = [tools]
        const zones = {
            left: {},
            middle: {},
            right: {}
        };

        this.toolbarIcons.forEach((tool, toolId) => {
            // Check visibility
            let isVisible = true;
            if (typeof tool.visible === 'function') {
                isVisible = tool.visible();
            } else {
                isVisible = tool.visible;
            }

            // Check GM/Leader restrictions (visibility only, not for grouping)
            if (tool.gmOnly && !game.user.isGM) {
                isVisible = false;
            }

            if (tool.leaderOnly && !game.user.isGM) {
                const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                const isLeader = leaderData?.userId === game.user.id;
                
                if (!isLeader) {
                    isVisible = false;
                }
            }

            if (isVisible) {
                const zone = tool.zone || 'left';
                const group = tool.group || 'general';
                const moduleId = tool.moduleId || 'unknown';
                
                // Process title, tooltip, and active if they are functions
                let activeState = tool.active;
                if (typeof tool.active === 'function') {
                    activeState = tool.active();
                } else {
                    activeState = tool.active || false;
                }
                
                let resolvedIcon;
                try {
                    resolvedIcon = typeof tool.icon === 'function' ? tool.icon() : tool.icon;
                } catch (e) {
                    resolvedIcon = tool.icon || '';
                }
                if (resolvedIcon == null || String(resolvedIcon).trim() === '') {
                    resolvedIcon = tool.icon || '';
                }
                const processedTool = {
                    toolId,
                    ...tool,
                    icon: resolvedIcon,
                    title: typeof tool.title === 'function' ? tool.title() : tool.title,
                    tooltip: typeof tool.tooltip === 'function' ? tool.tooltip() : tool.tooltip,
                    active: activeState
                };
                
                // Initialize zone/group/module structure if needed
                if (!zones[zone]) {
                    zones[zone] = {};
                }
                if (!zones[zone][group]) {
                    zones[zone][group] = {};
                }
                if (!zones[zone][group][moduleId]) {
                    zones[zone][group][moduleId] = [];
                }
                
                zones[zone][group][moduleId].push(processedTool);
            }
        });

        // Sort: Within each module, sort by order
        // Then organize into final structure: groups with modules arrays, sorted by groupOrder
        // Blacksmith groups/priorities take precedence, Blacksmith modules appear first within groups
        Object.keys(zones).forEach(zone => {
            const zoneData = zones[zone];
            const organizedZone = {};
            const groupMetadata = {}; // Track group order for sorting (Blacksmith priority)
            
            // Process each group
            Object.keys(zoneData).forEach(groupName => {
                const groupData = zoneData[groupName];
                const organizedGroup = [];
                let groupOrder = this.MAX_GROUP_ORDER; // Default group order (999)
                let hasBlacksmithGroupOrder = false; // Track if Blacksmith set groupOrder
                
                // Process each module in this group
                Object.keys(groupData).forEach(moduleId => {
                    const moduleTools = groupData[moduleId];
                    const isBlacksmith = moduleId === this.BLACKSMITH_MODULE_ID;
                    
                    // Sort tools within module by order
                    moduleTools.sort((a, b) => (a.order || 999) - (b.order || 999));
                    
                    // Track groupOrder with Blacksmith priority
                    const moduleGroupOrder = Math.min(...moduleTools.map(t => t.groupOrder || this.MAX_GROUP_ORDER));
                    if (isBlacksmith) {
                        // Blacksmith's groupOrder always wins
                        groupOrder = moduleGroupOrder;
                        hasBlacksmithGroupOrder = true;
                    } else if (!hasBlacksmithGroupOrder) {
                        // Only use non-Blacksmith groupOrder if Blacksmith hasn't set one
                        if (moduleGroupOrder < groupOrder) {
                            groupOrder = moduleGroupOrder;
                        }
                    }
                    
                    // Add module's tools to group array
                    organizedGroup.push({
                        moduleId: moduleId,
                        tools: moduleTools,
                        isBlacksmith: isBlacksmith
                    });
                });
                
                // Sort modules: Blacksmith first, then by order (registration order within same order)
                organizedGroup.sort((a, b) => {
                    // Blacksmith always comes first
                    if (a.isBlacksmith && !b.isBlacksmith) return -1;
                    if (!a.isBlacksmith && b.isBlacksmith) return 1;
                    
                    // For same type (both Blacksmith or both not), sort by order within module
                    const aMinOrder = Math.min(...a.tools.map(t => t.order || 999));
                    const bMinOrder = Math.min(...b.tools.map(t => t.order || 999));
                    return aMinOrder - bMinOrder;
                });
                
                // Enforce "general" always last
                if (groupName === 'general') {
                    groupOrder = this.GROUP_ORDER.GENERAL; // Force to 999 (last)
                }
                
                if (organizedGroup.length > 0) {
                    organizedZone[groupName] = organizedGroup;
                    groupMetadata[groupName] = groupOrder;
                }
            });
            
            // Handle groups with order > 999: assign to first free slot under 999
            const usedOrders = new Set();
            Object.keys(groupMetadata).forEach(groupName => {
                const order = groupMetadata[groupName];
                if (order < this.MAX_GROUP_ORDER) {
                    usedOrders.add(order);
                }
            });
            
            // Find first free slot for groups that exceed MAX_GROUP_ORDER
            const groupsToReassign = [];
            Object.keys(groupMetadata).forEach(groupName => {
                if (groupMetadata[groupName] >= this.MAX_GROUP_ORDER && groupName !== 'general') {
                    groupsToReassign.push(groupName);
                }
            });
            
            // Assign each overflowing group to first free slot
            groupsToReassign.forEach(groupName => {
                let freeSlot = 1;
                while (freeSlot < this.MAX_GROUP_ORDER && usedOrders.has(freeSlot)) {
                    freeSlot++;
                }
                if (freeSlot < this.MAX_GROUP_ORDER) {
                    groupMetadata[groupName] = freeSlot;
                    usedOrders.add(freeSlot);
                } else {
                    // If no free slot found (unlikely but possible), assign to 998
                    groupMetadata[groupName] = this.MAX_GROUP_ORDER - 1;
                }
            });
            
            // Sort groups by groupOrder, then alphabetically if same order
            const sortedGroupNames = Object.keys(organizedZone).sort((a, b) => {
                const orderA = groupMetadata[a] || this.MAX_GROUP_ORDER;
                const orderB = groupMetadata[b] || this.MAX_GROUP_ORDER;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                // If same order, sort alphabetically
                return a.localeCompare(b);
            });
            
            // Rebuild organizedZone with sorted groups
            const sortedZone = {};
            sortedGroupNames.forEach(groupName => {
                sortedZone[groupName] = organizedZone[groupName];
            });
            
            zones[zone] = sortedZone;
        });

        return zones;
    }

    /**
     * Add a notification to the menubar
     * @param {string} text - The notification text to display
     * @param {string} icon - FontAwesome icon class (default: "fas fa-info-circle")
     * @param {number} duration - Duration in seconds, 0 = until manually removed (default: 5)
     * @param {string} moduleId - The module ID adding the notification (default: "blacksmith-core")
     * @returns {string} - The notification ID for later removal
     */
    static addNotification(text, icon = "fas fa-info-circle", duration = 5, moduleId = "blacksmith-core") {
        try {
            const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const notification = {
                id: notificationId,
                text: text,
                icon: icon,
                duration: duration,
                moduleId: moduleId,
                createdAt: Date.now()
            };
            
            // Store the notification
            this.notifications.set(notificationId, notification);
            
            // Set up auto-removal if duration is specified
            if (duration > 0) {
                notification.timeoutId = setTimeout(() => {
                    this.removeNotification(notificationId);
                }, duration * 1000);
            }
            
            // Re-render the menubar to show the new notification
            this.renderMenubar();
            
            postConsoleAndNotification(MODULE.NAME, `Notification added: ${text}`, "", true, false);
            return notificationId;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error adding notification", error, false, false);
            return null;
        }
    }
    
    /**
     * Update an existing notification
     * @param {string} notificationId - The notification ID to update
     * @param {Object} updates - Object containing fields to update
     * @param {string} updates.text - New notification text
     * @param {string} updates.icon - New FontAwesome icon class
     * @param {number} updates.duration - New duration in seconds (0 = persistent)
     * @returns {boolean} - True if notification was updated, false if not found
     */
    static updateNotification(notificationId, updates) {
        try {
            if (!this.notifications.has(notificationId)) {
                postConsoleAndNotification(MODULE.NAME, `Notification not found for update: ${notificationId}`, "", false, false);
                return false;
            }

            const notification = this.notifications.get(notificationId);
            
            // Update fields if provided
            if (updates.text !== undefined) notification.text = updates.text;
            if (updates.icon !== undefined) notification.icon = updates.icon;
            if (updates.duration !== undefined) {
                notification.duration = updates.duration;
                // Clear existing timeout if duration changed
                if (notification.timeoutId) {
                    clearTimeout(notification.timeoutId);
                    notification.timeoutId = null;
                }
                // Set new timeout if duration > 0
                if (updates.duration > 0) {
                    notification.timeoutId = setTimeout(() => {
                        this.removeNotification(notificationId);
                    }, updates.duration * 1000);
                }
            }

            // Re-render to show changes
            this.renderMenubar();
            
            postConsoleAndNotification(MODULE.NAME, `Notification updated: ${notificationId}`, "", true, false);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error updating notification", error, false, false);
            return false;
        }
    }

    /**
     * Remove a notification from the menubar
     * @param {string} notificationId - The notification ID to remove
     * @returns {boolean} - True if notification was removed, false if not found
     */
    static removeNotification(notificationId) {
        try {
            if (this.notifications.has(notificationId)) {
                const notification = this.notifications.get(notificationId);
                // Clear timeout if it exists
                if (notification.timeoutId) {
                    clearTimeout(notification.timeoutId);
                }
                this.notifications.delete(notificationId);
                this.renderMenubar();
                postConsoleAndNotification(MODULE.NAME, `Notification removed: ${notificationId}`, "", true, false);
                return true;
            }
            return false;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error removing notification", error, false, false);
            return false;
        }
    }
    
    /**
     * Remove all notifications from a specific module
     * @param {string} moduleId - The module ID to clear notifications for
     * @returns {number} - Number of notifications removed
     */
    static clearNotificationsByModule(moduleId) {
        try {
            let removedCount = 0;
            for (const [id, notification] of this.notifications.entries()) {
                if (notification.moduleId === moduleId) {
                    this.notifications.delete(id);
                    removedCount++;
                }
            }
            
            if (removedCount > 0) {
                this.renderMenubar();
                postConsoleAndNotification(MODULE.NAME, `Cleared ${removedCount} notifications for module: ${moduleId}`, "", true, false);
            }
            
            return removedCount;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error clearing notifications by module", error, false, false);
            return 0;
        }
    }
    
    /**
     * Get all active notifications
     * @returns {Array} - Array of notification objects
     */
    static getActiveNotifications() {
        return Array.from(this.notifications.values());
    }
    
    /**
     * Clear all notifications
     * @returns {number} - Number of notifications removed
     */
    static clearAllNotifications() {
        try {
            const count = this.notifications.size;
            // Clear all timeouts before clearing notifications
            this.notifications.forEach(notification => {
                if (notification.timeoutId) {
                    clearTimeout(notification.timeoutId);
                }
            });
            this.notifications.clear();
            this.renderMenubar();
            postConsoleAndNotification(MODULE.NAME, `Cleared all ${count} notifications`, "", true, false);
            return count;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error clearing all notifications", error, false, false);
            return 0;
        }
    }

    /**
     * Get all notification IDs for a specific module
     * @param {string} moduleId - The module ID to get notification IDs for
     * @returns {Array} - Array of notification IDs
     */
    static getNotificationIdsByModule(moduleId) {
        try {
            const notificationIds = [];
            for (const [id, notification] of this.notifications.entries()) {
                if (notification.moduleId === moduleId) {
                    notificationIds.push(id);
                }
            }
            return notificationIds;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error getting notification IDs by module", error, false, false);
            return [];
        }
    }

    // MENUBAR API TESTING 

    /**
     * Test function to verify menubar API is working
     * This can be called from console for testing
     */
    static testMenubarAPI() {
        try {
            console.log('🧪 Testing Menubar API...');
            
            // Test 1: Register a test tool
            const testToolId = 'test-menubar-tool';
            const success = this.registerMenubarTool(testToolId, {
                icon: "fa-solid fa-flask",
                name: "test-tool",
                title: "Test Tool (API Test)",
                zone: "left",
                order: 999,
                moduleId: "menubar-test",
                onClick: () => {
                    ui.notifications.info("Menubar API Test Tool Clicked!");
                    console.log("✅ Menubar API test tool clicked successfully!");
                }
            });

            if (success) {
                console.log('✅ Test 1 PASSED: Tool registration successful');
                
                // Test 2: Check if tool is registered
                const isRegistered = this.isMenubarToolRegistered(testToolId);
                if (isRegistered) {
                    console.log('✅ Test 2 PASSED: Tool found after registration');
                    
                    // Test 3: Get tools by module
                    const moduleTools = this.getMenubarToolsByModule('menubar-test');
                    if (moduleTools.length > 0) {
                        console.log('✅ Test 3 PASSED: Tool found in module tools list');
                        
                        // Test 4: Get tools by zone
                        const zoneTools = this.getMenubarToolsByZone();
                        if (zoneTools.left && zoneTools.left.length > 0) {
                            console.log('✅ Test 4 PASSED: Tool found in zone tools list');
                            
                            // Test 5: Unregister tool
                            const unregisterSuccess = this.unregisterMenubarTool(testToolId);
                            if (unregisterSuccess) {
                                console.log('✅ Test 5 PASSED: Tool unregistration successful');
                                
                                // Test 6: Verify tool is gone
                                const isStillRegistered = this.isMenubarToolRegistered(testToolId);
                                if (!isStillRegistered) {
                                    console.log('✅ Test 6 PASSED: Tool successfully removed');
                                    console.log('🎉 ALL MENUBAR API TESTS PASSED!');
                                    return true;
                                } else {
                                    console.log('❌ Test 6 FAILED: Tool still registered after unregistration');
                                }
                            } else {
                                console.log('❌ Test 5 FAILED: Tool unregistration failed');
                            }
                        } else {
                            console.log('❌ Test 4 FAILED: Tool not found in zone tools list');
                        }
                    } else {
                        console.log('❌ Test 3 FAILED: Tool not found in module tools list');
                    }
                } else {
                    console.log('❌ Test 2 FAILED: Tool not found after registration');
                }
            } else {
                console.log('❌ Test 1 FAILED: Tool registration failed');
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Menubar API Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify the refactored menubar system is using the API
     */
    static testRefactoredMenubar() {
        try {
            console.log('🧪 Testing Refactored Menubar System...');
            
            // Test 1: Check if default tools are registered
            const defaultTools = [
                'settings', 'refresh', 'vote', 'skillcheck', 'interface',
                'leader-section', 'movement', 'timer-section'
            ];
            
            let allDefaultToolsRegistered = true;
            defaultTools.forEach(toolId => {
                if (!this.isMenubarToolRegistered(toolId)) {
                    console.log(`❌ Test 1 FAILED: Default tool '${toolId}' not registered`);
                    allDefaultToolsRegistered = false;
                }
            });
            
            if (allDefaultToolsRegistered) {
                console.log('✅ Test 1 PASSED: All default tools registered via API');
                
                // Test 2: Check if tools are organized by zones
                const toolsByZone = this.getMenubarToolsByZone();
                const expectedZones = ['left', 'middle', 'right'];
                
                let zonesWorking = true;
                expectedZones.forEach(zone => {
                    if (zone === 'middle') {
                        // Middle zone is now an object with arrays
                        if (!toolsByZone[zone] || typeof toolsByZone[zone] !== 'object' || 
                            !Array.isArray(toolsByZone[zone].general) || 
                            !Array.isArray(toolsByZone[zone].leader) || 
                            !Array.isArray(toolsByZone[zone].gm)) {
                            console.log(`❌ Test 2 FAILED: Zone '${zone}' not working properly`);
                            zonesWorking = false;
                        }
                    } else {
                        if (!toolsByZone[zone] || !Array.isArray(toolsByZone[zone])) {
                            console.log(`❌ Test 2 FAILED: Zone '${zone}' not working properly`);
                            zonesWorking = false;
                        }
                    }
                });
                
                if (zonesWorking) {
                    console.log('✅ Test 2 PASSED: Tools properly organized by zones');
                    console.log('🎉 REFACTORED MENUBAR SYSTEM TESTS PASSED!');
                    console.log('📊 Zone Summary:');
                    const leftCount = Object.values(toolsByZone.left).reduce((sum, group) => sum + group.reduce((s, m) => s + m.tools.length, 0), 0);
                    const middleCount = Object.values(toolsByZone.middle).reduce((sum, group) => sum + group.reduce((s, m) => s + m.tools.length, 0), 0);
                    const rightCount = Object.values(toolsByZone.right).reduce((sum, group) => sum + group.reduce((s, m) => s + m.tools.length, 0), 0);
                    console.log(`   Left: ${leftCount} tools`);
                    console.log(`   Middle: ${middleCount} tools`);
                    console.log(`   Right: ${rightCount} tools`);
                    return true;
                } else {
                    console.log('❌ Test 2 FAILED: Zone organization not working');
                }
            } else {
                console.log('❌ Test 1 FAILED: Default tools not properly registered');
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Refactored Menubar Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify notification system
     */
    static testNotificationSystem() {
        try {
            console.log('🧪 Testing Notification System...');
            
            // Test 1: Add a test notification
            const notificationId = this.addNotification(
                "Test notification - should disappear in 3 seconds",
                "fas fa-info-circle",
                3,
                "test-module"
            );
            
            if (!notificationId) {
                console.log('❌ Failed to add notification');
                return false;
            }
            
            console.log('✅ Test notification added with ID:', notificationId);
            
            // Test 2: Add a persistent notification
            const persistentId = this.addNotification(
                "Persistent notification - click X to close",
                "fas fa-exclamation-triangle",
                0, // 0 = until manually removed
                "test-module"
            );
            
            console.log('✅ Persistent notification added with ID:', persistentId);
            
            // Test 3: Check active notifications
            const activeNotifications = this.getActiveNotifications();
            console.log('✅ Active notifications count:', activeNotifications.length);
            
            console.log('💡 Watch for the first notification to auto-disappear in 3 seconds');
            console.log('💡 Click the X button on the second notification to test manual removal');
            
            return true;
            
        } catch (error) {
            console.error('❌ Notification System Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify interface tool display and functionality
     */
    static testInterfaceTool() {
        try {
            console.log('🧪 Testing Interface Tool Display...');
            
            // Check if interface tool is registered
            if (!this.isMenubarToolRegistered('interface')) {
                console.log('❌ Interface tool not registered');
                return false;
            }
            
            // Get the interface tool element
            const interfaceElement = document.querySelector('[data-tool="interface"]');
            if (!interfaceElement) {
                console.log('❌ Interface tool element not found in DOM');
                return false;
            }
            
            // Check the tooltip attribute
            const tooltip = interfaceElement.getAttribute('title');
            const labelText = interfaceElement.querySelector('.interface-label')?.textContent;
            
            console.log('✅ Interface tool element found:', interfaceElement);
            console.log('✅ Tooltip (title attribute):', tooltip);
            console.log('✅ Visible label text:', labelText);
            
            if (tooltip && tooltip.length > 50) {
                console.log('✅ Long tooltip is properly set as title attribute');
            } else {
                console.log('❌ Tooltip not properly set');
                return false;
            }
            
            if (labelText && labelText === 'Toggle Interface') {
                console.log('✅ Short label text is properly displayed');
            } else {
                console.log('❌ Label text not properly set:', labelText);
                return false;
            }
            
            console.log('💡 Try clicking the interface tool to test functionality');
            
            return true;
            
        } catch (error) {
            console.error('❌ Interface Tool Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify settings tool click handling
     */
    static testSettingsTool() {
        try {
            console.log('🧪 Testing Settings Tool Click...');
            
            // Check if settings tool is registered
            if (!this.isMenubarToolRegistered('settings')) {
                console.log('❌ Settings tool not registered');
                return false;
            }
            
            // Get the settings tool element
            const settingsElement = document.querySelector('[data-tool="settings"]');
            if (!settingsElement) {
                console.log('❌ Settings tool element not found in DOM');
                return false;
            }
            
            // Check if game.settings.sheet exists
            if (!game.settings.sheet) {
                console.log('❌ game.settings.sheet not available');
                return false;
            }
            
            console.log('✅ Settings tool element found:', settingsElement);
            console.log('✅ Settings tool is registered and clickable');
            console.log('✅ game.settings.sheet is available');
            console.log('💡 Try clicking the settings tool in the left zone to test functionality');
            
            return true;
            
        } catch (error) {
            console.error('❌ Settings Tool Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify movement tool click handling
     */
    static testMovementTool() {
        try {
            console.log('🧪 Testing Movement Tool Click...');
            
            // Check if movement tool is registered
            if (!this.isMenubarToolRegistered('movement')) {
                console.log('❌ Movement tool not registered');
                return false;
            }
            
            // Get the movement tool element
            const movementElement = document.querySelector('[data-tool="movement"]');
            if (!movementElement) {
                console.log('❌ Movement tool element not found in DOM');
                return false;
            }
            
            console.log('✅ Movement tool element found:', movementElement);
            console.log('✅ Movement tool is registered and clickable');
            console.log('💡 Try clicking the movement tool in the right zone to test functionality');
            
            return true;
            
        } catch (error) {
            console.error('❌ Movement Tool Test Error:', error);
            return false;
        }
    }

    /**
     * Test function to verify Create Combat button functionality
     */
    static testCreateCombatTool() {
        try {
            console.log('🧪 Testing Create Combat Tool...');
            
            // Check if create-combat tool is registered
            if (!this.isMenubarToolRegistered('create-combat')) {
                console.log('❌ Create Combat tool not registered');
                return false;
            }
            
            // Get the create-combat tool element
            const createCombatElement = document.querySelector('[data-tool="create-combat"]');
            if (!createCombatElement) {
                console.log('❌ Create Combat tool element not found in DOM');
                return false;
            }
            
            // Check tool properties
            const toolData = this.toolbarIcons.get('create-combat');
            if (!toolData) {
                console.log('❌ Create Combat tool data not found');
                return false;
            }
            
            // Verify tool properties
            const expectedIcon = "fas fa-swords";
            const expectedTitle = "Create Combat";
            const expectedZone = "middle";
            const expectedGmOnly = true;
            
            if (toolData.icon !== expectedIcon) {
                console.log(`❌ Icon mismatch: expected "${expectedIcon}", got "${toolData.icon}"`);
                return false;
            }
            
            if (toolData.title !== expectedTitle) {
                console.log(`❌ Title mismatch: expected "${expectedTitle}", got "${toolData.title}"`);
                return false;
            }
            
            if (toolData.zone !== expectedZone) {
                console.log(`❌ Zone mismatch: expected "${expectedZone}", got "${toolData.zone}"`);
                return false;
            }
            
            if (toolData.gmOnly !== expectedGmOnly) {
                console.log(`❌ GM-only flag mismatch: expected ${expectedGmOnly}, got ${toolData.gmOnly}`);
                return false;
            }
            
            console.log('✅ Create Combat tool element found:', createCombatElement);
            console.log('✅ Create Combat tool is registered with correct properties');
            console.log('✅ Icon:', toolData.icon);
            console.log('✅ Title:', toolData.title);
            console.log('✅ Zone:', toolData.zone);
            console.log('✅ GM-only:', toolData.gmOnly);
            console.log('💡 Try clicking the Create Combat tool in the middle zone to test functionality');
            console.log('💡 Make sure you have tokens on the canvas for testing');
            
            return true;
            
        } catch (error) {
            console.error('❌ Create Combat Tool Test Error:', error);
            return false;
        }
    }

    // SECONDARY BAR SYSTEM 

    /**
     * Register a secondary bar type
     * @param {string} typeId - Unique identifier for the bar type
     * @param {Object} config - Configuration object
     * @param {number} config.height - Height of the secondary bar
     * @param {string} config.persistence - 'manual' or 'auto'
     * @param {number} config.autoCloseDelay - Delay in ms for auto-close (default: 10000)
     * @returns {boolean} Success status
     */
    static async registerSecondaryBarType(typeId, config) {
        try {
            if (!typeId || typeof typeId !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Invalid typeId provided", { typeId }, false, false);
                return false;
            }

            if (!config || typeof config !== 'object') {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Invalid config provided", { config }, false, false);
                return false;
            }

            const barType = {
                typeId: typeId,
                height: config.height || 50,
                persistence: config.persistence || 'manual',
                autoCloseDelay: config.autoCloseDelay || 10000,
                templatePath: config.templatePath || null,
                hasCustomTemplate: !!config.templatePath,
                groupBannerEnabled: config.groupBannerEnabled === true,
                groupBannerColor: config.groupBannerColor || 'rgba(62, 62, 163, 0.9)'
            };
            
            // Handle group configurations - merge if bar type already exists
            if (config.groups && typeof config.groups === 'object') {
                if (!this.secondaryBarGroups.has(typeId)) {
                    this.secondaryBarGroups.set(typeId, new Map());
                }
                const groups = this.secondaryBarGroups.get(typeId);
                
                // Merge group configurations (existing groups are preserved, new ones added)
                for (const [groupId, groupConfig] of Object.entries(config.groups)) {
                    if (groups.has(groupId)) {
                        // Merge existing group config (update mode, order, and bannerColor if provided)
                        const existing = groups.get(groupId);
                        groups.set(groupId, {
                            mode: groupConfig.mode || existing.mode || 'default',
                            order: groupConfig.order !== undefined ? groupConfig.order : (existing.order !== undefined ? existing.order : 999),
                            bannerColor: groupConfig.bannerColor !== undefined ? groupConfig.bannerColor : (existing.bannerColor || undefined),
                            masterSwitchGroup: groupConfig.masterSwitchGroup || existing.masterSwitchGroup || undefined
                        });
                    } else {
                        // New group
                        groups.set(groupId, {
                            mode: groupConfig.mode || 'default',
                            order: groupConfig.order !== undefined ? groupConfig.order : 999,
                            bannerColor: groupConfig.bannerColor || undefined,
                            masterSwitchGroup: groupConfig.masterSwitchGroup || undefined
                        });
                    }
                }
                
                // Initialize active states for switch groups
                if (!this.secondaryBarActiveStates.has(typeId)) {
                    this.secondaryBarActiveStates.set(typeId, new Map());
                }
            }
            
            // Ensure default group exists
            if (!this.secondaryBarGroups.has(typeId)) {
                this.secondaryBarGroups.set(typeId, new Map());
            }
            const groups = this.secondaryBarGroups.get(typeId);
            if (!groups.has('default')) {
                groups.set('default', { mode: 'default', order: 0 });
            }

            // If custom template provided, load and register it
            if (config.templatePath) {
                try {
                    const templateContent = await fetch(config.templatePath).then(r => r.text());
                    const partialName = `menubar-${typeId}`;
                    Handlebars.registerPartial(partialName, templateContent);
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Custom template registered", 
                        { typeId, partialName }, true, false);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Failed to load template", 
                        { typeId, templatePath: config.templatePath, error }, false, true);
                    return false;
                }
            }

            this.secondaryBarTypes.set(typeId, barType);

            // Initialize items storage for this bar type
            if (!this.secondaryBarItems.has(typeId)) {
                this.secondaryBarItems.set(typeId, new Map());
            }
            
            // Initialize active states if not exists
            if (!this.secondaryBarActiveStates.has(typeId)) {
                this.secondaryBarActiveStates.set(typeId, new Map());
            }
            
            // Apply any pending items that were registered before this bar type existed
            const pendingItems = this.pendingSecondaryBarItems.get(typeId);
            if (pendingItems && pendingItems.size > 0) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Applying pending items", 
                    { typeId, count: pendingItems.size }, true, false);
                const items = this.secondaryBarItems.get(typeId);
                const groups = this.secondaryBarGroups.get(typeId);
                const activeStates = this.secondaryBarActiveStates.get(typeId);
                
                pendingItems.forEach((itemData, itemId) => {
                    items.set(itemId, itemData);
                    
                    // Ensure groups exist for pending items
                    if (groups) {
                        const groupId = itemData.group || 'default';
                        if (!groups.has(groupId)) {
                            groups.set(groupId, { mode: 'default', order: 999 });
                        }
                        
                        // Initialize active state for switch groups (buttons only)
                        const groupConfig = groups.get(groupId);
                        if (groupConfig.mode === 'switch' && activeStates && itemData.kind !== 'info' && itemData.kind !== 'progressbar' && itemData.kind !== 'balancebar') {
                            if (!activeStates.has(groupId)) {
                                // First item in switch group, make it active
                                activeStates.set(groupId, itemId);
                                itemData.active = true;
                            }
                        }
                    }
                });
                this.pendingSecondaryBarItems.delete(typeId);
            }

            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Type registered successfully", 
                { typeId, hasCustomTemplate: barType.hasCustomTemplate }, true, false);
            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error registering type", { typeId, error }, false, false);
            return false;
        }
    }

    /**
     * Register an item to a secondary bar (for default tool system)
     * Items can be buttons (clickable) or info (display-only). Supports zones: left, middle, right.
     * @param {string} barTypeId - The bar type to register the item to
     * @param {string} itemId - Unique identifier for the item
     * @param {Object} itemData - Item configuration
     * @param {string} [itemData.kind] - 'button' (default), 'info', 'progressbar', or 'balancebar'
     * @param {string} [itemData.zone] - 'left' | 'middle' | 'right' (default: 'middle')
     * @returns {boolean} Success status
     */
    static registerSecondaryBarItem(barTypeId, itemId, itemData) {
        try {
            const kind = itemData.kind || 'button';
            const zone = (itemData.zone === 'left' || itemData.zone === 'middle' || itemData.zone === 'right') ? itemData.zone : 'middle';

            if (kind === 'info') {
                // Info item: display-only, must have label or value (or both)
                if (!itemId || !itemData || (itemData.label === undefined && itemData.value === undefined)) {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Info item requires label or value",
                        { barTypeId, itemId }, false, false);
                    return false;
                }
            } else if (kind === 'progressbar') {
                // Progressbar: display-only, requires width, borderColor, barColor, progressColor, percentProgress
                if (!itemId || !itemData || itemData.width === undefined || itemData.borderColor === undefined ||
                    itemData.barColor === undefined || itemData.progressColor === undefined || itemData.percentProgress === undefined) {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Progressbar item requires width, borderColor, barColor, progressColor, percentProgress",
                        { barTypeId, itemId }, false, false);
                    return false;
                }
            } else if (kind === 'balancebar') {
                // Balancebar: display-only, -100..+100 from center. Requires width, borderColor, barColorLeft, barColorRight, markerColor; percentProgress defaults to 0
                if (!itemId || !itemData || itemData.width === undefined || itemData.borderColor === undefined ||
                    itemData.barColorLeft === undefined || itemData.barColorRight === undefined || itemData.markerColor === undefined) {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Balancebar item requires width, borderColor, barColorLeft, barColorRight, markerColor",
                        { barTypeId, itemId }, false, false);
                    return false;
                }
            } else {
                // Button: must have icon or image, and onClick
                if (!itemId || !itemData || (!itemData.icon && !itemData.image) || typeof itemData.onClick !== 'function') {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Invalid item data",
                        { barTypeId, itemId, hasIcon: !!itemData?.icon, hasImage: !!itemData?.image, hasOnClick: typeof itemData?.onClick === 'function' }, false, false);
                    return false;
                }
            }

            // Check if bar type exists
            const barType = this.secondaryBarTypes.get(barTypeId);
            if (!barType) {
                // Bar type doesn't exist yet - store in pending queue
                if (!this.pendingSecondaryBarItems.has(barTypeId)) {
                    this.pendingSecondaryBarItems.set(barTypeId, new Map());
                }
                const pendingItems = this.pendingSecondaryBarItems.get(barTypeId);
                const groupId = itemData.group || 'default';
                pendingItems.set(itemId, {
                    ...itemData,
                    itemId: itemId,
                    barTypeId: barTypeId,
                    kind: kind,
                    zone: zone,
                    group: groupId,
                    toggleable: kind === 'button' ? (itemData.toggleable || false) : false,
                    iconColor: itemData.iconColor || null,
                    image: itemData.image || null,
                    ...(kind === 'progressbar' && { height: itemData.height }),
                    ...(kind === 'balancebar' && { height: itemData.height, percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 })
                });
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Item queued (bar type not registered yet)",
                    { barTypeId, itemId }, true, false);
                return true;
            }

            // Bar type exists - check if it supports items (not custom template)
            if (barType.hasCustomTemplate) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Cannot register items to custom template bar",
                    { barTypeId, itemId }, false, false);
                return false;
            }

            // Store item
            const items = this.secondaryBarItems.get(barTypeId);
            const groupId = itemData.group || 'default';
            const toggleable = kind === 'button' ? (itemData.toggleable || false) : false;

            items.set(itemId, {
                ...itemData,
                itemId: itemId,
                barTypeId: barTypeId,
                kind: kind,
                zone: zone,
                group: groupId,
                toggleable: toggleable,
                iconColor: itemData.iconColor || null,
                image: itemData.image || null,
                ...(kind === 'progressbar' && { height: itemData.height }),
                ...(kind === 'balancebar' && { height: itemData.height, percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 })
            });

            // Ensure group exists (in case item registered before group config)
            if (!this.secondaryBarGroups.has(barTypeId)) {
                this.secondaryBarGroups.set(barTypeId, new Map());
            }
            const groups = this.secondaryBarGroups.get(barTypeId);
            if (!groups.has(groupId)) {
                groups.set(groupId, { mode: 'default', order: 999 });
            }

            // Initialize active state for switch groups (buttons only)
            if (kind === 'button') {
                const groupConfig = groups.get(groupId);
                if (groupConfig.mode === 'switch') {
                    if (!this.secondaryBarActiveStates.has(barTypeId)) {
                        this.secondaryBarActiveStates.set(barTypeId, new Map());
                    }
                    const activeStates = this.secondaryBarActiveStates.get(barTypeId);

                    // If no active item in this switch group, make this the first one (if it's the first item)
                    if (!activeStates.has(groupId)) {
                        const groupItems = Array.from(items.values()).filter(item => item.group === groupId && item.kind !== 'info' && item.kind !== 'progressbar' && item.kind !== 'balancebar');
                        if (groupItems.length === 1) {
                            // First item in switch group, make it active
                            activeStates.set(groupId, itemId);
                            items.get(itemId).active = true;
                        }
                    }
                }
            }

            // If bar is currently open, re-render
            if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
                this.renderMenubar(true);
            }

            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Item registered",
                { barTypeId, itemId }, true, false);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error registering item",
                { barTypeId, itemId, error }, false, false);
            return false;
        }
    }

    /**
     * Update a secondary bar item's active state
     * @param {string} barTypeId - The bar type ID
     * @param {string} itemId - The item ID to update
     * @param {boolean} active - The active state
     * @returns {boolean} Success status
     */
    static updateSecondaryBarItemActive(barTypeId, itemId, active) {
        try {
            const items = this.secondaryBarItems.get(barTypeId);
            if (!items) {
                return false;
            }

            const item = items.get(itemId);
            if (!item) {
                return false;
            }

            const groups = this.secondaryBarGroups.get(barTypeId);
            const groupConfig = groups?.get(item.group || 'default') || { mode: 'default' };
            const activeStates = this.secondaryBarActiveStates.get(barTypeId);

            // Handle switch groups: can't manually set active, must switch
            if (groupConfig.mode === 'switch') {
                if (active) {
                    // Switching to this item
                    if (activeStates) {
                        activeStates.set(item.group || 'default', itemId);
                    }
                    // Enforce master switch group (only one active across groups)
                    if (groupConfig.masterSwitchGroup && groups) {
                        for (const [otherGroupId, otherConfig] of groups.entries()) {
                            if (otherGroupId === (item.group || 'default')) continue;
                            if (otherConfig?.masterSwitchGroup !== groupConfig.masterSwitchGroup) continue;
                            if (activeStates) {
                                activeStates.delete(otherGroupId);
                            }
                            const otherItems = Array.from(items.values()).filter(i => (i.group || 'default') === otherGroupId);
                            for (const otherItem of otherItems) {
                                otherItem.active = false;
                            }
                        }
                    }
                }
                // Can't deactivate in switch mode - one must always be active
            } else {
                // Default mode: can set active state directly
                item.active = !!active;
            }

            // Re-render if bar is open
            if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
                this.renderMenubar(true);
            }

            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error updating item active state", 
                { barTypeId, itemId, error }, false, false);
            return false;
        }
    }

    /**
     * Update the display value and/or label of an info item, or progress of a progressbar/balancebar item, on a secondary bar.
     * Use this to push dynamic content without re-registering the item.
     * @param {string} barTypeId - The bar type ID
     * @param {string} itemId - The item ID to update (info, progressbar, or balancebar)
     * @param {Object} updates - New values (omit keys to leave unchanged; pass null to clear). Info: value, label, borderColor, buttonColor, iconColor. Progressbar: percentProgress, leftLabel, rightLabel, leftIcon, rightIcon, title, icon, barColor, progressColor, borderColor. Balancebar: percentProgress (-100..+100), leftLabel, rightLabel, leftIcon, rightIcon, title, icon, barColorLeft, barColorRight, markerColor, borderColor.
     * @returns {boolean} Success status
     */
    static updateSecondaryBarItemInfo(barTypeId, itemId, updates) {
        try {
            const hasInfoUpdate = updates && (updates.value !== undefined || updates.label !== undefined || updates.borderColor !== undefined ||
                updates.buttonColor !== undefined || updates.iconColor !== undefined);
            const hasProgressbarUpdate = updates && (updates.percentProgress !== undefined || updates.leftLabel !== undefined || updates.rightLabel !== undefined ||
                updates.leftIcon !== undefined || updates.rightIcon !== undefined || updates.title !== undefined || updates.icon !== undefined ||
                updates.barColor !== undefined || updates.progressColor !== undefined);
            const hasBalancebarUpdate = updates && (updates.percentProgress !== undefined || updates.leftLabel !== undefined || updates.rightLabel !== undefined ||
                updates.leftIcon !== undefined || updates.rightIcon !== undefined || updates.title !== undefined || updates.icon !== undefined ||
                updates.barColorLeft !== undefined || updates.barColorRight !== undefined || updates.markerColor !== undefined || updates.borderColor !== undefined);
            if (!updates || (!hasInfoUpdate && !hasProgressbarUpdate && !hasBalancebarUpdate)) {
                return false;
            }
            if (!this.secondaryBarInfoUpdates.has(barTypeId)) {
                this.secondaryBarInfoUpdates.set(barTypeId, new Map());
            }
            const map = this.secondaryBarInfoUpdates.get(barTypeId);
            const existing = map.get(itemId) || {};
            if (updates.value !== undefined) existing.value = updates.value;
            if (updates.label !== undefined) existing.label = updates.label;
            if (updates.borderColor !== undefined) existing.borderColor = updates.borderColor;
            if (updates.buttonColor !== undefined) existing.buttonColor = updates.buttonColor;
            if (updates.iconColor !== undefined) existing.iconColor = updates.iconColor;
            if (updates.percentProgress !== undefined) existing.percentProgress = updates.percentProgress;
            if (updates.leftLabel !== undefined) existing.leftLabel = updates.leftLabel;
            if (updates.rightLabel !== undefined) existing.rightLabel = updates.rightLabel;
            if (updates.leftIcon !== undefined) existing.leftIcon = updates.leftIcon;
            if (updates.rightIcon !== undefined) existing.rightIcon = updates.rightIcon;
            if (updates.title !== undefined) existing.title = updates.title;
            if (updates.icon !== undefined) existing.icon = updates.icon;
            if (updates.barColor !== undefined) existing.barColor = updates.barColor;
            if (updates.progressColor !== undefined) existing.progressColor = updates.progressColor;
            if (updates.barColorLeft !== undefined) existing.barColorLeft = updates.barColorLeft;
            if (updates.barColorRight !== undefined) existing.barColorRight = updates.barColorRight;
            if (updates.markerColor !== undefined) existing.markerColor = updates.markerColor;
            map.set(itemId, existing);

            if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
                this.renderMenubar(true);
            }
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error updating info item",
                { barTypeId, itemId, error }, false, false);
            return false;
        }
    }

    /**
     * Register which menubar tool ID toggles a given secondary bar type (so open/close syncs the tool's active state).
     * @param {string} barTypeId - The secondary bar type (e.g. 'broadcast', 'combat')
     * @param {string} toolId - The menubar tool id registered with registerMenubarTool (e.g. 'broadcast-toggle')
     */
    static registerSecondaryBarTool(barTypeId, toolId) {
        this.secondaryBarToolMapping.set(barTypeId, toolId);
    }

    /**
     * Unregister an item from a secondary bar
     * @param {string} barTypeId - The bar type to unregister the item from
     * @param {string} itemId - Unique identifier for the item
     * @returns {boolean} Success status
     */
    static unregisterSecondaryBarItem(barTypeId, itemId) {
        try {
            // Get item before removing to check its group
            const items = this.secondaryBarItems.get(barTypeId);
            let item = null;
            if (items) {
                item = items.get(itemId);
                items.delete(itemId);
            }

            // Remove from pending items
            const pendingItems = this.pendingSecondaryBarItems.get(barTypeId);
            if (pendingItems) {
                pendingItems.delete(itemId);
            }
            
            // Handle active states for switch groups
            if (item && this.secondaryBarActiveStates.has(barTypeId)) {
                const activeStates = this.secondaryBarActiveStates.get(barTypeId);
                const groups = this.secondaryBarGroups.get(barTypeId);
                
                if (groups) {
                    const groupConfig = groups.get(item.group || 'default');
                    if (groupConfig && groupConfig.mode === 'switch') {
                        const groupId = item.group || 'default';
                        const currentActive = activeStates.get(groupId);
                        
                        // If the removed item was active, activate the first remaining item in the group (buttons only)
                        if (currentActive === itemId && items) {
                            const groupItems = Array.from(items.values())
                                .filter(i => i.group === groupId && i.kind !== 'info' && i.kind !== 'progressbar' && i.kind !== 'balancebar')
                                .sort((a, b) => {
                                    const aOrder = a.order !== undefined ? a.order : Infinity;
                                    const bOrder = b.order !== undefined ? b.order : Infinity;
                                    if (aOrder !== bOrder) return aOrder - bOrder;
                                    return (a.itemId || '').localeCompare(b.itemId || '');
                                });
                            
                            if (groupItems.length > 0) {
                                // Activate the first item in the group
                                activeStates.set(groupId, groupItems[0].itemId);
                            } else {
                                // No items left in group, remove active state
                                activeStates.delete(groupId);
                            }
                        }
                    }
                }
            }

            // Re-render if bar is open
            if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
                this.renderMenubar(true);
            }

            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error unregistering item", 
                { barTypeId, itemId, error }, false, false);
            return false;
        }
    }

    /**
     * Get all items for a secondary bar type
     * @param {string} barTypeId - The bar type to get items for
     * @returns {Array} Array of item data objects, sorted by order (then by itemId)
     */
    static getSecondaryBarItems(barTypeId) {
        const items = this.secondaryBarItems.get(barTypeId);
        if (!items) return [];
        
        // Convert to array and sort by order, then by itemId for consistent ordering
        const itemsArray = Array.from(items.values());
        return itemsArray.sort((a, b) => {
            // Items with order come first, sorted by order value
            const aOrder = a.order !== undefined ? a.order : Infinity;
            const bOrder = b.order !== undefined ? b.order : Infinity;
            
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            
            // If same order or no order, sort alphabetically by itemId
            return (a.itemId || '').localeCompare(b.itemId || '');
        });
    }

    /**
     * Open a secondary bar
     * @param {string} typeId - Type of secondary bar to open
     * @param {Object} options - Options for the bar
     * @param {Object} options.data - Data to pass to the bar template
     * @param {string} options.persistence - Override persistence mode
     * @param {number} options.height - Override height
     * @returns {boolean} Success status
     */
    static openSecondaryBar(typeId, options = {}) {
        try {
            // If the same type is already open, just update it
            if (this.secondaryBar.isOpen && this.secondaryBar.type === typeId) {
                if (options.data) {
                    this.updateSecondaryBar(options.data);
                }
                return true;
            }

            // Get the previously open bar type before closing
            const previousType = this.secondaryBar.type;
            
            // Close any existing secondary bar first (skip button sync - we'll do it after)
            this.closeSecondaryBar(false);

            const barType = this.secondaryBarTypes.get(typeId);
            if (!barType) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Type not registered", { typeId }, false, false);
                return false;
            }

            // Set up the secondary bar
            this.secondaryBar.isOpen = true;
            this.secondaryBar.type = typeId;
            
            // Update button states: deactivate previous bar's button, activate new bar's button
            this._syncSecondaryBarButtonStates(previousType, typeId);
            this.secondaryBar.height = options.height || barType.height || this.getSecondaryBarHeight(typeId);
            this.secondaryBar.persistence = options.persistence || barType.persistence;
            this.secondaryBar.data = options.data || {};

            // For party bar, refresh party health progressbar so it shows current HP
            if (typeId === 'party') {
                this._refreshPartyBarInfo();
            }

            // Set the CSS variables for secondary bar height and total height
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', `${this.secondaryBar.height}px`);
            document.documentElement.style.setProperty('--blacksmith-menubar-total-height', `calc(var(--blacksmith-menubar-primary-height) + var(--blacksmith-menubar-secondary-height))`);

            // Set up auto-close if needed
            if (this.secondaryBar.persistence === 'auto') {
                this._setAutoCloseTimeout();
            }

            // Sync button states: deactivate previous bar's button, activate new bar's button
            this._syncSecondaryBarButtonStates(previousType, typeId);

            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Opened", { typeId, height: this.secondaryBar.height }, true, false);

            // Re-render the menubar to show the secondary bar
            this.renderMenubar(true);

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error opening bar", { typeId, error }, false, false);
            return false;
        }
    }

    /**
     * Close the secondary bar
     * @returns {boolean} Success status
     */
    static closeSecondaryBar(userInitiated = false, syncButtons = true) {
        try {
            if (!this.secondaryBar.isOpen) {
                return true; // Already closed
            }

            // Clear auto-close timeout if it exists
            if (this.secondaryBar.autoCloseTimeout) {
                clearTimeout(this.secondaryBar.autoCloseTimeout);
                this.secondaryBar.autoCloseTimeout = null;
            }

            // Get the closing bar type before resetting
            const closingType = this.secondaryBar.type;

            // Reset secondary bar state
            this.secondaryBar.isOpen = false;
            this.secondaryBar.type = null;
            this.secondaryBar.data = {};
            
            // Update button state: deactivate the closing bar's button
            if (syncButtons && closingType) {
                this._syncSecondaryBarButtonStates(closingType, null);
            }

            // Reset the CSS variables for secondary bar height and total height
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', '0px');
            document.documentElement.style.setProperty('--blacksmith-menubar-total-height', 'var(--blacksmith-menubar-primary-height)');

            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Closed", "", true, false);

            // Clean up any existing secondary bars in DOM
            this._cleanupSecondaryBars();

            // Re-render the menubar to hide the secondary bar
            this.renderMenubar(true);

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error closing bar", { error }, false, false);
            return false;
        }
    }

    /**
     * Clean up any existing secondary bars from DOM
     * @private
     */
    static _cleanupSecondaryBars() {
        try {
            document.querySelectorAll('.blacksmith-menubar-secondary').forEach(el => {
                el.remove();
            });
            // Reset CSS variables when cleaning up
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', '0px');
            document.documentElement.style.setProperty('--blacksmith-menubar-total-height', 'var(--blacksmith-menubar-primary-height)');
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error cleaning up DOM", { error }, false, false);
        }
    }

    /**
     * Toggle the secondary bar
     * @param {string} typeId - Type of secondary bar to toggle
     * @param {Object} options - Options for the bar
     * @returns {boolean} Success status
     */
    static toggleSecondaryBar(typeId, options = {}) {
        try {
            if (this._isUserExcluded(game.user)) return false;
            if (this.secondaryBar.isOpen && this.secondaryBar.type === typeId) {
                return this.closeSecondaryBar(true);
            } else {
                return this.openSecondaryBar(typeId, options);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error toggling bar", { typeId, error }, false, false);
            return false;
        }
    }

    /**
     * Update the secondary bar data without reopening
     * @param {Object} data - New data for the bar
     * @returns {boolean} Success status
     */
    static updateSecondaryBar(data) {
        try {
            if (this._isUserExcluded(game.user)) return false;
            if (!this.secondaryBar.isOpen) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Cannot update closed bar", "", false, false);
                return false;
            }
            this.secondaryBar.data = { ...this.secondaryBar.data, ...data };

            this.renderMenubar(true);

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error updating bar", { error }, false, false);
            return false;
        }
    }

    /**
     * Set up auto-close timeout for secondary bar
     * @private
     */
    static _setAutoCloseTimeout() {
        if (this.secondaryBar.autoCloseTimeout) {
            clearTimeout(this.secondaryBar.autoCloseTimeout);
        }

        const barType = this.secondaryBarTypes.get(this.secondaryBar.type);
        const delay = barType?.autoCloseDelay || this.secondaryBar.autoCloseDelay;

        this.secondaryBar.autoCloseTimeout = setTimeout(() => {
            this.closeSecondaryBar();
        }, delay);
    }

    /**
     * Reset auto-close timeout (called when user interacts with bar)
     * @private
     */
    static _resetAutoCloseTimeout() {
        if (this.secondaryBar.persistence === 'auto') {
            this._setAutoCloseTimeout();
        }
    }

    /**
     * Sync button active states when secondary bars change
     * @private
     * @param {string|null} previousType - The previously open bar type (or null if none)
     * @param {string|null} newType - The newly opening bar type (or null if closing)
     */
    static _syncSecondaryBarButtonStates(previousType, newType) {
        try {
            // Deactivate previous bar's button if it exists
            if (previousType) {
                const previousToolId = this.secondaryBarToolMapping.get(previousType);
                if (previousToolId) {
                    const previousTool = this.toolbarIcons.get(previousToolId);
                    if (previousTool && previousTool.toggleable) {
                        previousTool.active = false;
                    }
                }
            }
            
            // Activate new bar's button if it exists
            if (newType) {
                const newToolId = this.secondaryBarToolMapping.get(newType);
                if (newToolId) {
                    const newTool = this.toolbarIcons.get(newToolId);
                    if (newTool && newTool.toggleable) {
                        newTool.active = true;
                    }
                }
            }
            
            // Re-render to show updated states
            this.renderMenubar(true);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error syncing button states", { previousType, newType, error }, false, false);
        }
    }

    /**
     * Test function to verify secondary bar system
     */
    static testSecondaryBarSystem() {
        try {
            console.log('🧪 Testing Secondary Bar System...');
            
            // Test 1: Register a test secondary bar type
            const success = this.registerSecondaryBarType('test-bar', {
                height: 60,
                persistence: 'manual',
                autoCloseDelay: 5000
            });
            
            if (!success) {
                console.log('❌ Test 1 FAILED: Could not register test bar type');
                return false;
            }
            
            console.log('✅ Test 1 PASSED: Test bar type registered');
            
            // Test 2: Open the test secondary bar
            const openSuccess = this.openSecondaryBar('test-bar', {
                data: { testData: 'Hello World' }
            });
            
            if (!openSuccess) {
                console.log('❌ Test 2 FAILED: Could not open test bar');
                return false;
            }
            
            console.log('✅ Test 2 PASSED: Test bar opened');
            
            // Test 3: Update the bar data
            const updateSuccess = this.updateSecondaryBar({ 
                testData: 'Updated Data',
                timestamp: Date.now()
            });
            
            if (!updateSuccess) {
                console.log('❌ Test 3 FAILED: Could not update bar data');
                return false;
            }
            
            console.log('✅ Test 3 PASSED: Bar data updated');
            
            // Test 4: Close the bar
            setTimeout(() => {
                const closeSuccess = this.closeSecondaryBar();
                if (closeSuccess) {
                    console.log('✅ Test 4 PASSED: Bar closed successfully');
                    console.log('🎉 ALL SECONDARY BAR TESTS PASSED!');
                } else {
                    console.log('❌ Test 4 FAILED: Could not close bar');
                }
            }, 2000);
            
            return true;
            
        } catch (error) {
            console.error('❌ Secondary Bar Test Error:', error);
            return false;
        }
    }

    /**
     * Per-user menubar hiding previously used world setting `excludedUsersMenubar`; that UX lives in Herald now.
     * @returns {boolean} always false — Blacksmith does not exclude users from the menubar.
     */
    static _isUserExcluded(_user) {
        return false;
    }

    static _removeMenubarDom() {
        document.querySelector('.blacksmith-menubar-container')?.remove();
        document.querySelectorAll('.blacksmith-menubar-secondary').forEach(el => el.remove());
        this._menubarStructureFingerprint = null;
        this._lastMenubarIsLeader = undefined;
        // Set all height variables to 0 to prevent content from being pushed down
        document.documentElement.style.setProperty('--blacksmith-menubar-primary-height', '0px');
        document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', '0px');
        document.documentElement.style.setProperty('--blacksmith-menubar-total-height', '0px');
    }

    /**
     * Prepare secondary bar data for template rendering
     * @returns {Object} Prepared secondary bar data
     * @private
     */
    static _prepareSecondaryBarData() {
        const data = { ...this.secondaryBar };
        
        if (!data.isOpen || !data.type) {
            data.hasCustomTemplate = false;
            return data;
        }

        const barType = this.secondaryBarTypes.get(data.type);
        if (!barType) {
            data.hasCustomTemplate = false;
            return data;
        }

        // Set hasCustomTemplate flag based on bar type
        data.hasCustomTemplate = barType.hasCustomTemplate || false;
        
        // Pass group banner settings to template
        data.groupBannerEnabled = barType.groupBannerEnabled || false;
        data.groupBannerColor = barType.groupBannerColor || 'rgba(62, 62, 163, 0.9)';

        // If custom template, pass through existing custom data payload.
        if (barType.hasCustomTemplate) {
            if (!data.data) {
                data.data = {};
            }
            return data;
        }

        // For default template, prepare items organized by zones (left, middle, right) then by groups
        const allItems = this.getSecondaryBarItems(data.type);
        const groups = this.secondaryBarGroups.get(data.type) || new Map();
        const activeStates = this.secondaryBarActiveStates.get(data.type) || new Map();
        const masterActiveGroup = new Map();
        const infoUpdates = this.secondaryBarInfoUpdates.get(data.type);

        // Organize items by zone, then by group (filter by visible property)
        const itemsByZone = { left: new Map(), middle: new Map(), right: new Map() };
        for (const item of allItems) {
            // Check visible property (can be function or boolean)
            let isVisible = true;
            if (typeof item.visible === 'function') {
                isVisible = item.visible();
            } else if (item.visible !== undefined) {
                isVisible = !!item.visible;
            }

            if (!isVisible) continue; // Skip invisible items

            const zone = (item.zone === 'left' || item.zone === 'right') ? item.zone : 'middle';
            const groupId = item.group || 'default';
            if (!itemsByZone[zone].has(groupId)) {
                itemsByZone[zone].set(groupId, []);
            }
            // Merge live info updates for info items
            if (item.kind === 'info' && infoUpdates?.has(item.itemId)) {
                const u = infoUpdates.get(item.itemId);
                item.displayValue = u.value !== undefined ? u.value : item.value;
                item.displayLabel = u.label !== undefined ? u.label : item.label;
                if (u.borderColor !== undefined) item.borderColor = u.borderColor;
                if (u.buttonColor !== undefined) item.buttonColor = u.buttonColor;
                if (u.iconColor !== undefined) item.iconColor = u.iconColor;
            } else if (item.kind === 'info') {
                item.displayValue = item.value;
                item.displayLabel = item.label;
            }
            // Merge live updates for progressbar items
            if (item.kind === 'progressbar' && infoUpdates?.has(item.itemId)) {
                const u = infoUpdates.get(item.itemId);
                if (u.percentProgress !== undefined) item.percentProgress = u.percentProgress;
                if (u.leftLabel !== undefined) item.leftLabel = u.leftLabel;
                if (u.rightLabel !== undefined) item.rightLabel = u.rightLabel;
                if (u.leftIcon !== undefined) item.leftIcon = u.leftIcon;
                if (u.rightIcon !== undefined) item.rightIcon = u.rightIcon;
                if (u.title !== undefined) item.title = u.title;
                if (u.icon !== undefined) item.icon = u.icon;
                if (u.barColor !== undefined) item.barColor = u.barColor;
                if (u.progressColor !== undefined) item.progressColor = u.progressColor;
                if (u.borderColor !== undefined) item.borderColor = u.borderColor;
            }
            // Merge live updates for balancebar items
            if (item.kind === 'balancebar' && infoUpdates?.has(item.itemId)) {
                const u = infoUpdates.get(item.itemId);
                if (u.percentProgress !== undefined) item.percentProgress = u.percentProgress;
                if (u.leftLabel !== undefined) item.leftLabel = u.leftLabel;
                if (u.rightLabel !== undefined) item.rightLabel = u.rightLabel;
                if (u.leftIcon !== undefined) item.leftIcon = u.leftIcon;
                if (u.rightIcon !== undefined) item.rightIcon = u.rightIcon;
                if (u.title !== undefined) item.title = u.title;
                if (u.icon !== undefined) item.icon = u.icon;
                if (u.barColorLeft !== undefined) item.barColorLeft = u.barColorLeft;
                if (u.barColorRight !== undefined) item.barColorRight = u.barColorRight;
                if (u.markerColor !== undefined) item.markerColor = u.markerColor;
                if (u.borderColor !== undefined) item.borderColor = u.borderColor;
            }
            if (item.kind === 'progressbar') {
                // Resolve width: number→px, string as-is
                item.progressbarWidth = typeof item.width === 'number' ? `${item.width}px` : item.width;
                // Resolve height: use item height (number→px, string as-is) or derive from secondary bar
                item.progressbarHeight = item.height !== undefined
                    ? (typeof item.height === 'number' ? `${item.height}px` : item.height)
                    : 'calc(var(--blacksmith-menubar-secondary-height) * 0.4)';
            }
            if (item.kind === 'balancebar') {
                item.balancebarWidth = typeof item.width === 'number' ? `${item.width}px` : item.width;
                item.balancebarHeight = item.height !== undefined
                    ? (typeof item.height === 'number' ? `${item.height}px` : item.height)
                    : 'calc(var(--blacksmith-menubar-secondary-height) * 0.4)';
                const p = Math.max(-100, Math.min(100, Number(item.percentProgress) || 0));
                item.balancebarMarkerLeftPercent = 50 + (p / 2);
            }
            itemsByZone[zone].get(groupId).push(item);
        }

        // Build combined itemsByGroup (across all zones) for active-state normalization
        const itemsByGroupAll = new Map();
        for (const zone of ['left', 'middle', 'right']) {
            for (const [groupId, groupItems] of itemsByZone[zone].entries()) {
                if (!itemsByGroupAll.has(groupId)) itemsByGroupAll.set(groupId, []);
                itemsByGroupAll.get(groupId).push(...groupItems);
            }
        }
        // Normalize active states against visible items and prime master switch groups
        for (const [groupId, activeItemId] of activeStates.entries()) {
            if (!activeItemId) {
                activeStates.delete(groupId);
                continue;
            }
            const groupItems = itemsByGroupAll.get(groupId);
            if (!groupItems || !groupItems.some(item => item.itemId === activeItemId && item.kind !== 'info' && item.kind !== 'progressbar' && item.kind !== 'balancebar')) {
                activeStates.delete(groupId);
                continue;
            }
            const groupConfig = groups.get(groupId);
            const masterKey = groupConfig?.masterSwitchGroup || null;
            if (masterKey && !masterActiveGroup.has(masterKey)) {
                masterActiveGroup.set(masterKey, groupId);
            }
        }

        /** @param {Map<string, import('foundry').applications.api.ApplicationV2.Item[]>} zoneGroupMap */
        const processZoneGroups = (zoneGroupMap) => {
            const processedGroups = [];
            for (const [groupId, groupItems] of zoneGroupMap.entries()) {
                const groupConfig = groups.get(groupId) || { mode: 'default', order: 999 };

                // Sort items within group
                groupItems.sort((a, b) => {
                    const aOrder = a.order !== undefined ? a.order : Infinity;
                    const bOrder = b.order !== undefined ? b.order : Infinity;
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return (a.itemId || '').localeCompare(b.itemId || '');
                });

                const buttonItems = groupItems.filter(i => i.kind !== 'info' && i.kind !== 'progressbar' && i.kind !== 'balancebar');

                // Handle switch groups: ensure one is active, respecting master switch groups (buttons only)
                if (groupConfig.mode === 'switch') {
                    const masterKey = groupConfig.masterSwitchGroup || null;
                    const masterOwnerGroup = masterKey ? masterActiveGroup.get(masterKey) : null;
                    const masterHasActive = !!masterOwnerGroup;
                    const currentActive = activeStates.get(groupId);
                    const hasActive = buttonItems.some(item => item.itemId === currentActive);

                    if ((!masterHasActive || masterOwnerGroup === groupId) && !hasActive && buttonItems.length > 0) {
                        const firstButton = buttonItems[0];
                        activeStates.set(groupId, firstButton.itemId);
                        firstButton.active = true;
                    }

                    for (const item of groupItems) {
                        item.active = (item.kind === 'button') && (item.itemId === activeStates.get(groupId));
                    }

                    if (masterKey) {
                        if (masterHasActive && masterOwnerGroup !== groupId) {
                            activeStates.delete(groupId);
                            for (const item of groupItems) {
                                item.active = false;
                            }
                        } else if (activeStates.has(groupId)) {
                            masterActiveGroup.set(masterKey, groupId);
                        }
                    }
                } else {
                    for (const item of groupItems) {
                        if (item.kind === 'info' || item.kind === 'progressbar' || item.kind === 'balancebar') item.active = false;
                    }
                }

                processedGroups.push({
                    id: groupId,
                    config: groupConfig,
                    items: groupItems,
                    bannerColor: groupConfig.bannerColor || data.groupBannerColor
                });
            }

            processedGroups.sort((a, b) => {
                const aOrder = a.config.order !== undefined ? a.config.order : Infinity;
                const bOrder = b.config.order !== undefined ? b.config.order : Infinity;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return (a.id || '').localeCompare(b.id || '');
            });
            return processedGroups;
        };

        data.zones = {
            left: processZoneGroups(itemsByZone.left),
            middle: processZoneGroups(itemsByZone.middle),
            right: processZoneGroups(itemsByZone.right)
        };

        return data;
    }

    /**
     * Register a visibility override for the menubar.
     * External modules (e.g. Herald) can use this to hide the menubar for specific users (e.g. broadcast/cameraman).
     * @param {string} moduleId - Module identifier (e.g. 'coffee-pub-herald')
     * @param {(user: User) => { hide?: boolean }} callback - Called with game.user; return { hide: true } to hide menubar
     */
    static registerMenubarVisibilityOverride(moduleId, callback) {
        if (!moduleId || typeof callback !== 'function') return;
        this._menubarVisibilityOverrides.set(moduleId, callback);
    }

    /**
     * Unregister a visibility override (e.g. on module unload).
     * @param {string} moduleId - Module identifier used when registering
     */
    static unregisterMenubarVisibilityOverride(moduleId) {
        if (!moduleId) return;
        this._menubarVisibilityOverrides.delete(moduleId);
    }

    /**
     * Toolbar strip signature (visibility + zone + active) — excludes timer; used to detect real layout changes.
     * @private
     */
    static _toolbarIconsLayoutSignature() {
        const parts = [];
        this.toolbarIcons.forEach((tool, toolId) => {
            let isVisible = true;
            try {
                if (typeof tool.visible === 'function') isVisible = !!tool.visible();
                else if (tool.visible !== undefined) isVisible = !!tool.visible;
            } catch {
                isVisible = true;
            }
            if (tool.gmOnly && !game.user?.isGM) isVisible = false;
            if (tool.leaderOnly && !game.user?.isGM) {
                try {
                    const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                    if (leaderData?.userId !== game.user?.id) isVisible = false;
                } catch {
                    isVisible = false;
                }
            }
            if (!isVisible) {
                parts.push(`${toolId}:0`);
                return;
            }
            let activeState = false;
            try {
                if (typeof tool.active === 'function') activeState = !!tool.active();
                else activeState = !!tool.active;
            } catch {
                activeState = false;
            }
            parts.push(`${toolId}:1:${tool.zone || 'left'}:${tool.group || 'general'}:${activeState ? 1 : 0}:${tool.order ?? 999}`);
        });
        parts.sort();
        return parts.join('|');
    }

    /**
     * Visible secondary bar item ids/kinds when default template (excludes live HP/progress values).
     * @private
     */
    static _secondaryBarStructureSignature() {
        const sb = this.secondaryBar;
        if (!sb?.isOpen || !sb?.type) return '';
        const barType = this.secondaryBarTypes.get(sb.type);
        if (barType?.hasCustomTemplate) {
            const data = sb.data && typeof sb.data === 'object' ? sb.data : {};
            const combatId = data.combat?.id ?? data.combatId ?? '';
            const sceneId = typeof canvas !== 'undefined' && canvas?.scene?.id ? canvas.scene.id : '';
            return `${sb.type}|custom|${combatId}|${sceneId}|${sb.height ?? ''}`;
        }
        const items = this.getSecondaryBarItems(sb.type);
        const parts = [];
        for (const item of items) {
            let vis = true;
            try {
                if (typeof item.visible === 'function') vis = !!item.visible();
                else if (item.visible !== undefined) vis = !!item.visible;
            } catch {
                vis = true;
            }
            if (!vis) continue;
            parts.push(`${item.itemId}:${item.kind || ''}:${item.zone || 'middle'}`);
        }
        parts.sort();
        return `${sb.type}|${parts.join(',')}|h${sb.height ?? ''}`;
    }

    /**
     * Live values for the open secondary bar: info updates, custom `data`, switch selection, toggleable buttons.
     * Must be part of the menubar fingerprint; otherwise `renderMenubar` skips rebuild and bars stay stale.
     * @private
     */
    static _secondaryBarLiveContentSignature() {
        const sb = this.secondaryBar;
        if (!sb?.isOpen || !sb?.type) return '';
        const barTypeId = sb.type;
        const chunks = [];

        const infoMap = this.secondaryBarInfoUpdates.get(barTypeId);
        if (infoMap && infoMap.size > 0) {
            const keys = [...infoMap.keys()].sort();
            for (const k of keys) {
                try {
                    chunks.push(`${k}:${JSON.stringify(infoMap.get(k))}`);
                } catch {
                    chunks.push(`${k}:!json`);
                }
            }
        }

        const barType = this.secondaryBarTypes.get(barTypeId);
        if (barType?.hasCustomTemplate && sb.data != null && typeof sb.data === 'object') {
            try {
                chunks.push(`__customData:${JSON.stringify(sb.data)}`);
            } catch {
                chunks.push('__customData:!json');
            }
        }

        // Switch-mode "select one" groups (secondaryBarActiveStates drives which button looks active)
        const activeStates = this.secondaryBarActiveStates.get(barTypeId);
        if (activeStates && activeStates.size > 0) {
            const entries = [...activeStates.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
            chunks.push(`__activeStates:${entries.map(([g, id]) => `${g}=${id}`).join(',')}`);
        }

        // Default-mode toggleable buttons (item.active on stored item; not used for switch groups)
        const items = this.secondaryBarItems.get(barTypeId);
        const groups = this.secondaryBarGroups.get(barTypeId);
        if (items && groups) {
            const toggles = [];
            for (const [id, item] of items.entries()) {
                if (item.kind !== 'button' || !item.toggleable) continue;
                const gc = groups.get(item.group || 'default');
                if (gc?.mode === 'switch') continue;
                toggles.push(`${id}:${item.active ? 1 : 0}`);
            }
            toggles.sort();
            if (toggles.length) {
                chunks.push(`__toggleBtn:${toggles.join('|')}`);
            }
        }

        return chunks.join('|');
    }

    /**
     * Stable string for skipping full menubar rebuild when structure + non-timer labels match.
     * @private
     */
    static _computeMenubarStructureFingerprint(templateData) {
        const notifParts = (templateData.notifications || []).map((n) => `${n.id}\x1d${String(n.text ?? '')}\x1d${String(n.icon ?? '')}`);
        notifParts.sort();
        const mov = templateData.currentMovement || {};
        return [
            templateData.isGM ? '1' : '0',
            templateData.isLeader ? '1' : '0',
            String(templateData.leaderText ?? ''),
            String(mov.name ?? ''),
            String(mov.icon ?? ''),
            this._toolbarIconsLayoutSignature(),
            notifParts.join('\x1e'),
            `${!!templateData.secondaryBar?.isOpen}\x1e${templateData.secondaryBar?.type || ''}\x1e${this._secondaryBarStructureSignature()}`,
            this._secondaryBarLiveContentSignature(),
            templateData.isInterfaceHidden ? '1' : '0'
        ].join('\x1f');
    }

    /**
     * Patch primary menubar DOM when skipping full rebuild (timer + movement + leader).
     * @private
     */
    static _applyMenubarLightweightRefresh(templateData, rootEl) {
        const leaderEl = rootEl.querySelector('.party-leader');
        if (leaderEl) leaderEl.textContent = templateData.leaderText ?? '';
        const mov = templateData.currentMovement;
        if (mov) {
            const iconEl = rootEl.querySelector('.movement .movement-icon');
            const labelEl = rootEl.querySelector('.movement .movement-label');
            if (iconEl && mov.icon) iconEl.className = `fas ${mov.icon} movement-icon`;
            if (labelEl && mov.name != null) labelEl.textContent = mov.name;
        }
        this.updateTimerDisplay();
        this.updateVoteIconState();
        requestAnimationFrame(() => this._setupMiddleZoneOverflow());
    }

    static async renderMenubar(immediate = false) {
        try {

            if (!immediate && this.renderTimeout) {
                clearTimeout(this.renderTimeout);
                this.renderTimeout = null;
            }
            
            if (!immediate) {
                this.renderTimeout = setTimeout(() => {
                    this.renderMenubar(true);
                }, 50); // 50ms debounce
                return;
            }

            if (this._isUserExcluded(game.user)) {
                this._removeMenubarDom();
                return;
            }

            // Check registered visibility overrides (e.g. broadcast user from Herald)
            for (const callback of this._menubarVisibilityOverrides.values()) {
                try {
                    const result = callback(game.user);
                    if (result?.hide) {
                        this._removeMenubarDom();
                        return;
                    }
                } catch (e) {
                    postConsoleAndNotification(MODULE.NAME, 'Menubar visibility override error', e?.message || e, false, false);
                }
            }
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

            // Get tools organized by zone using our API
            const toolsByZone = this.getMenubarToolsByZone();
            
            // Debug: Log leader data during menubar rendering
            const renderLeaderData = game.settings.get(MODULE.ID, 'partyLeader');
            const middleGroups = Object.keys(toolsByZone.middle || {});

            // Prepare secondary bar data
            const secondaryBarData = this._prepareSecondaryBarData();

            const templateData = {
                isGM: game.user.isGM,
                isLeader: isLeader,
                leaderText: this.getLeaderDisplayText(),
                timerText: this.getTimerText(),
                timerProgress: this.getTimerProgress(),
                currentMovement: currentMovementData,
                toolsByZone: toolsByZone,
                notifications: Array.from(this.notifications.values()),
                secondaryBar: secondaryBarData,
                isInterfaceHidden: (() => { try { return CoreUIUtility.isInterfaceHidden(); } catch (_) { return false; } })()
            };

            const structureFp = this._computeMenubarStructureFingerprint(templateData);
            const existingPrimary = document.querySelector('.blacksmith-menubar-container');
            if (existingPrimary && structureFp === this._menubarStructureFingerprint) {
                this._applyMenubarLightweightRefresh(templateData, existingPrimary);
                return;
            }

            // Render the template
            const panelHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/menubar.hbs', templateData);

            // Remove click handlers before removing the DOM elements
            this.removeClickHandlers();

            // Remove any existing menubar and secondary bars
            document.querySelector('.blacksmith-menubar-container')?.remove();
            document.querySelectorAll('.blacksmith-menubar-secondary').forEach(el => el.remove());
            
            // Find the interface element and insert before it
            const interfaceElement = document.querySelector('#interface');
            if (interfaceElement) {
                interfaceElement.insertAdjacentHTML('beforebegin', panelHtml);
                
                // Add click handlers
                this.addClickHandlers();
                
                // Setup middle zone overflow detection (run after layout)
                requestAnimationFrame(() => this._setupMiddleZoneOverflow());

                this._menubarStructureFingerprint = structureFp;
                try {
                    const ld = game.settings.get(MODULE.ID, 'partyLeader');
                    this._lastMenubarIsLeader = !!(ld?.userId && game.user?.id === ld.userId);
                } catch {
                    this._lastMenubarIsLeader = undefined;
                }
            } else {
                this._menubarStructureFingerprint = null;
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error rendering menubar:", error, false, false);
        }
    }

    static addClickHandlers() {
        // Use event delegation for dynamic tool clicks
        const menubarContainer = document.querySelector('.blacksmith-menubar-container');
        if (!menubarContainer) return;

        // Remove old click and contextmenu handlers if they exist
        if (this._clickHandler && this._clickHandlerContainer) {
            this._clickHandlerContainer.removeEventListener('click', this._clickHandler);
            this._clickHandler = null;
            this._clickHandlerContainer = null;
        }
        if (this._contextMenuHandler && this._contextMenuHandlerContainer) {
            this._contextMenuHandlerContainer.removeEventListener('contextmenu', this._contextMenuHandler);
            this._contextMenuHandler = null;
            this._contextMenuHandlerContainer = null;
        }
        this._closeMenubarContextMenu();

        const playMenubarButtonSound = () => {
            try {
                playSound(window.COFFEEPUB?.SOUNDBUTTON04, window.COFFEEPUB?.SOUNDVOLUMESOFT, false, false);
            } catch (_error) {
                // Non-blocking UI feedback only.
            }
        };

        // Create the click handler function
        const clickHandler = (event) => {
            // Check if this is a notification close button click
            const closeButton = event.target.closest('.notification-close');
            if (closeButton) {
                const notificationId = closeButton.getAttribute('data-notification-id');
                if (notificationId) {
                    this.removeNotification(notificationId);
                    return;
                }
            }
            
            // Check if this is a secondary bar item click (default template)
            const secondaryBarItem = event.target.closest('.secondary-bar-item[data-item-id]');
            if (secondaryBarItem && this.secondaryBar && !this.secondaryBar.hasCustomTemplate) {
                const itemId = secondaryBarItem.getAttribute('data-item-id');
                const groupId = secondaryBarItem.getAttribute('data-group-id') || 'default';
                const barType = this.secondaryBar.type;
                
                if (itemId && barType) {
                    const items = this.secondaryBarItems.get(barType);
                    const groups = this.secondaryBarGroups.get(barType);
                    const activeStates = this.secondaryBarActiveStates.get(barType);
                    
                    if (items && groups) {
                        const item = items.get(itemId);
                        if (item && typeof item.onClick === 'function') {
                            event.preventDefault();
                            event.stopPropagation();
                            playMenubarButtonSound();
                            
                            const groupConfig = groups.get(groupId) || { mode: 'default' };
                            
                            // Handle switch/toggle state only for buttons
                            if (item.kind === 'button') {
                                if (groupConfig.mode === 'switch') {
                                    this.updateSecondaryBarItemActive(barType, itemId, true);
                                } else if (groupConfig.mode === 'default' && item.toggleable) {
                                    item.active = !item.active;
                                    this.renderMenubar(true);
                                }
                            }
                            
                            try {
                                item.onClick(event);
                            } catch (error) {
                                postConsoleAndNotification(MODULE.NAME, `Error executing secondary bar item ${itemId}:`, error, false, false);
                            }
                        }
                    }
                }
                return;
            }
            
            // Check if this is a menubar tool click
            const toolElement = event.target.closest('[data-tool]');
            if (!toolElement) return;

            const toolName = toolElement.getAttribute('data-tool');
            if (!toolName) return;

            // Handle overflow "..." button: show overflow menu (tools that don't fit)
            if (toolName === 'menubar-overflow') {
                event.preventDefault();
                event.stopPropagation();
                playMenubarButtonSound();
                if (this._middleZoneOverflowItems.length > 0) {
                    this._showMenubarContextMenu(this._middleZoneOverflowItems, event.clientX, event.clientY);
                }
                return;
            }

            // Find the tool in our registered tools
            let tool = null;
            let toolId = null;
            this.toolbarIcons.forEach((registeredTool, id) => {
                if (registeredTool.name === toolName) {
                    tool = registeredTool;
                    toolId = id;
                }
            });

            if (!tool) return;

            // Prevent default and stop propagation
            event.preventDefault();
            event.stopPropagation();
            playMenubarButtonSound();

            // Handle toggleable tools
            if (tool.toggleable) {
                tool.active = !tool.active;
                // Re-render to update active state
                this.renderMenubar(true);
            }

            // Execute the tool's onClick function
            if (typeof tool.onClick === 'function') {
                try {
                    tool.onClick(event);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Error executing tool ${toolId}:`, error, false, false);
                }
            }
        };

        // Store the handler reference and container for cleanup
        this._clickHandler = clickHandler;
        this._clickHandlerContainer = menubarContainer;

        // Add the event listener to both menubar and secondary bar
        menubarContainer.addEventListener('click', clickHandler);

        // Right-click (contextmenu) for tools that provide contextMenuItems, and for secondary bar items
        const contextMenuHandler = (event) => {
            // Secondary bar item context menu (default template: info, progressbar, balancebar, or button with contextMenuItems)
            const secondaryBarItemEl = event.target.closest('.secondary-bar-item[data-item-id]');
            if (secondaryBarItemEl && this.secondaryBar && !this.secondaryBar.hasCustomTemplate) {
                const itemId = secondaryBarItemEl.getAttribute('data-item-id');
                const barType = this.secondaryBar.type;
                if (itemId && barType) {
                    const items = this.secondaryBarItems.get(barType);
                    const item = items?.get(itemId);
                    if (item?.contextMenuItems) {
                        event.preventDefault();
                        event.stopPropagation();
                        const raw = item.contextMenuItems;
                        const menuItems = typeof raw === 'function' ? raw(itemId, item) : raw;
                        if (Array.isArray(menuItems) && menuItems.length > 0) {
                            this._showMenubarContextMenu(menuItems, event.clientX, event.clientY);
                        }
                        return;
                    }
                }
            }

            const toolElement = event.target.closest('[data-tool]');
            if (!toolElement) return;

            const toolName = toolElement.getAttribute('data-tool');
            if (!toolName) return;

            let tool = null;
            let toolId = null;
            this.toolbarIcons.forEach((registeredTool, id) => {
                if (registeredTool.name === toolName) {
                    tool = registeredTool;
                    toolId = id;
                }
            });

            if (!tool || !tool.contextMenuItems) return;

            event.preventDefault();
            event.stopPropagation();

            const raw = tool.contextMenuItems;
            const items = typeof raw === 'function' ? raw(toolId, tool) : raw;
            if (!Array.isArray(items) || items.length === 0) return;

            this._showMenubarContextMenu(items, event.clientX, event.clientY);
        };

        this._contextMenuHandler = contextMenuHandler;
        this._contextMenuHandlerContainer = menubarContainer;
        menubarContainer.addEventListener('contextmenu', contextMenuHandler);
        
        // Also attach click and contextmenu to secondary bar when it exists
        const secondaryBar = document.querySelector('.blacksmith-menubar-secondary');
        if (secondaryBar) {
            secondaryBar.addEventListener('click', clickHandler);
            secondaryBar.addEventListener('contextmenu', contextMenuHandler);
        }

        // Note: Right zone tools (leader-section, movement, timer-section) are now handled
        // by the dynamic click system above via their data-tool attributes
    }
    
    /**
     * Remove click handlers - called when menubar is destroyed or reset
     */
    static removeClickHandlers() {
        if (this._middleZoneResizeObserver) {
            this._middleZoneResizeObserver.disconnect();
            this._middleZoneResizeObserver = null;
        }
        this._middleZoneOverflowItems = [];
        if (this._clickHandler && this._clickHandlerContainer) {
            this._clickHandlerContainer.removeEventListener('click', this._clickHandler);
            this._clickHandler = null;
            this._clickHandlerContainer = null;
        }
        if (this._contextMenuHandler && this._contextMenuHandlerContainer) {
            this._contextMenuHandlerContainer.removeEventListener('contextmenu', this._contextMenuHandler);
            this._contextMenuHandler = null;
            this._contextMenuHandlerContainer = null;
        }
        this._closeMenubarContextMenu();
    }

    /**
     * Close the menubar context menu if open (and remove listeners).
     * @private
     */
    static _closeMenubarContextMenu() {
        UIContextMenu.close('blacksmith-menubar-context-menu');
    }

    /**
     * Setup middle zone overflow: detect when tools don't fit, hide excess, show "..." button.
     * @private
     */
    static _setupMiddleZoneOverflow() {
        const middle = document.querySelector('.blacksmith-menubar-middle');
        const toolsContainer = document.querySelector('.blacksmith-menubar-middle-tools');
        const overflowBtn = document.querySelector('.blacksmith-menubar-middle [data-tool="menubar-overflow"]');
        if (!middle || !toolsContainer || !overflowBtn) return;

        const recalc = () => {
            this._middleZoneOverflowItems = [];
            const toolButtons = Array.from(toolsContainer.querySelectorAll('.button[data-tool]:not([data-tool="menubar-overflow"])'));
            const dividers = Array.from(toolsContainer.querySelectorAll('.menu-divider'));
            overflowBtn.style.display = 'none';

            // Show all tools and dividers initially
            toolButtons.forEach(el => { el.style.display = ''; });
            dividers.forEach(el => { el.style.display = ''; });

            const overflowItems = [];

            while (toolsContainer.scrollWidth > toolsContainer.clientWidth && toolButtons.length > 0) {
                const el = toolButtons.pop();
                const toolName = el.getAttribute('data-tool');
                let toolData = null;
                this.toolbarIcons.forEach((t) => { if (t.name === toolName) toolData = t; });
                if (!toolData) continue;
                overflowItems.unshift({
                    name: typeof toolData.title === 'function' ? toolData.title() : toolData.title,
                    icon: typeof toolData.icon === 'function' ? toolData.icon() : toolData.icon,
                    onClick: (evt) => { if (typeof toolData.onClick === 'function') toolData.onClick(evt || {}); }
                });
                el.style.display = 'none';

                // Hide dividers that become orphaned (both neighbors hidden)
                dividers.forEach(div => {
                    const prev = div.previousElementSibling;
                    const next = div.nextElementSibling;
                    const prevHidden = !prev || prev.style.display === 'none' || prev === overflowBtn;
                    const nextHidden = !next || next.style.display === 'none' || next === overflowBtn;
                    if (prevHidden && nextHidden) div.style.display = 'none';
                });
            }

            this._middleZoneOverflowItems = overflowItems;
            if (overflowItems.length > 0) {
                overflowBtn.style.display = '';
                // Reserve space for overflow button: if it causes overflow, hide one more tool
                while (toolsContainer.scrollWidth > toolsContainer.clientWidth && toolButtons.length > 0) {
                    const el = toolButtons.pop();
                    const toolName = el.getAttribute('data-tool');
                    let toolData = null;
                    this.toolbarIcons.forEach((t) => { if (t.name === toolName) toolData = t; });
                    if (!toolData) continue;
                    overflowItems.unshift({
                        name: typeof toolData.title === 'function' ? toolData.title() : toolData.title,
                        icon: typeof toolData.icon === 'function' ? toolData.icon() : toolData.icon,
                        onClick: (evt) => { if (typeof toolData.onClick === 'function') toolData.onClick(evt || {}); }
                    });
                    el.style.display = 'none';
                    dividers.forEach(div => {
                        const prev = div.previousElementSibling;
                        const next = div.nextElementSibling;
                        const prevHidden = !prev || prev.style.display === 'none' || prev === overflowBtn;
                        const nextHidden = !next || next.style.display === 'none' || next === overflowBtn;
                        if (prevHidden && nextHidden) div.style.display = 'none';
                    });
                }
                this._middleZoneOverflowItems = overflowItems;
            }
        };

        recalc();

        if (this._middleZoneResizeObserver) {
            this._middleZoneResizeObserver.disconnect();
        }
        this._middleZoneResizeObserver = new ResizeObserver(() => recalc());
        this._middleZoneResizeObserver.observe(middle);
    }

    /**
     * Show a context menu for a menubar tool at the given coordinates.
     * Items: Array<{ name: string, icon: string, onClick: () => void }>.
     * Closes on item click, click outside, or Escape.
     * @param {Array<{ name: string, icon: string, onClick: () => void }>} items
     * @param {number} x - clientX
     * @param {number} y - clientY
     * @private
     */
    static _showMenubarContextMenu(items, x, y) {
        this._closeMenubarContextMenu();

        const mapped = (items || []).map((item) => ({
            separator: !!item.separator,
            name: item.name,
            icon: item.icon,
            description: item.description,
            disabled: !!item.disabled,
            callback: async () => {
                if (typeof item.onClick === 'function') {
                    try {
                        await item.onClick();
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'Menubar context menu item error', err?.message || err, false, true);
                    }
                }
            },
            submenu: Array.isArray(item.submenu)
                ? item.submenu.map((sub) => ({
                    separator: !!sub.separator,
                    name: sub.name,
                    description: sub.description,
                    icon: sub.icon,
                    disabled: !!sub.disabled,
                    callback: sub.onClick
                }))
                : null
        }));

        UIContextMenu.show({
            id: 'blacksmith-menubar-context-menu',
            x,
            y,
            zones: mapped,
            zoneClass: 'core'
        });
    }

    /**
     * Public wrapper for showing a menubar-style context menu.
     * @param {Array<{ name: string, icon?: string, description?: string, onClick?: Function, submenu?: Array, separator?: boolean, disabled?: boolean }>} items
     * @param {number} x
     * @param {number} y
     */
    static showMenubarContextMenu(items, x, y) {
        this._showMenubarContextMenu(items, x, y);
    }


    /**
     * Build visibility menu items for pins (left hamburger → Pins submenu).
     * @returns {Array<{name: string, icon: string, onClick: Function}>}
     * @private
     */
    static _getPinsVisibilityMenuItems() {
        const globalHidden = PinManager.isGlobalHidden();
        const sceneId = canvas?.scene?.id;
        const scenePins = sceneId ? PinManager.list({ sceneId, includeHiddenByFilter: true }) : [];
        const unplacedPins = PinManager.list({ unplacedOnly: true, includeHiddenByFilter: true }) || [];
        const allPins = [...scenePins, ...unplacedPins];
        const pairKey = (p) => `${p.moduleId || ''}|${(p.type != null && p.type !== '') ? p.type : 'default'}`;
        const pairs = [...new Map(allPins.filter((p) => p.moduleId).map((p) => {
            const type = (p.type != null && p.type !== '') ? p.type : 'default';
            return [pairKey(p), { moduleId: p.moduleId, type }];
        })).values()];
        pairs.sort((a, b) => (a.moduleId + a.type).localeCompare(b.moduleId + b.type));

        const items = [
            {
                name: "Hide all pins",
                icon: "fa-solid fa-map-pin",
                onClick: async () => {
                    await PinManager.setGlobalHidden(true);
                    for (const { moduleId, type } of pairs) await PinManager.setModuleTypeHidden(moduleId, type, true);
                    MenuBar.renderMenubar(true);
                }
            },
            {
                name: "Show all pins",
                icon: "fa-solid fa-map-pin",
                onClick: async () => {
                    await PinManager.setGlobalHidden(false);
                    for (const { moduleId, type } of pairs) await PinManager.setModuleTypeHidden(moduleId, type, false);
                    MenuBar.renderMenubar(true);
                }
            }
        ];

        for (const { moduleId, type } of pairs) {
            const typeHidden = PinManager.isModuleTypeHidden(moduleId, type);
            const showLabel = globalHidden || typeHidden;
            const friendlyName = PinManager.getPinTypeLabel(moduleId, type);
            const label = friendlyName || `${game.modules.get(moduleId)?.title ?? moduleId} ${type}`;
            items.push({
                name: showLabel ? `Show ${label}` : `Hide ${label}`,
                icon: "fa-solid fa-map-pin",
                onClick: async () => {
                    if (showLabel) {
                        await PinManager.setGlobalHidden(false);
                        await PinManager.setModuleTypeHidden(moduleId, type, false);
                    } else {
                        await PinManager.setModuleTypeHidden(moduleId, type, true);
                    }
                    MenuBar.renderMenubar(true);
                }
            });
        }

        return items;
    }

    /**
     * Build clear menu items for pins by scene pin type (GM-only actions).
     * @returns {Array<{name: string, icon: string, description?: string, disabled?: boolean, onClick?: Function}>}
     * @private
     */
    static _getPinsClearMenuItems() {
        const canClearPins = !!game.user?.isGM && !!canvas?.scene;
        const sceneId = canvas?.scene?.id;
        const sceneName = canvas?.scene?.name || 'this scene';
        const scenePins = sceneId ? (PinManager.list({ sceneId, includeHiddenByFilter: true }) || []) : [];

        const pinTypeMap = new Map(); // key: moduleId|type => { moduleId, type, label, count }
        for (const pin of scenePins) {
            const moduleId = pin?.moduleId || '';
            const type = (pin?.type != null && pin.type !== '') ? String(pin.type) : 'default';
            const key = `${moduleId}|${type}`;
            const existing = pinTypeMap.get(key);
            if (existing) {
                existing.count += 1;
                continue;
            }
            const friendlyName = moduleId ? PinManager.getPinTypeLabel(moduleId, type) : '';
            const moduleTitle = moduleId ? (game.modules.get(moduleId)?.title ?? moduleId) : 'Unknown Module';
            const label = friendlyName || `${moduleTitle} - ${type}`;
            pinTypeMap.set(key, { moduleId, type, label, count: 1 });
        }
        const pinTypeEntries = Array.from(pinTypeMap.values()).sort((a, b) => a.label.localeCompare(b.label));

        const items = [];
        items.push({
            name: "Clear All Pins",
            icon: "fa-solid fa-trash",
            disabled: !canClearPins,
            description: !game.user?.isGM ? "GM only" : (!canvas?.scene ? "No active scene" : `Delete all pins on ${sceneName}`),
            onClick: async () => {
                if (!canClearPins) return;
                try {
                    const confirmed = await Dialog.confirm({
                        title: 'Clear Pins',
                        content: '<p>Are you sure you want to delete <strong>ALL</strong> pins on this scene?</p><p>This action cannot be undone.</p>',
                        yes: () => true,
                        no: () => false,
                        defaultYes: false
                    });
                    if (!confirmed) return;
                    const count = await PinManager.deleteAll({ sceneId });
                    ui.notifications.info(`Deleted ${count} pin${count !== 1 ? 's' : ''}.`);
                } catch (err) {
                    postConsoleAndNotification(MODULE.NAME, 'Menubar | Error clearing pins', err?.message || err, false, true);
                }
            }
        });

        for (const entry of pinTypeEntries) {
            items.push({
                name: `Clear ${entry.label}`,
                icon: "fa-solid fa-trash-can",
                disabled: !canClearPins,
                description: `Delete ${entry.count} pin${entry.count !== 1 ? 's' : ''}`,
                onClick: async () => {
                    if (!canClearPins) return;
                    try {
                        const confirmed = await Dialog.confirm({
                            title: 'Clear Pins by Type',
                            content: `<p>Are you sure you want to delete <strong>${entry.count}</strong> pin${entry.count !== 1 ? 's' : ''} of type "<strong>${entry.label}</strong>" on this scene?</p><p>This action cannot be undone.</p>`,
                            yes: () => true,
                            no: () => false,
                            defaultYes: false
                        });
                        if (!confirmed) return;
                        const count = await PinManager.deleteAllByType(entry.type, { sceneId, moduleId: entry.moduleId });
                        ui.notifications.info(`Deleted ${count} pin${count !== 1 ? 's' : ''} of type "${entry.label}".`);
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'Menubar | Error clearing pins by type', err?.message || err, false, true);
                    }
                }
            });
        }

        return items;
    }


    /**
     * Open the XP Distribution window
     */
    static openXpDistribution() {
        try {
            XpManager.openXpDistributionWindow();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error opening XP distribution window", error, false, false);
        }
    }

    static openStatsWindow() {
        try {
            StatsWindow.show();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error opening stats window", error, false, false);
        }
    }

    /**
     * Create combat encounter with selected tokens or all tokens on canvas
     */
    static async createCombat() {
        try {
            // Check if user has permission to create combat
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can create combat encounters.");
                return;
            }

            // Get selected tokens first, then fall back to all tokens on canvas
            let tokensToAdd = canvas.tokens.controlled;
            if (tokensToAdd.length === 0) {
                tokensToAdd = canvas.tokens.placeables;
            }

            // Filter out tokens without actors
            tokensToAdd = tokensToAdd.filter(token => token.actor);

            if (tokensToAdd.length === 0) {
                ui.notifications.warn("No tokens with actors found on the canvas.");
                return;
            }

            // Check if there's already an active combat encounter
            let combat = game.combats.active;
            
            if (!combat) {
                // Create a new combat encounter if none exists
                combat = await Combat.create({
                    scene: canvas.scene.id,
                    name: "Combat Encounter",
                    active: true
                });
                postConsoleAndNotification(MODULE.NAME, "Created new combat encounter", "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Adding tokens to existing combat encounter", "", true, false);
            }

            // Add tokens to combat
            let addedCount = 0;
            for (const token of tokensToAdd) {
                try {
                    // Check if token is already in combat
                    const existingCombatant = combat.combatants.find(c => c.tokenId === token.id);
                    if (!existingCombatant) {
                        await combat.createEmbeddedDocuments("Combatant", [{
                            tokenId: token.id,
                            actorId: token.actor.id,
                            sceneId: canvas.scene.id
                        }]);
                        addedCount++;
                        // postConsoleAndNotification(MODULE.NAME, `Added ${token.name} to combat`, "", true, false);
                    } else {
                        //postConsoleAndNotification(MODULE.NAME, `${token.name} is already in combat`, "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Failed to add ${token.name} to combat:`, error, false, false);
                }
            }

            // Show success notification
            if (addedCount > 0) {
                ui.notifications.info(`Combat created with ${addedCount} token(s).`);
            } else {
                ui.notifications.info("All selected tokens are already in combat.");
            }

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error creating combat:", error, false, false);
            ui.notifications.error("Failed to create combat encounter.");
        }
    }

    static _getQuickEncounterToolbarTool() {
        try {
            const api = game.modules.get(MODULE.ID)?.api;
            const registry = api?.getRegisteredTools?.();
            if (!registry || typeof registry.forEach !== 'function') return null;

            let selected = null;
            registry.forEach((tool, toolId) => {
                if (selected || !tool || typeof tool.onClick !== 'function') return;
                const haystack = [
                    toolId,
                    tool.name,
                    tool.title,
                    tool.tooltip,
                    tool.moduleId
                ].filter(Boolean).join(' ').toLowerCase();
                if (haystack.includes('quick') && haystack.includes('encounter')) {
                    selected = { toolId, tool };
                }
            });

            return selected;
        } catch (_error) {
            return null;
        }
    }

    static hasQuickEncounterTool() {
        return !!this._getQuickEncounterToolbarTool();
    }

    static async openQuickEncounterWindow() {
        try {
            const quickTool = this._getQuickEncounterToolbarTool();
            if (quickTool?.tool?.onClick) {
                const result = quickTool.tool.onClick({});
                if (result?.then) await result;
                return;
            }

            ui.notifications?.warn?.('Quick Encounter tool is not registered.');
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to open Quick Encounter', error?.message || error, false, true);
            ui.notifications?.error?.('Failed to open Quick Encounter.');
        }
    }

    static getLeaderDisplayText() {
        if (this.isLoading) return "No Leader";
        return this.currentLeader || "Choose a Leader...";
    }

    static async updateLeaderDisplay() {
        let leaderData = null;
        try {
            leaderData = game.settings.get(MODULE.ID, 'partyLeader');
        } catch {
            leaderData = null;
        }
        const isLeader = !!(leaderData?.userId && game.user?.id === leaderData.userId);

        const panel = document.querySelector('.blacksmith-menubar-container');
        if (!panel) {
            this._lastMenubarIsLeader = isLeader;
            await this.renderMenubar();
            return;
        }

        const leaderText = this.getLeaderDisplayText();
        const leaderElement = panel.querySelector('.party-leader');
        if (leaderElement) {
            leaderElement.textContent = leaderText;
        }

        this.updateVoteIconState();

        const toolstripMustRefresh = this._lastMenubarIsLeader !== undefined && this._lastMenubarIsLeader !== isLeader;
        this._lastMenubarIsLeader = isLeader;

        if (toolstripMustRefresh) {
            await this.renderMenubar(true);
        }
    }

    /**
     * Update the vote icon state based on user permissions
     */
    static updateVoteIconState() {
        const voteIcon = document.querySelector('.vote-icon');
        if (!voteIcon) return;

        let canVote = game.user.isGM || isCurrentUserPartyLeader();
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
        const publicHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', {
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
        const privateHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', {
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

    static _getLeaderEntries() {
        const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            : 3;

        return game.actors
            .filter(actor => actor.type === 'character' && actor.hasPlayerOwner)
            .map((actor) => {
                const nonGmOwners = game.users.filter(
                    (u) => u && !u.isGM && actor.testUserPermission(u, OWNER)
                );
                const activePlayers = nonGmOwners.filter((u) => u.active);
                // Menu label: never show the GM name — only a player (prefer logged-in player)
                const labelUser = activePlayers[0] ?? nonGmOwners[0] ?? null;
                // Stored leader user: prefer active player owner, then any player owner, then GM owner
                const gmOwners = game.users.filter(
                    (u) => u?.isGM && actor.testUserPermission(u, OWNER)
                );
                const primaryUser = activePlayers[0] ?? nonGmOwners[0] ?? gmOwners[0] ?? null;

                if (!primaryUser) return null;

                return {
                    actor,
                    owner: primaryUser,
                    labelUser
                };
            })
            .filter((entry) => entry !== null);
    }

    static showLeaderMenu(event) {
        if (!game.user?.isGM) return;
        if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
            this.showLeaderDialog();
            return;
        }

        const characterEntries = this._getLeaderEntries();
        const leaderData = getSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
        const currentActorId = leaderData?.actorId || '';

        const items = [
            {
                name: 'None',
                icon: currentActorId ? 'fa-regular fa-circle-xmark' : 'fa-solid fa-check',
                disabled: !currentActorId,
                callback: async () => {
                    await setSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
                    this.currentLeader = null;
                    await this.updateLeader(null);
                }
            }
        ];

        for (const entry of characterEntries) {
            const label = entry.labelUser
                ? `${entry.actor.name} (${entry.labelUser.name})`
                : entry.actor.name;
            const isCurrent = entry.actor.id === currentActorId;
            items.push({
                name: label,
                icon: isCurrent ? 'fa-solid fa-check' : 'fa-solid fa-crown',
                disabled: isCurrent,
                callback: async () => {
                    await MenuBar.setNewLeader({ userId: entry.owner.id, actorId: entry.actor.id }, true);
                }
            });
        }

        UIContextMenu.show({
            id: 'blacksmith-menubar-leader-menu',
            x: event.clientX,
            y: event.clientY,
            zones: items,
            zoneClass: 'core'
        });
    }

    static async showMovementMenu(event) {
        const config = new MovementConfig();
        const movementTypes = config.getData().MovementTypes || [];
        const currentMovement = game.settings.get(MODULE.ID, 'movementType') || 'normal-movement';
        const spacing = game.settings.get(MODULE.ID, 'tokenSpacing') || 0;

        const items = movementTypes.map((type) => ({
            name: type.name,
            description: type.description,
            icon: `fa-solid ${type.icon}`,
            disabled: type.id === currentMovement,
            callback: async () => {
                await config._handleMovementChange(type.id);
            }
        }));

        items.push({ separator: true });
        items.push({
            name: `Token Spacing: ${spacing}`,
            description: 'Controls the space between tokens in Conga and Follow modes.',
            icon: 'fa-solid fa-people-arrows',
            submenu: [
                { name: '0 Grid Units', icon: spacing === 0 ? 'fa-solid fa-check' : 'fa-solid fa-square', description: 'No spacing', callback: async () => {
                    await game.settings.set(MODULE.ID, 'tokenSpacing', 0);
                }},
                { name: '1 Grid Unit', icon: spacing === 1 ? 'fa-solid fa-check' : 'fa-solid fa-grip', description: '1 grid unit spacing', callback: async () => {
                    await game.settings.set(MODULE.ID, 'tokenSpacing', 1);
                }},
                { name: '2 Grid Units', icon: spacing === 2 ? 'fa-solid fa-check' : 'fa-solid fa-grip-lines', description: '2 grid unit spacing', callback: async () => {
                    await game.settings.set(MODULE.ID, 'tokenSpacing', 2);
                }}
            ]
        });

        UIContextMenu.show({
            id: 'blacksmith-menubar-movement-menu',
            x: event.clientX,
            y: event.clientY,
            zones: items,
            zoneClass: 'core'
        });
    }

    static async showLeaderDialog() {

        const characterEntries = this._getLeaderEntries();



        // Create the dialog content
        const content = `
            <form>
                <div class="form-group">
                    <label>Select Party Leader:</label>
                    <select name="leader" id="leader-select">
                        <option value="">None</option>
                        ${characterEntries.map(entry => {
                            const isCurrentLeader = this.currentLeader === entry.actor.name;
                            const optLabel = entry.labelUser
                                ? `${entry.actor.name} (${entry.labelUser.name})`
                                : entry.actor.name;
                            return `<option value="${entry.actor.id}|${entry.owner.id}" ${isCurrentLeader ? 'selected' : ''}>
                                ${optLabel}
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
                        // v13: Detect and convert jQuery to native DOM if needed
                        let nativeDialogHtml = html;
                        if (html && (html.jquery || typeof html.find === 'function')) {
                            nativeDialogHtml = html[0] || html.get?.(0) || html;
                        }
                
                        const leaderSelect = nativeDialogHtml.querySelector('#leader-select');
                        const selectedValue = leaderSelect ? leaderSelect.value : '';
                        if (selectedValue) {
  
                            const [actorId, userId] = selectedValue.split('|');
                            // Send messages when selecting from dialog
                            await MenuBar.setNewLeader({ userId, actorId }, true);
                        } else {

                            // Handle clearing the leader if none selected
                            await setSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
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

        // Clean up any existing intervals before starting new ones
        this._stopTimerUpdates();

        // Update timer display every second locally
        this._timerDisplayInterval = setInterval(() => this.updateTimerDisplay(), 1000);
        
        // If GM, sync to other clients every 30 seconds
        if (game.user.isGM) {
            this._timerSyncInterval = setInterval(() => {
                if (this.sessionEndTime) {
                    this.updateTimer(this.sessionEndTime, this.sessionStartTime, false);
                }
            }, 30000); // 30 second intervals
        }
    }
    
    /**
     * Stop timer update intervals
     * @private
     */
    static _stopTimerUpdates() {
        if (this._timerDisplayInterval) {
            clearInterval(this._timerDisplayInterval);
            this._timerDisplayInterval = null;
        }
        
        if (this._timerSyncInterval) {
            clearInterval(this._timerSyncInterval);
            this._timerSyncInterval = null;
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

            // Store the current remaining minutes for next-turn-turn comparison
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

    static async _applyTimerDuration(hours, minutes, setAsDefault = false) {
        const duration = (hours * 60 + minutes) * 60 * 1000;
        this.sessionStartTime = Date.now();
        this.sessionEndTime = this.sessionStartTime + duration;

        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());

        if (setAsDefault) {
            await game.settings.set(MODULE.ID, 'sessionTimerDefault', hours * 60 + minutes);
        }
        await game.settings.set(MODULE.ID, 'sessionTimerLastUsed', {
            mode: 'duration',
            minutes: hours * 60 + minutes,
            endTime: ''
        });

        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, true);
        this.updateTimerDisplay();
    }

    static async showTimerMenu(event) {
        const defaultMinutes = game.settings.get(MODULE.ID, 'sessionTimerDefault') || 0;
        const defaultHours = Math.floor(defaultMinutes / 60);
        const defaultMins = defaultMinutes % 60;
        const defaultLabel = `${defaultHours}h ${defaultMins.toString().padStart(2, '0')}m`;

        const lastUsed = game.settings.get(MODULE.ID, 'sessionTimerLastUsed') || { mode: '', minutes: 0, endTime: '' };
        const hasLastUsed = !!(lastUsed?.mode === 'duration' && lastUsed?.minutes) || !!(lastUsed?.mode === 'end' && lastUsed?.endTime);
        let lastUsedLabel = 'Not set';
        if (lastUsed?.mode === 'duration') {
            const lh = Math.floor((lastUsed.minutes || 0) / 60);
            const lm = (lastUsed.minutes || 0) % 60;
            lastUsedLabel = `${lh}h ${lm.toString().padStart(2, '0')}m`;
        } else if (lastUsed?.mode === 'end' && lastUsed.endTime) {
            const [hh, mm] = lastUsed.endTime.split(':').map(n => parseInt(n, 10));
            const hour24 = Number.isFinite(hh) ? hh : 0;
            const hour12 = ((hour24 + 11) % 12) + 1;
            const ampm = hour24 >= 12 ? 'PM' : 'AM';
            const minutes = Number.isFinite(mm) ? mm : 0;
            lastUsedLabel = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        }

        const durationPresets = [
            { name: 'Custom…', icon: 'fa-solid fa-sliders', callback: () => this.showTimerDurationDialog() },
            ...Array.from({ length: 16 }, (_, i) => {
                const minutes = (i + 1) * 30;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return {
                    name: `${hours}h ${mins.toString().padStart(2, '0')}m`,
                    icon: 'fa-solid fa-hourglass-half',
                    callback: async () => this._applyTimerDuration(hours, mins, false)
                };
            })
        ];

        const endTimePresets = [
            { name: 'Custom…', icon: 'fa-solid fa-sliders', callback: () => this.showTimerEndTimeDialog() },
            ...Array.from({ length: 24 }, (_, i) => {
                const h = i;
                const m = 0;
                const hour12 = ((h + 11) % 12) + 1;
                const ampm = h >= 12 ? 'PM' : 'AM';
                const label = `${hour12} ${ampm}`;
                const endTimeValue = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                return {
                    name: label,
                    icon: 'fa-solid fa-clock',
                    callback: async () => {
                        const end = new Date();
                        end.setHours(h, m, 0, 0);
                        if (end.getTime() <= Date.now()) {
                            end.setDate(end.getDate() + 1);
                        }
                        this.sessionStartTime = Date.now();
                        this.sessionEndTime = end.getTime();
                        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
                        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());
                        await game.settings.set(MODULE.ID, 'sessionTimerLastUsed', {
                            mode: 'end',
                            minutes: 0,
                            endTime: endTimeValue
                        });
                        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, true);
                        this.updateTimerDisplay();
                    }
                };
            })
        ];

        const items = [
            {
                name: 'Default Time',
                description: defaultLabel,
                icon: 'fa-solid fa-clock-rotate-left',
                callback: async () => {
                    await this._applyTimerDuration(defaultHours, defaultMins, false);
                }
            },
            {
                name: 'Last Used',
                description: lastUsedLabel,
                icon: 'fa-solid fa-rotate',
                disabled: !hasLastUsed,
                callback: async () => {
                    if (!hasLastUsed) return;
                    if (lastUsed.mode === 'duration') {
                        const lh = Math.floor(lastUsed.minutes / 60);
                        const lm = lastUsed.minutes % 60;
                        await this._applyTimerDuration(lh, lm, false);
                        return;
                    }
                        if (lastUsed.mode === 'end' && lastUsed.endTime) {
                            const [hh, mm] = lastUsed.endTime.split(':').map(n => parseInt(n, 10));
                            const end = new Date();
                            end.setHours(hh || 0, mm || 0, 0, 0);
                            if (end.getTime() <= Date.now()) {
                                end.setDate(end.getDate() + 1);
                            }
                        this.sessionStartTime = Date.now();
                        this.sessionEndTime = end.getTime();
                        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
                        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());
                        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, true);
                        this.updateTimerDisplay();
                    }
                }
            },
            { separator: true },
            {
                name: 'Set Duration',
                description: 'Up to 8 hours in 30 minute increments.',
                icon: 'fa-solid fa-hourglass-half',
                submenu: durationPresets
            },
            {
                name: 'Set Time',
                description: 'Hour-based end time (AM/PM).',
                icon: 'fa-solid fa-clock',
                submenu: endTimePresets
            }
        ];

        UIContextMenu.show({
            id: 'blacksmith-menubar-timer-menu',
            x: event.clientX,
            y: event.clientY,
            zones: items,
            zoneClass: 'core'
        });
    }

    static async showTimerDurationDialog() {
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
            const defaultMinutes = game.settings.get(MODULE.ID, 'sessionTimerDefault');
            currentHours = Math.floor(defaultMinutes / 60);
            currentMinutes = defaultMinutes % 60;
        }

        const durationOptions = [
            { value: 'custom', label: 'Custom' },
            ...Array.from({ length: 16 }, (_, i) => {
                const minutes = (i + 1) * 30;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return {
                    value: String(minutes),
                    label: `${hours}h ${mins.toString().padStart(2, '0')}m`
                };
            })
        ];

        const content = `
            <form>
                <div class="form-group">
                    <label>Session Duration:</label>
                    <div style="display: grid; gap: 10px;">
                        <select name="duration-preset" id="duration-preset">
                            ${durationOptions.map(opt =>
                                `<option value="${opt.value}">${opt.label}</option>`
                            ).join('')}
                        </select>
                        <div style="display: flex; gap: 10px;">
                            <select name="hours" id="hours-select">
                                ${Array.from({length: 9}, (_, i) =>
                                    `<option value="${i}" ${i === currentHours ? 'selected' : ''}>${i.toString().padStart(2, '0')} hours</option>`
                                ).join('')}
                            </select>
                            <select name="minutes" id="minutes-select">
                                ${[0, 30].map(i =>
                                    `<option value="${i}" ${i === currentMinutes ? 'selected' : ''}>${i.toString().padStart(2, '0')} minutes</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="set-default-duration" name="set-default-duration">
                        Set as new default time
                    </label>
                </div>
            </form>
        `;

        new Dialog({
            title: "Set Session Duration",
            content: content,
            buttons: {
                set: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Set Timer",
                    callback: async (html) => {
                        let nativeDialogHtml = html;
                        if (html && (html.jquery || typeof html.find === 'function')) {
                            nativeDialogHtml = html[0] || html.get?.(0) || html;
                        }
                        const hoursSelect = nativeDialogHtml.querySelector('#hours-select');
                        const minutesSelect = nativeDialogHtml.querySelector('#minutes-select');
                        const presetSelect = nativeDialogHtml.querySelector('#duration-preset');
                        const presetValue = presetSelect ? presetSelect.value : 'custom';
                        const setDefaultCheckbox = nativeDialogHtml.querySelector('#set-default-duration');
                        const setAsDefault = setDefaultCheckbox ? setDefaultCheckbox.checked : false;

                        let hours = parseInt(hoursSelect ? hoursSelect.value : '0');
                        let minutes = parseInt(minutesSelect ? minutesSelect.value : '0');
                        if (presetValue !== 'custom') {
                            const total = parseInt(presetValue);
                            hours = Math.floor(total / 60);
                            minutes = total % 60;
                        }
                        await this._applyTimerDuration(hours, minutes, setAsDefault);
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

    static async showTimerEndTimeDialog() {
        const now = new Date();
        const hours24 = now.getHours();
        const hour12Default = ((hours24 + 11) % 12) + 1;
        const ampmDefault = hours24 >= 12 ? 'PM' : 'AM';

        const timeOptions = [
            { value: 'custom', label: 'Custom' },
            ...Array.from({ length: 24 }, (_, i) => {
                const h = i;
                const hour12 = ((h + 11) % 12) + 1;
                const ampm = h >= 12 ? 'PM' : 'AM';
                return {
                    value: `${h.toString().padStart(2, '0')}:00`,
                    label: `${hour12} ${ampm}`
                };
            })
        ];

        const content = `
            <form>
                <div class="form-group">
                    <label>End Time:</label>
                    <div style="display: grid; gap: 10px;">
                        <select name="end-time-preset" id="end-time-preset">
                            ${timeOptions.map(opt =>
                                `<option value="${opt.value}">${opt.label}</option>`
                            ).join('')}
                        </select>
                        <div style="display: flex; gap: 10px;">
                            <select name="end-hour" id="end-hour">
                                ${Array.from({length: 12}, (_, i) => {
                                    const h = i + 1;
                                    return `<option value="${h}" ${h === hour12Default ? 'selected' : ''}>${h}</option>`;
                                }).join('')}
                            </select>
                            <select name="end-ampm" id="end-ampm">
                                <option value="AM" ${ampmDefault === 'AM' ? 'selected' : ''}>AM</option>
                                <option value="PM" ${ampmDefault === 'PM' ? 'selected' : ''}>PM</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="set-default-endtime" name="set-default-endtime">
                        Set as new default time
                    </label>
                </div>
            </form>
        `;

        new Dialog({
            title: "Set End Time",
            content: content,
            buttons: {
                set: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Set Timer",
                    callback: async (html) => {
                        let nativeDialogHtml = html;
                        if (html && (html.jquery || typeof html.find === 'function')) {
                            nativeDialogHtml = html[0] || html.get?.(0) || html;
                        }
                        const presetSelect = nativeDialogHtml.querySelector('#end-time-preset');
                        const presetValue = presetSelect ? presetSelect.value : 'custom';
                        const hourSelect = nativeDialogHtml.querySelector('#end-hour');
                        const ampmSelect = nativeDialogHtml.querySelector('#end-ampm');
                        const setDefaultCheckbox = nativeDialogHtml.querySelector('#set-default-endtime');
                        const setAsDefault = setDefaultCheckbox ? setDefaultCheckbox.checked : false;
                        let hour24 = 0;
                        let m = 0;
                        if (presetValue !== 'custom') {
                            const [ph, pm] = presetValue.split(':').map(n => parseInt(n, 10));
                            hour24 = ph || 0;
                            m = pm || 0;
                        } else {
                            const h12 = parseInt(hourSelect ? hourSelect.value : '12');
                            const ampm = ampmSelect ? ampmSelect.value : 'AM';
                            hour24 = h12 % 12;
                            if (ampm === 'PM') hour24 += 12;
                        }

                        const end = new Date();
                        end.setHours(hour24, m, 0, 0);
                        if (end.getTime() <= Date.now()) {
                            end.setDate(end.getDate() + 1);
                        }

                        this.sessionStartTime = Date.now();
                        this.sessionEndTime = end.getTime();

                        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
                        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
                        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());

                        await game.settings.set(MODULE.ID, 'sessionTimerLastUsed', {
                            mode: 'end',
                            minutes: 0,
                            endTime: `${hour24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                        });
                        if (setAsDefault) {
                            const totalMinutes = Math.max(0, Math.round((this.sessionEndTime - this.sessionStartTime) / 60000));
                            await game.settings.set(MODULE.ID, 'sessionTimerDefault', totalMinutes);
                        }

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
                        // v13: Detect and convert jQuery to native DOM if needed
                        let nativeDialogHtml = html;
                        if (html && (html.jquery || typeof html.find === 'function')) {
                            nativeDialogHtml = html[0] || html.get?.(0) || html;
                        }
                        const hoursSelect = nativeDialogHtml.querySelector('#hours-select');
                        const minutesSelect = nativeDialogHtml.querySelector('#minutes-select');
                        const setDefaultCheckbox = nativeDialogHtml.querySelector('#set-default');
                        const hours = parseInt(hoursSelect ? hoursSelect.value : '0');
                        const minutes = parseInt(minutesSelect ? minutesSelect.value : '0');
                        const setAsDefault = setDefaultCheckbox ? setDefaultCheckbox.checked : false;
                        await this._applyTimerDuration(hours, minutes, setAsDefault);
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

        const messageHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', messageData);

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

        // Only update local display. Do not set world setting here—non-GM clients lack permission.
        // The GM already persisted the setting; it will sync to all clients via Foundry.
        if (data.leaderData !== undefined) {
            MenuBar.updateLeaderDisplay();
            Hooks.callAll('blacksmith.leaderChanged', data.leaderData);
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
            } else {
                // Even if leaderData is null/empty, we still need to update other clients
                // when clearing the leader
                await socket.executeForOthers("updateLeader", { 
                    leader,  // for backward compatibility
                    leaderData: null // explicitly null
                });
            }
            
            // Always update the display, regardless of leaderData status
            this.updateLeaderDisplay();
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

            // World-scoped setting: only GM can persist. Other clients skip set and rely on sync.
            if (game.user.isGM) {
                const success = await setSettingSafely(MODULE.ID, 'partyLeader', leaderData);
                if (!success) {
                    postConsoleAndNotification(MODULE.NAME, 'Menubar | Error', 'Settings not yet registered, cannot set leader', true, false);
                    return false;
                }
            }

            // Update the static currentLeader and display (all clients)
            MenuBar.currentLeader = actor.name;
            await MenuBar.updateLeader(actor.name);


            // Update vote icon + leader strip (full rebuild only when this user's leader-only visibility changes)
            this.updateVoteIconState();
            await this.updateLeaderDisplay();

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

                const publicHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', publicData);
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

                const privateHtml = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-common.hbs', privateData);
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

// Menubar ready setup runs from blacksmith.js `ready` after registerSettings() via MenuBar.runReadySetup().

export { MenuBar }; 
