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
import { getSettingSafely, playSound, postConsoleAndNotification, getPortraitImage } from './api-core.js';
import { broadcastToast, sendToastToUsers, ToastAPI } from './api-toast.js';

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
// Hurry-up banter, shared by the combat timer bar overlay (timer-combat.js)
// and the combat bar portrait menu (manager-combatbar.js) — previously
// duplicated verbatim at both sites.
const HURRY_MESSAGES = [
    "If you don't make a move soon, {name}, I'm rolling to adopt your turn as my new pet. I'll call it Procrastination Jr.",
    "{name}, your character isn't actually frozen in time, just your decision-making skills.",
    "By the time you pick, {name}, our torches will burn out, and we'll have to roleplay in the dark. No pressure.",
    "Hurry up, {name}, or I'm rolling a persuasion check to convince the DM to skip you!",
    "We're waiting, {name}, not writing a novel. Unless you are, in which case, finish Chapter 1 already!",
    "{name}, we're all aging in real-time here. Even the elf is starting to grow gray hairs.",
    "If you don't decide soon, {name}, I'm calling a bard to write a song about how long this turn took.",
    "{name}, at this rate, the dice are going to roll themselves out of sheer boredom.",
    "C'mon, {name}! Even a gelatinous cube moves faster than this.",
    "{name}, if this turn were a quest, we'd already have failed the time limit."
];

/**
 * Nudge the slow combatant per the notifyHurryUp channel setting.
 *
 * Two scopes (author decision 2026-07-24): 'direct' aims the toast half only
 * at the active non-GM users who own the combatant's actor (internal
 * sendToastToUsers relay), with a local confirmation toast for the sender —
 * the targeted toast is invisible to them; 'blast' broadcasts the billboard
 * to every connected client for the full table-razzing effect (the sender
 * sees it too, so no confirmation). Either way the toast is a small shaking
 * billboard with the nudge sound riding the payload. The chat half is the
 * public card-hurry-up.hbs banter with the table-wide sound. In 'both' mode
 * the toast carries no sound — the chat broadcast already covers everyone,
 * including the target. A direct toast falls back to the chat card when no
 * owner of the combatant is online, so the nudge always lands somewhere.
 * The toast wears the slow combatant's face (portrait, token-art fallback via
 * getPortraitImage; the rabbit icon covers actors with no image), while the
 * chat card keeps the rabbit in its header.
 * @param {string} targetName - The slow combatant's display name
 * @param {Actor|null} targetActor - The combatant's actor, used to resolve owning users
 * @param {string} [scope='direct'] - 'direct' (only the combatant's players) or 'blast' (everyone)
 */
export async function sendHurryUpNudge(targetName, targetActor, scope = 'direct') {
    try {
        const notifyMode = getSettingSafely(MODULE.ID, 'notifyHurryUp', 'both');
        if (notifyMode === 'none') return;

        const message = HURRY_MESSAGES[Math.floor(Math.random() * HURRY_MESSAGES.length)]
            .replace(/{name}/g, targetName);
        const sound = getSettingSafely(MODULE.ID, 'hurryUpSound', 'none');
        const soundPath = sound && sound !== 'none' && sound !== 'sound-none' ? sound : null;

        let sendChat = notifyMode === 'chat' || notifyMode === 'both';

        if (notifyMode === 'toast' || notifyMode === 'both') {
            const toastPayload = {
                title: 'HURRY UP!',
                subtitle: message,
                icon: 'fa-solid fa-rabbit-running',
                image: targetActor ? (getPortraitImage(targetActor) || null) : null,
                size: 'small',
                animation: 'shake',
                duration: 3,
                sound: sendChat ? null : soundPath,
                stackKey: 'blacksmith-hurry-up',
                moduleId: 'blacksmith-core'
            };
            if (scope === 'blast') {
                await broadcastToast(toastPayload);
            } else {
                const owners = targetActor
                    ? game.users.filter(u => u.active && !u.isGM
                        && (u.character?.id === targetActor.id || targetActor.testUserPermission(u, 'OWNER')))
                        .map(u => u.id)
                    : [];
                if (owners.length) {
                    await sendToastToUsers(toastPayload, owners);
                    ToastAPI.show({
                        title: `Nudge sent to ${targetName}`,
                        icon: 'fa-solid fa-rabbit-running',
                        duration: 3,
                        stackKey: 'blacksmith-hurry-up-confirm',
                        moduleId: 'blacksmith-core'
                    });
                } else if (notifyMode === 'toast') {
                    sendChat = true;
                }
            }
        }

        if (sendChat) {
            const html = await foundry.applications.handlebars.renderTemplate(
                `modules/${MODULE.ID}/templates/card-hurry-up.hbs`,
                { message }
            );
            // No style field: OTHER is the default, and CHAT_MESSAGE_TYPES is
            // deprecated in v12+ (renamed to CHAT_MESSAGE_STYLES).
            await ChatMessage.create({
                content: html,
                speaker: ChatMessage.getSpeaker({ alias: game.user?.name })
            });
            if (soundPath) {
                const volume = getSettingSafely(MODULE.ID, 'timerSoundVolume', 0.7);
                void playSound(soundPath, volume);
            }
        }
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Hurry Up: error sending nudge', error, false, false);
    }
}

export function routeTimerNotification(settingKey, timerLabel, stackKey, data) {
    const notifyMode = getSettingSafely(MODULE.ID, settingKey, 'toast');
    if (notifyMode === 'none') return false;

    if (notifyMode === 'toast' || notifyMode === 'both') {
        const content = timerToastContent(data);
        broadcastToast({
            title: `${timerLabel} Timer`,
            subtitle: content.subtitle,
            icon: content.icon,
            duration: 3,
            moduleId: 'blacksmith-core',
            stackKey: stackKey
        });
    }

    return notifyMode === 'chat' || notifyMode === 'both';
}
