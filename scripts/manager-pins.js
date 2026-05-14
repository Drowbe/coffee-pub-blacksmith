// ==================================================================
// ===== MANAGER-PINS – Pin lifecycle, CRUD, permissions, events ===
// ==================================================================
// Phase 1.2 & 1.3: PinManager. Uses pins-schema for validation/migration.
// Pins stored in scene.flags[MODULE.ID].pins[]. Event handler registration.
// No rendering here (Phase 2).
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { TagManager } from './manager-tags.js';
import {
    PIN_SCHEMA_VERSION,
    applyDefaults,
    validatePinData,
    migrateAndValidatePins,
    normalizePinImageForStorage,
    normalizeTextLayout,
    normalizePinGroup,
    normalizePinTags
} from './pins-schema.js';
// normalizePinGroup is still used for tag normalization (tags use the same key-normalization function)

const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    : 3;
const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
    : 0;

/** @typedef {{ id: string; x: number; y: number; size: { w: number; h: number }; style: object; text?: string; image?: string; iconText?: string; config: object; moduleId: string; type?: string; tags?: string[]; ownership: { default: number; users?: Record<string, number> }; version: number }} PinData */

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
 * @property {string} [sceneId] - List pins on this scene; omit and use unplacedOnly for unplaced
 * @property {boolean} [unplacedOnly] - If true, list unplaced pins (no sceneId needed)
 * @property {string} [moduleId]
 * @property {string} [type] - Filter by pin category key
 * @property {string} [tag] - Filter by a tag
 * @property {boolean} [includeHiddenByFilter] - Include pins hidden by client visibility filters/profile
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

/** World setting key for unplaced pins (not on any scene). */
const UNPLACED_SETTING_KEY = 'pinsUnplaced';
const PINS_HIDDEN_MODULES_KEY = 'pinsHiddenModules';
const PINS_HIDDEN_MODULE_TYPES_KEY = 'pinsHiddenModuleTypes';
const PINS_HIDDEN_TAGS_KEY = 'pinsHiddenTags';
const PINS_HIDDEN_TYPE_TAGS_KEY = 'pinsHiddenTypeTags';
const PINS_TAG_REGISTRY_KEY = 'pinTagRegistry';
const PINS_HIDE_ALL_KEY = 'pinsHideAll';
const PINS_FILTER_PROFILES_KEY = 'pinsFilterProfiles';
const PINS_ACTIVE_FILTER_PROFILE_KEY = 'pinsActiveFilterProfile';

export class PinManager {
    static FLAG_KEY = 'pins';
    static SETTING_ALLOW_PLAYER_WRITES = 'pinsAllowPlayerWrites';
    static UNPLACED_SETTING_KEY = UNPLACED_SETTING_KEY;
    static HIDDEN_MODULES_SETTING_KEY = PINS_HIDDEN_MODULES_KEY;
    static HIDDEN_MODULE_TYPES_SETTING_KEY = PINS_HIDDEN_MODULE_TYPES_KEY;
    static HIDDEN_TAGS_SETTING_KEY = PINS_HIDDEN_TAGS_KEY;
    static HIDDEN_TYPE_TAGS_SETTING_KEY = PINS_HIDDEN_TYPE_TAGS_KEY;
    static TAG_REGISTRY_SETTING_KEY = PINS_TAG_REGISTRY_KEY;
    static HIDE_ALL_SETTING_KEY = PINS_HIDE_ALL_KEY;
    static FILTER_PROFILES_SETTING_KEY = PINS_FILTER_PROFILES_KEY;
    static ACTIVE_FILTER_PROFILE_SETTING_KEY = PINS_ACTIVE_FILTER_PROFILE_KEY;
    static SYSTEM_PROFILE_ALL = '__blacksmith_all_pins__';
    static SYSTEM_PROFILE_NONE = '__blacksmith_no_pins__';

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

    /** In-memory registry: (moduleId|type) -> friendly name for UI. Modules register so we don't assume labels. */
    static _pinTypeLabels = new Map();
    static _builtinTaxonomyRegistry = new Map();
    static _globalTags = [];
    static _overrideTaxonomyRegistry = new Map();
    static _runtimeTaxonomyRegistry = new Map();
    static _taxonomyLoadPromise = null;
    static _builtinTaxonomyLoaded = false;

    // GM proxy handler registration flag
    static _gmProxyHandlerRegistered = false;

    /** Composite key for pin type registry: "moduleId|type". */
    static _pinTypeKey(moduleId, type) {
        const m = (moduleId && String(moduleId).trim()) || '';
        const t = (type != null && type !== '') ? String(type).trim() : 'default';
        return `${m}|${t}`;
    }

    static _normalizePinType(type) {
        return (type != null && type !== '') ? String(type).trim() : 'default';
    }

    static getVisibilityPinType(moduleId, type) {
        return this._normalizePinType(type);
    }

    static _pinVisibilityTypeKey(moduleId, type) {
        return this._pinTypeKey(moduleId, this.getVisibilityPinType(moduleId, type));
    }

    static _pinVisibilityTypeKeys(moduleId, type) {
        return [this._pinVisibilityTypeKey(moduleId, type)];
    }

    /**
     * Register a friendly name for a pin type. Use in context menus, tools, etc. so we don't assume labels.
     * @param {string} moduleId - Your module id
     * @param {string} type - Pin type key (e.g. 'sticky-notes', 'quest')
     * @param {string} friendlyName - Display name (e.g. 'Sticky Notes', 'Squire Sticky Notes')
     */
    static registerPinType(moduleId, type, friendlyName) {
        if (!moduleId || typeof moduleId !== 'string') return;
        const key = this._pinTypeKey(moduleId, type ?? 'default');
        const name = (friendlyName != null && String(friendlyName).trim()) ? String(friendlyName).trim() : '';
        if (name) this._pinTypeLabels.set(key, name);
        else this._pinTypeLabels.delete(key);
    }

    /**
     * Get the registered friendly name for (moduleId, type). Returns empty string if not registered.
     * @param {string} moduleId
     * @param {string} [type]
     * @returns {string}
     */
    static getPinTypeLabel(moduleId, type) {
        if (!moduleId) return '';
        const key = this._pinTypeKey(moduleId, type);
        return this._pinTypeLabels.get(key) ?? '';
    }

    static _normalizeTaxonomyTagList(value) {
        return normalizePinTags(value);
    }

    static _taxonomyTypeKey(moduleId, type) {
        return this._pinTypeKey(moduleId, type ?? 'default');
    }

    static _normalizeTaxonomyEntry(moduleId, type, taxonomy = {}) {
        if (!moduleId || typeof moduleId !== 'string') return;
        const normalizedType = (type != null && type !== '') ? String(type).trim() : 'default';
        return {
            moduleId: String(moduleId).trim(),
            type: normalizedType,
            label: (taxonomy.label != null && String(taxonomy.label).trim()) ? String(taxonomy.label).trim() : '',
            tags: this._normalizeTaxonomyTagList(taxonomy.tags)
        };
    }

    static registerPinTaxonomy(moduleId, type, taxonomy = {}) {
        const normalized = this._normalizeTaxonomyEntry(moduleId, type, taxonomy);
        if (!normalized) return;
        const key = this._taxonomyTypeKey(moduleId, normalized.type);
        this._runtimeTaxonomyRegistry.set(key, normalized);
        if (normalized.label) {
            this.registerPinType(moduleId, normalized.type, normalized.label);
        }
    }

    static _mergeTaxonomyEntries(...entries) {
        const valid = entries.filter(Boolean);
        if (!valid.length) return null;
        const merged = {
            moduleId: valid[valid.length - 1].moduleId || valid[0].moduleId || '',
            type: valid[valid.length - 1].type || valid[0].type || 'default',
            label: '',
            tags: []
        };
        for (const entry of valid) {
            if (entry.label) merged.label = entry.label;
            merged.tags = Array.from(new Set([...(merged.tags || []), ...(entry.tags || [])].filter(Boolean)));
        }
        return merged;
    }

    static getPinTaxonomy(moduleId, type) {
        if (!moduleId) return null;
        const key = this._taxonomyTypeKey(moduleId, this.getVisibilityPinType(moduleId, type));
        const entry = this._mergeTaxonomyEntries(
            this._builtinTaxonomyRegistry.get(key),
            this._overrideTaxonomyRegistry.get(key),
            this._runtimeTaxonomyRegistry.get(key)
        );
        return entry ? foundry.utils.deepClone(entry) : null;
    }

    /**
     * Get all registered taxonomy entries for a module — every type that has been registered
     * via the built-in JSON, an override JSON, or registerPinTaxonomy().
     * Returns a plain object keyed by type, each value being { label, tags }.
     * @param {string} moduleId
     * @returns {Record<string, { label: string, tags: string[] }>}
     */
    static getModuleTaxonomy(moduleId) {
        if (!moduleId) return {};
        const prefix = `${String(moduleId).trim()}|`;
        const types = new Set();
        for (const key of this._builtinTaxonomyRegistry.keys()) if (key.startsWith(prefix)) types.add(key.slice(prefix.length));
        for (const key of this._overrideTaxonomyRegistry.keys()) if (key.startsWith(prefix)) types.add(key.slice(prefix.length));
        for (const key of this._runtimeTaxonomyRegistry.keys()) if (key.startsWith(prefix)) types.add(key.slice(prefix.length));
        const result = {};
        for (const type of types) {
            const entry = this.getPinTaxonomy(moduleId, type);
            if (entry) result[type] = { label: entry.label, tags: entry.tags };
        }
        return result;
    }

    static getPinTaxonomyChoices(moduleId, type) {
        const taxonomy = this.getPinTaxonomy(moduleId, type);
        const tags = Array.from(new Set([
            ...(taxonomy?.tags || []),
            ...this._globalTags
        ].filter(Boolean)));
        return {
            tags,
            label: taxonomy?.label || ''
        };
    }

    static async ensureBuiltinTaxonomyLoaded() {
        if (this._builtinTaxonomyLoaded) return;
        if (this._taxonomyLoadPromise) {
            await this._taxonomyLoadPromise;
            return;
        }
        this._taxonomyLoadPromise = (async () => {
            try {
                this._builtinTaxonomyRegistry.clear();
                this._overrideTaxonomyRegistry.clear();
                await this._loadTaxonomyJsonIntoRegistry(`modules/${MODULE.ID}/resources/pin-taxonomy.json`, this._builtinTaxonomyRegistry);
                const overridePath = String(getSettingSafely(MODULE.ID, 'pinTaxonomyOverrideJson', '') || '').trim();
                if (overridePath && overridePath !== `modules/${MODULE.ID}/resources/pin-taxonomy.json`) {
                    await this._loadTaxonomyJsonIntoRegistry(overridePath, this._overrideTaxonomyRegistry);
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Failed to load pin taxonomy.', error?.message || error, false, true);
            } finally {
                this._builtinTaxonomyLoaded = true;
                this._taxonomyLoadPromise = null;
            }
        })();
        await this._taxonomyLoadPromise;
    }

    static async _loadTaxonomyJsonIntoRegistry(path, registry) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load pin taxonomy from ${path}: ${response.status}`);
        }
        const payload = await response.json();
        // Collect global tags
        if (Array.isArray(payload?.globalTags)) {
            for (const t of payload.globalTags) {
                const k = normalizePinGroup(t);
                if (k && !this._globalTags.includes(k)) this._globalTags.push(k);
            }
        }
        // v3: modules.{moduleId}.pinCategories
        if (payload?.modules && typeof payload.modules === 'object') {
            for (const [moduleId, moduleEntry] of Object.entries(payload.modules)) {
                const categories = moduleEntry?.pinCategories;
                if (!categories || typeof categories !== 'object') continue;
                for (const [type, entry] of Object.entries(categories)) {
                    const normalized = this._normalizeTaxonomyEntry(moduleId, type, entry);
                    if (!normalized) continue;
                    registry.set(this._taxonomyTypeKey(moduleId, type), normalized);
                    if (normalized.label && !this._runtimeTaxonomyRegistry.has(this._taxonomyTypeKey(moduleId, type))) {
                        this.registerPinType(moduleId, type, normalized.label);
                    }
                }
            }
        }
        // Legacy: flat pinCategories / pinTypes with optional per-entry moduleId
        const legacyTypes = (payload?.pinCategories && !payload.modules && typeof payload.pinCategories === 'object')
            ? payload.pinCategories
            : (payload?.pinTypes && typeof payload.pinTypes === 'object' ? payload.pinTypes : null);
        if (legacyTypes) {
            const defaultModuleId = (payload?.moduleId && String(payload.moduleId).trim()) || MODULE.ID;
            for (const [type, entry] of Object.entries(legacyTypes)) {
                const moduleId = (entry?.moduleId && String(entry.moduleId).trim()) || defaultModuleId;
                const normalized = this._normalizeTaxonomyEntry(moduleId, type, entry);
                if (!normalized) continue;
                registry.set(this._taxonomyTypeKey(moduleId, type), normalized);
                if (normalized.label && !this._runtimeTaxonomyRegistry.has(this._taxonomyTypeKey(moduleId, type))) {
                    this.registerPinType(moduleId, type, normalized.label);
                }
            }
        }
    }

    static invalidateBuiltinTaxonomy() {
        this._builtinTaxonomyLoaded = false;
        this._taxonomyLoadPromise = null;
        this._builtinTaxonomyRegistry.clear();
        this._overrideTaxonomyRegistry.clear();
        this._globalTags = [];
    }

    static getScenePinSearchResults(sceneId, options = {}) {
        const query = String(options.query || '').trim().toLowerCase();
        if (!query) return [];
        const includeHiddenByFilter = options.includeHiddenByFilter === true;
        const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 50;
        const pins = this.list({ sceneId, includeHiddenByFilter });
        const results = [];
        for (const pin of pins) {
            const haystack = [
                pin.text,
                pin.type,
                ...(Array.isArray(pin.tags) ? pin.tags : []),
                pin.moduleId,
                this.getPinTypeLabel(pin.moduleId, pin.type)
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(query)) continue;
            results.push({
                id: pin.id,
                text: String(pin.text || '').trim() || '(Untitled Pin)',
                moduleId: pin.moduleId || '',
                type: pin.type || 'default',
                tags: this._getPinTags(pin),
                hiddenByFilter: this._isHiddenByFilter(pin),
                typeLabel: this.getPinTypeLabel(pin.moduleId, pin.type) || ''
            });
            if (results.length >= limit) break;
        }
        return results;
    }

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
     * Can this user edit (configure/update/delete) this pin?
     * GMs can always edit. Non-GMs can edit if they have OWNER (or higher) on this pin;
     * pinsAllowPlayerWrites is not required for editing pins you own (it only gates creation).
     * @param {PinData} pin
     * @param {string} userId
     * @returns {boolean}
     */
    static _canEdit(pin, userId) {
        if (game.user?.isGM) return true;
        const ow = pin.ownership ?? { default: NONE };
        const level = ow.users && typeof ow.users[userId] === 'number'
            ? ow.users[userId]
            : (typeof ow.default === 'number' ? ow.default : NONE);
        if (level >= OWNER) return true;
        return false;
    }

    static _canCreate() {
        if (game.user?.isGM) return true;
        return !!getSettingSafely(MODULE.ID, this.SETTING_ALLOW_PLAYER_WRITES, false);
    }

    static _getHiddenModulesMap() {
        const raw = getSettingSafely(MODULE.ID, this.HIDDEN_MODULES_SETTING_KEY, {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    static _getHiddenModuleTypesMap() {
        const raw = getSettingSafely(MODULE.ID, this.HIDDEN_MODULE_TYPES_SETTING_KEY, {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    static _getHiddenTagsMap() {
        const raw = getSettingSafely(MODULE.ID, this.HIDDEN_TAGS_SETTING_KEY, {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    static _getHiddenTypeTagsMap() {
        const raw = getSettingSafely(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    static _typeTagKey(moduleId, type, tag) {
        return `${this._pinVisibilityTypeKey(moduleId, type)}|${normalizePinGroup(tag)}`;
    }

    static _typeTagKeys(moduleId, type, tag) {
        const tagKey = normalizePinGroup(tag);
        if (!tagKey) return [];
        return this._pinVisibilityTypeKeys(moduleId, type).map(typeKey => `${typeKey}|${tagKey}`);
    }

    static isTypeTagHidden(moduleId, type, tag) {
        if (!moduleId || !tag) return false;
        const map = this._getHiddenTypeTagsMap();
        return this._typeTagKeys(moduleId, type, tag).some(key => !!map[key]);
    }

    static async setTypeTagHidden(moduleId, type, tag, hidden) {
        if (!moduleId || !tag) return;
        const key = this._typeTagKey(moduleId, type, tag);
        const map = this._getHiddenTypeTagsMap();
        if (hidden) map[key] = true;
        else for (const candidate of this._typeTagKeys(moduleId, type, tag)) delete map[candidate];
        await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, map);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static async setTypeTagsHidden(moduleId, type, tags, hidden) {
        if (!moduleId || !Array.isArray(tags) || !tags.length) return;
        const map = this._getHiddenTypeTagsMap();
        let changed = false;
        for (const tag of normalizePinTags(tags)) {
            const key = this._typeTagKey(moduleId, type, tag);
            if (hidden) {
                if (!map[key]) {
                    map[key] = true;
                    changed = true;
                }
            } else {
                for (const candidate of this._typeTagKeys(moduleId, type, tag)) {
                    if (!map[candidate]) continue;
                    delete map[candidate];
                    changed = true;
                }
            }
        }
        if (!changed) return;
        await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, map);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static async clearTypeTagHiddenState() {
        await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, {});
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    /** All global tags from the built-in taxonomy JSON. */
    static getGlobalTaxonomyTags() {
        return [...this._globalTags];
    }

    /** All registered taxonomies keyed by moduleId → type → { label, tags }. */
    static getAllTaxonomies() {
        const moduleIds = new Set();
        for (const key of this._builtinTaxonomyRegistry.keys()) { const [m] = key.split('|'); if (m) moduleIds.add(m); }
        for (const key of this._overrideTaxonomyRegistry.keys()) { const [m] = key.split('|'); if (m) moduleIds.add(m); }
        for (const key of this._runtimeTaxonomyRegistry.keys()) { const [m] = key.split('|'); if (m) moduleIds.add(m); }
        const result = {};
        for (const moduleId of moduleIds) {
            const taxonomy = this.getModuleTaxonomy(moduleId);
            if (Object.keys(taxonomy).length) result[moduleId] = taxonomy;
        }
        return result;
    }

    static _getTagRegistry() {
        const raw = getSettingSafely(MODULE.ID, this.TAG_REGISTRY_SETTING_KEY, []);
        return Array.isArray(raw) ? raw : [];
    }

    static getTagRegistry() {
        return [...this._getTagRegistry()];
    }

    /** Mirror a pin's current tags into the central tagAssignments store. Best-effort; never throws. */
    static _mirrorTagsForPin(pin) {
        if (!pin?.id || !pin?.moduleId) return;
        TagManager.setTags(`${pin.moduleId}.${pin.type || 'default'}`, pin.id, pin.tags ?? []).catch(() => {});
    }

    /** Remove a pin's tag assignments from the central store on delete. Best-effort; never throws. */
    static _clearTagsForPin(pin) {
        if (!pin?.id || !pin?.moduleId) return;
        TagManager.deleteRecordTags(`${pin.moduleId}.${pin.type || 'default'}`, pin.id).catch(() => {});
    }

    static async _addTagsToRegistry(tags) {
        if (!game.user?.isGM) return;
        if (!Array.isArray(tags) || tags.length === 0) return;
        const normalized = tags.map(t => normalizePinGroup(t)).filter(Boolean);
        if (normalized.length === 0) return;
        const current = this._getTagRegistry();
        const added = normalized.filter(t => !current.includes(t));
        if (added.length === 0) return;
        const updated = [...current, ...added].sort();
        await game.settings.set(MODULE.ID, this.TAG_REGISTRY_SETTING_KEY, updated);
    }

    static async addTagToRegistry(tagKey) {
        if (!game.user?.isGM) return null;
        const key = normalizePinGroup(tagKey);
        if (!key) return null;
        await this._addTagsToRegistry([key]);
        TagManager.seedRegistry('pins', [[key]]).catch(() => {});
        return key;
    }

    static async stripTagFromScene(tagKey, sceneId) {
        if (!game.user?.isGM || !sceneId) return 0;
        const key = normalizePinGroup(tagKey);
        if (!key) return 0;
        const scene = game.scenes?.get(sceneId);
        if (!scene) return 0;
        const pins = scene.getFlag(MODULE.ID, 'pins');
        if (!Array.isArray(pins)) return 0;

        let count = 0;
        const updated = pins.map(p => {
            const tags = normalizePinTags(p.tags);
            if (!tags.includes(key)) return p;
            count++;
            return { ...p, tags: tags.filter(t => t !== key) };
        });
        if (count > 0) {
            await scene.setFlag(MODULE.ID, 'pins', updated);
            for (const pin of updated) {
                if (normalizePinTags(pin.tags).includes(key)) continue;
                const original = pins.find(p => p.id === pin.id);
                if (original && normalizePinTags(original.tags).includes(key)) this._mirrorTagsForPin(pin);
            }
        }
        await this._addTagsToRegistry([key]);
        return count;
    }

    static async stripTagFromAllScenes(tagKey) {
        if (!game.user?.isGM) return 0;
        const key = normalizePinGroup(tagKey);
        if (!key) return 0;
        let count = 0;

        for (const scene of game.scenes) {
            const pins = scene.getFlag(MODULE.ID, 'pins');
            if (!Array.isArray(pins)) continue;
            const changedPins = [];
            const updated = pins.map(p => {
                const tags = normalizePinTags(p.tags);
                if (!tags.includes(key)) return p;
                count++;
                const updatedPin = { ...p, tags: tags.filter(t => t !== key) };
                changedPins.push(updatedPin);
                return updatedPin;
            });
            if (!changedPins.length) continue;
            await scene.setFlag(MODULE.ID, 'pins', updated);
            for (const pin of changedPins) this._mirrorTagsForPin(pin);
        }

        const unplacedPins = this._getUnplacedPins();
        const changedUnplaced = [];
        const updatedUnplaced = unplacedPins.map(p => {
            const tags = normalizePinTags(p.tags);
            if (!tags.includes(key)) return p;
            count++;
            const updatedPin = { ...p, tags: tags.filter(t => t !== key) };
            changedUnplaced.push(updatedPin);
            return updatedPin;
        });
        if (changedUnplaced.length) {
            await this._setUnplacedPins(updatedUnplaced);
            for (const pin of changedUnplaced) this._mirrorTagsForPin(pin);
        }

        await this._addTagsToRegistry([key]);
        return count;
    }

    static async deleteTagGlobally(tagKey) {
        if (!game.user?.isGM) return;
        const key = normalizePinGroup(tagKey);
        if (!key) return;
        // Remove from registry
        const registry = this._getTagRegistry().filter(t => t !== key);
        await game.settings.set(MODULE.ID, this.TAG_REGISTRY_SETTING_KEY, registry);
        // Remove from hidden tags setting
        const hiddenMap = this._getHiddenTagsMap();
        if (hiddenMap[key] !== undefined) {
            delete hiddenMap[key];
            await game.settings.set(MODULE.ID, this.HIDDEN_TAGS_SETTING_KEY, hiddenMap);
        }
        const hiddenTypeMap = this._getHiddenTypeTagsMap();
        let hiddenTypeMapChanged = false;
        for (const typeTagKey of Object.keys(hiddenTypeMap)) {
            if (!typeTagKey.endsWith(`|${key}`)) continue;
            delete hiddenTypeMap[typeTagKey];
            hiddenTypeMapChanged = true;
        }
        if (hiddenTypeMapChanged) await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, hiddenTypeMap);
        // Remove from saved profiles
        const profiles = this._getStoredFilterProfiles();
        let profilesChanged = false;
        for (const profileState of Object.values(profiles)) {
            if (profileState.hiddenTags && key in profileState.hiddenTags) {
                delete profileState.hiddenTags[key];
                profilesChanged = true;
            }
            if (profileState.hiddenTypeTags) {
                for (const typeTagKey of Object.keys(profileState.hiddenTypeTags)) {
                    if (!typeTagKey.endsWith(`|${key}`)) continue;
                    delete profileState.hiddenTypeTags[typeTagKey];
                    profilesChanged = true;
                }
            }
        }
        if (profilesChanged) await game.settings.set(MODULE.ID, this.FILTER_PROFILES_SETTING_KEY, profiles);
        // Remove from all scene pins
        for (const scene of game.scenes) {
            const pins = scene.getFlag(MODULE.ID, 'pins');
            if (!Array.isArray(pins)) continue;
            const updated = pins.map(p => {
                const tags = normalizePinTags(p.tags).filter(t => t !== key);
                return { ...p, tags };
            });
            const changed = updated.some((p, i) => p.tags.length !== normalizePinTags(pins[i].tags).length);
            if (changed) await scene.setFlag(MODULE.ID, 'pins', updated);
        }
        const unplacedPins = this._getUnplacedPins();
        const updatedUnplaced = unplacedPins.map(p => {
            const tags = normalizePinTags(p.tags).filter(t => t !== key);
            return { ...p, tags };
        });
        const unplacedChanged = updatedUnplaced.some((p, i) => p.tags.length !== normalizePinTags(unplacedPins[i].tags).length);
        if (unplacedChanged) await this._setUnplacedPins(updatedUnplaced);
        // Mirror into central tag store
        TagManager.delete(key).catch(() => {});
    }

    static async renameTagGlobally(oldKey, newKey) {
        if (!game.user?.isGM) return;
        const oldNorm = normalizePinGroup(oldKey);
        const newNorm = normalizePinGroup(newKey);
        if (!oldNorm || !newNorm || oldNorm === newNorm) return;
        // Always mirror into central tag store regardless of pin registry state
        TagManager.rename(oldNorm, newNorm).catch(() => {});
        // Update hidden tags
        const hiddenMap = this._getHiddenTagsMap();
        if (hiddenMap[oldNorm] !== undefined) {
            hiddenMap[newNorm] = hiddenMap[oldNorm];
            delete hiddenMap[oldNorm];
            await game.settings.set(MODULE.ID, this.HIDDEN_TAGS_SETTING_KEY, hiddenMap);
        }
        const hiddenTypeMap = this._getHiddenTypeTagsMap();
        let hiddenTypeMapChanged = false;
        for (const [typeTagKey, hidden] of Object.entries(hiddenTypeMap)) {
            if (!typeTagKey.endsWith(`|${oldNorm}`)) continue;
            const nextKey = `${typeTagKey.slice(0, -(oldNorm.length))}${newNorm}`;
            hiddenTypeMap[nextKey] = hidden;
            delete hiddenTypeMap[typeTagKey];
            hiddenTypeMapChanged = true;
        }
        if (hiddenTypeMapChanged) await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, hiddenTypeMap);
        // Update saved profiles
        const profiles = this._getStoredFilterProfiles();
        let profilesChanged = false;
        for (const profileState of Object.values(profiles)) {
            if (profileState.hiddenTags && oldNorm in profileState.hiddenTags) {
                profileState.hiddenTags[newNorm] = profileState.hiddenTags[oldNorm];
                delete profileState.hiddenTags[oldNorm];
                profilesChanged = true;
            }
            if (profileState.hiddenTypeTags) {
                for (const [typeTagKey, hidden] of Object.entries(profileState.hiddenTypeTags)) {
                    if (!typeTagKey.endsWith(`|${oldNorm}`)) continue;
                    const nextKey = `${typeTagKey.slice(0, -(oldNorm.length))}${newNorm}`;
                    profileState.hiddenTypeTags[nextKey] = hidden;
                    delete profileState.hiddenTypeTags[typeTagKey];
                    profilesChanged = true;
                }
            }
        }
        if (profilesChanged) await game.settings.set(MODULE.ID, this.FILTER_PROFILES_SETTING_KEY, profiles);
        // Update all scene pins
        let anyPinChanged = false;
        for (const scene of game.scenes) {
            const pins = scene.getFlag(MODULE.ID, 'pins');
            if (!Array.isArray(pins)) continue;
            let changed = false;
            const remapped = pins.map(p => {
                const tags = normalizePinTags(p.tags);
                if (!tags.includes(oldNorm)) return p;
                changed = true;
                const newTags = tags.map(t => (t === oldNorm ? newNorm : t));
                return { ...p, tags: [...new Set(newTags)] };
            });
            if (changed) {
                anyPinChanged = true;
                await scene.setFlag(MODULE.ID, 'pins', remapped);
            }
        }
        const unplacedPins = this._getUnplacedPins();
        let unplacedChanged = false;
        const remappedUnplaced = unplacedPins.map(p => {
            const tags = normalizePinTags(p.tags);
            if (!tags.includes(oldNorm)) return p;
            unplacedChanged = true;
            const newTags = tags.map(t => (t === oldNorm ? newNorm : t));
            return { ...p, tags: [...new Set(newTags)] };
        });
        if (unplacedChanged) {
            anyPinChanged = true;
            await this._setUnplacedPins(remappedUnplaced);
        }
        // Update pin-specific registry after pin remapping so unregistered pin tags can still be renamed.
        const registry = this._getTagRegistry();
        if (registry.includes(oldNorm) || anyPinChanged) {
            const updated = registry.map(t => (t === oldNorm ? newNorm : t)).filter(t => t !== oldNorm);
            if (!updated.includes(newNorm)) updated.push(newNorm);
            await game.settings.set(MODULE.ID, this.TAG_REGISTRY_SETTING_KEY, [...new Set(updated)].sort());
        }
    }

    static async seedTagRegistryIfEmpty() {
        if (!game.user?.isGM) return;
        const wasEmpty = this._getTagRegistry().length === 0;
        // Always merge taxonomy tags — picks up any JSON updates on each load
        const taxonomyTags = [...this._globalTags];
        for (const [, entry] of this._builtinTaxonomyRegistry) {
            for (const t of entry.tags ?? []) { const k = normalizePinGroup(t); if (k) taxonomyTags.push(k); }
        }
        if (taxonomyTags.length > 0) await this._addTagsToRegistry(taxonomyTags);
        // Only scan all scene pins on the very first run (registry was empty before taxonomy merge)
        if (!wasEmpty) return;
        const tags = new Set(this._getTagRegistry());
        for (const scene of game.scenes) {
            const pins = scene.getFlag(MODULE.ID, 'pins');
            if (!Array.isArray(pins)) continue;
            for (const p of pins) {
                for (const t of normalizePinTags(p.tags)) if (t) tags.add(t);
            }
        }
        const sorted = [...tags].filter(Boolean).sort();
        if (sorted.length > 0) await game.settings.set(MODULE.ID, this.TAG_REGISTRY_SETTING_KEY, sorted);
    }

    /**
     * One-time backfill: populate flagAssignments from existing pin.tags[] across all scenes and
     * the unplaced store. Runs once per world (gated by flagsAssignmentsMigrated sentinel).
     * Merges with any assignments already written by forward writes; never overwrites.
     */
    static async backfillFlagAssignments() {
        if (!game.user?.isGM) return;
        // Accept either new sentinel or old name for worlds that ran before rename
        const alreadyDone = getSettingSafely(MODULE.ID, 'tagsAssignmentsMigrated', false)
            || getSettingSafely(MODULE.ID, 'flagsAssignmentsMigrated', false);
        if (alreadyDone) {
            if (!getSettingSafely(MODULE.ID, 'tagsAssignmentsMigrated', false)) {
                await game.settings.set(MODULE.ID, 'tagsAssignmentsMigrated', true);
            }
            return;
        }
        try {
            const toBackfill = {};
            const addPin = (pin) => {
                if (!pin?.id || !pin?.moduleId) return;
                const tags = normalizePinTags(pin.tags);
                if (tags.length === 0) return;
                const contextKey = `${pin.moduleId}.${pin.type || 'default'}`;
                if (!toBackfill[contextKey]) toBackfill[contextKey] = {};
                toBackfill[contextKey][pin.id] = tags;
            };
            for (const scene of game.scenes) {
                const pins = scene.getFlag(MODULE.ID, this.FLAG_KEY);
                if (!Array.isArray(pins)) continue;
                for (const pin of pins) addPin(pin);
            }
            for (const pin of this._getUnplacedPins()) addPin(pin);

            if (Object.keys(toBackfill).length > 0) {
                // Merge with any forward-writes already in the store; never overwrite existing entries
                const existing = getSettingSafely(MODULE.ID, 'tagAssignments', {});
                for (const [contextKey, records] of Object.entries(toBackfill)) {
                    if (!existing[contextKey]) existing[contextKey] = {};
                    for (const [recordId, tags] of Object.entries(records)) {
                        if (!existing[contextKey][recordId]) existing[contextKey][recordId] = tags;
                    }
                }
                await game.settings.set(MODULE.ID, 'tagAssignments', existing);
            }
            await game.settings.set(MODULE.ID, 'tagsAssignmentsMigrated', true);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Failed to backfill flag assignments.', err?.message || err, false, true);
        }
    }

    static _getStoredFilterProfiles() {
        const raw = getSettingSafely(MODULE.ID, this.FILTER_PROFILES_SETTING_KEY, {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    static _normalizeProfileName(name) {
        if (name == null) return '';
        return String(name).trim();
    }

    static getActiveFilterProfileName() {
        return this._normalizeProfileName(getSettingSafely(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, ''));
    }

    static isSystemVisibilityProfileName(name) {
        const key = this._normalizeProfileName(name);
        return key === this.SYSTEM_PROFILE_ALL || key === this.SYSTEM_PROFILE_NONE;
    }

    static getSystemVisibilityProfileState(name, options = {}) {
        const key = this._normalizeProfileName(name);
        if (key === this.SYSTEM_PROFILE_ALL) {
            return {
                hideAll: false,
                hiddenModules: {},
                hiddenModuleTypes: {},
                hiddenTags: {},
                hiddenTypeTags: {}
            };
        }
        if (key !== this.SYSTEM_PROFILE_NONE) return null;

        const hiddenModuleTypes = {};
        const hiddenTags = {};
        const hiddenTypeTags = {};
        for (const [moduleId, types] of Object.entries(this.getAllTaxonomies())) {
            for (const [type, entry] of Object.entries(types)) {
                const typeKey = this._pinTypeKey(moduleId, type);
                hiddenModuleTypes[typeKey] = true;
                for (const tag of normalizePinTags(entry.tags || [])) {
                    hiddenTypeTags[`${typeKey}|${tag}`] = true;
                }
            }
        }
        const taxonomyTags = new Set(this.getGlobalTaxonomyTags());
        for (const types of Object.values(this.getAllTaxonomies())) {
            for (const entry of Object.values(types)) {
                for (const tag of normalizePinTags(entry.tags || [])) taxonomyTags.add(tag);
            }
        }
        const globalHiddenTags = [
            ...this.getGlobalTaxonomyTags(),
            ...this.getTagRegistry().filter(tag => !taxonomyTags.has(tag))
        ];
        for (const tag of normalizePinTags(globalHiddenTags)) {
            hiddenTags[tag] = true;
        }
        const sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
        const scenePins = sceneId ? (this.list({ sceneId, includeHiddenByFilter: true }) || []) : [];
        for (const pin of scenePins) {
            if (!pin?.moduleId) continue;
            const typeKey = this._pinVisibilityTypeKey(pin.moduleId, pin.type);
            hiddenModuleTypes[typeKey] = true;
            for (const tag of normalizePinTags(pin.tags || [])) {
                hiddenTypeTags[`${typeKey}|${tag}`] = true;
            }
        }
        return {
            hideAll: true,
            hiddenModules: {},
            hiddenModuleTypes,
            hiddenTags,
            hiddenTypeTags
        };
    }

    static isGlobalHidden() {
        return !!getSettingSafely(MODULE.ID, this.HIDE_ALL_SETTING_KEY, false);
    }

    static isModuleHidden(moduleId) {
        if (!moduleId) return false;
        const map = this._getHiddenModulesMap();
        return !!map[moduleId];
    }

    static isModuleTypeHidden(moduleId, type) {
        if (!moduleId) return false;
        const map = this._getHiddenModuleTypesMap();
        return this._pinVisibilityTypeKeys(moduleId, type).some(key => !!map[key]);
    }

    static isTagHidden(tag) {
        const key = normalizePinGroup(tag);
        if (!key) return false;
        const map = this._getHiddenTagsMap();
        return !!map[key];
    }

    static _getPinTags(pin) {
        return normalizePinTags(pin?.tags);
    }

    static _getPinTypeTaxonomyTags(pin) {
        if (!pin?.moduleId) return new Set();
        return new Set(normalizePinTags(this.getPinTaxonomy(pin.moduleId, pin.type)?.tags || []));
    }

    static _isTagHiddenForPin(pin, tag, typeTaxonomyTags = this._getPinTypeTaxonomyTags(pin)) {
        if (!this.isTagHidden(tag)) return false;
        // Type taxonomy tags are controlled by hiddenTypeTags, not the global hidden tag map.
        return !typeTaxonomyTags.has(normalizePinGroup(tag));
    }

    static _isHiddenByFilter(pin) {
        if (this.isGlobalHidden()) return true;
        if (pin?.moduleId && this.isModuleHidden(pin.moduleId)) return true;
        if (pin?.moduleId && pin?.type != null && this.isModuleTypeHidden(pin.moduleId, pin.type)) return true;
        const tags = this._getPinTags(pin);
        const typeTaxonomyTags = this._getPinTypeTaxonomyTags(pin);
        if (tags.some((tag) => this._isTagHiddenForPin(pin, tag, typeTaxonomyTags))) return true;
        if (pin?.moduleId && tags.some((tag) => this.isTypeTagHidden(pin.moduleId, pin.type, tag))) return true;
        return false;
    }

    static _isHiddenFromPlayers(pin) {
        if (!pin) return false;
        const ow = pin.ownership ?? { default: NONE };
        const defaultLevel = typeof ow.default === 'number' ? ow.default : NONE;
        if (defaultLevel > NONE) return false;
        const users = ow.users && typeof ow.users === 'object' && !Array.isArray(ow.users) ? ow.users : null;
        if (!users) return true;
        return !Object.values(users).some((level) => typeof level === 'number' && level > NONE);
    }

    static async setGlobalHidden(hidden) {
        await game.settings.set(MODULE.ID, this.HIDE_ALL_SETTING_KEY, !!hidden);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static async setModuleHidden(moduleId, hidden) {
        if (!moduleId || typeof moduleId !== 'string') return;
        const map = this._getHiddenModulesMap();
        if (hidden) map[moduleId] = true;
        else delete map[moduleId];
        await game.settings.set(MODULE.ID, this.HIDDEN_MODULES_SETTING_KEY, map);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static async setModuleTypeHidden(moduleId, type, hidden) {
        if (!moduleId || typeof moduleId !== 'string') return;
        const map = this._getHiddenModuleTypesMap();
        const key = this._pinVisibilityTypeKey(moduleId, type);
        if (hidden) map[key] = true;
        else for (const candidate of this._pinVisibilityTypeKeys(moduleId, type)) delete map[candidate];
        await game.settings.set(MODULE.ID, this.HIDDEN_MODULE_TYPES_SETTING_KEY, map);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static async setTagHidden(tag, hidden) {
        const key = normalizePinGroup(tag);
        if (!key) return;
        const map = this._getHiddenTagsMap();
        if (hidden) map[key] = true;
        else delete map[key];
        await game.settings.set(MODULE.ID, this.HIDDEN_TAGS_SETTING_KEY, map);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        const { PinRenderer } = await import('./pins-renderer.js');
        PinRenderer.applyVisibilityFilters();
    }

    static getVisibilityProfileState() {
        return {
            hideAll: this.isGlobalHidden(),
            hiddenModules: this._getHiddenModulesMap(),
            hiddenModuleTypes: this._getHiddenModuleTypesMap(),
            hiddenTags: this._getHiddenTagsMap(),
            hiddenTypeTags: this._getHiddenTypeTagsMap()
        };
    }

    static visibilityStateMatchesProfile(profileName) {
        const key = this._normalizeProfileName(profileName);
        if (!key) return false;
        const saved = this.isSystemVisibilityProfileName(key)
            ? this.getSystemVisibilityProfileState(key)
            : this.getVisibilityProfile(key);
        if (!saved) return false;
        const current = this.getVisibilityProfileState();
        const stable = (obj) => JSON.stringify(Object.fromEntries(Object.entries(obj ?? {}).sort()));
        return current.hideAll === saved.hideAll
            && stable(current.hiddenModules) === stable(saved.hiddenModules)
            && stable(current.hiddenModuleTypes) === stable(saved.hiddenModuleTypes)
            && stable(current.hiddenTags) === stable(saved.hiddenTags)
            && stable(current.hiddenTypeTags) === stable(saved.hiddenTypeTags);
    }

    static async applyVisibilityProfileState(state = {}, options = {}) {
        const normalized = {
            hideAll: !!state.hideAll,
            hiddenModules: state.hiddenModules && typeof state.hiddenModules === 'object' && !Array.isArray(state.hiddenModules) ? { ...state.hiddenModules } : {},
            hiddenModuleTypes: state.hiddenModuleTypes && typeof state.hiddenModuleTypes === 'object' && !Array.isArray(state.hiddenModuleTypes) ? { ...state.hiddenModuleTypes } : {},
            hiddenTags: state.hiddenTags && typeof state.hiddenTags === 'object' && !Array.isArray(state.hiddenTags) ? { ...state.hiddenTags } : {},
            hiddenTypeTags: state.hiddenTypeTags && typeof state.hiddenTypeTags === 'object' && !Array.isArray(state.hiddenTypeTags) ? { ...state.hiddenTypeTags } : {}
        };
        await game.settings.set(MODULE.ID, this.HIDE_ALL_SETTING_KEY, normalized.hideAll);
        await game.settings.set(MODULE.ID, this.HIDDEN_MODULES_SETTING_KEY, normalized.hiddenModules);
        await game.settings.set(MODULE.ID, this.HIDDEN_MODULE_TYPES_SETTING_KEY, normalized.hiddenModuleTypes);
        await game.settings.set(MODULE.ID, this.HIDDEN_TAGS_SETTING_KEY, normalized.hiddenTags);
        await game.settings.set(MODULE.ID, this.HIDDEN_TYPE_TAGS_SETTING_KEY, normalized.hiddenTypeTags);
        if (options.activeProfileName !== undefined) {
            await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, this._normalizeProfileName(options.activeProfileName));
        }
        const { PinRenderer } = await import('./pins-renderer.js');
        await PinRenderer.applyVisibilityFilters();
    }

    static listVisibilityProfiles() {
        const profiles = this._getStoredFilterProfiles();
        return Object.entries(profiles)
            .map(([name, state]) => ({
                name,
                state: foundry.utils.deepClone(state)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    static getVisibilityProfile(name) {
        const key = this._normalizeProfileName(name);
        if (!key) return null;
        const profiles = this._getStoredFilterProfiles();
        const profile = profiles[key];
        return profile ? foundry.utils.deepClone(profile) : null;
    }

    static async saveVisibilityProfile(name) {
        const key = this._normalizeProfileName(name);
        if (!key) throw new Error('Profile name is required.');
        const profiles = this._getStoredFilterProfiles();
        profiles[key] = this.getVisibilityProfileState();
        await game.settings.set(MODULE.ID, this.FILTER_PROFILES_SETTING_KEY, profiles);
        await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, key);
        return { name: key, state: foundry.utils.deepClone(profiles[key]) };
    }

    static async applySystemVisibilityProfile(name, options = {}) {
        const key = this._normalizeProfileName(name);
        const profile = this.getSystemVisibilityProfileState(key, options);
        if (!profile) throw new Error(`System profile not found: ${key}`);
        await this.applyVisibilityProfileState(profile, { activeProfileName: key });
        return profile;
    }

    static _profileHasVisiblePinsWithoutHideAll(profile, sceneId) {
        if (!profile?.hideAll || !sceneId) return false;
        const hiddenModules = profile.hiddenModules && typeof profile.hiddenModules === 'object' ? profile.hiddenModules : {};
        const hiddenModuleTypes = profile.hiddenModuleTypes && typeof profile.hiddenModuleTypes === 'object' ? profile.hiddenModuleTypes : {};
        const hiddenTags = profile.hiddenTags && typeof profile.hiddenTags === 'object' ? profile.hiddenTags : {};
        const hiddenTypeTags = profile.hiddenTypeTags && typeof profile.hiddenTypeTags === 'object' ? profile.hiddenTypeTags : {};
        const pins = this.list({ sceneId, includeHiddenByFilter: true }) || [];
        return pins.some((pin) => {
            if (!pin?.moduleId) return false;
            const typeKey = this._pinVisibilityTypeKey(pin.moduleId, pin.type);
            const typeKeys = this._pinVisibilityTypeKeys(pin.moduleId, pin.type);
            if (hiddenModules[pin.moduleId] || typeKeys.some(key => hiddenModuleTypes[key])) return false;
            const typeTaxonomyTags = this._getPinTypeTaxonomyTags(pin);
            const tags = normalizePinTags(pin.tags || []);
            return !tags.some((tag) =>
                (!typeTaxonomyTags.has(tag) && hiddenTags[tag])
                || this._typeTagKeys(pin.moduleId, pin.type, tag).some(key => hiddenTypeTags[key])
                || hiddenTypeTags[`${typeKey}|${tag}`]
            );
        });
    }

    static async applyVisibilityProfile(name, options = {}) {
        const key = this._normalizeProfileName(name);
        if (!key) throw new Error('Profile name is required.');
        if (this.isSystemVisibilityProfileName(key)) return this.applySystemVisibilityProfile(key, options);
        const profile = this.getVisibilityProfile(key);
        if (!profile) throw new Error(`Profile not found: ${key}`);
        const appliedProfile = this._profileHasVisiblePinsWithoutHideAll(profile, options.sceneId ?? canvas?.scene?.id)
            ? { ...profile, hideAll: false }
            : profile;
        await this.applyVisibilityProfileState(appliedProfile, { activeProfileName: key });
        return appliedProfile;
    }

    static async deleteVisibilityProfile(name) {
        const key = this._normalizeProfileName(name);
        if (!key) return false;
        const profiles = this._getStoredFilterProfiles();
        if (!(key in profiles)) return false;
        delete profiles[key];
        await game.settings.set(MODULE.ID, this.FILTER_PROFILES_SETTING_KEY, profiles);
        if (this.getActiveFilterProfileName() === key) {
            await game.settings.set(MODULE.ID, this.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        }
        return true;
    }

    static _matchesListFilters(pin, options = {}) {
        if (options.moduleId != null && options.moduleId !== '' && pin.moduleId !== options.moduleId) {
            return false;
        }
        if (options.type != null && options.type !== ''
            && this.getVisibilityPinType(pin.moduleId, pin.type) !== this.getVisibilityPinType(pin.moduleId, options.type)) {
            return false;
        }
        if (options.tag != null && options.tag !== '') {
            const tagKey = normalizePinGroup(options.tag);
            if (!this._getPinTags(pin).includes(tagKey)) return false;
        }
        if (options.includeHiddenByFilter === false && this._isHiddenByFilter(pin)) {
            return false;
        }
        return true;
    }

    static getSceneFilterSummary(sceneId, options = {}) {
        if (!sceneId) {
            return { total: 0, modules: [], types: [], tags: [] };
        }
        const pins = this.list({
            sceneId,
            includeHiddenByFilter: options.includeHiddenByFilter === true
        });
        const summary = {
            total: pins.length,
            modules: new Map(),
            types: new Map(),
            tags: new Map()
        };

        const countInto = (map, key, pin) => {
            if (!key) return;
            const current = map.get(key) || { key, count: 0, pins: [] };
            current.count += 1;
            current.pins.push(pin.id);
            map.set(key, current);
        };

        for (const pin of pins) {
            countInto(summary.modules, pin.moduleId || 'unknown', pin);
            countInto(summary.types, `${pin.moduleId || ''}|${this.getVisibilityPinType(pin.moduleId, pin.type)}`, pin);
            for (const tag of this._getPinTags(pin)) countInto(summary.tags, tag, pin);
        }

        return {
            total: summary.total,
            modules: Array.from(summary.modules.values()).sort((a, b) => a.key.localeCompare(b.key)),
            types: Array.from(summary.types.values()).sort((a, b) => a.key.localeCompare(b.key)),
            tags: Array.from(summary.tags.values()).sort((a, b) => a.key.localeCompare(b.key))
        };
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
        if (typeof game !== 'undefined' && game.settings) {
            game.settings.register(MODULE.ID, UNPLACED_SETTING_KEY, {
                scope: 'world',
                config: false,
                type: Object,
                default: { version: 1, pins: [] }
            });
        }
        Hooks.once('ready', () => {
            Hooks.on('unloadModule', (moduleId) => {
                if (moduleId === MODULE.ID) {
                    this.cleanup();
                } else {
                    // Clear pin type labels registered by the unloaded module
                    const prefix = `${moduleId}|`;
                    for (const key of this._pinTypeLabels.keys()) {
                        if (key.startsWith(prefix)) this._pinTypeLabels.delete(key);
                    }
                }
            });
            this.seedTagRegistryIfEmpty().catch(err => {
                console.warn('BLACKSMITH | PINS Failed to seed tag registry:', err);
            });
        });
    }

    /** @returns {PinData[]} */
    static _getUnplacedPins() {
        try {
            const data = game.settings?.get(MODULE.ID, UNPLACED_SETTING_KEY);
            return Array.isArray(data?.pins) ? data.pins : [];
        } catch {
            return [];
        }
    }

    /** @param {PinData[]} pins - Only call from GM context; world setting write requires GM. Non-GM updates to unplaced pins are routed through requestGM('updateUnplaced'). */
    static async _setUnplacedPins(pins) {
        await game.settings.set(MODULE.ID, UNPLACED_SETTING_KEY, { version: 1, pins });
    }

    /**
     * Find where a pin lives: unplaced store or a scene.
     * @param {string} pinId
     * @returns {{ location: 'unplaced'; pin: PinData; index: number } | { location: 'scene'; scene: Scene; sceneId: string; pin: PinData; index: number } | null}
     */
    static _findPinLocation(pinId) {
        const unplaced = this._getUnplacedPins();
        const ui = unplaced.findIndex((p) => p.id === pinId);
        if (ui >= 0) {
            return { location: 'unplaced', pin: unplaced[ui], index: ui };
        }
        const sceneId = this.findSceneForPin(pinId);
        if (!sceneId || !game.scenes) return null;
        const scene = game.scenes.get(sceneId);
        if (!scene) return null;
        const pins = this._getScenePins(scene);
        const si = pins.findIndex((p) => p.id === pinId);
        if (si >= 0) {
            return { location: 'scene', scene, sceneId, pin: pins[si], index: si };
        }
        return null;
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
     * @param {string} [itemData.description] - Optional description text
     * @param {Function} [itemData.onClick] - Callback function (receives pinData)
     * @param {Array} [itemData.submenu] - Optional submenu items [{ name, icon, description, onClick }]
     * @param {string} [itemData.moduleId] - Only show for pins from this module
     * @param {boolean} [itemData.gmOnly] - Only show for GMs (default: false)
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
        const hasSubmenu = Array.isArray(itemData.submenu) && itemData.submenu.length > 0;
        if (!hasSubmenu && typeof itemData.onClick !== 'function') {
            throw new Error('Context menu item must have an onClick function or a submenu');
        }
        
        const menuItem = {
            itemId,
            name: itemData.name,
            icon: itemData.icon || '<i class="fa-solid fa-circle"></i>',
            description: itemData.description || '',
            onClick: itemData.onClick,
            submenu: hasSubmenu ? itemData.submenu : null,
            moduleId: itemData.moduleId,
            order: typeof itemData.order === 'number' ? itemData.order : 999,
            gmOnly: itemData.gmOnly === true,
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
            
            // Check GM-only
            if (item.gmOnly && !game.user?.isGM) {
                continue;
            }

            // Check visibility
            const isVisible = typeof item.visible === 'function' 
                ? item.visible(pinData, userId)
                : item.visible;
            if (!isVisible) {
                continue;
            }
            
            const submenu = Array.isArray(item.submenu)
                ? item.submenu
                    .filter((sub) => sub && typeof sub === 'object')
                    .filter((sub) => !(sub.gmOnly && !game.user?.isGM))
                    .map((sub) => ({
                        name: sub.name,
                        description: sub.description || '',
                        icon: sub.icon || '<i class="fa-solid fa-circle"></i>',
                        callback: () => sub.onClick?.(pinData)
                    }))
                : null;

            items.push({
                itemId,
                name: item.name,
                icon: item.icon,
                description: item.description || '',
                callback: () => item.onClick?.(pinData),
                submenu,
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
     * Check if a pin exists (on a scene or unplaced).
     * @param {string} pinId - The pin ID to check
     * @param {PinGetOptions} [options] - sceneId to check only that scene; omit to check anywhere
     * @returns {boolean} - True if pin exists, false otherwise
     */
    static exists(pinId, options = {}) {
        if (options.sceneId != null) {
            try {
                const scene = this._getScene(options.sceneId);
                return this._getScenePins(scene).some((p) => p.id === pinId);
            } catch {
                return false;
            }
        }
        return this._findPinLocation(pinId) != null;
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

    /**
     * Create a pin. Omit sceneId and x/y to create an unplaced pin (not on canvas).
     * @param {Partial<PinData> & { id: string; moduleId: string } & { x?: number; y?: number }} pinData
     * @param {PinCreateOptions} [options]
     * @returns {Promise<PinData>}
     */
    static async create(pinData, options = {}) {
        if (!this._canCreate()) {
            throw new Error('Permission denied: only GMs can create pins unless pinsAllowPlayerWrites is enabled.');
        }
        const isUnplaced = options.sceneId == null && pinData.x == null && pinData.y == null;
        const validated = isUnplaced
            ? validatePinData(applyDefaults(pinData), { allowUnplaced: true })
            : validatePinData(applyDefaults(pinData));
        if (!validated.ok) {
            throw new Error(validated.error);
        }
        const pin = validated.pin;

        if (isUnplaced) {
            pin.x = undefined;
            pin.y = undefined;
            const context = { moduleId: pin.moduleId, userId: game.user?.id || '', sceneId: null, metadata: pin.config || {} };
            pin.ownership = this._resolveOwnership(context, pin.ownership);
            const unplaced = this._getUnplacedPins();
            if (unplaced.some((p) => p.id === pin.id)) {
                throw new Error(`A pin with id "${pin.id}" already exists (unplaced).`);
            }
            const next = [...unplaced, foundry.utils.deepClone(pin)];
            await this._setUnplacedPins(next);
            this._mirrorTagsForPin(pin);
            if (typeof Hooks !== 'undefined') {
                Hooks.callAll('blacksmith.pins.created', { pinId: pin.id, moduleId: pin.moduleId, placement: 'unplaced', pin: foundry.utils.deepClone(pin) });
            }
            return foundry.utils.deepClone(pin);
        }

        const scene = this._getScene(options.sceneId);
        const context = { moduleId: pin.moduleId, userId: game.user?.id || '', sceneId: scene.id, metadata: pin.config || {} };
        pin.ownership = this._resolveOwnership(context, pin.ownership);
        const pins = this._getScenePins(scene);
        if (pins.some((p) => p.id === pin.id)) {
            throw new Error(`A pin with id "${pin.id}" already exists on this scene.`);
        }
        const next = [...pins, foundry.utils.deepClone(pin)];
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        this._addTagsToRegistry(pin.tags).catch(() => {});
        this._mirrorTagsForPin(pin);
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.created', { pinId: pin.id, sceneId: scene.id, moduleId: pin.moduleId, placement: 'placed', pin: foundry.utils.deepClone(pin) });
        }
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                if (!PinRenderer.getContainer()) return;
                await PinRenderer.updatePin(pin);
                if (pin.eventAnimations?.add?.animation) {
                    await PinRenderer.playAddAnimation(pin.id, pin.eventAnimations.add);
                }
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error updating renderer after create:', err);
            });
        }
        return foundry.utils.deepClone(pin);
    }

    /**
     * Update a pin. Works for both placed and unplaced pins.
     * To place an unplaced pin, pass { sceneId, x, y }. To unplace, use pins.unplace(pinId).
     * @param {string} pinId
     * @param {Partial<PinData>} patch
     * @param {PinUpdateOptions} [options]
     * @returns {Promise<PinData | null>} Returns null if pin not found
     */
    static async update(pinId, patch, options = {}) {
        const loc = this._findPinLocation(pinId);
        if (!loc) {
            console.warn(`BLACKSMITH | PINS Pin not found: ${pinId}. Returning null.`);
            return null;
        }
        const userId = game.user?.id ?? '';
        if (!this._canEdit(loc.pin, userId)) {
            throw new Error('Permission denied: you cannot update this pin.');
        }

        if (loc.location === 'unplaced') {
            // Unplaced pins live in world setting 'pinsUnplaced'; only GMs can write world settings. Non-GM users with edit permission use requestGM so the GM client performs the write.
            if (!game.user?.isGM) {
                const result = await this.requestGM('updateUnplaced', { pinId, patch, options });
                return result ?? null;
            }
            const merged = foundry.utils.deepClone(loc.pin);
            this._applyPatch(merged, patch, null);
            if (patch.sceneId != null && typeof patch.x === 'number' && Number.isFinite(patch.x) && typeof patch.y === 'number' && Number.isFinite(patch.y)) {
                merged.x = patch.x;
                merged.y = patch.y;
                const validated = validatePinData(merged);
                if (!validated.ok) throw new Error(validated.error);
                const placed = validated.pin;
                const unplaced = this._getUnplacedPins().filter((p) => p.id !== pinId);
                await this._setUnplacedPins(unplaced);
                const scene = this._getScene(patch.sceneId);
                const scenePins = this._getScenePins(scene);
                const next = [...scenePins, foundry.utils.deepClone(placed)];
                await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
                this._mirrorTagsForPin(placed);
                if (typeof Hooks !== 'undefined') {
                    Hooks.callAll('blacksmith.pins.placed', { pinId, sceneId: scene.id, moduleId: placed.moduleId, type: placed.type ?? 'default', pin: foundry.utils.deepClone(placed) });
                }
                if (scene.id === canvas?.scene?.id) {
                    import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                        if (!PinRenderer.getContainer()) return;
                        await PinRenderer.updatePin(placed);
                        if (placed.eventAnimations?.add?.animation) {
                            await PinRenderer.playAddAnimation(placed.id, placed.eventAnimations.add);
                        }
                    }).catch(() => {});
                }
                return foundry.utils.deepClone(placed);
            }
            const validated = validatePinData(merged, { allowUnplaced: true });
            if (!validated.ok) throw new Error(validated.error);
            const updated = validated.pin;
            const unplaced = this._getUnplacedPins();
            const next = unplaced.map((p) => (p.id === pinId ? foundry.utils.deepClone(updated) : p));
            await this._setUnplacedPins(next);
            this._mirrorTagsForPin(updated);
            if (typeof Hooks !== 'undefined') {
                Hooks.callAll('blacksmith.pins.updated', { pinId, sceneId: null, moduleId: updated.moduleId, type: updated.type ?? 'default', patch, pin: foundry.utils.deepClone(updated) });
            }
            return foundry.utils.deepClone(updated);
        }

        const scene = loc.scene;
        const pins = this._getScenePins(scene);
        const idx = loc.index;
        const existing = pins[idx];
        if (patch.unplace === true) {
            return this.unplace(pinId) ?? null;
        }
        // Placed pins live in scene flags; only GMs can update Scene. Non-GM users with edit permission use requestGM so the GM client performs the write.
        if (!game.user?.isGM) {
            const result = await this.requestGM('update', {
                sceneId: scene.id,
                pinId,
                patch,
                options
            });
            if (result != null && scene.id === canvas?.scene?.id) {
                import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                    if (!PinRenderer.getContainer()) return;
                    await PinRenderer.updatePin(result);
                    if (result.eventAnimations?.add?.animation) {
                        await PinRenderer.playAddAnimation(result.id, result.eventAnimations.add);
                    }
                }).catch(err => {
                    console.error('BLACKSMITH | PINS Error updating renderer after requestGM update:', err);
                });
            }
            return result ?? null;
        }
        const merged = foundry.utils.deepClone(existing);
        this._applyPatch(merged, patch, scene.id);
        const validated = validatePinData(merged);
        if (!validated.ok) throw new Error(validated.error);
        const updated = validated.pin;
        const next = [...pins];
        next[idx] = foundry.utils.deepClone(updated);
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        this._addTagsToRegistry(updated.tags).catch(() => {});
        this._mirrorTagsForPin(updated);
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.updated', { pinId, sceneId: scene.id, moduleId: updated.moduleId ?? existing.moduleId, type: updated.type ?? existing.type, patch, pin: foundry.utils.deepClone(updated) });
        }
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                if (!PinRenderer.getContainer()) return;
                await PinRenderer.updatePin(updated);
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error updating renderer after update:', err);
            });
        }
        return foundry.utils.deepClone(updated);
    }

    /**
     * Apply patch onto merged pin (mutates merged). Does not handle place/unplace.
     * @param {Record<string, unknown>} merged
     * @param {Partial<PinData>} patch
     * @param {string | null} sceneId - For ownership context
     * @private
     */
    static _applyPatch(merged, patch, sceneId) {
        if (patch.ownership !== undefined && sceneId != null) {
            const context = { moduleId: merged.moduleId, userId: game.user?.id || '', sceneId, metadata: merged.config || {} };
            merged.ownership = this._resolveOwnership(context, patch.ownership);
        }
        if (patch.x != null && Number.isFinite(patch.x)) merged.x = patch.x;
        if (patch.y != null && Number.isFinite(patch.y)) merged.y = patch.y;
        if (patch.size != null && typeof patch.size === 'object') {
            merged.size = { ...merged.size, ...patch.size };
        }
        if (patch.shape != null) {
            const shape = String(patch.shape).toLowerCase();
            if (shape === 'circle' || shape === 'square' || shape === 'none') {
                merged.shape = shape;
            }
        }
        if (typeof patch.dropShadow === 'boolean') {
            merged.dropShadow = patch.dropShadow;
        }
        if (patch.style != null && typeof patch.style === 'object') {
            merged.style = { ...merged.style, ...patch.style };
        }
        if (patch.text !== undefined) merged.text = patch.text ? String(patch.text).trim() : undefined;
        if (patch.textLayout != null) {
            const normalized = normalizeTextLayout(patch.textLayout);
            if (normalized) {
                merged.textLayout = normalized;
        }
        }
        if (patch.textDisplay != null) {
            const display = String(patch.textDisplay).toLowerCase();
            if (display === 'always' || display === 'hover' || display === 'never' || display === 'gm') {
                merged.textDisplay = display;
            }
        }
        if (patch.textColor != null) merged.textColor = String(patch.textColor);
        if (typeof patch.textSize === 'number' && patch.textSize > 0) merged.textSize = patch.textSize;
        if (patch.textMaxLength !== undefined) {
            if (patch.textMaxLength === '' || patch.textMaxLength == null) merged.textMaxLength = 0;
            else {
                const n = Math.max(0, parseInt(String(patch.textMaxLength), 10) | 0);
                if (Number.isFinite(n)) merged.textMaxLength = n;
            }
        }
        if (patch.textMaxWidth !== undefined) {
            if (patch.textMaxWidth === '' || patch.textMaxWidth == null) merged.textMaxWidth = 0;
            else {
                const n = Math.max(0, parseInt(String(patch.textMaxWidth), 10) | 0);
                if (Number.isFinite(n)) merged.textMaxWidth = n;
            }
        }
        if (typeof patch.textScaleWithPin === 'boolean') merged.textScaleWithPin = patch.textScaleWithPin;
        if (patch.image !== undefined) {
            const stored = normalizePinImageForStorage(patch.image);
            merged.image = stored || undefined;
        }
        if (patch.imageFit != null && ['fill', 'contain', 'cover', 'none', 'scale-down', 'zoom'].includes(String(patch.imageFit).toLowerCase())) {
            merged.imageFit = String(patch.imageFit).toLowerCase();
        }
        if (typeof patch.imageZoom === 'number' && Number.isFinite(patch.imageZoom)) {
            merged.imageZoom = Math.max(1, Math.min(2, patch.imageZoom));
        }
        if (patch.iconText !== undefined) {
            merged.iconText = patch.iconText ? String(patch.iconText).trim() : undefined;
        }
        if (patch.type != null) {
            const type = String(patch.type).trim();
            merged.type = type || 'default';
        }
        if (patch.tags !== undefined) {
            merged.tags = normalizePinTags(patch.tags);
        }
        if (typeof patch.allowDuplicatePins === 'boolean') merged.allowDuplicatePins = patch.allowDuplicatePins;
        if (patch.config != null && typeof patch.config === 'object' && !Array.isArray(patch.config)) {
            merged.config = { ...merged.config, ...patch.config };
        }
        if (patch.eventAnimations != null && typeof patch.eventAnimations === 'object' && !Array.isArray(patch.eventAnimations)) {
            const ev = patch.eventAnimations;
            const keys = ['hover', 'click', 'doubleClick', 'delete', 'add'];
            const interactionAnimations = ['ping', 'pulse', 'ripple', 'flash', 'glow', 'bounce', 'scale-small', 'scale-medium', 'scale-large', 'rotate', 'shake'];
            const deleteAnimations = ['fade', 'dissolve', 'scale-small'];
            merged.eventAnimations = merged.eventAnimations && typeof merged.eventAnimations === 'object' ? { ...merged.eventAnimations } : {};
            for (const key of keys) {
                const entry = ev[key];
                if (entry == null || typeof entry !== 'object') continue;
                const anim = entry.animation != null && entry.animation !== '' ? String(entry.animation) : null;
                const snd = entry.sound != null && entry.sound !== '' ? String(entry.sound).trim() : null;
                const validAnim = key === 'delete'
                    ? (anim && deleteAnimations.includes(anim) ? anim : null)
                    : (anim && interactionAnimations.includes(anim) ? anim : null);
                merged.eventAnimations[key] = { animation: validAnim, sound: snd || null };
            }
        }
        if (patch.ownership != null && typeof patch.ownership === 'object') {
            merged.ownership = { ...merged.ownership, ...patch.ownership };
        }
    }

    /**
     * Place an unplaced pin on a scene. No-op if pin is already on a scene.
     * @param {string} pinId
     * @param {{ sceneId: string; x: number; y: number }} placement
     * @returns {Promise<PinData | null>} The placed pin or null if not found (e.g. not unplaced)
     */
    static async place(pinId, placement) {
        const loc = this._findPinLocation(pinId);
        if (!loc || loc.location !== 'unplaced') {
            console.warn(`BLACKSMITH | PINS Pin ${pinId} not found or not unplaced. Cannot place.`);
            return null;
        }
        const userId = game.user?.id ?? '';
        if (!this._canEdit(loc.pin, userId)) {
            throw new Error('Permission denied: you cannot place this pin.');
        }
        // Placing removes from unplaced (world setting) and adds to scene (scene flag); only GMs can write either. Non-GM users use requestGM so the GM client performs both writes.
        if (!game.user?.isGM) {
            const result = await this.requestGM('place', { pinId, placement });
            if (result != null && placement.sceneId === canvas?.scene?.id) {
                import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                    if (!PinRenderer.getContainer()) return;
                    await PinRenderer.updatePin(result);
                    if (result.eventAnimations?.add?.animation) {
                        await PinRenderer.playAddAnimation(result.id, result.eventAnimations.add);
                    }
                }).catch(err => {
                    console.error('BLACKSMITH | PINS Error updating renderer after requestGM place:', err);
                });
            }
            return result ?? null;
        }
        const scene = this._getScene(placement.sceneId);
        const pin = foundry.utils.deepClone(loc.pin);
        pin.x = placement.x;
        pin.y = placement.y;
        const validated = validatePinData(pin);
        if (!validated.ok) throw new Error(validated.error);
        const placed = validated.pin;
        const unplaced = this._getUnplacedPins().filter((p) => p.id !== pinId);
        await this._setUnplacedPins(unplaced);
        const pins = this._getScenePins(scene);
        const next = [...pins, foundry.utils.deepClone(placed)];
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.placed', { pinId, sceneId: scene.id, moduleId: placed.moduleId, type: placed.type ?? 'default', pin: foundry.utils.deepClone(placed) });
        }
        if (scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(async ({ PinRenderer }) => {
                if (!PinRenderer.getContainer()) return;
                await PinRenderer.updatePin(placed);
                if (placed.eventAnimations?.add?.animation) {
                    await PinRenderer.playAddAnimation(placed.id, placed.eventAnimations.add);
                }
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error updating renderer after place:', err);
            });
        }
        return foundry.utils.deepClone(placed);
    }

    /**
     * Unplace a pin (remove from canvas but keep pin data). Moves pin to unplaced store.
     * @param {string} pinId
     * @returns {Promise<PinData | null>} The unplaced pin data or null if not found
     */
    static async unplace(pinId) {
        const loc = this._findPinLocation(pinId);
        if (!loc || loc.location !== 'scene') {
            console.warn(`BLACKSMITH | PINS Pin ${pinId} not found on a scene. Cannot unplace.`);
            return null;
        }
        const userId = game.user?.id ?? '';
        if (!this._canEdit(loc.pin, userId)) {
            throw new Error('Permission denied: you cannot unplace this pin.');
        }
        // Unplacing removes from scene (scene flag) and adds to unplaced (world setting); only GMs can write either. Non-GM users use requestGM so the GM client performs both writes.
        if (!game.user?.isGM) {
            const result = await this.requestGM('unplace', { pinId, sceneId: loc.scene.id });
            if (result != null && loc.scene.id === canvas?.scene?.id) {
                import('./pins-renderer.js').then(({ PinRenderer }) => {
                    PinRenderer.removePin(pinId);
                }).catch(err => {
                    console.error('BLACKSMITH | PINS Error removing pin from renderer after requestGM unplace:', err);
                });
            }
            return result ?? null;
        }
        const pin = foundry.utils.deepClone(loc.pin);
        pin.x = undefined;
        pin.y = undefined;
        const unplaced = this._getUnplacedPins();
        const next = [...unplaced, pin];
        await this._setUnplacedPins(next);
        const pins = this._getScenePins(loc.scene).filter((p) => p.id !== pinId);
        await loc.scene.setFlag(MODULE.ID, this.FLAG_KEY, pins);
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.unplaced', { pinId, sceneId: loc.sceneId, moduleId: pin.moduleId, type: pin.type ?? 'default', pin: foundry.utils.deepClone(pin) });
        }
        if (loc.scene.id === canvas?.scene?.id) {
            import('./pins-renderer.js').then(({ PinRenderer }) => {
                PinRenderer.removePin(pinId);
            }).catch(err => {
                console.error('BLACKSMITH | PINS Error removing pin from renderer:', err);
            });
        }
        return foundry.utils.deepClone(pin);
    }

    /**
     * Delete a pin (placed or unplaced).
     * @param {string} pinId
     * @param {PinDeleteOptions} [options]
     * @returns {Promise<void>}
     */
    static async delete(pinId, options = {}) {
        const loc = this._findPinLocation(pinId);
        if (!loc) {
            throw new Error(`Pin not found: ${pinId}`);
        }
        const existing = loc.pin;
        const userId = game.user?.id ?? '';
        if (!this._canEdit(existing, userId)) {
            throw new Error('Permission denied: you cannot delete this pin.');
        }
        if (loc.location === 'scene' && loc.scene.id === canvas?.scene?.id && existing.eventAnimations?.delete?.animation) {
            try {
                const { PinRenderer } = await import('./pins-renderer.js');
                await PinRenderer.playDeleteAnimation(pinId, existing.eventAnimations.delete);
            } catch (err) {
                console.warn('BLACKSMITH | PINS Delete animation failed:', err);
            }
        }
        // Deleting writes scene flags (placed) or world setting (unplaced); only GMs can write. Non-GM users use requestGM so the GM client performs the write.
        if (!game.user?.isGM) {
            const sceneId = loc.location === 'scene' ? loc.scene.id : null;
            const wasOnCurrentScene = loc.location === 'scene' && loc.scene.id === canvas?.scene?.id;
            await this.requestGM('delete', { sceneId, pinId, options });
            if (wasOnCurrentScene) {
                import('./pins-renderer.js').then(({ PinRenderer }) => {
                    PinRenderer.removePin(pinId);
                }).catch(() => {});
            }
            return;
        }
        if (loc.location === 'unplaced') {
            const next = this._getUnplacedPins().filter((p) => p.id !== pinId);
            await this._setUnplacedPins(next);
            this._clearTagsForPin(existing);
        } else {
            const pins = this._getScenePins(loc.scene).filter((p) => p.id !== pinId);
            await loc.scene.setFlag(MODULE.ID, this.FLAG_KEY, pins);
            this._clearTagsForPin(existing);
            if (loc.scene.id === canvas?.scene?.id) {
                import('./pins-renderer.js').then(({ PinRenderer }) => {
                    PinRenderer.removePin(pinId);
                }).catch(() => {});
            }
        }
        if (typeof Hooks !== 'undefined') {
            Hooks.callAll('blacksmith.pins.deleted', {
                pinId,
                sceneId: loc.location === 'scene' ? loc.sceneId : null,
                moduleId: existing.moduleId ?? undefined,
                type: existing.type ?? undefined,
                pin: foundry.utils.deepClone(existing),
                config: existing.config ?? undefined
            });
        }
    }

    /**
     * Get a pin by id. If options.sceneId is omitted, looks in unplaced then on any scene.
     * @param {string} pinId
     * @param {PinGetOptions} [options]
     * @returns {PinData | null}
     */
    static get(pinId, options = {}) {
        if (options.sceneId != null) {
            try {
                const scene = this._getScene(options.sceneId);
                const pin = this._getScenePins(scene).find((p) => p.id === pinId) ?? null;
                if (!pin) return null;
                const userId = game.user?.id ?? '';
                if (!this._canView(pin, userId)) return null;
                return foundry.utils.deepClone(pin);
            } catch {
                return null;
            }
        }
        const loc = this._findPinLocation(pinId);
        if (!loc) return null;
        const userId = game.user?.id ?? '';
        if (!this._canView(loc.pin, userId)) return null;
        return foundry.utils.deepClone(loc.pin);
    }

    /**
     * List pins. Use unplacedOnly: true for unplaced pins; otherwise use sceneId for a scene.
     * @param {PinListOptions} [options]
     * @returns {PinData[]}
     */
    static list(options = {}) {
        if (options.unplacedOnly) {
            let pins = this._getUnplacedPins();
            const userId = game.user?.id ?? '';
            pins = pins.filter((p) => this._canView(p, userId));
            pins = pins.filter((p) => this._matchesListFilters(p, options));
            return pins.map((p) => foundry.utils.deepClone(p));
        }
        const scene = this._getScene(options.sceneId);
        let pins = this._getScenePins(scene);
        const userId = game.user?.id ?? '';
        pins = pins.filter((p) => this._canView(p, userId));
        pins = pins.filter((p) => this._matchesListFilters(p, options));
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
     * GM-side socket body for {@link PinManager.requestGM} (`blacksmith-pins-gm-proxy`).
     * Kept in one place so early registration (`blacksmith.socketReady`) matches lazy registration.
     */
    static async _handlePinsGmProxyRequest(data) {
        if (!game.user?.isGM) {
            return { error: 'Permission denied: only GMs can execute pin actions.' };
        }
        try {
            switch (data.action) {
                case 'create': {
                    const created = await this.createAsGM(data.params.sceneId, data.params.payload, data.params.options || {});
                    return { success: true, data: created };
                }
                case 'update': {
                    const updated = await this.updateAsGM(data.params.sceneId, data.params.pinId, data.params.patch, data.params.options || {});
                    return { success: true, data: updated };
                }
                case 'updateUnplaced': {
                    const updatedUnplaced = await this.update(data.params.pinId, data.params.patch, data.params.options || {});
                    return { success: true, data: updatedUnplaced };
                }
                case 'place': {
                    const placed = await this.place(data.params.pinId, data.params.placement);
                    return { success: true, data: placed };
                }
                case 'unplace': {
                    const unplaced = await this.unplace(data.params.pinId);
                    return { success: true, data: unplaced };
                }
                case 'delete': {
                    await this.deleteAsGM(data.params.sceneId, data.params.pinId, data.params.options || {});
                    return { success: true };
                }
                default:
                    return { error: `Unknown action: ${data.action}` };
            }
        } catch (err) {
            return { error: err.message || String(err) };
        }
    }

    /**
     * Request GM to perform a pin action (for non-GM users)
     * Uses socket system to forward request to GM. Used when the caller has edit permission but cannot write the backing store (scene flags require Scene update; unplaced pins use world setting 'pinsUnplaced').
     * @param {string} action - Action type: 'create', 'update', 'updateUnplaced', 'place', 'unplace', or 'delete'
     * @param {Object} params - Action parameters. For 'update': sceneId, pinId, patch, options. For 'updateUnplaced': pinId, patch, options. For 'place': pinId, placement. For 'unplace': pinId.
     * @param {string} [params.sceneId] - Target scene (create, update, delete)
     * @param {string} [params.pinId] - Pin ID (update, updateUnplaced, delete)
     * @param {Object} [params.patch] - Update patch (update, updateUnplaced)
     * @param {Object} [params.options] - Options (update, updateUnplaced)
     * @param {Object} [params.payload] - Pin data (create)
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
                case 'updateUnplaced':
                    return this.update(params.pinId, params.patch, params.options || {});
                case 'place':
                    return this.place(params.pinId, params.placement);
                case 'unplace':
                    return this.unplace(params.pinId);
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
            socket.register(handlerName, async (data) => PinManager._handlePinsGmProxyRequest(data));
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

// Register pins GM-proxy socket handler on all clients when socket is ready.
// SocketLib executeAsGM runs the handler on the GM client, so the GM must have it registered
// before any non-GM calls requestGM(). Lazy registration in requestGM() only runs on the
// calling client; we need the handler registered on the GM via this hook.
if (typeof Hooks !== 'undefined') {
    Hooks.once('blacksmith.socketReady', async () => {
        try {
            const { SocketManager } = await import('./manager-sockets.js');
            const socket = SocketManager.getSocket();
            if (!socket?.register) return;
            if (PinManager._gmProxyHandlerRegistered) return;
            const handlerName = 'blacksmith-pins-gm-proxy';
            socket.register(handlerName, async (data) => PinManager._handlePinsGmProxyRequest(data));
            PinManager._gmProxyHandlerRegistered = true;
        } catch (_) {
            // Socket or registration failed; requestGM will still attempt lazy registration when called
        }
    });
}
