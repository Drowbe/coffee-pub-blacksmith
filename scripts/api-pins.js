// ==================================================================
// ===== API-PINS – Public API for Canvas Pins =====================
// ==================================================================
// Wraps PinManager to provide the public API surface for consumers.
// Follows the pattern of api-stats.js.
// ==================================================================

import { PinManager } from './manager-pins.js';

/** Module ID for availability checks. */
const MODULE_ID = 'coffee-pub-blacksmith';

/**
 * PinsAPI - Provides access to Blacksmith's canvas pins system
 */
export class PinsAPI {
    /**
     * Check whether the pins API is available (Blacksmith loaded, API exposed).
     * Use this before calling any other API when using from another module.
     * @returns {boolean}
     */
    static isAvailable() {
        return !!(typeof game !== 'undefined' && game?.modules?.get(MODULE_ID)?.api?.pins);
    }

    /**
     * Check whether the pins API is ready for create/list/reload: API available, canvas ready, and a scene active.
     * Use as a guard before create/update/delete/reload when not using `whenReady()`.
     * @returns {boolean}
     */
    static isReady() {
        if (!this.isAvailable()) return false;
        return !!(typeof canvas !== 'undefined' && canvas?.ready && canvas?.scene);
    }

    /**
     * Promise that resolves when the canvas is ready and a scene is active.
     * Use this from other modules before creating pins or calling reload (e.g. in init) to avoid timing issues.
     * If already ready, resolves immediately.
     * @returns {Promise<void>}
     */
    static whenReady() {
        if (this.isReady()) return Promise.resolve();
        return new Promise((resolve) => {
            if (typeof Hooks === 'undefined') {
                resolve();
                return;
            }
            Hooks.once('canvasReady', () => {
                resolve();
            });
        });
    }

    /**
     * Create a pin on the active scene.
     * @param {Partial<import('./manager-pins.js').PinData> & { id: string; x: number; y: number; moduleId: string }} pinData
     * @param {import('./manager-pins.js').PinCreateOptions} [options]
     * @returns {Promise<import('./manager-pins.js').PinData>}
     */
    static create(pinData, options) {
        return PinManager.create(pinData, options);
    }

    /**
     * Update properties for an existing pin.
     * @param {string} pinId
     * @param {Partial<import('./manager-pins.js').PinData>} patch
     * @param {import('./manager-pins.js').PinUpdateOptions} [options]
     * @returns {Promise<import('./manager-pins.js').PinData>}
     */
    static update(pinId, patch, options) {
        return PinManager.update(pinId, patch, options);
    }

    /**
     * Delete a pin from a scene.
     * @param {string} pinId
     * @param {import('./manager-pins.js').PinDeleteOptions} [options]
     * @returns {Promise<void>}
     */
    static delete(pinId, options) {
        return PinManager.delete(pinId, options);
    }

    /**
     * Get a single pin by id.
     * @param {string} pinId
     * @param {import('./manager-pins.js').PinGetOptions} [options]
     * @returns {import('./manager-pins.js').PinData | null}
     */
    static get(pinId, options) {
        return PinManager.get(pinId, options);
    }

    /**
     * List pins with filters.
     * @param {import('./manager-pins.js').PinListOptions} [options]
     * @returns {import('./manager-pins.js').PinData[]}
     */
    static list(options) {
        return PinManager.list(options);
    }

    /**
     * Register an event handler. Returns a disposer function.
     * 
     * @param {string} eventType - Event type: 'hoverIn', 'hoverOut', 'click', 'doubleClick', 'rightClick', 'middleClick', 'dragStart', 'dragMove', 'dragEnd'
     * @param {Function} handler - Callback function that receives PinEvent
     * @param {import('./manager-pins.js').PinEventHandlerOptions} [options]
     * @returns {() => void} - Disposer function to unregister the handler
     */
    static on(eventType, handler, options) {
        return PinManager.registerHandler(eventType, handler, options);
    }

    /**
     * Register a context menu item. Returns a disposer function.
     * 
     * @param {string} itemId - Unique identifier for the menu item
     * @param {Object} itemData - Menu item configuration
     * @param {string} itemData.name - Display name
     * @param {string} [itemData.icon] - Font Awesome icon HTML or class string
     * @param {Function} itemData.onClick - Callback function (receives pinData)
     * @param {string} [itemData.moduleId] - Only show for pins from this module
     * @param {number} [itemData.order] - Order in menu (lower = higher, default: 999)
     * @param {Function|boolean} [itemData.visible] - Visibility function or boolean (default: true)
     * @returns {() => void} - Disposer function to unregister
     */
    static registerContextMenuItem(itemId, itemData) {
        return PinManager.registerContextMenuItem(itemId, itemData);
    }

    /**
     * Unregister a context menu item
     * @param {string} itemId
     * @returns {boolean} - Success status
     */
    static unregisterContextMenuItem(itemId) {
        return PinManager.unregisterContextMenuItem(itemId);
    }

    /**
     * Reload pins from scene flags and re-render on the canvas.
     * Use from console when pins exist in data but don't appear (e.g. after refresh).
     * Does not use dynamic import – call via API only: `game.modules.get('coffee-pub-blacksmith')?.api?.pins?.reload()`.
     *
     * @param {{ sceneId?: string }} [options]
     * @returns {Promise<{ reloaded: number; containerReady: boolean; pinsInData: number; layerActive: boolean }>}
     */
    static async reload(options = {}) {
        const sceneId = options.sceneId ?? canvas?.scene?.id;
        if (!sceneId) {
            throw new Error('No scene; ensure canvas is ready and a scene is active.');
        }
        const pins = PinManager.list({ sceneId });
        const { PinRenderer } = await import('./pins-renderer.js');
        
        // Check if system is initialized, if not try to initialize
        let containerReady = PinRenderer.getContainer();
        if (!containerReady) {
            // Try to initialize
            PinRenderer.initialize();
            containerReady = PinRenderer.getContainer();
        }
        
        if (!containerReady) {
            return { reloaded: 0, containerReady: false, pinsInData: pins.length, layerActive: false };
        }
        
        const layer = canvas?.['blacksmith-utilities-layer'];
        if (pins.length > 0 && layer && !layer.active) {
            layer.activate();
        }
        const layerActive = layer?.active ?? false;
        
        await PinRenderer.loadScenePins(sceneId, pins);
        // Get pin count - use getPin to check if pins exist
        // Since we can't access private _pins, we'll estimate based on loaded pins
        const count = pins.length;
        return { reloaded: count, containerReady: true, pinsInData: pins.length, layerActive };
    }
}
