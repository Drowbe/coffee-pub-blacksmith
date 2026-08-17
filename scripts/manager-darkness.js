// ==================================================================
// ===== DARKNESS DRIVER ============================================
// ==================================================================
//
// Makes a scene's darkness follow the world clock: bright at midday, dark at
// night, with a smooth twilight either side.
//
// This is the one capability core does not have. `scene.environment.darknessLevel`
// exists and the canvas reacts to it, but nothing moves it as time passes -- so a
// world without a module doing this keeps whatever value each scene last had,
// frozen, forever.
//
// SELF-CONTAINED, AND ONE-WAY. It reads settings and the world clock and writes
// scene darkness; nothing else in the module imports it, and it imports nothing
// from the menubar. It borrows `WorldClockManager.getCurrentDayFraction()` and
// `getHorizons()` rather than computing its own, because two answers to "what time
// of day is it" that can disagree is exactly the bug this is trying not to have.
// The arrow runs darkness -> clock and never back.
//
// See documentation/architecture/architecture-worldclock.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { WorldClockManager } from './manager-worldclock.js';

class DarknessManager {

    /** Scene flag marking a scene as following the clock. */
    static FLAG = 'darknessFollowsClock';

    /**
     * How much the computed darkness must differ from the stored value before it is
     * worth a database write.
     *
     * Foundry's darkness is a 0..1 alpha, so 0.01 is a hundredth of the whole range
     * and far below what anyone can see. Without this gate a GM stepping through the
     * flat middle of the afternoon would issue a scene update per click that changed
     * nothing.
     */
    static EPSILON = 0.01;

    /**
     * How long the canvas takes to reach a new darkness, in milliseconds.
     *
     * Core's own default is 10000, which is right for the scene-controls buttons that
     * mean "it is day now" but far too slow for a clock step -- the GM would click
     * again long before the first transition finished. Consecutive updates terminate
     * the previous animation rather than queueing, so a rapid series of steps chases
     * the newest value instead of playing them all back.
     */
    static ANIMATE_MS = 2000;

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    static initialize() {
        HookManager.registerHook({
            name: 'updateWorldTime',
            description: 'Darkness: Move the active scene to match the world clock',
            context: 'worldclock-darkness',
            priority: 4,
            callback: () => this.applyToActiveScene()
        });

        // Darkness lives on the scene, so a world-level driver has to reassert itself
        // whenever the viewed scene changes. Only the active scene is ever driven --
        // updating every scene in the world on every time change would be a write per
        // scene for scenes nobody is looking at.
        HookManager.registerHook({
            name: 'canvasReady',
            description: 'Darkness: Re-apply the clock darkness after a scene change',
            context: 'worldclock-darkness',
            priority: 4,
            callback: () => this.applyToActiveScene()
        });

        WorldClockManager.registerContextMenuProvider(() => this.getContextMenuItems());

        postConsoleAndNotification(MODULE.NAME, "Darkness: Driver registered", "", true, false);
    }

    // ==============================================================
    // ===== THE CURVE ==============================================
    // ==============================================================

    /**
     * How dark the world is at a given point in the day.
     *
     * Flat through the day, flat through the night, and a smoothed ramp across each
     * twilight. A straight line from sunrise to sunset was the obvious first shape
     * and is wrong: it would make two in the afternoon perceptibly dimmer than noon,
     * which reads as a fault rather than as time passing. Real light does almost
     * nothing for hours and then changes fast twice a day.
     *
     * The ramp is CENTRED on the horizon rather than starting at it, so with a
     * one-hour twilight and a 06:00 sunrise the change runs 05:30 to 06:30 and is
     * half done at 06:00 -- the same moment the sun sits on the horizon in the
     * menubar panel. A ramp starting at sunrise would leave the world pitch black at
     * the moment the panel shows dawn.
     *
     * @param {number} dayFraction 0..1
     * @returns {number} Darkness, 0..1.
     */
    static computeDarkness(dayFraction) {
        const day = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessDay', 0)));
        const night = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessNight', 0.85)));

        const { sunrise, sunset } = WorldClockManager.getHorizons();
        const half = this._halfTwilight();

        // Zero-length twilight is a legitimate setting -- night falls like a switch --
        // and it also removes the ramp's only division, so handle it before dividing.
        if (half <= 0) {
            const isDay = (dayFraction >= sunrise) && (dayFraction < sunset);
            return isDay ? day : night;
        }

        const toSunrise = this._circularDelta(dayFraction, sunrise);
        if (Math.abs(toSunrise) <= half) {
            return this._lerp(night, day, this._smoothstep((toSunrise + half) / (half * 2)));
        }

        const toSunset = this._circularDelta(dayFraction, sunset);
        if (Math.abs(toSunset) <= half) {
            return this._lerp(day, night, this._smoothstep((toSunset + half) / (half * 2)));
        }

        return ((dayFraction >= sunrise) && (dayFraction < sunset)) ? day : night;
    }

    /** Half the twilight, as a fraction of the day. */
    static _halfTwilight() {
        const minutes = Number(getSettingSafely(MODULE.ID, 'worldClockTwilightMinutes', 60));
        if (!Number.isFinite(minutes) || minutes <= 0) return 0;

        const days = game.time?.calendar?.days;
        if (!days) return 0;

        // The calendar's own minutes-per-day, not 1440 -- the same reason the clock
        // never hardcodes 86400.
        const minutesPerDay = days.minutesPerHour * days.hoursPerDay;
        if (!(minutesPerDay > 0)) return 0;

        // Capped at a quarter day each side, so that a twilight longer than the day
        // cannot make the two ramps overlap and fight over the same moment.
        return Math.min((minutes / minutesPerDay) / 2, 0.25);
    }

    /**
     * Shortest signed distance from `b` to `a` around a day that wraps at midnight.
     *
     * Needed because a twilight can straddle midnight: with a 00:20 sunrise and a
     * one-hour twilight, 23:55 is five minutes BEFORE dawn, not twenty-three hours
     * after it. A plain subtraction gets that exactly backwards.
     *
     * @returns {number} -0.5..0.5
     */
    static _circularDelta(a, b) {
        let delta = a - b;
        if (delta > 0.5) delta -= 1;
        if (delta < -0.5) delta += 1;
        return delta;
    }

    /** Ease in and out, so the ramp has no corners at either end. */
    static _smoothstep(t) {
        const x = this._clamp01(t);
        return x * x * (3 - (2 * x));
    }

    static _lerp(from, to, t) {
        return from + ((to - from) * t);
    }

    static _clamp01(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.min(Math.max(value, 0), 1);
    }

    // ==============================================================
    // ===== PER-SCENE OPT-IN =======================================
    // ==============================================================

    /**
     * Whether a scene follows the clock.
     *
     * Opt-IN, not opt-out. Enabling this on every scene by default would black out
     * every dungeon, cellar and windowless tavern in the world the first time the
     * clock ticked past sunset, which is both wrong and alarming.
     */
    static isEnabledForScene(scene) {
        return !!scene?.getFlag?.(MODULE.ID, this.FLAG);
    }

    static async setEnabledForScene(scene, enabled) {
        if (!scene || !game.user?.isGM) return;

        try {
            await scene.setFlag(MODULE.ID, this.FLAG, !!enabled);
            if (enabled) await this.applyToActiveScene({ force: true });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to change scene darkness control", error, false, false);
        }
    }

    // ==============================================================
    // ===== APPLYING ===============================================
    // ==============================================================

    /**
     * Move the active scene's darkness to match the clock.
     *
     * GM only. Updating a scene needs ownership, so the driver runs on one client and
     * every other client receives the change through the ordinary document broadcast
     * -- no sockets, and no second code path. Players must tolerate RECEIVING this
     * without trying to produce it, which the guard below is what guarantees.
     *
     * @param {object} [options]
     * @param {boolean} [options.force] Write even if the change is below the epsilon.
     */
    static async applyToActiveScene({ force = false } = {}) {
        if (!game.user?.isGM) return;

        const scene = game.scenes?.active ?? canvas?.scene;
        if (!scene || !this.isEnabledForScene(scene)) return;

        // Core DELETES darknessLevel from any update to a locked scene
        // (client/documents/scene.mjs:417), so a write here would be silently thrown
        // away. Checking first turns that into "we deliberately did nothing", and
        // makes the lock a working override rather than a mystery. This is also why
        // the driver never SETS the lock: it would lock itself out.
        if (scene.environment?.darknessLock) return;

        const dayFraction = WorldClockManager.getCurrentDayFraction();
        if (dayFraction === null) return;

        const target = this._clamp01(this.computeDarkness(dayFraction));
        const current = Number(scene.environment?.darknessLevel ?? 0);

        // The curve is flat across most of the day and most of the night, so the great
        // majority of clock steps compute no change at all and stop here. That is what
        // keeps a GM stepping through an afternoon from issuing a write per click.
        if (!force && Math.abs(target - current) < this.EPSILON) return;

        try {
            // The animation is core's, driven by an update OPTION rather than by us --
            // it plays on every client (client/documents/scene.mjs:606) with no socket
            // and no code of ours. Omitting it would make darkness snap.
            await scene.update(
                { environment: { darknessLevel: target } },
                { animateDarkness: this.ANIMATE_MS }
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to update scene darkness", error, false, false);
        }
    }

    // ==============================================================
    // ===== THE CONTROL ============================================
    // ==============================================================

    /**
     * The clock's right-click entry, offered through the seam the clock exposes so
     * that this file and the menubar never have to know about each other.
     *
     * GM only, because the whole control is a scene write. The entry reports the
     * current state as well as toggling it -- it is the only place that says a scene
     * is being driven, which is what a GM watching the Darkness slider move on its
     * own needs in order to understand why.
     */
    static getContextMenuItems() {
        if (!game.user?.isGM) return [];

        const scene = game.scenes?.active ?? canvas?.scene;
        if (!scene) return [];

        const enabled = this.isEnabledForScene(scene);
        const locked = !!scene.environment?.darknessLock;

        const items = [{
            name: enabled ? `Darkness follows the clock on ${scene.name}` : `Let the clock control darkness on ${scene.name}`,
            icon: enabled ? 'fa-solid fa-square-check' : 'fa-regular fa-square',
            // UIContextMenu invokes `callback`. `onClick` is the MENUBAR adapter's
            // shape, and passing it here produces a menu whose entries silently do
            // nothing -- a mistake already made once in this repo.
            callback: () => this.setEnabledForScene(scene, !enabled)
        }];

        if (enabled && locked) {
            items.push({
                name: 'Darkness Level Lock is on, so the clock cannot change this scene',
                icon: 'fa-solid fa-lock',
                disabled: true,
                callback: () => {}
            });
        }

        return items;
    }
}

export { DarknessManager };
