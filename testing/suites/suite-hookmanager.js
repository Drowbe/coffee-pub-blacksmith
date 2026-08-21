// ==================================================================
// ===== SUITE: HOOKMANAGER (testing/suites/suite-hookmanager.js) ====
// ==================================================================
//
// Cancellation is the thing worth asserting here. Every callback on a
// hook name shares one Foundry handler, so whatever the wrapper returns
// speaks for all of them -- which is why an undeclared `false` must stay
// inert and a declared one must not leak a `once` registration.
//
// Loaded by testing/test-harness.js. See testing/harness-lib.js for the
// suite contract.
// ==================================================================

import { requireApi } from '../harness-lib.js';

/** A hook name nothing else uses, unique per run so a leaked registration cannot poison the next. */
function harnessHookName(suffix) {
    return `blacksmithHarnessPre${suffix}${Math.random().toString(36).slice(2, 8)}`;
}

export default {
    id: 'hookmanager',
    label: 'Hook Manager',
    icon: 'fa-solid fa-link',

    checks: [
        {
            id: 'cancel-opt-in',
            tier: 'headless',
            group: 'Cancellation',
            label: 'an undeclared false is inert and does not stop the chain',
            note: 'The regression this guards: a callback whose natural return value is a boolean cancelled the operation world-wide.',
            run: async ({ expect }) => {
                const api = requireApi('HookManager');
                const name = harnessHookName('Inert');
                const context = 'harness-hookmanager-inert';
                const ran = [];

                api.HookManager.registerHook({
                    name,
                    description: 'Harness: returns false without declaring canCancel',
                    context,
                    priority: 1,
                    callback: () => { ran.push('first'); return false; }
                });
                api.HookManager.registerHook({
                    name,
                    description: 'Harness: runs after the undeclared false',
                    context,
                    priority: 5,
                    callback: () => { ran.push('second'); }
                });

                const result = Hooks.call(name);

                expect('the operation is NOT cancelled', result, true);
                expect.ok('the later callback still ran', ran.includes('second'));
                expect('both callbacks ran, in priority order', ran.join(','), 'first,second');

                api.HookManager.disposeByContext(context);
            }
        },

        {
            id: 'cancel-declared',
            tier: 'headless',
            group: 'Cancellation',
            label: 'canCancel: true cancels and stops the chain',
            run: async ({ expect }) => {
                const api = requireApi('HookManager');
                const name = harnessHookName('Veto');
                const context = 'harness-hookmanager-veto';
                const ran = [];

                api.HookManager.registerHook({
                    name,
                    description: 'Harness: declared canceller',
                    context,
                    priority: 1,
                    canCancel: true,
                    callback: () => { ran.push('canceller'); return false; }
                });
                api.HookManager.registerHook({
                    name,
                    description: 'Harness: must not run after a veto',
                    context,
                    priority: 5,
                    callback: () => { ran.push('after'); }
                });

                const result = Hooks.call(name);

                expect('the operation is cancelled', result, false);
                expect('callbacks after the veto do not run', ran.join(','), 'canceller');

                api.HookManager.disposeByContext(context);
            }
        },

        {
            id: 'cancel-in-options-is-inert',
            tier: 'headless',
            group: 'Cancellation',
            label: 'canCancel inside options does not cancel (and warns)',
            note: 'Console shows one HookManager warning naming the hook. A registration that looks like it can veto and cannot is the failure this prevents.',
            run: async ({ expect }) => {
                const api = requireApi('HookManager');
                const name = harnessHookName('Misplaced');
                const context = 'harness-hookmanager-misplaced';

                api.HookManager.registerHook({
                    name,
                    description: 'Harness: canCancel in the wrong place',
                    context,
                    options: { canCancel: true },
                    callback: () => false
                });

                expect('the misplaced flag is not honoured', Hooks.call(name), true);

                api.HookManager.disposeByContext(context);
            }
        },

        {
            id: 'once-survives-a-veto',
            tier: 'headless',
            group: 'Cancellation',
            label: 'a cancelling once callback is still unregistered',
            note: 'The old early return skipped the once cleanup, so a vetoing once callback fired forever.',
            run: async ({ expect }) => {
                const api = requireApi('HookManager');
                const name = harnessHookName('OnceVeto');
                const context = 'harness-hookmanager-once';
                let calls = 0;

                api.HookManager.registerHook({
                    name,
                    description: 'Harness: once + canCancel',
                    context,
                    canCancel: true,
                    options: { once: true },
                    callback: () => { calls += 1; return false; }
                });

                expect('the first call is cancelled', Hooks.call(name), false);
                expect('it ran once', calls, 1);

                expect('the second call is NOT cancelled, so it was unregistered', Hooks.call(name), true);
                expect('and it did not run again', calls, 1);

                api.HookManager.disposeByContext(context);
            }
        },

        {
            id: 'context-disposal',
            tier: 'headless',
            group: 'Registration',
            label: 'disposeByContext removes every callback in the context',
            run: async ({ expect }) => {
                const api = requireApi('HookManager');
                const name = harnessHookName('Dispose');
                const context = 'harness-hookmanager-dispose';
                let calls = 0;

                api.HookManager.registerHook({
                    name,
                    description: 'Harness: disposable A',
                    context,
                    callback: () => { calls += 1; }
                });
                api.HookManager.registerHook({
                    name,
                    description: 'Harness: disposable B',
                    context,
                    callback: () => { calls += 1; }
                });

                Hooks.call(name);
                expect('both callbacks ran', calls, 2);

                api.HookManager.disposeByContext(context);
                Hooks.call(name);
                expect('neither runs after disposal', calls, 2);
            }
        }
    ]
};
