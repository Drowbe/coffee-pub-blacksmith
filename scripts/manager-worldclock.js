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
     * the day" is. The darkness phase of the plan replaces these with real settings,
     * at which point this pair goes away rather than gaining a third.
     */
    static SUNRISE = 0.25;
    static SUNSET = 0.75;

    /**
     * The sky, as colours at named moments of the day.
     *
     * The panel is a window, not a progress bar: the whole of it is the sky outside,
     * so its colour has to be the colour of the sky at THIS time rather than a fixed
     * gradient with a marker sliding over it. That means interpolating, which means
     * the colours are data here rather than a `linear-gradient` in the stylesheet --
     * CSS cannot interpolate between two gradients on a variable.
     *
     * `top` and `bottom` are the vertical gradient: the sky is lighter towards the
     * horizon, and at dawn and dusk it is lit from BELOW, which is why those two
     * stops have a warm bottom under a still-dark top. That asymmetry is the whole
     * reason sunrise reads as sunrise.
     *
     * Stops are fractions of the day and MUST stay sorted. Sunrise sits at SUNRISE
     * and sunset at SUNSET; if those become settings, these move with them.
     */
    static SKY_STOPS = [
        { at: 0.00, top: [8, 12, 34], bottom: [18, 24, 56] },      // deep night
        { at: 0.20, top: [18, 26, 62], bottom: [46, 50, 96] },     // first light
        { at: 0.25, top: [62, 66, 118], bottom: [222, 132, 86] },  // sunrise, lit from below
        { at: 0.33, top: [98, 156, 218], bottom: [214, 198, 172] },
        { at: 0.50, top: [70, 148, 228], bottom: [170, 214, 248] },// noon
        { at: 0.67, top: [98, 156, 218], bottom: [214, 198, 172] },
        { at: 0.75, top: [62, 66, 118], bottom: [222, 132, 86] },  // sunset
        { at: 0.80, top: [18, 26, 62], bottom: [46, 50, 96] },
        { at: 1.00, top: [8, 12, 34], bottom: [18, 24, 56] }       // must equal 0.00
    ];

    /**
     * How high the sun and moon climb, as a percentage of the panel's height, and how
     * far off the floor they sit at rising and setting.
     *
     * The arc is a sine, not a path: `Math.sin(PI * progress)` is 0 at both ends and
     * 1 at the peak, which is exactly the shape wanted and needs no curve fitted to a
     * particular panel size. A CSS `offset-path` would hardcode the geometry in
     * pixels and break the moment the panel is resized.
     */
    static ARC_PEAK = 58;
    static ARC_FLOOR = 10;

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
            // Still carries a sky, painted at midday and greyed by the stylesheet.
            // An empty `skyStyle` would leave every custom property unset and the
            // panel would fall back to its CSS defaults, which is the same picture
            // by luck rather than by intent -- and would stop being so the moment a
            // default changed.
            const view = this._getSkyView(0.5);
            return {
                available: false,
                isGM: false,
                timeText: '--:--',
                tooltip: 'In-world time is not available yet.',
                smallStepLabel: '',
                largeStepLabel: '',
                ...view,
                skyStyle: this._styleAttribute(view.skyVars)
            };
        }

        const dayFraction = this._getDayFraction(calendar, components);
        const view = this._getSkyView(dayFraction);

        return {
            available: true,
            isGM,
            timeText: this._formatTime(calendar, components),
            tooltip: this._buildTooltip(calendar, components, isGM),
            smallStepLabel: this._describeStep('small'),
            largeStepLabel: this._describeStep('large'),
            ...view,
            skyStyle: this._styleAttribute(view.skyVars)
        };
    }

    /**
     * Everything about how the panel LOOKS at a given point in the day, as one
     * object. Shared by the render pass and the drag preview so the two cannot
     * disagree about what 4am looks like, and returned as CSS-ready values so the
     * paint path is a loop over custom properties rather than a list of special
     * cases.
     */
    static _getSkyView(dayFraction) {
        const arc = this._getArc(dayFraction);
        const sky = this._getSky(dayFraction);
        const round = (n) => Math.round(n * 10) / 10;

        return {
            isNight: arc.isNight,
            icon: arc.isNight ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
            skyVars: {
                '--sky-top': sky.top,
                '--sky-bottom': sky.bottom,
                '--star-opacity': String(Math.round(sky.starOpacity * 100) / 100),
                '--body-x': `${round(arc.x)}%`,
                '--body-y': `${round(arc.y)}%`
            }
        };
    }

    /** The `skyVars` object as an inline `style` attribute value. */
    static _styleAttribute(skyVars) {
        return Object.entries(skyVars).map(([k, v]) => `${k}: ${v}`).join('; ');
    }

    /** @returns {boolean} */
    static _isNight(dayFraction) {
        return (dayFraction < this.SUNRISE) || (dayFraction >= this.SUNSET);
    }

    /**
     * Where the sun or moon sits on its arc, and which one it is.
     *
     * There is ONE body, on one arc, that changes identity at the horizon: the sun
     * rises at sunrise, crosses, and sets at sunset, at which point the moon rises
     * and does the same across the night. So `progress` is progress through the
     * CURRENT phase, not through the day -- both bodies get a full arc regardless of
     * how long their phase lasts, which is what makes a short winter day look like a
     * short day rather than a sun that gives up halfway.
     *
     * The night case has to wrap midnight, which is why it is not simply a
     * subtraction: night runs from SUNSET through 1.0 and on through 0.0 to SUNRISE.
     *
     * @returns {{isNight: boolean, progress: number, x: number, y: number}}
     */
    static _getArc(dayFraction) {
        const rise = this.SUNRISE;
        const set = this.SUNSET;

        let isNight;
        let progress;

        if ((dayFraction >= rise) && (dayFraction < set)) {
            isNight = false;
            const dayLength = set - rise;
            progress = dayLength > 0 ? (dayFraction - rise) / dayLength : 0;
        } else {
            isNight = true;
            const nightLength = (1 - set) + rise;
            // Before sunrise belongs to the night that STARTED yesterday, so it is
            // measured from last night's sunset rather than from midnight.
            const elapsed = (dayFraction >= set) ? (dayFraction - set) : (dayFraction + (1 - set));
            progress = nightLength > 0 ? (elapsed / nightLength) : 0;
        }

        progress = Math.min(Math.max(progress, 0), 1);

        return {
            isNight,
            progress,
            x: progress * 100,
            y: this.ARC_FLOOR + (Math.sin(Math.PI * progress) * this.ARC_PEAK)
        };
    }

    /**
     * The colour of the sky at this moment, interpolated between `SKY_STOPS`.
     *
     * @returns {{top: string, bottom: string, starOpacity: number}}
     */
    static _getSky(dayFraction) {
        const stops = this.SKY_STOPS;
        const at = Math.min(Math.max(dayFraction, 0), 1);

        let lower = stops[0];
        let upper = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
            if ((at >= stops[i].at) && (at <= stops[i + 1].at)) {
                lower = stops[i];
                upper = stops[i + 1];
                break;
            }
        }

        const span = upper.at - lower.at;
        const t = span > 0 ? (at - lower.at) / span : 0;
        const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(v + ((b[i] - v) * t))).join(', ')})`;

        return {
            top: mix(lower.top, upper.top),
            bottom: mix(lower.bottom, upper.bottom),
            starOpacity: this._getStarOpacity(at)
        };
    }

    /**
     * Stars fade rather than switch.
     *
     * Snapping them on at sunset would be the one thing on this panel that jumps,
     * and it would jump at exactly the moment the eye is already watching the sun
     * touch the horizon. They fade across a band either side of the horizon, which
     * also means the brief window where a warm sky still has faint stars in it --
     * which is what dusk actually looks like.
     */
    static _getStarOpacity(dayFraction) {
        const FADE = 0.06;
        const rise = this.SUNRISE;
        const set = this.SUNSET;

        // Daylight has no stars at all. Handling this first is what keeps the two
        // ramps below symmetrical: each one only ever measures how far INTO the
        // night we are, from whichever horizon we crossed to get here.
        if ((dayFraction >= rise) && (dayFraction <= set)) return 0;

        const intoNight = (dayFraction > set)
            ? (dayFraction - set)      // after sunset, this evening
            : (rise - dayFraction);    // before sunrise, so measured backwards to it

        return Math.min(Math.max(intoNight / FADE, 0), 1);
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
        const lines = [];

        const weekday = this._nameOf(calendar.days?.values?.[components.dayOfWeek]);
        const month = this._nameOf(calendar.months?.values?.[components.month]);
        const season = this._nameOf(calendar.seasons?.values?.[components.season]);

        const dateParts = [];
        if (weekday) dateParts.push(weekday);
        dateParts.push(month
            ? `${components.dayOfMonth + 1} ${month} ${this._displayYear(calendar, components)}`
            : `Day ${components.day + 1}, year ${this._displayYear(calendar, components)}`);
        lines.push(`<strong>${dateParts.join(', ')}</strong>`);

        const notes = [];
        if (season) notes.push(season);
        if (components.leapYear) notes.push('leap year');
        if (notes.length) lines.push(notes.join(' &middot; '));

        lines.push(this._formatTime(calendar, components));

        if (isGM) lines.push('Drag the sky, or use the arrows, to change the time.');

        return lines.join('<br>');
    }

    /**
     * A calendar entry's display name.
     *
     * `name` on a month, weekday or season is a LOCALIZATION KEY, not a string --
     * dnd5e ships `DND5E.CALENDAR.Harptos.Month.Ches` and core never resolves it
     * (`CalendarData._initialize` does no localization; the system's own formatter
     * calls `game.i18n.localize(month.name)` at `dnd5e.mjs:1577`). Printing `name`
     * directly puts the raw key on screen.
     *
     * `localize` returns its argument unchanged when there is no translation, so a
     * calendar that supplies literal names rather than keys still works.
     *
     * @returns {string} Localized and escaped, or '' when there is nothing to show.
     */
    static _nameOf(entry) {
        if (!entry?.name) return '';
        return this._escape(game.i18n?.localize(entry.name) ?? entry.name);
    }

    /**
     * The year as a reader expects to see it.
     *
     * `components.year` counts years since the world's time origin, NOT the year the
     * setting calls it. The calendar's `years.yearZero` is the offset between them,
     * and every core consumer adds it before display -- see `dnd5e.mjs:1572` and
     * `CalendarData.jumpToDate`, whose parameter is documented as "Visible year
     * (with `yearZero` added in)". Omitting it showed 1496 in a world whose own HUD
     * read 2997.
     *
     * @returns {number}
     */
    static _displayYear(calendar, components) {
        return components.year + (calendar.years?.yearZero ?? 0);
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
        this._paint(section, data.timeText, data);

        section.classList.toggle('is-unavailable', !data.available);
        section.setAttribute('data-tooltip', data.tooltip);
    }

    /**
     * Write a moment into the widget's nodes. Shared by the live repaint and the drag
     * preview, so a dragged sky and a settled one cannot drift apart.
     *
     * Everything visual arrives as CSS custom properties, so this is a loop rather
     * than a list of cases and adding a variable to `_getSkyView` needs no change
     * here. The stylesheet decides what each one paints.
     */
    static _paint(section, timeText, view) {
        const label = section.querySelector('.worldclock-time');
        const sky = section.querySelector('.worldclock-sky');
        const body = section.querySelector('.worldclock-body');

        if (label) label.textContent = timeText;

        if (sky && view.skyVars) {
            for (const [name, value] of Object.entries(view.skyVars)) sky.style.setProperty(name, value);
        }

        // The body carries its Font Awesome glyph in its class list, so the sun and
        // moon swap rewrites the whole list rather than toggling one class: `fa-sun`
        // and `fa-moon` are siblings, and leaving both on renders one glyph stacked
        // on the other.
        if (body) body.className = `worldclock-body ${view.icon}`;
        section.classList.toggle('is-night', !!view.isNight);
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

        const sky = section.querySelector('.worldclock-sky');
        if (sky) sky.addEventListener('pointerdown', (event) => this._beginDrag(event, section, sky));
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
    static _beginDrag(event, section, sky) {
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
            calendar, sky, section, secondsPerDay, secondsPerMinute, dayStart,
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

        const bounds = drag.sky.getBoundingClientRect();
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
            this._getSkyView(dayFraction)
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
