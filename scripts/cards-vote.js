// ==================================================================
// ===== VOTE CARD COMPOSITION ======================================
// ==================================================================

/**
 * The vote card, expressed as parts.
 *
 * This migration exists to close a leak as much as to retire a template.
 *
 * The card it replaces was rendered ONCE, by whoever initiated the vote, and stored
 * as a single `content` string every client shares (`manager-vote.js:813`). Only the
 * initiator ever re-renders it -- `_updateVoteMessage()` is gated by
 * `(isGM || isLeader) && isInitiator` -- so every player was looking at the
 * initiator's view of the card. That failed in both directions, confirmed live on
 * 2026-08-15:
 *
 *   - GM initiates: `currentUserIsGM: true` is baked, so the GM-only voter detail
 *     ("Alicia Panicucci: Yes") shipped inside every player's copy.
 *   - Leader initiates: `currentUserIsGM: false` is baked, so the detail rendered
 *     for nobody, and the GM silently lost the feature.
 *
 * Parts fix the mechanism, because a parts card re-renders on each client from its
 * composition. But the mechanism was only half of it:
 *
 * **THE VOTER DETAIL IS NOT ON THIS CARD AT ALL, AND MUST NOT BE PUT BACK.**
 * Who voted for what is the one genuinely secret thing here, and a veiled value is
 * presentation privacy -- the value still travels to every client and a console
 * finds it. Off-screen is not enough for a secret ballot. The card reports HOW MANY
 * have voted, which is not secret; the GM reads the detail from the vote window,
 * which is not a public document. If a future change wants it on the card, the
 * honest way is a whisper, not a veil.
 *
 * PURE, like the other composers: state in, parts out, no globals, no DOM.
 */

import { MODULE } from './const.js';

/** Cast a vote for one option. Registered in `blacksmith.js`. */
export const VOTE_CAST_ACTION = 'vote-cast';

/** Close the vote. GM only, enforced in the handler as well as in the card. */
export const VOTE_CLOSE_ACTION = 'vote-close';

/** The card type stamped on the message. */
export const VOTE_CARD_TYPE = 'vote';

/**
 * The heading, which varies by what is being voted on. `characters` and `custom`
 * carry their own title; the rest are fixed kinds with fixed names.
 */
const VOTE_TITLES = {
    leader: 'Leader Election',
    yesno: 'Yes or No',
    endtime: 'End Time',
    engagement: 'Party Plan'
};

/**
 * Build the card.
 *
 * @param {object} vote - the active vote: `{ id, type, title, description, options,
 *   votes, isActive, results }`
 * @param {object} [progress] - `{ current, total }`, how many have voted
 * @returns {Array<object>} parts, ready for `chatCards.post`
 */
export function composeVoteCard(vote = {}, progress = null) {
    const parts = [];
    const options = Array.isArray(vote.options) ? vote.options : [];

    // --- Header ---------------------------------------------------------------
    parts.push({
        part: 'header',
        icon: 'fa-solid fa-shield-check',
        title: VOTE_TITLES[vote.type] ?? vote.title ?? 'Vote'
    });

    if (vote.isActive) {
        // How many have voted. A COUNT, never the names -- see the note at the top
        // of this file. This is what replaced a tooltip that carried the roll-call.
        if (progress && Number(progress.total) > 0) {
            parts.push({
                part: 'band',
                text: `${progress.current} of ${progress.total} voted`,
                quiet: true
            });
        }

        if (vote.description) {
            parts.push({ part: 'prose', blocks: [{ type: 'paragraph', text: vote.description }] });
        }

        // Every option is a clickable row for everybody. Which one the READER chose
        // is not composed in -- it cannot be, since the composition is written once
        // and read by everyone. A render pass marks it per client, the same way a
        // skill check dims the rows you may not roll.
        parts.push({
            part: 'rows',
            items: options.map((option) => ({
                label: option.name,
                clickable: true,
                moduleId: MODULE.ID,
                action: VOTE_CAST_ACTION,
                value: option.id,
                tooltip: `Vote for ${option.name}`
            }))
        });

        // Who has yet to vote, for the GM.
        //
        // This is the honest half of the tooltip that leaked. A name here says only
        // that someone has not acted; it never says what anybody chose. That is the
        // line: "who has voted" is not secret, "who voted for what" is. Removing the
        // old tooltip took the GM's ability to chase people with it, and this gives
        // that back without giving the ballot away.
        if (progress?.waitingOn?.length) {
            parts.push({
                part: 'notes',
                readableBy: 'gm',
                items: [{
                    icon: 'fa-solid fa-hourglass-half',
                    text: `Waiting on: ${progress.waitingOn.join(', ')}`
                }]
            });
        }

        // GM only, and this is the first use of a part-level `readableBy`. It hides
        // the button; it does not authorise anything. VoteManager.closeVote() is
        // still the authority, because any client can fire an action regardless of
        // what its copy of the card looks like.
        parts.push({
            part: 'actions',
            readableBy: 'gm',
            buttons: [{
                moduleId: MODULE.ID,
                action: VOTE_CLOSE_ACTION,
                label: 'Close Vote',
                icon: 'fa-solid fa-square-check',
                variant: 'primary'
            }]
        });

        return parts;
    }

    // --- Closed: the tally --------------------------------------------------
    const tally = vote.results?.tally ?? {};
    const entries = Object.entries(tally);
    if (!entries.length) return parts;

    parts.push({ part: 'section', icon: 'fa-solid fa-check-circle', label: 'Results' });
    parts.push({
        part: 'rows',
        items: entries.map(([optionId, result]) => {
            const isWinner = optionId === vote.results?.winner
                || optionId === vote.results?.winner?.id;
            const count = Number(result.count) || 0;
            return {
                label: result.name,
                // The crown is the leader election's own mark; everything else takes
                // a star. Both are markers rather than tones, because winning is not
                // a value judgement the tone vocabulary should be making.
                marker: isWinner
                    ? (vote.type === 'leader' ? 'fa-solid fa-crown' : 'fa-solid fa-star')
                    : undefined,
                emphasis: isWinner,
                trailing: `${count} ${count === 1 ? 'vote' : 'votes'}`
            };
        })
    });

    if (vote.results?.totalVotes !== undefined) {
        parts.push({
            part: 'notes',
            items: [{ icon: 'fa-solid fa-check-circle', text: `Total votes: ${vote.results.totalVotes}` }]
        });
    }

    return parts;
}
