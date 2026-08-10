// ==================================================================
// ===== BLACKSMITH TEST HARNESS (utilities/test-harness.js) ========
// ==================================================================
// Paste this entire file into a Foundry SCRIPT MACRO and run it as the
// GM. It loads the suites listed in SUITES below and opens a tabbed
// dialog. The dialog stays open, so you can fire check after check.
//
// There is no build step and no automated runner here — Blacksmith is a
// plain no-build Foundry module and this is a manual console tool, the
// same category as everything else in utilities/. What it adds is one
// entry point and one convention, instead of a dozen scripts each with
// their own.
//
// TWO TIERS
//   headless    — contract assertions, self-reporting PASS/FAIL, no
//                 interaction. "Run All Headless" runs every one of them
//                 across every suite and prints a single summary.
//   interactive — checks only a person can judge (does Glass look right,
//                 does keyboard nav work, did the toast reach the other
//                 client). One button each.
//
// ADDING A SUITE
//   1. Write utilities/tests/suite-<name>.js exporting the shape
//      documented in utilities/tests/harness-lib.js.
//   2. Add its path to SUITES below.
//   An explicit list, not a glob — same reasoning as the PUBLISH list in
//   tools/wiki-sync.mjs: what runs should be a decision, not a side effect
//   of what happens to be on disk.
//
// KEEPING IT HONEST
//   A harness asserting a stale contract is worse than no harness, because
//   it manufactures confidence. Update the relevant suite as part of the
//   change that alters an API — the same rule the workflow already applies
//   to the docs.
// ==================================================================

const BASE = '/modules/coffee-pub-blacksmith/utilities/tests';

const SUITES = [
    `${BASE}/suite-compendiums.js`,
    `${BASE}/suite-dialog.js`,
    `${BASE}/suite-entity-list.js`,
    `${BASE}/suite-inventory.js`,
    `${BASE}/suite-notes.js`,
    `${BASE}/suite-quantity-split.js`,
    `${BASE}/suite-readouts.js`,
    `${BASE}/suite-stats.js`,
    `${BASE}/suite-window-delegation.js`,
    `${BASE}/suite-xp-record.js`
];

// ------------------------------------------------------------------

// Cache-buster. import() caches by URL, so without this a suite edit does not
// take effect until Foundry is fully restarted — and the harness silently runs
// the previous version, which is exactly the kind of false confidence this tool
// is supposed to remove.
const VERSION = `?v=${Date.now()}`;

const { createRecorder, display } = await import(`${BASE}/harness-lib.js${VERSION}`);

const loaded = [];
const loadErrors = [];
for (const path of SUITES) {
    try {
        const module = await import(`${path}${VERSION}`);
        const suite = module.default;
        if (!suite?.id || !Array.isArray(suite.checks)) {
            loadErrors.push(`${path}: not a valid suite (needs id and checks[])`);
            continue;
        }
        loaded.push(suite);
    } catch (error) {
        loadErrors.push(`${path}: ${error.message}`);
    }
}

if (loadErrors.length) {
    console.error('BLACKSMITH HARNESS | suite load failures:\n  ' + loadErrors.join('\n  '));
    ui.notifications.error(`${loadErrors.length} test suite(s) failed to load — see console (F12).`);
}
if (!loaded.length) {
    ui.notifications.error('No test suites loaded. Nothing to run.');
    return;
}

const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (!api) {
    ui.notifications.error('Blacksmith api is unavailable — is the module enabled and Foundry reloaded?');
    return;
}

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** Console + on-screen log for a running check. */
function makeLogger(prefix) {
    return (message) => console.log(`BLACKSMITH HARNESS | ${prefix} | ${message}`);
}

/** Run one headless check, returning its assertion results. */
async function runHeadless(suite, check) {
    const { results, expect } = createRecorder();
    try {
        await check.run({ api, expect, log: makeLogger(`${suite.id}/${check.id}`), game });
    } catch (error) {
        results.push({
            label: `${check.label} — threw: ${error.message}`,
            pass: false,
            actual: String(error),
            expected: 'no exception'
        });
    }
    return results.map(result => ({ ...result, suite: suite.id, check: check.id }));
}

/**
 * Report a completed run.
 *
 * FAILURES FIRST, and each on its own console call. The whole point of a run is the failures, and a
 * single console.log carrying every assertion is the one shape that hides them: Chrome truncates a
 * very long string, so a 476-assertion run with 13 failures printed the passes and cut off before
 * reaching any of them. That happened, and it made the only informative part of the run unreadable.
 *
 * The full pass list still goes out, after the failures and inside a collapsed group so it does not
 * bury them. Per-suite counts come first, because "which suite broke" is the next question after
 * "how many".
 */
function reportRun(all, label) {
    const failed = all.filter(r => !r.pass);
    const passed = all.length - failed.length;

    console.log(`BLACKSMITH HARNESS | ${label}: ${passed}/${all.length} assertions passed`);

    // Per-suite tally, so a broken suite is visible without reading anything else.
    const bySuite = new Map();
    for (const result of all) {
        const entry = bySuite.get(result.suite) ?? { pass: 0, fail: 0 };
        entry[result.pass ? 'pass' : 'fail']++;
        bySuite.set(result.suite, entry);
    }
    for (const [suite, tally] of bySuite) {
        const line = `  ${tally.fail ? 'FAIL' : 'ok  '}  ${suite}: ${tally.pass}/${tally.pass + tally.fail}`;
        if (tally.fail) console.error(line); else console.log(line);
    }

    // Every failure, individually, so none can be truncated away.
    if (failed.length) {
        console.error(`BLACKSMITH HARNESS | ${failed.length} FAILURE(S):`);
        failed.forEach((r, index) => {
            console.error(
                `  ${index + 1}. ${r.suite}/${r.check}  ${r.label}`
                + `\n        actual:   ${display(r.actual)}`
                + `\n        expected: ${display(r.expected)}`
            );
        });
    }

    // Passes last and collapsed. Chunked because a single string can still be cut.
    if (passed) {
        const group = console.groupCollapsed ?? console.log;
        group.call(console, `BLACKSMITH HARNESS | ${passed} passing assertion(s)`);
        const passLines = all.filter(r => r.pass).map(r => `PASS  ${r.suite}/${r.check}  ${r.label}`);
        for (let start = 0; start < passLines.length; start += 40) {
            console.log(passLines.slice(start, start + 40).join('\n'));
        }
        if (console.groupEnd) console.groupEnd();
    }

    if (failed.length) {
        ui.notifications.error(`${failed.length} of ${all.length} assertions FAILED — see console (F12).`);
    } else {
        ui.notifications.info(`All ${all.length} assertions passed.`);
    }
    return { all, failed };
}

/** Run every headless check in every suite and report once. */
async function runAllHeadless() {
    const all = [];
    for (const suite of loaded) {
        for (const check of suite.checks.filter(c => c.tier === 'headless')) {
            all.push(...await runHeadless(suite, check));
        }
    }
    return reportRun(all, 'headless run');
}

// ------------------------------------------------------------------
// Dialog
// ------------------------------------------------------------------

// Scoped stylesheet rather than inline styles on every element. The critical
// rule is `height:auto` on the buttons: Foundry's button styling does not let
// them grow, and any multi-line content overflows and collides with the row
// below. Notes therefore live OUTSIDE the button, as a sibling.
//
// Injected into <head> rather than sitting inside the dialog content, for two
// reasons: DialogV2 sanitizes string content with cleanHTML, which is entitled
// to drop a <style> element, and passing the content as a DOM element instead
// runs into "config.content element must have no attributes". A head-injected
// sheet sidesteps both. It is removed when the dialog closes.
const STYLE_ID = 'blacksmith-harness-style';
const STYLE_CSS = `
/* The header (intro, Run All, tabs) must never scroll away — it did, and the
   tab bar being permanently above the fold made the harness look like it had
   no tabs at all. Rather than position:sticky, which needs an opaque
   background and so breaks under a light theme, the root is a column flexbox
   with a bounded height: the header sits OUTSIDE the scrolling element, so
   there is nothing for it to scroll out of. min-height:0 on the body is what
   actually lets a flex child shrink enough to scroll. */
.bh-root { --bh-line: rgba(255,255,255,0.16); font-size: 13px; display: flex; flex-direction: column; max-height: 72vh; }
.bh-head { flex: 0 0 auto; }
.bh-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px; }
.bh-intro { margin: 0 0 10px 0; opacity: 0.85; line-height: 1.45; }
.bh-root button { height: auto; min-height: 0; line-height: 1.3; white-space: normal; }
.bh-runall { width: 100%; margin: 0 0 12px 0; padding: 9px; font-weight: bold; }
.bh-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px 0; border-bottom: 1px solid var(--bh-line); }
.bh-tab { flex: 1 1 auto; min-width: 110px; padding: 7px 6px; border: none; background: none; opacity: 0.65; }
.bh-tab.is-active { opacity: 1; font-weight: bold; box-shadow: inset 0 -2px 0 var(--color-warm-2, #c9a66b); }
.bh-state { margin: 0 0 12px 0; padding: 8px 10px; border: 1px solid var(--bh-line); border-radius: 4px; }
.bh-state-title { margin: 0 0 4px 0; font-size: 0.8em; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; }
.bh-state-row { display: flex; gap: 8px; padding: 1px 0; line-height: 1.4; }
.bh-state-key { flex: 0 0 130px; opacity: 0.7; }
.bh-state-val { flex: 1 1 auto; }
.bh-state-val.is-bad { color: #ff8a80; font-weight: bold; }
.bh-state-note { opacity: 0.55; font-style: italic; }
.bh-section { margin: 0 0 14px 0; }
.bh-section-title { margin: 0 0 6px 0; font-size: 0.8em; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; }
/* Sub-heading within a tier, for suites that group their checks. Deliberately
   lighter than .bh-section-title — it divides a list, it does not head one. */
.bh-group { margin: 12px 0 5px 0; padding: 0 0 3px 0; border-bottom: 1px solid var(--bh-line); font-size: 0.82em; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.75; }
.bh-section .bh-group:first-child { margin-top: 0; }
.bh-cell { margin: 0 0 8px 0; }
/* height:auto repeated here deliberately — this is the rule that stops long
   labels overflowing a fixed-height Foundry button, and it must hold even if
   the .bh-root wrapper class does not survive however the dialog inserts the node. */
.bh-cell button { display: block; width: 100%; height: auto; min-height: 0; margin: 0; padding: 7px 10px; text-align: left; white-space: normal; line-height: 1.3; }
.bh-note { margin: 3px 2px 0 2px; opacity: 0.6; font-size: 0.88em; line-height: 1.4; }
.bh-suite-run { width: 100%; margin: 0 0 12px 0; padding: 6px; }
.bh-panel { display: none; }
.bh-panel.is-active { display: block; }
`;

function installStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const element = document.createElement('style');
    element.id = STYLE_ID;
    element.textContent = STYLE_CSS;
    document.head.appendChild(element);
}

function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
}

const tabButtons = loaded.map((suite, index) => `
    <button type="button" class="bh-tab${index === 0 ? ' is-active' : ''}" data-tab-button="${esc(suite.id)}">
        ${suite.icon ? `<i class="${esc(suite.icon)}"></i> ` : ''}${esc(suite.label)}
    </button>`).join('');

function settingsBox(suite) {
    let rows = [];
    try {
        rows = (typeof suite.settings === 'function' ? suite.settings() : []) ?? [];
    } catch (error) {
        rows = [{ label: 'settings() threw', value: error.message }];
    }
    if (!rows.length) return '';
    const body = rows.map((row) => {
        const bad = /missing|not loaded|threw/i.test(String(row.value));
        return `<div class="bh-state-row">
            <span class="bh-state-key">${esc(row.label)}</span>
            <span class="bh-state-val${bad ? ' is-bad' : ''}">${esc(row.value)}${
                row.note ? ` <span class="bh-state-note">— ${esc(row.note)}</span>` : ''}</span>
        </div>`;
    }).join('');
    return `<div class="bh-state"><div class="bh-state-title">Live state</div>${body}</div>`;
}

/**
 * Cells for one tier, with a sub-heading emitted whenever `check.group` changes.
 *
 * Grouping is by ADJACENCY rather than by bucketing every check with the same name
 * together, so the order a suite declares its checks in is the order they render in —
 * bucketing would silently reorder them, and a suite that reads as a sequence (capture,
 * then compare) would come apart. A check with no `group` gets no heading, which is what
 * keeps every suite written before this unchanged.
 */
function checkCells(suite, checks) {
    let currentGroup = null;
    return checks.map((check) => {
        const group = check.group ?? null;
        const heading = (group && group !== currentGroup)
            ? `<div class="bh-group">${esc(group)}</div>`
            : '';
        currentGroup = group;
        return heading + checkCell(suite, check);
    }).join('');
}

/** Button and note are siblings — never nest block content inside a button. */
function checkCell(suite, check) {
    return `
        <div class="bh-cell">
            <button type="button" data-suite="${esc(suite.id)}" data-check="${esc(check.id)}">
                ${esc(check.label)}
            </button>
            ${check.note ? `<div class="bh-note">${esc(check.note)}</div>` : ''}
        </div>`;
}

const tabPanels = loaded.map((suite, index) => {
    const headless = suite.checks.filter(c => c.tier === 'headless');
    const interactive = suite.checks.filter(c => c.tier !== 'headless');
    const section = (title, checks) => checks.length ? `
        <div class="bh-section">
            <div class="bh-section-title">${title}</div>
            ${checkCells(suite, checks)}
        </div>` : '';
    return `
        <div class="bh-panel${index === 0 ? ' is-active' : ''}" data-tab-panel="${esc(suite.id)}">
            ${settingsBox(suite)}
            ${headless.length ? `<button type="button" class="bh-suite-run" data-run-suite="${esc(suite.id)}">
                Run this suite's ${headless.length} headless check${headless.length === 1 ? '' : 's'}
            </button>` : ''}
            ${section(`Headless assertions (${headless.length})`, headless)}
            ${section(`Interactive (${interactive.length}) — watch the console`, interactive)}
        </div>`;
}).join('');

const totalHeadless = loaded.reduce((sum, s) => sum + s.checks.filter(c => c.tier === 'headless').length, 0);

// Plain string content. Passing a DOM element instead runs into DialogV2's
// "config.content element must have no attributes" rule, and gains nothing:
// the only thing genuinely at risk from cleanHTML was the <style> block, which
// now lives in <head>. Classes and data-* attributes survive sanitization.
const content = `
    <div class="bh-root">
        <div class="bh-head">
            <p class="bh-intro">
                Results print to the console (F12). The dialog stays open — run as many checks as you like.
                Some checks need a <strong>targeted token</strong>; each says so.
            </p>
            <button type="button" class="bh-runall" data-run-all>
                Run All Headless (${totalHeadless} check${totalHeadless === 1 ? '' : 's'}, ${loaded.length} suite${loaded.length === 1 ? '' : 's'})
            </button>
            <div class="bh-tabs">${tabButtons}</div>
        </div>
        <div class="bh-body">
            ${tabPanels}
        </div>
    </div>`;

installStyle();

await foundry.applications.api.DialogV2.wait({
    window: { title: 'Blacksmith Test Harness' },
    position: { width: 860, height: 'auto' },
    modal: false,
    rejectClose: false,
    content,
    buttons: [{ action: 'close', label: 'Close', default: true }],
    close: () => removeStyle(),
    render: (_event, dialog) => {
        const root = dialog?.element ?? dialog;

        root.querySelector('[data-run-all]')?.addEventListener('click', () => void runAllHeadless());

        root.querySelectorAll('[data-run-suite]').forEach((button) => {
            button.addEventListener('click', async () => {
                const suite = loaded.find(s => s.id === button.dataset.runSuite);
                if (!suite) return;
                const results = [];
                for (const check of suite.checks.filter(c => c.tier === 'headless')) {
                    results.push(...await runHeadless(suite, check));
                }
                reportRun(results, suite.id);
            });
        });

        root.querySelectorAll('[data-check]').forEach((button) => {
            button.addEventListener('click', async () => {
                const suite = loaded.find(s => s.id === button.dataset.suite);
                const check = suite?.checks.find(c => c.id === button.dataset.check);
                if (!check) return;
                if (check.tier === 'headless') {
                    const results = await runHeadless(suite, check);
                    const failed = results.filter(r => !r.pass);
                    console.log(
                        `BLACKSMITH HARNESS | ${suite.id}/${check.id}\n  `
                        + results.map(r => `${r.pass ? 'PASS' : 'FAIL'}  ${r.label}`
                            + (r.pass ? '' : `\n        actual:   ${display(r.actual)}\n        expected: ${display(r.expected)}`)).join('\n  ')
                    );
                    ui.notifications[failed.length ? 'error' : 'info'](
                        `${check.label}: ${results.length - failed.length}/${results.length} passed.`
                    );
                    return;
                }
                // Interactive checks get a recorder too. Most judge things a person has
                // to look at and will never call it, but some are interactive only
                // because they need a human to choose the MOMENT — capture this combat
                // now, compare after it ends — and those have real assertions to make.
                // Results are reported when any were recorded and ignored otherwise, so
                // a purely observational check reads exactly as it did before.
                const { results, expect } = createRecorder();
                try {
                    await check.run({
                        api,
                        expect,
                        log: makeLogger(`${suite.id}/${check.id}`),
                        game
                    });
                } catch (error) {
                    console.error(`BLACKSMITH HARNESS | ${suite.id}/${check.id} threw`, error);
                    ui.notifications.error(`${check.label} threw: ${error.message}`);
                    return;
                }
                if (results.length) {
                    const failed = results.filter(r => !r.pass);
                    console.log(
                        `BLACKSMITH HARNESS | ${suite.id}/${check.id}\n  `
                        + results.map(r => `${r.pass ? 'PASS' : 'FAIL'}  ${r.label}`
                            + (r.pass ? '' : `\n        actual:   ${display(r.actual)}\n        expected: ${display(r.expected)}`)).join('\n  ')
                    );
                    ui.notifications[failed.length ? 'error' : 'info'](
                        `${check.label}: ${results.length - failed.length}/${results.length} passed.`
                    );
                }
            });
        });

        root.querySelectorAll('[data-tab-button]').forEach((tabButton) => {
            tabButton.addEventListener('click', () => {
                const target = tabButton.dataset.tabButton;
                root.querySelectorAll('[data-tab-panel]').forEach((panel) => {
                    panel.classList.toggle('is-active', panel.dataset.tabPanel === target);
                });
                root.querySelectorAll('[data-tab-button]').forEach((button) => {
                    button.classList.toggle('is-active', button.dataset.tabButton === target);
                });
            });
        });
    }
});
