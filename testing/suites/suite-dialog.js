// ==================================================================
// ===== SUITE: api.dialog ==========================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-dialog.md
// Implementation: scripts/api-dialog.js
//
// Most of this suite is interactive by nature: the contract these
// helpers exist to enforce is about what happens when a human presses
// Escape, and that cannot be asserted headlessly without driving the
// DOM. The headless tier covers the surface and the argument guards.
// ==================================================================

import { requireApi, setting, settingRow, stylesheetContains } from './harness-lib.js';

export default {
    id: 'dialog',
    label: 'Dialog',
    icon: 'fa-solid fa-comment-dots',

    settings: () => [
        settingRow('dialog.css', stylesheetContains('.blacksmith-dialog')
            ? 'loaded'
            : 'NOT LOADED — check the @import in styles/default.css'),
        settingRow('globalDebugMode', setting('globalDebugMode', false) ? 'ON' : 'off',
            'gates debug output, including this API\'s failure logs')
    ],

    checks: [
        {
            id: 'surface',
            tier: 'headless',
            label: 'Surface and result vocabulary',
            run: async ({ expect }) => {
                const { dialog } = requireApi('dialog');
                for (const name of ['confirm', 'choose', 'prompt', 'wait']) {
                    expect.ok(`${name} is a function`, typeof dialog[name] === 'function');
                }
                expect('ACTIONS exposes the three action strings', dialog.ACTIONS, {
                    SUBMIT: 'submit', CANCEL: 'cancel', CLOSE: 'close'
                });
            }
        },
        {
            id: 'argument-guards',
            tier: 'headless',
            label: 'Misconfiguration throws rather than opening an unusable dialog',
            run: async ({ expect }) => {
                const { dialog } = requireApi('dialog');
                await expect.throws('choose with no choices throws', () => dialog.choose({ title: 'x', choices: [] }));
                await expect.throws('wait with no buttons throws', () => dialog.wait({ title: 'x', buttons: [] }));
            }
        },
        {
            id: 'dismissal',
            tier: 'interactive',
            label: 'THE contract: dismissal resolves, never rejects',
            note: 'Dismiss with Escape. Run it again and use the title-bar X. Both must resolve false with no console error.',
            run: async ({ api, log }) => {
                const result = await api.dialog.confirm({
                    title: 'Dismissal Contract',
                    content: '<p>Dismiss this with <strong>Escape</strong> or the title-bar X.</p><p>It must resolve <code>false</code>, not throw.</p>'
                });
                log(`resolved: ${result} (expected: false)`);
            }
        },
        {
            id: 'confirm',
            tier: 'interactive',
            label: 'Confirm, destructive styling, and Cancel',
            note: 'Click Delete It, then run again and click Cancel. The confirm button should look critical, not like a plain Foundry button.',
            run: async ({ api, log }) => {
                const result = await api.dialog.confirm({
                    title: 'Delete Something',
                    content: '<p>Click <strong>Delete It</strong>, or Cancel.</p>',
                    confirmLabel: 'Delete It',
                    confirmIcon: 'fa-solid fa-trash',
                    destructive: true
                });
                log(`resolved: ${result} (true on Delete It, false on Cancel)`);
            }
        },
        {
            id: 'choose',
            tier: 'interactive',
            label: 'Choose — the helper with no Blacksmith call site',
            note: 'Its only coverage. Try All Scenes, then Cancel, then Escape, then the disabled entry (must not respond, must tooltip).',
            run: async ({ api, log }) => {
                const result = await api.dialog.choose({
                    title: 'Delete Pins',
                    content: '<p>Pick a scope.</p>',
                    choices: [
                        { id: 'scene', label: 'Current Scene', icon: 'fa-solid fa-map' },
                        { id: 'all', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true },
                        { id: 'blocked', label: 'Unavailable', icon: 'fa-solid fa-ban', disabled: true, description: 'Disabled on purpose — hover for this tooltip.' }
                    ]
                });
                log(`resolved: ${JSON.stringify(result)}`);
                log('expected: {action:"submit", value:"all"} | {action:"cancel"} | {action:"close"}');
            }
        },
        {
            id: 'validation',
            tier: 'interactive',
            label: 'Validation reopens, preserving the typed value',
            note: 'Press Enter on the EMPTY field — it must reopen with a message and the attempt counter rising. Then type and press Enter. Use Enter, not the OK button: this also checks that Enter hits OK rather than Cancel.',
            run: async ({ api, log }) => {
                let attempts = 0;
                const result = await api.dialog.prompt({
                    title: 'Validation Reopens',
                    content: ({ value, attempt }) => {
                        attempts = attempt;
                        return `<p>Attempt ${attempt}. Leave this empty and press <strong>Enter</strong>.</p>`
                            + `<input name="thing" class="blacksmith-input" type="text" value="${value ?? ''}" placeholder="Type here">`;
                    },
                    focusSelector: '[name="thing"]',
                    getValue: root => root.elements.thing?.value.trim() ?? '',
                    validate: value => value ? null : 'Enter a value.',
                    cancelValue: '',
                    closeValue: ''
                });
                log(`resolved: ${JSON.stringify(result)} after ${attempts} attempt(s)`);
                if (result.action === 'cancel' && attempts === 1) {
                    log('SUSPECT: cancelled on the first attempt. If you pressed Enter rather than');
                    log('clicking Cancel, Enter is activating the wrong button — that is a bug, not a user choice.');
                } else if (attempts < 2) {
                    log('NOTE: the reopen loop never ran — press Enter on the EMPTY field to exercise it.');
                }
                log('CHECK: input focused on open? previously typed text preserved across the reopen?');
            }
        },
        {
            id: 'async-failure',
            tier: 'interactive',
            label: 'A throwing onSubmit reopens with the error',
            note: 'Click OK. After a pause it must reopen showing "Deliberate failure". Dismiss with Escape.',
            run: async ({ api, log }) => {
                let calls = 0;
                const result = await api.dialog.prompt({
                    title: 'Async Failure',
                    content: '<p>Click <strong>OK</strong> and wait.</p>',
                    getValue: () => 'fixed-value',
                    onSubmit: async () => {
                        calls++;
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        throw new Error('Deliberate failure');
                    },
                    closeValue: 'dismissed'
                });
                log(`onSubmit invocations: ${calls} (one per OK click)`);
                log(`resolved: ${JSON.stringify(result)} (expected: {action:"close", value:"dismissed"})`);
            }
        },
        {
            id: 'async-success',
            tier: 'interactive',
            label: 'The success path carries the callback return through',
            note: 'Click OK once and wait.',
            run: async ({ api, log }) => {
                const result = await api.dialog.prompt({
                    title: 'Async Success',
                    content: '<p>Click <strong>OK</strong> once and wait.</p>',
                    getValue: () => 'collected',
                    onSubmit: async () => {
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        return 'callback-return';
                    }
                });
                log(`resolved: ${JSON.stringify(result)}`);
                log('expected: {action:"submit", value:"collected", result:"callback-return"}');
            }
        },
        {
            id: 'attempt-ceiling',
            tier: 'interactive',
            label: 'maxAttempts stops a validator that can never pass',
            note: 'Click OK three times. It must stop after 3 rather than looping forever.',
            run: async ({ api, log }) => {
                let attempts = 0;
                const result = await api.dialog.prompt({
                    title: 'Attempt Ceiling',
                    content: '<p>Click <strong>OK</strong> three times.</p>',
                    getValue: () => 'whatever',
                    validate: () => { attempts++; return 'Never valid.'; },
                    maxAttempts: 3,
                    closeValue: 'ceiling'
                });
                log(`validate calls: ${attempts} (expected: 3)`);
                log(`resolved: ${JSON.stringify(result)} (expected: {action:"close", value:"ceiling"})`);
            }
        },
        {
            id: 'dom-content',
            tier: 'interactive',
            label: 'DOM content stays literal, and may carry attributes',
            note: 'The script tag must appear as visible text with no alert. The node also carries a class and data attribute — DialogV2 rejects content elements with attributes, so this must not throw.',
            run: async ({ api, log }) => {
                // Deliberately attribute-laden: DialogV2 throws "config.content
                // element must have no attributes" if a node is handed over
                // directly, so this guards the wrapping in resolveContent().
                const node = document.createElement('div');
                node.className = 'harness-dom-content';
                node.dataset.harness = 'attributes-are-fine';
                node.style.padding = '4px';
                node.textContent = '<script>alert("parsed!")</script> — this must appear as literal text';
                const result = await api.dialog.confirm({ title: 'Literal DOM Content', content: node });
                log(`resolved: ${result}`);
                log('CHECK: shown as text, no alert, and it opened at all (no attributes error)?');
            }
        },
        {
            id: 'wait',
            tier: 'interactive',
            label: 'Custom buttons through wait()',
            note: 'Try Allow, then Deny, then Escape.',
            run: async ({ api, log }) => {
                const result = await api.dialog.wait({
                    title: 'Token Move Request',
                    content: '<p>A player wants to move a token.</p>',
                    buttons: [
                        { action: 'cancel', label: 'Deny', icon: 'fa-solid fa-xmark' },
                        { action: 'allow', label: 'Allow', icon: 'fa-solid fa-check', default: true, callback: async () => 'approved' }
                    ]
                });
                log(`resolved: ${JSON.stringify(result)}`);
                log('expected: {action:"submit", value:"allow", result:"approved"} | {action:"cancel"} | {action:"close"}');
            }
        }
    ]
};
