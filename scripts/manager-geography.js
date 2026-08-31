import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

// ==================================================================
// ===== SCENE GEOGRAPHY AND ENVIRONMENT ============================
// ==================================================================
//
// What Blacksmith knows about a PLACE, stored on the place.
//
// Geography used to live in four world settings that described "wherever the
// last import was pointed" rather than any particular scene. Those settings are
// still here and still meaningful, but they are now the SEED for a scene that
// has not been told otherwise, not live state. A scene's own flag wins.
//
// Storage is a document flag rather than a world setting so the data travels
// with the scene on export, duplicate and compendium round-trip; needs no
// orphan cleanup when a scene is deleted; and does not serialise every write
// through one world-setting document.

/** Flag key on the Scene document. */
export const GEOGRAPHY_FLAG = 'geography';

/**
 * The canonical environment vocabulary.
 *
 * A CLOSED constant, deliberately, not a registry. It matches every consumer
 * that exists, and it is the safe direction on an API: a constant can become a
 * pre-populated registry later without breaking anyone, where a registry cannot
 * be narrowed back to a constant. It also means an environment value can never
 * be unknown, which retires the question of what a consumer should do with one.
 *
 * `key` is what is stored and joined on; `label` is what a person reads. They
 * are separate because at least one consumer uses the stored value as both a
 * round-trip key and the visible button text, and a value that is simultaneously
 * identity and label cannot be made human-readable without breaking the round trip.
 *
 * Keys are lowercase. Consumers normalise case at their own boundary rather than
 * trusting the stored form -- a value written before this vocabulary existed, or
 * by a hand-edited flag, is otherwise a silent join failure.
 */
export const ENVIRONMENTS = Object.freeze([
    { key: 'mountain', label: 'Mountain' },
    { key: 'arctic', label: 'Arctic' },
    { key: 'planar', label: 'Planar' },
    { key: 'coastal', label: 'Coastal' },
    { key: 'swamp', label: 'Swamp' },
    { key: 'desert', label: 'Desert' },
    { key: 'underdark', label: 'Underdark' },
    { key: 'forest', label: 'Forest' },
    { key: 'underwater', label: 'Underwater' },
    { key: 'grassland', label: 'Grassland' },
    { key: 'urban', label: 'Urban' },
    { key: 'hill', label: 'Hill' }
]);

/** Just the keys, for membership checks. */
export const ENVIRONMENT_KEYS = Object.freeze(ENVIRONMENTS.map(e => e.key));

/** The four geography fields, in breadcrumb order, with their seed settings. */
const GEOGRAPHY_FIELDS = Object.freeze([
    { key: 'realm', setting: 'defaultCampaignRealm', label: 'Realm' },
    { key: 'region', setting: 'defaultCampaignRegion', label: 'Region' },
    { key: 'site', setting: 'defaultCampaignSite', label: 'Site' },
    { key: 'area', setting: 'defaultCampaignArea', label: 'Area' }
]);

export const GEOGRAPHY_FIELD_LIST = GEOGRAPHY_FIELDS;

// ==================================================================
// ===== NORMALISATION ==============================================
// ==================================================================

/**
 * Normalise one environment value to a canonical key, or null.
 * Accepts any case so a value stored before this vocabulary existed still resolves.
 */
export function normalizeEnvironment(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    return ENVIRONMENT_KEYS.includes(key) ? key : null;
}

/**
 * Normalise a stored environment array.
 *
 * Filters against the VOCABULARY, never against truthiness, and that is the whole
 * point of the function. Several checkboxes sharing one name submit one entry per
 * box, `null` for each unticked one, so the raw value from a form is typically
 * `[null, null, 'forest', null, ...]`. `String(null)` is `"null"`, which is truthy,
 * so the obvious `.map(String).filter(Boolean)` turns those nulls into the literal
 * string "null" once per box -- data that looks populated and matches nothing.
 */
export function normalizeEnvironments(value) {
    const raw = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
    const seen = new Set();
    for (const entry of raw) {
        const key = normalizeEnvironment(entry);
        if (key) seen.add(key);
    }
    // Emitted in vocabulary order rather than the order they were ticked, so the
    // stored value is stable and two scenes with the same environments compare equal.
    return ENVIRONMENT_KEYS.filter(key => seen.has(key));
}

/** Clamp a reputation value, or null when it was never set. */
function normalizeReputation(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return null;
    return Math.max(-100, Math.min(100, Math.round(number)));
}

// ==================================================================
// ===== READ =======================================================
// ==================================================================

export class GeographyManager {

    /** The raw stored flag, or an empty object. */
    static getRaw(scene) {
        if (!scene?.getFlag) return {};
        try {
            return scene.getFlag(MODULE.ID, GEOGRAPHY_FLAG) ?? {};
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Geography: could not read the scene flag', error?.message || error, false, false);
            return {};
        }
    }

    /** The four world settings, which seed a scene that has no flag of its own. */
    static getWorldDefaults() {
        const out = {};
        for (const field of GEOGRAPHY_FIELDS) {
            out[field.key] = getSettingSafely(MODULE.ID, field.setting, '') || '';
        }
        return out;
    }

    /**
     * The four geography fields for a scene: its own value where it has one,
     * the world default where it does not.
     *
     * Called with no scene this returns the world defaults alone, which is what
     * every caller predating the scene flag already expected.
     */
    static getGeography(scene = null) {
        const defaults = this.getWorldDefaults();
        if (!scene) return defaults;

        const stored = this.getRaw(scene);
        const out = {};
        for (const field of GEOGRAPHY_FIELDS) {
            const value = typeof stored[field.key] === 'string' ? stored[field.key].trim() : '';
            // An empty string means "inherit", not "deliberately blank". A GM clearing the
            // box gets the world default back rather than an empty breadcrumb segment.
            out[field.key] = value || defaults[field.key];
        }
        return out;
    }

    /** The canonical environment keys for a scene. */
    static getEnvironments(scene) {
        return normalizeEnvironments(this.getRaw(scene).environment);
    }

    /**
     * Everything Blacksmith knows about a scene as a place.
     * `reputation` is null when it was never set, which is not the same as 0 (neutral).
     */
    static getSceneContext(scene = null) {
        const stored = this.getRaw(scene);
        return {
            ...this.getGeography(scene),
            environment: normalizeEnvironments(stored.environment),
            reputation: normalizeReputation(stored.reputation),
            locationUuid: typeof stored.locationUuid === 'string' && stored.locationUuid ? stored.locationUuid : null
        };
    }

    /**
     * The realm/region/site/area breadcrumb, skipping empty segments.
     * @returns {string} e.g. "Faerun > Sword Coast > Baldur's Gate"
     */
    static getBreadcrumb(scene = null) {
        const geography = this.getGeography(scene);
        return GEOGRAPHY_FIELDS
            .map(field => geography[field.key])
            .filter(Boolean)
            .join(' > ');
    }

    // ==================================================================
    // ===== WRITE ======================================================
    // ==================================================================

    /**
     * Write part or all of the geography flag for a scene. GM only.
     *
     * Values are normalised on the way in, so a caller cannot store an environment
     * outside the vocabulary or a reputation outside the scale.
     *
     * @param {Scene} scene
     * @param {Object} data - Any subset of {realm, region, site, area, environment, reputation, locationUuid}.
     * @returns {Promise<boolean>} True when written.
     */
    static async setGeography(scene, data = {}) {
        if (!game.user?.isGM) return false;
        if (!scene?.setFlag) return false;

        const update = {};
        for (const field of GEOGRAPHY_FIELDS) {
            if (field.key in data) update[field.key] = String(data[field.key] ?? '').trim();
        }
        if ('environment' in data) update.environment = normalizeEnvironments(data.environment);
        if ('reputation' in data) update.reputation = normalizeReputation(data.reputation);
        if ('locationUuid' in data) {
            const uuid = data.locationUuid;
            update.locationUuid = typeof uuid === 'string' && uuid.trim() ? uuid.trim() : null;
        }
        if (!Object.keys(update).length) return false;

        try {
            const merged = { ...this.getRaw(scene), ...update };
            await scene.setFlag(MODULE.ID, GEOGRAPHY_FLAG, merged);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Geography: could not write the scene flag', error?.message || error, false, true);
            return false;
        }
    }

    /** Remove the whole flag, returning the scene to the world defaults. GM only. */
    static async clearGeography(scene) {
        if (!game.user?.isGM) return false;
        if (!scene?.unsetFlag) return false;
        try {
            await scene.unsetFlag(MODULE.ID, GEOGRAPHY_FLAG);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Geography: could not clear the scene flag', error?.message || error, false, true);
            return false;
        }
    }
}
