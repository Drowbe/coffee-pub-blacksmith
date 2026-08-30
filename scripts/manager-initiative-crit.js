// ==================================================================
// ===== INITIATIVE CRIT ANNOUNCEMENT ===============================
// ==================================================================
//
// A natural 20 on initiative is a house rule at this table -- the player gets to
// move someone on the turn order as a reward -- and a reward nobody notices is
// not a reward. This announces it.
//
// **It is a consumer of `blacksmith.rolls.initiativeResolved`, not a detector.**
// The detection lives in `utility-roll-classification.js` and reports every
// initiative roll it sees, including monsters and summons. Everything about which
// of those this table cares about lives here, behind settings, because it is a
// preference and not a fact about initiative. A sibling subscribing to the same
// hook is entitled to a different answer.
//
// **The scope rule is `actor.type === 'character'` by default, deliberately, and
// NOT `hasPlayerOwner`.** The two diverge exactly where this feature was raised:
// a player's summoned NPCs are player-owned, so `hasPlayerOwner` would hand a
// player a stack move for a berserker. A sheet type is a fact; ownership is a
// guess about intent. The other two scopes exist as settings so a table wanting
// summons or monsters included does not have to patch code for it.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, getPortraitImage } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { ROLLS_HOOKS } from './api-rolls.js';
import { broadcastToast, registerToastChannel } from './api-toast.js';
import { ChatCardsAPI } from './api-chat-cards.js';

/** Announcement channel, so a GM can silence just this without silencing toasts. */
const CHANNEL = 'initiative-crit';

export class InitiativeCritManager {
    static _initialized = false;

    /**
     * Declare the toast channel.
     *
     * At IMPORT time, not from `initialize()`. Foundry renders settings in
     * registration order and this module's section headings are settings
     * themselves, so a channel declared during `ready` gets its checkbox at the
     * bottom of the page under whichever heading happens to be last. Declaring
     * here puts it in Notifications where it belongs -- the reasoning is
     * `api-toast.js:56-73`, which is worth reading before moving this call.
     */
    static registerChannel() {
        registerToastChannel(CHANNEL, {
            moduleId: MODULE.ID,
            label: 'Critical Initiative',
            description: 'Announces a natural 20 on an initiative roll.'
        });
    }

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        HookManager.registerHook({
            name: ROLLS_HOOKS.initiativeResolved,
            description: 'Initiative: announce a natural 20 on an initiative roll',
            context: 'initiative-crit',
            priority: 3,
            callback: (payload) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                void InitiativeCritManager.onInitiativeResolved(payload);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        postConsoleAndNotification(MODULE.NAME, 'Initiative: crit announcement initialized', '', true, false);
    }

    /**
     * Whether this outcome should be announced at all.
     *
     * Three gates, in the order that costs least: the feature switch, the roll
     * actually being a critical, and the scope. Kept separate from the announcing
     * so the decision is readable on its own and testable without a toast.
     */
    static shouldAnnounce(outcome) {
        if (!getSettingSafely(MODULE.ID, 'initiativeCritAnnounce', true)) return false;
        if (!outcome?.isCritical) return false;

        // A blind or private roll is private for a reason, and announcing it to
        // every client would be the leak the roll mode exists to prevent. Core
        // switches hidden combatants to a private roll on its own
        // (`client/documents/combat.mjs`), so this is reachable without anyone
        // choosing it deliberately.
        if (outcome.visibility && outcome.visibility !== 'public') return false;

        return this.isInScope(outcome);
    }

    /**
     * Whether the combatant that rolled falls inside the configured scope.
     *
     * Resolved from the actor rather than from the combatant, because a combatant
     * whose token has since been deleted still names its actor, and an
     * announcement is worth making even if the token is already gone.
     */
    static isInScope(outcome) {
        const scope = getSettingSafely(MODULE.ID, 'initiativeCritScope', 'character');
        if (scope === 'all') return true;

        const actor = this._resolveActor(outcome);
        if (!actor) return false;

        if (scope === 'playerOwned') return actor.hasPlayerOwner === true;
        return actor.type === 'character';
    }

    /** The actor behind an outcome, by token first and actor id second. */
    static _resolveActor(outcome) {
        if (outcome?.combatantId && outcome?.combatId) {
            const combatant = game.combats?.get(outcome.combatId)?.combatants?.get(outcome.combatantId);
            if (combatant?.actor) return combatant.actor;
        }
        if (outcome?.tokenId) {
            const token = canvas?.tokens?.get(outcome.tokenId);
            if (token?.actor) return token.actor;
        }
        return outcome?.actorId ? (game.actors?.get(outcome.actorId) ?? null) : null;
    }

    /**
     * Announce, in whichever forms the GM has chosen.
     *
     * Only the active GM announces. The hook fires on every client that can see
     * the roll, and `broadcastToast` reaches everyone, so without this guard a
     * table of five would see five toasts.
     */
    static async onInitiativeResolved(payload) {
        try {
            if (!game.users?.activeGM?.isSelf) return;
            if (!this.shouldAnnounce(payload)) return;

            const actor = this._resolveActor(payload);
            const combatant = payload?.combatantId && payload?.combatId
                ? game.combats?.get(payload.combatId)?.combatants?.get(payload.combatantId)
                : null;
            const name = combatant?.name ?? actor?.name ?? 'Someone';

            const presentation = getSettingSafely(MODULE.ID, 'initiativeCritPresentation', 'toast');
            if (presentation === 'toast' || presentation === 'both') await this._announceToast(name, actor);
            if (presentation === 'card' || presentation === 'both') await this._announceCard(name, actor);

            postConsoleAndNotification(MODULE.NAME, `Initiative: critical announced for ${name}`, '', true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Initiative: error announcing a critical', error?.message || error, false, false);
        }
    }

    /** The toast half. Channelled so it can be silenced on its own. */
    static async _announceToast(name, actor) {
        await broadcastToast({
            title: `${name} rolled a critical initiative`,
            subtitle: 'Move any combatant on the turn order',
            icon: 'fa-solid fa-burst',
            image: actor ? (getPortraitImage(actor) || null) : null,
            duration: 6,
            // Replaces rather than stacks: everyone rolls initiative at once, and two
            // criticals in one round should not push the first off the top of a pile.
            stackKey: 'blacksmith-initiative-crit',
            channel: CHANNEL,
            moduleId: 'blacksmith-core'
        });
    }

    /**
     * The chat-card half, for tables that want it in the log rather than in passing.
     *
     * Built from PARTS through `ChatCardsAPI.post`, not from hand-written HTML. The
     * parts system exists precisely so cards look like each other and improve
     * together, and a manager writing its own markup is the consumer-zero failure
     * this repo keeps finding -- a sibling would be told to use the API while we
     * quietly did not. Prose text is escaped by the renderer, so the name is passed
     * as data rather than interpolated.
     */
    static async _announceCard(name, actor) {
        const parts = [
            { part: 'header', icon: 'fa-solid fa-burst', title: 'Critical Initiative' }
        ];

        const img = actor ? (getPortraitImage(actor) || null) : null;
        if (img || name) parts.push({ part: 'identity', img, name: { literal: name } });

        parts.push({
            part: 'prose',
            blocks: [{ type: 'paragraph', text: `${name} rolled a natural 20 on initiative and may move any combatant on the turn order.` }]
        });

        await ChatCardsAPI.post({
            moduleId: MODULE.ID,
            type: 'initiative-crit',
            parts
        });
    }
}

// Declared on import so the channel's checkbox lands in Notifications. See registerChannel().
InitiativeCritManager.registerChannel();
