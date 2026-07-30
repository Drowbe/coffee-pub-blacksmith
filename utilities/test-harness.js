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
    `${BASE}/suite-dialog.js`,
    `${BASE}/suite-entity-list.js`,
    `${BASE}/suite-quantity-split.js`,
    `${BASE}/suite-window-delegation.js`
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

/** Run every headless check in every suite and report once. */
async function runAllHeadless() {
    const all = [];
    for (const suite of loaded) {
        for (const check of suite.checks.filter(c => c.tier === 'headless')) {
            all.push(...await runHeadless(suite, check));
        }
    }
    const failed = all.filter(r => !r.pass);
    const lines = all.map(r =>
        `${r.pass ? 'PASS' : 'FAIL'}  ${r.suite}/${r.check}  ${r.label}`
        + (r.pass ? '' : `\n        actual:   ${display(r.actual)}\n        expected: ${display(r.expected)}`));
    console.log(
        `BLACKSMITH HARNESS | headless run: ${all.length - failed.length}/${all.length} passed\n  `
        + lines.join('\n  ')
    );
    if (failed.length) {
        ui.notifications.error(`${failed.length} of ${all.length} assertions FAILED — see console (F12).`);
    } else {
        ui.notifications.info(`All ${all.length} assertions passed.`);
    }
    return { all, failed };
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
.bh-root { --bh-line: rgba(255,255,255,0.16); font-size: 13px; }
.bh-intro { margin: 0 0 10px 0; opacity: 0.85; line-height: 1.45; }
.bh-root button { height: auto; min-height: 0; line-height: 1.3; white-space: normal; }
.bh-runall { width: 100%; margin: 0 0 12px 0; padding: 9px; font-weight: bold; }
.bh-tabs { display: flex; gap: 4px; margin: 0 0 10px 0; border-bottom: 1px solid var(--bh-line); }
.bh-tab { flex: 1; padding: 7px 6px; border: none; background: none; opacity: 0.65; }
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
            ${checks.map(check => checkCell(suite, check)).join('')}
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
        <p class="bh-intro">
            Results print to the console (F12). The dialog stays open — run as many checks as you like.
            Some checks need a <strong>targeted token</strong>; each says so.
        </p>
        <button type="button" class="bh-runall" data-run-all>
            Run All Headless (${totalHeadless} check${totalHeadless === 1 ? '' : 's'}, ${loaded.length} suites)
        </button>
        <div class="bh-tabs">${tabButtons}</div>
        ${tabPanels}
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
                const failed = results.filter(r => !r.pass);
                console.log(
                    `BLACKSMITH HARNESS | ${suite.id}: ${results.length - failed.length}/${results.length} passed\n  `
                    + results.map(r => `${r.pass ? 'PASS' : 'FAIL'}  ${r.label}`
                        + (r.pass ? '' : `\n        actual:   ${display(r.actual)}\n        expected: ${display(r.expected)}`)).join('\n  ')
                );
                ui.notifications[failed.length ? 'error' : 'info'](
                    `${suite.label}: ${results.length - failed.length}/${results.length} assertions passed.`
                );
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
                try {
                    await check.run({
                        api,
                        log: makeLogger(`${suite.id}/${check.id}`),
                        game
                    });
                } catch (error) {
                    console.error(`BLACKSMITH HARNESS | ${suite.id}/${check.id} threw`, error);
                    ui.notifications.error(`${check.label} threw: ${error.message}`);
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
