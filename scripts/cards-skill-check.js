// ==================================================================
// ===== SKILL CHECK CARD COMPOSITION ===============================
// ==================================================================

/**
 * The skill check card, expressed as parts.
 *
 * Its own file rather than a corner of `cards-blacksmith.js` because it is the one
 * card in the suite that is genuinely interactive and genuinely per-reader: it is
 * rebuilt after every roll, it carries the buttons players click, and what it shows
 * differs by who is looking. That earns a file.
 *
 * PURE. `composeSkillCheckCard(data)` takes the message data and returns parts. It
 * reads no globals, posts nothing, and touches no DOM, so the harness can assert the
 * composition headlessly and so the same data always produces the same card. The
 * per-reader decisions are not made here at all -- they are expressed as veiled
 * values and resolved in each reader's own browser at render time.
 *
 * Parts and veiled values: `scripts/manager-chat-cards.js`.
 * Why visibility works this way: `documentation/plans/plan-card-visibility.md`.
 */

import { MODULE } from './const.js';
import { CARD_FLAG } from './api-chat-cards.js';
import { ChatCardsManager } from './manager-chat-cards.js';

/** The action a pending row fires. Registered in `blacksmith.js`. */
export const SKILL_CHECK_ROLL_ACTION = 'skill-check-roll';

/** The card type stamped on the message, for anything filtering by kind. */
export const SKILL_CHECK_CARD_TYPE = 'skill-check';

/**
 * How a roll mode decides who may read a result.
 *
 * `owner` covers the GM as well, because a GM owns every actor -- so one role says
 * "the GM and the player who rolled", which is exactly what a private roll means.
 *
 * This also repairs two defects in the template this replaced
 * (`templates/card-skill-check.hbs`, deleted). It compared `this.actorId` against
 * `requesterId`, but `requesterId` is a USER id (`window-skillcheck.js:1493`) and
 * `actorId` is an ACTOR id, so the comparison could never be true: `selfroll`
 * revealed to nobody at all, and `gmroll` collapsed to the GM-only branch. Neither
 * was visible from one client, because the whole thing was baked from the composer's
 * point of view anyway.
 */
const VEIL_BY_ROLL_MODE = {
    roll: null,
    gmroll: (actorId) => ({ readableBy: 'owner', actorId }),
    blindroll: () => ({ readableBy: 'gm' }),
    selfroll: () => ({ readableBy: 'author' })
};

/**
 * Wrap a total so only the entitled see it, or return it plainly for a public roll.
 * Unknown modes veil to the GM: a mode we do not recognise is not a reason to show
 * everyone everything.
 */
function veilTotal(total, rollMode, actorId) {
    const text = String(total ?? '');
    if (rollMode === 'roll') return text;
    const build = VEIL_BY_ROLL_MODE[rollMode] ?? (() => ({ readableBy: 'gm' }));
    return { value: text, ...build(actorId) };
}

/**
 * One actor's row: either an invitation to roll, or the result of having rolled.
 */
function actorRow(actor, data, isDefender) {
    const rollMode = data.rollMode || 'roll';

    // Not yet rolled. The whole row is the button -- an actor waiting to roll is a
    // thing you click, not a thing with a button beside it.
    if (!actor.result) {
        return {
            marker: 'fa-solid fa-dice-d20',
            label: actor.name,
            // NO `tone: 'pending'`. Pending is the loudest thing on this card, not the
            // quietest -- it is the one row you are meant to click. Toning it down
            // greyed the die and the name and made a live button read as disabled.
            clickable: true,
            moduleId: MODULE.ID,
            action: SKILL_CHECK_ROLL_ACTION,
            // Everything the roll needs, since the handler gets only this string.
            value: JSON.stringify({
                tokenId: actor.id,
                actorId: actor.actorId,
                type: (isDefender && data.defenderRollType) || data.rollType,
                value: (isDefender && data.defenderSkillAbbr) || data.skillAbbr,
                title: (isDefender && data.defenderSkillName) || data.rollTitle
            }),
            tooltip: `Roll ${(isDefender && data.defenderSkillName) || data.rollTitle} for ${actor.name}`
        };
    }

    const result = actor.result;
    const dc = data.dc;
    // A mark is reported only against a DC. With no DC there is no pass or fail to
    // report, so the row carries a total and nothing else.
    const passed = dc ? Number(result.total) >= Number(dc) : null;

    // Only a crit or a fumble fills the row. An ordinary pass or fail is reported by
    // the mark alone -- a list where every row is filled reports nothing, because
    // there is no longer a quiet row for a loud one to stand out against.
    const exceptional = Boolean(result.isCritical || result.isFumble);

    return {
        label: actor.name,
        trailing: veilTotal(result.total, rollMode, actor.actorId),
        trailingSize: 'large',
        trailingIcon: passed === null ? undefined
            : (passed ? 'fa-solid fa-check' : 'fa-solid fa-xmark'),
        tone: result.isCritical ? 'positive'
            : result.isFumble ? 'negative'
            : (passed === null ? undefined : (passed ? 'positive' : 'negative')),
        emphasis: exceptional,
        animation: result.isCritical ? 'shake-y' : result.isFumble ? 'shake-x' : undefined,
        tooltip: result.verboseFormula || result.formula || undefined
    };
}

/**
 * The banner across the top of a finished contest or group roll.
 * Returns null while the outcome is not yet decided, so the card simply does not
 * carry one until it means something.
 */
function outcomeBand(data) {
    if (data.hasMultipleGroups && data.contestedRoll) {
        const contest = data.contestedRoll;
        const scores = `${contest.group1Highest} vs ${contest.group2Highest}`;
        if (contest.isTie) {
            return { part: 'band', text: 'Stalemate', icon: 'fa-solid fa-shield-exclamation',
                     tone: 'info', size: 'large', tooltip: scores };
        }
        const challengersWon = contest.winningGroup === 1;
        return {
            part: 'band',
            text: challengersWon ? 'Challengers Win' : 'Defenders Win',
            icon: challengersWon ? 'fa-solid fa-swords' : 'fa-solid fa-shield-halved',
            tone: challengersWon ? 'positive' : 'negative',
            size: 'large',
            tooltip: scores
        };
    }

    // A group roll only reports once every member has rolled; a partial tally would
    // announce a failure that the last roll could still overturn.
    if (!data.hasMultipleGroups && data.isGroupRoll && data.dc && data.allRollsComplete) {
        return {
            part: 'band',
            text: data.groupSuccess ? 'Group Success' : 'Group Failure',
            tone: data.groupSuccess ? 'positive' : 'negative',
            size: 'large',
            tooltip: `${data.successCount}/${data.totalCount} succeeded`
        };
    }

    return null;
}

/**
 * Build the whole card.
 *
 * @param {object} data - the skill check message data (the module's own flags)
 * @returns {Array<object>} parts, ready for `chatCards.post` or `renderCard`
 */
export function composeSkillCheckCard(data = {}) {
    const parts = [];
    const contested = Boolean(data.hasMultipleGroups);
    const actors = Array.isArray(data.actors) ? data.actors : [];

    // --- Header -------------------------------------------------------------
    const defenderName = data.defenderSkillName || data.rollTitle;
    parts.push({
        part: 'header',
        icon: contested ? 'fa-solid fa-people-arrows' : 'fa-solid fa-dice-d20',
        title: data.label || (contested ? `${data.rollTitle} vs ${defenderName}` : data.rollTitle)
    });

    // --- Outcome, once there is one ----------------------------------------
    const band = outcomeBand(data);
    if (band) parts.push(band);

    // --- What was asked for -------------------------------------------------
    if (data.dc && data.showDC) {
        parts.push({
            part: 'band',
            text: `DC ${data.dc}${data.isGroupRoll ? ' Group Roll' : ''}`,
            quiet: true
        });
    }

    if (data.rollAdvantageLabel) {
        parts.push({
            part: 'notes',
            items: [{
                icon: data.lockRollAdvantage ? 'fa-solid fa-lock' : 'fa-solid fa-circle-info',
                text: `${data.rollAdvantageLabel} ${data.lockRollAdvantage ? 'required' : 'requested'}`
            }]
        });
    }

    // --- The rolls ----------------------------------------------------------
    const challengers = actors.filter((actor) => actor.group === 1);
    const defenders = actors.filter((actor) => actor.group === 2);

    parts.push({
        part: 'section',
        icon: contested ? 'fa-solid fa-swords' : 'fa-solid fa-dice-d20',
        label: contested ? 'Challengers' : 'Requested Rolls'
    });
    if (challengers.length) {
        parts.push({ part: 'rows', items: challengers.map((actor) => actorRow(actor, data, false)) });
    }

    if (contested) {
        parts.push({
            part: 'band',
            lead: data.skillName || data.rollTitle,
            text: 'VS',
            trail: defenderName,
            quiet: true
        });
        parts.push({ part: 'section', icon: 'fa-solid fa-shield-halved', label: 'Defenders' });
        if (defenders.length) {
            parts.push({ part: 'rows', items: defenders.map((actor) => actorRow(actor, data, true)) });
        }
    }

    // --- Why this roll was asked for ---------------------------------------
    if (data.explanation) {
        parts.push({ part: 'section', label: 'About this Roll' });
        parts.push({ part: 'prose', blocks: [{ type: 'paragraph', text: data.explanation }] });
    }

    if (data.skillDescription) {
        if (!data.explanation) parts.push({ part: 'section', label: 'About this Roll' });
        // Document-sourced: the skill description and its link are built from
        // compendium content and already carry markup, so they are enriched rather
        // than escaped. This is the one field on the card that is not consumer text.
        parts.push({
            part: 'richtext',
            html: data.skillLink ? `${data.skillDescription}<p>${data.skillLink}</p>` : data.skillDescription
        });
    }

    return parts;
}

/**
 * The card object stored on the message: composition plus identity.
 *
 * The same shape `chatCards.post` writes, built here so the roll flow can rebuild
 * it after every roll without going back through `post` (which would create a
 * second message rather than update this one).
 */
export function skillCheckCard(data, theme) {
    return {
        v: 1,
        moduleId: MODULE.ID,
        type: SKILL_CHECK_CARD_TYPE,
        theme: theme || ChatCardsManager.resolveThemeId(null),
        parts: composeSkillCheckCard(data)
    };
}

/**
 * Everything a `ChatMessage.create` or `.update` needs to carry this card.
 *
 * Returns `{ content, flags }`. The content is the BAKED snapshot -- rendered with
 * `baked: true`, so any veiled total is veiled in it whoever is composing, because
 * that one string is delivered to every client. The live per-reader render happens
 * on each client from the card flag, through the ordinary re-render path in
 * `blacksmith.js`; this is only what they see until it lands.
 *
 * `data` is stored alongside the card because the roll flow reads it back to
 * rebuild the composition after each roll. The card flag is the presentation; the
 * data flag is the state.
 */
export async function skillCheckMessageData(data, theme) {
    const card = skillCheckCard(data, theme);
    const content = await ChatCardsManager.renderCard(card, { baked: true });
    return {
        content,
        flags: {
            [MODULE.ID]: {
                ...data,
                [CARD_FLAG]: card,
                isCoffeePubCard: true
            }
        }
    };
}
