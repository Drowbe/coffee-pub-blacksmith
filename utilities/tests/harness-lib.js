// ==================================================================
// ===== TEST HARNESS LIB (utilities/tests/harness-lib.js) ==========
// ==================================================================
//
// Shared helpers for Blacksmith test suites. Loaded by
// utilities/test-harness.js; suites import what they need from here.
//
// Two tiers, deliberately:
//
//   headless    — contract assertions that self-report PASS/FAIL with no
//                 interaction. Cheap to run in bulk. This is the tier that
//                 catches a regression six months from now, and the tier
//                 "Run All Headless" executes.
//   interactive — checks only a person can judge: does Glass look right,
//                 does keyboard navigation work, did the toast reach the
//                 other client. One button each; the harness stays open.
//
// A suite module default-exports:
//
//   {
//       id, label,
//       icon,                        // optional Font Awesome class
//       settings: () => [ { label, value, note } ],   // optional
//       checks: [ {
//           id, label,
//           tier: 'headless' | 'interactive',
//           note,                    // optional, shown under the button
//           run: async (ctx) => {}   // ctx: { api, expect, log, subject }
//       } ]
//   }
//
// Register the suite's path in SUITES in utilities/test-harness.js.
// ==================================================================

export const MODULE_ID = 'coffee-pub-blacksmith';

/** The module API, or a thrown error naming what is missing. */
export function requireApi(...paths) {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!api) throw new Error(`${MODULE_ID} api is unavailable — is the module enabled and Foundry reloaded?`);
    for (const path of paths) {
        const value = path.split('.').reduce((node, key) => node?.[key], api);
        if (value === undefined) throw new Error(`api.${path} is missing — reload after the module update.`);
    }
    return api;
}

/** A setting value, or the fallback when it is not registered. */
export function setting(key, fallback = null) {
    try {
        const value = game.settings.get(MODULE_ID, key);
        return value === undefined ? fallback : value;
    } catch (_) {
        return fallback;
    }
}

/**
 * The token a check operates on: targeted first, then selected.
 * Returns null and warns when there is none, so a check can bail cleanly.
 */
export function subjectToken({ required = true } = {}) {
    const token = Array.from(game.user.targets ?? [])[0] ?? canvas?.tokens?.controlled?.[0] ?? null;
    if (!token?.actor && required) {
        ui.notifications.warn('Target (or select) a token with an actor first.');
        return null;
    }
    return token;
}

/** Structural equality that tolerates key order and treats undefined as absent. */
export function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a).filter(k => a[k] !== undefined);
    const keysB = Object.keys(b).filter(k => b[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
}

/** Compact display for assertion output. */
export function display(value) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value instanceof HTMLElement) return `<${value.tagName.toLowerCase()}>`;
    try {
        const text = JSON.stringify(value);
        return text === undefined ? String(value) : (text.length > 120 ? `${text.slice(0, 117)}...` : text);
    } catch (_) {
        return String(value);
    }
}

/**
 * Collects assertions for one headless check.
 * `expect(label, actual, expected)` compares structurally;
 * `expect.ok(label, condition)` asserts truthiness.
 */
export function createRecorder() {
    const results = [];
    const expect = (label, actual, expected) => {
        const pass = deepEqual(actual, expected);
        results.push({ label, pass, actual, expected });
        return pass;
    };
    expect.ok = (label, condition) => {
        const pass = Boolean(condition);
        results.push({ label, pass, actual: condition, expected: true });
        return pass;
    };
    expect.throws = async (label, fn) => {
        let threw = false;
        try {
            await fn();
        } catch (_) {
            threw = true;
        }
        results.push({ label, pass: threw, actual: threw, expected: true });
        return threw;
    };
    return { results, expect };
}

/**
 * Whether any loaded stylesheet contains `marker` in its rules.
 *
 * Recurses through CSSImportRule: Blacksmith loads one `default.css` that
 * `@import`s ~50 others, so an imported sheet's rules are NOT reachable from
 * document.styleSheets[].cssRules — they sit behind the import rule. Scanning
 * only the top level reports every imported stylesheet as missing.
 *
 * @param {string} marker - A class or selector fragment to look for.
 * @returns {boolean}
 */
export function stylesheetContains(marker) {
    const seen = new Set();
    const scan = (sheet) => {
        if (!sheet || seen.has(sheet)) return false;
        seen.add(sheet);
        let rules;
        try {
            rules = sheet.cssRules;
        } catch (_) {
            return false;   // cross-origin sheet; not ours
        }
        for (const rule of rules ?? []) {
            if (rule.styleSheet) {                 // CSSImportRule
                if (scan(rule.styleSheet)) return true;
                continue;
            }
            if (String(rule.cssText ?? '').includes(marker)) return true;
        }
        return false;
    };
    return [...document.styleSheets].some(scan);
}

/**
 * A settings row for a suite's live-settings box.
 * Shows the gate a check runs through, so a no-op reads as "correct,
 * the feature is off" rather than "broken".
 */
export function settingRow(label, value, note = null) {
    return { label, value: String(value), note };
}
