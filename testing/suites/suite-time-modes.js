// ==================================================================
// ===== SUITE: TIME MODES (testing/suites/suite-time-modes.js) =====
// ==================================================================
//
// The parts of the time driver a harness can reach without waiting for
// real seconds to pass: the rate each mode implies, the ownership rule,
// and the start/stop state machine.
//
// WHAT IS NOT HERE, deliberately: that the clock actually advances. That
// needs a commit cadence to elapse and a second GM to prove the election,
// so it is a live check rather than an assertion. See the CHANGELOG entry.
//
// These checks never call `TimeModes.set()` — it writes a world setting,
// and a test suite that changes how fast the world runs and then fails
// halfway leaves the table in Fast mode.
// ==================================================================

import { setting } from '../harness-lib.js';
import { TimeDriver, TimeModes, TIME_MODES } from '/modules/coffee-pub-blacksmith/scripts/manager-time-modes.js';

export default {
    id: 'time-modes',
    label: 'Time Modes',
    icon: 'fa-solid fa-hourglass-half',

    settings: () => {
        const mode = TimeModes.current();
        return [
            { label: 'Current mode', value: `${mode.label} (${mode.id})` },
            { label: 'Rate', value: `${TimeModes.rateFor(mode)} world seconds per real second` },
            { label: 'Slow multiplier', value: String(setting('worldClockSlowMultiplier', 0.25)) },
            { label: 'Fast multiplier', value: String(setting('worldClockFastMultiplier', 60)) },
            { label: 'Minimum update', value: `${setting('worldClockMinUpdateSeconds', 0.5)}s (real)` },
            { label: 'This client ticks', value: TimeDriver.isOwner() ? 'yes' : 'no', note: 'only the active GM does' },
            { label: 'Driver running', value: TimeDriver.isRunning() ? 'yes' : 'no' }
        ];
    },

    checks: [
        {
            id: 'rates',
            tier: 'headless',
            group: 'Policy',
            label: 'Each mode implies the right rate, and two modes mean "stand down"',
            run: async ({ expect }) => {
                expect('real time is one to one', TimeModes.rateFor(TIME_MODES.real), 1);
                expect('combat does not drive', TimeModes.rateFor(TIME_MODES.combat), 0);
                expect('paused does not drive', TimeModes.rateFor(TIME_MODES.paused), 0);

                // Slow and fast read their settings, so assert the relationship rather
                // than a number a GM is free to change.
                const slow = TimeModes.rateFor(TIME_MODES.slow);
                const fast = TimeModes.rateFor(TIME_MODES.fast);
                expect.ok(`slow (${slow}) is slower than real time`, slow < 1 || slow === 0);
                expect.ok(`fast (${fast}) is faster than real time`, fast > 1);
            }
        },
        {
            id: 'combat-stands-down',
            tier: 'headless',
            group: 'Policy',
            label: 'Combat mode leaves the advancing to core',
            note: 'Core computes a time delta per round from CONFIG.time.roundTime and applies it itself '
                + '(client/documents/combat.mjs:186). Driving as well would double-count every round.',
            run: async ({ expect }) => {
                expect('combat mode declares no rate of its own', TIME_MODES.combat.rate, null);
                expect('and resolves to zero', TimeModes.rateFor(TIME_MODES.combat), 0);
                expect.ok('core has a round time to advance by', Number(CONFIG.time?.roundTime) > 0);
            }
        },
        {
            id: 'minute-granularity',
            tier: 'headless',
            group: 'Driver',
            label: 'The clock advances a minute at a time until the floor stops it',
            note: 'The reason there is no display interpolation: world time really does step minute by '
                + 'minute, so anything scheduled on a minute fires when the readout shows it.',
            run: async ({ expect }) => {
                const minute = Number(game.time?.calendar?.secondsPerMinute) || 60;

                // Real time: a world minute takes a real minute, which is far above any
                // sane floor, so each write carries exactly one minute.
                const real = TimeDriver.plan(1, 0.5);
                expect('real time writes one minute per update', real.stepSeconds, minute);
                expect('and does so once a minute', real.cadenceMs, minute * 1000);

                // Slow: still one minute per write, just further apart.
                const slow = TimeDriver.plan(0.25, 0.5);
                expect('slow still writes one minute', slow.stepSeconds, minute);
                expect.ok('but waits four times as long', slow.cadenceMs === minute * 4 * 1000);

                // THE SPEEDS THAT MUST NOT SKIP. At the default floor every offered
                // speed up to 120x still advances exactly one minute per update -- that
                // is what the floor was lowered to 0.5s for.
                for (const rate of [15, 30, 60, 120]) {
                    const plan = TimeDriver.plan(rate, 0.5);
                    expect(`${rate}x advances exactly one minute`, plan.stepSeconds, minute);
                }

                // Past that a world minute arrives faster than the floor allows, so the
                // floor sets the pace and each write carries proportionally more. There
                // is no way around it: at 360x a minute arrives every sixth of a second.
                const veryFast = TimeDriver.plan(360, 0.5);
                expect('360x is held to the floor', veryFast.cadenceMs, 500);
                expect('and carries three minutes per write', veryFast.stepSeconds, minute * 3);

                // The invariant that matters, whatever the numbers: a write is always
                // rate x elapsed, so the clock never runs fast or slow.
                for (const [rate, floorSeconds] of [[1, 0.5], [0.25, 0.5], [360, 0.5], [12, 5]]) {
                    const plan = TimeDriver.plan(rate, floorSeconds);
                    expect(`${rate}x advances exactly what elapsed`,
                        plan.stepSeconds, Math.round((plan.cadenceMs / 1000) * rate));
                }

                expect('a stopped rate plans nothing', TimeDriver.plan(0, 0.5).stepSeconds, 0);
            }
        },
        {
            id: 'start-stop',
            tier: 'headless',
            group: 'Driver',
            label: 'The driver starts, is idempotent, and stops',
            note: 'Starts at a real rate briefly and stops it again. No commit fires, because the cadence '
                + 'is longer than the check.',
            run: async ({ expect }) => {
                const wasRunning = TimeDriver.isRunning();
                try {
                    TimeDriver.stop();
                    expect('stopped is stopped', TimeDriver.isRunning(), false);

                    TimeDriver.start(0, 0.5);
                    expect('a zero rate does not run', TimeDriver.isRunning(), false);

                    if (!TimeDriver.isOwner()) {
                        expect('a non-owner never runs', TimeDriver.isRunning(), false);
                        return;
                    }

                    TimeDriver.start(1, 0.5);
                    expect('a real rate runs', TimeDriver.isRunning(), true);

                    TimeDriver.start(1, 0.5);
                    expect('starting again at the same rate still runs', TimeDriver.isRunning(), true);

                    TimeDriver.stop();
                    expect('and it stops', TimeDriver.isRunning(), false);
                } finally {
                    // Put the world back the way it was, whatever happened above.
                    TimeModes.apply();
                    expect('the driver matches the selected mode again',
                        TimeDriver.isRunning(), wasRunning);
                }
            }
        },
        {
            id: 'indicator-repaints',
            tier: 'headless',
            group: 'Surface',
            label: 'The indicator on screen matches the selected mode',
            note: 'Guards the stale-paint bug: the mode was correct everywhere except the icon, because '
                + 'the template drew it and the repaint path did not touch it.',
            run: async ({ expect, log }) => {
                const node = document.querySelector('.worldclock-mode');
                if (!node) return log('The clock is not on screen. Nothing was checked.');

                // Repaint from current state, then read what is actually in the DOM.
                const { WorldClockManager } = await import('/modules/coffee-pub-blacksmith/scripts/manager-worldclock.js');
                WorldClockManager.updateDisplay();

                const mode = TimeModes.current();
                expect.ok(`the icon is ${mode.icon}`,
                    mode.icon.split(' ').every(part => node.classList.contains(part)));
                expect.ok('and no other mode\'s glyph is left on it',
                    Object.values(TIME_MODES)
                        .filter(other => other.id !== mode.id)
                        .every(other => {
                            const glyph = other.icon.split(' ').find(part => part.startsWith('fa-') && part !== 'fa-solid');
                            return !glyph || !node.classList.contains(glyph) || mode.icon.includes(glyph);
                        }));
                // The tooltip lives on the readout wrapper, not the icon: the two are
                // one control and the wrapper is the hit target.
                const readout = document.querySelector('.worldclock-readout');
                expect.ok('the tooltip names the mode',
                    (readout?.getAttribute('data-tooltip') ?? '').includes(mode.label));
            }
        },
        {
            id: 'menu',
            tier: 'headless',
            group: 'Surface',
            label: 'The menu offers every mode and marks the current one',
            run: async ({ expect }) => {
                const items = TimeModes.menuItems();
                expect('one entry per mode', items.length, Object.keys(TIME_MODES).length);
                expect.ok('every entry has an icon', items.every(item => !!item.icon));
                expect.ok('every entry has a callback', items.every(item => typeof item.callback === 'function'));

                const marked = items.filter(item => item.name.includes('current'));
                expect('exactly one is marked current', marked.length, 1);
                expect.ok(`and it is ${TimeModes.current().label}`,
                    marked[0].name.startsWith(TimeModes.current().label));
            }
        }
    ]
};
