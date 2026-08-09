// ==================================================================
// ===== HEALTH UTILITY =============================================
// ==================================================================
// Shared HP-percent and severity classification -- the single definition
// of what "bloodied" means, used by the combat bar portrait rings, the
// token blood indicators, and the Health window, and readable by
// consuming modules so they do not grow a copy of their own.
//
// Severity boundaries are the healthThreshold* settings rather than
// constants, so the colours a GM configures apply everywhere at once.

import { MODULE } from './const.js';

/**
 * Resolve current/max HP for an actor across the system shapes Blacksmith supports.
 * @param {Actor} actor
 * @returns {{ value: number, max: number } | null} null when the actor has no readable HP
 */
export function getActorHP(actor) {
    const hp = actor?.system?.attributes?.hp ?? actor?.system?.vitals?.hp ?? actor?.system?.hp;
    if (!hp || typeof hp !== 'object') return null;
    const value = Number(hp.value);
    const max = Number(hp.max);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
    return { value, max };
}

/**
 * Percent HP remaining, clamped 0-100.
 * @param {Actor} actor
 * @returns {number | null} null when the actor has no readable HP
 */
export function getHealthPercent(actor) {
    return getHealthPercentForHP(getActorHP(actor));
}

/**
 * Percent HP remaining for a raw {value, max} pair, clamped 0-100.
 *
 * The primitive the other three read from. It exists as public surface because a
 * Handlebars helper receives the HP object and not the Actor that owns it, so the
 * actor-shaped entry point cannot reach that case -- and the arithmetic is exactly
 * trivial enough that every module rewrites it slightly differently and nobody
 * checks. Consumers have been found guarding `max > 0` in one place, clamping in
 * another, and rendering `NaN%` in two more.
 *
 * Returns null rather than 0 when the pair is unusable. An actor with a max and no
 * readable value is missing data, not a corpse, and 0 would classify it as dead.
 *
 * @param {{ value: number|string, max: number|string } | null} hp
 * @returns {number | null} null when there is no usable max or value
 */
export function getHealthPercentForHP(hp) {
    const value = Number(hp?.value);
    const max = Number(hp?.max);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
    return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * The percentages that divide the severity tiers, as configured.
 *
 * Read straight from settings with no caching and no instance to construct: the
 * tray handle in a consuming module rebuilds on every render and cannot be made
 * to depend on a window being open. Falls back to the values these tiers were
 * hardcoded to before they became configurable, so a call made before settings
 * registration still classifies correctly rather than throwing.
 *
 * @returns {{injured: number, bloodied: number, critical: number}}
 */
export function getHealthThresholds() {
    const read = (key, fallback) => {
        try {
            const value = Number(game.settings.get(MODULE.ID, key));
            return Number.isFinite(value) ? value : fallback;
        } catch (_) {
            return fallback;
        }
    };
    return {
        injured: read('healthThresholdInjured', 75),
        bloodied: read('healthThresholdBloodied', 50),
        critical: read('healthThresholdCritical', 25)
    };
}

/**
 * Classify a health percent into severity tiers.
 *
 * The one definition of what "bloodied" means, shared by the combat bar portrait
 * rings, the token blood indicators, and the Health window, and readable by
 * consuming modules so they do not grow a fourth. Boundaries are inclusive --
 * a creature at exactly the bloodied threshold is bloodied -- which matches how
 * the settings describe themselves.
 *
 * 'hurt' has no threshold of its own: it is "has taken damage but is still above
 * the injured line", which distinguishes a scratch from an untouched creature.
 *
 * @param {number | null} percent
 * @returns {'healthy' | 'hurt' | 'injured' | 'bloodied' | 'critical' | 'dead' | null}
 */
export function getHealthSeverity(percent) {
    if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
    if (percent <= 0) return 'dead';
    const { injured, bloodied, critical } = getHealthThresholds();
    if (percent <= critical) return 'critical';
    if (percent <= bloodied) return 'bloodied';
    if (percent <= injured) return 'injured';
    if (percent < 100) return 'hurt';
    return 'healthy';
}

/**
 * Severity for a raw {value, max} pair, for callers holding HP rather than an Actor.
 * @param {{value: number|string, max: number|string}} hp
 * @returns {'healthy' | 'hurt' | 'injured' | 'bloodied' | 'critical' | 'dead' | null}
 */
export function getHealthSeverityForHP(hp) {
    return getHealthSeverity(getHealthPercentForHP(hp));
}
