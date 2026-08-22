// ==================================================================
// ===== CALENDAR WINDOW ============================================
// ==================================================================
//
// FIRST DRAFT. A month view of the world calendar: navigate, see where
// today is, and jump the world to a day. See
// documentation/plans/plan-calendar-window.md for what it is for and what
// is deliberately missing.
//
// EVERYTHING IS DERIVED FROM THE CALENDAR, nothing is assumed. Month
// lengths, week length, weekday names, leap years and the year label all
// come from `game.time.calendar`, because a world is free to declare six
// nine-day weeks or a 5-day festival month and a grid that assumed
// Gregorian would render a plausible lie. The clock next door already
// carries that scar: its first version hardcoded 86400 for a day.
//
// The one piece of arithmetic that is NOT done here is which weekday a
// date falls on. Asking core to convert the first of the month to a time
// and back gives the answer from the same code that renders every other
// date, so the grid cannot drift from the clock.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { registerWindow } from './api-windows.js';
import { CalendarEvents, EVENT_RECURRENCE } from './manager-calendar-events.js';

export const CALENDAR_WINDOW_ID = 'blacksmith-calendar';

export class CalendarWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /** The open instance, so a second open raises the first rather than stacking. */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: CALENDAR_WINDOW_ID,
            classes: ['blacksmith-calendar-tool-window'],
            position: { width: 700, height: 'auto' },
            window: { title: 'World Calendar', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 520, minHeight: 260 },
            toolTitlebar: 'full',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-calendar-position'
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs'
        }
    };

    static ACTION_HANDLERS = {
        calendarPrev: (_event, _target, win) => win?._shiftMonth(-1),
        calendarNext: (_event, _target, win) => win?._shiftMonth(1),
        calendarToday: (_event, _target, win) => win?._goToToday(),
        calendarPickDay: (_event, target, win) => win?._pickDay(target),
        calendarPrevYear: (_event, _target, win) => win?._shiftYear(-1),
        calendarNextYear: (_event, _target, win) => win?._shiftYear(1),
        calendarGoToSelected: (_event, _target, win) => win?._goToSelected(),
        calendarAddEvent: (_event, target, win) => win?._addEvent(target),
        calendarEditEvent: (_event, target, win) => win?._editEvent(target),
        calendarDeleteEvent: (_event, target, win) => win?._deleteEvent(target)
    };

    constructor(options = {}) {
        super(foundry.utils.mergeObject({}, options));
        // The month on VIEW, which is not the month the world is in: a GM paging
        // ahead to find a date must not move the world by looking at it.
        this.viewYear = null;
        this.viewMonth = null;
        // The day the reader has CLICKED, which is not the day the world is on.
        // Today is a fact; selection is a focus, and they need different marks or a
        // GM cannot tell "where we are" from "what I am looking at".
        this.selectedDay = null;
        /** Pending single click on an event row, held while we watch for a double. */
        this._rowClickTimer = null;
    }

    // ==============================================================
    // ===== CALENDAR READING =======================================
    // ==============================================================

    /** @returns {object|null} The world calendar, or null before it initialises. */
    static calendar() {
        return game.time?.calendar ?? null;
    }

    /**
     * A calendar label, localized.
     *
     * Month and weekday names are LOCALIZATION KEYS, not display text -- dnd5e's
     * Harptos calendar stores `DND5E.CALENDAR.Harptos.Month.Hammer` and expects the
     * reader to resolve it. Rendering them raw put the key on screen, and slicing one
     * for an abbreviation produced "DN" for every day of the tenday.
     *
     * `localize` returns its argument unchanged when there is no translation, so a
     * calendar that stores plain names is unaffected and needs no branch.
     */
    static label(value) {
        if (!value) return '';
        return game.i18n?.localize(value) ?? value;
    }

    /**
     * An hour and minute as a clock string, padded to the calendar's own widths.
     *
     * Padded from `minutesPerHour` rather than to two digits: a calendar declaring
     * 100-minute hours needs three, and hardcoding two would print 05:7 for seven
     * minutes past.
     */
    static formatTime(hour = 0, minute = 0) {
        const minutesPerHour = Number(game.time?.calendar?.days?.minutesPerHour) || 60;
        const width = String(minutesPerHour - 1).length;
        return `${String(hour ?? 0)}:${String(minute ?? 0).padStart(width, '0')}`;
    }

    /**
     * The season a month falls in, localized, or ''.
     *
     * `seasons.values` is optional and its entries may bound themselves by month
     * ordinals OR by day-of-year -- core checks days first (`calendar.mjs:236`). Only
     * the month form is used here, because a month grid has no single day to test and
     * naming a season per cell would be noise.
     */
    static seasonFor(calendar, year, monthIndex) {
        const seasons = calendar?.seasons?.values;
        const month = calendar?.months?.values?.[monthIndex];
        if (!Array.isArray(seasons) || !seasons.length || !month) return '';

        const ordinal = month.ordinal;
        const count = calendar.months.values.length;
        for (const season of seasons) {
            let { monthStart, monthEnd } = season;
            if (typeof monthStart !== 'number' || typeof monthEnd !== 'number') continue;
            // A season that wraps the year end -- winter running 12 to 2 -- is expressed
            // with an end lower than its start, the same way core reads it.
            if (monthEnd < monthStart) {
                if (ordinal <= monthEnd) monthStart -= count;
                else if (ordinal >= monthStart) monthEnd += count;
            }
            if (ordinal >= monthStart && ordinal <= monthEnd) return this.label(season.name);
        }
        return '';
    }

    /** Components of the current world time, or null. */
    static nowComponents() {
        const calendar = this.calendar();
        if (!calendar?.months?.values?.length) return null;
        try { return calendar.timeToComponents(game.time.worldTime); } catch { return null; }
    }

    /**
     * How many days a month has, honouring leap years.
     *
     * `leapDays` is optional per month -- a calendar may declare it on one month and
     * leave the rest, so the fallback is the ordinary length rather than zero.
     */
    static daysInMonth(calendar, year, monthIndex) {
        const month = calendar.months.values[monthIndex];
        if (!month) return 0;
        const isLeap = typeof calendar.isLeapYear === 'function' ? calendar.isLeapYear(year) : false;
        return isLeap ? (month.leapDays ?? month.days) : month.days;
    }

    /**
     * Which weekday the given date falls on, asked of core rather than computed.
     *
     * Round-tripping through `componentsToTime` means the grid agrees with the clock
     * by construction. Doing the modulo here instead would be a second implementation
     * of `timeToComponents`, and the two would drift the first time a calendar did
     * something unusual with leap days.
     */
    static weekdayOf(calendar, year, monthIndex, dayIndex) {
        try {
            const time = calendar.componentsToTime({ year, month: monthIndex, dayOfMonth: dayIndex, hour: 0, minute: 0, second: 0 });
            return calendar.timeToComponents(time).dayOfWeek ?? 0;
        } catch {
            return 0;
        }
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        const content = await foundry.applications.handlebars.renderTemplate(
            'modules/coffee-pub-blacksmith/templates/window-calendar.hbs',
            this.getCalendarData()
        );
        return { appId: this.id, bodyContent: content };
    }

    /**
     * The grid.
     *
     * Returns `available: false` rather than a fabricated month when the calendar has
     * not initialised -- the same choice the clock makes, and for the same reason: an
     * invented January is indistinguishable from a real one.
     */
    getCalendarData() {
        const calendar = CalendarWindow.calendar();
        const now = CalendarWindow.nowComponents();
        if (!calendar || !now) return { available: false };

        // First open lands on the month the world is in.
        if (this.viewYear === null) {
            this.viewYear = now.year;
            this.viewMonth = now.month;
        }

        const months = calendar.months.values;
        const weekdays = calendar.days.values;
        const monthIndex = this.viewMonth;
        const month = months[monthIndex];
        if (!month) return { available: false };

        const dayCount = CalendarWindow.daysInMonth(calendar, this.viewYear, monthIndex);
        const firstWeekday = CalendarWindow.weekdayOf(calendar, this.viewYear, monthIndex, 0);

        // Leading blanks so the first of the month sits under its weekday. A month
        // whose first day IS the first weekday produces none, which is why this is a
        // count rather than a fixed row.
        const cells = [];
        for (let blank = 0; blank < firstWeekday; blank++) cells.push({ blank: true });

        const isCurrentMonth = now.year === this.viewYear && now.month === monthIndex;
        const eventsByDay = CalendarEvents.occurrencesInMonth(this.viewYear, monthIndex);
        for (let day = 0; day < dayCount; day++) {
            const dayEvents = eventsByDay.get(day) ?? [];
            cells.push({
                blank: false,
                // Displayed ordinals are one-based; every index in `components` is not.
                label: day + 1,
                dayIndex: day,
                isToday: isCurrentMonth && now.dayOfMonth === day,
                isSelected: this.selectedDay === day,
                hasEvents: dayEvents.length > 0,
                // The names ride in the tooltip so a marker is not a dead dot: hovering
                // a marked day says what is on it without opening anything.
                eventTooltip: dayEvents.map(event => event.name).join(', ')
            });
        }

        // Trailing blanks so the last row is full and the grid keeps its shape.
        while (cells.length % weekdays.length !== 0) cells.push({ blank: true });

        return {
            available: true,
            isGM: !!game.user?.isGM,
            monthName: CalendarWindow.label(month.name),
            monthOrdinal: month.ordinal,
            monthCount: months.length,
            year: this.viewYear,
            yearLabel: this.viewYear,
            isLeapYear: typeof calendar.isLeapYear === 'function' ? !!calendar.isLeapYear(this.viewYear) : false,
            weekdays: weekdays.map((weekday) => {
                const name = CalendarWindow.label(weekday.name);
                // Localize BEFORE slicing. Slicing the key gave every day of the
                // tenday the same two letters.
                const abbreviation = CalendarWindow.label(weekday.abbreviation) || name.slice(0, 2);
                return { name, abbreviation };
            }),
            cells,
            columns: weekdays.length,
            // Grouped by day rather than flattened, so the pane can head each date
            // once. A flat list repeated the day number on every row and still left
            // the reader working out where one date ended and the next began.
            eventDays: [...eventsByDay.entries()]
                .sort(([a], [b]) => a - b)
                .map(([day, dayEvents]) => ({
                    dayIndex: day,
                    dayLabel: `${CalendarWindow.label(month.name)} ${day + 1}`,
                    isToday: isCurrentMonth && now.dayOfMonth === day,
                    isSelected: this.selectedDay === day,
                    events: dayEvents.map(event => ({
                        id: event.id,
                        name: event.name,
                        description: event.description,
                        dayIndex: day,
                        canEdit: CalendarEvents.canEdit(event),
                        authorName: game.users?.get(event.author)?.name ?? '',
                        timeLabel: CalendarWindow.formatTime(event.hour, event.minute),
                        recurrenceLabel: event.recurrence === EVENT_RECURRENCE.ANNUAL ? 'every year'
                            : event.recurrence === EVENT_RECURRENCE.MONTHLY ? 'every month'
                                : 'once'
                    }))
                })),
            hasEvents: eventsByDay.size > 0,
            viewingNow: isCurrentMonth,
            seasonName: CalendarWindow.seasonFor(calendar, this.viewYear, monthIndex),
            canEdit: !!game.user?.isGM,
            // Which day the footer's Add button targets. Today when today is on
            // screen, otherwise the first of the month being viewed -- a button in a
            // footer has no day of its own, and adding to a day the reader cannot see
            // would be worse than adding to the one they are looking at.
            hasSelection: Number.isInteger(this.selectedDay) && this.selectedDay < dayCount,
            selectedDayIndex: this.selectedDay,
            selectedLabel: Number.isInteger(this.selectedDay)
                ? `${CalendarWindow.label(month.name)} ${this.selectedDay + 1}`
                : '',
            todayLabel: `${CalendarWindow.label(months[now.month]?.name)} ${now.dayOfMonth + 1}`
        };
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    /**
     * Page a month, rolling the year over at either end.
     *
     * The roll is explicit rather than arithmetic on a 12: a calendar declares how
     * many months it has, and a hardcoded modulo would silently mis-page any world
     * that does not have twelve.
     */
    async _shiftMonth(delta) {
        const calendar = CalendarWindow.calendar();
        const count = calendar?.months?.values?.length ?? 0;
        if (!count) return;

        let month = this.viewMonth + delta;
        let year = this.viewYear;
        while (month < 0) { month += count; year -= 1; }
        while (month >= count) { month -= count; year += 1; }

        this.viewMonth = month;
        this.viewYear = year;
        await this.render(false);
    }

    /** Page a whole year, keeping the month. */
    async _shiftYear(delta) {
        if (!Number.isInteger(this.viewYear)) return;
        this.viewYear += delta;
        await this.render(false);
    }

    /** Back to the month the world is actually in. */
    async _goToToday() {
        const now = CalendarWindow.nowComponents();
        if (!now) return;
        this.viewYear = now.year;
        this.viewMonth = now.month;
        this.selectedDay = now.dayOfMonth;
        await this.render(false);
    }

    /**
     * Clicking a day SELECTS it. It does not move the world.
     *
     * Selection and "today" are different facts and now look different: today is
     * where the world is, selection is where the reader is looking. Conflating them
     * meant a GM could not page forward, point at a date and talk about it without
     * also travelling there. Moving the world is the footer's job, on the selected
     * day, which also gives that action a visible subject.
     *
     * Available to players: selecting is reading.
     */
    async _pickDay(target) {
        const dayIndex = Number(target?.dataset?.day);
        if (!Number.isInteger(dayIndex)) return;
        this.selectedDay = this.selectedDay === dayIndex ? null : dayIndex;
        await this.render(false);
    }

    /**
     * Move the world to the selected day, keeping the time of day.
     *
     * KEEPING THE TIME is the whole of the decision. Jumping to midnight would make
     * "skip to the 14th" also mean "and it is now the middle of the night", which is
     * not what the click said.
     *
     * GM only, because world time is the `core.time` world setting -- a player
     * clicking would throw rather than quietly fail.
     */
    async _goToSelected() {
        if (!game.user?.isGM) return;
        if (!Number.isInteger(this.selectedDay)) return;

        const calendar = CalendarWindow.calendar();
        const now = CalendarWindow.nowComponents();
        if (!calendar || !now) return;

        try {
            const time = calendar.componentsToTime({
                year: this.viewYear,
                month: this.viewMonth,
                dayOfMonth: this.selectedDay,
                hour: now.hour,
                minute: now.minute,
                second: now.second
            });
            // `set` rather than `advance`: this is a destination, not a duration, and
            // computing the delta ourselves would be arithmetic core already owns.
            await game.time.set(time);
            await this.render(false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar: could not set the date', error, false, true);
        }
    }

    /**
     * Add an event on a day, asked for through the shared dialog.
     *
     * `api.dialog` rather than a hand-rolled form: the module has one dialog surface
     * and a second one here would be the fourth thing to restyle when the chrome
     * changes.
     */
    async _addEvent(target, existing = null) {
        // Players may add events. The write is proxied to the GM by CalendarEvents,
        // which stamps the verified caller as the author.
        const dayIndex = existing
            ? existing.day
            : Number(target?.dataset?.day ?? this.selectedDay);
        if (!Number.isInteger(dayIndex)) return;

        const calendar = CalendarWindow.calendar();
        const monthName = CalendarWindow.label(calendar?.months?.values?.[this.viewMonth]?.name);

        try {
            const { DialogAPI } = await import('./api-dialog.js');

            // `prompt` collects ONE value from consumer-rendered content, so the form
            // is ours and `getValue` reads it off the submit button's owning form.
            // There is no `form()` helper on this API -- three fields is still one
            // value once they are read together.
            // Hours per day comes from the calendar, so the hour field's ceiling is
            // right on a world that does not use twenty-four.
            const hoursPerDay = Number(calendar?.days?.hoursPerDay) || 24;
            const minutesPerHour = Number(calendar?.days?.minutesPerHour) || 60;
            const now = CalendarWindow.nowComponents();

            const { action, value } = await DialogAPI.prompt({
                title: existing
                    ? `Edit event: ${monthName} ${dayIndex + 1}`
                    : `New event: ${monthName} ${dayIndex + 1}`,
                submitLabel: existing ? 'Save Event' : 'Add Event',
                submitIcon: existing ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-calendar-plus',
                position: { width: 420 },
                content: `
                    <div class="blacksmith-calendar-event-form">
                        <label>Name<input type="text" name="eventName" autofocus value="${foundry.utils.escapeHTML(existing?.name ?? '')}"></label>
                        <label>Description<textarea name="eventDescription" rows="3">${foundry.utils.escapeHTML(existing?.description ?? '')}</textarea></label>
                        <div class="blacksmith-calendar-event-form-row">
                            <label>Repeats
                                <select name="eventRecurrence">
                                    <option value="${EVENT_RECURRENCE.ONCE}"${existing?.recurrence === EVENT_RECURRENCE.ONCE ? ' selected' : ''}>Once, this year only</option>
                                    <option value="${EVENT_RECURRENCE.ANNUAL}"${existing?.recurrence === EVENT_RECURRENCE.ANNUAL ? ' selected' : ''}>Every year on this date</option>
                                    <option value="${EVENT_RECURRENCE.MONTHLY}"${existing?.recurrence === EVENT_RECURRENCE.MONTHLY ? ' selected' : ''}>Every month on this day</option>
                                </select>
                            </label>
                            <label>Time
                                <span class="blacksmith-calendar-event-form-time">
                                    <input type="number" name="eventHour" min="0" max="${hoursPerDay - 1}" value="${existing?.hour ?? now?.hour ?? 0}">
                                    <span>:</span>
                                    <input type="number" name="eventMinute" min="0" max="${minutesPerHour - 1}" value="${existing?.minute ?? 0}">
                                </span>
                            </label>
                        </div>
                    </div>`,
                getValue: (root) => ({
                    name: root.elements.eventName?.value?.trim() ?? '',
                    description: root.elements.eventDescription?.value?.trim() ?? '',
                    recurrence: root.elements.eventRecurrence?.value ?? EVENT_RECURRENCE.ONCE,
                    hour: Number(root.elements.eventHour?.value) || 0,
                    minute: Number(root.elements.eventMinute?.value) || 0
                }),
                validate: (entered) => entered?.name ? null : 'An event needs a name.'
            });

            if (action !== DialogAPI.ACTIONS.SUBMIT || !value?.name) return;

            if (existing) {
                await CalendarEvents.update(existing.id, {
                    name: value.name,
                    description: value.description,
                    recurrence: value.recurrence,
                    hour: value.hour,
                    minute: value.minute
                });
                await this.render(false);
                return;
            }

            await CalendarEvents.create({
                name: value.name,
                description: value.description,
                recurrence: value.recurrence,
                hour: value.hour,
                minute: value.minute,
                year: this.viewYear,
                month: this.viewMonth,
                day: dayIndex
            });
            await this.render(false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar: could not add the event', error, false, true);
        }
    }

    /**
     * Scroll the events pane to a day's group.
     *
     * `scrollIntoView` on the pane's own scroller rather than the page: the list is
     * the scrolling element, and letting the browser scroll an ancestor would move
     * the whole window instead.
     */
    _scrollToDay(dayIndex) {
        const group = this.element?.querySelector(`[data-day-group="${dayIndex}"]`);
        if (!group) return;
        group.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /** Reopen the add dialog with an event's values in it. */
    async _editEvent(target) {
        const id = target?.dataset?.eventId;
        const event = id ? CalendarEvents.get(id) : null;
        if (!event) return;
        // Re-checked at click time, not only at render: the list may have been
        // repainted since, and the store would refuse anyway.
        if (!CalendarEvents.canEdit(event)) return;
        await this._addEvent(null, event);
    }

    /** Remove an event, confirming first because there is no undo. */
    async _deleteEvent(target) {
        const id = target?.dataset?.eventId;
        if (!id) return;
        const event = CalendarEvents.get(id);
        if (!event) return;
        if (!CalendarEvents.canEdit(event)) return;

        try {
            const { DialogAPI } = await import('./api-dialog.js');
            const confirmed = await DialogAPI.confirm({
                title: 'Delete event',
                content: `<p>Delete <strong>${foundry.utils.escapeHTML(event.name)}</strong> from the calendar?</p>`,
                destructive: true
            });
            if (!confirmed) return;

            await CalendarEvents.delete(id);
            await this.render(false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Calendar: could not delete the event', error, false, true);
        }
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        CalendarWindow.activeWindow = this;

        // AN EVENT ROW SELECTS ITS DAY on the grid, and opens for editing on a
        // double click. Bound here rather than through ACTION_HANDLERS: the row is
        // not a button (it contains buttons), and `data-action` dispatches on click
        // only, so there is nowhere to hang the double.
        //
        // The single-click handler defers for the same reason the clock's does -- a
        // double click fires two clicks first, and without the delay the row would
        // select the day and then open the dialog behind that repaint.
        this.element?.querySelectorAll('[data-event-row]').forEach((row) => {
            row.addEventListener('click', (event) => {
                // The edit and delete buttons live inside the row and speak for
                // themselves; a click on one is not a click on the row.
                if (event.target.closest('button')) return;
                if (this._rowClickTimer) return;
                const dayIndex = Number(row.dataset.day);
                this._rowClickTimer = setTimeout(() => {
                    this._rowClickTimer = null;
                    if (!Number.isInteger(dayIndex)) return;
                    this.selectedDay = dayIndex;
                    void this.render(false);
                }, 220);
            });

            row.addEventListener('dblclick', (event) => {
                if (event.target.closest('button')) return;
                clearTimeout(this._rowClickTimer);
                this._rowClickTimer = null;
                const id = row.dataset.eventRow;
                const stored = id ? CalendarEvents.get(id) : null;
                if (stored && CalendarEvents.canEdit(stored)) void this._addEvent(null, stored);
            });
        });

        // Bring the selected day's events into view. Deferred a frame because the
        // list has only just been written into the DOM and has no scroll height yet.
        if (Number.isInteger(this.selectedDay)) {
            requestAnimationFrame(() => this._scrollToDay(this.selectedDay));
        }

        // DOUBLE-CLICK A DAY TO ADD AN EVENT ON IT. Single click selects, which is
        // the common act; adding is the rarer one and gets the deliberate gesture.
        // Right-click is left alone so Foundry's own context menu still works.
        //
        // `data-action` dispatches on click only, so the double is bound here. The
        // select handler on the same cell already runs first -- that is fine and
        // wanted: adding to a day should select it too.
        this.element?.querySelectorAll('[data-action="calendarPickDay"]').forEach((cell) => {
            cell.addEventListener('dblclick', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this._addEvent(cell);
            });
        });
    }

    async close(options = {}) {
        if (CalendarWindow.activeWindow === this) CalendarWindow.activeWindow = null;
        return super.close(options);
    }
}

/**
 * Open the calendar, raising the existing window rather than stacking a second.
 *
 * Not `openFor`: that keys one window per target, and the calendar has no target --
 * there is one world calendar and one window onto it.
 */
export function openCalendarWindow() {
    if (CalendarWindow.activeWindow) {
        CalendarWindow.activeWindow.bringToFront?.();
        return CalendarWindow.activeWindow;
    }
    const win = new CalendarWindow();
    void win.render(true);
    return win;
}

/**
 * Register the window so `openWindow('blacksmith-calendar')` reaches it.
 *
 * No menubar tool: the clock already opens this, and a second entry point for one
 * window on a bar that is already busy is clutter. The registry entry is what makes
 * it reachable from a macro or another module without importing this file.
 */
export function registerCalendarWindow() {
    registerWindow(CALENDAR_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'World Calendar',
        open: async () => openCalendarWindow()
    });
}
