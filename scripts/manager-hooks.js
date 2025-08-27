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

        
        // Update the logging message to reflect all consolidated hooks
        postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered`,
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

        // Update the logging message to reflect all consolidated hooks including global system hooks
        postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered (including global system hooks)`,
            '',
            true,
            false
        );

        
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


