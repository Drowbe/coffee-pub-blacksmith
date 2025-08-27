/**
 * Hook Manager for Coffee Pub Blacksmith Module
 * 
 * TODO: Future Architectural Improvement
 * =====================================
 * Consider refactoring to centralized hook management where other modules
 * register their hook needs with our API instead of directly using Hooks.on/off.
 * This would prevent cross-module interference and provide better control over
 * hook lifecycle, timing, and cleanup. Other modules would call:
 * game.modules.get('coffee-pub-squire').api.registerHook('hookName', callback)
 * instead of directly calling Hooks.on('hookName', callback).
 * 
 * Benefits:
 * - No more cross-module hook conflicts
 * - Better control over hook registration timing
 * - Centralized debugging and optimization
 * - Improved module compatibility
 */
import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely} from './api-common.js';
import { BlacksmithWindowQuery } from './window-query.js';


/**
 * Centralized Hook Manager for Blacksmith
 * Consolidates all hooks and routes them to appropriate panels
 */
export class HookManager {
    static instance = null;
    // Enhanced hook management system
    static hookRegistry = new Map(); // hookName -> { handler, panels, hookId, isActive }
    static hookIds = new Map();      // hookName -> hookId (for backward compatibility)
    
    /**
     * Initialize the hook manager
     */
    static initialize() {
        if (HookManager.instance) return HookManager.instance;
        
        HookManager.instance = new HookManager();
        HookManager.instance._setupHooks();
        
        postConsoleAndNotification(
            MODULE.NAME,
            'HookManager initialized with enhanced registry system',
            'success',
            false,
            false
        );
        
        return HookManager.instance;
    }
    
    /**
     * Register a hook with the hook manager
     * @param {string} hookName - Name of the hook (e.g., 'updateActor', 'updateToken')
     * @param {Function} handler - The handler function for the hook
     * @param {Array<string>} panels - Array of panel types that depend on this hook
     * @param {Object} options - Additional options for hook registration
     * @returns {string} The hook ID for cleanup
     */
    static registerHook(hookName, handler, panels = [], options = {}) {
        // Check if hook is already registered
        if (HookManager.hookRegistry.has(hookName)) {
            const existing = HookManager.hookRegistry.get(hookName);
            
            // Check if the hook is already registered
            postConsoleAndNotification(MODULE.NAME,`Hook ${hookName} updated`,'', true, false);
            return existing.hookId; // Return the hook ID for cleanup
        }
        
        // Register new hooks
        const hookId = Hooks.on(hookName, handler);
        
        const hookInfo = {
            handler,
            hookId,
            isActive: true,
            options,
            registeredAt: Date.now()
        };
        
        HookManager.hookRegistry.set(hookName, hookInfo);
        HookManager.hookIds.set(hookName, hookId);
        
        postConsoleAndNotification(MODULE.NAME,'Hook registered successfully', hookName, true, false);

        return hookId;
    }
    
    /**
     * Request access to a hook for a specific panel
     * @param {string} hookName - Name of the hook being requested
     * @returns {boolean} True if hook is available, false otherwise
     */
    static requestHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            postConsoleAndNotification(MODULE.NAME,'Requested unavailable hook', hookName, true, false);
            return false;
        }
        const hookInfo = HookManager.hookRegistry.get(hookName);
        return hookInfo;
    }
    
    
    /**
     * Get information about a specific hook
     * @param {string} hookName - Name of the hook
     * @returns {Object|null} Hook information or null if not found
     */
    static getHookInfo(hookName) {
        return HookManager.hookRegistry.get(hookName) || null;
    }
    
    /**
     * Get all registered hooks
     * @returns {Array<string>} Array of all hook names
     */
    static getAllHooks() {
        return Array.from(HookManager.hookRegistry.keys());
    }
    
    /**
     * Get hook statistics
     * @returns {Object} Statistics about registered hooks
     */
    static getHookStats() {
        const totalHooks = HookManager.hookRegistry.size;
        const activeHooks = Array.from(HookManager.hookRegistry.values()).filter(h => h.isActive).length;
        return {
            totalHooks,
            activeHooks
        };
    }
    
    /**
     * Deactivate a hook (temporarily disable without removing)
     * @param {string} hookName - Name of the hook to deactivate
     * @returns {boolean} True if successful, false otherwise
     */
    static deactivateHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        if (hookInfo.isActive) {
            Hooks.off(hookName, hookInfo.handler);
            hookInfo.isActive = false;
            
            postConsoleAndNotification(
                MODULE.NAME,
                `Hook ${hookName} deactivated`,
                { hookId: hookInfo.hookId },
                true,
                false
            );
        }
        return true;
    }
    
    /**
     * Reactivate a previously deactivated hook
     * @param {string} hookName - Name of the hook to reactivate
     * @returns {boolean} True if successful, false otherwise
     */
    static reactivateHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        if (!hookInfo.isActive) {
            const newHookId = Hooks.on(hookName, hookInfo.handler);
            hookInfo.hookId = newHookId;
            hookInfo.isActive = true;
            HookManager.hookIds.set(hookName, newHookId);
            
            postConsoleAndNotification(
                MODULE.NAME,
                `Hook ${hookName} reactivated`,
                { newHookId },
                true,
                false
            );
        }
        
        return true;
    }
    
    /**
     * Remove a hook completely
     * @param {string} hookName - Name of the hook to remove
     * @returns {boolean} True if successful, false otherwise
     */
    static removeHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        
        // Remove from FoundryVTT
        if (hookInfo.isActive) {
            Hooks.off(hookName, hookInfo.handler);
        }
        
        // Remove from registries
        HookManager.hookRegistry.delete(hookName);
        HookManager.hookIds.delete(hookName);
        
        postConsoleAndNotification(MODULE.NAME,`Hook ${hookName} completely removed`, '', false, false);
        return true;
    }
    
    /**
     * Get debug information about hook state
     * @returns {Object} Debug information for troubleshooting
     */
    static getDebugInfo() {
        const stats = HookManager.getHookStats();
        const debugInfo = {
            ...stats,
            registryDetails: {}
        };
        
        // Add detailed registry information
        HookManager.hookRegistry.forEach((hookInfo, hookName) => {
            debugInfo.registryDetails[hookName] = {
                isActive: hookInfo.isActive,
                hookId: hookInfo.hookId,
                registeredAt: new Date(hookInfo.registeredAt).toISOString(),
                options: hookInfo.options
            };
        });
        return debugInfo;
    }

    /**
     * Console command to display all hook details in a readable format
     * @returns {void} Logs detailed hook information to console
     */
    static showHookDetails() {
        if (!HookManager.isReady()) {
            console.log('🔴 HookManager not ready or no hooks registered');
            return;
        }

        const totalHooks = HookManager.hookRegistry.size;
        const activeHooks = Array.from(HookManager.hookRegistry.values()).filter(h => h.isActive).length;
        
        console.log('🎯 COFFEE PUB•BLACKSMITH - HOOK MANAGER DETAILS');
        console.log('='.repeat(60));
        console.log(`📊 Total Hooks: ${totalHooks} | Active: ${activeHooks} | Inactive: ${totalHooks - activeHooks}`);
        console.log('='.repeat(60));
        
        // Group hooks by category
        const hooksByCategory = {};
        HookManager.hookRegistry.forEach((hookInfo, hookName) => {
            const category = hookInfo.categories?.[0] || 'general';
            if (!hooksByCategory[category]) hooksByCategory[category] = [];
            hooksByCategory[category].push({ name: hookName, info: hookInfo });
        });

        // Display hooks by category
        Object.entries(hooksByCategory).forEach(([category, hooks]) => {
            console.log(`\n📁 ${category.toUpperCase()} (${hooks.length} hooks):`);
            console.log('-'.repeat(40));
            
            hooks.forEach(({ name, info }) => {
                const status = info.isActive ? '🟢' : '🔴';
                const categories = info.categories?.join(', ') || 'none';
                console.log(`${status} ${name}`);
                console.log(`   ID: ${info.hookId || 'N/A'} | Categories: [${categories}]`);
                console.log(`   Registered: ${new Date(info.registeredAt).toLocaleTimeString()}`);
                if (info.options) {
                    console.log(`   Options: ${JSON.stringify(info.options)}`);
                }
            });
        });

        console.log('\n' + '='.repeat(60));
        console.log('💡 Console Commands:');
        console.log('   HookManager.showHookDetails() - Show this detailed view');
        console.log('   HookManager.getAllHooks() - Get array of hook names');
        console.log('   HookManager.getHookStats() - Get basic statistics');
        console.log('   HookManager.getDebugInfo() - Get raw debug data');
        console.log('='.repeat(60));
    }

    /**
     * Simple console command to show hook summary
     * @returns {void} Logs a simple hook summary to console
     */
    static showHooks() {
        if (!HookManager.isReady()) {
            console.log('🔴 HookManager not ready');
            return;
        }

        const totalHooks = HookManager.hookRegistry.size;
        const activeHooks = Array.from(HookManager.hookRegistry.values()).filter(h => h.isActive).length;
        const hookNames = Array.from(HookManager.hookRegistry.keys()).join(', ');
        
        console.log(`🎯 BLACKSMITH HOOKS: ${totalHooks} total (${activeHooks} active)`);
        console.log(`📋 Names: ${hookNames}`);
    }

    /**
     * Initialize global console commands for easy access
     * @private
     */
    static _setupConsoleCommands() {
        // Add global console commands for easy access
        if (typeof window !== 'undefined') {
            window.showHooks = () => HookManager.showHooks();
            window.showHookDetails = () => HookManager.showHookDetails();
            window.hookStats = () => HookManager.getHookStats();
        }
    }
    
    /**
     * Check if the HookManager is fully initialized and ready
     * @returns {boolean} True if ready, false otherwise
     */
    static isReady() {
        return HookManager.instance !== null && HookManager.hookRegistry.size > 0;
    }
    
    /**
     * Set up all hooks
     * @private
     */
    _setupHooks() {
        // Multi-select tracking variables
        let _multiSelectTimeout = null;
        let _lastSelectionTime = 0;
        let _selectionCount = 0;
        const MULTI_SELECT_DELAY = 150; // ms to wait after last selection event
        const SINGLE_SELECT_THRESHOLD = 300; // ms threshold to consider as single selection

        // Hooks

        
        // Update the logging message to reflect all consolidated hooks with names
        const hookNames = Array.from(HookManager.hookRegistry.keys()).join(', ');
        postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered: ${hookNames}`,
            '',
            true,
            false
        );

        const globalCloseGameHookId = HookManager.registerHook(
            "closeGame",
            () => {
                // TODO: Add panel manager cleanup when implemented
                postConsoleAndNotification(MODULE.NAME, "HookManager: closeGame hook triggered", "", false, false);
            },
            ['global']
        );

        const globalDisableModuleHookId = HookManager.registerHook(
            "disableModule",
            (moduleId) => {
                if (moduleId === MODULE.ID) {
                    // Clear any pending multi-select timeout
                    if (_multiSelectTimeout) {
                        clearTimeout(_multiSelectTimeout);
                        _multiSelectTimeout = null;
                    }
                    // Reset selection tracking
                    _selectionCount = 0;
                    _lastSelectionTime = 0;
                    
                    // TODO: Add quest pin cleanup when implemented
                    
                    // TODO: Add panel manager cleanup when implemented
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Module disabled, cleanup completed", "", false, false);
                }
            },
            ['global']
        );

        const globalCanvasReadyHookId = HookManager.registerHook(
            "canvasReady",
            () => {
                // Monitor canvas selection changes
                const originalSelectObjects = canvas.selectObjects;
                canvas.selectObjects = function(...args) {
                    const result = originalSelectObjects.apply(this, args);
                    
                    // Clear any existing multi-select timeout since we're using a different selection method
                    if (_multiSelectTimeout) {
                        clearTimeout(_multiSelectTimeout);
                        _multiSelectTimeout = null;
                    }
                    
                    // Reset selection tracking since this is a different selection method
                    _selectionCount = 0;
                    
                    // TODO: Add health panel update when implemented
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Canvas selection changed", "", false, false);
                    
                    return result;
                };
            },
            ['global']
        );

        const globalCreateTokenHookId = HookManager.registerHook(
            "createToken",
            async (token) => {
                // Only process if this token is owned by the user
                if (!token.actor?.isOwner) {
                    return;
                }
                
                // TODO: Add panel manager update when implemented
                postConsoleAndNotification(MODULE.NAME, "HookManager: Token created", token.name, false, false);
            },
            ['global']
        );

        // Settings hooks - LOW RISK
        const settingsChangeHookId = HookManager.registerHook(
            "settingChange",
            (moduleId, settingKey, value) => {
                if (moduleId === MODULE.ID) {
                    // Clear settings cache when settings change
                    // TODO: Implement clearSettingsCache function when needed
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Settings changed, cache cleared", settingKey, false, false);
                }
            },
            ['settings']
        );

        // Window lifecycle hooks - LOW RISK
        const renderApplicationHookId = HookManager.registerHook(
            "renderApplication",
            (app, html, data) => {
                if (app instanceof BlacksmithWindowQuery) {
                    // TODO: Implement registerBlacksmithWindow function when needed
                    postConsoleAndNotification(MODULE.NAME, "HookManager: BlacksmithWindowQuery rendered", app.id, false, false);
                }
            },
            ['windows']
        );

        const closeApplicationHookId = HookManager.registerHook(
            "closeApplication",
            (app) => {
                if (app instanceof BlacksmithWindowQuery) {
                    // TODO: Implement unregisterBlacksmithWindow function when needed
                    postConsoleAndNotification(MODULE.NAME, "HookManager: BlacksmithWindowQuery closed", app.id, false, false);
                }
            },
            ['windows']
        );

        // Chat message hooks - LOW RISK
        const renderChatMessageHookId = HookManager.registerHook(
            "renderChatMessage",
            (message, html) => {
                if (message.flags?.['coffee-pub-blacksmith']?.type === 'skillCheck') {
                    // TODO: Import and call SkillCheckDialog.handleChatMessageClick when needed
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Skill check chat message rendered", message.id, false, false);
                }
            },
            ['chat']
        );

        // Token update hooks - LOW RISK
        const updateTokenHookId = HookManager.registerHook(
            "updateToken",
            (token) => {
                // Update nameplates when tokens are updated
                // TODO: Implement updateNameplates function when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Token updated, nameplates refreshed", token.name, false, false);
            },
            ['tokens']
        );

        // Note config hooks - MEDIUM RISK
        const renderNoteConfigHookId = HookManager.registerHook(
            "renderNoteConfig",
            async (app, html, data) => {
                // Only GMs can configure note icons
                if (!game.user.isGM) {
                    return;
                }

                // TODO: Implement note config icon logic when needed
                // This will handle custom icon selection and file system access
                postConsoleAndNotification(MODULE.NAME, "HookManager: Note config rendered for GM", "", false, false);
            },
            ['notes']
        );

        // Canvas hooks - HIGHEST RISK
        const canvasInitHookId = HookManager.registerHook(
            "canvasInit",
            () => {
                // Canvas initialization complete - initialize toolbar
                // TODO: Implement toolbar initialization when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Canvas initialized", "", false, false);
            },
            ['canvas']
        );

        const canvasReadyHookId = HookManager.registerHook(
            "canvasReady",
            (canvas) => {
                // Check for blacksmith layer availability
                const blacksmithLayer = canvas['blacksmith-utilities-layer'];
                if (blacksmithLayer) {
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Blacksmith layer ready", "", false, false);
                }
                
                // Update scene icons when canvas is ready
                // TODO: Import and call WrapperManager._updateSceneIcons when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Canvas ready, scene icons updated", "", false, false);
            },
            ['canvas']
        );

        const updateSceneHookId = HookManager.registerHook(
            "updateScene",
            () => {
                // Update scene icons when scene changes
                // TODO: Import and call WrapperManager._updateSceneIcons when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Scene updated, icons refreshed", "", false, false);
            },
            ['canvas']
        );

        // Combat hooks - HIGH PRIORITY
        const updateCombatantHookId = HookManager.registerHook(
            "updateCombatant",
            (combatant, data, options, userId) => {
                // Only process if initiative was changed and we're the GM
                if (!game.user.isGM || !('initiative' in data)) return;
                
                // Import and call the real CombatTracker functionality
                import('./combat-tracker.js').then(({ CombatTracker }) => {
                    // Reset the flag when any initiative is set to null
                    if (data.initiative === null) {
                        CombatTracker._hasSetFirstCombatant = false;
                    }
                    
                    // Check if all initiatives have been rolled
                    CombatTracker._checkAllInitiativesRolled(combatant.combat);
                    
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Combatant initiative updated", {
                        combatantName: combatant.name,
                        initiative: data.initiative
                    }, true, false);
                }).catch(error => {
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Error importing CombatTracker", error, true, false);
                });
            },
            ['combat']
        );

        const createCombatHookId = HookManager.registerHook(
            "createCombat",
            async (combat) => {
                // Import and call the real CombatTracker functionality
                import('./combat-tracker.js').then(({ CombatTracker }) => {
                    // Reset first combatant flag when a new combat is created
                    CombatTracker._hasSetFirstCombatant = false;
                    
                    // Auto-open combat tracker when combat is created
                    if (game.settings.get(MODULE.ID, 'combatTrackerOpen')) {
                        // Check if this user owns any combatants in the combat
                        if (combat.combatants.find(c => c.isOwner)) {
                            const tabApp = ui["combat"];
                            tabApp.renderPopout(tabApp);
                        }
                    }
                    
                    postConsoleAndNotification(MODULE.NAME, "HookManager: New combat created", "", true, false);
                }).catch(error => {
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Error importing CombatTracker", error, true, false);
                });
            },
            ['combat']
        );

        const deleteCombatHookId = HookManager.registerHook(
            "deleteCombat",
            () => {
                // TODO: Import and call CombatTracker methods when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Combat deleted", "", true, false);
            },
            ['combat']
        );

        const endCombatHookId = HookManager.registerHook(
            "endCombat",
            () => {
                // TODO: Import and call CombatTracker methods when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Combat ended", "", true, false);
            },
            ['combat']
        );

        const combatStartHookId = HookManager.registerHook(
            "combatStart",
            (combat) => {
                // TODO: Import and call CombatTracker methods when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Combat started", "", true, false);
            },
            ['combat']
        );

        const updateCombatHookId = HookManager.registerHook(
            "updateCombat",
            (combat, changed, options, userId) => {
                // TODO: Import and call CombatTracker methods when needed
                postConsoleAndNotification(MODULE.NAME, "HookManager: Combat updated", {
                    round: changed.round,
                    userId: userId
                }, true, false);
            },
            ['combat']
        );

        const renderCombatTrackerHookId = HookManager.registerHook(
            "renderCombatTracker",
            (app, html) => {
                // Import and call the real combat tools functionality for health rings
                import('./combat-tools.js').then(({ CombatTools }) => {
                    // This will add health rings, portraits, and other visual elements
                    CombatTools._addCombatTrackerEnhancements(app, html);
                    
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Combat tracker rendered with enhancements", "", false, false);
                }).catch(error => {
                    postConsoleAndNotification(MODULE.NAME, "HookManager: Error importing CombatTools", error, true, false);
                });
            },
            ['combat']
        );

        // Update the logging message to reflect all consolidated hooks including global system hooks with names
        const allHookNames = Array.from(HookManager.hookRegistry.keys()).join(', ');
        postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered (including global system hooks): ${allHookNames}`,
            '',
            true,
            false
        );

        // Setup global console commands for easy access
        HookManager._setupConsoleCommands();
        
    } // End of _setupHooks method
    

    
    /**
     * Clean up all hooks
     */
    static cleanup() {
        // Clean up all registered hooks
        HookManager.hookRegistry.forEach((hookInfo, hookName) => {
            if (hookInfo.isActive) {
                Hooks.off(hookName, hookInfo.handler);
            }
        });
        
        // Clear all registries
        HookManager.hookRegistry.clear();
        HookManager.hookIds.clear();
        HookManager.instance = null;
        
        postConsoleAndNotification(
            MODULE.NAME,
            'HookManager cleaned up all hooks',
            { totalHooksCleaned: HookManager.hookRegistry.size },
            false,
            false
        );
    }
}


