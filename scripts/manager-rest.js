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
     * A PARTY REST HAPPENS IN ONE OF TWO SHAPES, and they need different handling.
     * Getting this wrong is what made a five-character rest advance the clock forty
     * hours in testing.
     *
     * 1. REQUESTED (`autoRest` false, the default, and what the party sheet's rest
     *    button does). dnd5e posts a request card and rests nobody
     *    (`dnd5e.mjs:69799-69820`). Each character then rests individually as their
     *    player accepts -- minutes apart, each with its own dialog, and each carrying
     *    the same `config.request.id`. No timer can group these, because the gaps
     *    between them are however long a person takes to click.
     *
     * 2. AUTOMATIC (`autoRest` true). dnd5e rests every member in a tight loop
     *    (`dnd5e.mjs:69824`), each forced to `advanceTime: false`, then advances the
     *    clock once itself. These arrive as a burst with no request id.
     *
     * So: the request id is the primary key, and the timer is the fallback for the
     * burst. Both are needed; neither alone is enough.
     */

    /** Fallback window for completions arriving without a request id. */
    static COALESCE_MS = 400;

    /**
     * Request ids already accounted for, newest last. Bounded, because it would
     * otherwise grow for the life of the world.
     */
    static _handledRequests = [];
    static MAX_REMEMBERED_REQUESTS = 50;

    /**
     * Who has accepted each request so far: request id -> Set of actor uuids.
     *
     * THE CLOCK MOVES WHEN THE LAST CHARACTER RESTS, not the first. The party is not
     * eight hours later until everyone has actually slept, and the earlier reading --
     * advance on the first acceptance -- put the party at dawn while half of them had
     * not begun.
     *
     * The objection to waiting is that one player who never clicks freezes the clock.
     * In practice that is not a dead end: the request card lets the GM resolve any
     * outstanding character themselves, so the stall always has a hand on it. A
     * request that is genuinely abandoned simply never advances, which is the honest
     * outcome for a rest that never happened.
     *
     * Tracked here rather than read from dnd5e's own per-target results because
     * `dnd5e.restCompleted` fires INSIDE the rest, before the result message exists --
     * so the character who just rested is not yet marked complete on the request.
     */
    static _requestProgress = new Map();
    static MAX_TRACKED_REQUESTS = 20;

    /** @type {{timer: any, minutes: number, systemAdvanced: boolean}|null} */
    static _pending = null;

    static initialize() {
        HookManager.registerHook({
            name: 'dnd5e.restCompleted',
            description: 'Rest: Advance the world clock by the length of the rest',
            context: 'rest-time',
            priority: 4,
            callback: (actor, result, config) => this._onRestCompleted(config, actor)
        });

        postConsoleAndNotification(MODULE.NAME, "Rest: Time advancement registered", "", true, false);
    }

    /**
     * @param {object} config  The rest configuration dnd5e used.
     * @param {Actor} [actor]  The actor that rested.
     */
    static _onRestCompleted(config, actor) {
        // Time is a world setting, so only a GM may move it. dnd5e guards its own
        // advance the same way.
        if (!game.user?.isGM) return;
        if (!getSettingSafely(MODULE.ID, 'restAdvancesTime', true)) return;

        const minutes = Number(config?.duration);
        if (!Number.isFinite(minutes) || minutes <= 0) return;

        const request = config?.request ?? null;
        const requestId = request?.id ?? null;

        // A REQUESTED REST: every character's acceptance carries the same id, so the
        // id identifies the rest rather than the moment it arrived. That matters
        // because acceptances are minutes apart -- one dialog per player -- and no
        // timer can group them.
        if (requestId) {
            if (this._handledRequests.includes(requestId)) return;
            if (!this._isLastToRest(request, requestId, actor)) return;

            this._markRequestHandled(requestId);
            this._advance(minutes, config?.advanceTime === true);
            return;
        }

        // No request: either a lone character resting, or the automatic group loop.
        // Both are bursts, so the timer is the right tool.
        this._queueAdvance(minutes, config?.advanceTime === true);
    }

    /**
     * Has everyone the request asked for now rested?
     *
     * The roster lives on the request message as `system.targets`, one entry per
     * character (`dnd5e.mjs:70835`). Counting acceptances against it is what makes the
     * clock wait for the last sleeper rather than the first.
     *
     * A request naming one character, or one whose roster cannot be read, advances
     * immediately -- guessing wrong in that direction costs a slightly early clock,
     * while guessing wrong the other way means a rest that never advances at all.
     *
     * @returns {boolean}
     */
    static _isLastToRest(request, requestId, actor) {
        const targets = request?.system?.targets;
        const expected = Array.isArray(targets) ? targets.length : 0;
        if (expected <= 1) return true;

        const seen = this._requestProgress.get(requestId) ?? new Set();
        if (actor?.uuid) seen.add(actor.uuid);

        // Re-set so a first sighting is stored, and so this request becomes the
        // most recently touched for the eviction below.
        this._requestProgress.delete(requestId);
        this._requestProgress.set(requestId, seen);

        // Maps keep insertion order, so the first key is the least recently touched.
        // Abandoned requests are the only thing that accumulates here, and they are
        // worth exactly nothing once a newer one is in flight.
        while (this._requestProgress.size > this.MAX_TRACKED_REQUESTS) {
            this._requestProgress.delete(this._requestProgress.keys().next().value);
        }

        if (seen.size < expected) return false;

        this._requestProgress.delete(requestId);
        return true;
    }

    /** Remember a request so a late acceptance cannot advance the clock again. */
    static _markRequestHandled(requestId) {
        this._handledRequests.push(requestId);
        if (this._handledRequests.length > this.MAX_REMEMBERED_REQUESTS) this._handledRequests.shift();
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

        await this._advance(pending.minutes, pending.systemAdvanced);
    }

    /**
     * Move the clock by a rest's length.
     * @param {number} minutes
     * @param {boolean} systemAdvanced Whether dnd5e already did it.
     */
    static async _advance(minutes, systemAdvanced) {
        if (systemAdvanced) {
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
        const seconds = minutes * calendar.days.secondsPerMinute;

        try {
            await game.time.advance(seconds);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Failed to advance the world clock", error, false, false);
        }
    }
}

export { RestManager };
