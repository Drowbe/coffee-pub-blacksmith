import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import {
    HABITATS,
    HABITAT_KEYS,
    GEOGRAPHY_FIELDS,
    GEOGRAPHY_FIELD_LIST,
    normalizeHabitat,
    normalizeHabitats
} from './utility-geography-vocabulary.js';

// Re-exported so every consumer keeps importing geography from one place, while the
// vocabulary itself stays free of const.js -- see utility-geography-vocabulary.js.
export {
    HABITATS,
    HABITAT_KEYS,
    GEOGRAPHY_FIELDS,
    GEOGRAPHY_FIELD_LIST,
    normalizeHabitat,
    normalizeHabitats
};

// ==================================================================
// ===== SCENE GEOGRAPHY AND HABITAT ================================
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

/** Clamp a reputation value, or null when it was never set. */
function normalizeReputation(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return null;
    return Math.max(-100, Math.min(100, Math.round(number)));
}

/** Flag key on the Scene document. */
export const GEOGRAPHY_FLAG = 'geography';

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

    /** The canonical habitat keys for a scene. */
    static getHabitats(scene) {
        return normalizeHabitats(this.getRaw(scene).habitat);
    }

    /**
     * Everything Blacksmith knows about a scene as a place.
     * `reputation` is null when it was never set, which is not the same as 0 (neutral).
     */
    static getSceneContext(scene = null) {
        const stored = this.getRaw(scene);
        return {
            ...this.getGeography(scene),
            habitat: normalizeHabitats(stored.habitat),
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
     * Values are normalised on the way in, so a caller cannot store an habitat
     * outside the vocabulary or a reputation outside the scale.
     *
     * @param {Scene} scene
     * @param {Object} data - Any subset of {realm, region, site, area, habitat, reputation, locationUuid}.
     * @returns {Promise<boolean>} True when written.
     */
    static async setGeography(scene, data = {}) {
        if (!game.user?.isGM) return false;
        if (!scene?.setFlag) return false;

        const update = {};
        for (const field of GEOGRAPHY_FIELDS) {
            if (field.key in data) update[field.key] = String(data[field.key] ?? '').trim();
        }
        if ('habitat' in data) update.habitat = normalizeHabitats(data.habitat);
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

    /**
     * Normalise the geography flag on its way onto the document.
     *
     * setGeography() normalises what it writes, but the Scene Config tab does not go through it:
     * its inputs are named `flags.<module>.geography.<field>` and Foundry's own form submission
     * writes them directly. A checkbox group submits one entry PER BOX with `null` for each
     * unticked one, so a plain save stores `[null, null, "forest", null, ...]` verbatim.
     *
     * Reads are already safe -- every accessor here normalises -- so this is not about our own
     * correctness. It is about what is ON the document: a sibling reading the raw flag, a scene
     * exported to a compendium, or a person looking at the flag in a console all see the nulls.
     * The stored value should be the canonical value, whoever wrote it.
     */
    static normalizeIncomingUpdate(changed) {
        const incoming = changed?.flags?.[MODULE.ID]?.[GEOGRAPHY_FLAG];
        if (!incoming || typeof incoming !== 'object') return;

        if ('habitat' in incoming) incoming.habitat = normalizeHabitats(incoming.habitat);
        if ('reputation' in incoming) incoming.reputation = normalizeReputation(incoming.reputation);
        for (const field of GEOGRAPHY_FIELDS) {
            if (field.key in incoming) incoming[field.key] = String(incoming[field.key] ?? '').trim();
        }
    }

    // ==================================================================
    // ===== HABITAT MIGRATION ==========================================
    // ==================================================================

    /** World setting recording that the one-time habitat migration has run. */
    static MIGRATION_SETTING = 'geographyHabitatMigrated';

    /** Where habitats lived before Blacksmith owned them. */
    static LEGACY_HABITAT_MODULE = 'coffee-pub-artificer';
    static LEGACY_HABITAT_FLAG = 'scene';

    /**
     * Move habitats from the harvesting module's scene flag onto geography, once.
     *
     * Blacksmith runs this rather than the consumer, for two reasons. Habitat is a property of
     * geography and this is the release where that becomes true, so the owner should be the one
     * to take custody. And a migration implemented in each consumer is a migration that runs more
     * than once, against data the second run no longer recognises.
     *
     * Non-destructive: the legacy flag is left in place. Deleting it is not reversible, a stale
     * key costs nothing, and it is not our flag to remove.
     *
     * @returns {Promise<{migrated: number, skipped: number}>}
     */
    static async migrateLegacyHabitats() {
        if (!game.user?.isGM) return { migrated: 0, skipped: 0 };

        let migrated = 0;
        let skipped = 0;
        for (const scene of game.scenes ?? []) {
            const legacy = scene.getFlag(this.LEGACY_HABITAT_MODULE, this.LEGACY_HABITAT_FLAG);
            const habitats = normalizeHabitats(legacy?.habitats);
            if (!habitats.length) continue;

            // Anything already carrying its own habitats has been set deliberately since the
            // move and must win: re-running must never overwrite newer data with older.
            if (this.getHabitats(scene).length) { skipped++; continue; }

            const written = await this.setGeography(scene, { habitat: habitats });
            if (written) migrated++;
        }

        postConsoleAndNotification(
            MODULE.NAME,
            `Geography: habitat migration complete (${migrated} scene(s) migrated, ${skipped} already set)`,
            '', false, false
        );
        return { migrated, skipped };
    }

    /**
     * Run the migration once per world, then record that it has.
     *
     * Awaited during `ready` BEFORE consumers are marked ready, so a module that hard-cuts to
     * `getHabitats()` cannot observe a half-migrated world. If it throws, the caller's bail-out
     * marks the API degraded, which is precisely the signal a consumer needs to refuse to start
     * rather than read absent habitats as "this scene has none".
     */
    static async runMigrationIfNeeded() {
        if (!game.user?.isGM) return false;
        if (getSettingSafely(MODULE.ID, this.MIGRATION_SETTING, false)) return false;
        await this.migrateLegacyHabitats();
        try {
            await game.settings.set(MODULE.ID, this.MIGRATION_SETTING, true);
        } catch (error) {
            // Not fatal: a migration that runs twice is safe by construction, since a scene
            // that already has habitats is skipped. Failing to RECORD it is better than
            // failing the world's ready over a settings write.
            postConsoleAndNotification(MODULE.NAME, 'Geography: could not record habitat migration', error?.message || error, false, false);
        }
        return true;
    }

    /** Register the write-side normaliser. Called once during ready. */
    static initialize() {
        HookManager.registerHook({
            name: 'preUpdateScene',
            description: 'Blacksmith: normalise the geography flag before it is written',
            context: 'blacksmith-geography',
            priority: 3,
            callback: (scene, changed) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                GeographyManager.normalizeIncomingUpdate(changed);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
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
