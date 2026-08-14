// ==================================================================
// ===== SUITE: api.quantitySplit ===================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-quantity-split.md
// Implementation: scripts/api-quantity-split.js
//
// The headless checks cover the verification list Squire supplied with
// the contribution: max=1, max=2, a large stack, initial values at both
// bounds, and Give + Keep always equalling Max.
// ==================================================================

import { requireApi, settingRow, stylesheetContains } from './harness-lib.js';

/** Render into a detached container and attach, so DOM behavior is testable. */
function mount(control) {
    const container = document.createElement('div');
    container.innerHTML = control.html;
    document.body.appendChild(container);
    control.attach(container);
    return {
        container,
        input: container.querySelector('input[type="range"]'),
        give: container.querySelector('[data-quantity-give]'),
        keep: container.querySelector('[data-quantity-keep]'),
        cleanup() {
            control.destroy();
            container.remove();
        }
    };
}

export default {
    id: 'quantity-split',
    label: 'Quantity Split',
    icon: 'fa-solid fa-arrow-right-arrow-left',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        return [
            settingRow('api.quantitySplit', api?.quantitySplit ? 'available' : 'MISSING'),
            settingRow('quantity-split CSS', stylesheetContains('.blacksmith-quantity-split')
                ? 'loaded'
                : 'NOT LOADED — it lives in styles/window-form-controls.css'),
            settingRow('Tool base', api?.BlacksmithToolWindowBaseV2 ? 'available' : 'MISSING',
                'needed by the theme check')
        ];
    },

    checks: [
        {
            id: 'bounds',
            tier: 'headless',
            label: 'Bounds: max=1, max=2, large stack, initial values at both ends',
            run: async ({ expect }) => {
                const { quantitySplit } = requireApi('quantitySplit');

                const one = quantitySplit.create({ max: 1 });
                expect('max=1 starts at 1', one.getValue(), 1);
                expect('max=1 keeps 0', one.getKeep(), 0);

                const two = quantitySplit.create({ max: 2 });
                expect('max=2 starts at min', two.getValue(), 1);
                expect('max=2 keeps 1', two.getKeep(), 1);

                const big = quantitySplit.create({ max: 9999, value: 5000 });
                expect('large stack honors the initial value', big.getValue(), 5000);
                expect('large stack keeps the remainder', big.getKeep(), 4999);

                const atMin = quantitySplit.create({ max: 7, value: 1 });
                expect('initial value at the lower bound', atMin.getValue(), 1);
                const atMax = quantitySplit.create({ max: 7, value: 7 });
                expect('initial value at the upper bound', atMax.getValue(), 7);
                expect('at the upper bound Keep is 0', atMax.getKeep(), 0);

                expect('a value above max is clamped down',
                    quantitySplit.create({ max: 7, value: 99 }).getValue(), 7);
                expect('a value below min is clamped up',
                    quantitySplit.create({ max: 7, value: -4 }).getValue(), 1);
                expect('a fractional value is floored',
                    quantitySplit.create({ max: 7, value: 3.9 }).getValue(), 3);
                expect('a non-numeric value falls back to min',
                    quantitySplit.create({ max: 7, value: 'nonsense' }).getValue(), 1);
                expect('max below min is raised to min',
                    quantitySplit.create({ max: 0, min: 1 }).max, 1);
                expect('a custom min is honored',
                    quantitySplit.create({ max: 10, min: 5 }).getValue(), 5);
            }
        },
        {
            id: 'invariant',
            tier: 'headless',
            label: 'Give + Keep always equals Max, across the whole range',
            run: async ({ expect }) => {
                const { quantitySplit } = requireApi('quantitySplit');
                const max = 13;
                const control = quantitySplit.create({ max });
                let held = true;
                for (let n = -3; n <= max + 3; n++) {
                    control.setValue(n);
                    if (control.getValue() + control.getKeep() !== max) held = false;
                }
                expect.ok(`give + keep === ${max} for every setValue from -3 to ${max + 3}`, held);
                expect('setValue is clamped at the top', control.setValue(999).getValue(), max);
                expect('setValue is clamped at the bottom', control.setValue(-999).getValue(), 1);
            }
        },
        {
            id: 'dom',
            tier: 'headless',
            label: 'DOM wiring: outputs track the input, onChange fires only on user input',
            run: async ({ expect }) => {
                const { quantitySplit } = requireApi('quantitySplit');
                const changes = [];
                const control = quantitySplit.create({
                    max: 8,
                    value: 3,
                    inputName: 'harness-qty',
                    onChange: (payload) => changes.push(payload)
                });
                const dom = mount(control);
                try {
                    expect('attach does not fire onChange', changes.length, 0);
                    expect('give output reflects the initial value', dom.give.textContent, '3');
                    expect('keep output reflects the remainder', dom.keep.textContent, '5');

                    dom.input.value = '6';
                    dom.input.dispatchEvent(new Event('input', { bubbles: true }));
                    expect('user input updates the controller', control.getValue(), 6);
                    expect('user input updates the give output', dom.give.textContent, '6');
                    expect('user input updates the keep output', dom.keep.textContent, '2');
                    expect('onChange fired once', changes.length, 1);
                    expect('onChange carries value and keep',
                        { value: changes[0]?.value, keep: changes[0]?.keep }, { value: 6, keep: 2 });

                    dom.input.dispatchEvent(new Event('input', { bubbles: true }));
                    expect('a no-op input does not re-fire onChange', changes.length, 1);

                    control.setValue(2);
                    expect('setValue does not fire onChange', changes.length, 1);
                    expect('setValue updates the DOM', dom.input.value, '2');
                    expect('setValue updates the outputs', dom.keep.textContent, '6');

                    dom.input.value = '999';
                    dom.input.dispatchEvent(new Event('input', { bubbles: true }));
                    expect('out-of-range user input is clamped in the DOM', dom.input.value, '8');
                    expect('out-of-range user input is clamped in the controller', control.getValue(), 8);

                    expect.ok('aria-valuetext announces the split',
                        dom.input.getAttribute('aria-valuetext') === 'Give 8, Keep 0');

                    control.destroy();
                    dom.input.value = '4';
                    dom.input.dispatchEvent(new Event('input', { bubbles: true }));
                    expect('destroy releases the listener', control.getValue(), 8);
                    control.destroy();
                    expect.ok('destroy twice does not throw', true);
                } finally {
                    dom.cleanup();
                }
            }
        },
        {
            id: 'two-in-one-form',
            tier: 'headless',
            label: 'Two controls in one container stay independent',
            run: async ({ expect }) => {
                const { quantitySplit } = requireApi('quantitySplit');
                const a = quantitySplit.create({ max: 5, value: 2, inputName: 'qty-a' });
                const b = quantitySplit.create({ max: 9, value: 7, inputName: 'qty-b' });
                const container = document.createElement('div');
                container.innerHTML = a.html + b.html;
                document.body.appendChild(container);
                try {
                    a.attach(container);
                    b.attach(container);
                    expect('first control keeps its own value', a.getValue(), 2);
                    expect('second control keeps its own value', b.getValue(), 7);

                    const inputB = container.querySelector('input[name="qty-b"]');
                    inputB.value = '9';
                    inputB.dispatchEvent(new Event('input', { bubbles: true }));
                    expect('changing the second leaves the first alone', a.getValue(), 2);
                    expect('the second control took the change', b.getValue(), 9);
                } finally {
                    a.destroy();
                    b.destroy();
                    container.remove();
                }
            }
        },
        {
            id: 'live-dialog',
            tier: 'interactive',
            label: 'Mouse and keyboard in a dialog',
            note: 'Drag the slider, then focus it and use arrows, Home, End. Give + Keep must always sum to 7.',
            run: async ({ api, log }) => {
                const control = api.quantitySplit.create({
                    max: 7,
                    value: 1,
                    inputName: 'harness-qty-live',
                    onChange: ({ value, keep }) => log(`give ${value}, keep ${keep}`)
                });
                const outcome = await api.dialog.prompt({
                    title: 'Quantity Split',
                    content: `<p>Split a stack of 7.</p>${control.html}`,
                    submitLabel: 'Transfer',
                    onRender: (root) => control.attach(root),
                    getValue: () => control.getValue(),
                    closeValue: null
                });
                control.destroy();
                log(`resolved: ${JSON.stringify(outcome)}`);
                log('CHECK: did arrows/Home/End work, and did the captions stay legible?');
            }
        },
        {
            id: 'tool-themes',
            tier: 'interactive',
            label: 'Readability in a Tool window: Light, Dark, Glass',
            note: 'Squire hosts this in a Tool window. Watch the value boxes and captions against the translucent Glass shell.',
            run: async ({ api, log }) => {
                const ToolBase = api.BlacksmithToolWindowBaseV2;
                if (!ToolBase) throw new Error('BlacksmithToolWindowBaseV2 is not exposed on module.api.');

                const control = api.quantitySplit.create({ max: 12, value: 4, inputName: 'harness-qty-tool' });

                class QuantityThemeProbe extends ToolBase {
                    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
                        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
                        {
                            id: 'blacksmith-quantity-theme-probe',
                            rememberPosition: false,
                            position: { width: 340, height: 'auto' },
                            window: { title: 'Quantity Split Themes', resizable: false }
                        }
                    );
                    async getData() {
                        return { appId: this.id, bodyContent: control.html };
                    }
                    async _onRender(context, options) {
                        await super._onRender?.(context, options);
                        control.attach(this.element);
                    }
                    _onClose(options) {
                        control.destroy();
                        return super._onClose?.(options);
                    }
                }

                const probe = new QuantityThemeProbe();
                await probe.render({ force: true });
                log('Cycling Light -> Dark -> Glass, 2s each.');
                for (const theme of ['light', 'dark', 'glass']) {
                    await probe.setToolTheme(theme);
                    log(`theme: ${theme} — value boxes and captions readable?`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                log('Left on Glass. Drag the slider here to confirm it still tracks, then close.');
            }
        }
    ]
};
