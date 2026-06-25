import { MODULE } from './const.js';

/** @typedef {'none'|'duration'|'specificTime'} SessionTimerDefaultMode */

export const SESSION_TIMER_DEFAULT_MODES = {
    NONE: 'none',
    DURATION: 'duration',
    SPECIFIC_TIME: 'specificTime'
};

/**
 * Half-hour end-time options for session timer (00:00–23:30).
 * @returns {{ value: string, label: string, hour24: number, minute: number }[]}
 */
export function getSessionEndTimeOptions() {
    const options = [];
    for (let hour24 = 0; hour24 < 24; hour24++) {
        for (const minute of [0, 30]) {
            const value = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            options.push({
                value,
                label: formatSessionEndTimeLabel(hour24, minute),
                hour24,
                minute
            });
        }
    }
    return options;
}

/**
 * Foundry settings `choices` object for sessionTimerSpecificTime.
 * @returns {Record<string, string>}
 */
export function getSessionEndTimeChoicesObject() {
    return Object.fromEntries(
        getSessionEndTimeOptions().map((opt) => [opt.value, opt.label])
    );
}

/**
 * @param {number} hour24
 * @param {number} minute
 * @returns {string}
 */
export function formatSessionEndTimeLabel(hour24, minute) {
    const hour12 = ((hour24 + 11) % 12) + 1;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * @param {string} endTimeValue - "HH:MM" 24-hour
 * @returns {string}
 */
export function formatSessionEndTimeValue(endTimeValue) {
    const parsed = parseSessionEndTimeValue(endTimeValue);
    if (!parsed) return endTimeValue || 'Not set';
    return formatSessionEndTimeLabel(parsed.hour24, parsed.minute);
}

/**
 * @param {string} endTimeValue
 * @returns {{ hour24: number, minute: number }|null}
 */
export function parseSessionEndTimeValue(endTimeValue) {
    if (!endTimeValue || typeof endTimeValue !== 'string') return null;
    const [hh, mm] = endTimeValue.split(':').map((n) => parseInt(n, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || (mm !== 0 && mm !== 30)) return null;
    return { hour24: hh, minute: mm };
}

/**
 * End-of-session timestamp for today (rolls to tomorrow if already past).
 * @param {string} endTimeValue - "HH:MM" 24-hour
 * @param {number} [nowMs=Date.now()]
 * @returns {number|null}
 */
export function endTimestampFromTimeValue(endTimeValue, nowMs = Date.now()) {
    const parsed = parseSessionEndTimeValue(endTimeValue);
    if (!parsed) return null;

    const end = new Date(nowMs);
    end.setHours(parsed.hour24, parsed.minute, 0, 0);
    if (end.getTime() <= nowMs) {
        end.setDate(end.getDate() + 1);
    }
    return end.getTime();
}

/**
 * Localized labels for sessionTimerDefaultMode setting.
 * @returns {Record<SessionTimerDefaultMode, string>}
 */
export function getSessionTimerDefaultModeChoices() {
    return {
        [SESSION_TIMER_DEFAULT_MODES.NONE]: game.i18n.localize(`${MODULE.ID}.sessionTimerDefaultMode-none`),
        [SESSION_TIMER_DEFAULT_MODES.DURATION]: game.i18n.localize(`${MODULE.ID}.sessionTimerDefaultMode-duration`),
        [SESSION_TIMER_DEFAULT_MODES.SPECIFIC_TIME]: game.i18n.localize(`${MODULE.ID}.sessionTimerDefaultMode-specificTime`)
    };
}
