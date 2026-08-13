// ==================================================================
// ===== BLACKSMITH CARD COMPOSITIONS ===============================
// ==================================================================

/**
 * Blacksmith's own chat cards, expressed as compositions of parts.
 *
 * A card that only one caller posts can be composed at its call site; this file
 * is for the ones more than one caller needs, so the card is defined once and
 * every caller gets the same thing. The combat and planning timers posting
 * subtly different versions of the same timer card is the failure this prevents.
 *
 * Parts and the posting API: `scripts/manager-chat-cards.js`, `scripts/api-chat-cards.js`.
 */

import { MODULE } from './const.js';
import { ChatCardsAPI } from './api-chat-cards.js';

/**
 * The seven timer states, in the order the timers move through them. Each entry
 * gives the header icon, the title suffix, and how the body sentence is built
 * from the data the timer supplies.
 */
const TIMER_STATES = [
    {
        flag: 'isTimerSet',
        icon: 'fas fa-clock',
        title: (label) => `${label} Timer Updated`,
        body: (label, data) => `${label} timer has been set to ${data.timeString}.`
    },
    {
        flag: 'isTimerStart',
        icon: 'fas fa-hourglass-start',
        title: (label) => `${label} Started`,
        body: (label, data) => data.duration
            ? `The ${label} phase has begun! You have ${data.duration} to make your moves and take your actions.`
            : `The ${label} phase has begun!`
    },
    {
        flag: 'isTimerPaused',
        icon: 'fas fa-pause',
        title: (label) => `${label} Paused`,
        body: (label, data) => `The ${label} timer has been paused with ${data.timeRemaining} remaining in your turn.`
    },
    {
        flag: 'isTimerResumed',
        icon: 'fas fa-play',
        title: (label) => `${label} Resumed`,
        body: (label, data) => `The ${label} timer has resumed with ${data.timeRemaining} remaining in your turn.`
    },
    {
        flag: 'isTimerWarning',
        icon: 'fas fa-exclamation-triangle',
        title: (label) => `${label} Warning`,
        body: (_label, data) => data.warningMessage
    },
    {
        flag: 'isTimerExpiringSoon',
        icon: 'fas fa-exclamation-circle',
        title: (label) => `${label} Ending Soon`,
        body: (_label, data) => data.expiringSoonMessage
    },
    {
        flag: 'isTimerExpired',
        icon: 'fas fa-stopwatch',
        title: (label) => `${label} Ended`,
        body: (_label, data) => data.expiredMessage
    }
];

/** Theme per state, matching what the old template chose. */
function timerTheme(data) {
    if (data.isTimerWarning) return 'orange';
    if (data.isTimerExpired) return 'red';
    if (data.isTimerStart || data.isTimerSet) return 'blue';
    return 'default';
}

/**
 * Post a timer state card. Shared by the combat and planning timers.
 *
 * @param {string} timerLabel - e.g. 'Combat', 'Planning'.
 * @param {object} data - One `isTimer*` flag set true, plus that state's fields.
 * @param {User} [gmUser] - Speaker; defaults to the current user.
 * @returns {Promise<ChatMessage|null>}
 */
export async function postTimerCard(timerLabel, data = {}, gmUser = null) {
    const state = TIMER_STATES.find((s) => data[s.flag]);
    if (!state) return null;

    const body = state.body(timerLabel, data);
    if (!body) return null;

    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'timer',
        theme: timerTheme(data),
        parts: [
            { part: 'header', icon: state.icon, title: state.title(timerLabel) },
            { part: 'prose', blocks: [{ type: 'paragraph', text: body }] }
        ],
        speaker: { alias: gmUser?.name ?? game.user?.name }
    });
}

/**
 * Post a movement-mode card. Four callers post this: a manual mode change, the
 * marching order for conga and follow, and the automatic swaps at combat start
 * and combat end.
 *
 * @param {object} options
 * @param {string} options.icon - Movement type icon.
 * @param {string} options.label - Movement type name.
 * @param {string|Array<string>} options.description - Body paragraph(s).
 * @param {Array<{position: string|number, name: string, isDimmed?: boolean}>} [options.marchingOrder]
 * @param {string} [options.spacingText] - Token spacing note, shown under the order.
 * @returns {Promise<ChatMessage|null>}
 */
export async function postMovementCard({ icon, label, description, marchingOrder = null, spacingText = '' } = {}) {
    const paragraphs = Array.isArray(description) ? description : [description];
    const blocks = paragraphs.filter(Boolean).map((text) => ({ type: 'paragraph', text }));

    if (marchingOrder?.length) {
        blocks.push({
            type: 'table',
            rows: marchingOrder.map((entry) => [String(entry.position), entry.name])
        });
        if (spacingText) blocks.push({ type: 'paragraph', text: `Keep about ${spacingText} between tokens.` });
    }

    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'movement-change',
        parts: [
            { part: 'header', icon: `fa-solid ${icon}`, title: `${label} Mode Active` },
            { part: 'prose', blocks }
        ]
    });
}

/**
 * Post a plain notice: a header and one or more paragraphs. The most common card
 * shape in the suite -- planning phase changes, loot drops, missed turns, nudges.
 *
 * @param {object} options
 * @param {string} options.icon - Font Awesome classes for the header icon.
 * @param {string} options.title - Header title.
 * @param {string|Array<string>} options.text - One paragraph, or several.
 * @param {string} [options.theme] - Theme id; omit for the world default.
 * @param {Array<string>} [options.whisper] - User ids; omit for a public card.
 * @param {object} [options.speaker]
 * @returns {Promise<ChatMessage|null>}
 */
export async function postNotice({ icon, title, text, theme = null, whisper, speaker } = {}) {
    const paragraphs = Array.isArray(text) ? text : [text];

    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'notice',
        theme,
        parts: [
            { part: 'header', icon, title },
            { part: 'prose', blocks: paragraphs.filter(Boolean).map((t) => ({ type: 'paragraph', text: t })) }
        ],
        whisper,
        speaker
    });
}
