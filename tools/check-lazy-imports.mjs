#!/usr/bin/env node
// ==================================================================
// check-lazy-imports.mjs
// ==================================================================
// Every `const { a, b } = await import('./x.js')` in scripts/ names exports
// that ./x.js actually has.
//
// WHY THIS EXISTS. A static `import` that names a missing export throws when the
// module loads, so it is caught the first time anything runs. A LAZY import
// resolves to `undefined` and throws only when the name is finally called --
// which for the importer means at document construction, in Foundry, on a
// payload that reaches that branch.
//
// The declaration layer is built on lazy imports on purpose: transforms,
// derivations and parsers all reach `const.js`, which fetches `module.json`
// while it loads, so importing them at the top would drag Foundry into the
// registry and cost validation and template derivation their headless
// testability. That design decision buys a great deal and creates exactly one
// blind spot, and this closes it.
//
// It is not hypothetical. Adding the Journal derivations pulled
// `getCachedTemplate` from `utility-common.js`, which imports it from
// `blacksmith.js` rather than exporting it, and `applyJournalHeadingSpacing`
// from the same wrong module. Both destructured to `undefined`; both would have
// thrown on the first journal import and on nothing before that.
//
// Exits non-zero on a violation. Run it after touching any lazily-imported
// module boundary.
// ==================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = resolve(ROOT, 'scripts');

/** Every .js file under a directory, recursively. */
function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const path = resolve(dir, name);
        if (statSync(path).isDirectory()) out.push(...walk(path));
        else if (name.endsWith('.js')) out.push(path);
    }
    return out;
}

/**
 * The names a module exports.
 *
 * Deliberately syntactic rather than a real parse: this repo has no build step
 * and adding a parser dependency to run one check would cost more than it saves.
 * The shapes below are the ones the codebase actually uses, and an unrecognised
 * shape makes the check MISS a violation rather than invent one -- the safe
 * direction for a heuristic that gates nothing but its own error message.
 */
function exportedNames(source) {
    const names = new Set();
    for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/^export\s+class\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    // `export { a, b as c }` -- the exported name is what follows `as`, or the
    // bare name when there is no rename.
    for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of match[1].split(',')) {
            const piece = part.trim();
            if (!piece) continue;
            const renamed = piece.match(/\bas\s+([A-Za-z0-9_$]+)$/);
            names.add(renamed ? renamed[1] : piece.split(/\s+/)[0]);
        }
    }
    return names;
}

/** True when a module re-exports wholesale, which this check cannot follow. */
function hasStarExport(source) {
    return /^export\s+\*/m.test(source);
}

const files = walk(SCRIPTS);
const cache = new Map();
const problems = [];
let checked = 0;

for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // `const { a, b } = await import('path')` -- destructured only. A default or
    // namespace import names nothing to verify.
    const pattern = /const\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const match of source.matchAll(pattern)) {
        const specifier = match[2];
        if (!specifier.startsWith('.')) continue;      // bare specifiers are not ours
        const target = resolve(dirname(file), specifier);
        if (!existsSync(target)) {
            problems.push(`${relative(ROOT, file)}: imports "${specifier}", which does not exist`);
            continue;
        }
        if (!cache.has(target)) cache.set(target, readFileSync(target, 'utf8'));
        const targetSource = cache.get(target);
        if (hasStarExport(targetSource)) continue;     // cannot follow a re-export

        const available = exportedNames(targetSource);
        for (const part of match[1].split(',')) {
            const piece = part.trim();
            if (!piece) continue;
            // `{ a: b }` renames on the way in; `a` is what the target must export.
            const wanted = piece.split(':')[0].trim();
            if (!wanted || wanted.startsWith('...')) continue;
            checked++;
            if (!available.has(wanted)) {
                problems.push(
                    `${relative(ROOT, file)}: lazily imports "${wanted}" from "${specifier}", `
                    + `which does not export it`);
            }
        }
    }
}

if (problems.length) {
    console.error(`check-lazy-imports: ${problems.length} problem(s).\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('\nA lazy import that names a missing export is undefined until it is called,');
    console.error('so it throws in Foundry at construction time and nowhere earlier.');
    process.exit(1);
}

console.log(`check-lazy-imports: ${checked} lazily-imported name(s) resolve across ${files.length} file(s).`);
