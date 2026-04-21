// ==================================================================
// ===== API-PINS – Public API for Canvas Pins =====================
// ==================================================================
// Wraps PinManager to provide the public API surface for consumers.
// Follows the pattern of api-stats.js.
// ==================================================================

import { PinManager } from './manager-pins.js';
import { assetLookup } from './asset-lookup.js';

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
     * Return a list of sound options for dropdowns (e.g. pin event animation sounds).
     * Uses Blacksmith's sound asset list: "None" plus all sounds sorted by name.
     * @returns {{ value: string, label: string }[]} - Array of { value, label }; value '' is None, otherwise full path or sound id
     */
    static getSoundOptions() {
        const list = [{ value: '', label: 'None' }];
        const sounds = assetLookup?.dataCollections?.sounds;
        if (!Array.isArray(sounds)) return list;
        const seen = new Set();
        const rest = sounds
            .filter((s) => s.id !== 'sound-none' && s.value && !seen.has(s.value) && (seen.add(s.value), true))
            .map((s) => ({ value: s.value, label: s.name || s.value }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return list.concat(rest);
    }

    /**
     * Create a pin. Omit sceneId and x/y to create an unplaced pin (not on canvas).
     * @param {Partial<import('./manager-pins.js').PinData> & { id: string; moduleId: string } & { x?: number; y?: number }} pinData
     * @param {import('./manager-pins.js').PinCreateOptions} [options]
     * @returns {Promise<import('./manager-pins.js').PinData>}
     */
    static create(pinData, options) {
        return PinManager.create(pinData, options);
    }

    /**
     * Update an existing pin (placed or unplaced). Pass { sceneId, x, y } to place an unplaced pin.
     * @param {string} pinId
     * @param {Partial<import('./manager-pins.js').PinData>} patch
     * @param {import('./manager-pins.js').PinUpdateOptions} [options]
     * @returns {Promise<import('./manager-pins.js').PinData | null>} Returns null if pin not found
     */
    static update(pinId, patch, options) {
        return PinManager.update(pinId, patch, options);
    }

    /**
     * Place an unplaced pin on a scene.
     * @param {string} pinId
     * @param {{ sceneId: string; x: number; y: number }} placement
     * @returns {Promise<import('./manager-pins.js').PinData | null>} The placed pin or null if not found / not unplaced
     */
    static place(pinId, placement) {
        return PinManager.place(pinId, placement);
    }

    /**
     * Unplace a pin (remove from canvas but keep pin data).
     * @param {string} pinId
     * @returns {Promise<import('./manager-pins.js').PinData | null>} The unplaced pin data or null
     */
    static unplace(pinId) {
        return PinManager.unplace(pinId);
    }

    /**
     * Delete a pin (placed or unplaced).
     * If no sceneId is provided, searches unplaced store then all scenes.
     * @param {string} pinId
     * @param {import('./manager-pins.js').PinDeleteOptions} [options]
     * @returns {Promise<void>}
     */
    static delete(pinId, options) {
        return PinManager.delete(pinId, options);
    }

    /**
     * Delete all pins from a scene (GM only).
     * @param {Object} [options]
     * @param {string} [options.sceneId] - Target scene; defaults to active scene
     * @param {string} [options.moduleId] - Filter by module ID (optional)
     * @param {boolean} [options.silent] - Skip event emission
     * @returns {Promise<number>} - Number of pins deleted
     */
    static deleteAll(options) {
        return PinManager.deleteAll(options);
    }

    /**
     * Delete all pins of a specific type from a scene (GM only).
     * @param {string} type - Pin type to delete (e.g., 'note', 'quest', 'default')
     * @param {Object} [options]
     * @param {string} [options.sceneId] - Target scene; defaults to active scene
     * @param {string} [options.moduleId] - Filter by module ID (optional)
     * @param {boolean} [options.silent] - Skip event emission
     * @returns {Promise<number>} - Number of pins deleted
     */
    static deleteAllByType(type, options) {
        return PinManager.deleteAllByType(type, options);
    }

    /**
     * Create a pin as GM (bypasses permission checks, executes on GM client).
     * @param {string} sceneId - Target scene
     * @param {Partial<import('./manager-pins.js').PinData> & { id: string; x: number; y: number; moduleId: string }} pinData - Pin data
     * @param {import('./manager-pins.js').PinCreateOptions} [options] - Additional options
     * @returns {Promise<import('./manager-pins.js').PinData>} - Created pin data
     */
    static createAsGM(sceneId, pinData, options) {
        return PinManager.createAsGM(sceneId, pinData, options);
    }

    /**
     * Update a pin as GM (bypasses permission checks, executes on GM client).
     * @param {string} sceneId - Target scene
     * @param {string} pinId - Pin ID to update
     * @param {Partial<import('./manager-pins.js').PinData>} patch - Update patch
     * @param {import('./manager-pins.js').PinUpdateOptions} [options] - Additional options
     * @returns {Promise<import('./manager-pins.js').PinData | null>} - Updated pin data or null if not found
     */
    static updateAsGM(sceneId, pinId, patch, options) {
        return PinManager.updateAsGM(sceneId, pinId, patch, options);
    }

    /**
     * Delete a pin as GM (bypasses permission checks, executes on GM client).
     * @param {string} sceneId - Target scene
     * @param {string} pinId - Pin ID to delete
     * @param {import('./manager-pins.js').PinDeleteOptions} [options] - Additional options
     * @returns {Promise<void>}
     */
    static deleteAsGM(sceneId, pinId, options) {
        return PinManager.deleteAsGM(sceneId, pinId, options);
    }

    /**
     * Request GM to perform a pin action (for non-GM users).
     * Uses socket system to forward request to GM. If caller is already GM, executes directly.
     * @param {string} action - Action type: 'create', 'update', or 'delete'
     * @param {Object} params - Action parameters
     * @param {string} params.sceneId - Target scene
     * @param {string} [params.pinId] - Pin ID (for update/delete)
     * @param {Object} [params.payload] - Pin data (for create)
     * @param {Object} [params.patch] - Update patch (for update)
     * @param {Object} [params.options] - Additional options
     * @returns {Promise<import('./manager-pins.js').PinData | number | void>} - Result depends on action type
     */
    static requestGM(action, params) {
        return PinManager.requestGM(action, params);
    }

    /**
     * Reconcile module-tracked pin IDs with actual pins on canvas.
     * Helps modules repair broken links between their data and pins.
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
    static reconcile(options) {
        return PinManager.reconcile(options);
    }

    /**
     * Find which scene contains a pin with the given ID.
     * @param {string} pinId - The pin ID to search for
     * @returns {string | null} - The scene ID containing the pin, or null if not found
     */
    static findScene(pinId) {
        return PinManager.findSceneForPin(pinId);
    }

    /**
     * Open the pin configuration window for a pin (placed or unplaced).
     * When sceneId is omitted, the window will resolve the pin from the unplaced store first, then all scenes.
     * @param {string} pinId - Pin ID to configure
     * @param {Object} [options] - Options
     * @param {string} [options.sceneId] - Scene ID (if omitted, resolves pin from unplaced store first, then all scenes)
     * @param {Function} [options.onSelect] - Callback function called when configuration is saved. Receives the configuration data object.
     * @param {boolean} [options.useAsDefault] - Show "Use as Default" toggle in the window header (default: false)
     * @param {string} [options.defaultSettingKey] - Module setting key where default configuration will be saved when "Use as Default" is enabled
     * @param {string} [options.moduleId] - Calling module ID (required if useAsDefault is true)
     * @returns {Promise<Application>} - The opened window instance
     */
    static async configure(pinId, options = {}) {
        const { PinConfigWindow } = await import('./window-pin-configuration.js');
        return PinConfigWindow.open(pinId, options);
    }

    /**
     * Get the current user's default pin design for a module and pin type (saved via Configure Pin "Use as Default").
     * Stored in client scope so each player can have their own default. Key is moduleId + pin type (e.g. "coffee-pub-blacksmith|journal-page").
     * Use when creating new pins so the same module can have different defaults per type (e.g. Journal Page vs Encounter).
     * @param {string} moduleId - Module ID (e.g. 'coffee-pub-blacksmith')
     * @param {string} [type='default'] - Pin type (e.g. 'journal-page', 'encounter'). Omit or pass 'default' for generic default.
     * @returns {Object | null} Default design object (size, shape, style, dropShadow, textLayout, etc.) or null
     */
    static getDefaultPinDesign(moduleId, type = 'default') {
        if (!moduleId || typeof game?.settings?.get !== 'function') return null;
        const store = game.settings.get(MODULE_ID, 'clientPinDefaultDesigns');
        if (!store || typeof store !== 'object') return null;
        const compoundKey = `${moduleId}|${type || 'default'}`;
        let design = store[compoundKey] ?? null;
        if (!design && type && type !== 'default') design = store[moduleId] ?? null;
        return design ? { ...design } : null;
    }

    /**
     * Check if a pin exists on a scene.
     * @param {string} pinId - The pin ID to check
     * @param {import('./manager-pins.js').PinGetOptions} [options] - Optional sceneId to check specific scene
     * @returns {boolean} - True if pin exists, false otherwise
     */
    static exists(pinId, options) {
        return PinManager.exists(pinId, options);
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
     * Register a friendly name for a pin type. Use in context menus, tools, etc. so we don't assume labels.
     * @param {string} moduleId - Your module id
     * @param {string} type - Pin type key (e.g. 'sticky-notes', 'quest')
     * @param {string} friendlyName - Display name (e.g. 'Sticky Notes', 'Squire Sticky Notes')
     */
    static registerPinType(moduleId, type, friendlyName) {
        PinManager.registerPinType(moduleId, type, friendlyName);
    }

    /**
     * Get the registered friendly name for (moduleId, type). Returns empty string if not registered.
     * @param {string} moduleId
     * @param {string} [type]
     * @returns {string}
     */
    static getPinTypeLabel(moduleId, type) {
        return PinManager.getPinTypeLabel(moduleId, type);
    }

    /**
     * Ensure the built-in pin taxonomy JSON has been loaded into the runtime registry.
     * @returns {Promise<void>}
     */
    static async loadBuiltinTaxonomy() {
        await PinManager.ensureBuiltinTaxonomyLoaded();
    }

    /**
     * Register taxonomy metadata for a pin type.
     * @param {string} moduleId
     * @param {string} type
     * @param {object} taxonomy
     */
    static registerPinTaxonomy(moduleId, type, taxonomy) {
        PinManager.registerPinTaxonomy(moduleId, type, taxonomy);
    }

    /**
     * Get taxonomy metadata for a pin type.
     * @param {string} moduleId
     * @param {string} [type]
     * @returns {object | null}
     */
    static getPinTaxonomy(moduleId, type) {
        return PinManager.getPinTaxonomy(moduleId, type);
    }

    /**
     * Get normalized tag choices for a pin category.
     * @param {string} moduleId
     * @param {string} [type]
     * @returns {{ tags: string[], label: string }}
     */
    static getPinTaxonomyChoices(moduleId, type) {
        return PinManager.getPinTaxonomyChoices(moduleId, type);
    }

    /**
     * Get the world-level tag registry (all known tags, GM-writable).
     * Returns a sorted copy of the registry array.
     * @returns {string[]}
     */
    static getTagRegistry() {
        return PinManager.getTagRegistry();
    }

    /**
     * Delete a tag from the registry and remove it from every pin on every scene. GM only.
     * @param {string} tagKey - The tag to delete
     * @returns {Promise<void>}
     */
    static deleteTagGlobally(tagKey) {
        return PinManager.deleteTagGlobally(tagKey);
    }

    /**
     * Rename a tag across the registry and every pin on every scene. GM only.
     * @param {string} oldKey - Existing tag key
     * @param {string} newKey - Replacement tag key
     * @returns {Promise<void>}
     */
    static renameTagGlobally(oldKey, newKey) {
        return PinManager.renameTagGlobally(oldKey, newKey);
    }

    /**
     * Seed the tag registry from existing scene pins + taxonomy if the registry is empty. GM only.
     * Call once on first load to populate from existing data.
     * @returns {Promise<void>}
     */
    static seedTagRegistryIfEmpty() {
        return PinManager.seedTagRegistryIfEmpty();
    }

    /**
     * List saved per-user pin visibility profiles.
     * @returns {{ name: string, state: object }[]}
     */
    static listVisibilityProfiles() {
        return PinManager.listVisibilityProfiles();
    }

    /**
     * Save the current visibility filters as a named profile.
     * @param {string} name
     * @returns {Promise<{ name: string, state: object }>}
     */
    static saveVisibilityProfile(name) {
        return PinManager.saveVisibilityProfile(name);
    }

    /**
     * Apply a saved visibility profile.
     * @param {string} name
     * @returns {Promise<object>}
     */
    static applyVisibilityProfile(name) {
        return PinManager.applyVisibilityProfile(name);
    }

    /**
     * Delete a saved visibility profile.
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    static deleteVisibilityProfile(name) {
        return PinManager.deleteVisibilityProfile(name);
    }

    /**
     * Get the currently active visibility profile name.
     * @returns {string}
     */
    static getActiveVisibilityProfileName() {
        return PinManager.getActiveFilterProfileName();
    }

    /**
     * Hide or show all pins globally for the current user (client scope).
     * @param {boolean} visible - If false, hides all pins; if true, shows them.
     * @returns {Promise<void>}
     */
    static async setGlobalVisibility(visible) {
        await PinManager.setGlobalHidden(!visible);
    }

    /**
     * Get global pin visibility for the current user.
     * @returns {boolean} - True if pins are visible.
     */
    static getGlobalVisibility() {
        return !PinManager.isGlobalHidden();
    }

    /**
     * Hide or show pins for a specific module (client scope).
     * @param {string} moduleId
     * @param {boolean} visible - If false, hides module pins; if true, shows them.
     * @returns {Promise<void>}
     */
    static async setModuleVisibility(moduleId, visible) {
        await PinManager.setModuleHidden(moduleId, !visible);
    }

    /**
     * Get visibility for a specific module's pins.
     * @param {string} moduleId
     * @returns {boolean} - True if module pins are visible.
     */
    static getModuleVisibility(moduleId) {
        return !PinManager.isModuleHidden(moduleId);
    }

    /**
     * Hide or show a tag for the current user.
     * @param {string} tag
     * @param {boolean} visible
     * @returns {Promise<void>}
     */
    static async setTagVisibility(tag, visible) {
        await PinManager.setTagHidden(tag, !visible);
    }

    /**
     * Get visibility for a tag for the current user.
     * @param {string} tag
     * @returns {boolean}
     */
    static getTagVisibility(tag) {
        return !PinManager.isTagHidden(tag);
    }

    /**
     * Summarize the active scene's pins for layer-management UI.
     * @param {string} [sceneId]
     * @param {{ includeHiddenByFilter?: boolean }} [options]
     * @returns {{ total: number, modules: Array, types: Array, tags: Array }}
     */
    static getSceneFilterSummary(sceneId, options = {}) {
        return PinManager.getSceneFilterSummary(sceneId ?? canvas?.scene?.id, options);
    }

    /**
     * Open the Application V2 pin layers window.
     * @param {object} [options]
     * @returns {Promise<Application|void>}
     */
    static async openLayers(options = {}) {
        const api = game.modules.get(MODULE_ID)?.api;
        if (api?.openWindow) {
            return api.openWindow('blacksmith-pin-layers', options);
        }
        const { PinLayersWindow } = await import('./window-pin-layers.js');
        return PinLayersWindow.open(options);
    }

    /**
     * Pan the canvas to center on a pin's location.
     * Useful for navigating to pins from other UI elements (e.g., clicking a note in a journal to pan to its associated pin).
     * @param {string} pinId - The pin ID to pan to
     * @param {Object} [options] - Options
     * @param {string} [options.sceneId] - Optional scene ID
     * @param {boolean} [options.broadcast] - If true, pan all connected users who can see the pin (via socket)
     * @param {boolean|Object} [options.ping] - Ping the pin after panning. If true, uses default pulse animation. If object, passes to ping()
     * @returns {Promise<boolean>} - Returns true if pan was successful, false if pin not found or canvas not ready
     */
    static async panTo(pinId, options = {}) {
        if (!this.isReady()) {
            console.warn('Pins API: Cannot pan to pin - canvas not ready');
            return false;
        }
        
        const pin = PinManager.get(pinId, options);
        if (!pin) {
            console.warn(`Pins API: Pin not found: ${pinId}`);
            return false;
        }
        
        // Handle broadcast to all players
        if (options.broadcast) {
            try {
                const { SocketManager } = await import('./manager-sockets.js');
                // Wait for socket to be ready
                await SocketManager.waitForReady();
                const socket = SocketManager.getSocket();
                
                if (socket) {
                    // Use executeForOthers directly since handler is registered with SocketLib directly
                    socket.executeForOthers('panToPin', {
                        pinId,
                        ping: options.ping || null
                    });
                } else {
                    console.warn('BLACKSMITH | PINS Socket not available, broadcast panTo not sent');
                }
            } catch (err) {
                console.error('BLACKSMITH | PINS Error broadcasting panTo', err);
            }
            
            // Also pan locally for the sender
            // Fall through to local pan (don't return)
        }
        
        try {
            await canvas.animatePan({ x: pin.x, y: pin.y });
            
            // Ping after pan if requested
            if (options.ping) {
                if (options.ping === true) {
                    // Default: use 'ping' animation type (combo of scale-large + ripple)
                    await this.ping(pinId, { animation: 'ping', loops: 1 });
                } else {
                    // Custom ping options
                    await this.ping(pinId, options.ping);
                }
            }
            
            return true;
        } catch (err) {
            console.error('Pins API: Error panning to pin', err);
            return false;
        }
    }

    /**
     * Ping (animate) a pin to draw attention to it.
     * @param {string} pinId - Pin ID to ping
     * @param {Object} options - Ping options
     * @param {string | string[]} options.animation - Animation type, or array of types to run in sequence (e.g. ['scale-large', 'ripple'] like built-in 'ping')
     * @param {number} [options.loops=1] - Number of times to loop animation or sequence (default: 1). Ignored when untilStopped is true.
     * @param {boolean} [options.untilStopped=false] - If true, animation loops until the caller calls stop() on the returned controller. Returns a Promise that resolves with { stop: () => void, promise: Promise<void> }.
     * @param {boolean} [options.broadcast=false] - If true, show animation to all users who can see the pin (via socket). Not used when untilStopped is true.
     * @param {string} [options.sound] - Sound to play. Can be blacksmith sound name ('interface-ping-01') or full path ('modules/my-module/sounds/ping.mp3'). When untilStopped, plays once at start.
     * @returns {Promise<{ stop: () => void, promise: Promise<void> } | void>} When untilStopped is true, resolves with a controller object; otherwise resolves when the animation completes.
     */
    static async ping(pinId, options) {
        const { PinRenderer } = await import('./pins-renderer.js');
        return PinRenderer.ping(pinId, options);
    }

    /**
     * Refresh/re-render a single pin by forcing a rebuild of its icon element.
     * Useful for edge cases where update() doesn't fully refresh the visual.
     * Note: This should rarely be needed as update() now handles icon/image type changes automatically.
     *
     * @param {string} pinId - The pin ID to refresh
     * @param {import('./manager-pins.js').PinGetOptions} [options] - Optional sceneId
     * @returns {Promise<boolean>} - True if pin was refreshed, false if not found
     */
    static async refreshPin(pinId, options = {}) {
        const { PinRenderer } = await import('./pins-renderer.js');
        return PinRenderer.refreshPin(pinId, options);
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
