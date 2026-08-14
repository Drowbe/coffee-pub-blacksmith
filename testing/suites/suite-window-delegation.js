// ==================================================================
// ===== SUITE: window ACTION_HANDLERS delegation ===================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-window.md, "ACTION_HANDLERS and the
//           instance argument"
// Implementation: scripts/window-base.js (_attachDelegationOnce)
//
// This is the case that shipped broken and had no coverage anywhere:
// dispatch used to go through one per-class static ref, so with two
// instances of a class open, clicks in either window were handled
// against whichever rendered last, and closing the newer one left the
// older one's buttons dead.
//
// Squire's Transfer Tool will be the suite's first deliberate
// multi-instance consumer — sender and incoming-approval windows on one
// client — which is why this is asserted rather than eyeballed.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

/** Let a render settle before touching the DOM it produced. */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

/**
 * Build a Tool-window subclass whose single action records which instance
 * received the click. Built per check so the recording array is fresh and the
 * class identity is not shared between checks.
 */
function makeProbeClass(ToolBase, received) {
    return class DelegationProbe extends ToolBase {
        static ACTION_HANDLERS = {
            // The third argument is the contract under test.
            probe: (_event, _target, win) => received.push(win?.options?.id ?? 'no-instance')
        };

        static DEFAULT_OPTIONS = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
            {
                rememberPosition: false,
                position: { width: 260, height: 'auto' },
                window: { title: 'Delegation Probe', resizable: false }
            }
        );

        async getData() {
            return {
                appId: this.id,
                bodyContent: `<button type="button" data-action="probe">Probe ${this.options.id}</button>`
            };
        }
    };
}

/** Click the probe button inside a specific window instance. */
function clickProbeIn(app) {
    const button = app.element?.querySelector('[data-action="probe"]');
    if (!button) throw new Error(`probe button not found in ${app.options.id}`);
    button.click();
}

export default {
    id: 'window-delegation',
    label: 'Window Delegation',
    icon: 'fa-solid fa-window-restore',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        return [
            settingRow('Tool base', api?.BlacksmithToolWindowBaseV2 ? 'available' : 'MISSING'),
            settingRow('Standard base', api?.BlacksmithWindowBaseV2 ? 'available' : 'MISSING')
        ];
    },

    checks: [
        {
            id: 'two-instances',
            tier: 'headless',
            label: 'Two open instances each handle their own clicks',
            run: async ({ expect }) => {
                const api = requireApi('BlacksmithToolWindowBaseV2');
                const received = [];
                const Probe = makeProbeClass(api.BlacksmithToolWindowBaseV2, received);

                const first = new Probe({ id: 'bh-delegation-first' });
                const second = new Probe({ id: 'bh-delegation-second' });
                try {
                    await first.render({ force: true });
                    await second.render({ force: true });
                    await nextFrame();

                    expect.ok('both windows rendered',
                        Boolean(first.element) && Boolean(second.element));

                    // The older instance first: under the old static-ref dispatch
                    // this reported the LAST-rendered window instead.
                    clickProbeIn(first);
                    expect('a click in the first window is handled by the first window',
                        received, ['bh-delegation-first']);

                    clickProbeIn(second);
                    expect('a click in the second window is handled by the second window',
                        received, ['bh-delegation-first', 'bh-delegation-second']);

                    clickProbeIn(first);
                    expect('the first window still handles its own clicks afterwards',
                        received, ['bh-delegation-first', 'bh-delegation-second', 'bh-delegation-first']);
                } finally {
                    await first.close();
                    await second.close();
                }
            }
        },
        {
            id: 'survives-sibling-close',
            tier: 'headless',
            label: 'Closing the newer instance leaves the older one working',
            run: async ({ expect }) => {
                const api = requireApi('BlacksmithToolWindowBaseV2');
                const received = [];
                const Probe = makeProbeClass(api.BlacksmithToolWindowBaseV2, received);

                const older = new Probe({ id: 'bh-delegation-older' });
                const newer = new Probe({ id: 'bh-delegation-newer' });
                try {
                    await older.render({ force: true });
                    await newer.render({ force: true });
                    await nextFrame();

                    await newer.close();
                    await nextFrame();

                    // The second half of the original defect: closing the newer
                    // window nulled the shared ref and the older window's buttons
                    // went dead until it re-rendered.
                    clickProbeIn(older);
                    expect('the older window still responds after the newer one closes',
                        received, ['bh-delegation-older']);
                } finally {
                    await older.close();
                    try {
                        await newer.close();
                    } catch (_) { /* already closed */ }
                }
            }
        },
        {
            id: 'rebinds-after-reopen',
            tier: 'headless',
            label: 'A reopened instance rebinds to its new frame',
            run: async ({ expect }) => {
                const api = requireApi('BlacksmithToolWindowBaseV2');
                const received = [];
                const Probe = makeProbeClass(api.BlacksmithToolWindowBaseV2, received);

                const app = new Probe({ id: 'bh-delegation-reopen' });
                try {
                    await app.render({ force: true });
                    await nextFrame();
                    clickProbeIn(app);
                    expect('responds before closing', received, ['bh-delegation-reopen']);

                    await app.close();
                    await nextFrame();
                    await app.render({ force: true });
                    await nextFrame();

                    // Guards the binding marker being cleared on close: a stale
                    // marker would skip rebinding and silently kill every action.
                    clickProbeIn(app);
                    expect('responds again after being reopened',
                        received, ['bh-delegation-reopen', 'bh-delegation-reopen']);
                } finally {
                    await app.close();
                }
            }
        },
        {
            id: 'live-two-tools',
            tier: 'interactive',
            label: 'Two Tool windows side by side',
            note: 'Opens two probes. Click each window\'s button and confirm the console names the window you clicked, then close one and confirm the other still responds. Close both when done.',
            run: async ({ api, log }) => {
                const received = [];
                const Probe = makeProbeClass(api.BlacksmithToolWindowBaseV2, received);
                const left = new Probe({ id: 'bh-delegation-live-left' });
                const right = new Probe({ id: 'bh-delegation-live-right' });
                await left.render({ force: true });
                await right.render({ force: true });
                await nextFrame();

                // Report each click as it happens rather than only at the end.
                const report = setInterval(() => {
                    while (received.length) log(`click handled by: ${received.shift()}`);
                    if (!left.rendered && !right.rendered) clearInterval(report);
                }, 400);

                log('Two probe windows open. Click each one\'s button.');
                log('Each click must name the window you actually clicked.');
            }
        }
    ]
};
