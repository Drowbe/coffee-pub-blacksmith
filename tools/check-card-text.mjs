#!/usr/bin/env node
/**
 * Invariant check: the consumer-text pipeline behaves as specified.
 *
 * The other checks in this directory verify that two files agree with each other.
 * This one is different: it RUNS `processText()` and asserts what comes out. It
 * earns its place because the failures it catches are invisible -- the pipeline
 * would keep returning plausible HTML, and nothing would look broken until a
 * particular name arrived, or until a value appeared on a screen it should not
 * have reached.
 *
 * Three properties, in increasing order of how badly a regression would hurt:
 *
 * 1. TEXT IS ESCAPED AND MARKED, in that order. `**x**` becomes bold; `<b>` does
 *    not. This is the same contract check-card-contracts.mjs asserts by reading the
 *    source; here it is asserted by running it.
 *
 * 2. A LITERAL IS INERT. `{ literal }` is escaped and nothing else -- not read for
 *    marks, not enriched. It exists for text the consumer did not author (an item
 *    or actor name typed by a user), which is exactly the text they cannot vet. A
 *    regression here means an item called `Ring of *Power*` silently italicises the
 *    rest of a sentence, and a name containing enricher syntax gets obeyed.
 *
 *    Segments matter as much as the wrapper: a marked run must NOT be able to span
 *    a segment boundary, or a literal can close a run its neighbour opened and the
 *    isolation is worthless.
 *
 * 3. THE VEIL FAILS CLOSED. This is the one worth the whole file. `mayRead()` has
 *    several paths that must all deny, and a mistake in any of them shows a value
 *    to someone not entitled to it -- with no error, no visual glitch, and nothing
 *    in a diff that looks wrong. In particular `{ literal, readableBy }` is a
 *    caller who reached for the wrong nesting, and it must be treated as veiled
 *    rather than rendered in the clear.
 *
 * WHY THE STUBS. `manager-chat-cards.js` is Foundry code, so this supplies the
 * least Foundry that lets the pipeline run: a `game.user` for `mayRead()`, and a
 * `fetch` because `const.js` reads `module.json` at import time and Node's fetch
 * has no `file://` scheme. No TextEditor is provided, so `enrich()` takes its own
 * documented no-op path -- which means THIS FILE CANNOT PROVE THE ENRICHER STAGE.
 * It proves escaping, marks, literals and veiling. Enrichment is verified in a
 * running world; see testing/ if that is still owed.
 *
 * Run: node tools/check-card-text.mjs
 * Exits non-zero on a violation.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Stubs must exist BEFORE the dynamic import below: const.js fetches at module scope.
globalThis.game = { user: { id: 'u1', isGM: false }, actors: { get: () => null } };
globalThis.fetch = async (url) => {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const { processText } = await import(
    pathToFileURL(join(REPO, 'scripts/manager-chat-cards.js')).href
);

const problems = [];
let checked = 0;

async function expect(label, input, wanted, options) {
    checked++;
    const got = await processText(input, options ?? {});
    if (got !== wanted) {
        problems.push(`${label}\n      expected: ${wanted}\n      actual:   ${got}`);
    }
}

// --- 1. Escaping and marks -------------------------------------------------

await expect('ordinary text takes inline marks',
    '**bold** and *italic*', '<strong>bold</strong> and <em>italic</em>');

await expect('ordinary text is escaped before marks are applied',
    '<b>x</b>', '&lt;b&gt;x&lt;/b&gt;');

// --- 2. Literals are inert -------------------------------------------------

await expect('a literal keeps its asterisks',
    { literal: 'Ring of *Power*' }, 'Ring of *Power*');

await expect('a literal is escaped',
    { literal: '<script>alert(1)</script>' },
    '&lt;script&gt;alert(1)&lt;/script&gt;');

await expect('a literal keeps enricher syntax as text',
    { literal: '@UUID[Actor.abc]{Bob}' }, '@UUID[Actor.abc]{Bob}');

await expect('an empty literal renders empty rather than "undefined"',
    { literal: null }, '');

// The case a whole-field literal cannot express, and the reason segments exist:
// the untrusted values sit INSIDE a sentence the caller did author.
await expect('a literal survives inside marked prose',
    ['Created ', { literal: 'Ring of *Power*' }, ' for **you**'],
    'Created Ring of *Power* for <strong>you</strong>');

// If this ever passes as `<strong>ab</strong>`, the isolation is gone.
await expect('a marked run cannot span a segment boundary',
    ['**a', 'b**'], '**ab**');

// --- 3. The veil fails closed ----------------------------------------------

globalThis.game.user.isGM = true;
await expect('an entitled reader sees a veiled literal',
    { value: { literal: 'Ring of *Power*' }, readableBy: 'gm' }, 'Ring of *Power*');

globalThis.game.user.isGM = false;
const VEIL = '<i class="fa-solid fa-eye blacksmith-veil"></i>';

await expect('an unentitled reader sees the veil, not the value',
    { value: 'Secret', readableBy: 'gm' }, VEIL);

await expect('an unrecognised readableBy denies rather than falling through to everyone',
    { value: 'Secret', readableBy: 'everybody' }, VEIL);

await expect('the baked snapshot never reveals, whoever renders it',
    { value: 'Secret', readableBy: 'gm' }, VEIL, { baked: true });

// The wrong-nesting case: a privacy key must never be silently ignored.
await expect('literal + readableBy is veiled rather than rendered in the clear',
    { literal: 'Secret Ring', readableBy: 'gm' }, VEIL);

// And the same reader, entitled, still gets it -- so the rule above is denial,
// not a blanket refusal that would hide the value from everyone.
globalThis.game.user.isGM = true;
await expect('literal + readableBy reveals to an entitled reader',
    { literal: 'Secret Ring', readableBy: 'gm' }, 'Secret Ring');

// --- Report ----------------------------------------------------------------

if (problems.length) {
    console.error('check-card-text: the consumer-text pipeline does not behave as specified.\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    console.error(`${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-card-text: ${checked} checks passed (escaping and marks, literals and segments, veil denial). Enrichment is not covered here -- no TextEditor outside Foundry.`);
