#!/usr/bin/env node
/**
 * Guard the note reminders' two-clock table.
 *
 * One mechanism serves two clocks -- in-world time and the wall clock -- driven by
 * the CLOCKS table in the manager. That is the right shape, and it has one failure
 * mode: a clock that is declared but not wired all the way through. Every version
 * of that failure is SILENT. A clock missing a field returns `undefined` where a
 * number is expected and its reminders simply never fire; a flag name reused
 * between the two clocks makes one overwrite the other on the same note; a public
 * method that only ever names one clock leaves the other unreachable from the API.
 * None of it throws, and none of it is visible in review, because the two halves
 * are never on screen together.
 *
 *   node tools/check-note-reminders.mjs
 *
 * Exits non-zero on a violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MANAGER = 'scripts/manager-note-reminders.js';
const API = 'scripts/api-notes.js';
const EDITOR = 'scripts/window-note-editor.js';
const LIST = 'scripts/window-notes.js';
const STYLES = 'styles/window-notes.css';

const problems = [];
const manager = read(MANAGER);
const api = read(API);
const editor = read(EDITOR);
const list = read(LIST);
const styles = read(STYLES);

// --- 1. Every clock in REMINDER_CLOCKS must have a CLOCKS entry -----------------
//
// A name exported as a clock but absent from the table resolves to `undefined` in
// `spec()`, and every method guarded on that returns an empty result rather than
// failing. A caller sees "no reminders", not "no such clock".
const clockNames = [...manager.matchAll(/^\s+([A-Z]+):\s*'([a-z]+)'/gm)].map((m) => m[2]);

if (clockNames.length < 2) {
    problems.push(
        `${MANAGER}: expected at least two clocks in REMINDER_CLOCKS, found ${clockNames.length}. ` +
        `If a clock was removed deliberately, this check needs updating with it.`
    );
}

const REQUIRED_FIELDS = ['dueFlag', 'firedFlag', 'now', 'lateGap', 'format'];
const tableBody = manager.match(/const CLOCKS = \{([\s\S]*?)\n\};/)?.[1] ?? '';

for (const clock of clockNames) {
    const entry = tableBody.match(
        new RegExp(`\\[REMINDER_CLOCKS\\.${clock.toUpperCase()}\\]:\\s*\\{([\\s\\S]*?)\\n    \\}`)
    )?.[1];

    if (!entry) {
        problems.push(
            `${MANAGER}: clock '${clock}' is in REMINDER_CLOCKS but has no CLOCKS entry. ` +
            `spec('${clock}') returns null, so every reminder on that clock is silently ignored.`
        );
        continue;
    }

    for (const field of REQUIRED_FIELDS) {
        if (!new RegExp(`\\b${field}\\s*:`).test(entry)) {
            problems.push(
                `${MANAGER}: clock '${clock}' has no '${field}'. Nothing throws -- the scan reads ` +
                `undefined and that clock's reminders never fire.`
            );
        }
    }
}

// --- 2. No two clocks may share a flag name ------------------------------------
//
// The flags are the storage. Two clocks pointing at one flag means setting a
// real-time reminder silently overwrites the in-world one on the same note, which
// looks like the first reminder having been forgotten.
const flagNames = [...tableBody.matchAll(/(dueFlag|firedFlag):\s*'([A-Za-z]+)'/g)].map((m) => m[2]);
const duplicates = flagNames.filter((name, index) => flagNames.indexOf(name) !== index);

if (duplicates.length > 0) {
    problems.push(
        `${MANAGER}: flag name(s) ${[...new Set(duplicates)].join(', ')} are used by more than one ` +
        `clock. One clock's reminder would overwrite the other's on the same note.`
    );
}

// --- 3. Both clocks must be reachable from the public API ----------------------
//
// The manager's generic methods take a clock; the API is the named surface. A
// clock with no named entry point is only reachable by a consumer importing the
// manager, which the API exists to prevent.
const API_PAIRS = [
    ['setReminder', 'setRealReminder'],
    ['clearReminder', 'clearRealReminder'],
    ['getReminder', 'getRealReminder'],
    ['listReminders', 'listRealReminders'],
    ['formatMoment', 'formatRealMoment']
];

for (const [worldName, realName] of API_PAIRS) {
    for (const name of [worldName, realName]) {
        if (!new RegExp(`\\b${name}\\s*:`).test(api)) {
            problems.push(
                `${API}: no '${name}'. Both clocks need a named entry point, or a consumer has to ` +
                `import the manager to reach one of them.`
            );
        }
    }
}

// --- 4. The firing hook must carry which clock fired ----------------------------
//
// A consumer wording a message needs to know whether "Marpenoth 20th" or "7pm" is
// the right thing to say. Without the field the payload is ambiguous and the
// consumer has to guess from the magnitude of the timestamp.
if (!/callAll\('blacksmith\.noteReminderFired',\s*\{[\s\S]*?\bclock,/.test(manager)) {
    problems.push(
        `${MANAGER}: blacksmith.noteReminderFired does not carry 'clock'. A listener cannot tell an ` +
        `in-world reminder from a real-time one, and the two want different wording.`
    );
}

// --- 5. The changed hook must carry which clock changed ------------------------
//
// The calendar draws in-world dates only and filters on this. Drop the field and
// the grid repaints on every real-time reminder, which is waste rather than a bug
// -- but the filter in the calendar then silently does nothing, which is worse
// than either.
if (!/callAll\('blacksmith\.noteRemindersChanged',\s*\{\s*clock\s*\}/.test(manager)) {
    problems.push(
        `${MANAGER}: blacksmith.noteRemindersChanged does not carry { clock }. The calendar filters ` +
        `on it to avoid repainting for real-time reminders; without it that filter is dead code.`
    );
}

// --- 6. The wall clock must be polled, and stoppable ---------------------------
//
// World reminders ride updateWorldTime. Real ones have no such signal, so the poll
// IS the mechanism -- without it a real-time reminder only ever fires at startup,
// which reads as "reminders do not work" rather than as a missing timer.
if (!manager.includes('setInterval')) {
    problems.push(
        `${MANAGER}: no setInterval. Real-time reminders have no event to ride, so without the poll ` +
        `they fire only on the startup scan.`
    );
}
if (!manager.includes('clearInterval')) {
    problems.push(
        `${MANAGER}: starts an interval it never clears. A poll that outlives its manager keeps ` +
        `firing against a stale index with no way to reach it.`
    );
}

// --- 7. Every pane the dialog renders must have a rule that shows it ------------
//
// Both panes are in the DOM and CSS decides which is visible. A pane with no
// matching rule stays `display: none` forever: the switch moves, the fields do
// not, and the dialog looks broken in exactly one of its two modes.
const panes = [...editor.matchAll(/data-pane="\$\{REMINDER_CLOCKS\.([A-Z]+)\}"/g)]
    .map((m) => m[1].toLowerCase());

for (const pane of panes) {
    if (!styles.includes(`[data-active="${pane}"] .blacksmith-note-remind-pane[data-pane="${pane}"]`)) {
        problems.push(
            `${STYLES}: no rule reveals the '${pane}' pane. Both panes render hidden by default, so ` +
            `that half of the dialog would show its switch and no fields.`
        );
    }
}

// --- 8. The note row must mark both clocks --------------------------------------
//
// The row mark is the only place a pending reminder is visible without opening the
// note. Marking one clock and not the other makes reminders on the unmarked clock
// look like they were never set.
const rowMarks = (list.match(/_reminderMark\(/g) || []).length;
if (rowMarks < clockNames.length + 1) {
    problems.push(
        `${LIST}: _reminderMark is called ${rowMarks - 1} time(s) for ${clockNames.length} clock(s). ` +
        `A clock with no row mark is invisible in the list until it fires.`
    );
}

// --- Report --------------------------------------------------------------------
if (problems.length > 0) {
    console.error('Note reminders check FAILED:\n');
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
}

console.log(
    `Note reminders check passed: ${clockNames.length} clocks, each with a complete spec, distinct ` +
    `flags, a named API surface, a dialog pane that can be shown, and a row mark.`
);
