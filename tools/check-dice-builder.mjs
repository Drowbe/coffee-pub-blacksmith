#!/usr/bin/env node
/**
 * Guard the Request a Roll dice builder's compose/parse pair, and the rows they read.
 *
 * `_composeDiceBuild` turns the DICE tab's rows into a formula; `parseDiceBuild` turns
 * a formula back into rows. They are inverses, and NOTHING IN FOUNDRY CHECKS THAT.
 * When they disagree the failure is silent and specific: a GM builds
 * "2d10 Strength + 1d4 Bludgeoning + 10", the readout shows it, and the request rolls
 * something else -- or an API caller's formula opens with the wrong dice filled in and
 * the next click on a stepper replaces it.
 *
 * The functions are SLICED OUT OF THE SOURCE and evaluated rather than reimplemented,
 * so this cannot pass against a copy that has drifted from the file. They are pure --
 * regex and string joins, no Foundry API but `Roll.validate`, which is stubbed.
 *
 * Also checks the template rows the reader depends on: the builder has no parallel
 * copy of its state, so a row missing its `data-die`, its count input, or its label
 * input simply drops out of every formula without erroring.
 *
 *   node tools/check-dice-builder.mjs
 *
 * Exits non-zero on a violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SOURCE = 'scripts/window-skillcheck.js';
const TEMPLATE = 'templates/window-skillcheck.hbs';

const problems = [];
const src = read(SOURCE);

// ===== SLICE THE REAL FUNCTIONS ===================================

/**
 * The source of one method, from its signature to its matching closing brace.
 *
 * Anchored to a class-body DEFINITION -- newline, four spaces, signature, ` {` --
 * because a bare name finds the first CALL instead, and slicing from a call site
 * yields a fragment that parses into nonsense rather than a missing-method error.
 */
function slice(name) {
    const signature = `\n    ${name} {`;
    const start = src.indexOf(signature);
    if (start < 0) {
        problems.push(`${SOURCE}: method not found: ${name} -- renamed, or the builder was rewritten`);
        return null;
    }
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    problems.push(`${SOURCE}: unbalanced braces after ${signature}`);
    return null;
}

const methods = [
    'static _sanitizeDiceLabel(raw)',
    'static parseDiceBuild(formula)',
    '_diceRows(root)',
    '_readDiceTerms(root)',
    '_composeDiceBuild(root)'
].map(slice);

if (problems.length) {
    for (const p of problems) console.error(`check-dice-builder: ${p}`);
    process.exit(1);
}

// `Roll.validate` is Foundry's parser. Stubbed as "anything without an empty label",
// which is enough to exercise both branches of the labelled/plain choice.
globalThis.Roll = { validate: (formula) => !/\[\s*\]/.test(formula) };

const Dialog = new Function(`
    class SkillCheckDialog {
        static DICE_MODIFIER_ROW = 'modifier';
        ${methods.join('\n')}
    }
    return SkillCheckDialog;
`)();
const dialog = new Dialog();

// ===== A FAKE ROW ==================================================
// The builder reads `dataset.die` plus two inputs and nothing else, so a row is those
// three things. Kept deliberately minimal: if the reader starts needing more of the
// DOM, this stops compiling and the coupling gets stated here rather than discovered.

const row = (die, count, label = '') => ({
    dataset: { die },
    querySelector: (sel) =>
        sel === '.cpb-dice-count' ? { value: String(count) } :
        sel === '.cpb-dice-reason' ? { value: label } : null
});
const rows = (...list) => ({ querySelectorAll: () => list });

// Keys are sorted before comparing. `counts` and `labels` are built in whatever order
// the dice appear, so `{d10, d4}` and `{d4, d10}` are the same build -- comparing raw
// JSON would fail on insertion order and say nothing about the values.
const show = (value) => JSON.stringify(value, (_key, v) =>
    (v && typeof v === 'object' && !Array.isArray(v))
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v);

const check = (name, actual, expected) => {
    const a = show(actual);
    const e = show(expected);
    if (a !== e) problems.push(`${name}\n    got      ${a}\n    expected ${e}`);
};

// ===== COMPOSE =====================================================

let build = dialog._composeDiceBuild(rows(row('d10', 2, 'Strength'), row('d4', 1, 'Bludgeoning'), row('modifier', 10)));
check('compose: formula carries labels as Foundry flavour', build.formula, '2d10[Strength] + 1d4[Bludgeoning] + 10');
check('compose: title is the readable line', build.title, '2d10 Strength + 1d4 Bludgeoning + 10');
check('compose: plainFormula drops the labels', build.plainFormula, '2d10 + 1d4 + 10');

build = dialog._composeDiceBuild(rows(row('d6', 1), row('modifier', 0)));
check('compose: one unlabelled die', [build.formula, build.title], ['1d6', '1d6']);

build = dialog._composeDiceBuild(rows(row('d20', 1), row('modifier', -2, 'Frightened')));
check('compose: a negative modifier subtracts rather than adding a minus', build.formula, '1d20 - 2[Frightened]');

// The advantage swap in `_executeBuiltInRoll` is a STRING MATCH on `1d20`. One plain
// d20 has to compose to exactly that or advantage silently stops working.
check('compose: a plain single d20 still matches the advantage swap',
    dialog._composeDiceBuild(rows(row('d20', 1), row('modifier', 0))).formula, '1d20');

check('compose: nothing built is no selection', dialog._composeDiceBuild(rows(row('d6', 0), row('modifier', 0))), null);
check('compose: a modifier with no dice is not a roll', dialog._composeDiceBuild(rows(row('d6', 0), row('modifier', 5))), null);

// Brackets are the delimiter, so a bracket in a label ends it early and the rest of
// the formula becomes garbage.
check('compose: brackets are stripped from a label',
    dialog._composeDiceBuild(rows(row('d6', 2, 'a]b[c'), row('modifier', 0))).formula, '2d6[abc]');
check('compose: label whitespace is collapsed',
    dialog._composeDiceBuild(rows(row('d6', 2, '  fire   damage  '), row('modifier', 0))).formula, '2d6[fire damage]');

globalThis.Roll = { validate: () => false };
check('compose: a label the parser rejects costs the label, not the roll',
    dialog._composeDiceBuild(rows(row('d6', 2, 'Fire'), row('modifier', 0))).formula, '2d6');
globalThis.Roll = { validate: (formula) => !/\[\s*\]/.test(formula) };

// ===== PARSE =======================================================

check('parse: a labelled build', Dialog.parseDiceBuild('2d10[Strength] + 1d4[Bludgeoning] + 10'),
    { counts: { d10: 2, d4: 1 }, labels: { d10: 'Strength', d4: 'Bludgeoning' }, modifier: 10, modifierLabel: '' });
check('parse: no spaces', Dialog.parseDiceBuild('2d6+10'), { counts: { d6: 2 }, labels: {}, modifier: 10, modifierLabel: '' });
check('parse: a bare die means one of it', Dialog.parseDiceBuild('d6'), { counts: { d6: 1 }, labels: {}, modifier: 0, modifierLabel: '' });
check('parse: a negative modifier', Dialog.parseDiceBuild('1d20 - 2'), { counts: { d20: 1 }, labels: {}, modifier: -2, modifierLabel: '' });

// Refusing is the point: a formula the rows cannot show must be rolled as the caller
// wrote it, not rewritten into the nearest thing the builder can display.
check('parse: refuses subtracted dice', Dialog.parseDiceBuild('2d6 - 1d4'), null);
check('parse: refuses a second flat term', Dialog.parseDiceBuild('2d6 + 1 + 2'), null);
check('parse: refuses roll data references', Dialog.parseDiceBuild('@abilities.str.mod'), null);
check('parse: refuses a bare number', Dialog.parseDiceBuild('10'), null);
check('parse: refuses nothing', Dialog.parseDiceBuild(''), null);

// ===== THE PAIR ARE INVERSES =======================================

// Compared as PARSED BUILDS, not as strings. Term order is ROW order -- each die has
// one row and the rows are fixed -- so "2d10 + 1d4" comes back as "1d4 + 2d10". The
// sum is the same and the display order is the builder's to choose; what has to
// survive the trip is every die, every count, every label, and the modifier.
for (const formula of ['1d6', '2d6+10', '2d10[Strength] + 1d4[Bludgeoning] + 10', '1d20 - 2[Frightened]', '3d8[Fire]']) {
    const parsed = Dialog.parseDiceBuild(formula);
    if (!parsed) { problems.push(`round trip: parseDiceBuild refused its own output shape: ${formula}`); continue; }
    const list = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
        .map((die) => row(die, parsed.counts[die] ?? 0, parsed.labels[die] ?? ''))
        .concat(row('modifier', parsed.modifier, parsed.modifierLabel));
    const recomposed = dialog._composeDiceBuild(rows(...list))?.formula;
    check(`round trip: ${formula}  (via ${recomposed})`, Dialog.parseDiceBuild(recomposed), parsed);
}

// ===== THE ROWS THE READER DEPENDS ON ==============================

const template = read(TEMPLATE);
const declared = [...template.matchAll(/class="cpb-dice-row[^"]*"\s+data-die="([^"]+)"/g)].map((m) => m[1]);
const expected = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'modifier'];
if (declared.join(',') !== expected.join(',')) {
    problems.push(`${TEMPLATE}: dice rows are [${declared.join(', ')}], expected [${expected.join(', ')}] in that order -- the order is the order terms appear in the formula`);
}

// Every row must carry both inputs: the reader takes a missing one as zero or blank,
// so a typo here drops a die out of every formula without erroring.
//
// A row is sliced from its own `data-die` to the next one rather than by matching
// closing tags -- the rows nest a stepper div, so a `</div>` pair is not where a row
// ends, and a regex that assumes it is silently measures the wrong span.
const rowStarts = [...template.matchAll(/data-die="([^"]+)"/g)];
rowStarts.forEach((match, i) => {
    const die = match[1];
    const body = template.slice(match.index, rowStarts[i + 1]?.index ?? template.length);
    // Exact class attributes: `cpb-dice-countX` contains `cpb-dice-count` but the
    // reader's `.cpb-dice-count` selector would not match it.
    for (const cls of ['cpb-dice-count', 'cpb-dice-reason']) {
        if (!new RegExp(`class="${cls}"`).test(body)) {
            problems.push(`${TEMPLATE}: row "${die}" has no element with class="${cls}" -- the builder reads it by that exact selector and takes a missing one as empty`);
        }
    }
});

// The favourite button must NOT carry `cpb-favorite-toggle`: a capture-phase listener
// on the dialog claims that class for check items, calls stopPropagation, and would
// swallow the builder's own click.
if (/class="[^"]*cpb-favorite-toggle[^"]*cpb-dice-favorite/.test(template)
    || /class="[^"]*cpb-dice-favorite[^"]*cpb-favorite-toggle/.test(template)) {
    problems.push(`${TEMPLATE}: the dice favourite button must not also be a .cpb-favorite-toggle -- the dialog's capture listener would swallow its click`);
}

// ===== REPORT ======================================================

if (problems.length) {
    console.error(`check-dice-builder: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log('check-dice-builder: compose/parse are inverses, and the template rows the reader depends on are all present.');
