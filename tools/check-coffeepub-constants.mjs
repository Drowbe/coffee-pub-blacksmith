// ==================================================================
// tools/check-coffeepub-constants.mjs
// ==================================================================
// Invariant check: every `COFFEEPUB.NAME` a script reads is a name some
// config or theme actually defines, and every numeric fallback written
// beside one agrees with the value it is standing in for.
//
// WHY THIS EXISTS. A cinematic contested roll ended on a sound played with
// `COFFEEPUB.SOUNDVOLUMELOW`, and no such constant exists --
// `resources/config-volumes.json` defines MAX, LOUD, NORMAL and SOFT and
// nothing else. The read produced `undefined`, `undefined` triggered
// `playSound`'s default parameter, and the loudest moment of the roll played
// at 0.7 while the success and failure sounds beside it played at 0.5. It was
// reported from play as "incredibly loud", which is the only symptom this
// class ever produces.
//
// NOTHING THROWS AND NOTHING LOGS. A missing constant is `undefined`, a
// default parameter quietly supplies a number, and the code runs correctly by
// every mechanical measure. A comment in `utility-asset-lookup.js` records the
// same class biting once before, when `SOUNDVOLUMENORMAL` resolved to an id
// string rather than a number and every call clamped to NaN. Twice is a
// pattern, and neither instance was findable by reading the call site.
//
// THE SECOND CHECK IS THE ONE THAT SURPRISED US. Four sites read
// `COFFEEPUB.SOUNDVOLUMENORMAL ?? 0.7` while that constant is 0.5 -- so the
// guard was LOUDER than the value it guarded, and a world where the constant
// failed to load got a louder sound than a working one. A fallback that
// disagrees with what it replaces is not a fallback, it is a second value
// nobody knows about.
// ==================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Names that are legitimately assigned at runtime rather than loaded from a
// config file. Each needs a reason, so that adding one is a decision.
const RUNTIME_NAMES = new Map([
    ['MODULES', 'the live module registry, built by manager-modules.js']
]);

const problems = [];
let checked = 0;

function filesUnder(dir, extension, skip = /node_modules|[\\/]packs[\\/]|[\\/]vendor[\\/]/) {
    const found = [];
    const walk = (at) => {
        let entries;
        try { entries = readdirSync(at, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const full = join(at, entry.name);
            if (skip.test(full)) continue;
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(extension)) found.push(full);
        }
    };
    walk(dir);
    return found;
}

// ==================================================================
// WHAT IS DEFINED
// ==================================================================
// Read from the same JSON the runtime reads, rather than from a list kept
// here: a checker with its own copy of the answer is the defect it is meant
// to catch, one layer up.
const defined = new Map();
for (const file of [...filesUnder(join(REPO, 'resources'), '.json'),
                    ...filesUnder(join(REPO, 'themes'), '.json')]) {
    let text;
    try { text = readFileSync(file, 'utf-8'); } catch { continue; }
    // Paired rather than parsed, because these files nest differently and the
    // pairing is what matters: a name and the value it resolves to.
    for (const match of text.matchAll(
        /"value"\s*:\s*"?([^",}]*)"?\s*,\s*"constantname"\s*:\s*"([A-Z0-9_]+)"/g)) {
        defined.set(match[2], match[1].trim());
    }
    for (const match of text.matchAll(
        /"constantname"\s*:\s*"([A-Z0-9_]+)"\s*,\s*"value"\s*:\s*"?([^",}]*)"?/g)) {
        if (!defined.has(match[1])) defined.set(match[1], match[2].trim());
    }
    // A name with no adjacent value still counts as DEFINED; only the value
    // comparison needs the pair.
    for (const match of text.matchAll(/"constantname"\s*:\s*"([A-Z0-9_]+)"/g)) {
        if (!defined.has(match[1])) defined.set(match[1], null);
    }
}

if (!defined.size) {
    console.error('check-coffeepub-constants: found no constantname entries at all -- '
        + 'the config layout has moved and this check is not testing anything.');
    process.exit(1);
}

// ==================================================================
// WHAT IS READ
// ==================================================================
const REFERENCE = /COFFEEPUB\s*\??\.\s*([A-Z][A-Z0-9_]{2,})/g;
// `COFFEEPUB.NAME ?? 1.23` -- the fallback and the constant it replaces.
const WITH_FALLBACK = /COFFEEPUB\s*\??\.\s*([A-Z][A-Z0-9_]{2,})\s*\?\?\s*([0-9]*\.?[0-9]+)/g;

for (const file of filesUnder(join(REPO, 'scripts'), '.js')) {
    const where = relative(REPO, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf-8').split(/\r?\n/);

    lines.forEach((line, index) => {
        const at = `${where}:${index + 1}`;
        // A commented line documents; it does not read.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

        for (const match of line.matchAll(REFERENCE)) {
            checked++;
            const name = match[1];
            if (defined.has(name) || RUNTIME_NAMES.has(name)) continue;
            problems.push(`${at}: COFFEEPUB.${name} is read but no config or theme defines it. `
                + `It resolves to undefined, which reads as "use the default" rather than as an error.`);
        }

        for (const match of line.matchAll(WITH_FALLBACK)) {
            checked++;
            const [, name, fallback] = match;
            const value = defined.get(name);
            if (value === undefined || value === null) continue;
            const declared = Number(value);
            if (!Number.isFinite(declared) || Number(fallback) === declared) continue;
            problems.push(`${at}: COFFEEPUB.${name} falls back to ${fallback}, but that constant `
                + `is ${value}. A fallback that disagrees with what it replaces is a second value `
                + `nobody knows about, and it only shows up when the constant fails to load.`);
        }
    });
}

if (problems.length) {
    console.error('check-coffeepub-constants: a constant reference will not resolve as written.\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
}

console.log(`check-coffeepub-constants: ${checked} reference(s) checked against `
    + `${defined.size} defined constant(s); all resolve and all fallbacks agree.`);
