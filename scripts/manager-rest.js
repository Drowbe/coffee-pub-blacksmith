// ==================================================================
// ===== REST ======================================================
// ==================================================================
//
// Rest and the world clock. Currently one job: a rest moves the clock by however
// long the rest took.
//
// WE DO NOT IMPLEMENT RESTING, and should not start. dnd5e already has the whole
// of it -- `actor.shortRest()`, `actor.longRest()`, group rests, recovery of hit
// points, hit dice, spell slots, item uses and exhaustion, and three duration
// variants (`CONFIG.DND5E.restTypes`: short 60/480/1 minutes and long 480/10080/60
// for normal, gritty and epic). It even advances the clock itself:
//
//     // dnd5e.mjs:34982
//     if ( config.advanceTime && (config.duration > 0) && game.user.isGM )
//         await game.time.advance(60 * config.duration);
//
// That is off by default, which is the only reason this file exists. What it adds
// is a setting so the table decides once instead of per rest, and the coalescing
// that a group rest needs -- see `_queueAdvance`.
//
// Food, water and exhaustion automation are intended to live here later. They are
// rest concerns, not clock concerns, which is why this is its own file.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

class RestManager {

    /**
     * How long to gather rest completions before advancing.
     *
     * A GROUP REST FIRES `restCompleted` ONCE PER PARTY MEMBER, each carrying the
     * same duration, and dnd5e gives no `preGroupRest` hook to intercept the group as
     * a whole. Advancing on each one would move the clock eight hours per character.
     * Collecting the burst and advancing once is what makes a five-person long rest
     * take eight hours rather than forty.
     *
     * The window is generous because the group rests its members sequentially with
     * awaits between them; too short and a slow member falls outside the burst and
     * advances the clock a second time.
     */
    static COALESCE_MS = 400;

    /** @type {{timer: any, minutes: number, systemAdvanced: boolean}|null} */
    static _pending = null;

    static initialize() {
        HookManager.registerHook({
            name: 'dnd5e.restCompleted',
            description: 'Rest: Advance the world clock by the length of the rest',
            context: 'rest-time',
            priority: 4,
            callback: (actor, result, config) => this._onRestCompleted(config)
        });

        postConsoleAndNotification(MODULE.NAME, "Rest: Time advancement registered", "", true, false);
    }

    /**
     * @param {object} config The rest configuration dnd5e used.
     */
    static _onRestCompleted(config) {
        // Time is a world setting, so only a GM may move it. dnd5e guards its own
        // advance the same way.
        if (!game.user?.isGM) return;
        if (!getSettingSafely(MODULE.ID, 'restAdvancesTime', true)) return;

        const minutes = Number(config?.duration);
        if (!Number.isFinite(minutes) || minutes <= 0) return;

        this._queueAdvance(minutes, config?.advanceTime === true);
    }

    /**
     * Fold a rest completion into the pending advance.
     *
     * `systemAdvanced` sticks once set: if ANY completion in the burst had dnd5e's own
     * `advanceTime` enabled, the system has already moved the clock and we must not
     * move it again. Taking the MAXIMUM duration rather than the sum is the same
     * decision from the other side -- five characters resting eight hours is eight
     * hours, not forty.
     */
    static _queueAdvance(minutes, systemAdvanced) {
        if (!this._pending) {
            this._pending = { timer: null, minutes: 0, systemAdvanced: false };
        }

        this._pending.minutes = Math.max(this._pending.minutes, minutes);
        this._pending.systemAdvanced = this._pending.systemAdvanced || systemAdvanced;

        clearTimeout(this._pending.timer);
        this._pending.timer = setTimeout(() => this._flush(), this.COALESCE_MS);
    }

    static async _flush() {
        const pending = this._pending;
        this._pending = null;
        if (!pending) return;

        if (pending.systemAdvanced) {
            postConsoleAndNotification(
                MODULE.NAME,
                "Rest: dnd5e advanced the clock itself, so Blacksmith did not",
                "", true, false
            );
            return;
        }

        const calendar = game.time?.calendar;
        if (!calendar?.days) return;

        // The calendar's own minute, not 60 -- the same reason the clock never
        // hardcodes 86400.
        const seconds = pending.minutes * calendar.days.secondsPerMinute;

        try {
            await game.time.advance(seconds);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Failed to advance the world clock", error, false, false);
        }
    }
}

export { RestManager };
