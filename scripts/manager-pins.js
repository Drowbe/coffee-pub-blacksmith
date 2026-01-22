// ==================================================================
// ===== MANAGER-PINS – Pin lifecycle, CRUD, permissions ============
// ==================================================================
// Phase 1.2: PinManager. Uses pins-schema for validation/migration.
// Pins stored in scene.flags[MODULE.ID].pins[]. No rendering here.
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

export class PinManager {
    static FLAG_KEY = 'pins';
    static SETTING_ALLOW_PLAYER_WRITES = 'pinsAllowPlayerWrites';

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
        return level >= NONE;
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
                postConsoleAndNotification(MODULE.NAME, 'Pins: Failed to persist repaired pins', err?.message ?? err, false, true);
            });
        }
        return pins;
    }

    static initialize() {
        postConsoleAndNotification(MODULE.NAME, 'PinManager initialized', '', true, false);
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
        return foundry.utils.deepClone(updated);
    }

    /**
     * @param {string} pinId
     * @param {PinDeleteOptions} [options]
     * @returns {Promise<void>}
     */
    static async delete(pinId, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const idx = pins.findIndex((p) => p.id === pinId);
        if (idx === -1) {
            throw new Error(`Pin not found: ${pinId}`);
        }
        const existing = pins[idx];
        const userId = game.user?.id ?? '';
        if (!this._canEdit(existing, userId)) {
            throw new Error('Permission denied: you cannot delete this pin.');
        }
        const next = pins.filter((p) => p.id !== pinId);
        await scene.setFlag(MODULE.ID, this.FLAG_KEY, next);
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
