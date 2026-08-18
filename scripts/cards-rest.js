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
// See documentation/architecture/architecture-rest.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
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

    // THE DELTA ALONE. Rows used to carry a "12 -> 32" sublabel, on the reasoning that
    // a player wants to know where they now STAND rather than only what changed.
    //
    // The pre-rest phase answers that better. The same card showed where the character
    // stood a moment ago, so the before number is on screen already and restating it
    // beside the change is the card explaining its own arithmetic.
    //
    // A rest begun outside our window -- from a character sheet, or a system rest
    // request -- has no before phase, so those cards lose the standing figure for hit
    // dice and slots. That is parity with the system's own rest card, which reports
    // what was regained and not what the total became.
    const hitPoints = Number(result.deltas?.hitPoints ?? result.dhp ?? 0);
    if (hitPoints) {
        rows.push({ label: 'Hit Points', trailing: signed(hitPoints), tone: 'positive' });
    }

    // A SHORT REST SPENDS HIT DICE; A LONG REST GIVES THEM BACK, and the delta is a
    // plain before-to-after difference (`dnd5e.mjs:38196`), so its SIGN already says
    // which happened. dnd5e flips it for display (`dnd5e.mjs:38338`) precisely because
    // its own card reports dice spent as a positive count.
    //
    // Filing a short rest's negative delta under "Recovered" and toning it positive
    // told the reader the character had gained dice they had just burnt -- wrong
    // label, wrong sign and wrong colour from one missing branch.
    const hitDice = Number(result.deltas?.hitDice ?? result.dhd ?? 0);
    if (hitDice) {
        const spent = hitDice < 0;
        rows.push({
            label: spent ? 'Hit Dice Spent' : 'Hit Dice',
            trailing: spent ? String(-hitDice) : signed(hitDice),
            // Untoned when spent: burning dice is the PRICE of a short rest, not a
            // misfortune. Toning it negative would put a warning colour on the thing
            // the player chose to do.
            tone: spent ? undefined : 'positive'
        });
    }

    // EVERYTHING BELOW DIFFS THE LIVE ACTOR AGAINST THE PRE-REST CLONE, and reads
    // `result.updateData` not at all.
    //
    // dnd5e applies the update at `dnd5e.mjs:38299` and fires `restCompleted` at
    // 38317 -- so by the time we are called the actor ALREADY holds the new values,
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
            tone: 'positive'
        });
    }

    // EXHAUSTION. A long rest removes a level, and a GM who has just turned on food
    // tracking wants to see that as plainly as they see it added.
    const exhaustionBefore = Number(read(clone, 'system.attributes.exhaustion') ?? 0);
    const exhaustionNow = Number(actor?.system?.attributes?.exhaustion ?? 0);
    if (exhaustionNow < exhaustionBefore) {
        rows.push({
            label: 'Exhaustion',
            trailing: signed(exhaustionNow - exhaustionBefore),
            tone: 'positive'
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
    // has already applied these (`dnd5e.mjs:38301`) by the time we are called.
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

        rows.push({ label: `${item.name} Uses`, trailing: signed(recovered), tone: 'positive' });
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

    // A TICK OR A CROSS, NOT A SENTENCE. "Did they eat?" is a yes-or-no, and a column
    // of marks is read at a glance where a column of phrases has to be parsed one row
    // at a time. What the phrases used to carry that a mark cannot -- the roll, the
    // exhaustion it cost -- is on the sublabel, which is where detail belongs.
    //
    // "Ate a ration" versus "Foraged" is not lost with the words: a character who
    // foraged has the roll on their sublabel and one who ate from their pack has
    // nothing, so the two still read differently.
    const MARK = {
        ate:     { trailingIcon: 'fa-solid fa-check', tone: 'positive' },
        foraged: { trailingIcon: 'fa-solid fa-check', tone: 'positive' },
        hungry:  { trailingIcon: 'fa-solid fa-xmark', tone: 'negative' },
        // NOT AN OUTCOME, so not a tick or a cross -- either would claim the question
        // is settled while the button below is still waiting to be pressed.
        pending: { trailingIcon: 'fa-solid fa-hourglass-half', tone: 'pending' }
    };

    // The one state that still needs words: rare, and a mark cannot say why.
    const mark = (verdict) => MARK[verdict] ?? { trailing: 'Could not forage' };

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
        rows.push({ label: 'Food', sublabel: detail(provisions.food), ...mark(provisions.food) });
    }
    if (provisions.water) {
        rows.push({ label: 'Water', sublabel: detail(provisions.water), ...mark(provisions.water) });
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
/**
 * Why a rest restored nothing.
 *
 * "Nothing to recover" is true but unhelpful -- it reads the same whether the
 * character was at full strength or whether the card failed to work out what
 * changed. Naming what was already full answers the question the bare line raises.
 *
 * Everything is probed rather than assumed: a character with no spellcasting has no
 * slots to be full of, and saying so would be noise.
 *
 * @returns {string} A sentence, or a plain fallback when nothing can be determined.
 */
export function describeNothingRecovered(actor) {
    const full = [];

    const hp = actor?.system?.attributes?.hp;
    if (Number.isFinite(hp?.value) && Number.isFinite(hp?.max) && (hp.value >= hp.max)) {
        full.push('hit points');
    }

    const hd = actor?.system?.attributes?.hd;
    if (Number.isFinite(hd?.value) && Number.isFinite(hd?.max) && (hd.value >= hd.max)) {
        full.push('hit dice');
    }

    // Only counts as "full" if there were slots to begin with -- a fighter has none,
    // and reporting their spell slots as full is technically true and useless.
    const spells = actor?.system?.spells ?? {};
    const pools = Object.values(spells).filter((pool) => Number(pool?.max) > 0);
    if (pools.length && pools.every((pool) => Number(pool.value) >= Number(pool.max))) {
        full.push('spell slots');
    }

    if (!full.length) return 'Nothing needed recovering.';

    // "a, b and c" -- the last pair joined with "and" rather than a comma.
    const list = full.length === 1
        ? full[0]
        : `${full.slice(0, -1).join(', ')} and ${full[full.length - 1]}`;

    return `Already full: ${list}.`;
}

/**
 * Where a character STANDS, before they rest.
 *
 * The same three pools the recovery rows report afterwards, so the card reads as one
 * thing changing rather than two different cards about one night. Each is shown as
 * `value / max` and omitted when the character has no such pool -- a fighter has no
 * spell slots, and a row saying so is noise.
 *
 * @returns {Array<object>} `rows` items.
 */
export function buildStandingRows(actor, restType = 'long') {
    const rows = [];
    const attributes = actor?.system?.attributes ?? {};

    // HIT DICE ALWAYS SHOW, even though a short rest does not restore them -- a short
    // rest is where they get SPENT, so they are the most relevant number on the card.
    // The rule below is about resources this rest can give back; these are the
    // resource it takes.
    const hd = attributes.hd;
    if (Number(hd?.max) > 0) {
        rows.push({
            label: 'Hit Dice',
            trailing: `${Number(hd.value ?? 0)} / ${Number(hd.max)}`,
            tone: Number(hd.value ?? 0) === 0 ? 'warn' : undefined
        });
    }

    // ONLY THE SLOTS THIS REST CAN ACTUALLY GIVE BACK. A short rest restores pact
    // slots and nothing else, so telling a wizard they are on 8 of 17 before one is
    // reporting a number the rest will not move -- true, and noise.
    //
    // The rule is the system's own, read from its configuration rather than restated:
    // `restTypes[type].recoverSpellSlotTypes` against each pool's `type` is exactly
    // the test `_getRestSpellRecovery` applies (`dnd5e.mjs:38516-38520`). Warlocks
    // therefore keep their slots on a short rest card without this file knowing what
    // a warlock is.
    const recoverable = CONFIG.DND5E?.restTypes?.[restType]?.recoverSpellSlotTypes;

    const pools = Object.values(actor?.system?.spells ?? {}).filter((pool) => {
        if (!(Number(pool?.max) > 0)) return false;
        // No configuration to consult means show it: a missing set is our ignorance,
        // not a statement that nothing recovers.
        if (!recoverable?.size) return true;
        return recoverable.has(pool.type);
    });

    if (pools.length) {
        const remaining = pools.reduce((sum, pool) => sum + Number(pool.value ?? 0), 0);
        const total = pools.reduce((sum, pool) => sum + Number(pool.max ?? 0), 0);
        rows.push({
            label: 'Spell Slots',
            trailing: `${remaining} / ${total}`,
            tone: remaining === 0 ? 'warn' : undefined
        });
    }

    const exhaustion = Number(attributes.exhaustion ?? 0);
    if (exhaustion > 0) {
        rows.push({ label: 'Exhaustion', trailing: `Level ${exhaustion}`, tone: 'negative' });
    }

    return rows;
}

/**
 * The card as it looks BEFORE the rest: where the character stands, and a button.
 *
 * ONE CARD, TWO PHASES. This is the same card that will report the rest -- same
 * message, same flag, rewritten in place when the button is pressed. The plan called
 * for a separate request card and a player window in front of it; both turned out to
 * be the same object at a different moment, and a player pressing Rest on the card
 * already in front of them is the shortest path that exists.
 *
 * `restOptions` is what the GM chose in the rest window, carried on the card so the
 * rest the player starts is the rest the GM asked for -- including whether food and
 * water are tracked for this one, which is otherwise only a world setting.
 *
 * @returns {object} A card state with `phase: 'before'`.
 */
export function buildBeforeState({ actor, restType = 'long', restOptions = {}, restId = null } = {}) {
    const isLong = restType === 'long';

    return {
        phase: 'before',
        // WHICH REST THIS CARD BELONGS TO. Every card the rest window posts in one go
        // shares an id, and that is what lets the clock wait for the last sleeper --
        // the same job `config.request.id` does for a rest the system requested. A
        // window rest creates no system request, so without this every acceptance
        // looks like a lone character resting and the clock jumps once per person.
        restId,
        actorUuid: actor?.uuid ?? null,
        name: actor?.name ?? 'Someone',
        img: actor?.img ?? null,
        restType,
        subtitle: `${isLong ? 'Long' : 'Short'} Rest — ready to rest`,
        hp: {
            value: Number(actor?.system?.attributes?.hp?.value ?? 0),
            max: Number(actor?.system?.attributes?.hp?.max ?? 0)
        },
        standing: buildStandingRows(actor, restType),
        restOptions: {
            newDay: restOptions.newDay === true,
            // Kept as booleans rather than passed through, so a card carries a settled
            // answer: the rest config these become is sent explicitly, and `undefined`
            // there would silently mean "the system's default" on one path and "off"
            // on another.
            recoverTemp: restOptions.recoverTemp === true,
            recoverTempMax: restOptions.recoverTempMax === true,
            autoHD: restOptions.autoHD === true,
            trackFood: restOptions.trackFood,
            trackWater: restOptions.trackWater,
            forage: restOptions.forage,
            exhaustion: restOptions.exhaustion
        },
        recovery: [],
        provisions: null
    };
}

/**
 * A character's remaining hit dice, by die size.
 *
 * `bySize` is dnd5e's own map of denomination to how many are left -- `{ d10: 3, d6: 2 }`
 * for a Fighter 3 / Wizard 2. It is a MAP rather than a number because hit dice are
 * per class: a multiclass character chooses which size to spend, and the rules let
 * them keep the big ones back.
 *
 * @returns {Object<string, number>} Denomination to count, empty when there are none.
 */
export function readHitDicePools(actor) {
    const bySize = actor?.system?.attributes?.hd?.bySize ?? {};
    const pools = {};

    for (const [denomination, count] of Object.entries(bySize)) {
        if (Number(count) > 0) pools[denomination] = Number(count);
    }

    return pools;
}

/**
 * Whether this rest should offer hit dice, and what it has to offer.
 *
 * OFFERED ONLY TO A HURT CHARACTER, and only on a short rest -- a long rest restores
 * hit points outright, so spending dice on one would be burning a resource for
 * nothing.
 *
 * The decision is made ONCE, here, and stored. It is deliberately not re-derived at
 * render time: once the offer is on the card it stays until the dice run out, even
 * after the character reaches full health. A player who wants to spend their last
 * die at full HP is making a choice, not a mistake, and a button that vanished
 * underneath them mid-rest would be the card overruling them.
 *
 * @returns {{offered: boolean, pools: object, spent: Array}|null}
 */
export function buildHitDiceState({ actor, config } = {}) {
    if (config?.type !== 'short') return null;

    const pools = readHitDicePools(actor);
    if (!Object.keys(pools).length) return null;

    const hp = actor?.system?.attributes?.hp ?? {};
    const hurt = Number(hp.value ?? 0) < Number(hp.max ?? 0);
    if (!hurt) return null;

    return { offered: true, pools, spent: [] };
}

export function buildRestState({ actor, result, config, provisions = null } = {}) {
    const isLong = config?.type === 'long';
    const hours = Math.round((Number(config?.duration) || 0) / 60);

    // The subtitle says what KIND of rest and how long it took, which is what a GM
    // scanning a night's chat is actually looking for.
    const detail = [];
    if (hours > 0) detail.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (result?.newDay || config?.newDay) detail.push('new day');

    return {
        phase: 'rested',
        actorUuid: actor?.uuid ?? null,
        name: actor?.name ?? 'Someone',
        img: actor?.img ?? null,
        restType: config?.type ?? null,
        subtitle: `${isLong ? 'Long' : 'Short'} Rest${detail.length ? ` — ${detail.join(', ')}` : ''}`,
        // The health bar, as numbers rather than a rendered part. Stored so a
        // re-render hours later still draws the bar the rest ended on, and so the
        // same state can carry a BEFORE bar when this card grows the ability to
        // start a rest as well as report one.
        hp: {
            value: Number(actor?.system?.attributes?.hp?.value ?? 0),
            max: Number(actor?.system?.attributes?.hp?.max ?? 0)
        },
        hitDice: buildHitDiceState({ actor, config }),
        recovery: [...buildRecoveryRows(actor, result), ...buildItemRows(actor, result)],
        // Worked out here rather than at render time: the actor's state is only the
        // rest's state at this moment, and the card may be re-rendered hours later
        // when a foraging roll lands.
        nothingRecovered: describeNothingRecovered(actor),
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

    // THE HEALTH BAR. A proportion says "badly hurt" faster than a pair of numbers
    // does, and it is the one thing on this card a reader takes in without reading.
    // The meter part computes its own percent and tone from value and max, so a
    // character at a quarter health goes red without this file knowing the rule.
    //
    // The label carries the figures the bar hides -- the part defaults them to a
    // tooltip, and a rest card is read at a glance rather than hovered.
    if (Number(state?.hp?.max) > 0) {
        parts.push({
            part: 'meter',
            value: state.hp.value,
            max: state.hp.max,
            label: `${state.hp.value} / ${state.hp.max} HP`
        });
    }

    // BEFORE THE REST: where they stand, and the button. Composed and returned here
    // because the two phases share only the identity and the health bar -- everything
    // below is about a rest that has happened.
    if (state?.phase === 'before') {
        // NO "CURRENTLY" HEADING. A card that has not been rested yet has only one
        // thing to say about the character, so the rows have nothing to be
        // distinguished FROM -- and a heading exists to separate one group from
        // another. Same reasoning as the missing "Foraging" heading below.
        const standing = Array.isArray(state?.standing) ? state.standing : [];
        if (standing.length) {
            parts.push({ part: 'rows', plain: true, items: standing });
        }

        // A BUTTON, BECAUSE IT IS A BUTTON. This was a clickable row carrying the
        // character's name and a line of explanation, which read as another data row
        // rather than the one thing on the card you are meant to press.
        //
        // The name is already the card's identity and the kind of rest is already its
        // subtitle, so repeating either here is a third statement of the same fact.
        // The label says what pressing it does and nothing else.
        //
        // `primary` because pressing it is the whole point of this card. Contrast the
        // foraging control below, which opens a roll rather than committing anything.
        const isLongRest = state.restType === 'long';
        parts.push({
            part: 'actions',
            buttons: [{
                moduleId: MODULE.ID,
                action: 'rest',
                label: `Begin ${isLongRest ? 'Long' : 'Short'} Rest`,
                icon: isLongRest ? 'fa-solid fa-campground' : 'fa-solid fa-utensils',
                variant: 'primary'
            }]
        });

        return parts;
    }

    // HIT DICE SIT DIRECTLY UNDER THE HEALTH BAR, because that is the bar they move.
    // A player spending one watches the meter above the button, which is the whole
    // reason this is a loop rather than a single "heal me" action.
    parts.push(...buildHitDiceParts(state));

    // A rest that restored nothing still says so, and says WHY. Silence would read as
    // a card that failed to load rather than a character who was already at full
    // strength.
    //
    // Prose rather than a row: a row's label is styled as a heading, and "Already
    // full: hit points and spell slots" is a sentence about the rest, not a title for
    // something under it.
    const recovery = Array.isArray(state?.recovery) ? state.recovery : [];
    parts.push({ part: 'section', label: 'Recovered' });

    if (recovery.length) {
        parts.push({ part: 'rows', plain: true, items: recovery });
    } else {
        parts.push({
            part: 'prose',
            blocks: [{ type: 'paragraph', text: state?.nothingRecovered || 'Nothing needed recovering.' }]
        });
    }

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
 * Hit dice: what has been spent so far, and a button per size still available.
 *
 * ONE BUTTON PER DENOMINATION, because hit dice are per class and a multiclass
 * character chooses which to spend -- a Fighter 3 / Wizard 2 sees "Spend d10 (3)"
 * and "Spend d6 (2)" and may keep the big ones back. A single-class character has
 * one pool and therefore one button, so the common case stays as simple as a single
 * control while the choice is never hidden from the characters that have it.
 *
 * The buttons stay while ANY dice remain, including at full health. Spending a last
 * die when full is a choice a player is allowed to make, and a control that vanished
 * underneath them would be the card overruling them.
 *
 * @returns {Array<object>} Card parts, empty when this rest offers no dice.
 */
export function buildHitDiceParts(state) {
    const hitDice = state?.hitDice;
    if (!hitDice?.offered) return [];

    const parts = [];

    // Each spend, in the order they were made. The health bar shows where the
    // character ended up; these show what it cost to get there, which is the part a
    // player remembers and the reason for rolling one at a time.
    const spent = Array.isArray(hitDice.spent) ? hitDice.spent : [];
    if (spent.length) {
        parts.push({
            part: 'rows',
            plain: true,
            items: spent.map((entry) => ({
                label: `Hit Die ${entry.denomination}`,
                trailing: `+${Number(entry.healed ?? entry.total ?? 0)}`,
                tone: 'positive'
            }))
        });
    }

    const pools = Object.entries(hitDice.pools ?? {}).filter(([, count]) => Number(count) > 0);
    if (!pools.length) return parts;

    parts.push({
        part: 'actions',
        buttons: pools.map(([denomination, count]) => ({
            moduleId: MODULE.ID,
            action: 'spendHitDie',
            // The denomination rides on the button, so one handler serves every size.
            value: denomination,
            label: `Spend ${denomination} (${count})`,
            icon: 'fa-solid fa-heart-pulse'
        }))
    });

    return parts;
}

/**
 * The foraging check as its own block: what to beat, then the button, then the
 * answer in its place.
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

    // NO "FORAGING" HEADING. It only ever appears directly under the Provisions rows,
    // which is guaranteed rather than incidental: a foraging check exists only when a
    // character is short of food or water, and that same state is what puts a Food or
    // Water row above it. So the heading restates the section it is already inside.
    const parts = [];

    // THE DC IS ONLY NEWS WHILE THE ROLL IS OWED. Before, it is what the player needs
    // to know to decide how to roll; after, the row below carries the total and the
    // verdict, and a standing "DC 12" above a row labelled the same check is the card
    // saying one thing twice.
    if (pending && Number.isFinite(dc)) {
        parts.push({ part: 'subject', title: 'Survival Check', value: `DC ${dc}` });
    }

    // A BUTTON WHILE OWED, A ROW ONCE ANSWERED -- because those are two different
    // things and were being made to share one shape.
    //
    // Pending, this is a control: a d20 and one line saying what pressing it does.
    // The character's name is the card's identity and the check is already named
    // above, so a row repeating both and explaining itself in a sublabel was three
    // restatements around one action.
    //
    // NOT `primary`. The rest button is the card committing to something; this one
    // opens a roll window and decides nothing until dice land. Giving both the same
    // weight would say they carry the same consequence.
    if (pending) {
        parts.push({
            part: 'actions',
            buttons: [{
                moduleId: MODULE.ID,
                action: 'forage',
                label: 'Forage for Food and Water',
                icon: 'fa-solid fa-dice-d20'
            }]
        });

        return parts;
    }

    // Answered: the outcome, where the question was. Labelled by the CHECK rather
    // than the character, for the same reason the button is -- the card already says
    // whose night this is.
    const success = Number(roll.total) >= dc;
    parts.push({
        part: 'rows',
        items: [{
            label: 'Survival Check',
            sublabel: success ? 'Found food and water' : 'Found nothing',
            trailing: String(roll.total),
            trailingIcon: success ? 'fa-solid fa-check' : 'fa-solid fa-xmark',
            tone: success ? 'positive' : 'negative'
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
 * Mark a rest request fulfilled by OUR card.
 *
 * THIS IS WHAT TICKS A CHARACTER OFF A REST REQUEST, and nothing else does.
 * `flags.dnd5e.requestResult` is the entire mechanism: dnd5e stamps it on its own
 * rest card (`dnd5e.mjs:38376`), and `RequestMessageData.onCreateMessage` /
 * `onUpdateResultMessage` -- both wired at `dnd5e.mjs:82950-82951` -- watch every
 * message for it and write the message id onto the matching target
 * (`#updateRequestTargets`, `dnd5e.mjs:74391`). A target with a result is complete;
 * a target without one keeps offering its Rest button.
 *
 * So suppressing the system card suppressed the COMPLETION with it. The request
 * stayed live and the same character could rest again, and again, all night.
 * Our card stands in for that one, so it carries the same stamp.
 *
 * Set after creation rather than passed to `post`, because `ChatCardsAPI.post`
 * merges caller flags under the CALLER'S module id only -- by design, and not worth
 * reopening for one foreign flag. dnd5e reaches for the same escape hatch itself
 * (`dnd5e.mjs:74353`), and the update path is handled just as the create path is.
 *
 * Best-effort: a card that posted but failed to stamp is a live request, which the
 * GM can resolve by hand. Throwing here would lose the card as well.
 */
async function stampRequestResult(message, actorUuid, requestId) {
    if (!message || !actorUuid || !requestId) return;

    try {
        await message.setFlag('dnd5e', 'requestResult', { actorUuid, requestId });
    } catch (error) {
        postConsoleAndNotification(
            MODULE.NAME,
            'Rest: Could not mark the rest request complete; the GM may need to resolve it by hand',
            error, false, false
        );
    }
}

/**
 * Post a rest card from a state that has already been built.
 *
 * SEPARATE FROM BUILDING IT, because the two now happen on different clients. The
 * state is derived on whichever client ran the rest -- that is the only place
 * `result.clone`, the pre-rest snapshot every recovery row is diffed against, ever
 * exists -- while posting and provisioning are the GM's. See `manager-rest.js`.
 *
 * @param {object} state Built by `buildRestState`, plus provisions.
 * @param {object} [options]
 * @param {string|null} [options.requestId] The rest request this fulfils, if any.
 * @returns {Promise<ChatMessage|null>}
 */
export async function postRestCardFromState(state, { requestId = null } = {}) {
    const message = await ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'rest',
        parts: buildPartsFromState(state),
        speaker: { alias: state?.name },
        flags: { rest: state }
    });

    if (requestId) await stampRequestResult(message, state?.actorUuid, requestId);

    return message;
}

/**
 * Rewrite a card from a new state.
 *
 * THE ONE WRITE PATH, so a card can only ever change by being recomposed from the
 * state that will also be stored. `ChatCardsAPI.update` rewrites the baked HTML and
 * the flag together, which is what keeps a re-render from putting the old card back.
 *
 * @param {ChatMessage} message
 * @param {object} state The complete new card state.
 * @returns {Promise<ChatMessage|null>}
 */
export async function updateRestCardState(message, state) {
    return ChatCardsAPI.update(message, {
        parts: buildPartsFromState(state),
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
    return updateRestCardState(message, { ...(message?.getFlag?.(MODULE.ID, 'rest') ?? {}), provisions });
}

/**
 * Post the pre-rest card for one character.
 * @returns {Promise<ChatMessage|null>}
 */
export async function postBeforeCard({ actor, restType = 'long', restOptions = {}, restId = null } = {}) {
    const state = buildBeforeState({ actor, restType, restOptions, restId });

    return ChatCardsAPI.post({
        moduleId: MODULE.ID,
        type: 'rest',
        parts: buildPartsFromState(state),
        speaker: { alias: state.name },
        flags: { rest: state }
    });
}

/** Whether this card is still waiting for its character to rest. */
export function isRestPending(state) {
    return state?.phase === 'before';
}
