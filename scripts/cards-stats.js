// ==================================================================
// ===== COMBAT STATS CARD COMPOSITION ==============================
// ==================================================================

/**
 * The round and combat statistics card, expressed as parts.
 *
 * ONE card where there were eight templates and four chat messages.
 *
 * The eight were four shapes -- summary, MVP, notable moments, party breakdown --
 * written twice, once for a round and once for a combat, and the two copies differed
 * only in a label and which data object they read. Each shape also posted its OWN
 * ChatMessage, so a round ending with every setting on dropped four cards into chat
 * and a ten-round fight produced forty messages. That was the actual problem; no
 * amount of redesigning one card touched it.
 *
 * What survives on the card is the headline: three party totals, who the MVP was,
 * and how the party divided the work. Notable moments and the full per-actor
 * breakdown are a table, and a chat card is the wrong shape for a table -- they live
 * in the stats window, which already existed and is already reachable, and which the
 * card now offers a button to.
 *
 * PURE, like `cards-skill-check.js`: state in, parts out, no globals and no DOM, so
 * the harness asserts it without a combat having to happen.
 */

import { MODULE } from './const.js';

/** Opens the stats window. Registered in `blacksmith.js`. */
export const STATS_DETAILS_ACTION = 'stats-view-details';

/**
 * The damage ratio bar: how much of a participant's activity was dealing rather
 * than taking. Ten equal segments, red through green, with a marker at the
 * measured position -- the shape the breakdown card has always used, expressed as
 * a gauge instead of eleven hand-written divs.
 */
function ratioBar(participant) {
    // No `part: 'gauge'` key: a subject takes the gauge's CONFIG on its `gauge`
    // field and builds the part itself (manager-chat-cards.js:486). Passing a
    // ready-made part under `bar` is silently ignored, which renders the subject
    // compact with no bar at all and no error anywhere.
    //
    // A GRADIENT, not segments. The ten-tick version came from the card this
    // replaced, and ten ticks imply ten meaningful steps when the underlying number
    // is continuous -- a reader counts them looking for a scale that is not there.
    // Three stops say the same thing without inviting the question.
    //
    // No flanking icons either. They labelled the ends of a bar whose ends are
    // already obvious from its colour, and in a list of six they were six pairs of
    // decoration competing with six portraits.
    return {
        min: 0,
        max: 100,
        midpoint: 50,
        stops: [
            { at: 0,   color: 'rgba(160, 38, 27, 0.75)' },
            { at: 50,  color: 'rgba(186, 162, 92, 0.75)' },
            { at: 100, color: 'rgba(58, 138, 67, 0.75)' }
        ],
        // What the bar MEANS, since red-to-green alone does not say which end is
        // which. On the whole part rather than per stop: a gradient has no discrete
        // bands to attach a meaning to.
        tooltip: 'Left: damage taken. Right: damage dealt.',
        markers: [{
            at: Math.max(0, Math.min(100, Number(participant.damageRatioGreen) || 0)),
            tooltip: `${Math.round(Number(participant.damageRatioGreen) || 0)}% of activity was damage dealt`
        }]
    };
}

/**
 * How long a turn took, in the shape the stats cards have always shown it.
 *
 * Duplicated rather than imported from `CombatStats._formatTime` on purpose: this
 * module is pure so the harness can assert it, and reaching into the stats tracker
 * would drag Foundry's globals in behind it. Six lines is a cheaper price than that.
 */
function formatDuration(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    const seconds = value > 1000 ? Math.round(value / 1000) : Math.round(value);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * One participant: rank, portrait, name, MVP share, and the ratio bar beneath.
 *
 * A `subject` rather than a `row` because a row cannot hold a bar -- and a subject
 * is exactly the part that was asked for: an image on the left, a title with an
 * optional right-aligned value, and a gauge under it.
 *
 * The right-aligned value is DAMAGE DEALT, which is the magnitude the bar cannot
 * show. The gauge reports what SHARE of a participant's activity was dealing rather
 * than taking; it says nothing about how much. An 80% bar beside "4 hp" and beside
 * "112 hp" are very different rounds and were indistinguishable without this.
 *
 * It was briefly the MVP score as a percentage of the leader's. That number is
 * readable but not useful: it ranks people the badge has already ranked, and a
 * reader cannot act on "67% of the best". The raw score is worse still -- it is a
 * weighted sum whose weights are settings (stats-mvp.js:118), so "1.2" answers
 * nothing. Both stay in the tooltip, where a curious reader can find them.
 */
function participantSubject(participant, rank) {
    const dealt = Number(participant.damage?.dealt) || 0;
    const score = Number(participant.score);
    const detail = [
        Number.isFinite(score) ? `MVP score ${score}` : null,
        `${Number(participant.damage?.taken) || 0} hp taken`,
        formatDuration(participant.turnDuration)
            ? `turn took ${formatDuration(participant.turnDuration)}`
            : null
    ].filter(Boolean).join(' - ');

    return {
        part: 'subject',
        index: rank,
        img: participant.tokenImg,
        title: participant.name,
        value: `${dealt} hp`,
        tooltip: detail || undefined,
        gauge: ratioBar(participant)
    };
}

/**
 * Build the card.
 *
 * @param {object} data - the template data the stats collector already assembles
 * @param {'round'|'combat'} scope - which of the two this is
 * @returns {Array<object>} parts, ready for `chatCards.post`
 */
export function composeStatsCard(data = {}, scope = 'round') {
    const parts = [];
    const isRound = scope === 'round';
    const participants = Array.isArray(data.turnDetails) ? data.turnDetails : [];

    // The two scopes hand over their totals under different keys AND different
    // names: a round returns `partyStats` with `healingDone`, a combat returns
    // `totals` with `healingGiven` (stats-cards.js:643). Reading only the round
    // shape rendered every combat card as 0 / 0 / 0, which is the sort of thing a
    // card reports confidently and wrongly. Normalised here, once.
    const raw = data.partyStats ?? data.totals ?? {};
    const stats = {
        damageDealt: Number(raw.damageDealt) || 0,
        kills: Number(raw.kills) || 0,
        healing: Number(raw.healingDone ?? raw.healingGiven) || 0
    };

    // The MVP is the top-scoring participant, and the collector already sorted them.
    // `themeLabel` is absent when nothing worth naming happened -- see stats-mvp.js,
    // which has a `noMvp` theme for exactly that round.
    const mvp = data.roundMVP ?? data.combatMVP ?? null;
    const hasMvp = Boolean(mvp?.themeLabel);

    // --- Header --------------------------------------------------------------
    parts.push({
        part: 'header',
        icon: isRound ? 'fa-solid fa-swords' : 'fa-solid fa-flag-checkered',
        title: isRound
            ? (data.roundNumber ? `Round ${data.roundNumber} Summary` : 'Round Summary')
            : 'Combat Summary'
    });

    // --- The award ------------------------------------------------------------
    // Dropped entirely when there is no MVP rather than shown empty: a banner with
    // nothing behind it reads as a bug, and a quiet round should not carry the same
    // visual weight as a decisive one.
    if (hasMvp) {
        parts.push({ part: 'ribbon', text: mvp.themeLabel });
        parts.push({ part: 'identity', img: mvp.tokenImg, name: mvp.name });
        if (mvp.description) {
            parts.push({ part: 'prose', blocks: [{ type: 'paragraph', text: mvp.description }] });
        }
    }

    // --- What the party did ---------------------------------------------------
    // Three of the nine tiles this card used to carry. These three are the round's
    // outcome; the other six are detail, and detail is what the window is for.
    //
    // The heading is load-bearing rather than decoration. Sitting directly under the
    // MVP's portrait and description, these tiles read as the MVP's own numbers --
    // which they are not, and the first build of this card had exactly that problem.
    parts.push({
        part: 'section',
        icon: 'fa-solid fa-chart-simple',
        label: isRound ? 'Round Totals' : 'Combat Totals'
    });
    parts.push({
        part: 'tiles',
        columns: 3,
        items: [
            { label: 'Damage', value: `${stats.damageDealt} hp` },
            { label: 'Kills', value: String(stats.kills) },
            { label: 'Healing', value: `${stats.healing} hp` }
        ]
    });

    // --- Who did it -----------------------------------------------------------
    if (participants.length) {
        parts.push({ part: 'section', icon: 'fa-solid fa-users', label: 'Party' });
        participants.forEach((participant, index) => {
            parts.push(participantSubject(participant, index + 1));
        });
    }

    // --- Everything else ------------------------------------------------------
    parts.push({
        part: 'actions',
        buttons: [{
            moduleId: MODULE.ID,
            action: STATS_DETAILS_ACTION,
            label: 'View the details',
            icon: 'fa-solid fa-chart-simple',
            variant: 'primary'
        }]
    });

    return parts;
}
