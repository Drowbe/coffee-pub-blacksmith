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
 * Also checks two things next to it:
 *
 * - The TEMPLATE rows and controls the builder reads by selector. It keeps no parallel
 *   copy of its state, so a row missing its `data-die` or an input simply drops out of
 *   every formula, and a renamed control attaches no listener -- neither errors.
 * - That `prepareRollData` describes the roll the window will actually make. It used to
 *   hardcode a `1d20` base and an ability modifier for every type, so a dice request
 *   opened a window reading "1D20 + 2 INT" while rolling the right dice. Nothing
 *   downstream disagreed, which is exactly why it survived.
 * - That every branch of `_executeFavoriteFromRecord` carries the favourite's cinematic
 *   flag. A branch that drops it does not fail -- the request just quietly goes to chat,
 *   which is the default and looks like nothing went wrong.
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
const ROLLS = 'scripts/manager-rolls.js';

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
    'static _diceRowCount(row)',
    'static diceFormulaDisplay(formula)',
    'static parseDiceBuild(formula)',
    '_diceRows(root)',
    '_readDiceTerms(root)',
    '_diceRollName(root)',
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
        static DICE_DEFAULT_TITLE = 'Custom Dice Roll';
        ${methods.join('\n')}
    }
    return SkillCheckDialog;
`)();
const dialog = new Dialog();

// ===== A FAKE ROW ==================================================
// The builder reads `dataset.die` plus two inputs and nothing else, so a row is those
// three things. Kept deliberately minimal: if the reader starts needing more of the
// DOM, this stops compiling and the coupling gets stated here rather than discovered.

const row = (die, count, label = '', order = 0) => ({
    dataset: { die, diceOrder: String(order) },
    querySelector: (sel) =>
        sel === '.cpb-dice-count' ? { value: String(count) } :
        sel === '.cpb-dice-reason' ? { value: label } : null
});
// `.cpb-dice-name` hangs off the root rather than a row: it names the whole roll.
// Held in a variable a test can set, since the name is an input on the page and not
// something the row list can carry.
let typedName = '';
const rows = (...list) => ({
    querySelectorAll: () => list,
    querySelector: (sel) => (sel === '.cpb-dice-name' ? { value: typedName } : null)
});

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
check('compose: display is the readable line', build.display, '2d10 Strength + 1d4 Bludgeoning + 10');
check('compose: plainFormula drops the labels', build.plainFormula, '2d10 + 1d4 + 10');

build = dialog._composeDiceBuild(rows(row('d6', 1), row('modifier', 0)));
check('compose: one unlabelled die', [build.formula, build.display], ['1d6', '1d6']);

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

// `order` is the dice as WRITTEN, which is what the stamps are restored from -- it is
// the whole reason a remembered roll reopens reading the way it was saved.
check('parse: a labelled build', Dialog.parseDiceBuild('2d10[Strength] + 1d4[Bludgeoning] + 10'),
    { counts: { d10: 2, d4: 1 }, labels: { d10: 'Strength', d4: 'Bludgeoning' }, order: ['d10', 'd4'], modifier: 10, modifierLabel: '' });
check('parse: order follows the formula, not die size', Dialog.parseDiceBuild('1d4 + 2d10').order, ['d4', 'd10']);
check('parse: no spaces', Dialog.parseDiceBuild('2d6+10'), { counts: { d6: 2 }, labels: {}, order: ['d6'], modifier: 10, modifierLabel: '' });
check('parse: a bare die means one of it', Dialog.parseDiceBuild('d6'), { counts: { d6: 1 }, labels: {}, order: ['d6'], modifier: 0, modifierLabel: '' });
check('parse: a negative modifier', Dialog.parseDiceBuild('1d20 - 2'), { counts: { d20: 1 }, labels: {}, order: ['d20'], modifier: -2, modifierLabel: '' });

// Refusing is the point: a formula the rows cannot show must be rolled as the caller
// wrote it, not rewritten into the nearest thing the builder can display.
check('parse: refuses subtracted dice', Dialog.parseDiceBuild('2d6 - 1d4'), null);
check('parse: refuses a second flat term', Dialog.parseDiceBuild('2d6 + 1 + 2'), null);
check('parse: refuses roll data references', Dialog.parseDiceBuild('@abilities.str.mod'), null);
check('parse: refuses a bare number', Dialog.parseDiceBuild('10'), null);
check('parse: refuses nothing', Dialog.parseDiceBuild(''), null);

// ===== THE PAIR ARE INVERSES =======================================

// The rows are stamped from `parsed.order`, which is what `_applyDiceBuild` does --
// so this exercises order preservation rather than assuming it. A formula must come
// back CHARACTER FOR CHARACTER, including the order its dice were written in.
for (const formula of ['1d6', '2d6 + 10', '2d10[Strength] + 1d4[Bludgeoning] + 10', '1d20 - 2[Frightened]', '1d4 + 2d10', '3d8[Fire]']) {
    const parsed = Dialog.parseDiceBuild(formula);
    if (!parsed) { problems.push(`round trip: parseDiceBuild refused its own output shape: ${formula}`); continue; }
    const list = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
        .map((die) => row(die, parsed.counts[die] ?? 0, parsed.labels[die] ?? '', parsed.order.indexOf(die) + 1))
        .concat(row('modifier', parsed.modifier, parsed.modifierLabel));
    check(`round trip: ${formula}`, dialog._composeDiceBuild(rows(...list))?.formula, formula);
}

// ===== TERM ORDER IS THE ORDER THE DICE WERE SET ===================
// Row order would be the obvious implementation and is the wrong one: which die the
// GM reached for first is a fact about the roll, and it is what reads right on the
// card. A regression here is invisible -- the sum is identical either way.

check('order: dice appear in the order they were set, not row order',
    dialog._composeDiceBuild(rows(row('d4', 1, '', 2), row('d10', 2, '', 1), row('modifier', 0))).plainFormula,
    '2d10 + 1d4');
check('order: reversing the stamps reverses the formula',
    dialog._composeDiceBuild(rows(row('d4', 1, '', 1), row('d10', 2, '', 2), row('modifier', 0))).plainFormula,
    '1d4 + 2d10');
check('order: the modifier is last however it was stamped',
    dialog._composeDiceBuild(rows(row('modifier', 3, '', 1), row('d6', 1, '', 2), row('d20', 1, '', 3))).plainFormula,
    '1d6 + 1d20 + 3');

// ===== THE NAME ====================================================

typedName = '';
check('name: an unnamed roll gets the default title',
    dialog._composeDiceBuild(rows(row('d6', 1, '', 1), row('modifier', 0))).name, 'Custom Dice Roll');
typedName = '  Sneak Attack  ';
check('name: a typed name is trimmed and used',
    dialog._composeDiceBuild(rows(row('d6', 1, '', 1), row('modifier', 0))).name, 'Sneak Attack');
typedName = '';

// ===== FORMULA AS PROSE ============================================
// One implementation, used by the builder and by the silent API path. Two would be
// how the card and the cinematic plate come to disagree.

check('display: brackets become words',
    Dialog.diceFormulaDisplay('2d10[Strength] + 1d4[Bludgeoning] + 10'),
    '2d10 Strength + 1d4 Bludgeoning + 10');
check('display: an unlabelled formula is unchanged', Dialog.diceFormulaDisplay('2d6 + 10'), '2d6 + 10');
check('display: agrees with the build it came from',
    dialog._composeDiceBuild(rows(row('d10', 2, 'Strength', 1), row('d4', 1, 'Bludgeoning', 2), row('modifier', 10))).display,
    '2d10 Strength + 1d4 Bludgeoning + 10');

// ===== THE ROLL WINDOW DESCRIBES THE ROLL IT WILL MAKE =============
//
// `prepareRollData` feeds the Roll Configuration window's formula line. It used to
// hardcode a `1d20` base and add an ability modifier for EVERY roll type, falling back
// to `int` for anything it did not recognise -- so a request for
// "2d10 Strength + 2d4 Smackdown + 2" opened a window reading "1D20 + 2 INT".
//
// THE ROLL WAS ALWAYS CORRECT. `_executeBuiltInRoll` reads the value directly, so the
// dice that fell and the tooltip afterwards were right and only the window lied, which
// is precisely why it survived: nothing downstream disagreed with anything.

const rollsSrc = read(ROLLS);
const prepareStart = rollsSrc.indexOf('\nasync function prepareRollData(actor, type, value) {');
if (prepareStart < 0) {
    problems.push(`${ROLLS}: prepareRollData not found -- renamed, or the roll pipeline was rewritten`);
} else {
    let depth = 0;
    let prepareSrc = null;
    for (let i = rollsSrc.indexOf('{', prepareStart); i < rollsSrc.length; i++) {
        if (rollsSrc[i] === '{') depth++;
        else if (rollsSrc[i] === '}' && --depth === 0) { prepareSrc = rollsSrc.slice(prepareStart, i + 1); break; }
    }

    // Stubbed to exactly what the function touches. A stub that has to grow is the
    // signal that the function reached for something new, which is worth noticing.
    const prepareRollData = new Function('deps', `
        const { foundry, CONFIG, MODULE, game, postConsoleAndNotification, getDiceIcon, SkillCheckDialog } = deps;
        ${prepareSrc}
        return prepareRollData;
    `)({
        foundry: { utils: { getProperty: (obj, path) => String(path).split('.').reduce((o, k) => o?.[k], obj) } },
        CONFIG: { DND5E: { skills: { prc: { ability: 'wis', label: 'Perception' } }, abilities: { wis: { label: 'WIS' } } } },
        MODULE: { NAME: 'check' },
        game: { settings: { get: () => true } },
        postConsoleAndNotification: () => {},
        getDiceIcon: () => 'fas fa-dice-d20',
        SkillCheckDialog: Dialog
    });

    const actor = {
        name: 'Test',
        system: {
            abilities: { wis: { mod: 3 }, int: { mod: 2 } },
            attributes: { prof: 4 },
            skills: { prc: { value: 1 } }
        }
    };

    const diceData = await prepareRollData(actor, 'dice', '2d10[Strength] + 2d4[Smackdown] + 2[Muscle Twitch]');
    check('roll window: a dice roll\'s base IS its formula',
        diceData.baseRoll, '2d10[Strength] + 2d4[Smackdown] + 2[Muscle Twitch]');
    check('roll window: a dice roll brings no ability modifier', diceData.abilityMod, 0);
    check('roll window: a dice roll has no ability at all', diceData.abilityKey, null);
    check('roll window: a dice roll brings no proficiency', diceData.proficiencyBonus, 0);
    check('roll window: the subtitle reads the formula as prose',
        diceData.rollSubtitle, '2d10 Strength + 2d4 Smackdown + 2 Muscle Twitch');

    // The other roll types must be untouched by all of that.
    const skillData = await prepareRollData(actor, 'skill', 'prc');
    check('roll window: a skill roll still starts from 1d20', skillData.baseRoll, '1d20');
    check('roll window: a skill roll still brings its ability', [skillData.abilityKey, skillData.abilityMod], ['wis', 3]);
    check('roll window: a skill roll still brings proficiency', skillData.proficiencyBonus, 4);
}

// ===== A FAVOURITE PLAYS THE WAY IT WAS SAVED ======================
//
// `_executeFavoriteFromRecord` builds a separate options object per roll type, and each
// one has to carry the favourite's cinematic flag. A branch that forgets it does not
// throw: the request posts to chat, which is the default and is indistinguishable from
// a favourite the GM never marked.

const executeSrc = slice('static async _executeFavoriteFromRecord(rec)');
if (executeSrc) {
    const silentCalls = (executeSrc.match(/_openRequestRollSilent\(/g) ?? []).length;
    // TWO WAYS TO CARRY IT, both counted. Most branches spread the `cinematic` object;
    // the contested branch hands its options to `quickRollRequestOptions`, which sets
    // `isCinematic` from the record itself. Counting only the spread called the second
    // one a bug, which it is not -- the flag arrives either way.
    const flagged = (executeSrc.match(/\.\.\.cinematic/g) ?? []).length
        + (executeSrc.match(/isCinematic: !!rec\.isCinematic/g) ?? []).length;
    if (silentCalls === 0) {
        problems.push(`${SOURCE}: _executeFavoriteFromRecord makes no _openRequestRollSilent call -- favourites are dispatched some other way now, and this check is measuring nothing`);
    } else if (flagged !== silentCalls) {
        problems.push(`${SOURCE}: _executeFavoriteFromRecord has ${silentCalls} _openRequestRollSilent call(s) but spreads the cinematic flag into ${flagged} of them -- the missing one posts to chat whatever the favourite says`);
    }
}

// The cinematic button must NOT also be a `.cpb-favorite-toggle`. That class is claimed
// by a capture-phase listener which treats any click on it as hearting and calls
// stopPropagation, so the button would never see its own click.
if (/cpb-favorite-toggle[^'"`]*cpb-favorite-cinematic|cpb-favorite-cinematic[^'"`]*cpb-favorite-toggle/.test(src)) {
    problems.push(`${SOURCE}: the cinematic button must not also carry .cpb-favorite-toggle -- the dialog's capture listener would swallow its click and heart the row instead`);
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

// Nothing in the builder may carry `cpb-favorite-toggle`: a capture-phase listener on
// the dialog claims that class for check items, calls stopPropagation, and would
// swallow the builder's own clicks. The saved rows use `.cpb-dice-saved-heart`.
const diceSection = template.slice(
    template.indexOf('<div class="cpb-check-section" data-filter="dice">'),
    template.indexOf('<!-- Tool Check Section -->')
);
if (diceSection.includes('cpb-favorite-toggle')) {
    problems.push(`${TEMPLATE}: nothing in the dice section may carry .cpb-favorite-toggle -- the dialog's capture listener calls stopPropagation and would swallow the click`);
}

// The controls the builder wires by selector. A missing one is a dead button, not an
// error: `querySelector` returns null and the listener is simply never attached.
for (const cls of ['cpb-dice-formula', 'cpb-dice-name', 'cpb-dice-remember', 'cpb-dice-reset', 'cpb-dice-saved-list']) {
    if (!new RegExp(`class="${cls}"`).test(diceSection)) {
        problems.push(`${TEMPLATE}: the dice section has no element with class="${cls}" -- the builder wires it by that exact selector, and a missing one attaches no listener and reports nothing`);
    }
}

// ===== REPORT ======================================================

if (problems.length) {
    console.error(`check-dice-builder: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log('check-dice-builder: compose/parse are inverses, the roll window describes the roll it will make, favourites play the way they were saved, and the controls the builder wires are all present.');
