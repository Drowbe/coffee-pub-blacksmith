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

/**
 * Per-client render passes, keyed by module id.
 *
 * Client-side and transient like the actions above, for the same reason: what a
 * card looks like to YOU cannot travel with the message.
 */
const CARD_RENDER_PASSES = new Map();

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

        // `baked: true` marks this as the SNAPSHOT render -- the copy stored on the
        // message and shown by every client until its own re-render lands. Any veiled
        // value renders veiled here regardless of who is posting, because this one
        // string is delivered to everybody. See mayRead() in manager-chat-cards.js.
        const content = await ChatCardsManager.renderCard(card, relativeTo ? { relativeTo, baked: true } : { baked: true });

        // Caller flags first, the card payload stamped LAST so it always wins. When a
        // Blacksmith card is posted the caller's moduleId IS our own, so the two share
        // a namespace and whichever is spread second decides. A caller passing its own
        // `card` key -- deliberately or by handing back flags it read off a message --
        // would otherwise replace the composition and silently disable re-rendering.
        // See update(), where exactly that shipped.
        const messageFlags = {};
        if (flags && Object.keys(flags).length) {
            messageFlags[moduleId] = { ...flags };
        }
        messageFlags[MODULE.ID] = { ...(messageFlags[MODULE.ID] ?? {}), [CARD_FLAG]: card };

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
     * Rebuild a posted card from a new composition.
     *
     * For state that belongs to the card rather than to the reader: a spent button
     * retiring to a stamp, a pick counter counting down, a row that has been
     * treated. That state has to survive a refresh and read identically on every
     * client, which is what makes it a property of the message and not something a
     * render pass can carry. Use `registerRenderPass` for what depends on WHO IS
     * LOOKING; use this for what has actually changed.
     *
     * CONTENT AND FLAGS ARE REWRITTEN TOGETHER, and that is the whole point of the
     * method. A card lives in two places -- the composition in flags, which every
     * Blacksmith client re-renders from, and the baked HTML in `content`, which is
     * what chat search, exports, and any client without Blacksmith actually see.
     * Updating the flag alone leaves `content` frozen at post time, so the stored
     * message and the table permanently disagree. That is not hypothetical: it
     * shipped, because this method did not exist and writing the flag directly was
     * the only way through.
     *
     * The theme is NOT re-resolved unless you pass one. A card pinned to a theme at
     * post time stays pinned; re-resolving the world default on every update is how
     * a pinned card silently reverts.
     *
     * Requires permission to update the message -- checked here so the failure is a
     * readable warning rather than a rejected socket call. In practice that means
     * the GM or the message's author, so route updates through whoever owns the
     * card rather than having every client attempt one.
     *
     * @param {ChatMessage|string} message - The message, or its id.
     * @param {object} options
     * @param {Array<object>} options.parts - The new composition. Required.
     * @param {string} [options.theme] - Omit to keep the card's current theme.
     * @param {ClientDocument} [options.relativeTo] - Enrichment context for `@UUID` links.
     * @param {object} [options.flags] - Extra flags merged under the card's own module id.
     * @returns {Promise<ChatMessage|null>} The updated message, or null on failure.
     */
    static async update(message, options = {}) {
        const { parts, theme = null, relativeTo = null, flags = {} } = options;

        const doc = (typeof message === 'string') ? game.messages?.get(message) : message;
        if (!doc) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | update() requires a ChatMessage', String(message), false, false);
            return null;
        }
        if (!Array.isArray(parts) || parts.length === 0) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | update() requires a non-empty parts array', doc.id, false, false);
            return null;
        }

        // Read through getCard so a non-card message is rejected here rather than
        // producing a message with a card flag and unrelated baked content.
        const existing = this.getCard(doc);
        if (!existing) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | update() called on a message that is not a parts card', doc.id, false, false);
            return null;
        }

        if (!doc.canUserModify(game.user, 'update')) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | update() denied: no permission to modify this message', doc.id, false, false);
            return null;
        }

        // Identity carries over: a card does not change owner or type by being
        // updated, and `v` is the schema the payload was written against.
        const card = {
            ...existing,
            theme: theme || existing.theme,
            parts
        };

        const content = await ChatCardsManager.renderCard(card, relativeTo ? { relativeTo, baked: true } : { baked: true });

        // THE CARD PAYLOAD IS STAMPED LAST AND ALWAYS WINS.
        //
        // A caller that derives its flags from the message -- which every
        // update-in-place flow does, since the state it is updating lives there --
        // hands back a `card` key holding the composition as it was BEFORE this
        // change. Spread caller flags over the card and that stale copy silently
        // replaces the composition just rendered: `content` updates, the flag does
        // not, and every client's re-render puts the old card back a tick later.
        //
        // That shipped, and it is what stopped skill check results appearing on the
        // card. The symptom is the worst kind -- the write succeeds, no error is
        // logged, and the stored message and the baked HTML disagree.
        const messageFlags = {};
        if (flags && Object.keys(flags).length) {
            messageFlags[card.moduleId] = { ...flags };
        }
        messageFlags[MODULE.ID] = { ...(messageFlags[MODULE.ID] ?? {}), [CARD_FLAG]: card };

        try {
            return await doc.update({ content, flags: messageFlags });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | update() failed', error?.message ?? error, false, false);
            return null;
        }
    }

    /**
     * The composition stored on a message, or null if it is not a parts card.
     *
     * Returned as a DEEP CLONE, so the read-splice-write cycle this exists for
     * cannot mutate the document's live flags by accident -- an in-place edit would
     * appear to work on the editing client and change nothing anywhere else.
     *
     * @param {ChatMessage|string} message - The message, or its id.
     * @returns {{v: number, moduleId: string, type: string|null, theme: string, parts: Array<object>} | null}
     */
    static getCard(message) {
        const doc = (typeof message === 'string') ? game.messages?.get(message) : message;
        const card = doc?.flags?.[MODULE.ID]?.[CARD_FLAG] ?? null;
        if (!card || !Array.isArray(card.parts)) return null;
        return foundry.utils.deepClone(card);
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

    // ==============================================================
    // ===== RENDER PASSES ==========================================
    // ==============================================================

    /**
     * Register a pass that decorates a rendered card for THIS reader.
     *
     * For the things a composition cannot express, because they depend on who is
     * looking: which row is your own vote, which characters you may roll for,
     * which label is truncated on this screen at this width. A composition is
     * written once and read by everybody; these are decided per client.
     *
     * WHY THIS EXISTS RATHER THAN A `renderChatMessageHTML` HOOK. A parts card
     * re-renders from its stored composition a tick after Foundry paints it, and
     * that swap REPLACES the card element. Anything a hook decorated is on the old
     * element and is silently discarded -- markup that looked right for a frame and
     * then reverted. That cost two bugs before this existed: vote cards never
     * showing the reader their own vote, and skill check rows never dimming.
     * Passes registered here run after the initial paint AND after every re-render.
     *
     * A pass must be idempotent: it can run more than once on the same card.
     *
     * Named as well as namespaced, because one module has more than one: Blacksmith
     * alone dims skill check rows and marks vote choices, and keying by module id
     * would have let the second silently replace the first.
     *
     * @param {string} moduleId - Your module id; namespaces the pass.
     * @param {string} name - Distinguishes your passes from each other.
     * @param {(context: {message: ChatMessage, card: object, root: HTMLElement}) => void} handler
     * @returns {boolean} Whether the registration was accepted.
     */
    static registerRenderPass(moduleId, name, handler) {
        if (!moduleId || !name || typeof handler !== 'function') {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | registerRenderPass requires moduleId, name, and a function', String(moduleId), false, false);
            return false;
        }
        CARD_RENDER_PASSES.set(`${moduleId}:${name}`, handler);
        return true;
    }

    /**
     * Remove a registered render pass.
     * @param {string} moduleId
     * @param {string} name
     * @returns {boolean} Whether a pass was removed.
     */
    static unregisterRenderPass(moduleId, name) {
        return CARD_RENDER_PASSES.delete(`${moduleId}:${name}`);
    }

    /**
     * Run every registered pass over a freshly rendered card.
     *
     * One pass throwing must not stop the others, and must never leave the card
     * unusable -- decoration is the least important thing on it.
     *
     * @param {ChatMessage} message
     * @param {HTMLElement} root - the `.blacksmith-card` element
     */
    static applyRenderPasses(message, root) {
        if (!root) return;
        const card = message?.flags?.[MODULE.ID]?.card ?? null;
        for (const [key, handler] of CARD_RENDER_PASSES) {
            try {
                handler({ message, card, root });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Chat Cards | render pass "${key}" threw`, error?.message ?? error, false, false);
            }
        }
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
     * @param {string} [type] - Optional filter. Every theme is currently type 'card'.
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getThemes(type = null) {
        const themes = [...CHAT_CARD_THEMES];
        return type ? themes.filter((t) => t.type === type) : themes;
    }

    /**
     * Theme choices for a Foundry settings dropdown.
     * @param {string} [type] - Optional filter. Every theme is currently type 'card'.
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

    static getThemesByType(type) {
        return this.getThemes(type);
    }

    static getCardThemeChoices() {
        return this.getThemeChoices('card');
    }

    static getThemeChoicesWithClassNames(type = null) {
        const choices = {};
        for (const theme of this.getThemes(type)) choices[theme.className] = theme.name;
        return choices;
    }

    static getCardThemeChoicesWithClassNames() {
        return this.getThemeChoicesWithClassNames('card');
    }

    static getThemeClassName(themeId) {
        return this.getTheme(themeId)?.className ?? 'theme-default';
    }
}
