// ==================================================================
// ===== MANAGER-PINS – Pin lifecycle, CRUD, permissions, events ===
// ==================================================================
// Phase 1.2 & 1.3: PinManager. Uses pins-schema for validation/migration.
// Pins stored in scene.flags[MODULE.ID].pins[]. Event handler registration.
// No rendering here (Phase 2).
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import {
    PIN_SCHEMA_VERSION,
    applyDefaults,
    validatePinData,
    migrateAndValidatePins
} from './pins-schema.js';

const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    : 3;
const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
    : 0;

/** @typedef {{ id: string; x: number; y: number; size: { w: number; h: number }; style: object; text?: string; image?: string; config: object; moduleId: string; ownership: { default: number; users?: Record<string, number> }; version: number }} PinData */

/**
 * @typedef {Object} PinCreateOptions
 * @property {string} [sceneId]
 * @property {boolean} [silent]
 */

/**
 * @typedef {Object} PinUpdateOptions
 * @property {string} [sceneId]
 * @property {boolean} [silent]
 */

/**
 * @typedef {Object} PinDeleteOptions
 * @property {string} [sceneId]
 * @property {boolean} [silent]
 */

/**
 * @typedef {Object} PinGetOptions
 * @property {string} [sceneId]
 */

/**
 * @typedef {Object} PinListOptions
 * @property {string} [sceneId]
 * @property {string} [moduleId]
 * @property {string} [type] - Filter by pin type
 */

/**
 * @typedef {Object} PinEventHandlerOptions
 * @property {string} [pinId] - Handle events for a specific pin only
 * @property {string} [moduleId] - Handle events for pins created by this module
 * @property {string} [sceneId] - Scope to a specific scene
 * @property {AbortSignal} [signal] - Auto-remove handler on abort
 * @property {boolean} [dragEvents] - Opt in to dragStart/dragMove/dragEnd if you need them
 */

/**
 * @typedef {Object} PinEventHandler
 * @property {string} handlerId
 * @property {string} eventType
 * @property {Function} handler
 * @property {PinEventHandlerOptions} options
 * @property {number} registeredAt
 */

export class PinManager {
    static FLAG_KEY = 'pins';
    static SETTING_ALLOW_PLAYER_WRITES = 'pinsAllowPlayerWrites';

    // Event handler storage: Map<eventType, Set<handler>>
    static _eventHandlers = new Map();
    static _handlerCounter = 0;

    // Valid event types
    static VALID_EVENT_TYPES = Object.freeze([
        'hoverIn', 'hoverOut', 'click', 'doubleClick', 'rightClick', 'middleClick',
        'dragStart', 'dragMove', 'dragEnd'
    ]);
    
    // Context menu item storage: Map<itemId, menuItem>
    static _contextMenuItems = new Map();
    static _contextMenuItemCounter = 0;
    
    // GM proxy handler registration flag
    static _gmProxyHandlerRegistered = false;

    /**
     * Resolve scene by id or active canvas. Throws if not found.
     * @param {string} [sceneId]
     * @returns {Scene}
     */
    static _getScene(sceneId) {
        if (sceneId != null && sceneId !== '') {
            const scene = game.scenes?.get(sceneId) ?? null;
            if (!scene) {
                throw new Error(`Scene not found: ${sceneId}`);
            }
            return scene;
        }
        if (typeof canvas === 'undefined' || !canvas?.scene) {
            throw new Error('No active scene; pass sceneId or ensure canvas is ready.');
        }
        return canvas.scene;
    }

    /**
     * Find which scene contains a pin with the given ID.
     * Searches all scenes in the world.
     * @param {string} pinId - The pin ID to search for
     * @returns {string | null} - The scene ID containing the pin, or null if not found
     */
    static findSceneForPin(pinId) {
        if (!game.scenes) return null;
        
        for (const scene of game.scenes) {
            const pins = scene.getFlag(MODULE.ID, this.FLAG_KEY) || [];
            if (pins.some(p => p.id === pinId)) {
                return scene.id;
            }
        }
        
        return null;
    }

    /**
     * @param {PinData} pin
     * @param {string} userId
     * @returns {boolean}
     */
    static _canView(pin, userId) {
        if (game.user?.isGM) return true;
        const ow = pin.ownership ?? { default: NONE };
        const level = ow.users && typeof ow.users[userId] === 'number'
            ? ow.users[userId]
            : (typeof ow.default === 'number' ? ow.default : NONE);
        return level > NONE; // Must have at least LIMITED (1) to view
    }

    /**
     * @param {PinData} pin
     * @param {string} userId
     * @returns {boolean}
     */
    static _canEdit(pin, userId) {
        if (game.user?.isGM) return true;
        const allow = getSettingSafely(MODULE.ID, this.SETTING_ALLOW_PLAYER_WRITES, false);
        if (!allow) return false;
        const ow = pin.ownership ?? { default: NONE };
        const level = ow.users && typeof ow.users[userId] === 'number'
            ? ow.users[userId]
            : (typeof ow.default === 'number' ? ow.default : NONE);
        return level >= OWNER;
    }

    static _canCreate() {
        if (game.user?.isGM) return true;
        return !!getSettingSafely(MODULE.ID, this.SETTING_ALLOW_PLAYER_WRITES, false);
    }

    /**
     * Read pins from scene flags, migrate & validate, optionally persist repaired list.
     * @param {Scene} scene
     * @returns {PinData[]}
     */
    static _getScenePins(scene) {
        const raw = scene.getFlag(MODULE.ID, this.FLAG_KEY);
        const { pins, dropped, errors } = migrateAndValidatePins(raw);
        if (dropped > 0 && game.user?.isGM) {
            const toStore = pins.map(p => foundry.utils.deepClone(p));
            scene.setFlag(MODULE.ID, this.FLAG_KEY, toStore).catch((err) => {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Failed to persist repaired pins', err?.message ?? err, false, true);
            });
        }
        return pins;
    }

    static initialize() {
        // Register cleanup hook for module unload
        Hooks.once('ready', () => {
            Hooks.on('unloadModule', (moduleId) => {
                if (moduleId === MODULE.ID) {
                    this.cleanup();
                }
            });
        });
        
        // Scene change hooks are handled in blacksmith.js to avoid circular dependency
    }

    /**
     * Cleanup on module unload
     */
    static cleanup() {
        this.clearHandlers();
        this._handlerCounter = 0;
    }

    /**
     * Generate unique handler ID
     * @returns {string}
     */
    static _makeHandlerId() {
        return `pin_handler_${Date.now()}_${++this._handlerCounter}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * Register an event handler. Returns a disposer function.
     * @param {string} eventType
     * @param {Function} handler
     * @param {PinEventHandlerOptions} [options]
     * @returns {() => void}
     */
    static registerHandler(eventType, handler, options = {}) {
        if (!this.VALID_EVENT_TYPES.includes(eventType)) {
            throw new Error(`Invalid event type: ${eventType}. Valid types: ${this.VALID_EVENT_TYPES.join(', ')}`);
        }
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }

        const handlerId = this._makeHandlerId();
        const handlerRecord = {
            handlerId,
            eventType,
            handler,
            options: { ...options },
            registeredAt: Date.now()
        };

        if (!this._eventHandlers.has(eventType)) {
            this._eventHandlers.set(eventType, new Set());
        }
        this._eventHandlers.get(eventType).add(handlerRecord);

        // Handle AbortSignal cleanup
        if (options.signal) {
            if (options.signal.aborted) {
                this._removeHandler(eventType, handlerId);
                return () => {};
            }
            options.signal.addEventListener('abort', () => {
                this._removeHandler(eventType, handlerId);
            });
        }

        // Return disposer function
        return () => {
            this._removeHandler(eventType, handlerId);
        };
    }

    /**
     * Remove a handler by ID
     * @param {string} eventType
     * @param {string} handlerId
     * @private
     */
    static _removeHandler(eventType, handlerId) {
        const handlers = this._eventHandlers.get(eventType);
        if (!handlers) return;
        for (const h of handlers) {
            if (h.handlerId === handlerId) {
                handlers.delete(h);
                break;
            }
        }
        if (handlers.size === 0) {
            this._eventHandlers.delete(eventType);
        }
    }

    /**
     * Invoke handlers for an event. Used by rendering system (Phase 3).
     * @param {string} eventType
     * @param {import('./pins-schema.js').PinData} pin
     * @param {string} sceneId
     * @param {string} userId
     * @param {Object} modifiers
     * @param {PIXI.FederatedPointerEvent} originalEvent
     * @private
     */
    static _invokeHandlers(eventType, pin, sceneId, userId, modifiers, originalEvent) {
        const handlers = this._eventHandlers.get(eventType);
        if (!handlers || handlers.size === 0) return;

        const eventData = {
            type: eventType,
            pin: foundry.utils.deepClone(pin),
            sceneId,
            userId,
            modifiers: { ...modifiers },
            originalEvent
        };

        const toRemove = [];
        for (const h of handlers) {
            // Check filters
            if (h.options.pinId && h.options.pinId !== pin.id) continue;
            if (h.options.moduleId && h.options.moduleId !== pin.moduleId) continue;
            if (h.options.sceneId && h.options.sceneId !== sceneId) continue;

            // Check if handler wants drag events
            if (['dragStart', 'dragMove', 'dragEnd'].includes(eventType) && !h.options.dragEvents) {
                continue;
            }

            // Check AbortSignal
            if (h.options.signal?.aborted) {
                toRemove.push(h.handlerId);
                continue;
            }

            try {
                h.handler(eventData);
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                postConsoleAndNotification(
                    MODULE.NAME,
                    `BLACKSMITH | PINS Error in event handler for ${eventType}`,
                    errMsg,
                    false,
                    true
                );
                console.error(`BLACKSMITH | PINS Error in event handler ${h.handlerId} for ${eventType}:`, error);
            }
        }

        // Clean up aborted handlers
        for (const id of toRemove) {
            this._removeHandler(eventType, id);
        }
    }

    /**
     * Register a context menu item. Returns a disposer function.
     * @param {string} itemId - Unique identifier for the menu item
     * @param {Object} itemData - Menu item configuration
     * @param {string} itemData.name - Display name
     * @param {string} itemData.icon - Font Awesome icon HTML or class string
     * @param {Function} itemData.onClick - Callback function (receives pinData)
     * @param {string} [itemData.moduleId] - Only show for pins from this module
     * @param {number} [itemData.order] - Order in menu (lower = higher, default: 999)
     * @param {Function|boolean} [itemData.visible] - Visibility function or boolean (default: true)
     * @returns {() => void} - Disposer function to unregister
     */
    static registerContextMenuItem(itemId, itemData) {
        if (!itemId || typeof itemId !== 'string') {
            throw new Error('Context menu itemId must be a non-empty string');
        }
        if (!itemData || typeof itemData !== 'object') {
            throw new Error('Context menu itemData must be an object');
        }
        if (!itemData.name || typeof itemData.name !== 'string') {
            throw new Error('Context menu item must have a name');
        }
        if (typeof itemData.onClick !== 'function') {
            throw new Error('Context menu item must have an onClick function');
        }
        
        const menuItem = {
            itemId,
            name: itemData.name,
            icon: itemData.icon || '<i class="fa-solid fa-circle"></i>',
            onClick: itemData.onClick,
            moduleId: itemData.moduleId,
            order: typeof itemData.order === 'number' ? itemData.order : 999,
            visible: itemData.visible !== undefined ? itemData.visible : true
        };
        
        this._contextMenuItems.set(itemId, menuItem);
        
        // Return disposer function
        return () => {
            this._contextMenuItems.delete(itemId);
        };
    }
    
    /**
     * Unregister a context menu item
     * @param {string} itemId
     * @returns {boolean} - Success status
     */
    static unregisterContextMenuItem(itemId) {
        return this._contextMenuItems.delete(itemId);
    }
    
    /**
     * Get all context menu items for a pin (filtered by moduleId, visible, etc.)
     * @param {PinData} pinData
     * @param {string} userId
     * @returns {Array} - Sorted array of menu items
     */
    static getContextMenuItems(pinData, userId) {
        const items = [];
        
        // Add registered items (filtered by moduleId and visible)
        for (const [itemId, item] of this._contextMenuItems.entries()) {
            // Filter by moduleId if specified
            if (item.moduleId && item.moduleId !== pinData.moduleId) {
                continue;
            }
            
            // Check visibility
            const isVisible = typeof item.visible === 'function' 
                ? item.visible(pinData, userId)
                : item.visible;
            if (!isVisible) {
                continue;
            }
            
            items.push({
                itemId,
                name: item.name,
                icon: item.icon,
                onClick: () => item.onClick(pinData),
                order: item.order
            });
        }
        
        // Sort by order (lower numbers first)
        items.sort((a, b) => a.order - b.order);
        
        return items;
    }
    
    /**
     * Remove all handlers (cleanup)
     * @param {string} [context] - Optional context filter (not used yet, for future batch cleanup)
     */
    static clearHandlers(context) {
        if (context) {
            // Future: support context-based cleanup
            return;
        }
        this._eventHandlers.clear();
    }

    /**
     * Check if a pin exists on a scene.
     * @param {string} pinId - The pin ID to check
     * @param {PinGetOptions} [options] - Optional sceneId to check specific scene
     * @returns {boolean} - True if pin exists, false otherwise
     */
    static exists(pinId, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        return pins.some((p) => p.id === pinId);
    }

    /**
     * @param {Partial<PinData> & { id: string; x: number; y: number; moduleId: string }} pinData
     * @param {PinCreateOptions} [options]
     * @returns {Promise<PinData>}
     */
    /**
     * Resolve ownership for a pin using hooks or default
     * @param {Object} context - Context for ownership resolution
     * @param {string} context.moduleId - Module creating the pin
     * @param {string} context.userId - User creating the pin
     * @param {string} context.sceneId - Scene ID
     * @param {Record<string, unknown>} [context.metadata] - Additional metadata
     * @param {Object} [providedOwnership] - Ownership provided in pinData (takes precedence)
     * @returns {Object} - Ownership object
     * @private
     */
    static _resolveOwnership(context, providedOwnership = null) {
        // If ownership is explicitly provided, use it
        if (providedOwnership != null && typeof providedOwnership === 'object') {
            return providedOwnership;
        }
        
        // Call ownership resolver hook
        const hookResult = Hooks.call('blacksmith.pins.resolveOwnership', context);
        
        // If hook returns ownership, use it
        if (hookResult != null && typeof hookResult === 'object' && !Array.isArray(hookResult)) {
            return hookResult;
        }
        
        // Default: GM-only (NONE for all users)
        return { default: NONE };
    }

    static async create(pinData, options = {}) {
        const scene = this._getScene(options.sceneId);
        if (!this._canCreate()) {
            throw new Error('Permission denied: only GMs can create pins unless pinsAllowPlayerWrites is enabled.');
        }
        const validated = validatePinData(applyDefaults(pinData));
        if (!validated.ok) {
            throw new Error(validated.error);
        }
        const pin = validated.pin;
        
        // Resolve ownership using hook if not explicitly provided
        const context = {
            moduleId: pin.moduleId,
            userId: game.user?.id || '',
            sceneId: scene.id,
            metadata: pin.config || {}
        };
        pin.ownership = this._resolveOwnership(context, pin.ownership);
        
        const pins = this._getScenePins(scene);
        if (pins.some((p) => p.id === pin.id)) {
            throw new Error(`A pin with id "${pin.id}" already exists on this scene.`);
        }
        const next = [...pins, foundry.utils.deepClone(pin)];
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        
        // Update renderer if on current scene (dynamic import to avoid circular dependency)
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                // Ensure system is initialized
                if (!PinRenderer.getContainer()) {
                    // System not ready yet - pin will be loaded when scene activates
                    return;
                }
                await PinRenderer.updatePin(pin);
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error updating renderer after create:', err);
            });
        }
        
        return foundry.utils.deepClone(pin);
    }

    /**
     * @param {string} pinId
     * @param {Partial<PinData>} patch
     * @param {PinUpdateOptions} [options]
     * @returns {Promise<PinData | null>} Returns null if pin not found (allows graceful handling)
     */
    static async update(pinId, patch, options = {}) {
        let scene = options.sceneId ? this._getScene(options.sceneId) : null;
        let pins = scene ? this._getScenePins(scene) : [];
        let idx = pins.findIndex((p) => p.id === pinId);
        
        // If pin not found and no sceneId specified, try to find it across all scenes
        if (idx === -1 && !options.sceneId) {
            const foundSceneId = this.findSceneForPin(pinId);
            if (foundSceneId) {
                scene = this._getScene(foundSceneId);
                pins = this._getScenePins(scene);
                idx = pins.findIndex((p) => p.id === pinId);
            }
        }
        
        // If pin not found on specified scene, try to find it on any scene
        if (idx === -1 && options.sceneId) {
            const foundSceneId = this.findSceneForPin(pinId);
            if (foundSceneId && foundSceneId !== options.sceneId) {
                // Pin exists on a different scene - update it there instead
                scene = this._getScene(foundSceneId);
                pins = this._getScenePins(scene);
                idx = pins.findIndex((p) => p.id === pinId);
            }
        }
        
        // If pin still not found, return null instead of throwing (allows graceful handling by calling modules)
        if (idx === -1) {
            // Return null instead of throwing - allows calling modules to handle missing pins gracefully
            // This prevents errors when pins are deleted or moved between scenes
            console.warn(`BLACKSMITH | PINS Pin not found: ${pinId}${options.sceneId ? ` on scene ${options.sceneId}` : ''}. Returning null.`);
            return null;
        }
        const existing = pins[idx];
        const userId = game.user?.id ?? '';
        if (!this._canEdit(existing, userId)) {
            throw new Error('Permission denied: you cannot update this pin.');
        }
        const merged = foundry.utils.deepClone(existing);
        
        // If ownership is being updated, resolve it using hook
        if (patch.ownership !== undefined) {
            const context = {
                moduleId: existing.moduleId,
                userId: game.user?.id || '',
                sceneId: scene.id,
                metadata: existing.config || {}
            };
            merged.ownership = this._resolveOwnership(context, patch.ownership);
        }
        if (patch.x != null && Number.isFinite(patch.x)) merged.x = patch.x;
        if (patch.y != null && Number.isFinite(patch.y)) merged.y = patch.y;
        if (patch.size != null && typeof patch.size === 'object') {
            merged.size = { ...merged.size, ...patch.size };
        }
        if (patch.style != null && typeof patch.style === 'object') {
            merged.style = { ...merged.style, ...patch.style };
        }
        if (patch.text !== undefined) merged.text = patch.text ? String(patch.text).trim() : undefined;
        if (patch.image !== undefined) merged.image = patch.image ? String(patch.image).trim() : undefined;
        if (patch.config != null && typeof patch.config === 'object' && !Array.isArray(patch.config)) {
            merged.config = { ...merged.config, ...patch.config };
        }
        if (patch.ownership != null && typeof patch.ownership === 'object') {
            merged.ownership = { ...merged.ownership, ...patch.ownership };
        }
        const validated = validatePinData(merged);
        if (!validated.ok) {
            throw new Error(validated.error);
        }
        const updated = validated.pin;
        const next = [...pins];
        next[idx] = foundry.utils.deepClone(updated);
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        
        // Fire hook so modules can sync their data (e.g. note flags, UI) after pin update or configure save
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.updated', {
                pinId,
                sceneId: scene.id,
                moduleId: updated.moduleId ?? existing.moduleId,
                type: updated.type ?? existing.type,
                patch,
                pin: foundry.utils.deepClone(updated)
            });
        }
        
        // Update renderer if on current scene (dynamic import to avoid circular dependency)
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                // Ensure system is initialized
                if (!PinRenderer.getContainer()) {
                    // System not ready yet - pin will be loaded when scene activates
                    return;
                }
                await PinRenderer.updatePin(updated);
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error updating renderer after update:', err);
            });
        }
        
        return foundry.utils.deepClone(updated);
    }

    /**
     * @param {string} pinId
     * @param {PinDeleteOptions} [options]
     * @returns {Promise<void>}
     */
    static async delete(pinId, options = {}) {
        let sceneId = options.sceneId;
        
        // If no sceneId provided, try to find which scene has this pin
        if (!sceneId) {
            sceneId = this.findSceneForPin(pinId);
            if (!sceneId) {
                throw new Error(`Pin not found: ${pinId} (searched all scenes)`);
            }
        }
        
        const scene = this._getScene(sceneId);
        const pins = this._getScenePins(scene);
        const idx = pins.findIndex((p) => p.id === pinId);
        if (idx === -1) {
            throw new Error(`Pin not found: ${pinId} in scene ${sceneId}`);
        }
        const existing = pins[idx];
        const userId = game.user?.id ?? '';
        if (!this._canEdit(existing, userId)) {
            throw new Error('Permission denied: you cannot delete this pin.');
        }
        const next = pins.filter((p) => p.id !== pinId);
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        
        // Fire hook so modules can sync their data (e.g. clear note pin flags, refresh UI)
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.deleted', {
                pinId,
                sceneId: scene.id,
                moduleId: existing.moduleId ?? undefined,
                type: existing.type ?? undefined,
                pin: foundry.utils.deepClone(existing),
                config: existing.config ?? undefined
            });
        }
        
        // Update renderer if on current scene (dynamic import to avoid circular dependency)
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(({ PinRenderer }) => {
                PinRenderer.removePin(pinId);
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error removing pin from renderer:', err);
            });
        }
    }

    /**
     * @param {string} pinId
     * @param {PinGetOptions} [options]
     * @returns {PinData | null}
     */
    static get(pinId, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const pin = pins.find((p) => p.id === pinId) ?? null;
        if (!pin) return null;
        const userId = game.user?.id ?? '';
        if (!this._canView(pin, userId)) return null;
        return foundry.utils.deepClone(pin);
    }

    /**
     * @param {PinListOptions} [options]
     * @returns {PinData[]}
     */
    static list(options = {}) {
        const scene = this._getScene(options.sceneId);
        let pins = this._getScenePins(scene);
        const userId = game.user?.id ?? '';
        pins = pins.filter((p) => this._canView(p, userId));
        if (options.moduleId != null && options.moduleId !== '') {
            pins = pins.filter((p) => p.moduleId === options.moduleId);
        }
        if (options.type != null && options.type !== '') {
            pins = pins.filter((p) => (p.type || 'default') === options.type);
        }
        return pins.map((p) => foundry.utils.deepClone(p));
    }

    /**
     * Delete all pins from a scene (GM only)
     * @param {Object} [options]
     * @param {string} [options.sceneId] - Target scene; defaults to active scene
     * @param {string} [options.moduleId] - Filter by module ID (optional)
     * @param {boolean} [options.silent] - Skip event emission
     * @returns {Promise<number>} - Number of pins deleted
     */
    static async deleteAll(options = {}) {
        if (!game.user?.isGM) {
            throw new Error('Permission denied: only GMs can delete all pins.');
        }

        const scene = this._getScene(options.sceneId);
        let pins = this._getScenePins(scene);
        
        // Filter by moduleId if provided
        if (options.moduleId != null && options.moduleId !== '') {
            pins = pins.filter((p) => p.moduleId === options.moduleId);
        }
        
        const count = pins.length;

        if (count === 0) {
            return 0;
        }

        // If filtering by moduleId, remove only those pins; otherwise clear all
        if (options.moduleId != null && options.moduleId !== '') {
            const pinIdsToDelete = new Set(pins.map(p => p.id));
            const remainingPins = this._getScenePins(scene).filter((p) => !pinIdsToDelete.has(p.id));
            await scene.setFlag(MODULE.ID, this.FLAG_KEY, remainingPins);
        } else {
            // Clear all pins
            await scene.setFlag(MODULE.ID, this.FLAG_KEY, []);
        }

        // Remove from renderer
        const { PinRenderer } = await import('./pins-renderer.js');
        for (const pin of pins) {
            PinRenderer.removePin(pin.id);
        }

        // Emit event if not silent
        if (!options.silent) {
            Hooks.callAll('blacksmith.pins.deletedAll', { sceneId: scene.id, moduleId: options.moduleId, count });
        }

        return count;
    }

    /**
     * Delete all pins of a specific type from a scene (GM only)
     * @param {string} type - Pin type to delete
     * @param {Object} [options]
     * @param {string} [options.sceneId] - Target scene; defaults to active scene
     * @param {string} [options.moduleId] - Filter by module ID (optional)
     * @param {boolean} [options.silent] - Skip event emission
     * @returns {Promise<number>} - Number of pins deleted
     */
    static async deleteAllByType(type, options = {}) {
        if (!game.user?.isGM) {
            throw new Error('Permission denied: only GMs can delete pins by type.');
        }

        if (!type || typeof type !== 'string') {
            throw new Error('Type must be a non-empty string.');
        }

        const scene = this._getScene(options.sceneId);
        let pins = this._getScenePins(scene);
        
        // Filter pins by type (use 'default' if type is not set)
        let pinsToDelete = pins.filter((p) => (p.type || 'default') === type);
        
        // Filter by moduleId if provided
        if (options.moduleId != null && options.moduleId !== '') {
            pinsToDelete = pinsToDelete.filter((p) => p.moduleId === options.moduleId);
        }
        
        const count = pinsToDelete.length;

        if (count === 0) {
            return 0;
        }

        // Remove pins from array
        const pinIdsToDelete = new Set(pinsToDelete.map(p => p.id));
        const remainingPins = pins.filter((p) => !pinIdsToDelete.has(p.id));

        // Save updated pins
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, remainingPins);

        // Remove from renderer
        const { PinRenderer } = await import('./pins-renderer.js');
        for (const pin of pinsToDelete) {
            PinRenderer.removePin(pin.id);
        }

        // Emit event if not silent
        if (!options.silent) {
            Hooks.callAll('blacksmith.pins.deletedAllByType', { sceneId: scene.id, type, moduleId: options.moduleId, count });
        }

        return count;
    }

    /**
     * Create a pin as GM (bypasses permission checks, executes on GM client)
     * @param {string} sceneId - Target scene
     * @param {Partial<PinData> & { id: string; x: number; y: number; moduleId: string }} pinData - Pin data
     * @param {PinCreateOptions} [options] - Additional options
     * @returns {Promise<PinData>} - Created pin data
     */
    static async createAsGM(sceneId, pinData, options = {}) {
        if (!game.user?.isGM) {
            throw new Error('Permission denied: only GMs can use createAsGM.');
        }
        return this.create(pinData, { ...options, sceneId });
    }

    /**
     * Update a pin as GM (bypasses permission checks, executes on GM client)
     * @param {string} sceneId - Target scene
     * @param {string} pinId - Pin ID to update
     * @param {Partial<PinData>} patch - Update patch
     * @param {PinUpdateOptions} [options] - Additional options
     * @returns {Promise<PinData | null>} - Updated pin data or null if not found
     */
    static async updateAsGM(sceneId, pinId, patch, options = {}) {
        if (!game.user?.isGM) {
            throw new Error('Permission denied: only GMs can use updateAsGM.');
        }
        return this.update(pinId, patch, { ...options, sceneId });
    }

    /**
     * Delete a pin as GM (bypasses permission checks, executes on GM client)
     * @param {string} sceneId - Target scene
     * @param {string} pinId - Pin ID to delete
     * @param {PinDeleteOptions} [options] - Additional options
     * @returns {Promise<void>}
     */
    static async deleteAsGM(sceneId, pinId, options = {}) {
        if (!game.user?.isGM) {
            throw new Error('Permission denied: only GMs can use deleteAsGM.');
        }
        return this.delete(pinId, { ...options, sceneId });
    }

    /**
     * Request GM to perform a pin action (for non-GM users)
     * Uses socket system to forward request to GM
     * @param {string} action - Action type: 'create', 'update', or 'delete'
     * @param {Object} params - Action parameters
     * @param {string} params.sceneId - Target scene
     * @param {string} [params.pinId] - Pin ID (for update/delete)
     * @param {Object} [params.payload] - Pin data (for create)
     * @param {Object} [params.patch] - Update patch (for update)
     * @returns {Promise<PinData | number | void>} - Result depends on action type
     */
    static async requestGM(action, params) {
        if (game.user?.isGM) {
            // If caller is already GM, execute directly
            switch (action) {
                case 'create':
                    return this.createAsGM(params.sceneId, params.payload, params.options);
                case 'update':
                    return this.updateAsGM(params.sceneId, params.pinId, params.patch, params.options);
                case 'delete':
                    return this.deleteAsGM(params.sceneId, params.pinId, params.options);
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        }

        // Check if any GM is online
        const gms = game.users?.filter(u => u.isGM && u.active) || [];
        if (gms.length === 0) {
            throw new Error('No GM is currently online to process this request.');
        }

        // Use socket to request GM action
        const { SocketManager } = await import('./manager-sockets.js');
        await SocketManager.waitForReady();
        const socket = SocketManager.getSocket();
        
        if (!socket) {
            throw new Error('Socket system not available.');
        }

        // Register handler once if not already registered
        const handlerName = 'blacksmith-pins-gm-proxy';
        if (!this._gmProxyHandlerRegistered && socket.register) {
            socket.register(handlerName, async (data) => {
                if (!game.user?.isGM) {
                    return { error: 'Permission denied: only GMs can execute pin actions.' };
                }

                try {
                    switch (data.action) {
                        case 'create':
                            const created = await this.createAsGM(data.params.sceneId, data.params.payload, data.params.options || {});
                            return { success: true, data: created };
                        case 'update':
                            const updated = await this.updateAsGM(data.params.sceneId, data.params.pinId, data.params.patch, data.params.options || {});
                            return { success: true, data: updated };
                        case 'delete':
                            await this.deleteAsGM(data.params.sceneId, data.params.pinId, data.params.options || {});
                            return { success: true };
                        default:
                            return { error: `Unknown action: ${data.action}` };
                    }
                } catch (err) {
                    return { error: err.message || String(err) };
                }
            });
            this._gmProxyHandlerRegistered = true;
        }

        // Execute on GM using socket
        if (socket.executeAsGM) {
            const result = await socket.executeAsGM(handlerName, {
                action,
                params
            });
            
            if (result?.error) {
                throw new Error(result.error);
            }
            
            return result?.data;
        } else {
            // Fallback: emit to all and let GM handle it
            socket.emit(handlerName, { action, params });
            throw new Error('GM proxy requires SocketLib with executeAsGM support.');
        }
    }

    /**
     * Reconcile module-tracked pin IDs with actual pins on canvas
     * Helps modules repair broken links between their data and pins
     * @param {Object} options
     * @param {string | string[]} [options.sceneId] - Scene ID(s) to reconcile (defaults to active scene)
     * @param {string} options.moduleId - Module ID to filter pins
     * @param {Array} options.items - Array of items that track pin IDs
     * @param {Function} options.getPinId - Function to get pinId from item: (item) => string | null
     * @param {Function} options.setPinId - Function to set pinId on item: (item, pinId) => void
     * @param {Function} [options.setSceneId] - Optional: Function to set sceneId on item: (item, sceneId) => void
     * @param {Function} [options.setPosition] - Optional: Function to set position on item: (item, x, y) => void
     * @returns {Promise<{ linked: number; unlinked: number; repaired: number; errors: string[] }>}
     */
    static async reconcile(options) {
        const { sceneId, moduleId, items, getPinId, setPinId, setSceneId, setPosition } = options;
        
        if (!moduleId || typeof moduleId !== 'string') {
            throw new Error('moduleId is required and must be a string.');
        }
        if (!Array.isArray(items)) {
            throw new Error('items must be an array.');
        }
        if (typeof getPinId !== 'function') {
            throw new Error('getPinId must be a function.');
        }
        if (typeof setPinId !== 'function') {
            throw new Error('setPinId must be a function.');
        }

        const sceneIds = Array.isArray(sceneId) ? sceneId : (sceneId ? [sceneId] : [canvas?.scene?.id].filter(Boolean));
        if (sceneIds.length === 0) {
            throw new Error('No scene ID provided and no active scene.');
        }

        const results = {
            linked: 0,
            unlinked: 0,
            repaired: 0,
            errors: []
        };

        // Get all pins for the module across specified scenes
        const allPins = new Map(); // pinId -> { pin, sceneId }
        for (const sid of sceneIds) {
            try {
                const scene = this._getScene(sid);
                const scenePins = this._getScenePins(scene);
                // Filter by moduleId and user visibility
                const userId = game.user?.id ?? '';
                const visiblePins = scenePins.filter((p) => {
                    if (p.moduleId !== moduleId) return false;
                    return this._canView(p, userId);
                });
                for (const pin of visiblePins) {
                    allPins.set(pin.id, { pin, sceneId: sid });
                }
            } catch (err) {
                results.errors.push(`Error reading scene ${sid}: ${err.message}`);
            }
        }

        // Process each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                const trackedPinId = getPinId(item);
                
                if (!trackedPinId) {
                    // Item doesn't track a pin - check if it should (optional repair)
                    continue;
                }

                const pinData = allPins.get(trackedPinId);
                
                if (!pinData) {
                    // Pin doesn't exist - unlink
                    setPinId(item, null);
                    if (setSceneId) setSceneId(item, null);
                    results.unlinked++;
                } else {
                    // Pin exists - ensure item is properly linked
                    results.linked++;
                    
                    // Optional: Repair sceneId if provided
                    if (setSceneId && pinData.sceneId) {
                        const currentSceneId = typeof item.sceneId === 'string' ? item.sceneId : null;
                        if (currentSceneId !== pinData.sceneId) {
                            setSceneId(item, pinData.sceneId);
                            results.repaired++;
                        }
                    }
                    
                    // Optional: Repair position if provided
                    if (setPosition && pinData.pin.x != null && pinData.pin.y != null) {
                        setPosition(item, pinData.pin.x, pinData.pin.y);
                        results.repaired++;
                    }
                }
            } catch (err) {
                results.errors.push(`Error processing item ${i}: ${err.message}`);
            }
        }

        // Check for orphaned pins (pins that exist but aren't tracked by any item)
        // This is informational only - we don't auto-delete orphaned pins
        const trackedPinIds = new Set(items.map(item => getPinId(item)).filter(Boolean));
        const orphanedPins = Array.from(allPins.keys()).filter(pid => !trackedPinIds.has(pid));
        
        if (orphanedPins.length > 0 && game.user?.isGM) {
            // Log orphaned pins for GM awareness (but don't auto-delete)
            console.log(`BLACKSMITH | PINS Reconcile: Found ${orphanedPins.length} orphaned pin(s) for module ${moduleId}`, orphanedPins);
        }

        return results;
    }
}
