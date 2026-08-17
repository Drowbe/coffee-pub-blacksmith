// ==================================================================
// ===== REST CARD ==================================================
// ==================================================================
//
// One card per character per rest: what they recovered, what they ate, and --
// later -- a button for a foraging check they have not yet made.
//
// It replaces the system's own recovery card, which means it MUST carry the same
// information. Hit points, hit dice, spell slots and item uses are the reason a
// GM reads a rest card at all; a prettier card that dropped them would be a net
// loss dressed as a tidy-up.
//
// The recovery lines are derived from the `result` that `dnd5e.restCompleted`
// hands over, against `result.clone` -- the pre-rest snapshot the system keeps
// for exactly this comparison. Deliberately NOT from `ActorDeltasField`, which is
// the system's internal display plumbing: it would give a perfect match today and
// break on a system update, and this is a chat card rather than a rules
// calculation.
//
// See documentation/plans/plan-rest-card.md.

import { MODULE } from './const.js';
import { ChatCardsAPI } from './api-chat-cards.js';

/** Ordinal labels for spell levels, so a row reads "3rd Level Slots". */
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * A number as a signed string, for a recovery row.
 * @returns {string}
 */
function signed(value) {
    return value > 0 ? `+${value}` : String(value);
}

/**
 * Read a dotted path off a document or plain object without throwing.
 */
function read(source, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), source);
}

/**
 * What the rest gave back, as display rows.
 *
 * Every branch is guarded and the whole thing is best-effort: a rest card that
 * throws because a system update moved a field is worse than one missing a line.
 *
 * @param {object} result The RestResult from `dnd5e.restCompleted`.
 * @returns {Array<object>} `rows` items.
 */
export function buildRecoveryRows(actor, result) {
    const rows = [];
    if (!result) return rows;

    const clone = result.clone ?? null;

    // EVERY ROW SHOWS FROM -> TO, not only the delta. "+40" says what happened;
    // "827 -> 867" says where the character now stands, which is what a player reads
    // a rest card to find out. The delta stays as the trailing value because it is
    // the thing worth seeing at a glance.
    const span = (before, after) => {
        if (!Number.isFinite(before) || !Number.isFinite(after)) return undefined;
        return `${before} → ${after}`;
    };

    const hitPoints = Number(result.deltas?.hitPoints ?? result.dhp ?? 0);
    if (hitPoints) {
        const after = Number(actor?.system?.attributes?.hp?.value);
        rows.push({
            label: 'Hit Points',
            sublabel: span(after - hitPoints, after),
            trailing: signed(hitPoints),
            tone: 'success'
        });
    }

    const hitDice = Number(result.deltas?.hitDice ?? result.dhd ?? 0);
    if (hitDice) {
        const after = Number(actor?.system?.attributes?.hd?.value);
        rows.push({
            label: 'Hit Dice',
            sublabel: span(after - hitDice, after),
            trailing: signed(hitDice),
            tone: 'success'
        });
    }

    // EVERYTHING BELOW DIFFS THE LIVE ACTOR AGAINST THE PRE-REST CLONE, and reads
    // `result.updateData` not at all.
    //
    // dnd5e applies the update at `dnd5e.mjs:34977` and fires `restCompleted` at
    // 34995 -- so by the time we are called the actor ALREADY holds the new values,
    // and `updateData` has been through `Document#update`, which normalises and
    // consumes it. The first version read it directly and reported nothing at all
    // for slots or exhaustion, while the system's own card showed both.
    //
    // Two actual actor states cannot drift from the truth the way a spent update
    // object can, and this no longer cares which key path or shape the system used.
    const spells = actor?.system?.spells ?? {};
    for (const key of Object.keys(spells)) {
        const before = Number(read(clone, `system.spells.${key}.value`) ?? 0);
        const now = Number(spells[key]?.value ?? 0);
        const gained = now - before;
        if (!gained) continue;

        const level = /^spell(\d+)$/.exec(key)?.[1];
        rows.push({
            // Pact and other named pools sit alongside the numbered levels in the
            // same object, so anything not `spellN` is titled from its own key.
            label: level
                ? `${ORDINALS[Number(level)] ?? `${level}th`} Level Slots`
                : `${key.charAt(0).toUpperCase()}${key.slice(1)} Slots`,
            sublabel: span(before, now),
            trailing: signed(gained),
            tone: 'success'
        });
    }

    // EXHAUSTION. A long rest removes a level, and a GM who has just turned on food
    // tracking wants to see that as plainly as they see it added.
    const exhaustionBefore = Number(read(clone, 'system.attributes.exhaustion') ?? 0);
    const exhaustionNow = Number(actor?.system?.attributes?.exhaustion ?? 0);
    if (exhaustionNow < exhaustionBefore) {
        rows.push({
            label: 'Exhaustion',
            sublabel: span(exhaustionBefore, exhaustionNow),
            trailing: signed(exhaustionNow - exhaustionBefore),
            tone: 'success'
        });
    }

    return rows;
}

/**
 * Item uses recovered, one row per item.
 *
 * Separate from the actor rows because the names come off the items themselves,
 * and an item that has since been deleted must not take the card down with it.
 *
 * @param {Actor} actor
 * @param {object} result
 * @returns {Array<object>} `rows` items.
 */
export function buildItemRows(actor, result) {
    const updates = Array.isArray(result?.updateItems) ? result.updateItems : [];
    const rows = [];

    // `updateItems` is used ONLY for the list of ids -- an id survives any
    // normalisation the update object goes through. The values come from diffing the
    // live item against the clone's, for the same reason the actor rows do: dnd5e
    // has already applied these (`dnd5e.mjs:34979`) by the time we are called.
    for (const update of updates) {
        const id = update?._id;
        if (!id) continue;

        const item = actor?.items?.get?.(id);
        if (!item) continue;

        // dnd5e tracks uses as `spent`, so recovering uses means spent going DOWN.
        // Reporting the raw fall would print a negative for something gained.
        const spentBefore = Number(read(result?.clone?.items?.get?.(id), 'system.uses.spent') ?? 0);
        const spentNow = Number(item.system?.uses?.spent ?? 0);

        const recovered = spentBefore - spentNow;
        if (recovered <= 0) continue;

        rows.push({ label: `${item.name} Uses`, trailing: signed(recovered), tone: 'success' });
    }

    return rows;
}

/**
 * The provisions rows: what the character ate and drank.
 *
 * @param {object|null} provisions Outcome from RestManager, or null when tracking is off.
 * @returns {Array<object>} `rows` items.
 */
export function buildProvisionRows(provisions) {
    if (!provisions) return [];

    const phrase = {
        ate: 'Ate a ration',
        drank: 'Drank',
        foraged: 'Foraged',
        hungry: 'Went without',
        unrolled: 'Could not forage',
        pending: 'Foraging'
    };

    // THE ROLL AND ITS CONSEQUENCE SIT ON THE ROW THEY BELONG TO, rather than the
    // exhaustion getting a row of its own.
    //
    // It had one, and it read as a contradiction: the Recovered section above says
    // "Exhaustion -1" because the long rest removed a level, and a separate
    // "Exhaustion +1" underneath looked like the card disagreeing with itself. Both
    // are true -- the rest gave a level back and the failed forage took one -- but
    // they are answers to different questions, and only one of them is about
    // provisions. On the row that caused it, it reads as a consequence instead.
    const roll = provisions.roll ?? null;

    // ONE CHECK, so ONE mention of the exhaustion it cost. Food is checked first, so
    // a character who found neither food nor water sees the cost against food and a
    // bare "went without" against water -- rather than both rows claiming a level and
    // implying two were lost.
    let exhaustionUnclaimed = provisions.exhaustion > 0;

    const detail = (verdict) => {
        const parts = [];

        // A card reporting "went without" with no dice anywhere reads as a broken
        // button rather than a failed check, which is how it read the first time out.
        if (roll && Number.isFinite(roll.total) && ((verdict === 'foraged') || (verdict === 'hungry'))) {
            parts.push(`Survival ${roll.total} vs DC ${roll.dc}`);
        }
        if ((verdict === 'hungry') && exhaustionUnclaimed) {
            parts.push(`+${provisions.exhaustion} exhaustion`);
            exhaustionUnclaimed = false;
        }

        return parts.length ? parts.join(' · ') : undefined;
    };

    const rows = [];
    if (provisions.food) {
        rows.push({
            label: 'Food',
            sublabel: detail(provisions.food),
            trailing: provisions.food === 'ate' ? 'Ate a ration' : phrase[provisions.food],
            tone: provisions.food === 'hungry' ? 'danger' : undefined
        });
    }
    if (provisions.water) {
        rows.push({
            label: 'Water',
            sublabel: detail(provisions.water),
            trailing: provisions.water === 'ate' ? 'Drank' : phrase[provisions.water],
            tone: provisions.water === 'hungry' ? 'danger' : undefined
        });
    }

    return rows;
}

/**
 * Everything the card needs to draw itself, and to draw itself AGAIN later.
 *
 * THE CARD CARRIES ITS OWN STATE. This object is stored in the message flags, so a
 * foraging roll made minutes afterwards can re-render the card from the message
 * alone -- no memory, no lookup of a `RestResult` that no longer exists, and it
 * works on whichever client happens to be resolving it. The recovery rows are
 * stored already rendered for exactly that reason: `result` and its clone are gone
 * by then, and re-deriving them would be impossible.
 *
 * @returns {object}
 */
export function buildRestState({ actor, result, config, provisions = null } = {}) {
    const isLong = config?.type === 'long';
    const hours = Math.round((Number(config?.duration) || 0) / 60);

    // The subtitle says what KIND of rest and how long it took, which is what a GM
    // scanning a night's chat is actually looking for.
    const detail = [];
    if (hours > 0) detail.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (result?.newDay || config?.newDay) detail.push('new day');

    return {
        actorUuid: actor?.uuid ?? null,
        name: actor?.name ?? 'Someone',
        img: actor?.img ?? null,
        restType: config?.type ?? null,
        subtitle: `${isLong ? 'Long' : 'Short'} Rest${detail.length ? ` — ${detail.join(', ')}` : ''}`,
        recovery: [...buildRecoveryRows(actor, result), ...buildItemRows(actor, result)],
        provisions
    };
}

/**
 * Compose the card from its state.
 * @returns {Array<object>} Card parts.
 */
export function buildPartsFromState(state) {
    const parts = [
        {
            part: 'identity',
            img: state?.img ?? undefined,
            name: state?.name ?? 'Someone',
            subtitle: state?.subtitle ?? ''
        }
    ];

    // A rest that restored nothing still says so. Silence would read as a card that
    // failed to load rather than a character who was already at full strength.
    const recovery = Array.isArray(state?.recovery) ? state.recovery : [];
    parts.push({ part: 'section', label: 'Recovered' });
    parts.push({
        part: 'rows',
        plain: true,
        items: recovery.length ? recovery : [{ label: 'Nothing to recover', tone: 'muted' }]
    });

    const provisionRows = buildProvisionRows(state?.provisions);
    if (provisionRows.length) {
        parts.push({ part: 'section', label: 'Provisions' });
        parts.push({ part: 'rows', plain: true, items: provisionRows });
    }

    // THE FORAGING CHECK, presented the way Request a Roll presents one: the DC
    // stated above, then the check itself, then its result in the same place once it
    // lands. A bare button saying "Forage" told the player neither what they were
    // rolling nor what they had to beat.
    //
    // The section is only composed while the check is OWED or has just been made, so
    // a card for a well-fed character carries nothing. Whether a viewer may press the
    // button is decided when it is pressed, not here -- the card is one baked string
    // delivered to everybody, so hiding it per-viewer at compose time would hide it
    // for the wrong people.
    const forage = buildForageParts(state);
    parts.push(...forage);

    return parts;
}

/**
 * The foraging check as its own block: the DC, then the roll.
 *
 * Mirrors how Request a Roll presents a check, because a player reading this has
 * seen that card and should not have to learn a second convention for the same
 * thing.
 *
 * @returns {Array<object>} Card parts, empty when there is no check to show.
 */
export function buildForageParts(state) {
    const provisions = state?.provisions;
    if (!provisions) return [];

    const pending = isForagePending(state);
    const roll = provisions.roll ?? null;
    const rolled = roll && Number.isFinite(roll.total);
    if (!pending && !rolled) return [];

    const dc = Number(provisions.dc ?? roll?.dc);
    const parts = [{ part: 'section', label: 'Foraging' }];

    if (Number.isFinite(dc)) {
        parts.push({ part: 'subject', title: 'Survival Check', value: `DC ${dc}` });
    }

    if (pending) {
        parts.push({
            // It opens the roll window and the answer lands on this card. No second
            // card is posted, so "Roll" is the honest label again.
            part: 'actions',
            instruction: `${state.name ?? 'This character'} has no food or water.`,
            buttons: [{
                label: 'Roll Survival',
                icon: 'fa-solid fa-dice-d20',
                action: 'forage',
                moduleId: MODULE.ID
            }]
        });
        return parts;
    }

    // RESOLVED. The result sits where the button was, so the eye lands on the answer
    // in the place it last saw the question.
    const success = Number(roll.total) >= dc;
    parts.push({
        part: 'rows',
        plain: true,
        items: [{
            thumb: true,
            img: state.img || undefined,
            label: state.name ?? 'Survival',
            sublabel: success ? 'Found food and water' : 'Found nothing',
            trailing: String(roll.total),
            trailingIcon: success ? 'fa-solid fa-check' : 'fa-solid fa-xmark',
            tone: success ? 'success' : 'danger'
        }]
    });

    return parts;
}

/** Whether this card is still waiting on a foraging check. */
export function isForagePending(state) {
    const provisions = state?.provisions;
    if (!provisions) return false;
    return (provisions.food === 'pending') || (provisions.water === 'pending');
}

/**
 * Compose a card directly. Kept for callers that have the rest to hand.
 * @returns {Array<object>} Card parts.
 */
export function buildRestCardParts(options = {}) {
    return buildPartsFromState(buildRestState(options));
}

/**
 * Post a rest card for one character.
 *
 * @returns {Promise<ChatMessage|null>}
 */
export async function postRestCard({ actor, result, config, provisions = null } = {}) {
    const state = buildRestState({ actor, result, config, provisions });

    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'rest',
        parts: buildPartsFromState(state),
        speaker: { alias: actor?.name },
        flags: { rest: state }
    });
}

/**
 * Rewrite a card after its foraging check has been made.
 *
 * @param {ChatMessage} message
 * @param {object} provisions The resolved provisions block.
 * @returns {Promise<ChatMessage|null>}
 */
export async function updateRestCard(message, provisions) {
    const state = { ...(message?.getFlag?.(MODULE.ID, 'rest') ?? {}), provisions };

    return ChatCardsAPI.update(message, {
        parts: buildPartsFromState(state),
        flags: { rest: state }
    });
}
