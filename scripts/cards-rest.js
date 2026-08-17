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

    const hitPoints = Number(result.deltas?.hitPoints ?? result.dhp ?? 0);
    if (hitPoints) {
        rows.push({ label: 'Hit Points', trailing: signed(hitPoints), tone: 'success' });
    }

    const hitDice = Number(result.deltas?.hitDice ?? result.dhd ?? 0);
    if (hitDice) {
        rows.push({ label: 'Hit Dice', trailing: signed(hitDice), tone: 'success' });
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
            trailing: signed(gained),
            tone: 'success'
        });
    }

    // EXHAUSTION. A long rest removes a level, and a GM who has just turned on food
    // tracking wants to see that as plainly as they see it added.
    const exhaustionBefore = Number(read(clone, 'system.attributes.exhaustion') ?? 0);
    const exhaustionNow = Number(actor?.system?.attributes?.exhaustion ?? 0);
    if (exhaustionNow < exhaustionBefore) {
        rows.push({ label: 'Exhaustion', trailing: signed(exhaustionNow - exhaustionBefore), tone: 'success' });
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

    // THE ROLL IS SHOWN, not just its verdict. A row saying "went without" beside a
    // level of exhaustion, with no dice anywhere, reads as a broken button rather
    // than a failed check -- which is how it read the first time it went out.
    const roll = provisions.roll ?? null;
    const rolled = (verdict) => {
        if (!roll || !Number.isFinite(roll.total)) return undefined;
        if ((verdict !== 'foraged') && (verdict !== 'hungry')) return undefined;
        return `Survival ${roll.total} vs DC ${roll.dc}`;
    };

    const rows = [];
    if (provisions.food) {
        rows.push({
            label: 'Food',
            sublabel: rolled(provisions.food),
            trailing: provisions.food === 'ate' ? 'Ate a ration' : phrase[provisions.food],
            tone: provisions.food === 'hungry' ? 'danger' : undefined
        });
    }
    if (provisions.water) {
        rows.push({
            label: 'Water',
            sublabel: rolled(provisions.water),
            trailing: provisions.water === 'ate' ? 'Drank' : phrase[provisions.water],
            tone: provisions.water === 'hungry' ? 'danger' : undefined
        });
    }
    if (provisions.exhaustion > 0) {
        rows.push({
            label: 'Exhaustion',
            trailing: `+${provisions.exhaustion}`,
            tone: 'danger',
            emphasis: true
        });
    }

    return rows;
}

/**
 * Compose the whole card.
 *
 * @param {object} options
 * @param {Actor} options.actor
 * @param {object} options.result     RestResult from dnd5e.
 * @param {object} options.config     RestConfiguration from dnd5e.
 * @param {object|null} [options.provisions]
 * @returns {Array<object>} Card parts.
 */
export function buildRestCardParts({ actor, result, config, provisions = null } = {}) {
    const isLong = config?.type === 'long';
    const hours = Math.round((Number(config?.duration) || 0) / 60);

    // The subtitle says what KIND of rest and how long it took, which is the thing
    // a GM scanning a night's chat is actually looking for.
    const detail = [];
    if (hours > 0) detail.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (result?.newDay || config?.newDay) detail.push('new day');

    const recovery = [...buildRecoveryRows(actor, result), ...buildItemRows(actor, result)];
    const provisionRows = buildProvisionRows(provisions);

    const parts = [
        {
            part: 'identity',
            img: actor?.img ?? undefined,
            name: actor?.name ?? 'Someone',
            subtitle: `${isLong ? 'Long' : 'Short'} Rest${detail.length ? ` — ${detail.join(', ')}` : ''}`
        }
    ];

    // A rest that restored nothing still says so. Silence would read as a card that
    // failed to load rather than a character who was already at full strength.
    parts.push({ part: 'section', label: 'Recovered' });
    parts.push({
        part: 'rows',
        plain: true,
        items: recovery.length ? recovery : [{ label: 'Nothing to recover', tone: 'muted' }]
    });

    if (provisionRows.length) {
        parts.push({ part: 'section', label: 'Provisions' });
        parts.push({ part: 'rows', plain: true, items: provisionRows });
    }

    return parts;
}

/**
 * Post a rest card for one character.
 *
 * The actor's uuid rides along in the card flags so a later result -- a foraging
 * roll the player makes minutes afterwards -- can find this card again without
 * anything being remembered in memory.
 *
 * @returns {Promise<ChatMessage|null>}
 */
export async function postRestCard({ actor, result, config, provisions = null } = {}) {
    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'rest',
        parts: buildRestCardParts({ actor, result, config, provisions }),
        speaker: { alias: actor?.name },
        flags: {
            rest: {
                actorUuid: actor?.uuid ?? null,
                restType: config?.type ?? null
            }
        }
    });
}
