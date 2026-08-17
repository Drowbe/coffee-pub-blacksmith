// ==================================================================
// ===== WORLD CLOCK API ============================================
// ==================================================================
//
// "Tell me when the world crosses X."
//
// Core broadcasts `updateWorldTime` on every change, but it only ever says "the
// number moved" -- a consumer wanting to know that dawn broke, or that a festival
// arrived, has to diff the time itself and get the edge cases right. Those edge
// cases are the whole job: time jumps by eight hours when a party rests, it runs
// backwards when a GM corrects a mistake, and a single jump can cross the same
// daily boundary several times.
//
// Exposed as `game.modules.get('coffee-pub-blacksmith').api.worldClock`.
//
// See documentation/api/api-worldclock.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

class WorldClockAPI {

    /** @type {Map<string, object>} */
    static _schedules = new Map();

    static initialize() {
        HookManager.registerHook({
            name: 'updateWorldTime',
            description: 'WorldClockAPI: Fire schedules the world has crossed',
            context: 'worldclock-api',
            priority: 3,
            callback: (worldTime, delta) => this._onWorldTime(worldTime, delta)
        });

        postConsoleAndNotification(MODULE.NAME, "WorldClockAPI: Schedule watcher registered", "", true, false);
    }

    // ==============================================================
    // ===== PUBLIC =================================================
    // ==============================================================

    /**
     * Ask to be told when the world reaches a moment.
     *
     * Exactly one of `at` or `dailyAt` must be given.
     *
     * NOTHING FIRES RETROACTIVELY. Registering a schedule for a moment already past
     * does not fire it, and schedules are not persisted -- a consumer re-registers on
     * `ready` like any other hook. A one-shot whose moment passed while the world was
     * closed is simply missed, which is the honest behaviour for something that is a
     * notification rather than a queue.
     *
     * @param {object} options
     * @param {string} options.id            Unique. Registering the same id twice replaces the first.
     * @param {number} [options.at]          Absolute world time in seconds. Fires once.
     * @param {number} [options.dailyAt]     Hour of the in-world day. Fires every day. Fractions allowed.
     * @param {string} [options.description] For `list()` and for debugging.
     * @param {boolean} [options.gmOnly]     Only fire on a GM client. Default false.
     * @param {Function} options.callback    Receives `{ worldTime, previousWorldTime, crossings, schedule }`.
     * @returns {string|null} The id, or null if the registration was rejected.
     */
    static schedule({ id, at, dailyAt, description = '', gmOnly = false, callback } = {}) {
        if (!id || typeof id !== 'string') {
            postConsoleAndNotification(MODULE.NAME, "WorldClockAPI: schedule() needs a string id", "", false, false);
            return null;
        }
        if (typeof callback !== 'function') {
            postConsoleAndNotification(MODULE.NAME, `WorldClockAPI: schedule('${id}') needs a callback`, "", false, false);
            return null;
        }

        const hasAt = Number.isFinite(at);
        const hasDaily = Number.isFinite(dailyAt);

        // Both, or neither, is a caller bug rather than something to guess at: "every
        // day at 6, but also once at this exact second" has no sensible reading.
        if (hasAt === hasDaily) {
            postConsoleAndNotification(
                MODULE.NAME,
                `WorldClockAPI: schedule('${id}') needs exactly one of at / dailyAt`,
                "", false, false
            );
            return null;
        }

        this._schedules.set(id, {
            id, description, gmOnly, callback,
            at: hasAt ? at : null,
            dailyAt: hasDaily ? dailyAt : null,
            // A one-shot already in the past is dead on arrival rather than firing at
            // the next tick, which would make "register at ready" fire the whole of
            // history at once.
            fired: hasAt ? (at <= (game.time?.worldTime ?? 0)) : false
        });

        return id;
    }

    /** @returns {boolean} Whether anything was removed. */
    static unschedule(id) {
        return this._schedules.delete(id);
    }

    /** Every registered schedule, for debugging. */
    static list() {
        return [...this._schedules.values()].map(({ id, description, at, dailyAt, gmOnly, fired }) =>
            ({ id, description, at, dailyAt, gmOnly, fired }));
    }

    // ==============================================================
    // ===== THE WATCHER ============================================
    // ==============================================================

    /**
     * @param {number} worldTime The new time.
     * @param {number} delta     Seconds moved. Negative when a GM rewinds.
     */
    static _onWorldTime(worldTime, delta) {
        if (!this._schedules.size) return;

        const previous = worldTime - delta;

        // TIME RAN BACKWARDS. Nothing fires -- "the sun rose" is not true because a GM
        // corrected a mistake, and firing on a rewind would make every consumer handle
        // a case none of them expect. One-shots are RE-ARMED instead, so a GM who
        // rewinds past a moment gets it again when they reach it a second time.
        if (delta <= 0) {
            for (const schedule of this._schedules.values()) {
                if (schedule.at !== null && schedule.at > worldTime) schedule.fired = false;
            }
            return;
        }

        for (const schedule of [...this._schedules.values()]) {
            if (schedule.gmOnly && !game.user?.isGM) continue;

            const crossings = this._countCrossings(schedule, previous, worldTime);
            if (crossings <= 0) continue;

            if (schedule.at !== null) schedule.fired = true;

            try {
                schedule.callback({ worldTime, previousWorldTime: previous, crossings, schedule });
            } catch (error) {
                postConsoleAndNotification(
                    MODULE.NAME,
                    `WorldClockAPI: schedule '${schedule.id}' threw`,
                    error, false, false
                );
            }
        }
    }

    /**
     * How many times a schedule's moment falls in `(previous, worldTime]`.
     *
     * A DAILY SCHEDULE CAN BE CROSSED MORE THAN ONCE, and that is the reason this
     * returns a count rather than a boolean. A party resting for a week in gritty
     * realism jumps the clock seven days, crossing "every dawn" seven times. Firing
     * seven times would post seven morning briefings; firing once would lose the fact
     * that a week went by. So it fires ONCE and hands over the count, and the
     * consumer decides whether that means seven encounter rolls or one summary.
     *
     * @returns {number}
     */
    static _countCrossings(schedule, previous, worldTime) {
        if (schedule.at !== null) {
            if (schedule.fired) return 0;
            return ((previous < schedule.at) && (schedule.at <= worldTime)) ? 1 : 0;
        }

        const secondsPerDay = this._secondsPerDay();
        if (!(secondsPerDay > 0)) return 0;

        const offset = this._dailyOffset(schedule.dailyAt, secondsPerDay);
        if (offset === null) return 0;

        // Occurrences sit at k * secondsPerDay + offset for whole k. Counting the
        // whole k in the half-open interval is the same as differencing the floors,
        // and needs no loop -- which matters, because a GM can jump a year.
        return Math.floor((worldTime - offset) / secondsPerDay)
            - Math.floor((previous - offset) / secondsPerDay);
    }

    /** Seconds in an in-world day, from the calendar rather than from 86400. */
    static _secondsPerDay() {
        const days = game.time?.calendar?.days;
        if (!days) return 0;
        return days.secondsPerMinute * days.minutesPerHour * days.hoursPerDay;
    }

    /**
     * An hour of the day as an offset in seconds.
     * @returns {number|null}
     */
    static _dailyOffset(hour, secondsPerDay) {
        const days = game.time?.calendar?.days;
        if (!days) return null;

        const secondsPerHour = days.secondsPerMinute * days.minutesPerHour;
        const raw = hour * secondsPerHour;

        // Wrapped rather than rejected: an hour past the end of a short day, or a
        // negative one, still names a real moment once folded into the day.
        return ((raw % secondsPerDay) + secondsPerDay) % secondsPerDay;
    }
}

export { WorldClockAPI };
