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
// readout with no controls.
//
// Scene darkness lives in `manager-darkness.js`, which reads this file's horizons
// and day fraction. The arrow runs darkness -> clock and never back: nothing here
// knows the driver exists, which is what lets either move independently.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, fetchTemplateText } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { UIContextMenu } from './ui-context-menu.js';

class WorldClockManager {

    /** Where the horizons sit when the settings are unreadable. Quarter and three-quarter day. */
    static DEFAULT_SUNRISE = 0.25;
    static DEFAULT_SUNSET = 0.75;

    /**
     * Sunrise and sunset as FRACTIONS of the day rather than clock hours.
     *
     * Configured in HOURS, because that is how a person thinks about dawn, but stored
     * and used as fractions, because a calendar declares its own day length and
     * `hoursPerDay` need not be 24. Hour 5 of a twenty-hour day is the same
     * quarter-past-dawn as hour 6 of a twenty-four hour one.
     *
     * The DARKNESS DRIVER READS THE SAME TWO SETTINGS. That is the point of them
     * being settings rather than constants: the dawn painted on the panel and the
     * dawn the scene actually lightens at are the same moment, and cannot drift.
     *
     * @returns {{sunrise: number, sunset: number}} Fractions of the day, 0..1.
     */
    static getHorizons() {
        const hoursPerDay = game.time?.calendar?.days?.hoursPerDay;
        if (!(hoursPerDay > 0)) {
            return { sunrise: this.DEFAULT_SUNRISE, sunset: this.DEFAULT_SUNSET };
        }

        const toFraction = (hours, fallback) => {
            const value = Number(hours);
            if (!Number.isFinite(value)) return fallback;
            return Math.min(Math.max(value / hoursPerDay, 0), 1);
        };

        const sunrise = toFraction(getSettingSafely(MODULE.ID, 'worldClockSunrise', 6), this.DEFAULT_SUNRISE);
        const sunset = toFraction(getSettingSafely(MODULE.ID, 'worldClockSunset', 18), this.DEFAULT_SUNSET);

        // A sunset at or before sunrise has no daytime between them and would make
        // every downstream span zero or negative -- the arc would divide by zero and
        // the sky remap would fold on itself. Fall back rather than paint nonsense.
        if (!(sunset > sunrise)) return { sunrise: this.DEFAULT_SUNRISE, sunset: this.DEFAULT_SUNSET };

        return { sunrise, sunset };
    }

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

    /**
     * How far in from each edge the arc starts and ends, as a percentage of the
     * panel's width. See `_arcXPercent` -- this exists so the body is never clipped,
     * and therefore never half-ungrabbable, at the horizons.
     */
    static ARC_INSET = 6;

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
        const { sunrise, sunset } = this.getHorizons();
        return (dayFraction < sunrise) || (dayFraction >= sunset);
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
        const phase = this._getPhase(dayFraction);
        const progress = Math.min(Math.max(phase.progress, 0), 1);

        return {
            isNight: phase.isNight,
            progress,
            x: this._arcXPercent(progress),
            y: this.ARC_FLOOR + (Math.sin(Math.PI * progress) * this.ARC_PEAK)
        };
    }

    /**
     * Which half of the day we are in, where it began, how long it lasts, and how far
     * through it we are.
     *
     * Factored out of `_getArc` because the DRAG needs exactly the same answer. The
     * body's position along the panel is progress through the CURRENT PHASE, not
     * through the day -- so a drag that mapped the pointer to a fraction of the day
     * would disagree with the thing being dragged. At midnight the moon sits at the
     * middle of the panel, and a day-fraction reading of that same middle is midday:
     * grabbing the moon would have thrown it half a day across the sky.
     *
     * @returns {{isNight: boolean, start: number, length: number, progress: number}}
     *          `start` and `length` are day fractions; night wraps past 1.
     */
    static _getPhase(dayFraction) {
        const { sunrise: rise, sunset: set } = this.getHorizons();

        if ((dayFraction >= rise) && (dayFraction < set)) {
            const length = set - rise;
            return {
                isNight: false,
                start: rise,
                length,
                progress: length > 0 ? (dayFraction - rise) / length : 0
            };
        }

        const length = (1 - set) + rise;
        // Before sunrise belongs to the night that STARTED yesterday, so it is
        // measured from last night's sunset rather than from midnight.
        const elapsed = (dayFraction >= set) ? (dayFraction - set) : (dayFraction + (1 - set));
        return {
            isNight: true,
            start: set,
            length,
            progress: length > 0 ? (elapsed / length) : 0
        };
    }

    /**
     * Where a phase progress sits across the panel, as a percentage.
     *
     * Inset from both edges rather than running the full width. The body is centred
     * on its own position, so at 0% and 100% half the glyph would sit outside the
     * panel -- and the panel clips, which does not merely look wrong: a clipped
     * region is not hit-testable, so the sun would be half ungrabbable at sunrise
     * and the moon at dusk.
     */
    static _arcXPercent(progress) {
        return this.ARC_INSET + (progress * (100 - (this.ARC_INSET * 2)));
    }

    /** The inverse of `_arcXPercent`, for turning a pointer position back into time. */
    static _arcProgressFromX(xPercent) {
        const span = 100 - (this.ARC_INSET * 2);
        if (!(span > 0)) return 0;
        return Math.min(Math.max((xPercent - this.ARC_INSET) / span, 0), 1);
    }

    /**
     * Stretch the real day onto the day `SKY_STOPS` was painted for.
     *
     * The stop table is authored against a sunrise at 0.25 and a sunset at 0.75,
     * because that is a legible way to write a sky. Once those became settings the
     * table would otherwise paint dawn at the wrong moment -- a world with a 05:00
     * sunrise would show the sun clearing the horizon a full hour after the panel
     * had already gone blue.
     *
     * Rather than recompute nine colours whenever a setting changes, the LOOKUP is
     * remapped: a piecewise-linear stretch that puts the real sunrise at 0.25 and the
     * real sunset at 0.75, leaving the table alone. Night compresses or stretches
     * around the day, which is what actually happens to a sky.
     *
     * @returns {number} A position in the stop table's own coordinates, 0..1.
     */
    static _normalizeForSky(dayFraction) {
        const { sunrise, sunset } = this.getHorizons();
        const RISE = this.DEFAULT_SUNRISE;
        const SET = this.DEFAULT_SUNSET;

        // Guarded by getHorizons, which never returns a zero-length night or day --
        // but a division here would be silent rather than loud, so it is belt and braces.
        if (dayFraction < sunrise) {
            return sunrise > 0 ? (dayFraction / sunrise) * RISE : RISE;
        }
        if (dayFraction < sunset) {
            return RISE + ((dayFraction - sunrise) / (sunset - sunrise)) * (SET - RISE);
        }
        return sunset < 1 ? SET + ((dayFraction - sunset) / (1 - sunset)) * (1 - SET) : SET;
    }

    /**
     * The colour of the sky at this moment, interpolated between `SKY_STOPS`.
     *
     * @returns {{top: string, bottom: string, starOpacity: number}}
     */
    static _getSky(dayFraction) {
        const stops = this.SKY_STOPS;
        const at = this._normalizeForSky(Math.min(Math.max(dayFraction, 0), 1));

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
        const { sunrise: rise, sunset: set } = this.getHorizons();

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
     * How far through the day the world is right now, as 0..1.
     *
     * Public because the darkness driver needs exactly this and must not compute its
     * own -- two answers to "what time of day is it" that can disagree is the whole
     * class of bug this feature is trying not to have. The dependency runs darkness
     * -> clock and never back.
     *
     * @returns {number|null} null when the calendar has not initialised.
     */
    static getCurrentDayFraction() {
        const calendar = game.time?.calendar;
        const components = game.time?.components;
        if (!calendar?.days || !components) return null;
        return this._getDayFraction(calendar, components);
    }

    /**
     * Add an entry to the clock's right-click menu.
     *
     * A seam rather than a hard-coded list, so a feature that hangs off the clock --
     * the darkness driver is the first -- can offer a control without the clock
     * having to import it. Keeps the arrow pointing one way.
     *
     * @param {Function} provider Returns an array of UIContextMenu items, or nothing.
     */
    static registerContextMenuProvider(provider) {
        if (typeof provider === 'function') this._contextMenuProviders.push(provider);
    }

    /** @type {Function[]} */
    static _contextMenuProviders = [];

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

        if (isGM) lines.push('Drag the sun or moon, or use the arrows, to change the time.');

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

        // The DRAG HANDLE is the sun or moon, not the whole panel. Dragging anywhere
        // on the sky was the first version and was unreadable: nothing said the panel
        // was draggable, and a press on empty sky seeked the time to wherever it
        // landed. A body you can pick up says what it does by being a thing.
        //
        // The sky is still what the drag MEASURES against -- it is the track the body
        // travels along -- so both elements are handed over.
        const sky = section.querySelector('.worldclock-sky');
        const body = section.querySelector('.worldclock-body');
        if (sky && body) body.addEventListener('pointerdown', (event) => this._beginDrag(event, section, sky));

        section.addEventListener('contextmenu', (event) => this._showContextMenu(event));
    }

    /**
     * The clock's right-click menu, assembled from whatever has registered an entry.
     *
     * Suppressed entirely when nothing has -- an empty menu is worse than no menu,
     * and the browser's own context menu is more useful than a blank box.
     *
     * `stopPropagation` matters: the menubar has its own delegated `contextmenu`
     * handler on the container, and without this both would act on the same click.
     */
    static _showContextMenu(event) {
        const items = this._contextMenuProviders
            .flatMap((provider) => {
                try {
                    return provider() ?? [];
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "WorldClock: A context menu provider threw", error, false, false);
                    return [];
                }
            })
            .filter(Boolean);

        if (!items.length) return;

        event.preventDefault();
        event.stopPropagation();

        UIContextMenu.show({
            id: 'blacksmith-worldclock-menu',
            x: event.clientX,
            y: event.clientY,
            zones: items,
            zoneClass: 'gm'
        });
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

        const bounds = sky.getBoundingClientRect();
        if (!bounds.width) return;

        const phase = this._getPhase(this._getDayFraction(calendar, components));
        if (!(phase.length > 0)) return;

        const progress = Math.min(Math.max(phase.progress, 0), 1);
        const phaseSeconds = phase.length * secondsPerDay;

        // The absolute time this phase began. Working in absolute seconds rather than
        // an offset within today is what lets a night drag run past midnight into
        // tomorrow morning without the date needing a special case: the night simply
        // continues, and the clock rolls over on its own.
        const phaseStartTime = game.time.worldTime - (progress * phaseSeconds);

        // Where the pointer sits relative to the body's centre. Carried through the
        // whole gesture so that grabbing the sun by its edge does not snap it under
        // the cursor the moment the pointer first moves.
        const bodyCentre = bounds.left + (bounds.width * (this._arcXPercent(progress) / 100));
        const grabOffset = event.clientX - bodyCentre;

        event.preventDefault();
        event.stopPropagation();

        this._drag = {
            calendar, sky, section, secondsPerMinute,
            phaseStartTime, phaseSeconds, grabOffset,
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

        // Deliberately NOT painting here. Picking something up must not move it --
        // the previous version seeked to the click position on pointerdown, which is
        // the behaviour of a scrub bar, not of a thing you grab.
    }

    /**
     * Paint the dragged time without writing it anywhere.
     *
     * The pointer maps to progress along the CURRENT PHASE's arc, which is the same
     * mapping `_getArc` uses to place the body -- so the sun stays under the cursor
     * instead of chasing a different scale.
     *
     * Clamped to the phase, so the sun cannot be dragged into the night. That is a
     * deliberate limit rather than an omission: the sun and the moon are two bodies
     * on two arcs, and a gesture that silently swapped which one you were holding
     * would be a strange thing to hand someone. Crossing a horizon is what the step
     * arrows are for.
     *
     * Snapped to whole minutes. The panel maps a single pixel to something like ten
     * minutes of world time, so finer precision is noise the GM cannot aim at, and
     * unsnapped values produce times like 6:31:47 that read as broken rather than
     * precise.
     */
    static _updateDrag(event) {
        const drag = this._drag;
        if (!drag) return;

        const bounds = drag.sky.getBoundingClientRect();
        if (!bounds.width) return;

        const xPercent = ((event.clientX - drag.grabOffset - bounds.left) / bounds.width) * 100;
        const progress = this._arcProgressFromX(xPercent);

        const raw = drag.phaseStartTime + (progress * drag.phaseSeconds);
        drag.target = Math.round(raw / drag.secondsPerMinute) * drag.secondsPerMinute;

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
