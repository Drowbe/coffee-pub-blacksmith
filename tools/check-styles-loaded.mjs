#!/usr/bin/env node
/**
 * Invariant check: every stylesheet on disk is actually loaded, and every import
 * resolves.
 *
 * A CSS file that nothing imports is silently dead. Nothing errors, no rule
 * matches, and the feature simply renders with no styling -- which reads as "that
 * UI was never finished" rather than as a wiring mistake, so it can sit for a long
 * time. `styles/default.css` says so at the top, and it happened anyway:
 * `widget-tags.css` was unreachable while `templates/partials/tag-widget.hbs`
 * was registered as the `blacksmith-tag-widget` partial and ready to render.
 * Found 2026-08-16 by
 * listing the directory and diffing it against the import list, which is exactly
 * what this now does on demand.
 *
 * The reverse is checked too. An `@import` naming a file that no longer exists is
 * a dead line that also breaks the chain in some parsers, and it is what a rename
 * leaves behind.
 *
 * TWO LOAD PATHS EXIST, and both count as loaded:
 *   - `module.json` `styles[]`, which Foundry injects directly
 *   - an `@import` chain from any of those roots
 * `notes-gm.css` uses the first and everything else uses the second, so a check
 * that only knew about `default.css` would report it as dead.
 *
 * Run: node tools/check-styles-loaded.mjs
 * Exits non-zero on a violation.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES_DIR = join(REPO, 'styles');

const problems = [];
let checked = 0;

const manifest = JSON.parse(readFileSync(join(REPO, 'module.json'), 'utf8'));
const roots = (manifest.styles ?? [])
    .filter((s) => s.startsWith('styles/'))
    .map((s) => basename(s));

if (!roots.length) {
    problems.push('module.json declares no stylesheets under styles/ -- nothing would load at all');
}

// Walk the @import graph from every manifest root.
const reached = new Set();
const queue = [...roots];
while (queue.length) {
    const file = queue.shift();
    if (reached.has(file)) continue;
    reached.add(file);

    const path = join(STYLES_DIR, file);
    if (!existsSync(path)) {
        problems.push(`"${file}" is imported (or declared in module.json) but does not exist on disk`);
        continue;
    }

    checked++;
    const css = readFileSync(path, 'utf8');
    for (const match of css.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) {
        const target = basename(match[1]);
        if (!existsSync(join(STYLES_DIR, target))) {
            problems.push(`"${file}" imports "${target}", which does not exist on disk`);
            continue;
        }
        queue.push(target);
    }
}

// Anything on disk the walk never touched is loaded by nothing.
//
// An EMPTY file is caught here too, and it is the more dangerous of the two. A
// stylesheet nothing imports is at least suspicious in a diff; an emptied one is
// reachable, resolves, and passes every check while every window it dressed silently
// loses its layout. It happened: an editing script opened this project's largest
// stylesheet for writing and read it back inside the same call, so the open truncated
// it before the read ran, and 1,584 lines were replaced with nothing. Two windows
// broke, in different features, and nothing reported a thing.
for (const file of readdirSync(STYLES_DIR).filter((f) => f.endsWith('.css'))) {
    checked++;
    if (!reached.has(file)) {
        problems.push(`"${file}" is on disk but nothing loads it -- no @import reaches it and module.json does not declare it. Every rule in it is dead and nothing will error.`);
        continue;
    }
    // A stylesheet has to DO something: carry a rule, or import one. `default.css` is
    // the case that makes the second half necessary -- it is nothing but @imports by
    // design, and a brace-only test called the entry point of the whole load path empty.
    const body = readFileSync(join(STYLES_DIR, file), 'utf8');
    const carriesRules = body.includes('{');
    const carriesImports = /@import\s/.test(body);
    if (!carriesRules && !carriesImports) {
        problems.push(`"${file}" is loaded but contains no rules (${body.length} bytes). An emptied stylesheet resolves and imports cleanly, so nothing else here would notice -- and every window it dressed loses its layout.`);
    }
}

if (problems.length) {
    console.error('check-styles-loaded: the stylesheet load path is broken.\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-styles-loaded: ${checked} checks passed (${reached.size} stylesheets reachable from ${roots.length} manifest root(s), every import resolves).`);
