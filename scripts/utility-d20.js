/**
 * d20 outcome primitives: which face was kept, and whether it was a critical.
 *
 * A LEAF MODULE, AND THAT IS THE POINT. It imports nothing, so anything may import it.
 * These functions lived in `utility-roll-classification.js`, which imports from
 * `utility-midi-resolution.js` -- so the midi lane could not reach them, and grew its
 * own crit reasoning instead. Blacksmith then held TWO answers to "was that a
 * critical", and when the threshold-aware one was fixed on 2026-09-03 the other kept
 * stopping at a natural 20. Splitting the primitives out is what lets both lanes ask
 * the same question.
 *
 * `utility-roll-classification.js` re-exports everything here, so existing importers
 * are unaffected and no consumer has to know a function moved.
 */

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
 * `critMode` on the result REPORTS which rule was applied, and is not an input. The
 * values, which consumers may read off the `blacksmith.rolls.*` payload:
 *
 *   'declared'  the roll stated a threshold and we used it (rules 1 and 2)
 *   'natural'   the roll stated none, so natural 20 / natural 1
 *   'workflow'  set elsewhere, where the verdict came from a midi-qol workflow
 *
 * It is `'declared'` rather than `'system'` deliberately. The deleted INPUT option was
 * called `critMode: 'system'`, and reusing that word for an output value read as the
 * option having survived -- it misled a consuming module's session on first contact
 * (2026-09-05), which is reason enough not to keep it.
 *
 * @returns {{ isCritical: boolean, isFumble: boolean, critMode: 'declared'|'natural' }}
 */
export function classifyCritFumble(d20, options = {}) {
    const fromSystem = _systemCritFumble(options.roll, d20);
    if (fromSystem) return { ...fromSystem, critMode: 'declared' };

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
