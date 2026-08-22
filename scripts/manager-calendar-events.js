// ==================================================================
// ===== CALENDAR EVENTS ============================================
// ==================================================================
//
// Dated things that belong to the WORLD rather than to a person: a
// festival, a market day, a deadline the whole table shares. They exist
// whether or not anyone wrote a note about them, which is exactly what
// separates them from a time-bound note.
//
// THE SPLIT, because it decides where anything new goes:
//
//   Calendar event | the world's | usually recurring | GM-authored | here
//   Time-bound note| one person's| always one-shot   | written in play | on the note
//
// Storing a festival on somebody's note would be backwards: delete the
// note and the festival stops existing.
//
// Store is a world setting rather than journal entries. An event is a
// date and a name; if it wants prose it wanted a note. Journals would
// bring permissions for free but drag in the document-subtype question,
// and owning a subtype means owning a domain.
//
// See documentation/architecture/architecture-worldclock.md.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { WorldClockAPI } from './api-worldclock.js';
import { GMRequestAPI } from './api-gm-request.js';

export const CALENDAR_EVENTS_SETTING = 'calendarEvents';

/**
 * Ops players use to reach the store.
 *
 * Events are a WORLD setting, so a player cannot write one directly. Rather than
 * making the calendar GM-only, the write is proxied: `api.gmRequest` hands the
 * handler the VERIFIED caller, so "who added this" is a fact from the server
 * rather than a claim in the payload.
 */
const OP_CREATE = `${MODULE.ID}.calendarEventCreate`;
const OP_UPDATE = `${MODULE.ID}.calendarEventUpdate`;
const OP_DELETE = `${MODULE.ID}.calendarEventDelete`;

/** How an event repeats. `once` carries a year; the others do not. */
export const EVENT_RECURRENCE = Object.freeze({
    ONCE: 'once',
    ANNUAL: 'annual',
    MONTHLY: 'monthly'
});

/** Prefix for the schedule ids this manager owns, so its own can be told apart. */
const SCHEDULE_PREFIX = 'blacksmith.calendar-event.';

/** How many months ahead `nextOccurrence` will look before giving up. */
const SEARCH_LIMIT_MONTHS = 400;

export class CalendarEvents {

    // ==============================================================
    // ===== STORE ==================================================
    // ==============================================================

    /** Every stored event. Always an array, even when the setting is malformed. */
    static list() {
        const raw = getSettingSafely(MODULE.ID, CALENDAR_EVENTS_SETTING, []);
        return Array.isArray(raw) ? raw.filter(event => event && typeof event === 'object') : [];
    }

    static get(id) {
        return this.list().find(event => event.id === id) ?? null;
    }

    /**
     * Write the whole list. GM only -- this is a world setting.
     * @param {object[]} events
     */
    static async _write(events) {
        if (!game.user?.isGM) return false;
        await game.settings.set(MODULE.ID, CALENDAR_EVENTS_SETTING, events);
        return true;
    }

    /**
     * Add an event.
     *
     * `month` and `day` are ZERO-BASED indices, matching `timeToComponents` and every
     * other date in this module. Displaying them adds one; storing them does not, and
     * mixing the two is the bug this comment exists to prevent.
     *
     * @param {object} data
     * @param {string} data.name
     * @param {number} data.month - Zero-based month index.
     * @param {number} data.day - Zero-based day of month.
     * @param {number} [data.year] - Required for `once`, ignored otherwise.
     * @param {string} [data.recurrence] - One of EVENT_RECURRENCE.
     * @returns {Promise<object|null>} The stored event, or null if it was refused.
     */
    static async create({ name, month, day, year = null, hour = 0, minute = 0, recurrence = EVENT_RECURRENCE.ONCE, description = '', author = null } = {}) {
        // A player cannot write a world setting, so the whole call goes to the GM and
        // comes back with the stored event. Validation still runs GM-side, because a
        // payload from a player is untrusted by definition.
        if (!game.user?.isGM) {
            return GMRequestAPI.request(OP_CREATE, { name, month, day, year, hour, minute, recurrence, description });
        }

        const label = String(name ?? '').trim();
        if (!label) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar events: an event needs a name', '', false, true);
            return null;
        }
        if (!Number.isInteger(month) || !Number.isInteger(day)) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar events: month and day must be integers', { month, day }, false, false);
            return null;
        }
        if (!Object.values(EVENT_RECURRENCE).includes(recurrence)) recurrence = EVENT_RECURRENCE.ONCE;

        const event = {
            id: foundry.utils.randomID(16),
            // Set GM-side from the VERIFIED caller when a player asked; otherwise it is
            // the GM's own id. Never read from a player-supplied payload field.
            author: author ?? game.user?.id ?? null,
            name: label,
            description: String(description ?? ''),
            recurrence,
            // A one-shot without a year is not a date. Falling back to the current year
            // is the only reading that is not a guess.
            year: recurrence === EVENT_RECURRENCE.ONCE ? (Number.isInteger(year) ? year : this._nowComponents()?.year ?? 0) : null,
            month,
            day,
            hour: Number.isInteger(hour) ? hour : 0,
            minute: Number.isInteger(minute) ? minute : 0
        };

        const events = this.list();
        events.push(event);
        await this._write(events);
        return event;
    }

    static async update(id, changes = {}, actor = null) {
        if (!game.user?.isGM) return GMRequestAPI.request(OP_UPDATE, { id, changes });

        const events = this.list();
        const index = events.findIndex(event => event.id === id);
        if (index < 0) return false;

        // `actor` is the verified caller when this arrived from a player, and null
        // when a GM called it directly -- in which case the current user IS the GM.
        if (!this.canEdit(events[index], actor ?? game.user)) return false;

        // `author` and `id` are not the caller's to change: allowing either would make
        // the ownership check above meaningless.
        const safe = foundry.utils.deepClone(changes ?? {});
        delete safe.author;
        delete safe.id;

        events[index] = foundry.utils.mergeObject(events[index], safe, { inplace: false });
        return this._write(events);
    }

    static async delete(id, actor = null) {
        if (!game.user?.isGM) return GMRequestAPI.request(OP_DELETE, { id });

        const event = this.get(id);
        if (!event) return false;
        if (!this.canEdit(event, actor ?? game.user)) return false;

        return this._write(this.list().filter(candidate => candidate.id !== id));
    }

    /**
     * Whether a user may change an event.
     *
     * A GM may change anything; anyone else may change only what they authored.
     * Enforced GM-SIDE in the proxied handlers, not just in the UI -- a check that
     * only hides a button is a suggestion, and the op is reachable from a console.
     *
     * An event with no `author` predates this and belongs to nobody, so only a GM
     * can touch it. That is the safe reading: the alternative lets the first player
     * to notice claim the GM's festivals.
     *
     * @param {object|null} event
     * @param {User|null} [user] - Defaults to the current user.
     */
    static canEdit(event, user = game.user) {
        if (!event || !user) return false;
        if (user.isGM) return true;
        return !!event.author && event.author === user.id;
    }

    // ==============================================================
    // ===== DATES ==================================================
    // ==============================================================

    static _calendar() {
        return game.time?.calendar ?? null;
    }

    static _nowComponents() {
        const calendar = this._calendar();
        if (!calendar?.months?.values?.length) return null;
        try { return calendar.timeToComponents(game.time.worldTime); } catch { return null; }
    }

    /** Days in a month, honouring leap years. */
    static daysInMonth(calendar, year, monthIndex) {
        const month = calendar?.months?.values?.[monthIndex];
        if (!month) return 0;
        const isLeap = typeof calendar.isLeapYear === 'function' ? calendar.isLeapYear(year) : false;
        return isLeap ? (month.leapDays ?? month.days) : month.days;
    }

    /**
     * When this event next happens at or after `fromTime`, or null.
     *
     * WHY THIS EXISTS RATHER THAN A RECURRENCE RULE ON THE SCHEDULE API: that API
     * takes `at` (an absolute moment) or `dailyAt` (an hour of the day), and neither
     * can express "the 20th of Marpenoth, every year". Extending it for one consumer
     * would widen a public surface to say something this can compute. So an event
     * registers its NEXT occurrence as an `at`, and re-arms when that fires.
     *
     * A recurring day that does not exist in a given month is SKIPPED, not clamped.
     * The 31st monthly in a 30-day month is not the 30th -- clamping would silently
     * move a market day, and skipping is the honest reading of a date that is not
     * there.
     */
    static nextOccurrence(event, fromTime = game.time?.worldTime ?? 0) {
        const calendar = this._calendar();
        if (!calendar || !event) return null;

        const monthCount = calendar.months?.values?.length ?? 0;
        if (!monthCount) return null;

        const at = (year, monthIndex, day) => {
            try {
                return calendar.componentsToTime({
                    year, month: monthIndex, dayOfMonth: day,
                    hour: event.hour ?? 0, minute: event.minute ?? 0, second: 0
                });
            } catch { return null; }
        };

        if (event.recurrence === EVENT_RECURRENCE.ONCE) {
            const time = at(event.year, event.month, event.day);
            return time !== null && time >= fromTime ? time : null;
        }

        const now = this._nowComponents();
        if (!now) return null;

        let year = now.year;
        let monthIndex = event.recurrence === EVENT_RECURRENCE.ANNUAL ? event.month : now.month;

        for (let step = 0; step < SEARCH_LIMIT_MONTHS; step++) {
            if (event.day < this.daysInMonth(calendar, year, monthIndex)) {
                const time = at(year, monthIndex, event.day);
                if (time !== null && time >= fromTime) return time;
            }

            if (event.recurrence === EVENT_RECURRENCE.ANNUAL) {
                year += 1;
            } else {
                monthIndex += 1;
                if (monthIndex >= monthCount) { monthIndex = 0; year += 1; }
            }
        }

        return null;
    }

    /**
     * Which events land on each day of a month.
     *
     * Returns a Map of zero-based day index -> events, for the calendar grid. Built by
     * asking each event about the month rather than by scanning days, because an
     * annual event is a constant-time check and a scan would be one per day.
     *
     * @returns {Map<number, object[]>}
     */
    static occurrencesInMonth(year, monthIndex) {
        const calendar = this._calendar();
        const byDay = new Map();
        if (!calendar) return byDay;

        const dayCount = this.daysInMonth(calendar, year, monthIndex);

        for (const event of this.list()) {
            let day = null;
            if (event.recurrence === EVENT_RECURRENCE.ONCE) {
                if (event.year === year && event.month === monthIndex) day = event.day;
            } else if (event.recurrence === EVENT_RECURRENCE.ANNUAL) {
                if (event.month === monthIndex) day = event.day;
            } else if (event.recurrence === EVENT_RECURRENCE.MONTHLY) {
                day = event.day;
            }

            // A day the month does not have is skipped, matching nextOccurrence.
            if (day === null || day >= dayCount) continue;
            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day).push(event);
        }

        return byDay;
    }

    // ==============================================================
    // ===== FIRING =================================================
    // ==============================================================

    static initialize() {
        // Events are world data, so a change on any client means every client rebuilds
        // its schedules. Only a GM's schedules actually fire -- see `gmOnly` below --
        // but keeping them registered everywhere means a GM promoted mid-session is
        // already armed.
        HookManager.registerSettingChangeCallback({
            description: 'Calendar events: re-arm schedules when the event list changes',
            context: 'calendar-events',
            key: CALENDAR_EVENTS_SETTING,
            priority: 3,
            callback: () => this.rearmAll()
        });

        // Registered on every client; only a GM's handler ever runs, which is what
        // `gmRequest` arranges. `author` is the VERIFIED caller, so a player cannot
        // claim to be someone else by editing the payload.
        GMRequestAPI.registerOp({
            op: OP_CREATE,
            module: MODULE.ID,
            handler: (payload, user) => this.create({ ...payload, author: user?.id })
        });
        GMRequestAPI.registerOp({
            op: OP_UPDATE,
            module: MODULE.ID,
            handler: (payload, user) => this.update(payload?.id, payload?.changes ?? {}, user)
        });
        GMRequestAPI.registerOp({
            op: OP_DELETE,
            module: MODULE.ID,
            handler: (payload, user) => this.delete(payload?.id, user)
        });

        this.rearmAll();
        postConsoleAndNotification(MODULE.NAME, `Calendar events: ${this.list().length} event(s) armed`, '', true, false);
    }

    /** Drop every schedule this manager owns and register the next occurrence of each event. */
    static rearmAll() {
        for (const entry of WorldClockAPI.list?.() ?? []) {
            if (typeof entry?.id === 'string' && entry.id.startsWith(SCHEDULE_PREFIX)) {
                WorldClockAPI.unschedule(entry.id);
            }
        }
        for (const event of this.list()) this._arm(event);
    }

    /**
     * Register one event's next occurrence.
     *
     * `gmOnly` because firing announces to the table, and a callback registered on
     * five clients without it announces five times.
     */
    static _arm(event, fromTime = game.time?.worldTime ?? 0) {
        const at = this.nextOccurrence(event, fromTime);
        if (at === null) return;

        WorldClockAPI.schedule({
            id: `${SCHEDULE_PREFIX}${event.id}`,
            at,
            description: `Calendar event: ${event.name}`,
            gmOnly: true,
            callback: (context) => this._fire(event, context)
        });
    }

    /**
     * The moment arrived.
     *
     * Blacksmith announces it as a toast and calls a hook. The hook is the important
     * half: WHAT an event means is a consumer's business -- a festival with weather
     * and prices belongs to a sibling, not to the hub -- so anything richer than "this
     * happened" listens rather than being built here.
     */
    static _fire(event, context = {}) {
        try {
            Hooks.callAll('blacksmith.calendarEventFired', { event, ...context });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar events: a listener threw', error, false, false);
        }

        void this._announce(event);

        // Recurring events arm their next occurrence; a one-shot is done.
        //
        // Armed from one second PAST the current time, or `nextOccurrence` finds the
        // moment that just fired and re-arms on it, which fires again on the next tick
        // and does not stop.
        if (event.recurrence !== EVENT_RECURRENCE.ONCE) {
            this._arm(event, (game.time?.worldTime ?? 0) + 1);
        }
    }

    /** Toast the event. Imported on demand so this file does not pull the toast stack at load. */
    static async _announce(event) {
        try {
            const { ToastAPI } = await import('./api-toast.js');
            ToastAPI.show({
                title: event.name,
                subtitle: event.description || 'Today on the calendar',
                icon: 'fa-solid fa-calendar-star',
                duration: 8,
                moduleId: MODULE.ID,
                stackKey: `blacksmith-calendar-event-${event.id}`
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar events: could not announce', error, false, false);
        }
    }
}
