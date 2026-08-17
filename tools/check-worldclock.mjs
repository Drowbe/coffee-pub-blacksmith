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

// --- 1. Sunrise and sunset are drawn twice: as numbers and as gradient stops ----
//
// The CSS gradient is hand-drawn to match the constants. Move one without the
// other and the sun crosses a painted dawn at the wrong time -- which reads as a
// vague "the colours look off", not as a bug with a cause.
const constantOf = (name) => {
    const match = manager.match(new RegExp(`static\\s+${name}\\s*=\\s*([0-9.]+)`));
    return match ? Number(match[1]) : null;
};

const sunrise = constantOf('SUNRISE');
const sunset = constantOf('SUNSET');

if (sunrise === null || sunset === null) {
    problems.push(`${MANAGER}: could not find static SUNRISE and SUNSET.`);
} else {
    const stops = new Set((styles.match(/(\d+(?:\.\d+)?)%/g) || []).map((s) => parseFloat(s)));
    for (const [name, value] of [['SUNRISE', sunrise], ['SUNSET', sunset]]) {
        const percent = value * 100;
        if (!stops.has(percent)) {
            problems.push(
                `${STYLES}: no gradient stop at ${percent}%, but ${MANAGER} sets ${name} = ${value}. ` +
                `The sky gradient must have a stop where the day changes, or the marker crosses ` +
                `dawn or dusk at the wrong point. Stops present: ${[...stops].sort((a, b) => a - b).join('%, ')}%.`
            );
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

console.log('World clock check passed: gradient stops, class names, partial name and context key all agree.');
