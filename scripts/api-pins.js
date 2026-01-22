// ==================================================================
// ===== API-PINS – Public API for Canvas Pins =====================
// ==================================================================
// Wraps PinManager to provide the public API surface for consumers.
// Follows the pattern of api-stats.js.
// ==================================================================

import { PinManager } from './manager-pins.js';

/**
 * PinsAPI - Provides access to Blacksmith's canvas pins system
 */
export class PinsAPI {
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
     * @param {string} eventType - Event type: 'hoverIn', 'hoverOut', 'click', 'rightClick', 'middleClick', 'dragStart', 'dragMove', 'dragEnd'
     * @param {Function} handler - Callback function that receives PinEvent
     * @param {import('./manager-pins.js').PinEventHandlerOptions} [options]
     * @returns {() => void} - Disposer function to unregister the handler
     */
    static on(eventType, handler, options) {
        return PinManager.registerHandler(eventType, handler, options);
    }
}
