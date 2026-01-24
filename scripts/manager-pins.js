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
     * @returns {Promise<PinData>}
     */
    static async update(pinId, patch, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const idx = pins.findIndex((p) => p.id === pinId);
        if (idx === -1) {
            throw new Error(`Pin not found: ${pinId}`);
        }
        const existing = pins[idx];
        const userId = game.user?.id ?? '';
        if (!this._canEdit(existing, userId)) {
            throw new Error('Permission denied: you cannot update this pin.');
        }
        const merged = foundry.utils.deepClone(existing);
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
        return pins.map((p) => foundry.utils.deepClone(p));
    }
}
