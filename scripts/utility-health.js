// ==================================================================
// ===== HEALTH UTILITY =============================================
// ==================================================================
// Shared HP-percent and severity classification. The combat bar and
// party bar compute this independently today; new consumers (token
// blood indicators) use this helper instead of adding another copy.
// Severity tiers match manager-combatbar.js portrait ring classes.

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
    const hp = getActorHP(actor);
    if (!hp) return null;
    return Math.max(0, Math.min(100, (hp.value / hp.max) * 100));
}

/**
 * Classify a health percent into severity tiers. The 75/50/25/0 boundaries match
 * the combat bar's portrait ring classes; 'hurt' additionally distinguishes
 * "has taken any damage at all" from truly untouched 'healthy'.
 * @param {number | null} percent
 * @returns {'healthy' | 'hurt' | 'injured' | 'bloodied' | 'critical' | 'dead' | null}
 */
export function getHealthSeverity(percent) {
    if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
    if (percent <= 0) return 'dead';
    if (percent < 25) return 'critical';
    if (percent < 50) return 'bloodied';
    if (percent < 75) return 'injured';
    if (percent < 100) return 'hurt';
    return 'healthy';
}
