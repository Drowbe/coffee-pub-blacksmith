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
import { extractActiveD20, classifyCritFumble } from './utility-d20.js';

// Re-exported so no importer had to change when these moved. `blacksmith.js` and
// `manager-rolls.js` import them from here and should keep doing so -- a consumer
// should not have to know which file a function lives in.
export { extractActiveD20, classifyCritFumble };

// `extractActiveD20` and `classifyCritFumble` and their helpers MOVED to
// `utility-d20.js` on 2026-09-06, and are re-exported below so no importer changed.
//
// They had to leave: this file imports from `utility-midi-resolution.js`, so that
// module could never import back to reach them, and grew a second crit classifier
// instead -- one that stopped at a natural 20 while this one learned to read the
// threshold a roll declared. A leaf module both can import is what ends that.

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
    visibility = 'public'
}) {
    const dcNumber = coerceDc(dc);
    const d20 = extractActiveD20(result);
    const total = typeof result?.total === 'number' ? result.total : null;
    // `result` is passed as the roll so the system's own thresholds survive the trip
    // through a flag or a socket. See `classifyCritFumble`.
    const { isCritical, isFumble, critMode } = classifyCritFumble(d20, { roll: result });
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

    // No `critMode` here any more. It used to be threaded through every branch below
    // and every payload, and `classifyCritFumble` ignored it -- the crit rule is not a
    // caller's choice, it is whatever the roll itself declared. See that function.
    if (input instanceof ChatMessage || input?.documentName === 'ChatMessage' || input?.flags) {
        return _classifyChatMessage(input, options);
    }

    if (input.workflow) {
        return _classifyWorkflow(input, options);
    }

    if (input.terms || input.dice || typeof input.total === 'number') {
        return _classifyRollObject(input, options);
    }

    return null;
}

/**
 * Whether this chat message is an initiative roll.
 *
 * Core stamps `flags.core.initiativeRoll` on every initiative message it creates
 * (`client/documents/combat.mjs:411`); dnd5e additionally types its own. Both are
 * checked because either can be the one present, and neither is guaranteed by the
 * other. There is no flavour-text fallback here on purpose -- flavour is localized
 * and a table playing in another language would silently stop being announced.
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
function _isInitiativeMessage(message) {
    if (message?.flags?.core?.initiativeRoll === true) return true;
    return message?.flags?.dnd5e?.roll?.type === 'initiative';
}

/**
 * The combatant an initiative message belongs to.
 *
 * Core writes ONE message per combatant (`combat.mjs:380-413` loops over ids), so
 * this is a 1:1 lookup rather than a guess. Matched on the speaker's token first
 * and its actor second, because a scene can hold several tokens of one actor and
 * only the token identifies which of them rolled.
 *
 * @param {ChatMessage} message
 * @returns {Combatant|null}
 */
function _combatantForInitiativeMessage(message) {
    const tokenId = message?.speaker?.token ?? null;
    const actorId = message?.speaker?.actor ?? null;
    for (const combat of game.combats ?? []) {
        for (const combatant of combat.combatants ?? []) {
            if (tokenId && combatant.token?.id === tokenId) return combatant;
        }
    }
    if (!actorId) return null;
    for (const combat of game.combats ?? []) {
        for (const combatant of combat.combatants ?? []) {
            if (combatant.actor?.id === actorId) return combatant;
        }
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
            visibility: _messageVisibility(message)
        });
    }

    // Initiative, before the attack path: an initiative roll is a plain d20 with no
    // attack flags, so it would fall through to `resolveAttackMessage` and return
    // null. Recognised by core's own flag rather than by our own marker, since
    // core sets it on every initiative message it writes (`combat.mjs:411`).
    //
    // NOTE THE DELIBERATE OMISSION: this reports the roll and nothing about WHO
    // rolled it beyond ids. Any rule about which combatants a table cares about --
    // characters only, player-owned, everyone -- belongs to whatever consumes this,
    // never here. `classify()` feeds `blacksmith.rolls.*`, and a house rule folded
    // into it would leave the `initiative` kind reporting less than its name says,
    // with the next consumer inheriting one table's preference as a fact.
    if (_isInitiativeMessage(message)) {
        const initiativeRoll = message.rolls?.[0] ?? null;
        const initiativeD20 = extractActiveD20(initiativeRoll);
        // No d20 means a system or module rolled initiative on some other die. That
        // is legitimate, and there is no natural 20 to speak of, so report nothing
        // rather than guess.
        if (initiativeD20 == null) return null;
        const initiativeNat = classifyCritFumble(initiativeD20, { roll: initiativeRoll });
        const combatant = _combatantForInitiativeMessage(message);

        return {
            kind: 'initiative',
            source: 'core.initiative',
            d20: initiativeD20,
            total: typeof initiativeRoll?.total === 'number' ? initiativeRoll.total : null,
            isCritical: initiativeNat.isCritical,
            isFumble: initiativeNat.isFumble,
            // Initiative is not measured against a target number, so neither field
            // has an answer. Present and null beats absent: a consumer reading
            // `success` gets "not applicable" rather than "undefined property".
            success: null,
            dc: null,
            actorId: combatant?.actor?.id ?? message.speaker?.actor ?? null,
            tokenId: combatant?.token?.id ?? message.speaker?.token ?? null,
            combatantId: combatant?.id ?? null,
            combatId: combatant?.parent?.id ?? null,
            messageId: message.id,
            visibility: _messageVisibility(message),
            critMode: initiativeNat.critMode
        };
    }

    const attackEvent = resolveAttackMessage(message);
    if (!attackEvent) return null;

    const roll = message.rolls?.[0] ?? null;
    const d20 = extractActiveD20(roll);

    // ONE classifier, and it is ours.
    //
    // This used to also call `getCritFumbleFromWorkflow` and OR the two answers
    // together -- handing it a FABRICATED empty workflow, `{isCritical: false,
    // isFumble: false}`, because there is no workflow on this path and never was. It
    // was borrowing that function's d20 inspection, and the cost of the shortcut was
    // that Blacksmith's core dnd5e lane ran on a helper written for another product's
    // data shape. That is how the module came to hold two answers to "was that a
    // critical", one of which stopped at natural 20.
    //
    // `classifyCritFumble` now covers everything that call contributed and more: it
    // reads the same live-roll `isCritical`, and where the old helper fell through to
    // a bare nat-20 test it reads the threshold the roll actually declared. Nothing
    // was lost by dropping it, and the core lane no longer reaches into midi code.
    const nat = classifyCritFumble(d20, { roll });

    return {
        kind: 'attack',
        source: attackEvent.workflowId ? 'midi.attack' : 'dnd5e.attack',
        d20,
        total: attackEvent.attackTotal,
        isCritical: nat.isCritical,
        isFumble: nat.isFumble,
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
        critMode: nat.critMode,
        // Was the old helper's per-source breakdown. There is one source now, and
        // `critMode` already names it.
        critSources: null
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
        // The workflow stated this one, not our own threshold reading.
        critMode: 'workflow',
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
    const { isCritical, isFumble, critMode } = classifyCritFumble(d20, { roll });
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
        critMode
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
