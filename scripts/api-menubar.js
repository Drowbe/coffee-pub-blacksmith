// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, getSettingSafely, setSettingSafely } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { VoteConfig } from './vote-config.js';
import { ModuleManager } from './manager-modules.js';
import { SkillCheckDialog } from './window-skillcheck.js';
import { CombatTracker } from './combat-tracker.js';
import { MovementConfig } from './token-movement.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';

class MenuBar {
    static ID = 'menubar';
    static currentLeader = null;
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
        data: {},
        userClosed: false // Track if user manually closed the combat bar
    };
    static secondaryBarTypes = new Map();
    static renderTimeout = null;

    static async initialize() {
        // Load the templates
        loadTemplates([
            'modules/coffee-pub-blacksmith/templates/menubar.hbs',
            'modules/coffee-pub-blacksmith/templates/cards-common.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-window.hbs',
            'modules/coffee-pub-blacksmith/templates/vote-card.hbs'
        ]);
        
        // Register Handlebars partials
        await this._registerPartials();

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

            // Register default tools using our API
            this.registerDefaultTools();

            // Register secondary bar types
            this.registerSecondaryBarTypes();

            // Render the menubar
            this.renderMenubar();
            
            // Check for active combat on load
            this._checkActiveCombatOnLoad();
        });

        // Register for module features
        this._registerModuleFeatures();
        
        // Register setting change hook to refresh menubar when party leader changes
        this._registerLeaderChangeHook();
        
        // Register combat hooks
        this._registerCombatHooks();
        
        // Register combat bar event handlers
        this._registerCombatBarEvents();
    }

    static async _registerPartials() {
        try {
            // Load and register the combat bar partial
            const combatBarTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs').then(response => response.text());
            Handlebars.registerPartial('menubar-combat', combatBarTemplate);
            
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
            description: 'MenuBar: Refresh menubar when party leader or combat size changes',
            context: 'menubar-settings-change',
            priority: 3,
            callback: (module, key, value) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (module === MODULE.ID && key === 'menubarCombatSize') {
                    postConsoleAndNotification(MODULE.NAME, "Menubar Combat Size | Setting change hook fired", {
                        module: module,
                        key: key,
                        value: value,
                        currentUserId: game.user.id,
                        isGM: game.user.isGM
                    }, true, false);
                    
                    // Update the CSS variable for combat menubar height
                    document.documentElement.style.setProperty('--blacksmith-menubar-secondary-combat-height', `${value}px`);
                    
                    // Refresh the menubar to apply the new height
                    if (game.combat) {
                        MenuBar.updateCombatBar();
                    }
                }
                else if (module === MODULE.ID && key === 'partyLeader') {
                    
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
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, "MenuBar: Leader change hook registered", "", true, false);
    }

    static _registerCombatHooks() {
        // Hook for combat updates (turn changes, etc.)
        const combatUpdateHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'MenuBar: Update combat bar on combat changes',
            context: 'menubar-combat-update',
            priority: 3,
            callback: (combat, updateData) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Update on turn/round changes OR when combatants are updated
                const shouldUpdate = updateData.turn !== undefined || 
                                   updateData.round !== undefined ||
                                   updateData.combatants !== undefined;
                
                if (shouldUpdate) {
                    
                    MenuBar.updateCombatBar();
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combat creation
        const combatCreateHookId = HookManager.registerHook({
            name: 'createCombat',
            description: 'MenuBar: Open combat bar when combat is created',
            context: 'menubar-combat-create',
            priority: 3,
            callback: (combat) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                
                // Auto-open combat bar when combat is created (if setting enabled)
                const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                if (shouldShowCombatBar) {
                    MenuBar.openCombatBar();
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combatant creation (when combatants are added to combat)
        const combatantCreateHookId = HookManager.registerHook({
            name: 'createCombatant',
            description: 'MenuBar: Open combat bar when combatants are added',
            context: 'menubar-combatant-create',
            priority: 3,
            callback: (combatant, options, userId) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                
                // Auto-open combat bar when first combatant is added (if setting enabled)
                if (combatant.combat.combatants.size === 1) {
                    const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                    if (shouldShowCombatBar) {
                        MenuBar.openCombatBar();
                    }
                } else if (MenuBar.secondaryBar.isOpen && MenuBar.secondaryBar.type === 'combat') {
                    // Update existing combat bar
                    MenuBar.updateCombatBar();
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combatant updates (initiative rolls, status changes, etc.)
        const combatantUpdateHookId = HookManager.registerHook({
            name: 'updateCombatant',
            description: 'MenuBar: Update combat bar when combatants are updated',
            context: 'menubar-combatant-update',
            priority: 3,
            callback: (combatant, updateData, options, userId) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Check if initiative was updated
                const initiativeUpdated = updateData.initiative !== undefined;
                
                
                // Update combat bar when combatant data changes (especially initiative)
                if (MenuBar.secondaryBar.isOpen && MenuBar.secondaryBar.type === 'combat') {
                    MenuBar.updateCombatBar();
                    
                    // If initiative was updated, also update the menubar to refresh button states
                    if (initiativeUpdated) {
                        MenuBar.renderMenubar();
                    }
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combatant deletion
        const combatantDeleteHookId = HookManager.registerHook({
            name: 'deleteCombatant',
            description: 'MenuBar: Update combat bar when combatants are removed',
            context: 'menubar-combatant-delete',
            priority: 3,
            callback: (combatant, options, userId) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                
                // Update combat bar when combatant is removed
                if (MenuBar.secondaryBar.isOpen && MenuBar.secondaryBar.type === 'combat') {
                    MenuBar.updateCombatBar();
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combat deletion
        const combatDeleteHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'MenuBar: Close combat bar when combat is deleted',
            context: 'menubar-combat-delete',
            priority: 3,
            callback: (combat) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                
                // Close combat bar when combat is deleted
                MenuBar.closeCombatBar();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combat tracker window rendering to update menubar button state
        const combatTrackerRenderHookId = HookManager.registerHook({
            name: 'renderApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window opens',
            context: 'menubar-combat-tracker-render',
            priority: 3,
            callback: (app, html, data) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Check if this is the combat tracker application
                if (app && app.appId === 'combat') {
                    postConsoleAndNotification(MODULE.NAME, "Combat Tracker: Window render detected", {
                        appId: app.appId,
                        rendered: app.rendered
                    }, true, false);
                    
                    // Re-render menubar to update combat tracker button state
                    MenuBar.renderMenubar(true);
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Hook for combat tracker window closing to update menubar button state
        const combatTrackerCloseHookId = HookManager.registerHook({
            name: 'closeApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window closes',
            context: 'menubar-combat-tracker-close',
            priority: 3,
            callback: (app, options) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Check if this is the combat tracker application
                if (app && app.appId === 'combat') {
                    postConsoleAndNotification(MODULE.NAME, "Combat Tracker: Window close detected", {
                        appId: app.appId,
                        rendered: app.rendered
                    }, true, false);
                    
                    // Re-render menubar to update combat tracker button state
                    MenuBar.renderMenubar(true);
                }
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat hooks registered", "", true, false);
    }

    /**
     * Roll initiative for a specific combatant with dialog support
     * @param {Object} combatant - The combatant to roll initiative for
     * @param {Event} event - The click event (optional)
     * @private
     */
    static async _rollInitiativeForCombatant(combatant, event = null) {
        try {
            if (!combatant?.actor) {
                return;
            }

            // Check permissions: only allow rolling initiative for owned combatants or if user is GM
            if (!combatant.isOwner && !game.user.isGM) {
                ui.notifications.warn(`You don't have permission to roll initiative for ${combatant.name}`);
                return;
            }

            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolling initiative for ${combatant.name}`, "", true, false);

            // Debug: Check what methods are available on the combatant and actor
            const currentRollMode = game.settings.get('core', 'rollMode');
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Combatant debug info`, {
                actorType: combatant.actor.type,
                hasRollInitiative: typeof combatant.rollInitiative === 'function',
                actorConstructor: combatant.actor.constructor.name,
                actorSystem: combatant.actor.system?.constructor?.name,
                isOwner: combatant.isOwner,
                isGM: game.user.isGM,
                currentUserId: game.user.id,
                rollMode: currentRollMode,
                rollModeName: CONFIG.Dice.rollModes[currentRollMode]?.label || 'Unknown',
                hasDialogOption: combatant.rollInitiative.toString().includes('dialog')
            }, true, false);

            // Manual roll mode: try to trigger the same event that the combat tracker uses
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Simulating combat tracker click for ${combatant.name}`, "", true, false);
            
            // Check if the combat tracker is available and trigger its event
            if (ui.combat) {
                try {
                    // Try to trigger the combat tracker's rollInitiative event
                    const combatTrackerElement = ui.combat.element.find(`[data-combatant-id="${combatant.id}"] .combatant-control[data-control="rollInitiative"]`);
                    if (combatTrackerElement.length > 0) {
                        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Found combat tracker element, triggering click`, "", true, false);
                        combatTrackerElement.trigger('click');
                        return;
                    }
                } catch (trackerError) {
                    postConsoleAndNotification(MODULE.NAME, `Combat Bar: Combat tracker click failed`, trackerError.message, true, false);
                }
            }
            
            // Fallback: Try to use the D&D5e system's roll dialog directly
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Using D&D5e roll dialog fallback for ${combatant.name}`, "", true, false);
            
            // Try to find and use the D&D5e system's roll dialog
            if (game.dnd5e && combatant.actor.rollInitiative) {
                // Check if the actor has the rollInitiative method that supports dialog
                const rollMethod = combatant.actor.rollInitiative.toString();
                if (rollMethod.includes('dialog') || rollMethod.includes('Dialog')) {
                    await combatant.actor.rollInitiative();
                } else {
                    // Try with different parameters
                    await combatant.actor.rollInitiative({});
                }
            } else {
                // Last resort: use combatant rollInitiative
                await combatant.rollInitiative();
            }

        } catch (error) {
            // Handle permission errors specifically
            if (error.message && error.message.includes('lacks permission')) {
                postConsoleAndNotification(MODULE.NAME, `Combat Bar: Permission denied for ${combatant.name}`, error.message, false, false);
                ui.notifications.error(`Permission denied: ${error.message}`);
                return;
            }
            
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for ${combatant.name}`, error, true, false);
            throw error; // Re-throw so calling code can handle it
        }
    }

    /**
     * Register event handlers for combat bar interactions
     * @private
     */
    static _registerCombatBarEvents() {
        // Use event delegation to handle clicks on combat bar controls
        document.addEventListener('click', async (event) => {
            // Check if this is a combat portrait click (pan to combatant)
            // But exclude initiative dice and other interactive elements
            const combatPortrait = event.target.closest('[data-combatant-id]');
            if (combatPortrait) {
                // Don't pan if clicking on initiative dice, dead overlay, or other interactive elements
                const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
                const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
                const isInteractiveElement = event.target.closest('a, button, .combatant-control');
                
                if (!isInitiativeDice && !isDeadOverlay && !isInteractiveElement) {
                    const combatantId = combatPortrait.getAttribute('data-combatant-id');
                    if (combatantId) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.panToCombatant(combatantId);
                        return;
                    }
                }
            }

            // Check if this is a round control button
            if (event.target.closest('.combatbar-button[data-control="previousRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous round", error, true, false);
                }
                return;
            }
            
            if (event.target.closest('.combatbar-button[data-control="nextRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next round", error, true, false);
                }
                return;
            }
            
            // Check if this is a turn control button
            if (event.target.closest('.combatbar-button[data-control="previousTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous-turn turn", error, true, false);
                }
                return;
            }
            
            if (event.target.closest('.combatbar-button[data-control="nextTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next turn", error, true, false);
                }
                return;
            }
            
            // Check if this is an action button
            if (event.target.closest('.combatbar-button[data-control="beginCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.startCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat started", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error starting combat", error, true, false);
                }
                return;
            }
            
            if (event.target.closest('.combatbar-button[data-control="endCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.endCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending combat", error, true, false);
                }
                return;
            }
            
            if (event.target.closest('.combatbar-button[data-control="endTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Turn ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending turn", error, true, false);
                }
                return;
            }
            
            if (event.target.closest('.combatbar-button[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    const combat = game.combat;
                    if (!combat) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No active combat found", "", true, false);
                        return;
                    }
                    
                    // Check if auto-roll is enabled
                    const autoRollEnabled = game.settings.get(MODULE.ID, 'combatTrackerRollInitiativePlayer');
                    
                    // Get owned PCs that need initiative (characters only, in order)
                    const ownedPCsNeedingInitiative = combat.combatants.filter(c => 
                        c?.actor &&
                        c.actor.type === "character" && 
                        c.isOwner && 
                        c.initiative === null
                    );
                    
                    if (ownedPCsNeedingInitiative.length === 0) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No owned characters need initiative", "", true, false);
                        return;
                    }
                    
                    if (autoRollEnabled) {
                        // Use the existing core Blacksmith auto-roll functionality
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Using core auto-roll functionality", "", true, false);
                        
                        // Import and call the existing core method
                        const CombatTracker = await import('./combat-tracker.js');
                        await CombatTracker.CombatTracker._rollInitiativeForPlayerCharacters(combat);
                    } else {
                        // Manual roll for just the FIRST character that needs it
                        const nextCombatant = ownedPCsNeedingInitiative[0];
                        await this._rollInitiativeForCombatant(nextCombatant, event);
                        
                        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolled initiative for ${nextCombatant.name}`, "", true, false);
                    }
                    
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error rolling initiative", error, true, false);
                }
                return;
            }
              
            
            // Check if this is an initiative roll button
            if (event.target.closest('.combat-portrait-initiative-dice a[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                
                const button = event.target.closest('a');
                const combatantId = button.dataset.combatantId;
                
                if (!combatantId) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: No combatant ID found for initiative roll", "", true, false);
                    return;
                }
                
                try {
                    const combat = game.combat;
                    if (!combat) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No active combat found", "", true, false);
                        return;
                    }
                    
                    const combatant = combat.combatants.get(combatantId);
                    if (!combatant) {
                        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Combatant ${combatantId} not found`, "", true, false);
                        return;
                    }
                    
                    // Use the same initiative rolling function
                    await this._rollInitiativeForCombatant(combatant, event);
                    
                    // Update the combat bar to reflect the new initiative
                    this.updateCombatBar();
                    
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for combatant ${combatantId}`, error, true, false);
                }
            }
        });

        // Add double-click handler for GM to set current combatant
        document.addEventListener('dblclick', async (event) => {
            // Only allow GMs to set current combatant
            if (!game.user.isGM) return;

            // Check if this is a combat portrait double-click
            const combatPortrait = event.target.closest('[data-combatant-id]');
            if (combatPortrait) {
                // Don't set current if double-clicking on initiative dice, dead overlay, or other interactive elements
                const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
                const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
                const isInteractiveElement = event.target.closest('a, button, .combatant-control');
                
                if (!isInitiativeDice && !isDeadOverlay && !isInteractiveElement) {
                    const combatantId = combatPortrait.getAttribute('data-combatant-id');
                    if (combatantId) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.setCurrentCombatant(combatantId);
                        return;
                    }
                }
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat bar event handlers registered", "", true, false);
    }

    /**
     * Check for active combat when the client loads
     * @private
     */
    static _checkActiveCombatOnLoad() {
        try {
            const combat = game.combats.active;
            if (combat && combat.combatants.size > 0) {
                postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat with combatants found on load", "", true, false);
                // Small delay to ensure everything is ready
                setTimeout(() => {
                    // Check if auto-show is enabled
                    const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                    if (shouldShowCombatBar) {
                        this.openCombatBar();
                    }
                }, 500);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error checking active combat on load", { error }, false, false);
        }
    }

    /**
     * Register default menubar tools using the API
     */
    static registerDefaultTools() {
        // Left zone tools
        this.registerMenubarTool('settings', {
            icon: "fa-solid fa-gear",
            name: "settings",
            title: "Open Foundry Settings",
            zone: "left",
            order: 1,
            moduleId: "blacksmith-core",
            onClick: () => {
                game.settings.sheet.render(true);
            }
        });

        this.registerMenubarTool('refresh', {
            icon: "fa-solid fa-rotate",
            name: "refresh", 
            title: "Refresh Foundry",
            zone: "left",
            order: 2,
            moduleId: "blacksmith-core",
            onClick: () => {
                window.location.reload();
            }
        });

        // Middle zone tools
        this.registerMenubarTool('vote', {
            icon: "fa-solid fa-check-to-slot",
            name: "vote",
            title: "Vote",
            zone: "middle",
            order: 1,
            moduleId: "blacksmith-core",
            leaderOnly: true,
            onClick: () => {
                new VoteConfig().render(true);
            }
        });

        this.registerMenubarTool('skillcheck', {
            icon: "fa-solid fa-dice",
            name: "skillcheck",
            title: "Request a Roll",
            zone: "middle",
            order: 2,
            moduleId: "blacksmith-core",
            gmOnly: true,
            onClick: () => {
                new SkillCheckDialog().render(true);
            }
        });

        this.registerMenubarTool('imagereplace', {
            icon: "fa-solid fa-images",
            name: "imagereplace",
            title: "Replace Image",
            zone: "middle",
            order: 3,
            moduleId: "blacksmith-core",
            gmOnly: true,
            onClick: () => {
                ImageCacheManager.openWindow();
            }
        });

        this.registerMenubarTool('interface', {
            icon: "fa-solid fa-sidebar",
            name: "interface",
            title: () => {
                // Dynamic title based on current UI state
                const isHidden = this.isInterfaceHidden();
                return isHidden ? "Show UI" : "Hide UI";
            },
            tooltip: "Toggle Core Foundry Interface including toolbars, party window, and macros",
            zone: "middle",
            order: 4,
            moduleId: "blacksmith-core",
            onClick: () => {
                this.toggleInterface();
            }
        });

        this.registerMenubarTool('xp-distribution', {
            icon: "fas fa-star",
            name: "xp-distribution",
            title: "XP Distribution",
            tooltip: "Open Experience Points Distribution Worksheet",
            zone: "middle",
            order: 5,
            moduleId: "blacksmith-core",
            gmOnly: true,
            onClick: () => {
                this.openXpDistribution();
            }
        });

        this.registerMenubarTool('create-combat', {
            icon: "fas fa-swords",
            name: "create-combat",
            title: "Create Combat",
            tooltip: "Create combat encounter with selected tokens or all tokens on canvas",
            zone: "middle",
            order: 6,
            moduleId: "blacksmith-core",
            gmOnly: true,
            onClick: () => {
                this.createCombat();
            }
        });

        this.registerMenubarTool('combat-window', {
            icon: "fas fa-swords",
            name: "combat-window",
            title: "Toggle Combat Tracker",
            tooltip: "Toggle the FoundryVTT Combat Tracker window visibility",
            zone: "middle",
            order: 8,
            moduleId: "blacksmith-core",
            gmOnly: false, // Available to all players
            visible: () => {
                // Show if there's an active combat with combatants
                const activeCombat = game.combats.active;
                return activeCombat !== null && activeCombat !== undefined && activeCombat.combatants.size > 0;
            },
            onClick: () => {
                this.toggleCombatTracker();
            }
        });

        this.registerMenubarTool('combat-tracker', {
            icon: "fas fa-swords",
            name: "combat-tracker",
            title: () => {
                // Dynamic title based on combat bar state
                const isCombatBarOpen = this.secondaryBar.isOpen && this.secondaryBar.type === 'combat';
                return isCombatBarOpen ? "Hide Combat Bar" : "Show Combat Bar";
            },
            tooltip: () => {
                // Dynamic tooltip based on combat bar state
                const isCombatBarOpen = this.secondaryBar.isOpen && this.secondaryBar.type === 'combat';
                return isCombatBarOpen ? "Hide combat tracker secondary bar" : "Show combat tracker secondary bar";
            },
            zone: "middle",
            order: 7,
            moduleId: "blacksmith-core",
            gmOnly: false, // Available to all players
            visible: () => {
                // Show if there's an active combat OR if there are combatants in any combat
                const activeCombat = game.combats.active;
                return activeCombat !== null && activeCombat !== undefined && activeCombat.combatants.size > 0;
            },
            onClick: () => {
                this.toggleSecondaryBar('combat');
            }
        });

        // Right zone tools
        this.registerMenubarTool('leader-section', {
            icon: "fa-solid fa-crown",
            name: "leader-section",
            title: "Party Leader",
            zone: "right",
            order: 1,
            moduleId: "blacksmith-core",
            visible: false, // This is handled specially in the template
            onClick: () => {
                if (game.user.isGM) {
                    this.showLeaderDialog();
                }
            }
        });

        this.registerMenubarTool('movement', {
            icon: "fa-solid fa-person-walking",
            name: "movement",
            title: "Change Party Movement",
            zone: "right", 
            order: 2,
            moduleId: "blacksmith-core",
            visible: false, // This is handled specially in the template
            onClick: () => {
                new MovementConfig().render(true);
            }
        });

        this.registerMenubarTool('timer-section', {
            icon: "fa-solid fa-eclipse",
            name: "timer-section",
            title: "Session Timer",
            zone: "right",
            order: 3,
            moduleId: "blacksmith-core",
            visible: false, // This is handled specially in the template
            onClick: () => {
                if (game.user.isGM) {
                    this.showTimerDialog();
                }
            }
        });

        postConsoleAndNotification(MODULE.NAME, "Menubar: Default tools registered using API", "", true, false);
    }

    /**
     * Get the appropriate height variable for a secondary bar type
     */
    static getSecondaryBarHeight(typeId) {
        const heightVar = `--blacksmith-menubar-secondary-${typeId}-height`;
        const height = parseInt(getComputedStyle(document.documentElement).getPropertyValue(heightVar));
        return height || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-default-height')) || 50;
    }

    /**
     * Register secondary bar types
     */
    static registerSecondaryBarTypes() {
        // Register combat tracker secondary bar
        this.registerSecondaryBarType('combat', {
            height: this.getSecondaryBarHeight('combat'),
            persistence: 'manual',
            autoCloseDelay: 10000
        });

        postConsoleAndNotification(MODULE.NAME, "Menubar: Secondary bar types registered", "", true, false);
    }

    // ================================================================== 
    // ===== MENUBAR API METHODS ========================================
    // ================================================================== 

    /**
     * Register a tool with the menubar system
     * @param {string} toolId - Unique identifier for the tool
     * @param {Object} toolData - Tool configuration object
     * @param {string} toolData.icon - FontAwesome icon class
     * @param {string} toolData.name - Tool name (used for data-tool attribute)
     * @param {string} toolData.title - Tooltip text displayed on hover
     * @param {Function} toolData.onClick - Function to execute when tool is clicked
     * @param {string} toolData.zone - Zone placement (left, middle, right)
     * @param {number} toolData.order - Order within zone (lower numbers appear first)
     * @param {string} toolData.moduleId - Module identifier
     * @param {boolean} toolData.gmOnly - Whether tool is GM-only
     * @param {boolean} toolData.leaderOnly - Whether tool is leader-only
     * @param {boolean} toolData.visible - Whether tool is visible (can be function)
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

            const requiredFields = ['icon', 'name', 'title', 'onClick'];
            for (const field of requiredFields) {
                if (!toolData[field]) {
                    postConsoleAndNotification(MODULE.NAME, `Menubar API: Missing required field '${field}'`, { toolId, toolData }, false, false);
                    return false;
                }
            }

            // Check for duplicate toolId
            if (this.toolbarIcons.has(toolId)) {
                postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool ID already exists", { toolId }, false, false);
                return false;
            }

            // Set defaults
            const tool = {
                icon: toolData.icon,
                name: toolData.name,
                title: toolData.title,
                onClick: toolData.onClick,
                zone: toolData.zone || 'left',
                order: toolData.order || 999,
                moduleId: toolData.moduleId || 'unknown',
                gmOnly: toolData.gmOnly || false,
                leaderOnly: toolData.leaderOnly || false,
                visible: toolData.visible !== undefined ? toolData.visible : true
            };

            // Register the tool
            this.toolbarIcons.set(toolId, tool);

            postConsoleAndNotification(MODULE.NAME, "Menubar API: Tool registered successfully", { toolId, moduleId: tool.moduleId }, true, false);

            // Re-render the menubar to show the new tool
            this.renderMenubar();

            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Menubar API: Error registering tool", { toolId, error }, false, false);
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
     * Get tools organized by zone
     * @returns {Object} Object with zone arrays containing visible tools
     */
    static getMenubarToolsByZone() {
        const zones = {
            left: [],
            middle: {
                general: [],    // All players/GM
                leader: [],     // Leader/GM only
                gm: []         // GM only
            },
            right: []
        };

        this.toolbarIcons.forEach((tool, toolId) => {
            // Check visibility
            let isVisible = true;
            if (typeof tool.visible === 'function') {
                isVisible = tool.visible();
            } else {
                isVisible = tool.visible;
            }

            // Check GM/Leader restrictions
            if (tool.gmOnly && !game.user.isGM) {
                isVisible = false;
            }

            if (tool.leaderOnly && !game.user.isGM) {
                const leaderData = game.settings.get(MODULE.ID, 'partyLeader');
                const isLeader = leaderData?.userId === game.user.id;
                
                postConsoleAndNotification(MODULE.NAME, "Menubar Leader | Tool visibility check", {
                    toolId: toolId,
                    toolName: tool.name,
                    leaderData: leaderData,
                    currentUserId: game.user.id,
                    isLeader: isLeader,
                    isGM: game.user.isGM,
                    willBeVisible: isLeader
                }, true, false);
                
                if (!isLeader) {
                    isVisible = false;
                }
            }

            if (isVisible) {
                const zone = tool.zone || 'left';
                
                // Process title and tooltip if they are functions
                const processedTool = {
                    toolId,
                    ...tool,
                    title: typeof tool.title === 'function' ? tool.title() : tool.title,
                    tooltip: typeof tool.tooltip === 'function' ? tool.tooltip() : tool.tooltip
                };
                
                if (zone === 'middle') {
                    // Group middle tools by visibility requirements
                    if (tool.gmOnly) {
                        zones.middle.gm.push(processedTool);
                    } else if (tool.leaderOnly) {
                        zones.middle.leader.push(processedTool);
                    } else {
                        zones.middle.general.push(processedTool);
                    }
                } else {
                    zones[zone].push(processedTool);
                }
            }
        });

        // Sort each zone by order
        Object.keys(zones).forEach(zone => {
            if (zone === 'middle') {
                // Sort each group within middle zone
                zones.middle.general.sort((a, b) => (a.order || 999) - (b.order || 999));
                zones.middle.leader.sort((a, b) => (a.order || 999) - (b.order || 999));
                zones.middle.gm.sort((a, b) => (a.order || 999) - (b.order || 999));
            } else {
                zones[zone].sort((a, b) => (a.order || 999) - (b.order || 999));
            }
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

    // ================================================================== 
    // ===== MENUBAR API TESTING ========================================
    // ================================================================== 

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
                    console.log(`   Left: ${toolsByZone.left.length} tools`);
                    console.log(`   Middle: ${toolsByZone.middle.general.length + toolsByZone.middle.leader.length + toolsByZone.middle.gm.length} tools (${toolsByZone.middle.general.length} general, ${toolsByZone.middle.leader.length} leader, ${toolsByZone.middle.gm.length} gm)`);
                    console.log(`   Right: ${toolsByZone.right.length} tools`);
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

    // ================================================================== 
    // ===== SECONDARY BAR SYSTEM ======================================
    // ================================================================== 

    /**
     * Register a secondary bar type
     * @param {string} typeId - Unique identifier for the bar type
     * @param {Object} config - Configuration object
     * @param {number} config.height - Height of the secondary bar
     * @param {string} config.persistence - 'manual' or 'auto'
     * @param {number} config.autoCloseDelay - Delay in ms for auto-close (default: 10000)
     * @returns {boolean} Success status
     */
    static registerSecondaryBarType(typeId, config) {
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
                autoCloseDelay: config.autoCloseDelay || 10000
            };

            this.secondaryBarTypes.set(typeId, barType);

            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Type registered successfully", { typeId }, true, false);
            return true;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Error registering type", { typeId, error }, false, false);
            return false;
        }
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
            // For combat bars, check if user manually closed it
            if (typeId === 'combat' && this.secondaryBar.userClosed) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Combat bar was manually closed by user", "", true, false);
                return false;
            }

            // If the same type is already open, just update it
            if (this.secondaryBar.isOpen && this.secondaryBar.type === typeId) {
                if (options.data) {
                    this.updateSecondaryBar(options.data);
                }
                return true;
            }

            // Close any existing secondary bar first
            this.closeSecondaryBar();

            const barType = this.secondaryBarTypes.get(typeId);
            if (!barType) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Type not registered", { typeId }, false, false);
                return false;
            }

            // Set up the secondary bar
            this.secondaryBar.isOpen = true;
            this.secondaryBar.type = typeId;
            this.secondaryBar.height = options.height || this.getSecondaryBarHeight(typeId);
            this.secondaryBar.persistence = options.persistence || barType.persistence;
            this.secondaryBar.data = options.data || {};

            // For combat bars, always refresh the data to show current state
            if (typeId === 'combat') {
                const combat = game.combat;
                if (combat) {
                    this.secondaryBar.data = this.getCombatData(combat);
                }
            }

            // Set the CSS variables for secondary bar height and total height
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-height', `${this.secondaryBar.height}px`);
            document.documentElement.style.setProperty('--blacksmith-menubar-total-height', `calc(var(--blacksmith-menubar-primary-height) + var(--blacksmith-menubar-secondary-height))`);

            // Set up auto-close if needed
            if (this.secondaryBar.persistence === 'auto') {
                this._setAutoCloseTimeout();
            }

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
    static closeSecondaryBar(userInitiated = false) {
        try {
            if (!this.secondaryBar.isOpen) {
                return true; // Already closed
            }

            // Track if user manually closed the combat bar
            if (userInitiated && this.secondaryBar.type === 'combat') {
                this.secondaryBar.userClosed = true;
            }

            // Clear auto-close timeout if it exists
            if (this.secondaryBar.autoCloseTimeout) {
                clearTimeout(this.secondaryBar.autoCloseTimeout);
                this.secondaryBar.autoCloseTimeout = null;
            }

            // Reset secondary bar state
            this.secondaryBar.isOpen = false;
            this.secondaryBar.type = null;
            this.secondaryBar.data = {};

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
            if (this.secondaryBar.isOpen && this.secondaryBar.type === typeId) {
                // Close if same type is open (user initiated)
                return this.closeSecondaryBar(true);
            } else {
                // For combat bars, reset the userClosed flag since this is a deliberate user action
                if (typeId === 'combat') {
                    this.secondaryBar.userClosed = false;
                }
                // Open the specified type
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
            if (!this.secondaryBar.isOpen) {
                postConsoleAndNotification(MODULE.NAME, "Secondary Bar: Cannot update closed bar", "", false, false);
                return false;
            }

            this.secondaryBar.data = { ...this.secondaryBar.data, ...data };

            // Re-render to update the bar content
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

    // ================================================================== 
    // ===== COMBAT INTEGRATION ========================================
    // ================================================================== 

    /**
     * Open combat tracker secondary bar
     * @param {Object} combatData - Combat data for the bar
     * @returns {boolean} Success status
     */
    static openCombatBar(combatData = null) {
        try {
            
            // Set initial combat menubar height from setting
            const combatHeight = game.settings.get(MODULE.ID, 'menubarCombatSize');
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-combat-height', `${combatHeight}px`);
            
            const combat = game.combats.active;
            if (!combat) {
                return false;
            }


            // Reset user closed flag when combat starts
            this.secondaryBar.userClosed = false;

            const data = combatData || this.getCombatData(combat);
            
            
            return this.openSecondaryBar('combat', {
                data: data,
                persistence: 'manual'
            });

        } catch (error) {
            return false;
        }
    }

    /**
     * Close combat tracker secondary bar
     * @returns {boolean} Success status
     */
    static closeCombatBar() {
        try {
            if (this.secondaryBar.isOpen && this.secondaryBar.type === 'combat') {
                // Reset userClosed flag when combat ends (not user-initiated)
                this.secondaryBar.userClosed = false;
                return this.closeSecondaryBar();
            }
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error closing combat bar", { error }, false, false);
            return false;
        }
    }

    /**
     * Update combat tracker secondary bar
     * @param {Object} combatData - Updated combat data
     * @returns {boolean} Success status
     */
    static updateCombatBar(combatData = null) {
        try {
            if (!this.secondaryBar.isOpen || this.secondaryBar.type !== 'combat') {
                return false;
            }

            const combat = game.combats.active;
            if (!combat) {
                // Close combat bar if no active combat
                return this.closeCombatBar();
            }

            const data = combatData || this.getCombatData(combat);
            return this.updateSecondaryBar(data);

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error updating combat bar", { error }, false, false);
            return false;
        }
    }

    /**
     * Get combat data for the secondary bar
     * @param {Combat} combat - Combat instance
     * @returns {Object} Combat data for template
     */
    static getCombatData(combat) {
        try {
            if (!combat) return {};

            const combatants = combat.combatants.map(combatant => {
                const token = combatant.token;
                const actor = combatant.actor;
                
                // Get combat-portrait data
                let currentHP = 0;
                let maxHP = 0;
                let healthPercentage = 100;
                let healthCircumference = 0;
                let healthDashOffset = 0;
                let healthClass = 'combat-portrait-ring-healthy';
                
                // Calculate SVG values for health ring (derived from CSS variable)
                // Portrait size is 80% of secondary bar height (defined in CSS)
                const secondaryHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-combat-height');
                const secondaryHeight = parseInt(secondaryHeightStr) || 50;
                const size = Math.floor(secondaryHeight * 0.8); // Match CSS: --portrait-size: calc(var(--blacksmith-menubar-secondary-height) * 0.8)
                const strokeWidth = Math.max(2, Math.floor(size * 0.05)); // Stroke is ~5% of portrait size
                // Radius needs to account for half the stroke width to keep it within bounds
                const radius = (size / 2) - (strokeWidth / 2);
                
                if (actor) {
                    // Try to get HP from actor
                    if (actor.system?.attributes?.hp) {
                        currentHP = actor.system.attributes.hp.value || 0;
                        maxHP = actor.system.attributes.hp.max || 1;
                    } else if (actor.system?.hitPoints) {
                        currentHP = actor.system.hitPoints.value || 0;
                        maxHP = actor.system.hitPoints.max || 1;
                    }
                    
                    if (maxHP > 0) {
                        healthPercentage = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
                    }
                    
                    // Calculate health ring dash values
                    const circumference = 2 * Math.PI * radius;
                    const dashOffset = currentHP <= 0 ? 0 : circumference - (healthPercentage / 100) * circumference;
                    
                    healthCircumference = circumference;
                    healthDashOffset = dashOffset;
                    
                    // Get combat-portrait color class
                    if (currentHP <= 0) {
                        healthClass = 'combat-portrait-ring-dead';
                    } else if (healthPercentage >= 75) {
                        healthClass = 'combat-portrait-ring-healthy';
                    } else if (healthPercentage >= 50) {
                        healthClass = 'combat-portrait-ring-injured';
                    } else if (healthPercentage >= 25) {
                        healthClass = 'combat-portrait-ring-bloodied';
                    } else {
                        healthClass = 'combat-portrait-ring-critical';
                    }
                }
                
                   // Determine if combatant is actually dead based on D&D5e rules
                   let isActuallyDead = false;
                   if (actor) {
                       if (actor.type === "character") {
                           // For PCs: Only dead if marked as defeated (failed 3 death saves)
                           isActuallyDead = combatant.isDefeated || false;
                       } else {
                           // For NPCs/Monsters: Dead if HP <= 0
                           const currentHP = actor.system?.attributes?.hp?.value || 0;
                           isActuallyDead = currentHP <= 0;
                       }
                   }

                   const combatantData = {
                       id: combatant.id,
                       name: actor?.name || token?.name || 'Unknown',
                       portrait: actor?.img || token?.img || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp',
                       initiative: combatant.initiative || 0,
                       isCurrent: combatant.id === combat.current.combatantId,
                       isDefeated: isActuallyDead,
                       needsInitiative: combatant.initiative === null,
                       canRollInitiative: combatant.initiative === null && combatant.isOwner && !isActuallyDead,
                       currentHP: currentHP,
                       maxHP: maxHP,
                       healthPercentage: healthPercentage,
                       healthCircumference: healthCircumference,
                       healthDashOffset: healthDashOffset,
                       healthClass: healthClass,
                       svgSize: size,
                       svgCenter: size / 2,
                       svgRadius: radius,
                       svgStrokeWidth: strokeWidth
                   };
                
                
                return combatantData;
            });

            // Sort combatants by initiative (highest first)
            combatants.sort((a, b) => b.initiative - a.initiative);

            // Determine action button based on user role and combat state
            let actionButton = null;
            
            if (game.user.isGM) {
                // GM actions
                if (!combat.started) {
                    actionButton = {
                        control: 'beginCombat',
                        label: 'Begin Combat',
                        tooltip: 'Begin Combat',
                        icon: 'fa-play',
                        text: 'Begin Combat',
                        type: 'begin'
                    };
                } else {
                    actionButton = {
                        control: 'endCombat',
                        label: 'End Combat',
                        tooltip: 'End Combat',
                        icon: 'fa-stop',
                        text: 'End Combat',
                        type: 'end'
                    };
                }
            } else {
                // Player actions
                const currentCombatant = combat.combatants.get(combat.current.combatantId);
                const isPlayerTurn = currentCombatant && currentCombatant.isOwner;
                
                if (combat.started && isPlayerTurn) {
                    actionButton = {
                        control: 'endTurn',
                        label: 'End Turn',
                        tooltip: 'End Turn',
                        icon: 'fa-forward',
                        text: 'End Turn',
                        type: 'end'
                    };
                } else {
                    // Check how many owned combatants need initiative
                    const ownedCombatantsNeedingInitiative = combatants.filter(c => c.needsInitiative && c.canRollInitiative);
                    const ownedPCs = combat.combatants.filter(c =>
                        c?.actor &&
                        c.actor.type === "character" && // strictly PCs
                        c.isOwner                       // owned in *this* combat by the current user
                      );
                    
                    if (ownedCombatantsNeedingInitiative.length > 0) {
                        // Calculate which initiative roll this is (1 of X, 2 of X, etc.)
                        const totalOwnedPCs = ownedPCs.length;
                        const alreadyRolled = ownedPCs.filter(c => c.initiative !== null).length;
                        const currentRoll = alreadyRolled + 1; // Next initiative to roll
                        
                        // Always show count if player owns multiple characters, even for the last one
                        const buttonText = totalOwnedPCs === 1 ? 'Roll Initiative' : `Roll Initiative ${currentRoll} of ${totalOwnedPCs}`;
                        const tooltipText = totalOwnedPCs === 1 ? 'Roll Initiative' : `Roll Initiative for character ${currentRoll} of ${totalOwnedPCs}`;
                        
                        actionButton = {
                            control: 'rollInitiative',
                            label: buttonText,
                            tooltip: tooltipText,
                            icon: 'fa-dice-d20',
                            text: buttonText,
                            type: 'roll',
                            currentRoll: currentRoll,
                            totalOwnedPCs: totalOwnedPCs,
                            countRemaining: ownedCombatantsNeedingInitiative.length
                        };
                    }
                    // If no owned combatants need initiative, don't show any action button
                }
            }

            // Get current combatant name
            const currentCombatant = combat.combatants.get(combat.current.combatantId);
            const currentCombatantName = currentCombatant ? currentCombatant.name : '';

            const combatData = {
                currentRound: combat.round || 1,
                currentTurn: combat.turn || 1,
                totalTurns: combatants.length,
                combatants: combatants,
                isActive: combat.started,
                actionButton: actionButton,
                isGM: game.user.isGM,
                currentCombatant: currentCombatantName
            };
            
            
            return combatData;

        } catch (error) {
            return {};
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

    static async renderMenubar(immediate = false) {
        try {
            // Debounce rapid render calls
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
            postConsoleAndNotification(MODULE.NAME, "Menubar Leader | Initial render", {
                leaderData: renderLeaderData,
                currentUserId: game.user.id,
                isGM: game.user.isGM,
                currentLeader: this.currentLeader,
                isLoading: this.isLoading,
                leaderToolsInMiddle: toolsByZone.middle.leader.length,
                generalToolsInMiddle: toolsByZone.middle.general.length,
                gmToolsInMiddle: toolsByZone.middle.gm.length
            }, true, false);

            const templateData = {
                isGM: game.user.isGM,
                isLeader: isLeader,
                leaderText: this.getLeaderDisplayText(),
                timerText: this.getTimerText(),
                timerProgress: this.getTimerProgress(),
                currentMovement: currentMovementData,
                toolsByZone: toolsByZone,
                notifications: Array.from(this.notifications.values()),
                secondaryBar: this.secondaryBar,
                isInterfaceHidden: this.isInterfaceHidden()
            };

            // Render the template
            const panelHtml = await renderTemplate('modules/coffee-pub-blacksmith/templates/menubar.hbs', templateData);

            // Remove any existing menubar and secondary bars
            document.querySelector('.blacksmith-menubar-container')?.remove();
            document.querySelectorAll('.blacksmith-menubar-secondary').forEach(el => el.remove());
            
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

    /**
     * Pan to a specific combatant's token
     * @param {string} combatantId - The combatant ID to pan to
     */
    static panToCombatant(combatantId) {
        try {
            const combat = game.combat;
            if (!combat) return;

            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;

            const token = combatant.token;
            if (!token) return;

            // Pan to the token
            canvas.animatePan({ x: token.x, y: token.y });
            
            // Optionally highlight the token briefly
            if (token.visible) {
                token.highlight();
                setTimeout(() => token.unhighlight(), 2000);
            }

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error panning to combatant", error, false, false);
        }
    }

    /**
     * Set a combatant as the current turn (GM only)
     * @param {string} combatantId - The combatant ID to set as current
     */
    static async setCurrentCombatant(combatantId) {
        try {
            const combat = game.combat;
            if (!combat) return;

            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;

            // Find the turn index for this combatant
            const turnIndex = combat.turns.findIndex(turn => turn.id === combatantId);
            if (turnIndex === -1) return;

            // Set the current turn
            await combat.update({ turn: turnIndex });
            
            postConsoleAndNotification(MODULE.NAME, `Set current combatant to ${combatant.name}`, "", true, false);

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error setting current combatant", error, false, false);
        }
    }

    static addClickHandlers() {
        // Use event delegation for dynamic tool clicks
        const menubarContainer = document.querySelector('.blacksmith-menubar-container');
        if (!menubarContainer) return;

        // Add a single event listener to the container for event delegation
        menubarContainer.addEventListener('click', (event) => {

            // Check if this is a notification close button click
            const closeButton = event.target.closest('.notification-close');
            if (closeButton) {
                const notificationId = closeButton.getAttribute('data-notification-id');
                if (notificationId) {
                    this.removeNotification(notificationId);
                    return;
                }
            }
            
            // Check if this is a menubar tool click
            const toolElement = event.target.closest('[data-tool]');
            if (!toolElement) return;

            const toolName = toolElement.getAttribute('data-tool');
            if (!toolName) return;

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

            // Execute the tool's onClick function
            if (typeof tool.onClick === 'function') {
                try {
                    tool.onClick();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Error executing tool ${toolId}:`, error, false, false);
                }
            }
        });

        // Note: Right zone tools (leader-section, movement, timer-section) are now handled
        // by the dynamic click system above via their data-tool attributes
    }

    /**
     * Check the current state of UI elements to determine if interface is hidden
     * @returns {boolean} True if any UI elements are hidden
     */
    static isInterfaceHidden() {
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');

        const isLeftHidden = uiLeft && uiLeft.style.display === 'none';
        const isBottomHidden = uiBottom && uiBottom.style.display === 'none';
        const isTopHidden = uiTop && uiTop.style.display === 'none';

        return isLeftHidden || isBottomHidden || isTopHidden;
    }

    /**
     * Toggle the FoundryVTT Combat Tracker window
     */
    static toggleCombatTracker() {
        try {
            const wasOpen = CombatTracker.isCombatTrackerOpen();
            
            if (wasOpen) {
                CombatTracker.closeCombatTracker();
                ui.notifications.info("Combat Tracker hidden");
            } else {
                CombatTracker.openCombatTracker();
                ui.notifications.info("Combat Tracker shown");
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error toggling combat tracker", error, false, false);
        }
    }

    /**
     * Toggle the FoundryVTT interface visibility
     */
    static toggleInterface() {
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');
        const label = document.querySelector('.interface-label');

        // Check if any UI element that can be hidden is currently hidden
        const isLeftHidden = uiLeft && uiLeft.style.display === 'none';
        const isBottomHidden = uiBottom && uiBottom.style.display === 'none';
        const isTopHidden = uiTop && uiTop.style.display === 'none';
        const isAnyHidden = isLeftHidden || isBottomHidden || isTopHidden;

        // Get the settings
        const hideLeftUI = game.settings.get(MODULE.ID, 'canvasToolsHideLeftUI');
        const hideBottomUI = game.settings.get(MODULE.ID, 'canvasToolsHideBottomUI');

        if (isAnyHidden) {
            ui.notifications.info("Showing the Interface...");
            if (hideLeftUI && isLeftHidden) uiLeft.style.display = 'inherit';
            if (hideBottomUI && isBottomHidden) uiBottom.style.display = 'inherit';
            if (isTopHidden) uiTop.style.display = 'inherit';
            if (label) label.textContent = 'Hide UI';
        } else {
            ui.notifications.info("Hiding the Interface...");
            if (hideLeftUI) uiLeft.style.display = 'none';
            if (hideBottomUI) uiBottom.style.display = 'none';
            if (uiTop) uiTop.style.display = 'none';
            if (label) label.textContent = 'Show UI';
        }
    }

    /**
     * Open the XP Distribution window
     */
    static openXpDistribution() {
        try {
            // Import the XpManager dynamically to avoid circular dependencies
            import('./xp-manager.js').then(({ XpManager }) => {
                XpManager.openXpDistributionWindow();
            }).catch(error => {
                postConsoleAndNotification(MODULE.NAME, "Error opening XP Distribution window", error, false, false);
                ui.notifications.error("Failed to open XP Distribution window");
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error importing XP Manager", error, false, false);
            ui.notifications.error("Failed to open XP Distribution window");
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
                        postConsoleAndNotification(MODULE.NAME, `Added ${token.name} to combat`, "", true, false);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, `${token.name} is already in combat`, "", true, false);
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
        
        // Re-render the entire menubar to update tool visibility
        // This ensures leader-only tools appear/disappear when leader changes
        this.renderMenubar();
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
            postConsoleAndNotification(MODULE.NAME, "Menubar Leader | Loading leader during init", {
                leaderData: leaderData,
                currentUserId: game.user.id,
                actorId: leaderData.actorId,
                userId: leaderData.userId
            }, true, false);
            
            await MenuBar.setNewLeader(leaderData, false);

        } else {
            postConsoleAndNotification(MODULE.NAME, "Menubar Leader | No leader data during init", {
                leaderData: leaderData,
                currentUserId: game.user.id
            }, true, false);
            
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
        if (data.leaderData !== undefined) {
            postConsoleAndNotification(MODULE.NAME, "Menubar | Socket setting update", {
                socketData: data,
                currentUserId: game.user.id,
                isGM: game.user.isGM,
                settingValue: data.leaderData
            }, true, false);
            
            const success = await setSettingSafely(MODULE.ID, 'partyLeader', data.leaderData);
            if (success) {
                postConsoleAndNotification(MODULE.NAME, "Menubar | Setting updated successfully", "Should trigger settingChange hook", true, false);
                MenuBar.updateLeaderDisplay();
                
                // Manually trigger toolbar refresh since settingChange hook doesn't fire on other clients
                Hooks.callAll('blacksmith.leaderChanged', data.leaderData);
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
