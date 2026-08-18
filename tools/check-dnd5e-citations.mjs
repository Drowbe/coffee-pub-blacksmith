#!/usr/bin/env node
/**
 * Guard our `dnd5e.mjs:NNNN` citations against the system moving underneath them.
 *
 *   node tools/check-dnd5e-citations.mjs
 *
 * Exits non-zero when the installed dnd5e is not the version the citations were
 * verified against.
 *
 * WHY THIS EXISTS. On 2026-08-17 dnd5e went from 5.2.5 to 5.3.3 mid-development.
 * `longRest` was refactored to delegate to a shared `initiateRest` and roughly four
 * thousand lines shifted, so all 55 `dnd5e.mjs:NNNN` pointers in this repo were off
 * by thousands and aimed at unrelated code -- one landed on `return this.#app;`.
 *
 * Every mechanism still worked. Nothing threw, no test failed, and no doc was edited.
 * The repo simply became quietly wrong, in exactly the way its own documentation
 * rules warn about, without anyone doing anything.
 *
 * A check cannot know whether a citation is CORRECT -- that needs a human who knows
 * what was being pointed at. What it can do is notice the one event that invalidates
 * them all, and make the repair cheap: when the version moves, this prints every
 * citation next to the line it now points at, so re-verification is a scan rather
 * than an excavation.
 *
 * The workflow when it fires:
 *   1. Read the table it prints. Most citations will have moved together.
 *   2. For each, find what it was pointing AT and correct the number.
 *   3. Re-verify the CLAIM, not just the location -- a refactor can change behaviour,
 *      and a correctly-relocated pointer to changed behaviour is worse than a broken
 *      one, because it looks right.
 *   4. Bump VERIFIED_AGAINST.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The dnd5e release every citation in this repo was checked against by hand.
 *
 * Bump this ONLY after re-verifying the citations, never to silence the check.
 */
const VERIFIED_AGAINST = '5.3.3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where dnd5e lives, relative to this module.
 *
 * Derived rather than hardcoded: this repo is public, and an absolute path would
 * carry one machine's layout into everyone's clone. A module sits at
 * `Data/modules/<id>`, so the systems directory is two levels up. `DND5E_PATH`
 * overrides it for anyone whose install is arranged differently.
 */
const SYSTEM_DIR = process.env.DND5E_PATH ?? path.resolve(ROOT, '..', '..', 'systems', 'dnd5e');

/** Files that may carry citations. Everything we author, excluding this check. */
const SEARCH_DIRS = ['scripts', 'documentation', 'testing', 'tools'];
const SEARCH_EXT = new Set(['.js', '.mjs', '.md', '.hbs']);

function walk(dir, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (SEARCH_EXT.has(path.extname(entry.name))) out.push(full);
    }
    return out;
}

const citations = [];
for (const dir of SEARCH_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
        if (path.basename(file) === 'check-dnd5e-citations.mjs') continue;
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((text, index) => {
            for (const match of text.matchAll(/dnd5e\.mjs:(\d+)/g)) {
                citations.push({
                    file: path.relative(ROOT, file).replace(/\\/g, '/'),
                    line: index + 1,
                    target: Number(match[1])
                });
            }
        });
    }
}

// --- Is the system even here? ---------------------------------------------------
//
// Absent is not a failure. CI has no Foundry install, and a check that fails in CI
// for being unable to look at something teaches people to ignore it.
const manifestPath = path.join(SYSTEM_DIR, 'system.json');
if (!fs.existsSync(manifestPath)) {
    console.log(`dnd5e citation check skipped: no dnd5e install at ${path.relative(ROOT, SYSTEM_DIR).replace(/\\/g, '/')} ` +
        `(${citations.length} citations recorded against ${VERIFIED_AGAINST}). Set DND5E_PATH to check them.`);
    process.exit(0);
}

const installed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
const sourcePath = path.join(SYSTEM_DIR, 'dnd5e.mjs');
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8').split('\n') : null;

const at = (n) => (source && n <= source.length ? source[n - 1].trim().slice(0, 76) : '<beyond end of file>');

if (installed !== VERIFIED_AGAINST) {
    console.error(`dnd5e citation check FAILED: citations were verified against ${VERIFIED_AGAINST}, ` +
        `but ${installed} is installed.\n`);
    console.error(`  All ${citations.length} citations below are now SUSPECT. Each one is shown with the line it ` +
        `currently points at.\n  Re-verify the CLAIM as well as the location, then bump VERIFIED_AGAINST in this file.\n`);

    for (const c of citations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
        console.error(`  ${c.file}:${c.line}  ->  dnd5e.mjs:${c.target}`);
        console.error(`      now reads: ${at(c.target)}`);
    }
    console.error('');
    process.exit(1);
}

// --- Same version: the numbers must at least be reachable -----------------------
const outOfRange = source ? citations.filter((c) => c.target > source.length || c.target < 1) : [];

if (outOfRange.length) {
    console.error('dnd5e citation check FAILED: citations point beyond the end of dnd5e.mjs.\n');
    for (const c of outOfRange) {
        console.error(`  - ${c.file}:${c.line} cites dnd5e.mjs:${c.target}, but the file has ${source.length} lines`);
    }
    console.error('');
    process.exit(1);
}

// --- Does the manifest claim a newer dnd5e than the citations were checked on? ---
//
// `module.json`'s `verified` says "the module was tested against this dnd5e"; the
// constant above says "the citations were read against this". They are different
// claims and may legitimately differ -- but bumping the manifest at release time and
// forgetting the citations is exactly the slip that produced this check, so the
// disagreement is worth saying out loud. A note, not a failure: the manifest is the
// author's call and a release should not be blocked by a comment.
let manifestNote = '';
try {
    const declared = JSON.parse(fs.readFileSync(path.join(ROOT, 'module.json'), 'utf8'))
        .relationships?.systems?.find((s) => s.id === 'dnd5e')?.compatibility?.verified;

    if (declared && declared !== VERIFIED_AGAINST) {
        manifestNote = `\n  Note: module.json declares dnd5e verified ${declared}, but citations were checked ` +
            `against ${VERIFIED_AGAINST}. If the module was retested on ${declared}, the citations were not.`;
    }
} catch {
    // A manifest we cannot read is not this check's problem.
}

console.log(`dnd5e citation check passed: ${citations.length} citations, all in range, verified against ` +
    `dnd5e ${VERIFIED_AGAINST} (installed: ${installed}).${manifestNote}`);
