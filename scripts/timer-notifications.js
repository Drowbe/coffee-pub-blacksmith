// ==================================================================
// ===== TIMER-NOTIFICATIONS.JS =====================================
// ==================================================================
// Shared channel routing for the three timer announcement helpers
// (session: api-menubar.js sendTimerMessage; planning: timer-planning.js
// sendChatMessage; combat: timer-combat.js sendChatMessage).
//
// The Notifications settings section decides WHERE a timer message goes
// (toast / chat / both / none); each timer's own section still decides
// WHICH message kinds fire at all (pause, warning, etc.) — those toggles
// gate the calls before they reach this router.
//
// The toast half uses broadcastToast(): the timer helpers run on the GM
// client (the chat card used to be the transport to players), so the
// toast is relayed to every client over the existing socket.

import { MODULE } from './const.js';
import { getSettingSafely } from './api-core.js';
import { broadcastToast } from './api-toast.js';

/**
 * Map a timer message payload (the flags the three sendChatMessage helpers
 * already receive) to toast content. Fields arrive pre-formatting: duration
 * is whole minutes, timeRemaining/timeString are "m:ss" strings.
 * @private
 */
function timerToastContent(data) {
    if (data.isTimerWarning) {
        return { subtitle: data.warningMessage || 'Time is running out.', icon: 'fa-solid fa-hourglass-half' };
    }
    if (data.isTimerExpiringSoon) {
        return { subtitle: data.expiringSoonMessage || 'Time is almost up.', icon: 'fa-solid fa-hourglass-half' };
    }
    if (data.isTimerExpired) {
        return { subtitle: data.expiredMessage || 'Time is up.', icon: 'fa-solid fa-hourglass-end' };
    }
    if (data.isTimerSet) {
        return { subtitle: `Timer set to ${data.timeString}.`, icon: 'fa-solid fa-hourglass-start' };
    }
    if (data.isTimerStart || data.isPlanningStart) {
        return { subtitle: `Timer started: ${data.duration} minute${data.duration === 1 ? '' : 's'}.`, icon: 'fa-solid fa-hourglass-start' };
    }
    if (data.isTimerPaused || data.isPlanningPaused) {
        return { subtitle: `Paused with ${data.timeRemaining} remaining.`, icon: 'fa-solid fa-pause' };
    }
    if (data.isTimerResumed || data.isPlanningResumed) {
        return { subtitle: `Resumed with ${data.timeRemaining} remaining.`, icon: 'fa-solid fa-play' };
    }
    return { subtitle: '', icon: 'fa-solid fa-hourglass' };
}

/**
 * Route a timer announcement per its Notifications channel setting. Shows and
 * broadcasts the toast half itself; the caller keeps ownership of the chat card.
 * @param {string} settingKey - Channel setting (notifySessionTimer / notifyPlanningTimer / notifyCombatTimer)
 * @param {string} timerLabel - Display label ("Session", "Planning", "Turn") — "Timer" is appended
 * @param {string} stackKey - Toast stackKey so rapid updates from one timer replace, not stack
 * @param {Object} data - The message payload the timer helper received, pre-formatting
 * @returns {boolean} - True when the caller should also post its chat card
 */
export function routeTimerNotification(settingKey, timerLabel, stackKey, data) {
    const notifyMode = getSettingSafely(MODULE.ID, settingKey, 'toast');
    if (notifyMode === 'none') return false;

    if (notifyMode === 'toast' || notifyMode === 'both') {
        const content = timerToastContent(data);
        broadcastToast({
            title: `${timerLabel} Timer`,
            subtitle: content.subtitle,
            icon: content.icon,
            duration: 8,
            moduleId: 'blacksmith-core',
            stackKey: stackKey
        });
    }

    return notifyMode === 'chat' || notifyMode === 'both';
}
