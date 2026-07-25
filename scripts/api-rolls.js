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

    /** @param {Roll|object|null} rollOrResult @returns {number|null} */
    static extractActiveD20(rollOrResult) {
        return extractActiveD20(rollOrResult);
    }

    /**
     * Subscribe to roll outcome hooks. Returns a disposer function.
     * @param {'resolved'|'skillCheckResolved'|'attackResolved'|'groupResolved'} event
     * @param {Function} callback
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Function} disposer
     */
    static on(event, callback, options = {}) {
        const hookName = ROLLS_HOOKS[event] ?? event;
        Hooks.on(hookName, callback);
        const disposer = () => Hooks.off(hookName, callback);
        if (options.signal) {
            options.signal.addEventListener('abort', disposer, { once: true });
        }
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
            Hooks.callAll(ROLLS_HOOKS.resolved, payload);
            if (outcome.kind === 'skillCheck') {
                Hooks.callAll(ROLLS_HOOKS.skillCheckResolved, payload);
            } else if (outcome.kind === 'attack') {
                Hooks.callAll(ROLLS_HOOKS.attackResolved, payload);
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
