#!/usr/bin/env node
/**
 * Invariant check: the chat-card prose pipeline neutralises HTML and preserves
 * Foundry enricher syntax.
 *
 * "Consumers never pass HTML" is enforced at runtime by escaping consumer text
 * before anything else touches it. That guarantee is one regex away from being
 * lost silently -- a card would simply start rendering whatever markup a module
 * handed it, and nothing would look broken until something malicious or merely
 * malformed arrived. This check fails the moment escaping stops happening.
 *
 * It loads the real functions out of scripts/manager-chat-cards.js rather than
 * copying them, so it cannot drift from the implementation it guards.
 *
 * Run: node tools/check-card-prose.mjs
 * Exits non-zero on a violation.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'scripts/manager-chat-cards.js');

// Normalise CRLF -- the repo checks out with Windows line endings.
const src = readFileSync(SOURCE, 'utf-8').replace(/\r\n/g, '\n');

function extractFunction(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`check-card-prose: ${name}() not found in ${SOURCE}`);
    const end = src.indexOf('\n}\n', start);
    if (end < 0) throw new Error(`check-card-prose: could not find the end of ${name}()`);
    return src.slice(start, end + 3);
}

const sentinelLines = src.match(/^const MARK_SENTINEL.*$/gm);
if (!sentinelLines) throw new Error('check-card-prose: MARK_SENTINEL declarations not found');

const moduleSource = [
    sentinelLines.join('\n'),
    extractFunction('escapeHtml'),
    extractFunction('applyInlineMarks'),
    'export const run = (text) => applyInlineMarks(escapeHtml(text));'
].join('\n');

const { run } = await import('data:text/javascript,' + encodeURIComponent(moduleSource));

const SENTINEL = String.fromCharCode(0xE000);

const checks = [
    ['HTML tags are escaped, not rendered',
     () => run('<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;'],

    ['script tags are neutralised',
     () => !run('<script>alert(1)</script>').includes('<script')],

    ['ampersands and quotes are escaped',
     () => run(`a & "b" 'c'`) === 'a &amp; &quot;b&quot; &#39;c&#39;'],

    ['bold converts',
     () => run('**a**') === '<strong>a</strong>'],

    ['italic converts',
     () => run('*a*') === '<em>a</em>'],

    ['code converts',
     () => run('`a`') === '<code>a</code>'],

    ['a code span protects the marks inside it',
     () => run('`**a**`') === '<code>**a**</code>'],

    ['HTML inside a code span is still escaped',
     () => run('`<b>`') === '<code>&lt;b&gt;</code>'],

    ['@UUID enricher syntax survives intact',
     () => run('@UUID[Actor.abc]{Name}').includes('@UUID[Actor.abc]{Name}')],

    ['inline roll syntax survives intact',
     () => run('[[/r 1d20]]').includes('[[/r 1d20]]')],

    ['@Check syntax survives intact',
     () => run('@Check[dexterity]').includes('@Check[dexterity]')],

    ['the code-span sentinel never reaches the output',
     () => !run('a `b` c **d** `e`').includes(SENTINEL)],

    ['a consumer cannot smuggle the sentinel in to corrupt output',
     () => !run(`${SENTINEL}0${SENTINEL} and \`real\``).includes('<code>undefined</code>')],

    ['plain text passes through unchanged',
     () => run('plain text, no marks') === 'plain text, no marks']
];

let failed = 0;
for (const [label, assertion] of checks) {
    let ok = false;
    try {
        ok = assertion() === true;
    } catch (error) {
        ok = false;
        console.error(`  threw: ${error.message}`);
    }
    if (!ok) {
        console.error(`FAIL  ${label}`);
        failed++;
    }
}

if (failed) {
    console.error(`\ncheck-card-prose: ${failed} of ${checks.length} checks failed.`);
    process.exit(1);
}

console.log(`check-card-prose: ${checks.length} checks passed.`);
