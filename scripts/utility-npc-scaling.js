// ==================================================================
// ===== NPC SCALING ENGINE =========================================
// ==================================================================
//
// Pure functions: no imports, no Foundry globals, no I/O. A snapshot of a creature
// goes in, a list of updates and a preview come out, and nothing is written. That is
// deliberate -- it is what lets `tools/check-npc-scaling.mjs` import this file
// directly and run it under Node, and it keeps the one thing that decides what
// a scaling DOES away from anything that could be mocked wrongly.
//
// The vocabulary:
//
//   snapshot  What the creature is now, as plain numbers (built by the caller from
//             a prepared actor).
//   spec      What to change, as plain data. Two things make one: `specFromCR` (a
//             CR retarget) and a saved template (numbers written in). Both feed the
//             one applier, so there is one write path to test.
//   plan      What `applySpec` returns: the update data and the preview rows.
//
// See documentation/plans/plan-npc-scaling.md for the design and the dnd5e traps.

/** Version stamped on a spec, so a stored or exported one can be recognised later. */
export const SPEC_VERSION = 1;

// ===== GUIDELINES TABLE ===========================================

/**
 * Monster statistics by challenge rating, from the published 5e DMG guidelines.
 *
 * `hp` and `dpr` are the guideline's [min, max] range; the engine reads their midpoint.
 * `ac` is the armor class, `atk` the attack bonus and `dc` the save DC. Proficiency is NOT a column: dnd5e derives it
 * from CR (see `proficiencyForCR`), and a second copy here would be free to disagree.
 *
 * This is the DMG 2014 table. It is DATA, and the intent is that a GM can edit it; every
 * function that reads it takes the table as a parameter and defaults to this one.
 */
export const GUIDELINES = Object.freeze({
    '0':   { ac: 13, hp: [1, 6],     atk: 3,  dpr: [0, 1],     dc: 13 },
    '1/8': { ac: 13, hp: [7, 35],    atk: 3,  dpr: [2, 3],     dc: 13 },
    '1/4': { ac: 13, hp: [36, 49],   atk: 3,  dpr: [4, 5],     dc: 13 },
    '1/2': { ac: 13, hp: [50, 70],   atk: 3,  dpr: [6, 8],     dc: 13 },
    '1':   { ac: 13, hp: [71, 85],   atk: 3,  dpr: [9, 14],    dc: 13 },
    '2':   { ac: 13, hp: [86, 100],  atk: 3,  dpr: [15, 20],   dc: 13 },
    '3':   { ac: 13, hp: [101, 115], atk: 4,  dpr: [21, 26],   dc: 13 },
    '4':   { ac: 14, hp: [116, 130], atk: 5,  dpr: [27, 32],   dc: 14 },
    '5':   { ac: 15, hp: [131, 145], atk: 6,  dpr: [33, 38],   dc: 15 },
    '6':   { ac: 15, hp: [146, 160], atk: 6,  dpr: [39, 44],   dc: 15 },
    '7':   { ac: 15, hp: [161, 175], atk: 6,  dpr: [45, 50],   dc: 15 },
    '8':   { ac: 16, hp: [176, 190], atk: 7,  dpr: [51, 56],   dc: 16 },
    '9':   { ac: 16, hp: [191, 205], atk: 7,  dpr: [57, 62],   dc: 16 },
    '10':  { ac: 17, hp: [206, 220], atk: 7,  dpr: [63, 68],   dc: 16 },
    '11':  { ac: 17, hp: [221, 235], atk: 8,  dpr: [69, 74],   dc: 17 },
    '12':  { ac: 17, hp: [236, 250], atk: 8,  dpr: [75, 80],   dc: 17 },
    '13':  { ac: 18, hp: [251, 265], atk: 8,  dpr: [81, 86],   dc: 18 },
    '14':  { ac: 18, hp: [266, 280], atk: 8,  dpr: [87, 92],   dc: 18 },
    '15':  { ac: 18, hp: [281, 295], atk: 8,  dpr: [93, 98],   dc: 18 },
    '16':  { ac: 18, hp: [296, 310], atk: 9,  dpr: [99, 104],  dc: 18 },
    '17':  { ac: 19, hp: [311, 325], atk: 10, dpr: [105, 110], dc: 19 },
    '18':  { ac: 19, hp: [326, 340], atk: 10, dpr: [111, 116], dc: 19 },
    '19':  { ac: 19, hp: [341, 355], atk: 10, dpr: [117, 122], dc: 19 },
    '20':  { ac: 19, hp: [356, 400], atk: 10, dpr: [123, 140], dc: 19 },
    '21':  { ac: 19, hp: [401, 445], atk: 11, dpr: [141, 158], dc: 20 },
    '22':  { ac: 19, hp: [446, 490], atk: 11, dpr: [159, 176], dc: 20 },
    '23':  { ac: 19, hp: [491, 535], atk: 11, dpr: [177, 194], dc: 20 },
    '24':  { ac: 19, hp: [536, 580], atk: 12, dpr: [195, 212], dc: 21 },
    '25':  { ac: 19, hp: [581, 625], atk: 12, dpr: [213, 230], dc: 21 },
    '26':  { ac: 19, hp: [626, 670], atk: 12, dpr: [231, 248], dc: 21 },
    '27':  { ac: 19, hp: [671, 715], atk: 13, dpr: [249, 266], dc: 22 },
    '28':  { ac: 19, hp: [716, 760], atk: 13, dpr: [267, 284], dc: 22 },
    '29':  { ac: 19, hp: [761, 805], atk: 13, dpr: [285, 302], dc: 22 },
    '30':  { ac: 19, hp: [806, 850], atk: 14, dpr: [303, 320], dc: 23 }
});

/** The attack types a bonus is written to. Each is a separate stored field in dnd5e. */
export const ATTACK_TYPES = Object.freeze(['mwak', 'rwak', 'msak', 'rsak']);

// ===== ERRORS =====================================================

/**
 * A refusal the caller can act on. `code` is stable; `message` is for a person.
 * Codes: NO_CR, INVALID_CR, NO_PATH, BAD_SPEC.
 */
export class NpcScalingError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'NpcScalingError';
        this.code = code;
    }
}

// ===== CR HELPERS =================================================

const FRACTIONS = Object.freeze({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' });

/**
 * The table key for a numeric CR: 0.25 -> '1/4', 12 -> '12'.
 * @param {number} cr
 * @returns {string}
 * @throws {NpcScalingError} INVALID_CR for anything that is not a CR the table has a row for.
 */
export function crKey(cr) {
    const n = Number(cr);
    if (!Number.isFinite(n)) throw new NpcScalingError('INVALID_CR', `"${cr}" is not a challenge rating.`);
    if (n in FRACTIONS) return FRACTIONS[n];
    if (Number.isInteger(n) && n >= 0 && n <= 30) return String(n);
    throw new NpcScalingError('INVALID_CR', `CR ${cr} has no row in the guidelines table (0 to 30, and 1/8, 1/4, 1/2).`);
}

/**
 * The proficiency bonus dnd5e gives an NPC of this CR. Mirrors `Proficiency.calculateMod` as
 * `NPCData.prepareBaseData` applies it: `floor((max(cr, 1) + 7) / 4)`. Mirrored and not read
 * from the table so a scaling can never disagree with the system about what changed.
 *
 * Verified against dnd5e 6.0.6. If a release changes the formula, `check-npc-scaling.mjs`
 * still passes -- it compares this function with itself -- so a dnd5e bump is a re-read, not a re-run.
 * @param {number} cr
 * @returns {number}
 */
export function proficiencyForCR(cr) {
    return Math.floor((Math.max(Number(cr), 1) + 7) / 4);
}

/**
 * One guideline row, with the midpoints resolved.
 * @param {number} cr
 * @param {Object} [table=GUIDELINES]
 * @returns {{ key: string, prof: number, ac: number, hp: number, atk: number, dpr: number, dc: number }}
 */
export function guidelineFor(cr, table = GUIDELINES) {
    const key = crKey(cr);
    const row = table[key];
    if (!row) throw new NpcScalingError('INVALID_CR', `The guidelines table has no row for CR ${key}.`);
    const mid = ([lo, hi]) => (lo + hi) / 2;
    return {
        key,
        prof: proficiencyForCR(cr),
        ac: row.ac,
        hp: Math.round(mid(row.hp)),
        atk: row.atk,
        dpr: mid(row.dpr),
        dc: row.dc
    };
}

// ===== FORMULA HELPERS ============================================

/**
 * Add a number to a dnd5e formula string without losing what is already there.
 * Attack, damage, initiative and DC bonuses are FormulaFields: `"1d4"` is a legal existing
 * value, and replacing it would delete a bonus the GM set on purpose.
 * @param {string|number|null|undefined} existing
 * @param {number} n
 * @returns {string} The unchanged existing value when `n` is zero.
 */
export function addToFormula(existing, n) {
    const base = String(existing ?? '').trim();
    if (!n) return base;
    if (!base) return String(n);
    return `${base} ${n < 0 ? '-' : '+'} ${Math.abs(n)}`;
}

// ===== SPEC FROM CR ===============================================

/**
 * Describe the change from a creature's current CR to a target CR.
 *
 * Each amount is the DIFFERENCE between the two guideline rows, added to the creature's own
 * figure -- not the target row's value. The table is lopsided at low CR (a 7 HP goblin
 * against a 36 to 49 HP row), and writing the row would quietly lift a weak creature onto
 * the curve. Attack bonus and save DC are reduced by the proficiency change, because dnd5e
 * already applies that when `details.cr` is written.
 *
 * Damage is the gap in damage per round, spread across the creature's attacks per round.
 * Initiative is left alone: the guidelines have no column for it.
 *
 * @param {{ cr: number, attacksPerRound?: number }} source
 * @param {number} targetCR
 * @param {Object} [options]
 * @param {string} [options.label='']  Name suffix and template name.
 * @param {Object} [options.table=GUIDELINES]
 * @returns {Object} A spec.
 */
export function specFromCR(source, targetCR, { label = '', table = GUIDELINES } = {}) {
    if (source?.cr === null || source?.cr === undefined || !Number.isFinite(Number(source.cr))) {
        throw new NpcScalingError('NO_CR', 'This creature has no challenge rating to scale from.');
    }
    const from = guidelineFor(source.cr, table);
    const to = guidelineFor(targetCR, table);
    const profChange = to.prof - from.prof;
    const attacks = Math.max(1, Math.round(source.attacksPerRound ?? 1));

    return {
        version: SPEC_VERSION,
        label,
        cr: { to: Number(targetCR) },
        hp: { mode: 'delta', value: to.hp - from.hp },
        ac: { add: to.ac - from.ac },
        attack: { add: (to.atk - from.atk) - profChange },
        saveDC: { add: (to.dc - from.dc) - profChange },
        damage: { addPerHit: Math.round((to.dpr - from.dpr) / attacks) }
    };
}

// ===== PATHS ======================================================

/**
 * Where each bonus lives, newest dnd5e first. The engine writes to the first candidate that
 * `has(path)` accepts. Verified on dnd5e 6.0.6; the 5.x column is from the system's own
 * key-migration table (see the plan, trap 3).
 */
export const PATHS = Object.freeze({
    attack: (t) => [`system.rolls.attack.${t}.bonus`, `system.bonuses.${t}.attack`],
    damage: (t) => [`system.rolls.damage.${t}.bonus`, `system.bonuses.${t}.damage`],
    initiative: () => ['system.attributes.init.roll.bonus', 'system.attributes.init.bonus'],
    spellDC: () => ['system.bonuses.spell.dc'],
    cr: () => ['system.details.cr'],
    hpMax: () => ['system.attributes.hp.max'],
    hpValue: () => ['system.attributes.hp.value'],
    acOverride: () => ['system.attributes.ac.override'],
    acFlat: () => ['system.attributes.ac.flat'],
    acCalc: () => ['system.attributes.ac.calc'],
    legres: () => ['system.resources.legres.max'],
    legact: () => ['system.resources.legact.max']
});

function firstPath(candidates, has) {
    return candidates.find((p) => has(p)) ?? null;
}

// ===== APPLY ======================================================

/**
 * Turn a spec into update data and a preview, against one creature. Writes nothing and
 * mutates neither argument.
 *
 * @param {Object} source  The snapshot: `{ cr, ac, hpMax, hpValue?, attackBonus?, saveDC?, dpr?, attacksPerRound? }`.
 *   Every figure is the PREPARED value, as the sheet shows it. `attackBonus` and `saveDC` are optional and
 *   only feed the preview totals.
 * @param {Object} spec    See `specFromCR`.
 * @param {Object} io
 * @param {(path: string) => boolean} io.has   Whether the actor's schema has this field.
 * @param {(path: string) => *} io.get         The stored value at this path (for formula merging).
 * @param {'full'|'ratio'} [io.hpValue='full'] Whether current HP is set to the new maximum, or keeps its ratio.
 * @returns {{ updates: Object, preview: Array, warnings: Array, spec: Object }}
 * @throws {NpcScalingError} NO_PATH when a change is asked for and the actor has nowhere to put it.
 */
export function applySpec(source, spec, { has, get, hpValue = 'full' } = {}) {
    if (!spec || typeof spec !== 'object') throw new NpcScalingError('BAD_SPEC', 'A spec is required.');
    if (typeof has !== 'function' || typeof get !== 'function') {
        throw new NpcScalingError('BAD_SPEC', 'applySpec needs `has` and `get` to read the actor.');
    }

    const updates = {};
    const preview = [];
    const warnings = [];
    const row = (key, label, from, to, note = '') => preview.push({ key, label, from, to, note });
    const set = (candidates, value, what) => {
        const path = firstPath(candidates, has);
        if (!path) throw new NpcScalingError('NO_PATH', `This actor has no field to write ${what} to.`);
        updates[path] = value;
        return path;
    };
    const addFormula = (candidates, n, what) => {
        if (!n) return;
        const path = firstPath(candidates, has);
        if (!path) throw new NpcScalingError('NO_PATH', `This actor has no field to write ${what} to.`);
        updates[path] = addToFormula(get(path), n);
    };

    // --- CR ---
    let profChange = 0;
    if (spec.cr?.to !== undefined && spec.cr.to !== null) {
        crKey(spec.cr.to);
        if (source.cr !== null && source.cr !== undefined) profChange = proficiencyForCR(spec.cr.to) - proficiencyForCR(source.cr);
        set(PATHS.cr(), Number(spec.cr.to), 'challenge rating');
        row('cr', 'Challenge rating', source.cr, Number(spec.cr.to));
        if (profChange) row('prof', 'Proficiency bonus', proficiencyForCR(source.cr), proficiencyForCR(spec.cr.to), 'follows CR');
    }

    // --- Hit points ---
    if (spec.hp) {
        const current = Number(source.hpMax) || 0;
        let next = current;
        if (spec.hp.mode === 'delta') next = current + spec.hp.value;
        else if (spec.hp.mode === 'percent') next = Math.round(current * (1 + spec.hp.value / 100));
        else if (spec.hp.mode === 'target') next = spec.hp.value;
        else throw new NpcScalingError('BAD_SPEC', `Unknown hit point mode "${spec.hp.mode}".`);
        next = Math.max(1, Math.round(next));
        if (next !== current) {
            set(PATHS.hpMax(), next, 'hit points');
            const ratio = current > 0 ? Math.min(1, (Number(source.hpValue ?? current)) / current) : 1;
            set(PATHS.hpValue(), hpValue === 'ratio' ? Math.max(1, Math.round(next * ratio)) : next, 'current hit points');
            row('hp', 'Hit points', current, next);
        }
    }

    // --- Armor class ---
    if (spec.ac?.add) {
        const next = Math.max(0, (Number(source.ac) || 0) + spec.ac.add);
        const override = firstPath(PATHS.acOverride(), has);
        if (override) {
            updates[override] = next;
        } else {
            set(PATHS.acFlat(), next, 'armor class');
            set(PATHS.acCalc(), 'flat', 'armor class');
        }
        row('ac', 'Armor class', source.ac, next, 'fixed value, no longer follows equipment');
    }

    // --- Attack bonus ---
    if (spec.attack?.add) {
        for (const t of ATTACK_TYPES) {
            const path = firstPath(PATHS.attack(t), has);
            if (!path) throw new NpcScalingError('NO_PATH', 'This actor has no field to write attack bonuses to.');
            updates[path] = addToFormula(get(path), spec.attack.add);
        }
    }
    if (spec.attack?.add || profChange) {
        if (source.attackBonus !== undefined && source.attackBonus !== null) {
            row('attack', 'Attack bonus', source.attackBonus, source.attackBonus + (spec.attack?.add ?? 0) + profChange);
        } else {
            row('attack', 'Attack bonus', null, null, `${signed((spec.attack?.add ?? 0) + profChange)} in total, including proficiency`);
        }
    }

    // --- Spell save DC ---
    if (spec.saveDC?.add) addFormula(PATHS.spellDC(), spec.saveDC.add, 'spell save DC');
    if (spec.saveDC?.add || profChange) {
        const total = (spec.saveDC?.add ?? 0) + profChange;
        if (source.saveDC !== undefined && source.saveDC !== null) {
            row('saveDC', 'Spell save DC', source.saveDC, source.saveDC + total, 'spells only; fixed DCs on features are not changed');
        } else {
            row('saveDC', 'Spell save DC', null, null, `${signed(total)} in total; spells only, fixed DCs on features are not changed`);
        }
    }

    // --- Initiative ---
    if (spec.initiative?.add) {
        addFormula(PATHS.initiative(), spec.initiative.add, 'initiative');
        row('init', 'Initiative', null, null, `${signed(spec.initiative.add)}`);
    }

    // --- Damage ---
    if (spec.damage?.addPerHit) {
        for (const t of ATTACK_TYPES) {
            const path = firstPath(PATHS.damage(t), has);
            if (!path) throw new NpcScalingError('NO_PATH', 'This actor has no field to write damage bonuses to.');
            updates[path] = addToFormula(get(path), spec.damage.addPerHit);
        }
        const attacks = Math.max(1, Math.round(source.attacksPerRound ?? 1));
        row('damage', 'Damage per hit', null, null, `${signed(spec.damage.addPerHit)} on every weapon and spell attack`);
        if (Number.isFinite(source.dpr)) {
            row('dpr', 'Damage per round (estimate)', source.dpr, source.dpr + spec.damage.addPerHit * attacks);
        }
        if (Number.isFinite(source.avgHit) && source.avgHit > 0 && spec.damage.addPerHit > source.avgHit * 3) {
            warnings.push({
                code: 'DAMAGE_ON_ONE_ATTACK',
                message: `The damage bonus (+${spec.damage.addPerHit}) is more than three times the creature's own average hit (${source.avgHit}). `
                    + 'The damage is carried by too few attacks to read as the same creature.'
            });
        }
    }

    // --- Legendary resistances and actions ---
    if (spec.resources?.legres) {
        set(PATHS.legres(), spec.resources.legres, 'legendary resistances');
        row('legres', 'Legendary resistances', Number(get(PATHS.legres()[0])) || 0, spec.resources.legres);
    }
    if (spec.resources?.legact) {
        set(PATHS.legact(), spec.resources.legact, 'legendary actions');
        row('legact', 'Legendary actions', Number(get(PATHS.legact()[0])) || 0, spec.resources.legact);
    }

    return { updates, preview, warnings, spec };
}

function signed(n) {
    return n < 0 ? `${n}` : `+${n}`;
}

// ===== DAMAGE PER ROUND ===========================================

const COUNT_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 });

/**
 * Read how many attacks a Multiattack feature makes, only when its text says so plainly:
 * "makes two attacks", "makes three weapon attacks". Anything else is `null`, and the caller
 * falls back to one attack. A guess that is sometimes confidently wrong is worse here than
 * an estimate the GM can see is a fallback.
 * @param {string} text  The feature's description, markup allowed.
 * @returns {number|null}
 */
export function parseMultiattackCount(text) {
    const plain = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const m = plain.match(/makes?\s+(one|two|three|four|five|six|\d)\s+(?:[a-z-]+\s+){0,2}attacks?/);
    if (!m) return null;
    const n = COUNT_WORDS[m[1]] ?? Number(m[1]);
    return n >= 1 && n <= 6 ? n : null;
}

/**
 * Estimate a creature's damage per round from its attacks.
 *
 * The estimate is a starting point shown to the GM, who can correct it, so it is kept
 * simple and its failure is visible: with a known attack count the strongest attacks are
 * taken in order and the weakest of those repeated to fill it ("one bite and two claws" is
 * 15 + 9 + 9, not 3 x 15); with no known count it is the single strongest attack.
 *
 * @param {number[]} averages  Average damage of each attack the creature has, in any order.
 * @param {number|null} [count=null]  Attacks per round, from `parseMultiattackCount`.
 * @returns {{ dpr: number, attacksPerRound: number, avgHit: number }}
 */
export function estimateDPR(averages, count = null) {
    const sorted = (averages ?? []).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
    if (!sorted.length) return { dpr: 0, attacksPerRound: count ?? 1, avgHit: 0 };
    const n = count ?? 1;
    let dpr = 0;
    for (let i = 0; i < n; i++) dpr += sorted[Math.min(i, sorted.length - 1)];
    return { dpr, attacksPerRound: n, avgHit: sorted[0] };
}
