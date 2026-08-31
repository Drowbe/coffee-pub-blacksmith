#!/usr/bin/env node
// ==================================================================
// check-imports.mjs
// ==================================================================
// Every named import in scripts/ -- static `import { a } from './x.js'` and
// lazy `const { a } = await import('./x.js')` alike -- names an export that
// ./x.js actually has.
//
// WHY THIS EXISTS, and it is two different reasons.
//
// A LAZY import that names a missing export resolves to `undefined` and throws
// only when the name is finally called -- which for the importer means at
// document construction, in Foundry, on a payload that reaches that branch.
//
// A STATIC one throws at module load, which sounds self-correcting and is not.
// Blacksmith is the hub thirteen sibling modules import, CI runs no checks, and
// the only gate is a person launching Foundry. A missing export is therefore not
// a localised throw but a module-load failure in the graph every sibling waits
// on, discovered after the commit that caused it. `node --check` does not help:
// it parses without resolving, so a symbol moved between files without its
// `export` keeps every file syntactically valid. That happened here, twice in
// one change, and is why this covers both forms.
//
// The declaration layer is built on lazy imports on purpose: transforms,
// derivations and parsers all reach `const.js`, which fetches `module.json`
// while it loads, so importing them at the top would drag Foundry into the
// registry and cost validation and template derivation their headless
// testability. That design decision buys a great deal and creates exactly one
// blind spot, and this closes it.
//
// Neither half is hypothetical. Adding the Journal derivations pulled
// `getCachedTemplate` from `utility-common.js`, which imports it from
// `blacksmith.js` rather than exporting it, and `applyJournalHeadingSpacing`
// from the same wrong module; both destructured to `undefined` and would have
// thrown on the first journal import and on nothing before that. Splitting the
// geography vocabulary into a leaf module moved a constant without its `export`
// and a function away from its caller, and all three files still parsed clean.
//
// Exits non-zero on a violation. Run it after touching any lazily-imported
// module boundary.
// ==================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Both trees. The suites import `../harness-lib.js` relatively, so a rename there
// breaks every suite at once and the harness reports it as a suite load failure
// rather than as the missing export it is. Found by Artificer, who adapted this
// check and walked their testing tree because their suites do the same.
const ROOTS = ['scripts', 'testing'].map(dir => resolve(ROOT, dir));

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
 * Leading whitespace is allowed on every form: an indented top-level export is
 * unusual formatting, not invalid JS, and anchoring hard on `^export` reported
 * three real exports in `api-core.js` as missing. A checker that cries wolf is
 * worse than none, because the first thing anyone does is stop believing it.
 *
 * Deliberately syntactic rather than a real parse: this repo has no build step
 * and adding a parser dependency to run one check would cost more than it saves.
 * The shapes below are the ones the codebase actually uses, and an unrecognised
 * shape makes the check MISS a violation rather than invent one -- the safe
 * direction for a heuristic that gates nothing but its own error message.
 */
function exportedNames(source) {
    const names = new Set();
    for (const match of source.matchAll(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/^\s*export\s+class\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
        names.add(match[1]);
    }
    // `export { a, b as c }` -- the exported name is what follows `as`, or the
    // bare name when there is no rename.
    for (const match of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
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
    return /^\s*export\s+\*/m.test(source);
}

// Both import forms, each reduced to the same pair: the braced name list, and the
// specifier. A default or namespace import names nothing to verify and is skipped
// by requiring the braces.
const PATTERNS = [
    { kind: 'lazily imports',
      re: /const\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g },
    { kind: 'imports',
      re: /^\s*import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm }
];

const files = ROOTS.flatMap(dir => walk(dir));
const cache = new Map();
const problems = [];
let checked = 0;

for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
        // A cache-busting query string is not part of the path. The harness appends
        // one deliberately when re-importing a suite, and resolving it verbatim would
        // report every such import as a missing file.
        const specifier = match[2].split('?')[0];
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
            // The two forms rename in OPPOSITE directions, and conflating them
            // reports the local alias as the missing export. A lazy import
            // destructures -- `{ a: b }` takes the export `a`. A static import
            // uses `as` -- `{ a as b }` also takes the export `a`, but the text
            // after the keyword is the local name, not the wanted one.
            const wanted = (kind === 'imports'
                ? piece.split(/\s+as\s+/)[0]
                : piece.split(':')[0]).trim();
            if (!wanted || wanted.startsWith('...')) continue;
            checked++;
            if (!available.has(wanted)) {
                problems.push(
                    `${relative(ROOT, file)}: ${kind} "${wanted}" from "${specifier}", `
                    + `which does not export it`);
            }
        }
    }
    }
}

if (problems.length) {
    console.error(`check-imports: ${problems.length} problem(s).\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('\nA lazy import naming a missing export is undefined until it is called, so it');
    console.error('throws in Foundry at construction time and nowhere earlier. A static one fails');
    console.error('the whole module load, in a graph thirteen sibling modules import.');
    process.exit(1);
}

console.log(`check-imports: ${checked} imported name(s) resolve across ${files.length} file(s).`);
