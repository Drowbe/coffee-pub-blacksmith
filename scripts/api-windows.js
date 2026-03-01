/**
 * Window API — registry for Application V2 window types.
 * Exposed on module.api by blacksmith.js. External modules register window ids
 * and open them via openWindow(windowId, options).
 */

/** @type {Map<string, { open: Function, title?: string, moduleId?: string }>} */
const _registry = new Map();

/**
 * @param {string} windowId
 * @param {{ open: Function, title?: string, moduleId?: string }} descriptor
 * @returns {boolean}
 */
function registerWindow(windowId, descriptor) {
    if (typeof windowId !== 'string' || !descriptor?.open || typeof descriptor.open !== 'function') {
        return false;
    }
    _registry.set(windowId, descriptor);
    return true;
}

/**
 * @param {string} windowId
 * @returns {boolean}
 */
function unregisterWindow(windowId) {
    return _registry.delete(windowId);
}

/**
 * @param {string} windowId
 * @param {object} [options]
 * @returns {Promise<import('foundry').applications.api.ApplicationV2|void>|import('foundry').applications.api.ApplicationV2|void}
 */
function openWindow(windowId, options = {}) {
    const entry = _registry.get(windowId);
    if (!entry) return undefined;
    return entry.open(options);
}

/**
 * @returns {Map<string, { open: Function, title?: string, moduleId?: string }>}
 */
function getRegisteredWindows() {
    return new Map(_registry);
}

/**
 * @param {string} windowId
 * @returns {boolean}
 */
function isWindowRegistered(windowId) {
    return _registry.has(windowId);
}

export {
    registerWindow,
    unregisterWindow,
    openWindow,
    getRegisteredWindows,
    isWindowRegistered
};
