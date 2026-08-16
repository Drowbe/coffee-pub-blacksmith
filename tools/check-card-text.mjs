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
 * least Foundry that lets the pipeline run: a `game.user` for `mayRead()`, a
 * `fetch` because `const.js` reads `module.json` at import time and Node's fetch
 * has no `file://` scheme, an IDENTITY enricher, and a `fromUuid` returning a
 * document whose `toAnchor` appends its name as a text node, as Foundry's does.
 *
 * WHAT THIS CANNOT PROVE. The enricher is an identity function here, not Foundry's.
 * So this file cannot demonstrate what real enrichment does to a string -- and that
 * is exactly the gap that let a bad fix through once: braces encoded as entities
 * looked safe, and `enrichHTML` decodes them via `innerHTML` before its regex runs.
 * The lesson is in the design rather than the stub: group 4 below asserts that the
 * link path never calls the enricher at all, because a path that hands a caller's
 * string to something that parses it cannot be made safe by escaping.
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

// An identity enricher, so the pipeline runs and we can count whether it was used.
// Foundry's real one would rewrite the string; identity keeps every expectation
// below about escaping and marks, which are what this file is asserting.
let enrichCalls = 0;
globalThis.foundry = {
    applications: { ux: { TextEditor: { implementation: {
        enrichHTML: async (html) => { enrichCalls++; return html; }
    } } } }
};

/**
 * A stand-in for Foundry's `doc.toAnchor({ name })`, matching the one property
 * under test: the name is appended as a TEXT NODE, so it is serialised with the
 * HTML-significant characters escaped and everything else -- braces included --
 * left exactly as given.
 */
const asTextNode = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RESOLVES = 'Item.abc';
globalThis.fromUuid = async (uuid) => uuid === RESOLVES ? {
    documentName: 'Item',
    toAnchor: ({ name }) => ({
        outerHTML: `<a class="content-link" data-uuid="${uuid}">${asTextNode(name)}</a>`
    })
} : null;

const { processText, documentLinkOrText } = await import(
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

// --- 2b. A literal can be emphasised without carrying markup ----------------
//
// The caller names a treatment; Blacksmith emits the tags around text it has
// already escaped. So the name is bold AND inert, which is the combination that
// was impossible before and that modules were about to standardise around.

await expect('a marked literal is emphasised and still inert',
    { literal: 'Ring of *Power*', mark: 'strong' },
    '<strong>Ring of *Power*</strong>');

await expect('em is available too',
    { literal: 'Bob', mark: 'em' }, '<em>Bob</em>');

// The tag name reaches a tag, so an unknown one must fail closed, not be written.
await expect('an unrecognised mark renders unmarked rather than becoming a tag',
    { literal: 'Bob', mark: 'script' }, 'Bob');

await expect('a marked literal is still escaped inside its tag',
    { literal: '<b>x</b>', mark: 'strong' },
    '<strong>&lt;b&gt;x&lt;/b&gt;</strong>');

// The Squire sentence, which is what this was built for.
await expect('a marked literal inside a sentence',
    ['You have sent ', { literal: 'Ring of *Power*', mark: 'strong' }, ' to Kar-ahn'],
    'You have sent <strong>Ring of *Power*</strong> to Kar-ahn');

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

// ...and the mark has to travel into that nesting, or veiling a name would quietly
// un-emphasise it for the readers still entitled to see it.
globalThis.game.user.isGM = true;
await expect('a mark survives the wrong-nesting rewrite',
    { literal: 'Secret Ring', mark: 'strong', readableBy: 'gm' },
    '<strong>Secret Ring</strong>');
globalThis.game.user.isGM = false;

// And the same reader, entitled, still gets it -- so the rule above is denial,
// not a blanket refusal that would hide the value from everyone.
globalThis.game.user.isGM = true;
await expect('literal + readableBy reveals to an entitled reader',
    { literal: 'Secret Ring', readableBy: 'gm' }, 'Secret Ring');

// --- 4. A document link cannot be influenced by the name inside it ----------
//
// Artificer's fixture, and asserted on OUTPUT rather than on which helper got
// called -- the previous version of this guard checked for a function call and
// passed against a fix that did not work.

const HOSTILE = 'Ring of *Power* @UUID[Actor.evil]{pwn} [[/r 99d6]]';

async function expectLink(label, item, wanted) {
    checked++;
    const got = await documentLinkOrText(item, {});
    if (got !== wanted) {
        problems.push(`${label}\n      expected: ${wanted}\n      actual:   ${got}`);
    }
}

await expectLink('a hostile name survives whole inside one link',
    { uuid: RESOLVES, label: HOSTILE },
    `<a class="content-link" data-uuid="${RESOLVES}">${HOSTILE}</a>`);

// The failure this exists to stop is the SECOND link, so assert the count too:
// the string above would still be "correct" if it appeared beside a roll link.
checked++;
{
    const got = await documentLinkOrText({ uuid: RESOLVES, label: HOSTILE }, {});
    const anchors = (got.match(/<a\b/g) ?? []).length;
    if (anchors !== 1) {
        problems.push(`a hostile name produced ${anchors} anchors, not 1 -- the label escaped its link:\n      ${got}`);
    }
    if (/\[\[\/r/.test(got) && !got.includes(HOSTILE)) {
        problems.push(`a hostile name produced roll syntax outside its own text:\n      ${got}`);
    }
}

// No enricher pass means no expression for a name to close. This is the property
// the whole fix rests on, so it is asserted rather than assumed.
checked++;
{
    const before = enrichCalls;
    await documentLinkOrText({ uuid: RESOLVES, label: HOSTILE }, {});
    if (enrichCalls !== before) {
        problems.push('the document-link path called the enricher -- it must build the anchor, not write syntax for something else to parse');
    }
}

// Redundant on this path -- toAnchor's text node already does what a literal asks
// for -- but wrapping every untrusted name is the right reflex once a consumer has
// one, and `String({literal})` is "[object Object]".
await expectLink('a literal label on a linked row is unwrapped, not stringified',
    { uuid: RESOLVES, label: { literal: HOSTILE } },
    `<a class="content-link" data-uuid="${RESOLVES}">${HOSTILE}</a>`);

// A link whose name is withheld still tells the reader the document exists, and
// the anchor carries the uuid, so the veil replaces the whole link.
globalThis.game.user.isGM = false;
await expectLink('a veiled label withholds the whole link, not just its text',
    { uuid: RESOLVES, label: { value: 'Secret Ring', readableBy: 'gm' } },
    '<i class="fa-solid fa-eye blacksmith-veil"></i>');

globalThis.game.user.isGM = true;
await expectLink('an entitled reader gets the link, veil resolved',
    { uuid: RESOLVES, label: { value: { literal: HOSTILE }, readableBy: 'gm' } },
    `<a class="content-link" data-uuid="${RESOLVES}">${HOSTILE}</a>`);

await expectLink('an unresolvable uuid falls back to the escaped name',
    { uuid: 'Item.missing', label: '<b>Ghost</b>' }, '&lt;b&gt;Ghost&lt;/b&gt;');

// The uuid is a raw string checked before use, with no decode in between.
await expectLink('a uuid carrying a bracket builds no link at all',
    { uuid: 'Item.abc]{x}', label: 'Ring' }, 'Ring');

// Without a uuid it is ordinary consumer text again, marks and all.
await expectLink('no uuid falls back to the full text pipeline',
    { label: '**bold**' }, '<strong>bold</strong>');

// --- Report ----------------------------------------------------------------

if (problems.length) {
    console.error('check-card-text: the consumer-text pipeline does not behave as specified.\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    console.error(`${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-card-text: ${checked} checks passed (escaping and marks, literals and segments, veil denial, document links). The enricher is an identity stub here -- what Foundry's own does to a string is not covered.`);
