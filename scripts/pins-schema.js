// ==================================================================
// ===== PINS SCHEMA – data model, validation, migration ============
// ==================================================================
// Phase 1.1: Pin data structure, defaults, validation, migration.
// Used by manager-pins.js. No rendering or canvas logic here.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

// ------------------------------------------------------------------
// Types (JSDoc only)
// ------------------------------------------------------------------

/**
 * @typedef {Object} PinData
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {{ w: number; h: number }} size
 * @property {{ fill?: string; stroke?: string; strokeWidth?: number; alpha?: number }} style
 * @property {string} [text] - Text content to display
 * @property {string} [image]
 * @property {'circle' | 'square' | 'none'} [shape] - Pin shape: 'circle' (default), 'square', or 'none' (icon only, no background)
 * @property {boolean} [dropShadow] - Whether to show drop shadow (default: true)
 * @property {'under' | 'over' | 'around'} [textLayout] - Text layout: 'under' (below pin), 'over' (centered over pin), or 'around' (curved around pin edge)
 * @property {'always' | 'hover' | 'never' | 'gm'} [textDisplay] - Text display mode: 'always' (default), 'hover', 'never', or 'gm' (GM only)
 * @property {string} [textColor] - Text color (default: '#ffffff')
 * @property {number} [textSize] - Text size in pixels (default: 12)
 * @property {number} [textMaxLength] - Maximum text length before ellipsis (default: 0 = no limit)
 * @property {boolean} [textScaleWithPin] - Whether text scales with pin size based on zoom (default: true). If false, text stays fixed size.
 * @property {string} [type] - Pin type/category (e.g., 'note', 'quest', 'location', 'npc'). Defaults to 'default' if not specified. Used for filtering and organization.
 * @property {Record<string, unknown>} config
 * @property {string} moduleId
 * @property {{ default: number; users?: Record<string, number> }} ownership
 * @property {number} version
 */

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

/** Current pin data schema version. Bump when format changes and add migration. */
export const PIN_SCHEMA_VERSION = 2;

/** Default values per architecture (apply when creating/validating, not stored if omitted). */
export const PIN_DEFAULTS = Object.freeze({
    size: { w: 32, h: 32 },
    style: { fill: '#000000', stroke: '#ffffff', strokeWidth: 2, alpha: 1 },
    shape: 'circle', // 'circle' | 'square' | 'none'
    dropShadow: true,
    textLayout: 'under', // 'under' | 'around'
    textDisplay: 'always', // 'always' | 'hover' | 'never' | 'gm'
    textColor: '#ffffff',
    textSize: 12,
    textMaxLength: 0, // 0 = no limit
    textScaleWithPin: true, // If true, text scales with zoom; if false, text stays fixed size
    type: 'default', // Pin type/category - defaults to 'default' if not specified
    version: PIN_SCHEMA_VERSION,
    ownership: { default: 0 },
    config: {}
});

// ------------------------------------------------------------------
// Migration map: version -> (pin) => migrated pin
// ------------------------------------------------------------------

const MIGRATION_MAP = new Map();

// Migration from v1 to v2: Add type field with default 'default'
MIGRATION_MAP.set(2, (pin) => {
    const migrated = { ...pin };
    // If type doesn't exist, set to 'default'
    if (migrated.type == null || migrated.type === '') {
        migrated.type = 'default';
    }
    return migrated;
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function _log(msg, detail = '') {
    // Silent - validation messages not needed in production
}

/**
 * Apply defaults to partial pin data. Does not mutate input.
 * @param {Partial<PinData>} partial
 * @returns {PinData}
 */
export function applyDefaults(partial) {
    const base = {
        id: '',
        x: 0,
        y: 0,
        size: { ...PIN_DEFAULTS.size },
        style: { ...PIN_DEFAULTS.style },
        shape: PIN_DEFAULTS.shape,
        text: undefined,
        image: undefined,
        type: PIN_DEFAULTS.type, // Always set default type
        config: { ...(PIN_DEFAULTS.config) },
        moduleId: '',
        ownership: { ...PIN_DEFAULTS.ownership },
        version: PIN_SCHEMA_VERSION
    };
    if (partial.id != null) base.id = String(partial.id).trim();
    if (typeof partial.x === 'number') base.x = partial.x;
    if (typeof partial.y === 'number') base.y = partial.y;
    if (partial.size != null && typeof partial.size === 'object') {
        if (typeof partial.size.w === 'number') base.size.w = partial.size.w;
        if (typeof partial.size.h === 'number') base.size.h = partial.size.h;
    }
    if (partial.style != null && typeof partial.style === 'object') {
        if (partial.style.fill != null) base.style.fill = String(partial.style.fill);
        if (partial.style.stroke != null) base.style.stroke = String(partial.style.stroke);
        if (typeof partial.style.strokeWidth === 'number') base.style.strokeWidth = partial.style.strokeWidth;
        if (typeof partial.style.alpha === 'number') base.style.alpha = partial.style.alpha;
    }
    if (partial.shape != null) {
        const shape = String(partial.shape).toLowerCase();
        // Validate shape - only allow supported shapes
        if (shape === 'circle' || shape === 'square' || shape === 'none') {
            base.shape = shape;
        } else {
            // Invalid shape, use default
            base.shape = PIN_DEFAULTS.shape;
        }
    }
    if (typeof partial.dropShadow === 'boolean') {
        base.dropShadow = partial.dropShadow;
    }
    if (partial.text != null) base.text = String(partial.text).trim() || undefined;
    if (partial.image != null) base.image = String(partial.image).trim() || undefined;
    if (partial.textLayout != null) {
        const layout = String(partial.textLayout).toLowerCase();
        if (layout === 'under' || layout === 'over' || layout === 'around') {
            base.textLayout = layout;
        }
    }
    if (partial.textDisplay != null) {
        const display = String(partial.textDisplay).toLowerCase();
        if (display === 'always' || display === 'hover' || display === 'never' || display === 'gm') {
            base.textDisplay = display;
        }
    }
    if (partial.textColor != null) base.textColor = String(partial.textColor);
    if (typeof partial.textSize === 'number' && partial.textSize > 0) base.textSize = partial.textSize;
    if (typeof partial.textMaxLength === 'number' && partial.textMaxLength >= 0) base.textMaxLength = partial.textMaxLength;
    if (typeof partial.textScaleWithPin === 'boolean') base.textScaleWithPin = partial.textScaleWithPin;
    if (partial.type != null) {
        base.type = String(partial.type).trim() || PIN_DEFAULTS.type;
    } else {
        base.type = PIN_DEFAULTS.type; // Always set default type
    }
    if (partial.config != null && typeof partial.config === 'object' && !Array.isArray(partial.config)) {
        base.config = foundry.utils.deepClone(partial.config);
    }
    if (partial.moduleId != null) base.moduleId = String(partial.moduleId).trim();
    if (partial.ownership != null && typeof partial.ownership === 'object') {
        base.ownership = { ...PIN_DEFAULTS.ownership };
        if (typeof partial.ownership.default === 'number') base.ownership.default = partial.ownership.default;
        if (partial.ownership.users != null && typeof partial.ownership.users === 'object' && !Array.isArray(partial.ownership.users)) {
            base.ownership.users = { ...partial.ownership.users };
        }
    }
    if (typeof partial.version === 'number') base.version = partial.version;
    return base;
}

/**
 * Validate a single pin after defaults applied. Returns { ok, pin, error }.
 * @param {unknown} raw
 * @returns {{ ok: true; pin: PinData } | { ok: false; error: string }}
 */
export function validatePinData(raw) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'Pin must be a non-null object.' };
    }
    const o = /** @type {Record<string, unknown>} */ (raw);
    if (typeof o.id !== 'string' || !o.id.trim()) {
        return { ok: false, error: 'Pin id must be a non-empty string (UUID).' };
    }
    if (typeof o.x !== 'number' || !Number.isFinite(o.x)) {
        return { ok: false, error: 'Pin x must be a finite number.' };
    }
    if (typeof o.y !== 'number' || !Number.isFinite(o.y)) {
        return { ok: false, error: 'Pin y must be a finite number.' };
    }
    if (typeof o.moduleId !== 'string' || !o.moduleId.trim()) {
        return { ok: false, error: 'Pin moduleId must be a non-empty string.' };
    }
    if (o.size != null && (typeof o.size !== 'object' || Array.isArray(o.size))) {
        return { ok: false, error: 'Pin size must be an object { w, h }.' };
    }
    if (o.style != null && (typeof o.style !== 'object' || Array.isArray(o.style))) {
        return { ok: false, error: 'Pin style must be an object.' };
    }
    if (o.config != null && (typeof o.config !== 'object' || Array.isArray(o.config))) {
        return { ok: false, error: 'Pin config must be a plain object.' };
    }
    if (o.ownership != null && (typeof o.ownership !== 'object' || Array.isArray(o.ownership))) {
        return { ok: false, error: 'Pin ownership must be an object.' };
    }
    const pin = applyDefaults(o);
    return { ok: true, pin };
}

/**
 * Run migrations for a single pin, then validate. Mutates pin in-place during migration.
 * @param {Record<string, unknown>} pin
 * @returns {{ ok: true; pin: PinData } | { ok: false; error: string }}
 */
export function migrateAndValidatePin(pin) {
    const working = foundry.utils.deepClone(pin);
    let current = /** @type {Record<string, unknown>} */ (working);
    let fromVersion = typeof current.version === 'number' ? current.version : 0;
    if (fromVersion < 0) fromVersion = 0;

    while (fromVersion < PIN_SCHEMA_VERSION) {
        const nextVersion = fromVersion + 1;
        const fn = MIGRATION_MAP.get(nextVersion);
        if (fn) {
            try {
                current = fn(current);
                if (current == null || typeof current !== 'object') {
                    return { ok: false, error: `Migration v${nextVersion} returned invalid pin.` };
                }
                current.version = nextVersion;
                fromVersion = nextVersion;
            } catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `Migration v${nextVersion} failed: ${err}` };
            }
        } else {
            fromVersion = nextVersion;
        }
    }

    return validatePinData(current);
}

/**
 * Migrate and validate a raw pins array from scene flags. Drops invalid entries; never throws.
 * @param {unknown} rawArray
 * @returns {{ pins: PinData[]; dropped: number; errors: string[] }}
 */
export function migrateAndValidatePins(rawArray) {
    const pins = [];
    const errors = [];
    let dropped = 0;

    if (!Array.isArray(rawArray)) {
        _log('Pins flags value is not an array; treating as empty.', String(rawArray));
        return { pins: [], dropped: 0, errors: ['Pins value was not an array.'] };
    }

    for (let i = 0; i < rawArray.length; i++) {
        const raw = rawArray[i];
        const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
            ? foundry.utils.deepClone(/** @type {Record<string, unknown>} */ (raw))
            : {};
        const migrated = migrateAndValidatePin(/** @type {Record<string, unknown>} */ (obj));
        if (migrated.ok) {
            pins.push(migrated.pin);
        } else {
            dropped++;
            const rawObj = /** @type {Record<string, unknown>} */ (raw);
            const rawId = typeof raw === 'object' && raw !== null && typeof rawObj.id === 'string' ? rawObj.id : '?';
            const msg = `Pin index ${i} (id=${rawId}): ${migrated.error}`;
            errors.push(msg);
            _log('Dropped invalid pin', msg);
        }
    }

    if (dropped > 0) {
        _log(`Dropped ${dropped} invalid pin(s).`, errors.join('; '));
    }
    return { pins, dropped, errors };
}
