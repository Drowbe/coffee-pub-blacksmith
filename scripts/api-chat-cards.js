// ==================================================================
// ===== CHAT CARDS API =============================================
// ==================================================================

/**
 * Chat Cards API - post themed chat cards built from Blacksmith-owned parts.
 *
 * Consumers pass data and a composition of parts; Blacksmith renders and sends.
 * Consumers never write card HTML. The part library is closed: compose the
 * built-in parts, and ask for a new part rather than working around a missing
 * one. See `documentation/api/api-chatcards.md`.
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { ChatCardsManager, CHAT_CARD_THEMES, CARD_PARTS } from './manager-chat-cards.js';

// Re-exported so existing importers (settings.js) are unaffected by the move.
export { CHAT_CARD_THEMES, CARD_PARTS };

/** Flag key holding the re-renderable card payload. */
export const CARD_FLAG = 'card';

/** Payload schema version, so a future change can migrate rather than guess. */
const CARD_SCHEMA_VERSION = 1;

/**
 * Registered card actions, keyed `moduleId:action`. Populated at startup by
 * consumers; read on every client at render time.
 *
 * A ChatMessage is data on every client, so a callback cannot ride the document.
 * Handlers are resolved fresh on each render from this registry, which is why
 * buttons keep working after a browser reload and why a card whose module is
 * disabled degrades to an inert button rather than an error.
 */
const CARD_ACTIONS = new Map();

export class ChatCardsAPI {

    // ==============================================================
    // ===== POSTING ================================================
    // ==============================================================

    /**
     * Post a chat card.
     *
     * The card is stored twice: the composition and its data go into message
     * flags so the card can be re-rendered by a later Blacksmith (improve a part
     * and existing cards improve), and the rendered HTML is baked into `content`
     * so the card survives Blacksmith being absent and remains searchable.
     *
     * @param {object} options
     * @param {string} options.moduleId - Your module id. Required.
     * @param {Array<object>} options.parts - Composition, e.g. `[{ part: 'header', ... }]`. Required.
     * @param {string} [options.type] - Card type id, for your own identification.
     * @param {string} [options.theme] - Theme id; omit to use the world default.
     * @param {ClientDocument} [options.relativeTo] - Enrichment context for `@UUID` links.
     * @param {Array<string>} [options.whisper] - User ids; omit for a public card.
     * @param {object} [options.speaker] - Defaults to the current user.
     * @param {string} [options.rollMode] - Foundry roll mode.
     * @param {object} [options.flags] - Extra flags merged under your module id.
     * @returns {Promise<ChatMessage|null>} The created message, or null on failure.
     */
    static async post(options = {}) {
        const { moduleId, parts, type = null, theme = null, relativeTo = null,
                whisper, speaker, rollMode, flags = {} } = options;

        if (!moduleId) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | post() requires a moduleId', '', false, false);
            return null;
        }
        if (!Array.isArray(parts) || parts.length === 0) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | post() requires a non-empty parts array', String(moduleId), false, false);
            return null;
        }

        // The theme is resolved to a concrete id here, at post time. Storing the
        // world default rather than a sentinel is what lets a consumer pin a card
        // to a specific theme and have it stay that way.
        const card = {
            v: CARD_SCHEMA_VERSION,
            moduleId,
            type,
            theme: theme || ChatCardsManager.resolveThemeId(null),
            parts
        };

        const content = await ChatCardsManager.renderCard(card, relativeTo ? { relativeTo } : {});

        // Merged rather than built as one literal: when a Blacksmith card is posted
        // moduleId IS our own id, so a second key of the same name would replace the
        // card payload with the caller's flags and silently disable re-rendering.
        const messageFlags = { [MODULE.ID]: { [CARD_FLAG]: card } };
        if (flags && Object.keys(flags).length) {
            messageFlags[moduleId] = { ...(messageFlags[moduleId] ?? {}), ...flags };
        }

        const messageData = {
            content,
            speaker: speaker ?? ChatMessage.getSpeaker({ user: game.user.id }),
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            flags: messageFlags
        };
        if (whisper) messageData.whisper = whisper;
        if (rollMode) messageData.rollMode = rollMode;

        try {
            // Deliberately goes through ChatMessage.create rather than around it:
            // manager-libwrapper.js wraps that call to stamp Coffee Pub flags and
            // fire `preCoffeePubChatMessage`, and bypassing it would give
            // API-posted cards different flags than directly-posted ones.
            return await ChatMessage.create(messageData);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | post() failed', error?.message ?? error, false, false);
            return null;
        }
    }

    /**
     * Post a card using an announcement theme (dark background, light header).
     * Identical to `post` other than the default theme.
     * @param {object} options - As `post`; `theme` defaults to 'announcement-blue'.
     * @returns {Promise<ChatMessage|null>}
     */
    static async postAnnouncement(options = {}) {
        return this.post({ theme: 'announcement-blue', ...options });
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    /**
     * Register a handler for a card button. Call at startup, on every client --
     * not at post time, and not only on the GM.
     *
     * @param {string} moduleId - Your module id; namespaces the action.
     * @param {string} action - Action name, matching `action` on the button.
     * @param {(context: {message: ChatMessage, value: string|null, event: Event, button: HTMLElement}) => any} handler
     * @returns {boolean} Whether the registration was accepted.
     */
    static registerAction(moduleId, action, handler) {
        if (!moduleId || !action || typeof handler !== 'function') {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | registerAction requires moduleId, action, and a function', String(moduleId), false, false);
            return false;
        }
        CARD_ACTIONS.set(`${moduleId}:${action}`, handler);
        return true;
    }

    /**
     * Remove a registered action.
     * @param {string} moduleId
     * @param {string} action
     * @returns {boolean} Whether an action was removed.
     */
    static unregisterAction(moduleId, action) {
        return CARD_ACTIONS.delete(`${moduleId}:${action}`);
    }

    /**
     * Look up a registered handler.
     * @param {string} moduleId
     * @param {string} action
     * @returns {Function | undefined}
     */
    static getAction(moduleId, action) {
        return CARD_ACTIONS.get(`${moduleId}:${action}`);
    }

    /**
     * All registered action keys, for diagnostics.
     * @returns {Array<string>}
     */
    static getRegisteredActions() {
        return Array.from(CARD_ACTIONS.keys());
    }

    // ==============================================================
    // ===== PARTS ==================================================
    // ==============================================================

    /**
     * The part ids available to compose with. The library is closed: a module
     * cannot register a part, because that escape hatch is what reopens the
     * per-module drift this system exists to remove.
     * @returns {Array<string>}
     */
    static getParts() {
        return Object.keys(CARD_PARTS);
    }

    // ==============================================================
    // ===== THEMES =================================================
    // ==============================================================

    /**
     * Get available themes.
     * @param {string} [type] - Optional filter: 'card' or 'announcement'.
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getThemes(type = null) {
        const themes = [...CHAT_CARD_THEMES];
        return type ? themes.filter((t) => t.type === type) : themes;
    }

    /**
     * Theme choices for a Foundry settings dropdown.
     * @param {string} [type] - Optional filter: 'card' or 'announcement'.
     * @returns {Object<string, string>} Theme id to display name.
     */
    static getThemeChoices(type = null) {
        const choices = {};
        for (const theme of this.getThemes(type)) choices[theme.id] = theme.name;
        return choices;
    }

    /**
     * Get a theme by id.
     * @param {string} themeId
     * @returns {{id: string, name: string, className: string, type: string, description: string} | null}
     */
    static getTheme(themeId) {
        return CHAT_CARD_THEMES.find((t) => t.id === themeId) ?? null;
    }

    // ==============================================================
    // ===== THEME ACCESSORS PENDING SIBLING MIGRATION ==============
    // ==============================================================

    /**
     * These exist because sibling modules still call them while they build their
     * own card HTML. They are removed once every sibling has migrated to `post`
     * (step 7 in `documentation/TODO-GLOBAL.md`); nothing new should call them.
     * A consumer using `post` never needs a class name -- pass a theme id.
     */

    static getCardThemes() {
        return this.getThemes('card');
    }

    static getAnnouncementThemes() {
        return this.getThemes('announcement');
    }

    static getThemesByType(type) {
        return this.getThemes(type);
    }

    static getCardThemeChoices() {
        return this.getThemeChoices('card');
    }

    static getAnnouncementThemeChoices() {
        return this.getThemeChoices('announcement');
    }

    static getThemeChoicesWithClassNames(type = null) {
        const choices = {};
        for (const theme of this.getThemes(type)) choices[theme.className] = theme.name;
        return choices;
    }

    static getCardThemeChoicesWithClassNames() {
        return this.getThemeChoicesWithClassNames('card');
    }

    static getAnnouncementThemeChoicesWithClassNames() {
        return this.getThemeChoicesWithClassNames('announcement');
    }

    static getThemeClassName(themeId) {
        return this.getTheme(themeId)?.className ?? 'theme-default';
    }
}
