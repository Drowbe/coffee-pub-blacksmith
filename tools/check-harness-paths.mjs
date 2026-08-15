#!/usr/bin/env node
/**
 * Invariant check: the test harness will actually load and its suites are wired
 * up correctly.
 *
 * The harness fetches its library and its suites over HTTP by absolute module
 * path, so a rename or a move produces a 404 at run time and nothing before it.
 * That is a bad failure to have in a testing tool: the harness is what you reach
 * for when you doubt something, and a harness that will not load teaches you
 * nothing about what you were doubting.
 *
 * Both failures this guards against happened on 2026-08-13:
 *   - Moving the suites from utilities/tests to testing/suites rewrote every path
 *     including the one pointing at harness-lib.js, which had gone to testing/
 *     root instead -- so BASE resolved it into suites/ and the harness 404'd.
 *   - A new suite was written calling expect(condition, label) when the recorder
 *     takes expect(label, actual, expected). All 63 assertions reported as
 *     failures with the label in the "actual" slot, which reads as 63 broken
 *     contracts rather than one suite holding the arguments backwards.
 *
 * Checks four things:
 *   1. Every `${ROOT}/x` and `${BASE}/x` the harness names resolves to a file.
 *   2. Every suite on disk is listed in SUITES, so none silently never runs.
 *   3. Every relative import inside a suite resolves to a file.
 *   4. Every expect() call passes its label first.
 *
 * Run: node tools/check-harness-paths.mjs
 * Exits non-zero on a violation.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = join(REPO, 'testing/test-harness.js');

if (!existsSync(HARNESS)) {
    console.error(`check-harness-paths: ${HARNESS} not found.`);
    process.exit(1);
}

const problems = [];
const source = readFileSync(HARNESS, 'utf-8');

// The harness declares its roots as absolute module URLs. Read them rather than
// assuming, so this check follows the harness if it is moved again.
function constantOf(name) {
    const literal = source.match(new RegExp(`const ${name} = '([^']+)'`));
    if (literal) return literal[1];
    const template = source.match(new RegExp(`const ${name} = \`([^\`]+)\``));
    return template ? template[1] : null;
}

const ROOT = constantOf('ROOT');
let BASE = constantOf('BASE');
if (BASE && ROOT) BASE = BASE.replace('${ROOT}', ROOT);

if (!ROOT || !BASE) {
    problems.push('could not read ROOT and BASE out of testing/test-harness.js');
}

/** '/modules/coffee-pub-blacksmith/testing/x' -> '<repo>/testing/x' */
function onDisk(modulePath) {
    const marker = '/modules/coffee-pub-blacksmith/';
    const index = modulePath.indexOf(marker);
    if (index < 0) return null;
    return join(REPO, modulePath.slice(index + marker.length));
}

let checked = 0;

if (ROOT && BASE) {
    const referenced = [
        ...[...source.matchAll(/\$\{ROOT\}\/([\w.\-/]+)/g)].map(m => `${ROOT}/${m[1]}`),
        ...[...source.matchAll(/\$\{BASE\}\/([\w.\-/]+)/g)].map(m => `${BASE}/${m[1]}`)
    ];

    for (const modulePath of referenced) {
        const file = onDisk(modulePath);
        checked++;
        if (!file || !existsSync(file)) {
            problems.push(`harness loads ${modulePath} - no such file`);
        }
    }

    // A suite on disk that the harness never lists will silently never run.
    const suitesDir = onDisk(BASE);
    if (suitesDir && existsSync(suitesDir)) {
        for (const name of readdirSync(suitesDir).filter(f => f.startsWith('suite-') && f.endsWith('.js'))) {
            if (!source.includes(name)) {
                problems.push(`testing/suites/${name} exists but is not listed in SUITES - it will never run`);
            }
        }
    }
}

const suitesOnDisk = join(REPO, 'testing/suites');

// Imports inside each suite, BOTH kinds.
//
// Relative ones reach the harness's own files. Absolute ones reach the module's
// source -- a suite testing a pure function imports it directly rather than going
// through the API, which is the only way to assert something the API does not
// expose. Both are checked, because a suite fetches over HTTP at runtime and a
// wrong path is a 404 the harness reports as a dead suite rather than a bad import.
// Only relative imports were checked until 2026-08-14, so the first absolute one
// added went unverified.
if (existsSync(suitesOnDisk)) {
    for (const name of readdirSync(suitesOnDisk).filter(f => f.endsWith('.js'))) {
        const file = join(suitesOnDisk, name);
        const text = readFileSync(file, 'utf-8');

        for (const match of text.matchAll(/from\s+'(\.[^']+)'/g)) {
            const target = normalize(join(dirname(file), match[1]));
            checked++;
            if (!existsSync(target)) {
                problems.push(`testing/suites/${name} imports ${match[1]} - no such file`);
            }
        }

        for (const match of text.matchAll(/from\s+'(\/modules\/[^']+)'/g)) {
            checked++;
            const target = onDisk(match[1]);
            if (!target) {
                problems.push(`testing/suites/${name} imports ${match[1]} - not a path inside this module`);
            } else if (!existsSync(target)) {
                problems.push(`testing/suites/${name} imports ${match[1]} - no such file`);
            }
        }
    }
}

// Assertion signature. The recorder takes the LABEL first.
//
// Detects the INVERSION specifically -- a call whose first argument is not a
// string literal but whose last one is -- rather than merely "first argument is
// not a literal". A label is legitimately built by an expression (a ternary
// choosing between two wordings, for one real case), so the blunt rule produced
// false positives on correct code, and a check that cries wolf gets ignored,
// which is worse than not having it. Comment lines are skipped for the same
// reason: the suite that documents this footgun quotes it.
const QUOTES = ["'", '"', '`'];
const INVERTED = /,\s*(['"`])(?:[^'"`\\]|\\.)*\1\s*\)\s*;?\s*$/;

if (existsSync(suitesOnDisk)) {
    for (const name of readdirSync(suitesOnDisk).filter(f => f.endsWith('.js'))) {
        const lines = readFileSync(join(suitesOnDisk, name), 'utf-8').split(/\r?\n/);
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

            const call = line.match(/\bexpect(?:\.ok|\.throws)?\(\s*(\S)/);
            if (!call) return;
            checked++;

            if (!QUOTES.includes(call[1]) && INVERTED.test(line)) {
                problems.push(
                    `testing/suites/${name}:${index + 1} looks like expect(condition, 'label')`
                    + ' - the label comes first: expect(label, actual, expected) / expect.ok(label, condition)');
            }
        });
    }
}

if (problems.length) {
    console.error('check-harness-paths: the harness would not work as written.\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-harness-paths: ${checked} check(s) passed across paths, registration, imports and assertion signatures.`);
