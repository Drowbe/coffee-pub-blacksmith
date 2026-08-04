import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, setSettingSafely, playSound, isCurrentUserPartyLeader } from './api-core.js';
import { DialogAPI } from './api-dialog.js';
import { EntityListAPI } from './api-entity-list.js';
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
import { ToastAPI } from './api-toast.js';
import { routeTimerNotification } from './timer-notifications.js';
import { PartyManager } from './manager-party.js';
import { ReputationManager } from './manager-reputation.js';
import { UIContextMenu } from './ui-context-menu.js';
import { PinManager } from './manager-pins.js';
import { CombatBarManager } from './manager-combatbar.js';
import {
    SESSION_TIMER_DEFAULT_MODES,
    getSessionEndTimeOptions,
    formatSessionEndTimeValue,
    parseSessionEndTimeValue,
    endTimestampFromTimeValue
} from './utility-session-timer.js';

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
    
    /**
     * The sizes a secondary bar may ask for, in pixels.
     *
     * `default` is null so it resolves through the stylesheet variable rather than being
     * duplicated here — CSS stays the single source of the house default. The rest are
     * fixed steps, deliberately few: height scales every font, icon, gap, and padding in
     * the bar, so a bespoke number is a typography decision disguised as a layout one.
     *
     * A bar that needs room for group banners should not size up for it — banners are
     * added on top of the bar's height, not taken out of it.
     */
    static SECONDARY_BAR_SIZES = {
        default: null,
        large: 45,
        xlarge: 60
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
    static _toolBeingClicked = null; // Tool id for the duration of its onClick, so a bar opened from it can learn its owner
    /** @type {Map<string, Map<string, { value?: string, label?: string }>>} - Live updates for info items: barTypeId -> itemId -> { value, label } */
    static secondaryBarInfoUpdates = new Map();
    static renderTimeout = null;
    
    // Timer interval tracking for cleanup
    static _timerDisplayInterval = null;
    static _timerSyncInterval = null;
    static _timerStartTimeout = null;
    
    // Event listener reference tracking for cleanup
    static _clickHandler = null;
    static _clickHandlerContainer = null;
    static _contextMenuHandler = null;
    static _contextMenuHandlerContainer = null;
    static _clickHandlerSecondaryContainer = null;
    static _contextMenuHandlerSecondaryContainer = null;
    static _middleZoneOverflowItems = [];  // Items moved to overflow menu when middle zone overflows
    static _middleZoneResizeObserver = null;  // ResizeObserver for overflow detection

    /** @type {Map<string, (user: User) => { hide?: boolean }>} - Module visibility overrides (moduleId -> callback) */
    static _menubarVisibilityOverrides = new Map();

    /**
     * Item kinds that display a value rather than being clickable.
     *
     * One definition because the alternative was six inline `kind !== 'info' && kind !== ...`
     * chains scattered through switch-group handling, and every new kind had to find all six or be
     * silently treated as a button -- given an active state, counted toward a switch group, and
     * offered a pointer cursor it does nothing with.
     */
    static DISPLAY_KINDS = new Set(['info', 'statchip', 'portraitstat', 'gaugechip', 'sparkchip', 'nameplate', 'progressbar', 'balancebar']);

    /** True when a kind is a readout rather than a button. */
    static isDisplayKind(kind) {
        return this.DISPLAY_KINDS.has(kind);
    }

    /**
     * A numeric series as column heights in percent, newest last.
     *
     * Scaled against the series' own maximum rather than an absolute one, because a spark is read
     * for its SHAPE -- is this rising, was that spike unusual -- and an absolute scale flattens
     * every party whose numbers happen to be small. A floor of 6% keeps a zero visible as a tick
     * rather than a gap, so the column count always matches the number of periods.
     *
     * Only the last `points` entries are kept: at this width more columns are thinner, not more
     * informative, and the eye cannot resolve them.
     *
     * Pass `seriesB` for a paired chart -- two columns per period, sharing one scale so the pair
     * can be compared against each other rather than each against itself.
     */
    static buildSparkBars(series, points = 12, seriesB = null) {
        if (!Array.isArray(series) || !series.length) return [];
        const take = Math.max(1, points);
        const a = series.slice(-take);
        const b = Array.isArray(seriesB) ? seriesB.slice(-take) : null;

        // BOTH SERIES SHARE ONE SCALE. Normalising each against its own maximum would make a round
        // where the party dealt 40 and took 4 draw two equal columns, which is the opposite of what
        // a paired chart is for -- the comparison between the pair IS the reading.
        let max = 0;
        for (const value of a) max = Math.max(max, Number(value) || 0);
        if (b) for (const value of b) max = Math.max(max, Number(value) || 0);

        const height = (value) => (max > 0 ? Math.max(6, Math.round(((Number(value) || 0) / max) * 100)) : 6);
        return a.map((value, index) => ({
            height: height(value),
            heightB: b ? height(b[index]) : null,
            hasPair: !!b,
            isLast: index === a.length - 1
        }));
    }

    /**
     * Display kinds shaped like a chip: an icon, an optional label, and a value.
     *
     * They share one preparation and one patch path because they share those fields; what differs
     * is the ornament each adds (a tone, a portrait ring, a gauge sweep). The bars are not here --
     * their live fields are geometry, not text.
     */
    static CHIP_KINDS = new Set(['info', 'statchip', 'portraitstat', 'gaugechip', 'sparkchip', 'nameplate']);

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
        
        // Handlebars helpers (or, eq, gt, and, isImageUrl) moved to
        // utility-handlebars.js, which registers in `init` and unconditionally.
        // They were never menubar-specific -- siblings render against them --
        // and registering them from a subsystem's initialize() tied a
        // cross-module contract to that subsystem's lifecycle.

        // Simple DOM insertion - no complex hooks needed

        // Wait for socket to be ready
        Hooks.once('blacksmith.socketReady', () => {
    
        });

        // Register for module features
        this._registerModuleFeatures();
        
        // Register setting change hook to refresh menubar when party leader changes
        this._registerLeaderChangeHook();
        this._registerSessionTimerSettingsHook();

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
                    // Rebuild rather than close: the combat bar outlives any
                    // one combat now, so a scene with no encounter shows it in
                    // its idle form instead of losing it.
                    CombatBarManager.updateCombatBar(this);
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
            // The item partial must register BEFORE the bar that invokes it: Handlebars resolves a
            // partial at render time, but a bar rendered in between would fail rather than wait.
            const itemTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partials/menubar-secondary-item.hbs').then(response => response.text());
            Handlebars.registerPartial('menubar-secondary-item', itemTemplate);

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
        // partyLeader is a WORLD setting, so every client sees its Setting document change via
        // the core `updateSetting` document hook (`createSetting` for the first-ever set in a
        // world). There is NO core hook named `settingChange` — registrations against it never
        // fire (found 2026-07-17; menubar leader display had always synced via the socketlib
        // "updateLeader" path instead, which masked it).
        const onPartyLeaderSetting = (setting) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (setting?.key !== `${MODULE.ID}.partyLeader`) return;
            // The client Setting document casts `value` to the registered type on initialize
            // (Setting#_initialize → _castType), so for this `type: Object` setting it is
            // already the parsed {userId, actorId} object — only `_source.value` is the raw
            // JSON string. Guard for the string anyway (e.g. a hook firing before cast).
            let value = setting.value;
            if (typeof value === 'string') {
                try {
                    value = JSON.parse(value);
                } catch (_error) {
                    value = null;
                }
            }

            // Update the current leader display
            if (value && value.userId) {
                // Find the actor for the new leader
                const actor = game.actors.get(value.actorId);
                if (actor) {
                    MenuBar.currentLeader = actor.name;

                    // Receipt-side toast: this document hook fires on every client, no
                    // sockets. Gated by the notifyLeaderChange channel setting
                    // (toast | chat | both | none); the chat-card half is gated GM-side
                    // in setNewLeader.
                    const notifyMode = getSettingSafely(MODULE.ID, 'notifyLeaderChange', 'toast');
                    if (notifyMode === 'toast' || notifyMode === 'both') {
                        const isNewLeader = game.user.id === value.userId;
                        ToastAPI.show({
                            title: isNewLeader ? "You are now the party leader" : "Party leader changed",
                            subtitle: isNewLeader ? `Leading as ${actor.name}` : `${actor.name} now leads the party`,
                            icon: "fas fa-crown",
                            duration: 3,
                            moduleId: "blacksmith-core",
                            stackKey: "blacksmith-party-leader"
                        });
                    }
                }
            } else {
                MenuBar.currentLeader = null;
            }

            // Refresh the menubar to update tool visibility
            MenuBar.updateLeaderDisplay();
        };

        HookManager.registerHook({
            name: 'updateSetting',
            description: 'MenuBar: Refresh menubar + toast on party leader changes',
            context: 'menubar-settings-change',
            priority: 3,
            callback: onPartyLeaderSetting
        });
        HookManager.registerHook({
            name: 'createSetting',
            description: 'MenuBar: Refresh menubar + toast on first-ever party leader set',
            context: 'menubar-settings-change',
            priority: 3,
            callback: onPartyLeaderSetting
        });

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Leader change hook registered", "", true, false);
    }

    static _registerSessionTimerSettingsHook() {
        const defaultSettingKeys = new Set([
            'sessionTimerDefaultMode',
            'sessionTimerDefault',
            'sessionTimerSpecificTime'
        ]);

        HookManager.registerSettingChangeCallback({
            description: 'MenuBar: Apply session Default Time settings when saved',
            context: 'menubar-session-timer-settings',
            priority: 3,
            callback: async (moduleId, key) => {
                if (moduleId !== MODULE.ID || !defaultSettingKeys.has(key)) return;
                if (!game.user.isGM || this.isLoading) return;

                const previousEnd = this.sessionEndTime;
                await this.loadTimer();

                if (this.sessionEndTime !== previousEnd) {
                    if (this.sessionEndTime) {
                        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, false);
                    } else {
                        const socket = SocketManager.getSocket();
                        if (socket) {
                            await socket.executeForOthers('updateTimer', {
                                endTime: null,
                                startTime: null
                            });
                        }
                    }
                }

                this.updateTimerDisplay();
                this.startTimerUpdates();
            }
        });

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Session timer settings hook registered", "", true, false);
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
     * Resolve the height a secondary bar type should render at, in pixels.
     *
     * A type may claim its own variable (`--blacksmith-menubar-secondary-{typeId}-height`);
     * everything else gets the house default from the stylesheet. The final `|| 30` is a
     * belt-and-braces guard for the case where the stylesheet has not loaded yet.
     *
     * Height is a master scale factor, not just a dimension — see the note beside
     * `--blacksmith-menubar-secondary-default-height` in `styles/menubar.css`.
     *
     * @param {string} typeId
     * @returns {number} Height in pixels.
     */
    static getSecondaryBarHeight(typeId) {
        const styles = getComputedStyle(document.documentElement);
        const typeHeight = parseInt(styles.getPropertyValue(`--blacksmith-menubar-secondary-${typeId}-height`));
        if (typeHeight) return typeHeight;
        return parseInt(styles.getPropertyValue('--blacksmith-menubar-secondary-default-height')) || 30;
    }

    /**
     * Write the space a bar's group banners occupy, so the bar can reserve it rather
     * than take it out of the height its items were promised.
     *
     * Banners used to be subtractive: the CSS derived an `--available-height` by taking
     * the banner and its gap out of the bar height, so a 30px bar left 6px for buttons.
     * The only remedy available to a module was to inflate its bar, which also inflated
     * its type — which is how the suite arrived at five bars of five different sizes.
     *
     * The banner height stays proportional to the bar so it reads in scale, but it is
     * added on top. Both the banner rule and the bar's bottom padding read these
     * variables, so there is one number rather than two that must agree.
     *
     * @param {Object|null} barType Registered bar type, or null to clear the allowance.
     */
    static _applyBannerAllowance(barType) {
        const root = document.documentElement.style;
        if (!barType?.groupBannerEnabled) {
            root.setProperty('--blacksmith-menubar-secondary-banner-height', '0px');
            root.setProperty('--blacksmith-menubar-secondary-banner-allowance', '0px');
            return;
        }

        const height = this.secondaryBar?.height || this.getSecondaryBarHeight(barType.typeId);
        const bannerHeight = Math.round(Math.min(20, Math.max(10, height * 0.20)));
        const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-banner-gap')) || 2;

        root.setProperty('--blacksmith-menubar-secondary-banner-height', `${bannerHeight}px`);
        root.setProperty('--blacksmith-menubar-secondary-banner-allowance', `${bannerHeight + gap}px`);
    }

    /**
     * Resolve a registered size preset to a height in pixels.
     *
     * Presets exist so a bar that needs more room asks for a shape rather than inventing a
     * number — five bars at five bespoke heights is exactly how the suite ended up
     * inconsistent. `default` matches the primary menubar.
     *
     * @param {string} size
     * @returns {number|null} Height in pixels, or null if the name is not a preset.
     */
    static getSecondaryBarSizePreset(size) {
        if (typeof size !== 'string') return null;
        const key = size.trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(MenuBar.SECONDARY_BAR_SIZES, key)) return null;
        const preset = MenuBar.SECONDARY_BAR_SIZES[key];
        return preset === null ? MenuBar.getSecondaryBarHeight('default') : preset;
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
        if (this._timerStartTimeout != null) clearTimeout(this._timerStartTimeout);
        this._timerStartTimeout = setTimeout(() => {
            this._timerStartTimeout = null;
            this.startTimerUpdates();
        }, 1000);
        this.registerDefaultTools();
        await this.registerSecondaryBarTypes();
        this.renderMenubar();
    }

    static async registerSecondaryBarTypes() {
        // Register encounter secondary bar (default tool system – items registered from ui-journal-encounter.js)
        // Encounter bar type is registered by ui-journal-encounter.js with info items + buttons

        // Register party secondary bar (default tool system)
        // No size: the party bar is a row of buttons and readouts with nothing
        // that needs the room, so it takes the house default like anything else.
        await this.registerSecondaryBarType('party', {
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

        // Send Toast (GM only) — middle zone: large styled toast to selected players
        this.registerSecondaryBarItem('party', 'send-toast', {
            zone: 'middle',
            icon: 'fas fa-bullhorn',
            label: 'Send Toast',
            tooltip: 'Send an on-screen toast to selected players',
            group: 'default',
            order: 6,
            visible: () => game.user.isGM,
            onClick: async () => {
                try {
                    const { ToastSendWindow } = await import('./window-toast-send.js');
                    new ToastSendWindow().render(true);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Party Tools: Error opening Send Toast", error.message, false, false);
                }
            }
        });

        // Quick Toast (GM only) — middle zone: menu of saved Send Toast templates
        // that carry text, fired as-is with one click (party-wide delivery, the
        // template's own publish target). Send logic lives in window-toast-send.js.
        this.registerSecondaryBarItem('party', 'quick-toast', {
            zone: 'middle',
            icon: 'fas fa-bolt',
            label: 'Quick Toast',
            tooltip: 'Send a saved toast with one click',
            group: 'default',
            order: 7,
            visible: () => game.user.isGM,
            onClick: (event) => {
                void MenuBar.showQuickToastMenu(event);
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
        HookManager.registerSettingChangeCallback({
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
    /**
     * Run a registered menubar tool by id, from anywhere.
     *
     * A tool used to be reachable only by clicking its own icon, so any other surface that wanted
     * the same behaviour had to reimplement it or reach into the owning module. Registration
     * already knows what the tool does; this makes that knowledge callable.
     *
     * @param {string} toolId
     * @param {Object} [context] - passed to the tool's onClick as its second argument
     * @returns {boolean} whether a tool was found and run
     */
    static invokeMenubarTool(toolId, context = {}) {
        const tool = this.toolbarIcons.get(toolId);
        if (typeof tool?.onClick !== 'function') return false;
        try {
            tool.onClick(null, context);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar API: Error invoking tool", { toolId, error }, false, false);
            return false;
        }
    }

    /**
     * Run whichever registered tool claims an INTENT, if any module has claimed it.
     *
     * This is the part that keeps surfaces from coupling to modules. Blacksmith's combat bar wants
     * clicking the party health bars to open a health panel, and Squire has one -- but naming
     * `squire-health` here would put a sibling's tool id in the hub, which is precisely the
     * coupling the module boundaries forbid. Instead a tool declares what it HANDLES:
     *
     *     blacksmith.registerMenubarTool('squire-health', { ..., intents: ['party-health'] });
     *
     * and any surface asks for the intent. Nobody claims it, nothing happens -- which is the
     * correct behaviour for an optional integration, and is why `hasIntentHandler` exists: a
     * surface should not offer a click that will do nothing.
     *
     * Registration order decides ties. Two modules claiming one intent is a configuration the user
     * chose, not an error to resolve here.
     *
     * @param {string} intent
     * @param {Object} [context]
     * @returns {boolean} whether a handler was found and run
     */
    static invokeIntent(intent, context = {}) {
        if (!intent) return false;
        for (const [toolId, tool] of this.toolbarIcons.entries()) {
            if (!Array.isArray(tool?.intents) || !tool.intents.includes(intent)) continue;
            return this.invokeMenubarTool(toolId, context);
        }
        return false;
    }

    /** Whether any registered tool claims an intent. Ask before offering a click. */
    static hasIntentHandler(intent) {
        if (!intent) return false;
        for (const tool of this.toolbarIcons.values()) {
            if (Array.isArray(tool?.intents) && tool.intents.includes(intent)) return true;
        }
        return false;
    }

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
                // The registry key, carried on the object so the template and the click handler can
                // dispatch on it. `name` is NOT unique — it's a CSS class and a label — and dispatching
                // on it let two modules' tools cross-fire. Only toolId is enforced unique (see above).
                toolId: toolId,
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
                contextMenuItems: toolData.contextMenuItems !== undefined ? toolData.contextMenuItems : null,  // Optional: array or (toolId, tool) => array of { name, icon, onClick }
                // Capabilities this tool claims, for `invokeIntent` / `hasIntentHandler`.
                //
                // This object is a NORMALISED COPY, not the caller's -- which is deliberate, since
                // it means a registration cannot smuggle in fields the menubar then has to defend
                // against. The cost is that every supported field must be listed here or it is
                // silently dropped, and `intents` was: the lookup was written and the copy was not,
                // so a module could claim an intent, get `true` back from registration, and never
                // be found. Anything added to the API surface has to be added HERE too.
                intents: Array.isArray(toolData.intents) ? [...toolData.intents] : []
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
     * @param {Object} options - Optional behaviors
     * @param {Function} options.onClick - Called when the user clicks the notification body; the notification is then removed (onDismiss does NOT fire)
     * @param {Function} options.onDismiss - Called only when the notification goes away without being acted on: auto-timeout or the close button. Never fires after onClick, on programmatic removeNotification, or on the bulk clears.
     * @param {boolean} options.pulse - Render with an attention pulse animation
     * @returns {string} - The notification ID for later removal
     */
    static addNotification(text, icon = "fas fa-info-circle", duration = 5, moduleId = "blacksmith-core", options = {}) {
        try {
            const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Callbacks are safe to store: notifications live in a per-client Map and never cross the socket.
            const notification = {
                id: notificationId,
                text: text,
                icon: icon,
                duration: duration,
                moduleId: moduleId,
                onClick: typeof options.onClick === 'function' ? options.onClick : null,
                onDismiss: typeof options.onDismiss === 'function' ? options.onDismiss : null,
                pulse: !!options.pulse,
                createdAt: Date.now()
            };

            // Store the notification
            this.notifications.set(notificationId, notification);

            // Set up auto-removal if duration is specified
            if (duration > 0) {
                notification.timeoutId = setTimeout(() => {
                    this._dismissNotification(notificationId);
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
     * @param {Function|null} updates.onClick - New click handler; pass null to strip it (notification becomes display-only)
     * @param {Function|null} updates.onDismiss - New dismiss handler; pass null to strip it
     * @param {boolean} updates.pulse - Toggle the attention pulse animation
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
            if (updates.onClick !== undefined) notification.onClick = typeof updates.onClick === 'function' ? updates.onClick : null;
            if (updates.onDismiss !== undefined) notification.onDismiss = typeof updates.onDismiss === 'function' ? updates.onDismiss : null;
            if (updates.pulse !== undefined) notification.pulse = !!updates.pulse;
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
                        this._dismissNotification(notificationId);
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
     * Remove a notification because it went away WITHOUT being acted on — auto-timeout
     * or the close button. Fires onDismiss (if any), then removes. Every other removal
     * path is silent by design: removal after onClick has run, programmatic
     * removeNotification() by the consumer, and the bulk clears (which bypass
     * removeNotification and delete straight from the Map).
     * @private
     * @param {string} notificationId - The notification ID to dismiss
     * @returns {boolean} - True if the notification existed and was removed
     */
    static _dismissNotification(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (notification && typeof notification.onDismiss === 'function') {
            try {
                notification.onDismiss();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Error in notification onDismiss for ${notificationId}:`, error, false, false);
            }
        }
        return this.removeNotification(notificationId);
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
                    // Clear the auto-dismiss timer before dropping the notification, exactly as
                    // removeNotification() and clearAllNotifications() do. Without this, a module that
                    // cleans up on disable left live timers holding a closure over MenuBar until each
                    // notification's duration elapsed.
                    if (notification.timeoutId) {
                        clearTimeout(notification.timeoutId);
                    }
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
     * @param {string} [config.size] - Size preset: 'default' (matches the primary menubar),
     *   'large', or 'xlarge'. Omit for the house default. There is no pixel option — see
     *   MenuBar.SECONDARY_BAR_SIZES.
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

            // A size preset, or the house default. There is deliberately no pixel
            // option: height scales every font, icon, gap, and padding in the bar, so a
            // bespoke number is a typography decision disguised as a layout one, and an
            // escape hatch documented as "do not use this" is still the path of least
            // resistance. `config.height` was that hatch, every module in the suite took
            // it, and the result was five bars at five sizes. It is now ignored and said
            // so out loud. The old fallback here was a hardcoded 50 — nowhere near the
            // primary bar's 30 — which is why even an unstyled bar looked wrong.
            const presetHeight = MenuBar.getSecondaryBarSizePreset(config.size);
            if (config.size && presetHeight === null) {
                postConsoleAndNotification(MODULE.NAME, `Secondary Bar: Unknown size preset '${config.size}', using the default height`, { typeId, valid: Object.keys(MenuBar.SECONDARY_BAR_SIZES) }, false, false);
            }
            if (config.height !== undefined) {
                postConsoleAndNotification(MODULE.NAME, `Secondary Bar: 'height' is no longer accepted and was ignored — use size: 'default' | 'large' | 'xlarge'`, { typeId, ignored: config.height, using: presetHeight || MenuBar.getSecondaryBarHeight(typeId) }, false, false);
            }

            const barType = {
                typeId: typeId,
                height: presetHeight || MenuBar.getSecondaryBarHeight(typeId),
                persistence: config.persistence || 'manual',
                autoCloseDelay: config.autoCloseDelay || 10000,
                templatePath: config.templatePath || null,
                hasCustomTemplate: !!config.templatePath,
                // A hybrid bar renders registered items *and* its own markup.
                // Custom template and item rendering were mutually exclusive,
                // which left a bespoke bar unable to use info/progressbar/
                // balancebar items even though they are exactly what it needs.
                hybridItems: config.hybridItems === true,
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
                        if (groupConfig.mode === 'switch' && activeStates && !MenuBar.isDisplayKind(itemData.kind)) {
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
     * Items are either buttons (clickable) or one of the display-only kinds. Supports zones: left, middle, right.
     * @param {string} barTypeId - The bar type to register the item to
     * @param {string} itemId - Unique identifier for the item
     * @param {Object} itemData - Item configuration
     * @param {string} [itemData.kind] - 'button' (default), 'info', 'statchip', 'portraitstat', 'gaugechip', 'nameplate', 'progressbar', or 'balancebar'
     * @param {string} [itemData.zone] - 'left' | 'middle' | 'right' (default: 'middle')
     * @returns {boolean} Success status
     */
    static registerSecondaryBarItem(barTypeId, itemId, itemData) {
        try {
            const kind = itemData.kind || 'button';
            const zone = (itemData.zone === 'left' || itemData.zone === 'middle' || itemData.zone === 'right') ? itemData.zone : 'middle';

            if (MenuBar.CHIP_KINDS.has(kind)) {
                // Display-only. Something has to be shown: a label, a value, or -- for a portrait
                // chip, whose whole content can be the face -- an image.
                if (!itemId || !itemData || (itemData.label === undefined && itemData.value === undefined && itemData.image === undefined)) {
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Display item requires label, value, or image",
                        { barTypeId, itemId, kind }, false, false);
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
                    ...(kind === 'balancebar' && { height: itemData.height, percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 }),
                    ...(kind === 'statchip' && { tone: itemData.tone || 'neutral' }),
                    ...(kind === 'portraitstat' && { rank: itemData.rank ?? 0 }),
                    ...(kind === 'gaugechip' && { percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 })
                });
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Item queued (bar type not registered yet)",
                    { barTypeId, itemId }, true, false);
                return true;
            }

            // Bar type exists - check if it supports items. A custom template
            // normally means the bar draws itself and items have nowhere to go;
            // a hybrid bar renders both, so it accepts them.
            if (barType.hasCustomTemplate && !barType.hybridItems) {
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
                ...(kind === 'balancebar' && { height: itemData.height, percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 }),
                ...(kind === 'statchip' && { tone: itemData.tone || 'neutral' }),
                ...(kind === 'portraitstat' && { rank: itemData.rank ?? 0 }),
                ...(kind === 'gaugechip' && { percentProgress: itemData.percentProgress != null ? itemData.percentProgress : 0 })
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
                        const groupItems = Array.from(items.values()).filter(item => item.group === groupId && !MenuBar.isDisplayKind(item.kind));
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
            // `tooltip` counts as an info update. A readout whose value changes
            // usually wants the explanation to change with it — the combat bar's
            // biggest-hit chip shows an amount and names who landed it on whom —
            // and a tooltip that could only be set at registration made that
            // impossible, silently: the update was accepted and dropped.
            // `image` counts too: an info item can show a portrait, and which
            // portrait is itself the value — "biggest hit" names a different
            // character as the campaign goes on.
            const hasInfoUpdate = updates && (updates.value !== undefined || updates.label !== undefined || updates.borderColor !== undefined ||
                updates.buttonColor !== undefined || updates.iconColor !== undefined || updates.tooltip !== undefined ||
                updates.image !== undefined || updates.tone !== undefined ||
                updates.rank !== undefined || updates.icon !== undefined ||
                updates.series !== undefined || updates.emphasis !== undefined ||
                updates.seriesB !== undefined);
            const hasProgressbarUpdate = updates && (updates.percentProgress !== undefined || updates.leftLabel !== undefined || updates.rightLabel !== undefined ||
                updates.leftIcon !== undefined || updates.rightIcon !== undefined || updates.title !== undefined || updates.icon !== undefined ||
                updates.barColor !== undefined || updates.progressColor !== undefined);
            const hasBalancebarUpdate = updates && (updates.percentProgress !== undefined || updates.leftLabel !== undefined || updates.rightLabel !== undefined ||
                updates.leftIcon !== undefined || updates.rightIcon !== undefined || updates.title !== undefined || updates.icon !== undefined ||
                updates.barColorLeft !== undefined || updates.barColorRight !== undefined || updates.markerColor !== undefined || updates.borderColor !== undefined ||
                updates.markers !== undefined);
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
            if (updates.tooltip !== undefined) existing.tooltip = updates.tooltip;
            if (updates.image !== undefined) existing.image = updates.image;
            if (updates.tone !== undefined) existing.tone = updates.tone;
            if (updates.rank !== undefined) existing.rank = updates.rank;
            if (updates.series !== undefined) existing.series = updates.series;
            if (updates.seriesB !== undefined) existing.seriesB = updates.seriesB;
            if (updates.emphasis !== undefined) existing.emphasis = updates.emphasis;
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
            if (updates.markers !== undefined) existing.markers = updates.markers;
            map.set(itemId, existing);

            if (this.secondaryBar.isOpen && this.secondaryBar.type === barTypeId) {
                // Write the value into the standing DOM right here, synchronously. A pushed value
                // must never depend on a later render arriving: routing it through the debounced
                // render made the readout hostage to that render actually running, and a caller
                // refreshing faster than the debounce would leave every figure frozen at whatever
                // it was registered with.
                //
                // The patch reports false when the change needs an element added or removed, which
                // only the template can do — that falls back to the immediate rebuild this used to
                // do unconditionally.
                if (!this._applySecondaryBarValueRefresh(itemId)) {
                    this.renderMenubar(true);
                    return true;
                }
                // The value is already on screen; this render is for everything that re-measures
                // afterwards — the combat bar re-runs its overflow suppression, and a wider number
                // can change what fits. Debounced, so a burst of pushes costs one pass, and if it
                // is ever coalesced away the figures on screen are still correct.
                this.renderMenubar();
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
                                .filter(i => i.group === groupId && !MenuBar.isDisplayKind(i.kind))
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
     * @param {number} [options.height] - Re-open at a height the bar recomputed for itself,
     *   for a bar whose height changes with its own state (the encounter bar is the only
     *   one). Not a way to choose a size — registration takes a `size` preset and no pixel
     *   value, and this is not the way around that.
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

            // Learn which tool owns this bar, if the module never said. A tool that opens
            // a bar from its own onClick is that bar's tool, and the click handler flips
            // `active` on it whether or not anyone declared the relationship — so without
            // this the tool lights up and nothing is able to turn it off again.
            // registerSecondaryBarTool stays the explicit way to declare it, and wins.
            if (this._toolBeingClicked && !this.secondaryBarToolMapping.has(typeId)) {
                const clickedTool = this.toolbarIcons.get(this._toolBeingClicked);
                if (clickedTool?.toggleable) {
                    this.secondaryBarToolMapping.set(typeId, this._toolBeingClicked);
                    postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Learned tool mapping from click", { typeId, toolId: this._toolBeingClicked }, true, false);
                }
            }

            this.secondaryBar.height = options.height || barType.height || this.getSecondaryBarHeight(typeId);
            this.secondaryBar.persistence = options.persistence || barType.persistence;
            this.secondaryBar.data = options.data || {};

            // For party bar, refresh party health progressbar so it shows current HP
            if (typeId === 'party') {
                this._refreshPartyBarInfo();
            }

            // Set the CSS variables for secondary bar height and total height
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', `${this.secondaryBar.height}px`);
            this._applyBannerAllowance(barType);
            // Includes the padding the secondary bar adds around its content — the
            // shadow offset above and the banner allowance below — or the interface
            // beneath would sit that many pixels too high.
            document.documentElement.style.setProperty('--blacksmith-menubar-total-height', `calc(var(--blacksmith-menubar-primary-height) + var(--blacksmith-menubar-secondary-height) + var(--blacksmith-menubar-secondary-shadow-offset) + var(--blacksmith-menubar-secondary-banner-allowance))`);

            // Set up auto-close if needed
            if (this.secondaryBar.persistence === 'auto') {
                this._setAutoCloseTimeout();
            }

            // Sync button states once the mapping above is in place. This used to run
            // twice per open — once before the bar was configured and once after — and
            // each call re-renders the whole menubar.
            this._syncSecondaryBarButtonStates(typeId);

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
                this._syncSecondaryBarButtonStates(null);
            }

            // Reset the CSS variables for secondary bar height and total height
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', '0px');
            this._applyBannerAllowance(null);
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
            this._applyBannerAllowance(null);
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
     * Sync button active states when secondary bars change.
     *
     * Takes only the type that is now open because the answer does not depend on what
     * was open before: a mapped tool is active exactly when its bar is the open one.
     *
     * @private
     * @param {string|null} newType - The newly opening bar type, or null when closing
     */
    static _syncSecondaryBarButtonStates(newType) {
        try {
            // Every mapped tool is set from whether its bar is the open one, rather than
            // just clearing `previousType`'s. Only one secondary bar can be open, so a
            // tool whose bar is not it is not active — full stop. Clearing only the
            // previous type meant any tool that went active by some other route stayed
            // lit forever, and the generic click handler is exactly such a route: it
            // flips `tool.active` for any toggleable tool without knowing what the tool
            // does. Deriving the whole set makes the two impossible to disagree.
            for (const [barTypeId, toolId] of this.secondaryBarToolMapping) {
                const tool = this.toolbarIcons.get(toolId);
                if (!tool || !tool.toggleable) continue;
                tool.active = barTypeId === newType;
            }

            // Re-render to show updated states
            this.renderMenubar(true);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error syncing button states", { newType, error }, false, false);
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
                size: 'xlarge',
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
        this._applyBannerAllowance(null);
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
            // A hybrid bar falls through to the zone preparation below so its
            // template can render registered items alongside its own markup.
            if (!barType.hybridItems) return data;
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
            // Merge live updates for every chip kind. One block rather than one per kind: they
            // carry the same icon/label/value/image fields and differ only in their ornament.
            if (MenuBar.CHIP_KINDS.has(item.kind)) {
                const u = infoUpdates?.get(item.itemId);
                item.displayValue = u?.value !== undefined ? u.value : item.value;
                item.displayLabel = u?.label !== undefined ? u.label : item.label;
                if (u) {
                    if (u.borderColor !== undefined) item.borderColor = u.borderColor;
                    if (u.buttonColor !== undefined) item.buttonColor = u.buttonColor;
                    if (u.iconColor !== undefined) item.iconColor = u.iconColor;
                    if (u.tooltip !== undefined) item.tooltip = u.tooltip;
                    if (u.image !== undefined) item.image = u.image;
                    if (u.icon !== undefined) item.icon = u.icon;
                    if (u.tone !== undefined) item.tone = u.tone;
                    if (u.emphasis !== undefined) item.emphasis = u.emphasis;
                    if (u.rank !== undefined) item.rank = u.rank;
                    if (u.series !== undefined) item.series = u.series;
                    if (u.seriesB !== undefined) item.seriesB = u.seriesB;
                    if (u.percentProgress !== undefined) item.percentProgress = u.percentProgress;
                }
                // Defaults resolved here rather than in the template, so the rendered class list
                // and the patched one cannot disagree about what "no tone" or "unranked" is.
                if (item.kind === 'statchip') item.tone = item.tone || 'neutral';
                // Emphasis is what makes a hierarchy possible. It defaults to `plain` so a chip is
                // quiet unless something says otherwise -- the opposite default made every readout
                // shout, which is the same as none of them shouting.
                item.emphasis = item.emphasis === 'feature' ? 'feature' : 'plain';
                if (item.kind === 'portraitstat' || item.kind === 'nameplate') item.rank = Number(item.rank) || 0;
                if (item.kind === 'gaugechip') {
                    item.gaugePercent = Math.max(0, Math.min(100, Number(item.percentProgress) || 0));
                }
                if (item.kind === 'sparkchip') {
                    item.tone = item.tone || 'neutral';
                    item.sparkBars = MenuBar.buildSparkBars(item.series, item.sparkPoints, item.seriesB);
                }
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
                if (u.markers !== undefined) item.markers = u.markers;
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

                // EXTRA NEEDLES ON THE SAME SCALE.
                //
                // A balance bar measures one thing -- the relationship between two sides -- and the
                // bar IS that scale. A second reading of the same relationship does not want a
                // second bar; it wants a second needle, because the whole value of putting them
                // together is reading one against the other on identical axes. Two bars would put
                // the comparison back on the reader.
                //
                // `from: 'bottom'` is how two needles stay distinguishable without colour alone:
                // one descends from the top edge, the other rises from the bottom, and they meet in
                // the middle without ever overlapping.
                item.balancebarMarkers = (Array.isArray(item.markers) ? item.markers : []).map((marker) => {
                    const value = Math.max(-100, Math.min(100, Number(marker?.percent) || 0));
                    return {
                        leftPercent: 50 + (value / 2),
                        color: marker?.color || null,
                        fromBottom: marker?.from === 'bottom',
                        tooltip: marker?.tooltip || ''
                    };
                });
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
            if (!groupItems || !groupItems.some(item => item.itemId === activeItemId && !MenuBar.isDisplayKind(item.kind))) {
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

                const buttonItems = groupItems.filter(i => !MenuBar.isDisplayKind(i.kind));

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
                        if (MenuBar.isDisplayKind(item.kind)) item.active = false;
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

        // menubar.hbs invokes a custom partial with `secondaryBar.data` as its
        // context, so a hybrid bar's zones have to travel there to be reachable
        // at all. Carrying the banner settings across too means the custom
        // template can hand its context straight to menubar-secondary-default
        // and reuse the whole item rendering rather than restating it.
        if (barType.hasCustomTemplate && barType.hybridItems && data.data) {
            // A render-only copy, deliberately not a mutation of
            // `this.secondaryBar.data`: the value fingerprint JSON-stringifies
            // that object, and folding the zones into it would stringify every
            // item on every render.
            data.data = {
                ...data.data,
                zones: data.zones,
                groupBannerEnabled: data.groupBannerEnabled,
                groupBannerColor: data.groupBannerColor
            };
        }

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
            // Include the resolved title so a dynamic label change (e.g. Herald's view-mode
            // tool switching modes) changes the fingerprint and forces a full re-render.
            // Without this, a title-only change takes the lightweight-refresh path, which
            // does not update tool labels, and the button shows a stale label.
            let title = '';
            try {
                title = typeof tool.title === 'function' ? String(tool.title() ?? '') : String(tool.title ?? '');
            } catch {
                title = '';
            }
            parts.push(`${toolId}:1:${tool.zone || 'left'}:${tool.group || 'general'}:${activeState ? 1 : 0}:${tool.order ?? 999}:${title}`);
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
        let customPart = '';
        if (barType?.hasCustomTemplate) {
            const data = sb.data && typeof sb.data === 'object' ? sb.data : {};
            const combatId = data.combat?.id ?? data.combatId ?? '';
            const sceneId = typeof canvas !== 'undefined' && canvas?.scene?.id ? canvas.scene.id : '';
            customPart = `custom|${combatId}|${sceneId}`;
            // A hybrid bar renders items too, so its structure changes when
            // they do — falling through picks up the item signature below.
            // Returning here would leave an item appearing or changing
            // visibility unable to trigger a rebuild.
            if (!barType.hybridItems) return `${sb.type}|${customPart}|${sb.height ?? ''}`;
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
        return `${sb.type}|${customPart}|${parts.join(',')}|h${sb.height ?? ''}`;
    }

    /**
     * Live state for the open secondary bar that only a rebuild can express: a custom template's
     * `data` payload, switch selection, and toggleable buttons.
     *
     * Must be part of the menubar structure fingerprint; otherwise `renderMenubar` skips the rebuild
     * and bars stay stale. Readout values are deliberately NOT here — they are patched in place, and
     * folding them back in would restore the full rebuild on every ticking number.
     * @private
     */
    static _secondaryBarStateSignature() {
        const sb = this.secondaryBar;
        if (!sb?.isOpen || !sb?.type) return '';
        const barTypeId = sb.type;
        const chunks = [];

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
        // Deliberately NOT sorted: notification display order is semantic (temp group before
        // persistent, newest first), so a reorder — e.g. updateNotification flipping duration —
        // must change the fingerprint and force a rebuild.
        const notifParts = (templateData.notifications || []).map((n) => `${n.id}\x1d${String(n.text ?? '')}\x1d${String(n.icon ?? '')}\x1d${n.actionable ? 1 : 0}\x1d${n.pulse ? 1 : 0}`);
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
            this._secondaryBarStateSignature(),
            templateData.isInterfaceHidden ? '1' : '0'
        ].join('\x1f');
    }

    /**
     * Write pushed readout values into the open secondary bar's existing DOM.
     *
     * Before this existed, `updateSecondaryBarItemInfo` ended in an immediate full `renderMenubar`,
     * and the pushed value changed the menubar fingerprint, so every ticking number destroyed and
     * rebuilt the whole bar. `CombatBarManager.refreshStatReadouts` alone pushes eighteen values in
     * a row, which was eighteen rebuilds of a bar section 9B of the architecture doc calls
     * performance-critical.
     *
     * Cost is only half the reason. A node rebuilt on every update cannot carry a transition that
     * means anything — a flash keyed to a changed value would replay on every unrelated render, and
     * a count-up would restart continuously — so animated readouts are impossible until the node
     * survives its own update. This is what makes them possible.
     *
     * Only the keys actually present in `secondaryBarInfoUpdates` are written. Patching every
     * prepared field instead would have this fighting `CombatBarManager.syncTimerReadout`, which
     * deliberately clears a timer bar's inline background so a state class can colour it.
     *
     * @param {string|null} [onlyItemId] - Patch just this item; omit to sweep every pushed value,
     *   which is what a render wants since it has no idea which values moved since the last one.
     * @returns {boolean} true if the DOM now matches; false if the caller must rebuild instead
     * @private
     */
    static _applySecondaryBarValueRefresh(onlyItemId = null) {
        // Only the ways OUT are logged. A patch that quietly declines to write is invisible — the
        // bar keeps showing whatever it was registered with and nothing errors — so each bail says
        // which one it took. There is deliberately no success log: this runs on every pushed value
        // and on every render, so logging the good path buried the console in identical lines and
        // made the rare interesting one unfindable.
        const bail = (reason, detail) => {
            postConsoleAndNotification(MODULE.NAME, `Secondary Bar: value patch declined (${reason})`,
                detail ?? '', true, false);
            return false;
        };

        const sb = this.secondaryBar;
        if (!sb?.isOpen || !sb?.type) return bail('bar not open');
        const root = document.querySelector(`.blacksmith-menubar-secondary[data-bar-type="${sb.type}"]`);
        if (!root) return bail('bar element not found', sb.type);

        const updates = this.secondaryBarInfoUpdates.get(sb.type);
        if (!updates || updates.size === 0) return true;
        const items = this.secondaryBarItems.get(sb.type);
        if (!items) return bail('no registered items', sb.type);

        // The template renders a span only when its value is truthy, so a value going empty or
        // becoming non-empty adds or removes an element. That is a structural change wearing a
        // value's clothes: report it and let the caller rebuild rather than leaving an empty span
        // behind, which would still take a flex gap and shift its neighbours.
        const setText = (parent, selector, raw) => {
            const node = parent.querySelector(selector);
            if (!!raw !== !!node) return false;
            if (node) {
                const text = String(raw);
                if (node.textContent !== text) node.textContent = text;
            }
            return true;
        };

        // The partial writes an icon as `class="{{icon}} <marker>"`, so the marker class it is found
        // by has to be put back or the next pass cannot find it.
        const setIcon = (parent, markerClass, raw) => {
            const node = parent.querySelector(`.${markerClass}`);
            if (!!raw !== !!node) return false;
            if (node) {
                const wanted = `${raw} ${markerClass}`;
                if (node.className !== wanted) node.className = wanted;
            }
            return true;
        };

        for (const [itemId, update] of updates.entries()) {
            // A single push patches only what it pushed. Sweeping every readout per call meant one
            // `refreshReadoutItems` — twenty-five pushes — did twenty-five full passes over the
            // same twenty-five items for one logical refresh.
            if (onlyItemId != null && itemId !== onlyItemId) continue;
            const item = items.get(itemId);
            if (!item) continue;
            let selector;
            try {
                selector = `.secondary-bar-item[data-item-id="${CSS.escape(itemId)}"]`;
            } catch {
                return bail('CSS.escape unavailable', itemId);
            }
            const el = root.querySelector(selector);
            // Absent means not rendered, which means a `visible` predicate excluded it. The
            // structure signature owns that case and matched, so there is nothing to patch here.
            if (!el) continue;

            if (update.tooltip !== undefined) {
                // A cleared tooltip sends the partial back to its per-kind fallback, which this
                // cannot restate without duplicating the template's else branches. Rebuild instead.
                if (update.tooltip === null) return bail('tooltip cleared', itemId);
                // `data-tooltip` ONLY, never `title` as well. Foundry renders `data-tooltip`
                // itself; `title` is the browser's native tooltip, and an element carrying both
                // shows two — Foundry's styled one and the OS one drifting in underneath it a
                // second later. The patch must match the template here, or a value update would
                // reintroduce the pair the template no longer writes.
                const tooltip = String(update.tooltip);
                if (el.getAttribute('data-tooltip') !== tooltip) {
                    el.setAttribute('data-tooltip', tooltip);
                }
            }
            const kind = item.kind || 'button';
            if (kind === 'info' || kind === 'button') {
                // Only these two carry their colours on the item element; a bar carries them on its
                // inner bar, handled below, and an ornamented chip takes its colour from a class.
                if (update.buttonColor !== undefined) el.style.backgroundColor = update.buttonColor || '';
                if (update.borderColor !== undefined) el.style.borderColor = update.borderColor || '';
            }
            if (MenuBar.CHIP_KINDS.has(kind)) {
                // Shared across every chip kind: they carry the same text and the same portrait.
                if (kind === 'nameplate') {
                    // Both lines always exist, holding a non-breaking space when empty, so the
                    // plate keeps its height as a standing changes hands. That means presence never
                    // changes and these are plain text writes rather than presence-checked ones.
                    if (update.label !== undefined) {
                        const nameEl = el.querySelector('.secondary-bar-item-nameplate-name');
                        if (nameEl) nameEl.textContent = update.label ? String(update.label) : '\u00a0';
                    }
                    if (update.value !== undefined) {
                        const detailEl = el.querySelector('.secondary-bar-item-nameplate-detail');
                        if (detailEl) detailEl.textContent = update.value ? String(update.value) : '\u00a0';
                    }
                } else {
                    if (update.value !== undefined && !setText(el, '.secondary-bar-item-value', update.value)) return bail('value appeared or emptied', itemId);
                    if (update.label !== undefined && !setText(el, '.secondary-bar-item-label', update.label)) return bail('label appeared or emptied', itemId);
                }
                if (update.image !== undefined) {
                    // A portrait appearing is the most common readout change on the combat bar —
                    // an MVP emerging mid-fight, the biggest hit changing hands — so this is built
                    // rather than bounced to a rebuild. Declining here meant every push before the
                    // rebuild landed triggered another one, which was the noisiest path in the log.
                    // A portrait chip nests its image in a frame and shows a placeholder glyph
                    // when there is nobody to show, so the two differ in where the image lives and
                    // in what replaces it.
                    const framed = kind === 'portraitstat' || kind === 'nameplate';
                    const host = framed ? el.querySelector(`.secondary-bar-item-${kind}-frame`) : el;
                    if (!host) return bail('portrait frame missing', itemId);
                    const imgClass = framed ? `secondary-bar-item-${kind}-image` : 'secondary-bar-item-image';
                    let img = host.querySelector('.' + imgClass);
                    if (update.image) {
                        if (!img) {
                            img = document.createElement('img');
                            img.className = imgClass;
                            img.alt = '';
                            host.prepend(img);
                        }
                        if (img.getAttribute('src') !== String(update.image)) img.setAttribute('src', String(update.image));
                        if (framed) host.querySelector(`.secondary-bar-item-${kind}-empty`)?.remove();
                    } else if (img) {
                        img.remove();
                        // The frame must not collapse, or the chip changes width as a standing
                        // changes hands and its neighbours shuffle. Put the placeholder back.
                        if (framed && !host.querySelector(`.secondary-bar-item-${kind}-empty`)) {
                            const glyph = document.createElement('i');
                            const fallback = kind === 'nameplate' ? 'fa-solid fa-trophy' : 'fa-solid fa-user';
                            glyph.className = `${item.icon || fallback} secondary-bar-item-${kind}-empty`;
                            host.appendChild(glyph);
                        }
                    }
                }
                if (kind === 'info' && update.iconColor !== undefined) {
                    // Only the plain info chip takes an explicit colour. The others derive theirs
                    // from tone or rank, and an inline colour would beat that class and freeze it.
                    const colour = update.iconColor || '';
                    const icon = el.querySelector(':scope > i');
                    if (icon) icon.style.color = colour;
                    const value = el.querySelector('.secondary-bar-item-value');
                    if (value) value.style.color = colour;
                }

                // Ornaments. Each is a class or a custom property rather than markup, which is what
                // keeps them patchable without a rebuild.
                if (update.emphasis !== undefined) {
                    const emphasis = update.emphasis === 'feature' ? 'feature' : 'plain';
                    if (el.dataset.emphasis !== emphasis) {
                        el.classList.remove(`emphasis-${el.dataset.emphasis || 'plain'}`);
                        el.classList.add(`emphasis-${emphasis}`);
                        el.dataset.emphasis = emphasis;
                    }
                }
                if (kind === 'statchip' && update.tone !== undefined) {
                    const tone = update.tone || 'neutral';
                    if (el.dataset.tone !== tone) {
                        el.classList.remove('tone-' + (el.dataset.tone || 'neutral'));
                        el.classList.add('tone-' + tone);
                        el.dataset.tone = tone;
                    }
                }
                if ((kind === 'portraitstat' || kind === 'nameplate') && update.rank !== undefined) {
                    const rank = String(Number(update.rank) || 0);
                    if (el.dataset.rank !== rank) {
                        el.classList.remove('rank-' + (el.dataset.rank || '0'));
                        el.classList.add('rank-' + rank);
                        el.dataset.rank = rank;
                    }
                }
                if (kind === 'sparkchip' && (update.series !== undefined || update.seriesB !== undefined)) {
                    const plot = el.querySelector('.secondary-bar-item-sparkchip-plot');
                    if (!plot) return bail('spark plot missing', itemId);
                    const bars = MenuBar.buildSparkBars(
                        update.series !== undefined ? update.series : item.series,
                        item.sparkPoints,
                        update.seriesB !== undefined ? update.seriesB : item.seriesB
                    );
                    const groups = plot.querySelectorAll('.secondary-bar-item-sparkchip-period');
                    // A different number of periods is a different number of elements, which only
                    // the template can build.
                    if (groups.length !== bars.length) return bail('spark column count changed', itemId);
                    bars.forEach((bar, index) => {
                        const group = groups[index];
                        const primary = group.querySelector('.secondary-bar-item-sparkchip-bar.is-primary');
                        const paired = group.querySelector('.secondary-bar-item-sparkchip-bar.is-paired');
                        if (primary) {
                            primary.style.height = `${bar.height}%`;
                            primary.classList.toggle('is-latest', !!bar.isLast);
                        }
                        if (paired && bar.heightB != null) {
                            paired.style.height = `${bar.heightB}%`;
                            paired.classList.toggle('is-latest', !!bar.isLast);
                        }
                    });
                }
                if (kind === 'gaugechip' && update.percentProgress !== undefined) {
                    // One style write, same as the ring it replaced.
                    const fill = el.querySelector('.secondary-bar-item-gaugechip-fill');
                    if (!fill) return bail('gauge fill missing', itemId);
                    const pct = Math.max(0, Math.min(100, Number(update.percentProgress) || 0));
                    fill.style.width = `${pct}%`;
                }
            } else if (kind === 'progressbar' || kind === 'balancebar') {
                const prefix = `.secondary-bar-item-${kind}`;
                if (update.percentProgress !== undefined) {
                    const percent = Number(update.percentProgress) || 0;
                    if (kind === 'progressbar') {
                        const fill = el.querySelector(`${prefix}-fill`);
                        if (!fill) return bail('progress fill missing', itemId);
                        fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
                    } else {
                        const marker = el.querySelector(`${prefix}-marker`);
                        if (!marker) return bail('balance marker missing', itemId);
                        // Same mapping the preparation uses, so the two cannot drift apart.
                        marker.style.left = `${50 + (Math.max(-100, Math.min(100, percent)) / 2)}%`;
                    }
                }
                if (update.leftLabel !== undefined && !setText(el, `${prefix}-left-label`, update.leftLabel)) return bail('left label appeared or emptied', itemId);
                if (update.rightLabel !== undefined && !setText(el, `${prefix}-right-label`, update.rightLabel)) return bail('right label appeared or emptied', itemId);
                if (update.title !== undefined && !setText(el, `${prefix}-title`, update.title)) return bail('title appeared or emptied', itemId);
                // The preparation merges these three for bars, so the patch has to as well —
                // anything it merges but this skips would leave the fingerprint saying the DOM is
                // current when it is not.
                const base = prefix.slice(1);
                if (update.icon !== undefined && !setIcon(el, `${base}-icon`, update.icon)) return bail('icon appeared or cleared', itemId);
                if (update.leftIcon !== undefined && !setIcon(el, `${base}-icon-outside-left`, update.leftIcon)) return bail('left icon appeared or cleared', itemId);
                if (update.rightIcon !== undefined && !setIcon(el, `${base}-icon-outside-right`, update.rightIcon)) return bail('right icon appeared or cleared', itemId);
                if (update.borderColor !== undefined) {
                    // A bar's border is on the bar, not on the item — the partial writes it into the
                    // inner element's inline style alongside its height.
                    const bar = el.querySelector(`${prefix}-bar`);
                    if (bar) bar.style.borderColor = update.borderColor || '';
                }
                if (update.progressColor !== undefined) {
                    const fill = el.querySelector(`${prefix}-fill`);
                    if (fill) fill.style.backgroundColor = update.progressColor || '';
                }
                if (update.barColor !== undefined) {
                    const bar = el.querySelector(`${prefix}-bar`);
                    if (bar) bar.style.backgroundColor = update.barColor || '';
                }
                if (update.barColorLeft !== undefined) {
                    const left = el.querySelector(`${prefix}-left`);
                    if (left) left.style.backgroundColor = update.barColorLeft || '';
                }
                if (update.barColorRight !== undefined) {
                    const right = el.querySelector(`${prefix}-right`);
                    if (right) right.style.backgroundColor = update.barColorRight || '';
                }
                if (update.markerColor !== undefined) {
                    const marker = el.querySelector(`${prefix}-marker`);
                    if (marker) marker.style.backgroundColor = update.markerColor || '';
                }
                if (update.markers !== undefined) {
                    const extra = el.querySelectorAll(`${prefix}-marker-extra`);
                    const wanted = Array.isArray(update.markers) ? update.markers : [];
                    // A different number of needles is a different number of elements, which only
                    // the template can build.
                    if (extra.length !== wanted.length) return bail('balance marker count changed', itemId);
                    wanted.forEach((marker, index) => {
                        const node = extra[index];
                        const value = Math.max(-100, Math.min(100, Number(marker?.percent) || 0));
                        node.style.left = `${50 + (value / 2)}%`;
                        if (marker?.color) node.style.backgroundColor = marker.color;
                        if (marker?.tooltip !== undefined) {
                            node.setAttribute('data-tooltip', String(marker.tooltip));
                        }
                    });
                }
            } else {
                // A button's live keys are its colours and tooltip, all handled above. Anything
                // else about a button is structure.
                continue;
            }
        }

        return true;
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
            if (iconEl && mov.icon) iconEl.className = `fa-solid ${mov.icon} movement-icon`;
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
            let currentMovementData = { icon: 'fa-person-walking', name: 'Wander' };
            
            try {
                // Only try to get the setting if it's registered
                if (game.settings.settings.get(`${MODULE.ID}.movementType`)) {
                    currentMovement = game.settings.get(MODULE.ID, 'movementType') || 'normal-movement';
                    
                    const movementTypes = {
                        'normal-movement': { icon: 'fa-person-walking', name: 'Wander' },
                        'no-movement': { icon: 'fa-person-circle-xmark', name: 'Locked' },
                        'combat-movement': { icon: 'fa-person-harassing', name: 'Combat' },
                        'follow-movement': { icon: 'fa-person-running', name: 'Fastest Path' },
                        'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' },
                        'request-movement': { icon: 'fa-person-circle-question', name: 'Request' }
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
                // Handlebars can't act on stored callbacks — surface them as booleans for the partial.
                // Display order (the strip is right-aligned, so index 0 is leftmost): temporary
                // notifications sit left of persistent ones, newest first within each group.
                notifications: Array.from(this.notifications.values())
                    .sort((a, b) => {
                        const aPersistent = a.duration > 0 ? 0 : 1;
                        const bPersistent = b.duration > 0 ? 0 : 1;
                        if (aPersistent !== bPersistent) return aPersistent - bPersistent;
                        return b.createdAt - a.createdAt;
                    })
                    .map(n => ({
                        id: n.id,
                        text: n.text,
                        icon: n.icon,
                        actionable: typeof n.onClick === 'function',
                        pulse: !!n.pulse
                    })),
                secondaryBar: secondaryBarData,
                isInterfaceHidden: (() => { try { return CoreUIUtility.isInterfaceHidden(); } catch (_) { return false; } })()
            };

            const structureFp = this._computeMenubarStructureFingerprint(templateData);
            const existingPrimary = document.querySelector('.blacksmith-menubar-container');
            if (existingPrimary && structureFp === this._menubarStructureFingerprint) {
                // Always re-applied rather than guarded by a "have the values changed" fingerprint.
                // The patch is idempotent and each write is equality-guarded, so re-applying costs
                // a handful of DOM reads — far less than the class of bug a second fingerprint
                // invites, where it says the DOM is current and the DOM disagrees.
                //
                // False means the change needs an element added or removed, which only the template
                // can do: fall through to the rebuild below.
                if (this._applySecondaryBarValueRefresh()) {
                    this._applyMenubarLightweightRefresh(templateData, existingPrimary);
                    return;
                }
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
            // Check if this is a notification close button click. This branch MUST stay
            // ahead of the body-click branch so the × dismisses without firing onClick.
            const closeButton = event.target.closest('.notification-close');
            if (closeButton) {
                const notificationId = closeButton.getAttribute('data-notification-id');
                if (notificationId) {
                    this._dismissNotification(notificationId);
                    return;
                }
            }

            // Check if this is an actionable notification body click
            const notificationItem = event.target.closest('.menu-notification-item[data-notification-id]');
            if (notificationItem) {
                const notificationId = notificationItem.getAttribute('data-notification-id');
                const notification = this.notifications.get(notificationId);
                if (notification && typeof notification.onClick === 'function') {
                    event.preventDefault();
                    event.stopPropagation();
                    playMenubarButtonSound();
                    try {
                        notification.onClick(event);
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, `Error executing notification onClick for ${notificationId}:`, error, false, false);
                    }
                    // Acted on — remove silently, onDismiss does not fire
                    this.removeNotification(notificationId);
                }
                return;
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

            // Find the tool. Dispatch on toolId — it is the registry key and the only field enforced
            // unique. `name` is a CSS class / label and is NOT unique, so matching on it let two modules
            // registering the same name cross-fire: the forEach kept the LAST match, so one module's
            // button silently invoked another module's onClick. Falls back to the name scan for any
            // element rendered without data-tool-id.
            let toolId = toolElement.getAttribute('data-tool-id') || null;
            let tool = toolId ? (this.toolbarIcons.get(toolId) || null) : null;

            if (!tool) {
                toolId = null;
                this.toolbarIcons.forEach((registeredTool, id) => {
                    if (registeredTool.name === toolName) {
                        tool = registeredTool;
                        toolId = id;
                    }
                });
            }

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

            // Execute the tool's onClick function. The tool id is published for the
            // duration of the call so that a bar opened from here can learn which tool
            // owns it — see openSecondaryBar. Cleared in `finally`, since a handler that
            // throws would otherwise leave a stale id to be misattributed to the next
            // bar opened from anywhere.
            if (typeof tool.onClick === 'function') {
                try {
                    this._toolBeingClicked = toolId;
                    tool.onClick(event);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Error executing tool ${toolId}:`, error, false, false);
                } finally {
                    this._toolBeingClicked = null;
                }
            }
        };

        // Store the handler reference and container for cleanup
        this._clickHandler = clickHandler;
        this._clickHandlerContainer = menubarContainer;
        this._clickHandlerSecondaryContainer = null;

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
        this._contextMenuHandlerSecondaryContainer = null;
        menubarContainer.addEventListener('contextmenu', contextMenuHandler);
        
        // Also attach click and contextmenu to secondary bar when it exists
        const secondaryBar = document.querySelector('.blacksmith-menubar-secondary');
        if (secondaryBar) {
            secondaryBar.addEventListener('click', clickHandler);
            secondaryBar.addEventListener('contextmenu', contextMenuHandler);
            this._clickHandlerSecondaryContainer = secondaryBar;
            this._contextMenuHandlerSecondaryContainer = secondaryBar;
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
            this._clickHandlerContainer = null;
        }
        if (this._clickHandler && this._clickHandlerSecondaryContainer) {
            this._clickHandlerSecondaryContainer.removeEventListener('click', this._clickHandler);
            this._clickHandlerSecondaryContainer = null;
        }
        if (this._contextMenuHandler && this._contextMenuHandlerContainer) {
            this._contextMenuHandlerContainer.removeEventListener('contextmenu', this._contextMenuHandler);
            this._contextMenuHandlerContainer = null;
        }
        if (this._contextMenuHandler && this._contextMenuHandlerSecondaryContainer) {
            this._contextMenuHandlerSecondaryContainer.removeEventListener('contextmenu', this._contextMenuHandler);
            this._contextMenuHandlerSecondaryContainer = null;
        }
        this._clickHandler = null;
        this._contextMenuHandler = null;
        this._closeMenubarContextMenu();
    }

    /**
     * Close the menubar context menu if open (and remove listeners).
     * @private
     */
    static _closeMenubarContextMenu() {
        UIContextMenu.close('blacksmith-menubar-context-menu');
        UIContextMenu.close('blacksmith-menubar-leader-menu');
        UIContextMenu.close('blacksmith-menubar-movement-menu');
        UIContextMenu.close('blacksmith-menubar-timer-menu');
        UIContextMenu.close('blacksmith-menubar-quick-toast-menu');
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
    /**
     * Map menubar context menu item to UIContextMenu shape (recursive for nested submenus).
     * @param {{ separator?: boolean, name?: string, icon?: string, description?: string, disabled?: boolean, onClick?: Function, submenu?: Array }} item
     * @returns {object}
     * @private
     */
    static _mapMenubarContextMenuItem(item) {
        const hasSub = Array.isArray(item.submenu) && item.submenu.length > 0;
        return {
            separator: !!item.separator,
            name: item.name,
            icon: item.icon,
            description: item.description,
            disabled: !!item.disabled,
            submenu: hasSub ? item.submenu.map((sub) => MenuBar._mapMenubarContextMenuItem(sub)) : null,
            callback: hasSub
                ? undefined
                : async () => {
                    if (typeof item.onClick === 'function') {
                        try {
                            await item.onClick();
                        } catch (err) {
                            postConsoleAndNotification(MODULE.NAME, 'Menubar context menu item error', err?.message || err, false, true);
                        }
                    }
                }
        };
    }

    static _showMenubarContextMenu(items, x, y) {
        this._closeMenubarContextMenu();

        const mapped = (items || []).map((item) => MenuBar._mapMenubarContextMenuItem(item));

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
     * Build focused context menu items for the pins menubar button.
     * @returns {Array<{name: string, icon: string, description?: string, disabled?: boolean, onClick?: Function, submenu?: Array}>}
     * @private
     */
    static _getPinsContextMenuItems() {
        const sceneId = canvas?.scene?.id ?? null;
        const customProfiles = PinManager.listVisibilityProfiles().map((profile) => ({
            name: profile.name,
            icon: PinManager.getActiveFilterProfileName() === profile.name ? "fa-solid fa-check" : "fa-solid fa-bookmark",
            description: "Load this saved pin visibility profile",
            onClick: async () => {
                await PinManager.applyVisibilityProfile(profile.name, { sceneId });
                ui.notifications?.info(`Loaded pin profile: ${profile.name}`);
                MenuBar.renderMenubar(true);
            }
        }));

        return [
            {
                name: "Manage Pins",
                icon: "fa-solid fa-layer-group",
                description: "Open the Manage Pins window",
                onClick: async () => {
                    const api = game.modules.get(MODULE.ID)?.api;
                    await api?.pins?.openLayers?.({ sceneId });
                }
            },
            {
                name: "Hide All Pins",
                icon: "fa-solid fa-eye-slash",
                description: "Hide all pins using the pin layer profile system",
                onClick: async () => {
                    await PinManager.applySystemVisibilityProfile(PinManager.SYSTEM_PROFILE_NONE, { sceneId });
                    ui.notifications?.info("Loaded pin profile: No Pins");
                    MenuBar.renderMenubar(true);
                }
            },
            {
                name: "Show All Pins",
                icon: "fa-solid fa-eye",
                description: "Show all pins by clearing pin layer filters",
                onClick: async () => {
                    await PinManager.applySystemVisibilityProfile(PinManager.SYSTEM_PROFILE_ALL, { sceneId });
                    ui.notifications?.info("Loaded pin profile: All Pins");
                    MenuBar.renderMenubar(true);
                }
            },
            {
                name: "Load Profile",
                icon: "fa-solid fa-bookmark",
                description: customProfiles.length ? "Load a saved custom profile" : "No custom profiles saved",
                disabled: customProfiles.length === 0,
                submenu: customProfiles.length ? customProfiles : [{ name: "No custom profiles", icon: "fa-solid fa-ban", disabled: true }]
            }
        ];
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
    /**
     * Local toast for combat creation feedback. One stack key so a run of
     * Create/Add presses replaces rather than piles up.
     * @private
     */
    static _combatToast(title, subtitle, icon) {
        ToastAPI.show({
            title,
            subtitle,
            icon,
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-create-combat'
        });
    }

    static async createCombat() {
        try {
            // Check if user has permission to create combat
            if (!game.user.isGM) {
                this._combatToast('Create Combat', 'Only GMs can create combat encounters.', 'fa-solid fa-triangle-exclamation');
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
                this._combatToast('Create Combat', 'No tokens with actors found on the canvas.', 'fa-solid fa-triangle-exclamation');
                return;
            }

            // Check if there's already an active combat encounter
            let combat = game.combats.active;
            const createdNew = !combat;

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

            // The wording has to follow which branch ran above: this same call
            // both creates an encounter and folds tokens into a running one,
            // and reporting "created" for an add is how the combat bar's
            // "Add to Combat" row would end up contradicting itself.
            if (addedCount > 0) {
                this._combatToast(
                    createdNew ? 'Combat Created' : 'Added to Combat',
                    `${addedCount} token(s) ${createdNew ? 'in the new encounter' : 'added'}.`,
                    'fa-solid fa-swords'
                );
            } else {
                this._combatToast('Add to Combat', 'Every selected token is already in combat.', 'fa-solid fa-swords');
            }

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error creating combat:", error, false, false);
            this._combatToast('Combat', 'Could not create the encounter. See the console.', 'fa-solid fa-circle-exclamation');
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
        this._closeMenubarContextMenu();

        const characterEntries = this._getLeaderEntries();
        const leaderData = getSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
        const currentActorId = leaderData?.actorId || '';

        const items = [
            {
                name: 'Vote for Leader',
                description: 'Vote for a party leader from among the active players.',
                icon: 'fa-solid fa-check-to-slot',
                callback: async () => {
                    try {
                        const { VoteManager } = await import('./manager-vote.js');
                        await VoteManager.startVote('leader');
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Menubar: Error starting leader vote:', error, false, false);
                        ui.notifications.error('Error starting leader vote. Check the console for details.');
                    }
                }
            },
            { separator: true },
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
                icon: isCurrent ? 'fa-solid fa-crown' : 'fa-solid fa-user',
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
        this._closeMenubarContextMenu();
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
            description: 'Controls the space between tokens in Conga and Fastest Path modes.',
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

    /**
     * Quick Toast menu — saved Send Toast templates that carry text, fired
     * as-is on click. Falls back to opening the full Send Toast window when
     * there are no click coordinates (e.g. the overflow path).
     */
    static async showQuickToastMenu(event) {
        try {
            const { ToastSendWindow, getQuickToastTemplates, quickSendToastTemplate } = await import('./window-toast-send.js');
            if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
                new ToastSendWindow().render(true);
                return;
            }
            this._closeMenubarContextMenu();

            const targetLabel = { stream: ' (stream)', both: ' (game + stream)' };
            const items = getQuickToastTemplates().map(({ name, tpl }) => ({
                name: `${name}${targetLabel[tpl.publish] ?? ''}`,
                description: tpl.subtitle ? `${tpl.title} — ${tpl.subtitle}` : tpl.title,
                icon: tpl.image ? 'fa-solid fa-image' : (tpl.icon || 'fa-solid fa-bullhorn'),
                callback: () => {
                    void quickSendToastTemplate(name);
                }
            }));
            if (!items.length) {
                items.push({
                    name: 'No quick toasts yet',
                    description: 'Save a template with a title in Send Toast to list it here.',
                    icon: 'fa-solid fa-circle-info',
                    disabled: true
                });
            }
            items.push({ separator: true });
            items.push({
                name: 'Open Send Toast',
                description: 'Compose a toast and manage templates',
                icon: 'fa-solid fa-bullhorn',
                callback: () => {
                    new ToastSendWindow().render(true);
                }
            });

            UIContextMenu.show({
                id: 'blacksmith-menubar-quick-toast-menu',
                x: event.clientX,
                y: event.clientY,
                zones: items,
                zoneClass: 'core'
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Party Tools: Error opening Quick Toast menu', error.message, false, false);
        }
    }

    static async showLeaderDialog() {
        const characterEntries = this._getLeaderEntries();
        const leaderData = getSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
        const currentActorId = leaderData?.actorId || '';
        const NO_LEADER = '__blacksmith_no_leader__';
        const INPUT_NAME = 'blacksmith-leader';

        // Entity ids carry the same actorId|ownerId pairing the old <select>
        // used, so setNewLeader's contract is unchanged.
        const list = EntityListAPI.create({
            entities: [
                {
                    id: NO_LEADER,
                    name: 'No leader',
                    img: 'icons/svg/cancel.svg',
                    type: 'Clear the current party leader'
                },
                ...characterEntries.map(entry => ({
                    id: `${entry.actor.id}|${entry.owner.id}`,
                    uuid: entry.actor.uuid,
                    name: entry.actor.name,
                    img: entry.actor.img,
                    type: entry.labelUser?.name ?? null
                }))
            ],
            mode: EntityListAPI.MODES.SINGLE,
            inputName: INPUT_NAME,
            // Preselect by actorId from the setting rather than by matching the
            // leader's display name, which duplicate actor names would break.
            selected: characterEntries.some(entry => entry.actor.id === currentActorId)
                ? `${currentActorId}|${characterEntries.find(entry => entry.actor.id === currentActorId).owner.id}`
                : NO_LEADER,
            emptyMessage: 'No player-owned characters to choose from.'
        });

        const outcome = await DialogAPI.prompt({
            title: 'Set Party Leader',
            content: `
                <div class="blacksmith-field">
                    <span class="blacksmith-field-label">Party leader</span>
                    ${list.html}
                </div>`,
            submitLabel: 'Set Leader',
            position: { width: 400 },
            getValue: (root) => root?.querySelector(`input[name="${INPUT_NAME}"]:checked`)?.value ?? '',
            onRender: (root) => list.attach(root),
            cancelValue: '',
            closeValue: ''
        });

        list.destroy();
        if (outcome.action !== DialogAPI.ACTIONS.SUBMIT || !outcome.value) return;

        if (outcome.value === NO_LEADER) {
            await setSettingSafely(MODULE.ID, 'partyLeader', { userId: '', actorId: '' });
            this.currentLeader = null;
            await this.updateLeader(null);
            return;
        }
        const [actorId, userId] = outcome.value.split('|');
        await MenuBar.setNewLeader({ userId, actorId }, true);
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
            const endTime = getSettingSafely(MODULE.ID, 'sessionEndTime', 0);
            const startTime = getSettingSafely(MODULE.ID, 'sessionStartTime', 0);
            const timerDate = getSettingSafely(MODULE.ID, 'sessionTimerDate', '');
            const today = new Date().toDateString();

            if (timerDate === today && endTime > Date.now()) {
                this.sessionEndTime = endTime;
                this.sessionStartTime = startTime;
                return;
            }

            this.sessionEndTime = null;
            this.sessionStartTime = null;

            if (!game.user.isGM) return;

            await this._applyConfiguredDefaultTimer();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error loading timer:", error, false, false);
            this.sessionEndTime = null;
            this.sessionStartTime = null;
        }
    }

    /**
     * Apply world Default Time settings when no valid timer exists for today.
     * @private
     */
    static async _applyConfiguredDefaultTimer() {
        const mode = getSettingSafely(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.DURATION);
        if (mode === SESSION_TIMER_DEFAULT_MODES.NONE) return;

        if (mode === SESSION_TIMER_DEFAULT_MODES.DURATION) {
            const defaultMinutes = getSettingSafely(MODULE.ID, 'sessionTimerDefault', 60);
            if (!defaultMinutes || defaultMinutes <= 0) return;
            const hours = Math.floor(defaultMinutes / 60);
            const mins = defaultMinutes % 60;
            await this._applyTimerDuration(hours, mins, false, false);
            return;
        }

        if (mode === SESSION_TIMER_DEFAULT_MODES.SPECIFIC_TIME) {
            const endTimeValue = getSettingSafely(MODULE.ID, 'sessionTimerSpecificTime', '20:00');
            await this._applyTimerEndTime(endTimeValue, false, false);
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
        if (this._timerStartTimeout != null) {
            clearTimeout(this._timerStartTimeout);
            this._timerStartTimeout = null;
        }
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

    static async _applyTimerDuration(hours, minutes, setAsDefault = false, sendMessage = true) {
        const duration = (hours * 60 + minutes) * 60 * 1000;
        this.sessionStartTime = Date.now();
        this.sessionEndTime = this.sessionStartTime + duration;

        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());

        if (setAsDefault) {
            await game.settings.set(MODULE.ID, 'sessionTimerDefault', hours * 60 + minutes);
            await game.settings.set(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.DURATION);
        }
        await game.settings.set(MODULE.ID, 'sessionTimerLastUsed', {
            mode: 'duration',
            minutes: hours * 60 + minutes,
            endTime: ''
        });

        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, sendMessage);
        this.updateTimerDisplay();
    }

    static async _applyTimerEndTime(endTimeValue, setAsDefault = false, sendMessage = true) {
        const endTs = endTimestampFromTimeValue(endTimeValue);
        if (!endTs) return;

        const parsed = parseSessionEndTimeValue(endTimeValue);
        const normalizedValue = parsed
            ? `${parsed.hour24.toString().padStart(2, '0')}:${parsed.minute.toString().padStart(2, '0')}`
            : endTimeValue;

        this.sessionStartTime = Date.now();
        this.sessionEndTime = endTs;

        await game.settings.set(MODULE.ID, 'sessionEndTime', this.sessionEndTime);
        await game.settings.set(MODULE.ID, 'sessionStartTime', this.sessionStartTime);
        await game.settings.set(MODULE.ID, 'sessionTimerDate', new Date().toDateString());
        await game.settings.set(MODULE.ID, 'sessionTimerLastUsed', {
            mode: 'end',
            minutes: 0,
            endTime: normalizedValue
        });

        if (setAsDefault) {
            await game.settings.set(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.SPECIFIC_TIME);
            await game.settings.set(MODULE.ID, 'sessionTimerSpecificTime', normalizedValue);
        }

        await this.updateTimer(this.sessionEndTime, this.sessionStartTime, sendMessage);
        this.updateTimerDisplay();
    }

    static _getSessionDefaultTimeDescription() {
        const mode = getSettingSafely(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.DURATION);
        if (mode === SESSION_TIMER_DEFAULT_MODES.NONE) {
            return 'None';
        }
        if (mode === SESSION_TIMER_DEFAULT_MODES.SPECIFIC_TIME) {
            const endTimeValue = getSettingSafely(MODULE.ID, 'sessionTimerSpecificTime', '20:00');
            return formatSessionEndTimeValue(endTimeValue);
        }
        const defaultMinutes = getSettingSafely(MODULE.ID, 'sessionTimerDefault', 60) || 0;
        const defaultHours = Math.floor(defaultMinutes / 60);
        const defaultMins = defaultMinutes % 60;
        return `${defaultHours}h ${defaultMins.toString().padStart(2, '0')}m`;
    }

    static async _applySessionDefaultTimeFromSettings() {
        const mode = getSettingSafely(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.DURATION);
        if (mode === SESSION_TIMER_DEFAULT_MODES.NONE) return;

        if (mode === SESSION_TIMER_DEFAULT_MODES.DURATION) {
            const defaultMinutes = getSettingSafely(MODULE.ID, 'sessionTimerDefault', 60) || 0;
            const defaultHours = Math.floor(defaultMinutes / 60);
            const defaultMins = defaultMinutes % 60;
            await this._applyTimerDuration(defaultHours, defaultMins, false);
            return;
        }

        if (mode === SESSION_TIMER_DEFAULT_MODES.SPECIFIC_TIME) {
            const endTimeValue = getSettingSafely(MODULE.ID, 'sessionTimerSpecificTime', '20:00');
            await this._applyTimerEndTime(endTimeValue, false);
        }
    }

    static async showTimerMenu(event) {
        this._closeMenubarContextMenu();
        const defaultMode = getSettingSafely(MODULE.ID, 'sessionTimerDefaultMode', SESSION_TIMER_DEFAULT_MODES.DURATION);
        const defaultLabel = this._getSessionDefaultTimeDescription();

        const lastUsed = getSettingSafely(MODULE.ID, 'sessionTimerLastUsed', { mode: '', minutes: 0, endTime: '' });
        const hasLastUsed = !!(lastUsed?.mode === 'duration' && lastUsed?.minutes) || !!(lastUsed?.mode === 'end' && lastUsed?.endTime);
        let lastUsedLabel = 'Not set';
        if (lastUsed?.mode === 'duration') {
            const lh = Math.floor((lastUsed.minutes || 0) / 60);
            const lm = (lastUsed.minutes || 0) % 60;
            lastUsedLabel = `${lh}h ${lm.toString().padStart(2, '0')}m`;
        } else if (lastUsed?.mode === 'end' && lastUsed.endTime) {
            lastUsedLabel = formatSessionEndTimeValue(lastUsed.endTime);
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
            ...getSessionEndTimeOptions().map(({ value, label }) => ({
                name: label,
                icon: 'fa-solid fa-clock',
                callback: async () => this._applyTimerEndTime(value, false)
            }))
        ];

        const items = [
            {
                name: 'Default Time',
                description: defaultLabel,
                icon: 'fa-solid fa-clock-rotate-left',
                disabled: defaultMode === SESSION_TIMER_DEFAULT_MODES.NONE,
                callback: async () => {
                    await this._applySessionDefaultTimeFromSettings();
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
                        await this._applyTimerEndTime(lastUsed.endTime, false);
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
                description: 'End time in half-hour increments (AM/PM).',
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

        const DialogV2 = foundry.applications.api.DialogV2;
        const content = `
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
        `;

        let durationDlg;
        durationDlg = new DialogV2({
            window: { title: 'Set Session Duration' },
            position: { width: 440 },
            content,
            buttons: [
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fa-solid fa-xmark',
                    callback: () => {
                        void durationDlg.close();
                    }
                },
                {
                    action: 'set',
                    label: 'Set Timer',
                    icon: 'fa-solid fa-check',
                    default: true,
                    callback: async (event, button, dialog) => {
                        const root = dialog.form;
                        const hoursSelect = root?.querySelector('#hours-select');
                        const minutesSelect = root?.querySelector('#minutes-select');
                        const presetSelect = root?.querySelector('#duration-preset');
                        const presetValue = presetSelect?.value ?? 'custom';
                        const setDefaultCheckbox = root?.querySelector('#set-default-duration');
                        const setAsDefault = setDefaultCheckbox?.checked ?? false;

                        let hours = parseInt(hoursSelect?.value ?? '0', 10);
                        let minutes = parseInt(minutesSelect?.value ?? '0', 10);
                        if (presetValue !== 'custom') {
                            const total = parseInt(presetValue, 10);
                            hours = Math.floor(total / 60);
                            minutes = total % 60;
                        }
                        await this._applyTimerDuration(hours, minutes, setAsDefault);
                        void dialog.close();
                    }
                }
            ]
        });
        await durationDlg.render({ force: true });
    }

    static async showTimerEndTimeDialog() {
        const now = new Date();
        const hours24 = now.getHours();
        const hour12Default = ((hours24 + 11) % 12) + 1;
        const ampmDefault = hours24 >= 12 ? 'PM' : 'AM';
        const minuteDefault = now.getMinutes() >= 30 ? 30 : 0;

        const timeOptions = [
            { value: 'custom', label: 'Custom' },
            ...getSessionEndTimeOptions().map(({ value, label }) => ({ value, label }))
        ];

        const DialogV2 = foundry.applications.api.DialogV2;
        const content = `
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
                        <select name="end-minute" id="end-minute">
                            ${[0, 30].map((m) =>
                                `<option value="${m}" ${m === minuteDefault ? 'selected' : ''}>${m.toString().padStart(2, '0')}</option>`
                            ).join('')}
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
        `;

        let endDlg;
        endDlg = new DialogV2({
            window: { title: 'Set End Time' },
            position: { width: 440 },
            content,
            buttons: [
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fa-solid fa-xmark',
                    callback: () => {
                        void endDlg.close();
                    }
                },
                {
                    action: 'set',
                    label: 'Set Timer',
                    icon: 'fa-solid fa-check',
                    default: true,
                    callback: async (event, button, dialog) => {
                        const root = dialog.form;
                        const presetSelect = root?.querySelector('#end-time-preset');
                        const presetValue = presetSelect?.value ?? 'custom';
                        const hourSelect = root?.querySelector('#end-hour');
                        const minuteSelect = root?.querySelector('#end-minute');
                        const ampmSelect = root?.querySelector('#end-ampm');
                        const setDefaultCheckbox = root?.querySelector('#set-default-endtime');
                        const setAsDefault = setDefaultCheckbox?.checked ?? false;
                        let endTimeValue = '';
                        if (presetValue !== 'custom') {
                            endTimeValue = presetValue;
                        } else {
                            const h12 = parseInt(hourSelect?.value ?? '12', 10);
                            const ampm = ampmSelect?.value ?? 'AM';
                            const minute = parseInt(minuteSelect?.value ?? '0', 10);
                            let hour24 = h12 % 12;
                            if (ampm === 'PM') hour24 += 12;
                            endTimeValue = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        }

                        await this._applyTimerEndTime(endTimeValue, setAsDefault);
                        void dialog.close();
                    }
                }
            ]
        });
        await endDlg.render({ force: true });
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

        const DialogV2 = foundry.applications.api.DialogV2;
        const content = `
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
        `;

        let sessionDlg;
        sessionDlg = new DialogV2({
            window: { title: 'Set Session Time' },
            position: { width: 440 },
            content,
            buttons: [
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fa-solid fa-xmark',
                    callback: () => {
                        void sessionDlg.close();
                    }
                },
                {
                    action: 'set',
                    label: 'Set Timer',
                    icon: 'fa-solid fa-check',
                    default: true,
                    callback: async (event, button, dialog) => {
                        const root = dialog.form;
                        const hoursSelect = root?.querySelector('#hours-select');
                        const minutesSelect = root?.querySelector('#minutes-select');
                        const setDefaultCheckbox = root?.querySelector('#set-default');
                        const hours = parseInt(hoursSelect?.value ?? '0', 10);
                        const minutes = parseInt(minutesSelect?.value ?? '0', 10);
                        const setAsDefault = setDefaultCheckbox?.checked ?? false;
                        await this._applyTimerDuration(hours, minutes, setAsDefault);
                        void dialog.close();
                    }
                }
            ]
        });
        await sessionDlg.render({ force: true });
    }

    // Helper method for sending chat messages
    static async sendTimerMessage(data) {
        // Route per the notifySessionTimer channel (Notifications section) — the
        // toast half broadcasts to every client; false = no chat card either
        if (!routeTimerNotification('notifySessionTimer', 'Session', 'blacksmith-timer-session', data)) return;

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

            // Send the leader messages only if requested AND we are the GM.
            // Chat cards are gated by the notifyLeaderChange channel setting
            // (toast | chat | both | none) — the toast half fires receipt-side on every
            // client from the partyLeader updateSetting hook. The sound plays for any
            // mode except 'none'.
            if (sendMessages && game.user.isGM) {
                const notifyMode = getSettingSafely(MODULE.ID, 'notifyLeaderChange', 'toast');

                // Play notification sound
                if (notifyMode !== 'none') {
                    playSound(window.COFFEEPUB?.SOUNDNOTIFICATION09, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                }

                if (notifyMode === 'chat' || notifyMode === 'both') {
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
            'normal-movement': { icon: 'fa-person-walking', name: 'Wander' },
            'no-movement': { icon: 'fa-person-circle-xmark', name: 'Locked' },
            'combat-movement': { icon: 'fa-person-harassing', name: 'Combat' },
            'follow-movement': { icon: 'fa-person-running', name: 'Fastest Path' },
            'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' },
            'request-movement': { icon: 'fa-person-circle-question', name: 'Request' }
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
