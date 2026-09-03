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
 * Classify crit and fumble for a d20 roll. **This is Blacksmith's single answer to
 * "was that a critical", and every consumer in the suite takes it from here.**
 *
 * THE SYSTEM'S THRESHOLD WINS WHEREVER THE SYSTEM STATED ONE.
 *
 * dnd5e settles this per roll, not globally: `D20Roll#isCritical` reads
 * `d20.isCriticalSuccess`, which is `total >= options.criticalSuccess`, and
 * `criticalSuccess` is stamped onto the die from the activity's `criticalThreshold`
 * when the roll is built (`dnd5e.mjs:78912`, `78678`, `28489`; dnd5e 5.3.3). That is
 * how a Champion's Improved Critical, a weapon property, or anything else that widens
 * the range actually reaches a roll -- so a nat-20-only test is simply wrong for those
 * characters, and silently so: it reports an ordinary hit and nobody sees a bug.
 *
 * This used to offer a `critMode: 'system'` that read `CONFIG.DND5E.critical.threshold`
 * -- a GLOBAL, which is not where a character's threshold lives, so it would not have
 * fixed the Champion even if anything had asked for it. Nothing did: every caller took
 * the `'natural'` default, so the branch was dead code standing in for a feature that
 * was never implemented. Both are gone.
 *
 * Three sources, in order of authority:
 *   1. A live `Roll` that answers `isCritical`/`isFumble` -- dnd5e has already applied
 *      the character's real thresholds, so we do not second-guess it.
 *   2. A SERIALIZED roll, from a flag or a socket, whose d20 term still carries
 *      `options.criticalSuccess`/`criticalFailure`. Most rolls reach us this way, so
 *      without this step the system's answer would be lost in transit for the majority
 *      of call sites and only live-object callers would get it right.
 *   3. Natural 20 / natural 1, when the roll stated no threshold at all.
 *
 * @param {number|null} d20 - The active d20 face, from `extractActiveD20`.
 * @param {object} [options]
 * @param {Roll|object|null} [options.roll] - The roll the face came from, live or
 *   serialized. Pass it whenever you have it; without it only rule 3 can apply.
 * @returns {{ isCritical: boolean, isFumble: boolean, critMode: 'system'|'natural' }}
 */
export function classifyCritFumble(d20, options = {}) {
    const fromSystem = _systemCritFumble(options.roll, d20);
    if (fromSystem) return { ...fromSystem, critMode: 'system' };

    if (typeof d20 !== 'number') {
        return { isCritical: false, isFumble: false, critMode: 'natural' };
    }

    return {
        isCritical: d20 === 20,
        isFumble: d20 === 1,
        critMode: 'natural'
    };
}

/**
 * dnd5e's own verdict for this roll, or null if it did not give one.
 *
 * Defensive throughout. This reads the SYSTEM rather than a module -- dnd5e is part of
 * the baseline Blacksmith is required to work on -- but a roll object can arrive in any
 * state, including mid-evaluation, and an unusable one must degrade to the natural
 * rule rather than throw. dnd5e returns `undefined` from these getters for a roll that
 * is not evaluated or not valid, so only an actual boolean is accepted.
 *
 * @param {Roll|object|null} roll
 * @param {number|null} d20
 * @returns {{ isCritical: boolean, isFumble: boolean }|null}
 */
function _systemCritFumble(roll, d20) {
    if (!roll || typeof roll !== 'object') return null;

    try {
        // 1. A live dnd5e roll has already done this work with the real thresholds.
        if (typeof roll.isCritical === 'boolean' && typeof roll.isFumble === 'boolean') {
            return { isCritical: roll.isCritical, isFumble: roll.isFumble };
        }

        // 2. A serialized one still carries the thresholds on its d20 term. Compare
        //    against the same active face `extractActiveD20` picked, so advantage and
        //    disadvantage are honoured identically on both paths.
        if (typeof d20 !== 'number') return null;
        const thresholds = _d20Thresholds(roll);
        if (!thresholds) return null;

        const { criticalSuccess, criticalFailure } = thresholds;
        return {
            isCritical: Number.isFinite(criticalSuccess) ? d20 >= criticalSuccess : d20 === 20,
            isFumble: Number.isFinite(criticalFailure) ? d20 <= criticalFailure : d20 === 1
        };
    } catch (_) {
        return null;
    }
}

/**
 * The crit thresholds stamped on a serialized roll's d20 term, or null if it carries
 * none. Walks `terms` then `dice`, matching `extractActiveD20` so the two never
 * disagree about which term is the d20.
 *
 * @param {object} roll
 * @returns {{ criticalSuccess: number|null, criticalFailure: number|null }|null}
 */
function _d20Thresholds(roll) {
    const candidates = [
        ...(Array.isArray(roll.terms) ? roll.terms : []),
        ...(Array.isArray(roll.roll?.terms) ? roll.roll.terms : []),
        ...(Array.isArray(roll.dice) ? roll.dice : []),
        ...(Array.isArray(roll.roll?.dice) ? roll.roll.dice : [])
    ];

    for (const term of candidates) {
        const isD20 = term?.class === 'D20Die'
            || (term?.class === 'Die' && term?.faces === 20)
            || term?.faces === 20;
        if (!isD20) continue;

        const criticalSuccess = Number(term?.options?.criticalSuccess);
        const criticalFailure = Number(term?.options?.criticalFailure);
        if (!Number.isFinite(criticalSuccess) && !Number.isFinite(criticalFailure)) continue;

        return {
            criticalSuccess: Number.isFinite(criticalSuccess) ? criticalSuccess : null,
            criticalFailure: Number.isFinite(criticalFailure) ? criticalFailure : null
        };
    }

    return null;
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
