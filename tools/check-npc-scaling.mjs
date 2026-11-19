#!/usr/bin/env node
/**
 * Guard the NPC scaling engine (`scripts/utility-npc-scaling.js`).
 *
 * The engine is pure -- plain numbers in, update data and a preview out -- so this check
 * IMPORTS it and runs it, rather than slicing functions out of the source the way the
 * dice-builder check has to for a class that needs Foundry. That is also the first thing
 * checked: the file must stay importable under Node, because the day it reaches for `game`
 * or `foundry` this check stops being able to look at it.
 *
 * What it holds, and why each is easy to lose without anything failing:
 *
 * - The guidelines table is whole and ordered. A missing CR row throws, but a CR that is
 *   LOWER than the one below it in HP or damage scales a creature DOWN while the preview
 *   reads fine, and nothing downstream compares them.
 * - A CR retarget subtracts the proficiency change. dnd5e derives an NPC's proficiency
 *   from `details.cr`, so writing the CR already moves attack bonus and save DC. Forget the
 *   subtraction and every retarget double-counts, silently, by exactly the proficiency gap.
 * - Amounts are row DIFFERENCES added to the creature's own figure, never the row's value.
 *   The table is lopsided at low CR; a 7 HP goblin must stay below the curve, not land on it.
 * - Formula bonuses are merged, never replaced. A GM's own "1d4" must survive.
 * - Bonus paths resolve to what the actor's schema has (6.0.x and 5.x layouts), and an actor
 *   with neither is REFUSED by name instead of being handed a key dnd5e would drop.
 * - Neither the snapshot nor the spec is mutated, and the table cannot be edited in place.
 * - A CR of 0, a fractional CR, and a retarget DOWN all work: the three places a delta
 *   written for "up, whole numbers" quietly breaks.
 *
 *   node tools/check-npc-scaling.mjs
 *
 * Exits non-zero on a violation. Part of the invariant set in CLAUDE.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'scripts/utility-npc-scaling.js';
const problems = [];
const fail = (msg) => problems.push(msg);

// ===== THE FILE MUST STAY PURE ====================================

const src = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

if (/^\s*import\s/m.test(code)) fail(`${SOURCE}: has an import. The engine takes everything it needs as arguments.`);
for (const g of ['game', 'foundry', 'canvas', 'ui', 'Hooks', 'CONFIG', 'Actor', 'ChatMessage']) {
    if (new RegExp(`(?<![\\w.])${g}\\.`).test(code)) fail(`${SOURCE}: reads the Foundry global \`${g}\`. The engine must run under Node.`);
}

const engine = await import(pathToFileURL(path.join(ROOT, SOURCE)).href);
const {
    GUIDELINES, ATTACK_TYPES, NpcScalingError, SPEC_VERSION,
    crKey, proficiencyForCR, guidelineFor, addToFormula, specFromCR, applySpec,
    parseMultiattackCount, estimateDPR, validateTable, buildTable, TABLE_KEYS, deepFreeze, suggestCR
} = engine;

// ===== HELPERS ====================================================

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function expect(label, actual, expected) {
    if (!same(actual, expected)) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function expectThrows(label, code, fn) {
    try {
        fn();
        fail(`${label}: expected NpcScalingError ${code}, nothing was thrown`);
    } catch (e) {
        if (!(e instanceof NpcScalingError) || e.code !== code) fail(`${label}: expected NpcScalingError ${code}, got ${e?.name} ${e?.code ?? ''} ${e?.message ?? e}`);
    }
}

// ===== THE TABLE ==================================================

const KEYS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
// Integer-like keys enumerate first in a JS object, so the fractions trail: compare as sets, not as order.
expect('table keys', Object.keys(GUIDELINES).sort(), [...KEYS].sort());

for (const problem of validateTable(GUIDELINES)) fail(`bundled table: ${problem}`);
if (!Object.isFrozen(GUIDELINES)) fail('GUIDELINES must be frozen: a caller that edits the shared table edits it for every later scaling');

expect('crKey 0.125', crKey(0.125), '1/8');
expect('crKey 0.25', crKey(0.25), '1/4');
expect('crKey 0.5', crKey(0.5), '1/2');
expect('crKey 12', crKey(12), '12');
expect('crKey "12"', crKey('12'), '12');
expectThrows('crKey 31', 'INVALID_CR', () => crKey(31));
expectThrows('crKey 0.3', 'INVALID_CR', () => crKey(0.3));
expectThrows('crKey NaN', 'INVALID_CR', () => crKey('abc'));

// dnd5e's own figures for the proficiency bonus by CR.
expect('prof by CR', [0, 0.25, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29, 30].map(proficiencyForCR),
    [2, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);

// ===== A CR RETARGET: GOBLIN 1/4 -> 12 ============================

// Rows: CR 1/4 -> ac 13, hp mid 43 (42.5 rounded), atk 3, dpr 4.5, dc 13, prof 2.
//       CR 12  -> ac 17, hp mid 243, atk 8, dpr 77.5, dc 17, prof 4.
// profChange = +2, so attack and DC are each reduced by 2 on top of their row gap.
const goblin = Object.freeze({ cr: 0.25, ac: 15, hpMax: 7, hpValue: 7, attackBonus: 4, saveDC: 10, dpr: 5, attacksPerRound: 1, avgHit: 5 });
const spec12 = specFromCR(goblin, 12, { label: 'Super' });

expect('spec version', spec12.version, SPEC_VERSION);
expect('spec label', spec12.label, 'Super');
expect('spec cr', spec12.cr, { to: 12 });
expect('spec hp is the row GAP, not the row', spec12.hp, { mode: 'delta', value: 200 });
expect('spec ac', spec12.ac, { add: 4 });
expect('spec attack is net of proficiency', spec12.attack, { add: 3 });
expect('spec saveDC is net of proficiency', spec12.saveDC, { add: 2 });
// A CR 12 creature makes three attacks, so its new damage per round (5 + 73) is shared across them, less the 5 a hit already does.
expect('spec damage per hit', spec12.damage, { addPerHit: 21 });
expect('spec adds attacks to match the new CR', spec12.attacks, { from: 1, to: 3 });

// What the actor looks like to the schema: dnd5e 6.0.x
const FIELDS_6 = new Set([
    'system.details.cr', 'system.attributes.hp.max', 'system.attributes.hp.value',
    'system.attributes.ac.override', 'system.attributes.ac.flat',
    'system.attributes.init.roll.bonus', 'system.bonuses.spell.dc',
    'system.resources.legres.max', 'system.resources.legact.max',
    ...ATTACK_TYPES.flatMap((t) => [`system.rolls.attack.${t}.bonus`, `system.rolls.damage.${t}.bonus`])
]);
// ... and dnd5e 5.x, where the bonuses lived under `bonuses` and AC was calc + flat.
const FIELDS_5 = new Set([
    'system.details.cr', 'system.attributes.hp.max', 'system.attributes.hp.value',
    'system.attributes.ac.flat', 'system.attributes.ac.calc',
    'system.attributes.init.bonus', 'system.bonuses.spell.dc',
    'system.resources.legres.max', 'system.resources.legact.max',
    ...ATTACK_TYPES.flatMap((t) => [`system.bonuses.${t}.attack`, `system.bonuses.${t}.damage`])
]);
const stored = { 'system.rolls.damage.mwak.bonus': '1d4', 'system.bonuses.mwak.damage': '1d4' };
const io = (fields) => ({ has: (p) => fields.has(p), get: (p) => stored[p] ?? '' });

const plan6 = applySpec(goblin, spec12, io(FIELDS_6));
const u6 = plan6.updates;
expect('6.x cr', u6['system.details.cr'], 12);
expect('6.x hp.max', u6['system.attributes.hp.max'], 207);
expect('6.x hp.value fills to the new max', u6['system.attributes.hp.value'], 207);
expect('6.x ac override', u6['system.attributes.ac.override'], 19);
expect('6.x no 5.x ac keys', 'system.attributes.ac.calc' in u6, false);
expect('6.x attack bonus on all four types', ATTACK_TYPES.map((t) => u6[`system.rolls.attack.${t}.bonus`]), ['3', '3', '3', '3']);
expect('6.x damage merges with the existing 1d4', u6['system.rolls.damage.mwak.bonus'], '1d4 + 21');
expect('6.x damage elsewhere is plain', u6['system.rolls.damage.rwak.bonus'], '21');
expect('6.x spell DC', u6['system.bonuses.spell.dc'], '2');
expect('6.x writes nothing it was not asked to', 'system.attributes.init.roll.bonus' in u6 || 'system.resources.legres.max' in u6, false);

const row = (plan, key) => plan.preview.find((r) => r.key === key);
expect('preview hp', [row(plan6, 'hp').from, row(plan6, 'hp').to], [7, 207]);
expect('preview ac', [row(plan6, 'ac').from, row(plan6, 'ac').to], [15, 19]);
// attack total = 4 now, +3 written, +2 from proficiency following CR.
expect('preview attack total includes proficiency', [row(plan6, 'attack').from, row(plan6, 'attack').to], [4, 9]);
expect('preview save DC total includes proficiency', [row(plan6, 'saveDC').from, row(plan6, 'saveDC').to], [10, 14]);
expect('preview proficiency', [row(plan6, 'prof').from, row(plan6, 'prof').to], [2, 4]);
expect('preview dpr', row(plan6, 'dpr').to, 78);
expect('preview damage per hit shows a value before and after', [row(plan6, 'damage').from, row(plan6, 'damage').to], [5, 26]);
expect('damage per hit with no known hit shows only the amount', row(applySpec({ ...goblin, avgHit: undefined }, spec12, io(FIELDS_6)), 'damage').from, null);
if (!row(plan6, 'ac').note) fail('preview: the AC row must say the scaled value no longer follows equipment');

const plan5 = applySpec(goblin, spec12, io(FIELDS_5));
const u5 = plan5.updates;
expect('5.x attack bonus', u5['system.bonuses.rwak.attack'], '3');
expect('5.x damage merges', u5['system.bonuses.mwak.damage'], '1d4 + 21');
expect('5.x ac is calc flat + flat', [u5['system.attributes.ac.calc'], u5['system.attributes.ac.flat']], ['flat', 19]);
expect('5.x no 6.x ac key', 'system.attributes.ac.override' in u5, false);
expect('5.x no 6.x roll keys', Object.keys(u5).some((k) => k.startsWith('system.rolls.')), false);

// A refusal by name, not a write to a key dnd5e would drop.
const NO_BONUS_FIELDS = new Set(['system.details.cr', 'system.attributes.hp.max', 'system.attributes.hp.value', 'system.attributes.ac.override']);
expectThrows('no attack path', 'NO_PATH', () => applySpec(goblin, spec12, io(NO_BONUS_FIELDS)));

// ===== NOTHING IS MUTATED =========================================

const frozenSpec = Object.freeze({ ...spec12, hp: Object.freeze({ ...spec12.hp }), cr: Object.freeze({ ...spec12.cr }) });
try {
    applySpec(goblin, frozenSpec, io(FIELDS_6));
} catch (e) {
    fail(`applySpec threw on frozen input -- it writes to its arguments: ${e.message}`);
}
expect('snapshot unchanged', { ...goblin }, { cr: 0.25, ac: 15, hpMax: 7, hpValue: 7, attackBonus: 4, saveDC: 10, dpr: 5, attacksPerRound: 1, avgHit: 5 });

// ===== THE EDGES ==================================================

// Same CR is a no-op: nothing to write, nothing to preview.
const same12 = applySpec({ ...goblin, cr: 12 }, specFromCR({ ...goblin, cr: 12 }, 12), io(FIELDS_6));
expect('same CR writes only the CR', Object.keys(same12.updates), ['system.details.cr']);

// CR 0 and a retarget DOWN, where a delta written for "up" goes negative.
const down = specFromCR({ cr: 12, ac: 17, hpMax: 240 }, 1);
expect('down: hp gap is negative', down.hp.value < 0, true);
expect('down: ac gap is negative', down.ac.add < 0, true);
const downPlan = applySpec({ cr: 12, ac: 17, hpMax: 240, hpValue: 240 }, down, io(FIELDS_6));
expect('down: hp never below 1', downPlan.updates['system.attributes.hp.max'] >= 1, true);
expect('down: negative formula merge', addToFormula('1d4', -3), '1d4 - 3');
const zeroUp = specFromCR({ cr: 0, ac: 10, hpMax: 2 }, 0.5);
expect('CR 0 -> 1/2 resolves', zeroUp.cr, { to: 0.5 });

expectThrows('no CR on the source', 'NO_CR', () => specFromCR({ cr: null }, 5));
expectThrows('target CR off the table', 'INVALID_CR', () => specFromCR({ cr: 1 }, 31));
expectThrows('no spec', 'BAD_SPEC', () => applySpec(goblin, null, io(FIELDS_6)));
expectThrows('no io', 'BAD_SPEC', () => applySpec(goblin, spec12, {}));

// hp.value keeps its ratio when asked.
const hurt = applySpec({ ...goblin, hpMax: 10, hpValue: 5 }, { hp: { mode: 'delta', value: 10 } }, { ...io(FIELDS_6), hpValue: 'ratio' });
expect('hp ratio kept', hurt.updates['system.attributes.hp.value'], 10);

// A damage bonus that one attack cannot plausibly carry is flagged, not hidden.
if (!plan6.warnings.some((w) => w.code === 'DAMAGE_ON_ONE_ATTACK')) fail('a +73 per-hit bonus on a 5-damage attack must raise DAMAGE_ON_ONE_ATTACK');
expect('no warning when the bonus is sane', applySpec({ ...goblin, avgHit: 40 }, { damage: { addPerHit: 10 } }, io(FIELDS_6)).warnings, []);

// ===== FORMULAS ===================================================

expect('formula empty', addToFormula('', 3), '3');
expect('formula undefined', addToFormula(undefined, 3), '3');
expect('formula merges', addToFormula('1', 3), '1 + 3');
expect('formula zero keeps the original', addToFormula('1d4', 0), '1d4');
expect('formula zero on empty', addToFormula(null, 0), '');

// ===== DAMAGE PER ROUND ===========================================

expect('multiattack two', parseMultiattackCount('The goblin makes two attacks with its scimitar.'), 2);
expect('multiattack markup', parseMultiattackCount('<p>The dragon makes <strong>three</strong> attacks: one with its bite and two with its claws.</p>'), 3);
expect('multiattack weapon attacks', parseMultiattackCount('The knight makes three weapon attacks.'), 3);
expect('multiattack digit', parseMultiattackCount('The troll makes 3 attacks.'), 3);
expect('multiattack unclear is null', parseMultiattackCount('The beast uses Frightful Presence, then attacks.'), null);
expect('multiattack empty is null', parseMultiattackCount(''), null);
expect('multiattack absent is null', parseMultiattackCount(undefined), null);

expect('dpr one attack', estimateDPR([5]), { dpr: 5, attacksPerRound: 1, avgHit: 5 });
expect('dpr repeats the weakest', estimateDPR([9, 15], 3), { dpr: 33, attacksPerRound: 3, avgHit: 15 });
expect('dpr goblin multiattack', estimateDPR([5], 2), { dpr: 10, attacksPerRound: 2, avgHit: 5 });
expect('dpr ignores junk', estimateDPR([0, NaN, 6, -2]), { dpr: 6, attacksPerRound: 1, avgHit: 6 });
expect('dpr no attacks', estimateDPR([]), { dpr: 0, attacksPerRound: 1, avgHit: 0 });

// Spreading damage across attacks: the gap is divided, so three attacks carry a third each.
expect('per-hit spread across attacks', specFromCR({ cr: 0.25, attacksPerRound: 3 }, 12).damage.addPerHit, 24);

// ===== TEMPLATES ==================================================

const {
    TEMPLATE_VERSION, BUILTIN_TEMPLATES, shiftCR, normalizeTemplate, specFromTemplate, templateFromSpec
} = engine;

// The built-ins are whole, frozen, uniquely named and uniquely identified: a duplicate id makes an
// imported library overwrite one built-in with another, silently.
expect('built-in count', BUILTIN_TEMPLATES.length, 4);
expect('built-in ids unique', new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size, BUILTIN_TEMPLATES.length);
expect('built-in names unique', new Set(BUILTIN_TEMPLATES.map((t) => t.name)).size, BUILTIN_TEMPLATES.length);
if (!Object.isFrozen(BUILTIN_TEMPLATES)) fail('BUILTIN_TEMPLATES must be frozen: a caller editing it edits every world\'s seed');
for (const t of BUILTIN_TEMPLATES) {
    if (!t.id.startsWith('tpl-')) fail(`built-in "${t.name}" has no stable tpl- id`);
    expect(`built-in "${t.name}" is already normalised`, normalizeTemplate(t), { ...t });
}

// A CR step lands on a CR with a row, above and below 1.
expect('shiftCR whole', shiftCR(4, 2), 6);
expect('shiftCR from a fraction lands on a whole CR', shiftCR(0.25, 2), 2);
expect('shiftCR below zero floors at CR 0', shiftCR(0.25, -1), 0);
expect('shiftCR down to a fraction', shiftCR(1, -1), 0);
expect('shiftCR ceiling', shiftCR(29, 5), 30);
expect('shiftCR zero step is the same CR', shiftCR(0.5, 0), 0.5);
for (const [cr, by] of [[0.125, 1], [0.25, 3], [0.5, -1], [3, -5], [20, 12]]) {
    const to = shiftCR(cr, by);
    try { crKey(to); } catch (e) { fail(`shiftCR(${cr}, ${by}) = ${to} has no row in the table`); }
}

// Normalising clamps and refuses what has no name.
expect('normalise clamps hp percent', normalizeTemplate({ name: 'x', hp: { mode: 'percent', value: -500 } }).hp, { mode: 'percent', value: -90 });
expect('normalise defaults hp mode', normalizeTemplate({ name: 'x', hp: { mode: 'nonsense', value: 5 } }).hp.mode, 'percent');
expect('normalise rounds', normalizeTemplate({ name: 'x', ac: 1.6 }).ac, 2);
expect('normalise junk is zero', normalizeTemplate({ name: 'x', damage: 'lots' }).damage, 0);
expect('normalise version', normalizeTemplate({ name: 'x' }).version, TEMPLATE_VERSION);
expectThrows('template with no name', 'BAD_TEMPLATE', () => normalizeTemplate({ crBy: 2 }));
expectThrows('template that is not an object', 'BAD_TEMPLATE', () => normalizeTemplate(null));

// A template's attack and DC are TOTALS: the proficiency change its CR step causes is taken out of them,
// so the sheet shows exactly what the template says. Elite on a goblin steps CR 1/4 to 2 (prof 2 to 2);
// Super steps it to 6 (prof 2 to 3), so each of its +4 is written as +3.
const byName = (n) => BUILTIN_TEMPLATES.find((t) => t.name === n);
const elite = specFromTemplate(byName('Elite'), goblin);
expect('elite cr', elite.cr, { to: 2 });
expect('elite hp is a percentage', elite.hp, { mode: 'percent', value: 50 });
expect('elite attack, no proficiency change', elite.attack, { add: 2 });
expect('elite label is the template name', elite.label, 'Elite');
const superSpec = specFromTemplate(byName('Super'), goblin);
expect('super cr', superSpec.cr, { to: 6 });
expect('super attack is net of proficiency', superSpec.attack, { add: 3 });
expect('super save DC is net of proficiency', superSpec.saveDC, { add: 3 });
expect('super resources', superSpec.resources, { legres: 3 });
const superPlan = applySpec(goblin, superSpec, io(FIELDS_6));
expect('super attack total on the sheet', [row(superPlan, 'attack').from, row(superPlan, 'attack').to], [4, 8]);
expect('super hp is 150% on top', superPlan.updates['system.attributes.hp.max'], 18);
expect('super legendary resistances written', superPlan.updates['system.resources.legres.max'], 3);

// A template that changes nothing about CR works on a creature with no CR; one that steps it does not.
expect('no CR step, no CR needed', specFromTemplate({ name: 'Flat', ac: 1 }, { cr: null }).ac, { add: 1 });
expectThrows('CR step with no CR', 'NO_CR', () => specFromTemplate({ name: 'Up', crBy: 2 }, { cr: null }));

// Saving a spec as a template and applying it back to the same creature is the identity, and the same
// template means the same thing on a creature of another size.
const saved = templateFromSpec(spec12, { cr: 0.25, hpMax: 7 }, 'Goblin to 12');
expect('saved crBy', saved.crBy, 12);
expect('saved attack is the sheet total', saved.attack, 5);
expect('saved hp is a percentage of the creature\'s own', saved.hp.mode, 'percent');
const back = specFromTemplate(saved, goblin);
expect('round trip cr', back.cr, spec12.cr);
expect('round trip attack', back.attack, spec12.attack);
expect('round trip save DC', back.saveDC, spec12.saveDC);
expect('round trip damage', back.damage, spec12.damage);
expect('round trip hp lands on the same maximum',
    applySpec(goblin, back, io(FIELDS_6)).updates['system.attributes.hp.max'], plan6.updates['system.attributes.hp.max']);
const ogre = { cr: 2, ac: 11, hpMax: 59, hpValue: 59, attackBonus: 6, dpr: 13, attacksPerRound: 1, avgHit: 13 };
expect('the same template on an ogre scales its own hit points', applySpec(ogre, specFromTemplate(byName('Elite'), ogre), io(FIELDS_6)).updates['system.attributes.hp.max'], 89);

// ===== A TABLE BUILT FROM CREATURES ===============================

const crOf = (key) => (key.includes('/') ? Number(key.split('/')[0]) / Number(key.split('/')[1]) : Number(key));

// The validator refuses what the engine would silently mis-scale by.
expect('the bundled table is sound', validateTable(GUIDELINES), []);
expect('table keys are the ladder', [...TABLE_KEYS].sort(), [...KEYS].sort());
const broken = JSON.parse(JSON.stringify(GUIDELINES));
broken['10'].ac = 5;
if (!validateTable(broken).some((p) => p.includes('CR 10') && p.includes('ac'))) fail('validateTable must catch armor class falling as CR rises');
delete broken['3'];
if (!validateTable(broken).some((p) => p.includes('CR 3 has no row'))) fail('validateTable must catch a missing row');
const backwards = JSON.parse(JSON.stringify(GUIDELINES));
backwards['5'].hp = [200, 100];
if (!validateTable(backwards).some((p) => p.includes('backwards'))) fail('validateTable must catch a backwards range');
const falling = JSON.parse(JSON.stringify(GUIDELINES));
falling['8'].hp = [10, 20];
if (!validateTable(falling).some((p) => p.includes('hit points fall'))) fail('validateTable must catch hit points falling as CR rises');
if (!validateTable({ ...GUIDELINES, '99': GUIDELINES['1'] }).some((p) => p.includes('"99"'))) fail('validateTable must catch a CR that is not on the ladder');

// Feeding the table its own midpoints, three creatures a row, must give the table back.
const own = TABLE_KEYS.flatMap((key) => {
    const g = guidelineFor(crOf(key));
    return [1, 2, 3].map(() => ({ cr: crOf(key), ac: g.ac, hp: g.hp, atk: g.atk, dpr: g.dpr, dc: g.dc }));
});
const rebuilt = buildTable(own);
expect('the rebuilt table is sound', validateTable(rebuilt.table), []);
expect('every row came from creatures', rebuilt.report.rows.every((r) => r.status === 'sampled'), true);
for (const key of TABLE_KEYS) {
    const a = guidelineFor(crOf(key));
    const b = guidelineFor(crOf(key), rebuilt.table);
    expect(`round trip CR ${key}: ac, attack and DC`, [b.ac, b.atk, b.dc], [a.ac, a.atk, a.dc]);
    if (Math.abs(b.hp - a.hp) > 1 || Math.abs(b.dpr - a.dpr) > 1) fail(`round trip CR ${key}: hp ${a.hp} -> ${b.hp}, dpr ${a.dpr} -> ${b.dpr}`);
}
if (!Object.isFrozen(rebuilt.table) || !Object.isFrozen(rebuilt.table['1'].hp)) fail('a built table must be deeply frozen: a caller editing it edits it for every later scaling');

// The median, not the mean: one 400 hit point giant among three CR 5 creatures does not move the row.
const crowd = (extra) => [
    ...own.filter((s) => s.cr !== 5),
    { cr: 5, ac: 15, hp: 130, atk: 6, dpr: 33, dc: 15 }, { cr: 5, ac: 15, hp: 140, atk: 6, dpr: 35, dc: 15 },
    { cr: 5, ac: 15, hp: 150, atk: 6, dpr: 38, dc: 15 }, ...extra
];
expect('the median ignores an outlier', guidelineFor(5, buildTable(crowd([{ cr: 5, ac: 9, hp: 400, atk: 6, dpr: 33, dc: 15 }])).table).hp, 145);
expect('the same row without it', guidelineFor(5, buildTable(crowd([])).table).hp, 140);

// A creature counts only for the figures it has: no attack means no attack bonus, but it still counts.
const noAttacks = buildTable([...own, ...[1, 2, 3, 4, 5].map(() => ({ cr: 5, ac: 15, hp: 138 }))]);
expect('a creature with no attacks is counted', noAttacks.report.rows.find((r) => r.key === '5').n, 8);
expect('attack bonus is not dragged to zero by it', guidelineFor(5, noAttacks.table).atk, 6);
if (Math.abs(guidelineFor(5, noAttacks.table).dpr - guidelineFor(5).dpr) > 1) fail('damage per round is dragged by creatures that have no attacks');

// A CR with too few creatures is interpolated and SAYS so; the ends copy their neighbour.
const sparse = buildTable(own.filter((s) => s.cr !== 10 && !(s.cr === 11)), { minSamples: 2 });
const status = (key) => sparse.report.rows.find((r) => r.key === key).status;
expect('a CR with no creatures is interpolated', [status('10'), status('11')], ['interpolated', 'interpolated']);
expect('and lies between its neighbours', guidelineFor(10, sparse.table).hp > guidelineFor(9, sparse.table).hp && guidelineFor(10, sparse.table).hp < guidelineFor(12, sparse.table).hp, true);
expect('one creature is below the default minimum', buildTable([...own.filter((s) => s.cr !== 7), { cr: 7, ac: 30, hp: 999, atk: 20, dpr: 500, dc: 30 }]).report.rows.find((r) => r.key === '7').status, 'interpolated');
const topless = buildTable(own.filter((s) => s.cr < 20));
expect('the top end copies the nearest populated row', guidelineFor(30, topless.table).ac, guidelineFor(19, topless.table).ac);
expect('a sparse build is still sound', validateTable(sparse.table), []);

// Noise is smoothed so a row never falls as CR rises, and the row that moved says so.
const noisy = buildTable(own.map((s) => (s.cr === 9 ? { ...s, ac: 12, hp: 100 } : s)));
expect('a noisy build is sound', validateTable(noisy.table), []);
expect('the row the noise hit is reported smoothed', noisy.report.rows.find((r) => r.key === '9').status, 'smoothed');

// Samples are never mutated, junk is ignored, and nothing usable is refused by name.
const frozenSamples = Object.freeze(own.map((s) => Object.freeze({ ...s })));
try { buildTable(frozenSamples); } catch (e) { fail(`buildTable threw on frozen samples -- it writes to its arguments: ${e.message}`); }
expect('a CR with no row is not a sample', buildTable([...own, { cr: 31, ac: 99, hp: 9999 }, { cr: 'x' }, null]).report.samples, own.length);
expectThrows('no creatures at all', 'BAD_TABLE', () => buildTable([]));
expectThrows('creatures with no hit points', 'BAD_TABLE', () => buildTable(own.map((s) => ({ cr: s.cr, ac: s.ac }))));

// ===== DAMAGE WRITTEN INTO THE ACTIONS ============================

const { scaleDamagePart, scaleParts, attacksForCR, describeMultiattack } = engine;

// Dice first, in the part's own die; the remainder (under one die) goes into the flat bonus.
expect('1d8 + 3 by +9 is 3d8 + 3', scaleDamagePart({ number: 1, denomination: 8, bonus: '3' }, 7.5, 9), { number: 3, bonus: '3' });
expect('and by +10 keeps the leftover 1', scaleDamagePart({ number: 1, denomination: 8, bonus: '3' }, 7.5, 10), { number: 3, bonus: '3 + 1' });
expect('a die-less bite of 1 is given d6s', scaleDamagePart({ bonus: '1' }, 1, 14), { number: 4, denomination: 6, bonus: '1' });
expect('a flat bite below one d6 stays flat', scaleDamagePart({ bonus: '1' }, 1, 3), { bonus: '1 + 3' });
expect('a custom formula that starts with dice grows its dice', scaleDamagePart({ custom: { enabled: true, formula: '2d6 + @mod' } }, 10, 7), { 'custom.formula': '4d6 + @mod' });
expect('one that does not just has the amount appended', scaleDamagePart({ custom: { enabled: true, formula: '@mod + 2' } }, 5, 5), { 'custom.formula': '@mod + 2 + 5' });
expect('a trivial change writes nothing', scaleDamagePart({ number: 1, denomination: 8, bonus: '3' }, 7.5, 0.3), null);
expect('junk is refused, not written', scaleDamagePart({ number: 1, denomination: 8 }, NaN, 5), null);
// Scaling down never takes a part below one die, or below 1 damage on average.
const shrunk = scaleDamagePart({ number: 4, denomination: 6, bonus: '' }, 14, -30);
expect('scaled down it keeps one die', shrunk.number, 1);
expect('and never below 1 damage on average', 3.5 + Number(String(shrunk.bonus || 0).replace(/\s/g, '')) >= 1, true);

// Each part grows by the same RATIO: a bite and a claw grow together, each by its own share.
const partsOf = [
    { itemId: 'bite', itemName: 'Bite', path: 'system.activities.a.damage.parts.0', avg: 15, data: { number: 2, denomination: 8, bonus: '6' } },
    { itemId: 'claw', itemName: 'Claw', path: 'system.activities.b.damage.parts.0', avg: 9, data: { number: 2, denomination: 4, bonus: '4' } }
];
const doubled = scaleParts(partsOf, 1);
expect('both parts are edited', doubled.map((e) => e.itemId), ['bite', 'claw']);
expect('the bite gains its own average again', doubled[0].set.number, 2 + Math.trunc(15 / 4.5));
expect('the claw gains its own, a smaller amount', doubled[1].set.number, 2 + Math.trunc(9 / 2.5));

// A plan writes the damage into the parts and NO actor-level bonus, when there is an attack to measure by.
const goblinParts = [{ itemId: 'i1', itemName: 'Scimitar', path: 'system.activities.a1.damage.parts.0', avg: 5, data: { number: 1, denomination: 6, bonus: '2' } }];
const itemPlan = applySpec(goblin, spec12, { ...io(FIELDS_6), parts: goblinParts });
expect('damage went into the action', itemPlan.itemEdits, [{ itemId: 'i1', itemName: 'Scimitar', path: 'system.activities.a1.damage.parts.0', set: { number: 7, bonus: '2' } }]);
expect('and no bonus was written', Object.keys(itemPlan.updates).some((k) => k.includes('damage')), false);
expect('the attack count is in the preview', [row(itemPlan, 'attacks').from, row(itemPlan, 'attacks').to], [1, 3]);
expect('damage per round lands on the table figure', row(itemPlan, 'dpr').to, 78);
// No attack to measure against, or no part to write to, falls back to the bonus.
expect('no known hit falls back to the bonus', Object.keys(applySpec({ ...goblin, avgHit: 0 }, spec12, { ...io(FIELDS_6), parts: goblinParts }).updates).some((k) => k.includes('damage')), true);
expect('no parts falls back to the bonus', applySpec(goblin, spec12, { ...io(FIELDS_6), parts: [] }).itemEdits, []);

// Attacks follow the CR, and are added by a retarget UP only.
expect('attacks by CR', [0, 2, 3, 7, 8, 15, 16, 30].map(attacksForCR), [1, 1, 2, 2, 3, 3, 4, 4]);
expect('a CR 4 badger is given two attacks', specFromCR({ cr: 0, attacksPerRound: 1, avgHit: 1, dpr: 1 }, 4).attacks, { from: 1, to: 2 });
expect('a creature that already makes enough is given none', specFromCR({ cr: 5, attacksPerRound: 3, avgHit: 10, dpr: 30 }, 8).attacks, undefined);
expect('scaling down adds none', specFromCR({ cr: 12, attacksPerRound: 1, avgHit: 40, dpr: 40 }, 8).attacks, undefined);
expect('scaling to the same CR adds none', specFromCR({ cr: 12, attacksPerRound: 1, avgHit: 40, dpr: 40 }, 12).attacks, undefined);
expect('an explicit count wins', specFromCR({ cr: 1, attacksPerRound: 1, avgHit: 5, dpr: 5 }, 6, { attacksTo: 4 }).attacks, { from: 1, to: 4 });
expect('an explicit count below the creature own is ignored', specFromCR({ cr: 1, attacksPerRound: 3, avgHit: 5, dpr: 15 }, 6, { attacksTo: 1 }).attacks, undefined);
// The badger: one hit of 1, CR 0 to 4. Two attacks share the new damage, so each hit grows by less than one hit would alone.
const badger = specFromCR({ cr: 0, attacksPerRound: 1, avgHit: 1, dpr: 1 }, 4);
const alone = specFromCR({ cr: 0, attacksPerRound: 1, avgHit: 1, dpr: 1 }, 4, { attacksTo: 1 });
expect('the badger hit grows by less when two attacks share it', badger.damage.addPerHit < alone.damage.addPerHit, true);

// The Multiattack text names the count in words and says it was scaled.
const text = describeMultiattack({ name: 'Badger', count: 3, from: 1, crTo: 12 });
expect('multiattack says three', text.includes('makes three attacks'), true);
expect('and that it was scaled to CR 12', text.includes('Scaled to CR 12'), true);
expect('and what it was before when that is worth saying', describeMultiattack({ name: 'Ogre', count: 3, from: 2 }).includes('made two before'), true);

// ===== SCENE GUIDANCE =============================================

// A stand-in for EncounterManager.calculateEncounterDifficulty, which needs Foundry. The engine keeps no
// thresholds of its own, so what is checked is that it asks the rule and groups the answers, not the numbers.
const rule = (party, monster) => {
    if (party <= 0 || monster <= 0) return { difficulty: 'None', difficultyClass: 'none' };
    const r = monster / party;
    if (r < 0.25) return { difficulty: 'Trivial', difficultyClass: 'trivial' };
    if (r < 0.5) return { difficulty: 'Easy', difficultyClass: 'easy' };
    if (r < 1) return { difficulty: 'Moderate', difficultyClass: 'medium' };
    if (r < 1.5) return { difficulty: 'Hard', difficultyClass: 'hard' };
    if (r < 2.25) return { difficulty: 'Deadly', difficultyClass: 'deadly' };
    return { difficulty: 'Impossible', difficultyClass: 'impossible' };
};
const g = suggestCR({ partyCR: 10, othersCR: 4, currentCR: 5, chosenCR: 12, difficulty: rule });
expect('guidance is available with a party', g.available, true);
expect('each band is one run of the ladder, from the lowest CR that reaches it',
    g.bands.map((b) => [b.key, b.from, b.to]),
    [['easy', 0, 0.5], ['medium', 1, 5], ['hard', 6, 10], ['deadly', 11, 18], ['impossible', 19, 30]]);
expect('the other monsters are added to the creature', g.now, { key: 'medium', label: 'Moderate', monsterCR: 9, ratio: 0.9 });
expect('a chosen CR is described, with the monsters combined', g.chosen, { cr: 12, key: 'deadly', label: 'Deadly', monsterCR: 16, ratio: 1.6 });
expect('a band the others already overshoot is absent', suggestCR({ partyCR: 10, othersCR: 30, difficulty: rule }).bands.map((b) => b.key), ['impossible']);
expect('no party, no guidance', suggestCR({ partyCR: 0, othersCR: 4, difficulty: rule }).available, false);
expect('no rule, no guidance', suggestCR({ partyCR: 10 }).available, false);
expect('a CR that rates as nothing is left out of the bands', suggestCR({ partyCR: 10, othersCR: 0, difficulty: rule }).bands[0].from, 0.125);
expect('a creature not on the scene: "now" is the scene without it', suggestCR({ partyCR: 10, othersCR: 4, difficulty: rule }).now, { key: 'easy', label: 'Easy', monsterCR: 4, ratio: 0.4 });
expect('an empty scene reads None, and is not a band', [suggestCR({ partyCR: 10, difficulty: rule }).now?.key, suggestCR({ partyCR: 10, difficulty: rule }).bands.some((b) => b.key === 'none')], ['none', false]);
const ladder = suggestCR({ partyCR: 10, othersCR: 4, difficulty: rule }).bands;
expect('bands cover the ladder without a gap', ladder.every((b, i) => i === 0 || b.from > ladder[i - 1].to), true);

// The meter's zones are the rule laid along one axis, as runs of monsters-to-party ratio, with no threshold held here.
expect('zones follow the rule along the ratio axis', g.zones.map((z) => [z.key, z.from, z.to]),
    [['trivial', 0, 0.25], ['easy', 0.25, 0.5], ['medium', 0.5, 1], ['hard', 1, 1.5], ['deadly', 1.5, 2.25], ['impossible', 2.25, 2.5]]);
expect('the axis is exposed', g.maxRatio, 2.5);
expect('zones do not depend on the creature', suggestCR({ partyCR: 10, othersCR: 30, difficulty: rule }).zones, g.zones);

// How many of the creature: the others plus N times its rating.
const three = suggestCR({ partyCR: 10, othersCR: 4, currentCR: 5, chosenCR: 5, count: 3, difficulty: rule });
expect('three of them at CR 5 add fifteen', three.chosen, { cr: 5, key: 'deadly', label: 'Deadly', monsterCR: 19, ratio: 1.9 });
expect('bands are for that many', three.bands.map((b) => [b.key, b.from, b.to]),
    [['easy', 0, 0.25], ['medium', 0.5, 1], ['hard', 2, 3], ['deadly', 4, 6], ['impossible', 7, 30]]);
expect('now is the scene as it stands, whatever the count', three.now, g.now);
expect('the count is clamped to 1 to 20', [suggestCR({ partyCR: 10, count: 0, difficulty: rule }).count, suggestCR({ partyCR: 10, count: 99, difficulty: rule }).count, suggestCR({ partyCR: 10, count: 'x', difficulty: rule }).count], [1, 20, 1]);

// ===== RESULT =====================================================

if (problems.length) {
    for (const p of problems) console.error(`check-npc-scaling: ${p}`);
    console.error(`check-npc-scaling: FAILED (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
    process.exit(1);
}
console.log(`check-npc-scaling: OK (${KEYS.length} table rows, engine importable under Node)`);
