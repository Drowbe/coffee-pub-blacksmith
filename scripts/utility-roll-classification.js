/**
 * Shared roll outcome classification for Blacksmith and sibling modules.
 *
 * Consolidates d20 extraction and crit/fumble/success semantics that were
 * previously duplicated in manager-rolls.js, blacksmith.js, utility-message-resolution.js,
 * and utility-midi-resolution.js.
 */

import { resolveAttackMessage } from './utility-message-resolution.js';
import {
    buildAttackEventFromWorkflow,
    getCritFumbleFromWorkflow
} from './utility-midi-resolution.js';

/**
 * Extract the active (kept) d20 face from a Foundry Roll, plain roll result, or ChatMessage roll data.
 * Handles advantage/disadvantage (kh/kl) the same way across all call sites.
 * @param {Roll|object|null} rollOrResult
 * @returns {number|null}
 */
export function extractActiveD20(rollOrResult) {
    if (!rollOrResult || typeof rollOrResult !== 'object') return null;

    const terms = rollOrResult.terms ?? rollOrResult.roll?.terms;
    if (Array.isArray(terms)) {
        for (const term of terms) {
            const d20 = _extractD20FromDieResults(term?.results, term?.modifiers, term?.class, term?.faces);
            if (d20 !== null) return d20;
        }
    }

    const dice = rollOrResult.dice ?? rollOrResult.roll?.dice;
    if (Array.isArray(dice)) {
        for (const die of dice) {
            const d20 = _extractD20FromDieResults(die?.results, die?.modifiers, die?.class, die?.faces);
            if (d20 !== null) return d20;
        }
    }

    return null;
}

/**
 * @param {Array|undefined} results
 * @param {Array|undefined} modifiers
 * @param {string|undefined} termClass
 * @param {number|undefined} faces
 * @returns {number|null}
 */
function _extractD20FromDieResults(results, modifiers, termClass, faces) {
    const isD20 = termClass === 'D20Die' || (termClass === 'Die' && faces === 20) || faces === 20;
    if (!isD20 || !Array.isArray(results) || results.length === 0) return null;

    if (results.length === 2) {
        const activeResult = results.find((r) => r?.active === true);
        if (activeResult) return activeResult.result ?? null;
        const isDisadvantage = Array.isArray(modifiers) && modifiers.includes('kl');
        return isDisadvantage
            ? results[0]?.result ?? null
            : results[results.length - 1]?.result ?? null;
    }

    return results[0]?.result ?? null;
}

/**
 * Classify nat-20 / nat-1 crit and fumble from an active d20 face.
 * @param {number|null} d20
 * @param {object} [options]
 * @param {'natural'|'system'} [options.critMode='natural'] - `system` reads dnd5e crit range when available
 * @returns {{ isCritical: boolean, isFumble: boolean, critMode: string }}
 */
export function classifyCritFumble(d20, options = {}) {
    const critMode = options.critMode ?? 'natural';
    if (typeof d20 !== 'number') {
        return { isCritical: false, isFumble: false, critMode };
    }

    if (critMode === 'system') {
        const range = _getSystemCritRange();
        const isCritical = d20 >= range[0] && d20 <= range[1];
        const isFumble = d20 === 1;
        return { isCritical, isFumble, critMode };
    }

    return {
        isCritical: d20 === 20,
        isFumble: d20 === 1,
        critMode
    };
}

/**
 * @returns {[number, number]}
 */
function _getSystemCritRange() {
    try {
        const range = CONFIG?.DND5E?.critical?.threshold ?? game?.settings?.get('dnd5e', 'criticalThreshold');
        if (typeof range === 'number') return [range, 20];
        if (Array.isArray(range) && range.length >= 2) return [range[0], range[1]];
    } catch (_) { /* settings may be unavailable */ }
    return [20, 20];
}

/**
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export function coerceDc(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Build a normalized skill-check outcome from a Blacksmith request-roll result.
 * @param {object} params
 * @returns {object}
 */
export function buildSkillCheckOutcome({
    result,
    dc = null,
    rollType = null,
    rollLabel = null,
    actorId = null,
    tokenId = null,
    messageId = null,
    isGroupRoll = false,
    groupRoll = null,
    contestedRoll = null,
    visibility = 'public',
    critMode = 'natural'
}) {
    const dcNumber = coerceDc(dc);
    const d20 = extractActiveD20(result);
    const total = typeof result?.total === 'number' ? result.total : null;
    const { isCritical, isFumble } = classifyCritFumble(d20, { critMode });
    const success = (typeof total === 'number' && dcNumber !== null) ? total >= dcNumber : null;

    return {
        kind: 'skillCheck',
        source: 'blacksmith.requestRoll',
        d20,
        total,
        isCritical,
        isFumble,
        success,
        dc: dcNumber,
        rollType,
        rollLabel,
        actorId,
        tokenId,
        messageId,
        isGroupRoll: !!isGroupRoll,
        groupRoll: groupRoll ?? null,
        contestedRoll: contestedRoll ?? null,
        visibility,
        critMode
    };
}

/**
 * Build a normalized attack outcome from a chat message or MIDI workflow wrapper.
 * @param {ChatMessage|{ workflow: object, attackRoll?: Roll }} input
 * @param {object} [options]
 * @returns {object|null}
 */
export function classify(input, options = {}) {
    if (!input) return null;

    const critMode = options.critMode ?? 'natural';

    if (input instanceof ChatMessage || input?.documentName === 'ChatMessage' || input?.flags) {
        return _classifyChatMessage(input, { critMode, ...options });
    }

    if (input.workflow) {
        return _classifyWorkflow(input, { critMode, ...options });
    }

    if (input.terms || input.dice || typeof input.total === 'number') {
        return _classifyRollObject(input, { critMode, ...options });
    }

    return null;
}

/**
 * @param {ChatMessage} message
 * @param {object} options
 * @returns {object|null}
 */
function _classifyChatMessage(message, options) {
    const flags = message.flags?.['coffee-pub-blacksmith'];
    if (flags?.type === 'skillCheck') {
        const actorEntry = options.tokenId
            ? (flags.actors ?? []).find((a) => a.id === options.tokenId)
            : (flags.actors ?? []).find((a) => a.result);
        const result = actorEntry?.result ?? null;
        return buildSkillCheckOutcome({
            result,
            dc: coerceDc(flags.dc ?? options.dc),
            rollType: flags.rollType ?? null,
            rollLabel: flags.rollTitle ?? flags.title ?? flags.skillName ?? null,
            actorId: actorEntry?.actorId ?? null,
            tokenId: actorEntry?.id ?? options.tokenId ?? null,
            messageId: message.id,
            isGroupRoll: !!flags.isGroupRoll,
            groupRoll: flags.groupSuccess != null ? {
                success: flags.groupSuccess,
                successCount: flags.successCount,
                totalCount: flags.totalCount,
                allComplete: flags.allRollsComplete
            } : null,
            contestedRoll: flags.contestedRoll ?? null,
            visibility: _messageVisibility(message),
            critMode: options.critMode
        });
    }

    const attackEvent = resolveAttackMessage(message);
    if (!attackEvent) return null;

    const roll = message.rolls?.[0] ?? null;
    const d20 = extractActiveD20(roll);
    const wf = getCritFumbleFromWorkflow({
        workflow: { isCritical: false, isFumble: false },
        attackRoll: roll
    });
    const nat = classifyCritFumble(d20, { critMode: options.critMode });

    return {
        kind: 'attack',
        source: attackEvent.workflowId ? 'midi.attack' : 'dnd5e.attack',
        d20,
        total: attackEvent.attackTotal,
        isCritical: wf.isCritical || nat.isCritical,
        isFumble: wf.isFumble || nat.isFumble,
        success: attackEvent.hitTargets?.length > 0 ? true : (attackEvent.missTargets?.length > 0 ? false : null),
        dc: null,
        actorId: attackEvent.attackerActorId,
        tokenId: null,
        messageId: message.id,
        targets: attackEvent.targets,
        hitTargets: attackEvent.hitTargets,
        missTargets: attackEvent.missTargets,
        unknownTargets: attackEvent.unknownTargets,
        itemUuid: attackEvent.itemUuid,
        visibility: _messageVisibility(message),
        critMode: options.critMode,
        critSources: wf.sources
    };
}

/**
 * @param {{ workflow: object, attackRoll?: Roll }} input
 * @param {object} options
 * @returns {object|null}
 */
function _classifyWorkflow(input, options) {
    const { workflow, attackRoll = workflow?.attackRoll ?? null } = input;
    const attackEvent = buildAttackEventFromWorkflow(workflow);
    const { isCritical, isFumble, sources } = getCritFumbleFromWorkflow({ workflow, attackRoll });
    const d20 = extractActiveD20(attackRoll);

    return {
        kind: 'attack',
        source: 'midi.workflow',
        d20,
        total: typeof attackRoll?.total === 'number' ? attackRoll.total : attackEvent?.attackTotal ?? null,
        isCritical,
        isFumble,
        success: attackEvent?.hitTargets?.length ? true : (attackEvent?.missTargets?.length ? false : null),
        dc: null,
        actorId: attackEvent?.attackerActorId ?? workflow?.actor?.id ?? null,
        tokenId: null,
        messageId: workflow?.itemCardId ?? workflow?.chatMessageId ?? null,
        targets: attackEvent?.targets ?? [],
        hitTargets: attackEvent?.hitTargets ?? [],
        missTargets: attackEvent?.missTargets ?? [],
        unknownTargets: attackEvent?.unknownTargets ?? [],
        itemUuid: attackEvent?.itemUuid ?? null,
        visibility: 'public',
        critMode: options.critMode,
        critSources: sources
    };
}

/**
 * @param {Roll|object} roll
 * @param {object} options
 * @returns {object}
 */
function _classifyRollObject(roll, options) {
    const d20 = extractActiveD20(roll);
    const total = typeof roll.total === 'number' ? roll.total : null;
    const { isCritical, isFumble } = classifyCritFumble(d20, { critMode: options.critMode });
    const dc = typeof options.dc === 'number' ? options.dc : null;
    const success = (typeof total === 'number' && dc !== null) ? total >= dc : null;

    return {
        kind: 'roll',
        source: 'foundry.roll',
        d20,
        total,
        isCritical: isCritical || !!roll.isCritical || !!roll.options?.critical,
        isFumble: isFumble || !!roll.isFumble || !!roll.options?.fumble,
        success,
        dc,
        actorId: options.actorId ?? null,
        tokenId: options.tokenId ?? null,
        messageId: options.messageId ?? null,
        visibility: options.visibility ?? 'public',
        critMode: options.critMode
    };
}

/**
 * @param {ChatMessage} message
 * @returns {'public'|'private'|'blind'|'self'}
 */
export function messageRollVisibility(message) {
    return _messageVisibility(message);
}

/**
 * @param {ChatMessage} message
 * @returns {'public'|'private'|'blind'|'self'}
 */
function _messageVisibility(message) {
    const whisper = message.whisper ?? [];
    if (whisper.length === 0) return 'public';
    if (whisper.includes('GM') && whisper.length === 1) return 'self';
    if (message.blind) return 'blind';
    return 'private';
}

/**
 * Whether an outcome may be broadcast to the current user (respects roll visibility).
 * @param {object} outcome
 * @param {User} [user=game.user]
 * @returns {boolean}
 */
export function outcomeVisibleToUser(outcome, user = game.user) {
    if (!outcome) return false;
    const visibility = outcome.visibility ?? 'public';
    if (visibility === 'public') return true;
    if (user?.isGM) return true;
    if (visibility === 'self') return false;
    if (visibility === 'blind') return false;
    return false;
}
