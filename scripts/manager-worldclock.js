// ==================================================================
// ===== WORLD CLOCK ================================================
// ==================================================================
//
// The in-world clock: a readout of `game.time` with GM controls, rendered in the
// menubar beside the session timer.
//
// SELF-CONTAINED BY DESIGN. Everything this feature owns lives in files named for
// it -- this manager, `templates/partials/worldclock.hbs`, `styles/worldclock.css`
// -- and the menubar touches it through exactly two calls: `getRenderData()` for
// the render context and `attachHandlers()` after the DOM lands. Nothing else in
// the module imports this file, and this file imports nothing from the menubar,
// so the whole feature can move to a sibling module as a file move.
//
// It reads the CORE calendar and never does its own arithmetic on raw seconds --
// see getRenderData for why that distinction matters more than it looks.
//
// Time is the `core.time` world setting, so only a GM may move it; players get a
// readout with no controls. Linking scene darkness to the time is deliberately NOT
// here -- see documentation/plans/plan-world-time.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, fetchTemplateText } from './api-core.js';
import { HookManager } from './manager-hooks.js';

class WorldClockManager {

    /**
     * Sunrise and sunset as FRACTIONS of the day rather than clock hours.
     *
     * A calendar declares its own day length and `hoursPerDay` need not be 24, so
     * "06:00" is not portable between calendars but "a quarter of the way through
     * the day" is. These exist so the sky gradient and the sun/moon marker have
     * something to key off; the darkness phase of the plan replaces them with real
     * settings, at which point this pair goes away rather than gaining a third.
     *
     * The stops in `styles/worldclock.css` are drawn to match these numbers. Change
     * one without the other and the marker crosses a painted dawn at the wrong time.
     */
    static SUNRISE = 0.25;
    static SUNSET = 0.75;

    /** Minimum movement, in seconds of world time, before a drag is worth committing. */
    static DRAG_EPSILON = 1;

    /** Live drag state, or null. Also the flag that suppresses the live repaint. */
    static _drag = null;

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    /**
     * Register the partial and the world-time hook. Called once from `ready`.
     */
    static async initialize() {
        await this.registerPartial();
        this._registerHook();
    }

    /**
     * The widget's markup, registered under a namespaced name.
     *
     * The namespace is not decoration. `Handlebars.partials` is a single global
     * namespace shared by every module in the world, registration is async, and a
     * bare name like `worldclock` would be one sibling module away from a race that
     * renders somebody else's markup -- which has already happened once in this
     * repo, to `partial-unified-header`.
     */
    static async registerPartial() {
        try {
            const path = 'modules/coffee-pub-blacksmith/templates/partials/worldclock.hbs';
            const template = await fetchTemplateText(path);
            if (template) Handlebars.registerPartial('blacksmith-worldclock', template);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "WorldClock: Failed to register partial", error, false, false);
        }
    }

    static _registerHook() {
        HookManager.registerHook({
            name: 'updateWorldTime',
            description: 'WorldClock: Repaint the in-world clock when world time changes',
            context: 'worldclock',
            priority: 4,
            callback: () => this.updateDisplay()
        });

        postConsoleAndNotification(MODULE.NAME, "WorldClock: World time hook registered", "", true, false);
    }

    // ==============================================================
    // ===== RENDER DATA ============================================
    // ==============================================================

    /**
     * Everything the widget needs to draw itself.
     *
     * Derived from `game.time.components`, which the calendar has already decomposed
     * correctly, rather than from modulo arithmetic on `worldTime`. That is not a
     * style preference: the length of a day is `secondsPerMinute * minutesPerHour *
     * hoursPerDay` as the calendar declares it, and the first version of this readout
     * hardcoded 86400. Harptos happens to use 24-hour days, so the bug was invisible
     * in the world it was written for and would have surfaced only in a world with a
     * custom calendar.
     *
     * Every index in `components` is ZERO-based -- month, dayOfMonth, dayOfWeek and
     * season are array offsets, not ordinals (`client/data/calendar.mjs:261`). Hence
     * the `+ 1` wherever a day is displayed.
     *
     * @returns {object} Render data, including `available: false` when the calendar
     *                   has not initialised yet.
     */
    static getRenderData() {
        const calendar = game.time?.calendar;
        const components = game.time?.components;
        const isGM = !!game.user?.isGM;

        // The menubar can render before the calendar initialises. A blank readout is
        // the honest output: a fabricated midnight would be indistinguishable from a
        // world that genuinely is at midnight.
        if (!calendar?.days || !components) {
            return {
                available: false,
                isGM: false,
                timeText: '--:--',
                tooltip: 'In-world time is not available yet.',
                icon: 'fa-solid fa-clock',
                isNight: false,
                dayPercent: 0,
                smallStepLabel: '',
                largeStepLabel: ''
            };
        }

        const dayFraction = this._getDayFraction(calendar, components);
        const isNight = this._isNight(dayFraction);

        return {
            available: true,
            isGM,
            timeText: this._formatTime(calendar, components),
            tooltip: this._buildTooltip(calendar, components, isGM),
            icon: isNight ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
            isNight,
            // One decimal place. Whole percents visibly step the marker on a track
            // only ~64px wide, and on a 24-hour day 1% is a ~15 minute jump.
            dayPercent: Math.round(dayFraction * 1000) / 10,
            smallStepLabel: this._describeStep('small'),
            largeStepLabel: this._describeStep('large')
        };
    }

    /** @returns {boolean} */
    static _isNight(dayFraction) {
        return (dayFraction < this.SUNRISE) || (dayFraction >= this.SUNSET);
    }

    /**
     * How far through the day a set of components sits, as 0..1.
     * @returns {number}
     */
    static _getDayFraction(calendar, components) {
        const { secondsPerMinute, minutesPerHour, hoursPerDay } = calendar.days;
        const secondsPerDay = secondsPerMinute * minutesPerHour * hoursPerDay;
        if (!(secondsPerDay > 0)) return 0;

        const secondsToday = (components.hour * minutesPerHour * secondsPerMinute)
            + (components.minute * secondsPerMinute)
            + components.second;

        return Math.min(Math.max(secondsToday / secondsPerDay, 0), 1);
    }

    /**
     * The clock face.
     *
     * Twelve-hour time is used ONLY on a 24-hour calendar. AM and PM mean "before and
     * after the midpoint of a 24-hour day" and say nothing on a calendar with, say,
     * twenty hours in a day, where halving the count produces a clock nobody can
     * read. Everything else falls back to zero-padded 24-hour, which is well defined
     * for any day length.
     */
    static _formatTime(calendar, components) {
        const minute = String(components.minute).padStart(2, '0');

        if (calendar.days.hoursPerDay !== 24) {
            return `${String(components.hour).padStart(2, '0')}:${minute}`;
        }

        const suffix = components.hour < 12 ? 'AM' : 'PM';
        const hour12 = (components.hour % 12) === 0 ? 12 : (components.hour % 12);
        return `${hour12}:${minute} ${suffix}`;
    }

    /**
     * Escape text bound for the tooltip attribute.
     *
     * The tooltip is rendered as HTML -- it carries `<br>` separators and is emitted
     * unescaped by the template -- so the pieces interpolated into it must not be.
     * Month, weekday and season names come from whichever calendar is configured: a
     * system, a module, or a hand-rolled world calendar. Third-party strings, not
     * ours to trust.
     */
    static _escape(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * The detail the compact readout leaves out: weekday, date, year, season.
     *
     * The bar shows the time alone because the right zone already carries the leader,
     * the movement mode and the session timer, and a full date there would push the
     * row into overflow at ordinary window widths. The date is not dropped; it is one
     * hover away.
     *
     * Every part is optional. A calendar need not define months, weekdays or seasons
     * -- `months` and `seasons` are explicitly nullable in the core schema -- so each
     * is probed rather than assumed, with the day-of-year as the fallback.
     */
    static _buildTooltip(calendar, components, isGM) {
        const esc = (v) => this._escape(v);
        const lines = [];

        const weekday = calendar.days?.values?.[components.dayOfWeek];
        const month = calendar.months?.values?.[components.month];
        const season = calendar.seasons?.values?.[components.season];

        const dateParts = [];
        if (weekday?.name) dateParts.push(esc(weekday.name));
        dateParts.push(month?.name
            ? `${components.dayOfMonth + 1} ${esc(month.name)}`
            : `Day ${components.day + 1}`);
        lines.push(`<strong>${dateParts.join(', ')}</strong>`);

        lines.push(`Year ${components.year}${components.leapYear ? ' (leap year)' : ''}`);
        if (season?.name) lines.push(esc(season.name));
        lines.push(this._formatTime(calendar, components));

        if (isGM) lines.push('Drag the sky bar, or use the arrows, to change the time.');

        return lines.join('<br>');
    }

    /**
     * A step amount phrased for a tooltip, in the calendar's own minutes.
     * @param {'small'|'large'} size
     */
    static _describeStep(size) {
        const minutes = this._getStepMinutes(size);
        if ((minutes % 60) === 0) {
            const hours = minutes / 60;
            return `${hours} hour${hours === 1 ? '' : 's'}`;
        }
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    /** @param {'small'|'large'} size */
    static _getStepMinutes(size) {
        const key = size === 'large' ? 'worldClockStepLarge' : 'worldClockStepSmall';
        const fallback = size === 'large' ? 60 : 10;
        const minutes = Number(getSettingSafely(MODULE.ID, key, fallback));
        return (Number.isFinite(minutes) && minutes > 0) ? minutes : fallback;
    }

    // ==============================================================
    // ===== PAINTING ===============================================
    // ==============================================================

    /**
     * Repaint the clock in place.
     *
     * Deliberately NOT on an interval, unlike the session timer beside it. World time
     * does not pass on its own -- it moves only when something advances it, and
     * `updateWorldTime` fires exactly then. A ticking interval would spend a repaint
     * per second redrawing an identical string for the whole session.
     *
     * Skipped entirely while a drag is in flight, because the drag is already painting
     * its own preview and the two would fight over the same nodes.
     */
    static updateDisplay() {
        if (this._drag) return;

        const section = document.querySelector('.worldclock-section');
        if (!section) return;

        const data = this.getRenderData();
        this._paint(section, data.timeText, data.dayPercent, data.isNight);

        section.classList.toggle('is-unavailable', !data.available);
        section.setAttribute('data-tooltip', data.tooltip);
    }

    /**
     * Write a time into the widget's nodes. Shared by the live repaint and the drag
     * preview, so a dragged clock and a settled one cannot drift apart in how they
     * render.
     */
    static _paint(section, timeText, dayPercent, isNight) {
        const label = section.querySelector('.worldclock-time');
        const track = section.querySelector('.worldclock-track');
        const marker = section.querySelector('.worldclock-marker');

        if (label) label.textContent = timeText;
        if (track) track.style.setProperty('--day-percent', `${dayPercent}%`);
        // The marker carries its Font Awesome glyph in its class list, so the sun and
        // moon swap rewrites the whole list rather than toggling one class: `fa-sun`
        // and `fa-moon` are siblings, and leaving both on renders one glyph stacked
        // on the other.
        if (marker) marker.className = `worldclock-marker ${isNight ? 'fa-solid fa-moon' : 'fa-solid fa-sun'}`;
        section.classList.toggle('is-night', isNight);
    }

    // ==============================================================
    // ===== CONTROLS ===============================================
    // ==============================================================

    /**
     * Move world time by one step.
     *
     * The step is configured in MINUTES but converted with the calendar's own
     * `secondsPerMinute`, not 60 -- on a calendar defining a different minute,
     * multiplying by 60 would silently step the wrong distance.
     *
     * @param {number} direction -1 or 1
     * @param {'small'|'large'} size
     */
    static async step(direction, size) {
        // Time is the `core.time` WORLD setting, so a player calling this throws
        // rather than doing nothing. The controls are not rendered for them; this is
        // the second guard, for anything reaching the method directly.
        if (!game.user?.isGM) return;

        const calendar = game.time?.calendar;
        if (!calendar?.days) return;

        const seconds = this._getStepMinutes(size) * calendar.days.secondsPerMinute;

        try {
            await game.time.advance(direction * seconds);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "WorldClock: Failed to step world time", error, false, false);
        }
    }

    /**
     * Attach the widget's listeners. Called by the menubar after every render, since
     * the menubar rebuilds its DOM wholesale and these nodes are replaced each time.
     *
     * Element listeners need no teardown -- they die with the nodes they are on. The
     * drag's window-level listeners DO, and they remove themselves on release rather
     * than being tracked here.
     *
     * @param {Function} [playButtonSound] Click feedback, handed in by the menubar
     *                   because its sound helper is a local of its own method rather
     *                   than a module symbol.
     */
    static attachHandlers(playButtonSound = () => {}) {
        const section = document.querySelector('.worldclock-section');
        if (!section || !game.user?.isGM) return;

        section.querySelectorAll('.worldclock-step').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                playButtonSound();

                const direction = button.dataset.direction === 'back' ? -1 : 1;
                const size = button.dataset.size === 'large' ? 'large' : 'small';
                this.step(direction, size);
            });
        });

        const track = section.querySelector('.worldclock-track');
        if (track) track.addEventListener('pointerdown', (event) => this._beginDrag(event, section, track));
    }

    /**
     * Start scrubbing the time.
     *
     * The whole point of the deferred commit: a drag across a 64px track fires a
     * pointermove every few pixels, and committing on each one would be a world
     * setting write -- a database round trip broadcast to every client -- per frame.
     * The preview is local DOM only, and exactly one write happens on release.
     *
     * The move and release listeners live on `window` rather than the track so the
     * gesture survives the pointer leaving a very small element, and they remove
     * themselves on release so nothing outlives it.
     */
    static _beginDrag(event, section, track) {
        if (!game.user?.isGM) return;

        const calendar = game.time?.calendar;
        const components = game.time?.components;
        if (!calendar?.days || !components) return;

        const { secondsPerMinute, minutesPerHour, hoursPerDay } = calendar.days;
        const secondsPerDay = secondsPerMinute * minutesPerHour * hoursPerDay;
        if (!(secondsPerDay > 0)) return;

        event.preventDefault();
        event.stopPropagation();

        // Where the current day began. World time does not move during the drag, so
        // this is computed once -- a drag only ever chooses a position within today.
        const dayStart = game.time.worldTime
            - Math.round(this._getDayFraction(calendar, components) * secondsPerDay);

        this._drag = {
            calendar, track, section, secondsPerDay, secondsPerMinute, dayStart,
            target: game.time.worldTime
        };
        section.classList.add('is-dragging');

        const onMove = (moveEvent) => this._updateDrag(moveEvent);
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            this._endDrag();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);

        this._updateDrag(event);
    }

    /**
     * Paint the dragged time without writing it anywhere.
     *
     * Snapped to whole minutes. A track a few dozen pixels wide maps a single pixel to
     * roughly twenty minutes of world time, so second-level precision is noise the GM
     * cannot aim at anyway, and an unsnapped value produces times like 6:31:47 that
     * read as broken rather than precise.
     */
    static _updateDrag(event) {
        const drag = this._drag;
        if (!drag) return;

        const bounds = drag.track.getBoundingClientRect();
        if (!bounds.width) return;

        const fraction = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);

        const snapped = Math.round((fraction * drag.secondsPerDay) / drag.secondsPerMinute) * drag.secondsPerMinute;
        // A drag to the very end of the track lands on the NEXT midnight; clamping
        // keeps it inside today rather than silently rolling the date forward.
        const secondsToday = Math.min(snapped, drag.secondsPerDay - drag.secondsPerMinute);

        drag.target = drag.dayStart + secondsToday;

        const components = drag.calendar.timeToComponents(drag.target);
        const dayFraction = this._getDayFraction(drag.calendar, components);

        this._paint(
            drag.section,
            this._formatTime(drag.calendar, components),
            Math.round(dayFraction * 1000) / 10,
            this._isNight(dayFraction)
        );
    }

    /** Commit the dragged time -- the single write of the whole gesture. */
    static async _endDrag() {
        const drag = this._drag;
        this._drag = null;
        if (!drag) return;

        drag.section.classList.remove('is-dragging');

        // A click that never moved is not a time change. Without this, tapping the
        // track would write the time it already was, broadcasting to every client to
        // announce that nothing happened.
        if (Math.abs(drag.target - game.time.worldTime) < this.DRAG_EPSILON) {
            this.updateDisplay();
            return;
        }

        try {
            await game.time.set(drag.target);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "WorldClock: Failed to set world time", error, false, false);
            // Put the widget back to the truth; the preview is now a lie.
            this.updateDisplay();
        }
    }
}

export { WorldClockManager };
