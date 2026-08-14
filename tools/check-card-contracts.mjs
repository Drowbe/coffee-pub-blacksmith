#!/usr/bin/env node
/**
 * Invariant check: a consumer cannot inject presentation into a chat card.
 *
 * Two contracts, one principle. A module hands Blacksmith DATA; Blacksmith decides
 * what it looks like. Both halves of that are one regex away from being lost
 * silently, and neither failure looks like a failure -- a card would simply start
 * honouring whatever a module handed it, and nothing would break until something
 * malformed or malicious arrived.
 *
 * 1. PROSE IS ESCAPED. Consumer text is escaped before anything else touches it,
 *    so `<b>x</b>` renders as those characters. Foundry enricher syntax survives,
 *    because that is Foundry's, not the consumer's.
 *
 * 2. COLOUR IS FOR DATA VISUALISATION ONLY. Exactly one part -- `gauge` -- takes a
 *    colour from the caller, because on a gauge the colour encodes the value and
 *    no fixed palette can express a domain's meaning. Everywhere else colour is
 *    emphasis, the theme owns it, and the caller names a `tone` instead.
 *
 *    This is the rule most at risk of drifting, because every future part will
 *    have a moment where passing a colour looks harmless. It is not: the day a row
 *    accepts a colour is the day cards stop rethemeing, and the day after that a
 *    module passes a gradient. The allowlist below is the whole of the exception.
 *
 * Run: node tools/check-card-contracts.mjs
 * Exits non-zero on a violation.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO, 'scripts/manager-chat-cards.js');
const PARTS_DIR = join(REPO, 'templates/parts');

/**
 * The complete list of parts allowed to take a colour from the caller.
 *
 * A part belongs here only if its colour ENCODES A VALUE -- if changing the
 * colour would change what the reader learns. "It would look nicer" is not a
 * qualification. Adding a name here is a deliberate widening of the contract and
 * should be argued for in documentation/plans/plan-chat-cards.md, decision 5.
 */
const DATA_VISUALISATION_PARTS = ['gauge'];

/** CSS properties that set a colour, which is what the rule is about. */
// Custom properties count: `--anything-colour: red` sets a colour just as surely
// as `color:` does, and would otherwise walk straight past this rule.
const COLOUR_PROPERTIES = /(^|[;\s])(--[\w-]*colou?r|background|background-color|color|border[a-z-]*colou?r|fill|stroke|box-shadow|outline-color)\s*:/i;

const problems = [];
let checked = 0;

// ------------------------------------------------------------------
// 1. Prose pipeline
// ------------------------------------------------------------------

const src = readFileSync(SOURCE, 'utf-8').replace(/\r\n/g, '\n');

function extractFunction(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`check-card-contracts: ${name}() not found in ${SOURCE}`);
    const end = src.indexOf('\n}\n', start);
    if (end < 0) throw new Error(`check-card-contracts: could not find the end of ${name}()`);
    return src.slice(start, end + 3);
}

const moduleSource = [
    extractFunction('escapeHtml'),
    extractFunction('applyInlineMarks'),
    'export const run = (text) => applyInlineMarks(escapeHtml(text));'
].join('\n');

const { run } = await import('data:text/javascript,' + encodeURIComponent(moduleSource));

const proseChecks = [
    ['HTML tags are escaped, not rendered', () => run('<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;'],
    ['script tags are neutralised', () => !run('<script>alert(1)</script>').includes('<script')],
    ['ampersands and quotes are escaped', () => run(`a & "b" 'c'`) === 'a &amp; &quot;b&quot; &#39;c&#39;'],
    ['bold converts', () => run('**a**') === '<strong>a</strong>'],
    ['italic converts', () => run('*a*') === '<em>a</em>'],
    ['a backtick is ordinary text, not a code mark', () => run('a `b` c') === 'a `b` c'],
    ['@UUID enricher syntax survives intact', () => run('@UUID[Actor.abc]{Name}').includes('@UUID[Actor.abc]{Name}')],
    ['inline roll syntax survives intact', () => run('[[/r 1d20]]').includes('[[/r 1d20]]')],
    ['@Check syntax survives intact', () => run('@Check[dexterity]').includes('@Check[dexterity]')],
    ['plain text passes through unchanged', () => run('plain text, no marks') === 'plain text, no marks']
];

for (const [label, assertion] of proseChecks) {
    checked++;
    let ok = false;
    try {
        ok = assertion() === true;
    } catch (error) {
        problems.push(`prose: ${label} threw ${error.message}`);
        continue;
    }
    if (!ok) problems.push(`prose: ${label}`);
}

// ------------------------------------------------------------------
// 2. Colour containment
// ------------------------------------------------------------------

if (!existsSync(PARTS_DIR)) {
    problems.push(`templates/parts not found at ${PARTS_DIR}`);
} else {
    for (const file of readdirSync(PARTS_DIR).filter(f => f.endsWith('.hbs'))) {
        const part = file.replace(/^part-/, '').replace(/\.hbs$/, '');
        const allowed = DATA_VISUALISATION_PARTS.includes(part);
        const lines = readFileSync(join(PARTS_DIR, file), 'utf-8').split(/\r?\n/);

        lines.forEach((line, index) => {
            for (const match of line.matchAll(/style="([^"]*)"/g)) {
                const declaration = match[1];
                if (!declaration.includes('{{')) continue;
                checked++;
                if (allowed) continue;

                // A whole style attribute supplied by the context could carry
                // anything, colour included.
                if (/^\s*\{\{[^}]+\}\}\s*$/.test(declaration)) {
                    problems.push(
                        `colour: ${file}:${index + 1} interpolates an entire style attribute`
                        + ' -- only a data-visualisation part may do that');
                    continue;
                }

                if (COLOUR_PROPERTIES.test(declaration)) {
                    problems.push(
                        `colour: ${file}:${index + 1} sets a colour from the template context`
                        + ` -- "${part}" is not a data-visualisation part, so colour belongs to the theme.`
                        + ' Use a tone, or argue the part into DATA_VISUALISATION_PARTS.');
                }
            }
        });
    }

    // The allowlist naming a part that no longer exists is drift of its own.
    for (const part of DATA_VISUALISATION_PARTS) {
        checked++;
        if (!existsSync(join(PARTS_DIR, `part-${part}.hbs`))) {
            problems.push(`colour: DATA_VISUALISATION_PARTS names "${part}", which has no template`);
        }
    }
}

// A colour reaching a style attribute must have been through the allowlist.
checked++;
if (!src.includes('function safeColour(')) {
    problems.push('colour: safeColour() is gone from manager-chat-cards.js -- caller colours would reach a style attribute unvalidated');
}

if (problems.length) {
    console.error('check-card-contracts: a consumer could inject presentation.\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-card-contracts: ${checked} checks passed (prose escaping, and colour confined to ${DATA_VISUALISATION_PARTS.join(', ')}).`);
