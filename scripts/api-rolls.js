// ==================================================================
// ===== API-ROLLS – Public roll classification surface ============
// ==================================================================

import {
    classify,
    extractActiveD20,
    buildSkillCheckOutcome,
    outcomeVisibleToUser,
    messageRollVisibility,
    coerceDc
} from './utility-roll-classification.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/** Hook names emitted when roll outcomes are classified. */
export const ROLLS_HOOKS = {
    resolved: 'blacksmith.rolls.resolved',
    skillCheckResolved: 'blacksmith.rolls.skillCheckResolved',
    attackResolved: 'blacksmith.rolls.attackResolved',
    damageResolved: 'blacksmith.rolls.damageResolved',
    groupResolved: 'blacksmith.rolls.groupResolved'
};

/**
 * RollsAPI – classify roll meaning and subscribe to resolved outcomes.
 */
export class RollsAPI {
    static isAvailable() {
        return !!(typeof game !== 'undefined' && game?.modules?.get(MODULE_ID)?.api?.rolls);
    }

    /**
     * Classify what a roll meant: crit, fumble, success vs DC, hit/miss vs AC.
     * @param {Roll|ChatMessage|{ workflow: object, attackRoll?: Roll }} input
     * @param {object} [options]
     * @param {number} [options.dc] - DC for generic rolls or skill-check messages
     * @param {string} [options.tokenId] - Token id when classifying one row of a skill-check card
     * @param {'natural'|'system'} [options.critMode='natural']
     * @returns {object|null} Normalized outcome — see api-rolls.md
     */
    static classify(input, options = {}) {
        return classify(input, options);
    }

    /**
     * Open the roll window for one actor and resolve with the result.
     *
     * The card-free mode. Every other entry point into the roll pipeline is built
     * around a skill-check chat card -- `orchestrateRoll` requires an existing
     * message and throws without one -- so a consumer with its own place to put the
     * answer had nowhere to stand. This creates no chat message and updates none.
     *
     * The player still gets the full window: modifiers, named bonuses, advantage and
     * roll mode.
     *
     * ```js
     * const result = await api.rolls.promptRoll({ actor, value: 'sur', dc: 12, title: 'Foraging' });
     * if (result) console.log(result.roll.total);
     * ```
     *
     * @param {object} options See `promptRoll` in `manager-rolls.js`.
     * @returns {Promise<object|null>} Roll results, or null if closed without rolling.
     */
    static async promptRoll(options = {}) {
        const { promptRoll } = await import('./manager-rolls.js');
        return promptRoll(options);
    }

    /**
     * Show dice on screen for a roll you already made, posting nothing to chat.
     *
     * FOR ROLLS THAT LAND SOMEWHERE OTHER THAN A ROLL CARD. Foundry has no 3D dice of
     * its own -- Dice So Nice supplies them, and it normally fires off a chat message
     * being created. So the usual way to show a player their dice is to post a roll
     * card, and chat fills up with them: a party of five taking a short rest can bury
     * the card they are reading under twenty roll messages.
     *
     * This decouples the two. Roll however you like, animate the dice, and put the
     * result where it belongs. Honours the world's `Enable Dice So Nice` setting and
     * does nothing when the module is absent, so a caller never has to check.
     *
     * ```js
     * const rolls = await actor.rollHitDie({ denomination: 'd10' }, {}, { create: false });
     * await api.rolls.showDice(rolls);
     * ```
     *
     * @param {Roll|Roll[]} rolls One roll, or several to animate together.
     * @returns {Promise<boolean>} Whether anything was shown.
     */
    static async showDice(rolls) {
        const { showDiceAnimation } = await import('./api-core.js');
        return showDiceAnimation(rolls);
    }

    /** @param {Roll|object|null} rollOrResult @returns {number|null} */
    static extractActiveD20(rollOrResult) {
        return extractActiveD20(rollOrResult);
    }

    /**
     * Subscribe to roll outcome hooks. Returns a disposer function.
     * @param {'resolved'|'skillCheckResolved'|'attackResolved'|'damageResolved'|'groupResolved'} event
     * @param {Function} callback
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Function} disposer
     */
    static on(event, callback, options = {}) {
        const hookName = ROLLS_HOOKS[event] ?? event;
        const hookId = Hooks.on(hookName, callback);
        let active = true;
        const abortHandler = () => disposer();
        const disposer = () => {
            if (!active) return false;
            active = false;
            options.signal?.removeEventListener?.('abort', abortHandler);
            return Hooks.off(hookName, hookId);
        };
        if (options.signal?.aborted) disposer();
        else options.signal?.addEventListener?.('abort', abortHandler, { once: true });
        return disposer;
    }

    /**
     * Emit classified outcomes to hooks, respecting visibility per connected user.
     * Called internally when Blacksmith resolves a roll — not for consumer use.
     * @param {object} outcome
     * @param {object} [meta]
     */
    static emitResolved(outcome, meta = {}) {
        if (!outcome) return;

        const payload = { ...outcome, meta: { ts: Date.now(), ...meta } };

        if (game.user?.isGM || outcomeVisibleToUser(outcome, game.user)) {
            if (outcome.kind === 'damage') {
                // Damage application is not a roll: it fires ONLY its own
                // hook, keeping 'resolved' d20-shaped for existing consumers.
                Hooks.callAll(ROLLS_HOOKS.damageResolved, payload);
            } else {
                Hooks.callAll(ROLLS_HOOKS.resolved, payload);
                if (outcome.kind === 'skillCheck') {
                    Hooks.callAll(ROLLS_HOOKS.skillCheckResolved, payload);
                } else if (outcome.kind === 'attack') {
                    Hooks.callAll(ROLLS_HOOKS.attackResolved, payload);
                }
            }
        }

        if (outcome.groupRoll?.allComplete && game.user?.isGM) {
            Hooks.callAll(ROLLS_HOOKS.groupResolved, payload);
        }
    }

    /**
     * Build and emit a skill-check outcome for the actor who just rolled.
     * @internal
     */
    static emitSkillCheckRoll({ message, tokenId, result, flags }) {
        const actorEntry = (flags.actors ?? []).find((a) => a.id === tokenId);
        const isGroupRoll = !!(flags.isGroupRoll ?? flags.groupRoll);
        const outcome = buildSkillCheckOutcome({
            result,
            dc: coerceDc(flags.dc),
            rollType: flags.rollType ?? null,
            rollLabel: flags.rollTitle ?? flags.title ?? flags.skillName ?? null,
            actorId: actorEntry?.actorId ?? null,
            tokenId,
            messageId: message.id,
            isGroupRoll,
            groupRoll: isGroupRoll ? {
                success: flags.groupSuccess ?? null,
                successCount: flags.successCount ?? null,
                totalCount: flags.totalCount ?? null,
                allComplete: !!(flags.allRollsComplete ?? flags.allComplete)
            } : null,
            contestedRoll: flags.contestedRoll ?? null,
            visibility: messageRollVisibility(message)
        });
        RollsAPI.emitResolved(outcome, { trigger: 'skillCheckRoll', tokenId });
    }
}
