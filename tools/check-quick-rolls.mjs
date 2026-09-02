#!/usr/bin/env node
/**
 * Guard the Quick Rolls library against the two ways it can break silently.
 *
 * 1. THE ROW AND ITS READER MUST AGREE. `_quickRollRow` writes a check item's
 *    `data-*`; `_handleQuickRollItem` reads them back, and so do `_computeFavoriteId`
 *    and `_favoriteRecordFromItem`. An attribute the reader wants and the writer does
 *    not set is `undefined` — which every one of those readers treats as a legitimate
 *    "not set" rather than as an error. The roll fires, quietly, as something else:
 *    the wrong DC, the wrong side, or no contest at all.
 *
 *    These were twenty-four rows of hand-written markup until the library was made
 *    editable. While they were markup a mismatch was at least visible in the diff;
 *    now the writer is a function forty lines from its reader.
 *
 * 2. THE BUILT-IN ROLLS MUST STILL BE THE TWENTY-FOUR. They seed a world once and
 *    are never re-planted, so a default lost to a typo in the terse `flatMap` that
 *    builds them is lost for every world created afterwards, and no existing world
 *    reports it.
 *
 * 3. AN EXPORTED LIBRARY MUST IMPORT BACK. Export and parse are inverses; when they
 *    disagree the GM finds out at the far end, in another world, with the file that
 *    was supposed to carry their work.
 *
 *   node tools/check-quick-rolls.mjs
 *
 * Exits non-zero on a violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DIALOG = 'scripts/window-skillcheck.js';
const MANAGER = 'scripts/manager-quick-rolls.js';
const TEMPLATE = 'templates/window-skillcheck.hbs';

const problems = [];
/** The evaluated built-ins, shared with the round-trip section below. */
let defaultsForRoundTrip = null;
const dialog = read(DIALOG);
const manager = read(MANAGER);
const template = read(TEMPLATE);

/**
 * One method's source, from its class-body signature to its matching brace.
 *
 * The walk starts at the brace the SIGNATURE ENDS WITH, not at the first `{` after
 * the name. A default-object parameter -- `normalize(raw = {})` -- puts a brace
 * inside the signature, and a walk started there closes on the parameter and returns
 * a fragment that parses into nonsense.
 */
function slice(src, name, file) {
    const signature = `\n    ${name} {`;
    const start = src.indexOf(signature);
    if (start < 0) {
        problems.push(`${file}: method not found: ${name} -- renamed, or the section was rewritten`);
        return null;
    }
    let depth = 0;
    for (let i = start + signature.length - 1; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    problems.push(`${file}: unbalanced braces after ${name}`);
    return null;
}

// ===== THE ROW AND ITS READER ======================================

const rowSrc = slice(dialog, '_quickRollRow(roll)', DIALOG);
const handlerSrc = slice(dialog, '_handleQuickRollItem(htmlElement, item)', DIALOG);

if (rowSrc && handlerSrc) {
    const written = new Set([...rowSrc.matchAll(/row\.dataset\.([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]));
    const read_ = new Set([...handlerSrc.matchAll(/item\.dataset\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

    for (const key of read_) {
        if (!written.has(key)) {
            problems.push(`${DIALOG}: _handleQuickRollItem reads item.dataset.${key}, which _quickRollRow never writes -- it will be undefined on every quick roll, and the handler treats that as "not set" rather than reporting it`);
        }
    }

    // The favourites machinery hashes a FIXED set of attributes into a stable id. A row
    // missing one still favourites, under an id that no longer matches the row it came
    // from -- so the heart never lights and the favourite cannot be removed from here.
    const favoriteSrc = slice(dialog, 'static _computeFavoriteId(item)', DIALOG);
    if (favoriteSrc) {
        const hashed = [...favoriteSrc.matchAll(/item\?\.dataset\?\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
        for (const key of ['type', 'value', 'rollType']) {
            if (!hashed.includes(key)) continue;
            if (!written.has(key)) {
                problems.push(`${DIALOG}: _computeFavoriteId hashes item.dataset.${key} but _quickRollRow does not set it -- a favourited quick roll would get an id its own row cannot reproduce`);
            }
        }
    }

    // `data-dc` is set CONDITIONALLY and must stay that way: the handler treats the
    // attribute's presence as "override the window's DC box", so writing an empty
    // string forces a blank DC onto every roll that meant to inherit one.
    if (!/if \(roll\.dc\) row\.dataset\.dc/.test(rowSrc)) {
        problems.push(`${DIALOG}: _quickRollRow must set data-dc only when the roll has one -- _handleQuickRollItem reads the attribute's PRESENCE as an override, so an empty string blanks the DC instead of leaving it alone`);
    }
}

// ===== THE BUILT-IN ROLLS ==========================================

const defaultsStart = manager.indexOf('static DEFAULTS = [');
if (defaultsStart < 0) {
    problems.push(`${MANAGER}: DEFAULTS not found`);
} else {
    const body = manager.slice(defaultsStart + 'static DEFAULTS = '.length, manager.lastIndexOf('];') + 2);
    let defaults = null;
    try {
        defaults = new Function('foundry', `return ${body}`)({ utils: { randomID: () => 'stub' } });
    } catch (error) {
        problems.push(`${MANAGER}: DEFAULTS does not evaluate: ${error.message}`);
    }

    if (defaults) {
        defaultsForRoundTrip = defaults;
        // The counts the markup had, before it became data. They are the migration:
        // a world seeded with fewer than these lost a roll somebody used to have.
        const expected = {
            'Party Rolls (Individual Success)': 5,
            'Party Rolls (Group Success)': 5,
            'Common Rolls': 6,
            'Grapple Rolls': 4,
            'Manipulation Rolls': 3,
            'Stealth Rolls': 1
        };
        const counts = {};
        for (const roll of defaults) counts[roll.category] = (counts[roll.category] ?? 0) + 1;

        for (const [category, count] of Object.entries(expected)) {
            if (counts[category] !== count) {
                problems.push(`${MANAGER}: category "${category}" has ${counts[category] ?? 0} built-in roll(s), expected ${count} -- these are the rows the hand-written markup had, and a world seeds from them exactly once`);
            }
        }
        for (const category of Object.keys(counts)) {
            if (!(category in expected)) {
                problems.push(`${MANAGER}: unexpected built-in category "${category}" -- add it to this check's table deliberately, so the count is guarded like the others`);
            }
        }

        const ids = new Set();
        for (const roll of defaults) {
            if (ids.has(roll.id)) {
                problems.push(`${MANAGER}: two built-in rolls share the id "${roll.id}" -- the second overwrites the first on save, and a favourite of either points at whichever survived`);
            }
            ids.add(roll.id);
            for (const field of ['id', 'category', 'label', 'icon', 'mode', 'challenger', 'rollTitle']) {
                if (roll[field] == null || roll[field] === '') {
                    problems.push(`${MANAGER}: built-in roll "${roll.id ?? '(no id)'}" has no ${field}`);
                }
            }
            if (roll.mode === 'contested' && !roll.defender?.value) {
                problems.push(`${MANAGER}: contested built-in roll "${roll.id}" has no defender`);
            }
            if (roll.mode !== 'contested' && !roll.success) {
                problems.push(`${MANAGER}: normal built-in roll "${roll.id}" does not say whether success is group or individual`);
            }
        }
    }
}

// ===== EXPORT AND IMPORT ARE INVERSES ==============================
//
// `parseImport` is sliced out and run against what `exportPayload` produces, so the
// round trip is exercised rather than assumed. A GM only ever discovers a broken one
// at the far end: in another world, with the file that was meant to carry their work
// and a message saying it contains no rolls.

const parseSrc = slice(manager, 'static parseImport(text)', MANAGER);
const normalizeSrc = slice(manager, 'static normalize(raw = {})', MANAGER);
const sideSrc = slice(manager, 'static _normalizeSide(side, fallbackType)', MANAGER);
const idSrc = slice(manager, 'static newId()', MANAGER);
const typesMatch = manager.match(/static ROLL_TYPES = \[[\s\S]*?\];/);
const iconMatch = manager.match(/static DEFAULT_ICON = '[^']*';/);
const versionMatch = manager.match(/static EXPORT_VERSION = \d+;/);

if (parseSrc && normalizeSrc && sideSrc && idSrc && typesMatch && iconMatch && versionMatch) {
    const Manager = new Function('foundry', `
        class QuickRollsManager {
            ${typesMatch[0]}
            ${iconMatch[0]}
            ${versionMatch[0]}
            ${normalizeSrc}
            ${sideSrc}
            ${idSrc}
            ${parseSrc}
        }
        return QuickRollsManager;
    `)({ utils: { randomID: () => 'stubid1234' } });

    const library = (defaultsForRoundTrip ?? []).map((roll) => Manager.normalize(roll));
    const envelope = {
        type: 'coffee-pub-blacksmith.quick-rolls',
        version: 1,
        exportedAt: new Date().toISOString(),
        world: 'test',
        rolls: library
    };

    try {
        const back = Manager.parseImport(JSON.stringify(envelope, null, 2));
        if (back.length !== library.length) {
            problems.push(`${MANAGER}: exporting ${library.length} rolls and importing the file back yields ${back.length} -- parseImport is dropping rolls its own exporter wrote`);
        }
        const before = JSON.stringify(library);
        const after = JSON.stringify(back);
        if (before !== after) {
            problems.push(`${MANAGER}: a library does not survive its own export/import round trip unchanged`);
        }
    } catch (error) {
        problems.push(`${MANAGER}: parseImport refused a file its own exporter wrote: ${error.message}`);
    }

    // A bare array is accepted on purpose: it is what somebody hand-assembling a file
    // writes, and refusing it would be pedantry about a shape we recognise perfectly.
    try {
        Manager.parseImport(JSON.stringify(library));
    } catch (error) {
        problems.push(`${MANAGER}: parseImport refuses a bare array of rolls, which it is meant to accept: ${error.message}`);
    }

    // And these must be refused, with a reason rather than a stack trace.
    for (const [name, text] of [
        ['malformed JSON', '{ not json'],
        ['a file of the wrong kind', JSON.stringify({ hello: 'world' })],
        ['an array of things that are not rolls', JSON.stringify([{ foo: 1 }, 'bar'])],
        ['a newer format version', JSON.stringify({ version: 99, rolls: library })]
    ]) {
        let threw = false;
        try {
            Manager.parseImport(text);
        } catch {
            threw = true;
        }
        if (!threw) problems.push(`${MANAGER}: parseImport accepted ${name} -- an import that cannot work must say so rather than filling the tab with rolls that do nothing`);
    }
}

// ===== THE TEMPLATE'S SIDE =========================================

// The rolls left the template and must not creep back: a hand-written row is not in
// the library, so it cannot be edited, deleted, or seen by the builder.
if (template.includes('data-type="quick"')) {
    problems.push(`${TEMPLATE}: a hand-written quick roll row is back in the template -- quick rolls are library data now, and a row written here cannot be edited or deleted`);
}
for (const cls of ['cpb-quick-rolls-list', 'cpb-quick-rolls-add', 'cpb-quick-rolls-export', 'cpb-quick-rolls-import']) {
    if (!new RegExp(`class="${cls}"`).test(template)) {
        problems.push(`${TEMPLATE}: no element with class="${cls}" -- the dialog wires it by that exact selector, and a missing one renders nothing and reports nothing`);
    }
}

// ===== REPORT ======================================================

if (problems.length) {
    console.error(`check-quick-rolls: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log('check-quick-rolls: rows carry everything their readers want, the built-in rolls are all present, and a library survives its own export/import round trip.');
