/**
 * HookManager - Simple Orchestration Layer
 * Registers hooks and provides cleanup - no business logic
 */
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

export class HookManager {
    static hooks = new Map(); // hookName -> { hookId, callbacks: [], registeredAt }
    static contexts = new Map(); // context -> Set(callbackId)
    
    /**
     * Generate unique callback ID
     */
    static _makeCallbackId(name) {
        return `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    
    /**
     * Register a hook with a callback
     * @param {Object} options - Hook registration options
     * @param {string} options.name - FoundryVTT hook name
     * @param {string} options.description - Optional description for debugging
     * @param {number} options.priority - Priority level (1-5, default: 3)
     * @param {Function} options.callback - Your callback function
     * @param {Object} options.options - Additional options (e.g., { once: true, throttleMs: 50 })
     * @param {string} options.key - Optional dedupe key to prevent duplicate registrations
     * @param {string} options.context - Optional context for batch cleanup
     * @returns {string} callbackId for cleanup
     */
    static registerHook({ name, description = '', priority = 3, callback, options = {}, key, context }) {
        if (!name || typeof name !== 'string') {
            throw new Error(`HookManager: name must be a string for ${name}`);
        }
        
        if (typeof callback !== 'function') {
            throw new Error(`HookManager: callback must be a function for ${name}`);
        }
        
        // Check for dedupe if key provided
        if (key && this.hooks.has(name)) {
            const existing = this.hooks.get(name).callbacks.find(cb => cb.key === key);
            if (existing) return existing.callbackId;
        }
        
        // Create wrapper once per hook name
        if (!this.hooks.has(name)) {
            const hookRunner = (...args) => {
                const entry = this.hooks.get(name);
                if (!entry) return;
                
                // Create stable copy (already sorted on insert)
                const list = entry.callbacks.slice();
                
                // Collect callbacks to remove (don't mutate during iteration)
                const toRemove = [];
                
                for (const cb of list) {
                    try {
                        cb.callback(...args);
                        if (cb.options?.once) {
                            toRemove.push(cb.callbackId);
                        }
                    } catch (error) {
                        console.error(`Hook callback error in ${name}:`, error);
                    }
                }
                
                // Cleanup "once" hooks after iteration
                for (const id of toRemove) {
                    this.removeCallback(id);
                }
            };
            
            const hookId = Hooks.on(name, hookRunner);
            this.hooks.set(name, { hookId, callbacks: [], registeredAt: Date.now() });
        }
        
        const entry = this.hooks.get(name);
        const callbackId = this._makeCallbackId(name);
        
        // Apply throttle/debounce if specified
        let finalCallback = callback;
        let teardown = () => {};
        
        if (options.throttleMs) {
            let last = 0;
            finalCallback = (...args) => {
                const now = Date.now();
                if (now - last >= options.throttleMs) {
                    last = now;
                    callback(...args);
                }
            };
            // Throttling as written has no timer, so no teardown needed
        } else if (options.debounceMs) {
            let timeout;
            finalCallback = (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => callback(...args), options.debounceMs);
            };
            teardown = () => { clearTimeout(timeout); };
        }
        
        const callbackRecord = {
            callbackId,
            callback: finalCallback,
            description,
            priority,
            registeredAt: Date.now(),
            options,
            key,
            teardown
        };
        
        entry.callbacks.push(callbackRecord);
        
        // Sort by priority, then by registration time for stability
        entry.callbacks.sort((a, b) => a.priority - b.priority || a.registeredAt - b.registeredAt);
        
        // Store context for batch cleanup
        if (context) {
            if (!this.contexts.has(context)) {
                this.contexts.set(context, new Set());
            }
            this.contexts.get(context).add(callbackId);
        }
        
        // Logging hook registration
        postConsoleAndNotification(
            MODULE.NAME,
            `Hook registered: ${name}`,
            { description, priority, totalCallbacks: entry.callbacks.length },
            true,
            false
        );
        
        return callbackId;
    }
    
    /**
     * Remove a specific hook
     * @param {string} hookName - Hook to remove
     * @returns {boolean} Success status
     */
    static removeHook(hookName) {
        const hook = this.hooks.get(hookName);
        if (!hook) return false;
        
        // Remove all callbacks from contexts
        hook.callbacks.forEach(cb => {
            this._removeFromContexts(cb.callbackId);
        });
        
        Hooks.off(hookName, hook.hookId);
        this.hooks.delete(hookName);
        
        
        postConsoleAndNotification(
            MODULE.NAME,
            `Hook removed: ${hookName}`,
            { totalHooks: this.hooks.size },
            true,
            false
        );
    }


    /**
     * Remove a specific callback by its ID
     * @param {string} callbackId - The callback ID returned from registerHook
     * @returns {boolean} Success status
     */
    static removeCallback(callbackId) {
        const hookName = callbackId.split('_')[0];
        const entry = this.hooks.get(hookName);
        if (!entry) return false;
        
        const idx = entry.callbacks.findIndex(cb => cb.callbackId === callbackId);
        if (idx === -1) return false;
        
        const cb = entry.callbacks[idx];
        
        // Call teardown to cancel pending timers
        try { 
            cb.teardown?.(); 
        } catch (error) {
            console.error(`Error in callback teardown for ${hookName}:`, error);
        }
        
        // Remove from contexts
        this._removeFromContexts(callbackId);
        
        // Remove the callback
        entry.callbacks.splice(idx, 1);
        
        // If no more callbacks, remove the entire hook
        if (entry.callbacks.length === 0) {
            Hooks.off(hookName, entry.hookId);
            this.hooks.delete(hookName);
            
            postConsoleAndNotification(
                MODULE.NAME,
                `Hook completely removed: ${hookName}`,
                { totalHooks: this.hooks.size },
                true,
                false
            );

        } else {

            postConsoleAndNotification(
                MODULE.NAME,
                `Callback removed from hook: ${hookName}`,
                { remainingCallbacks: entry.callbacks.length },
                true,
                false
            );

        }
        
        return true;
    }
    
    /**
     * Remove all callbacks for a specific context
     * @param {string} context - Context to cleanup
     */
    static disposeByContext(context) {
        const set = this.contexts.get(context);
        if (!set) return;
        
        for (const id of Array.from(set)) {
            this.removeCallback(id);
        }
        this.contexts.delete(context);
    }
    
    /**
     * Clean up all hooks
     */
    static cleanup() {
        this.hooks.forEach((hook, name) => {
            if (hook.hookId) {
                Hooks.off(name, hook.hookId);
            }
        });
        
        const totalCleaned = this.hooks.size;
        this.hooks.clear();
        this.contexts.clear();
        
        postConsoleAndNotification(
            MODULE.NAME,
            'All hooks cleaned up',
            { totalCleaned },
            false,
            false
        );
    }
    
    /**
     * Get hook statistics
     * @returns {Object} Hook statistics
     */
    static getStats() {
        return {
            totalHooks: this.hooks.size,
            totalContexts: this.contexts.size,
            hooks: Array.from(this.hooks.entries()).map(([name, hook]) => ({
                name,
                totalCallbacks: hook.callbacks.length,
                registeredAt: new Date(hook.registeredAt).toISOString()
            }))
        };
    }
    
    /**
     * Alias for getStats() to maintain compatibility
     */
    static getHookStats() {
        return this.getStats();
    }
    
    /**
     * Check if a hook is registered
     * @param {string} hookName - Hook to check
     * @returns {boolean} Is registered
     */
    static hasHook(hookName) {
        return this.hooks.has(hookName);
    }
    
    /**
     * Show detailed hook information with priority grouping
     */
    static showHookDetails() {
        const stats = this.getStats();
        console.group('COFFEE PUB • BLACKSMITH | HOOK MANAGER DETAILS');
        console.log('==========================================================');
        console.log(`Total Hooks: ${stats.totalHooks} | Active: ${stats.totalHooks} | Inactive: 0`);
        console.log('==========================================================');
        
        // Group by priority
        const byPriority = new Map();
        for (const [name, hook] of this.hooks.entries()) {
            hook.callbacks.forEach(cb => {
                if (!byPriority.has(cb.priority)) {
                    byPriority.set(cb.priority, []);
                }
                byPriority.get(cb.priority).push({ name, ...cb });
            });
        }
        
        // Display by priority (1-5)
        for (let priority = 1; priority <= 5; priority++) {
            const hooks = byPriority.get(priority);
            if (!hooks || hooks.length === 0) continue;
            
            const priorityName = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'LOWEST'][priority - 1];
            console.log(`\n${priorityName} PRIORITY (${priority})`);
            console.log('==================================================');
            
            hooks.forEach(({ name, description, callbackId, registeredAt }) => {
                const time = new Date(registeredAt).toLocaleTimeString();
                console.log(`ACTIVE ${name}`);
                console.log(`   ID: ${callbackId} | Priority: ${priority} | Categories: [general]`);
                console.log(`   Registered: ${time}`);
                console.log(`   Description: ${description || 'No description'}`);
            });
        }
        
        console.groupEnd();
    }
    
    /**
     * Show simple hook summary
     */
    static showHooks() {
        const stats = this.getStats();
        console.log(`COFFEE PUB • BLACKSMITH | Total Hooks: ${stats.totalHooks}`);
        console.log('Hook Names:', Array.from(this.hooks.keys()).join(', '));
    }
    
    /**
     * Get hooks by priority level
     */
    static getHooksByPriority(priority) {
        const result = [];
        for (const [name, hook] of this.hooks.entries()) {
            const callbacks = hook.callbacks.filter(cb => cb.priority === priority);
            if (callbacks.length > 0) {
                result.push({ name, callbacks });
            }
        }
        return result;
    }
    
    /**
     * Get hooks by category (placeholder for future categorization)
     */
    static getHooksByCategory(category) {
        // For now, return all hooks since we don't have category system yet
        const result = [];
        for (const [name, hook] of this.hooks.entries()) {
            result.push({ name, callbacks: hook.callbacks });
        }
        return result;
    }
    
    /**
     * Throttle utility function
     */
    static _throttle(fn, ms) {
        let last = 0;
        return (...args) => {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                fn(...args);
            }
        };
    }
    
    /**
     * Debounce utility function
     */
    static _debounce(fn, ms) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    }
    
    /**
     * Remove callback from all contexts
     */
    static _removeFromContexts(callbackId) {
        for (const [context, set] of this.contexts.entries()) {
            if (set.has(callbackId)) {
                set.delete(callbackId);
                if (set.size === 0) {
                    this.contexts.delete(context);
                }
                break;
            }
        }
    }
    
    /**
     * Initialize the HookManager and set up lifecycle hooks
     */
    static initialize() {
        // Set up auto-cleanup for common lifecycles
        Hooks.on('canvasTearDown', () => {
            const prev = canvas.scene?.id;
            if (prev) HookManager.disposeByContext(`scene:${prev}`);
        });

        Hooks.on('deleteToken', (_scene, data) => {
            HookManager.disposeByContext(`token:${data._id ?? data.id}`);
        });
        
        postConsoleAndNotification(
            MODULE.NAME,
            'Hook Manager | Initialization',
            'Initialized with console commands: blacksmithHooks(), blacksmithHookDetails(), blacksmithHookStats()',
            true,
            false
        );
        
        // Set up global console commands for easy access
        if (typeof window !== 'undefined') {
            // Internal debugging commands (keep these)
            window.blacksmithHooks = () => HookManager.showHooks();
            window.blacksmithHookDetails = () => HookManager.showHookDetails();
            window.blacksmithHookStats = () => HookManager.getStats();
            
            // Short aliases for quick debugging
            window.showHooks = () => HookManager.showHooks();
            window.showHookDetails = () => HookManager.showHookDetails();
            window.hookStats = () => HookManager.getStats();
        }
    }
}

/**
 * Context helpers for canonical context strings
 */
export const HookContext = {
    scene: (scene) => `scene:${scene?.id ?? canvas?.scene?.id}`,
    token: (token) => `token:${token?.id ?? token}`,
    journalPage: (journal, page) => `journal:${journal.id}#page:${page.id}`,
    app: (app) => `app:${app?.appId ?? app?.id ?? crypto.randomUUID()}`
};


