#!/usr/bin/env node
/**
 * Guard the world clock's cross-file couplings.
 *
 * The feature is deliberately split across three files that must agree, and every
 * disagreement between them fails SILENTLY -- a renamed class selects nothing, a
 * moved gradient stop paints dawn at the wrong time, a renamed partial throws only
 * when the menubar renders. None of it is visible in review, because the two halves
 * are never on screen together.
 *
 *   node tools/check-worldclock.mjs
 *
 * Exits non-zero on a violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MANAGER = 'scripts/manager-worldclock.js';
const PARTIAL = 'templates/partials/worldclock.hbs';
const STYLES = 'styles/worldclock.css';
const MENUBAR = 'templates/menubar.hbs';

const problems = [];
const manager = read(MANAGER);
const partial = read(PARTIAL);
const styles = read(STYLES);
const menubar = read(MENUBAR);

// --- 1. Every custom property JS sets must be one the stylesheet reads ----------
//
// The manager computes the sky and hands it over as CSS custom properties. A
// property the stylesheet never reads is computed for nothing; a property the
// stylesheet reads but nothing sets silently falls back to its default, so the
// panel keeps painting a plausible sky that has stopped tracking the time. Both
// directions are wrong and neither throws.
const declared = new Set([
    ...(manager.match(/'(--[a-z-]+)'\s*:/g) || []).map((m) => m.match(/(--[a-z-]+)/)[1]),
    ...(manager.match(/setProperty\('(--[a-z-]+)'/g) || []).map((m) => m.match(/(--[a-z-]+)/)[1])
]);

const consumed = new Set((styles.match(/var\((--[a-z-]+)/g) || []).map((m) => m.match(/(--[a-z-]+)/)[1]));

if (declared.size === 0) {
    problems.push(`${MANAGER}: found no CSS custom properties at all — has the sky pipeline changed?`);
}

for (const name of [...declared].sort()) {
    if (!consumed.has(name)) {
        problems.push(
            `${STYLES}: never reads var(${name}), but ${MANAGER} sets it. Either the stylesheet ` +
            `stopped using it (so it is computed for nothing) or it was renamed on one side only.`
        );
    }
}

for (const name of [...consumed].sort()) {
    // Only the sky pipeline's own properties; the stylesheet may legitimately read
    // menubar-wide variables that this feature does not set.
    if (!/^--(sky|star|body)-/.test(name)) continue;
    if (!declared.has(name)) {
        problems.push(
            `${STYLES}: reads var(${name}), but ${MANAGER} never sets it. It will silently fall ` +
            `back to its default, so the panel paints a plausible sky that no longer tracks the time.`
        );
    }
}

// The sky stops describe a full day and must close the loop: the colour at the end
// of the day is the colour at the start of the next one. A mismatch shows up as a
// single-frame flash at midnight, which is nearly impossible to catch by eye.
const stopLine = manager.match(/SKY_STOPS\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
const stops = [...stopLine.matchAll(/at:\s*([0-9.]+),\s*top:\s*\[([^\]]+)\],\s*bottom:\s*\[([^\]]+)\]/g)]
    .map((m) => ({ at: Number(m[1]), top: m[2].trim(), bottom: m[3].trim() }));

if (stops.length < 2) {
    problems.push(`${MANAGER}: could not parse SKY_STOPS.`);
} else {
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (first.at !== 0 || last.at !== 1) {
        problems.push(`${MANAGER}: SKY_STOPS must run from 0 to 1, found ${first.at} to ${last.at}.`);
    }
    if (first.top !== last.top || first.bottom !== last.bottom) {
        problems.push(
            `${MANAGER}: the first and last SKY_STOPS differ, so the sky jumps at midnight. ` +
            `Stop 0 is [${first.top}] over [${first.bottom}]; stop 1 is [${last.top}] over [${last.bottom}].`
        );
    }
    for (let i = 1; i < stops.length; i++) {
        if (stops[i].at <= stops[i - 1].at) {
            problems.push(
                `${MANAGER}: SKY_STOPS must be sorted ascending; ${stops[i].at} follows ${stops[i - 1].at}. ` +
                `The interpolation walks the list in order and silently picks the wrong pair otherwise.`
            );
            break;
        }
    }
}

// --- 2. Every class the manager reaches for must exist in the markup ------------
//
// The manager finds its nodes by class. A rename in the partial leaves
// `querySelector` returning null, and every paint path is written to fail quietly
// rather than throw -- so the clock simply stops updating, with nothing logged.
const queried = new Set((manager.match(/querySelector(?:All)?\('\.([a-z0-9-]+)'\)/g) || [])
    .map((m) => m.match(/'\.([a-z0-9-]+)'/)[1])
    .filter((c) => c.startsWith('worldclock')));

for (const cls of [...queried].sort()) {
    if (!partial.includes(cls)) {
        problems.push(
            `${PARTIAL}: no element carries ".${cls}", but ${MANAGER} queries for it. ` +
            `The lookup returns null and the widget silently stops updating.`
        );
    }
}

if (queried.size === 0) {
    problems.push(`${MANAGER}: found no .worldclock-* selectors at all — has the naming changed?`);
}

// --- 3. The partial is registered under the name the menubar invokes ------------
//
// Handlebars throws on a missing partial, and the menubar's render guard catches
// it -- so a mismatch costs the WHOLE menubar and surfaces only as a logged error.
const registered = manager.match(/registerPartial\('([^']+)'/)?.[1] ?? null;
const invoked = menubar.match(/\{\{>\s*"([^"]*worldclock[^"]*)"/)?.[1] ?? null;

if (!registered) {
    problems.push(`${MANAGER}: no Handlebars.registerPartial call found.`);
} else if (!invoked) {
    problems.push(`${MENUBAR}: nothing invokes a world clock partial.`);
} else if (registered !== invoked) {
    problems.push(
        `Partial name mismatch: ${MANAGER} registers "${registered}" but ${MENUBAR} invokes ` +
        `"${invoked}". Handlebars throws on a missing partial, and the menubar's render guard ` +
        `swallows it — the entire menubar disappears, not just the clock.`
    );
}

// --- 4. The partial must read the context key the menubar supplies --------------
const providedKey = manager.includes('getRenderData')
    ? (read('scripts/api-menubar.js').match(/(\w+):\s*WorldClockManager\.getRenderData\(\)/)?.[1] ?? null)
    : null;

if (providedKey && !partial.includes(`${providedKey}.`)) {
    problems.push(
        `${PARTIAL}: reads no "${providedKey}.*" values, but the menubar supplies its render data ` +
        `under that key. Handlebars renders missing values as empty strings, so the widget would ` +
        `render blank rather than error.`
    );
}

// --- Report --------------------------------------------------------------------
if (problems.length > 0) {
    console.error('World clock check FAILED:\n');
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
}

console.log('World clock check passed: sky variables, stop table, class names, partial name and context key all agree.');
