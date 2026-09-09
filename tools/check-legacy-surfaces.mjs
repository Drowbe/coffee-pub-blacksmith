#!/usr/bin/env node
//
// Guards the two legacy-surface tables and Blacksmith's own conformance to them.
//
// Both tables exist because a wrong assumption about a Foundry generation is expensive and silent:
// registering a retired hook name SUCCEEDS and never fires, and a retired global read through
// `X?.y ?? z` throws exactly as `X.y` does. Neither failure announces itself, so the tables have to
// stay well-formed and Blacksmith has to obey its own advice.
//
// What this enforces:
//   1. LEGACY_HOOKS entries are complete (`since`, `note`, and an explicit `replacement` including null).
//   2. LEGACY_GLOBALS entries carry both a name and a modern replacement.
//   3. Blacksmith registers no hook name that LEGACY_HOOKS can auto-remap -- those are a plain rename
//      with no design decision attached, so writing the retired name is simply a mistake.
//   4. Every console command the tables advertise is actually wired up.
//
// It deliberately does NOT fail on registrations of a `replacement: null` name. Those need a port to a
// differently-shaped hook, not a rename, and Blacksmith still has some. They are reported instead, so
// the number is visible and can only be argued down.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_FILE = join(ROOT, 'scripts', 'manager-hooks.js');
const GLOBALS_FILE = join(ROOT, 'scripts', 'utility-legacy-globals.js');

const errors = [];
const notes = [];

const hooksSrc = readFileSync(HOOKS_FILE, 'utf8');
const globalsSrc = readFileSync(GLOBALS_FILE, 'utf8');

// --- 1. LEGACY_HOOKS well-formed -------------------------------------------------------------
const tableMatch = hooksSrc.match(/static LEGACY_HOOKS = \{([\s\S]*?)\n    \};/);
if (!tableMatch) {
    errors.push('manager-hooks.js: LEGACY_HOOKS table not found (renamed or reformatted?).');
}

const legacyHookNames = [];
if (tableMatch) {
    const body = tableMatch[1];
    const entryRe = /^\s{8}(\w+):\s*\{([\s\S]*?)^\s{8}\}/gm;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
        const [, name, fields] = m;
        legacyHookNames.push(name);
        if (!/\bsince:\s*'/.test(fields)) errors.push(`LEGACY_HOOKS.${name}: missing "since".`);
        if (!/\bnote:\s*'/.test(fields)) errors.push(`LEGACY_HOOKS.${name}: missing "note".`);
        if (!/\breplacement:\s*(null|')/.test(fields)) {
            errors.push(`LEGACY_HOOKS.${name}: "replacement" must be an explicit string or null.`);
        }
    }
    if (!legacyHookNames.length) errors.push('LEGACY_HOOKS parsed but contains no entries.');
}

const autoRemappable = new Set();
const portOnly = new Set();
if (tableMatch) {
    for (const name of legacyHookNames) {
        const entry = tableMatch[1].match(new RegExp(`${name}:\\s*\\{[\\s\\S]*?replacement:\\s*(null|'[^']+')`));
        if (entry && entry[1] === 'null') portOnly.add(name);
        else if (entry) autoRemappable.add(name);
    }
}

// --- 2. LEGACY_GLOBALS well-formed -----------------------------------------------------------
const globalsMatch = globalsSrc.match(/export const LEGACY_GLOBALS = \[([\s\S]*?)\n\];/);
if (!globalsMatch) {
    errors.push('utility-legacy-globals.js: LEGACY_GLOBALS array not found.');
} else {
    const rows = [...globalsMatch[1].matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*modern:\s*'([^']+)'\s*\}/g)];
    if (rows.length < 5) errors.push(`LEGACY_GLOBALS: only ${rows.length} well-formed entries parsed; expected the full table.`);
    for (const [, name, modern] of rows) {
        if (modern.includes(name) && !modern.includes('.')) {
            errors.push(`LEGACY_GLOBALS.${name}: "modern" (${modern}) is not a namespaced replacement.`);
        }
    }
}

// --- 3 & 4. Blacksmith's own conformance -----------------------------------------------------
const SKIP = /[\\/](vendor|node_modules)[\\/]/;
const files = [];
for (const dir of ['scripts', 'api']) {
    const base = join(ROOT, dir);
    (function walk(d) {
        for (const e of readdirSync(d)) {
            const p = join(d, e);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.(js|mjs)$/.test(e) && !SKIP.test(p)) files.push(p);
        }
    })(base);
}

const deadRegistrations = [];
for (const f of files) {
    if (f === HOOKS_FILE) continue; // the table itself names these
    const src = readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
        const m = line.match(/name:\s*['"](\w+)['"]/);
        if (!m) return;
        const name = m[1];
        const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
        if (autoRemappable.has(name)) {
            errors.push(`${rel}:${i + 1} registers "${name}", which is a plain rename. Write the current name.`);
        } else if (portOnly.has(name)) {
            deadRegistrations.push(`${rel}:${i + 1}  ${name}`);
        }
    });
}

for (const cmd of ['blacksmithSilentHooks', 'blacksmithLegacyGlobals']) {
    const wired = hooksSrc.includes(`window.${cmd}`) || globalsSrc.includes(`window.${cmd}`);
    if (!wired) errors.push(`Console command ${cmd}() is documented but never assigned to window.`);
}

if (deadRegistrations.length) {
    notes.push(
        `${deadRegistrations.length} registration(s) of a retired hook that has no automatic replacement.\n`
        + '  These never fire. Each is currently propped up by a MutationObserver or polling interval\n'
        + '  elsewhere in the same file, so the feature works and the cost is paid every render or tick.\n'
        + '  Port to the ApplicationV2 equivalent -- scripts/manager-journal-tools.js is a worked example.\n'
        + deadRegistrations.map(d => `    ${d}`).join('\n')
    );
}

// --- report ----------------------------------------------------------------------------------
if (notes.length) {
    console.log('check-legacy-surfaces: outstanding work (not a failure)\n');
    for (const n of notes) console.log('  ' + n + '\n');
}

if (errors.length) {
    console.error(`check-legacy-surfaces: ${errors.length} violation(s)\n`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
}

console.log(`check-legacy-surfaces: OK (${legacyHookNames.length} legacy hooks tracked, ${deadRegistrations.length} dead registration(s) outstanding)`);
