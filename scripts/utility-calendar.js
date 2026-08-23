// ==================================================================
// ===== UTILITY-CALENDAR - turning a date into a world time ========
// ==================================================================
//
// Two traps in Foundry's calendar API, both silent, both of which this
// module has already been bitten by. Everything here exists because of
// them; there is no other reason for this file.
//
// TRAP 1: `componentsToTime` IGNORES `month` AND `dayOfMonth`.
//
//   It reads `components.day`, which is the day of the YEAR
//   (client/data/calendar.mjs, `componentsToTime`: `totalDays +=
//   (components.day ?? 0)`). Passing a month and a day of the month is
//   not an error and does not throw -- the two fields are simply
//   dropped, and every date built that way lands on day zero of the
//   year. In a Harptos world that is Hammer 1, whatever date you asked
//   for. dnd5e's own `jumpToDate` converts before calling, which is
//   the tell that the base method expects a converted value.
//
// TRAP 2: `components.year` IS NOT THE YEAR ANYONE SEES.
//
//   The displayed year is `components.year + calendar.years.yearZero`.
//   Showing the raw component in a field labelled "Year" puts a number
//   the reader does not recognise on screen, and reading that field
//   back as a year silently shifts the date by yearZero.
//
// Both directions are needed, so both are here. Use these rather than
// calling `componentsToTime` directly with a month.
//
// ==================================================================

/**
 * Whether a year is a leap year in this calendar.
 *
 * `isLeapYear` is optional on a calendar, so a calendar without it has no leap
 * years rather than throwing.
 */
export function isLeapYear(calendar, year) {
    return typeof calendar?.isLeapYear === 'function' ? !!calendar.isLeapYear(year) : false;
}

/**
 * How many days a month has, honouring leap years.
 *
 * `leapDays` is optional per month -- a calendar may declare it on one month and
 * leave the rest -- so the fallback is the ordinary length rather than zero.
 */
export function daysInMonth(calendar, year, monthIndex) {
    const month = calendar?.months?.values?.[monthIndex];
    if (!month) return 0;
    return isLeapYear(calendar, year) ? (month.leapDays ?? month.days) : month.days;
}

/**
 * A month and a day within it, as a day of the year.
 *
 * The conversion `componentsToTime` does not do. Same walk dnd5e's `jumpToDate`
 * performs before it calls core.
 *
 * @param {number} year internal year, not the displayed one
 * @param {number} monthIndex zero-based
 * @param {number} dayIndex zero-based day within the month
 * @returns {number} zero-based day within the year
 */
export function dayOfYear(calendar, year, monthIndex, dayIndex) {
    let total = Number(dayIndex) || 0;
    const months = calendar?.months?.values ?? [];
    for (let index = 0; index < monthIndex && index < months.length; index++) {
        total += daysInMonth(calendar, year, index);
    }
    return total;
}

/**
 * A calendar date as a world time.
 *
 * Takes the date the way a person writes one -- a month and a day within it --
 * and hands core the day of the year it actually wants.
 *
 * @param {object} date
 * @param {number} date.year internal year, not the displayed one. See `toInternalYear`.
 * @param {number} date.month zero-based month index
 * @param {number} date.dayOfMonth zero-based day within the month
 * @param {number} [date.hour]
 * @param {number} [date.minute]
 * @param {number} [date.second]
 * @returns {number|null} world time in seconds, or null if the calendar cannot express it
 */
export function timeFromDate(calendar, { year, month = 0, dayOfMonth = 0, hour = 0, minute = 0, second = 0 } = {}) {
    if (!calendar || !Number.isFinite(year)) return null;
    try {
        const time = calendar.componentsToTime({
            year,
            day: dayOfYear(calendar, year, month, dayOfMonth),
            hour,
            minute,
            second
        });
        return Number.isFinite(time) ? time : null;
    } catch (_) {
        return null;
    }
}

/** The year a reader recognises, from the year a component carries. */
export function toDisplayYear(calendar, year) {
    return (Number(year) || 0) + (Number(calendar?.years?.yearZero) || 0);
}

/** The year a component carries, from the year a reader typed. */
export function toInternalYear(calendar, year) {
    return (Number(year) || 0) - (Number(calendar?.years?.yearZero) || 0);
}
