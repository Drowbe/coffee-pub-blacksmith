// ==================================================================
// ===== MANAGER-TIME-MODES – the clock runs at a chosen speed ======
// ==================================================================
//
// Two things live here, and the split is deliberate:
//
//   TimeDriver  – advances world time on its own, in commits, on one client.
//                 Knows nothing about modes. The interruptible rest wants this
//                 same engine running to a target rather than open-endedly
//                 (see documentation/plans/plan-interruptible-rest.md), which
//                 is why it is separable rather than folded into the policy.
//   TimeModes   – the policy: which mode is selected, what rate that implies,
//                 and the menu that switches it.
//
// See documentation/architecture/architecture-worldclock.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// ==================================================================
// ===== THE DRIVER =================================================
// ==================================================================

/**
 * Advances world time by itself, paced by real time.
 *
 * THREE THINGS MAKE THIS HARDER THAN A setInterval, and all three are the
 * reason the clock has never had one before:
 *
 * 1. THE CLOCK MUST MOVE A MINUTE AT A TIME, and writing time is expensive.
 *    Those pull against each other, and the balance is the whole design.
 *
 *    `game.time.advance` writes a world setting and wakes every connected client —
 *    `updateWorldTime` fires on all of them, and the darkness driver runs. So the
 *    driver commits ONE WORLD MINUTE per write, which is what makes the readout
 *    tick over minute by minute instead of leaping, and refuses to do it more
 *    often than `minCommitSeconds` of real time. In Real-time that is a write a
 *    minute; in Slow, one every four. Only Fast hits the floor: at sixty times
 *    speed a world minute arrives every real second, so the floor holds it to a
 *    write every few seconds carrying a few minutes each.
 *
 *    The alternative — commit on a fixed real cadence and interpolate the display
 *    between writes — was rejected. It shows minutes moving that have not passed,
 *    and anything scheduled on a minute would fire after the readout had already
 *    gone by it. A clock that is a few seconds coarse is honest; one that displays
 *    a time the world is not at is not.
 *
 * 2. ONLY ONE CLIENT MAY TICK. Only a GM can write the setting, and two GMs
 *    ticking would advance the same clock twice, running the world at double
 *    speed. Ownership is `game.users.activeGM`, which is core's own election —
 *    the same one `api-gm-request.js` uses, so every module agrees with core
 *    rather than with its own sort. Re-evaluated on `userConnected`, so a GM
 *    dropping hands the tick to the next one rather than stopping the world.
 *
 * 3. IT MUST NOT SURVIVE ITS OWN CLIENT. The interval is client state; the mode
 *    is world state. A client that reloads restarts the interval from the mode,
 *    and at most one commit of world time is lost — bounded by the cadence and
 *    silently correct, because nothing durable is holding a partial second.
 */
export class TimeDriver {
    /** @type {number|null} setInterval handle, or null when stopped. */
    static _handle = null;

    /** World seconds to add per real second. Zero means "not running". */
    static _rate = 0;

    /** Real-time milliseconds between commits, derived from the rate. */
    static _cadenceMs = 60000;

    /** World seconds written per commit. One minute, unless the floor forced a bigger step. */
    static _stepSeconds = 60;

    /**
     * How long a minute is, as the CALENDAR defines it.
     *
     * Not 60. A world clock that hardcoded 86400 for a day was the bug that put the
     * warning in `WorldClockManager.getRenderData`, and this is the same mistake one
     * unit down: a calendar is free to declare 100-second minutes and the readout
     * would tick over at the wrong moments.
     */
    static _minuteSeconds() {
        const seconds = Number(game.time?.calendar?.secondsPerMinute);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
    }

    /** Whether this client is the one that ticks. */
    static isOwner() {
        return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;
    }

    static isRunning() {
        return this._handle !== null;
    }

    /**
     * Run at `worldSecondsPerRealSecond` until stopped.
     *
     * Idempotent for the same rate and floor, so a setting change that alters
     * neither does not restart the interval and lose its place in the current one.
     *
     * @param {number} rate - World seconds per real second. Zero or less stops it.
     * @param {number} [minCommitSeconds] - Never write more often than this, in real seconds.
     */
    static start(rate, minCommitSeconds = 0.5) {
        const plan = this.plan(rate, minCommitSeconds);
        if (this.isRunning() && this._rate === rate && this._cadenceMs === plan.cadenceMs) return;

        this.stop();
        if (!(rate > 0) || !this.isOwner()) return;

        this._rate = rate;
        this._cadenceMs = plan.cadenceMs;
        this._stepSeconds = plan.stepSeconds;
        this._handle = setInterval(() => void this._commit(), plan.cadenceMs);

        postConsoleAndNotification(MODULE.NAME,
            `Time driver: ${rate}x, writing ${plan.stepSeconds}s of world time every ${plan.cadenceMs / 1000}s`,
            '', true, false);
    }

    /**
     * What a given rate implies: how often to write, and how much each write carries.
     *
     * Pure, and exported through `TimeDriver.plan` so the harness can assert the
     * arithmetic without waiting for real seconds to pass.
     *
     * @param {number} rate - World seconds per real second.
     * @param {number} minCommitSeconds - Real-time floor between writes.
     * @returns {{cadenceMs: number, stepSeconds: number}}
     */
    static plan(rate, minCommitSeconds = 0.5) {
        const floor = Math.max(0.25, Number(minCommitSeconds) || 0.5);
        const minute = this._minuteSeconds();
        if (!(rate > 0)) return { cadenceMs: 0, stepSeconds: 0 };

        // One world minute takes this long in real seconds. Below the floor, the
        // floor wins and each write carries proportionally more.
        const realSecondsPerMinute = minute / rate;
        const cadenceSeconds = Math.max(floor, realSecondsPerMinute);
        return {
            cadenceMs: Math.round(cadenceSeconds * 1000),
            stepSeconds: Math.round(cadenceSeconds * rate)
        };
    }

    static stop() {
        if (this._handle !== null) {
            clearInterval(this._handle);
            this._handle = null;
            postConsoleAndNotification(MODULE.NAME, 'Time driver: stopped', '', true, false);
        }
        this._rate = 0;
    }

    /**
     * One commit.
     *
     * Ownership is re-checked here rather than only at start: the active GM can
     * change while the interval is running, and the loser must stop writing
     * immediately rather than at the next mode change.
     *
     * The step is fixed at start rather than accumulated from elapsed time, so
     * every write is a whole number of world seconds and the readout lands on the
     * minute rather than a fraction past it.
     */
    static async _commit() {
        if (!this.isOwner()) {
            this.stop();
            return;
        }

        if (!(this._stepSeconds >= 1)) return;

        try {
            await game.time.advance(this._stepSeconds);
        } catch (error) {
            // A failed advance is not worth stopping the world for, but it IS worth
            // seeing: the usual cause is losing GM status mid-flight, which the
            // ownership check above will catch on the next commit anyway.
            postConsoleAndNotification(MODULE.NAME, 'Time driver: advance failed', error, false, false);
        }
    }
}

// ==================================================================
// ===== THE MODES ==================================================
// ==================================================================

/**
 * The five modes, in menu order.
 *
 * `rate` is world seconds per real second, or null when the mode means "the
 * driver stands down". Combat and Paused are both stood-down states and differ
 * only in what else is moving the clock — which is the whole reason they are two
 * modes rather than one.
 */
export const TIME_MODES = Object.freeze({
    combat: {
        id: 'combat',
        label: 'Combat',
        icon: 'fa-solid fa-swords',
        rate: null,
        description: 'Core advances time by the round. The driver stands down.'
    },
    real: {
        id: 'real',
        label: 'Real-time',
        icon: 'fa-solid fa-play',
        rate: 1,
        description: 'One second in the world for every second at the table.'
    },
    slow: {
        id: 'slow',
        label: 'Slow',
        icon: 'fa-solid fa-turtle',
        rate: null,          // read from the setting
        configurable: true,
        description: 'Time passes more slowly than real time.'
    },
    fast: {
        id: 'fast',
        label: 'Fast',
        icon: 'fa-solid fa-forward',
        rate: null,          // read from the setting
        configurable: true,
        description: 'Time passes more quickly than real time.'
    },
    paused: {
        id: 'paused',
        label: 'Paused',
        icon: 'fa-solid fa-pause',
        rate: null,
        description: 'Nothing moves the clock.'
    }
});

export class TimeModes {
    static SETTING = 'worldClockTimeMode';
    static DEFAULT = 'paused';

    static initialize() {
        // The mode is a WORLD setting, so it arrives on every client as an
        // updateSetting document event. Every client re-evaluates; only the owner
        // ends up running anything, because the driver checks.
        HookManager.registerSettingChangeCallback({
            description: 'Time modes: restart the driver when the mode or its speeds change',
            context: 'time-modes',
            priority: 3,
            callback: (namespace, key) => {
                if (namespace !== MODULE.ID) return;
                if (![this.SETTING, 'worldClockSlowMultiplier', 'worldClockFastMultiplier',
                    'worldClockMinUpdateSeconds'].includes(key)) return;
                this.apply();
            }
        });

        // A GM connecting or dropping changes who `activeGM` is. Without this the
        // world stops when the ticking GM leaves and never restarts.
        HookManager.registerHook({
            name: 'userConnected',
            description: 'Time modes: re-elect the ticking client when a user connects or drops',
            context: 'time-modes',
            priority: 4,
            callback: () => this.apply()
        });

        this.apply();
        postConsoleAndNotification(MODULE.NAME, `Time modes: initialized in ${this.current().label} mode`, '', true, false);
    }

    /** The selected mode's descriptor, always a real one. */
    static current() {
        const id = getSettingSafely(MODULE.ID, this.SETTING, this.DEFAULT);
        return TIME_MODES[id] ?? TIME_MODES[this.DEFAULT];
    }

    /**
     * World seconds per real second for the selected mode, or 0 when the driver
     * stands down.
     *
     * The multipliers are read at apply time rather than baked into TIME_MODES,
     * so changing one in settings takes effect on the next apply without a reload.
     */
    static rateFor(mode) {
        switch (mode.id) {
            case 'real': return 1;
            case 'slow': return Math.max(0, Number(getSettingSafely(MODULE.ID, 'worldClockSlowMultiplier', 0.25)) || 0);
            case 'fast': return Math.max(0, Number(getSettingSafely(MODULE.ID, 'worldClockFastMultiplier', 60)) || 0);
            default: return 0;   // combat and paused
        }
    }

    /** Bring the driver into line with the selected mode. Safe to call repeatedly. */
    static apply() {
        const mode = this.current();
        const rate = this.rateFor(mode);
        const floor = Number(getSettingSafely(MODULE.ID, 'worldClockMinUpdateSeconds', 0.5)) || 0.5;

        if (rate > 0) TimeDriver.start(rate, floor);
        else TimeDriver.stop();

        this._repaint();
    }

    /**
     * Switch mode. GM only, because the setting is world scope and a player
     * writing it would throw rather than quietly fail.
     */
    static async set(modeId) {
        if (!game.user?.isGM) return false;
        if (!TIME_MODES[modeId]) return false;
        await game.settings.set(MODULE.ID, this.SETTING, modeId);
        return true;
    }

    /**
     * Pause, or come back from it.
     *
     * The mode to return to is REMEMBERED rather than assumed, because the useful
     * pause is "stop for a minute while people arrive" and the useful un-pause is
     * "carry on exactly as before". Guessing Real-time would silently change the
     * speed a table had chosen.
     *
     * Stored in a world setting rather than a static so a reload does not lose it,
     * and un-pausing after one lands where the GM left rather than at a default.
     */
    static async togglePause() {
        if (!game.user?.isGM) return false;

        const current = this.current().id;
        if (current === TIME_MODES.paused.id) {
            const previous = getSettingSafely(MODULE.ID, 'worldClockPreviousTimeMode', TIME_MODES.real.id);
            return this.set(TIME_MODES[previous] ? previous : TIME_MODES.real.id);
        }

        await game.settings.set(MODULE.ID, 'worldClockPreviousTimeMode', current);
        return this.set(TIME_MODES.paused.id);
    }

    /** Whether the clock is currently paused, for a label that has to say which way the toggle goes. */
    static isPaused() {
        return this.current().id === TIME_MODES.paused.id;
    }

    /**
     * Menu entries for the clock's context menu.
     *
     * The current mode is named rather than styled: the context menu has no
     * checked state, and inventing one for a single consumer would be a wider
     * change than this needs.
     */
    static menuItems() {
        const currentId = this.current().id;
        return Object.values(TIME_MODES).map((mode) => {
            const label = mode.configurable ? `${mode.label} (${this.speedLabel(mode)})` : mode.label;
            return {
                name: mode.id === currentId ? `${label} — current` : label,
                icon: mode.icon,
                callback: () => void this.set(mode.id)
            };
        });
    }

    /**
     * The configured speed, as a multiplier of real time.
     *
     * Shown on the menu entry rather than a purpose ("for travel"): the purpose is
     * whatever the table is doing, and the number is the thing the GM set and is
     * the thing they need to check before switching.
     */
    static speedLabel(mode) {
        const rate = this.rateFor(mode);
        if (!(rate > 0)) return 'stopped';
        // Trim a trailing .0 so 60 reads as 60x rather than 60.0x, but keep 0.25.
        const text = Number.isInteger(rate) ? String(rate) : String(Number(rate.toFixed(2)));
        return `${text}x`;
    }

    /** @type {Array<() => void>} Called after every apply, so a display can follow the mode. */
    static _subscribers = [];

    /**
     * Be told when the mode changes.
     *
     * A callback list rather than an import of the clock: the clock imports THIS
     * module for its menu and its indicator, so importing it back would make the
     * pair circular. The dependency runs one way and the notification runs the
     * other, which is the same shape as the option providers the clock already has.
     */
    static onChange(callback) {
        if (typeof callback === 'function') this._subscribers.push(callback);
    }

    static _repaint() {
        for (const callback of this._subscribers) {
            try { callback(); } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Time modes: a change subscriber threw', error, false, false);
            }
        }
    }
}
