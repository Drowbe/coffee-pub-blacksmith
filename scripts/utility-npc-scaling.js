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
 * Codes: NO_CR, INVALID_CR, NO_PATH, BAD_SPEC, BAD_TEMPLATE, BAD_TABLE.
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

// ===== GUIDELINES FROM SAMPLES ====================================

/** Every CR the table has a row for, as the keys the table uses, in order. */
export const TABLE_KEYS = Object.freeze([0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)].map((cr) => crKey(cr)));

const midpoint = (range) => (range[0] + range[1]) / 2;

/**
 * Whether a table is one the engine can scale with. Returns the problems, empty when it is sound.
 *
 * "Sound" is what the engine silently relies on: a row for every CR, finite numbers, ranges the right way
 * round, and armor class, attack bonus, save DC, hit points and damage that never FALL as CR rises. A row
 * that falls scales a creature DOWN while the preview reads fine, and nothing downstream compares rows.
 *
 * @param {Object} table
 * @returns {string[]}
 */
export function validateTable(table) {
    const problems = [];
    if (!table || typeof table !== 'object') return ['the table is not an object'];
    const keys = Object.keys(table);
    for (const key of TABLE_KEYS) if (!(key in table)) problems.push(`CR ${key} has no row`);
    for (const key of keys) if (!TABLE_KEYS.includes(key)) problems.push(`"${key}" is not a challenge rating`);
    if (problems.length) return problems;

    let prev = null;
    for (const key of TABLE_KEYS) {
        const row = table[key];
        const numbers = [row?.ac, row?.atk, row?.dc, ...(row?.hp ?? [NaN]), ...(row?.dpr ?? [NaN])];
        if (!Array.isArray(row?.hp) || row.hp.length !== 2 || !Array.isArray(row?.dpr) || row.dpr.length !== 2
            || numbers.some((n) => !Number.isFinite(n))) {
            problems.push(`CR ${key}: every figure must be a number, and hp and dpr a [min, max] pair`);
            continue;
        }
        if (row.hp[0] > row.hp[1]) problems.push(`CR ${key}: hp range is backwards`);
        if (row.dpr[0] > row.dpr[1]) problems.push(`CR ${key}: dpr range is backwards`);
        if (prev) {
            for (const col of ['ac', 'atk', 'dc']) {
                if (row[col] < prev[col]) problems.push(`CR ${key}: ${col} ${row[col]} is below the row before it (${prev[col]})`);
            }
            if (midpoint(row.hp) < midpoint(prev.hp)) problems.push(`CR ${key}: hit points fall below the row before it`);
            if (midpoint(row.dpr) < midpoint(prev.dpr)) problems.push(`CR ${key}: damage per round falls below the row before it`);
        }
        prev = row;
    }
    return problems;
}

/** Freeze a plain-data object and everything inside it. */
export function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

const USABLE = Object.freeze({
    ac: (v) => Number.isFinite(v) && v > 0,
    hp: (v) => Number.isFinite(v) && v > 0,
    atk: (v) => Number.isFinite(v),
    dpr: (v) => Number.isFinite(v) && v > 0,
    dc: (v) => Number.isFinite(v) && v > 0
});

function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Fill the gaps in a list by straight lines between the nearest known neighbours; ends copy the nearest. */
function fillGaps(points) {
    const known = points.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    if (!known.length) return null;
    return points.map((v, i) => {
        if (v !== null) return v;
        const lo = [...known].reverse().find((k) => k < i);
        const hi = known.find((k) => k > i);
        if (lo === undefined) return points[hi];
        if (hi === undefined) return points[lo];
        return points[lo] + (points[hi] - points[lo]) * ((i - lo) / (hi - lo));
    });
}

/** Weighted pool-adjacent-violators: the closest non-decreasing sequence to `values`. */
function isotonic(values, weights) {
    const blocks = [];
    values.forEach((v, i) => {
        blocks.push({ sum: v * weights[i], w: weights[i], n: 1 });
        while (blocks.length > 1) {
            const b = blocks[blocks.length - 1];
            const a = blocks[blocks.length - 2];
            if (a.sum / a.w <= b.sum / b.w) break;
            blocks.splice(-2, 2, { sum: a.sum + b.sum, w: a.w + b.w, n: a.n + b.n });
        }
    });
    return blocks.flatMap((b) => Array(b.n).fill(b.sum / b.w));
}

/**
 * Build a guidelines table from creatures: for each CR, the typical armor class, hit points, best attack bonus,
 * damage per round and save DC of the creatures at that CR.
 *
 * - **Typical is the median**, so one outlier (a low-AC, high-HP giant) does not drag a row. Hit points and
 *   damage carry a band of half the interquartile range either side, so the band centres on the median and
 *   the engine, which reads the midpoint, reads the median.
 * - **A creature counts for a figure only when it has one.** A creature with no attack has no attack bonus
 *   and no damage per round; it still counts for armor class and hit points.
 * - **A CR with fewer than `minSamples` creatures is interpolated** between its nearest populated neighbours
 *   (the ends copy the nearest), and its few creatures are ignored for that row. The result says which rows
 *   these were, so a GM is not shown a guess as a measurement.
 * - **The columns are then smoothed to never fall as CR rises**, by the closest non-decreasing fit, because
 *   real stat blocks are noisy and the engine takes gaps between rows. A row moved by more than rounding is
 *   reported as smoothed.
 *
 * @param {Array<{ cr: number, ac?: number, hp?: number, atk?: number, dpr?: number, dc?: number }>} samples
 * @param {Object} [options]
 * @param {number} [options.minSamples=2]
 * @returns {{ table: Object, report: { samples: number, minSamples: number, rows: Array<{ key: string, n: number, status: 'sampled'|'smoothed'|'interpolated' }> } }}
 * @throws {NpcScalingError} BAD_TABLE when no creature gave a usable figure for a column.
 */
export function buildTable(samples, { minSamples = 2 } = {}) {
    const byKey = new Map(TABLE_KEYS.map((key) => [key, []]));
    let counted = 0;
    for (const sample of samples ?? []) {
        let key;
        try { key = crKey(sample?.cr); } catch (error) { continue; } // a CR the table has no row for is not a sample
        byKey.get(key).push(sample);
        counted++;
    }

    const rows = TABLE_KEYS.map((key) => {
        const own = byKey.get(key);
        const enough = own.length >= minSamples;
        const stat = {};
        for (const metric of Object.keys(USABLE)) {
            const values = enough ? own.map((s) => Number(s[metric])).filter(USABLE[metric]).sort((a, b) => a - b) : [];
            stat[metric] = values.length ? { mid: quantile(values, 0.5), spread: (quantile(values, 0.75) - quantile(values, 0.25)) / 2 } : null;
        }
        return { key, n: own.length, stat };
    });

    const columns = {};
    const spreads = {};
    const interpolated = new Set();
    for (const metric of Object.keys(USABLE)) {
        const raw = rows.map((r) => r.stat[metric]?.mid ?? null);
        const filled = fillGaps(raw);
        if (!filled) throw new NpcScalingError('BAD_TABLE', `None of the ${counted} creature(s) has a usable ${metric}, so no table can be built.`);
        rows.forEach((r, i) => { if (raw[i] === null) interpolated.add(r.key); });
        const weights = rows.map((r) => (r.stat[metric] ? Math.max(1, r.n) : 0.25));
        columns[metric] = { raw: filled, smooth: isotonic(filled, weights) };
        const rawSpread = fillGaps(rows.map((r) => r.stat[metric]?.spread ?? null));
        spreads[metric] = rawSpread ?? rows.map(() => 0);
    }

    const table = {};
    const report = rows.map((r, i) => {
        const smoothed = Object.keys(USABLE).some((m) => Math.abs(columns[m].smooth[i] - columns[m].raw[i]) > 0.5);
        const band = (metric, floor) => {
            const mid = Math.max(floor, Math.round(columns[metric].smooth[i]));
            const spread = Math.min(Math.round(spreads[metric][i]), mid - floor);
            return [mid - spread, mid + spread];
        };
        table[r.key] = {
            ac: Math.round(columns.ac.smooth[i]),
            hp: band('hp', 1),
            atk: Math.round(columns.atk.smooth[i]),
            dpr: band('dpr', 0),
            dc: Math.round(columns.dc.smooth[i])
        };
        return { key: r.key, n: r.n, status: interpolated.has(r.key) ? 'interpolated' : (smoothed ? 'smoothed' : 'sampled') };
    });

    return { table: deepFreeze(table), report: { samples: counted, minSamples, rows: report } };
}

// ===== TEMPLATES ==================================================

/** Version stamped on a template, so an exported library can be recognised later. */
export const TEMPLATE_VERSION = 1;

/** The CRs a retarget can land on, in order. */
const CR_LADDER = Object.freeze([0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)]);

/**
 * Move a CR by a number of whole steps and land on a CR the table has a row for.
 * Above CR 1 the step is exact (4 + 2 = 6). Below it the result snaps to the nearest fraction, so a
 * template that says "two up" never produces a CR (2.25) with no row.
 * @param {number} cr
 * @param {number} by  Whole steps; negative goes down.
 * @returns {number}
 */
export function shiftCR(cr, by) {
    const n = Number(cr) + Number(by);
    if (n >= 1) return Math.min(30, Math.round(n));
    return CR_LADDER.filter((v) => v < 1).reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), 0);
}

const HP_MODES = Object.freeze(['percent', 'delta']);
const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

/**
 * Normalise one template: every field present, every number a whole number in a sane range.
 *
 * A template is NUMBERS WRITTEN IN, not derived from a CR gap. Its `attack` and `saveDC` are the totals a
 * sheet would show (proficiency included), and `specFromTemplate` subtracts the proficiency change the CR
 * step causes, exactly as `specFromCR` does. `damage` is per hit. `hp` is a percentage of the creature's own
 * maximum (or a flat amount), so a template means the same thing on a goblin and on a dragon.
 *
 * @param {Object} raw
 * @returns {{ id: string, name: string, version: number, crBy: number, hp: { mode: string, value: number }, ac: number, attack: number, saveDC: number, initiative: number, damage: number, legres: number, legact: number }}
 * @throws {NpcScalingError} BAD_TEMPLATE when it has no name or is not an object.
 */
export function normalizeTemplate(raw) {
    if (!raw || typeof raw !== 'object') throw new NpcScalingError('BAD_TEMPLATE', 'A template must be an object.');
    const name = String(raw.name ?? '').trim().slice(0, 40);
    if (!name) throw new NpcScalingError('BAD_TEMPLATE', 'A template needs a name.');
    const mode = HP_MODES.includes(raw.hp?.mode) ? raw.hp.mode : 'percent';
    return {
        id: String(raw.id ?? '').trim(),
        name,
        version: TEMPLATE_VERSION,
        crBy: int(raw.crBy, -30, 30),
        hp: mode === 'percent'
            // The ceiling is high on purpose: a 7 hit point goblin taken to CR 12 is +2857%.
            ? { mode, value: int(raw.hp?.value, -90, 10000) }
            : { mode, value: int(raw.hp?.value, -10000, 10000) },
        ac: int(raw.ac, -10, 10),
        attack: int(raw.attack, -10, 20),
        saveDC: int(raw.saveDC, -10, 20),
        initiative: int(raw.initiative, -10, 20),
        damage: int(raw.damage, -50, 500),
        legres: int(raw.legres, 0, 10),
        legact: int(raw.legact, 0, 10)
    };
}

/**
 * Turn a template into a concrete spec for ONE creature. The CR step is resolved against the creature's own
 * CR, and the proficiency change that CR step causes is subtracted from attack and save DC (dnd5e already
 * applies it when `details.cr` is written).
 *
 * @param {Object} template  A normalised template.
 * @param {{ cr: number|null }} source
 * @returns {Object} A spec, ready for `applySpec`.
 * @throws {NpcScalingError} NO_CR when the template steps the CR and the creature has none.
 */
export function specFromTemplate(template, source) {
    const t = normalizeTemplate(template);
    const hasCR = source?.cr !== null && source?.cr !== undefined && Number.isFinite(Number(source.cr));
    const spec = { version: SPEC_VERSION, label: t.name };

    let profChange = 0;
    if (t.crBy) {
        if (!hasCR) throw new NpcScalingError('NO_CR', `"${t.name}" changes the challenge rating, and this creature has none.`);
        const to = shiftCR(source.cr, t.crBy);
        if (to !== Number(source.cr)) {
            spec.cr = { to };
            profChange = proficiencyForCR(to) - proficiencyForCR(source.cr);
        }
    }
    if (t.hp.value) spec.hp = { mode: t.hp.mode, value: t.hp.value };
    if (t.ac) spec.ac = { add: t.ac };
    if (t.attack - profChange) spec.attack = { add: t.attack - profChange };
    if (t.saveDC - profChange) spec.saveDC = { add: t.saveDC - profChange };
    if (t.initiative) spec.initiative = { add: t.initiative };
    if (t.damage) spec.damage = { addPerHit: t.damage };
    if (t.legres || t.legact) {
        spec.resources = {};
        if (t.legres) spec.resources.legres = t.legres;
        if (t.legact) spec.resources.legact = t.legact;
    }
    return spec;
}

/**
 * The inverse of `specFromTemplate`, for "save this scaling as a template". Absolute amounts become the
 * portable form: a hit point change becomes a percentage of the creature's own maximum, an attack bonus
 * becomes the total change including proficiency, and the CR change becomes a step.
 *
 * @param {Object} spec     A spec (from `specFromCR` or `specFromTemplate`).
 * @param {{ cr: number|null, hpMax?: number }} source  The creature the spec was made for.
 * @param {string} name
 * @returns {Object} A normalised template with no id.
 */
export function templateFromSpec(spec, source, name) {
    const hasCR = source?.cr !== null && source?.cr !== undefined && Number.isFinite(Number(source.cr));
    const to = spec.cr?.to;
    const crBy = hasCR && to !== undefined && to !== null ? Math.round(Number(to) - Number(source.cr)) : 0;
    const profChange = hasCR && to !== undefined && to !== null ? proficiencyForCR(to) - proficiencyForCR(source.cr) : 0;

    let hp = { mode: 'percent', value: 0 };
    if (spec.hp?.mode === 'percent') hp = { mode: 'percent', value: spec.hp.value };
    else if (spec.hp?.mode === 'delta') {
        hp = Number(source?.hpMax) > 0
            ? { mode: 'percent', value: (spec.hp.value / source.hpMax) * 100 }
            : { mode: 'delta', value: spec.hp.value };
    } else if (spec.hp?.mode === 'target' && Number(source?.hpMax) > 0) {
        hp = { mode: 'percent', value: ((spec.hp.value - source.hpMax) / source.hpMax) * 100 };
    }

    return normalizeTemplate({
        name,
        crBy,
        hp,
        ac: spec.ac?.add ?? 0,
        attack: (spec.attack?.add ?? 0) + profChange,
        saveDC: (spec.saveDC?.add ?? 0) + profChange,
        initiative: spec.initiative?.add ?? 0,
        damage: spec.damage?.addPerHit ?? 0,
        legres: spec.resources?.legres ?? 0,
        legact: spec.resources?.legact ?? 0
    });
}

/**
 * The templates a world starts with. Starting points and nothing more: the numbers are this module's own
 * judgement, not a published rule, and the GM edits or deletes them freely.
 * Ids are fixed so an export imported into a second world updates these rather than duplicating them.
 */
export const BUILTIN_TEMPLATES = Object.freeze([
    { id: 'tpl-weakened', name: 'Weakened',  crBy: -1, hp: { mode: 'percent', value: -25 }, ac: -1, attack: -1, saveDC: -1, damage: -2 },
    { id: 'tpl-elite',    name: 'Elite',     crBy: 2,  hp: { mode: 'percent', value: 50 },  ac: 1,  attack: 2,  saveDC: 2,  damage: 3 },
    { id: 'tpl-champion', name: 'Champion',  crBy: 4,  hp: { mode: 'percent', value: 100 }, ac: 2,  attack: 3,  saveDC: 3,  damage: 6,  legres: 1 },
    { id: 'tpl-super',    name: 'Super',     crBy: 6,  hp: { mode: 'percent', value: 150 }, ac: 2,  attack: 4,  saveDC: 4,  damage: 10, legres: 3 }
].map((t) => Object.freeze({ ...normalizeTemplate(t), id: t.id })));

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
        // With the creature's own average hit known the row shows what a hit does now and after; without it, only the amount.
        const known = Number.isFinite(source.avgHit) && source.avgHit > 0;
        row('damage', 'Damage per hit', known ? Math.round(source.avgHit) : null, known ? Math.round(source.avgHit + spec.damage.addPerHit) : null,
            `${signed(spec.damage.addPerHit)} on every weapon and spell attack`);
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
