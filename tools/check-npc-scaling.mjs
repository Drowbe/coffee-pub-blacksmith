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
    parseMultiattackCount, estimateDPR
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

const order = ['ac', 'atk', 'dc'];
let prev = null;
for (const key of KEYS) {
    const row = GUIDELINES[key];
    if (!(row.hp[0] <= row.hp[1])) fail(`table CR ${key}: hp range is backwards ${row.hp}`);
    if (!(row.dpr[0] <= row.dpr[1])) fail(`table CR ${key}: dpr range is backwards ${row.dpr}`);
    if (prev) {
        for (const col of order) {
            if (row[col] < prev[col]) fail(`table CR ${key}: ${col} ${row[col]} is below the row before it (${prev[col]})`);
        }
        if (row.hp[0] <= prev.hp[1] && row.hp[0] !== prev.hp[1] + 1 && row.hp[0] < prev.hp[0]) fail(`table CR ${key}: hp falls below the row before it`);
        if (row.hp[0] < prev.hp[0] || row.hp[1] < prev.hp[1]) fail(`table CR ${key}: hp is below the row before it`);
        if (row.dpr[0] < prev.dpr[0] || row.dpr[1] < prev.dpr[1]) fail(`table CR ${key}: dpr is below the row before it`);
    }
    prev = row;
}
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
expect('spec damage per hit', spec12.damage, { addPerHit: 73 });

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
expect('6.x damage merges with the existing 1d4', u6['system.rolls.damage.mwak.bonus'], '1d4 + 73');
expect('6.x damage elsewhere is plain', u6['system.rolls.damage.rwak.bonus'], '73');
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
if (!row(plan6, 'ac').note) fail('preview: the AC row must say the scaled value no longer follows equipment');

const plan5 = applySpec(goblin, spec12, io(FIELDS_5));
const u5 = plan5.updates;
expect('5.x attack bonus', u5['system.bonuses.rwak.attack'], '3');
expect('5.x damage merges', u5['system.bonuses.mwak.damage'], '1d4 + 73');
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

// ===== RESULT =====================================================

if (problems.length) {
    for (const p of problems) console.error(`check-npc-scaling: ${p}`);
    console.error(`check-npc-scaling: FAILED (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
    process.exit(1);
}
console.log(`check-npc-scaling: OK (${KEYS.length} table rows, engine importable under Node)`);
