/**
 * Shared Handlebars helpers, registered once and unconditionally.
 *
 * THIS IS A CROSS-MODULE CONTRACT, not an internal convenience. Sibling modules
 * render their own templates against these helpers -- Squire alone uses
 * `multiply`, `divide`, `add`, `eq`, `gt`, `or`, and `and` across two dozen
 * templates, and Bibliosoph, Curator, Monarch, and Regent use `eq` and `or`.
 * Removing or renaming one silently breaks another module's UI, with no error
 * that names Blacksmith. Treat this list as published surface.
 *
 * WHY THIS FILE EXISTS. These were registered from two feature managers, and
 * one of them was behind a feature gate: `CombatStats.registerHelpers()` ran
 * after the `trackCombatStats` early return in `initialize()`. So turning combat
 * statistics off unregistered `multiply`, `divide`, `add`, `round`,
 * `formatDamage`, and `formatTime` for the entire installation -- taking out
 * Squire's character summary, party panel, health window, and quest handle, and
 * Blacksmith's own combat timer template, none of which have anything to do with
 * combat statistics. A global registration must never sit behind a feature
 * switch, and the way to guarantee that is to keep it out of features entirely.
 *
 * Registration happens in `init`, before anything renders.
 *
 * Feature-local helpers deliberately stay with their features: VoteManager's
 * `getVoterList` / `getVoteDetails` / `isCurrentUserGM` and XpManager's
 * `prettifyResolution` / `formatMultiplier` are each used by one template owned
 * by the same subsystem, and both register unconditionally already. The test for
 * belonging here is "another template could reasonably want this", not "it is a
 * Handlebars helper".
 */

import { CombatStats } from './stats-combat.js';

/**
 * Register every shared helper. Idempotent -- Handlebars replaces by name, so a
 * second call is harmless.
 */
export function registerHandlebarsHelpers() {
    // ----- Logic -----------------------------------------------------------
    Handlebars.registerHelper('or', function () {
        // Last argument is the Handlebars options object.
        return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    });
    Handlebars.registerHelper('and', function (a, b) {
        return a && b;
    });
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
    Handlebars.registerHelper('gt', function (a, b) {
        return a > b;
    });
    /** Membership test for arrays; false for anything that is not one. */
    Handlebars.registerHelper('includes', function (list, value) {
        return Array.isArray(list) && list.includes(value);
    });

    // ----- Arithmetic ------------------------------------------------------
    Handlebars.registerHelper('add', function (a, b) {
        return a + b;
    });
    Handlebars.registerHelper('subtract', function (a, b) {
        return a - b;
    });
    Handlebars.registerHelper('multiply', function (a, b) {
        return a * b;
    });
    Handlebars.registerHelper('divide', function (a, b) {
        return a / b;
    });
    Handlebars.registerHelper('round', function (number) {
        return Math.round(number);
    });

    // ----- Formatting ------------------------------------------------------
    // `isHealing` is never read. Kept because the original had it and this is a
    // move, not a redesign -- dropping it would be a behaviour-identical change
    // that a reviewer still has to stop and verify.
    Handlebars.registerHelper('formatDamage', function (amount, isHealing = false) {
        if (typeof amount !== 'number') return '0';
        return `${amount}`;
    });

    // Registered as a direct reference, NOT wrapped. CombatStats.formatTime is
    // context-sensitive: it reads `this.planningDuration` and `this.turnDuration`
    // to decide between a duration, "SKIPPED", and "EXPIRED", and Handlebars
    // binds `this` to the template's data context. Wrapping it in
    // `function (ms) { return CombatStats.formatTime(ms); }` would lose that
    // binding and silently turn every skipped or expired timer into a number.
    Handlebars.registerHelper('formatTime', CombatStats.formatTime);

    // Matches a path-like prefix OR an image extension, so a bare
    // "modules/foo/bar" counts as an image reference without one.
    Handlebars.registerHelper('isImageUrl', function (str) {
        if (!str || typeof str !== 'string') return false;
        const urlPattern = /^(https?:\/\/|\/|\.\/|modules\/|data\/|assets\/)/i;
        const imageExtPattern = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?.*)?$/i;
        return urlPattern.test(str) || imageExtPattern.test(str);
    });
}
